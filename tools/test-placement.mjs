/* Tests for adaptive placement (tools/placement.mjs).
 *
 * The properties worth pinning: that the search actually converges instead of sweeping,
 * that it never claims more than five answers can support, and that a probe is answerable
 * (four distinct choices, the right one among them).
 *
 *   node tools/test-placement.mjs
 */
import {
  startPlacement, nextAct, recordProbe, placementResult, buildProbe, verdictFor,
  PROBE_SIZE, MAX_QUESTIONS, START_ACT,
} from "./placement.mjs";
import { SEED } from "../src/data/seed.js";
import { provenanceOf } from "./curriculum.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const DECK = SEED.map((c, i) => ({ ...c, id: "card" + i }));
const BY_ACT = (() => {
  const out = {};
  for (const c of DECK) { const a = provenanceOf(c).act; if (Number.isFinite(a)) (out[a] || (out[a] = [])).push(c); }
  return out;
})();

/* Simulate a learner whose real frontier is `trueAct`: everything below is solid, everything
   at or above is guesswork. */
const simulate = (trueAct, opts = {}) => {
  let s = startPlacement(opts);
  let guard = 0;
  while (!s.done && guard++ < 30) {
    const act = s.next;
    const correct = act < trueAct ? PROBE_SIZE : act > trueAct ? 0 : 3;
    s = recordProbe(s, act, correct, PROBE_SIZE);
  }
  return s;
};

console.log("=== the search converges ===");

t("a cold start opens at the midpoint, not at act 1", () => {
  eq(startPlacement().next, START_ACT);
});

t("THE POINT: it finds the frontier in far fewer questions than a sweep", () => {
  for (const trueAct of [2, 4, 6, 8, 11]) {
    const s = simulate(trueAct);
    const r = placementResult(s);
    ok(s.asked <= MAX_QUESTIONS, `asked ${s.asked} for frontier ${trueAct}`);
    ok(s.probes.length <= 6, `probed ${s.probes.length} acts to find ${trueAct} — that is a sweep`);
    ok(r.frontier != null, "it should land somewhere");
    ok(Math.abs(r.frontier - trueAct) <= 1,
      `frontier ${r.frontier} should be within one act of the real ${trueAct}`);
  }
});

t("it always terminates, even when every probe is mixed", () => {
  let s = startPlacement();
  let guard = 0;
  while (!s.done && guard++ < 40) s = recordProbe(s, s.next, 3, PROBE_SIZE);
  ok(s.done, "the search must finish");
  ok(guard < 40, "and not by hitting the guard");
});

t("it never probes the same act twice", () => {
  const s = simulate(7);
  const seen = new Set();
  for (const p of s.probes) {
    ok(!seen.has(p.act), "act " + p.act + " was probed twice");
    seen.add(p.act);
  }
});

t("the question budget is respected", () => {
  const s = simulate(6, { maxQuestions: 10 });
  ok(s.asked <= 15, "asked " + s.asked + " against a 10-question budget");
});

console.log("\n=== it claims only what five answers support ===");

t("verdicts are coarse on purpose", () => {
  eq(verdictFor(5, 5), "solid");
  eq(verdictFor(4, 5), "solid");
  eq(verdictFor(3, 5), "mixed");
  eq(verdictFor(2, 5), "new");
  eq(verdictFor(0, 5), "new");
  eq(verdictFor(0, 0), "none");
});

t("the result is a RANGE, never a level or a score", () => {
  const r = placementResult(simulate(7));
  ok(!("level" in r) && !("score" in r), "no level, no score");
  ok("solidThrough" in r && "newFrom" in r, "a range instead");
});

t("with no probes at all it says so rather than guessing", () => {
  const r = placementResult(startPlacement());
  eq(r.frontier, null);
  ok(/not enough/i.test(r.summary), r.summary);
});

t("the summary names the acts it is talking about", () => {
  const r = placementResult(simulate(8));
  ok(/Act/i.test(r.summary), r.summary);
});

console.log("\n=== the questions are answerable ===");

t("a probe gives four distinct choices with the answer among them", () => {
  const qs = buildProbe(6, BY_ACT, { seed: 42 });
  ok(qs.length > 0, "act 6 should yield questions");
  for (const q of qs) {
    eq(q.choices.length, 4, "four options");
    eq(new Set(q.choices).size, 4, "all distinct: " + JSON.stringify(q.choices));
    ok(q.choices.includes(q.answer), "the answer must be on offer");
    ok(q.term && q.id, "and the question must name its card");
  }
});

t("distractors come from other acts, so a miss means the word", () => {
  const qs = buildProbe(6, BY_ACT, { seed: 7 });
  const mine = new Set((BY_ACT[6] || []).map((c) => c.meaning));
  let borrowed = 0;
  for (const q of qs) for (const c of q.choices) if (c !== q.answer && !mine.has(c)) borrowed++;
  ok(borrowed > 0, "at least some distractors should be from elsewhere");
});

t("the same seed asks the same questions", () => {
  const a = buildProbe(6, BY_ACT, { seed: 5 }).map((q) => q.id + "|" + q.choices.join(","));
  const b = buildProbe(6, BY_ACT, { seed: 5 }).map((q) => q.id + "|" + q.choices.join(","));
  eq(a.join(";"), b.join(";"), "a placement that reshuffles cannot be compared against");
});

t("a different seed asks different questions", () => {
  const a = buildProbe(6, BY_ACT, { seed: 1 }).map((q) => q.id).join(",");
  const b = buildProbe(6, BY_ACT, { seed: 99 }).map((q) => q.id).join(",");
  ok(a !== b, "retaking it should not be the same five cards");
});

t("an act with no material yields nothing rather than a broken question", () => {
  eq(buildProbe(999, BY_ACT).length, 0);
  eq(buildProbe(6, {}).length, 0);
});

t("every act in the deck can actually be probed", () => {
  for (const act of Object.keys(BY_ACT).map(Number)) {
    const qs = buildProbe(act, BY_ACT, { seed: 3 });
    ok(qs.length > 0, "act " + act + " produced no questions");
  }
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} placement tests passed`);
process.exitCode = fail ? 1 : 0;
