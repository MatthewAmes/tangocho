/* ── interactional fatigue, and knowing when to stop ──
   The naive fatigue signal is "answers are getting slower and more wrong". That signal is
   worthless here, because it is ALSO the exact signature of the scheduler working: desirable
   difficulty means the session should get harder, retrievals should take effort, and a
   success rate near the target implies a real miss rate. Building on it produces a system
   that makes itself easier precisely when it is succeeding.

   What actually separates a tired learner from a working one is the SHAPE of the wrong
   answers. Someone still engaged and struggling is slow and wrong — they are searching.
   Someone checked out is FAST and wrong: tapping to make the card go away. That is the
   primary signal here, and it is one the app can already measure, because it stores each
   learner's own fast threshold per skill and format.

   Two supporting signals, both relative to the learner's own session rather than absolute:
   a slump (the back half of the session much worse than the front) and sheer length. */

export const FATIGUE = {
  window: 8,           // answers considered "recent"
  minSample: 5,        // below this there is nothing to say
  guessWeight: 0.55,   // rapid guessing dominates: it is the only unambiguous signal
  slumpWeight: 0.25,
  lengthWeight: 0.20,
  slumpFloor: 0.15,    // accuracy drop that counts as a real slump
  longSession: 30,     // answers, beyond which length alone starts to matter
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** events: [{ ok, ms, fastMs }] in order, oldest first. `fastMs` is this learner's own
 *  fast threshold for that skill+format — absent, the answer cannot signal rapid guessing
 *  and simply does not contribute to that term. */
export function fatigueFrom(events = [], opts = {}) {
  const o = { ...FATIGUE, ...opts };
  const list = (events || []).filter((e) => e && typeof e.ok === "boolean");
  if (list.length < o.minSample) return { level: 0, reasons: [], confident: false, n: list.length };

  const recent = list.slice(-o.window);
  const reasons = [];

  /* 1. Rapid guessing. Fast AND wrong, against the learner's own fast threshold — not a
        fixed millisecond count, which would call a quick thinker tired and a slow one fine. */
  const timed = recent.filter((e) => e.ms > 0 && e.fastMs > 0);
  let guessRate = 0;
  if (timed.length >= 3) {
    const guesses = timed.filter((e) => !e.ok && e.ms <= e.fastMs).length;
    guessRate = guesses / timed.length;
    if (guessRate >= 0.25) reasons.push("answering fast and wrong");
  }

  /* 2. Slump, measured against THIS session's own opening rather than any global standard.
        Only counts once there is a front half worth comparing to. */
  let slump = 0;
  if (list.length >= o.minSample * 2) {
    const half = Math.floor(list.length / 2);
    const early = list.slice(0, half);
    const late = list.slice(half);
    const acc = (xs) => xs.filter((e) => e.ok).length / xs.length;
    const drop = acc(early) - acc(late);
    if (drop > o.slumpFloor) {
      slump = clamp01((drop - o.slumpFloor) / (1 - o.slumpFloor));
      reasons.push("slipping against your own start");
    }
  }

  /* 3. Length. Deliberately the weakest term — a long session is not itself a problem, it
        is only a reason to weight the other two more readily. */
  const length = clamp01((list.length - o.longSession) / o.longSession);
  if (length > 0.3) reasons.push("long session");

  const level = clamp01(guessRate * o.guessWeight + slump * o.slumpWeight + length * o.lengthWeight);
  return { level, reasons, confident: true, n: list.length,
           parts: { guessRate, slump, length } };
}

export const STOP = {
  minItems: 6,          // never end a session so short it did nothing
  fatigueStop: 0.5,     // above this, wrap up
  valueFloor: 0.12,     // nothing left worth practising
};

/** Should the session end now?
 *  `remainingValue` is the best practice value among what is left (0..1); when everything
 *  left is already comfortably known there is no reason to keep going just to hit a count.
 *  Returns a reason so the UI can say something true rather than just stopping. */
export function shouldStop({ done = 0, planned = 0, fatigue = 0, remainingValue = 1, opts = {} } = {}) {
  const o = { ...STOP, ...opts };
  if (done < o.minItems) return { stop: false, reason: null };
  if (done >= planned && planned > 0) return { stop: true, reason: "done" };
  if (fatigue >= o.fatigueStop) return { stop: true, reason: "fatigue" };
  if (remainingValue <= o.valueFloor) return { stop: true, reason: "nothing-left" };
  return { stop: false, reason: null };
}

/* What to actually say. Stopping early has to read as the system respecting the learner's
   time, not as the session being cut short or as a telling-off for getting tired. */
export const STOP_NOTE = {
  done:            "Session complete.",
  fatigue:         "That is a good place to stop — the last few were guesses more than recalls.",
  "nothing-left":  "Nothing left that needs you today. The rest is still holding.",
};
