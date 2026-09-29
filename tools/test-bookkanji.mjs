// Tests for tools/bookkanji.mjs and src/data/book-kanji.js — the textbook's kanji.
//
//   node tools/test-bookkanji.mjs
import { BOOK_KANJI } from "../src/data/book-kanji.js";
import { bookOrdered, unlockedFrom, bookKanjiStatus, bookKanjiSummary, BOOK_ORDER } from "./bookkanji.mjs";
import { levelsFor } from "./proven.mjs";
import { CUE } from "./learner.mjs";
import { SEED } from "../src/data/seed.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

console.log("=== the book's list ===");
t("133 kanji, numbered 1..133 with no gaps or repeats", () => {
  eq(BOOK_KANJI.length, 133);
  BOOK_KANJI.forEach(([n], i) => eq(n, i + 1));
  eq(new Set(BOOK_KANJI.map((r) => r[1])).size, 133);
});
t("every kanji belongs to a Volume 2 reading scene, in order", () => {
  let last = 0;
  for (const [, , sec] of BOOK_KANJI) {
    ok(/^(7|8|9|10|11|12)-[789]R$/.test(sec), sec);
    const k = parseInt(sec, 10) * 10 + parseInt(sec.split("-")[1], 10);
    ok(k >= last, "scenes run forward"); last = k;
  }
  eq(BOOK_ORDER.get("日").sec, "7-8R");
  eq(BOOK_ORDER.get("毎").n, 133);
});

console.log("=== order ===");
t("book kanji come first in book order, the rest keep their order", () => {
  const list = [{ c: "猫" }, { c: "学" }, { c: "日" }, { c: "犬" }, { c: "月" }];
  eq(bookOrdered(list).map((k) => k.c), ["日", "月", "学", "猫", "犬"]);
});
t("reordering never drops a kanji already being studied", () => {
  const ordered = bookOrdered(BOOK_KANJI.map(([, c]) => ({ c })).concat([{ c: "猫" }]));
  const u = unlockedFrom(ordered, { 猫: { seen: 3, level: 1 } }, 12);
  ok(u.some((k) => k.c === "猫"), "猫 was studied before the reorder");
  eq(u.slice(0, 24).map((k) => k.c).join(""), BOOK_KANJI.slice(0, 24).map((r) => r[1]).join(""), "the frontier is the book's first 24");
});
t("the frontier still opens as characters go solid", () => {
  const ordered = BOOK_KANJI.map(([, c]) => ({ c }));
  const solid = Object.fromEntries(BOOK_KANJI.slice(0, 12).map(([, c]) => [c, { seen: 5, level: 4 }]));
  eq(unlockedFrom(ordered, solid, 12).length, 36);
});

console.log("=== a kanji is known through its words ===");
const D = 86400000, T0 = Date.UTC(2026, 8, 1);
const prod = (id, day) => ({ id, skill: "production", format: "type", cue: CUE.FREE, ok: true, at: T0 + day * D });
const CARDS = [
  { id: "a", term: "日本" }, { id: "b", term: "毎日" }, { id: "c", term: "月" }, { id: "d", term: "食べる" },
];
t("the best word decides the level, and every word is counted", () => {
  const ev = [prod("a", 0), prod("a", 3), prod("a", 9), prod("b", 1)];
  const st = bookKanjiStatus(CARDS, levelsFor(ev, CARDS.map((c) => c.id)));
  const hi = st.find((k) => k.c === "日");
  eq(hi.words, 2); eq(hi.best, "mastered"); eq(hi.recalled, 2);
  const tsuki = st.find((k) => k.c === "月");
  eq(tsuki.best, "new");
});
t("a kanji in no deck word is reported, not hidden", () => {
  const st = bookKanjiStatus([], new Map());
  eq(bookKanjiSummary(st).noWords, 133);
});
t("in the real deck, nearly every book kanji has words to be learned through", () => {
  const s = bookKanjiSummary(bookKanjiStatus(SEED, new Map()));
  ok(s.noWords <= 3, `${s.noWords} textbook kanji appear in no deck word`);
});

console.log(fail ? `${fail} of ${run} bookkanji tests FAILED` : `all ${run} bookkanji tests passed`);
process.exit(fail ? 1 : 0);
