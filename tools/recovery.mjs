/* ── the recovery sequencer ──
   learner.mjs decides WHAT a rescue is: which rungs, in which order, for the kind of
   failure that actually happened. This file decides WHERE those rungs go in a session that
   is already running — the half that was missing, because the ladders existed as data and
   the live queue never really saw them.

   Three rules, and each one is a bug the first wiring had:

   1. THE RESCUE ASKS SOMETHING ELSE. Re-serving the question that just failed is the
      behaviour this whole feature replaces, and the cue cap makes it reachable: a
      recognition miss at CUE.CHOOSE trims the ladder down to its own floor, which is the
      multiple choice that just went wrong. When the opening rung would repeat the failed
      format the word is SHOWN first instead. Meeting the answer and then being asked for
      it is a repair; being asked the same thing twice is a retry.

   2. THE RUNGS ARE SPACED, AND THE SPACING EXPANDS. The first goes in immediately — a
      rescue only works while the miss is still live in mind — and the rest expand. That is
      the learning-steps idea (session.mjs stepGaps) pointed at a repair rather than an
      introduction: back-to-back rungs let the last one be answered off the back of what
      the first put on screen, which measures the last ten seconds and builds nothing.

   3. A FAILING RESCUE STEPS DOWN, IT DOES NOT RESTART. Missing a rung used to splice in a
      whole fresh ladder, which could be missed in turn. A miss inside a rescue now drops
      to the single gentlest rung and ends there; a miss on THAT hands back to the plain
      spaced requeue, and a miss on that gets nothing. Each intervention is strictly
      smaller than the one before, so the sequence always terminates — and the count rides
      on the card, so a requeue cannot launder a failing item back to a fresh ladder.

   Pure by design: arrays in, arrays out, no React and no storage, so every rule above is
   testable without mounting anything. The one thing this file does know about the app is
   the shape of a queue entry — a card object carrying `_rescue` — because attaching the
   rungs IS the job. */

import { buildRecovery, CUE, RECOVERY_NOTE, recoveryTag } from "./learner.mjs";

/* Cards to skip before each rung, counted from the one before it. The first is 1 — the
   very next beat — and they widen from there. Deliberately short: this is a repair inside
   one session, not a review schedule. */
export const RESCUE_GAPS = [1, 2, 3];
/* Ladders one item may be given before the plain requeue takes over. Two: the climb, and
   one step down out of it. A third would be the app insisting it can fix something it has
   now failed to fix twice — and the honest answer to that is to let FSRS have it tomorrow. */
export const RESCUE_MAX = 2;
/* Where a plain requeue lands when there is no ladder worth running — the pre-recovery
   behaviour, kept as the floor rather than deleted. */
export const REQUEUE_GAP = 3;

const DEFAULT_NOTE = "Let's crack this one.";

/* The rung below every ladder: the word itself, shown. It is not a question and does not
   grade — the caller must advance past it without recording anything — which is exactly
   what makes it usable here. Nothing was retrieved, so nothing is measured. */
function reexposure(after) {
  return { skill: after.skill, cue: CUE.SHOWN, format: "learn", direction: after.direction, reexposure: true };
}

/* Stamp the running order onto a finished ladder. Done last, and in one place, because the
   re-exposure can be pushed in front after the ladder was built and every field below is
   positional — `last` in particular, which is what the comeback bonus keys off. */
function stampRungs(stages, failure, depth) {
  const n = stages.length;
  return stages.map((s, i) => ({
    ...s,
    stage: i,
    of: n,
    /* How deep into rescuing this item we are, carried on the rung so the NEXT failure can
       tell "missed the question" from "missed the rescue" without any session bookkeeping. */
    depth: depth + 1,
    last: i === n - 1,
    /* The note frames the whole rescue and belongs on the opening rung only. Repeating it
       on every beat turns help into nagging. */
    note: i === 0 ? (RECOVERY_NOTE[failure] || DEFAULT_NOTE) : null,
    from: failure,
    /* What gets written to the evidence log, so the repair is visible in the data rather
       than inferred from a bonus appearing: "production:2/3" is the second rung of a
       three-rung rescue of a production miss. A flat string for the same reason `recent`
       is one — this is written on every answer and has to stay cheap to keep. Formatted by
       learner.mjs, which also parses it back: a log format assembled here and taken apart
       there is one that drifts the first time either side is edited alone. */
    tag: recoveryTag(failure, i + 1, n),
  }));
}

/** The rungs for one miss, ready to be seated. `failedFormat` is the renderer that just
 *  lost, and is what rule 1 is checked against. */
export function recoveryStages({ failure, failedFormat, failedCue, caps, depth = 0 } = {}) {
  const ladder = buildRecovery(failure, {
    failedCue: typeof failedCue === "number" ? failedCue : null,
    caps: caps || {},
  });
  if (!ladder.length) return [];
  /* Rule 3. Inside a rescue there is no second climb: take the gentlest rung the ladder
     offers and finish there, so the sequence is guaranteed to be shorter every time. */
  const climb = depth > 0 ? ladder.slice(0, 1) : ladder;
  const stages = (failedFormat && climb[0].format === failedFormat)
    ? [reexposure(climb[0]), ...climb]      // rule 1
    : climb;
  return stampRungs(stages, failure, depth);
}

/** Where each rung lands, as a gap from the rung before it (the first is a gap from the
 *  miss itself). `room` is how many cards are left after the missed one. */
export function rescueGaps(count, room) {
  const out = [];
  let span = 0;
  for (let i = 0; i < count; i++) {
    const want = RESCUE_GAPS[Math.min(i, RESCUE_GAPS.length - 1)];
    /* Overshooting the end clamps every later rung onto it and they land adjacent — the
       massed repetition the spacing exists to avoid, which is the same argument fitSteps
       makes in session.mjs. Shrink the gap instead. Rungs are never DROPPED to make room,
       unlike a learning step: the last one IS the success the rescue exists to produce,
       and a session that ends on the miss is the thing being fixed. */
    const g = span + want <= room + i ? want : 1;
    span += g;
    out.push(g);
  }
  return out;
}

/** How many interventions this item has already had. Read off the card rather than tracked
 *  by the caller: a rung carries its own depth and a card handed back by the plain requeue
 *  keeps it too, so a miss cannot launder itself through the fallback into a fresh ladder. */
export function depthOf(card) {
  if (!card) return 0;
  if (card._rescue && card._rescue.depth) return card._rescue.depth;
  return card._rescueDepth || 0;
}

/** Splice a rescue into the live queue. Returns a NEW queue plus the rungs that went in,
 *  so the caller can log what it scheduled. `mode` says which of the three rules applied. */
export function sequenceRecovery(opts = {}) {
  const queue = Array.isArray(opts.queue) ? opts.queue : [];
  const pos = Math.max(0, opts.pos || 0);
  const card = opts.card || queue[pos];
  if (!card) return { queue, stages: [], mode: "none" };
  const depth = typeof opts.depth === "number" ? Math.max(0, opts.depth) : depthOf(card);

  /* Whatever is left of the ladder that just failed comes out first. Leaving it in place
     would stack the step-down underneath the rungs that have already beaten the learner. */
  const next = queue.filter((x, i) => i <= pos || !(x && x._rescue && x.id === card.id));

  /* Past the requeue there is nothing honest left to try inside this session. Saying so is
     the termination guarantee: every branch below either shrinks the intervention or stops. */
  if (depth > RESCUE_MAX) return { queue: next, stages: [], mode: "none" };

  const stages = depth >= RESCUE_MAX ? [] : recoveryStages({ ...opts, depth });
  if (!stages.length) {
    /* No ladder fits this failure, or the item has had its share of them. The old spaced
       requeue is the floor: it at least puts the word back in front of the learner before
       the session ends. `_rescue` is cleared so it renders as an ordinary card again. */
    const at = Math.min(pos + 1 + (opts.requeueGap ?? REQUEUE_GAP), next.length);
    next.splice(at, 0, { ...card, _rescue: null, _rescueDepth: depth + 1 });
    return { queue: next, stages: [], mode: "requeue" };
  }

  const gaps = rescueGaps(stages.length, Math.max(0, next.length - pos - 1));
  let cursor = pos;
  stages.forEach((s, i) => {
    cursor = Math.min(cursor + gaps[i], next.length);
    next.splice(cursor, 0, { ...card, _rescue: s, _step: 0 });
  });
  return { queue: next, stages, mode: depth > 0 ? "step-down" : "ladder" };
}

/** Drop an item's later copies after it is answered correctly — but never a rescue rung.
 *
 *  That exemption is the whole reason this is a named function. The drop rule exists for
 *  the miss-requeue, and it was quietly deleting the rest of the ladder as well: getting
 *  the first rung right is the START of the climb, not the end of it. With the later rungs
 *  gone no ladder could ever reach its final cue-free rung, so the comeback bonus fired
 *  only for ladders that happened to be one rung long, and every longer rescue collapsed
 *  into its own easiest question. */
export function dropSolved(queue, pos, id) {
  return (queue || []).filter((x, i) => i <= pos || !x || x.id !== id || !!x._rescue);
}
