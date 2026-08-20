// Tests for sentence mining. The danger here is not a crash — it is a feature that
// enthusiastically fills the deck with junk glosses and buries the words already being
// learned. Most of these are about what mining must REFUSE to add, and about the
// displacement rule holding.
//
//   node tools/test-mining.mjs
import {
  sentencesOf, makeLexicon, minable, mine, cardFor,
  displacementPlan, unparkPlan, describePlan,
} from "./mining.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const LEX = makeLexicon([
  { t: "の", r: "", m: "field; plain", k: 1 },
  { t: "に", r: "", m: "load; baggage", k: 2 },
  { t: "でも", r: "でも", m: "but, however", k: 40 },
  { t: "図書館", r: "としょかん", m: "library", k: 900 },
  { t: "静か", r: "しずか", m: "quiet", k: 700 },
  { t: "勉強", r: "べんきょう", m: "study", k: 500 },
  { t: "難しい", r: "むずかしい", m: "difficult", k: 800 },
  { t: "謎", r: "なぞ", m: "riddle; mystery", k: 4000 },
  { t: "書架", r: "しょか", m: "bookshelf", k: 8000 },
  { t: "無名", r: "むめい", m: "", k: 6000 },          // no gloss — unusable
]);

console.log("=== splitting text into sentences ===");
t("Japanese punctuation ends a sentence", () => {
  eq(sentencesOf("図書館は静かです。勉強しました。").length, 2);
});
t("line breaks end a sentence too, because pasted text is often unpunctuated", () => {
  eq(sentencesOf("図書館は静か\n勉強しました").length, 2);
});
t("stray fragments are dropped", () => {
  eq(sentencesOf("。\n\n  \n").length, 0);
});

console.log("\n=== what is worth mining ===");
t("a single character is never a candidate", () => {
  eq(minable("手", LEX.get("手")), false);
});
t("short kana are refused because the dictionary is wrong about them", () => {
  /* The frequency list glosses の as "field" and に as "load" — homographs of the
     particles. Mining those would inject confident nonsense into the deck. */
  eq(minable("の", LEX.get("の")), false);
  eq(minable("に", LEX.get("に")), false);
  eq(minable("でも", LEX.get("でも")), false, "two kana is still grammar, not vocabulary");
});
t("a word with no gloss is not minable however common", () => {
  eq(minable("無名", LEX.get("無名")), false);
});
t("a real content word is minable", () => {
  eq(minable("図書館", LEX.get("図書館")), true);
  eq(minable("難しい", LEX.get("難しい")), true);
});
t("a word missing from the dictionary is skipped rather than guessed at", () => {
  eq(minable("架空語", undefined), false);
});

console.log("\n=== mining a text ===");
/* Stand-in for the app's coverage scanner: everything not in `known` is unknown. */
const scannerOver = (vocab) => (s) => {
  const out = [];
  for (const w of vocab) if (s.includes(w)) out.push(w);
  return out;
};
const VOCAB = ["図書館", "静か", "勉強", "難しい", "謎", "書架", "の", "に", "でも", "無名"];

t("candidates carry the sentence they came from", () => {
  const r = mine("図書館は静かです。", { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  const lib = r.candidates.find((c) => c.term === "図書館");
  ok(lib, "expected 図書館");
  eq(lib.sentence, "図書館は静かです。", "the sentence is the whole point");
  eq(lib.reading, "としょかん");
  eq(lib.meaning, "library");
});
t("words already known are not offered again", () => {
  const r = mine("図書館は静かです。", {
    lexicon: LEX, unknownOf: scannerOver(VOCAB), known: new Set(["図書館"]),
  });
  ok(!r.candidates.some((c) => c.term === "図書館"));
});
t("a word met repeatedly outranks a rarer one met once", () => {
  const text = "図書館で勉強した。図書館は静か。図書館が好き。書架が多い。";
  const r = mine(text, { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  eq(r.candidates[0].term, "図書館");
  eq(r.candidates[0].count, 3);
});
t("among equals the commoner word comes first", () => {
  const r = mine("書架です。勉強です。", { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  const terms = r.candidates.map((c) => c.term);
  ok(terms.indexOf("勉強") >= 0 && terms.indexOf("書架") >= 0, "both should be candidates");
  ok(terms.indexOf("勉強") < terms.indexOf("書架"), "rank 500 should precede rank 8000");
});
t("a single character is refused even when it has a good gloss", () => {
  // 謎 is a real word with a real meaning, and still too short to mine safely.
  const r = mine("謎です。", { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  eq(r.candidates.length, 0);
});
t("the shortest sentence wins, so the example is readable", () => {
  const text = "図書館。\n図書館で難しい勉強をしたので疲れました。";
  const r = mine(text, { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  eq(r.candidates.find((c) => c.term === "図書館").sentence, "図書館。");
});
t("mining junk yields nothing rather than something", () => {
  const r = mine("のにでも", { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  eq(r.candidates.length, 0);
});
t("an empty text is harmless", () => {
  const r = mine("", { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  eq(r.candidates.length, 0); eq(r.sentences, 0);
});

console.log("\n=== the card that gets made ===");
t("a mined card keeps its source sentence", () => {
  const r = mine("図書館は静かです。", { lexicon: LEX, unknownOf: scannerOver(VOCAB) });
  const card = cardFor(r.candidates.find((c) => c.term === "図書館"), { label: "NHK Easy" });
  eq(card.term, "図書館");
  eq(card.reading, "としょかん");
  eq(card.mined, true);
  eq(card.source, "図書館は静かです。", "without the sentence this is just another glossary entry");
  eq(card.sourceLabel, "NHK Easy");
});

console.log("\n=== displacement: the deck must not grow ===");
const deck = [
  { id: "a", term: "犬", seen: 4, lesson: 1 },
  { id: "b", term: "猫", seen: 0, lesson: 2 },
  { id: "c", term: "鳥", seen: 0, lesson: 9 },
  { id: "d", term: "魚", seen: 0, lesson: 7 },
  { id: "e", term: "馬", seen: 12, lesson: 3 },
  { id: "f", term: "牛", seen: 0, lesson: 4, mined: true },
];
t("adding words parks the same number", () => {
  eq(displacementPlan(deck, 2).park.length, 2);
});
t("a word you have started is never parked", () => {
  const plan = displacementPlan(deck, 6);
  ok(!plan.park.includes("a"), "犬 has been answered four times");
  ok(!plan.park.includes("e"), "馬 has been answered twelve times");
});
t("mined words are not parked to make room for more mined words", () => {
  ok(!displacementPlan(deck, 6).park.includes("f"));
});
t("the furthest-out lessons step aside first", () => {
  eq(displacementPlan(deck, 1).park[0], "c", "lesson 9 is furthest from what you are doing");
});
t("running out of untouched words is reported, not hidden", () => {
  const plan = displacementPlan(deck, 10);
  eq(plan.park.length, 3, "only b, c and d are eligible");
  eq(plan.shortfall, 7, "the rest would grow the deck and you should be told");
});
t("adding nothing parks nothing", () => {
  eq(displacementPlan(deck, 0).park.length, 0);
});

console.log("\n=== parked words come back ===");
t("parked words return oldest-lesson first when there is room", () => {
  const parked = [
    { id: "p1", parked: true, lesson: 8 },
    { id: "p2", parked: true, lesson: 2 },
    { id: "p3", parked: true, lesson: 5 },
  ];
  eq(unparkPlan(parked, 2).join(","), "p2,p3");
});
t("no room means nothing returns", () => {
  eq(unparkPlan([{ id: "p1", parked: true }], 0).length, 0);
});

console.log("\n=== saying what will happen before it happens ===");
t("the plan is stated in plain words, including the parking", () => {
  const s = describePlan(2, displacementPlan(deck, 2));
  ok(/Adding 2 words/.test(s), s);
  ok(/step aside/.test(s), `parking must be disclosed: ${s}`);
  ok(/nothing is deleted/i.test(s), `the reassurance must be there too: ${s}`);
});
t("a shortfall is disclosed rather than glossed over", () => {
  ok(/grow the deck/.test(describePlan(10, displacementPlan(deck, 10))));
});
t("no selection says so", () => {
  eq(describePlan(0, { park: [], shortfall: 0 }), "Nothing selected.");
});

console.log(`\n${fail ? `${fail} of ${run} FAILED` : `all ${run} mining tests passed`}`);
process.exit(fail ? 1 : 0);
