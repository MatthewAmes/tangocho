# TODO-113 — Input verdict weights: make "Just right" ≈ 0 so the steady state is comprehension, not one-third "Hard"

**Priority:** P1   **Effort:** XS   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §4.1 ("'Just right' is an unconditional ratchet upward"), §6 row 3, §7 item 2; 05-expansion §3.3
**Depends on:** none (pairs with TODO-112)   **Blocks:** none

## Why
`just_right` adds **+1** to the level unconditionally. A learner who honestly reports "just right" every time climbs 14 → 25 after 10 ratings, → 35 after 25, → 50 after 100 (report 02 sim with a 60/30/10 just_right/too_easy/too_hard mix). With no too_easy, the only equilibrium is **one third of sessions rated Hard** (−2 vs +1). Comprehensible-input practice wants the learner mostly at ~90 %+ comprehension with occasional stretch — the asymmetry points the wrong way. A +1 nudge is defensible as i+1, but not at that magnitude relative to Hard.

## Current behaviour (verified)
- L4333–4338:
  ```js
  const INPUT_VERDICTS = {
    too_easy:   { user: +4, item: -3, en: "Too easy",   ja: "簡単すぎ" },
    just_right: { user: +1, item: null, en: "Just right", ja: "ちょうどいい" },
    too_hard:   { user: -2, item: +3, en: "Hard",       ja: "難しい" },
    lost:       { user: -4, item: +6, en: "Lost me",    ja: "わからなかった" },
  };
  ```
- `applyRating` L4345–4362: `nextLevel = clamp100(level + v.user * w)`; `just_right` pulls the item toward the user (`v.item === null`, L4354).
- Tag scores bump `just_right` by +1 (L4686) — that is a *preference* signal, separate; leave it.
- Test "just_right nudges the user up and pulls the item toward them" asserts `r.level > 40` after just_right.

## Intended behaviour
- `just_right.user = +0.25` — a gentle i+1 drift (a learner at "just right" for 20 sessions moves +5 at most before the learning-rate floor), and additionally **conditional**: the drift applies only when the item's difficulty is ≥ the user's level (i.e. "just right" on something *above* you is evidence you've grown; "just right" on something *below* you is not). With the (unchanged) `too_easy +4`, ascent is driven by "too easy", and equilibrium under the 60/30/10 mix sits where `0.6·0.25 + 0.3·4 ≈ 0.1·2` per rating is no longer true — i.e. the learner must actually find things too easy to climb. Keep `too_hard −2`, `lost −4`.
- Update the on-screen hint so the learner knows "Too easy" is how you level up: under the verdict chips (L4782–4786) add a one-line `tc-smarthint`: "Tap **Too easy** when it was — that's what moves you up."

## Implementation steps
1. L4335 → `just_right: { user: +0.25, item: null, en: "Just right", ja: "ちょうどいい" },`.
2. `applyRating` (L4349): `const drift = verdict === "just_right" && itemDifficulty < level ? 0 : v.user; const nextLevel = clamp100(level + drift * w);` (keep the pure-function shape; `itemDifficulty` is already a parameter).
3. Hint line in the pending-rating card (after L4786).
4. Tests (`tools/test-input-engine.mjs`): change "just_right nudges the user up…" to: `level 40, item 20 → level === 40` (no drift below you); `level 40, item 45 → level > 40 && level < 40.5`; keep the item-pull assertions. Add "sustained just_right does not run away": 100 just_right ratings on items at `level+2` from 14 end < 24.
5. Re-run `docs/8-22-2026-code-review/scripts/sim-input.mjs` "Level dynamics" block (or port it into the test) to document the new trajectory in the commit body.

## Data migration / compatibility
None.

## Testing & verification
- `node tools/test-input-engine.mjs`.
- Sim: 60/30/10 mix from 14.4 over 100 ratings ends well under 50 (expect ~30 with the too_easy share still driving ascent).
- Build + deploy.

## Acceptance criteria
- [ ] `just_right` drifts ≤ +0.25·w and only for items at or above the user's level.
- [ ] 100 consecutive just_right ratings move the level by < 10 points.
- [ ] Hint tells the learner that "Too easy" is the lever.

## Pitfalls / notes
- Do not touch `item` handling for just_right (pull toward user) — that is what lets item difficulty calibrate.
- TODO-112's `recent`-based learning-rate re-open treats just_right as neutral; consistent.
- Rebuild `index.html` and deploy.
