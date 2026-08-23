# TODO-100 — Make `dueness()` schedule from FSRS `due`, the retention target and the relearning step

**Priority:** P0   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 01-functionality §2.2 (MEDIUM, "dueness() ignores due/relearning/retention"); 02-pedagogy §4.2 + §7 item 1(a); 05-expansion QW-15; 06-architecture §7.2 (scheduling helpers untested)
**Depends on:** none   **Blocks:** TODO-107 (card-back forecast must agree with what is served), TODO-110 (catch-up mode relies on a truthful due count)

## Why
The app computes a real FSRS `due` timestamp for every review (`fsrsReview(prior, grade, Date.now(), retentionTarget)` at L1418) and then never reads it for recognition scheduling. `dueness()` recomputes "due" from stability with a hard-coded 0.9 target, so (a) the "Aim to remember 85/90/95%" control changes stability evolution slightly but never changes *when* a card is offered, (b) a lapsed card whose `due` is 10 minutes out is not offered again for `intervalFor(S_lapse)` days (report 01 measured: S=20,D=5 lapse → FSRS says 0.007 d, `dueness` says 3.60 d; S=10 lapse → 2.5 d), and (c) a new card graded GOOD at target 0.95 is due in 1.14 d by FSRS but offered at 2.40 d. The forecast "week" counter at L1636 uses `st.due` while `fading` uses 0.9 — two clocks on one screen. Report 02 Appendix A: at 0.85 FSRS says 15.9 d, app offers at 10.0 d; at 0.95 FSRS says 4.7 d, app still waits 10.0 d.

## Current behaviour (verified)
- `JpnFlashcards.jsx` L2086–2097:
  ```js
  function dueness(c, now) {
    const seen = c.seen || 0;
    if (seen === 0) return 0;
    const st = c.fsrs || seedFromHistory(c);
    if (st && st.S > 0) {
      const elapsed = (now - (st.last || 0)) / 86400000;
      const target = intervalFor(st.S, 0.9);
      return target > 0 ? elapsed / target : 0;
    }
    const interval = REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1);   // pre-FSRS fallback
    return (now - (c.last || 0)) / interval;
  }
  ```
- Consumers: `smartPool` L1575–1578 (`dueness(c, now) >= 1` and sort by dueness), `dueCount` L1606–1609, `needScore` L2145 (`overdue = Math.min(3, Math.max(0, dueness(c, now)))`), Freq `stats.due` L5446 and `start` L5465.
- `retentionTarget` is a module variable (L1194–1202), set from the chips at L1852–1854 via `setRetention`.
- `tools/fsrs.mjs` `review()` L94–116 returns `{S, D, last, due, ivl, relearning}`; `seedFromHistory()` L123–136 returns `{S, D, last, due, ivl}` computed with the *default* target (`intervalFor(S)` → 0.9).
- `statNeed` (L2110–2119) for Kana/Conj/Freq ordering uses `1 - retrievability(...)` — not the target — but is an ordering score, not a due test; leave it.

## Intended behaviour
- A card is due when `now >= st.due`. `dueness` returns a ratio ≥ 1 when due, proportional to overdue-ness so the existing "most overdue first" sort still works: `dueness = (now - st.last) / max(ε, st.due - st.last)`.
- A card in relearning (`st.relearning === true`, i.e. last grade was AGAIN) is due as soon as `now >= st.due` (10 min) and must be treated as due in the *next* session even if that is days later (it will be, because `due` is in the past).
- When `st.due` is missing (legacy `fsrs` objects written before `due` existed, or seeded state), compute it from `intervalFor(st.S, retentionTarget)` — i.e. the *current* target, not 0.9.
- Changing the retention chip immediately changes `dueCount` (95% → more due, 85% → fewer), because seeded/legacy cards recompute from the target and reviewed cards already carry a target-derived `due`. Cards reviewed under an older target keep their stored `due` until their next review (acceptable; document).
- Pre-FSRS fallback (`REVIEW_INTERVALS`) branch is unreachable in practice (every seen card gets `seedFromHistory`), keep it but behind the FSRS branch as today.

## Implementation steps
1. In `JpnFlashcards.jsx` replace the body of `dueness` (L2086–2097):
   ```js
   function dueness(c, now) {
     const seen = c.seen || 0;
     if (seen === 0) return 0;
     const st = c.fsrs || seedFromHistory(c);
     if (st && st.S > 0) {
       const last = st.last || 0;
       // Prefer the due the memory model actually wrote (it already honours the
       // retention target and the 10-minute relearning step). Fall back to recomputing
       // from S with the CURRENT target for seeded/legacy states that carry no due.
       const due = st.due > last ? st.due : last + Math.max(1, intervalFor(st.S, retentionTarget)) * 86400000;
       const span = Math.max(60000, due - last);           // never divide by ~0 (relearning = 10 min)
       return (now - last) / span;
     }
     const interval = REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1);   // pre-FSRS fallback
     return (now - (c.last || 0)) / interval;
   }
   ```
   Note `Math.max(1, …)` mirrors `review()`'s 1-day floor (fsrs.mjs L114) so a seeded HARD card is not "due" at 0.6 d.
2. `seedFromHistory` in `tools/fsrs.mjs` L135 computes `due` with the default target. Add an optional `target` parameter: `export function seedFromHistory(card, w = FSRS_W, target = 0.9)` and use `intervalFor(S, target)` for `due`/`ivl`. In the JSX, the call sites that matter for *scheduling* (`dueness`, `recallUnlocked` L2068, `forecast` L1635, `recallChance` L2135, `prodDue`) can keep calling `seedFromHistory(c)` because step 1 recomputes `due` from the current target whenever `st.due` is absent/≤ last — but to be explicit pass the target in `dueness`: `const st = c.fsrs || seedFromHistory(c, undefined, retentionTarget);`.
3. `forecast` (L1626–1639): change `fading` to use the retention target so "fading" and "due" mean the same thing: `if (r < retentionTarget) fading++; else solid++;` and keep `week` on `st.due` (after step 1 the two agree).
4. Freq `stats.due` (L5446) and `start` (L5465) need no change — they call `dueness`. Same for `smartPool`/`dueCount`.
5. Add a comment above `dueness` stating the contract: "`due` is the scheduler's truth; `dueness ≥ 1` ⇔ `now ≥ due`". Add `retentionTarget` to the rationale text at L1857–1861 only if the copy needs to change (it already claims the behaviour this TODO delivers).
6. Tests: `tools/fsrs.mjs` is importable; `dueness` is not. Follow `tools/test-input-engine.mjs`'s `grab("dueness", "function")` pattern in a new `tools/test-schedule.mjs` (or add to test-fsrs.mjs by slicing) and stub `seedFromHistory`, `intervalFor`, `REVIEW_INTERVALS`, `effLevel`, `retentionTarget` in the evaluated module text. Assertions:
   - `{seen:1, fsrs:{S:20,D:5,last:t0,due:t0+10min,relearning:true}}` → `dueness(c, t0+11min) >= 1` and `dueness(c, t0+5min) < 1`.
   - `{seen:1, fsrs:{S:10,D:5,last:t0,due:t0+4.7d}}` → due at t0+4.7 d, not at t0+10 d.
   - Seeded (no `due`): with `retentionTarget=0.95` the card is due earlier than with 0.85 (compute both by re-evaluating the slice with a different `let retentionTarget = …` prelude).
   - Relearning span floor: `due - last = 10 min` does not produce Infinity/NaN.

## Data migration / compatibility
None. `fsrs.due` already exists on every card reviewed since commit 22cf183; cards with older `fsrs` objects (no `due`) are handled by the fallback branch. No new storage keys; `mergeSnapshots` (L1008–1021) unchanged.

## Testing & verification
- `node tools/test-fsrs.mjs` (32 pass, unchanged) and the new `node tools/test-schedule.mjs`.
- Re-run the report's simulation: `node docs/8-22-2026-code-review/scripts/sim-fsrs.mjs` — the "dueness() (fixed 0.9) says due at" lines document the old gap; after the change the app's due moment equals `review().ivl`.
- Manual: on a deck with ~100 studied cards, note `dueCount` on the Study home, tap 95% → count rises; tap 85% → count falls. Miss a card as the last card of a session, finish, return to Study home: `dueCount` includes it immediately and Smart Review serves it first.
- Build + deploy: `cd tools && npm install && node build.mjs`, then `cd ../cf && npx wrangler deploy`.

## Acceptance criteria
- [ ] `dueness(c, now) >= 1` exactly when `now >= (c.fsrs.due)` for any card with a stored `due`.
- [ ] A card graded AGAIN is due again 10 minutes later and shows in `dueCount` in the next session.
- [ ] Switching the retention chip changes `dueCount` on the Study home without any review taking place.
- [ ] `forecast.fading` and `dueCount` agree (fading ≥ due, and equal when no card is in relearning).
- [ ] New unit tests cover relearning, stored-due, seeded-with-target, and span floor.
- [ ] `node tools/test-fsrs.mjs` still passes; `index.html` rebuilt and committed.

## Pitfalls / notes
- `retentionTarget` is read at module load (L1195–1198) and mutated by `setRetention` (TODO-018 re-reads it after a cloud pull); `dueness` reads the live variable, so no extra plumbing is needed — but `smartPool`/`dueCount` are `useMemo` on `[cards]` (L1571, L1606) and will NOT recompute when only the chip changes. Add `retention` (the `useState` at L1622) to those dependency arrays, or bump a `retentionVersion` state. Without this the acceptance criterion "chip changes dueCount" fails silently.
- Do not change `statNeed` (mini-decks ordering) or `needScore` semantics beyond their use of `dueness`.
- TODO-103 (first-grade-only into FSRS) changes what `due` a requeued card ends a session with; implement 100 first, 103 second.
- `index.html` is a committed build artifact — rebuild and commit it with the source change.
