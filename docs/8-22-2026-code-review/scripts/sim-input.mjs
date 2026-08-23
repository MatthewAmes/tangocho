import path from "node:path"; import { fileURLToPath } from "node:url";
import fs from "node:fs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const src = fs.readFileSync(ROOT + "/JpnFlashcards.jsx", "utf8");
function grab(name, kind) {
  const start = src.indexOf(`${kind} ${name}`);
  if (start === -1) throw new Error("could not find " + name);
  let depth = 0, i = src.indexOf(kind === "const" ? "=" : "(", start), started = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") { depth++; started = true; }
    else if (c === "}" || c === "]" || c === ")") { depth--; if (started && depth === 0) { i++; break; } }
  }
  if (kind === "function") {
    let p = src.indexOf("(", start), pd = 0, j = p;
    for (; j < src.length; j++) { if (src[j] === "(") pd++; else if (src[j] === ")") { pd--; if (pd === 0) { j++; break; } } }
    let d = 0, begun = false;
    for (; j < src.length; j++) { if (src[j] === "{") { d++; begun = true; } else if (src[j] === "}") { d--; if (begun && d === 0) { j++; break; } } }
    return src.slice(start, j);
  }
  return src.slice(start, i) + ";";
}
const code = [
  grab("INPUT_VERDICTS", "const"), "const clamp100 = (n) => Math.max(0, Math.min(100, n));",
  grab("evidenceWeight", "function"), grab("learningRate", "function"), grab("applyRating", "function"),
  grab("seedLevelsFromDeck", "function"), grab("seededShuffle", "function"), grab("coverageAgainstDeck", "function"),
  grab("recommend", "function"), grab("unpackVideos", "function"), grab("INPUT_CATALOG", "const"), grab("FEED_SOURCES", "const"),
  grab("relDots", "function"), grab("INPUT_BANDS", "const"), grab("band", "function"),
  "export { applyRating, seedLevelsFromDeck, seededShuffle, coverageAgainstDeck, recommend, unpackVideos, INPUT_CATALOG, FEED_SOURCES, relDots, band, learningRate, evidenceWeight };",
].join("\n");
const M = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

// SEED via regex
const SEED = [];
for (const m of src.slice(0, src.indexOf("const uid =")).matchAll(/\{ term: "([^"]+)", reading: "([^"]+)", romaji: "([^"]*)", meaning: "((?:[^"\\]|\\.)*)", kind: "(\w+)"[^}]*?lesson: (\d+)(?:, sec: "([^"]+)")?/g)) {
  SEED.push({ term: m[1], reading: m[2], romaji: m[3], meaning: m[4], kind: m[5], lesson: +m[6], sec: m[7] });
}
console.log("SEED parsed:", SEED.length);
const videos = M.unpackVideos(JSON.parse(fs.readFileSync(ROOT + "/data/videos.json", "utf8")));
const catalog = [...M.INPUT_CATALOG, ...videos];
console.log("catalog size", catalog.length, "indexed", videos.length);

const scen = {
  "fresh device, empty deck": SEED.map((c) => ({ ...c, seen: 0, correct: 0 })),
  "JPN101 mid (375 known)": SEED.map((c, i) => ({ ...c, seen: i < 375 ? 2 : 0, correct: i < 375 ? 2 : 0 })),
  "realistic 503 studied @87%": SEED.map((c, i) => ({ ...c, seen: i < 503 ? 4 : 0, correct: i < 503 ? (i % 8 === 0 ? 1 : 4) : 0 })),
  "all 821 known": SEED.map((c) => ({ ...c, seen: 3, correct: 3 })),
};
for (const [name, deck] of Object.entries(scen)) {
  const lv = M.seedLevelsFromDeck(deck);
  console.log(`\n=== ${name}: listening ${lv.listening.toFixed(1)} (${M.band(lv.listening)[0]}), reading ${lv.reading.toFixed(1)} (${M.band(lv.reading)[0]})`);
  for (const [plan, mode, medium, minutes] of [["Listen 15", "active", "listening", 15], ["Listen 5", "active", "listening", 5], ["Read 15", "active", "reading", 15], ["Background 30", "passive", "listening", 30]]) {
    const level = lv[medium];
    for (const seed of [1, 8]) {
      const r = M.recommend({ catalog, level, mode, medium, minutes, history: [], tagScores: {}, seed, preferred: M.FEED_SOURCES });
      console.log(`  ${plan} seed${seed}: ` + r.map((it) => `[d${it.difficulty} c${Math.round((it.difficultyConfidence||0)*100)} ${it.audience||"-"} ${it.durationSec ? Math.round(it.durationSec/60)+"m" : "?"}] ${(it.title||"").slice(0,38)} <${it.channel||it.source}> ${M.relDots(it.difficulty, level).label}`).join("\n                   "));
    }
  }
}
// Kids share in what actually gets recommended across many seeds at 14.4
{
  const deck = scen["JPN101 mid (375 known)"]; const lv = M.seedLevelsFromDeck(deck);
  let kids = 0, n = 0, chanOnly = 0, captions = 0;
  for (let seed = 1; seed < 300; seed += 7) {
    const r = M.recommend({ catalog, level: lv.listening, mode: "active", medium: "listening", minutes: 15, history: [], tagScores: {}, seed, preferred: M.FEED_SOURCES });
    for (const it of r) { n++; if (it.audience === "kids") kids++; if (!it.indexed) chanOnly++; if (it.hasSubsJa) captions++; }
  }
  console.log(`\nover ${n} listen-15 picks at level ${lv.listening.toFixed(1)}: kids ${kids} (${Math.round(kids/n*100)}%), channel-level (non-indexed) ${chanOnly}, with JP captions ${captions}`);
}

// Coverage edge cases
console.log("\n=== coverage edge cases ===");
const cov = (t, terms) => { const c = M.coverageAgainstDeck(t, terms.map((x) => ({ term: x }))); return `${c.pct}% unknown=[${c.unknown.map(u=>u.w).join(",")}]`; };
console.log("これはペンです with deck [これ]:", cov("これはペンです", ["これ"]));
console.log("私はとても with deck [私]:", cov("私はとても", ["私"]));
console.log("私はとても with deck []:", cov("私はとても", []));
console.log("猫がすきです with deck [猫]:", cov("猫がすきです", ["猫"]));
console.log("NihonGO line 'それ、わかりますか？' vs full SEED:", cov("それ、わかりますか？", SEED.map(c=>c.term)));
const para = "今日は天気がいいですね。私は学校へ行きます。友達と昼ご飯を食べました。とてもおいしかったです。明日も勉強します。";
const cfull = M.coverageAgainstDeck(para, SEED);
console.log("simple paragraph vs full SEED:", cfull.pct + "%", cfull.unknown.map(u=>u.w).join(","));
// compare with the same text and NO kana bug: count kana words manually
console.log("NHK-easy-ish: 東京で大きな地震がありました。多くの人がけがをしました。 vs SEED:", (()=>{const c=M.coverageAgainstDeck("東京で大きな地震がありました。多くの人がけがをしました。", SEED); return c.pct+"% "+c.unknown.map(u=>u.w).join(",");})());

// Level dynamics: learner improves steadily, rates too_easy 30% of the time, just_right 60%, too_hard 10%
console.log("\n=== level dynamics ===");
let s = { level: 14.4, ratingCount: 0 };
const traj = [];
for (let i = 0; i < 150; i++) {
  const verdict = i % 10 < 3 ? "too_easy" : i % 10 < 9 ? "just_right" : "too_hard";
  const r = M.applyRating({ level: s.level, ratingCount: s.ratingCount, itemDifficulty: s.level, itemConfidence: 0.3, verdict, minutes: 15 });
  s = { level: r.level, ratingCount: r.ratingCount };
  if ([9, 24, 49, 99, 149].includes(i)) traj.push(`after ${i+1}: ${s.level.toFixed(1)}`);
}
console.log("30% too_easy / 60% just_right / 10% too_hard from 14.4 ->", traj.join(" | "));
console.log("per-rating step size of too_easy (20 min) at n=0,12,24,60,120:", [0,12,24,60,120].map(n => (4*M.evidenceWeight(20)*M.learningRate(n)).toFixed(2)).join(", "));
// all too_easy from 14 after 100 prior ratings
let lvl = 14; for (let i = 0; i < 30; i++) lvl = M.applyRating({ level: lvl, ratingCount: 100 + i, itemDifficulty: lvl, itemConfidence: 0.3, verdict: "too_easy", minutes: 15 }).level;
console.log("30 straight too_easy after 100 prior ratings, from 14 ->", lvl.toFixed(1));
