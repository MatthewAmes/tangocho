# TODO-126 — Client: replace `callClaude` with `callAI(task, input)` → `/api/ai`; rewire ✨ hook, session debrief, and Scripts annotation; remove the browser-direct Anthropic call

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 05-expansion §6.3 (client changes), §6.2 (hook/debrief/annotate designs), §7 (remove `callClaude`); 01-functionality §8 (dead paths still run); 06-architecture F-2 (CI should assert the bundle has no `api.anthropic.com`); 02-pedagogy §4.4 Scripts row
**Depends on:** TODO-125; supersedes TODO-016's `AI_ENABLED=false` stub (Theme A removes the browser-direct call and gates the affordances; this item flips the gate to the Worker transport — if TODO-016 landed first, replace its `callClaude` stub body with `callAI` and set `AI_ENABLED = true`)   **Blocks:** TODO-127, TODO-109 (auto-hook), TODO-119/122 (explain task)

## Why
Once `/api/ai` exists, three shipped UI affordances come alive with small changes: "✨ hook" on the card back, the post-session coach debrief (currently a wasted failing request per session with misses), and "Build rehearsal"/"＋ふりがな" in Scripts (currently always `localBuild` with an error telling Matthew to "tell Claude the exact message"). The browser-direct call must go so nobody "fixes" it by pasting a key.

## Current behaviour (verified)
- `callClaude` L2180–2203; `parseJSON` L2204–2209.
- Hook: `getHook` L1510–1524 (`hooksRef` cache in `jpn101:hooks`, `callClaude(hookPrompt(card))`, `.trim()`); rendered L2016–2022 ("Couldn't reach the AI — try again later." on `hook.err`).
- Debrief: effect L1725–1733 (`callClaude(debriefPrompt(missed))` → `{text}`/`{err}`); rendered L1925–1929.
- Scripts: `annotateRaw` L3532–3550 (3-line chunks, 2 attempts, `scriptPrompt`), `build` L3552–3567 (fallback `localBuild`, `saveWarn` text L3562), `reannotate` L3569–3579; copy at L3603.
- `syncRequestOptions` L1093–1101 builds Bearer headers; `SYNC_ENDPOINT` is `/.netlify/functions/sync` (the legacy path is retired by Theme A/C items; use `/api/ai` directly here).
- Prompts `hookPrompt`/`debriefPrompt`/`scriptPrompt` (L3453–3459, L2937–2945) become unused client-side (the Worker owns them).

## Intended behaviour
- `callAI(task, input)` → `POST /api/ai` with `Authorization: Bearer <session>`; resolves to `{result, cached, remaining}`; throws `AIError` with `.status` and a short user message: 401 → "Sign in to use the AI helpers", 429 → "Daily AI limit reached — back tomorrow", 503 → "AI isn't set up on this server", other → "Couldn't reach the AI — try again later". Not signed in → throw 401 immediately without a network call.
- Hook: `callAI("hook", {term, reading, romaji, meaning, neighbours})` where `neighbours` = up to 3 deck terms with the closest reading (cheap confusables: same first kana and similar length) → store `result.hook` (+ ` — vs ${confusable}` when present) in `jpn101:hooks`.
- Debrief: `callAI("debrief", {missed: [{term, romaji, meaning, ms: avg think}]})`, render `pairs` as chips ("A ↔ B: why"), the `hook` line and the `tip` — not a paragraph; only fire when signed in (skip silently otherwise, keep the existing "Missed: …" fallback line).
- Annotate: `callAI("annotate", {raw})` once for the whole dialogue; if the Worker returns `warning: "token mismatch"`, keep `plain: true` for that script and show "saved, but furigana may be misaligned — tap ＋ふりがな to retry". Error copy no longer says "tell Claude the exact message".
- Show `remaining` when ≤ 10 ("9 AI calls left today") near the button that triggered it (a `tc-smarthint`).
- Keep `parseJSON` only if still referenced (Sentences, TODO-127) — otherwise delete with `callClaude`.

## Implementation steps
1. Replace L2180–2203 with:
   ```js
   const AI_ENDPOINT = "/api/ai";
   class AIError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
   function aiMessage(status) {
     return status === 401 ? "Sign in (Browse tab) to use the AI helpers." : status === 429 ? "Daily AI limit reached — try again tomorrow."
          : status === 503 ? "The AI helper isn't set up on this server yet." : "Couldn't reach the AI — try again later.";
   }
   async function callAI(task, input) {
     const session = loadSession();
     if (!session) throw new AIError(401, aiMessage(401));
     const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 35000);
     try {
       const res = await fetch(AI_ENDPOINT, { method: "POST", cache: "no-store", signal: ctrl.signal,
         headers: { "content-type": "application/json", authorization: "Bearer " + session },
         body: JSON.stringify({ task, input, v: 1 }) });
       if (!res.ok) throw new AIError(res.status, aiMessage(res.status));
       const data = await res.json();
       if (!data || !data.result) throw new AIError(502, aiMessage(502));
       return data;                       // { result, cached, remaining, model, warning? }
     } catch (e) { if (e.name === "AbortError") throw new AIError(504, "The AI took too long — try again."); throw e; }
     finally { clearTimeout(timer); }
   }
   ```
2. Hook (`getHook` L1517–1523):
   ```js
   try {
     const neighbours = cards.filter((c) => c.id !== card.id && c.reading && card.reading && c.reading[0] === card.reading[0] && Math.abs(c.reading.length - card.reading.length) <= 1).slice(0, 3).map((c) => c.term);
     const { result, remaining } = await callAI("hook", { term: card.term, reading: card.reading, romaji: card.romaji, meaning: card.meaning, neighbours });
     const text = result.hook + (result.confusable ? " — vs " + result.confusable : "");
     hooksRef.current[card.term] = text; sSet("jpn101:hooks", JSON.stringify(hooksRef.current));
     setHook({ term: card.term, text, remaining });
   } catch (e) { setHook({ term: card.term, err: e.message || aiMessage(0) }); }
   ```
   Render L2018: `hook.err ? hook.err : …` and, when `typeof hook.remaining === "number" && hook.remaining <= 10`, append a small `({hook.remaining} left today)`. Study receives `cards` already (L1497).
3. Debrief (L1725–1733): guard `if (!loadSession()) { setDebrief({ err: true }); return; }`; call `callAI("debrief", { missed: missed.slice(0, 5).map((c) => ({ term: c.term, romaji: c.romaji, meaning: c.meaning, ms: c.msN ? Math.round(c.ms / c.msN) : 0 })) })` → `setDebrief({ data: result })`. Render (L1925–1929): `debrief.data && <div className="tc-debrief">{data.pairs.map(p => <span className="tc-fchip" key={p.a+p.b}>{p.a} ↔ {p.b} · {p.why}</span>)}<p>✨ {data.hook.term}: {data.hook.text}</p><p>{data.tip}</p></div>`.
4. Scripts: replace `annotateRaw` (L3532–3550) body with `const { result, warning } = await callAI("annotate", { raw: rawText }); if (!result.lines || !result.lines.length) throw new Error("no lines"); return { lines: result.lines, warning };` and adapt `build`/`reannotate` to set `plain: !!warning` and the new `saveWarn` copy: "Saved without furigana — " + e.message (the `AIError` message) + " Tap ＋ふりがな to retry." Update the intro copy L3603 only if it claims something false (it does not).
5. Delete `callClaude`, `parseJSON` (if unreferenced), `hookPrompt`, `debriefPrompt`, `scriptPrompt` (prompts live in the Worker). Keep `localBuild` (offline fallback).
6. Bundle assertion (TODO-213's CI runs it; TODO-016 adds the build guard): after build, `grep -c "api.anthropic.com" index.html` must be 0 — run it once now manually.

## Data migration / compatibility
`jpn101:hooks` keeps the same shape (term → text). No new keys.

## Testing & verification
- Signed in: tap ✨ hook → text appears within ~3 s; second tap on the same word is instant (local cache); a different device hits the KV cache (`cached:true`).
- Finish a session with misses → chips + hook + tip render; not signed in → the fallback "Missed: …" line, no network call (check DevTools).
- Scripts → paste a 10-line dialogue → furigana tokens present (`<ruby>` rendered in rehearse), `plain` false.
- `grep -c "api.anthropic.com" index.html` → 0 after `node tools/build.mjs`.
- Build + deploy.

## Acceptance criteria
- [ ] No client code calls `api.anthropic.com`; `callClaude` removed.
- [ ] Hook, debrief and annotate work end-to-end when signed in; clear messages when not/over cap.
- [ ] Debrief renders structured chips; annotate handles whole dialogues and the mismatch warning.
- [ ] "N left today" shown when ≤ 10.

## Pitfalls / notes
- `loadSession()` only says a token exists; a 401 from the Worker (expired/rotated) should trigger TODO-002's 401-recovery (sign-out + re-render button) — call its handler if it exists; otherwise just show the 401 message.
- Keep hooks cached forever (`jpn101:hooks`) — same-card hooks are requested once ever.
- Rebuild `index.html` and deploy.
