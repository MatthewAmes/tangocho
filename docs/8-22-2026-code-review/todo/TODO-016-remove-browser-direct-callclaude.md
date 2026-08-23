# TODO-016 — Remove the browser-direct Anthropic call; gate the AI affordances behind `AI_ENABLED`; build guard

**Priority:** P1   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 8 (dead code that still runs), exec summary 11; 04-security-review § INFO-13; 06-architecture § 1, F-2 ("invites a pasted key"), § 8.6 bundle assertion; 05-expansion § 6.0; 02-pedagogy § 7 #5
**Depends on:** none   **Blocks:** TODO-012 (tight `connect-src`); the Theme B item "TODO-1xx /api/ai endpoint" re-enables the features through a Worker route

## Why
`callClaude()` POSTs to `https://api.anthropic.com/v1/messages` from the browser with no API key, no `anthropic-version` header and no CORS opt-in — it fails 100% of the time on the deployed site (it only worked inside the Claude.ai artifact sandbox where the app was born). It is still invoked by the ✨ hook button, by an **automatic** end-of-session debrief (one guaranteed-failed cross-origin request per session with misses, with a "Coach is looking…" line), and by Scripts annotation (always falls back to `localBuild` and tells the student to "tell Claude the exact message"). Beyond the wasted requests and misleading UI, the real risk is the obvious "fix": pasting an Anthropic key into the client — this repo already had one key-in-source incident (`75c7254`). The replacement is a session-gated Worker route (Theme B's "TODO-1xx /api/ai endpoint"); this item removes the unsafe path now and leaves a single switch for that item to flip.

## Current behaviour (verified)
- `JpnFlashcards.jsx:2180-2203`:
  ```js
  async function callClaude(prompt) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }), signal: ctrl.signal });
      if (!res.ok) throw new Error("server " + res.status);
      …
  ```
- Call sites: `:1519` (`getHook`, ✨ hook button rendered at `:2021`); `:1730` (auto-debrief effect `:1725-1733`, rendered `:1925-1929`); `:3540` (`Scripts.annotateRaw`, used by `build` `:3552-3567` and `reannotate` `:3569-3579`; error copy at `:3562`, `:3576`); `:2370`, `:2403` (`Sentences`, unmounted — Theme C deletes it).
- `tools/build.mjs:47-57` has a `must` list of regexes the bundle must contain; nothing asserts absence.
- Prompts `hookPrompt`/`debriefPrompt` (`:3453-3459`) and `scriptPrompt` (`:2937`) are plain strings — keep them; the Worker route will reuse them.

## Intended behaviour
- No code path in the bundle can reach `api.anthropic.com`; the build fails if the string reappears.
- `const AI_ENABLED = false;` (module-level, near `callClaude`). `callClaude(prompt)` becomes the single transport function: when `AI_ENABLED` is false it rejects immediately with `new Error("AI helper not available")` and makes no network call; when Theme B lands it POSTs to `/api/ai` with `syncRequestOptions`-style auth and flips the constant.
- While disabled: the ✨ hook button is not rendered; the auto-debrief effect does not run (no "Coach is looking…"); Scripts "Build rehearsal" uses `localBuild` directly with honest copy ("Saved as plain lines — furigana/rōmaji annotation isn't available in this build"); the "＋ふりがな" re-annotate button is hidden. The `jpn101:hooks` cache still displays existing hooks if any.

## Implementation steps
1. **Replace `callClaude`** (`:2180-2203`):
   ```js
   /* ── AI helpers ──
      Transport for every AI feature (hook, debrief, script annotation, sentences). The browser must
      never call api.anthropic.com directly: there is no safe place for a key in a client bundle, and
      this repo already had one key-in-source incident. The Worker route /api/ai (session-gated, key
      in a Worker secret) is the only allowed path; until it exists this stays off. */
   const AI_ENABLED = false;                 // flip to true when /api/ai ships (see TODO-1xx)
   const AI_ENDPOINT = "/api/ai";
   async function callClaude(prompt, task = "generic") {
     if (!AI_ENABLED) throw new Error("AI helper not available");
     const req = syncRequestOptions({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, prompt }) });
     if (!req) throw new Error("sign in to use AI helpers");
     const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
     try {
       const res = await fetch(AI_ENDPOINT, { ...req.opts, signal: ctrl.signal });
       if (!res.ok) throw new Error("server " + res.status);
       const data = await res.json();
       const text = typeof data.text === "string" ? data.text : "";
       if (!text.trim()) throw new Error("empty reply");
       return text;
     } catch (e) { if (e.name === "AbortError") throw new Error("timed out"); throw e; }
     finally { clearTimeout(timer); }
   }
   ```
   (`syncRequestOptions` returns `{url, opts}` — after TODO-003 it returns `null` when signed out; before TODO-003 it returns a `?code=` URL — either way only `opts.headers` is used here. Theme B may change the body shape; the point is that the transport is one function.)
2. **Gate the affordances**:
   - `:2016-2022` (hook UI): wrap in `{AI_ENABLED && (hook && hook.term === card.term ? … : <button …>✨ hook</button>)}`. Keep showing a cached hook even when disabled: `{!AI_ENABLED && hook && hook.text && <p className="tc-hooktext">✨ {hook.text}</p>}` is not needed because `hook` is only set by `getHook`; skip it.
   - `:1725-1733` (auto-debrief effect): first line `if (!AI_ENABLED) return;`. The `:1927-1929` "Missed: …" fallback line currently renders only when `debrief.err`; change the condition to `(!AI_ENABLED || (debrief && debrief.err)) && missedCards.length > 0` so the useful "Missed: … hit Review" line still appears.
   - Scripts `build` (`:3552-3567`): `let lines = null, annotated = false, why = "";` then `if (AI_ENABLED) { try { lines = await annotateRaw(raw); annotated = true; } catch (e) { why = e.message || ""; } }` and `if (!lines) lines = localBuild(raw);`. Replace the warning at `:3562` with: `if (!annotated) setSaveWarn(AI_ENABLED ? "⚠️ Saved without furigana — annotation failed (" + why + "). Tap ＋ふりがな to retry." : "Saved as plain lines — furigana/rōmaji annotation isn't available in this build. You can still rehearse with voice.");` and drop the "tell Claude the exact message" sentence at `:3576` similarly.
   - Hide the `＋ふりがな` reannotate button (`:3697` area — find `reannotate(` in the list row) with `AI_ENABLED &&`.
   - Copy that promises AI (05 § 6.0 lists `:2426` "Claude builds a sentence…" in the unmounted `Sentences`, and `:3603` "Claude adds furigana, rōmaji, and a translation") — update `:3603` to describe the current behaviour; `Sentences` is Theme C's deletion.
3. **Build guard** — in `tools/build.mjs` after the `must` loop (`:57`):
   ```js
   const mustNot = [["a direct Anthropic API call (use the Worker /api/ai route)", /api\.anthropic\.com/]];
   for (const [what, re] of mustNot) {
     if (re.test(code)) { console.error(`BUILD ABORTED — bundle contains ${what}.`); process.exit(1); }
   }
   ```
4. Rebuild (`cd tools && node build.mjs` must succeed — it fails if any `api.anthropic.com` string remains, including in `Sentences`; the string only exists in `callClaude`, so step 1 suffices), commit `index.html`, deploy.

## Data migration / compatibility
None. `jpn101:hooks` stays as-is (synced, merged by TODO-008).

## Testing & verification
- `grep -n "api.anthropic.com" JpnFlashcards.jsx index.html` → 0 hits after the build.
- Study a session with a miss → done screen shows no "Coach is looking…", shows the "Missed: …" line; Network tab shows no cross-origin requests.
- Card back shows no ✨ hook button.
- Scripts → New script → paste "孝：スマホ。" → saves immediately with the honest plain-lines note; rehearse works; no "tell Claude" text.
- `node tools/build.mjs` with a deliberately re-added `"api.anthropic.com"` string → build aborts (then revert).

## Acceptance criteria
- [ ] Bundle contains no `api.anthropic.com`; build enforces it.
- [ ] No AI request is attempted while `AI_ENABLED` is false; UI makes no AI promise it cannot keep.
- [ ] A single `callClaude` transport remains for Theme B to wire to `/api/ai`.

## Pitfalls / notes
- Do NOT add an Anthropic key anywhere in the client, `wrangler.toml`, or `.dev.vars` that is tracked. The Worker route (Theme B) stores it with `wrangler secret put ANTHROPIC_API_KEY`.
- Keep `hookPrompt`, `debriefPrompt`, `scriptPrompt`, `parseJSON` — the Worker item reuses them (or moves prompts server-side).
- Theme C may delete `Sentences`/`Add`; coordinate so both edits to the same region apply cleanly (this item does not touch `Sentences`).
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
