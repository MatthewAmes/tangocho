# TODO-125 — `POST /api/ai` Worker endpoint: session-gated, task allowlist, prompt-hash KV cache, per-user daily cap, Anthropic Messages API with structured JSON output

**Priority:** P1   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 05-expansion §6.0–6.4 (endpoint design, per-feature table, abuse summary), roadmap "Now" item 1; 01-functionality §8 (`callClaude` can never succeed); 02-pedagogy §1 item 5, §7 item 5; 04-security INFO-13 (no key in client — keep it that way), MEDIUM-6 (rate limits); 06-architecture F-2
**Depends on:** none (TODO-001 secret rotation should land first in prod so the session gate is trustworthy; TODO-002's 401-recovery makes the 401 branch usable; TODO-016 stubs the client in the meantime)   **Blocks:** TODO-126 (client rewiring), TODO-127 (Sentences), TODO-109 (auto-hook), TODO-119/122 (readings/meanings for unknowns, POS proposals)

## Why
Every LLM feature in the app is dead: `callClaude()` POSTs from the browser to `https://api.anthropic.com/v1/messages` with only `Content-Type` — no key, no `anthropic-version`, no CORS opt-in — so "✨ hook", the auto-fired post-session debrief, script furigana annotation, and the unmounted Sentences tab all fail 100 % of the time while the UI still promises them. The prompts are already written; a ~150-line session-gated Worker route revives them, keeps the key server-side (the repo has already had one key incident), and bounds cost.

## Current behaviour (verified)
- `JpnFlashcards.jsx` `callClaude(prompt)` L2180–2203: `fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }) })`, 30 s abort; `parseJSON` L2204–2209 strips ``` fences and prose.
- Prompts: `hookPrompt` L3453–3455, `debriefPrompt` L3456–3459, `scriptPrompt` L2937–2945, `fillPrompt` L2269–2278, `transPrompt` L2280–2289, `gradePrompt` L2291–2299 (the last three used only by unmounted `Sentences`).
- Worker `cf/src/index.js`: router L361–370 (`/api/sync`, `/api/tts`, `/api/feed` + legacy aliases → `env.ASSETS.fetch`); `verifySession(secret, token)` L56–70; `sha256Hex` L148–151; `json()` helper L100–103; `handleTts` L152–193 is the model for "session-gated billable call with KV cache"; KV bindings `SYNC` and `TTS` (`cf/wrangler.toml`); secrets documented in `wrangler.toml` comment ("Required: SESSION_SECRET …, GOOGLE_TTS_API_KEY, ADMIN_WARM_TOKEN").
- Client auth helper `syncRequestOptions` L1093–1101 (Bearer from `loadSession()`).

## Intended behaviour
```
POST /api/ai          Authorization: Bearer <tangocho session>   (401 without)
{ "task": "hook"|"debrief"|"annotate"|"sentence"|"grade"|"explain", "input": {…}, "v": 1 }
→ 200 { "result": <schema JSON>, "cached": bool, "model": "…", "remaining": n }
→ 400 bad task/shape · 401 no/invalid session · 413 input too large · 429 daily cap · 502 upstream/unparseable · 503 not configured
```
- **Prompts live in the Worker**; the client sends data only — this is the primary abuse guard (the endpoint is useless as a general proxy).
- Cache key `ai:v{v}:{task}:{sha256(canonical JSON of input)}` in the `TTS` KV namespace (same "caches by prefix" convention as `feed:`/`dur:`); no TTL for hook/annotate/sentence (reusable), 7 d for grade/explain/debrief.
- Quota: `ai:q:{sub}:{YYYY-MM-DD}` counter (`expirationTtl: 86400`), cap 80/day/user; global `ai:q:all:{date}` cap 600. Cached hits do not count.
- Input cap: `JSON.stringify(input).length <= 4000` else 413.
- Model per task: `claude-haiku-4-5` (alias; the dated snapshot `claude-haiku-4-5-20251001` is also valid — do not invent other suffixes) for hook/debrief/annotate/grade/explain; `claude-sonnet-5` for `sentence` (generation). `max_tokens` 512 (hook/grade/explain), 700 (debrief), 1500 (sentence), 4000 (annotate — whole dialogue, no more 3-line chunking).
- Structured output: `output_config: { format: { type: "json_schema", schema: SCHEMA[task] } }` — schemas must set `additionalProperties: false` on every object and use no min/max constraints. Parse `content[0].text` (or join all `type:"text"` blocks) with `JSON.parse`; on failure fall back to the fence-stripping `parseJSON` logic server-side; if still invalid → 502. Check `stop_reason === "refusal"` before reading content (→ 502 with `{error:"refused"}`), and `stop_reason === "max_tokens"` (→ retry once with 1.5× tokens, then 502). If any request-shape detail here is in doubt, verify against the current Anthropic Messages API docs before shipping.
- Headers: `x-api-key: env.ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body `{ model, max_tokens, system, messages: [{ role: "user", content }], output_config }`; 30 s `AbortSignal.timeout`.
- Secret: `cd cf && npx wrangler secret put ANTHROPIC_API_KEY`; add it to the `wrangler.toml` comment list.

## Implementation steps
1. New file `cf/src/ai.js` (keep `index.js` readable), imported by the router:
   ```js
   // cf/src/ai.js — session-gated proxy to the Anthropic Messages API. Prompts live HERE;
   // the client sends task data only, so this can't be used as a general LLM proxy.
   import { verifySession, sha256Hex, json } from "./index.js";   // or move helpers to cf/src/util.js and import from both
   const DAY_CAP_USER = 80, DAY_CAP_ALL = 600, INPUT_MAX = 4000, API = "https://api.anthropic.com/v1/messages";
   const MODELS = { cheap: "claude-haiku-4-5", gen: "claude-sonnet-5" };
   const TASKS = {
     hook:     { model: MODELS.cheap, max_tokens: 512,  ttl: 0,
                 system: "You help a JPN 101 beginner (NihonGO NOW! textbook) remember one Japanese word with the keyword-mnemonic technique. Reply with one vivid hook in at most two short sentences. If the word has a common confusable sibling at this level, name it and give a few-word tell.",
                 user: (i) => `Word: ${i.term} (${i.reading}, ${i.romaji}) = ${i.meaning}.${i.neighbours ? " Nearby deck words: " + i.neighbours.join(", ") : ""}`,
                 schema: obj({ hook: str(), confusable: str() }, ["hook"]) },
     debrief:  { model: MODELS.cheap, max_tokens: 700, ttl: 7 * 86400,
                 system: "A JPN 101 beginner just finished a flashcard session. Be direct and warm, not generic. Point out confusable pairs among the missed words, give one concrete memory hook for the hardest one, and one specific tip for the next session.",
                 user: (i) => "Missed: " + i.missed.slice(0, 5).map((c) => `${c.term} (${c.romaji}) = ${c.meaning}${c.ms ? ` [${(c.ms/1000).toFixed(1)}s]` : ""}`).join("; "),
                 schema: obj({ pairs: arr(obj({ a: str(), b: str(), why: str() }, ["a","b","why"])), hook: obj({ term: str(), text: str() }, ["term","text"]), tip: str() }, ["pairs","hook","tip"]) },
     annotate: { model: MODELS.cheap, max_tokens: 4000, ttl: 0,
                 system: "Parse a beginner Japanese dialogue into lines. For each line give the speaker label (as shown; else alternate A/B), the Japanese as furigana tokens — each {t, r} with r ONLY for kanji tokens — plus romaji and a natural English translation. The concatenation of every token's t must equal the original line text exactly.",
                 user: (i) => "Dialogue:\n" + i.raw,
                 schema: obj({ lines: arr(obj({ speaker: str(), tokens: arr(obj({ t: str(), r: str() }, ["t"])), romaji: str(), en: str() }, ["speaker","tokens","romaji","en"])) }, ["lines"]) },
     sentence: { model: MODELS.gen, max_tokens: 1500, ttl: 0,
                 system: "You are a Japanese tutor for a JLPT N5 beginner. Using ONLY the vocabulary given (plus particles は が を に の と へ で も and です/ます forms), write ONE short natural sentence of 5–10 words that uses the target word, then blank the target. Tokens: {t, r} with r only for kanji; the blank is the single token {t:'___'}.",
                 user: (i) => `Target: ${i.target.term} (${i.target.reading}) = ${i.target.meaning}\nVocabulary:\n${i.known.map((c) => `${c.term} (${c.reading}) = ${c.meaning}`).join("\n")}`,
                 schema: obj({ tokens: arr(obj({ t: str(), r: str() }, ["t"])), fullTokens: arr(obj({ t: str(), r: str() }, ["t"])), answer: str(), reading: str(), romaji: str(), translation: str(), hint: str() }, ["tokens","fullTokens","answer","reading","romaji","translation","hint"]) },
     grade:    { model: MODELS.cheap, max_tokens: 512, ttl: 7 * 86400,
                 system: "You are a kind Japanese tutor grading a beginner's translation. Minor kana/spacing/politeness differences are fine.",
                 user: (i) => `English: "${i.english}"\nModel: "${i.model}"\nStudent: "${i.answer}"`,
                 schema: obj({ rating: { type: "string", enum: ["correct","close","off"] }, feedback: str(), corrected: str() }, ["rating","feedback","corrected"]) },
     explain:  { model: MODELS.cheap, max_tokens: 512, ttl: 7 * 86400,
                 system: "Give a JPN 101 beginner the reading (kana), romaji and a short English meaning for each Japanese word. If a word is not a real word, set meaning to ''.",
                 user: (i) => "Words: " + i.terms.slice(0, 12).join("、"),
                 schema: obj({ words: arr(obj({ term: str(), reading: str(), romaji: str(), meaning: str() }, ["term","reading","romaji","meaning"])) }, ["words"]) },
   };
   function str() { return { type: "string" }; }
   function arr(items) { return { type: "array", items }; }
   function obj(props, required) { return { type: "object", properties: props, required, additionalProperties: false }; }
   function stableStringify(x) {                      // recursive key sort so the cache key ignores property order
     if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
     if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(x[k])).join(",") + "}";
     return JSON.stringify(x);
   }
   export async function handleAi(req, env) {
     if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
     if (!env.SESSION_SECRET || !env.ANTHROPIC_API_KEY) return json({ error: "AI not configured" }, 503);
     const auth = req.headers.get("authorization") || "";
     const session = auth.startsWith("Bearer ") ? await verifySession(env.SESSION_SECRET, auth.slice(7)) : null;
     if (!session) return json({ error: "sign-in required" }, 401);
     let body; try { body = await req.json(); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
     const task = TASKS[body.task]; const v = Number(body.v) || 1;
     if (!task || typeof body.input !== "object" || body.input === null) return json({ error: "unknown task" }, 400);
     const inputStr = stableStringify(body.input);
     if (inputStr.length > INPUT_MAX) return json({ error: "input too large" }, 413);
     const key = `ai:v${v}:${body.task}:${await sha256Hex(inputStr)}`;
     const hit = await env.TTS.get(key, { type: "json" });
     if (hit) return json({ result: hit, cached: true, model: task.model, remaining: null });
     const day = new Date().toISOString().slice(0, 10);
     const qk = `ai:q:${session.sub}:${day}`, gk = `ai:q:all:${day}`;
     const used = Number(await env.TTS.get(qk)) || 0, usedAll = Number(await env.TTS.get(gk)) || 0;
     if (used >= DAY_CAP_USER || usedAll >= DAY_CAP_ALL) return json({ error: "daily AI limit reached", remaining: 0 }, 429);
     const call = async (maxTokens) => fetch(API, {
       method: "POST",
       headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
       body: JSON.stringify({ model: task.model, max_tokens: maxTokens, system: task.system,
         messages: [{ role: "user", content: task.user(body.input) }],
         output_config: { format: { type: "json_schema", schema: task.schema } } }),
       signal: AbortSignal.timeout(30000),
     });
     let r = await call(task.max_tokens);
     if (!r.ok) return json({ error: "upstream " + r.status }, 502);
     let data = await r.json();
     if (data.stop_reason === "max_tokens") { r = await call(Math.round(task.max_tokens * 1.5)); if (!r.ok) return json({ error: "upstream " + r.status }, 502); data = await r.json(); }
     if (data.stop_reason === "refusal") return json({ error: "refused" }, 502);
     const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
     let result; try { result = JSON.parse(text); } catch (e) { try { result = JSON.parse(text.replace(/```json|```/g, "").slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch (e2) { return json({ error: "unparseable reply" }, 502); } }
     await Promise.all([
       env.TTS.put(key, JSON.stringify(result), task.ttl ? { expirationTtl: task.ttl } : undefined),
       env.TTS.put(qk, String(used + 1), { expirationTtl: 86400 }),
       env.TTS.put(gk, String(usedAll + 1), { expirationTtl: 86400 }),
     ]);
     return json({ result, cached: false, model: data.model || task.model, remaining: DAY_CAP_USER - used - 1 });
   }
   ```
   Export `verifySession`, `sha256Hex`, `json` from `index.js` (add `export` keywords) or move them to `cf/src/util.js` and import from both files.
2. Router (`cf/src/index.js` L361–370): `import { handleAi } from "./ai.js";` and `if (pathname === "/api/ai") return handleAi(req, env);` (no legacy alias).
3. Annotate post-check (server-side): after parsing, verify `lines.map(l => l.tokens.map(t => t.t).join("")).join("\n")` equals the input's lines ignoring whitespace; if not, return the result anyway with `warning: "token mismatch"` so the client can keep `plain: true` for that script (TODO-126).
4. Sentence post-check: run the shared coverage (TODO-115's `tools/segment.mjs` can be imported by the Worker too — wrangler bundles relative imports) against `input.known` and reject/retry once if < 90 % covered; return `coverage` in the result.
5. `wrangler.toml`: extend the secrets comment with `ANTHROPIC_API_KEY`; run `cd cf && npx wrangler secret put ANTHROPIC_API_KEY` (paste the key from console.anthropic.com; never commit it). Optional `[observability] enabled = true` for `wrangler tail` of 502s (Theme C/ops).
6. Tests: `cf/test/ai.test.mjs` with `node --test` — stub `env` (`TTS` in-memory map, `SESSION_SECRET`, `ANTHROPIC_API_KEY`) and stub `globalThis.fetch` to return a canned Messages response `{ content: [{ type: "text", text: "{\"hook\":\"…\"}" }], stop_reason: "end_turn", model: "claude-haiku-4-5" }`; assert: 401 without Bearer; 400 unknown task; 413 oversize; cache hit on second call (`cached: true`, fetch called once); 429 after 80; `refusal` → 502; fence-wrapped JSON still parses. Sign a session for the test with the same HMAC code (`signSession` export).

## Data migration / compatibility
New KV keys in the `TTS` namespace under `ai:` (cache) and `ai:q:` (quota). KV free tier: each uncached call = 3 writes; at the 80/day cap that is ≤ 240 writes/day — fine, but note alongside the revlog (TODO-105) and normal sync writes against the ~1k/day free limit (05 §5.9).

## Testing & verification
- `cd cf && npx wrangler dev` with `.dev.vars` containing `SESSION_SECRET=dev` and a real `ANTHROPIC_API_KEY`; mint a session (`POST /api/sync?exchange=1` needs Google — instead, add a dev-only helper or compute one with `node` using the same HMAC; `04-security` notes the format `base64url({sub,email,exp}).base64url(HMAC)`), then:
  `curl -s -X POST localhost:8787/api/ai -H "authorization: Bearer $TOK" -H "content-type: application/json" -d '{"task":"hook","input":{"term":"猫","reading":"ねこ","romaji":"neko","meaning":"cat"},"v":1}'` → `{"result":{"hook":"…"},"cached":false,…}`; repeat → `cached:true`.
- `node --test cf/test/` passes.
- Deploy: `cd cf && npx wrangler deploy`; confirm `curl -X POST https://tangocho.deskbuddies.workers.dev/api/ai` without auth → 401.

## Acceptance criteria
- [ ] `/api/ai` rejects unauthenticated calls (401), unknown tasks (400), oversize input (413), over-cap (429).
- [ ] Identical inputs are served from KV (`cached: true`) without an upstream call.
- [ ] Requests use `x-api-key` + `anthropic-version: 2023-06-01`, per-task model/max_tokens, and `output_config.format` JSON schema; refusal/max_tokens handled.
- [ ] `ANTHROPIC_API_KEY` is a Worker secret; never appears in the repo or client bundle.
- [ ] Worker tests cover auth, cache, cap, refusal, parse fallback.

## Pitfalls / notes
- Do not put the prompt string in the request; if a new task is needed, add it to `TASKS`.
- Schemas: every object needs `additionalProperties: false` and a `required` list; avoid `minLength`/`maximum` (unsupported by structured outputs).
- The `annotate` task replaces the client's 3-line chunking; `max_tokens: 4000` covers a 30-line dialogue.
- Cached results include `cached: true` and `remaining: null`; the client (TODO-126) should only show "N left today" when `remaining` is a number.
- TODO-003 (sync-code removal) and TODO-001 (secret rotation) affect `verifySession` inputs, not this code; TODO-002's 401-recovery lets the client re-sign-in when this returns 401.

## API notes (checked against the Anthropic API reference on 2026-08-22)
- Model IDs above are the current exact strings: `claude-haiku-4-5` and `claude-sonnet-5` (do not append date suffixes; `claude-haiku-4-5-20251001` is the dated snapshot alias of the same model). `claude-opus-5` is the general default for quality; it is not used here only because every task is short, cacheable, and cost-capped — that is a deliberate trade, not an oversight.
- On `claude-sonnet-5` adaptive thinking is **on by default**; for these short JSON tasks add `output_config: { effort: "low", format: {...} }` to keep latency and cost down (effort lives inside `output_config`, next to `format`). `claude-haiku-4-5` does not support `effort` — omit it for the cheap tasks.
- Do **not** use an assistant-message prefill to coerce JSON — prefill returns HTTP 400 on Sonnet 5 / Opus 5 and the 4.6+ family. `output_config.format` with a JSON schema is the supported mechanism (the fence-stripping fallback stays as belt-and-braces).
- Always check `stop_reason` before reading `content` (`"refusal"` → 502; `"max_tokens"` → one retry with a larger cap), as written in the handler sketch.
- If the project ever moves the Worker to a bundled dependency set, `@anthropic-ai/sdk` runs fine in Cloudflare Workers and `client.messages.parse()` would replace the hand-rolled JSON handling; raw `fetch` is used here only to keep the Worker dependency-free.
