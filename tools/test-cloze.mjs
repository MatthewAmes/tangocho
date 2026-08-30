// Tests for contextual exercises mined from the app's own scripted dialogue.
//
//   node tools/test-cloze.mjs
import { lineText, buildClozeIndex, hasContext, clozeFor, clozeChoices } from "./cloze.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };

const SCRIPTS = [{
  id: "s1", name: "2-1",
  lines: [
    { speaker: "A", tokens: [{ t: "毎日" }, { t: "食べ物", r: "たべもの" }, { t: "を買います。" }],
      romaji: "mainichi tabemono o kaimasu.", en: "I buy food every day." },
    { speaker: "B", tokens: [{ t: "大丈夫", r: "だいじょうぶ" }, { t: "です。" }],
      romaji: "daijōbu desu.", en: "It's fine." },
    { speaker: "A", tokens: [{ t: "食べ物" }], romaji: "tabemono", en: "Food." },
  ],
}];
const CARDS = [
  { id: "a", term: "食べ物", reading: "たべもの", kind: "kanji" },
  { id: "b", term: "大丈夫", reading: "だいじょうぶ", kind: "kanji" },
  { id: "c", term: "学生", reading: "がくせい", kind: "kanji" },
  { id: "d", term: "先生", reading: "せんせい", kind: "kanji" },
  { id: "e", term: "時間", reading: "じかん", kind: "kanji" },
  { id: "f", term: "本", reading: "ほん", kind: "kanji" },
];

console.log("=== mining the scripts ===");
t("a line flattens to its plain Japanese", () => {
  eq(lineText(SCRIPTS[0].lines[0]), "毎日食べ物を買います。");
});
t("words used in dialogue get contextual material", () => {
  const idx = buildClozeIndex(SCRIPTS, CARDS);
  ok(hasContext(idx, "a"), "食べ物 appears in a sentence");
  ok(hasContext(idx, "b"), "大丈夫 appears in a sentence");
});
t("a word that never appears gets nothing — and says so", () => {
  // The honest limit of this approach. No material means no context exercise, and the
  // profile must report no evidence rather than inventing a score.
  const idx = buildClozeIndex(SCRIPTS, CARDS);
  eq(hasContext(idx, "c"), false, "学生 is not in any dialogue");
  eq(clozeFor(idx, CARDS[2]), null);
});
t("a line that is ONLY the word is not usable context", () => {
  // "食べ物" on its own teaches nothing about using 食べ物.
  const idx = buildClozeIndex(SCRIPTS, CARDS);
  const list = idx.get("a");
  for (const hit of list) ok(hit.text.length > "食べ物".length, `bare word used as context: ${hit.text}`);
});

console.log("\n=== the exercise ===");
t("the word is replaced by a blank of the right size", () => {
  const idx = buildClozeIndex(SCRIPTS, CARDS);
  const ex = clozeFor(idx, CARDS[0]);
  ok(ex, "expected an exercise");
  eq(ex.sentence.includes("食べ物"), false, "the answer must not be visible");
  eq(ex.blank.length, 3, "blank should match the word length");
  eq(ex.before + ex.term + ex.after, "毎日食べ物を買います。", "the sentence must reassemble");
});
t("the English is carried so the task is answerable", () => {
  const idx = buildClozeIndex(SCRIPTS, CARDS);
  const ex = clozeFor(idx, CARDS[0]);
  eq(ex.en, "I buy food every day.");
});
t("the same card gives the same sentence on a reload", () => {
  const idx = buildClozeIndex(SCRIPTS, CARDS);
  eq(clozeFor(idx, CARDS[0]).sentence, clozeFor(idx, CARDS[0]).sentence);
});

console.log("\n=== choices ===");
t("the correct answer is always among the options", () => {
  const opts = clozeChoices(CARDS[0], CARDS, 3, 5);
  ok(opts.some((c) => c.id === "a"), "the answer must be offered");
});
t("options are distinct and include the right count", () => {
  const opts = clozeChoices(CARDS[0], CARDS, 3, 2);
  eq(new Set(opts.map((c) => c.id)).size, opts.length, "no duplicates");
  gt(opts.length, 1);
});
t("a tiny deck degrades instead of crashing", () => {
  const opts = clozeChoices(CARDS[0], [CARDS[0]], 3, 1);
  ok(opts.some((c) => c.id === "a"));
});
t("a word the learner has confused with this one is offered", () => {
  // The tiering lives in distractors.mjs (tested there); this only proves the wiring.
  const opts = clozeChoices(CARDS[0], CARDS, 3, 4, ["f"]);
  ok(opts.some((c) => c.id === "f"), "expected 本 among " + opts.map((c) => c.term).join(", "));
});
t("the same seed gives the same options in the same order", () => {
  const a = clozeChoices(CARDS[0], CARDS, 3, 4).map((c) => c.id).join(",");
  eq(clozeChoices(CARDS[0], CARDS, 3, 4).map((c) => c.id).join(","), a);
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} cloze tests passed`);
process.exit(fail ? 1 : 0);
