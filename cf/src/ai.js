// cf/src/ai.js — session-gated proxy to the Anthropic Messages API.
//
// Prompts live HERE, not in the client. The client sends task data only (a term, a list of
// missed cards, a dialogue transcript) — never a free-form prompt string. That's the whole
// abuse guard: a signed-in session can trigger one of a fixed handful of cheap, cached,
// server-authored prompts, never an arbitrary one. Without this an endpoint that accepts
// {prompt} is just an open LLM proxy behind a session token.
import { verifySession, sha256Hex, json, bumpQuota } from "./index.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";           // every task here is short, cacheable, and cheap
const AI_DAILY_PER_USER = 80, AI_DAILY_GLOBAL = 600;
const INPUT_MAX = 4000;                     // JSON.stringify(input).length

function str() { return { type: "string" }; }
function arr(items) { return { type: "array", items }; }
function obj(props, required) { return { type: "object", properties: props, required, additionalProperties: false }; }

// Recursive key-sort so the cache key ignores property order (two logically-identical
// inputs with keys in a different order must hash to the same cache entry).
function stableStringify(x) {
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(x[k])).join(",") + "}";
  return JSON.stringify(x);
}

const TASKS = {
  // ✨ hook on the card back: one vivid keyword-mnemonic sentence.
  hook: {
    max_tokens: 300, ttl: 0,   // reusable forever — a hook for 猫 doesn't change
    system: "You help a JPN 101 beginner (NihonGO NOW! textbook) remember one Japanese word "
      + "with the keyword-mnemonic technique. Reply with one vivid memory hook in at most two "
      + "short sentences, plain text, no headers, no romaji lessons — just the hook. If the "
      + "word has a common confusable sibling at this level, contrast them in a few words as "
      + "part of the same hook.",
    user: (i) => `Word: ${i.term} (${i.reading}, ${i.romaji}) = ${i.meaning}.`,
    schema: obj({ hook: str() }, ["hook"]),
  },
  // Post-session coach debrief: what to notice about the words just missed.
  debrief: {
    max_tokens: 400, ttl: 7 * 86400,
    system: "A JPN 101 beginner just finished a flashcard session and missed some words. In at "
      + "most 80 words, plain text, no headers or bullets: point out any confusable pairs among "
      + "them, give one concrete memory hook for the hardest-looking one, and end with one "
      + "specific tip for the next session. Be direct and warm, not generic.",
    user: (i) => "Missed: " + i.missed.slice(0, 5).map((c) => `${c.term} (${c.romaji}) = ${c.meaning}`).join("; "),
    schema: obj({ text: str() }, ["text"]),
  },
  // Scripts: parse a pasted beginner dialogue into furigana-tokenised, translated lines.
  annotate: {
    max_tokens: 4000, ttl: 0,   // reusable — the same dialogue text always annotates the same way
    system: "You are a Japanese tutor. Parse the following beginner Japanese dialogue into "
      + "lines. For each line: identify the speaker label (use the label shown, e.g. A/B or a "
      + "name; if none is shown, alternate A and B). Give the Japanese as furigana tokens — "
      + "each {t, r} with r ONLY for kanji tokens — plus romaji and a natural English "
      + "translation. The concatenation of every token's t must equal the original line text "
      + "exactly.",
    user: (i) => "Dialogue:\n" + i.raw,
    schema: obj({ lines: arr(obj({ speaker: str(), tokens: arr(obj({ t: str(), r: str() }, ["t"])), romaji: str(), en: str() }, ["speaker", "tokens", "romaji", "en"])) }, ["lines"]),
  },
};

export async function handleAi(req, env) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!env.SESSION_SECRET || !env.ANTHROPIC_API_KEY) return json({ error: "AI not configured" }, 503);
  const auth = req.headers.get("authorization") || "";
  const session = auth.startsWith("Bearer ") ? await verifySession(env.SESSION_SECRET, auth.slice(7)) : null;
  if (!session) return json({ error: "sign-in required" }, 401);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
  const task = TASKS[body && body.task];
  if (!task || typeof body.input !== "object" || body.input === null || Array.isArray(body.input)) {
    return json({ error: "unknown task" }, 400);
  }
  const inputStr = stableStringify(body.input);
  if (inputStr.length > INPUT_MAX) return json({ error: "input too large" }, 413);

  const key = `ai:v1:${body.task}:${await sha256Hex(inputStr)}`;
  const hit = await env.TTS.get(key, { type: "json" });
  if (hit) return json({ result: hit, cached: true, remaining: null });

  if (!(await bumpQuota(env, "ai:u:" + session.sub, AI_DAILY_PER_USER)) || !(await bumpQuota(env, "ai:all", AI_DAILY_GLOBAL))) {
    return json({ error: "daily AI limit reached — try again tomorrow", remaining: 0 }, 429, { "retry-after": "3600" });
  }

  const call = (maxTokens) => fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system: task.system,
      messages: [{ role: "user", content: task.user(body.input) }],
      output_config: { format: { type: "json_schema", schema: task.schema } },
    }),
    signal: AbortSignal.timeout(30000),
  });

  let r, data;
  try {
    r = await call(task.max_tokens);
    if (!r.ok) { console.warn(JSON.stringify({ ev: "ai_upstream_fail", task: body.task, status: r.status })); return json({ error: "upstream " + r.status }, 502); }
    data = await r.json();
    if (data.stop_reason === "max_tokens") {
      r = await call(Math.round(task.max_tokens * 1.5));
      if (!r.ok) return json({ error: "upstream " + r.status }, 502);
      data = await r.json();
    }
  } catch (e) {
    console.warn(JSON.stringify({ ev: "ai_fetch_fail", task: body.task, msg: String(e && e.message) }));
    return json({ error: "upstream request failed" }, 502);
  }
  if (data.stop_reason === "refusal") return json({ error: "refused" }, 502);

  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let result;
  try { result = JSON.parse(text); }
  catch (e) {
    // tolerate fence-wrapped or prose-wrapped JSON; structured output should make this rare
    let t = text.replace(/```json|```/g, "").trim();
    const s = t.indexOf("{"), en = t.lastIndexOf("}");
    if (s !== -1 && en !== -1 && en > s) t = t.slice(s, en + 1);
    try { result = JSON.parse(t); }
    catch (e2) { return json({ error: "unparseable reply" }, 502); }
  }

  await env.TTS.put(key, JSON.stringify(result), task.ttl ? { expirationTtl: task.ttl } : undefined);
  console.log(JSON.stringify({ ev: "ai_gen", task: body.task }));
  return json({ result, cached: false });
}
