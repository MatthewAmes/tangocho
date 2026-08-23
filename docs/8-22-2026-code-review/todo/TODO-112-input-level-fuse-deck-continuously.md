# TODO-112 — Input level: fuse deck mastery into the level continuously and floor the learning rate

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §4.1 ("Re-seed rule", "Permanent learning-rate decay"), §6 row 2, §7 item 2; 05-expansion §3.3 (learningRate floor, cold-start)
**Depends on:** none   **Blocks:** TODO-114 (channel priors use the same `applyRating` path)

## Why
`seedLevelsFromDeck` is applied only while no rating has been logged for either medium. After the first rating, deck growth never informs the level again: a learner who learns 400 more words over a semester but rates rarely is recommended material for a 375-word learner indefinitely. And `learningRate = 1/(1+n/12)` decays forever by lifetime count: after ~100 ratings a "too easy" moves the level by ~0.36 (report 02 sim: thirty straight "too easy" after 100 prior ratings moves 14 → 22.6). A real learner's level is non-stationary.

## Current behaviour (verified)
- `seedLevelsFromDeck(cards)` L4370–4373: `known` = cards with `seen > 0` and accuracy ≥ 0.6; `listening = 5 + known/40`, `reading = 8 + known/30`.
- Load effect L4558–4568: `else if (!(o.counts?.listening || 0) && !(o.counts?.reading || 0)) o.levels = seedLevelsFromDeck(cards);` (L4562) — re-seed only while zero ratings.
- `learningRate(ratingCount)` L4343 `1 / (1 + (ratingCount || 0) / 12)`; `applyRating` L4345–4362 multiplies `v.user * evidenceWeight * learningRate`.
- Tests in `tools/test-input-engine.mjs`: "learningRate decays monotonically", "alternating too_easy/too_hard converges", "the 100th rating moves the level less than the 1st".
- `mergeInput` (L980–1007) takes `levels` from the side with the newer `levels.updatedAt`.

## Intended behaviour
- The effective level is a blend of a **rating-derived** component (what ratings say) and a **deck-derived** component (what the deck says), re-evaluated on every load and every rating:
  `level = max(deckLevel − 4, ratingLevel)` when ratings exist — i.e. the deck provides a rising floor (minus a small margin so the deck cannot push someone into material they rated too hard), ratings can lift above it; and if ratings say *lower* than `deckLevel − 4` for a sustained run (last 5 verdicts include ≥ 3 hard/lost), trust the ratings (floor off for that medium until a too_easy arrives). Simpler formulation that is easy to test: store `levels.rated.{listening,reading}` (pure rating walk) and compute `levels.{listening,reading} = clamp100(Math.max(rated, seed − 4))` at load and after each rating, where `seed = seedLevelsFromDeck(cards)`.
- `learningRate` floors at 0.25 (≈ n ≤ 36 behaviour) and **re-opens** to 0.5 when the last 5 verdicts are one-sided (≥ 4 of 5 too_easy or ≥ 4 of 5 hard/lost).
- Show Δlevel after a rating (05 §3.3): the flash note reads "Listening 23 → 24".

## Implementation steps
1. `learningRate` (L4343) → `function learningRate(ratingCount, recent) { const base = Math.max(0.25, 1 / (1 + (ratingCount || 0) / 12)); if (recent && recent.length >= 5) { const r = recent.slice(0, 5); const easy = r.filter((v) => v === "too_easy").length, hard = r.filter((v) => v === "too_hard" || v === "lost").length; if (easy >= 4 || hard >= 4) return Math.max(base, 0.5); } return base; }`. `applyRating` gains an optional `recent` field (array of last verdicts, newest first) and passes it through. Keep the signature backward-compatible (tests call without `recent`).
2. Blend: add after `seedLevelsFromDeck`:
   ```js
   // The deck is a rising floor: every word learned since the last rating still counts.
   // Ratings can lift the level above it and, when they say "too hard" repeatedly, pull
   // it under it — the floor sits 4 points below the deck estimate so that is possible.
   function fuseLevels(levels, cards) {
     const seed = seedLevelsFromDeck(cards);
     const rated = levels.rated || { listening: levels.listening, reading: levels.reading };
     return { ...levels, rated,
       listening: clamp100(Math.max(rated.listening, seed.listening - 4)),
       reading: clamp100(Math.max(rated.reading, seed.reading - 4)) };
   }
   ```
3. Load effect (L4558–4568): replace L4562 with `else o.levels = fuseLevels(o.levels, cards);` (keep the blank-state branch). Because `cards` may still be arriving from the cloud on first load (commit c476232 re-seeded for that reason), also re-run `fuseLevels` whenever `cards.length` changes materially: `useEffect(() => { if (st && cards.length) save((s0) => ({ ...s0, levels: fuseLevels(s0.levels, cards) })); }, [cards.length]);` — guard against loops (only `save` when a level actually changed by ≥ 0.05).
4. `rate()` (L4677–4698) and `logOffline` (L4707–4715): pass `recent: s0.history.filter(h => h.medium === med).map(h => h.verdict)` into `applyRating`; write the walk into `rated` and re-fuse: `levels: fuseLevels({ ...s0.levels, rated: { ...(s0.levels.rated||{listening:s0.levels.listening,reading:s0.levels.reading}), [med]: r.level }, updatedAt: Date.now() }, cards)`. Note: `applyRating` must receive `level: rated[med]` (the pure walk), not the fused value, or the floor double-counts.
5. Δlevel flash: in `rate()` after `save`, `flash(\`${med === "reading" ? "Reading" : "Listening"} ${before.toFixed(0)} → ${after.toFixed(0)}\`)` (`flash` exists L4581).
6. `mergeInput` (L990, L998): `levels` come wholesale from the newer side; `rated` rides inside `levels` — fine. Bump `v: 2` in `blankInput` (L4540) and treat `v < 2` as "derive `rated` from current levels" (step 2's fallback already does this).
7. Tests (`tools/test-input-engine.mjs` — extend the `grab` list with `fuseLevels`):
   - `learningRate(100)` ≥ 0.25; `learningRate(100, ["too_easy","too_easy","too_easy","too_easy","just_right"])` === 0.5; the existing "100th rating moves less than the 1st" still holds (0.25 < 1).
   - `fuseLevels({listening: 10, reading: 12}, deck821known)` → listening ≥ 25.5 − 4; with `rated.listening = 40` → 40.
   - Round trip: ratings of "too_hard" ×5 on a big deck pull the fused level down to the floor, never below it unless rated drops under `seed − 4`.

## Data migration / compatibility
`jpn101:input.levels` gains `rated` (derived lazily from existing values on first load). `v` bumps to 2; `mergeInput` unchanged. No new keys.

## Testing & verification
- `node tools/test-input-engine.mjs` (36 existing + new pass).
- Re-run `docs/8-22-2026-code-review/scripts/sim-input.mjs` scenarios: the "JPN101 mid (375 known)" and "all 821 known" decks now differ in level even after ratings exist.
- Manual: with an existing rated state, learn 50 new words → Input level bars move up on the next visit; rate "Too easy" 4× → the fifth moves noticeably more.
- Build + deploy.

## Acceptance criteria
- [ ] Deck growth raises the Input level after ratings exist (floor = `seed − 4`).
- [ ] Sustained hard/lost ratings can take the level below the floor; a too_easy restores it.
- [ ] `learningRate` floors at 0.25 and re-opens to 0.5 on one-sided recent verdicts.
- [ ] Δlevel is shown after each rating.
- [ ] Existing 36 input-engine tests still pass; new tests added.

## Pitfalls / notes
- `applyRating` is sliced into tests by text; keep the function self-contained (no new free variables besides `INPUT_VERDICTS`, `clamp100`, `evidenceWeight`, `learningRate`).
- TODO-113 changes the verdict weights — land both before re-tuning the `−4` margin; re-check with the sim.
- Rebuild `index.html` and deploy.
