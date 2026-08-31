/* ── how much of the book is done ──
   Pure (no DOM, no storage) — see tools/test-progress.mjs.

   masteryByLesson answers "how is scene 7-3 going". This answers the question above it:
   how much of Volume 1, and of Volume 2, does this learner actually know. Same evidence,
   same posteriors, rolled up the curriculum tree that curriculum.mjs already describes.

   ## Three different numbers, kept apart on purpose

   A single "progress" bar has to choose what it means, and every choice is a lie about one
   of these:

     coverage  — of the words in this volume, how many have been MET at least once. Moves
                 the day you first see a card and never moves again. Honest measure of how
                 far through the book you have read.
     mastered  — of what has been met, how much does the model believe is KNOWN. Can fall.
                 This is the one that matters, and the one that cannot be earned by clicking.
     done      — coverage x mastered. The only figure that answers "how much of Volume 2 do
                 I know" without qualification, and the only one that reaches 100% solely by
                 actually knowing the material.

   Showing coverage alone is how an app tells you that you are 90% done with a book you
   cannot speak a word of. Showing mastery alone hides that it is 95% of the eleven words
   you have looked at. The bar renders `done`; the other two are what the label says. */

import { volumeOfAct, VOLUME_ACTS } from "./curriculum.mjs";

/** The act number a scene label belongs to: "7-3" -> 7. Null when it is not a scene label. */
export function actOfScene(scene) {
  const m = /^(\d+)[-/]/.exec(String(scene || ""));
  return m ? parseInt(m[1], 10) : null;
}

/* A scene only counts toward mastery once the model is willing to state one. Scenes that
   are still evaluating are counted in coverage but not in mastery, so an early session
   cannot swing the figure — and `measuring` says how many are in that state, because "3 of
   28 scenes measured" is the context that makes 80% mean anything. */
export function rollUp(rows) {
  let items = 0, seen = 0, masteredWeight = 0, masteredItems = 0, started = 0, measuring = 0;
  for (const r of rows || []) {
    if (!r) continue;
    items += r.items || 0;
    seen += r.seen || 0;
    if (r.started) started++;
    if (r.mastered == null) { if (r.stillEvaluating) measuring++; continue; }
    /* Weighted by how many words the scene HAS, not by how many were answered: a scene of
       forty words that is 50% mastered is worth more than a scene of four that is 100%. */
    masteredWeight += r.mastered * (r.items || 0);
    masteredItems += r.items || 0;
  }
  const coverage = items ? seen / items : 0;
  const mastered = masteredItems ? masteredWeight / masteredItems : null;
  return {
    scenes: (rows || []).length,
    started,
    measuring,
    items,
    seen,
    coverage,
    mastered,
    // Null until something is measured, rather than 0 — "not measured" and "none of it" are
    // very different claims and a bar cannot tell them apart on its own.
    done: mastered == null ? null : coverage * mastered,
  };
}

/** Per volume, in book order, including volumes not started. */
export function volumeProgress(mastery, opts = {}) {
  const rows = (mastery && mastery.scenes) || [];
  const byVolume = new Map();
  for (const r of rows) {
    const act = actOfScene(r.scene);
    const vol = act == null ? null : volumeOfAct(act);
    if (!vol) continue;                          // material outside the book's act range
    if (!byVolume.has(vol)) byVolume.set(vol, []);
    byVolume.get(vol).push(r);
  }
  const volumes = (opts.volumes || VOLUME_ACTS).map((v) => ({
    volume: v.volume,
    from: v.from,
    to: v.to,
    ...rollUp(byVolume.get(v.volume) || []),
  }));
  return { volumes, overall: rollUp(rows.filter((r) => volumeOfAct(actOfScene(r.scene)))) };
}

/** Per act within one volume — the next level down, for when a bar is not enough. */
export function actProgress(mastery, volume) {
  const rows = (mastery && mastery.scenes) || [];
  const byAct = new Map();
  for (const r of rows) {
    const act = actOfScene(r.scene);
    if (act == null || volumeOfAct(act) !== volume) continue;
    if (!byAct.has(act)) byAct.set(act, []);
    byAct.get(act).push(r);
  }
  return [...byAct.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([act, rs]) => ({ act, ...rollUp(rs) }));
}

/** One honest sentence about a volume, so the wording cannot drift from the numbers. */
export function describeVolume(v) {
  if (!v || !v.items) return "nothing from this volume in the deck yet";
  const pct = (x) => Math.round(x * 100) + "%";
  if (!v.started) return `not started — ${v.items} words across ${v.scenes} scenes`;
  if (v.mastered == null) {
    return `${pct(v.coverage)} of the words met, too early to say how much has stuck`;
  }
  return `${pct(v.coverage)} of the words met, ${pct(v.mastered)} of those holding`;
}
