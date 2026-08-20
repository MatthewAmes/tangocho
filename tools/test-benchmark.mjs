// Tests for the benchmark. Its entire value rests on two properties — the words are held
// out of study, and the result is not reported as progress unless it actually is. Most of
// these attack those two.
//
//   node tools/test-benchmark.mjs
import {
  cycleFor, reserveFor, sampleFor, normalise, gradeAnswer, scoreRun,
  estimateKnown, compareRuns, describeRun, pushRun,
  RESERVE_FRACTION, CYCLE_DAYS, RUN_SIZE, HISTORY_CAP, poolRuns, glossOf, askable, acceptedForms,
} from "./benchmark.mjs";
import { candidates } from "./session.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lt = (a, b, m) => { if (!(a < b)) throw new Error(`${m || ""} expected ${a} < ${b}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const deck = [...Array(600)].map((_, i) => ({
  id: "w" + i, term: "語" + i, reading: "ご" + i, en: "word " + i, kind: "noun",
}));

console.log("=== the hold-out ===");
t("a reserve is drawn and it is roughly the intended size", () => {
  const r = reserveFor(deck, 0);
  const frac = r.size / deck.length;
  ok(Math.abs(frac - RESERVE_FRACTION) < 0.04, `reserved ${(frac * 100).toFixed(1)}%, wanted ~${RESERVE_FRACTION * 100}%`);
});
t("the same cycle gives the same reserve on every device", () => {
  // Derived by hashing, not stored — two machines must agree without syncing anything.
  const a = [...reserveFor(deck, 3)].sort().join(",");
  const b = [...reserveFor(deck, 3)].sort().join(",");
  eq(a, b);
});
t("a new cycle releases the old words and reserves different ones", () => {
  const a = reserveFor(deck, 0), b = reserveFor(deck, 1);
  const overlap = [...a].filter((id) => b.has(id)).length;
  lt(overlap, a.size * 0.5, "a fresh cycle must not re-quarantine most of the same words");
  ok(b.size > 0, "and it must actually reserve something");
});
t("cycles advance on the calendar, not on use", () => {
  const epoch = Date.UTC(2026, 0, 1);
  eq(cycleFor(epoch, epoch), 0);
  eq(cycleFor(epoch + (CYCLE_DAYS - 1) * 86400000, epoch), 0);
  eq(cycleFor(epoch + CYCLE_DAYS * 86400000, epoch), 1);
  eq(cycleFor(epoch - 99999999, epoch), 0, "never negative");
});

console.log("\n=== the scheduler cannot see reserved words ===");
t("held-out words are absent from the study candidates", () => {
  // This is the property the whole benchmark rests on. If it fails, the score measures
  // revision rather than Japanese and every other test here is decoration.
  const reserved = reserveFor(deck, 0);
  const src = [{ deck: "vocab", items: deck, stats: {} }];
  const withHold = candidates(src, { exclude: reserved });
  const without = candidates(src, {});
  eq(without.length, deck.length, "without a hold-out everything is schedulable");
  eq(withHold.length, deck.length - reserved.size);
  eq(withHold.filter((c) => reserved.has(c.item.id)).length, 0, "a reserved word reached the scheduler");
});
t("no hold-out means no change in behaviour", () => {
  eq(candidates([{ deck: "vocab", items: deck, stats: {} }], {}).length, deck.length);
});

console.log("\n=== the sample estimates the deck, not your revision ===");
t("a run only asks reserved words", () => {
  const reserved = reserveFor(deck, 0);
  const s = sampleFor(deck, reserved, RUN_SIZE, 1);
  eq(s.length, RUN_SIZE);
  ok(s.every((c) => reserved.has(c.id)), "sampled a word that was never held out");
});
t("the same run resumes identically after a reload", () => {
  const reserved = reserveFor(deck, 0);
  const a = sampleFor(deck, reserved, RUN_SIZE, 7).map((c) => c.id).join(",");
  const b = sampleFor(deck, reserved, RUN_SIZE, 7).map((c) => c.id).join(",");
  eq(a, b, "a reload must not reshuffle a test in progress");
});
t("a later run asks different words", () => {
  const reserved = reserveFor(deck, 0);
  const a = new Set(sampleFor(deck, reserved, RUN_SIZE, 1).map((c) => c.id));
  const b = sampleFor(deck, reserved, RUN_SIZE, 2).map((c) => c.id);
  lt(b.filter((id) => a.has(id)).length, RUN_SIZE, "consecutive runs must not be the same test");
});
t("every deck's way of spelling 'the English side' is understood", () => {
  /* This was a real bug, and the tests missed it entirely: the course vocabulary uses
     `meaning`, and a filter that only knew `en` and `gloss` quietly reserved zero words.
     Green suites, empty benchmark. */
  eq(glossOf({ meaning: "to be grateful" }), "to be grateful");
  eq(glossOf({ en: "Tuesday" }), "Tuesday");
  eq(glossOf({ gloss: "to do" }), "to do");
  eq(glossOf({}), "");
  eq(askable({ id: "a", term: "犬", meaning: "dog" }), true);
  eq(askable({ id: "a", term: "犬" }), false, "no English means it cannot be asked");
});
t("a deck that spells it 'meaning' still produces a full run", () => {
  const jp = [...Array(600)].map((_, i) => ({ id: "m" + i, term: "語" + i, reading: "ご" + i, meaning: "word " + i }));
  const reserved = reserveFor(jp, 0);
  gt(reserved.size, 20, "nothing was reserved at all");
  eq(sampleFor(jp, reserved, RUN_SIZE, 1).length, RUN_SIZE);
});
t("words with no English are not askable and are skipped", () => {
  const partial = deck.map((c, i) => (i % 2 ? { ...c, en: "" } : c));
  const reserved = reserveFor(partial, 0);
  ok(sampleFor(partial, reserved, RUN_SIZE, 1).every((c) => c.en));
});

console.log("\n=== grading ===");
t("either the written form or the reading counts", () => {
  const c = { term: "火曜日", reading: "かようび" };
  eq(gradeAnswer(c, "火曜日").ok, true);
  eq(gradeAnswer(c, "かようび").ok, true);
});
t("spacing and stray punctuation do not fail a right answer", () => {
  eq(gradeAnswer({ term: "火曜日", reading: "かようび" }, " かようび。").ok, true);
  eq(normalise("　か ようび、"), "かようび");
});
t("a blank is recorded as a blank, not as a wrong answer", () => {
  const g = gradeAnswer({ term: "火曜日", reading: "かようび" }, "   ");
  eq(g.ok, false); eq(g.blank, true);
});
t("a near miss is flagged but never scored as correct", () => {
  // Partial credit would make runs incomparable, which defeats the point of the benchmark.
  const g = gradeAnswer({ term: "火曜日", reading: "かようび" }, "かよおび");
  eq(g.ok, false, "one character off is not knowing the word");
  eq(g.near, true, "but it is worth seeing separately");
});
t("textbook annotations do not fail a correct answer", () => {
  /* 38% of the deck carries a bracketed annotation and fifteen entries carry a pitch arrow.
     Comparing raw strings marked all of those wrong, which would have made the checkpoint
     report far less Japanese than the learner actually has — the one direction this tool
     must never be wrong in. */
  const conj = { term: "掛ける (RU; 掛けた)", reading: "かける" };
  eq(gradeAnswer(conj, "かける").ok, true);
  eq(gradeAnswer(conj, "掛ける").ok, true);

  const readingAnnotated = { term: "こる (-RU; こった)", reading: "こる (-RU; こった)" };
  eq(gradeAnswer(readingAnnotated, "こる").ok, true, "the annotation is in the reading field too");

  const pitch = { term: "妻↓", reading: "つま" };
  eq(gradeAnswer(pitch, "つま").ok, true);
  eq(gradeAnswer(pitch, "妻").ok, true, "a pitch mark is not part of the word");
});
t("an optional prefix or する is accepted either way", () => {
  // Both readings are genuinely correct Japanese, so both must count.
  const iwai = { term: "（お）祝い", reading: "いわい" };
  eq(gradeAnswer(iwai, "祝い").ok, true);
  eq(gradeAnswer(iwai, "お祝い").ok, true);
  const jikken = { term: "実験（する）", reading: "じっけん" };
  eq(gradeAnswer(jikken, "実験").ok, true);
  eq(gradeAnswer(jikken, "実験する").ok, true);
});
t("accepting more forms does not accept wrong answers", () => {
  eq(gradeAnswer({ term: "実験（する）", reading: "じっけん" }, "たべもの").ok, false);
  ok(!acceptedForms({ term: "（お）祝い", reading: "いわい" }).has(""), "empty must never be an accepted form");
  eq(gradeAnswer({ term: "（お）祝い", reading: "いわい" }, "").blank, true);
});
t("a completely different word is not a near miss", () => {
  eq(gradeAnswer({ term: "火曜日", reading: "かようび" }, "たべもの").near, false);
});
t("short words do not get near-miss credit", () => {
  // At two characters, one edit away is a different word, not a slip.
  eq(gradeAnswer({ term: "犬", reading: "いぬ" }, "うぬ").near, false);
});

console.log("\n=== the estimate carries its uncertainty ===");
t("the headline is a range, not a point", () => {
  const cards = deck.slice(0, 20);
  const answers = cards.map((c, i) => ({ id: c.id, got: i < 6 ? c.reading : "" }));
  const est = estimateKnown(scoreRun(cards, answers), 1632);
  eq(est.deckSize, 1632);
  lt(est.lo, est.words); gt(est.hi, est.words);
  gt(est.hi - est.lo, 200, "twenty words cannot pin down 1,632 to within 200");
});
t("a bigger sample gives a tighter range", () => {
  const mk = (n, hits) => {
    const cards = deck.slice(0, n);
    return scoreRun(cards, cards.map((c, i) => ({ id: c.id, got: i < hits ? c.reading : "" })));
  };
  const small = estimateKnown(mk(20, 6), 1632);
  const big = estimateKnown(mk(200, 60), 1632);
  lt(big.hi - big.lo, small.hi - small.lo);
});
t("nothing is estimated from nothing", () => {
  eq(estimateKnown(scoreRun([], []), 1632), null);
});

console.log("\n=== improvement is only claimed when it is real ===");
t("a few extra right answers is not progress", () => {
  const prev = { n: 20, ok: 8 }, curr = { n: 20, ok: 11 };
  eq(compareRuns(prev, curr).verdict, "unclear", "3 of 20 is well inside the noise");
});
t("a large move is reported", () => {
  eq(compareRuns({ n: 60, ok: 12 }, { n: 60, ok: 48 }).verdict, "better");
  eq(compareRuns({ n: 60, ok: 48 }, { n: 60, ok: 12 }).verdict, "worse");
});
t("the first run has nothing to compare against", () => {
  eq(compareRuns(null, { n: 20, ok: 10 }).verdict, "first");
  eq(poolRuns([]), null);
});
t("pooling past runs makes a modest improvement visible", () => {
  /* The point of pooling. Thirty against thirty cannot see this move; thirty against a
     hundred and fifty can, and it is the difference between a benchmark that answers "am I
     improving" and one that shrugs every time. */
  const history = [...Array(5)].map(() => ({ n: 30, ok: 9 }));   // 150 words, 30%
  const pooled = poolRuns(history);
  eq(pooled.n, 150); eq(pooled.ok, 45);
  const curr = { n: 30, ok: 18 };                                 // 60% on the new run
  eq(compareRuns(pooled, curr).verdict, "better");
  eq(compareRuns(history[0], curr).verdict, "unclear", "against one run alone it is not visible");
});

console.log("\n=== what it says out loud ===");
t("the headline is words, not a percentage, and admits its range", () => {
  const cards = deck.slice(0, 20);
  const runRes = scoreRun(cards, cards.map((c, i) => ({ id: c.id, got: i < 6 ? c.reading : "" })));
  const s = describeRun(runRes, estimateKnown(runRes, 1632), compareRuns(null, runRes));
  ok(/about \d+ of (your )?\d+/.test(s), s);
  ok(/between \d+ and \d+/.test(s), `no range given: ${s}`);
  ok(!/%|Wilson|interval|confidence/i.test(s), `leaked statistics vocabulary: ${s}`);
});
t("an unclear result is stated as unclear rather than dressed up", () => {
  const cards = deck.slice(0, 20);
  const r = scoreRun(cards, cards.map((c, i) => ({ id: c.id, got: i < 11 ? c.reading : "" })));
  const s = describeRun(r, estimateKnown(r, 1632), compareRuns({ n: 20, ok: 8 }, r));
  ok(/too close|either way/i.test(s), s);
});
t("a wall of near misses is called out as its own problem", () => {
  const cards = deck.slice(0, 20);
  const r = scoreRun(cards, cards.map((c) => ({ id: c.id, got: c.reading + "x" })));
  ok(/one character off/.test(describeRun(r, estimateKnown(r, 1632), null)), "near misses should be named");
});

console.log("\n=== history ===");
t("history keeps the score, not the answers", () => {
  const cards = deck.slice(0, 20);
  const r = scoreRun(cards, cards.map((c) => ({ id: c.id, got: c.reading })));
  const h = pushRun([], r);
  eq(h.length, 1); eq(h[0].ok, 20);
  eq(h[0].detail, undefined, "storing every answer forever is not the job of a history");
});
t("history is capped", () => {
  let h = [];
  for (let i = 0; i < HISTORY_CAP + 10; i++) h = pushRun(h, { at: i, n: 20, ok: i, near: 0, blank: 0 });
  eq(h.length, HISTORY_CAP);
  eq(h[h.length - 1].ok, HISTORY_CAP + 9, "the newest run must survive");
});

console.log(`\n${fail ? `${fail} of ${run} FAILED` : `all ${run} benchmark tests passed`}`);
process.exit(fail ? 1 : 0);
