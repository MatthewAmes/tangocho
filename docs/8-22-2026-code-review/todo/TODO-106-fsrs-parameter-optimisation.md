# TODO-106 — FSRS parameter optimisation: `tools/fsrs-optimize.mjs` over the exported review log + `jpn101:fsrsParams` plumbing

**Priority:** P2   **Effort:** L   **Theme:** B — learning engine
**Source findings:** 05-expansion §2.2; 02-pedagogy §4.2 ("no optimizer run over the review log and no measurement of actual retention"), §5 item 2; 01-functionality §2.1 (FSRS-4 weights/curve verified)
**Depends on:** TODO-105 (review log), TODO-101 (sane grade distribution)   **Blocks:** none

## Why
`tools/fsrs.mjs` ships the FSRS-4 *default* 17 weights fitted on other people's data, under a grading scheme (latency → grade) unlike the one they were fitted on. Nothing measures whether predicted recall matches Matthew's observed recall. Once the review log exists, a per-learner fit is the standard FSRS workflow and a pragmatic optimiser is a few hundred lines. The payoff starts ~4–6 weeks after TODO-105 ships (a few thousand rows).

## Current behaviour (verified)
- `tools/fsrs.mjs`: `FSRS_W` L25–28 (17 weights); every function takes `w = FSRS_W` (L53, L56, L61, L67, L81, L94, L123); `retrievability(t,S) = (1 + t/(9S))^-1` (L43–46); `intervalFor` L49–51; `review()` L94–116.
- App calls `fsrsReview(prior, grade, Date.now(), retentionTarget)` (L1418) and `statReview` (L2105–2108) without a `w` argument → defaults.
- No review-level data exists yet (TODO-105 adds `[deck,itemId,dir,ts,grade,ms,S0,D0,R0,relearn]` rows).

## Intended behaviour
- `node tools/fsrs-optimize.mjs <revlog.csv|json> [--deck class] [--dir rec] [--out params.json]` reads an exported log, rebuilds each item's review sequence, and fits the 17 weights by minimising **log-loss of predicted retrievability against observed recall** (recall = grade ≥ 2 i.e. not AGAIN) over all non-first, non-relearn reviews. This is exactly the loss the open-spaced-repetition optimiser minimises; what this pragmatic version approximates is the *optimisation method* (coordinate-descent / finite-difference gradient descent with clamped ranges, instead of PyTorch Adam with the full training recipe) and it omits the optimiser's pre-processing (outlier filtering, same-day review handling, weight regularisation). State it in the script header.
- Output: `{ v: 1, w: number[17], n: <reviews used>, items: <n>, logloss_before, logloss_after, calibration: [[bucketR, observedRecall, n]...], fittedAt }`. Refuse to emit weights if `n < 1000` reviews or if `logloss_after` is not better than `logloss_before` by ≥ 1 %.
- Client: `jpn101:fsrsParams` (JSON above) → when present and `v === 1` and `w.length === 17`, pass `w` to `fsrsReview`/`seedFromHistory`/`statReview`; Study setup shows "Schedule personalised on N reviews" under the retention chips. Loaded by pasting the JSON into Browse › Restore (a `tangocho-params` pack type) — no server round-trip needed.

## Implementation steps
1. `tools/fsrs-optimize.mjs` (new; ESM, imports from `./fsrs.mjs`):
   - Parse CSV (header from TODO-105: `deck,item,dir,ts,iso,grade,ms,S0,D0,R0,relearn`) or the raw JSON array.
   - Group by `(deck,item,dir)`, sort by `ts`, drop `relearn=1` rows. Replay each sequence with `review(state, grade, ts, 0.9, w)` to get the *model's* S before each review; elapsed `t = (ts − prev.ts)/86400000`; predicted `p = retrievability(t, S_prev)`; observed `y = grade >= 2 ? 1 : 0`. Loss = −mean(y·ln p + (1−y)·ln(1−p)) with p clamped to [1e-4, 1−1e-4]. Skip the first review of each item (no prediction).
   - Fit: start from `FSRS_W`; for each of ~200 epochs, for each weight i, evaluate loss at `w[i]·(1±step)` and move to the better one (step 5 % decaying to 0.5 %); clamp each weight to the ranges used by the reference optimiser — `w0..w3 ∈ [0.1, 100]` (initial stabilities, keep ordered), `w4 ∈ [1,10]`, `w5,w6 ∈ [0.1,4]`, `w7 ∈ [0,0.75]`, `w8 ∈ [0,4]`, `w9 ∈ [0,0.8]`, `w10 ∈ [0.01,3]`, `w11 ∈ [0.5,5]`, `w12 ∈ [0.01,0.2]`, `w13 ∈ [0.01,0.9]`, `w14 ∈ [0.01,3]`, `w15 ∈ [0,1]`, `w16 ∈ [1,6]` (if unsure of a bound, say "verify against the open-spaced-repetition optimizer's clamp table" in the header; these are the FSRS-4.5 era defaults).
   - Calibration table: bucket predicted p into deciles, print observed recall and n per bucket before/after.
   - Guard rails above; write JSON to `--out` (default `tools/.fsrs-params.json`, gitignored) and print a one-screen summary.
2. `tools/test-fsrs-optimize.mjs`: synthesise a log from `review()` with a known perturbed weight vector (e.g. `w[3] = 3.0`, `w[16] = 1.5`) and Bernoulli outcomes drawn from the true `retrievability`; assert the fitted loss < default loss and that `w[16]` moves toward 1.5 (direction only — this is a weak optimiser).
3. Client plumbing in `JpnFlashcards.jsx`:
   - After `retentionTarget` (L1194–1202) add `let fsrsW = null; try { const p = JSON.parse(localStorage.getItem("jpn101:fsrsParams")||"null"); if (p && p.v === 1 && Array.isArray(p.w) && p.w.length === 17) fsrsW = p; } catch (e) {}` and a `currentW = () => (fsrsW ? fsrsW.w : undefined)`.
   - L1418 `fsrsReview(prior, grade, Date.now(), retentionTarget, currentW())`; `statReview` L2107 same; `seedFromHistory(c)` calls (L1417, L2068, L2089, L2113, L1635, L2135, L5441-after-TODO-108) pass `currentW()` as the 2nd arg — or wrap once: `const seedHist = (c) => seedFromHistory(c, currentW());` and replace call sites.
   - Browse `doRestore` (L3856+): accept `{app:"tangocho-params", v:1, w:[…]}` → validate → `sSet("jpn101:fsrsParams", …)`; set `fsrsW` in memory.
   - Study setup (below the retention block L1849–1863): `{fsrsW && <p className="tc-smarthint">Schedule personalised on {fsrsW.n} reviews.</p>}`.
4. Document the workflow in `tools/REFRESH-VIDEO-INDEX.md`'s sibling `tools/FSRS-OPTIMIZE.md` (short): export CSV from Browse → run script → paste output into Restore.
5. Optional (later, separate decision): upgrade the curve to FSRS-5/6 (`R = (1 + FACTOR·t/S)^DECAY`) — *do not* mix with this item; weights and curve must move together and `test-fsrs.mjs` asserts the v4 curve.

## Data migration / compatibility
New key `jpn101:fsrsParams` (small JSON). It is swept into the snapshot by `collectLocalSnapshot` and merged "newer snapshot wins" — acceptable (a single learner's params). Existing `fsrs` states remain valid; only future `review()` calls use the new weights (FSRS states are weight-agnostic by design: S/D are the state, w drives transitions).

## Testing & verification
- `node tools/test-fsrs-optimize.mjs` passes; `node tools/test-fsrs.mjs` unchanged.
- Dry run on a synthetic 5k-row log completes in < 30 s.
- Real run once ≥ 1,000 logged reviews exist: script prints `logloss_before/after` and calibration; paste params; Study setup shows the personalised line; a card's next-interval (TODO-107) changes vs defaults.
- Build + deploy.

## Acceptance criteria
- [ ] `tools/fsrs-optimize.mjs` reads the TODO-105 export, fits 17 weights by log-loss, prints calibration, and refuses to emit on insufficient data or no improvement.
- [ ] Script header states what is approximated vs the reference optimiser.
- [ ] `jpn101:fsrsParams` is honoured by every `review`/`seedFromHistory`/`statReview` call.
- [ ] Restore accepts a `tangocho-params` pack; Study shows "personalised on N reviews".
- [ ] Synthetic-log test recovers the direction of a perturbed weight.

## Pitfalls / notes
- Under latency grading, Hard/Good/Easy are not self-reports; the optimiser fits to whatever the app emitted — that is fine, but it means TODO-101 should land well before the first fit so the log is not dominated by EASY.
- Log-loss on R uses the *model's replayed* S (not the logged `S0`), so a weight change propagates through the sequence — that is the correct FSRS loss; `S0/D0/R0` in the log are for diagnostics only.
- Keep `tools/.fsrs-params.json` out of git (`.gitignore`).
- Rebuild `index.html` and deploy.
