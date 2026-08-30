/* ── pacing: how long a session runs, and when to OFFER the end of it ──
   fatigue.mjs answers "is this learner still retrieving or just tapping". gain.mjs answers
   "are these minutes still buying memory". session.mjs answers "how long did they ask for".
   Three separate questions with three separate answers, and the session in front of the
   learner needs one. This module is that one — the seam the Study component calls between
   questions, kept out of the component so the decision can be tested without a browser.

   Two rules the whole file exists to hold:

   1. IT OFFERS, IT NEVER ENDS. Every reason here produces a nudge the learner can wave
      away. A system that stops the session for you is a system that is wrong about your
      evening once and then never trusted again — and the one reason it fires on most
      often (fatigue) is the reason it is least certain about, because rising latency and
      misses are ALSO what desirable difficulty looks like from the outside. fatigue.mjs
      carries that argument in full; the consequence for this file is that the answer is
      always a question.

   2. DECLINING IT MEANS SOMETHING. Waving the nudge away is evidence, so the offer goes
      quiet for a while (snooze) and the questions get easier (easedTarget) rather than
      the app simply asking again on the next card. Spec §38 asks for simplify / shorten /
      provide a success as fatigue rises; that is what an unaccepted offer buys. */

import { fatigueFrom, shouldStop, STOP, STOP_NOTE } from "./fatigue.mjs";
import { fadePoint } from "./gain.mjs";
import { TARGET_SUCCESS } from "./learner.mjs";

export const PACING = {
  /* The requested minutes are a target, not a fence. Offering to stop the instant the
     clock ticks over would interrupt sessions that are going well, so time only counts as
     spent once it has run a fifth past what was asked for. */
  overrun: 1.2,
  snooze: 8,          // answers a declined offer stays quiet for — one fatigue window
  easeAt: 0.3,        // fatigue above which the next questions aim for more support
  easedTarget: 0.88,  // ...the success rate they aim for instead of TARGET_SUCCESS
  fadeSize: 5,        // gain buckets, matching gain.mjs's own default
};

/* What to actually say, per reason — the system respecting the learner's time, never a
   telling-off for running out of it. fatigue.mjs's own notes are the base; the ones
   restated here are restated because the offer is shown UNDER a heading that already says
   "good place to stop", and copy that says it twice reads like a form letter. Each line is
   the evidence for the heading, not a second version of it. */
export const PACE_NOTE = {
  ...STOP_NOTE,
  fatigue: "The last few were guesses more than recalls.",
  "nothing-left": "Nothing left that needs you today. The rest is still holding.",
  time: "That is the time you asked for. Anything past here is a bonus.",
  fade: "The first few minutes bought more memory than the last few.",
};

/* Should the session offer to end?

   `events`   the fatigue stream so far: [{ ok, ms, fastMs }], oldest first
   `planned`  how many questions the session set out to ask
   `elapsedMs` / `plannedMinutes`  the clock against the pace preset
   `gainRows` this session's evidence rows, for the learning-value question
   `remainingValue` best practice value left among what has not been asked (0..1)
   `snoozedUntil` answer count before which a declined offer stays quiet

   Returns the fatigue estimate ALWAYS — including while snoozed, and including when there
   is nothing to offer — because the caller needs it for the easing bias and for the
   evidence log regardless of whether a nudge is due. */
export function stopOffer({ events = [], planned = 0, elapsedMs = 0, plannedMinutes = 0,
                            gainRows = [], remainingValue = 1, snoozedUntil = 0,
                            opts = {} } = {}) {
  const o = { ...PACING, ...opts };
  const fatigue = fatigueFrom(events);
  const done = (events || []).length;
  const none = { offer: false, reason: null, note: null, fatigue };

  /* Never offer to end a session that has not been one yet. shouldStop enforces this for
     its own reasons; time and fade need the same floor or a five-minute pace would offer
     to stop after the second card on a slow morning. */
  if (done < STOP.minItems) return none;
  if (done < snoozedUntil) return none;

  /* Fatigue and exhausted value first, ahead of the clock. Both name something the learner
     can recognise in what just happened — "the last few were guesses" is a better reason
     than "six minutes are up", and it is also the one worth acting on soonest. */
  const verdict = shouldStop({ done, planned, fatigue: fatigue.level, remainingValue });
  /* "done" is the queue running out, which the session reaches on its own and does not
     need to be nudged towards. Reported, not offered. */
  if (verdict.stop && verdict.reason !== "done") {
    return { offer: true, reason: verdict.reason, note: PACE_NOTE[verdict.reason], fatigue };
  }

  if (plannedMinutes > 0 && elapsedMs >= plannedMinutes * 60000 * o.overrun) {
    return { offer: true, reason: "time", note: PACE_NOTE.time, fatigue };
  }

  /* Learning value, measured in the same stability doublings as the north-star metric.
     fadePoint needs three full buckets before it says anything, so this is the last of the
     three to be able to fire — which is the right order: a rate that has fallen off is a
     statement about the whole session, not about the last answer. */
  const fade = fadePoint(gainRows, o.fadeSize);
  if (fade && fade.faded) {
    return { offer: true, reason: "fade", note: PACE_NOTE.fade, fatigue };
  }
  return none;
}

/* The success rate the next intervention should aim for.

   This is the ONE seam the fatigue bias uses, and it is deliberately the cue rather than
   the format: chooseIntervention picks the hardest cue an ability can still succeed at,
   so raising the target lowers the cue, and a lower cue is both easier and shorter —
   recognition drops from a cold recall to a multiple choice, production from typing to a
   supported form. Nothing else in the selection changes. The alternative (a format list
   the fatigue path picks from) would put a second, rival exercise chooser next to the
   learner model, which is exactly the pile of hand-written rules the roadmap warns off.

   A step rather than a curve, and the step sits well below the stop threshold on purpose:
   the support arrives BEFORE the offer to stop, so a learner who is flagging gets an
   easier question first and is only asked about stopping if that did not help. */
export function easedTarget(fatigue = 0, base = TARGET_SUCCESS, opts = {}) {
  const o = { ...PACING, ...opts };
  const level = typeof fatigue === "number" ? fatigue : ((fatigue && fatigue.level) || 0);
  return level >= o.easeAt ? Math.max(base, o.easedTarget) : base;
}

/* ── the pacing presets (spec §39) ──
   Three honest paces, because some days are not study days. The professor's point about
   "small and simple things" is the default: five focused minutes, three times a day, beats
   one heroic session you will not repeat.

   They map to ONE number — session.mjs's `minutes` — and that is the whole mechanism. The
   item count follows from it (budgetFor scales the ceiling with the requested minutes) and
   so does the number of new words (newShare is a fraction of the session, not a count), so
   a preset does not need to set a second knob to be felt. `maxNew` is deliberately NOT
   scaled: encoding cost is the one thing that does not get cheaper because you have more
   time, and six genuinely new words is already the most a sitting should introduce. */
export const PACES = [
  ["short", "Short", 5, "Tired, busy, or between things. Five minutes still counts."],
  ["normal", "Normal", 10, "The daily default — enough to make real progress."],
  ["deep", "Deep", 20, "Motivated and have the time. Bigger backlog, more new words."],
];

export function paceMinutes(pace) {
  const row = PACES.find(([k]) => k === pace);
  return row ? row[2] : 10;
}
