// Tests for tools/import-book-glossary.mjs — reading the textbook's own glossary.
//
//   node tools/test-book-glossary.mjs
import { sceneOf, headword, fits, parseRow, missingFrom } from "./import-book-glossary.mjs";
import { SEED } from "../src/data/seed.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

console.log("=== scene numbers as the book prints them ===");
t("run together, spaced, two-digit acts and reading scenes", () => {
  eq(sceneOf("71"), { act: 7, scene: "1" });
  eq(sceneOf("7 1"), { act: 7, scene: "1" });
  eq(sceneOf("10 2"), { act: 10, scene: "2" });
  eq(sceneOf("112"), { act: 11, scene: "2" });
  eq(sceneOf("12 7R"), { act: 12, scene: "7R" });
  eq(sceneOf("302"), null, "a page number is not a scene");
});

console.log("=== the dictionary form out of a glossary term ===");
t("frames, conjugation notes and the supplementary mark come off", () => {
  eq(headword("(X に) 慣れる(-RU; 慣"), "慣れる");
  eq(headword("通う(-u; 通った)"), "通う");
  eq(headword("+ 聞こえる (-RU; 聞こ"), "聞こえる");
  eq(headword("遠く"), "遠く");
});

console.log("=== a reading must fit the written form ===");
t("kana in the written form must appear in the reading", () => {
  ok(fits("慣れる", "なれる"));
  ok(!fits("慣れる", "ばいてん"), "the neighbouring row's reading does not fit");
  ok(fits("思い出す", "おもいだす"));
  ok(!fits("思い出す", "おもいだし"));
});

console.log("=== a layout row ===");
t("term, part of speech, meaning and scene from one line", () => {
  const r = parseRow("+ ばいてん      (X に) 慣れる(-RU; 慣         V         get used/accustomed     71");
  eq([r.headword, r.pos, r.meaning, r.act, r.scene], ["慣れる", "V", "get used/accustomed", 7, "1"]);
});
t("a line with no scene is not a row", () => eq(parseRow("   れた)                                (to X)"), null));

console.log("=== the deck now has what the web import dropped ===");
t("the 2026-09-29 additions are in the seed, once each", () => {
  for (const w of ["慣れる", "聞こえる", "間違える", "似合う", "足りる", "差し上げる"]) {
    eq(SEED.filter((c) => c.term === w).length, 1, w);
  }
  const rows = ["慣れる", "聞こえる", "遠く"].map((w) => ({ headword: w }));
  eq(missingFrom(rows, SEED).length, 0);
});

console.log(fail ? `${fail} of ${run} book-glossary tests FAILED` : `all ${run} book-glossary tests passed`);
process.exit(fail ? 1 : 0);
