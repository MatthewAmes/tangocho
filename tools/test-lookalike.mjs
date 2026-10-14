// Tests for tools/lookalike.mjs — kanji that look alike.
//
//   node tools/test-lookalike.mjs
import { partsOf, lookalikesOf, areLookalike, kanjiDiff, diffSentence, termLookalike, lookalikeScore, SHOW } from "./lookalike.mjs";
import { KANJI_PARTS } from "../src/data/kanji-parts.js";
import { CURATED } from "../src/data/lookalike-notes.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

t("parts are named, and stand-ins drawn as the radical they mean", () => {
  eq(partsOf("休").map((p) => p.show + " " + p.name), ["亻 person", "木 tree"]);
  ok(partsOf("待").some((p) => p.show === "彳" && p.name === "step"));
  ok(partsOf("持").some((p) => p.show === "扌" && p.name === "hand"));
  eq(partsOf("晴").map((p) => p.show).sort(), ["日", "青"].sort(), "the inside of 青 is not listed again");
});
t("買 shows its net, not itself", () => ok(partsOf("買").some((p) => p.show === "罒"), JSON.stringify(partsOf("買"))));
t("a kanji that is one part has no breakdown", () => { eq(partsOf("土"), []); eq(partsOf("力"), []); });

t("the classic confusions are lookalikes", () => {
  for (const [a, b] of [["待", "持"], ["休", "体"], ["未", "末"], ["土", "士"], ["読", "続"], ["間", "聞"], ["晴", "清"], ["力", "刀"]]) {
    ok(areLookalike(a, b), `${a} / ${b}`);
    ok(areLookalike(b, a), `${b} / ${a}`);
  }
});
t("unrelated kanji are not", () => { ok(!areLookalike("日", "魚")); ok(!areLookalike("待", "待")); });
t("a kanji is not called a lookalike of one that merely contains it", () => ok(!lookalikesOf("未").includes("味")));
t("every hand-written pair is in the generated list", () => {
  for (const { pair } of CURATED) { const [a, b] = [...pair]; if (KANJI_PARTS[a] !== undefined && KANJI_PARTS[b] !== undefined) ok(lookalikesOf(a).includes(b), pair); }
});
t("lookalikes can be kept to the kanji the learner meets", () => {
  eq(lookalikesOf("待", new Set(["持", "時"])).sort(), ["持", "時"].sort());
});

t("the diff names the one part that differs", () => {
  const d = kanjiDiff("待", "持");
  eq(d.onlyA.map((p) => p.show), ["彳"]);
  eq(d.onlyB.map((p) => p.show), ["扌"]);
  const s = diffSentence(d, (c) => ({ 待: "wait", 持: "hold" })[c]);
  ok(/待 \(wait\) has 彳 \(step\)/.test(s) && /持 \(hold\) has 扌 \(hand\)/.test(s), s);
});
t("same-parts pairs use the written note", () => {
  ok(/shorter/.test(diffSentence(kanjiDiff("未", "末"))));
  ok(/bottom line is longer/.test(diffSentence(kanjiDiff("士", "土"))));
});
t("no sentence rather than a vague one", () => eq(diffSentence(kanjiDiff("一", "二")), null));

t("words that differ only by a lookalike kanji", () => {
  eq(termLookalike("待つ", "持つ"), { a: "待", b: "持" });
  eq(termLookalike("待つ", "待つ"), null);
  eq(termLookalike("待つ", "打つ"), null, "打 is not a lookalike of 待");
  eq(termLookalike("待つ", "持ちます"), null, "different lengths");
  eq(termLookalike("まつ", "もつ"), null, "kana are not kanji");
});
t("lookalike scores rank the hand-written pair first", () => {
  ok(lookalikeScore({ term: "未" }, { term: "末" }) === 1);
  ok(lookalikeScore({ term: "待" }, { term: "持" }) > 0.5);
  ok(lookalikeScore({ term: "待つ" }, { term: "持つ" }) > 0);
  eq(lookalikeScore({ term: "待" }, { term: "魚" }), 0);
});
t("every stand-in maps to a different character", () => ok(Object.entries(SHOW).every(([k, v]) => k !== v)));

console.log(fail ? `${fail} of ${run} lookalike tests FAILED` : `all ${run} lookalike tests passed`);
process.exit(fail ? 1 : 0);
