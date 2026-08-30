// Tests for Japanese verb morphology (tools/conjugation.mjs).
//
//   node tools/test-conjugation.mjs
import { verbTypeOf, formsOf, inflectionMatch, GODAN_ROWS, GODAN_LOOKALIKES, FORM_LABEL } from "./conjugation.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const f = (r) => formsOf(r).forms;

console.log("=== conjugation class ===");
t("i-row/e-row before る is ichidan", () => {
  eq(verbTypeOf("たべる"), "ichidan");
  eq(verbTypeOf("みる"), "ichidan");
  eq(verbTypeOf("はじめる"), "ichidan");
});
t("consonant endings are godan", () => {
  for (const [r, ] of [["のむ"], ["かく"], ["はなす"], ["まつ"], ["およぐ"], ["あそぶ"], ["しぬ"], ["かう"]]) {
    eq(verbTypeOf(r), "godan", r);
  }
});
t("the -eru/-iru lookalikes are godan, not ichidan", () => {
  // 帰る is the classic trap: conjugating it as ichidan yields 帰ない, the most common
  // beginner conjugation error there is
  eq(verbTypeOf("かえる"), "godan", "かえる");
  eq(verbTypeOf("はいる"), "godan", "はいる");
  eq(verbTypeOf("はしる"), "godan", "はしる");
});
t("the three irregulars are recognised", () => {
  eq(verbTypeOf("する"), "irregular-suru");
  eq(verbTypeOf("べんきょうする"), "irregular-suru");
  eq(verbTypeOf("くる"), "irregular-kuru");
  eq(verbTypeOf("ある"), "irregular-aru");
});
t("a non-verb yields null rather than a guess", () => {
  eq(verbTypeOf("ねこ"), null);
  eq(verbTypeOf(""), null);
  eq(verbTypeOf(undefined), null);
  eq(formsOf("ねこ"), null);
});
t("an authoritative type overrides the heuristic", () => {
  eq(verbTypeOf("かえる", "ichidan"), "ichidan", "caller-supplied type must win");
});

console.log("\n=== the forms themselves ===");
t("ichidan", () => {
  const x = f("たべる");
  eq(x.masu, "たべます"); eq(x.nai, "たべない"); eq(x.ta, "たべた"); eq(x.te, "たべて");
  eq(x.mashita, "たべました"); eq(x.tai, "たべたい");
});
t("godan across every row", () => {
  eq(f("のむ").ta, "のんだ");   eq(f("のむ").te, "のんで");   eq(f("のむ").nai, "のまない");
  eq(f("かく").ta, "かいた");   eq(f("かく").te, "かいて");
  eq(f("およぐ").ta, "およいだ"); eq(f("およぐ").te, "およいで");
  eq(f("はなす").ta, "はなした"); eq(f("まつ").ta, "まった");
  eq(f("かう").ta, "かった");   eq(f("あそぶ").ta, "あそんだ"); eq(f("しぬ").ta, "しんだ");
});
t("行く is the exception it always is", () => {
  eq(f("いく").ta, "いった", "not いいた");
  eq(f("いく").te, "いって");
});
t("帰る conjugates as godan", () => {
  eq(f("かえる").nai, "かえらない", "帰ない would be the classic error");
  eq(f("かえる").masu, "かえります");
});
t("the irregulars", () => {
  eq(f("する").masu, "します");  eq(f("する").ta, "した");   eq(f("する").te, "して");
  eq(f("くる").nai, "こない");   eq(f("くる").ta, "きた");
  eq(f("ある").nai, "ない");
  eq(f("べんきょうする").masu, "べんきょうします");
});
t("te-form is derived from ta and keeps voicing", () => {
  eq(f("のむ").te, "のんで", "んだ -> んで");
  eq(f("およぐ").te, "およいで", "いだ -> いで");
  eq(f("かく").te, "かいて", "いた -> いて");
});
t("every generated form is non-empty and has a label", () => {
  for (const r of ["たべる", "のむ", "する", "くる", "いく"]) {
    for (const [form, val] of Object.entries(f(r))) {
      if (!val) throw new Error(`${r}.${form} is empty`);
      if (!FORM_LABEL[form]) throw new Error("no label for " + form);
    }
  }
});

console.log("\n=== right word, wrong shape ===");
t("an inflected answer is recognised as the same word", () => {
  const m = inflectionMatch("たべる", "たべました");
  eq(m.sameLemma, true); eq(m.form, "mashita"); eq(m.label, "polite past");
});
t("every form of a verb matches back to it", () => {
  for (const [form, val] of Object.entries(f("のむ"))) {
    if (form === "dict") continue;
    eq(inflectionMatch("のむ", val).sameLemma, true, form + " (" + val + ")");
  }
});
t("a different word does NOT match", () => {
  eq(inflectionMatch("たべる", "のみます").sameLemma, false);
  eq(inflectionMatch("たべる", "ねこ").sameLemma, false);
});
t("an exact match is not an inflection error", () => {
  eq(inflectionMatch("たべる", "たべる").sameLemma, false, "same string is not a wrong shape");
});
t("a non-verb never reports an inflection", () => {
  eq(inflectionMatch("ねこ", "ねこです").sameLemma, false);
});
t("empty input is safe", () => {
  eq(inflectionMatch("", "").sameLemma, false);
  eq(inflectionMatch(undefined, undefined).sameLemma, false);
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} conjugation tests passed`);
process.exit(fail ? 1 : 0);
