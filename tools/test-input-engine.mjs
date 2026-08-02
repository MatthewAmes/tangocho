// Unit tests for the 入力 level engine. The spec called this out as "the part that will
// be wrong if untested", so these assert the actual rules rather than just that it runs.
//
//   node tools/test-input-engine.mjs
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "JpnFlashcards.jsx"), "utf8");

// pull the engine out of the single-file app without executing React
function grab(name, kind) {
  const start = src.indexOf(`${kind} ${name}`);
  if (start === -1) throw new Error("could not find " + name);
  let depth = 0, i = src.indexOf(kind === "const" ? "=" : "(", start), started = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") { depth++; started = true; }
    else if (c === "}" || c === "]" || c === ")") { depth--; if (started && depth === 0) { i++; break; } }
  }
  // For functions, skip the parameter list first — applyRating destructures, so its very
  // first "{" belongs to the params, not the body. Close the parens, then brace-count.
  if (kind === "function") {
    let p = src.indexOf("(", start), pd = 0, j = p;
    for (; j < src.length; j++) {
      if (src[j] === "(") pd++;
      else if (src[j] === ")") { pd--; if (pd === 0) { j++; break; } }
    }
    let d = 0, begun = false;
    for (; j < src.length; j++) {
      if (src[j] === "{") { d++; begun = true; }
      else if (src[j] === "}") { d--; if (begun && d === 0) { j++; break; } }
    }
    return src.slice(start, j);
  }
  return src.slice(start, i) + ";";
}

const code = [
  grab("INPUT_VERDICTS", "const"),
  "const clamp100 = (n) => Math.max(0, Math.min(100, n));",
  grab("evidenceWeight", "function"),
  grab("learningRate", "function"),
  grab("applyRating", "function"),
  grab("seedLevelsFromDeck", "function"),
  grab("seededShuffle", "function"),
  grab("coverageAgainstDeck", "function"),
  "export { applyRating, seedLevelsFromDeck, seededShuffle, coverageAgainstDeck, evidenceWeight, learningRate };",
].join("\n");

const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const { applyRating, seedLevelsFromDeck, seededShuffle, coverageAgainstDeck, evidenceWeight, learningRate } = mod;

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lt = (a, b, m) => { if (!(a < b)) throw new Error(`${m || ""} expected ${a} < ${b}`); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };

const base = { level: 30, ratingCount: 0, itemDifficulty: 30, itemConfidence: 0.3, minutes: 20 };

console.log("=== direction of each verdict ===");
t("too_easy raises the user and lowers the item", () => {
  const r = applyRating({ ...base, verdict: "too_easy" });
  gt(r.level, 30, "level"); lt(r.itemDifficulty, 30, "item");
});
t("too_hard lowers the user and raises the item", () => {
  const r = applyRating({ ...base, verdict: "too_hard" });
  lt(r.level, 30, "level"); gt(r.itemDifficulty, 30, "item");
});
t("lost moves further than too_hard in both directions", () => {
  const hard = applyRating({ ...base, verdict: "too_hard" });
  const lost = applyRating({ ...base, verdict: "lost" });
  lt(lost.level, hard.level, "level"); gt(lost.itemDifficulty, hard.itemDifficulty, "item");
});
t("just_right nudges the user up and pulls the item toward them", () => {
  const r = applyRating({ ...base, level: 40, itemDifficulty: 20, verdict: "just_right" });
  gt(r.level, 40, "level");
  gt(r.itemDifficulty, 20, "item should move up toward the user's 40");
  lt(r.itemDifficulty, 40, "but not past them");
});

console.log("\n=== evidence scaling: bailing early is weak evidence ===");
t("90 seconds moves less than 40 minutes", () => {
  const short = applyRating({ ...base, verdict: "too_hard", minutes: 1.5 });
  const long = applyRating({ ...base, verdict: "too_hard", minutes: 40 });
  lt(Math.abs(short.level - 30), Math.abs(long.level - 30), "short should move less");
});
t("evidenceWeight has a floor and a ceiling", () => {
  eq(evidenceWeight(0), 0.25, "floor"); eq(evidenceWeight(1000), 1, "ceiling");
});

console.log("\n=== confidence damping on item difficulty ===");
t("a confident item moves less than an unconfident one", () => {
  const unsure = applyRating({ ...base, verdict: "too_hard", itemConfidence: 0.1 });
  const sure = applyRating({ ...base, verdict: "too_hard", itemConfidence: 0.9 });
  gt(unsure.itemDifficulty - 30, sure.itemDifficulty - 30, "unsure should move more");
});
t("confidence rises with each rating", () => {
  const r = applyRating({ ...base, verdict: "just_right", itemConfidence: 0.3 });
  gt(r.itemConfidence, 0.3);
});

console.log("\n=== decaying learning rate keeps the level from oscillating ===");
t("the 100th rating moves the level less than the 1st", () => {
  const first = applyRating({ ...base, verdict: "too_easy", ratingCount: 0 });
  const late = applyRating({ ...base, verdict: "too_easy", ratingCount: 100 });
  gt(first.level - 30, late.level - 30);
});
t("learningRate decays monotonically", () => {
  lt(learningRate(50), learningRate(10)); lt(learningRate(10), learningRate(0));
});
t("alternating too_easy/too_hard converges rather than diverging", () => {
  let s = { level: 30, ratingCount: 0 };
  for (let i = 0; i < 200; i++) {
    const r = applyRating({ ...base, level: s.level, ratingCount: s.ratingCount, verdict: i % 2 ? "too_hard" : "too_easy" });
    s = { level: r.level, ratingCount: r.ratingCount };
  }
  if (!(s.level > 20 && s.level < 70)) throw new Error("level ran away to " + s.level.toFixed(1));
});

console.log("\n=== clamping ===");
t("level cannot exceed 100", () => {
  let lvl = 99;
  for (let i = 0; i < 50; i++) lvl = applyRating({ ...base, level: lvl, verdict: "too_easy" }).level;
  if (lvl > 100) throw new Error("got " + lvl);
});
t("level cannot go below 0", () => {
  let lvl = 1;
  for (let i = 0; i < 50; i++) lvl = applyRating({ ...base, level: lvl, verdict: "lost" }).level;
  if (lvl < 0) throw new Error("got " + lvl);
});
t("item difficulty is clamped too", () => {
  const hi = applyRating({ ...base, itemDifficulty: 99, itemConfidence: 0, verdict: "lost" });
  const lo = applyRating({ ...base, itemDifficulty: 1, itemConfidence: 0, verdict: "too_easy" });
  if (hi.itemDifficulty > 100 || lo.itemDifficulty < 0) throw new Error("unclamped");
});
t("an unknown verdict is a no-op", () => {
  const r = applyRating({ ...base, verdict: "nonsense" });
  eq(r.level, 30); eq(r.itemDifficulty, 30);
});

console.log("\n=== seeding the level from the deck ===");
t("more known words means a higher start", () => {
  const few = seedLevelsFromDeck(Array.from({ length: 20 }, () => ({ seen: 2, correct: 2 })));
  const many = seedLevelsFromDeck(Array.from({ length: 600 }, () => ({ seen: 2, correct: 2 })));
  gt(many.listening, few.listening); gt(many.reading, few.reading);
});
t("listening starts below reading", () => {
  const s = seedLevelsFromDeck(Array.from({ length: 375 }, () => ({ seen: 2, correct: 2 })));
  lt(s.listening, s.reading);
});
t("unstudied and badly-missed cards don't count as known", () => {
  const s = seedLevelsFromDeck([...Array.from({ length: 500 }, () => ({ seen: 0, correct: 0 })),
                                ...Array.from({ length: 500 }, () => ({ seen: 10, correct: 1 }))]);
  near(s.listening, 5, 0.01, "should be the floor");
});
t("a JPN 101 student mid-volume-1 lands on the beginner CI band", () => {
  // 375 solid words is roughly where the real deck sits. The core active band is
  // level-3..level+6, and that has to contain the true-beginner sources (difficulty 12-18)
  // rather than the intermediate ones — this is the assertion that actually protects the
  // user from an hour of not understanding anything.
  const s = seedLevelsFromDeck(Array.from({ length: 375 }, () => ({ seen: 2, correct: 2 })));
  const lo = s.listening - 3, hi = s.listening + 6;
  if (!(12 >= lo && 12 <= hi)) throw new Error(`beginner CI (12) outside core band ${lo.toFixed(1)}-${hi.toFixed(1)}`);
  if (25 >= lo && 25 <= hi) throw new Error("intermediate podcast (25) should be a stretch, not core");
});

console.log("\n=== seeded shuffle is deterministic ===");
t("same seed gives the same order, different seed doesn't", () => {
  const a = seededShuffle([1,2,3,4,5,6,7,8], 42).join();
  const b = seededShuffle([1,2,3,4,5,6,7,8], 42).join();
  const c = seededShuffle([1,2,3,4,5,6,7,8], 43).join();
  eq(a, b, "same seed"); if (a === c) throw new Error("different seeds gave same order");
});
t("shuffle preserves every element", () => {
  const out = seededShuffle([1,2,3,4,5], 7).sort().join();
  eq(out, "1,2,3,4,5");
});

console.log("\n=== vocab coverage against the deck ===");
t("a text made only of known words is ~100%", () => {
  const cards = [{ term: "私" }, { term: "日本語" }, { term: "勉強" }];
  const c = coverageAgainstDeck("私日本語勉強", cards);
  eq(c.pct, 100);
});
t("unknown words drag the percentage down and get surfaced", () => {
  const cards = [{ term: "私" }];
  const c = coverageAgainstDeck("私猫犬鳥", cards);
  lt(c.pct, 100);
  if (!c.unknown.length) throw new Error("should surface unknown words");
});
t("punctuation and latin are ignored", () => {
  const cards = [{ term: "私" }];
  eq(coverageAgainstDeck("私、。 abc123", cards).pct, 100);
});
t("longest match wins over a shorter prefix", () => {
  const cards = [{ term: "日" }, { term: "日本語" }];
  eq(coverageAgainstDeck("日本語", cards).pct, 100, "should match 日本語 whole, not 日 + unknown");
});
t("empty text returns null rather than crashing", () => {
  eq(coverageAgainstDeck("", []), null);
});
t("inflection after a known word is not counted as unknown vocabulary", () => {
  const cards = [{ term: "勉強" }];
  const c = coverageAgainstDeck("勉強しました", cards);
  eq(c.pct, 100, "勉強 + しました is one word you know, inflected");
  eq(c.unknown.length, 0);
});
t("a particle after a known word doesn't count against you", () => {
  eq(coverageAgainstDeck("私は", [{ term: "私" }]).pct, 100);
});
t("an unknown kanji word absorbs its okurigana into one gap", () => {
  const c = coverageAgainstDeck("難しかったですが", []);
  eq(c.unknown.length, 1, "should be one gap, not two");
  eq(c.unknown[0].w, "難", "surfaces the kanji, not the inflection");
});
t("a known word inside a longer kanji run is still found", () => {
  const c = coverageAgainstDeck("東京大学", [{ term: "大学" }]);
  eq(c.pct, 50, "東京 unknown + 大学 known");
  eq(c.unknown[0].w, "東京");
});
t("kana vocabulary you don't know still counts as a gap", () => {
  const c = coverageAgainstDeck("とても", []);
  eq(c.pct, 0); eq(c.unknown[0].w, "とても");
});
t("dictionary forms in the deck match inflected text", () => {
  eq(coverageAgainstDeck("面白かったです", [{ term: "面白い" }]).pct, 100, "い-adj");
  eq(coverageAgainstDeck("食べました", [{ term: "食べる" }]).pct, 100, "verb");
  eq(coverageAgainstDeck("勉強しています", [{ term: "勉強する" }]).pct, 100, "する-verb");
});
t("short kana words don't get a stem that matches stray characters", () => {
  // いい -> い would otherwise mark every stray い as known
  eq(coverageAgainstDeck("いちご", [{ term: "いい" }]).pct, 0);
});
t("a realistic sentence scores in a believable range", () => {
  const cards = ["私", "今日", "大学", "日本語", "勉強", "とても", "面白い"].map((t) => ({ term: t }));
  const c = coverageAgainstDeck("私は今日、大学で日本語を勉強しました。とても難しかったですが、面白かったです。", cards);
  // one genuine gap (難しい) out of eight content words
  if (!(c.pct >= 80 && c.pct <= 95)) throw new Error("expected 80-95%, got " + c.pct);
  eq(c.unknown.map((u) => u.w).join(","), "難");
});

// ── recommender: feed-backed sources must win the slots ──
const RECO = await (async () => {
  const code2 = [
    "const clamp100 = (n) => Math.max(0, Math.min(100, n));",
    grab("seededShuffle", "function"),
    grab("recommend", "function"),
    "export { recommend };",
  ].join("\n");
  return (await import("data:text/javascript;base64," + Buffer.from(code2).toString("base64"))).recommend;
})();

console.log("\n=== recommender prefers sources it can resolve to one episode ===");
const mk = (id, difficulty, feed) => ({ id, difficulty, medium: "reading", tags: [], _feed: feed });
const CAT = [mk("f1", 20, 1), mk("f2", 24, 1), mk("f3", 28, 1), mk("n1", 21, 0), mk("n2", 25, 0), mk("n3", 29, 0)];
const PREF = new Set(["f1", "f2", "f3"]);
t("all three slots go to feed-backed sources when enough exist", () => {
  const r = recommendWrap({ catalog: CAT, level: 22, preferred: PREF });
  const feedless = r.filter((x) => !PREF.has(x.id));
  if (feedless.length) throw new Error("got feedless picks: " + feedless.map((x) => x.id).join(","));
});
t("feedless sources still fill in when there aren't enough", () => {
  const thin = [mk("f1", 20, 1), ...CAT.filter((c) => c.id.startsWith("n"))];
  const r = recommendWrap({ catalog: thin, level: 22, preferred: new Set(["f1"]) });
  if (r.length < 2) throw new Error("should still return options, got " + r.length);
  if (r[0].id !== "f1") throw new Error("the one feed-backed source should lead, got " + r[0].id);
});
function recommendWrap({ catalog, level, preferred }) {
  return RECO({ catalog, level, mode: "active", medium: "reading", minutes: 15,
                history: [], tagScores: {}, seed: 3, preferred });
}

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} tests passed`);
process.exit(fail ? 1 : 0);
