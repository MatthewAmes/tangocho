// Tests for tools/furigana.mjs — readings for sentences that have none.
//
//   node tools/test-furigana.mjs
import { kanjiPart, readingLexicon, annotate } from "./furigana.mjs";
import { SEED } from "../src/data/seed.js";
import fsx from "node:fs";
const FREQ = JSON.parse(fsx.readFileSync(new URL("../data/freq.json", import.meta.url), "utf8")).words;

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const show = (tokens) => tokens.map((x) => (x.r ? `${x.t}(${x.r})` : x.t)).join("");

t("a deck word gives its kanji part, okurigana trimmed", () => {
  eq(kanjiPart("会う", "あう"), { kanji: "会", reading: "あ", okuri: "う" });
  eq(kanjiPart("食べる", "たべる"), { kanji: "食", reading: "た", okuri: "べる" });
  eq(kanjiPart("先日", "せんじつ"), { kanji: "先日", reading: "せんじつ", okuri: "" });
  eq(kanjiPart("お茶", "おちゃ"), { kanji: "茶", reading: "ちゃ", okuri: "" });
  eq(kanjiPart("通う(-u; 通った)", "かよう").kanji, "通");
  eq(kanjiPart("ありがとう", "ありがとう"), null, "no kanji, nothing to read");
});
const LEX = readingLexicon([
  { term: "先日", reading: "せんじつ" }, { term: "友達", reading: "ともだち" }, { term: "会う", reading: "あう" },
  { term: "会社", reading: "かいしゃ" }, { term: "会", reading: "かい" }, { term: "日本", reading: "にほん" },
]);
t("the screenshot sentence gets every reading", () => {
  eq(show(annotate("先日、友達に会いました。", LEX)), "先日(せんじつ)、友達(ともだち)に会(あ)いました。");
});
t("the longest known run wins, so 会社 is かいしゃ", () => {
  eq(show(annotate("会社に行きます。", LEX)), "会社(かいしゃ)に行きます。");
});
t("the verb reading where kana follows, the noun reading where it does not", () => {
  eq(show(annotate("会に会う", LEX)), "会(かい)に会(あ)う");
});
t("an unknown kanji is left bare, never guessed", () => {
  eq(show(annotate("猫が好き", LEX)), "猫が好き");
});
t("text with no kanji passes straight through", () => eq(annotate("ありがとう。", LEX), [{ t: "ありがとう。" }]));
t("the real deck plus the 10k list reads the words of a common sentence", () => {
  const lex = readingLexicon(SEED, FREQ);
  const out = show(annotate("先日、友達に会いました。", lex));
  ok(/友達\(ともだち\)/.test(out) && /会\(あ\)/.test(out), out);
});

t("compounds the deck lacks are read whole, not split into wrong pieces", () => {
  const out = show(annotate("日本語の先生は優しいです。", readingLexicon(SEED, FREQ)));
  ok(/先生\(せんせい\)/.test(out), out);
});
t("a reading that needs an ending is not used without one", () => {
  const lex = readingLexicon([{ term: "三つ", reading: "みっつ" }, { term: "年間", reading: "ねんかん" }]);
  eq(show(annotate("三年間", lex)), "三年間(ねんかん)");
  eq(show(annotate("三つ", lex)), "三(みっ)つ");
});
t("a verb's ending is recognised conjugated", () => {
  const lex = readingLexicon([{ term: "行く", reading: "いく" }, { term: "飲む", reading: "のむ" }]);
  eq(show(annotate("行きます", lex)), "行(い)きます");
  eq(show(annotate("行った", lex)), "行(い)った");
  eq(show(annotate("飲みます", lex)), "飲(の)みます");
});

console.log(fail ? `${fail} of ${run} furigana tests FAILED` : `all ${run} furigana tests passed`);
process.exit(fail ? 1 : 0);
