// Tests for the production drills and for i+1 material selection. Both are places where
// it would be easy to ship something that looks like practice and is not: a reorder puzzle
// that arrives already solved, or a "learning zone" that calls everything a good fit.
//
//   node tools/test-production.mjs
import {
  DRILL, PARTICLES, chunk, shuffled, orderDrill, fillDrill, buildDrill,
  gradeDrill, drillFor, drillSet, usableChunks,
} from "./production.mjs";
import {
  BANDS, STRETCH_LOW, STRETCH_HIGH, bandFor, describeBand, rankMaterial, nextBest,
} from "./comprehensible.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

console.log("=== breaking a sentence into pieces ===");
t("kanji and kana runs separate", () => {
  const c = chunk("日本語を勉強します。");
  ok(c.length >= 4, JSON.stringify(c));
  ok(c.includes("を"), JSON.stringify(c));
});
t("a known word stays whole rather than splitting", () => {
  const c = chunk("日本語を勉強します。", ["日本語", "勉強"]);
  ok(c.includes("日本語"), JSON.stringify(c));
  ok(!c.includes("日本"), "日本語 must not be split into 日本 + 語");
});
t("longer known words win over shorter ones inside them", () => {
  const c = chunk("日本語です", ["日本", "日本語"]);
  ok(c.includes("日本語"), JSON.stringify(c));
});
t("final punctuation rides along instead of becoming its own tile", () => {
  const c = chunk("元気です。");
  ok(!c.includes("。"), `punctuation became a tile: ${JSON.stringify(c)}`);
  ok(c[c.length - 1].endsWith("。"), JSON.stringify(c));
});
t("an empty sentence yields nothing", () => {
  eq(chunk("").length, 0);
  eq(chunk(null).length, 0);
});

console.log("\n=== the shuffle ===");
t("a puzzle never arrives already solved", () => {
  /* The failure that makes the whole drill pointless, and it happens by chance often
     enough on short sentences to be worth forcing. */
  for (let seed = 0; seed < 40; seed++) {
    const list = ["A", "B", "C"];
    ok(shuffled(list, seed).join("") !== "ABC", `seed ${seed} returned the original order`);
  }
});
t("shuffling keeps every piece exactly once", () => {
  const list = ["日本", "語", "を", "勉強"];
  const s = shuffled(list, 3);
  eq(s.length, list.length);
  eq([...s].sort().join(","), [...list].sort().join(","));
});
t("one piece cannot be shuffled and does not throw", () => {
  eq(shuffled(["A"], 1).join(""), "A");
  eq(shuffled([], 1).length, 0);
});

console.log("\n=== reordering ===");
t("a sentence becomes tiles plus an answer", () => {
  const d = orderDrill("日本語を勉強します。", { known: ["日本語", "勉強"], seed: 1 });
  ok(d, "expected a drill");
  eq(d.type, DRILL.ORDER);
  eq(d.answer.join(""), "日本語を勉強します。");
  eq([...d.tiles].sort().join(","), [...d.answer].sort().join(","));
});
t("a sentence too short to reorder is refused", () => {
  // Two tiles is a coin flip, not practice.
  eq(orderDrill("はい。"), null);
});
t("a sentence too long to reorder is refused", () => {
  eq(orderDrill("昨日図書館で友達と一緒に難しい日本語の宿題を三時間ぐらい勉強しました。"), null);
});

console.log("\n=== filling in a particle ===");
t("a particle is removed and becomes the answer", () => {
  const d = fillDrill("日本語を勉強します。", { seed: 0 });
  ok(d, "expected a drill");
  eq(d.type, DRILL.FILL);
  ok(PARTICLES.includes(d.answer));
  eq(d.before + d.answer + d.after, "日本語を勉強します。");
});
t("the choices include the right answer", () => {
  const d = fillDrill("日本語を勉強します。", { seed: 0 });
  ok(d.choices.includes(d.answer));
});
t("a sentence with no particle is refused rather than mangled", () => {
  eq(fillDrill("元気"), null);
});
t("a particle appearing twice is skipped, to keep the question unambiguous", () => {
  const d = fillDrill("私は父は好きです。", { seed: 0 });
  if (d) ok(d.answer !== "は", "は appears twice and should not have been chosen");
});

console.log("\n=== building from English ===");
t("an English prompt plus a bank of tiles", () => {
  const d = buildDrill("日本語を勉強します。", { en: "I study Japanese.", known: ["日本語", "勉強"], seed: 2 });
  ok(d, "expected a drill");
  eq(d.type, DRILL.BUILD);
  eq(d.prompt, "I study Japanese.");
  eq(d.answer.join(""), "日本語を勉強します。");
});
t("without an English prompt there is nothing to build from", () => {
  eq(buildDrill("日本語を勉強します。", { known: [] }), null);
});
t("distractors are added and flagged", () => {
  const d = buildDrill("日本語を勉強します。", {
    en: "I study Japanese.", known: ["日本語"], distractors: ["犬", "猫"], seed: 1,
  });
  eq(d.hasDistractors, true, "the screen has to be able to say not every tile belongs");
  ok(d.tiles.length > d.answer.length);
});
t("a distractor that is already in the answer is not added twice", () => {
  const d = buildDrill("日本語を勉強します。", {
    en: "x", known: ["日本語"], distractors: ["を"], seed: 1,
  });
  eq(d.tiles.length, d.answer.length, "を is already in the sentence");
});

console.log("\n=== real word boundaries beat derived ones ===");
t("supplied tokens are used in preference to guessing", () => {
  const given = ["はい、", "大丈夫", "です。"];
  eq(usableChunks("はい、大丈夫です。", { chunks: given, known: ["大丈夫"] }).join("|"), given.join("|"));
});
t("a kanji token joins its okurigana, and the deck decides which is which", () => {
  /* The script tokens split a kanji from its ending, because the token carries a reading
     for the kanji alone. As tiles that asks the learner to rebuild the inside of a verb. */
  eq(usableChunks("はい、頑張ります。", { chunks: ["はい、", "頑張", "ります。"], known: ["大丈夫"] })
       .join("|"), "はい、|頑張ります。", "頑張 is not a word on its own");
  eq(usableChunks("はい、大丈夫です。", { chunks: ["はい、", "大丈夫", "です。"], known: ["大丈夫"] })
       .join("|"), "はい、|大丈夫|です。", "大丈夫 is, so the copula stays a separate piece");
});
t("a lone kanji joins its okurigana even when it is also a deck entry", () => {
  /* 食 is in the deck in its own right, which left 食 + べませんか？ split. A single kanji
     followed by kana is one word essentially always. */
  eq(usableChunks("食べませんか？", { chunks: ["食", "べませんか？"], known: ["食"] })
       .join("|"), "食べませんか？");
});
t("without tokens it falls back to deriving them", () => {
  ok(usableChunks("日本語を勉強します。", {}).length >= 3);
});
t("a two-piece puzzle is refused as a build drill", () => {
  /* それ、わかりますか？ derives into exactly two tiles, because わかりますか？ is one unbroken
     run of hiragana. Two tiles is a coin flip, not practice. */
  eq(buildDrill("それ、わかりますか？", { en: "Do you understand that?" }), null);
});
t("the same sentence works once its real tokens are supplied", () => {
  const d = buildDrill("それ、わかりますか？", {
    en: "Do you understand that?", chunks: ["それ", "、", "わかります", "か？"],
  });
  ok(d, "with real word boundaries there is a genuine puzzle here");
  eq(d.answer.length, 4);
});

console.log("\n=== grading ===");
t("the right order passes", () => {
  const d = orderDrill("日本語を勉強します。", { known: ["日本語", "勉強"], seed: 1 });
  eq(gradeDrill(d, d.answer).ok, true);
});
t("the wrong order fails and says where", () => {
  const d = orderDrill("日本語を勉強します。", { known: ["日本語", "勉強"], seed: 1 });
  const wrong = [d.answer[1], d.answer[0], ...d.answer.slice(2)];
  const g = gradeDrill(d, wrong);
  eq(g.ok, false);
  eq(g.firstWrong, 0, "pointing at the first mistake beats re-showing the sentence");
});
t("a short answer fails rather than passing on a prefix", () => {
  const d = orderDrill("日本語を勉強します。", { known: ["日本語", "勉強"], seed: 1 });
  eq(gradeDrill(d, d.answer.slice(0, 2)).ok, false);
});
t("a filled particle grades exactly", () => {
  const d = fillDrill("日本語を勉強します。", { seed: 0 });
  eq(gradeDrill(d, d.answer).ok, true);
  eq(gradeDrill(d, "は").ok, d.answer === "は");
  eq(gradeDrill(d, "").ok, false);
});
t("grading nothing is harmless", () => {
  eq(gradeDrill(null, "x").ok, false);
});

console.log("\n=== choosing a drill, and a set of them ===");
t("a drill is produced for an ordinary sentence", () => {
  const d = drillFor("日本語を勉強します。", { en: "I study Japanese.", known: ["日本語", "勉強"] });
  ok(d);
  ok([DRILL.ORDER, DRILL.BUILD, DRILL.FILL].includes(d.type));
});
t("a sentence nothing fits returns null rather than a fake drill", () => {
  eq(drillFor("あ"), null);
});
t("a set is deduplicated so one chapter cannot fill it", () => {
  const src = [
    { text: "日本語を勉強します。", en: "I study Japanese." },
    { text: "日本語を勉強します。", en: "I study Japanese." },
    { text: "図書館で本を読みます。", en: "I read books at the library." },
  ];
  eq(drillSet(src, 5, { known: ["日本語", "図書館"] }).length, 2);
});
t("different days get different sentences, not the same set reshuffled", () => {
  /* Walking the sources from index 0 every time made the seed affect only tile order, so
     the same four sentences came back every session — the repetition complaint, rebuilt
     from scratch in a new feature. */
  const src = [...Array(30)].map((_, i) => ({ text: "日本語を勉強" + i + "します。", en: "study " + i }));
  /* CONSECUTIVE seeds, which is what "yesterday and today" actually are. Adding one to a
     contiguous walk overlaps almost completely; only a stride avoids it. */
  const setFor = (seed) => new Set(drillSet(src, 4, { seed }).map((d) => d.sentence));
  const a = setFor(1), b = setFor(2);
  const shared = [...a].filter((x) => b.has(x)).length;
  ok(shared <= 1, `consecutive days shared ${shared} of 4 sentences`);
  const week = new Set();
  for (let d = 0; d < 7; d++) for (const s of setFor(d)) week.add(s);
  ok(week.size >= 15, `a week produced only ${week.size} distinct sentences`);
});
t("asking for more than exists returns what exists", () => {
  eq(drillSet([{ text: "日本語を勉強します。", en: "x" }], 10).length, 1);
  eq(drillSet([], 5).length, 0);
});

console.log("\n=== i+1: is this worth reading ===");
t("the bands split where they are supposed to", () => {
  eq(bandFor(0.50), BANDS.TOO_HARD);
  eq(bandFor(0.85), BANDS.STRETCH);
  eq(bandFor(0.99), BANDS.EASY);
  eq(bandFor(STRETCH_LOW), BANDS.STRETCH, "the boundary is inside the band");
  eq(bandFor(STRETCH_HIGH), BANDS.STRETCH);
});
t("percentages work either as fractions or as whole numbers", () => {
  eq(bandFor(85), BANDS.STRETCH);
  eq(bandFor(0.85), BANDS.STRETCH);
});
t("nothing measured means no band", () => {
  eq(bandFor(null), null);
  eq(describeBand(null), "");
});
t("the description says what to do without saying the theory", () => {
  const s = describeBand(0.85);
  ok(/useful range/.test(s), s);
  ok(!/i\+1|Krashen|hypothesis/i.test(s), `leaked the theory: ${s}`);
  ok(/too hard|decoding/i.test(describeBand(0.4)), describeBand(0.4));
  ok(/little new/i.test(describeBand(0.99)), describeBand(0.99));
});
t("material in the learning zone outranks material outside it", () => {
  const items = [{ id: "easy" }, { id: "hard" }, { id: "fit" }];
  const cov = (it) => ({ easy: { pct: 99 }, hard: { pct: 40 }, fit: { pct: 86 } })[it.id];
  eq(rankMaterial(items, cov)[0].item.id, "fit");
});
t("a near miss never outranks a genuine fit", () => {
  const items = [{ id: "near" }, { id: "fit" }];
  const cov = (it) => ({ near: { pct: 96 }, fit: { pct: 78 } })[it.id];
  eq(rankMaterial(items, cov)[0].item.id, "fit", "96% is closer to the middle but outside the band");
});
t("unmeasurable material sinks rather than being guessed at", () => {
  const items = [{ id: "unknown" }, { id: "hard" }];
  const cov = (it) => (it.id === "hard" ? { pct: 40 } : { pct: null });
  eq(rankMaterial(items, cov)[0].item.id, "hard");
  eq(nextBest(items, cov).item.id, "hard");
});
t("nothing measurable at all recommends nothing", () => {
  eq(nextBest([{ id: "a" }], () => ({ pct: null })), null);
  eq(nextBest([], () => ({ pct: 80 })), null);
});

console.log("\n=== the grader takes RAW chunks, not the UI's keyed tiles ===");
t("a correctly assembled sentence grades correct", () => {
  const s = "私は学生です";
  const d = buildDrill(s, { en: "I am a student", known: ["私", "学生"], seed: 1 });
  if (!d) throw new Error("no drill built");
  if (!gradeDrill(d, d.answer.slice()).ok) throw new Error("the exact answer graded as wrong");
});
t("tiles still carrying the UI's disambiguation key do NOT grade correct", () => {
  /* The UI stores placed tiles as text + NUL + index so two identical pieces stay distinct
     while being placed. Passing those through unstripped made every build/order drill
     unwinnable — the grader compared "私" against "私\0" — while the on-screen sentence,
     which does strip the key, looked perfect. This pins the contract: the grader takes raw
     chunks and the caller must strip. */
  const s = "私は学生です";
  const d = buildDrill(s, { en: "I am a student", known: ["私", "学生"], seed: 1 });
  const NUL = String.fromCharCode(0);
  const keyed = d.answer.map((t, i) => t + NUL + i);
  if (gradeDrill(d, keyed).ok) throw new Error("keyed tiles should not pass — strip them first");
  const stripped = keyed.map((k) => k.split(NUL)[0]);
  if (!gradeDrill(d, stripped).ok) throw new Error("stripping the key should make it pass");
});


console.log(`\n${fail ? `${fail} of ${run} FAILED` : `all ${run} production and i+1 tests passed`}`);
process.exit(fail ? 1 : 0);
