// Tests for the volume/act rollup (tools/progress.mjs).
//   node tools/test-progress.mjs
import { actOfScene, rollUp, volumeProgress, actProgress, describeVolume } from "./progress.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const near = (a, b, tol = 0.001, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const scene = (name, o = {}) => ({
  scene: name, items: 10, seen: 0, started: false, mastered: null, stillEvaluating: false, ...o,
});

console.log("=== reading the act out of a scene label ===");
t("plain and slashed labels both parse", () => {
  eq(actOfScene("7-3"), 7);
  eq(actOfScene("12-1"), 12);
  eq(actOfScene("7/22"), 7, "some sec tags in the deck use a slash");
});
t("junk is null, not zero", () => {
  eq(actOfScene("Culture talk"), null);
  eq(actOfScene(""), null);
  eq(actOfScene(null), null);
});

console.log("=== the three numbers stay apart ===");
t("coverage is met-at-least-once and nothing more", () => {
  const r = rollUp([scene("7-1", { items: 10, seen: 5, started: true, mastered: 0.9 })]);
  near(r.coverage, 0.5);
});
t("mastery is of what was MET, so a strong start does not read as a finished volume", () => {
  const r = rollUp([scene("7-1", { items: 100, seen: 10, started: true, mastered: 0.95 })]);
  near(r.coverage, 0.1);
  near(r.mastered, 0.95);
  near(r.done, 0.095, 0.001, "10% met and 95% of that held is not 95% done");
});
t("done reaches 1 only when everything is met AND held", () => {
  const r = rollUp([scene("7-1", { items: 10, seen: 10, started: true, mastered: 1 })]);
  near(r.done, 1);
});
t("mastery is weighted by scene SIZE, not by scene count", () => {
  // A 40-word scene half-known outweighs a 4-word scene fully known.
  const r = rollUp([
    scene("7-1", { items: 40, seen: 40, started: true, mastered: 0.5 }),
    scene("7-2", { items: 4, seen: 4, started: true, mastered: 1 }),
  ]);
  near(r.mastered, (0.5 * 40 + 1 * 4) / 44);
  ok(r.mastered < 0.6, "an unweighted mean would say 0.75");
});

console.log("=== not measured is not zero ===");
t("nothing measured yet gives null, never 0%", () => {
  const r = rollUp([scene("7-1", { seen: 3, started: true, stillEvaluating: true })]);
  eq(r.mastered, null, "0% would claim the learner knows none of it");
  eq(r.done, null);
  eq(r.measuring, 1);
});
t("scenes still evaluating count toward coverage but not toward mastery", () => {
  const r = rollUp([
    scene("7-1", { items: 10, seen: 10, started: true, mastered: 0.8 }),
    scene("7-2", { items: 10, seen: 10, started: true, stillEvaluating: true }),
  ]);
  near(r.coverage, 1, 0.001, "both scenes have been met");
  near(r.mastered, 0.8, 0.001, "…but only one is measured");
  eq(r.measuring, 1);
});
t("an empty volume is safe and says nothing", () => {
  const r = rollUp([]);
  eq(r.items, 0); eq(r.mastered, null); eq(r.done, null); eq(r.scenes, 0);
  eq(rollUp(null).items, 0);
});

console.log("=== per volume ===");
const mastery = {
  scenes: [
    scene("2-1", { items: 20, seen: 20, started: true, mastered: 0.9 }),
    scene("5-3", { items: 20, seen: 10, started: true, mastered: 0.6 }),
    scene("7-1", { items: 20, seen: 4, started: true, stillEvaluating: true }),
    scene("11-2", { items: 20 }),                       // untouched
    scene("Culture talk", { items: 5, seen: 5, started: true, mastered: 1 }),
  ],
};
t("volumes split on the curriculum's own act ranges", () => {
  const { volumes } = volumeProgress(mastery);
  const v1 = volumes.find((v) => v.volume === 1);
  const v2 = volumes.find((v) => v.volume === 2);
  eq(v1.scenes, 2, "acts 2 and 5 are Volume 1");
  eq(v2.scenes, 2, "acts 7 and 11 are Volume 2");
});
t("material outside the act range is excluded, not misfiled", () => {
  const { volumes, overall } = volumeProgress(mastery);
  const total = volumes.reduce((n, v) => n + v.scenes, 0);
  eq(total, 4, "'Culture talk' belongs to no act and must not land in a volume");
  eq(overall.scenes, 4);
});
t("a volume with only unmeasured scenes reports null mastery, not zero", () => {
  const v2 = volumeProgress(mastery).volumes.find((v) => v.volume === 2);
  eq(v2.mastered, null);
  eq(v2.started, 1, "one of its two scenes has been touched");
});
t("every configured volume appears, including ones never opened", () => {
  const { volumes } = volumeProgress({ scenes: [scene("2-1", { started: true, seen: 10, mastered: 1 })] });
  ok(volumes.length >= 2, "Volume 2 should still be listed at 0");
  eq(volumes.find((v) => v.volume === 2).items, 0);
});

console.log("=== per act ===");
t("acts come back in book order, scoped to one volume", () => {
  const acts = actProgress(mastery, 1);
  eq(acts.map((a) => a.act).join(","), "2,5");
  eq(actProgress(mastery, 2).map((a) => a.act).join(","), "7,11");
});

console.log("=== the sentence matches the numbers ===");
t("untouched, evaluating and measured each read differently", () => {
  ok(/not started/.test(describeVolume({ items: 40, scenes: 4, started: 0 })));
  ok(/too early/.test(describeVolume({ items: 40, scenes: 4, started: 1, coverage: 0.1, mastered: null })));
  ok(/holding/.test(describeVolume({ items: 40, scenes: 4, started: 1, coverage: 0.5, mastered: 0.8 })));
  ok(/nothing from this volume/.test(describeVolume({ items: 0 })));
  ok(typeof describeVolume(null) === "string");
});

console.log(`\nall ${run} progress tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
