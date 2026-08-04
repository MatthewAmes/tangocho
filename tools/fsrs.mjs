/* FSRS — Free Spaced Repetition Scheduler, the DSR (Difficulty / Stability / Retrievability)
   model that replaced SM-2 as the state of the art and now ships as Anki's default scheduler.
   Formulas and default weights from the open-spaced-repetition project's algorithm wiki.

   Why this instead of the fixed interval ladder the app had:

   SM-2 style scheduling multiplies a per-card ease by a fixed ladder (1d, 3d, 7d, 16d…).
   It has no model of *how likely you are to remember the card right now*, so it cannot
   aim at a retention target, cannot tell a card you barely scraped from one you knew
   instantly, and cannot recover sensibly from a lapse. FSRS models three quantities:

     Stability (S)      days until recall probability falls to 90%. Memory strength.
     Difficulty (D)     1-10, how much this particular item resists gaining stability.
     Retrievability (R) probability you'd recall it right now, given S and elapsed time.

   The scheduler then asks the only question that matters: how long until R decays to the
   retention level we're aiming for? That's the interval. Reviews land when a card is
   *about* to be forgotten, which is exactly when a successful retrieval buys the most
   stability — the desirable-difficulty result from Bjork's work, made quantitative.

   Grades are the standard four: 1 Again, 2 Hard, 3 Good, 4 Easy.
*/

// FSRS-4 default weights. Seventeen parameters, fitted across millions of reviews.
export const FSRS_W = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49,
  0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
];

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

// A failed card comes back in ten minutes — inside the same session, while the correct
// answer is still fresh enough for the retrieval to succeed and rebuild stability.
const RELEARN_DAYS = 10 / 1440;
// Ten years. Beyond this the number is theatre: nobody schedules a flashcard for 2126,
// and letting it run to the stability clamp produced century-long intervals.
const MAX_INTERVAL = 3650;

const clampD = (d) => Math.min(10, Math.max(1, d));
const clampS = (s) => Math.min(36500, Math.max(0.01, s));

/** Probability of recalling a card t days after its last review, given stability S. */
export function retrievability(t, S) {
  if (!(S > 0)) return 0;
  return Math.pow(1 + t / (9 * S), -1);
}

/** Days until retrievability decays to `target` (0.9 = the classic 90% retention aim). */
export function intervalFor(S, target = 0.9) {
  return (9 * S) * (1 / target - 1);
}

export function initialStability(grade, w = FSRS_W) {
  return clampS(w[grade - 1]);
}
export function initialDifficulty(grade, w = FSRS_W) {
  return clampD(w[4] - (grade - 3) * w[5]);
}

/** Difficulty drifts toward the "Good" baseline — mean reversion stops it ratcheting up. */
export function nextDifficulty(D, grade, w = FSRS_W) {
  const afterGrade = D - w[6] * (grade - 3);
  return clampD(w[7] * initialDifficulty(GOOD, w) + (1 - w[7]) * afterGrade);
}

/** Stability after a successful recall. Grows most when D is low and R was already low. */
export function stabilityAfterRecall(D, S, R, grade, w = FSRS_W) {
  const hardPenalty = grade === HARD ? w[15] : 1;
  const easyBonus = grade === EASY ? w[16] : 1;
  const inc =
    Math.exp(w[8]) *
    (11 - D) *
    Math.pow(S, -w[9]) *
    (Math.exp(w[10] * (1 - R)) - 1) *
    hardPenalty *
    easyBonus;
  return clampS(S * (1 + inc));
}

/** Stability after a lapse. Deliberately not zero — a forgotten card is not a new card. */
export function stabilityAfterLapse(D, S, R, w = FSRS_W) {
  return clampS(
    w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R)),
  );
}

/**
 * Advance a card's memory state by one review.
 * @param {{S:number,D:number,last:number}|null} state  null for a card never reviewed
 * @param {number} grade 1..4
 * @param {number} now   ms timestamp
 * @param {number} target desired retention, 0.7..0.97
 */
export function review(state, grade, now = Date.now(), target = 0.9, w = FSRS_W) {
  let S, D;
  if (!state || !(state.S > 0)) {
    S = initialStability(grade, w);
    D = initialDifficulty(grade, w);
  } else {
    const days = Math.max(0, (now - (state.last || now)) / 86400000);
    const R = retrievability(days, state.S);
    D = nextDifficulty(state.D, grade, w);
    S = grade === AGAIN
      ? stabilityAfterLapse(D, state.S, R, w)
      : stabilityAfterRecall(D, state.S, R, grade, w);
  }
  /* A lapsed card goes into relearning rather than straight back onto the curve.
     Taking the computed interval here would put a word you just failed 3-4 days out,
     because post-lapse stability is deliberately not zero — that stability is the right
     input for the NEXT successful review, but it is the wrong thing to wait on now.
     Anki/FSRS split these too: short learning steps first, schedule afterwards. */
  const ivl = grade === AGAIN
    ? RELEARN_DAYS
    : Math.min(MAX_INTERVAL, Math.max(1, intervalFor(S, target)));
  return { S, D, last: now, due: now + ivl * 86400000, ivl, relearning: grade === AGAIN };
}

/* ── seeding an existing deck ──
   Cards already carry seen/correct/level/last from the old scheduler. Throwing that away
   would restart 500 studied words from scratch; inventing a stability out of thin air
   would schedule them wrongly. So: derive a plausible S from how well the card has
   actually gone, and a D from its accuracy, then let real reviews correct it. */
export function seedFromHistory(card, w = FSRS_W) {
  const seen = card.seen || 0;
  if (seen <= 0) return null;
  const acc = (card.correct || 0) / seen;
  const lvl = Math.min(5, card.level || 0);

  // Level was the old strength signal; accuracy modulates it. A card at level 3 with 100%
  // is genuinely stronger than one at level 3 that has been missed half the time.
  const base = [0.5, 1, 2.5, 6, 14, 30][lvl];
  const S = clampS(base * (0.45 + acc) * (card.ease || 1));
  // Difficulty runs opposite to accuracy: 100% -> ~4, 0% -> ~9.
  const D = clampD(9 - acc * 5);
  return { S, D, last: card.last || Date.now(), due: (card.last || Date.now()) + intervalFor(S) * 86400000, ivl: intervalFor(S) };
}

/* ── auto-grading from response latency ──
   FSRS wants four grades, but asking a tired student to self-assess on a four-point scale
   every card is exactly the kind of friction that ends streaks — and self-assessment is
   unreliable anyway. This deck's own data settles it: answers under 3 seconds are 87%
   correct and answers over 6 seconds are 71% correct, so latency already carries the
   signal a Hard/Good/Easy button is trying to elicit. Two buttons in, four grades out. */
export function gradeFromLatency(correct, ms) {
  if (!correct) return AGAIN;
  if (!ms || ms <= 0) return GOOD;
  if (ms < 3000) return EASY;
  if (ms < 6000) return GOOD;
  return HARD;
}
