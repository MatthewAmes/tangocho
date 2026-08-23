# TODO-222 — Modularization step 2: pure libraries (`merge`, `conjugate`, `input-engine`, `kana`, `schedule`, `fsrs`) + port `test-input-engine.mjs` to real imports + `node --test`

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 9.3 step 2, § 7.1 (source-slicing test), § 7.3, F-1; 05-expansion § 5.3, § 5.5
**Depends on:** TODO-221   **Blocks:** TODO-223, TODO-229, TODO-230

## Why
Once the data is out, the pure functions are the next zero-risk move: they touch no DOM and have no hidden state except `retentionTarget` (pass it as a parameter with the module global as default). Moving them makes every later test item a plain `import`, retires the brace-counting source slicer in `tools/test-input-engine.mjs`, and lets `node --test` run the whole suite with no new dependency.

## Current behaviour (verified)
- Pure blocks in `JpnFlashcards.jsx` (post-TODO-221 line numbers will shift; find by name):
  - merge: `cardMergeKey`, `mergeDeck`, `mergeDays`, `mergeScripts`, `mergeInput`, `mergeSnapshots` (originally L936-1020) — pure on strings/objects; `mergeSnapshots` references `SYNC_SKIP_KEYS`/key names.
  - scheduling: `weakness` (dead), `isWeak`, `masteryScore`, `DAY`, `REVIEW_INTERVALS`, `recallUnlocked`, `effLevel`, `isLeech`, `dueness`, `statReview`, `statNeed`, `prodDue`, `recallChance`, `needScore` (L2042-2150) — use `retentionTarget` (module `let`, L1194) and `fsrs.mjs` imports.
  - kana helpers: `norm` (dead), `KANA_MAP`, `YOON_MAP`, `kataToHira`, `kanaToRomaji`, `canonR`, `fillMatch` (L2210-2265) + `fmtSecs` (L2573).
  - conjugation: `GODAN_ROWS`, `conjugate`, `CONJ_FORMS` (L4954-5001).
  - input engine: `INPUT_VERDICTS` (data, moved in 221), `evidenceWeight`, `learningRate`, `applyRating`, `seedLevelsFromDeck`, `seededShuffle`, `recommend`, `coverageAgainstDeck`, `band`, `bandName`, `relDots`, `agoLabel`, `blankInput` (L4333-4543); `unpackVideos` (~L4216-4239).
  - days: `streakFrom` (L1223-1233), `mascotState` (L1244-1249) — pure given `days`/inputs; `loadDays`/`logDay` touch storage (stay until TODO-223).
- `tools/fsrs.mjs` is already a module imported at `JpnFlashcards.jsx:10` and tested by `tools/test-fsrs.mjs`.
- `tools/test-input-engine.mjs:13-46` `grab()` slices source and `import()`s a `data:` URL; 36 tests.

## Intended behaviour
```
src/lib/fsrs.js          (git mv tools/fsrs.mjs; keep a one-line re-export at tools/fsrs.mjs for one release)
src/lib/merge.js         cardMergeKey, mergeDeck, mergeDays, mergeScripts, mergeInput, mergeSnapshots, SYNC_PREFIX, SYNC_SKIP_KEYS
src/lib/schedule.js      isWeak, masteryScore, DAY, REVIEW_INTERVALS, recallUnlocked, effLevel, isLeech, dueness, statReview, statNeed, prodDue, recallChance, needScore  (each taking `retention = DEFAULT_RETENTION` where used)
src/lib/kana.js          KANA_MAP, YOON_MAP, kataToHira, kanaToRomaji, canonR, fillMatch, fmtSecs
src/lib/conjugate.js     GODAN_ROWS, conjugate, CONJ_FORMS
src/lib/input-engine.js  evidenceWeight, learningRate, applyRating, seedLevelsFromDeck, seededShuffle, recommend, coverageAgainstDeck, band, bandName, relDots, agoLabel, blankInput, unpackVideos
src/lib/days.js          streakFrom(days, now = Date.now()), mascotState
test/                    node --test files (TODO-229/230 fill these; this item creates the runner + ports the 36)
```

## Implementation steps
1. Create each `src/lib/*.js`, cut the functions verbatim, add `export`. For `schedule.js`: where a function reads `retentionTarget`, add a trailing parameter `retention` defaulting to a module constant `export const DEFAULT_RETENTION = 0.9`, and at the call sites in `JpnFlashcards.jsx` pass the live `retentionTarget` (grep `dueness(`, `statNeed(`, `recallChance(`, `needScore(` — only those that use the target; `dueness` currently hard-codes `0.9` at its `intervalFor(st.S, 0.9)` — **do not change the value** in this step; Theme B's item fixes the retention wiring; just plumb the parameter).
2. `git mv tools/fsrs.mjs src/lib/fsrs.js`; create `tools/fsrs.mjs` containing `export * from "../src/lib/fsrs.js";` so `tools/test-fsrs.mjs` keeps working until moved; update the import at `JpnFlashcards.jsx:10`.
3. Port the tests: create `test/input-engine.test.mjs` using `node:test` + `node:assert/strict`, importing from `../src/lib/input-engine.js`; translate each existing `t("name", () => …)` to `test("name", () => …)` keeping names and assertions verbatim (36 tests). Delete `tools/test-input-engine.mjs` (the slicer). Move `tools/test-fsrs.mjs` → `test/fsrs.test.mjs` the same way (32 tests) — keep its assertion helpers or switch to `assert.ok/equal` 1:1.
4. Root `package.json` scripts: `"test": "node --test test/"` (plus the import smoke from TODO-212 as `test/import-smoke.test.mjs`).
5. `npm run build && npm run check` — expect an identical bundle (esbuild inlines/hoists module scope identically; if minifier renaming shifts bytes, verify with `minify:false` diffs that only imports moved) — then `npm test`.

## Data migration / compatibility
none at runtime.

## Testing & verification
- `npm test` → 68+ tests pass under `node --test` (32 fsrs + 36 input-engine + smoke).
- `grep -c "grab(" tools/*.mjs` → 0 (slicer gone).
- `npm run check` green; manual smoke on the app (Study session, Kana, Drill, Input recommend) unchanged.
- `wc -l JpnFlashcards.jsx` drops by ~500 lines.

## Acceptance criteria
- [ ] `src/lib/{fsrs,merge,schedule,kana,conjugate,input-engine,days}.js` exist with named exports; JSX imports them.
- [ ] `test/` uses `node --test`; the source-slicing test is deleted; all previous assertions preserved.
- [ ] Bundle functionally identical; `npm run check` green.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- `mergeSnapshots` hard-codes key names (`jpn101:deck` …) — keep them in `merge.js` next to `SYNC_SKIP_KEYS` (Theme A will extend that set; one place to edit).
- `node --test` needs Node ≥ 18; `.nvmrc` says 22.
- Don't "fix" anything while moving (e.g. `dueness` 0.9, `kanaToRomaji` extended sounds) — behaviour changes go in their own items with tests (TODO-229/230 pin current behaviour first).
