import { SKILL_LABEL, summarise, parseRecovery, itemKey } from "./learner.mjs";
import { masteryByLesson, sceneFor, sceneTitle } from "./mastery.mjs";
import { GOLD_STABILITY } from "../src/lib/schedule.js";

/* ── what the session MOVED ──
   The done screen used to lead with a percentage. "8 of 9 correct" is the least interesting
   fact a session produces: it says how the answering went, not what happened to the memory,
   and it is the one number a learner can improve by studying easier material. The roadmap's
   Slice 1 line is exact — the summary should show MOVEMENT — and spec §21 names the four
   things worth showing: what crossed into gold, what was recovered, which ability is behind,
   and where the current act's mastery now sits.

   Every selector here is pure: rows and plain snapshots in, plain objects out, no clock of
   its own (pass `now`), no React, no storage. The wording lives here too, beside the numbers
   it describes, for the same reason describeScene does — a sentence written in the JSX
   drifts from the arithmetic behind it the first time either is edited alone. Tested in
   tools/test-summary.mjs. */

/* ── stability movement ──
   A pair is one item's stability either side of the session, in days: { id, s0, s1 }. The
   caller supplies them, because there are two honest sources and they answer slightly
   different questions — the card state captured at session start (exact, and the only place
   leech status lives) or the session's own evidence rows (pairsFromEvidence below, for a log
   with no deck beside it). The RULE is here either way, so the two cannot disagree about
   what counts as crossing. */

/** Fold a session's evidence into one pair per item: the stability it started the session
 *  with, and the stability it ended with. An item answered five times — learning steps, or
 *  the rungs of a rescue — is ONE movement, not five, so the first s0 and the last s1 win.
 *  Rows written before stability was recorded have neither and are skipped, exactly as the
 *  gain metric skips them, rather than being counted as a move from zero. */
export function pairsFromEvidence(rows = []) {
  const byItem = new Map();
  const xs = (rows || [])
    .filter((r) => r && typeof r.s0 === "number" && typeof r.s1 === "number")
    .slice()
    .sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const r of xs) {
    const key = itemKey(r);
    const ex = byItem.get(key);
    if (ex) ex.s1 = r.s1;
    else byItem.set(key, { key, id: r.id, deck: r.deck || "vocab", s0: r.s0, s1: r.s1 });
  }
  return [...byItem.values()];
}

/** What moved, given one pair per item.
 *
 *  @param pairs  [{ id, deck?, s0, s1, leech0?, leech1? }]
 *  @param opts   { gold = GOLD_STABILITY }
 *  @returns { gold, goldItems, days, strengthened, freed, moved }
 */
export function stabilityMovement(pairs = [], opts = {}) {
  const gold = opts.gold ?? GOLD_STABILITY;
  const goldItems = [];
  let days = 0, strengthened = 0, freed = 0;
  for (const p of pairs || []) {
    if (!p) continue;
    const a = Number(p.s0) || 0, b = Number(p.s1) || 0;
    /* Crossing is a one-way event: below the line before, at or above it after. An item
       already in gold that got stronger has not "moved into gold", and counting it would
       make the headline grow every time a mature card came up — the exact farmable number
       the stability-as-currency rule exists to refuse. */
    if (a < gold && b >= gold) goldItems.push({ id: p.id, deck: p.deck || "vocab", s0: a, s1: b });
    if (b > a) { days += b - a; strengthened += 1; }
    if (p.leech0 && !p.leech1) freed += 1;
  }
  return {
    gold: goldItems.length,
    goldItems,
    /* Rounded at the edge, not inside the sum: rounding each item first turns twenty
       half-day gains into zero. */
    days: Math.round(days),
    strengthened,
    freed,
    moved: goldItems.length > 0 || freed > 0 || Math.round(days) >= 1,
  };
}

/* ── recoveries landed ──
   A rescue that reaches its last rung and is answered right is the single most earned thing
   in a session: the item was lost, the app took it apart and rebuilt it, and the learner
   finished by producing the answer. It is already scored (SCORE.comeback) and already
   tagged in the log (recovery.mjs stamps "production:3/3"), and until now it vanished the
   moment the screen changed.

   Deduped by ITEM. Two completed ladders on one word inside one session is the app failing
   to fix something twice, not two recoveries, and a count that grows with repeated failure
   is not a count of repairs. */
export function recoveriesLanded(rows = []) {
  const byItem = new Map();
  for (const e of rows || []) {
    if (!e || !e.ok) continue;
    const rec = parseRecovery(e.recovery);
    if (!rec || !rec.last) continue;
    byItem.set(itemKey(e), { id: e.id, deck: e.deck || "vocab", from: rec.from, of: rec.of, at: e.at || 0 });
  }
  const items = [...byItem.values()].sort((a, b) => a.at - b.at);
  return { landed: items.length, items };
}

/* ── the session's weakest ability ──
   biggestGap answers this over a 60-day profile and needs eight answers per skill before it
   will speak, which is right for a profile and far too strict for one sitting: a normal
   session is twenty answers across three abilities. So this is the same idea at session
   scale, with the thresholds restated rather than borrowed, and with the same refusal — it
   says nothing when the ordering would be noise.

   Two ways it can speak, kept apart because they are different claims:

     spread  two abilities were both tested enough and one is clearly behind the other.
             This is the comparative claim, and the useful one.
     sole    only one ability got a real workout and it went badly. Not a comparison at all;
             it is a fact about the session, phrased as one.

   Below both bars it returns null and the screen says nothing, which is correct — a session
   of nine answers has not measured anything about a learner. */
export const MIN_SKILL_ANSWERS = 4;
export const MIN_SKILL_SPREAD = 0.2;
/** Below this rate a single worked ability is worth naming on its own. */
export const SOLE_SKILL_CEILING = 0.7;

export function weakestSkill(rows = [], opts = {}) {
  const min = opts.minAnswers ?? MIN_SKILL_ANSWERS;
  const minSpread = opts.minSpread ?? MIN_SKILL_SPREAD;
  const ceiling = opts.soleCeiling ?? SOLE_SKILL_CEILING;
  /* Through summarise so the tally has exactly one implementation — a second loop over the
     same rows is a second answer to "how many did I get right" waiting to disagree. */
  const bySkill = summarise(rows || []).bySkill;
  const scored = Object.keys(bySkill)
    .filter((s) => bySkill[s].n >= min)
    .map((s) => ({ skill: s, n: bySkill[s].n, ok: bySkill[s].ok, rate: bySkill[s].ok / bySkill[s].n }))
    .sort((a, b) => a.rate - b.rate);
  if (!scored.length) return null;

  const worst = scored[0];
  if (scored.length >= 2) {
    const best = scored[scored.length - 1];
    const spread = best.rate - worst.rate;
    if (spread >= minSpread) {
      return {
        basis: "spread",
        skill: worst.skill, n: worst.n, ok: worst.ok, rate: worst.rate,
        ahead: best.skill, aheadN: best.n, aheadOk: best.ok, aheadRate: best.rate,
        spread,
        note: (SKILL_LABEL[worst.skill] || worst.skill) + " was the weak spot — "
          + worst.ok + " of " + worst.n + ", against "
          + best.ok + " of " + best.n + " on " + (SKILL_LABEL[best.skill] || best.skill).toLowerCase() + ".",
      };
    }
    return null;                       // measured, and genuinely level: say nothing
  }
  if (worst.rate > ceiling) return null;
  return {
    basis: "sole",
    skill: worst.skill, n: worst.n, ok: worst.ok, rate: worst.rate,
    ahead: null, spread: null,
    /* Deliberately not "your weakest": one ability was tested, so there is nothing to be
       weaker THAN, and the sentence has to stay inside what the session actually measured. */
    note: (SKILL_LABEL[worst.skill] || worst.skill) + " was the hard part — "
      + worst.ok + " of " + worst.n + " today.",
  };
}

/* ── the current act, before and after ──
   The one number in the summary that is about the textbook rather than about the session:
   did this sitting actually move mastery of the act being studied, and by how much.

   Computed by running masteryByLesson twice over the SAME evidence log, once with this
   session's rows removed. That sounds expensive and is not: the costly half of the lesson
   dashboard is the roster loop over sixteen hundred cards, and this restricts the roster to
   the one scene the session worked — usually forty cards. What is left is two linear passes
   over a log that is capped at four thousand rows, on a screen the learner reaches once per
   session. Re-deriving the posteriors from the session's own rows would be cheaper still and
   would be a second, quietly different implementation of the mastery figure — which is the
   trade this deliberately does not make.

   Returns null when the act cannot be identified or when mastery is not measurable either
   side, because "0% → 0%" on an unmeasured scene is a claim, not a reading. */

/** The identity mergeEvidence dedupes by, reused so "these rows are the session" survives a
 *  sync that replaced the objects with structurally equal copies. */
function rowKey(r) { return (r.at || 0) + "|" + r.id + "|" + r.format; }

export function actMasteryDelta(opts = {}) {
  const evidence = opts.evidence || [];
  const sessionRows = opts.sessionRows || [];
  const cards = opts.cards || [];
  const now = opts.now || Date.now();
  const days = opts.days || 60;
  if (!sessionRows.length || !cards.length) return null;

  /* Which act the session was actually about: the scene most of its answers landed in. A
     session is normally one lesson, and where it is not, the majority scene is the honest
     answer to "the current act" — better than the deck-wide average, which would move by
     fractions of a point and mean nothing. */
  const sceneOfId = new Map();
  for (const c of cards) {
    if (!c || c.id == null) continue;
    const scene = sceneFor(c);
    if (scene) sceneOfId.set(c.id, scene);
  }
  const tally = new Map();
  for (const r of sessionRows) {
    const scene = r && r.id != null ? sceneOfId.get(r.id) : null;
    if (scene) tally.set(scene, (tally.get(scene) || 0) + 1);
  }
  if (!tally.size) return null;
  let scene = null, top = -1;
  for (const [s, n] of tally) if (n > top) { top = n; scene = s; }

  const sceneCards = cards.filter((c) => c && c.id != null && sceneOfId.get(c.id) === scene);
  const mine = new Set(sessionRows.filter(Boolean).map(rowKey));
  const pick = (rows) => {
    const out = masteryByLesson(rows, sceneCards, { now, days });
    return out.scenes[0] || null;
  };
  const after = pick(evidence);
  const before = pick(evidence.filter((r) => r && !mine.has(rowKey(r))));
  if (!after || after.mastered == null) return null;

  const had = before && before.mastered != null;
  return {
    scene,
    title: sceneTitle(scene),
    answers: top,
    before: had ? before.mastered : null,
    after: after.mastered,
    delta: had ? after.mastered - before.mastered : null,
    measured: after.measured,
    of: after.of,
    /* The session is what made this act measurable at all. There is no delta to show, and
       saying so beats printing a change from a number that did not exist. */
    first: !had,
  };
}

/** The whole summary in one call, for a caller that has everything to hand. Each part is
 *  independently null-able: a session can move stability without recovering anything, and
 *  can recover something without having measured a skill. */
export function sessionSummary(opts = {}) {
  const rows = opts.sessionRows || [];
  return {
    movement: stabilityMovement(opts.pairs || pairsFromEvidence(rows), opts),
    recoveries: recoveriesLanded(rows),
    weakest: weakestSkill(rows, opts),
    act: actMasteryDelta(opts),
  };
}
