/* Everything that decides what a card is worth and when it comes back. Pure given the retention target, which is a holder object rather than a bare module let: the target is a setting the learner changes and another device can push, so the value has to stay live — an imported binding cannot be reassigned, but a property on an imported object can. */

import { review as fsrsReview, retrievability, seedFromHistory, intervalFor,
         gradeFromLatency, AGAIN, HARD, GOOD, EASY } from "../../tools/fsrs.mjs";
import { latencyNorms, latencyVerdict } from "../../tools/learner.mjs";

/* The desired probability of recall at review time. A holder rather than a bare export:
   setRetention writes it when the learner moves the slider, and a pull from another
   device writes it again, so every reader has to see the current value. An ESM import is
   an immutable binding — `retention.target = x` across a module boundary is a build error —
   but a property on an imported object is not, and that is the whole reason for the shape. */
export const PROD_UNLOCK_STABILITY = 7;

export function totalMisses(c) {
  return ((c.seen || 0) + (c.rseen || 0)) - ((c.correct || 0) + (c.rcorrect || 0));
}

export const retention = { target: 0.9 };


export function isWeak(c) {
  const seen = c.seen || 0;
  return seen >= 1 && (c.correct || 0) / seen < 0.5;  // missed more often than not
}

export function masteryScore(c) {            // higher = stronger; seen cards only
  const seen = c.seen || 0;
  if (seen === 0) return -1;
  return (c.level || 0) + (c.correct || 0) / seen;   // level dominates, accuracy breaks ties
}

// ── spaced repetition ──
export const DAY = 86400000;

export const REVIEW_INTERVALS = [0.007 * DAY, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];

export function recallUnlocked(c) {
  if (!((c.seen || 0) > 0)) return false;
  const st = c.fsrs || seedFromHistory(c);
  return !!(st && st.S >= PROD_UNLOCK_STABILITY);
}

export function effLevel(c) {                // true strength = weakest direction once recall unlocks
  const lvl = Math.min(5, c.level || 0);
  return recallUnlocked(c) ? Math.min(lvl, Math.min(5, c.rlevel || 0)) : lvl;
}

export function isLeech(c) {                 // stuck word: keeps failing despite reps
  const t = (c.seen || 0) + (c.rseen || 0);
  if (t < 8) return false;
  const acc = ((c.correct || 0) + (c.rcorrect || 0)) / t;
  return totalMisses(c) >= 6 && acc < 0.6;
}

export function dueness(c, now) {
  const seen = c.seen || 0;
  if (seen === 0) return 0;
  const st = c.fsrs || seedFromHistory(c);
  if (st && st.S > 0) {
    const last = st.last || 0;
    const due = st.due > last ? st.due : last + Math.max(1, intervalFor(st.S, retention.target)) * 86400000;
    const span = Math.max(60000, due - last);   // never divide by ~0 (relearning = 10 min)
    return (now - last) / span;
  }
  const interval = REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1);   // pre-FSRS fallback
  return (now - (c.last || 0)) / interval;
}

export function statReview(st, ok, ms, now = Date.now()) {
  const prior = st && st.fsrs ? st.fsrs : (st && (st.seen || 0) > 0 ? seedFromHistory(st) : null);
  return fsrsReview(prior, gradeFromLatency(ok, ms, { streak: st && st.streak }), now, retention.target);
}

export function boundMs(ms) { return ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0; }

/* ── a requeue inside one session is a relearning step, not a second review ──
   A missed card comes back in the same sitting up to three times, and every pass used to
   run the full FSRS update. So one bad sitting applied the LAPSE formula three times:
   measured on a real card, stability fell 20 → 3.6 → 1.33 → 0.65 while difficulty climbed
   5 → 6.7 → 8.39 → 10 and stuck there. Difficulty is clamped at 10, and stability growth
   carries an (11 − D) factor, so a single bad session permanently flattened that card's
   ability to gain stability ever again.

   FSRS does not do this. It applies ONE lapse and then short learning steps: the retries
   either graduate the card — back onto the curve with the post-lapse stability — or hold it
   for another ten minutes. Neither touches S or D again.

   The quick correct answer after a requeue was worthless for the opposite reason: elapsed
   time is ~0, so retrievability is ~1, and recalling something you saw ninety seconds ago
   teaches the model nothing. The card left the session in whatever state the last lapse
   left it. */
export function relearnStep(st, got, now = Date.now(), target = retention.target) {
  if (!st || !(st.S > 0)) return st;
  if (got) {
    const ivl = Math.min(3650, Math.max(1, intervalFor(st.S, target)));
    return { ...st, last: now, due: now + ivl * 86400000, ivl, relearning: false };
  }
  return { ...st, last: now, due: now + 10 * 60000, ivl: 10 / 1440, relearning: true };
}

export function reviewOutcome(card, { got, ms, dir, area, foreign, firstPass = true, now = Date.now() }) {
  /* Requeue passes keep every legacy counter moving — accuracy and the done screen stay
     honest — and leave the memory state to the one lapse that already happened. */
  if (!firstPass) {
    const isProdPass = dir === "prod";
    const prior = isProdPass ? ((card && card.rfsrs) || null)
                             : ((card && card.fsrs) || seedFromHistory(card || {}));
    const next = relearnStep(prior, got, now);
    return { prior, next, t: boundMs(ms), isProd: isProdPass,
             s0: (prior && prior.S) || 0, s1: (next && next.S) || 0 };
  }
  if (foreign) {                       // kana / kanji / 10k decks go through statReview
    const prior = card && card.fsrs ? card.fsrs : (card && (card.seen || 0) > 0 ? seedFromHistory(card) : null);
    const next = statReview(card, got, ms, now);
    return { prior, next, t: ms, isProd: false, s0: (prior && prior.S) || 0, s1: (next && next.S) || 0 };
  }
  const t = boundMs(ms);
  const isProd = dir === "prod";
  const grade = gradeAgainstNorm(got, t, area === "writing" ? "production" : "recognition",
    isProd ? "type" : "recall", latencyNormsRef.current, (card && card.streak) || 0);
  const prior = isProd ? ((card && card.rfsrs) || null) : ((card && card.fsrs) || seedFromHistory(card || {}));
  const next = fsrsReview(prior, grade, now, retention.target);
  return { grade, prior, next, t, isProd, s0: (prior && prior.S) || 0, s1: (next && next.S) || 0 };
}

/** Higher = drill this sooner. Driven by how far recall has decayed below the target. */
export function statNeed(st, now = Date.now()) {
  const seen = st && st.seen || 0;
  if (!seen) return 6;                                    // never drilled → straight to the front
  const f = st.fsrs || seedFromHistory(st);
  if (!f || !(f.S > 0)) return 5;
  const r = retrievability(Math.max(0, (now - (f.last || 0)) / 86400000), f.S);
  // 1 - r is "how much of this memory has decayed". A card at 50% recall outranks one at
  // 95% no matter how many times each has been seen, which is the whole point.
  return (1 - r) * 8 + (st.streak ? 0 : 0.6);
}

export function prodDue(c, now) {
  if (!recallUnlocked(c)) return false;
  if (!c.rfsrs || !(c.rfsrs.S > 0)) return true;
  return (c.rfsrs.due || 0) <= now;
}

export const latencyNormsRef = { current: {} };

export function refreshLatencyNorms(list) {
  try { latencyNormsRef.current = latencyNorms(list || []); } catch (e) { latencyNormsRef.current = {}; }
}

export function gradeAgainstNorm(ok, ms, skill, format, norms, streak) {
  if (!ok) return AGAIN;
  const verdict = latencyVerdict(ms, skill, format, norms);
  if (!verdict) return gradeFromLatency(ok, ms, { streak });      // no norm yet: fall back
  return verdict === "fast" ? EASY : verdict === "slow" ? HARD : GOOD;
}

export const MASTERY_CEIL = 365;

export const MASTERY_STOPS = [
  [0.00, [107, 122, 148]],   // steel blue — new, or actively falling apart
  [0.45, [150, 138, 132]],   // warm grey — finding its feet
  [0.75, [201, 156, 92]],    // amber — holding for weeks
  [1.00, [232, 191, 90]],    // gold — holding for months
];

/* The amber -> gold stop above, named because it is no longer only a colour. "Words moved
   into gold" is the session summary's headline and the roadmap's stability-as-currency, so
   the threshold is a shared constant rather than a 0.75 repeated wherever it is needed. */
export const GOLD_WARMTH = 0.75;

/* The same line, expressed in DAYS of stability — which is the form an evidence row carries
   (s0/s1) and therefore the form a pure selector can work in without a card object.
   DERIVED by inverting masteryWarmth rather than written down as ~83: a hand-copied number
   would keep the old value the first time MASTERY_CEIL or the stop moves, and the two
   screens would then disagree about what gold means. */
export const GOLD_STABILITY = Math.exp(GOLD_WARMTH * Math.log(1 + MASTERY_CEIL)) - 1;

export function masteryWarmth(c) {
  const st = (c && c.fsrs) || (c ? seedFromHistory(c) : null);
  const S = st && st.S > 0 ? st.S : 0;
  if (!S) return 0;
  return Math.max(0, Math.min(1, Math.log(1 + S) / Math.log(1 + MASTERY_CEIL)));
}

export function masteryColor(w) {
  const x = Math.max(0, Math.min(1, w || 0));
  let lo = MASTERY_STOPS[0], hi = MASTERY_STOPS[MASTERY_STOPS.length - 1];
  for (let i = 0; i < MASTERY_STOPS.length - 1; i++) {
    if (x >= MASTERY_STOPS[i][0] && x <= MASTERY_STOPS[i + 1][0]) { lo = MASTERY_STOPS[i]; hi = MASTERY_STOPS[i + 1]; break; }
  }
  const span = hi[0] - lo[0];
  const t = span > 0 ? (x - lo[0]) / span : 0;
  const ch = (i) => Math.round(lo[1][i] + (hi[1][i] - lo[1][i]) * t);
  return ch(0) + "," + ch(1) + "," + ch(2);      // bare triplet, so CSS can vary the alpha
}

export function masteryStyle(c) {
  const w = masteryWarmth(c);
  return { "--mastery": masteryColor(w), "--mastery-w": w.toFixed(3) };
}

export function recallChance(c, now) {
  const st = c.fsrs || seedFromHistory(c);
  if (!st || !(st.S > 0)) return null;
  return retrievability(Math.max(0, (now - (st.last || 0)) / 86400000), st.S);
}

export function needScore(c, now) {          // higher = needs review more (seen cards only)
  const seen = c.seen || 0;
  if (seen === 0) return -1;
  const acc = (c.correct || 0) / seen;
  const masteryGap = (5 - effLevel(c)) / 5;            // weak words (weakest direction)
  const accGap = 1 - acc;                              // often-missed words
  const overdue = Math.min(3, Math.max(0, dueness(c, now))); // spaced-repetition due
  const fewReps = 1 / (1 + seen);                      // least-exercised words
  const recallGap = recallUnlocked(c) ? Math.max(0, (c.level || 0) - (c.rlevel || 0)) / 5 : 0; // knows it, can't produce it
  return masteryGap * 2 + accGap * 2 + overdue * 1.6 + fewReps * 1 + recallGap * 1.5;
}
