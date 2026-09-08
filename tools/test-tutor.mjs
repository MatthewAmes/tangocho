/* Tests for the tutor orchestrator (tools/tutor.mjs).
 *
 * The properties worth pinning are the ones that stop the model inventing things: that an
 * unmeasured ability is reported as unmeasured rather than omitted, that scaffolding falls
 * away as production improves, and that the brief fits the endpoint's budget however much
 * evidence exists.
 *
 *   node tools/test-tutor.mjs
 */
import {
  buildBrief, serialiseBrief, scaffoldFor, correctionFor, pickTargets,
  SCAFFOLD, CORRECTION, MODES, BRIEF_MAX, MAX_ERRORS,
} from "./tutor.mjs";
import { SKILLS } from "./learner.mjs";
import { CONJ_BANK } from "../src/data/conj-bank.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const now = Date.now();
const rows = (skill, correct, n, extra) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: "v" + (i % 7), skill, ok: correct, at: now - i * 60000, ...extra });
  return out;
};

console.log("=== ground truth, not invention ===");

t("every skill appears, so an untested one cannot read as fine", () => {
  const b = buildBrief({ evidence: rows("recognition", true, 20) });
  eq(b.skills.length, SKILLS.length);
  const listening = b.skills.find((s) => s.skill === "listening");
  eq(listening.mastery, null, "an untested ability reports null, not a number");
});

t("an unmeasured ability is never called a weakness", () => {
  const b = buildBrief({ evidence: rows("recognition", true, 20) });
  for (const w of b.weaknesses) {
    const row = b.skills.find((s) => s.skill === w.skill);
    ok(row.mastery != null, w.skill + " was called weak without being measured");
  }
});

t("a measured, failing ability IS reported as a weakness", () => {
  const b = buildBrief({ evidence: [...rows("recognition", true, 20), ...rows("production", false, 18), ...rows("production", true, 2)] });
  ok(b.weaknesses.some((w) => w.skill === "production"), "production should be named: " + JSON.stringify(b.weaknesses));
  ok(b.strengths.includes("recognition"), "and recognition should be a strength");
});

console.log("\n=== scaffolding falls away ===");

t("more English when production is weak, none when it is strong", () => {
  eq(scaffoldFor({ measured: true, mean: 0.2 }), SCAFFOLD.ALWAYS);
  eq(scaffoldFor({ measured: true, mean: 0.5 }), SCAFFOLD.STRUGGLING);
  eq(scaffoldFor({ measured: true, mean: 0.75 }), SCAFFOLD.RARELY);
  eq(scaffoldFor({ measured: true, mean: 0.95 }), SCAFFOLD.NONE);
});

t("an unmeasured learner is met halfway, not thrown in", () => {
  eq(scaffoldFor(null), SCAFFOLD.STRUGGLING);
  eq(scaffoldFor({ measured: false, mean: 0.5 }), SCAFFOLD.STRUGGLING);
});

t("THE BRIEF's scaffold follows the brief's own production number", () => {
  /* Regression: buildBrief passed a skill ROW (which carries `mastery`) to scaffoldFor
     (which reads `mean`), so every threshold compared against undefined and fell through to
     japanese_only — the least scaffolded setting — for a learner producing at 38%. The unit
     test above passed throughout, because it calls scaffoldFor with the right shape. This
     asserts the wiring, not the function. */
  const weak = buildBrief({ evidence: [...rows("recognition", true, 20), ...rows("production", false, 18), ...rows("production", true, 2)] });
  ok(weak.speaking_level != null && weak.speaking_level < 0.5, "precondition: production is measured and weak");
  eq(weak.scaffold, SCAFFOLD.ALWAYS, "a weak producer should be given English");

  const strong = buildBrief({ evidence: [...rows("recognition", true, 20), ...rows("production", true, 30)] });
  ok(strong.speaking_level > 0.85, "precondition: production is strong");
  eq(strong.scaffold, SCAFFOLD.NONE, "a strong producer should not be");
});

t("repeated identical slips are reported once, not four times", () => {
  const b = buildBrief({ evidence: rows("production", false, 12, { failure: "conjugation", got: "行きます", want: "行きました" }) });
  const keys = new Set(b.recent_errors.map((e) => e.said + "|" + e.wanted));
  eq(keys.size, b.recent_errors.length, "the list should carry distinct mistakes: " + JSON.stringify(b.recent_errors));
});

t("an explicit preference wins over the estimate", () => {
  eq(scaffoldFor({ measured: true, mean: 0.1 }, { preference: SCAFFOLD.NONE }), SCAFFOLD.NONE);
  eq(scaffoldFor({ measured: true, mean: 0.1 }, { preference: "nonsense" }), SCAFFOLD.ALWAYS, "a bad preference is ignored");
});

console.log("\n=== correction is a mode, not a guess ===");

t("free conversation holds corrections; tutor mode interrupts", () => {
  eq(correctionFor("free"), CORRECTION.NONE);
  eq(correctionFor("tutor"), CORRECTION.IMMEDIATE);
  eq(correctionFor("repair"), CORRECTION.MAJOR);
  eq(correctionFor("roleplay"), CORRECTION.NONE);
});

t("an unknown mode falls back to free rather than to interrupting", () => {
  const b = buildBrief({ evidence: [], mode: "wizard" });
  eq(b.mode, "free");
  eq(b.correction, CORRECTION.NONE);
});

console.log("\n=== the grammar gap names the rule, not the statistic ===");

t("a failing form is reported with its sub-rule where there is one", () => {
  const nde = CONJ_BANK.filter((w) => w.type === "godan" && "むぶぬ".includes((w.dict || "").slice(-1)));
  const tte = CONJ_BANK.filter((w) => w.type === "godan" && "うつる".includes((w.dict || "").slice(-1)));
  if (!nde.length || !tte.length) return;
  const ev = [];
  const conj = (vs, ok, n) => { for (let i = 0; i < n; i++) ev.push({ id: "conj:" + vs[i % vs.length].reading + "|p-te", skill: "production", ok, at: now - i * 60000 }); };
  conj(tte, true, 14);
  conj(nde, false, 16);
  const b = buildBrief({ evidence: ev });
  const te = b.grammar_gaps.find((g) => g.id === "g-te");
  ok(te, "て-form should be a gap: " + JSON.stringify(b.grammar_gaps));
  ok(te.sub && /んで/.test(te.sub), "and it should name the sound change, got " + te.sub);
});

t("a form that is holding is not reported as a gap", () => {
  const ev = [];
  for (let i = 0; i < 20; i++) ev.push({ id: "conj:" + CONJ_BANK[0].reading + "|p-te", skill: "production", ok: true, at: now - i * 60000 });
  const b = buildBrief({ evidence: ev });
  eq(b.grammar_gaps.some((g) => g.id === "g-te"), false);
});

console.log("\n=== errors that are still errors ===");

t("the brief carries what was said and what was wanted", () => {
  const ev = [
    ...rows("production", false, 6, { failure: "conjugation", got: "行きます", want: "行きました" }),
    ...rows("recognition", true, 10),
  ];
  const b = buildBrief({ evidence: ev });
  ok(b.recent_errors.length > 0, "an unrecovered error should reach the brief");
  ok(b.recent_errors.every((e) => e.said && e.wanted), "each names both sides");
  ok(b.recent_errors.length <= MAX_ERRORS, "and the list is capped");
});

console.log("\n=== targets are things to create a reason for ===");

t("targets are drawn only from measured gaps", () => {
  const b = buildBrief({ evidence: [...rows("recognition", true, 20), ...rows("production", false, 18), ...rows("production", true, 2)] });
  ok(b.targets.length > 0, "there should be something to aim at");
  for (const tg of b.targets) ok(tg.kind && tg.label, "a target names itself: " + JSON.stringify(tg));
});

t("a learner with no evidence gets no invented targets", () => {
  const b = buildBrief({ evidence: [] });
  eq(b.targets.length, 0, "nothing measured means nothing to claim");
  eq(b.weaknesses.length, 0);
  eq(b.grammar_gaps.length, 0);
});

console.log("\n=== the budget the endpoint actually enforces ===");

t("THE POINT: a maximal brief still fits, leaving room for the transcript", () => {
  /* cf/src/ai.js rejects a request over INPUT_MAX = 4000 characters of JSON, and the brief
     shares that with the conversation. A brief that grows with the evidence would start
     failing exactly when there was finally enough evidence to be worth sending. */
  const ev = [];
  for (let i = 0; i < 400; i++) {
    ev.push({ id: "v" + i, skill: SKILLS[i % SKILLS.length], ok: i % 3 === 0, at: now - i * 60000,
              failure: "conjugation", got: "とてもながいこたえ" + i, want: "もっとながいせいかい" + i, confused: "まぎらわしい" + i });
  }
  for (const w of CONJ_BANK) for (let i = 0; i < 4; i++) ev.push({ id: "conj:" + w.reading + "|p-te", skill: "production", ok: false, at: now - i * 60000 });
  const b = buildBrief({ evidence: ev, minutes: 60, mode: "tutor" });
  const s = serialiseBrief(b);
  ok(s.length <= BRIEF_MAX, `brief is ${s.length} chars, over the ${BRIEF_MAX} budget`);
  ok(s.length < 4000 - 1200, "and leaves room for a transcript");
});

t("trimming keeps the skills table, which is the ground truth", () => {
  const ev = [];
  for (let i = 0; i < 300; i++) ev.push({ id: "v" + i, skill: SKILLS[i % SKILLS.length], ok: false, at: now - i * 60000, failure: "x", got: "あ".repeat(30) + i, want: "い".repeat(30) + i });
  const tiny = serialiseBrief(buildBrief({ evidence: ev }), 220);
  const parsed = JSON.parse(tiny);
  ok(parsed.skills && parsed.skills.length === SKILLS.length, "the skills table survives the squeeze");
  ok(parsed.mode && parsed.scaffold, "and so does how to behave");
});

t("a brief is valid JSON at every budget", () => {
  const ev = [...rows("production", false, 30, { failure: "conjugation", got: "行きます", want: "行きました" })];
  for (const max of [120, 300, 800, BRIEF_MAX]) {
    const s = serialiseBrief(buildBrief({ evidence: ev }), max);
    JSON.parse(s);
  }
});

console.log("\n=== the plan is not a rival scheduler ===");

t("the session plan is carried when a duration is asked for", () => {
  const b = buildBrief({ evidence: rows("recognition", true, 20), minutes: 60 });
  ok(Array.isArray(b.session_plan) && b.session_plan.length, "a plan should be included");
  const total = b.session_plan.reduce((a, s) => a + s.minutes, 0);
  ok(total > 0 && total <= 60, "and it should be today's minutes, not a new number: " + total);
});

t("no duration, no plan — the tutor does not invent a session length", () => {
  const b = buildBrief({ evidence: rows("recognition", true, 20) });
  eq(b.session_plan, undefined);
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} tutor tests passed`);
process.exitCode = fail ? 1 : 0;
