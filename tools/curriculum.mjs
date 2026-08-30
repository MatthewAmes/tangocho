/* ── where an item lives in NihonGO NOW! ──
   The learner model answers "what can this person do with the word". This file answers the
   other half the mega prompt kept asking for: *where did this come from*. Nothing in the
   app could say "NihonGO NOW! Vol. 2, Act 9, Scene 3" about a card, which is what blocks
   curriculum-aware distractors, current-lesson practice modes and a per-act mastery view.

   Nothing here is invented. The taxonomy below was read off the data, and every rule is
   the narrowest one the data actually supports. What it cannot place, it reports as null.

   ── the taxonomy, as it really is ──

   NihonGO NOW! is VOLUME → ACT → SCENE. Three separate places in this repo hold a piece of
   that, and they turn out to be complementary rather than rival:

     card.sec         "3-1" … "12-9R" on 1406 of 1632 SEED cards — ACT-SCENE, written by
                      tools/import-nihongo.mjs, which builds it from the BYU glossary's own
                      act and scene columns. Also carries non-act labels (below).
     SECTION_MAP      133 terms → "2-1" … "2-8" in src/data/sections.js. These are Act 2
                      scenes, NOT volume 2. It is the hand-written fallback for the earliest
                      batch, which predates the field, and it covers exactly the cards that
                      have no card.sec of their own.
                      It is keyed by TERM, not by card, so it records where a word is first
                      taught. Three words (うち, あとで, 何か) are taught again later with a
                      new sense and their second card carries its own sec — 5-5, 5-6, 6-5.
                      The card's own sec therefore wins; the map is only ever a fallback.
     script id/name   "seed-2-1" … "seed-6-6" in src/data/scripts-seed.js — again ACT-SCENE.
                      The 34 scripts are Acts 2–6, i.e. all of Volume 1.

   ACTS 1–6 ARE VOLUME 1; ACTS 7–12 ARE VOLUME 2. Triangulated three ways: the importer's
   own act range for the Vol. 2 pull is 7–12 (its header and its CLI defaults); it stamped
   lessons from a base of 60, so lessons 60–65 are acts 7–12 one-for-one; and the 792 cards
   whose act is 7–12 are precisely the "792 NihonGO Volume 2 words" that tools/assign-emoji
   .mjs and assign-emoji2.mjs were written to fix. No act above 12 and none below 1 exists.

   SCENES ARE NUMBERED 0–9 within an act, with no exceptions in the data — so an act is ten
   scene slots wide, which is what makes a single curriculum ordinal possible (below).
   Scene 0 is the act's opening proverb; a trailing R ("9-9R") and the one "12-BTS 1" are
   sub-sections of a scene, kept in the label and stripped for the numeric position.

   LESSON IS NOT THE ACT. `lesson` is Matthew's own JPN 101 class-session number, 1–65, and
   it runs about three times faster than the acts do. But it is not noise either: among the
   cards that state an act, EVERY lesson maps to exactly ONE act, and the mapping rises
   monotonically with the lesson number. That makes lesson → act a real, checkable function
   of the data — derived here by `buildLessonActs`, never hard-coded — which is the only
   thing that can place a card whose section label is not an act-scene at all.

   Two gaps that mapping cannot close, and does not pretend to:
     - Lessons 22 and 24 contain ONLY "Culture talk" / "Class notes" cards, so neither
       lesson states an act anywhere. They are placed by bracketing: a lesson between two
       mapped lessons that agree takes their act. Lesson 40 (between act 5 and act 6) and
       lessons 47–59 (between act 6 and act 7) disagree at the brackets, so they stay null.
     - Lessons 1–17 have no act-scene card at all. Where SECTION_MAP does not name Act 2,
       the app's own `sectionOf` in JpnFlashcards.jsx treats lesson ≤ 6 as Act 1, and this
       module follows that convention rather than inventing a second one. Lessons 7–17
       outside SECTION_MAP (26 cards) stay null.

   NOT EVERY CARD IS TEXTBOOK MATERIAL. Section labels that are not act-scenes name real,
   distinct sources: "Culture talk" and "Class notes" (in-class material), "7/20"…"7/30"
   (dated class days — note the SLASH: parsing these as act 7 would be the obvious wrong
   answer) and "DB 8–9" (manga pages, outside the book entirely). `sourceType` records
   which, and `textbookId` is set only when the item was actually placed in the textbook —
   so a manga card reports a null textbook rather than a fictional act.

   Current coverage: 1540 of 1632 cards resolve to an act (94.4%). The 92 that do not are
   47 dated class-day cards, 19 manga cards and 26 cards in lessons 14 and 16. The test
   asserts a floor rather than a number, but it PRINTS the breakdown — a silent gap here
   would quietly narrow every curriculum-aware feature built on top.

   ── occurrences ──

   Spec §26: a word in three places is one knowledge entity with three occurrences, not
   three cards. `buildOccurrenceIndex` scans the 227 script lines for deck terms and their
   readings and returns term → [{scriptId, lineIdx}].

   This is deliberately NOT tools/cloze.mjs's index, which keys by card id, caps at four
   hits, needs an English gloss and drops lines that ARE the word — all correct for picking
   cloze material, all wrong for asking "where does this word appear". This one is complete
   and positional; cloze's is a curated sample.

   Single-character terms are skipped, the same rule and for the same reason as cloze.mjs:
   the particles か, ね, よ, が sit inside almost every line, and the script tokens are
   display chunks rather than morphemes, so a one-character substring match cannot tell a
   particle from a syllable of an unrelated word. 881 term→line links survive across 309
   terms, against 2130 links if the noise were counted. */

import { SEED } from "../src/data/seed.js";
import { SECTION_MAP } from "../src/data/sections.js";
import { SCRIPT_SEED } from "../src/data/scripts-seed.js";

export const TEXTBOOK_ID = "nihongo-now";

/* Scenes are numbered 0–9 throughout the data, so one act spans ten scene slots. This is
   the constant that lets an act-scene collapse to a single ordinal position. */
export const SCENES_PER_ACT = 10;

/* Inclusive act ranges. Volume 3 arrives as another row, not as a code change (spec §24). */
export const VOLUME_ACTS = [
  { volume: 1, from: 1, to: 6 },
  { volume: 2, from: 7, to: 12 },
];

export function volumeOfAct(act) {
  if (!Number.isFinite(act)) return null;
  const hit = VOLUME_ACTS.find((v) => act >= v.from && act <= v.to);
  return hit ? hit.volume : null;
}

/* "#n" only disambiguates duplicate seed rows in one scene — same convention as the app's
   sectionOf and cardMergeKey. It is not part of the section's identity. */
const stripDup = (label) => String(label == null ? "" : label).replace(/#\d+$/, "").trim();

/* Section labels that are act-scenes, and only those. The leading number must be followed
   by a HYPHEN: "7/20" is the class day of July 20th, not act 7. */
const ACT_SCENE = /^(\d+)-(.+)$/;

/* "DB 8–9" — manga pages, en dash or hyphen. Matches the app's own DB_SECTION. */
const MANGA = /^DB \d+(?:[–-]\d+)?$/;
const CLASS_DAY = /^\d+\/\d+$/;

/* Parse a section label into its textbook coordinates. Returns null for a label that names
   something other than an act-scene, so callers cannot mistake one for the other.

   `scene` is the numeric slot (0–9) and `sceneLabel` keeps what was written, because
   "9-9R" and "12-BTS 1" carry a sub-section that matters for display and must not be
   silently rounded away. A scene with no leading digit has no numeric slot. */
export function parseSection(label) {
  const m = ACT_SCENE.exec(stripDup(label));
  if (!m) return null;
  const act = parseInt(m[1], 10);
  if (!Number.isFinite(act)) return null;
  const sceneLabel = m[2].trim();
  const digits = /^(\d+)/.exec(sceneLabel);
  return { act, scene: digits ? parseInt(digits[1], 10) : null, sceneLabel };
}

/* What kind of source the label names. Every value here is a label form that exists in the
   data; there is no catch-all bucket that would hide a new one appearing. */
export function sourceTypeOf(label) {
  const s = stripDup(label);
  if (!s) return null;
  if (ACT_SCENE.test(s)) return "scene";
  if (MANGA.test(s)) return "manga";
  if (CLASS_DAY.test(s)) return "class-day";
  if (s === "Culture talk") return "culture-talk";
  if (s === "Class notes") return "class-notes";
  return null;
}

/* lesson → act, read off the cards that state both. A lesson claiming two different acts
   would mean the taxonomy is not what this file says it is, so it is dropped rather than
   guessed at — the test asserts that never happens. */
export function buildLessonActs(cards = SEED) {
  const claims = new Map();
  for (const card of cards || []) {
    if (!card || !Number.isFinite(card.lesson)) continue;
    const parsed = parseSection(card.sec);
    if (!parsed) continue;
    if (!claims.has(card.lesson)) claims.set(card.lesson, new Set());
    claims.get(card.lesson).add(parsed.act);
  }
  const out = new Map();
  for (const [lesson, acts] of claims) if (acts.size === 1) out.set(lesson, [...acts][0]);
  return out;
}

/* A lesson with no act of its own takes the act its neighbours agree on. Lessons are
   chronological and the act sequence never goes backwards, so a lesson bracketed by two
   mapped lessons in the SAME act is in that act too. Where the brackets disagree — the
   lesson sits on an act boundary — this returns null rather than picking a side. */
export function actForLesson(lesson, lessonActs) {
  const table = lessonActs || defaultLessonActs();
  if (!Number.isFinite(lesson)) return null;
  if (table.has(lesson)) return table.get(lesson);
  let below = null, above = null;
  for (const known of table.keys()) {
    if (known < lesson && (below === null || known > below)) below = known;
    if (known > lesson && (above === null || known < above)) above = known;
  }
  if (below === null || above === null) return null;
  return table.get(below) === table.get(above) ? table.get(below) : null;
}

let lessonActCache = null;
function defaultLessonActs() {
  if (!lessonActCache) lessonActCache = buildLessonActs(SEED);
  return lessonActCache;
}

/* Where a card sits in the textbook.

     { textbookId, volume, act, scene, sourceType, lesson, section, via }

   The first five are the contract from the issue; `lesson` and `section` echo the spec's
   lessonId / sectionId, and `via` names which rule placed the act so a caller — or a
   reviewer — can see how much the answer is worth. Everything unknown is null.

   `opts.sectionMap` / `opts.lessonActs` exist so a future volume can be provenance-checked
   against its own tables before it is merged into the deck (spec §24, MP-04). */
export function provenanceOf(card, opts = {}) {
  const empty = {
    textbookId: null, volume: null, act: null, scene: null,
    sourceType: null, lesson: null, section: null, via: null,
  };
  if (!card || typeof card !== "object") return empty;

  const sectionMap = opts.sectionMap || SECTION_MAP;
  const lessonActs = opts.lessonActs || defaultLessonActs();
  const lesson = Number.isFinite(card.lesson) ? card.lesson : null;

  // card.sec first: it is per-card, where SECTION_MAP is per-term and so cannot tell a
  // word's second teaching from its first. The order is load-bearing for three cards.
  const own = stripDup(card.sec);
  const mapped = own ? "" : stripDup(sectionMap[card.term]);
  const section = own || mapped || null;

  let act = null, scene = null, via = null;
  const parsed = parseSection(section);
  const byLesson = parsed ? null : actForLesson(lesson, lessonActs);
  if (parsed) {
    act = parsed.act;
    scene = parsed.scene;
    via = own ? "sec" : "section-map";
  } else if (byLesson !== null) {
    act = byLesson;
    via = "lesson-act";
  } else if (lesson !== null && lesson <= 6) {
    // The app's sectionOf calls these Act 1. Following it rather than adding a rival rule.
    act = 1;
    via = "lesson-range";
  }

  return {
    // Claimed only when the item was actually placed in the book. A manga card keeps its
    // sourceType and reports no textbook, instead of borrowing an act it never had.
    textbookId: act === null ? null : TEXTBOOK_ID,
    volume: volumeOfAct(act),
    act,
    scene,
    sourceType: sourceTypeOf(section),
    lesson,
    section,
    via,
  };
}

/* The same record for a script. `name` is the cleaner of the two fields ("3-2 drill" where
   the id says "seed-3-2b"), so it is read first and the id is the fallback. */
export function provenanceOfScript(script) {
  if (!script || typeof script !== "object") return provenanceOf(null);
  const fromName = parseSection(script.name);
  const label = fromName ? script.name : String(script.id || "").replace(/^seed-/, "");
  const parsed = fromName || parseSection(label);
  const act = parsed ? parsed.act : null;
  return {
    textbookId: act === null ? null : TEXTBOOK_ID,
    volume: volumeOfAct(act),
    act,
    scene: parsed ? parsed.scene : null,
    sourceType: parsed ? "script" : sourceTypeOf(script.name) || null,
    lesson: null,
    section: parsed ? stripDup(label) : stripDup(script.name) || null,
    via: script.id ? "script-id" : null,
  };
}

/* ── occurrences ── */

/* The plain Japanese of a line, and the same line with every ruby reading substituted for
   its kanji. A card whose term is written in kanji is found by the first; a card stored as
   kana ("だいじょうぶ") is found by the second, because the script writes it 大丈夫 with the
   reading hung off the token. */
export function lineForms(line) {
  const tokens = (line && line.tokens) || [];
  return {
    surface: tokens.map((tk) => tk.t || "").join(""),
    kana: tokens.map((tk) => tk.r || tk.t || "").join(""),
  };
}

/* term → [{ scriptId, lineIdx }], in script and line order. One entry per line even when
   the term and its reading both match — this counts places, not matches. */
export function buildOccurrenceIndex(scripts = SCRIPT_SEED, cards = SEED) {
  const wanted = new Map();
  for (const card of cards || []) {
    if (!card || !card.term || [...card.term].length < 2) continue;   // see header: particles
    if (wanted.has(card.term)) continue;
    // A kana card whose reading IS its term still needs the kana pass: the script writes
    // 頑張ります in kanji and hangs がんば off the token, so only the ruby form matches.
    const reading = card.reading || card.term;
    wanted.set(card.term, [...reading].length >= 2 ? reading : null);
  }

  const index = new Map();
  for (const script of scripts || []) {
    const scriptId = (script && script.id) || null;
    const lines = (script && script.lines) || [];
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const { surface, kana } = lineForms(lines[lineIdx]);
      if (!surface) continue;
      for (const [term, reading] of wanted) {
        if (!surface.includes(term) && !(reading && kana.includes(reading))) continue;
        if (!index.has(term)) index.set(term, []);
        index.get(term).push({ scriptId, lineIdx });
      }
    }
  }
  return index;
}

let occurrenceCache = null;
function defaultOccurrences() {
  if (!occurrenceCache) occurrenceCache = buildOccurrenceIndex(SCRIPT_SEED, SEED);
  return occurrenceCache;
}

/* Every place a term is spoken in the scripts. Empty for a word the dialogues never use —
   which is a fact about the curriculum, not a failure. */
export function occurrencesOf(term, index) {
  const idx = index || defaultOccurrences();
  return idx.get(term) || [];
}

/* ── scene comparison, for curriculum-aware distractors (spec §17) ── */

/* Accepts a card, a script, a provenance record, or a section label written as a string
   ("3-5", or a script id "seed-3-5"). Returns { act, scene } with nulls for what is not
   known, so a caller never has to know which of the four it is holding. */
export function coordsOf(x) {
  if (x == null) return { act: null, scene: null };
  if (typeof x === "string") {
    const parsed = parseSection(x.replace(/^seed-/, ""));
    return { act: parsed ? parsed.act : null, scene: parsed ? parsed.scene : null };
  }
  if (typeof x !== "object") return { act: null, scene: null };
  if ("textbookId" in x) return { act: x.act ?? null, scene: x.scene ?? null };
  const record = Array.isArray(x.lines) ? provenanceOfScript(x) : provenanceOf(x);
  return { act: record.act, scene: record.scene };
}

/* One ordinal for the whole curriculum: acts are ten scenes wide, so act 4 scene 2 is 42
   and the ordering across an act boundary comes out right. Null unless BOTH halves are
   known — substituting a scene for an unplaced card would make it look adjacent to
   everything in its act, and a distractor picker would then prefer that guess over a word
   whose position is real. */
export function curriculumIndex(x) {
  const { act, scene } = coordsOf(x);
  if (!Number.isFinite(act) || !Number.isFinite(scene)) return null;
  return act * SCENES_PER_ACT + scene;
}

export function sameScene(a, b) {
  const p = coordsOf(a), q = coordsOf(b);
  if (!Number.isFinite(p.act) || !Number.isFinite(p.scene)) return false;
  return p.act === q.act && p.scene === q.scene;
}

/* Distance in scenes. Null when either side is not fully placed — see curriculumIndex. */
export function sceneDistance(a, b) {
  const i = curriculumIndex(a), j = curriculumIndex(b);
  return i === null || j === null ? null : Math.abs(i - j);
}

/* The coarser comparison, for the "nearby acts" tier of distractor sourcing. Survives a
   card whose scene is unknown, which sceneDistance deliberately does not. */
export function actDistance(a, b) {
  const p = coordsOf(a), q = coordsOf(b);
  if (!Number.isFinite(p.act) || !Number.isFinite(q.act)) return null;
  return Math.abs(p.act - q.act);
}
