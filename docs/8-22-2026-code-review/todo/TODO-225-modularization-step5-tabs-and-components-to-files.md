# TODO-225 — Modularization step 5: one file per tab (`src/tabs/*.jsx`) and shared components (`Mascot`, `SpeakBtn`, `Furigana`, `Bi`, `SubNav`)

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 9.1 target tree (`tabs/`, `components/`), § 9.3 step 5, § 4.2 component lengths
**Depends on:** TODO-224   **Blocks:** TODO-226

## Why
After steps 1–4, `JpnFlashcards.jsx` is ~3,000 lines of eight components (`Study` 545, `Input` 410, `Kana` 359, `Scripts` 247, `Browse` 245, `ConjDrill` 220, `Freq` 213, `Write` 107) plus a few shared bits. Cutting each into its own file is mechanical, makes diffs reviewable (a Study change no longer touches a 6k-line file), and lets two people (or two Claude sessions) work on different tabs without conflicts.

## Current behaviour (verified)
Component start lines in the original file (they shift after steps 1–4; locate by `function NAME(`): `Study` L1497, `Kana` L2578, `Scripts` L3461, `Write` L3708, `Browse` L3822 (+ `SYNC_UI` L3815), `Add` L4067 (unrendered — Theme B decides), `Input` L4544, `ConjDrill` L5002, `Freq` L5388, `Sentences` L2354 (unrendered — Theme B), `Mascot` L1250, `Furigana` L2344, `SpeakBtn` L3443, `Bi` L4510. `hookPrompt`/`debriefPrompt`/`lineText` L3450-3460; `scriptPrompt` L2937; `localFill/localTrans/…` L2301-2343 (Sentences-only).

## Intended behaviour
```
src/tabs/Study.jsx   Freq.jsx   ConjDrill.jsx   Input.jsx   Write.jsx   Kana.jsx   Scripts.jsx   Browse.jsx
src/components/Mascot.jsx  SpeakBtn.jsx  Furigana.jsx  Bi.jsx  SubNav.jsx (from TODO-220 if landed)  Toast.jsx (TODO-207)
src/lib/prompts.js   hookPrompt, debriefPrompt, scriptPrompt (kept even if the AI path is removed — Theme B decides)
```
`JpnFlashcards.jsx` is deleted (or left as a one-line re-export shim for one release). `App.jsx` imports tabs from `../tabs/*`.

## Implementation steps
1. For each tab: create `src/tabs/X.jsx` with `import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";`, the `lib`/`data`/`components` imports it needs (find them by building and reading esbuild's "X is not defined" errors — fast feedback loop), and `export default function X(…)` — body verbatim.
2. Shared components to `src/components/`; each default-exports one component.
3. `Add` and `Sentences`: per Theme B's decision either move to `src/tabs/Add.jsx`/`Sentences.jsx` (unmounted but kept) or delete with their helper chain (TODO-228 lists the chain). Don't decide here.
4. `App.jsx` imports from `../tabs/...`; remove the temporary named exports added in TODO-224. Delete `JpnFlashcards.jsx` once `grep -rn "JpnFlashcards.jsx" --include=*.mjs --include=*.js --include=*.jsx --include=*.md .` shows only docs.
5. Update `tools/check-feeds.mjs` if it still references the old path (it shouldn't after TODO-221).
6. Build; since minifier renames will shift bytes, verify equivalence with `minify:false` builds before/after (`git stash` dance or build from the previous commit into `/tmp/before.js`) and `diff` — only import/export boilerplate should differ; then `npm test`, manual smoke of every tab, `npm run check` after committing `index.html`.

7. **Per-tab import checklist** (what each file needs — derived from the singletons map in report 06 § 3.4; confirm with esbuild errors):

   | Tab | lib imports | data imports | components |
   |---|---|---|---|
   | `Study.jsx` | storage (`sGet/sSet/loadJSON`), days (`loadDays/streakFrom/mascotState`), tts (`speakJa/prefetchJa/stopJa/ttsUnlock`), schedule (`isWeak/masteryScore/isLeech/dueness/prodDue/recallChance/needScore`), retention (`getRetention/setRetention`), fsrs (`seedFromHistory`), session (`smartPool` after 227), prompts (`hookPrompt/debriefPrompt`), ui-bus (`flash/announce`) | sections (`sectionOf/hueFor/sectionArt/sectionRank`), `KIND_LABEL` | `Mascot`, `SpeakBtn` |
   | `Freq.jsx` | storage, days (`logDay`), schedule, fsrs, tts | `FREQ_SEED/FREQ_VERSION`, `KIND_LABEL` | `SpeakBtn` |
   | `ConjDrill.jsx` | storage, schedule (`statNeed/statReview`), conjugate (`conjugate/CONJ_FORMS`), tts | `CONJ_TYPES/CONJ_BANK/CONJ_FILTERS` | `SpeakBtn` |
   | `Kana.jsx` | storage, schedule (`statNeed/statReview`), kana (`fmtSecs`) | kana tables (`KANA_*`, `KANA_GROUPS`, `KANA_LENGTHS`) | `WritingPad` (after 226) |
   | `Write.jsx` | schedule (`masteryScore`) | — | `WritingPad` (after 226) |
   | `Scripts.jsx` | storage, tts, prompts (`scriptPrompt`), ui-bus | `SCRIPT_SEED` | `Furigana`, `SpeakBtn` |
   | `Browse.jsx` | storage, sync (`watchSyncState/syncStateNow/pushCloudNow`, `SYNC_UI`), auth (`initGoogleAuth/renderGoogleButton/googleEmailNow`), days, backup (after 226), schedule (`isLeech`) | `SEED` (restore back-fill) | — |
   | `Input.jsx` | storage, input-engine (all), video-index (`loadVideoIndex`), ui-bus | `INPUT_CATALOG/FEED_SOURCES/INPUT_PLANS/INPUT_TIMES/INPUT_VERDICTS` | `Bi` |

8. After the move, run `node tools/check-css.mjs` (TODO-228) — class usage is now scanned across `src/**`, so a tab that lost a class during cut/paste shows up as "defined but unused".

## Data migration / compatibility
none

## Testing & verification
- `npm run build` succeeds with no "not defined" warnings; `npm test` green.
- Unminified diff before/after shows only module boilerplate.
- Manual: each of the 8 tabs renders and performs its core action (Study session, Core/Freq session, Drill session, Input recommend+rate, Write reveal+grade, Kana session+chart, Scripts rehearse+new script, Browse backup/restore/filter).
- `wc -l src/tabs/*.jsx` individually < 600.

## Acceptance criteria
- [ ] Eight tab files + components exist; `JpnFlashcards.jsx` removed (or shim only).
- [ ] Bundle functionally equivalent (unminified diff = boilerplate); `index.html` rebuilt + committed.
- [ ] README/ARCHITECTURE source tree updated (TODO-234/235).

## Pitfalls / notes
- Cross-component constants (e.g. `KIND_LABEL`, `SYNC_UI`) go to `src/data/sections.js` / `src/lib/sync.js` respectively; grep before moving.
- Keep `key`/ref semantics identical — no renaming of state in this step.
- Do this in one sitting to avoid merge pain with Theme A/B edits inside the tab bodies.
