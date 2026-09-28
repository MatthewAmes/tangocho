// Tests for tools/explain.mjs — the feedback sheet's explanations.
//
//   node tools/test-explain.mjs
import { explainAnswer, kanjiParts, kanjiIndex, whyConfusable } from "./explain.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const has = (lines, re) => ok(lines.some((l) => re.test(l)), "no line matches " + re + " in " + JSON.stringify(lines));

const KANJI = { kanji: [
  { c: "火", m: ["fire"] }, { c: "水", m: ["water"] }, { c: "曜", m: ["weekday"] }, { c: "日", m: ["day", "sun", "Japan"] },
  { c: "学", m: ["study", "learning"] }, { c: "校", m: ["school"] },
] };
const CARDS = [
  { id: "tue", term: "火曜日", reading: "かようび", meaning: "Tuesday" },
  { id: "wed", term: "水曜日", reading: "すいようび", meaning: "Wednesday" },
  { id: "sch", term: "学校", reading: "がっこう", meaning: "school" },
  { id: "eat", term: "食べる", reading: "たべる", meaning: "to eat" },
  { id: "dog", term: "犬", reading: "いぬ", meaning: "dog" },
  { id: "cat", term: "猫", reading: "ねこ", meaning: "cat", mn: "a cat on a neck-o" },
];
const [TUE, WED, SCH, EAT, DOG, CAT] = CARDS;

console.log("=== taking a word apart ===");
t("each kanji with its own meaning, first two only", () => {
  const p = kanjiParts("火曜日", KANJI);
  eq(p.map((x) => x.c).join(""), "火曜日");
  eq(p[2].m, "day, sun");
});
t("kana and unknown kanji are skipped, not guessed", () => {
  eq(kanjiParts("食べる", KANJI).length, 0);
  eq(kanjiParts("たべる", kanjiIndex(KANJI)).length, 0);
});

console.log("=== why two words get mixed up ===");
t("a shared kanji is named", () => ok(/曜日/.test(whyConfusable(TUE, WED))));
t("readings that sound alike are named", () => ok(/sound alike/.test(whyConfusable({ term: "いぬ", reading: "いぬ" }, { term: "いね", reading: "いね" }))));
t("unrelated words have no stated reason", () => eq(whyConfusable(DOG, SCH), null));

console.log("=== explaining a correct answer ===");
t("a right answer takes the word apart and shows the hook", () => {
  const e = explainAnswer({ card: TUE, verdict: { ok: true }, cards: CARDS, kanji: KANJI });
  eq(e.ok, true);
  has(e.lines, /火曜日 \(かようび\) means “Tuesday”/);
  has(e.lines, /火 \(fire\) \+ 曜 \(weekday\)/);
  has(explainAnswer({ card: CAT, verdict: { ok: true }, cards: CARDS }).lines, /Your hook: a cat/);
});

console.log("=== explaining a typed mistake ===");
t("a slip is named and the sounds are marked", () => {
  const e = explainAnswer({ card: SCH, verdict: { ok: false, got: "がこう", want: "がっこう" }, activity: "type", cards: CARDS });
  has(e.lines, /small っ/);
  eq(e.marks.filter((m) => m.miss).map((m) => m.ch).join(""), "っ");
});
t("another deck word is explained as a confusion, with the pair", () => {
  const e = explainAnswer({ card: WED, verdict: { ok: false, got: "かようび", want: "すいようび" }, activity: "type", cards: CARDS, kanji: KANJI });
  has(e.lines, /different one: 火曜日/);
  has(e.lines, /Both are written with 曜日/);
  eq(e.pair.id, "tue");
});
t("right word, wrong form names the form", () => {
  const e = explainAnswer({ card: EAT, verdict: { ok: false, got: "たべました", want: "たべる" }, activity: "type", cards: CARDS });
  has(e.lines, /polite past/);
  has(e.lines, /dictionary form, たべる/);
});
t("a blank is treated as normal, not as failure", () => {
  const e = explainAnswer({ card: DOG, verdict: { ok: false, got: "", want: "いぬ" }, activity: "type", cards: CARDS });
  has(e.lines, /normal for a newer word/);
});
t("a spoken answer says 'said', not 'wrote'", () => {
  const e = explainAnswer({ card: DOG, verdict: { ok: false, got: "いね", want: "いぬ", spoken: true }, activity: "type", cards: CARDS });
  has(e.lines, /You said いね/);
});

console.log("=== explaining a wrong pick ===");
t("a meaning choice explains both words", () => {
  const e = explainAnswer({ card: TUE, verdict: { ok: false, mc: true, chose: "Wednesday", chosenId: "wed" }, activity: "mc", cards: CARDS, kanji: KANJI });
  has(e.lines, /火曜日 \(かようび\) means “Tuesday”/);
  has(e.lines, /belongs to 水曜日/);
  eq(e.pair.id, "wed");
});
t("a listening miss says what was heard", () => {
  const e = explainAnswer({ card: DOG, verdict: { ok: false, mc: true, chosenId: "cat" }, activity: "listen", cards: CARDS });
  has(e.lines, /What you heard was いぬ/);
});
t("a cloze miss says what the sentence needs", () => {
  const e = explainAnswer({ card: SCH, verdict: { ok: false, chose: "犬", chosenId: "dog" }, activity: "cloze", cards: CARDS });
  has(e.lines, /This sentence needs 学校/);
  eq(e.pair.id, "dog");
});

console.log("=== sentence and spelling drills ===");
t("a built sentence shows both versions and the meaning", () => {
  const e = explainAnswer({ card: SCH, verdict: { ok: false, got: "学校にいきます", want: ["学校", "へ", "いきます"] }, activity: "build", drill: { en: "I go to school." }, cards: CARDS });
  has(e.lines, /You made: 学校にいきます/);
  has(e.lines, /The sentence is: 学校へいきます/);
  has(e.lines, /I go to school/);
});
t("a spelling drill passes on the rule it tested", () => {
  const e = explainAnswer({ card: SCH, verdict: { ok: false, chose: "がこう", want: "がっこう", note: "っ doubles the next consonant." }, activity: "spell", cards: CARDS });
  has(e.lines, /spelled がっこう, not がこう/);
  has(e.lines, /doubles/);
});
t("a build activity that fell back to multiple choice is explained as a pick", () => {
  const e = explainAnswer({ card: TUE, verdict: { ok: false, mc: true, chose: "Wednesday", chosenId: "wed", want: "Tuesday" }, activity: "build", drill: null, cards: CARDS });
  has(e.lines, /belongs to 水曜日/);
  ok(!e.lines.some((l) => /The sentence is/.test(l)));
});
t("no verdict, no explanation", () => eq(explainAnswer({ card: DOG, verdict: null }), null));

console.log(fail ? `${fail} of ${run} explain tests FAILED` : `all ${run} explain tests passed`);
process.exit(fail ? 1 : 0);
