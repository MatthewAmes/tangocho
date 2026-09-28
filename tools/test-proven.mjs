// Tests for tools/proven.mjs — the honest mastery rule.
//
//   node tools/test-proven.mjs
import { levelOf, levelsFor, tally, nextProof, unassistedProduction, LEVEL, PROVEN } from "./proven.mjs";
import { CUE } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const D = 86400000;
const T0 = Date.UTC(2026, 8, 1, 12);
const prod = (day, isOk = true, extra = {}) => ({ id: "w", skill: "production", format: "type", cue: CUE.FREE, ok: isOk, at: T0 + day * D, ...extra });
const recog = (day, isOk = true) => ({ id: "w", skill: "recognition", format: "mc", cue: CUE.CHOOSE, ok: isOk, at: T0 + day * D });

console.log("=== one success never masters a word ===");
t("a single free recall is 'recalls', not mastered", () => eq(levelOf([prod(0)]).level, LEVEL.RECALLS));
t("three successes on ONE day are not mastery", () => {
  eq(levelOf([prod(0), { ...prod(0), at: T0 + 3600e3 }, { ...prod(0), at: T0 + 7200e3 }]).level, LEVEL.RECALLS);
});
t("three days, but inside a week, is not yet mastery", () => eq(levelOf([prod(0), prod(2), prod(4)]).level, LEVEL.RECALLS));
t("three days spanning a week is mastery", () => eq(levelOf([prod(0), prod(3), prod(8)]).level, LEVEL.MASTERED));
t("a miss on the latest attempt takes mastery away", () => {
  const s = levelOf([prod(0), prod(3), prod(8), prod(10, false)]);
  eq(s.level, LEVEL.RECALLS);
  eq(s.slipped, true);
});
t("…and a right answer after the slip gives it back", () => eq(levelOf([prod(0), prod(3), prod(8), prod(10, false), prod(11)]).level, LEVEL.MASTERED));

console.log("=== help does not count as producing ===");
t("hinted production is not unassisted", () => {
  ok(!unassistedProduction(prod(0, true, { cue: CUE.STRONG })));
  ok(!unassistedProduction(prod(0, true, { cue: CUE.CHOOSE })));
  ok(unassistedProduction(prod(0, true, { cue: CUE.CONTEXT })));
});
t("hinted successes on many days never reach mastery", () => {
  const rows = [0, 3, 8, 12].map((d) => prod(d, true, { cue: CUE.STRONG }));
  eq(levelOf(rows).level, LEVEL.RECOGNISES, "right answers with help show recognition, not recall");
});
t("a tutor's judgement does not prove recall", () => {
  const rows = [0, 3, 8].map((d) => prod(d, true, { via: "tutor", format: "converse" }));
  eq(levelOf(rows).level, LEVEL.RECOGNISES);
});
t("old rows with no cue count when they were typed", () => {
  eq(levelOf([0, 3, 8].map((d) => prod(d, true, { cue: null }))).level, LEVEL.MASTERED);
  eq(unassistedProduction({ skill: "production", format: "build", cue: null, ok: true }), false);
});
t("a cold checkpoint answer counts", () => {
  eq(levelOf([prod(0, true, { probe: true }), prod(4), prod(9)]).level, LEVEL.MASTERED);
});

console.log("=== the lower levels say what they are ===");
t("recognition only is 'recognises', however often", () => {
  eq(levelOf([0, 1, 2, 5, 9, 20].map((d) => recog(d))).level, LEVEL.RECOGNISES);
});
t("never right is 'learning'", () => eq(levelOf([recog(0, false), prod(1, false)]).level, LEVEL.LEARNING));
t("no rows is 'new'", () => eq(levelOf([]).level, LEVEL.NEW));

console.log("=== counting a whole volume honestly ===");
t("a word with no evidence counts as new inside its population", () => {
  const ev = [0, 3, 8].map((d) => prod(d));
  const t0 = tally(levelsFor(ev, ["w", "x", "y"]));
  eq(t0.mastered, 1); eq(t0.new, 2); eq(t0.total, 3);
});
t("rows arrive in any order", () => eq(levelOf([prod(8), prod(0), prod(3)]).level, LEVEL.MASTERED));

console.log("=== what the next proof needs ===");
t("the message counts the missing days", () => {
  ok(/2 more days/.test(nextProof(levelOf([prod(0)]))));
  ok(/span a week/.test(nextProof(levelOf([prod(0), prod(1), prod(2)]))));
  ok(/missed it last time/.test(nextProof(levelOf([prod(0), prod(3, false)]))));
  eq(PROVEN.days, 3);
});

console.log(fail ? `${fail} of ${run} proven tests FAILED` : `all ${run} proven tests passed`);
process.exit(fail ? 1 : 0);
