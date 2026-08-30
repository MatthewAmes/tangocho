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
   readings and returns term → [occurrence].

   ONE RECORD SHAPE, TWO PRODUCERS. The scripts are not the only place a word occurs: the
   BYU glossary lists a word again every time the book teaches it again, and the importer
   now hands those rows over instead of dropping them (MP-02). Both producers emit the same
   four fields, so a consumer asking "where does this word appear" merges the two lists
   without knowing which is which:

     { term, source, act, scene, ...where }

       source   "script" or "glossary" — WHICH KIND of place, so a caller that does care
                can tell them apart instead of guessing from the extra fields.
       act/scene  the textbook coordinates, derived the same way for both: a script gets
                them from provenanceOfScript, a glossary row from its own act and scene
                columns. Either may be null, and null means unknown, never zero.
       where    the fields only that kind has — scriptId/lineIdx for a script line,
                section for a glossary row.

   `term` rides on every record even though the index is keyed by term, because a flat list
   of occurrences is the shape the importer produces and `mergeOccurrences` accepts. A
   record that only means something once you know which key it was filed under is a record
   that cannot be passed anywhere.

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
import { CONJ_BANK } from "../src/data/conj-bank.js";
import { SKILLS, skillForFormat } from "./learner.mjs";
import { buildClozeIndex } from "./cloze.mjs";

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

/* ── where the learner has got to ──
   Curriculum position, which is not mastery (§4, §21) and not a setting either. The act a
   practice mode should focus on is a fact about what has actually been answered, so it is
   derived rather than typed in — a position the learner has to remember to update is a
   position that will be wrong by the second week.

   "Latest act with any evidence" is the spec's rule and this is exactly that, with one
   deliberate widening: evidence means EITHER a row in the evidence log OR a card the deck
   itself records as seen. The log is younger than the deck — it only carries rows from the
   day it was added — so an act studied before then would otherwise read as never reached,
   and the mode would send Matthew back to Act 1.

   The sharp edge, stated rather than smoothed over: one answer is enough. Drilling a single
   Act 12 card out of curiosity moves the current act to 12 and stays there. That is what
   "furthest reached" means, and the honest fix is the explicit override the caller keeps —
   not a threshold here that would silently disagree with the phrase it implements.

   Unplaced cards never vote (see the header): a card with no act contributes nothing rather
   than being guessed into one. Returns null when nothing has been studied at all. */
export function currentAct(evidence = [], cards = [], opts = {}) {
  const actOfId = new Map();
  for (const card of cards || []) {
    if (!card || card.id == null) continue;
    const { act } = provenanceOf(card, opts);
    if (act !== null) actOfId.set(card.id, act);
  }

  let latest = null;
  const reached = (act) => { if (act !== null && (latest === null || act > latest)) latest = act; };
  // The deck's own history first: `seen` is lifetime and survives an evidence log that does not.
  for (const card of cards || []) if (card && (card.seen > 0 || card.rseen > 0)) reached(actOfId.get(card.id) ?? null);
  for (const row of evidence || []) if (row && row.id != null) reached(actOfId.get(row.id) ?? null);
  return latest;
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

/* The kinds of place a word can occur. Both are real sources in this repo; there is no
   catch-all, so a third producer has to name itself here before it can be merged. */
export const OCCURRENCE_SOURCES = ["script", "glossary"];

/* term → [occurrence], in script and line order. One entry per line even when the term and
   its reading both match — this counts places, not matches.

   Each record carries the act and scene of the SCRIPT it was found in, so a script hit and
   a glossary row can be compared without the caller re-deriving either. */
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
    // Once per script, not once per line: the position is a property of the dialogue.
    const { act, scene } = provenanceOfScript(script);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const { surface, kana } = lineForms(lines[lineIdx]);
      if (!surface) continue;
      for (const [term, reading] of wanted) {
        if (!surface.includes(term) && !(reading && kana.includes(reading))) continue;
        if (!index.has(term)) index.set(term, []);
        index.get(term).push({ term, source: "script", act, scene, scriptId, lineIdx });
      }
    }
  }
  return index;
}

/* Fold any number of occurrence lists into one term → [occurrence] index.

   Accepts either producer's output shape: a Map already keyed by term (buildOccurrenceIndex)
   or a flat array of records (what parseGlossary returns). Both carry `term` on the record,
   so the flat case needs no extra argument saying what it is a list of.

   Ordered by curriculum position, which is what makes a merged list readable as a history:
   the first entry is where the book introduced the word and the last is the furthest it is
   still being used. The sort is stable, so line order inside one script survives, and an
   occurrence with no position sorts last rather than being dropped — an unplaced hit is
   still a place the word appears. */
export function mergeOccurrences(...lists) {
  const out = new Map();
  const add = (occ) => {
    if (!occ || !occ.term) return;
    if (!out.has(occ.term)) out.set(occ.term, []);
    out.get(occ.term).push(occ);
  };
  for (const list of lists) {
    if (!list) continue;
    if (list instanceof Map) { for (const group of list.values()) for (const occ of group || []) add(occ); }
    else for (const occ of list) add(occ);
  }
  const rank = (occ) => { const i = curriculumIndex(occ); return i === null ? Infinity : i; };
  for (const group of out.values()) group.sort((a, b) => rank(a) - rank(b));
  return out;
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

/* Accepts a card, a script, a provenance record, an occurrence, or a section label written
   as a string ("3-5", or a script id "seed-3-5"). Returns { act, scene } with nulls for what
   is not known, so a caller never has to know which of the five it is holding. */
export function coordsOf(x) {
  if (x == null) return { act: null, scene: null };
  if (typeof x === "string") {
    const parsed = parseSection(x.replace(/^seed-/, ""));
    return { act: parsed ? parsed.act : null, scene: parsed ? parsed.scene : null };
  }
  if (typeof x !== "object") return { act: null, scene: null };
  if ("textbookId" in x) return { act: x.act ?? null, scene: x.scene ?? null };
  /* An occurrence already states its coordinates. Checked before the card branch below,
     because a glossary occurrence carries a `term` and provenanceOf would otherwise look it
     up in SECTION_MAP and answer about the wrong place entirely. */
  if (OCCURRENCE_SOURCES.includes(x.source)) return { act: x.act ?? null, scene: x.scene ?? null };
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

/* ── what an act asks the learner to be able to do (spec §5) ──

   "Learn these 30 words" is not an objective; it is an inventory. §5 wants the layer above
   it — recognise, recall, produce, comprehend, use — and it wants that layer DERIVED. An
   objective the source material cannot support is a promise the app breaks the moment
   someone tries to practise it, which is why every rule below is a gate on real data:

     vocabulary   the cards provenanceOf places in the act
     scripts      the dialogues provenanceOfScript places in the act
     grammar      the conj-bank entries whose dictionary form or reading IS one of those
                  cards — the bank carries no act of its own, so this term match is the
                  only honest way to say an act covers a conjugation pattern

   An act with no scripts gets NO script objectives. Acts 7–12 are exactly that case today
   (all 34 scripts are Acts 2–6), and it is the case the test pins down: the shape of the
   output has to change with the data or none of this is derived at all.

   ── the skills ──

   Every objective names one of learner.mjs's five SKILLS, so mastery per objective is the
   posterior mastery.mjs already computes for that skill over the act's items — no second
   scale, no new store. The skill is not asserted here: each objective names the FORMAT it
   is asked as, and the skill is skillForFormat() of that format. One table decides what an
   exercise measures, and it is the one the live evidence path uses.

   Two consequences worth stating rather than discovering:

   ORTHOGRAPHY IS NEVER AN OBJECTIVE. skillForFormat never returns it, because no exercise
   in the app produces evidence about spelling as such. It stays a SKILL — the model has a
   slot for it — and an objective claiming it would be measured by nothing.

   `produce_responses` names an ability the dialogues genuinely support and that today's
   script exercise does not yet measure: responseSelect is a choice among lines, which is
   why learner.mjs's FORMAT_MODES deliberately withholds `production` from it. The objective
   is about the learner, not about which screen exists this month; its posterior comes from
   production evidence wherever the act's words are actually produced. The gap is real and
   named, which is the difference between an honest objective and a fabricated one.

   Grammar gets recognise and construct, and NOT a third "use it in a sentence". The conj
   bank holds forms, not sentences, so nothing in the act's data could generate that
   exercise — and §5's whole point is that an objective with no material behind it should
   not appear. */

/* Kinds are the three bodies of material an act can contain. */
export const OBJECTIVE_KINDS = ["vocabulary", "script", "grammar"];

/* The typed objectives, in the order a learner meets them. `format` is the app format the
   objective is asked as and the only thing that decides `skill`; `unit` names what `items`
   counts, so a UI can say "38 cards" or "6 dialogues" without a second lookup. */
export const OBJECTIVE_TYPES = [
  { type: "recognize", kind: "vocabulary", format: "mc", unit: "cards",
    label: "Recognise the word among plausible neighbours" },
  { type: "recall_meaning", kind: "vocabulary", format: "recall", unit: "cards",
    label: "Recall what the word means" },
  { type: "recall_japanese", kind: "vocabulary", format: "type", unit: "cards",
    label: "Produce the Japanese from the English" },
  { type: "use_in_context", kind: "vocabulary", format: "cloze", unit: "cards",
    label: "Use the word in a sentence from the dialogues" },
  { type: "understand_dialogue", kind: "script", format: "listen_meaning", unit: "scripts",
    label: "Understand a dialogue line by ear" },
  { type: "recognize_phrases", kind: "script", format: "mc", unit: "scripts",
    label: "Recognise the act's phrases in the dialogue" },
  { type: "produce_responses", kind: "script", format: "type", unit: "scripts",
    label: "Produce a response that fits the dialogue" },
  { type: "recognize_form", kind: "grammar", format: "mc", unit: "forms",
    label: "Recognise the conjugated form" },
  { type: "construct_form", kind: "grammar", format: "type", unit: "forms",
    label: "Construct the form from the dictionary word" },
];

/* A sample small enough to read in a test failure and large enough to tell two objectives
   apart. Provenance is for tracing, not for re-deriving the objective. */
const SAMPLE = 3;

/* Every objective an act's own material supports. Pure: pass `opts.cards` / `opts.scripts`
   / `opts.conj` and a future volume is checked before it is merged into the deck.

   Returns [] for an act nothing places anything in — including act null, which is what
   currentAct returns for a learner who has answered nothing. */
export function deriveObjectives(act, opts = {}) {
  if (!Number.isFinite(act)) return [];
  const cards = opts.cards || SEED;
  const scripts = opts.scripts || SCRIPT_SEED;
  const conj = opts.conj || CONJ_BANK;

  const mine = (cards || []).filter((c) => provenanceOf(c, opts).act === act);
  const dialogues = (scripts || []).filter((s) => provenanceOfScript(s).act === act);

  /* Contextual material is cloze.mjs's own index, not a looser test of our own. It needs an
     English gloss on the line and it refuses a line that IS the word, so asking it is the
     difference between "the word appears in a dialogue" and "the app can build the
     exercise". The scripts searched are ALL of them: an Act 9 word used in an Act 3 dialogue
     still has a sentence to be practised in. */
  const context = buildClozeIndex(scripts || [], mine.map((c) => ({ id: c.term, term: c.term, reading: c.reading })));

  /* The conj bank carries no act. A pattern belongs to this act when the act teaches the
     word it is drilled on — nothing weaker, or every act would claim every pattern. */
  const forms = new Set();
  for (const c of mine) { if (c.term) forms.add(c.term); if (c.reading) forms.add(c.reading); }
  const grammar = (conj || []).filter((g) => g && (forms.has(g.dict) || forms.has(g.reading)));

  const withMeaning = mine.filter((c) => c && c.meaning);
  const typeable = mine.filter((c) => c && c.reading);
  const inContext = mine.filter((c) => context.has(c.term));
  const withLines = dialogues.filter((s) => (s.lines || []).length > 0);
  const translated = dialogues.filter((s) => (s.lines || []).some((l) => l && l.en));
  // A response needs something to respond TO, so a one-line dialogue supports no such drill.
  const conversational = dialogues.filter((s) => (s.lines || []).length >= 2);

  const backing = {
    recognize: mine,
    recall_meaning: withMeaning,
    recall_japanese: typeable,
    use_in_context: inContext,
    understand_dialogue: translated,
    recognize_phrases: withLines,
    produce_responses: conversational,
    recognize_form: grammar,
    construct_form: grammar,
  };

  const nameOf = (x) => x.term || x.dict || x.name || x.id || null;
  const out = [];
  for (const spec of OBJECTIVE_TYPES) {
    const items = backing[spec.type] || [];
    if (!items.length) continue;                 // no material, no objective — spec §5
    out.push({
      id: act + ":" + spec.type,
      act,
      kind: spec.kind,
      type: spec.type,
      label: spec.label,
      format: spec.format,
      skill: skillForFormat(spec.format),
      unit: spec.unit,
      items: items.length,
      /* Where the objective came from, in the same vocabulary provenanceOf uses. The act
         is a textbook act even for grammar — it is the CARDS that placed it — so the
         textbook is named and `sourceType` says which body of material was read. */
      provenance: {
        textbookId: TEXTBOOK_ID,
        volume: volumeOfAct(act),
        act,
        sourceType: spec.kind === "script" ? "script" : spec.kind === "grammar" ? "conj-bank" : "scene",
        sample: items.slice(0, SAMPLE).map(nameOf).filter(Boolean),
      },
    });
  }
  return out;
}

/* Mastery per objective, from the posteriors that already exist. `skills` is one scene's
   (or one act's) per-skill block from mastery.mjs — { recognition: { mean, measured } … }.

   Returns the objective with `mastered` and `measured` attached, and `mastered` is null
   rather than 0 when the skill has not been measured: an ability nobody has tested is not
   an ability at zero, and that distinction is the whole reason mastery.mjs gates on the
   posterior rather than on an answer count. */
export function objectiveMastery(objective, skills) {
  const row = objective && skills ? skills[objective.skill] : null;
  const measured = !!(row && row.measured);
  return { ...objective, measured, mastered: measured ? row.mean : null };
}

/* The skills an act's objectives actually reach. Useful on its own: a UI that shows five
   skill bars for an act whose material only supports three is inventing two of them. */
export function objectiveSkills(objectives = []) {
  const hit = new Set(objectives.map((o) => o.skill).filter(Boolean));
  return SKILLS.filter((s) => hit.has(s));
}
