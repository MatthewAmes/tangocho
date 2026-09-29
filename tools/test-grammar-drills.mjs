// Tests for tools/grammar-drills.mjs and src/data/book-grammar.js — Volume 2 grammar.
//
//   node tools/test-grammar-drills.mjs
import { BOOK_GRAMMAR } from "../src/data/book-grammar.js";
import { verbForms, drillItem, drillSession, bookExample, grammarInventory, PATTERNS, VERBS, grammarDeck, verbOfDay } from "./grammar-drills.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const V = (reading, type, dict = reading, meaning = "") => ({ dict, reading, type, meaning });
const TABERU = V("たべる", "ichidan", "食べる", "eat");
const IKU = V("いく", "godan", "行く", "go");
const NOMU = V("のむ", "godan", "飲む", "drink");
const SURU = V("する", "irregular", "する", "do");
const KURU = V("くる", "irregular", "来る", "come");
const KAU = V("かう", "godan", "買う", "buy");

console.log("=== the book's notes ===");
t("every act 7-12 note is there once, numbered from 1 in each act", () => {
  eq(BOOK_GRAMMAR.length, 104);
  eq(new Set(BOOK_GRAMMAR.map((g) => g.id)).size, 104);
  for (const act of [7, 8, 9, 10, 11, 12]) {
    const ns = BOOK_GRAMMAR.filter((g) => g.act === act).map((g) => +g.id.split(".")[1]).sort((a, b) => a - b);
    ns.forEach((n, i) => eq(n, i + 1, `act ${act}`));
    ok(BOOK_GRAMMAR.filter((g) => g.act === act).every((g) => parseInt(g.scene, 10) === act), `act ${act} scenes`);
  }
});
t("every drill belongs to a real grammar note", () => {
  const ids = new Set(BOOK_GRAMMAR.filter((g) => g.kind !== "culture").map((g) => g.id));
  for (const p of PATTERNS) ok(ids.has(p.id), p.id);
});

console.log("=== forms the drills are built on ===");
t("ichidan, godan with 音便, 行く and the irregulars", () => {
  eq(verbForms(TABERU), { dict: "たべる", nai: "たべない", ta: "たべた", te: "たべて", stem: "たべ", vol: "たべよう", tara: "たべたら" });
  eq(verbForms(IKU).te, "いって"); eq(verbForms(IKU).ta, "いった");
  eq(verbForms(NOMU).te, "のんで"); eq(verbForms(NOMU).vol, "のもう");
  eq(verbForms(KAU).nai, "かわない"); eq(verbForms(KAU).vol, "かおう");
  eq(verbForms(SURU).vol, "しよう"); eq(verbForms(KURU).vol, "こよう"); eq(verbForms(KURU).nai, "こない");
});

console.log("=== items ===");
t("pattern + verb gives the whole form and says how it was built", () => {
  const i = drillItem("8.1", TABERU);
  eq(i.answer, "たべてみる");
  ok(/て-form たべて \+ みる/.test(i.how), i.how);
  eq(drillItem("8.4", NOMU).answer, "のまないでください");
  eq(drillItem("8.10", IKU).answer, "いったことがある");
  eq(drillItem("9.5", NOMU).answer, "のみにいく");
  eq(drillItem("11.1", KURU).answer, "きたら");
  eq(drillItem("10.2", KAU).answer, "かおう");
  eq(drillItem("12.5", NOMU).answer, "のんでしまう");
});
t("every pattern builds for every verb in the bank", () => {
  for (const p of PATTERNS) for (const v of VERBS) ok(drillItem(p.id, v), `${p.id} × ${v.reading}`);
});

console.log("=== sessions interleave ===");
t("mixed notes alternate, verbs vary, and the seed fixes the order", () => {
  const s = drillSession(["8.1", "10.1", "12.5"], 9, 7);
  eq(s.length, 9);
  for (let i = 1; i < s.length; i++) ok(s[i].pattern !== s[i - 1].pattern, "same note twice in a row");
  ok(new Set(s.map((x) => x.reading)).size >= 8, "verbs repeat too much");
  eq(JSON.stringify(drillSession(["8.1", "10.1", "12.5"], 9, 7)), JSON.stringify(s));
});
t("unknown notes are ignored, not guessed", () => eq(drillSession(["7.4"], 5, 1).length, 0));

console.log("=== the book example ===");
t("a real line with the pattern is found and split around it", () => {
  const lines = [{ ja: "寒さにはもう慣れました？", scene: "7-1" }, { ja: "ちょっと食べてみる？", scene: "8-1" }];
  const ex = bookExample("8.1", lines);
  eq([ex.scene, ex.before, ex.match], ["8-1", "ちょっと食べ", "てみ"]);
  eq(bookExample("8.1", [lines[0]]), null);
});

console.log("=== the inventory says what each note has ===");
t("drill, conjugation, culture or nothing yet", () => {
  const inv = grammarInventory();
  const by = (id) => inv.find((g) => g.id === id).drill;
  eq(by("8.1"), "drill"); eq(by("7.1"), "conjugation"); eq(by("7.3"), "culture"); eq(by("7.4"), "none");
});

console.log("=== the Smart Review deck ===");
t("one card per drillable note, in book order, all on the day's verb", () => {
  const d = grammarDeck("2026-09-29");
  eq(d.length, PATTERNS.length);
  const v = verbOfDay("2026-09-29");
  ok(d.every((g) => g.meaning.endsWith("(" + v.dict + ")")), "every meaning names the same verb");
  for (let i = 1; i < d.length; i++) ok(d[i - 1].act <= d[i].act, "book order");
  eq(new Set(d.map((g) => g.answer)).size, d.length, "no two notes build the same form");
});
t("the verb changes from day to day, the note ids do not", () => {
  const days = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
  ok(new Set(days.map((x) => verbOfDay(x).reading)).size >= 3, "verbs should vary across days");
  eq(grammarDeck(days[0]).map((g) => g.id).join(), grammarDeck(days[3]).map((g) => g.id).join());
});

console.log(fail ? `${fail} of ${run} grammar-drill tests FAILED` : `all ${run} grammar-drill tests passed`);
process.exit(fail ? 1 : 0);
