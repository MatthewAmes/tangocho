# TODO-103 — Feed only the first grade of a card per session into FSRS; treat in-session requeues as relearning steps

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 01-functionality §2.3 (LOW, "In-session requeues are full FSRS reviews"); 02-pedagogy §4.2 ("10-minute relearning step not honoured"); 06-architecture §4.4 (session bookkeeping duplicated ×3)
**Depends on:** TODO-100 (dueness must honour `due`/relearning first)   **Blocks:** none

## Why
A missed card is re-inserted into the same session up to 3× (Study), 2× (Kana), 2× (Conj), 3× (Freq). Each pass calls `onResult` → `fsrsReview`, so a card missed three times in one sitting is hit by the lapse formula three times: report 01 measured S 20 → 3.60 → 1.33 → 0.65 and D 5 → 6.70 → 8.39 → 10.00 (clamped). Anki/FSRS do not apply the lapse formula to failures inside the relearning steps; they apply one lapse and then short learning steps. Saturating D at 10 after one bad session permanently depresses future stability growth for that card (`(11 − D)` factor in `stabilityAfterRecall`, fsrs.mjs L72). Conversely, the quick correct answer that follows a requeue (R≈1 because elapsed≈0) adds nothing, so the state after the session is whatever the last lapse left.

## Current behaviour (verified)
- Study `grade` L1735–1761: every call does `onResult(c.id, got, …)` (L1746); on miss, `missRef.current[c.id]++` and requeue if `m <= REQUEUE_CAP` (L1753–1757, `REQUEUE_GAP = 3, REQUEUE_CAP = 3` L1551).
- Kana `record` L2713–2742: `fsrs: statReview(s0, got, think, Date.now())` every pass; requeue L2736–2738 (`KANA_REQUEUE_GAP = 3, KANA_REQUEUE_CAP = 2` L2572).
- ConjDrill `grade` L5066–5087: same, requeue cap 2 at L5084.
- Freq `grade` L5475–5505: `fsrs: statReview(x, got, t, Date.now())` every pass; requeue cap 3 at L5501 (inserts `{...c, seen: 1}` copy).
- `fsrs.mjs` `review()` L94–116: `grade === AGAIN` → `ivl = RELEARN_DAYS` (10 min), `relearning: true`; a same-day success has R≈1 → recall growth ≈ 0 (L100–105).

## Intended behaviour
Per session, per item, only the **first** grade is applied to the FSRS state (`fsrs`/`rfsrs`/stat `fsrs`). Subsequent passes in the same session:
- still update the legacy counters (`seen/correct/streak/ms`) and the session bookkeeping (passed/firstTry/struggled/combo) as today, so accuracy stats and the done-screen stay honest;
- on a **correct** requeue pass, clear `relearning` and move `due` to `now + max(1 d, intervalFor(S, target))` — the card graduated the relearning step (FSRS-style), using the post-lapse S already stored;
- on a **wrong** requeue pass, do not touch S/D; keep `due = now + 10 min`, `relearning: true`.
This matches "one lapse per session, then learning steps".

## Implementation steps
1. Add a small helper near `dueness` (L2086) in `JpnFlashcards.jsx`:
   ```js
   /* In-session requeue passes are relearning steps, not new reviews. FSRS applies ONE
      lapse; the 10-minute retries either graduate the card (success → back onto the curve
      with the post-lapse S) or hold it (fail → another 10 minutes). Without this, three
      misses in one sitting ran the lapse formula three times and pinned D at 10. */
   function relearnStep(st, got, now, target = retentionTarget) {
     if (!st || !(st.S > 0)) return st;
     if (got) {
       const ivl = Math.min(3650, Math.max(1, intervalFor(st.S, target)));
       return { ...st, last: now, due: now + ivl * 86400000, ivl, relearning: false };
     }
     return { ...st, last: now, due: now + 10 * 60000, ivl: 10 / 1440, relearning: true };
   }
   ```
2. `recordResult` (L1392–1443): add a 6th param `firstPass = true`. At L1418 replace
   `const nextState = fsrsReview(prior, grade, Date.now(), retentionTarget);` with
   ```js
   const nextState = firstPass ? fsrsReview(prior, grade, Date.now(), retentionTarget)
                               : relearnStep(prior, got, Date.now());
   ```
   Keep the legacy counter updates unconditional.
3. Study `grade` L1746: `onResult(c.id, got, dir, think, force, !missRef.current[c.id])` — note `missRef.current[c.id]` is incremented *after* this call on a miss (L1753–1754), so at call time it is falsy on the first pass and truthy on requeue passes. Verify ordering when editing.
4. Kana L2722: `fsrs: missRef.current[cur.id] ? relearnStep(s0.fsrs, got, Date.now()) : statReview(s0, got, think, Date.now())`. Same for Conj L5072 and Freq L5487 (Freq's `missRef.current[c.id]` exists L5398; note the requeued copy has `seen: 1` — read `missRef`, not `seen`).
5. Because `relearnStep` for a correct pass sets `due` from the post-lapse S, a card missed then recovered in-session leaves the session with `due ≈ now + intervalFor(S_lapse)` (e.g. S 20 → 3.6 d → due in ~3.6 d), which is what FSRS intends.
6. Tests (slice `relearnStep` with the `grab()` pattern or move it to `tools/fsrs.mjs` and export it — preferred, since `review()` is the sibling): in `tools/test-fsrs.mjs` add
   - `relearnStep({S:3.6,D:6.7,last:t0,due:t0+10min,relearning:true}, true, t0+10min)` → `relearning === false`, `due ≈ t0 + 10min + 3.6·9·(1/0.9−1)` days (≈ 3.6 d) — use `near`.
   - `relearnStep(st, false, now)` → `due === now + 600000`, S/D unchanged.
   - Integration: `review(S20, AGAIN)` once then `relearnStep` ×2 keeps `D` at the single-lapse value (≈ 6.7, not 10).

## Data migration / compatibility
None. No new keys.

## Testing & verification
- `node tools/test-fsrs.mjs`.
- Manual: in a Study session miss the same card three times then get it; after the session, inspect the card in localStorage: `fsrs.D` ≈ 6.7 (one lapse), `relearning: false`, `due` a few days out. Before this change D was 10.
- Build + deploy.

## Acceptance criteria
- [ ] Missing a card N times in one session applies the FSRS lapse exactly once.
- [ ] A correct requeue pass sets `relearning: false` and a `due` ≥ 1 day out; a wrong requeue pass keeps `due = now + 10 min`.
- [ ] Legacy counters and session bookkeeping unchanged (done screen % identical to before).
- [ ] Applies to Study, Kana, Conj, Freq.

## Pitfalls / notes
- `recordResult`'s parameter list grows (id, got, dir, ms, force, firstPass); keep the order stable with TODO-101 (`force` is 5th). If TODO-101 is not done, put `firstPass` 5th and adjust.
- Study also requeues **production** cards; `relearnStep` on `rfsrs` is the same logic (`prior` already selects the direction at L1417).
- `05-expansion §2.9` proposes a shared `useSession` hook; this TODO touches the same four places and is a natural precursor — do not block on it.
- Rebuild `index.html` and deploy.
