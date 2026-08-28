// cf/src/ai.js — session-gated proxy to the Google Gemini API.
//
// Prompts live HERE, not in the client. The client sends task data only (a term, a list of
// missed cards, a dialogue transcript) — never a free-form prompt string. That's the whole
// abuse guard: a signed-in session can trigger one of a fixed handful of cheap, cached,
// server-authored prompts, never an arbitrary one. Without this an endpoint that accepts
// {prompt} is just an open LLM proxy behind a session token.
//
// Provider note: this spoke the Anthropic Messages API until 2026-08-27. The client never
// knew — it posts {task, input} to /api/ai and reads {result} — so the swap is confined to
// this file. The three things that actually differ are marked GEMINI below.
import { verifySession, sha256Hex, json, bumpQuota } from "./index.js";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
// Overridable without a code change; Flash is the cheap fast tier and every task here is
// short. Thinking is disabled below, which matters more than the model choice.
const DEFAULT_MODEL = "gemini-2.5-flash";
const AI_DAILY_PER_USER = 80, AI_DAILY_GLOBAL = 600;
const INPUT_MAX = 4000;                     // JSON.stringify(input).length

function str() { return { type: "string" }; }
function arr(items) { return { type: "array", items }; }
/* GEMINI 1 — responseSchema is a SUBSET of OpenAPI 3.0, and `additionalProperties` is not
   in it: sending one makes the whole request 400. The Anthropic version set it to false on
   every object. `propertyOrdering` replaces nothing but is worth setting — without it the
   key order in the reply can drift between calls, which would give two identical inputs
   two different cache entries. */
function obj(props, required) {
  return { type: "object", properties: props, required, propertyOrdering: Object.keys(props) };
}

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
  /* Which binding is missing goes to the log, not to the client — the 503 fires before auth,
     so the response is public. "AI not configured" with the secret visibly present in
     `wrangler secret list` cost a debugging round: a secret set from a prompt that never
     received the paste EXISTS and is empty, which lists identically to a good one and is
     falsy here. `wrangler tail` now says which it is. */
  if (!env.SESSION_SECRET || !env.GEMINI_API_KEY) {
    console.warn(JSON.stringify({
      ev: "ai_not_configured",
      session_secret: env.SESSION_SECRET ? "present" : "MISSING",
      gemini_key: env.GEMINI_API_KEY === undefined ? "MISSING (no such secret)"
        : env.GEMINI_API_KEY === "" ? "EMPTY (secret exists, value is blank — re-run wrangler secret put)"
        : "present",
    }));
    return json({ error: "AI not configured", provider: "gemini" }, 503);
  }
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

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  // The model is part of the cache key: a reply cached from a different model is a different
  // answer, and "why is this hook still the old bad one" is a miserable thing to debug.
  const key = `ai:v2:${model}:${body.task}:${await sha256Hex(inputStr)}`;
  const hit = await env.TTS.get(key, { type: "json" });
  if (hit) return json({ result: hit, cached: true, remaining: null });

  if (!(await bumpQuota(env, "ai:u:" + session.sub, AI_DAILY_PER_USER)) || !(await bumpQuota(env, "ai:all", AI_DAILY_GLOBAL))) {
    return json({ error: "daily AI limit reached — try again tomorrow", remaining: 0 }, 429, { "retry-after": "3600" });
  }

  /* GEMINI 2 — the key goes in the query string, not a header, and the prompt splits into
     system_instruction + contents rather than system + messages. */
  const call = (maxTokens) => fetch(`${GEMINI_API}/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: task.system }] },
      contents: [{ role: "user", parts: [{ text: task.user(body.input) }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseSchema: task.schema,
        temperature: 0.7,
        /* GEMINI 3 — 2.5-series models think by default, and thinking tokens are billed
           against maxOutputTokens. A 300-token budget can be spent entirely on thinking,
           returning a candidate with no text at all and finishReason MAX_TOKENS. These
           tasks are one-sentence generations that gain nothing from it, so it is off. */
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  const textOf = (d) => {
    const c = d && d.candidates && d.candidates[0];
    if (!c || !c.content || !Array.isArray(c.content.parts)) return "";
    return c.content.parts.map((p) => p.text || "").join("");
  };
  const reasonOf = (d) => (d && d.candidates && d.candidates[0] && d.candidates[0].finishReason) || "";

  let data;
  try {
    let r = await call(task.max_tokens);
    if (!r.ok) {
      // The body carries Google's actual complaint (bad key, disabled API, bad schema) and
      // it is worth having in the log — a bare 400 here is unfixable from the outside.
      let detail = "";
      try { detail = ((await r.json()).error || {}).message || ""; } catch (e) {}
      console.warn(JSON.stringify({ ev: "ai_upstream_fail", task: body.task, status: r.status, detail: detail.slice(0, 200) }));
      return json({ error: "upstream " + r.status }, 502);
    }
    data = await r.json();
    // Truncated: retry once with more room, same as the Anthropic version did.
    if (reasonOf(data) === "MAX_TOKENS" || !textOf(data)) {
      r = await call(Math.round(task.max_tokens * 1.5));
      if (!r.ok) return json({ error: "upstream " + r.status }, 502);
      data = await r.json();
    }
  } catch (e) {
    console.warn(JSON.stringify({ ev: "ai_fetch_fail", task: body.task, msg: String(e && e.message) }));
    return json({ error: "upstream request failed" }, 502);
  }

  // A blocked prompt has no candidates at all; a blocked reply has a finishReason instead.
  const blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
  const reason = reasonOf(data);
  if (blocked || reason === "SAFETY" || reason === "RECITATION" || reason === "PROHIBITED_CONTENT") {
    console.warn(JSON.stringify({ ev: "ai_refused", task: body.task, reason: blocked || reason }));
    return json({ error: "refused" }, 502);
  }

  const text = textOf(data);
  if (!text) return json({ error: "empty reply" }, 502);

  let result;
  try { result = JSON.parse(text); }
  catch (e) {
    // tolerate fence-wrapped or prose-wrapped JSON; responseMimeType should make this rare
    let t = text.replace(/```json|```/g, "").trim();
    const s = t.indexOf("{"), en = t.lastIndexOf("}");
    if (s !== -1 && en !== -1 && en > s) t = t.slice(s, en + 1);
    try { result = JSON.parse(t); }
    catch (e2) { return json({ error: "unparseable reply" }, 502); }
  }

  await env.TTS.put(key, JSON.stringify(result), task.ttl ? { expirationTtl: task.ttl } : undefined);
  console.log(JSON.stringify({ ev: "ai_gen", task: body.task, model }));
  return json({ result, cached: false });
}
