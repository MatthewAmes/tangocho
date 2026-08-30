// Tests for the answer-time reward moments (tools/rewards.mjs).
//   node tools/test-rewards.mjs
//
// The property under test is restraint. Anything that fires on most answers is wallpaper,
// so most of these assert that a reward does NOT appear — and that when two do at once,
// exactly one is shown.
import {
  rewardsFor, topReward, personalBests, cueFreeStreak, memoryCheckAhead, bestKey, secs,
  NO_HINT_STREAK, PR_MARGIN, PR_MIN_PRIORS,
} from "./rewards.mjs";
import { CUE, MEMORY_CHECK_DAYS } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "") + " expected " + b + ", got " + a); };
const ok = (cond, m) => { if (!cond) throw new Error(m || "expected truthy"); };

// A typed answer: format "type" is what skillForFormat calls production, and the two have
// to agree here or the bucket key under test is not the one the app would build.
const ans = (over = {}) => ({ id: "z1", skill: "production", format: "type", ok: true, ms: 3000, cue: CUE.CHOOSE, comeback: false, ...over });
const free = (over = {}) => ans({ cue: CUE.FREE, ...over });
const kinds = (list) => list.map((r) => r.kind).join(",");

console.log("=== the ordinary answer earns nothing ===");
t("a plain correct answer produces no reward", () => {
  eq(rewardsFor(ans()).length, 0);
  eq(topReward(ans()), null);
});
t("a miss produces no reward, whatever else is true of it", () => {
  eq(rewardsFor(ans({ ok: false, comeback: true, cue: CUE.FREE })).length, 0);
});
t("a missing answer is safe", () => { eq(rewardsFor(null).length, 0); });

console.log("=== the memory check, announced before the reveal ===");
t("fires at the threshold, not below it", () => {
  eq(memoryCheckAhead(MEMORY_CHECK_DAYS - 0.01), false);
  eq(memoryCheckAhead(MEMORY_CHECK_DAYS), true);
  eq(memoryCheckAhead(400), true);
});
t("a card with no stability at all does not announce one", () => {
  eq(memoryCheckAhead(0), false);
  eq(memoryCheckAhead(null), false);
  eq(memoryCheckAhead(undefined), false);
});

console.log("=== the comeback ===");
t("a landed rescue is called out", () => {
  const r = rewardsFor(ans({ comeback: true }));
  eq(kinds(r), "comeback");
});
t("a rescue rung that was missed is not a comeback", () => {
  eq(rewardsFor(ans({ ok: false, comeback: true })).length, 0);
});

console.log("=== the no-hint run ===");
const priorFree = (n) => Array.from({ length: n }, () => free());
t("two unaided wins are not yet a run", () => {
  eq(rewardsFor(free(), { priorRows: priorFree(1) }).length, 0);
});
t("the third fires", () => {
  eq(kinds(rewardsFor(free(), { priorRows: priorFree(2) })), "no-hint");
});
t("the fourth and fifth stay quiet, the sixth fires again", () => {
  eq(rewardsFor(free(), { priorRows: priorFree(3) }).length, 0);
  eq(rewardsFor(free(), { priorRows: priorFree(4) }).length, 0);
  eq(kinds(rewardsFor(free(), { priorRows: priorFree(5) })), "no-hint");
});
t("the run says how long it is", () => {
  const r = rewardsFor(free(), { priorRows: priorFree(2) })[0];
  eq(r.streak, NO_HINT_STREAK);
});
t("a hinted success breaks the run — it had help", () => {
  eq(cueFreeStreak([free(), ans({ cue: CUE.PARTIAL }), free()], free()), 2);
});
t("a miss breaks the run", () => {
  eq(cueFreeStreak([free(), free(), free({ ok: false })], free()), 1);
});
t("a cued answer is never the end of a run at all", () => {
  eq(cueFreeStreak(priorFree(5), ans({ cue: CUE.STRONG })), 0);
});
t("contextual production counts as unaided — it is above free, not below", () => {
  eq(cueFreeStreak(priorFree(2), ans({ cue: CUE.CONTEXT })), 3);
});

console.log("=== the personal record ===");
const log = (rows) => personalBests(rows);
t("bests are per item, per skill and per format", () => {
  const b = log([
    { id: "z1", skill: "production", format: "type", ok: true, ms: 5000 },
    { id: "z1", skill: "recognition", format: "mc", ok: true, ms: 900 },
  ]);
  eq(b.size, 2, "one bucket per kind of race");
  eq(b.get(bestKey({ id: "z1", skill: "production", format: "type" })).ms, 5000);
});
t("a wrong answer's timing never becomes the record to beat", () => {
  const b = log([{ id: "z1", skill: "production", format: "type", ok: false, ms: 200 }]);
  eq(b.size, 0);
});
t("an untimed answer is not a time", () => {
  eq(log([{ id: "z1", skill: "production", format: "type", ok: true, ms: 0 }]).size, 0);
});
t("the record is the minimum, and the count is every attempt", () => {
  const b = log([
    { id: "z1", skill: "production", format: "type", ok: true, ms: 5000 },
    { id: "z1", skill: "production", format: "type", ok: true, ms: 3000 },
    { id: "z1", skill: "production", format: "type", ok: true, ms: 4000 },
  ]);
  const row = b.get(bestKey(ans()));
  eq(row.ms, 3000);
  eq(row.n, 3);
});

const bestsOf = (ms, n) => new Map([[bestKey(ans()), { ms, n }]]);
t("the second sighting of an item is never a record", () => {
  eq(rewardsFor(ans({ ms: 100 }), { bests: bestsOf(9000, PR_MIN_PRIORS - 1) }).length, 0);
});
t("a hair faster is not a record", () => {
  eq(rewardsFor(ans({ ms: 3990 }), { bests: bestsOf(4000, 5) }).length, 0);
});
t("beating it by the margin is", () => {
  const r = rewardsFor(ans({ ms: Math.floor(4000 * PR_MARGIN) }), { bests: bestsOf(4000, 5) });
  eq(kinds(r), "speed-pr");
});
t("the record reads as the improvement it was", () => {
  const r = rewardsFor(ans({ ms: 11200 }), { bests: bestsOf(18400, 4) })[0];
  eq(r.detail, "18.4s to 11.2s");
  eq(r.from, 18400);
  eq(r.to, 11200);
});
t("a different format is a different race and cannot break this record", () => {
  eq(rewardsFor(ans({ format: "mc", ms: 100 }), { bests: bestsOf(9000, 9) }).length, 0);
});
t("no history at all means no record", () => {
  eq(rewardsFor(ans({ ms: 50 }), {}).length, 0);
  eq(rewardsFor(ans({ ms: 50 }), { bests: new Map() }).length, 0);
});

console.log("=== only one of them is ever shown ===");
t("a comeback that is also a record and a run shows the comeback", () => {
  const r = rewardsFor(free({ comeback: true, ms: 500 }), {
    priorRows: priorFree(2), bests: bestsOf(9000, 6),
  });
  eq(r.length, 3, "all three were earned");
  eq(topReward(free({ comeback: true, ms: 500 }), { priorRows: priorFree(2), bests: bestsOf(9000, 6) }).kind, "comeback");
});
t("a record outranks a run", () => {
  const ctx = { priorRows: priorFree(2), bests: bestsOf(9000, 6) };
  eq(topReward(free({ ms: 500 }), ctx).kind, "speed-pr");
});
t("every reward carries a title and a detail worth reading", () => {
  const r = rewardsFor(free({ comeback: true, ms: 500 }), { priorRows: priorFree(2), bests: bestsOf(9000, 6) });
  for (const x of r) {
    ok(x.title && x.detail, JSON.stringify(x));
    ok(!/undefined|NaN/.test(x.title + x.detail), "placeholder leaked into " + x.kind);
  }
});

console.log("=== formatting ===");
t("times read to one decimal", () => {
  eq(secs(11200), "11.2s");
  eq(secs(950), "1.0s");
  eq(secs(0), "0.0s");
});

console.log("\nall " + run + " reward tests " + (fail ? "— " + fail + " FAILED" : "passed"));
process.exit(fail ? 1 : 0);
