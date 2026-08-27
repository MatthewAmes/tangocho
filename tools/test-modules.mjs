// Import every extracted module on its own and actually run something in it.
//
//   node tools/test-modules.mjs
//
// This exists because of a bug the bundle could not show. esbuild emits an IIFE in which
// every module's code shares one function scope, so a module that references a name it
// never imported still resolves — to whichever module did import it. src/lib/input-engine.js
// used INPUT_BANDS and INPUT_VERDICTS without importing either; the app kept working, the
// bundle got SMALLER (one constant was tree-shaken because nothing "used" it any more),
// and nothing failed until the module was imported on its own.
//
// So: importing a module in isolation is the only thing that proves its imports are real.
// A bare import is not enough either — a free variable only throws when the code RUNS —
// so each module has to be exercised, not merely loaded.

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const ok = (cond, m) => { if (!cond) throw new Error(m || "expected truthy"); };

console.log("=== data modules load and are the right shape ===");
const seed = await import("../src/data/seed.js");
t("seed.js exports a non-empty SEED and a version", () => {
  ok(Array.isArray(seed.SEED) && seed.SEED.length > 1000, "SEED length " + (seed.SEED || []).length);
  ok(typeof seed.SEED_VERSION === "number");
  ok(seed.SEED.every((c) => c && typeof c.term === "string"), "every row has a term");
});
const scripts = await import("../src/data/scripts-seed.js");
t("scripts-seed.js exports passages with lines", () => {
  ok(Array.isArray(scripts.SCRIPT_SEED) && scripts.SCRIPT_SEED.length > 0);
  ok(scripts.SCRIPT_SEED.every((s) => Array.isArray(s.lines)));
});
const freq = await import("../src/data/freq-seed.js");
t("freq-seed.js rows are ranked from 1", () => {
  ok(freq.FREQ_SEED.length > 0);
  ok(freq.FREQ_SEED[0].rank === 1, "first rank " + freq.FREQ_SEED[0].rank);
});
const cat = await import("../src/data/input-catalog.js");
t("input-catalog.js exports the catalog, feed set and verdicts", () => {
  ok(cat.INPUT_CATALOG.length > 0 && cat.FEED_SOURCES.size > 0);
  ok(Object.keys(cat.INPUT_VERDICTS).length > 0);
  ok(cat.INPUT_BANDS.length > 0);
});
const conjBank = await import("../src/data/conj-bank.js");
t("conj-bank.js exports types, bank and filters", () => {
  // CONJ_TYPES is keyed BY type (ichidan/godan/irregular), not a list of them.
  ok(conjBank.CONJ_BANK.length > 0 && conjBank.CONJ_FILTERS.length > 0);
  ok(Object.keys(conjBank.CONJ_TYPES).length > 0);
});
const kanaTables = await import("../src/data/kana-tables.js");
t("kana-tables.js exports chart rows", () => {
  ok(kanaTables.KANA_BASE_ROWS.length > 0 && kanaTables.KANA_GROUPS.length > 0);
});
const sections = await import("../src/data/sections.js");
t("sections.js exports the section map and labels", () => {
  ok(Object.keys(sections.SECTION_MAP).length > 0);
  ok(Object.keys(sections.KIND_LABEL).length > 0);
});
const styles = await import("../src/styles.js");
t("styles.js is the stylesheet, and no interpolation survived the move", () => {
  ok(typeof styles.CSS === "string" && styles.CSS.length > 10000, "length " + (styles.CSS || "").length);
  ok(styles.CSS.includes(".tc-root"), "has the root rule");
  ok(!styles.CSS.includes("${"), "a template placeholder would mean a lost binding");
});

console.log("=== lib modules RUN standalone (this is the part that catches a missing import) ===");
const kana = await import("../src/lib/kana.js");
t("kana: katakana folds to hiragana", () => { ok(kana.kataToHira("カタカナ") === "かたかな"); });
t("kana: reading converts to romaji", () => { ok(kana.kanaToRomaji("かようび") === "kayoubi", kana.kanaToRomaji("かようび")); });
t("kana: canonR normalises before comparing", () => { ok(kana.canonR("KA YO U BI") === kana.canonR("kayoubi")); });
// fillMatch takes the EXERCISE, not a string: it checks the typed answer against the
// romaji, the reading and the answer, so any of the three spellings is accepted.
t("kana: fillMatch accepts the reading", () => { ok(kana.fillMatch({ reading: "ねこ", answer: "猫", romaji: "neko" }, "ねこ")); });
t("kana: fillMatch accepts the romaji spelling of the same word", () => { ok(kana.fillMatch({ reading: "かようび", answer: "火曜日", romaji: "kayoubi" }, "kayoubi")); });
t("kana: fillMatch rejects a different word", () => { ok(!kana.fillMatch({ reading: "ねこ", answer: "猫", romaji: "neko" }, "いぬ")); });

const conj = await import("../src/lib/conjugate.js");
t("conjugate: a godan verb inflects", () => {
  const r = conj.conjugate("のむ", "godan");
  ok(r && typeof r === "object", "got " + JSON.stringify(r));
});
t("conjugate: CONJ_FORMS is a non-empty list", () => { ok(conj.CONJ_FORMS.length > 0); });

const engine = await import("../src/lib/input-engine.js");
t("input-engine: applyRating runs — the case that was broken", () => {
  const r = engine.applyRating({ level: 30, ratingCount: 0, itemDifficulty: 30, itemConfidence: 0.3, verdict: "too_easy", minutes: 20 });
  ok(r && typeof r.level === "number", "got " + JSON.stringify(r));
  ok(r.level > 30, "too_easy should raise the level, got " + r.level);
});
t("input-engine: band() runs — the other case that was broken", () => {
  ok(typeof engine.bandName(30) === "string", "got " + engine.bandName(30));
});
t("input-engine: recommend() returns picks", () => {
  const mk = (id, difficulty) => ({ id, difficulty, medium: "reading", tags: [] });
  const r = engine.recommend({
    catalog: [mk("a", 20), mk("b", 24), mk("c", 28)], level: 22, mode: "active",
    medium: "reading", minutes: 15, history: [], tagScores: {}, seed: 1,
    allowReplay: true, preferred: new Set(),
  });
  ok(Array.isArray(r) && r.length > 0, "got " + JSON.stringify(r));
});
t("input-engine: coverageAgainstDeck scores a known sentence", () => {
  const cards = ["これ", "ペン", "猫", "好き", "は", "が", "で"].map((term) => ({ term }));
  ok(engine.coverageAgainstDeck("これはペンです。", cards).pct > 0);
});
t("input-engine: seedLevelsFromDeck returns both skills", () => {
  const l = engine.seedLevelsFromDeck([{ term: "猫", level: 3 }]);
  ok(typeof l.listening === "number" && typeof l.reading === "number");
});

// These two touch the browser, so what is asserted here is that they degrade rather than
// throw when there is no window — which is also what a first paint on a cold page needs.
const session = await import("../src/lib/session.js");
t("session: reads as null with no storage rather than throwing", () => {
  ok(session.loadSession() === null, "got " + session.loadSession());
});
const tts = await import("../src/lib/tts.js");
t("tts: imports with no window, and knows speech is unavailable", () => {
  ok(tts.TTS_OK === false, "TTS_OK should be false off-browser, got " + tts.TTS_OK);
  ok(typeof tts.speakJa === "function" && typeof tts.stopJa === "function");
});
t("tts: stopJa is safe to call with nothing playing", () => { tts.stopJa(); ok(true); });
t("tts: the audio singletons stay private to the module", () => {
  // If these ever became exports, the app could reassign them and the player would end up
  // with a second audio element that the stop path does not know about.
  ok(!("_ttsAudioEl" in tts) && !("_ttsToken" in tts), "TTS internals must not be exported");
});

console.log(`\nall ${run} module tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exit(fail ? 1 : 0);
