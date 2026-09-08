/* Tests for the session planner (tools/planner.mjs).
 *
 * The properties worth pinning are the policy ones, not the arithmetic: that duration is
 * the learner's and composition is the coach's, that an unmeasured ability is sampled
 * rather than crash-prioritised, and that no ability can take the session over.
 *
 *   node tools/test-planner.mjs
 */
import {
  planSession, apportion, practiceShares, blendWeights, describePlan,
  abilitiesFromProfile, biasFor,
  STAGE_PRIORS, MAX_SHARE, DIAGNOSTIC_SHARE, MIN_SLICE_MIN,
} from "./planner.mjs";
import { SKILLS, STATE, posterior, stateOf, chooseIntervention } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };

const total = (plan) => plan.review + plan.slices.reduce((a, s) => a + s.minutes, 0);
const bySkill = (plan) => Object.fromEntries(plan.slices.map((s) => [s.skill, s.minutes]));

/* A confident posterior at a given rate: enough observations that stateOf() will not call
   it unknown. */
const strong = (rate, n = 40) => posterior(rate * n, (1 - rate) * n);

console.log("=== apportionment: the parts sum to the whole ===");

t("shares sum to exactly the minutes asked for", () => {
  for (const mins of [5, 7, 13, 20, 45, 60, 75]) {
    const got = apportion({ a: 0.3, b: 0.3, c: 0.2, d: 0.1, e: 0.1 }, mins);
    const sum = Object.values(got).reduce((x, y) => x + y, 0);
    eq(sum, mins, `for ${mins} minutes:`);
  }
});

t("a zero total plans nothing rather than dividing by zero", () => {
  const got = apportion({ a: 1, b: 1 }, 0);
  eq(Object.values(got).reduce((x, y) => x + y, 0), 0);
});

t("all-zero weights do not produce NaN", () => {
  const got = apportion({ a: 0, b: 0 }, 30);
  ok(Object.values(got).every((v) => Number.isFinite(v)), "every slice is finite");
});

console.log("\n=== duration is the learner's, composition is the coach's ===");

t("the plan always spends exactly the time it was given", () => {
  for (const mins of [5, 10, 20, 30, 45, 60, 75]) {
    const plan = planSession({ minutes: mins, dueLoad: 0.5, stage: "beginner" });
    eq(total(plan), mins, `${mins}-minute session:`);
  }
});

t("the same learner at two durations gets the same shape, not the same minutes", () => {
  const abilities = { listening: strong(0.45), recognition: strong(0.92) };
  const short = planSession({ minutes: 20, abilities, dueLoad: 0.3 });
  const long = planSession({ minutes: 60, abilities, dueLoad: 0.3 });
  const s = bySkill(short), l = bySkill(long);
  ok(l.listening > s.listening, "the longer session buys more listening");
  ok(l.listening / 60 > 0.15, "listening still leads the long session");
  // shape preserved: listening outranks recognition at both lengths
  ok(s.listening > (s.recognition || 0), "listening leads at 20 minutes");
  ok(l.listening > (l.recognition || 0), "listening leads at 60 minutes");
});

t("THE POINT: a weak ability outranks a strong one for the same learner", () => {
  const plan = planSession({
    minutes: 60,
    abilities: { recognition: strong(0.95), listening: strong(0.40), production: strong(0.45) },
    dueLoad: 0.2,
  });
  const m = bySkill(plan);
  ok(m.listening > m.recognition, `listening ${m.listening} should beat recognition ${m.recognition}`);
  ok(m.production > m.recognition, `production ${m.production} should beat recognition ${m.recognition}`);
});

console.log("\n=== unknown is not weak ===");

t("an unmeasured ability is sampled, not handed the session", () => {
  /* Listening has never been tried; recognition is measured and failing. The failing one
     must win, because "we have not measured this" is not evidence of a problem. */
  const plan = planSession({
    minutes: 60,
    abilities: { recognition: strong(0.42), production: strong(0.75), orthography: strong(0.80), context: strong(0.78) },
    dueLoad: 0,
  });
  const m = bySkill(plan);
  const listening = m.listening || 0;
  ok(listening > 0, "the unmeasured ability still gets sampled at all");
  ok(listening <= plan.minutes * DIAGNOSTIC_SHARE + 1,
    `unmeasured listening got ${listening} of ${plan.minutes} — above the diagnostic cap`);
  ok(m.recognition > listening,
    `measured-and-failing recognition (${m.recognition}) must outrank unmeasured listening (${listening})`);
});

t("a fresh learner with no evidence at all still gets a usable plan", () => {
  const plan = planSession({ minutes: 30, abilities: {}, dueLoad: 0 });
  eq(total(plan), 30);
  ok(plan.slices.length >= 2, "more than one thing to do");
  ok(plan.slices.every((s) => s.state === STATE.UNKNOWN), "everything is honestly unknown");
});

t("every unmeasured slice says so, rather than claiming a weakness", () => {
  const plan = planSession({ minutes: 45, abilities: {}, dueLoad: 0 });
  ok(plan.slices.every((s) => /not measured/.test(s.reason)), "reasons do not invent a diagnosis");
});

console.log("\n=== nothing monopolises ===");

t("even a catastrophic ability cannot take the whole session", () => {
  const plan = planSession({
    minutes: 60,
    abilities: {
      listening: strong(0.02, 80),
      recognition: strong(0.9), production: strong(0.9), orthography: strong(0.9), context: strong(0.9),
    },
    dueLoad: 0,
  });
  const m = bySkill(plan);
  ok(m.listening / plan.minutes <= MAX_SHARE + 0.02,
    `listening took ${(m.listening / plan.minutes * 100).toFixed(0)}% — above the ${MAX_SHARE * 100}% cap`);
  ok(plan.slices.length >= 3, "the rest of the language still gets time");
});

console.log("\n=== review protects retention ===");

t("a backlog earns review time; an empty queue does not", () => {
  const none = planSession({ minutes: 60, dueLoad: 0 });
  const some = planSession({ minutes: 60, dueLoad: 1 });
  eq(none.review, 0, "nothing due, no review block");
  ok(some.review > 0, "a full backlog books review time");
  ok(some.review <= 60 * 0.4 + 1, "review still does not eat the session");
});

t("more due means more review", () => {
  const a = planSession({ minutes: 60, dueLoad: 0.2 }).review;
  const b = planSession({ minutes: 60, dueLoad: 0.9 }).review;
  ok(b > a, `review should grow with the backlog (${a} -> ${b})`);
});

console.log("\n=== short sessions stay coherent ===");

t("a 5-minute session plans a couple of things, not a smear across five", () => {
  const plan = planSession({ minutes: 5, abilities: { listening: strong(0.4) }, dueLoad: 0 });
  eq(total(plan), 5);
  ok(plan.slices.length <= 2, `expected at most 2 slices in 5 minutes, got ${plan.slices.length}`);
  ok(plan.slices.every((s) => s.minutes >= MIN_SLICE_MIN || plan.slices.length === 1),
    "no sub-minimum slivers");
});

t("a 75-minute session can use every skill", () => {
  const plan = planSession({
    minutes: 75,
    abilities: Object.fromEntries(SKILLS.map((s) => [s, strong(0.7)])),
    dueLoad: 0.3,
  });
  eq(total(plan), 75);
  ok(plan.slices.length >= 4, `expected a broad plan at 75 minutes, got ${plan.slices.length}`);
});

console.log("\n=== stage shifts the balance ===");

t("priors are a probability distribution per stage", () => {
  for (const [stage, p] of Object.entries(STAGE_PRIORS)) {
    const sum = Object.values(p).reduce((a, b) => a + b, 0);
    near(sum, 1, 0.001, `${stage} priors:`);
    for (const s of SKILLS) ok(s in p, `${stage} is missing a prior for ${s}`);
  }
});

t("an advanced learner spends more on output and input than a beginner", () => {
  const beg = planSession({ minutes: 60, stage: "beginner", dueLoad: 0 });
  const adv = planSession({ minutes: 60, stage: "advanced", dueLoad: 0 });
  const b = bySkill(beg), a = bySkill(adv);
  ok((a.production || 0) > (b.production || 0), "advanced does more production");
  ok((a.recognition || 0) < (b.recognition || 0), "advanced does less explicit recognition");
});

t("an unknown stage falls back to beginner rather than throwing", () => {
  const plan = planSession({ minutes: 30, stage: "wizard", dueLoad: 0 });
  eq(plan.stage, "beginner");
  eq(total(plan), 30);
});

console.log("\n=== the plan can explain itself ===");

t("describePlan names the time, not the algorithm", () => {
  const plan = planSession({ minutes: 60, abilities: { listening: strong(0.4) }, dueLoad: 0.5 });
  const text = describePlan(plan);
  ok(/min/.test(text), "reads as minutes");
  ok(/review/.test(text), "names the review block when there is one");
  ok(!/posterior|weight|prior/i.test(text), "no scheduler vocabulary leaks to the learner");
});

t("an empty plan describes itself as nothing rather than crashing", () => {
  eq(describePlan(planSession({ minutes: 0 })), "");
  eq(describePlan(null), "");
});

console.log("\n=== weighting ===");

t("practiceShares is a distribution over the skills", () => {
  const shares = practiceShares({ listening: strong(0.4), recognition: strong(0.95) });
  const sum = SKILLS.reduce((a, s) => a + shares[s], 0);
  near(sum, 1, 0.001, "shares sum to one:");
  ok(shares.listening > shares.recognition, "the failing skill wants more of the session");
});

t("evidence can overturn the stage prior, not merely nudge it", () => {
  /* The beginner prior puts recognition (0.34) well above listening (0.20). If evidence
     could not overturn that ordering the planner would keep drilling a strength, which is
     the exact failure the spec calls out. */
  const priors = STAGE_PRIORS["beginner"];
  const shares = practiceShares({ recognition: strong(0.95), listening: strong(0.40) });
  const w = blendWeights(priors, shares);
  ok(w.listening > w.recognition,
    `blended listening ${w.listening.toFixed(3)} should beat recognition ${w.recognition.toFixed(3)}`);
});

t("with pull at zero the plan is exactly the stage prior", () => {
  const priors = STAGE_PRIORS["beginner"];
  const shares = practiceShares({ recognition: strong(0.95), listening: strong(0.40) });
  const w = blendWeights(priors, shares, 0);
  for (const s of SKILLS) near(w[s], priors[s], 0.0001, `${s} at pull=0:`);
});

console.log("\n=== feeding the plan back into the session (Phase 4) ===");

t("abilitiesFromProfile turns counts into posteriors, and silence into UNKNOWN", () => {
  const abilities = abilitiesFromProfile({
    listening: { n: 20, ok: 8 },
    recognition: { n: 40, ok: 38 },
  });
  ok(abilities.listening.mean < abilities.recognition.mean, "the weaker skill has the lower estimate");
  eq(stateOf(abilities.production), STATE.UNKNOWN, "a skill with no rows is unknown, not zero");
  ok(abilities.production.mean > 0, "and its estimate is a prior, not a failure");
});

t("bias favours whichever skill is behind its share", () => {
  const plan = planSession({ minutes: 60, abilities: { listening: strong(0.35) }, dueLoad: 0 });
  const bias = biasFor(plan, {});
  const want = Object.fromEntries(plan.slices.map((s) => [s.skill, s.minutes]));
  const leader = plan.slices[0].skill;
  for (const s of SKILLS) {
    if (s === leader) continue;
    if ((want[s] || 0) < want[leader]) ok(bias[leader] > bias[s], `${leader} should be pushed harder than ${s}`);
  }
});

t("THE POINT: bias falls as a skill is served, so the session converges", () => {
  const plan = planSession({ minutes: 60, abilities: { listening: strong(0.35) }, dueLoad: 0 });
  const leader = plan.slices[0].skill;
  const atStart = biasFor(plan, {})[leader];
  const afterSome = biasFor(plan, { [leader]: 5, recognition: 1 })[leader];
  const afterLots = biasFor(plan, { [leader]: 30, recognition: 1 })[leader];
  ok(afterSome < atStart, `serving it should reduce the push (${atStart} -> ${afterSome})`);
  ok(afterLots < 0, `over-serving it should push AWAY (${afterLots})`);
});

t("an empty or missing plan biases nothing", () => {
  eq(Object.keys(biasFor(null, {})).length, 0);
  eq(Object.keys(biasFor({ slices: [] }, {})).length, 0);
});

t("chooseIntervention honours the bias", () => {
  const pick = {
    fresh: false, step: 1,
    caps: { type: true, listen: true, context: true, spell: true },
    /* 'tried' matters: chooseIntervention returns early for a word whose recognition has
       never been attempted, because there is nothing to retrieve yet. */
    recognition: { seen: 40, acc: 0.92, tried: true },
    production: { seen: 20, acc: 0.80, tried: true },
    listening: { seen: 20, acc: 0.78, tried: true },
    context: { seen: 20, acc: 0.79, tried: true },
    orthography: { seen: 20, acc: 0.81, tried: true },
  };
  const baseline = chooseIntervention(pick).skill;
  const zero = chooseIntervention(pick, { skillBias: {} }).skill;
  eq(zero, baseline, "an empty bias must reproduce the untouched choice");
  const pushed = chooseIntervention(pick, { skillBias: { orthography: 0.9 } }).skill;
  eq(pushed, "orthography", "a strong bias should win the slot");
});

t("no bias can unlock an ability the learner is not ready for", () => {
  /* The guard that makes this a budget and not an instruction: production stays shut until
     recognition is demonstrated, however far behind its share production is. */
  const notReady = {
    fresh: false, step: 1,
    caps: { type: false, listen: false, context: false, spell: false },
    /* Recognition HAS been attempted, so the early return does not fire -- but it is not
       holding up, so nothing else unlocks. */
    recognition: { seen: 12, acc: 0.35, tried: true },
    production: {}, listening: {}, context: {}, orthography: {},
  };
  const got = chooseIntervention(notReady, { skillBias: { production: 5, listening: 5 } });
  eq(got.skill, "recognition", "an enormous bias must not unlock a locked ability");
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} planner tests passed`);
process.exitCode = fail ? 1 : 0;
