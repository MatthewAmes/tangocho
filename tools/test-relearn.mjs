// Tests for in-session relearning steps (relearnStep / reviewOutcome firstPass).
//   node tools/test-relearn.mjs
//
// The bug these exist for, as measured on a real card: missed three times in one sitting,
// stability fell 20 -> 3.60 -> 1.33 -> 0.65 and difficulty climbed 5 -> 6.70 -> 8.39 -> 10
// and stayed there. Difficulty is clamped at 10 and stability growth carries an (11 - D)
// factor, so one bad session permanently flattened that card's ability to gain stability.
import { relearnStep, reviewOutcome, retention } from "../src/lib/schedule.js";
import { intervalFor } from "./fsrs.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const NOW = Date.UTC(2026, 8, 1);
const MIN = 60000, DAY = 86400000;
const state = (o = {}) => ({ S: 20, D: 5, last: NOW - 30 * DAY, due: NOW, ivl: 20, relearning: false, ...o });
const card = (o = {}) => ({ id: "c1", seen: 5, correct: 4, streak: 1, fsrs: state(o) });

console.log("=== one lapse per session, not one per attempt ===");
t("THE BUG: three misses in a session must not run the lapse formula three times", () => {
  let c = card();
  const first = reviewOutcome(c, { got: false, ms: 4000, now: NOW, firstPass: true });
  const afterLapse = first.next;
  // the two retries are relearning steps, not reviews
  const retry1 = reviewOutcome({ ...c, fsrs: afterLapse }, { got: false, ms: 4000, now: NOW + MIN, firstPass: false });
  const retry2 = reviewOutcome({ ...c, fsrs: retry1.next }, { got: false, ms: 4000, now: NOW + 2 * MIN, firstPass: false });
  eq(retry1.next.S, afterLapse.S, "stability must not fall again on a retry");
  eq(retry2.next.S, afterLapse.S, "nor on the one after that");
  eq(retry2.next.D, afterLapse.D, "difficulty must not climb toward its clamp");
  ok(afterLapse.D < 10, "one lapse should not pin difficulty at its maximum");
});
t("the single lapse still happens — this is not a way of avoiding penalties", () => {
  const c = card();
  const { next } = reviewOutcome(c, { got: false, ms: 4000, now: NOW, firstPass: true });
  ok(next.S < 20, "a genuine miss must still cost stability");
  ok(next.D > 5, "and must still raise difficulty");
});

console.log("=== what a retry actually does ===");
t("a correct retry graduates the card back onto the curve", () => {
  const post = state({ S: 3.6, D: 6.7, relearning: true });
  const out = relearnStep(post, true, NOW);
  eq(out.relearning, false, "it is no longer in a relearning step");
  eq(out.S, 3.6, "graduating does not invent stability it has not earned");
  near(out.ivl, Math.max(1, intervalFor(3.6, retention.target)), 0.001,
    "the next interval comes from the POST-lapse stability");
  ok(out.due > NOW + DAY - 1, "and is at least a day out, not ten minutes");
});
t("a failed retry holds the card for ten minutes and changes nothing else", () => {
  const post = state({ S: 3.6, D: 6.7 });
  const out = relearnStep(post, false, NOW);
  eq(out.S, 3.6); eq(out.D, 6.7);
  eq(out.relearning, true);
  near(out.due - NOW, 10 * MIN, 1, "ten minutes, so it comes back later this session");
});
t("a quick correct answer after a miss no longer counts as a real review", () => {
  /* Elapsed time is ~0 on a retry, so retrievability is ~1, and recalling something seen
     ninety seconds ago tells the model nothing. Running it as a review added no stability
     while leaving the card wherever the lapse left it. */
  const post = state({ S: 3.6, D: 6.7, last: NOW });
  const asReview = reviewOutcome({ id: "c", fsrs: post }, { got: true, ms: 900, now: NOW + 90000, firstPass: true });
  const asStep = reviewOutcome({ id: "c", fsrs: post }, { got: true, ms: 900, now: NOW + 90000, firstPass: false });
  ok(asStep.next.due > asReview.next.due || asStep.next.ivl >= 1,
    "the step schedules from real stability rather than from a meaningless recall");
});

console.log("=== safety ===");
t("a card with no memory state yet is left alone", () => {
  eq(relearnStep(null, true, NOW), null);
  eq(relearnStep(undefined, false, NOW), undefined);
  const zero = { S: 0, D: 5 };
  eq(relearnStep(zero, true, NOW), zero, "S of 0 means nothing has been learned to graduate");
});
t("firstPass defaults to true, so nothing that omits it changes behaviour", () => {
  const c = card();
  const a = reviewOutcome(c, { got: true, ms: 2000, now: NOW });
  const b = reviewOutcome(c, { got: true, ms: 2000, now: NOW, firstPass: true });
  eq(a.next.S, b.next.S);
  eq(a.next.D, b.next.D);
});
t("an interval never runs away", () => {
  const huge = relearnStep(state({ S: 100000 }), true, NOW);
  ok(huge.ivl <= 3650, "capped at ten years, got " + huge.ivl);
});

console.log(`\nall ${run} relearning tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
