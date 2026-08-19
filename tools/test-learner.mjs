// Tests for the learner model. The failure mode here is not a crash — it is the app
// confidently reporting an ability it has never measured, so most of these assert what
// the model must REFUSE to claim.
//
//   node tools/test-learner.mjs
import {
  SKILLS, skillForFormat, CUE, cueFor, maskReading, cueHint,
  classifyFailure, editDistance, makeEvidence, profileFrom, confidenceFor,
  CONFIDENCE, biggestGap, explainPick, summarise,
  DIRECTIONS, pushRecent, recentAcc, predictSuccess, chooseIntervention, skillAfterFailure,
  posterior, stateOf, STATE, practiceValue, abilityFrom, planAfterFailure,
  latencyNorms, latencyVerdict, confusionFrom,
} from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lt = (a, b, m) => { if (!(a < b)) throw new Error(`${m || ""} expected ${a} < ${b}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const lte = (a, b, m) => { if (!(a <= b)) throw new Error(`${m || ""} expected ${a} <= ${b}`); };

console.log("=== which skill an exercise measures ===");
t("each format maps to the ability it actually tests", () => {
  eq(skillForFormat("mc"), "recognition");
  eq(skillForFormat("recall"), "recognition");
  eq(skillForFormat("type"), "production");
  eq(skillForFormat("listen"), "listening");
  eq(skillForFormat("cloze"), "context");
});
t("an introduction produces no evidence", () => {
  // Being shown a word is not a measurement of anything.
  eq(skillForFormat("learn"), null);
});

console.log("\n=== cue strength ===");
t("a first production attempt gets help, not a cold start", () => {
  eq(cueFor({ tried: false }), CUE.STRONG);
});
t("support decreases as the ability strengthens", () => {
  // The scale ascends by RETRIEVAL DEMAND: 0 is being shown the answer, 5 is producing it
  // in a sentence. So less support is a HIGHER number.
  const weak = cueFor({ tried: true, acc: 0.4, S: 1 });
  const mid = cueFor({ tried: true, acc: 0.8, S: 5 });
  const strong = cueFor({ tried: true, acc: 0.95, S: 30 });
  gt(mid, weak, "a developing ability should be asked for more than a weak one");
  gt(strong, mid, "a strong ability should be asked for more again");
});
t("a failure earns support back", () => {
  const before = cueFor({ tried: true, acc: 0.95, S: 30 });
  const after = cueFor({ tried: true, acc: 0.95, S: 30, lastFailed: true });
  lt(after, before, "after a miss the next attempt should demand less, not more");
});
t("contextual production is only offered when context is allowed", () => {
  const st = { tried: true, acc: 0.98, S: 90 };
  eq(cueFor(st, { allowContext: false }), CUE.FREE);
  eq(cueFor(st, { allowContext: true }), CUE.CONTEXT);
});
t("masking reveals a prefix and blanks the rest", () => {
  eq(maskReading("かようび", 1), "か＿＿＿");
  eq(maskReading("かようび", 3), "かよう＿");
  eq(maskReading("かようび", 0), "＿＿＿＿");
  eq(maskReading("かようび", 9), "かようび", "never invent characters");
});
t("the hint gets shorter as the cue level drops", () => {
  const r = "かようび";
  eq(cueHint(r, CUE.SHOWN), "かようび");
  eq(cueHint(r, CUE.STRONG), "か＿＿＿");
  eq(cueHint(r, CUE.PARTIAL), "かよ＿＿");
  eq(cueHint(r, CUE.FREE), "＿＿＿＿");
});
t("hinting an empty reading is harmless", () => {
  eq(cueHint("", CUE.STRONG), "");
  eq(cueHint(undefined, CUE.FREE), "");
});

console.log("\n=== failure classification ===");
t("a near-miss on a typed reading is a reading fumble, not ignorance", () => {
  // The learner clearly retrieved the word and mis-spelled the reading. Treating that as
  // "does not know this word" would send them back to multiple choice for no reason.
  eq(classifyFailure({ format: "type", expected: "かようび", got: "かよおび" }), "reading");
});
t("a completely different answer is a production failure", () => {
  eq(classifyFailure({ format: "type", expected: "かようび", got: "たべもの" }), "production");
});
t("an empty answer is recorded as blank, not as a wrong answer", () => {
  eq(classifyFailure({ format: "type", expected: "かようび", got: "   " }), "blank");
});
t("format determines the failure type for non-typed exercises", () => {
  eq(classifyFailure({ format: "listen" }), "listening");
  eq(classifyFailure({ format: "mc" }), "meaning");
  eq(classifyFailure({ format: "cloze" }), "context");
});
t("edit distance behaves", () => {
  eq(editDistance("abc", "abc"), 0);
  eq(editDistance("abc", "abd"), 1);
  eq(editDistance("", "abc"), 3);
});

console.log("\n=== the profile refuses to overclaim ===");
const ev = (skill, ok, at = Date.now()) => makeEvidence({ id: "x", deck: "vocab", format: skill === "production" ? "type" : "mc", skill, ok, at });

t("no evidence means no number, not zero", () => {
  const p = profileFrom([]);
  for (const s of SKILLS) {
    eq(p[s].rate, null, `${s} should have no rate`);
    eq(p[s].confidence, CONFIDENCE.NONE);
  }
});
t("a handful of answers is reported as still evaluating", () => {
  const p = profileFrom([ev("recognition", true), ev("recognition", true), ev("recognition", false)]);
  eq(p.recognition.confidence, CONFIDENCE.LOW);
  eq(confidenceFor(4), CONFIDENCE.LOW);
  eq(confidenceFor(12), CONFIDENCE.OK);
  eq(confidenceFor(40), CONFIDENCE.GOOD);
});
t("old evidence falls out of the window", () => {
  const old = Date.now() - 200 * 86400000;
  const p = profileFrom([ev("recognition", true, old), ev("recognition", true, old)], { days: 60 });
  eq(p.recognition.n, 0, "evidence from six months ago should not describe today");
});

console.log("\n=== biggest gap ===");
t("nothing is claimed without enough evidence on both sides", () => {
  const thin = [...Array(3)].map(() => ev("production", false));
  eq(biggestGap(profileFrom(thin)), null);
});
t("nothing is claimed when the abilities are level", () => {
  const evs = [];
  for (let i = 0; i < 20; i++) { evs.push(ev("recognition", i % 10 !== 0)); evs.push(ev("production", i % 10 !== 0)); }
  eq(biggestGap(profileFrom(evs)), null, "a flat profile has no headline");
});
t("a real spread names the weakest ability", () => {
  const evs = [];
  for (let i = 0; i < 20; i++) evs.push(ev("recognition", true));
  for (let i = 0; i < 20; i++) evs.push(ev("production", i < 8));
  const gap = biggestGap(profileFrom(evs));
  ok(gap, "expected a gap");
  eq(gap.skill, "production");
  eq(gap.ahead, "recognition");
});

console.log("\n=== explanations ===");
t("every explanation is plain language with no scheduler jargon", () => {
  const cases = [
    { fresh: true },
    { staleReason: "decay" },
    { staleReason: "annual_check" },
    { format: "listen" },
    { format: "mc" },
    { format: "type", recognition: { S: 60 }, production: { tried: false } },
    {},
  ];
  const banned = /stability|retrievability|FSRS|interval|difficulty rating|weight/i;
  for (const c of cases) {
    const s = explainPick(c);
    ok(s && s.length > 10, "expected a real sentence");
    ok(!banned.test(s), `leaked scheduler vocabulary: ${s}`);
  }
});
t("strong recognition with untried production is explained as such", () => {
  const s = explainPick({ format: "type", recognition: { S: 60 }, production: { tried: false } });
  ok(/produce/i.test(s), `expected production framing, got: ${s}`);
});

console.log("\n=== session summary ===");
t("the summary counts what happened without inventing mastery", () => {
  const evs = [
    makeEvidence({ id: "a", deck: "vocab", format: "mc", ok: true }),
    makeEvidence({ id: "a", deck: "vocab", format: "type", ok: false, failure: "reading" }),
    makeEvidence({ id: "b", deck: "vocab", format: "listen", ok: true }),
    makeEvidence({ id: "c", deck: "kanji", format: "mc", ok: false, failure: "meaning" }),
  ];
  const s = summarise(evs);
  eq(s.answered, 4);
  eq(s.correct, 2);
  eq(s.items, 3, "the same word answered twice is one item");
  ok(s.skillsWorked.includes("recognition"));
  ok(s.skillsWorked.includes("production"));
  ok(s.skillsWorked.includes("listening"));
  eq(s.failures.reading, 1);
  eq(s.failures.meaning, 1);
});
t("an empty session summarises to nothing rather than crashing", () => {
  const s = summarise([]);
  eq(s.answered, 0);
  eq(s.commonestFailure, null);
});

console.log("\n=== rolling recent history ===");
t("recent history keeps the newest results and caps its length", () => {
  let r = "";
  for (let i = 0; i < 15; i++) r = pushRecent(r, i % 2 === 0);
  eq(r.length, 10, "should cap");
  eq(r.slice(-1), "1", "newest last");
});
t("recent accuracy distinguishes deterioration from lifetime average", () => {
  // The failure of the old proxy: 78% lifetime with a recent collapse looked identical to
  // 78% lifetime doing fine, unless the current streak happened to expose it.
  const collapsing = recentAcc("1111100000", 5);
  const recovering = recentAcc("0000011111", 5);
  eq(collapsing.rate, 0);
  eq(recovering.rate, 1);
});
t("no history reports null, not zero", () => {
  eq(recentAcc(""), null);
  eq(recentAcc(undefined), null);
});

console.log("\n=== predicted success ===");
t("more help means a higher predicted success", () => {
  const st = { tried: true, acc: 0.7, S: 10, recent: "1101101" };
  gt(predictSuccess(st, CUE.CHOOSE), predictSuccess(st, CUE.FREE));
});
t("recent performance outweighs lifetime when they disagree", () => {
  const same = { tried: true, acc: 0.8, S: 10 };
  const collapsed = { ...same, recent: "00000" };
  const strong = { ...same, recent: "11111" };
  gt(predictSuccess(strong, CUE.PARTIAL), predictSuccess(collapsed, CUE.PARTIAL));
});
t("an untried ability is not assumed competent", () => {
  lt(predictSuccess({ tried: false }, CUE.FREE), 0.5);
});

console.log("\n=== the intervention ===");
const caps = { type: true, listen: true, context: true };
// Fixtures carry `seen` because that is what skillOf() produces — an ability estimate is
// built from a trial COUNT, and shorthand without one reads as no evidence at all.
const strongRec = { seen: 30, correct: 29, tried: true, acc: 0.97, S: 60, recent: "1111111111" };

t("a never-seen word is shown, not tested", () => {
  const iv = chooseIntervention({ fresh: true, step: 0, caps, recognition: {}, production: {} });
  eq(iv.format, "learn");
  eq(iv.cue, CUE.SHOWN);
});
t("cue is chosen so the exercise is hard but still winnable", () => {
  // Only production capable, so the target is a MEASURED ability rather than an unmeasured
  // one — an untried skill is honestly predicted around 0.55 and that is not the case here.
  const iv = chooseIntervention({ caps: { type: true }, recognition: strongRec,
    production: { seen: 20, correct: 19, tried: true, acc: 0.95, S: 40, recent: "1111111111" } });
  // Which ability wins is not the point here — both are strong and it may pick either.
  gt(iv.expected, 0.6, "should not pick a cue the learner will fail");
  gt(iv.cue, CUE.CHOOSE, "a strong ability should be asked for more than multiple choice");
});
t("format is a consequence of skill and cue, not chosen directly", () => {
  const weak = chooseIntervention({ caps: {}, recognition: { seen: 20, correct: 6, tried: true, acc: 0.3, S: 1, recent: "0000" } });
  eq(weak.skill, "recognition");
  eq(weak.format, "mc", "a struggling reader gets options");
  const solid = chooseIntervention({ caps: {}, recognition: strongRec });
  eq(solid.format, "recall", "a solid reader gets cold recall — same skill, harder cue");
  gt(solid.cue, weak.cue);
});
t("the weakest unlocked ability is targeted", () => {
  const iv = chooseIntervention({
    caps, recognition: strongRec,
    production: { seen: 20, correct: 7, tried: true, acc: 0.35, S: 2, recent: "00100" },
  });
  eq(iv.skill, "production", "strong recognition + weak production must target production");
});
t("an unmeasured ability does not monopolise the session", () => {
  /* Scoring "no evidence" as automatically worst meant listening and context — which the
     app does not yet populate — won every single session, starving an ability that was
     genuinely failing. Unmeasured is a reason to sample, not a reason to always win. */
  const iv = chooseIntervention({
    caps, recognition: strongRec,
    production: { seen: 20, correct: 3, tried: true, acc: 0.15, S: 1, recent: "00000" },
    listening: {}, context: {},
  });
  eq(iv.skill, "production", "a failing ability must outrank an unmeasured one");
});
t("an untried ability is still preferred over a healthy one", () => {
  const iv = chooseIntervention({ caps, recognition: strongRec, production: { tried: false } });
  eq(iv.skill, "production");
});
t("a locked ability is never targeted", () => {
  // Production stays locked until the word can be read at all.
  const iv = chooseIntervention({ caps, recognition: { tried: true, acc: 0.4, S: 1, recent: "0100" }, production: { tried: false } });
  eq(iv.skill, "recognition");
});
t("capabilities still gate everything", () => {
  const iv = chooseIntervention({ caps: { type: false, listen: false, context: false }, recognition: strongRec, production: { tried: false } });
  eq(iv.skill, "recognition");
  ok(iv.format !== "type" && iv.format !== "listen" && iv.format !== "cloze");
});
t("every intervention names a direction", () => {
  const iv = chooseIntervention({ caps, recognition: strongRec, production: { tried: false } });
  ok(Object.values(DIRECTIONS).includes(iv.direction), "got " + iv.direction);
});

console.log("\n=== failure changes the next intervention ===");
t("a reading fumble redirects to producing the form, not another meaning card", () => {
  // This is the loop the review called decorative: classification existed and changed nothing.
  const iv = chooseIntervention({
    caps, recognition: strongRec,
    production: { seen: 15, correct: 12, tried: true, acc: 0.8, S: 20, recent: "1111" },
    lastFailure: "reading",
  });
  eq(iv.skill, "production");
});
t("drawing a blank goes back to the meaning", () => {
  const iv = chooseIntervention({
    caps, recognition: strongRec,
    production: { seen: 15, correct: 12, tried: true, acc: 0.8, S: 20, recent: "111" },
    lastFailure: "blank",
  });
  eq(iv.skill, "recognition");
});
t("a miss hands support back", () => {
  const base = { caps: { type: true }, recognition: strongRec, production: { tried: true, acc: 0.9, S: 30, recent: "1111" } };
  const clean = chooseIntervention(base);
  const missed = chooseIntervention({ ...base, lastFailure: "production" });
  lt(missed.cue, clean.cue, "after a miss the next attempt must demand less");
});

console.log("\n=== uncertainty-aware estimates (P1) ===");
t("the same rate from more evidence is a narrower estimate", () => {
  /* This is what the invented "8 observations" constant was standing in for. 72% from four
     answers and 72% from ninety are not the same claim, and a bare rate cannot say so. */
  const thin = posterior(3, 1);
  const thick = posterior(72, 28);
  gt(thin.width, thick.width, "less evidence must mean a wider estimate");
});
t("no evidence at all is maximally uncertain, not zero", () => {
  const none = posterior(0, 0);
  eq(none.observations, 0);
  eq(Math.round(none.mean * 100), 50, "the prior is centred, not pessimistic");
  gt(none.width, 0.4);
});
t("unknown is a separate state from weak", () => {
  // The distinction the review called foundational: nobody has measured this, versus
  // this has been measured and is failing.
  eq(stateOf(posterior(0, 0)), STATE.UNKNOWN);
  eq(stateOf(posterior(1, 1)), STATE.UNKNOWN, "two answers is not a measurement");
  eq(stateOf(posterior(4, 26)), STATE.WEAK, "measured and failing");
  eq(stateOf(posterior(26, 4)), STATE.STABLE);
  eq(stateOf(posterior(60, 2)), STATE.STRONG);
});
t("a failing ability is worth more practice than an unmeasured one", () => {
  const failing = practiceValue(posterior(4, 26));
  const unknown = practiceValue(posterior(0, 0));
  gt(failing, unknown, "weakness should outrank curiosity");
});
t("an unmeasured ability is still worth more than a solid one", () => {
  const unknown = practiceValue(posterior(0, 0));
  const solid = practiceValue(posterior(60, 2));
  gt(unknown, solid, "unmeasured deserves a sample; solid does not need one");
});
t("recent results carry extra weight in the ability estimate", () => {
  const collapsing = abilityFrom({ seen: 20, acc: 0.9, recent: "0000000000" });
  const holding = abilityFrom({ seen: 20, acc: 0.9, recent: "1111111111" });
  gt(holding.mean, collapsing.mean, "a recent collapse must move the estimate");
});

console.log("\n=== failure leads somewhere specific ===");
t("each failure names its own next step, not just 'easier'", () => {
  eq(planAfterFailure("reading").skill, "production", "the word was there; drill the form");
  eq(planAfterFailure("blank").skill, "recognition", "nothing came back; start from meaning");
  eq(planAfterFailure("listening").skill, "listening");
  eq(planAfterFailure("context").skill, "production", "secure the word before using it");
  eq(planAfterFailure(null), null);
});
t("a plan never makes the next attempt harder", () => {
  const base = { caps: { type: true }, recognition: { tried: true, acc: 0.98, S: 60, recent: "1111111111", seen: 20 },
    production: { tried: true, acc: 0.95, S: 40, recent: "1111111111", seen: 20 } };
  const clean = chooseIntervention(base);
  const missed = chooseIntervention({ ...base, lastFailure: "reading" });
  lte(missed.cue, clean.cue, "a miss must not raise the demand");
});

console.log("\n=== latency relative to the learner ===");
const lat = (skill, format, ms, ok = true) => makeEvidence({ id: "x", deck: "vocab", format, skill, ok, ms });
t("no norm yet means no verdict — silence rather than a guess", () => {
  const norms = latencyNorms([lat("production", "type", 3000)]);
  eq(latencyVerdict(9000, "production", "type", norms), null);
});
t("the same duration reads differently for different exercise types", () => {
  /* Four seconds picking one of four options is slow. Four seconds typing かようび is not.
     Three universal thresholds cannot express that. */
  const evs = [];
  for (let i = 0; i < 12; i++) evs.push(lat("recognition", "mc", 1200 + i * 40));
  for (let i = 0; i < 12; i++) evs.push(lat("production", "type", 6000 + i * 100));
  const norms = latencyNorms(evs);
  eq(latencyVerdict(4000, "recognition", "mc", norms), "slow");
  eq(latencyVerdict(4000, "production", "type", norms), "fast");
});
t("wrong answers do not set the norm", () => {
  const evs = [];
  for (let i = 0; i < 12; i++) evs.push(lat("recognition", "mc", 1200, true));
  for (let i = 0; i < 12; i++) evs.push(lat("recognition", "mc", 30000, false));
  const norms = latencyNorms(evs);
  lte(norms["recognition|mc"].median, 2000, "a stalled wrong answer must not become normal");
});

console.log("\n=== learner-specific confusion ===");
t("the words this learner actually mixes up are remembered", () => {
  const evs = [
    makeEvidence({ id: "miru", deck: "vocab", format: "mc", ok: false, confused: "kiku" }),
    makeEvidence({ id: "miru", deck: "vocab", format: "mc", ok: false, confused: "kiku" }),
    makeEvidence({ id: "miru", deck: "vocab", format: "mc", ok: false, confused: "yomu" }),
  ];
  const c = confusionFrom(evs);
  eq(c.get("miru")[0], "kiku", "the most-confused word comes first");
});
t("correct answers contribute no confusion", () => {
  const evs = [makeEvidence({ id: "a", deck: "vocab", format: "mc", ok: true, confused: "b" })];
  eq(confusionFrom(evs).size, 0);
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} learner tests passed`);
process.exit(fail ? 1 : 0);
