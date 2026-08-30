// Tests for the fatigue model and adaptive stopping (tools/fatigue.mjs).
//
//   node tools/test-fatigue.mjs
import { fatigueFrom, shouldStop, STOP, STOP_NOTE, FATIGUE } from "./fatigue.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const lt = (a, b, m) => { if (!(a < b)) throw new Error(`${m || ""} expected ${a} < ${b}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };

const FAST = 1500;
const ev = (ok, ms) => ({ ok, ms, fastMs: FAST });
const run_ = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

console.log("=== the confound: working hard must not read as tired ===");
t("slow and often wrong is NOT fatigue — that is desirable difficulty succeeding", () => {
  // the scheduler aims at ~72% success, so a real session HAS misses; they are just slow ones
  const working = run_(20, (i) => ev(i % 4 !== 0, 7000));
  lt(fatigueFrom(working).level, 0.2, "effortful retrieval was read as fatigue");
});
t("fast and RIGHT is not fatigue either — that is fluency", () => {
  const fluent = run_(20, () => ev(true, 700));
  lt(fatigueFrom(fluent).level, 0.2);
});
t("fast and WRONG is the signal, and it dominates", () => {
  const guessing = run_(20, () => ev(false, 500));
  gt(fatigueFrom(guessing).level, 0.5, "rapid guessing should register strongly");
  if (!fatigueFrom(guessing).reasons.some((r) => /fast and wrong/.test(r))) {
    throw new Error("should name rapid guessing as the reason");
  }
});
t("a learner who is simply slow overall is not marked tired", () => {
  // fastMs is per-learner, so a deliberate thinker never trips the rapid-guess term
  const slowThinker = run_(20, (i) => ({ ok: i % 4 !== 0, ms: 20000, fastMs: 9000 }));
  lt(fatigueFrom(slowThinker).level, 0.2);
});

console.log("\n=== the supporting signals ===");
t("a slump is measured against this session's own opening, not a global standard", () => {
  const strongStart = [...run_(10, () => ev(true, 3000)), ...run_(10, () => ev(false, 3000))];
  const evenlyBad  = run_(20, () => ev(false, 3000));
  gt(fatigueFrom(strongStart).parts.slump, 0, "a real collapse should register");
  eq(fatigueFrom(evenlyBad).parts.slump, 0, "uniformly hard is not a slump");
});
t("a small dip is not a slump", () => {
  const slightDip = [...run_(10, () => ev(true, 3000)), ...run_(10, (i) => ev(i > 0, 3000))];
  eq(fatigueFrom(slightDip).parts.slump, 0);
});
t("length alone barely moves it", () => {
  const longButFine = run_(60, () => ev(true, 3000));
  lt(fatigueFrom(longButFine).level, 0.25, "a long good session is not a tired one");
});

console.log("\n=== refusing to guess ===");
t("too few answers says nothing at all", () => {
  const r = fatigueFrom(run_(3, () => ev(false, 300)));
  eq(r.level, 0);
  eq(r.confident, false);
});
t("empty and malformed input are safe", () => {
  eq(fatigueFrom([]).level, 0);
  eq(fatigueFrom(undefined).level, 0);
  eq(fatigueFrom([{}, null, { ok: "yes" }]).level, 0);
});
t("untimed answers cannot signal rapid guessing", () => {
  const untimed = run_(20, () => ({ ok: false, ms: 0, fastMs: 0 }));
  eq(fatigueFrom(untimed).parts.guessRate, 0, "no timing means no guess signal");
});
t("the level is always a probability", () => {
  for (const evs of [run_(40, () => ev(false, 100)), run_(40, () => ev(true, 100)), run_(7, () => ev(false, 200))]) {
    const l = fatigueFrom(evs).level;
    if (l < 0 || l > 1) throw new Error("level out of range: " + l);
  }
});

console.log("\n=== stopping ===");
t("never stops a session before it has done anything", () => {
  eq(shouldStop({ done: 2, planned: 20, fatigue: 1, remainingValue: 0 }).stop, false);
  eq(shouldStop({ done: STOP.minItems - 1, planned: 20, fatigue: 1 }).stop, false);
});
t("stops when the plan is finished", () => {
  const r = shouldStop({ done: 20, planned: 20, fatigue: 0, remainingValue: 1 });
  eq(r.stop, true); eq(r.reason, "done");
});
t("stops early when the learner is spent", () => {
  const r = shouldStop({ done: 12, planned: 30, fatigue: 0.8, remainingValue: 1 });
  eq(r.stop, true); eq(r.reason, "fatigue");
});
t("stops when nothing left is worth practising", () => {
  const r = shouldStop({ done: 12, planned: 30, fatigue: 0, remainingValue: 0.02 });
  eq(r.stop, true); eq(r.reason, "nothing-left");
});
t("keeps going through a normal hard session", () => {
  eq(shouldStop({ done: 12, planned: 30, fatigue: 0.2, remainingValue: 0.8 }).stop, false);
});
t("every stop reason has something true to say", () => {
  for (const reason of ["done", "fatigue", "nothing-left"]) {
    const note = STOP_NOTE[reason];
    if (!note || note.length < 12) throw new Error("no copy for " + reason);
    if (/tired|lazy|failed|wrong/i.test(note)) throw new Error("stop copy should not scold: " + note);
  }
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} fatigue tests passed`);
process.exit(fail ? 1 : 0);
