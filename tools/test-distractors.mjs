// Tests for curriculum-aware distractor sourcing.
//
//   node tools/test-distractors.mjs
import { pickDistractors, sceneOf, TIER } from "./distractors.mjs";
import { confusionFrom, makeEvidence } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "") + " expected " + b + ", got " + a); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

/* A miniature deck spanning three scenes of one act plus one of the next, so scene,
   nearby-scene and out-of-act candidates can all be told apart. */
const DECK = [
  { id: "kaisha", term: "会社", reading: "かいしゃ", meaning: "company", kind: "kanji", sec: "2-5" },
  { id: "gakkou", term: "学校", reading: "がっこう", meaning: "school", kind: "kanji", sec: "2-5" },
  { id: "eki", term: "駅", reading: "えき", meaning: "station", kind: "kanji", sec: "2-5" },
  { id: "uchi", term: "うち", reading: "うち", meaning: "home", kind: "hiragana", sec: "2-5" },
  { id: "gohan", term: "ご飯", reading: "ごはん", meaning: "rice", kind: "kanji", sec: "2-3" },
  { id: "ocha", term: "お茶", reading: "おちゃ", meaning: "tea", kind: "kanji", sec: "2-3" },
  { id: "biiru", term: "ビール", reading: "ビール", meaning: "beer", kind: "katakana", sec: "2-3" },
  { id: "koko", term: "ここ", reading: "ここ", meaning: "here", kind: "hiragana", sec: "2-7" },
  { id: "soko", term: "そこ", reading: "そこ", meaning: "there", kind: "hiragana", sec: "2-7" },
  { id: "hon", term: "本", reading: "ほん", meaning: "book", kind: "kanji", sec: "5-1" },
  { id: "kaban", term: "かばん", reading: "かばん", meaning: "bag", kind: "hiragana", sec: "5-1" },
  { id: "tokei", term: "時計", reading: "とけい", meaning: "clock", kind: "kanji", sec: "5-2" },
];
const byId = (id) => DECK.find((c) => c.id === id);
const ids = (picks) => picks.map((p) => p.card.id);
const tierOf = (picks, id) => (picks.find((p) => p.card.id === id) || {}).tier;

console.log("=== curriculum position ===");
t("a seeded card reports its act-scene", () => {
  eq(sceneOf(byId("kaisha")), "2-5");
});
t("the '#n' duplicate-row suffix is not part of the scene", () => {
  eq(sceneOf({ term: "x", sec: "2-5#2" }), "2-5");
});
t("an unseeded card falls back to the section map by term", () => {
  // 会社 carries no `sec` here, so SECTION_MAP has to supply the scene.
  eq(sceneOf({ id: "z", term: "会社" }), "2-5");
});
t("a card the curriculum does not place reports nothing rather than a made-up scene", () => {
  eq(sceneOf({ id: "z", term: "ミミズク" }), "");
  eq(sceneOf(null), "");
});

console.log("\n=== tier 1: the learner's own confusion pairs ===");
t("a supplied confusion pair is offered", () => {
  const picks = pickDistractors(byId("kaisha"), DECK, 3, { confusedWith: ["hon"], seed: 1 });
  ok(ids(picks).includes("hon"), "expected 本 among " + ids(picks).join(", "));
  eq(tierOf(picks, "hon"), TIER.CONFUSION);
});
t("it is offered even though it is in another act entirely", () => {
  // 本 is act 5; every other candidate is nearer. Confusion history outranks locality.
  const picks = pickDistractors(byId("kaisha"), DECK, 3, { confusedWith: ["tokei"], seed: 7 });
  eq(tierOf(picks, "tokei"), TIER.CONFUSION);
});
t("confusion pairs come straight from confusionFrom", () => {
  const evs = [
    makeEvidence({ id: "kaisha", format: "mc", skill: "recognition", ok: false, confused: "gakkou" }),
    makeEvidence({ id: "kaisha", format: "mc", skill: "recognition", ok: false, confused: "gakkou" }),
    makeEvidence({ id: "kaisha", format: "mc", skill: "recognition", ok: false, confused: "hon" }),
  ];
  const picks = pickDistractors(byId("kaisha"), DECK, 3,
                                { confusedWith: confusionFrom(evs).get("kaisha"), seed: 3 });
  eq(tierOf(picks, "gakkou"), TIER.CONFUSION);
  eq(tierOf(picks, "hon"), TIER.CONFUSION);
});
t("confusion history does not fill every slot on its own", () => {
  // Three wrong answers the learner has already been burned by teach less than two of
  // those plus something new, so the tier is capped one short of a full set.
  const picks = pickDistractors(byId("kaisha"), DECK, 3,
                                { confusedWith: ["gakkou", "hon", "eki"], seed: 4 });
  eq(picks.filter((p) => p.tier === TIER.CONFUSION).length, 2);
  eq(picks.length, 3);
});
t("a confusion id that is not in the deck is skipped, not offered as a hole", () => {
  const picks = pickDistractors(byId("kaisha"), DECK, 3, { confusedWith: ["ghost"], seed: 2 });
  eq(picks.length, 3);
  ok(picks.every((p) => p.card && p.card.id !== "ghost"));
});

console.log("\n=== tier 2/3: the textbook ===");
t("with no confusion data, same-scene words outrank the rest of the deck", () => {
  const picks = pickDistractors(byId("kaisha"), DECK, 3, { seed: 11 });
  // 学校 / 駅 / うち are the only other 2-5 words, so they must be exactly the three.
  eq(ids(picks).slice().sort().join(","), "eki,gakkou,uchi");
  ok(picks.every((p) => p.tier === TIER.SCENE), JSON.stringify(picks.map((p) => p.tier)));
});
t("the same holds for a scene reached through the section map rather than `sec`", () => {
  const picks = pickDistractors({ id: "q", term: "学校", reading: "がっこう", kind: "kanji" }, DECK, 2, { seed: 5 });
  ok(picks.every((p) => sceneOf(p.card) === "2-5"), ids(picks).join(", "));
});
t("a thin scene is topped up from nearby scenes, nearest first", () => {
  const picks = pickDistractors(byId("tokei"), DECK, 3, { seed: 6 });
  // 5-2 has no other members, so 5-1 (gap 1) must fill before act 2 (gap 300).
  eq(tierOf(picks, "hon"), TIER.NEARBY);
  eq(tierOf(picks, "kaban"), TIER.NEARBY);
  const third = picks.find((p) => p.tier === TIER.NEARBY && p.card.id !== "hon" && p.card.id !== "kaban");
  ok(third, "the third pick should still be a nearby-scene word");
  ok(sceneOf(third.card).startsWith("2-"), "and the only ones left are act 2");
});
t("an unplaced card skips the curriculum tiers instead of inventing one", () => {
  const loner = { id: "loner", term: "ミミズク", reading: "みみずく", meaning: "horned owl", kind: "katakana" };
  const picks = pickDistractors(loner, DECK, 3, { seed: 9 });
  eq(picks.length, 3);
  ok(picks.every((p) => p.tier !== TIER.SCENE && p.tier !== TIER.NEARBY), JSON.stringify(picks.map((p) => p.tier)));
});

console.log("\n=== tier 4/5: sound and shape ===");
t("a near-homophone beats an unrelated word once the curriculum runs out", () => {
  /* All three are outside the textbook, so neither curriculum tier can fire and the only
     thing separating them is sound: おばさん / おばあさん differ by one mora. */
  const oba = { id: "oba", term: "おばさん", reading: "おばさん", meaning: "aunt", kind: "hiragana" };
  const obaa = { id: "obaa", term: "おばあさん", reading: "おばあさん", meaning: "grandmother", kind: "hiragana" };
  const other = { id: "mimi", term: "ミミズク", reading: "みみずく", meaning: "horned owl", kind: "hiragana" };
  const picks = pickDistractors(oba, [obaa, other], 1, { seed: 2 });
  eq(ids(picks)[0], "obaa");
  eq(picks[0].tier, TIER.SIMILAR);
});
t("failing that, the same writing system at least", () => {
  const picks = pickDistractors({ id: "q2", term: "犬", reading: "いぬ", meaning: "dog", kind: "kanji" },
                                [byId("biiru"), byId("tokei")], 1, { seed: 1 });
  eq(ids(picks)[0], "tokei");
  eq(picks[0].tier, TIER.KIND);
});

console.log("\n=== invariants ===");
t("the answer is never among its own distractors", () => {
  for (const card of DECK) {
    for (let seed = 0; seed < 12; seed++) {
      const picks = pickDistractors(card, DECK, 3, { confusedWith: [card.id], seed });
      ok(picks.every((p) => p.card.id !== card.id), card.id + " was offered as its own distractor");
      ok(picks.every((p) => p.card.term !== card.term), card.id + " was offered under its own term");
    }
  }
});
t("no duplicates, whatever the tiers do", () => {
  for (let seed = 0; seed < 12; seed++) {
    const picks = pickDistractors(byId("kaisha"), DECK, 3, { confusedWith: ["gakkou", "gakkou"], seed });
    eq(new Set(picks.map((p) => p.card.id)).size, picks.length, "seed " + seed);
  }
});
t("a fixed seed gives a fixed set, in a fixed order", () => {
  const a = pickDistractors(byId("gohan"), DECK, 3, { seed: 42 });
  const b = pickDistractors(byId("gohan"), DECK, 3, { seed: 42 });
  eq(ids(a).join(","), ids(b).join(","));
  eq(a.map((p) => p.tier).join(","), b.map((p) => p.tier).join(","));
});
t("a different seed can give a different set — the options are not frozen for all time", () => {
  const seen = new Set();
  for (let seed = 0; seed < 20; seed++) seen.add(ids(pickDistractors(byId("hon"), DECK, 3, { seed })).join(","));
  ok(seen.size > 1, "every seed produced the same three options");
});
t("every pick carries a tier, and it is one of the declared ones", () => {
  const tiers = new Set(Object.values(TIER));
  const picks = pickDistractors(byId("kaisha"), DECK, 3, { confusedWith: ["hon"], seed: 8 });
  ok(picks.every((p) => tiers.has(p.tier)), JSON.stringify(picks.map((p) => p.tier)));
});
t("a restriction shapes the ordinary tiers but never hides a confusion pair", () => {
  // Only kanji cards are plausible here; うち is hiragana and must not be drawn...
  const onlyKanji = pickDistractors(byId("kaisha"), DECK, 3, { seed: 3, restrict: (c) => c.kind === "kanji" });
  ok(!ids(onlyKanji).includes("uchi"), ids(onlyKanji).join(", "));
  // ...unless the learner has actually confused the two.
  const withHistory = pickDistractors(byId("kaisha"), DECK, 3,
                                      { seed: 3, confusedWith: ["uchi"], restrict: (c) => c.kind === "kanji" });
  eq(tierOf(withHistory, "uchi"), TIER.CONFUSION);
});
t("a restriction too narrow to fill the slots widens rather than return short", () => {
  const picks = pickDistractors(byId("kaisha"), DECK, 3, { seed: 3, restrict: (c) => c.id === "gakkou" });
  eq(picks.length, 3);
});
t("a tiny deck degrades instead of crashing", () => {
  eq(pickDistractors(byId("kaisha"), [byId("kaisha")], 3, { seed: 1 }).length, 0);
  eq(pickDistractors(byId("kaisha"), [], 3, {}).length, 0);
  eq(pickDistractors(byId("kaisha"), null, 3).length, 0);
  eq(pickDistractors(null, DECK, 3).length, 0);
  eq(pickDistractors(byId("kaisha"), DECK, 0).length, 0);
});
t("asking for more than the deck holds returns what there is", () => {
  eq(pickDistractors(byId("kaisha"), DECK, 50, { seed: 1 }).length, DECK.length - 1);
});

console.log(fail ? "\n" + fail + "/" + run + " FAILED" : "\nall " + run + " distractor tests passed");
process.exit(fail ? 1 : 0);
