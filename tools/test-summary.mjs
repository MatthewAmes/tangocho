// Tests for the session summary selectors (tools/summary.mjs) — MP-18.
//   node tools/test-summary.mjs
//
// The property under test throughout: the screen shows what MOVED, and it says nothing it
// cannot defend. A number that appears when the session did not earn it is worse than a
// blank space, because the learner will believe it.
import {
  pairsFromEvidence, stabilityMovement, recoveriesLanded, weakestSkill, actMasteryDelta,
  sessionSummary, MIN_SKILL_ANSWERS, MIN_SKILL_SPREAD, SOLE_SKILL_CEILING,
} from "./summary.mjs";
import { makeEvidence, recoveryTag, CUE } from "./learner.mjs";
import { GOLD_STABILITY, GOLD_WARMTH, MASTERY_CEIL, masteryWarmth } from "../src/lib/schedule.js";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (cond, m) => { if (!cond) throw new Error(m || "expected truthy"); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > (tol ?? 0.01)) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };

const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const MIN = 60000;
// one answered exercise: minutes BEFORE now
const row = (minAgo, extra = {}) => makeEvidence({
  id: extra.id ?? 1, deck: extra.deck || "vocab",
  format: extra.format || "type", skill: extra.skill || "production",
  ok: !!extra.ok, ms: extra.ms ?? 3000,
  cue: "cue" in extra ? extra.cue : CUE.FREE,
  failure: extra.ok ? null : (extra.failure || "production"),
  s0: extra.s0, s1: extra.s1, recovery: extra.recovery,
  at: NOW - minAgo * MIN,
});

console.log("=== gold is the ramp's own threshold, not a second opinion ===");
t("GOLD_STABILITY is exactly where masteryWarmth reaches the gold stop", () => {
  near(masteryWarmth({ fsrs: { S: GOLD_STABILITY } }), GOLD_WARMTH, 0.0001);
  ok(GOLD_STABILITY > 80 && GOLD_STABILITY < 85, "about twelve weeks, got " + GOLD_STABILITY);
});
t("it is derived from the ceiling rather than copied", () => {
  // If MASTERY_CEIL moves, the threshold has to move with it or two screens start
  // disagreeing about what gold means.
  eq(Math.round(Math.exp(GOLD_WARMTH * Math.log(1 + MASTERY_CEIL)) - 1), Math.round(GOLD_STABILITY));
});

console.log("=== stability movement ===");
t("crossing the line counts; already being over it does not", () => {
  const m = stabilityMovement([
    { id: 1, s0: 40, s1: 95 },                     // crossed
    { id: 2, s0: 120, s1: 300 },                   // already gold, got stronger
    { id: 3, s0: 1, s1: 4 },                       // moved, nowhere near
  ]);
  eq(m.gold, 1);
  eq(m.goldItems[0].id, 1);
  eq(m.strengthened, 3);
});
t("a lapse does not subtract from the days moved", () => {
  const m = stabilityMovement([{ id: 1, s0: 200, s1: 20 }, { id: 2, s0: 1, s1: 11 }]);
  eq(m.days, 10, "the lapse must not eat the other card's gain");
  eq(m.strengthened, 1);
});
t("days are rounded once, at the end", () => {
  // Twenty half-day gains are ten days, not zero. Rounding per item would report zero.
  const m = stabilityMovement(Array.from({ length: 20 }, (_, i) => ({ id: i, s0: 1, s1: 1.5 })));
  eq(m.days, 10);
});
t("a broken leech is movement; a leech that stayed stuck is not", () => {
  const m = stabilityMovement([
    { id: 1, s0: 1, s1: 1, leech0: true, leech1: false },
    { id: 2, s0: 1, s1: 1, leech0: true, leech1: true },
  ]);
  eq(m.freed, 1);
  eq(m.moved, true);
});
t("a session that moved nothing says so rather than inventing a figure", () => {
  const m = stabilityMovement([{ id: 1, s0: 5, s1: 5 }]);
  eq(m.gold, 0); eq(m.days, 0); eq(m.moved, false);
});
t("no pairs at all is handled, not crashed", () => {
  eq(stabilityMovement().moved, false);
  eq(stabilityMovement([null, undefined]).gold, 0);
});

console.log("=== pairs out of the session's own evidence ===");
t("an item answered several times is ONE movement, first s0 to last s1", () => {
  const rows = [
    row(10, { id: 1, s0: 1, s1: 2 }),
    row(6, { id: 1, s0: 2, s1: 6 }),
    row(2, { id: 1, s0: 6, s1: 40 }),
  ];
  const pairs = pairsFromEvidence(rows);
  eq(pairs.length, 1);
  eq(pairs[0].s0, 1);
  eq(pairs[0].s1, 40);
  eq(stabilityMovement(pairs).days, 39);
});
t("an out-of-order log still folds to the right endpoints", () => {
  const pairs = pairsFromEvidence([row(2, { id: 1, s0: 6, s1: 40 }), row(10, { id: 1, s0: 1, s1: 2 })]);
  eq(pairs[0].s0, 1); eq(pairs[0].s1, 40);
});
t("rows written before stability was recorded are skipped, not counted as zero", () => {
  const legacy = { id: 9, deck: "vocab", format: "mc", ok: true, at: NOW - MIN };
  eq(pairsFromEvidence([legacy]).length, 0);
});
t("two decks sharing an id stay two items", () => {
  const pairs = pairsFromEvidence([
    row(5, { id: 3, deck: "vocab", s0: 1, s1: 2 }),
    row(4, { id: 3, deck: "mined", s0: 50, s1: 200 }),
  ]);
  eq(pairs.length, 2);
});

console.log("=== recoveries landed ===");
t("only the LAST rung, answered right, is a recovery", () => {
  const rows = [
    row(9, { id: 1, failure: "production" }),
    row(7, { id: 1, ok: true, recovery: recoveryTag("production", 1, 3) }),
    row(5, { id: 1, ok: true, recovery: recoveryTag("production", 2, 3) }),
    row(3, { id: 1, ok: true, recovery: recoveryTag("production", 3, 3) }),
  ];
  const r = recoveriesLanded(rows);
  eq(r.landed, 1, "the climb is one repair, not three");
  eq(r.items[0].from, "production");
});
t("a rescue that never reached the top is not a recovery", () => {
  const rows = [row(5, { id: 1, ok: true, recovery: recoveryTag("reading", 2, 3) })];
  eq(recoveriesLanded(rows).landed, 0);
});
t("missing the last rung is not a recovery either", () => {
  const rows = [row(5, { id: 1, ok: false, recovery: recoveryTag("reading", 3, 3) })];
  eq(recoveriesLanded(rows).landed, 0);
});
t("two ladders on one word is one word repaired, not two repairs", () => {
  const rows = [
    row(9, { id: 1, ok: true, recovery: recoveryTag("production", 3, 3) }),
    row(3, { id: 1, ok: true, recovery: recoveryTag("reading", 2, 2) }),
  ];
  eq(recoveriesLanded(rows).landed, 1);
});
t("an ordinary correct answer is not a recovery", () => {
  eq(recoveriesLanded([row(2, { ok: true })]).landed, 0);
  eq(recoveriesLanded([]).landed, 0);
});

console.log("=== the session's weakest ability ===");
const skillRows = (skill, n, okCount, format) =>
  Array.from({ length: n }, (_, i) => row(30 - i, { id: skill + i, skill, format, ok: i < okCount }));

t("names the ability that is clearly behind, and quotes the evidence", () => {
  const rows = [...skillRows("recognition", 8, 8, "mc"), ...skillRows("production", 8, 3, "type")];
  const w = weakestSkill(rows);
  eq(w.basis, "spread");
  eq(w.skill, "production");
  eq(w.ahead, "recognition");
  ok(w.note.includes("3 of 8"), w.note);
  ok(w.note.includes("8 of 8"), w.note);
});
t("says nothing when the two abilities are level", () => {
  const rows = [...skillRows("recognition", 8, 7, "mc"), ...skillRows("production", 8, 7, "type")];
  eq(weakestSkill(rows), null, "an ordering inside the noise is not a finding");
});
t("an ability with too few answers cannot be the weakest", () => {
  const rows = [...skillRows("recognition", 8, 8, "mc"), ...skillRows("listening", MIN_SKILL_ANSWERS - 1, 0, "listen")];
  eq(weakestSkill(rows), null, "one bad answer on listening is not a listening problem");
});
t("one ability, badly: a fact about the session, not a comparison", () => {
  const w = weakestSkill(skillRows("production", 8, 2, "type"));
  eq(w.basis, "sole");
  eq(w.ahead, null);
  ok(w.note.includes("2 of 8"), w.note);
  ok(!/against/.test(w.note), "there is nothing to be weaker than: " + w.note);
});
t("one ability, going fine: nothing to report", () => {
  eq(weakestSkill(skillRows("production", 8, 8, "type")), null);
  ok(SOLE_SKILL_CEILING < 1);
});
t("an empty session is silent", () => {
  eq(weakestSkill([]), null);
  eq(weakestSkill(), null);
});
t("the bar the module publishes is the bar it uses", () => {
  // Deliberately either side of MIN_SKILL_SPREAD rather than exactly on it: a rate is a
  // division, so "exactly at the bar" is a floating-point coin toss and asserting on it
  // would test IEEE arithmetic rather than the rule.
  const under = [...skillRows("recognition", 10, 10, "mc"), ...skillRows("production", 10, 9, "type")];
  eq(weakestSkill(under), null, "a tenth of a point apart is not a finding");
  const over = [...skillRows("recognition", 10, 10, "mc"), ...skillRows("production", 10, 7, "type")];
  ok(weakestSkill(over) !== null, "three tenths apart is");
  ok(MIN_SKILL_SPREAD > 0.1 && MIN_SKILL_SPREAD < 0.3, "the fixture straddles the published bar");
});

console.log("=== the current act, before and after ===");
const CARDS = [
  { id: "a1", term: "会社", sec: "4-4" },
  { id: "a2", term: "学校", sec: "4-4" },
  { id: "a3", term: "駅", sec: "4-4" },
  { id: "b1", term: "高い", sec: "5-1" },
  { id: "b2", term: "安い", sec: "5-1" },
];
// Enough answers on one scene to make a posterior narrow enough to report.
const scened = (id, skill, n, okCount, minAgo) =>
  Array.from({ length: n }, (_, i) => row(minAgo + i, { id, skill, ok: i < okCount, format: skill === "production" ? "type" : "mc" }));

t("reports the act the session actually worked", () => {
  const history = scened("a1", "recognition", 30, 18, 60 * 24 * 3);
  const session = scened("a2", "recognition", 30, 30, 5);
  const d = actMasteryDelta({ evidence: [...history, ...session], sessionRows: session, cards: CARDS, now: NOW });
  ok(d, "should have found the act");
  eq(d.scene, "4-4");
  eq(d.title, "Act 4-4");
});
t("a good session moves the act's mastery UP", () => {
  const history = scened("a1", "recognition", 30, 15, 60 * 24 * 3);
  const session = scened("a2", "recognition", 30, 30, 5);
  const d = actMasteryDelta({ evidence: [...history, ...session], sessionRows: session, cards: CARDS, now: NOW });
  ok(d.delta > 0, "delta " + d.delta);
  ok(d.after > d.before);
});
t("a bad session moves it DOWN — the number is not a ratchet", () => {
  const history = scened("a1", "recognition", 30, 29, 60 * 24 * 3);
  const session = scened("a2", "recognition", 30, 5, 5);
  const d = actMasteryDelta({ evidence: [...history, ...session], sessionRows: session, cards: CARDS, now: NOW });
  ok(d.delta < 0, "delta " + d.delta);
});
t("the session that first made an act measurable reports no delta", () => {
  const session = scened("a1", "recognition", 30, 24, 5);
  const d = actMasteryDelta({ evidence: session, sessionRows: session, cards: CARDS, now: NOW });
  eq(d.first, true);
  eq(d.before, null);
  eq(d.delta, null, "a change from a number that did not exist is not a change");
  ok(d.after > 0);
});
t("an unmeasurable act reports nothing at all", () => {
  // Three answers is not a measurement, and "0% to 0%" would be a claim rather than a reading.
  const session = scened("a1", "recognition", 3, 2, 5);
  eq(actMasteryDelta({ evidence: session, sessionRows: session, cards: CARDS, now: NOW }), null);
});
t("only the session's own scene is considered", () => {
  const other = scened("b1", "recognition", 30, 30, 60 * 24 * 3);
  const session = scened("a1", "recognition", 30, 20, 5);
  const d = actMasteryDelta({ evidence: [...other, ...session], sessionRows: session, cards: CARDS, now: NOW });
  eq(d.scene, "4-4", "a stronger scene elsewhere must not be reported as this session's act");
});
t("evidence for cards that are not in the deck cannot pick the act", () => {
  const session = scened("ghost", "recognition", 30, 30, 5);
  eq(actMasteryDelta({ evidence: session, sessionRows: session, cards: CARDS, now: NOW }), null);
});
t("no session and no deck are both handled", () => {
  eq(actMasteryDelta({ evidence: [], sessionRows: [], cards: CARDS }), null);
  eq(actMasteryDelta({ evidence: [], sessionRows: [row(1)], cards: [] }), null);
  eq(actMasteryDelta(), null);
});

console.log("=== the whole summary in one call ===");
t("each part is independently absent rather than the whole thing failing", () => {
  const session = [
    row(9, { id: 1, s0: 40, s1: 95 }),
    row(3, { id: 1, ok: true, s0: 95, s1: 120, recovery: recoveryTag("production", 2, 2) }),
  ];
  const s = sessionSummary({ sessionRows: session, evidence: session, cards: CARDS, now: NOW });
  eq(s.movement.gold, 1);
  eq(s.recoveries.landed, 1);
  eq(s.weakest, null, "two answers has measured nothing");
  eq(s.act, null, "these ids are not in the deck");
});
t("an empty session produces an empty, non-throwing summary", () => {
  const s = sessionSummary({});
  eq(s.movement.moved, false);
  eq(s.recoveries.landed, 0);
  eq(s.weakest, null);
  eq(s.act, null);
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} summary tests passed`);
process.exit(fail ? 1 : 0);
