/* ── the moments worth naming ──
   The engine already scores comebacks, unaided retrieval and speed against this learner's
   own norms (scoreAnswer in learner.mjs), and the learner has never seen any of it beyond
   a number going up. This file decides WHEN one of those is worth a word, and the app
   renders it. Pure: rows in, descriptors out, no React and no storage.

   Three rules, all of them restraint:

   1. AT MOST ONE THING AT A TIME. rewardsFor returns a ranked list and the caller shows
      the head of it. A comeback that was also a speed record is one celebration, not two
      stacked on top of the card the learner is trying to read (spec §48: do not interrupt
      the lesson).

   2. NOTHING FIRES ON EVERY ANSWER. A badge that appears constantly is wallpaper. The
      no-hint run pays at every third unaided success rather than at each one; a speed
      record has to actually BEAT the previous best by a margin, on an item with enough
      history for "previous best" to mean anything.

   3. THE MEMORY CHECK IS ANNOUNCED, NOT REPORTED. It is the only one that fires BEFORE
      the answer — "21+ days, let's see if it stuck" — because that is where the drama is.
      Told afterwards it is a fact about a card; told first it is the question the whole
      spacing model has been building towards, and the learner gets to feel the stakes of
      it. The existing after-the-fact banner stays: one sets it up, the other pays it off. */

import { CUE, MEMORY_CHECK_DAYS } from "./learner.mjs";

/* Unaided successes in a row before the run is worth mentioning — and the interval it
   repeats on. Three because that is roughly a minute of study: long enough to be a run,
   short enough that the first one lands in the session it was earned in. */
export const NO_HINT_STREAK = 3;

/* A personal record has to be a record. The margin stops a 4,210ms answer beating a
   4,205ms one and calling itself an improvement, and the minimum count stops the SECOND
   time an item is ever seen from being a "record" against the only other data point. */
export const PR_MARGIN = 0.9;
export const PR_MIN_PRIORS = 2;

/* Which bucket a timing belongs to: this item, this ability, this exercise type. All
   three matter — typing 火曜日 and picking it out of four are not the same race, and a
   record that mixed them would fire every time the format got easier. */
export function bestKey(row) {
  return String(row && row.id) + "|" + ((row && row.skill) || "?") + "|" + ((row && row.format) || "?");
}

/** Fastest correct answer so far per bucket, with how many there have been.
 *  Correct answers only, for the same reason latencyNorms uses them: a wrong answer's
 *  timing says nothing about how quickly the learner can produce the right one. */
export function personalBests(evidence = []) {
  const out = new Map();
  for (const row of evidence || []) {
    if (!row || !row.ok || !(row.ms > 0)) continue;
    const k = bestKey(row);
    const cur = out.get(k);
    if (!cur) out.set(k, { ms: row.ms, n: 1 });
    else { cur.n += 1; if (row.ms < cur.ms) cur.ms = row.ms; }
  }
  return out;
}

/* An unaided win: retrieved with no letters given. CUE.FREE is where the scaffolding is
   fully gone; CUE.CONTEXT is above it and counts too. */
function unaidedWin(row) {
  return !!(row && row.ok && (row.cue || 0) >= CUE.FREE);
}

/** How long the current run of unaided successes is, counting this answer as its end.
 *  ANY other answer breaks it — a miss obviously, but a cued success as well, because the
 *  run being counted is of retrievals with no help and a hinted one had help. */
export function cueFreeStreak(priorRows = [], answer) {
  if (!unaidedWin(answer)) return 0;
  let n = 1;
  for (let i = (priorRows || []).length - 1; i >= 0; i--) {
    if (!unaidedWin(priorRows[i])) break;
    n += 1;
  }
  return n;
}

/** Announce the memory check BEFORE the card is answered. Takes the stability the
 *  scheduler is currently carrying, in days — the same figure isMemoryCheck reads after
 *  the fact, asked one beat earlier and without knowing the outcome. */
export function memoryCheckAhead(stabilityDays) {
  return (stabilityDays || 0) >= MEMORY_CHECK_DAYS;
}

/* One decimal, which is the precision the roadmap's own example uses ("18.4s to 11.2s")
   and about as much as anyone can feel. */
export function secs(ms) {
  return (Math.round((ms || 0) / 100) / 10).toFixed(1) + "s";
}

/** What this answer earned a word for, best first.
 *
 *  @param answer   { id, ok, cue, ms, skill, format, comeback }
 *  @param ctx      { priorRows, bests } — the session's earlier answers, and
 *                  personalBests() over the log AS IT WAS BEFORE this answer
 *
 *  Returns [] on most answers, which is the intended shape of the output.
 */
export function rewardsFor(answer, ctx = {}) {
  if (!answer) return [];
  const out = [];

  /* The rescue landed. Rarest of the three and the one that most deserves the interruption:
     the learner missed something and then, two or three beats later, produced it. */
  if (answer.ok && answer.comeback) {
    out.push({ kind: "comeback", rank: 1, title: "Comeback", detail: "You missed that one and just landed it." });
  }

  /* Faster than they have ever been on this exact thing. Not "faster than average" — the
     norms already grade that on every answer and it is worth points, not a headline. */
  if (answer.ok && answer.ms > 0) {
    const prev = (ctx.bests instanceof Map ? ctx.bests : new Map()).get(bestKey(answer));
    if (prev && prev.n >= PR_MIN_PRIORS && answer.ms <= prev.ms * PR_MARGIN) {
      out.push({
        kind: "speed-pr", rank: 2, title: "Personal best",
        detail: secs(prev.ms) + " to " + secs(answer.ms),
        from: prev.ms, to: answer.ms,
      });
    }
  }

  /* A run of retrievals with nothing given. Paid on every third so it stays an event. */
  const streak = cueFreeStreak(ctx.priorRows || [], answer);
  if (streak >= NO_HINT_STREAK && streak % NO_HINT_STREAK === 0) {
    out.push({
      kind: "no-hint", rank: 3, title: streak + " with no hints",
      detail: "Straight from memory, " + streak + " in a row.", streak,
    });
  }

  return out.sort((a, b) => a.rank - b.rank);
}

/** The single reward to show, or null. Rule 1 lives here. */
export function topReward(answer, ctx = {}) {
  const all = rewardsFor(answer, ctx);
  return all.length ? all[0] : null;
}
