// Tests for tools/bookorder.mjs — one act at a time, producing the Japanese.
//
//   node tools/test-bookorder.mjs
import { actProgress, focusAct, bookSession, canSay, SAY_DAYS } from "./bookorder.mjs";
import { interventionFor } from "./session.mjs";
import { CUE } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const NOW = Date.UTC(2026, 10, 3);
const DAY = 86400000;
let n = 0;
const word = (sec, extra = {}) => ({ id: "w" + (n++), sec, term: "語" + n, reading: "ご", meaning: "word", ...extra });
const said = (S, dueIn) => ({ seen: 3, rseen: 2, rcorrect: 2, rfsrs: { S, D: 5, last: NOW - DAY, due: NOW + dueIn * DAY } });

t("progress counts words, tried and can-say per act, in book order", () => {
  const cards = [word("8-1"), word("7-2", said(SAY_DAYS, 3)), word("7-1", said(1, 1)), word("7/20"), word("3-1")];
  eq(actProgress(cards).map((x) => [x.act, x.total, x.started, x.say]), [[3, 1, 0, 0], [7, 2, 2, 1], [8, 1, 0, 0]]);
});

t("class-date lists ('7/20') are not textbook words", () => {
  eq(actProgress([word("7/20")]), []);
});

t("focus is the first act from `from` with an untried word", () => {
  const cards = [word("3-1"), word("7-1", said(2, 1)), word("8-1")];
  eq(focusAct(cards, 7), 8, "Act 7 is fully tried");
  eq(focusAct(cards, 3), 3);
  eq(focusAct([word("7-1", said(2, 1))], 7), null);
});

t("new words come in book order from the focus act, ten at most", () => {
  const cards = [word("7-3"), ...Array.from({ length: 12 }, () => word("7-1")), word("8-1"), word("3-1")];
  const firsts = bookSession(cards, { now: NOW }).filter((p) => p.step === 0);
  eq(firsts.length, 10);
  ok(firsts.every((p) => p.item.sec === "7-1"), "scene 1 before scene 3, nothing from Act 3");
});

t("a word already recognised costs half, so twice as many fit", () => {
  const cards = Array.from({ length: 30 }, () => word("7-1", { seen: 4, correct: 4 }));
  eq(bookSession(cards, { now: NOW }).filter((p) => p.step === 0).length, 20);
});

t("intake rolls into the next act when the focus act runs out", () => {
  const cards = [word("7-1"), word("7-2"), word("8-1")];
  eq(bookSession(cards, { now: NOW }).filter((p) => p.step === 0).map((p) => p.item.sec), ["7-1", "7-2", "8-1"]);
});

t("reviews are due production memories only; the recognition backlog is left alone", () => {
  const dueProd = word("3-2", said(2, -1));
  const notDue = word("7-1", said(10, 5));
  const recogOverdue = word("4-1", { seen: 6, correct: 5, fsrs: { S: 3, due: NOW - 30 * DAY } });
  const ids = bookSession([dueProd, notDue, recogOverdue], { now: NOW, from: 12 }).map((p) => p.item.id);
  eq(ids, [dueProd.id]);
});

t("reviews are capped, and a pile over twice the cap halves new intake", () => {
  const due = Array.from({ length: 40 }, () => word("7-1", said(2, -1)));
  const fresh = Array.from({ length: 20 }, () => word("8-1"));
  const s = bookSession([...due, ...fresh], { now: NOW });
  eq(s.filter((p) => p.step === 0 && !p.fresh).length, 15);
  eq(s.filter((p) => p.step === 0 && p.fresh).length, 5);
});

t("a word never met comes three times, a recognised one twice, never back to back", () => {
  const due = Array.from({ length: 12 }, () => word("3-1", said(2, -1)));
  const a = word("7-1"), b = word("7-2", { seen: 3, correct: 3 });
  const s = bookSession([...due, a, b], { now: NOW });
  eq(s.filter((p) => p.item.id === a.id).map((p) => p.step), [0, 1, 2]);
  eq(s.filter((p) => p.item.id === b.id).map((p) => p.step), [0, 1]);
  for (let i = 1; i < s.length; i++) ok(s[i].item.id !== s[i - 1].item.id, "massed repeat at " + i);
});

t("parked, held-out and unreadable words are skipped", () => {
  const p = word("7-1", { parked: true }), h = word("7-1"), r = word("7-1", { reading: "" }), keep = word("7-1");
  const ids = bookSession([p, h, r, keep], { now: NOW, exclude: new Set([h.id]) }).map((x) => x.item.id);
  eq([...new Set(ids)], [keep.id]);
});

t("production first: a new word is shown, then always asked for the Japanese", () => {
  const caps = { type: true };
  const first = interventionFor({ fresh: true, step: 0, caps, st: {} }, { productionFirst: true });
  eq([first.format, first.cue], ["learn", CUE.SHOWN]);
  const next = interventionFor({ fresh: true, step: 1, caps, st: { seen: 1, correct: 1 } }, { productionFirst: true });
  eq([next.skill, next.format, next.cue], ["production", "type", CUE.STRONG]);
  const known = interventionFor({ step: 0, caps, st: { seen: 9, correct: 9, fsrs: { S: 40 } } }, { productionFirst: true });
  eq([known.skill, known.cue], ["production", CUE.STRONG], "recognised but never produced: production with the strong hint");
});

t("production first: the hint thins as the word holds, and comes back after a miss", () => {
  const caps = { type: true };
  const solid = { seen: 9, correct: 9, rseen: 6, rcorrect: 6, rfsrs: { S: 20 } };
  eq(interventionFor({ step: 0, caps, st: solid }, { productionFirst: true }).cue, CUE.FREE);
  eq(interventionFor({ step: 0, caps, st: { ...solid, lastFailure: "blank" } }, { productionFirst: true }).cue, CUE.STRONG);
  const mid = { seen: 9, correct: 9, rseen: 4, rcorrect: 3, rfsrs: { S: 4 } };
  eq(interventionFor({ step: 0, caps, st: mid }, { productionFirst: true }).cue, CUE.PARTIAL);
  eq(interventionFor({ step: 1, caps, st: mid }, { productionFirst: true }).cue, CUE.FREE, "a repeat asks a little more");
});

t("canSay means a production memory of a week or more", () => {
  ok(canSay({ rfsrs: { S: SAY_DAYS } }));
  ok(!canSay({ rfsrs: { S: SAY_DAYS - 0.1 } }));
  ok(!canSay({ fsrs: { S: 99 } }), "recognising it is not saying it");
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
