# TODO-227 — Modularization steps 7+8: extract `applyReview()` from `recordResult` and `smartPool()` from Study; share the feed list between app and Worker

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 4.3 (cyclomatic hot spots), § 5 R11, § 9.3 steps 7–8, F-19; 05-expansion § 5.5 item 6
**Depends on:** TODO-222, TODO-229 (tests pin current behaviour)   **Blocks:** none (Theme B's scheduling fixes become one-line changes in `schedule.js` afterwards)

## Why
The 45-line review algorithm (level/ease/FSRS/direction) lives inside a `setCards` updater and `smartPool` (the session-mix rule that had the "36% day" bug) inside a `useMemo` — neither can be unit-tested without React. Extracting them as pure functions is the step that makes Theme B's scheduling fixes (retention wiring, Write direction, Easy mapping) testable one-liners. Separately the feed-source list is duplicated between the app (`FEED_SOURCES`) and the Worker (`FEEDS`) and kept in sync only by a build-time text check.

## Current behaviour (verified)
- `recordResult` `JpnFlashcards.jsx:1392-1439` (root): `const t = ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0; logDay({ok: got, ms: t, deck: "class"}); setCards(prev => prev.map(c => { …firstProdTry, fast, crawl, delta, grade = gradeFromLatency(got, t), isProd, prior, nextState = fsrsReview(prior, grade, Date.now(), retentionTarget), ease clamp 0.55..1.8, base {…}, prod branch {rseen, rcorrect, rms, rmsN, rlevel}, rec branch {seen, correct, ms, msN, level} }))` then `sSet(STORE_KEY, …)`.
- `smartPool` in Study (~L1563-1605): filters (leeches out, due, new earliest-lesson-first), slot ladder `40/15 → 3/5/8` new, production slots ≤ 4, interleave; `SESSION = 16` (~L1573); `start()` (~L1679-1719) with leech throttle and `prodSet = owed.slice(0, 6)`.
- Latency thresholds `3000/6000/10000` at L1414-1415 duplicated in `tools/fsrs.mjs gradeFromLatency` (L144-150).
- Feeds: app `FEED_SOURCES = new Set([...])` (L4181 area, moved to `src/data/input-catalog.js` by TODO-221); Worker `const FEEDS = { "ci-natural": "https://www.youtube.com/feeds/videos.xml?channel_id=…", … }` `cf/src/index.js:202-222` (17 entries); `tools/check-feeds.mjs` compares them textually.

## Intended behaviour
```
src/lib/schedule.js   + export function applyReview(card, { got, dir, ms, now = Date.now(), retention = DEFAULT_RETENTION }) → next card object (pure)
                      + export const LATENCY = { fast: 3000, slow: 6000, crawl: 10000 } used by applyReview and fsrs.gradeFromLatency
src/lib/session.js    + export function smartPool(cards, { now = Date.now(), size = 16, retention }) → ordered card array (pure); + leechThrottle(pool, …) if it is pure
src/data/feeds.js     export const FEEDS = { id: url }; app derives FEED_SOURCES = new Set(Object.keys(FEEDS)); Worker imports the same file (wrangler bundles relative imports outside cf/ — verify; otherwise build.mjs copies feeds.js into cf/src/generated/)
```
`recordResult` becomes: clamp → `logDay` → `setCards(prev => prev.map(c => c.id === id ? applyReview(c, {got, dir, ms: t, retention: retentionTarget}) : c))` → `sSet`. Behaviour identical — proven by the tests written in TODO-229 *before* the move.

## Implementation steps
1. **Pin first** (TODO-229): `test/schedule.test.mjs` has `applyReview` cases derived from the *current* `recordResult` output — write the test against a copy of the current logic (inline in the test via `import { applyReview }` after extraction but with expected values computed by hand from the current code: e.g. recognition got-fast: `level +2`, `ease +0.08`, `seen+1`, `correct+1`, `ms+t`, `msN+1`, `fsrs` = `fsrsReview(prior, EASY, now, 0.9)`; production first-try miss: `delta 0`, `rlevel` stays ≥0, `fsrs` untouched).
2. Extract `applyReview` verbatim into `schedule.js` (pass `now` and `retention` in; use `LATENCY` constants). Change `tools/fsrs.mjs`/`src/lib/fsrs.js` `gradeFromLatency` to import `LATENCY` (or accept thresholds) so the numbers exist once (F-19).
3. Extract `smartPool` (and the slot ladder constants `NEW_SLOTS = [[40,3],[15,5],[0,8]]`, `PROD_SLOTS = 4`, `SESSION = 16`) into `session.js`; Study's `useMemo` becomes `useMemo(() => smartPool(cards, { now: sessionNow, retention }), [cards, …])`. Keep the random jitter in `start()` (L1700) out of `smartPool` or inject `rng` so tests are deterministic.
4. **Feeds**: create `src/data/feeds.js` with the Worker's map; app: `export const FEED_SOURCES = new Set(Object.keys(FEEDS));` in `input-catalog.js` importing it; Worker: `import { FEEDS } from "../../src/data/feeds.js";` at `cf/src/index.js` top and delete the inline map. Run `cd cf && npx wrangler deploy --dry-run --outdir /tmp/wk` to confirm wrangler's esbuild bundles the relative import (it does for plain ESM). Keep `tools/check-feeds.mjs` as a tripwire that `INPUT_CATALOG` ids cover every feed id (the app/Worker agreement is now structural).
5. Build, tests, `npm run check`, Worker tests (TODO-231) green, manual smoke: one Study session, Input "Show me 3 things" resolves feed items.

6. **Signature sketch** for the two extractions (keep the bodies verbatim; only the wrapper changes):
   ```js
   // src/lib/schedule.js
   export const LATENCY = { fast: 3000, slow: 6000, crawl: 10000 };
   export function applyReview(c, { got, dir, ms, now = Date.now(), retention = DEFAULT_RETENTION }) {
     const t = ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0;          // moved from recordResult's first line
     const firstProdTry = dir === "prod" && (c.rseen || 0) === 0;
     const fast = got && t > 0 && t < LATENCY.fast, crawl = got && t >= LATENCY.crawl;
     /* … the existing delta / grade / prior / nextState / ease / base / prod-vs-rec return, with Date.now() → now and retentionTarget → retention … */
   }
   // src/app/App.jsx
   const recordResult = useCallback((id, got, dir, ms) => {
     const t = ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0;
     logDay({ ok: got, ms: t, deck: "class" });
     setCards((prev) => { const next = prev.map((c) => (c.id === id ? applyReview(c, { got, dir, ms, retention: getRetention() }) : c)); sSet(K.deck, JSON.stringify(next)); return next; });
   }, []);
   // src/lib/session.js
   export const SESSION_SIZE = 16, NEW_SLOTS = [[40, 3], [15, 5], [0, 8]], PROD_SLOTS = 4;
   export function smartPool(cards, { now = Date.now(), size = SESSION_SIZE, retention = DEFAULT_RETENTION, rng = Math.random } = {}) { /* body of the Study useMemo, verbatim */ }
   ```

## Data migration / compatibility
none. Card field semantics unchanged. Worker bundle now includes `feeds.js` (same bytes as the inline map).

## Testing & verification
- `npm test`: `applyReview` (≥ 10 cases incl. both directions, fast/normal/crawl/miss, first-prod-try, ease clamps, ms sanity bounds), `smartPool` (slot ladder 0/15/40 due → 8/5/3 new; ≤ 4 production; leeches excluded; earliest-lesson-first for new; size ≤ 16).
- Golden test: feed a fixed card + sequence through old `recordResult` (copy of the pre-refactor function kept in the test file under `legacyRecordResult`) and new `applyReview`; assert deep-equal for 50 random sequences with a seeded RNG and fixed `now`.
- `node tools/check-feeds.mjs` prints agreement; `wrangler deploy --dry-run` succeeds.

## Acceptance criteria
- [ ] `applyReview` and `smartPool` are pure exports with tests; `recordResult` is a 6-line wrapper.
- [ ] Latency thresholds defined once.
- [ ] Feed list defined once (`src/data/feeds.js`), imported by app and Worker.
- [ ] `index.html` rebuilt + committed; Worker deployed.

## Pitfalls / notes
- `recordResult` currently calls `logDay` *outside* the updater — keep that (side effect in an updater is the R1.3 note from report 01).
- Theme B's fixes (`dir:"prod"` from Write, `dueness` using `st.due`, Easy mapping) are **not** part of this item — this is pure extraction; land those afterwards as separate commits with their own test deltas.
- If wrangler refuses the `../../src` import (outside the config dir), have `tools/build.mjs` write `cf/src/generated/feeds.js` (gitignored) from `src/data/feeds.js` and import that.
