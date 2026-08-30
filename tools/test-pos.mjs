// Tests for gloss-based part of speech (tools/pos.mjs), which exists to keep multiple-choice
// distractors from being answerable by grammar alone.
//
//   node tools/test-pos.mjs
import { posOf, shortGloss, POS } from "./pos.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

console.log("=== the reported case ===");
t("the four options from the screenshot no longer share a category", () => {
  // 急ぎます against these three was answerable without knowing the word: only one verb
  const target = { meaning: "to hurry (u-verb; past: 急いだ)", reading: "いそぎます" };
  const others = [
    { meaning: "Who is it that cleaned up?", reading: "だれがかたづけたんですか" },
    { meaning: "Vietnamese (language)", reading: "ベトナムご" },
    { meaning: "break, holiday", reading: "やすみ" },
  ];
  eq(posOf(target), POS.VERB);
  for (const o of others) {
    if (posOf(o) === POS.VERB) throw new Error("miscategorised as a verb: " + o.meaning);
  }
});

console.log("=== categories ===");
t("the deck's verb convention is 'to X'", () => {
  eq(posOf({ meaning: "to eat" }), POS.VERB);
  eq(posOf({ meaning: "to be grateful; I am grateful (use に to mark what for)" }), POS.VERB);
});
t("a ます/ません term is a verb whatever the gloss looks like", () => {
  eq(posOf({ meaning: "understand", reading: "わかります" }), POS.VERB);
  eq(posOf({ meaning: "does not exist", reading: "ありません" }), POS.VERB);
});
t("a question gloss is its own category", () => {
  eq(posOf({ meaning: "What does ~ mean?" }), POS.QUESTION);
  eq(posOf({ meaning: "Who is it that cleaned up?" }), POS.QUESTION);
});
t("plain nouns are nouns", () => {
  eq(posOf({ meaning: "cat", reading: "ねこ" }), POS.NOUN);
  eq(posOf({ meaning: "break, holiday", reading: "やすみ" }), POS.NOUN);
  eq(posOf({ meaning: "Vietnamese (language)", reading: "ベトナムご" }), POS.NOUN);
});
t("a leading parenthetical does not decide the category", () => {
  eq(posOf({ meaning: "(polite) to come", reading: "まいります" }), POS.VERB);
});
t("empty and missing glosses are unknown, not guessed", () => {
  eq(posOf({ meaning: "" }), POS.UNKNOWN);
  eq(posOf({}), POS.UNKNOWN);
  eq(posOf(null), POS.UNKNOWN);
});
t("a noun is never reported as a verb just for being long", () => {
  eq(posOf({ meaning: "the thing you use to open a door with", reading: "かぎ" }), POS.NOUN);
});

console.log("=== the length tell ===");
t("grammar annotations are trimmed for display", () => {
  eq(shortGloss("to hurry (u-verb; past: 急いだ)"), "to hurry");
  eq(shortGloss("Vietnamese (language)"), "Vietnamese");
});
t("only the first sense is shown", () => {
  eq(shortGloss("to do; play (a sport/game)"), "to do");
});
t("a very long gloss is capped", () => {
  const s = shortGloss("a" .repeat(200));
  if (s.length > 49) throw new Error("not capped: " + s.length);
});
t("a gloss that is already short is untouched", () => {
  eq(shortGloss("cat"), "cat");
  eq(shortGloss("break, holiday"), "break, holiday");
});
t("a gloss made ENTIRELY of annotation falls back rather than vanishing", () => {
  // stripping "(language)" to nothing would render a blank option, which is worse than
  // showing the annotation; an empty input legitimately has no label and stays empty
  for (const g of ["(polite form)", "(language)", "()"]) {
    if (!shortGloss(g).length) throw new Error("empty label for " + JSON.stringify(g));
  }
  eq(shortGloss(""), "", "nothing in, nothing out");
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} pos tests passed`);
process.exit(fail ? 1 : 0);
