// Tests for the learner model. The failure mode here is not a crash — it is the app
// confidently reporting an ability it has never measured, so most of these assert what
// the model must REFUSE to claim.
//
//   node tools/test-learner.mjs
import {
  SKILLS, skillForFormat, COGNITIVE_MODES, MODE_LABEL, FORMAT_MODES, modesForFormat,
  CUE, cueFor, maskReading, cueHint,
  classifyFailure, editDistance, makeEvidence, profileFrom, confidenceFor,
  CONFIDENCE, biggestGap, explainPick, summarise,
  DIRECTIONS, pushRecent, recentAcc, predictSuccess, chooseIntervention, skillAfterFailure,
  posterior, stateOf, STATE, practiceValue, abilityFrom, planAfterFailure,
  latencyNorms, latencyVerdict, confusionFrom,
  buildRecovery, FAILURES, scoreAnswer, isMemoryCheck,
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

console.log("\n=== format is not the same thing as cognitive mode ===");
t("every known format maps to at least one mode", () => {
  // The acceptance criterion for MP-13. A format with no mode is a screen nobody can say
  // anything about — it would show up as cognitive variety without being any.
  for (const f of Object.keys(FORMAT_MODES)) {
    const modes = modesForFormat(f);
    ok(modes.length >= 1, f + " maps to no mode");
    for (const m of modes) ok(COGNITIVE_MODES.includes(m), f + " claims an unknown mode: " + m);
  }
});
t("the six formats the session engine emits are all covered", () => {
  // session.mjs FORMATS. If a format can reach an evidence record it must be classified.
  for (const f of ["learn", "mc", "recall", "listen", "type", "cloze"]) {
    ok(modesForFormat(f).length >= 1, f + " is emitted but unclassified");
  }
});
t("the spec's examples come out as the spec states them", () => {
  eq(modesForFormat("mc").join(","), "recognition");
  eq(modesForFormat("type").join(","), "recall,production", "typing is retrieval AND spelling out");
  eq(modesForFormat("listen").join(","), "listening,recognition", "audio choice");
  eq(modesForFormat("build").includes("reconstruction"), true, "a word bank is reassembly");
  eq(modesForFormat("build").includes("production"), false, "a word bank hands over the pieces");
  eq(modesForFormat("match").slice().sort().join(","), "discrimination,recognition");
});
t("one skill can cover two modes — which is the whole point", () => {
  // A listening MC and a listening reassembly are the same SKILL and different work.
  eq(skillForFormat("listen"), "listening");
  ok(modesForFormat("listen").includes("recognition"));
  ok(!modesForFormat("order").includes("recognition"), "reassembly is not recognition");
});
t("an unclassified format returns nothing rather than borrowing a guess", () => {
  eq(modesForFormat("no-such-format").length, 0);
  eq(modesForFormat(undefined).length, 0);
});
t("every mode has a label the UI can print", () => {
  for (const m of COGNITIVE_MODES) ok(MODE_LABEL[m], m + " has no label");
});
t("the returned list cannot be mutated back into the table", () => {
  const a = modesForFormat("mc");
  a.push("transfer");
  eq(modesForFormat("mc").length, 1, "the table leaked a mutable reference");
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
t("the summary groups by cognitive mode as well as by skill", () => {
  const evs = [
    makeEvidence({ id: "a", deck: "vocab", format: "mc", ok: true }),
    makeEvidence({ id: "b", deck: "vocab", format: "type", ok: true }),
  ];
  const s = summarise(evs);
  eq(s.byMode.recognition.n, 1);
  // A typed answer counted toward both of the things it demanded, so the mode columns add
  // up to more than the number of answers. That is the correct reading, not a double count.
  eq(s.byMode.recall.n, 1);
  eq(s.byMode.production.n, 1);
  ok(s.modesWorked.includes("production"));
});
t("two formats can look varied and be the same work", () => {
  // The reason MP-13 exists: mc and match are different screens and mostly one demand.
  const s = summarise([
    makeEvidence({ id: "a", deck: "vocab", format: "mc", ok: true }),
    makeEvidence({ id: "b", deck: "vocab", format: "match", ok: true }),
  ]);
  eq(s.byMode.recognition.n, 2, "both screens asked for recognition");
});

console.log("\n=== cognitive mode rides on the evidence ===");
t("an answer records what it actually asked for", () => {
  const e = makeEvidence({ id: "a", deck: "vocab", format: "type", ok: true });
  eq(e.mode.join(","), "recall,production");
  eq(e.skill, "production", "the skill is unchanged");
});
t("a screen that knows better than its format name can say so", () => {
  const e = makeEvidence({ id: "a", deck: "vocab", format: "mc", mode: ["transfer"], ok: true });
  eq(e.mode.join(","), "transfer");
});
t("an unclassified format leaves the field empty rather than wrong", () => {
  eq(makeEvidence({ id: "a", deck: "vocab", format: "mystery", ok: true }).mode.length, 0);
});
t("old evidence without the field still parses everywhere", () => {
  // Rows written before MP-13 have no `mode` at all. Nothing may throw on them, and
  // nothing may silently count them as having demanded nothing.
  const legacy = [
    { id: "a", deck: "vocab", format: "mc", skill: "recognition", ok: true, ms: 900, cue: 1, at: Date.now() },
    { id: "b", deck: "vocab", format: "type", skill: "production", ok: false, failure: "reading", ms: 4000, cue: 3, at: Date.now() },
  ];
  const s = summarise(legacy);
  eq(s.answered, 2, "legacy rows still count as answers");
  eq(s.bySkill.recognition.n, 1, "legacy rows still carry their skill");
  eq(Object.keys(s.byMode).length, 0, "an unclassified session claims no modes");
  eq(s.modesWorked.length, 0);
  const p = profileFrom(legacy);
  eq(p.recognition.n, 1, "the profile still reads legacy rows");
  eq(p.production.n, 1);
  ok(latencyNorms(legacy, { minSamples: 1 })["recognition|mc"], "norms still build from legacy rows");
  eq(confusionFrom(legacy).size, 0);
});
t("a mixed log of old and new rows summarises without either poisoning the other", () => {
  const mixed = [
    { id: "a", deck: "vocab", format: "mc", skill: "recognition", ok: true, at: Date.now() },
    makeEvidence({ id: "b", deck: "vocab", format: "mc", ok: true }),
  ];
  const s = summarise(mixed);
  eq(s.answered, 2);
  eq(s.byMode.recognition.n, 1, "only the tagged row is classified");
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
  // A strong production ability, so the clean pick sits well up the ladder and a miss has
  // somewhere to fall. At the floor rung there is nothing lower to hand back.
  const base = { caps: { type: true }, recognition: strongRec,
    production: { seen: 30, correct: 27, tried: true, acc: 0.9, S: 30, recent: "1111" } };
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


console.log("\n=== recovery: a miss becomes a ladder that ends in success ===");
t("every failure kind has a ladder", () => {
  for (const f of FAILURES) {
    const st = buildRecovery(f);
    if (!st.length) throw new Error("no recovery for " + f);
  }
});
t("a ladder starts at or below the cue that failed, never above", () => {
  for (const f of FAILURES) {
    for (const failedCue of [CUE.CHOOSE, CUE.STRONG, CUE.PARTIAL, CUE.FREE]) {
      for (const s of buildRecovery(f, { failedCue })) {
        if (s.cue > failedCue) throw new Error(`${f}: stage cue ${s.cue} > failed ${failedCue}`);
      }
    }
  }
});
t("it climbs — each stage asks for at least as much as the one before", () => {
  for (const f of FAILURES) {
    const st = buildRecovery(f);
    for (let i = 1; i < st.length; i++) {
      if (st[i].cue < st[i - 1].cue) throw new Error(f + " goes backwards at stage " + i);
    }
  }
});
t("exactly one stage is marked last, and it is the final one", () => {
  for (const f of FAILURES) {
    const st = buildRecovery(f);
    const lasts = st.filter((s) => s.last);
    if (lasts.length !== 1) throw new Error(f + " has " + lasts.length + " last stages");
    if (!st[st.length - 1].last) throw new Error(f + ": last flag is not on the final stage");
  }
});
t("a reading fumble routes through hearing it, not back to meaning", () => {
  const st = buildRecovery("reading");
  eq(st[0].skill, "listening", "reading rescue should start by hearing the word");
});
t("a blank restarts from recognition", () => {
  eq(buildRecovery("blank")[0].skill, "recognition");
});
t("caps drop rungs the item cannot support", () => {
  const noAudio = buildRecovery("reading", { caps: { listen: false } });
  if (noAudio.some((s) => s.skill === "listening")) throw new Error("kept a listening stage with no audio");
  if (!noAudio.length) throw new Error("should still offer something");
});
t("every stage carries a renderable format and direction", () => {
  for (const f of FAILURES) {
    for (const s of buildRecovery(f)) {
      if (!s.format) throw new Error(f + " stage has no format");
      if (!s.direction) throw new Error(f + " stage has no direction");
    }
  }
});
t("the opening stage explains itself, later ones do not repeat it", () => {
  const st = buildRecovery("production");
  if (!st[0].note) throw new Error("first stage should carry the note");
  if (st.slice(1).some((s) => s.note)) throw new Error("later stages should not repeat the note");
});
t("an unknown failure kind yields nothing rather than guessing", () => {
  eq(buildRecovery("nonsense").length, 0);
  eq(buildRecovery(null).length, 0);
});
t("a very low failed cue still leaves one workable stage", () => {
  for (const f of FAILURES) {
    const st = buildRecovery(f, { failedCue: CUE.SHOWN });
    if (!st.length) throw new Error(f + " left nothing at the lowest cue");
  }
});


console.log("\n=== scoring rewards learning behaviour, not just correctness ===");
t("a miss is never worth zero — attempting a hard item is the behaviour we want", () => {
  const s = scoreAnswer({ ok: false, cue: CUE.FREE });
  if (s.points <= 0) throw new Error("a miss scored " + s.points);
});
t("nothing is ever subtracted", () => {
  for (const ok of [true, false]) {
    for (const cue of [0, 1, 2, 3, 4, 5]) {
      for (const verdict of ["fast", "normal", "slow", null]) {
        const s = scoreAnswer({ ok, cue, verdict, stabilityDays: 0 });
        if (s.points < 0) throw new Error("negative score");
        if (s.reasons.some((r) => r.points < 0)) throw new Error("negative reason");
      }
    }
  }
});
t("producing it cold beats picking it from four options", () => {
  const picked = scoreAnswer({ ok: true, cue: CUE.CHOOSE }).points;
  const cold   = scoreAnswer({ ok: true, cue: CUE.FREE }).points;
  gt(cold, picked);
});
t("less scaffolding scores monotonically higher", () => {
  let prev = -1;
  for (const cue of [CUE.CHOOSE, CUE.STRONG, CUE.PARTIAL, CUE.FREE]) {
    const p = scoreAnswer({ ok: true, cue }).points;
    if (p < prev) throw new Error("score went down as support was removed");
    prev = p;
  }
});
t("beating your own median pays, being slow costs nothing", () => {
  const fast = scoreAnswer({ ok: true, cue: CUE.FREE, verdict: "fast" }).points;
  const norm = scoreAnswer({ ok: true, cue: CUE.FREE, verdict: "normal" }).points;
  const slow = scoreAnswer({ ok: true, cue: CUE.FREE, verdict: "slow" }).points;
  gt(fast, norm);
  eq(slow, norm, "slow should not be penalised, only unrewarded");
});
t("remembering something left alone for months is the biggest single bonus", () => {
  const fresh = scoreAnswer({ ok: true, cue: CUE.FREE, stabilityDays: 1 }).points;
  const held  = scoreAnswer({ ok: true, cue: CUE.FREE, stabilityDays: 200 }).points;
  gt(held, fresh);
  const bonus = held - fresh;
  if (bonus < 10) throw new Error("delayed-retention bonus too small to notice: " + bonus);
});
t("the held bonus is capped, not unbounded", () => {
  const a = scoreAnswer({ ok: true, cue: CUE.FREE, stabilityDays: 200 }).points;
  const b = scoreAnswer({ ok: true, cue: CUE.FREE, stabilityDays: 5000 }).points;
  eq(a, b, "a five-year interval should not score more than a five-month one");
});
t("a comeback pays on the rescue even though the item was missed first", () => {
  const plain = scoreAnswer({ ok: true, cue: CUE.CHOOSE }).points;
  const back  = scoreAnswer({ ok: true, cue: CUE.CHOOSE, comeback: true }).points;
  gt(back, plain);
});
t("every point in the total is explained by a reason", () => {
  const s = scoreAnswer({ ok: true, cue: CUE.FREE, verdict: "fast", comeback: true, stabilityDays: 90 });
  const sum = s.reasons.reduce((n, r) => n + r.points, 0);
  eq(sum, s.points, "reasons must account for the whole score");
});
t("memory check fires only on a correct answer after a real gap", () => {
  eq(isMemoryCheck(60, true), true);
  eq(isMemoryCheck(60, false), false, "a miss is not a memory check");
  eq(isMemoryCheck(2, true), false, "a card seen yesterday is not a memory check");
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} learner tests passed`);
process.exit(fail ? 1 : 0);
