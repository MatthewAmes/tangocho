// Tests for src/lib/freq.js::learnable — which frequency-list rows become cards.
//
//   node tools/test-freq-learnable.mjs
import fs from "node:fs";
import { learnable } from "../src/lib/freq.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const W = JSON.parse(fs.readFileSync(new URL("../cf/public/freq.json", import.meta.url), "utf8")).words;
const row = (t) => W.find((w) => w.t === t);

t("particles and fragments glossed from the wrong entry are not cards", () => {
  for (const t of ["の", "に", "が", "て", "し", "ます", "まし", "あり", "ござい", "わかり"]) {
    const w = row(t);
    ok(!w || !learnable(w), `${t} (${w && w.m.slice(0, 20)}) should not be a card`);
  }
});
t("single kanji and mismatched kana readings are left to the textbook deck", () => {
  for (const t of ["本", "家", "出"]) { const w = row(t); ok(!w || !learnable(w), t); }
  // the list itself no longer has the あなた/かなた mismatch (v3 build); the guard stays
  ok(!learnable({ t: "あなた", r: "かなた", m: "beyond", p: "pn" }), "a kana word stored with another word's reading");
  ok(learnable(row("あなた")), "あなた is now correctly 'you'");
});
t("ordinary words stay", () => {
  for (const t of ["日本", "問題", "必要", "会社", "時々", "意外", "しかし", "ちょっと", "インターネット"]) {
    const w = row(t); ok(w && learnable(w), t);
  }
});
t("most of the list is still usable", () => {
  const n = W.filter(learnable).length;
  ok(n > 8000, `only ${n} learnable`);
});

console.log(fail ? `${fail} of ${run} freq-learnable tests FAILED` : `all ${run} freq-learnable tests passed`);
process.exit(fail ? 1 : 0);
