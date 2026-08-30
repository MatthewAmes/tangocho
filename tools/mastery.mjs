import { SKILLS, profileFrom, posterior, stateOf, confidenceFromPosterior, CONFIDENCE } from "./learner.mjs";
import { SECTION_MAP } from "../src/data/sections.js";
/* ── mastery by textbook scene ──
   Curriculum progress is not mastery. "You have reached Act 8" and "you can do Act 8" are
   different claims, and an app that shows one while implying the other is the thing this
   module exists to refuse. So every scene here carries TWO numbers that are never mixed:

     seen      how much of the scene you have met at all — a count of items with evidence
     mastered  what the learner model believes you can DO — posterior means, nothing else

   `seen` may be 100% while `mastered` is null. That is not a bug; it is the honest reading
   of "you went through the cards and we still do not know whether you can produce any of
   it". Cards-completed counts never enter the mastery figure, at any point.

   Pure: no storage, no clock of its own (pass `now`), no React. Tested in
   tools/test-mastery.mjs.

   ## Two windows, deliberately different

   `seen` is LIFETIME. Having met Act 3 in March is a fact about your progress through the
   book and does not expire. Mastery is windowed (60 days by default), because the question
   it answers is "can you do this now" — and a scene last touched half a year ago should
   read as "seen, no longer measured", which is exactly what the learner would want to know.

   ## What counts as measured

   A skill is `measured` when its posterior is narrow enough to mean something —
   `confidenceFromPosterior`, which learner.mjs itself prefers over a threshold on a raw
   count, because how much is known is a property of the estimate. Below that the skill
   reports CONFIDENCE.LOW ("still evaluating") and contributes NOTHING: not to the scene's
   mastery figure, not to the weakest-skill callout. A percentage computed from four answers
   is not a measurement, and printing it next to one computed from ninety is how a learner
   ends up told they have mastered a word they cannot say.

   The same gate drives both outputs on purpose. Gating mastery on the posterior and the
   weakest-skill line on a raw answer count would let one scene say "still evaluating" and
   "listening is your weakest" in the same breath. */

/* Fraction of separation between the best and worst measured skill before naming a
   weakest one. Same value, and the same reasoning, as biggestGap in learner.mjs: below
   this the ordering is noise and the honest answer is to say nothing. */
export const MIN_SPREAD = 0.12;
/* Scenes are ranked in textbook order. Anything that is not an act-scene code — "Class
   notes", "Culture talk", a manga range — sorts after the book rather than being dropped:
   it is real study and the learner put it in the deck on purpose. */
export const OTHER_RANK = 1e6;

/* Which scene an item belongs to. This mirrors sectionOf() in JpnFlashcards.jsx so the
   dashboard names scenes exactly as Browse does — one vocabulary of section names across
   the app. It is duplicated rather than imported because that one lives inside the React
   file; if the two ever disagree the dashboard would quietly file cards under a section
   the learner cannot find.

   Order: an explicit `sec` from the import, then SECTION_MAP for the Act 2 terms that
   predate it, then the coarse fallback the deck has always used for un-sectioned cards. */
export function sceneFor(card) {
  if (!card) return null;
  // "#n" only disambiguates duplicate seed rows in one scene — see cardMergeKey/applySeed.
  const sec = card.sec ? String(card.sec).replace(/#\d+$/, "") : "";
  return sec || SECTION_MAP[card.term] || ((card.lesson || 0) <= 6 ? "Act 1" : "Class notes");
}

/* "4-4" is what the textbook calls it and what Browse shows, so the code stays; the prefix
   is only there so a row reads as a place in a book rather than as a date. */
export function sceneTitle(scene) {
  const s = String(scene || "");
  return /^\d+-\d/.test(s) ? "Act " + s : s;
}

export function sceneRank(scene) {
  const m = /^(\d+)-(\d+)/.exec(String(scene || ""));
  if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
  return OTHER_RANK;
}

/** Per-skill posterior summary for one bag of evidence rows.
 *  `n`/`ok` come from profileFrom so the window rule has exactly one implementation. */
function skillsFrom(rows, opts) {
  const profile = profileFrom(rows, opts);
  const out = {};
  for (const s of SKILLS) {
    const row = profile[s] || { n: 0, ok: 0 };
    const post = posterior(row.ok || 0, (row.n || 0) - (row.ok || 0));
    const confidence = confidenceFromPosterior(post);
    out[s] = {
      n: row.n || 0,
      ok: row.ok || 0,
      mean: post.mean, lo: post.lo, hi: post.hi, width: post.width,
      state: stateOf(post),
      confidence,
      /* The single gate. Everything downstream — the scene's mastery figure, the weakest
         callout — reads this and nothing else. */
      measured: confidence === CONFIDENCE.OK || confidence === CONFIDENCE.GOOD,
    };
  }
  return out;
}

/** Mastery for every scene the deck covers.
 *
 *  @param evidence  makeEvidence rows: { id, skill, ok, at }
 *  @param cards     the deck: { id, term, sec?, lesson? }
 *  @param opts      { days = 60, now = Date.now(), minSpread = MIN_SPREAD }
 *
 *  Returns { scenes: [...], unplaced } — `unplaced` counts evidence for items no longer in
 *  the deck (deleted cards, a deck swapped out under an old log), which are dropped rather
 *  than being filed under a scene they were never part of.
 */
export function masteryByLesson(evidence = [], cards = [], opts = {}) {
  const now = opts.now || Date.now();
  const days = opts.days || 60;
  const minSpread = opts.minSpread ?? MIN_SPREAD;
  const windowMs = days * 86400000;

  /* Item -> scene, and the scene roster. The roster comes from the CARDS, so a scene with
     no evidence still appears — "not started" is a fact about progress and the dashboard
     would be misleading without it. */
  const sceneOfId = new Map();
  const items = new Map();                      // scene -> Set of item ids
  for (const c of cards || []) {
    if (!c || c.id == null) continue;
    const scene = sceneFor(c);
    if (!scene) continue;
    sceneOfId.set(c.id, scene);
    if (!items.has(scene)) items.set(scene, new Set());
    items.get(scene).add(c.id);
  }

  const seen = new Map();                       // scene -> Set of item ids with any evidence
  const recent = new Map();                     // scene -> windowed evidence rows
  const ever = new Map();                       // scene -> lifetime answer count
  let unplaced = 0;
  for (const e of evidence || []) {
    if (!e || e.id == null) continue;
    const scene = sceneOfId.get(e.id);
    if (!scene) { unplaced += 1; continue; }
    // Seen is lifetime and counts ANY answered exercise, including the ones that carry no
    // skill: meeting the item is progress even when it produced no evidence of ability.
    if (!seen.has(scene)) seen.set(scene, new Set());
    seen.get(scene).add(e.id);
    ever.set(scene, (ever.get(scene) || 0) + 1);
    if (now - (e.at || 0) <= windowMs) {
      if (!recent.has(scene)) recent.set(scene, []);
      recent.get(scene).push(e);
    }
  }

  const scenes = [];
  for (const [scene, ids] of items) {
    const rows = recent.get(scene) || [];
    const skills = skillsFrom(rows, { days, now });
    const measured = SKILLS.filter((s) => skills[s].measured);
    const evaluating = SKILLS.filter((s) => skills[s].confidence === CONFIDENCE.LOW);

    /* Mastery is the mean of the MEASURED posteriors — unmeasured skills are left out
       rather than counted as zero. An ability nobody has tested is not failing, and
       averaging a missing skill in as 0% would report a learner as worse the less the app
       has asked of them. `of` is published alongside so the UI can say how much of the
       picture the figure covers. */
    const mastered = measured.length
      ? measured.reduce((sum, s) => sum + skills[s].mean, 0) / measured.length
      : null;

    /* The weakest-skill callout, and the whole reason a per-scene breakdown beats one
       global number: it is the sentence that turns "74%" into something to do next. */
    let weakest = null;
    if (measured.length >= 2) {
      const ranked = measured.slice().sort((a, b) => skills[a].mean - skills[b].mean);
      const worst = ranked[0], best = ranked[ranked.length - 1];
      const spread = skills[best].mean - skills[worst].mean;
      if (spread >= minSpread) {
        weakest = { skill: worst, mean: skills[worst].mean, ahead: best, spread };
      }
    }

    const seenIds = seen.get(scene);
    const seenN = seenIds ? seenIds.size : 0;
    scenes.push({
      scene,
      title: sceneTitle(scene),
      items: ids.size,
      /* Progress. Lifetime, and explicitly not mastery — see the header. */
      seen: seenN,
      coverage: ids.size ? seenN / ids.size : 0,
      answers: rows.length,                     // in the mastery window
      answersEver: ever.get(scene) || 0,
      skills,
      measured: measured.length,
      of: SKILLS.length,
      evaluating,
      mastered,
      weakest,
      /* Everything the model has been asked about here is still too thin to report. The UI
         says "still evaluating" off this rather than printing a percentage. */
      stillEvaluating: mastered === null && evaluating.length > 0,
      started: (ever.get(scene) || 0) > 0,
    });
  }

  scenes.sort((a, b) => sceneRank(a.scene) - sceneRank(b.scene) || (a.scene < b.scene ? -1 : a.scene > b.scene ? 1 : 0));
  return { scenes, unplaced };
}

/** The one-line headline for a scene, kept here so the wording cannot drift from the
 *  numbers behind it. Returns the two figures separately — the UI joins them. */
export function describeScene(row) {
  if (!row) return { seen: "", mastered: "" };
  const seen = "seen " + Math.round((row.coverage || 0) * 100) + "%";
  const mastered = row.mastered == null
    ? (row.stillEvaluating ? "still evaluating" : "not measured yet")
    : "mastered " + Math.round(row.mastered * 100) + "%";
  return { seen, mastered };
}
