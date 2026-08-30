// Tests for curriculum provenance and the script occurrence index (tools/curriculum.mjs).
//
//   node tools/test-curriculum.mjs
//
// Two of these are load-bearing beyond their own assertion. The lesson -> act map is
// DERIVED from the deck, so if a future seed batch makes a lesson claim two acts the
// derivation is wrong and the test says so instead of quietly dropping the lesson. And the
// coverage figures are printed, not just asserted: the floors here are deliberately lower
// than today's numbers, so a regression shows up as a moved number rather than a pass.
import {
  provenanceOf, provenanceOfScript, parseSection, sourceTypeOf, volumeOfAct,
  buildLessonActs, actForLesson, buildOccurrenceIndex, occurrencesOf, lineForms,
  coordsOf, curriculumIndex, sameScene, sceneDistance, actDistance, currentAct,
  TEXTBOOK_ID, SCENES_PER_ACT, VOLUME_ACTS,
} from "./curriculum.mjs";
import { SEED } from "../src/data/seed.js";
import { SECTION_MAP } from "../src/data/sections.js";
import { SCRIPT_SEED } from "../src/data/scripts-seed.js";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const gte = (a, b, m) => { if (!(a >= b)) throw new Error(`${m || ""} expected ${a} >= ${b}`); };

console.log("=== section labels: act-scene, and everything that only looks like one ===");
t("an act-scene parses to its two numbers", () => {
  const p = parseSection("9-3");
  eq(p.act, 9); eq(p.scene, 3); eq(p.sceneLabel, "3");
});
t("a dated class day is NOT act 7", () => {
  // "7/20" is July 20th. A leading-digit rule without the hyphen would file eight cards
  // under act 7 and nobody would notice.
  eq(parseSection("7/20"), null);
  eq(sourceTypeOf("7/20"), "class-day");
});
t("manga pages and in-class labels parse as themselves, not as acts", () => {
  eq(parseSection("DB 8–9"), null);
  eq(sourceTypeOf("DB 8–9"), "manga");
  eq(sourceTypeOf("Culture talk"), "culture-talk");
  eq(sourceTypeOf("Class notes"), "class-notes");
});
t("a sub-section keeps its label but still has a numeric slot", () => {
  eq(parseSection("9-9R").scene, 9);
  eq(parseSection("9-9R").sceneLabel, "9R");
  eq(parseSection("3-2b").scene, 2);
});
t("a scene with no number has no slot, and does not fake one", () => {
  eq(parseSection("12-BTS 1").act, 12);
  eq(parseSection("12-BTS 1").scene, null);
});
t("the '#n' duplicate marker is not part of the section", () => {
  eq(parseSection("6-3#2").act, 6);
  eq(parseSection("6-3#2").scene, 3);
});
t("an unrecognised label is null rather than a catch-all bucket", () => {
  eq(sourceTypeOf("something new"), null);
  eq(sourceTypeOf(""), null);
  eq(sourceTypeOf(undefined), null);
});

console.log("=== volumes: acts 1-6 are Vol. 1, acts 7-12 are Vol. 2 ===");
t("the act ranges split the book where the importer does", () => {
  eq(volumeOfAct(1), 1); eq(volumeOfAct(6), 1);
  eq(volumeOfAct(7), 2); eq(volumeOfAct(12), 2);
  eq(volumeOfAct(13), null, "no act 13 exists;");
  eq(volumeOfAct(null), null);
});
t("the volume table is data a third volume can be appended to", () => {
  eq(VOLUME_ACTS.length, 2);
  ok(VOLUME_ACTS.every((v) => v.from <= v.to));
});
t("Vol. 2 is 792 cards — the same 792 tools/assign-emoji2.mjs was written for", () => {
  eq(SEED.filter((c) => provenanceOf(c).volume === 2).length, 792);
});

console.log("=== lesson -> act, derived from the deck rather than hard-coded ===");
const LESSON_ACTS = buildLessonActs(SEED);
t("every lesson that states an act states exactly one", () => {
  const claims = new Map();
  for (const c of SEED) {
    const p = parseSection(c.sec);
    if (!p || !Number.isFinite(c.lesson)) continue;
    if (!claims.has(c.lesson)) claims.set(c.lesson, new Set());
    claims.get(c.lesson).add(p.act);
  }
  const split = [...claims].filter(([, acts]) => acts.size > 1);
  eq(split.length, 0, `lessons claiming two acts: ${JSON.stringify(split.map(([l, a]) => [l, [...a]]))};`);
  eq(LESSON_ACTS.size, claims.size, "so nothing was dropped as ambiguous;");
});
t("the mapping never goes backwards as lessons advance", () => {
  const lessons = [...LESSON_ACTS.keys()].sort((a, b) => a - b);
  ok(lessons.every((l, i) => i === 0 || LESSON_ACTS.get(l) >= LESSON_ACTS.get(lessons[i - 1])),
    "monotonicity is what licenses the bracketing rule");
});
t("lesson 60 is act 7 — the importer's base of 60 for the acts 7-12 pull", () => {
  eq(LESSON_ACTS.get(60), 7);
  eq(LESSON_ACTS.get(65), 12);
});
t("a lesson bracketed by agreeing neighbours takes their act", () => {
  // Lessons 22 and 24 are entirely Culture talk / Class notes, so neither states an act.
  eq(LESSON_ACTS.has(22), false);
  eq(actForLesson(22, LESSON_ACTS), 3);
  eq(actForLesson(24, LESSON_ACTS), 3);
});
t("a lesson on an act boundary stays null rather than picking a side", () => {
  eq(actForLesson(40, LESSON_ACTS), null, "between act 5 and act 6;");
  eq(actForLesson(48, LESSON_ACTS), null, "in the act 6 -> act 7 gap;");
  eq(actForLesson(14, LESSON_ACTS), null, "below every mapped lesson;");
});

console.log("=== provenanceOf: every card gets a record ===");
t("all 1632 cards return a full record, with nulls rather than gaps", () => {
  const KEYS = ["textbookId", "volume", "act", "scene", "sourceType", "lesson", "section", "via"];
  let bad = 0;
  for (const c of SEED) {
    const p = provenanceOf(c);
    if (!p || KEYS.some((k) => !(k in p))) bad++;
  }
  eq(bad, 0, `cards with an incomplete record: ${bad};`);
  eq(SEED.length, 1632, "deck size — update the coverage floors below if this moves;");
});
t("junk in does not throw", () => {
  eq(provenanceOf(null).act, null);
  eq(provenanceOf(undefined).textbookId, null);
  eq(provenanceOf({}).via, null);
  eq(provenanceOf("card").section, null);
});
t("a card's own sec beats the term-keyed map when a word is taught twice", () => {
  // SECTION_MAP is keyed by TERM, so it records where a word is FIRST taught. うち, あとで
  // and 何か come back later with a new sense, and those cards carry their own sec. This is
  // the only place the precedence is exercised, so it is the only place it can regress.
  const clash = SEED.filter((c) => c.sec && SECTION_MAP[c.term]
    && String(c.sec).replace(/#\d+$/, "") !== SECTION_MAP[c.term]);
  gte(clash.length, 1, "if this ever hits zero the precedence stops being tested;");
  for (const c of clash) {
    const p = provenanceOf(c);
    eq(p.via, "sec", `${c.term};`);
    eq(p.act, parseSection(c.sec).act, `${c.term} took the map's act instead of its own;`);
  }
});
t("SECTION_MAP is Act 2 of Volume 1 — not Volume 2", () => {
  const acts = new Set(Object.values(SECTION_MAP).map((s) => parseSection(s).act));
  eq(acts.size, 1); eq([...acts][0], 2);
  const card = SEED.find((c) => !c.sec && SECTION_MAP[c.term]);
  const p = provenanceOf(card);
  eq(p.act, 2); eq(p.volume, 1); eq(p.via, "section-map");
});
t("an out-of-textbook card reports no textbook rather than a borrowed act", () => {
  const manga = SEED.find((c) => c.sec && String(c.sec).startsWith("DB "));
  const p = provenanceOf(manga);
  eq(p.sourceType, "manga");
  eq(p.act, null); eq(p.volume, null); eq(p.textbookId, null);
});
t("a placed card names the textbook", () => {
  const p = provenanceOf(SEED.find((c) => c.sec === "9-3"));
  eq(p.textbookId, TEXTBOOK_ID);
  eq(p.act, 9); eq(p.scene, 3); eq(p.volume, 2); eq(p.via, "sec");
});
t("textbookId is set exactly when the act is known", () => {
  const wrong = SEED.filter((c) => {
    const p = provenanceOf(c);
    return (p.act === null) !== (p.textbookId === null);
  });
  eq(wrong.length, 0);
});
t("the lesson-act fallback never contradicts a card that states its own act", () => {
  const wrong = SEED.filter((c) => {
    const stated = parseSection(c.sec);
    return stated && actForLesson(c.lesson, LESSON_ACTS) !== null
      && actForLesson(c.lesson, LESSON_ACTS) !== stated.act;
  });
  eq(wrong.length, 0);
});
t("caller-supplied tables let a future volume be checked before it is merged", () => {
  const p = provenanceOf({ term: "新語", lesson: 99 }, {
    sectionMap: { 新語: "14-2" }, lessonActs: new Map(),
  });
  eq(p.act, 14); eq(p.scene, 2);
  eq(p.volume, null, "act 14 is in no volume the repo knows about yet;");
});

console.log("=== coverage — printed so a gap cannot go quiet ===");
const byVia = {};
for (const c of SEED) { const v = provenanceOf(c).via || "unplaced"; byVia[v] = (byVia[v] || 0) + 1; }
const placed = SEED.length - (byVia.unplaced || 0);
const pct = (placed / SEED.length * 100).toFixed(1);
console.log(`  ${placed}/${SEED.length} cards resolve to an act (${pct}%)`);
for (const [via, n] of Object.entries(byVia).sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(5)}  ${via}`);
const unplacedBy = {};
for (const c of SEED) if (provenanceOf(c).act === null) { const k = c.sec || "(no section)"; unplacedBy[k] = (unplacedBy[k] || 0) + 1; }
console.log("  unplaced by label: " + JSON.stringify(unplacedBy));

t("act coverage clears its floor", () => {
  // Today: 1540 (94.4%). The floor is below that on purpose — it is a regression guard,
  // not a claim that 92 unplaced cards are acceptable.
  gte(placed, 1500, `only ${placed} cards placed;`);
});
t("every derivation rule is actually earning its place", () => {
  for (const via of ["sec", "section-map", "lesson-act", "lesson-range"]) {
    gte(byVia[via] || 0, 1, `rule "${via}" placed nothing — dead code or a broken rule;`);
  }
});
t("the unplaced cards are only the sources the book does not cover", () => {
  const kinds = new Set(SEED.filter((c) => provenanceOf(c).act === null).map((c) => sourceTypeOf(c.sec)));
  ok([...kinds].every((k) => k === null || k === "class-day" || k === "manga"),
    `unexpected unplaced source types: ${JSON.stringify([...kinds])}`);
});

console.log("=== scripts carry provenance too ===");
t("a script id encodes its act and scene", () => {
  const p = provenanceOfScript(SCRIPT_SEED.find((s) => s.id === "seed-4-2"));
  eq(p.act, 4); eq(p.scene, 2); eq(p.volume, 1);
  eq(p.sourceType, "script"); eq(p.textbookId, TEXTBOOK_ID);
});
t("the cleaner name field wins over an id that spells the scene differently", () => {
  // id "seed-3-2b" / name "3-2 drill" — both mean act 3 scene 2.
  eq(provenanceOfScript(SCRIPT_SEED.find((s) => s.id === "seed-3-2b")).scene, 2);
  eq(provenanceOfScript(SCRIPT_SEED.find((s) => s.id === "seed-3-5-drill")).scene, 5);
});
t("the 34 scripts are Acts 2-6, i.e. all of Volume 1", () => {
  const acts = new Set(SCRIPT_SEED.map((s) => provenanceOfScript(s).act).filter((a) => a !== null));
  eq([...acts].sort((a, b) => a - b).join(","), "2,3,4,5,6");
  eq(SCRIPT_SEED.length, 34);
});
t("the one script with no act says so, and keeps its source type", () => {
  const p = provenanceOfScript(SCRIPT_SEED.find((s) => s.id === "seed-culture-talk"));
  eq(p.act, null); eq(p.textbookId, null); eq(p.sourceType, "culture-talk");
});
t("junk in does not throw", () => { eq(provenanceOfScript(null).act, null); });

console.log("=== occurrence index: one entity, many occurrences ===");
t("a line flattens two ways so kanji and kana cards both match", () => {
  const line = { tokens: [{ t: "はい、" }, { t: "大丈夫", r: "だいじょうぶ" }, { t: "です。" }] };
  eq(lineForms(line).surface, "はい、大丈夫です。");
  eq(lineForms(line).kana, "はい、だいじょうぶです。");
});
t("a card stored as kana is found through the ruby reading", () => {
  const idx = buildOccurrenceIndex(
    [{ id: "s1", lines: [{ tokens: [{ t: "頑張", r: "がんば" }, { t: "ります。" }] }] }],
    [{ term: "がんばります", reading: "がんばります" }],
  );
  eq((idx.get("がんばります") || []).length, 1);
});
t("a term matching twice on one line is one occurrence, not two", () => {
  const idx = buildOccurrenceIndex(
    [{ id: "s1", lines: [{ tokens: [{ t: "大丈夫", r: "だいじょうぶ" }, { t: "です。" }] }] }],
    [{ term: "大丈夫", reading: "だいじょうぶ" }],
  );
  eq(idx.get("大丈夫").length, 1, "surface and reading both hit the same line;");
});
t("single characters are skipped — a particle sits inside almost every line", () => {
  const idx = buildOccurrenceIndex(SCRIPT_SEED, [{ term: "か", reading: "か" }, { term: "ね", reading: "ね" }]);
  eq(idx.size, 0);
});

const INDEX = buildOccurrenceIndex(SCRIPT_SEED, SEED);
let pairs = 0;
for (const list of INDEX.values()) pairs += list.length;
const scriptLines = SCRIPT_SEED.reduce((n, s) => n + s.lines.length, 0);
const mapped = Object.keys(SECTION_MAP).filter((term) => INDEX.has(term)).length;
console.log(`  ${pairs} term->line links across ${INDEX.size} terms and ${scriptLines} script lines`);
console.log(`  ${mapped}/${Object.keys(SECTION_MAP).length} SECTION_MAP terms appear in a script`);

t("the index links at least 50 term->line pairs (the issue's floor)", () => { gte(pairs, 50); });
t("and does not quietly collapse to the floor", () => {
  // Today: 857 links over 305 terms. A drop to 60 would still clear the line above.
  gte(pairs, 600, `only ${pairs} links;`);
  gte(INDEX.size, 200, `only ${INDEX.size} terms;`);
});
t("a meaningful share of the Act 2 vocabulary is used in the Act 2 dialogues", () => {
  gte(mapped, 50, `only ${mapped} SECTION_MAP terms occur;`);
});
t("every occurrence points at a real line", () => {
  const scripts = new Map(SCRIPT_SEED.map((s) => [s.id, s]));
  for (const [term, list] of INDEX) {
    for (const o of list) {
      const script = scripts.get(o.scriptId);
      ok(script, `${term}: unknown script ${o.scriptId}`);
      ok(o.lineIdx >= 0 && o.lineIdx < script.lines.length, `${term}: line ${o.lineIdx} out of range`);
    }
  }
});
t("occurrencesOf uses the deck's own scripts by default", () => {
  const hits = occurrencesOf("大丈夫");
  gte(hits.length, 1);
  eq(hits[0].scriptId, "seed-2-1", "the Act 2 Scene 1 script it is taught in;");
  eq(typeof hits[0].lineIdx, "number");
});
t("a word the dialogues never use reports nothing, not an error", () => {
  eq(occurrencesOf("存在しない単語").length, 0);
  eq(occurrencesOf(undefined).length, 0);
});
t("occurrences land in the act the word belongs to", () => {
  // The point of the index: 大丈夫 is one entity, and its occurrences carry the context.
  const card = SEED.find((c) => c.term === "大丈夫");
  const home = provenanceOf(card);
  const where = occurrencesOf("大丈夫").map((o) => provenanceOfScript(SCRIPT_SEED.find((s) => s.id === o.scriptId)));
  eq(home.act, 2);
  ok(where.some((p) => p.act === home.act), "at least one occurrence is in its own act");
});

console.log("=== scene helpers, for curriculum-aware distractors ===");
t("cards, scripts, records and plain strings all resolve the same way", () => {
  const card = SEED.find((c) => c.sec === "4-2");
  eq(coordsOf(card).act, 4);
  eq(coordsOf("4-2").scene, 2);
  eq(coordsOf("seed-4-2").scene, 2, "a script id is accepted too;");
  eq(coordsOf(provenanceOf(card)).act, 4);
  eq(coordsOf(SCRIPT_SEED.find((s) => s.id === "seed-4-2")).scene, 2);
  eq(coordsOf(null).act, null);
});
t("the curriculum ordinal orders correctly across an act boundary", () => {
  eq(curriculumIndex("4-2"), 4 * SCENES_PER_ACT + 2);
  ok(curriculumIndex("3-9") < curriculumIndex("4-0"));
});
t("sameScene is act AND scene", () => {
  eq(sameScene("4-2", "4-2"), true);
  eq(sameScene("4-2", "4-3"), false);
  eq(sameScene("4-2", "5-2"), false, "same scene number, different act;");
});
t("sameScene is false when either side is unplaced, never accidentally true", () => {
  const manga = SEED.find((c) => c.sec && String(c.sec).startsWith("DB "));
  eq(sameScene(manga, manga), false);
  eq(sameScene(null, null), false);
  eq(sameScene("12-BTS 1", "12-BTS 1"), false, "act 12 but no scene slot;");
});
t("two cards in one scene are distance 0; the next scene is 1", () => {
  eq(sceneDistance("4-2", "4-2"), 0);
  eq(sceneDistance("4-2", "4-5"), 3);
  eq(sceneDistance("4-2", "3-2"), SCENES_PER_ACT);
});
t("distance is symmetric and never negative", () => {
  eq(sceneDistance("3-1", "6-4"), sceneDistance("6-4", "3-1"));
  ok(sceneDistance("3-1", "6-4") > 0);
});
t("an unplaced scene gives null, not a flattering zero", () => {
  // Substituting a scene would make an unplaced card look adjacent to its whole act, and
  // a distractor picker would prefer that guess over a word whose position is real.
  eq(sceneDistance("Class notes", "4-2"), null);
  eq(sceneDistance("12-BTS 1", "12-3"), null);
  eq(sceneDistance(null, "4-2"), null);
});
t("actDistance still works where sceneDistance cannot", () => {
  eq(actDistance("12-BTS 1", "12-3"), 0);
  eq(actDistance("4-2", "7-1"), 3);
  eq(actDistance("DB 8–9", "4-2"), null);
});
t("real cards compare without the caller unpacking anything", () => {
  const a = SEED.find((c) => c.sec === "9-3");
  const b = SEED.find((c) => c.sec === "9-3" && c.term !== a.term);
  const far = SEED.find((c) => c.sec === "3-1");
  eq(sameScene(a, b), true);
  eq(sceneDistance(a, far), (9 - 3) * SCENES_PER_ACT + 2);
  ok(sceneDistance(a, b) < sceneDistance(a, far));
});

console.log("\n=== where the learner has got to ===");
// The deck a practice mode sees: four acts, so "latest" has somewhere to be wrong.
const posCards = [
  { id: "a2", term: "a2", sec: "2-1" },
  { id: "a3", term: "a3", sec: "3-4" },
  { id: "a9", term: "a9", sec: "9-2" },
  { id: "manga", term: "manga", sec: "DB 8–9" },       // unplaced: no act at all
];
t("nothing studied means nobody knows where you are", () => {
  eq(currentAct([], posCards), null);
  eq(currentAct(), null);
  eq(currentAct([], []), null);
});
t("the latest act with evidence wins, whatever order it arrives in", () => {
  eq(currentAct([{ id: "a9" }, { id: "a2" }], posCards), 9);
  eq(currentAct([{ id: "a2" }, { id: "a9" }], posCards), 9);
  eq(currentAct([{ id: "a2" }, { id: "a3" }], posCards), 3);
});
t("the deck's own history counts, because the evidence log is younger than the deck", () => {
  // An act studied before the log existed would otherwise read as never reached, and
  // Current Lesson would send a learner in Act 9 back to Act 1.
  eq(currentAct([], posCards.map((c) => (c.id === "a9" ? { ...c, seen: 4 } : c))), 9);
  // Production-only history counts too — rseen is still having met the word.
  eq(currentAct([], posCards.map((c) => (c.id === "a3" ? { ...c, rseen: 2 } : c))), 3);
  eq(currentAct([], posCards.map((c) => ({ ...c, seen: 0 }))), null);
});
t("an unplaced card never votes", () => {
  // 5.6% of the deck has no act. Letting a manga page or a dated class-day card pick one
  // would put the whole practice mode on a guess.
  eq(currentAct([{ id: "manga" }], posCards), null);
  eq(currentAct([{ id: "manga" }, { id: "a3" }], posCards), 3);
});
t("evidence for a card that is no longer in the deck is ignored", () => {
  eq(currentAct([{ id: "deleted" }], posCards), null);
  eq(currentAct([{ id: "deleted" }, { id: "a2" }], posCards), 2);
  eq(currentAct([null, {}, { id: null }, { id: "a2" }], posCards), 2);
});
t("one answer is enough to move it — the documented sharp edge", () => {
  // "Latest act with ANY evidence" is the spec's rule and this is it: drilling a single
  // Act 9 card out of curiosity moves the position and keeps it there. The override in
  // the plan is the fix, not a threshold here that would disagree with the phrase.
  eq(currentAct([{ id: "a9" }], posCards), 9);
});
t("the real deck places the learner somewhere real", () => {
  // SEED carries no ids — the app mints them on import — so the join is exercised the way
  // the app does it, over cards that already have one.
  const deck = SEED.map((c, i) => ({ ...c, id: "s" + i }));
  const upTo5 = deck.map((c) => (provenanceOf(c).act <= 5 ? { ...c, seen: 1 } : c));
  eq(currentAct([], upTo5), 5, "a deck studied through act 5 should report act 5");
  const oneNine = deck.find((c) => provenanceOf(c).act === 9);
  eq(currentAct([{ id: oneNine.id, at: 1 }], deck), 9, "one answered act-9 card places the learner in act 9");
});

console.log(`\nall ${run} curriculum tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exit(fail ? 1 : 0);
