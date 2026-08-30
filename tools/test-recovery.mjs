// Tests for the recovery sequencer — the half of Slice 2 that lives in the live queue.
//
//   node tools/test-recovery.mjs
//
// The ladders themselves are learner.mjs's problem and are tested there. What is asserted
// here is everything that only shows up once a rescue is spliced into a session that is
// already running: that it asks something else, that the rungs are spaced, that a correct
// answer does not delete the rest of the climb, and that a rescue which itself goes wrong
// runs down rather than round.
import {
  RESCUE_GAPS, RESCUE_MAX, REQUEUE_GAP,
  recoveryStages, rescueGaps, sequenceRecovery, dropSolved, depthOf,
} from "./recovery.mjs";
import { CUE, classifyFailure, FAILURES, scoreAnswer } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const lte = (a, b, m) => { if (!(a <= b)) throw new Error(`${m || ""} expected ${a} <= ${b}`); };

const CAPS = { type: true, listen: true, context: true };
// A plain queue of distinct cards, none of them rescues.
const queueOf = (n) => Array.from({ length: n }, (_, i) => ({ id: "w" + i, term: "語" + i }));
const rungsFor = (q, id) => q.map((c, i) => ({ i, c })).filter((x) => x.c.id === id && x.c._rescue);
// Only what is still AHEAD: the rung being answered stays in the array behind the cursor.
const rungsAfter = (q, id, pos) => rungsFor(q, id).filter((x) => x.i > pos);

console.log("=== a miss inserts the ladder its failure asked for ===");
t("a production miss becomes recognise → partial production → full production", () => {
  // The spec's own example: a miss on ください climbs back through picking it out and a
  // masked reading rather than being asked the same question again.
  const stages = recoveryStages({
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  eq(stages.map((s) => s.format).join(","), "mc,type,type");
  eq(stages.map((s) => s.cue).join(","), [CUE.CHOOSE, CUE.PARTIAL, CUE.FREE].join(","));
});
t("the rungs go into the upcoming queue, after the miss and in order", () => {
  const q = queueOf(12);
  const { queue, stages, mode } = sequenceRecovery({
    queue: q, pos: 2, card: q[2],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  eq(mode, "ladder");
  eq(queue.length, q.length + stages.length, "every rung is seated");
  const seats = rungsFor(queue, "w2");
  eq(seats.length, 3);
  ok(seats[0].i > 2, "a rescue is scheduled ahead of the miss, never behind it");
  eq(seats.map((s) => s.c._rescue.stage).join(","), "0,1,2", "in ladder order");
  // The cards that were already queued keep their relative order.
  eq(queue.filter((c) => !c._rescue).map((c) => c.id).join(","), q.map((c) => c.id).join(","));
});
t("the gaps between rungs expand, matching the learning-steps idea", () => {
  const q = queueOf(20);
  const { queue } = sequenceRecovery({
    queue: q, pos: 0, card: q[0],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  const at = rungsFor(queue, "w0").map((s) => s.i);
  eq(at.length, 3);
  eq(at[0], 1, "the first rung is the very next beat — the miss is still live in mind");
  const gaps = [at[1] - at[0], at[2] - at[1]];
  ok(gaps[1] > gaps[0], "spacing widens: " + gaps.join(" then "));
});
t("no room left in the session still seats every rung, bunched rather than dropped", () => {
  // A learning step would be dropped here (session.mjs fitSteps). A rescue rung must not
  // be: the last one is the success the whole sequence exists to produce.
  const q = queueOf(3);
  const { queue } = sequenceRecovery({
    queue: q, pos: 2, card: q[2],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  eq(rungsFor(queue, "w2").length, 3, "a session may get longer rather than end on a miss");
});
t("rescueGaps shrinks to fit rather than clamping every rung onto the end", () => {
  eq(rescueGaps(3, 20).join(","), RESCUE_GAPS.join(","), "plenty of room: the stated gaps");
  eq(rescueGaps(3, 0).join(","), "1,1,1", "no room: adjacent, but all three");
  eq(rescueGaps(4, 20).length, 4, "a longer ladder than there are stated gaps still fits");
});

console.log("=== the rescue asks something else ===");
t("the rung after a miss never repeats the format that just failed", () => {
  // The property that separates a repair from a retry, checked across every failure kind
  // at every cue it can be diagnosed at — including the low ones, where the ladder's own
  // cue cap trims it down to the question that just went wrong.
  for (const failure of FAILURES) {
    for (const cue of [CUE.CHOOSE, CUE.STRONG, CUE.PARTIAL, CUE.FREE, CUE.CONTEXT]) {
      for (const format of ["mc", "recall", "type", "listen", "cloze"]) {
        const stages = recoveryStages({ failure, failedFormat: format, failedCue: cue, caps: CAPS });
        if (!stages.length) continue;
        ok(stages[0].format !== format,
           `${failure} @ cue ${cue} failed as ${format} and reopened with ${format}`);
      }
    }
  }
});
t("a ladder trimmed to the question that failed gets the word shown below it instead", () => {
  // A recognition miss at the ladder floor: there is no gentler rung in the ladder, so the
  // sequencer adds one below it — see it, then pick it.
  const stages = recoveryStages({
    failure: "meaning", failedFormat: "mc", failedCue: CUE.CHOOSE, caps: CAPS,
  });
  eq(stages.map((s) => s.format).join(","), "learn,mc");
  eq(stages[0].cue, CUE.SHOWN);
  ok(stages[0].reexposure === true, "the caller has to know not to grade it");
  ok(!stages[0].last, "an exposure is never the success the rescue ends on");
});
t("a ladder that already opens elsewhere is left alone", () => {
  const stages = recoveryStages({
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  ok(!stages.some((s) => s.reexposure), "no exposure rung is needed or added");
});
t("exactly one rung is the last one — the comeback keys off it", () => {
  for (const failure of FAILURES) {
    for (const cue of [CUE.CHOOSE, CUE.PARTIAL, CUE.FREE]) {
      const stages = recoveryStages({ failure, failedFormat: "type", failedCue: cue, caps: CAPS });
      if (!stages.length) continue;
      eq(stages.filter((s) => s.last).length, 1, failure + " @ " + cue);
      ok(stages[stages.length - 1].last, "and it is the final one");
    }
  }
});
t("the opening rung carries the note; the later ones get on with it", () => {
  const stages = recoveryStages({
    failure: "reading", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  ok(stages[0].note, "a rescue says why it is happening");
  ok(stages.slice(1).every((s) => s.note === null), "repeating it would be nagging");
});

console.log("=== completing the ladder marks the comeback ===");
t("a correct answer no longer deletes the rest of the climb", () => {
  // The drop rule exists for the miss-requeue. Applied to a rescue it ended the ladder on
  // its own easiest rung, so the cue-free success at the top could never be reached.
  const q = queueOf(10);
  const { queue } = sequenceRecovery({
    queue: q, pos: 1, card: q[1],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  const first = rungsFor(queue, "w1")[0].i;
  const after = dropSolved(queue, first, "w1");
  eq(rungsAfter(after, "w1", first).length, 2, "the two rungs above this one survive");
});
t("an ordinary duplicate is still dropped once the item is answered", () => {
  const q = queueOf(6).concat([{ id: "w1" }]);
  eq(dropSolved(q, 1, "w1").length, 6, "the trailing copy goes");
});
t("walking the ladder to the top pays the comeback bonus", () => {
  const q = queueOf(10);
  let queue = sequenceRecovery({
    queue: q, pos: 0, card: q[0],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  }).queue;
  let comebacks = 0, answered = 0, tags = [];
  for (let pos = 1; pos < queue.length; pos++) {
    const c = queue[pos];
    if (!c._rescue) continue;
    answered++;
    tags.push(c._rescue.tag);
    if (c._rescue.last) comebacks++;
    queue = dropSolved(queue, pos, c.id);          // every rung answered correctly
  }
  eq(answered, 3, "all three rungs were actually served");
  eq(comebacks, 1, "one comeback, at the top of the ladder");
  eq(tags.join(" "), "production:1/3 production:2/3 production:3/3", "the chain is logged");
  const scored = scoreAnswer({ ok: true, cue: CUE.FREE, comeback: true });
  ok(scored.reasons.some((r) => r.label === "comeback"), "and it is worth something");
});
t("the evidence tag names the failure and the rung", () => {
  const stages = recoveryStages({
    failure: "blank", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  });
  eq(stages[0].tag, "blank:1/" + stages.length);
  eq(stages[stages.length - 1].tag, "blank:" + stages.length + "/" + stages.length);
  ok(stages.every((s) => s.from === "blank"), "and what started the chain");
});

console.log("=== a rescue that goes wrong runs down, not round ===");
t("missing a rung steps down to one gentler rung instead of restarting the ladder", () => {
  const q = queueOf(12);
  const first = sequenceRecovery({
    queue: q, pos: 0, card: q[0],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE, caps: CAPS,
  }).queue;
  const rung = rungsFor(first, "w0")[1];           // miss the partial-production rung
  const step = sequenceRecovery({
    queue: first, pos: rung.i, card: rung.c,
    failure: "production", failedFormat: rung.c._rescue.format,
    failedCue: rung.c._rescue.cue, caps: CAPS,          // depth is read off the rung itself
  });
  eq(step.mode, "step-down");
  eq(step.stages.length, 1, "one rung, not another climb");
  ok(step.stages[0].last, "and succeeding on it still counts as getting back out");
  eq(rungsAfter(step.queue, "w0", rung.i).length, 1,
     "the rung of the old ladder that was still ahead is gone, replaced by the step-down");
});
t("a session of nothing but misses terminates", () => {
  // The loop guard, driven rather than asserted: answer every single thing wrong and the
  // queue has to run dry. Before RESCUE_MAX each miss spliced a fresh ladder, and a rescue
  // could be missed too.
  let queue = queueOf(4);
  let served = 0;
  for (let pos = 0; pos < queue.length; pos++) {
    if (++served > 200) throw new Error("the queue never drained — a rescue is looping");
    const c = queue[pos];
    const fmt = (c._rescue && c._rescue.format) || "type";
    if (c._rescue && c._rescue.reexposure) continue;   // not a question; cannot be missed
    queue = sequenceRecovery({
      queue, pos, card: c,
      failure: classifyFailure({ format: fmt, expected: "ください", got: "" }),
      failedFormat: fmt,
      failedCue: (c._rescue && c._rescue.cue) ?? CUE.FREE,
      caps: CAPS,                                        // depth rides on the card
    }).queue;
  }
  lte(served, 200, "drained after " + served + " questions");
  eq(depthOf(queue[queue.length - 1]) > RESCUE_MAX, true, "the last word ran out of ladders");
});
t("past the ladder budget it falls back to the plain spaced requeue", () => {
  const q = queueOf(10);
  const { queue, stages, mode } = sequenceRecovery({
    queue: q, pos: 1, card: q[1],
    failure: "production", failedFormat: "type", failedCue: CUE.FREE,
    caps: CAPS, depth: RESCUE_MAX,
  });
  eq(mode, "requeue");
  eq(stages.length, 0);
  const back = queue.findIndex((c, i) => i > 1 && c.id === "w1");
  eq(back, 1 + 1 + REQUEUE_GAP, "seated at the old requeue gap");
  ok(!queue[back]._rescue, "and it renders as an ordinary card again");
});
t("a failure kind with no ladder falls back rather than inventing one", () => {
  const q = queueOf(8);
  const { queue, mode } = sequenceRecovery({
    queue: q, pos: 0, card: q[0], failure: null, failedFormat: "recall", caps: CAPS,
  });
  eq(mode, "requeue");
  ok(queue.some((c, i) => i > 0 && c.id === "w0"), "the word still comes back");
});
t("an empty queue and a missing card are survivable, not throwable", () => {
  eq(sequenceRecovery({}).mode, "none");
  eq(sequenceRecovery({ queue: [], pos: 0 }).mode, "none");
  eq(dropSolved(null, 0, "x").length, 0);
  eq(recoveryStages({}).length, 0);
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} recovery tests passed`);
process.exit(fail ? 1 : 0);
