// Tests for src/lib/pitch.js, src/data/pitch.js and tools/build-pitch.mjs — pitch accent.
//
//   node tools/test-pitch.mjs
import { morae, contour, accentOf, patternName } from "../src/lib/pitch.js";
import { accentIndex, accentFor } from "./build-pitch.mjs";
import fs from "node:fs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const shape = (kana, n) => contour(kana, n).map((x) => (x.high ? "H" : "L") + (x.drop ? "↓" : "")).join("");

t("morae: small kana join, っ ん ー stand alone", () => {
  eq(morae("きょう"), ["きょ", "う"]);
  eq(morae("がっこう"), ["が", "っ", "こ", "う"]);
  eq(morae("コーヒー"), ["コ", "ー", "ヒ", "ー"]);
  eq(morae("しんぶん"), ["し", "ん", "ぶ", "ん"]);
});
t("the four patterns", () => {
  eq(shape("がっこう", 0), "LHHH", "heiban: low then high, no drop");
  eq(shape("あめ", 1), "H↓L", "atamadaka: 雨");
  eq(shape("たべる", 2), "LH↓L", "nakadaka: 食べる");
  eq(shape("はし", 2), "LH↓", "odaka: 橋 — the drop falls on the particle");
  eq(patternName("あめ", 0), "heiban (flat)");
});
t("an impossible accent draws nothing", () => {
  eq(contour("ねこ", 5), null);
  eq(contour("", 0), null);
});
t("the deck lookup: word and reading together", () => {
  eq(accentOf({ term: "学校", reading: "がっこう" }), 0);
  eq(accentOf({ term: "大丈夫", reading: "だいじょうぶ" }), 3);
  eq(accentOf({ term: "通う(-u; 通った)", reading: "かよう" }), accentOf({ term: "通う", reading: "かよう" }), "notes do not block the lookup");
  eq(accentOf({ term: "zzz", reading: "zzz" }), null, "unknown is null, never a guess");
  eq(accentOf({ term: "x", reading: "x", accent: 2 }), 2, "a 10k card carries its own");
});
t("a kana word falls back to its reading only when the reading is unambiguous", () => {
  const idx = accentIndex("箸\tはし\t1\n橋\tはし\t2\n端\tはし\t0\n分かる\tわかる\t2\n");
  eq(accentFor(idx, "はし", "はし"), null, "はし could be three words");
  eq(accentFor(idx, "わかる", "わかる"), 2);
  eq(accentFor(idx, "橋", "はし"), 2);
});
const W = JSON.parse(fs.readFileSync(new URL("../data/freq.json", import.meta.url), "utf8")).words;
t("the 10k list carries the standard accents of the commonest words", () => {
  const a = (x) => (W.find((w) => w.t === x) || {}).a;
  eq([a("いる"), a("する"), a("ある"), a("ない"), a("こと"), a("この")], [0, 0, 1, 1, 2, 0]);
  ok(W.filter((w) => typeof w.a === "number").length > 7500, "most words have an accent");
});

console.log(fail ? `${fail} of ${run} pitch tests FAILED` : `all ${run} pitch tests passed`);
process.exit(fail ? 1 : 0);
