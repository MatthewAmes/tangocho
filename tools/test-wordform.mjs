// Tests for tools/wordform.mjs — words as the learner sees them.
//
//   node tools/test-wordform.mjs
import { cleanWord, sessionCard } from "./wordform.mjs";
import { SEED } from "../src/data/seed.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

t("conjugation notes come off", () => {
  eq(cleanWord("通う(-u; 通った)"), "通う");
  eq(cleanWord("遅れる (-RU; 遅れた)"), "遅れる");
  eq(cleanWord("びっくりする (IRR)"), "びっくりする");
  eq(cleanWord("くださる↑(-ARU; くださった)"), "くださる↑");
  eq(cleanWord("聞こえる (-RU; 聞こ"), "聞こえる", "a note cut off at the column edge");
});
t("frames and optional parts stay", () => {
  eq(cleanWord("便利（な）"), "便利（な）");
  eq(cleanWord("実験（する）"), "実験（する）");
  eq(cleanWord("(X に)びっくりする"), "(X に)びっくりする");
  eq(cleanWord("（お）祝い"), "（お）祝い");
});
t("a session card keeps its id and changes only what it must", () => {
  const c = { id: "x", term: "通う(-u; 通った)", reading: "かよう", meaning: "commute" };
  const s = sessionCard(c);
  eq(s.id, "x"); eq(s.term, "通う"); eq(s.reading, "かよう");
  const plain = { id: "y", term: "猫", reading: "ねこ" };
  eq(sessionCard(plain), plain, "an untouched card is the same object");
});
t("no deck word is cleaned to nothing, and no reading keeps a note", () => {
  for (const c of SEED) {
    ok(cleanWord(c.term).length > 0, c.term);
    ok(!/\((?:-?(?:RU|U|ARU|IRR))\b/i.test(cleanWord(c.reading)), c.reading);
  }
});

console.log(fail ? `${fail} of ${run} wordform tests FAILED` : `all ${run} wordform tests passed`);
process.exit(fail ? 1 : 0);
