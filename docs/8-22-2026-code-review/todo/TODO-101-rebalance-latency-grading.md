# TODO-101 — Re-balance latency→grade so *Easy* is not the modal grade; add an explicit "too easy / slow" override

**Priority:** P0   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §1 item 2(b), §4.2 "Latency → grade mapping", §5 item 2, §7 item 1(b); 05-expansion §2.3 (grading hardening); 01-functionality §2.4 (Write graded HARD almost always); 06-architecture F-19 (3 s/6 s duplicated)
**Depends on:** none   **Blocks:** TODO-106 (optimiser needs a sane grade distribution to fit)

## Why
`gradeFromLatency` maps every correct answer under 3 s to FSRS *Easy*. In FSRS-4 *Easy* carries an easy bonus `w[16] = 2.61` and first-review stability `w[3] = 5.8 d` because in the data the weights were fitted on, *Easy* is rare ("this review was a waste"). Here it is the majority correct grade (the author's own figure: 87 % of sub-3 s answers are correct, and sub-3 s is normal for a recognised word). Report 02 simulated with the real `review()`: a card answered fast at each due date goes **5.8 d → 46 d → 315 d → 1,846 d** — three quick recognitions and a word seen twice is scheduled almost a year out. GOOD at each step gives 2.4 → 8 → 24 → 65 → 161 d. The combo and the +2 level jump both reward speed; the concern is only the FSRS grade.

## Current behaviour (verified)
- `tools/fsrs.mjs` L144–150:
  ```js
  export function gradeFromLatency(correct, ms) {
    if (!correct) return AGAIN;
    if (!ms || ms <= 0) return GOOD;
    if (ms < 3000) return EASY;
    if (ms < 6000) return GOOD;
    return HARD;
  }
  ```
- Called from `recordResult` L1412 (`const grade = gradeFromLatency(got, t)`), `statReview` L2107 (Kana/Conj/Freq). `t` is sanity-clamped at L1393 (`ms > 250 && ms < 180000`).
- `tools/test-fsrs.mjs` "the 3s and 6s thresholds match this deck's own accuracy split" asserts `1500 → EASY`, `4500 → GOOD`, `9000 → HARD`; "faster answers schedule further out than slow ones" asserts `fast.ivl > slow.ivl`.
- Study grade buttons L2032–2033 are two: "Missed it" / "Got it"; keyboard L1764–1774 (→/Enter = got, ←/Backspace = missed). `thinkRef` is set on first flip (L1545–1550); a keyboard flip 300 ms after the card appears yields EASY even if the learner then thinks for 10 s before grading.
- Level deltas at L1405–1407/1437 (`fast` → +2) are separate from the FSRS grade; leave them.

## Intended behaviour
New mapping (keep two buttons as the default interaction; Easy becomes rare and earned):
```
correct, ms <= 0 (no timing)      → GOOD
correct, ms < 1500 AND streak >= 2 → EASY     // instant AND the card has a run: "this was a waste"
correct, ms < 4000                 → GOOD
correct, ms < 9000                 → GOOD     // (was HARD at 6–9 s) slow-but-right is still a success
correct, ms >= 9000                → HARD
wrong                              → AGAIN
```
Rationale: EASY requires both speed (< 1.5 s, i.e. genuinely automatic) and prior evidence (`streak >= 2`, the card's current consecutive-correct counter at L1422 `streak: got ? (c.streak||0)+1 : 0`). With this, the all-fast sequence becomes GOOD, GOOD, EASY(3rd), EASY… → approx 2.4 → 8 → 62 → 400 d (simulate before committing; see Testing) instead of 5.8 → 46 → 315 → 1,846 d. Moving HARD to ≥ 9 s matches `crawl` (≥ 10 s holds level, L1406) more closely than 6 s and stops handwriting (Write, see TODO-102) landing HARD on every card.
Also: measure think time to the grade press when the reveal came too soon: if `think < 700 ms` use `(gradeTime - shownTime)` instead — prevents keyboard-flip inflation.
Optional explicit override (cheap, opt-in, not required for acceptance): long-press/right-click "Got it" (or `↓` key) → force HARD; `Shift+→` → force EASY. Show the resulting grade letter for 600 ms in the live region (`liveRef` L2037) so the learner can see what was recorded.

## Implementation steps
1. `tools/fsrs.mjs` — replace `gradeFromLatency` with a signature that accepts context:
   ```js
   export const LATENCY = { EASY_MS: 1500, GOOD_MS: 9000, EASY_MIN_STREAK: 2 };
   /** correct:boolean, ms:number, ctx:{streak?:number, force?:1|2|3|4} */
   export function gradeFromLatency(correct, ms, ctx = {}) {
     if (ctx.force) return correct ? ctx.force : AGAIN;
     if (!correct) return AGAIN;
     if (!ms || ms <= 0) return GOOD;
     if (ms < LATENCY.EASY_MS && (ctx.streak || 0) >= LATENCY.EASY_MIN_STREAK) return EASY;
     if (ms < LATENCY.GOOD_MS) return GOOD;
     return HARD;
   }
   ```
   Update the header comment (L138–143) to explain why EASY is gated.
2. `JpnFlashcards.jsx` `recordResult` L1412: `const grade = gradeFromLatency(got, t, { streak: isProd ? (c.rstreak || 0) : (c.streak || 0), force });` — note `isProd` is declared at L1416, move the `const isProd = dir === "prod";` line above the grade line. Add a `force` argument to `recordResult(id, got, dir, ms, force)` (default undefined). (A separate `rstreak` does not exist today — production uses the shared `streak`; acceptable, or add `rstreak` alongside `rseen` in the prod branch at L1424–1430.)
3. `statReview` L2105–2108: `return fsrsReview(prior, gradeFromLatency(ok, ms, { streak: st && st.streak }), now, retentionTarget);` (Kana/Conj/Freq records all carry `streak`).
4. Study think-time fix: in `grade` (L1735–1761) compute
   ```js
   const flipThink = thinkRef.current || 0;
   const total = Date.now() - shownRef.current;
   const think = flipThink > 0 && flipThink < 700 ? total : flipThink;
   ```
   and pass `think` (not `thinkRef.current`) to `onResult` and to the combo test at L1742. Same pattern in Freq `grade` (L5475–5505) and ConjDrill (`thinkRef.current = Date.now() - shownRef.current` at L5128 is set on reveal — apply the same < 700 ms rule in `grade` L5066).
5. Optional override UI (Study only): add `onContextMenu`/long-press handlers on the "Got it" button that call `grade(true, 2 /*HARD*/)`, and keyboard `ArrowDown` → `grade(true, 2)`, `Shift+ArrowRight` → `grade(true, 4)`. Thread `force` through `grade(got, force)` → `onResult(c.id, got, dir, think, force)`. Write the recorded grade into `liveRef.current.textContent` (e.g. "Recorded: Good").
6. Update `tools/test-fsrs.mjs` (L~170–185):
   - replace the "3s and 6s thresholds" test with: `gradeFromLatency(true, 1200) === GOOD` (no streak), `gradeFromLatency(true, 1200, {streak: 2}) === EASY`, `gradeFromLatency(true, 4500) === GOOD`, `gradeFromLatency(true, 7000) === GOOD`, `gradeFromLatency(true, 9500) === HARD`, `gradeFromLatency(false, 500, {streak: 9}) === AGAIN`, `gradeFromLatency(true, 5000, {force: 2}) === HARD`.
   - keep "faster answers schedule further out" but give the fast one `{streak: 2}`.
   - add "a run of fast answers does not schedule a year out after three reviews": simulate as in the `docs/8-22-2026-code-review/scripts/sim-fsrs.mjs` with grades `[GOOD, GOOD, EASY]` (what the new mapping yields for three sub-1.5 s answers from a fresh card with streak 0→1→2) and assert the third `ivl` < 120 d.

## Data migration / compatibility
None. Stored `fsrs` states are unaffected; only future grades change. No new keys.

## Testing & verification
- `node tools/test-fsrs.mjs` → all pass with the updated assertions.
- Simulation (adapt `docs/8-22-2026-code-review/scripts/sim-fsrs.mjs`): print the S/ivl sequence for six sub-1.5 s correct answers under the new mapping; expect the 3rd interval in the tens of days, not 315 d.
- Manual: flip with Space instantly, wait 8 s, press → — the back should show (after TODO-107) "next in ~Nd" consistent with GOOD/HARD, not EASY. Check the combo still counts sub-3 s answers (unchanged).
- Build + deploy (`cd tools && node build.mjs`; `cd ../cf && npx wrangler deploy`).

## Acceptance criteria
- [ ] A fresh card answered correctly in 1 s three times in a row is scheduled < 120 d after the third review (was ≈ 315 d).
- [ ] EASY is only produced when `ms < 1500` and the item's `streak >= 2` (or on explicit override).
- [ ] A correct answer at 7 s is GOOD, at 9.5 s HARD.
- [ ] Think time for an instant keyboard flip is measured to the grade press.
- [ ] `test-fsrs.mjs` assertions updated and passing; header comment in `fsrs.mjs` explains the gate.
- [ ] Level deltas (`fast` → +2) and combo behaviour unchanged (not in scope).

## Pitfalls / notes
- `gradeFromLatency` is exported and also exercised by `test-fsrs.mjs` "a missing timing falls back to Good" — keep that branch first.
- Kana passes raw `think` without the 250 ms–180 s clamp (01 §6.4); apply the same clamp inside `statReview` callers or in `gradeFromLatency` (`if (ms > 180000) ms = 0`) — cheap and removes the "walked away → HARD" case.
- If TODO-106 (optimiser) later fits personal weights, the EASY gate stays; the optimiser fits to whatever grade stream exists.
- Rebuild `index.html` (committed artifact) and deploy the Worker so `cf/public` is refreshed.
