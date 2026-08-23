# TODO-229 — Tests (node:test): sync merges, seed merge, scheduling helpers, session composition, day/streak maths, input engine port

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 7.2 untested table, § 7.4 strategy row "Pure domain"; 05-expansion § 5.5 items 1, 6, 7; 01-functionality § 1.1, § 3.2 (scenarios to pin)
**Depends on:** TODO-222 (modules importable; `node --test` runner)   **Blocks:** TODO-226, TODO-227 (refactors need these pins)

## Why
The sync merges (`mergeDeck/Days/Scripts/Input/Snapshots`), the seed merge, `recordResult`'s review maths, `smartPool`, the scheduling helpers and the day/streak code have zero tests, and every silent data-loss bug in the history (`69b7305`, `df0d460`, the "36% day") lived there. They are pure functions on plain objects; pinning their *current* behaviour is a day of work and makes Theme A/B's fixes safe (each fix then flips a named assertion).

## Current behaviour (verified)
- `tools/test-fsrs.mjs` (32) and `tools/test-input-engine.mjs` (36) exist; nothing else. After TODO-222 they live in `test/` as `node --test` files.
- Functions and current semantics to pin (from source): `cardMergeKey(c) = term|lesson|sec` (L936); `mergeDeck` keeps higher `seen*1e6+last` per key (L945-950) and "if `!cloud.length` keep local" (report 01 § 1.5); `mergeDays` per-day max `rev` (L958-962); `mergeScripts` union by id preferring annotated (L965-976); `mergeInput` append-only history union by `itemId|at`, pending `"p"+itemId+at`, `hidden` union, `tagScores` from newer (L977-1007); `mergeSnapshots` key switch + "cloud wins if `cloudUpdatedAt > localLastPulled`" (L1008-1020). Seed merge L1327-1341 keyed by `term` only (17 duplicate terms → known bug, Theme A/B fix). `streakFrom` L1223-1233 (UTC keys, local-noon cursor — known bug). `dueness` L2086-2097 (hard-coded 0.9). `smartPool` L1563-1605. `recordResult` L1392-1439.

## Intended behaviour
`test/*.test.mjs` files under `node --test`, each importing from `src/lib/*`, with assertion names that read as rules. Current-behaviour pins are marked `// KNOWN-BUG: see TODO-0xx/1xx` where the pinned behaviour is wrong, so the fix PR flips exactly that test.

## Implementation steps
1. `test/merge.test.mjs` — first cases:
   - `cardMergeKey` joins term|lesson|sec; same term different lesson → different keys.
   - `mergeDeck`: local seen 3 / cloud seen 5 same key → cloud wins; equal seen, newer `last` wins; card only on one side survives; **empty cloud deck → local kept** (the Clear-all resurrection semantic, report 01 § 1.5); mnemonic-only edit (`mn` changed, `seen` equal, `last` equal) — pin current (loser dropped) with `// KNOWN-LIMIT`.
   - `mergeDays`: two devices same day → max `rev`; disjoint days → union.
   - `mergeScripts`: union by id; annotated beats plain for the same id.
   - `mergeInput`: history union with no duplicates by `itemId|at`; pending dedupe; `hidden` union; `tagScores` taken from the newer side.
   - `mergeSnapshots`: per-key rules dispatch (deck/days/scripts/input); secondary key cloud-wins only when `cloudUpdatedAt > lastPulled`; keys in `SYNC_SKIP_KEYS` never merged.
2. `test/seed-merge.test.mjs` — extract the `ver < SEED_VERSION` block into `src/lib/migrations.js` `seedMerge(list, SEED)` (pure; TODO-227-style extraction, tiny) and pin: new terms appended with `seen:0`; existing term's `reading/romaji/meaning/kind/emoji/pitch/lesson` refreshed; **`sec` not refreshed** (`// KNOWN-BUG`); duplicate-term SEED rows overwrite the earlier card and the second is never added (`// KNOWN-BUG: report 01 § 1.1`) — use a 3-row fixture, not the real SEED.
3. `test/schedule.test.mjs` — `isWeak` (seen≥1 & acc<0.5), `masteryScore` ordering, `isLeech` thresholds (≥8 attempts, ≥6 misses, <60% — read L2078-2083 for exact), `dueness` with S=10 at elapsed 0/5/10/20 days (pin `intervalFor(S,0.9)` denominator), `recallChance` monotone decreasing, `prodDue` requires `recallUnlocked` (S ≥ 7 d) and production due clock; after TODO-227: `applyReview` cases (see that item).
4. `test/session.test.mjs` — after TODO-227's `smartPool`: with 0/15/40 due cards → 8/5/3 new slots; ≤ 4 production; leeches excluded; new words earliest lesson first; total ≤ 16; production cards never adjacent when ≥ 2 (pin current; if it fails, mark KNOWN-BUG per report 01 § 2.5). Before 227, test the requeue arithmetic via a small pure helper `requeueIndex(pos, gap, len) = min(pos+1+gap, len)` extracted from `grade()`.
5. `test/days.test.mjs` — `streakFrom(days, now)` with injected `now` (TODO-222 added the parameter): 3 consecutive days → 3; gap → resets; today not studied but yesterday was → counts from yesterday (grace); a 20:50 America/Denver evening key lands on the *next* UTC day (`// KNOWN-BUG: Theme A day-key item`) — set `process.env.TZ="America/Denver"` at the top of the file before importing (node:test runs files in-process; use a child process or `--test-isolation` if TZ leaks). `mascotState`: sleeping/worried/proud/happy table.
6. `test/input-engine.test.mjs` — the 36 ported cases (TODO-222) plus: `recommend` respects `hidden`, duration filter keeps ≥ 3 fitting items, passive mode sorting (pin).
7. `npm test` runs everything; CI (TODO-213) picks it up automatically.

8. **Fixture + helper conventions** (shared `test/_fixtures.mjs`):
   ```js
   export const card = (o = {}) => ({ id: "c1", term: "猫", reading: "ねこ", romaji: "neko", meaning: "cat", kind: "kanji", emoji: "🐱", lesson: 2, sec: "2-1", seen: 0, correct: 0, ...o });
   export const deck = (...cs) => cs.map((o, i) => card({ id: "c" + (i + 1), ...o }));
   export const snap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));   // snapshot values are raw JSON strings
   export const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);   // fixed clock for every test
   ```
   Example merge test using them:
   ```js
   test("mergeDeck keeps the more-studied copy per term|lesson|sec", () => {
     const local = deck({ seen: 3, last: NOW - 1000 }), cloud = deck({ seen: 5, last: NOW - 5000 });
     const out = mergeDeck(local, cloud);
     assert.equal(out.length, 1); assert.equal(out[0].seen, 5);
   });
   test("KNOWN-BUG TODO-009/124: seed merge by term overwrites the earlier duplicate instead of adding a card", () => {
     const list = deck({ term: "前", lesson: 3, sec: "3-2", meaning: "before (time)", seen: 4 });
     const SEEDF = [{ term: "前", lesson: 3, sec: "3-2", meaning: "before (time)" }, { term: "前", lesson: 43, sec: "6-1", meaning: "front" }];
     const out = seedMerge(list, SEEDF);
     assert.equal(out.length, 1); assert.equal(out[0].meaning, "front"); assert.equal(out[0].sec, "3-2");   // pins today's behaviour
   });
   ```

## Data migration / compatibility
none (tests only; `seedMerge` extraction is behaviour-preserving).

## Testing & verification
- `npm test` → all files pass; `node --test test/merge.test.mjs` alone works.
- Mutation sanity: flip `>` to `>=` in `mergeDeck` locally → the "equal seen, newer last wins" test fails; revert.
- Each KNOWN-BUG assertion has a TODO reference in its name or comment.

## Acceptance criteria
- [ ] ≥ 40 new assertions across `merge`, `seed-merge`, `schedule`, `session`, `days`, `input-engine` files.
- [ ] Known bugs pinned with explicit markers (not silently "fixed" here).
- [ ] Runs under `npm test` and in CI.

## Pitfalls / notes
- Never use the real 821-row `SEED` in fixtures — 3–5 row fixtures keep tests readable and fast.
- `Date.now()` inside functions: prefer passing `now`; where a function still reads the clock, use `mock.timers` from `node:test` (Node ≥ 20.4) or assert relative properties.
- Theme A/B items that fix pinned bugs must update the corresponding test in the same commit.
