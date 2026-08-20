// Tests for teaching kanji through words. The thing that must not break is identity: the
// question changes, the progress record does not. If a context card stops matching its own
// stored progress, months of kanji history silently detach.
//
//   node tools/test-kanjicontext.mjs
import { anchorFor, contextCardFor, highlightAt, splitAround, inContext, contextCoverage } from "./kanjicontext.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const word = (term, reading, extra = {}) => ({ term, reading, meaning: term + " meaning", ...extra });

console.log("=== choosing the word to teach through ===");
t("a word you have already studied wins", () => {
  const e = { words: [word("定食", "ていしょく"), word("食べる", "たべる", { seen: 5 })] };
  eq(anchorFor(e).term, "食べる", "the character is the new thing; the word should be familiar");
});
t("among unstudied words the shorter one wins", () => {
  const e = { words: [word("食料品店", "しょくりょうひんてん"), word("食事", "しょくじ")] };
  eq(anchorFor(e).term, "食事");
});
t("ties break toward the earlier lesson", () => {
  const e = { words: [word("食事", "しょくじ", { lesson: 9 }), word("食堂", "しょくどう", { lesson: 2 })] };
  eq(anchorFor(e).lesson, 2);
});
t("a word with no reading is unusable", () => {
  // Nothing to ask for: the answer to "how is this read" would be the word itself.
  eq(anchorFor({ words: [word("ばか", "ばか")] }), null);
  eq(anchorFor({ words: [{ term: "食事" }] }), null);
});
t("no words at all means no anchor, not a crash", () => {
  eq(anchorFor({ words: [] }), null);
  eq(anchorFor(undefined), null);
  eq(anchorFor(null), null);
});

console.log("\n=== the card that results ===");
const isolated = { id: "kanji:食", src: "kanji", srcId: "食", term: "食",
                   reading: "ショク / た.べる", meaning: "eat, food", kind: "kanji", emoji: "🍚" };

t("identity survives untouched, so progress stays attached", () => {
  /* The single most important property here. The Kanji tab, Smart Review and the stored
     stats all key on this id — if it moved, every kanji answered so far would detach. */
  const c = contextCardFor(isolated, word("食べる", "たべる", { seen: 5 }));
  eq(c.id, "kanji:食");
  eq(c.src, "kanji");
  eq(c.srcId, "食");
  eq(c.kind, "kanji");
});
t("the question becomes the word, and the answer its reading", () => {
  const c = contextCardFor(isolated, word("食べる", "たべる", { seen: 5 }));
  eq(c.term, "食べる", "reading Japanese means reading words, not characters");
  eq(c.reading, "たべる");
  eq(c.inContext, true);
});
t("what the card is really about is still recorded", () => {
  const c = contextCardFor(isolated, word("食べる", "たべる"));
  eq(c.kanji, "食");
  eq(c.kanjiMeaning, "eat, food");
  eq(c.kanjiReadings, "ショク / た.べる");
});
t("with no anchor the card is left exactly as it was", () => {
  // A real limit, stated rather than papered over with an invented example.
  eq(contextCardFor(isolated, null), isolated);
});

console.log("\n=== pointing at the character inside the word ===");
t("the character is located in the word", () => {
  eq(highlightAt(contextCardFor(isolated, word("食べる", "たべる"))), 0);
  const k = { id: "kanji:語", src: "kanji", srcId: "語", term: "語", reading: "ゴ", meaning: "language" };
  eq(highlightAt(contextCardFor(k, word("日本語", "にほんご"))), 2);
});
t("an isolated card highlights nothing", () => {
  eq(highlightAt(isolated), -1);
});
t("the word splits around the character", () => {
  const k = { id: "kanji:本", src: "kanji", srcId: "本", term: "本", reading: "ホン", meaning: "book" };
  const s = splitAround(contextCardFor(k, word("日本語", "にほんご")));
  eq(s.before, "日"); eq(s.hit, "本"); eq(s.after, "語");
});
t("a character that is somehow absent degrades quietly", () => {
  const broken = { ...contextCardFor(isolated, word("犬", "いぬ")), kanji: "食" };
  const s = splitAround(broken);
  eq(s.before, "犬"); eq(s.hit, ""); eq(s.after, "");
});
t("splitting a card with no context is harmless", () => {
  eq(splitAround(isolated).before, "食");
  eq(splitAround(null).before, "");
});

console.log("\n=== applying it to the deck ===");
const index = new Map([
  ["食", { words: [word("食べる", "たべる", { seen: 3 })], n: 4, studied: true }],
  ["語", { words: [word("日本語", "にほんご", { seen: 8 })], n: 2, studied: true }],
  ["鬱", { words: [], n: 0, studied: false }],
]);
const items = [
  isolated,
  { id: "kanji:語", src: "kanji", srcId: "語", term: "語", reading: "ゴ", meaning: "language", kind: "kanji" },
  { id: "kanji:鬱", src: "kanji", srcId: "鬱", term: "鬱", reading: "ウツ", meaning: "gloom", kind: "kanji" },
];

t("cards with a word behind them are asked in context, the rest are not", () => {
  const out = inContext(items, index);
  eq(out[0].term, "食べる");
  eq(out[1].term, "日本語");
  eq(out[2].term, "鬱", "no word in the deck contains it, so nothing is invented");
  eq(out[2].inContext, undefined);
});
t("how much of the deck can be taught this way is reported", () => {
  const cov = contextCoverage(items, index);
  eq(cov.total, 3);
  eq(cov.covered, 2, "if this is low the answer is more vocabulary, not more kanji drilling");
});
t("without an index nothing changes", () => {
  eq(inContext(items, null)[0].term, "食");
  eq(contextCoverage(items, null).covered, 0);
});
t("every id survives the transformation", () => {
  const out = inContext(items, index);
  eq(out.map((c) => c.id).join(","), "kanji:食,kanji:語,kanji:鬱");
});

console.log(`\n${fail ? `${fail} of ${run} FAILED` : `all ${run} kanji-in-context tests passed`}`);
process.exit(fail ? 1 : 0);
