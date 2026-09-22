// Tests for tools/nearmiss.mjs — the checkpoint follow-up.
//
//   node tools/test-nearmiss.mjs
import {
  spentIds, liveReserve, markFixed, confusedWith, slipOf, slipMarks, followUpFor, wantFor,
  FOLLOW_UP_MAX, FOLLOW_UP_DAYS,
} from "./nearmiss.mjs";
import { scoreRun, pushRun, reserveFor, sampleFor, cycleFor } from "./benchmark.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const card = (id, term, reading, meaning) => ({ id, term, reading, meaning });
const CARDS = [
  card("k1", "学校", "がっこう", "school"),
  card("k2", "火曜日", "かようび", "Tuesday"),
  card("k3", "水曜日", "すいようび", "Wednesday"),
  card("k4", "病院", "びょういん", "hospital"),
  card("k5", "銀行", "ぎんこう", "bank"),
  card("k6", "先生", "せんせい", "teacher"),
  card("k7", "実験（する）", "じっけん（する）", "experiment"),
  card("k8", "猫", "ねこ", "cat"),
];
const NOW = Date.UTC(2026, 8, 22);

console.log("=== naming the slip ===");
t("dropped small っ", () => eq(slipOf("がこう", "がっこう").kind, "sokuon"));
t("small ょ written big", () => eq(slipOf("びよういん", "びょういん").kind, "small-kana"));
t("missing voicing mark", () => eq(slipOf("きんこう", "ぎんこう").kind, "voicing"));
t("long vowel dropped, and the note says which way", () => {
  const s = slipOf("せんせ", "せんせい");
  eq(s.kind, "long-vowel");
  ok(/hold/.test(s.note));
  eq(slipOf("ねこう", "ねこ").kind, "long-vowel", "an added long vowel is the same slip");
  ok(/short/.test(slipOf("ねこう", "ねこ").note));
});
t("blank is its own thing", () => eq(slipOf("", "ねこ").kind, "blank"));
t("an unrelated answer is a different word, not a near miss", () => eq(slipOf("いぬ", "ねこ").kind, "different"));
t("a confusion names the other word and what it means", () => {
  const s = slipOf("かようび", "すいようび", CARDS[1]);
  eq(s.kind, "confusion");
  ok(s.note.includes("火曜日") && s.note.includes("Tuesday"), s.note);
});

console.log("=== confusion pairs ===");
t("typing another deck word finds that word", () => eq(confusedWith("かようび", CARDS[2], CARDS).id, "k2"));
t("the card itself is never its own confusion", () => eq(confusedWith("すいようび", CARDS[2], CARDS), null));
t("a misspelling that is no word is not a confusion", () => eq(confusedWith("すいよび", CARDS[2], CARDS), null));

console.log("=== highlighting ===");
t("only the missed characters are marked", () => {
  const m = slipMarks("がこう", "がっこう");
  eq(m.map((x) => x.miss ? "_" : x.ch).join(""), "が_こう");
});
t("a blank marks everything", () => ok(slipMarks("", "ねこ").every((x) => x.miss)));
t("katakana typed as hiragana still lines up", () => {
  eq(slipMarks("みるく", "ミルク").filter((x) => x.miss).length, 0);
});

console.log("=== the form a slip is measured against ===");
t("an optional する is matched to what was reached for", () => {
  eq(wantFor(CARDS[6], "じけんする"), "じっけんする");
  eq(wantFor(CARDS[6], "じけん"), "じっけん");
});

console.log("=== the quarantine ===");
const RUN_AT = NOW - 2 * 86400000;
const answers = [
  { id: "k1", got: "がこう" },      // near
  { id: "k3", got: "かようび" },    // confusion
  { id: "k8", got: "ねこ" },        // right
  { id: "k4", got: "" },            // blank
];
const asked = CARDS.filter((c) => ["k1", "k3", "k8", "k4"].includes(c.id));
const scored = scoreRun(asked, answers, RUN_AT);
const history = pushRun([], scored);

t("a saved run keeps what was asked and what was missed", () => {
  eq(history[0].asked.length, 4);
  eq(history[0].missed.length, 3);
  eq(history[0].missed.find((m) => m.id === "k1").near, true);
});
t("asked words leave the quarantine; unasked ones stay", () => {
  const reserve = new Set(["k1", "k3", "k8", "k4", "k5", "k6"]);
  const live = liveReserve(reserve, history, cycleFor(RUN_AT));
  eq([...live].sort().join(","), "k5,k6");
});
t("a run from another cycle spends nothing in this one", () => {
  const old = [{ ...history[0], at: RUN_AT - 200 * 86400000 }];
  eq(spentIds(old, cycleFor(RUN_AT)).size, 0);
});
t("runs saved before asked existed release nothing", () => {
  eq(spentIds([{ at: RUN_AT, n: 30, ok: 10 }], cycleFor(RUN_AT)).size, 0);
});
t("the next checkpoint cannot re-ask a spent word", () => {
  const deck = Array.from({ length: 1600 }, (_, i) => card("w" + i, "語" + i, "ご" + i, "word " + i));
  const reserve = reserveFor(deck, 3);
  const first = sampleFor(deck, reserve, 30, 1);
  const h = pushRun([], scoreRun(first, [], NOW));
  const second = sampleFor(deck, liveReserve(reserve, h, cycleFor(NOW)), 30, 2);
  const firstIds = new Set(first.map((c) => c.id));
  ok(second.length > 0, "the reserve should not be exhausted by one run");
  eq(second.filter((c) => firstIds.has(c.id)).length, 0);
});

console.log("=== the follow-up ===");
t("near misses first, then wrong answers, then blanks", () => {
  const f = followUpFor(history, CARDS, { now: NOW });
  eq(f.items.map((x) => x.kind).join(","), "near,wrong,blank");
  eq(f.items[1].other.id, "k2", "the wrong answer was Tuesday for Wednesday");
  eq(f.items[1].slip.kind, "confusion");
  eq(f.items[0].slip.kind, "sokuon");
});
t("fixed words drop out", () => {
  const h2 = markFixed(history, RUN_AT, ["k1"]);
  const f = followUpFor(h2, CARDS, { now: NOW });
  eq(f.items.length, 2);
  ok(!f.items.some((x) => x.card.id === "k1"));
  eq(markFixed(h2, RUN_AT, ["k1"])[0].fixed.length, 1, "marking twice does not duplicate");
});
t("a stale checkpoint is no longer offered", () => {
  eq(followUpFor(history, CARDS, { now: RUN_AT + (FOLLOW_UP_DAYS + 1) * 86400000 }).items.length, 0);
});
t("a card no longer in the deck is skipped, not crashed on", () => {
  const f = followUpFor(history, CARDS.filter((c) => c.id !== "k4"), { now: NOW });
  eq(f.items.length, 2);
});
t("the follow-up is capped", () => {
  const deck = Array.from({ length: 40 }, (_, i) => card("m" + i, "語" + i, "ご" + i, "w" + i));
  const h = pushRun([], scoreRun(deck, [], NOW));
  const f = followUpFor(h, deck, { now: NOW });
  eq(f.items.length, FOLLOW_UP_MAX);
  eq(f.total, 40);
});
t("no history, no follow-up", () => eq(followUpFor([], CARDS, { now: NOW }).items.length, 0));

console.log(fail ? `${fail} of ${run} nearmiss tests FAILED` : `all ${run} nearmiss tests passed`);
process.exit(fail ? 1 : 0);
