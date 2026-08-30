// Tests for mastery by textbook scene (tools/mastery.mjs).
//   node tools/test-mastery.mjs
//
// The property under test throughout: a number the model has not earned never appears.
// Cards completed must not move mastery, and a thin posterior must read as "still
// evaluating" rather than as a percentage.
import { masteryByLesson, describeScene, sceneFor, sceneTitle, sceneRank, MIN_SPREAD } from "./mastery.mjs";
import { CONFIDENCE, SKILLS } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (cond, m) => { if (!cond) throw new Error(m || "expected truthy"); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > (tol ?? 0.01)) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };

const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const at = (daysAgo) => NOW - daysAgo * 86400000;

// Two scenes of three items each, plus one Act 2 card placed only by SECTION_MAP.
const CARDS = [
  { id: "a1", term: "会社", sec: "4-4" },
  { id: "a2", term: "学校", sec: "4-4" },
  { id: "a3", term: "駅", sec: "4-4" },
  { id: "b1", term: "高い", sec: "5-1" },
  { id: "b2", term: "安い", sec: "5-1" },
  { id: "b3", term: "近い", sec: "5-1" },
];
// n answers on one item, `okCount` of them correct.
const answers = (id, skill, n, okCount, daysAgo = 1) =>
  Array.from({ length: n }, (_, i) => ({ id, skill, ok: i < okCount, at: at(daysAgo) }));

const sceneOf = (res, name) => res.scenes.find((s) => s.scene === name);

console.log("=== scene membership ===");
t("an explicit sec wins, and the duplicate marker is stripped", () => {
  eq(sceneFor({ term: "x", sec: "6-3#2" }), "6-3");
});
t("Act 2 terms are placed by SECTION_MAP when there is no sec", () => {
  eq(sceneFor({ term: "会社" }), "2-5");
});
t("un-sectioned cards fall back the way the deck always has", () => {
  eq(sceneFor({ term: "zzz", lesson: 3 }), "Act 1");
  eq(sceneFor({ term: "zzz", lesson: 40 }), "Class notes");
});
t("a missing card is not a scene", () => { eq(sceneFor(null), null); });
t("scenes are titled as places in the book, other sections left alone", () => {
  eq(sceneTitle("4-4"), "Act 4-4");
  eq(sceneTitle("Class notes"), "Class notes");
});
t("textbook order sorts before everything else", () => {
  ok(sceneRank("4-4") < sceneRank("10-1"), "act 4 before act 10");
  ok(sceneRank("10-1") < sceneRank("Class notes"), "the book before the loose sections");
});

console.log("=== a scene with no evidence ===");
const none = masteryByLesson([], CARDS, { now: NOW });
t("still appears, so 'not started' is visible", () => {
  eq(none.scenes.length, 2);
  eq(sceneOf(none, "4-4").items, 3);
});
t("reports no mastery rather than 0%", () => {
  const s = sceneOf(none, "4-4");
  eq(s.mastered, null);
  eq(s.measured, 0);
  eq(s.started, false);
});
t("coverage is zero and says so as progress, not ability", () => {
  const s = sceneOf(none, "4-4");
  eq(s.coverage, 0);
  eq(s.seen, 0);
  eq(describeScene(s).seen, "seen 0%");
  eq(describeScene(s).mastered, "not measured yet");
});
t("every skill reads as no evidence", () => {
  const s = sceneOf(none, "4-4");
  ok(SKILLS.every((k) => s.skills[k].confidence === CONFIDENCE.NONE), "all NONE");
  ok(SKILLS.every((k) => s.skills[k].measured === false), "none measured");
});
t("no weakest skill is named from nothing", () => { eq(sceneOf(none, "4-4").weakest, null); });
t("empty everything is safe", () => {
  const r = masteryByLesson([], [], { now: NOW });
  eq(r.scenes.length, 0);
  eq(r.unplaced, 0);
  eq(masteryByLesson(undefined, undefined).scenes.length, 0);
});

console.log("=== the still-evaluating path ===");
t("a handful of answers is a confidence, not a percentage", () => {
  const ev = answers("a1", "recognition", 4, 4);
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW }), "4-4");
  eq(s.skills.recognition.confidence, CONFIDENCE.LOW, "four answers;");
  eq(s.skills.recognition.measured, false);
  eq(s.mastered, null, "no mastery figure off four answers;");
  eq(s.stillEvaluating, true);
  eq(describeScene(s).mastered, "still evaluating");
});
t("but the item still counts as seen — progress is not mastery", () => {
  const ev = answers("a1", "recognition", 4, 4);
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW }), "4-4");
  eq(s.seen, 1);
  near(s.coverage, 1 / 3);
  eq(describeScene(s).seen, "seen 33%");
});
t("grinding one card cannot manufacture mastery of the other two", () => {
  // 60 perfect answers on a single item: the scene is one third seen and no better.
  const ev = answers("a1", "recognition", 60, 60);
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW }), "4-4");
  near(s.coverage, 1 / 3, 0.01, "still one item of three;");
  eq(s.measured, 1, "one skill measured, not five;");
  eq(s.weakest, null, "one measured skill names no weakest;");
});
t("evidence older than the window stops counting toward ability", () => {
  const ev = answers("a1", "recognition", 30, 27, 200);
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW, days: 60 }), "4-4");
  eq(s.answers, 0, "nothing in the window;");
  eq(s.mastered, null);
  // ...but it is still part of what the learner has been through.
  eq(s.seen, 1, "seen is lifetime;");
  eq(s.answersEver, 30);
});

console.log("=== single-skill evidence ===");
const oneSkill = masteryByLesson(
  [...answers("a1", "recognition", 12, 11), ...answers("a2", "recognition", 12, 11)],
  CARDS, { now: NOW });
t("the measured skill gets a posterior mean and an interval", () => {
  const r = sceneOf(oneSkill, "4-4").skills.recognition;
  eq(r.n, 24); eq(r.ok, 22);
  eq(r.measured, true);
  ok(r.mean > 0.8 && r.mean < 0.95, "mean " + r.mean);
  ok(r.lo < r.mean && r.hi > r.mean, "the interval brackets the mean");
});
t("mastery averages the measured skills only — untested is not zero", () => {
  const s = sceneOf(oneSkill, "4-4");
  eq(s.measured, 1);
  eq(s.of, 5);
  near(s.mastered, s.skills.recognition.mean, 0.0001, "one measured skill IS the figure;");
  ok(s.mastered > 0.5, "averaging four unmeasured skills in as 0 would land near 0.17");
});
t("the four untested skills stay untested", () => {
  const s = sceneOf(oneSkill, "4-4");
  eq(s.skills.production.confidence, CONFIDENCE.NONE);
  eq(s.skills.production.measured, false);
  eq(s.evaluating.length, 0, "no evidence at all is not 'still evaluating';");
});
t("one measured skill is never called the weakest", () => { eq(sceneOf(oneSkill, "4-4").weakest, null); });
t("a scene nobody touched is unaffected by another scene's evidence", () => {
  const s = sceneOf(oneSkill, "5-1");
  eq(s.mastered, null); eq(s.seen, 0); eq(s.started, false);
});

console.log("=== the weakest-skill callout ===");
t("names the laggard once two skills are measured and far enough apart", () => {
  const ev = [
    ...answers("a1", "recognition", 20, 19),
    ...answers("a2", "listening", 20, 11),
  ];
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW }), "4-4");
  eq(s.measured, 2);
  ok(s.weakest, "expected a callout");
  eq(s.weakest.skill, "listening");
  eq(s.weakest.ahead, "recognition");
  ok(s.weakest.spread >= MIN_SPREAD, "spread " + s.weakest.spread);
  ok(s.mastered > s.skills.listening.mean && s.mastered < s.skills.recognition.mean, "mastery sits between them");
});
t("says nothing when the two are close together", () => {
  const ev = [
    ...answers("a1", "recognition", 20, 17),
    ...answers("a2", "listening", 20, 16),
  ];
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW }), "4-4");
  eq(s.measured, 2);
  eq(s.weakest, null, "a one-answer difference is not a weakness;");
});
t("an unmeasured skill cannot be the weakest, however badly it went", () => {
  const ev = [
    ...answers("a1", "recognition", 20, 19),
    ...answers("a2", "listening", 20, 11),
    ...answers("a3", "production", 3, 0),     // 0/3: looks terrible, means nothing
  ];
  const s = sceneOf(masteryByLesson(ev, CARDS, { now: NOW }), "4-4");
  eq(s.weakest.skill, "listening", "production has three answers behind it;");
  eq(s.skills.production.confidence, CONFIDENCE.LOW);
  ok(s.evaluating.includes("production"));
});

console.log("=== joining evidence to the deck ===");
t("evidence for a card that is no longer in the deck is dropped, and counted", () => {
  const ev = [...answers("gone", "recognition", 5, 5), ...answers("a1", "recognition", 5, 5)];
  const r = masteryByLesson(ev, CARDS, { now: NOW });
  eq(r.unplaced, 5);
  eq(sceneOf(r, "4-4").seen, 1);
});
t("malformed rows do not throw or land anywhere", () => {
  const r = masteryByLesson([null, {}, { id: null }, { id: "a1", at: at(1) }], CARDS, { now: NOW });
  eq(r.unplaced, 0, "rows with no id are not attributed to a scene;");
  const s = sceneOf(r, "4-4");
  eq(s.seen, 1, "a skill-less answer still counts as having met the item;");
  eq(s.mastered, null, "and contributes nothing to ability;");
});
t("cards with no id are skipped rather than colliding", () => {
  const r = masteryByLesson([], [{ term: "x", sec: "4-4" }, ...CARDS], { now: NOW });
  eq(sceneOf(r, "4-4").items, 3);
});
t("scenes come back in textbook order", () => {
  const cards = [{ id: "z", term: "z", sec: "Class notes" }, { id: "y", term: "y", sec: "10-2" }, ...CARDS];
  const r = masteryByLesson([], cards, { now: NOW });
  eq(r.scenes.map((s) => s.scene).join(","), "4-4,5-1,10-2,Class notes");
});

console.log(`\nall ${run} mastery tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exit(fail ? 1 : 0);
