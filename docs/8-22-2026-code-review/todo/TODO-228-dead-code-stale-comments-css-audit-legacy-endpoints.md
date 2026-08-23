# TODO-228 — Tidiness: delete verified-dead code, stale comments, unused CSS (with a reusable audit script), legacy `/.netlify/functions/*` client paths

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 4.8 dead-code table, § 4.7 stale comments, § 9.3 step 9, F-15, F-16, F-20; 03 § 1 V-8; 05 § 7 table
**Depends on:** Theme A (netlify/ deletion, sync-code removal) and Theme B (Sentences/Add, callClaude decision) for the items marked ⚑; the rest is independent   **Blocks:** none

## Why
Dead code is modest but real, and it is how the two CSS collisions in TODO-201 happened. Each symbol below was re-verified with `grep -c` against the current source (counts in parentheses include the definition). Removing them, fixing the four stale comments, and adding a 20-line "used vs defined" CSS audit to `npm test` keeps the file honest going forward.

## Current behaviour (verified)
Dead JS (count = total occurrences incl. definition):
- `weakness(` (1) L2042-2046 — unused (`isWeak` is the live one).
- `norm(` (1) L2210-2215 — unused (⚑ only Sentences would use it; keep in `lib/kana.js` *only* if Theme B revives Sentences).
- `focusPool` (1) L1558 — computed, never read.
- Study `coverage` L1560 `const coverage = newCount > 12;` — only appears in `start`'s deps array L1719 (`}, [cards, coverage]);`) — remove both.
- `liveRef` (2) L1528, L2037 — superseded by TODO-207's Toast (if 207 lands first, this is already gone).
- `setSyncCode` (1) L923-925 — unused. `genSyncCode`/`getSyncCode`/`SYNC_KEY` (2 each) are **live** via `syncRequestOptions` L1101 — ⚑ Theme A removes the code path; then delete all three + `"jpn101:syncCode"` from `SYNC_SKIP_KEYS`.
- `signOutGoogle` (1) L1041 — ⚑ Theme A's 401-recovery item *uses* it; do not delete.
- `isEmoji` (2) L1263 + Add L4080; `KIND_LABEL.mixed` used by the kind chip (keep `KIND_LABEL`). ⚑ `isEmoji` goes with `Add` if Add is deleted.
- `oralAttempts` (3) L1283 (banner backup), L3842 (Browse backup), L3886 (restore) — Oral tab removed in `07120db`; keep *reading* it on restore for old backups, stop *writing* it: drop from the two collectors (TODO-226 unifies them) and from the backup object; document in DATA-SCHEMA.
- `window.storage` (10) — removed by TODO-223 (storage module).
- `MASCOT_GIFS.waiting` fallback (1) L1251 — harmless; keep.
- `REVIEW_INTERVALS` (3) / `effLevel` (4) — live (pre-FSRS fallback + Freq `nextIn`); Theme B decides; mark `// legacy` only.
- `callClaude` (6), `parseJSON` (4), `kanaToRomaji/canonR/fillMatch/kataToHira` (2-3 each), `Sentences` (L2354), `Add` (L4067), `localFill/localTrans/pickTarget/NOUN_SET/fillPrompt/transPrompt/gradePrompt/vocabList/shortMeaning` — ⚑ Theme B.
- `netlify/functions/*.mjs` — ⚑ Theme A (secret carrier).
Stale comments: L4-5 "Cards are saved with window.storage"; L900-904 "cross-device sync (Netlify Blobs via /.netlify/functions/sync) … Every device has a short sync code"; L1028 "Falls back to the manual sync code only if…"; L4117-4121 "Negative-form drill: …" (drill does all 8 forms; the next comment L4122-4123 already says so); `tools/build.mjs:3-4, 22-25` Netlify build-step rationale; `tools/package.json` description (removed by TODO-211).
Legacy endpoints: `SYNC_ENDPOINT = "/.netlify/functions/sync"` L906, `TTS_ENDPOINT = "/.netlify/functions/tts"` L3352, `FEED_ENDPOINT = "/.netlify/functions/feed"` L4181; Worker aliases `cf/src/index.js:365-367`; header comment L13-15 explains the dual paths.
CSS (from the audit script below, run on the current file — 280 defined, 247 used): **defined but unused (37):** `tc-bkpnudge tc-bubble tc-bubble-kanda tc-bubble-you tc-bubblewho tc-coachai tc-coachbtns tc-coachcard tc-coacherr tc-coachhead tc-coachline tc-coachplan tc-conjmode tc-controls tc-debrieftext tc-field tc-focus-btn tc-jp tc-kind-prod tc-oral tc-oralbar tc-oralchat tc-oraldebrief tc-oralinput tc-pre tc-prompt-en tc-reading tc-review-btn tc-row tc-rowkind tc-rowmean tc-rowstat tc-setupline tc-sizesel tc-szbtn tc-term-sm tc-toggle`; **used but undefined (4):** `tc-front tc-kana tc-study tc-sumgrid`; **duplicate definitions:** `tc-seg` ×2, `tc-input` ×2. (TODO-201 fixes the undefined/duplicates; TODO-218 starts using `tc-bkpnudge`; TODO-209 uses `tc-conjmode`.)

## Intended behaviour
No unreferenced symbols in `src/`; comments describe the current architecture; the CSS audit runs in `npm test` and fails on any *used-but-undefined* class and warns on *defined-but-unused*; the client calls `/api/*` only, and (one release later) the Worker drops the `/.netlify/functions/*` aliases.

## Implementation steps
1. Delete the non-⚑ dead JS listed above (`weakness`, `focusPool`, `coverage` + dep, `setSyncCode`, `liveRef` if still present). Stop writing `oral` in backups.
2. Rewrite the four stale comments (and `build.mjs` header) to describe the Worker/KV architecture and the root `package.json` build.
3. Endpoints: change the three constants to `"/api/sync"`, `"/api/tts"`, `"/api/feed"` (after Theme A confirms the Netlify 301 is in place — it is: `netlify.toml` forces `/*` → Worker). Keep the Worker aliases for one more release, then delete L365-367's alias halves and the header comment L13-15 — note in CHANGELOG/RUNBOOK.
4. CSS: delete the unused classes except the ones claimed by other items (`tc-bkpnudge`, `tc-conjmode`, and `tc-sent*`/`tc-coach*`/`tc-debrieftext` ⚑ if Sentences/AI survive). Add `tools/check-css.mjs`:
   ```js
   import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
   const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
   const css = fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8");           // or slice the CSS template from JpnFlashcards.jsx before TODO-224
   const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
   const jsx = walk(path.join(ROOT, "src")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
   const defined = new Set([...css.matchAll(/\.((?:tc|kn)-[a-z0-9-]+)/g)].map((m) => m[1]));
   const used = new Set([...jsx.matchAll(/(?:tc|kn)-[a-z0-9-]+/g)].map((m) => m[0]));
   const DYNAMIC = ["tc-rate-", "kn-", "is-"];                                       // prefixes built at runtime (e.g. "tc-rate-" + x)
   const undef = [...used].filter((c) => !defined.has(c) && !DYNAMIC.some((p) => c.startsWith(p)));
   const unused = [...defined].filter((c) => !used.has(c) && !DYNAMIC.some((p) => c.startsWith(p)));
   if (undef.length) { console.error("CSS: used but undefined:", undef.join(" ")); process.exit(1); }
   if (unused.length) console.warn("CSS: defined but unused:", unused.join(" "));
   console.log(`    css ${defined.size} classes, ${used.size} used`);
   ```
   Add `node tools/check-css.mjs` to `npm test` (or to `build.mjs` next to `check-feeds`).
5. Build, `npm test`, `npm run check`, smoke.

## Data migration / compatibility
Backups no longer contain `oral` (restore still tolerates it). Endpoint change: old built `index.html` in a client cache keeps working because the Worker aliases remain for one release.

## Testing & verification
- `node tools/check-css.mjs` → 0 undefined, the unused list empty (or only ⚑-deferred classes).
- `grep -nE 'function (weakness|norm|setSyncCode)\b|focusPool|liveRef' src JpnFlashcards.jsx` → none (modulo ⚑).
- `grep -rn 'netlify/functions' src JpnFlashcards.jsx` → 0; prod sync/TTS/feed work via `/api/*` (DevTools network).
- Backup JSON has no `oral` key; restoring an old backup containing `oral` still works.

## Acceptance criteria
- [ ] Listed dead symbols removed (non-⚑) and ⚑ items cross-referenced to Theme A/B TODOs.
- [ ] Stale comments rewritten; CSS audit in `npm test`.
- [ ] Client uses `/api/*`; Worker aliases scheduled for removal (note in RUNBOOK/CHANGELOG).
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Verify every deletion with `grep -rn` across `src/`, `cf/`, `tools/` — not just the one file.
- Do not delete `.tc-sent*` classes used by Scripts (13 of them) — the audit script tells you which are truly unused.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
