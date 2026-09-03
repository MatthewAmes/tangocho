// Tests for conjugation engine: formal/plain, te-form, tai-form, onbin sound changes (TODO-121)
import { conjugate, CONJ_FORMS } from "../src/lib/conjugate.js";
import { CONJ_BANK } from "../src/data/conj-bank.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (e) {
    fail++;
    console.log("  FAIL  " + name + "\n        " + e.message);
  }
};
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

console.log("=== conjugate() forms and sound changes (TODO-121) ===");

t("all CONJ_BANK entries match plain present negative", () => {
  for (const w of CONJ_BANK) {
    const c = conjugate(w.reading, w.type);
    ok(c, "conjugate returned null for " + w.reading);
    eq(c.plain.presNeg, w.negR, `${w.dict} (${w.reading}) negative`);
  }
});

t("plain past sound changes (音便)", () => {
  eq(conjugate("いく", "godan").plain.pastPos, "いった", "いく exception");
  eq(conjugate("およぐ", "godan").plain.pastPos, "およいだ", "ぐ onbin");
  eq(conjugate("しぬ", "godan").plain.pastPos, "しんだ", "ぬ onbin");
  eq(conjugate("まつ", "godan").plain.pastPos, "まった", "つ onbin");
  eq(conjugate("はなす", "godan").plain.pastPos, "はなした", "す onbin");
  eq(conjugate("よむ", "godan").plain.pastPos, "よんだ", "む onbin");
});

t("te-forms across all verb classes and adjectives", () => {
  // Ichidan
  eq(conjugate("たべる", "ichidan").te, "たべて");
  eq(conjugate("はじめる", "ichidan").te, "はじめて");
  // Godan onbin
  eq(conjugate("いく", "godan").te, "いって", "いく exception");
  eq(conjugate("およぐ", "godan").te, "およいで", "ぐ -> いで");
  eq(conjugate("しぬ", "godan").te, "しんで", "ぬ -> んで");
  eq(conjugate("まつ", "godan").te, "まって", "つ -> って");
  eq(conjugate("のむ", "godan").te, "のんで", "む -> んで");
  eq(conjugate("はなす", "godan").te, "はなして", "す -> して");
  eq(conjugate("かく", "godan").te, "かいて", "く -> いて");
  // Irregulars
  eq(conjugate("する", "irregular").te, "して");
  eq(conjugate("くる", "irregular").te, "きて");
  eq(conjugate("ある", "irregular").te, "あって");
  // Adjectives
  eq(conjugate("たかい", "iadj").te, "たかくて");
  eq(conjugate("いい", "iadj").te, "よくて", "いい exception");
  eq(conjugate("すき", "na").te, "すきで");
});

t("tai-forms for verbs and null for non-verbs", () => {
  eq(conjugate("いく", "godan").tai, "いきたい");
  eq(conjugate("たべる", "ichidan").tai, "たべたい");
  eq(conjugate("のむ", "godan").tai, "のみたい");
  eq(conjugate("する", "irregular").tai, "したい");
  eq(conjugate("くる", "irregular").tai, "きたい");
  // Non-verbs have no tai form
  eq(conjugate("ある", "irregular").tai, null);
  eq(conjugate("たかい", "iadj").tai, null);
  eq(conjugate("すき", "na").tai, null);
});

t("unknown irregular verbs return null cleanly", () => {
  eq(conjugate("いう", "irregular"), null);
  eq(conjugate("おもう", "irregular"), null);
});

t("CONJ_FORMS includes te-form and tai-form", () => {
  eq(CONJ_FORMS.length, 10);
  const te = CONJ_FORMS.find((f) => f.id === "p-te");
  const tai = CONJ_FORMS.find((f) => f.id === "p-tai");
  ok(te, "p-te exists");
  ok(tai, "p-tai exists");
  eq(te.ask, "て-form");
  eq(tai.ask, "want to (〜たい)");
});

if (fail > 0) {
  console.error(`\n${fail} of ${run} conjugate tests failed`);
  process.exit(1);
}
console.log(`\nall ${run} conjugate tests passed`);
