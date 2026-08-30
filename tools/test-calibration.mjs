// Tests for the calibration report. The failure mode is not a crash — it is the report
// announcing that the model is overconfident on the strength of nine answers, which would
// send the tuning off after noise. Most of these assert what it must REFUSE to conclude.
//
//   node tools/test-calibration.mjs
import {
  wilson, verdictFor, isModelEra, predictionCalibration, cueCalibration,
  interventionEfficacy, durability, transfer, calibrationReport, headlineFor,
  MIN_BIN, MIN_SHOW,
} from "./calibration.mjs";
import { CUE } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lt = (a, b, m) => { if (!(a < b)) throw new Error(`${m || ""} expected ${a} < ${b}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const DAY = 86400000;
/* A record in the current era — both predictions present. */
const rec = (o = {}) => ({
  id: o.id || "x", deck: "vocab", format: o.format || "mc", skill: o.skill || "recognition",
  cue: o.cue == null ? CUE.CHOOSE : o.cue, ok: !!o.ok, ms: o.ms || 2000,
  failure: o.ok ? null : (o.failure || null),
  predicted: o.predicted == null ? 0.75 : o.predicted,
  pRecall: o.pRecall == null ? 0.8 : o.pRecall,
  confused: null, at: o.at || Date.now(),
});
/* n records, of which `hits` succeeded. */
const runOf = (n, hits, o = {}) => [...Array(n)].map((_, i) => rec({ ...o, ok: i < hits }));

console.log("=== the interval ===");
t("no trials means no rate and no claim", () => {
  const w = wilson(0, 0);
  eq(w.rate, null);
  eq(w.lo, 0); eq(w.hi, 1, "with nothing observed every rate is still possible");
});
t("the interval never leaves [0,1]", () => {
  // Where the normal approximation breaks: a perfect record on few trials.
  const w = wilson(5, 5);
  ok(w.hi <= 1, `upper bound escaped: ${w.hi}`);
  ok(w.lo >= 0 && w.lo < 1, "a perfect five should not certify 100%");
  lt(w.lo, 0.9, "five for five is not strong evidence of near-perfection");
});
t("more trials narrow the interval", () => {
  const few = wilson(8, 10), many = wilson(80, 100);
  lt(many.hi - many.lo, few.hi - few.lo);
});

console.log("\n=== verdicts are withheld by default ===");
t("a small bin gets no verdict however far off it looks", () => {
  // 10 trials, 3 successes, model said 90%. Obviously wrong-looking, still not enough.
  eq(verdictFor(0.9, wilson(3, 10)), "insufficient");
});
t("a verdict needs the prediction to fall OUTSIDE the interval", () => {
  const obs = wilson(30, 50);                  // 60%, interval roughly 46–72
  eq(verdictFor(0.65, obs), "calibrated", "65% sits inside the interval — no disagreement");
  eq(verdictFor(0.95, obs), "overconfident");
  eq(verdictFor(0.2, obs), "underconfident");
});

console.log("\n=== prediction calibration ===");
t("an empty log reports nothing rather than zero", () => {
  const r = predictionCalibration([]);
  eq(r.n, 0); eq(r.brier, null); eq(r.verdict, "insufficient");
  eq(r.bins.length, 0);
});
t("records from before the split are excluded, not averaged in", () => {
  // Old records carry FSRS retrievability in `predicted` and have no `pRecall`.
  const old = runOf(60, 30, { predicted: 0.8 }).map((e) => ({ ...e, pRecall: undefined }));
  eq(old.filter(isModelEra).length, 0);
  eq(predictionCalibration(old).n, 0, "old-era records must not describe the new model");
  eq(predictionCalibration(old, { anyEra: true }).n, 60, "but they are still readable on request");
});
t("a well calibrated model is reported as calibrated", () => {
  const evs = [
    ...runOf(60, 54, { predicted: 0.9 }),
    ...runOf(60, 42, { predicted: 0.7 }),
    ...runOf(60, 30, { predicted: 0.5 }),
  ];
  const r = predictionCalibration(evs);
  eq(r.verdict, "calibrated");
  lt(r.ece, 0.05, "expected calibration error should be small when the model is right");
});
t("a model that promises more than it delivers is caught", () => {
  const evs = [...runOf(80, 32, { predicted: 0.9 }), ...runOf(80, 24, { predicted: 0.75 })];
  const r = predictionCalibration(evs);
  eq(r.verdict, "overconfident");
  gt(r.brier, 0.2, "a badly wrong model should show a poor Brier score");
});
t("a model that undersells itself is caught too", () => {
  const evs = [...runOf(80, 76, { predicted: 0.4 }), ...runOf(80, 70, { predicted: 0.35 })];
  eq(predictionCalibration(evs).verdict, "underconfident");
});
t("a bin too small to print is dropped but still counted in the error", () => {
  const evs = [...runOf(60, 54, { predicted: 0.9 }), ...runOf(3, 0, { predicted: 0.2 })];
  const r = predictionCalibration(evs);
  eq(r.bins.length, 1, "the three-answer bin has no business being shown");
  eq(r.n, 63, "but it happened, so it counts toward the totals");
});
t("the two predictions are reported separately", () => {
  const evs = runOf(60, 30, { predicted: 0.5, pRecall: 0.95 });
  eq(predictionCalibration(evs, { field: "predicted" }).verdict, "calibrated");
  eq(predictionCalibration(evs, { field: "pRecall" }).verdict, "overconfident",
     "FSRS being wrong about the card is a different finding from the model being wrong");
});

console.log("\n=== cue calibration ===");
t("a ladder held at target reports on_target", () => {
  const evs = [
    ...runOf(60, 51, { cue: CUE.CHOOSE }),
    ...runOf(60, 51, { cue: CUE.STRONG }),
    ...runOf(60, 50, { cue: CUE.PARTIAL }),
  ];
  const r = cueCalibration(evs, { target: 0.85 });
  ok(r.rows.every((x) => x.verdict === "on_target"), JSON.stringify(r.rows));
});
t("a rung that is beyond the learner is named", () => {
  const evs = [...runOf(60, 51, { cue: CUE.CHOOSE }), ...runOf(60, 21, { cue: CUE.FREE })];
  const r = cueCalibration(evs, { target: 0.85 });
  eq(r.rows.find((x) => x.cue === CUE.FREE).verdict, "too_hard");
});
t("a rung nobody has answered enough gets no verdict", () => {
  const r = cueCalibration(runOf(10, 2, { cue: CUE.FREE }), { target: 0.85 });
  eq(r.rows[0].verdict, "insufficient", "ten answers cannot condemn a help level");
});
t("a ladder whose rungs are not ordered by difficulty is flagged", () => {
  const evs = [
    ...runOf(40, 20, { cue: CUE.CHOOSE }),      // 50% on the EASIEST rung
    ...runOf(40, 36, { cue: CUE.STRONG }),      // 90% on a harder one
    ...runOf(40, 38, { cue: CUE.PARTIAL }),
  ];
  eq(cueCalibration(evs).monotonic, false, "success rising with difficulty means the rungs are wrong");
});
t("monotonicity is not claimed from two rungs", () => {
  const evs = [...runOf(40, 36, { cue: CUE.CHOOSE }), ...runOf(40, 30, { cue: CUE.STRONG })];
  eq(cueCalibration(evs).monotonic, null);
});

console.log("\n=== intervention efficacy ===");
t("a failure followed by a success counts as a recovery", () => {
  const evs = [];
  for (let i = 0; i < 40; i++) {
    evs.push(rec({ id: "i" + i, ok: false, failure: "reading", at: Date.now() - 2 * DAY }));
    evs.push(rec({ id: "i" + i, ok: i < 30, format: "type", at: Date.now() - DAY }));
  }
  const r = interventionEfficacy(evs);
  const row = r.rows.find((x) => x.failure === "reading");
  eq(row.n, 40);
  eq(row.recovered, 0.75);
  ok(row.next.includes("type×40"), "the report says what the model actually did next");
});
t("a follow-up months later is not credited to the intervention", () => {
  const evs = [];
  for (let i = 0; i < 40; i++) {
    evs.push(rec({ id: "j" + i, ok: false, failure: "meaning", at: Date.now() - 200 * DAY }));
    evs.push(rec({ id: "j" + i, ok: true, at: Date.now() }));
  }
  eq(interventionEfficacy(evs).rows.length, 0, "six months later is not a recovery");
});
t("a failure type with too few cases is not reported", () => {
  const evs = [];
  for (let i = 0; i < 4; i++) {
    evs.push(rec({ id: "k" + i, ok: false, failure: "blank", at: Date.now() - DAY }));
    evs.push(rec({ id: "k" + i, ok: true, at: Date.now() }));
  }
  eq(interventionEfficacy(evs).rows.length, 0);
});

console.log("\n=== durability ===");
t("same-session repeats are excluded", () => {
  const evs = [];
  for (let i = 0; i < 40; i++) {
    evs.push(rec({ id: "d" + i, ok: true, cue: CUE.FREE, at: Date.now() - 600000 }));
    evs.push(rec({ id: "d" + i, ok: true, cue: CUE.FREE, at: Date.now() }));
  }
  eq(durability(evs).rows.length, 0, "answering it again ten minutes later proves nothing");
});
t("retention after a gap is reported per cue, with the gap", () => {
  const evs = [];
  for (let i = 0; i < 40; i++) {
    evs.push(rec({ id: "e" + i, ok: true, cue: CUE.FREE, at: Date.now() - 10 * DAY }));
    evs.push(rec({ id: "e" + i, ok: i < 34, cue: CUE.FREE, at: Date.now() }));
  }
  const row = durability(evs).rows[0];
  eq(row.cue, CUE.FREE);
  eq(row.held, 0.85);
  eq(row.gapDays, 10);
  eq(row.confident, true);
});

console.log("\n=== transfer ===");
t("nothing is claimed without both groups populated", () => {
  const evs = runOf(40, 30, { skill: "production", format: "type" });
  eq(transfer(evs).verdict, "insufficient", "with no well-practised group there is no comparison");
});
t("a real difference is reported as transfer", () => {
  const evs = [];
  for (let i = 0; i < 40; i++) {
    for (let r = 0; r < 8; r++) evs.push(rec({ id: "h" + i, ok: true, at: Date.now() - (20 - r) * DAY }));
    evs.push(rec({ id: "h" + i, skill: "production", format: "type", ok: i < 38, at: Date.now() }));
  }
  for (let i = 0; i < 40; i++) {
    evs.push(rec({ id: "l" + i, skill: "production", format: "type", ok: i < 8, at: Date.now() }));
  }
  const r = transfer(evs);
  eq(r.verdict, "transfers");
  ok(r.caveat.includes("observational"), "the confound must travel with the finding");
});
t("overlapping intervals are reported as indistinguishable, not as a result", () => {
  const evs = [];
  for (let i = 0; i < 40; i++) {
    for (let r = 0; r < 8; r++) evs.push(rec({ id: "m" + i, ok: true, at: Date.now() - (20 - r) * DAY }));
    evs.push(rec({ id: "m" + i, skill: "production", format: "type", ok: i < 30, at: Date.now() }));
  }
  for (let i = 0; i < 40; i++) {
    evs.push(rec({ id: "n" + i, skill: "production", format: "type", ok: i < 27, at: Date.now() }));
  }
  eq(transfer(evs).verdict, "indistinguishable", "75% against 67.5% on forty each is noise");
});

console.log("\n=== the whole report ===");
t("a fresh learner is told there is nothing to see yet, in plain words", () => {
  const r = calibrationReport([]);
  eq(r.n, 0);
  ok(/not enough/i.test(r.headline), r.headline);
  ok(!/brier|calibration error|wilson|posterior|interval/i.test(r.headline),
     `leaked statistics vocabulary: ${r.headline}`);
});
t("every headline stays in plain language", () => {
  const banned = /brier|wilson|posterior|logit|monotonic|confidence interval|p-value/i;
  const cases = [
    calibrationReport([]),
    calibrationReport([...runOf(80, 32, { predicted: 0.9 })]),
    calibrationReport([...runOf(80, 76, { predicted: 0.4 })]),
    calibrationReport([...runOf(60, 45, { predicted: 0.75 }), ...runOf(60, 20, { cue: CUE.FREE, predicted: 0.33 })]),
  ];
  for (const c of cases) {
    ok(c.headline && c.headline.length > 20, "expected a real sentence");
    ok(!banned.test(c.headline), `leaked: ${c.headline}`);
  }
});
t("the report survives junk in the log", () => {
  const r = calibrationReport([null, undefined, {}, { ok: true }, { id: "z", at: "nonsense" }, 7, "x"]);
  eq(r.prediction.n, 0);
  ok(r.headline);
});
t("a day window keeps the report about the present", () => {
  const oldEvs = runOf(60, 12, { predicted: 0.9, at: Date.now() - 300 * DAY });
  const newEvs = runOf(60, 54, { predicted: 0.9, at: Date.now() });
  eq(calibrationReport([...oldEvs, ...newEvs], { days: 60 }).prediction.verdict, "calibrated",
     "how wrong the model was last year is not how wrong it is now");
});

console.log(`\n${fail ? `${fail} of ${run} FAILED` : `all ${run} calibration tests passed`}`);
process.exit(fail ? 1 : 0);
