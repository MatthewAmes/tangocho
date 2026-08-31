// Tests for the matching grid (tools/matchgrid.mjs).
//   node tools/test-matchgrid.mjs
import { GRID, pickPairs, matchBoard, canMatch, tapResult } from "./matchgrid.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const card = (id, term, meaning, kind = "kanji", reading = "") => ({ id, term, meaning, kind, reading });
const A = card("a", "見る", "to see");
const B = card("b", "見せる", "to show");        // the classic confusion with A
const C = card("c", "聞く", "to hear");
const D = card("d", "話す", "to speak");
const E = card("e", "ねこ", "cat", "hiragana");
const pool = [A, B, C, D, E];
const conf = new Map([["a", ["b"]]]);

console.log("=== the board is built to be adversarial, not random ===");
t("the word this one gets confused with is taken FIRST", () => {
  const pairs = pickPairs(A, pool, conf);
  eq(pairs[0].id, "a", "anchor leads");
  eq(pairs[1].id, "b", "then the confusable, before any filler");
});
t("confusion is read in both directions", () => {
  // B has no recorded confusions of its own, but A is confused WITH B — equally usable.
  const pairs = pickPairs(B, pool, conf);
  ok(pairs.some((c) => c.id === "a"), "should pull in the word that gets mistaken for it");
});
t("a board with a real confusable is marked as such", () => {
  eq(matchBoard(A, pool, conf, { seed: 3 }).adversarial, true);
});
t("a board with no confusable says so rather than pretending", () => {
  eq(matchBoard(C, pool, new Map(), { seed: 3 }).adversarial, false);
});
t("filler prefers the same writing system", () => {
  // ねこ is the only kana card; among kanji fillers it should not be reached first,
  // because a lone kana tile can be paired on shape without reading anything.
  const pairs = pickPairs(A, pool, new Map(), { MAX_PAIRS: 3 });
  eq(pairs.some((c) => c.id === "e"), false, "kana filler should not beat kanji filler");
});

t("different anchors do NOT produce the same filler", () => {
  // The reported bug: filler was taken in POOL ORDER, and the pool was the whole deck, so
  // every board showed the same first few words whatever the anchor was.
  const big = Array.from({ length: 40 }, (_, i) => card("p" + i, "語" + i, "meaning " + i));
  const boards = big.slice(0, 6).map((a2, i) => pickPairs(a2, big, new Map(), { seed: i + 1 }));
  const fillerSets = boards.map((b2) => b2.slice(1).map((c) => c.id).sort().join(","));
  ok(new Set(fillerSets).size > 1, "every board drew identical filler: " + fillerSets[0]);
});
t("the same anchor and seed still give the same board", () => {
  const big = Array.from({ length: 40 }, (_, i) => card("p" + i, "語" + i, "meaning " + i));
  const one = pickPairs(big[0], big, new Map(), { seed: 5 }).map((c) => c.id).join(",");
  const two = pickPairs(big[0], big, new Map(), { seed: 5 }).map((c) => c.id).join(",");
  eq(one, two, "a re-render must not reshuffle the tiles");
});

console.log("=== a board must be answerable ===");
t("two tiles never carry the same meaning", () => {
  const dup = [A, card("z", "みる", "to see", "hiragana")];
  const pairs = pickPairs(A, dup.concat(pool), new Map());
  const meanings = pairs.map((c) => c.meaning.toLowerCase());
  eq(new Set(meanings).size, meanings.length, "duplicate meanings make the board unanswerable: " + meanings);
});
t("cards with no term or no meaning are never used", () => {
  const junk = [card("j1", "", "empty term"), card("j2", "語", ""), { id: "j3" }];
  const pairs = pickPairs(A, junk, new Map());
  eq(pairs.length, 1, "only the anchor survives");
});
t("the anchor is never duplicated into the board", () => {
  const pairs = pickPairs(A, [A, A, B], conf);
  eq(pairs.filter((c) => c.id === "a").length, 1);
});
t("too small a pool yields no board rather than a two-tile one", () => {
  eq(matchBoard(A, [B], conf), null, "2 pairs is under MIN_PAIRS");
  eq(canMatch(A, [B], conf), false);
  eq(canMatch(A, pool, conf), true);
});
t("junk input is safe", () => {
  eq(matchBoard(null, pool, conf), null);
  eq(matchBoard(A, null, null), null);
  eq(pickPairs(A, undefined, undefined).length, 1);
});

t("function words never reach a board", () => {
  // Live: a board offered か against "acceptable" and こと against "koto". A matching board
  // asks which meaning belongs to which word, and particles do not have one.
  const fns = [card("k1","か","question particle","hiragana"), card("k2","こと","koto","hiragana"),
               card("k3","まま","as is","hiragana"), card("k4","は","topic marker","hiragana")];
  const pairs = pickPairs(A, fns.concat(pool), new Map());
  eq(pairs.some((c) => ["k1","k2","k3","k4"].includes(c.id)), false, "got " + pairs.map(c=>c.term).join(","));
});
t("a card whose meaning is just its own romaji is not usable", () => {
  const romajiOnly = { id: "r1", term: "こと", meaning: "koto", romaji: "koto", kind: "hiragana" };
  eq(pickPairs(romajiOnly, pool, new Map()).length, 0, "it cannot even be the anchor");
});
t("grammar annotations are stripped from the tile, not shown on it", () => {
  const v = card("v1", "やる（-U; やった）", "to give", "hiragana");
  const b2 = matchBoard(v, pool.concat([v]), new Map(), { seed: 2 });
  const tile = b2.jp.find((x) => x.id === "v1");
  eq(tile.text, "やる", "the tile should read やる, got " + tile.text);
});

console.log("=== the two columns ===");
t("both sides hold every pair exactly once", () => {
  const b = matchBoard(A, pool, conf, { seed: 5 });
  eq(b.jp.length, b.pairs.length);
  eq(b.en.length, b.pairs.length);
  eq(new Set(b.jp.map((x) => x.id)).size, b.pairs.length);
  eq(new Set(b.en.map((x) => x.id)).size, b.pairs.length);
});
t("the same seed gives the same board — a re-render must not move the tiles", () => {
  const a = matchBoard(A, pool, conf, { seed: 9 });
  const b = matchBoard(A, pool, conf, { seed: 9 });
  eq(a.jp.map((x) => x.key).join(","), b.jp.map((x) => x.key).join(","));
});
t("the columns are shuffled independently", () => {
  // Shuffling them together can leave a word directly opposite its own meaning.
  let sameOrder = 0;
  for (let s = 1; s <= 20; s++) {
    const b = matchBoard(A, pool, conf, { seed: s });
    if (b.jp.map((x) => x.id).join() === b.en.map((x) => x.id).join()) sameOrder++;
  }
  ok(sameOrder < 20, "columns should not always align");
});

console.log("=== tapping ===");
const jp = (id) => ({ key: "jp:" + id, side: "jp", id });
const en = (id) => ({ key: "en:" + id, side: "en", id });
t("first tap selects", () => { eq(tapResult(null, jp("a")).action, "select"); });
t("tapping the same tile again deselects", () => { eq(tapResult(jp("a"), jp("a")).action, "deselect"); });
t("a matching pair is a pair", () => {
  const r = tapResult(jp("a"), en("a"));
  eq(r.action, "pair"); eq(r.id, "a");
});
t("a mismatch is a miss, attributed to the JAPANESE card", () => {
  // The miss belongs to the word being tested, whichever side was tapped first.
  eq(tapResult(jp("a"), en("b")).id, "a");
  eq(tapResult(en("b"), jp("a")).id, "a");
  eq(tapResult(jp("a"), en("b")).action, "miss");
});
t("changing your mind on the same side is not a miss", () => {
  eq(tapResult(en("a"), en("b")).action, "select", "reaching for another meaning is not a wrong answer");
  eq(tapResult(jp("a"), jp("b")).action, "select");
});
t("tapping nothing does nothing", () => { eq(tapResult(jp("a"), null).action, "none"); });

console.log(`\nall ${run} matchgrid tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
