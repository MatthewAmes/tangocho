// Tests for the daily micro-missions (tools/missions.mjs).
//   node tools/test-missions.mjs
//
// Two properties carry most of the weight. First: a mission is never offered that the
// state which generated it could not complete — the "recover 2 mistakes" trap the issue
// names, and five more like it. Second: completion fires EXACTLY on the predicate, from
// the evidence log and nothing else, so a chip cannot claim a goal was met that the rows
// do not show.
import {
  generateMissions, missionProgress, evaluateMissions, missionContext, rollMissions,
  isSatisfiable, rowsForDay, isRecoveryLanded, MISSION_KINDS, MISSION_COUNT, MISSION_BONUS,
} from "./missions.mjs";
import { CUE, MEMORY_CHECK_DAYS } from "./learner.mjs";
import { localDayKey } from "./days.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "") + " expected " + b + ", got " + a); };
const ok = (cond, m) => { if (!cond) throw new Error(m || "expected truthy"); };

const NOW = new Date(2026, 7, 30, 12, 0, 0).getTime();
const DAY = localDayKey(new Date(NOW));
const ago = (days) => NOW - days * 86400000;

// Six Act 6 words and three Act 7 ones. Terms are nonsense on purpose: a real term could
// be placed by SECTION_MAP and quietly land in a different act than the sec says.
const ACT6 = ["z1", "z2", "z3", "z4", "z5", "z6"].map((id) => ({ id, term: id, sec: "6-1" }));
const ACT7 = ["y1", "y2", "y3"].map((id) => ({ id, term: id, sec: "7-2" }));
const CARDS = [...ACT6, ...ACT7];

const row = (over = {}) => ({
  id: "z1", skill: "recognition", format: "mc", ok: true, ms: 2000,
  cue: CUE.CHOOSE, at: NOW, s0: 0, recovery: null, ...over,
});
const state = (over = {}) => ({ evidence: [], cards: CARDS, act: 6, dayKey: DAY, now: NOW, ...over });
const kindsOf = (list) => list.map((m) => m.kind).sort();
const find = (list, kind) => list.find((m) => m.kind === kind) || null;

console.log("=== a learner with no history ===");
const fresh = generateMissions(state());
t("gets the curriculum mission and nothing that needs a history", () => {
  eq(kindsOf(fresh).join(","), "act-words");
});
t("is never asked to recover a mistake they have not made", () => {
  ok(!find(fresh, "recover"), "the trap the issue names");
});
t("is never asked to beat a time the app has never measured", () => {
  ok(!find(fresh, "speed"));
});
t("is never asked to pass a memory check with no old card due", () => {
  ok(!find(fresh, "memory-check"));
});
t("every generated mission passes its own satisfiability check", () => {
  for (const m of fresh) ok(isSatisfiable(m, state()), m.kind + " was offered but is not satisfiable");
});

console.log("=== satisfiability, kind by kind ===");
t("no act means no curriculum mission", () => {
  ok(!find(generateMissions(state({ act: null })), "act-words"));
});
t("an act with too few words is refused rather than shrunk to nothing", () => {
  const thin = [{ id: "q1", term: "q1", sec: "9-1" }, { id: "q2", term: "q2", sec: "9-1" }];
  ok(!find(generateMissions(state({ cards: thin, act: 9 })), "act-words"), "2 words is not a mission");
});
t("an act with three words asks for three, not five", () => {
  const three = ["q1", "q2", "q3"].map((id) => ({ id, term: id, sec: "9-1" }));
  const m = find(generateMissions(state({ cards: three, act: 9 })), "act-words");
  ok(m && m.need === 3, JSON.stringify(m));
});
t("recover appears once there are misses in the window", () => {
  const ev = [row({ id: "z1", ok: false, at: ago(2) }), row({ id: "z2", ok: false, at: ago(3) })];
  const m = find(generateMissions(state({ evidence: ev })), "recover");
  ok(m && m.need === 2, JSON.stringify(m));
});
t("one miss earns a one-mistake mission, not a two-mistake one", () => {
  const m = find(generateMissions(state({ evidence: [row({ ok: false, at: ago(1) })] })), "recover");
  ok(m && m.need === 1, JSON.stringify(m));
});
t("misses older than the window do not vouch for today", () => {
  const old = [row({ id: "z1", ok: false, at: ago(30) }), row({ id: "z2", ok: false, at: ago(40) })];
  ok(!find(generateMissions(state({ evidence: old })), "recover"));
});
t("cue-free needs the app to have been ASKING at that rung", () => {
  const cued = Array.from({ length: 6 }, (_, i) => row({ id: "z" + (i % 6 + 1), cue: CUE.STRONG, at: ago(1) }));
  ok(!find(generateMissions(state({ evidence: cued })), "cue-free"));
  const free = ["z1", "z2", "z3"].map((id) => row({ id, cue: CUE.FREE, at: ago(1) }));
  const m = find(generateMissions(state({ evidence: free })), "cue-free");
  ok(m && m.need === 3, JSON.stringify(m));
});
t("listening needs listening evidence, not just a deck", () => {
  ok(!find(generateMissions(state()), "listening"));
  const heard = ["z1", "z2"].map((id) => row({ id, skill: "listening", format: "listen", at: ago(1) }));
  ok(find(generateMissions(state({ evidence: heard })), "listening"));
});
t("speed needs a latency norm, which needs eight timed correct answers", () => {
  const seven = Array.from({ length: 7 }, (_, i) => row({ id: "z" + (i % 6 + 1), ms: 1500 + i, at: ago(1) }));
  ok(!find(generateMissions(state({ evidence: seven })), "speed"), "seven is not a norm");
  const eight = [...seven, row({ id: "z1", ms: 1600, at: ago(1) })];
  ok(find(generateMissions(state({ evidence: eight })), "speed"), "eight is");
});
t("a memory check is only offered when an old card is actually due", () => {
  const notDue = [...CARDS, { id: "old", term: "old", sec: "6-1", fsrs: { S: 60, due: NOW + 10 * 86400000 } }];
  ok(!find(generateMissions(state({ cards: notDue })), "memory-check"), "due in ten days cannot be done today");
  const due = [...CARDS, { id: "old", term: "old", sec: "6-1", fsrs: { S: 60, due: NOW - 1000 } }];
  ok(find(generateMissions(state({ cards: due })), "memory-check"));
});
t("a card due today but not old enough is not a memory check", () => {
  const young = [...CARDS, { id: "y", term: "y", sec: "6-1", fsrs: { S: MEMORY_CHECK_DAYS - 1, due: NOW - 1000 } }];
  ok(!find(generateMissions(state({ cards: young })), "memory-check"));
});
t("a stored mission that outgrew its state stops being satisfiable", () => {
  const one = state({ evidence: [row({ ok: false, at: ago(1) })] });
  ok(isSatisfiable({ kind: "recover", need: 1 }, one));
  ok(!isSatisfiable({ kind: "recover", need: 2 }, one), "one miss cannot justify a two-miss mission");
  ok(!isSatisfiable({ kind: "nonsense", need: 1 }, one), "an unknown kind is never satisfiable");
});

console.log("=== how many, and which ===");
// Everything switched on at once, so the selection rule is what is under test.
const RICH = [
  ...Array.from({ length: 8 }, (_, i) => row({ id: "z" + (i % 6 + 1), ms: 1500 + i * 10, at: ago(2) })),
  row({ id: "z1", ok: false, at: ago(2) }), row({ id: "z2", ok: false, at: ago(3) }),
  row({ id: "z3", cue: CUE.FREE, at: ago(2) }), row({ id: "z4", cue: CUE.FREE, at: ago(2) }),
  row({ id: "z5", cue: CUE.FREE, at: ago(2) }),
  row({ id: "z1", skill: "listening", format: "listen", at: ago(2) }),
  row({ id: "z2", skill: "listening", format: "listen", at: ago(2) }),
];
const richState = (over = {}) => state({ evidence: RICH, ...over });
t("never more than asked for", () => {
  eq(generateMissions(richState()).length, MISSION_COUNT);
  eq(generateMissions(richState(), 2).length, 2);
});
t("the curriculum mission is always one of them when it is available", () => {
  ok(find(generateMissions(richState()), "act-words"), "the quest is the point of the feature");
});
t("the same day always produces the same board", () => {
  eq(JSON.stringify(generateMissions(richState())), JSON.stringify(generateMissions(richState())));
});
t("the rest rotate day to day rather than sitting still", () => {
  const seen = new Set();
  for (const d of ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]) {
    for (const m of generateMissions(richState({ dayKey: d }))) seen.add(m.kind);
  }
  ok(seen.size > MISSION_COUNT, "four days produced only " + seen.size + " distinct kinds");
});
t("every mission carries a stable id, a label and a note", () => {
  for (const m of generateMissions(richState())) {
    ok(m.id && m.label && m.note, JSON.stringify(m));
    ok(!/undefined|NaN/.test(m.id + m.label + m.note), "no placeholder leaked into " + m.id);
  }
});
t("the catalogue and its lookup agree", () => {
  eq(new Set(MISSION_KINDS.map((k) => k.kind)).size, MISSION_KINDS.length, "duplicate kind");
  ok(MISSION_BONUS > 0);
});

console.log("=== completion fires exactly on the predicate ===");
const ctx = missionContext(state());
const prog = (mission, rows) => missionProgress(mission, rows, missionContext(state({ evidence: rows })));

t("act words: four of five is not five", () => {
  const m = { kind: "act-words", act: 6, need: 5 };
  const rows = ["z1", "z2", "z3", "z4"].map((id) => row({ id }));
  eq(prog(m, rows).complete, false);
  eq(prog(m, [...rows, row({ id: "z5" })]).complete, true);
});
t("act words: the same word five times is one word", () => {
  const m = { kind: "act-words", act: 6, need: 5 };
  const rows = Array.from({ length: 5 }, () => row({ id: "z1" }));
  eq(prog(m, rows).done, 1);
});
t("act words: another act does not count", () => {
  const m = { kind: "act-words", act: 6, need: 3 };
  eq(prog(m, ["y1", "y2", "y3"].map((id) => row({ id }))).done, 0);
});
t("act words: a miss does not count", () => {
  const m = { kind: "act-words", act: 6, need: 3 };
  eq(prog(m, ["z1", "z2", "z3"].map((id) => row({ id, ok: false }))).done, 0);
});
t("recover: only the LAST rung of a ladder counts", () => {
  const m = { kind: "recover", need: 1 };
  eq(prog(m, [row({ recovery: "production:2/3" })]).done, 0, "the climb is not the summit");
  eq(prog(m, [row({ recovery: "production:3/3" })]).done, 1);
});
t("recover: a missed last rung is not a recovery", () => {
  eq(prog({ kind: "recover", need: 1 }, [row({ ok: false, recovery: "production:3/3" })]).done, 0);
});
t("recover: a malformed tag never counts", () => {
  ok(!isRecoveryLanded(row({ recovery: "production" })));
  ok(!isRecoveryLanded(row({ recovery: "" })));
  ok(!isRecoveryLanded(row({ recovery: null })));
  ok(isRecoveryLanded(row({ recovery: "meaning:2/2" })));
});
t("cue-free: a hinted success does not count", () => {
  const m = { kind: "cue-free", need: 2 };
  eq(prog(m, [row({ id: "z1", cue: CUE.PARTIAL }), row({ id: "z2", cue: CUE.PARTIAL })]).done, 0);
  eq(prog(m, [row({ id: "z1", cue: CUE.FREE }), row({ id: "z2", cue: CUE.CONTEXT })]).done, 2);
});
t("listening: only listening evidence counts", () => {
  const m = { kind: "listening", need: 2 };
  eq(prog(m, [row({ id: "z1" }), row({ id: "z2" })]).done, 0);
  eq(prog(m, [row({ id: "z1", skill: "listening" }), row({ id: "z2", skill: "listening" })]).done, 2);
});
t("memory check: the stability BEFORE the answer is what is asked about", () => {
  const m = { kind: "memory-check", need: 1 };
  eq(prog(m, [row({ s0: MEMORY_CHECK_DAYS - 0.5 })]).done, 0);
  eq(prog(m, [row({ s0: MEMORY_CHECK_DAYS })]).done, 1);
  eq(prog(m, [row({ s0: 90, ok: false })]).done, 0, "a miss is not a memory check");
});
t("speed: fast is measured against this learner's own norm", () => {
  // Eight slow correct answers make the norm; the fast quartile of them sits at ~5000ms.
  const history = Array.from({ length: 8 }, (_, i) => row({ id: "z" + (i % 6 + 1), ms: 5000 + i * 500, at: ago(2) }));
  const withNorm = missionContext(state({ evidence: history }));
  const m = { kind: "speed", need: 2 };
  const slow = [row({ id: "z1", ms: 9000 }), row({ id: "z2", ms: 9000 })];
  eq(missionProgress(m, slow, withNorm).done, 0);
  const quick = [row({ id: "z1", ms: 900 }), row({ id: "z2", ms: 900 })];
  eq(missionProgress(m, quick, withNorm).complete, true);
});
t("progress never overshoots what was asked for", () => {
  const m = { kind: "act-words", act: 6, need: 3 };
  const p = prog(m, ["z1", "z2", "z3", "z4", "z5"].map((id) => row({ id })));
  eq(p.done, 3);
  eq(p.pct, 1);
});
t("an unknown kind reports nothing rather than throwing", () => {
  const p = missionProgress({ kind: "gone", need: 3 }, [row()], ctx);
  eq(p.complete, false);
});
t("evaluateMissions attaches progress without losing the mission", () => {
  const list = evaluateMissions([{ kind: "act-words", act: 6, need: 2, label: "L" }], [row({ id: "z1" }), row({ id: "z2" })], ctx);
  eq(list[0].label, "L");
  eq(list[0].complete, true);
});

console.log("=== the day boundary ===");
t("only today's rows count, by LOCAL day", () => {
  const evening = new Date(2026, 7, 30, 22, 30, 0).getTime();   // UTC would call this tomorrow
  const rows = rowsForDay([row({ at: evening }), row({ at: ago(1) })], DAY);
  eq(rows.length, 1);
});
t("a board within its day is left alone", () => {
  const first = rollMissions(null, richState());
  ok(first.rerolled);
  const again = rollMissions(first, richState());
  eq(again.rerolled, false);
  eq(JSON.stringify(again.missions), JSON.stringify(first.missions));
});
t("payouts already made survive the day", () => {
  const held = { day: DAY, missions: [{ kind: "recover", need: 1 }], awarded: ["recover:1"] };
  eq(rollMissions(held, richState()).awarded.join(","), "recover:1");
});
t("a new day rerolls, and the payouts reset with it", () => {
  const yesterday = { day: "2026-08-29", missions: [{ kind: "recover", need: 1 }], awarded: ["recover:1"] };
  const next = rollMissions(yesterday, richState());
  ok(next.rerolled);
  eq(next.day, DAY);
  eq(next.awarded.length, 0);
});
t("a completed mission is not rerolled out from under the learner", () => {
  /* Finishing "recover 2" removes nothing, but finishing it is exactly when the state that
     justified it can look thinnest. The day's board is fixed once rolled. */
  const board = rollMissions(null, richState());
  const after = rollMissions(board, state({ evidence: [] }));
  eq(after.rerolled, false);
  eq(after.missions.length, board.missions.length);
});
t("a corrupt stored record rerolls rather than rendering nothing", () => {
  eq(rollMissions({ day: DAY, missions: "not a list" }, richState()).rerolled, true);
});

console.log("\nall " + run + " mission tests " + (fail ? "— " + fail + " FAILED" : "passed"));
process.exit(fail ? 1 : 0);
