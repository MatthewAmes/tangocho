/* ── the session composer ──
   Pure (no DOM, no storage) — see tools/test-compose.mjs.

   The layer that was missing. The stack used to be:

       learner model  ->  intervention engine  ->  format  ->  render

   which answers "what should be practised?" and "roughly what kind of question?", and then
   renders each card independently of every other card in the session. That produces eight
   correct exercises in a row and no lesson. It is also why the app could generate ten kinds
   of activity while Smart Review only ever showed six: the extra ones — word bank, sentence
   scramble, particle tap — had nowhere to be chosen.

       learner model  ->  intervention engine  ->  COMPOSER  ->  activity  ->  render

   The composer answers the two questions in between:

     1. Given this skill at this cue, and given what material this card actually HAS, which
        concrete activity tests it best? A production ask with a sentence and an English
        gloss can be a word bank; without them it can only be free typing.

     2. How should these N activities be ARRANGED? An engaging lesson opens with something
        winnable, varies its form so no two neighbours feel alike, revisits a recent failure
        once the learner is warm, and finishes with the one question that offers no help at
        all. That shape is not a property of any single card, so nothing that maps cards
        one-at-a-time can produce it.

   What this module deliberately does NOT do: choose which cards to study, or what skill and
   cue to aim at. Those are the scheduler's and the intervention engine's, and they are
   better at it. The composer only decides presentation and order. */

import { CUE } from "./learner.mjs";

export const ACTIVITY = {
  LEARN: "learn",       // first contact — shown, not tested
  MC: "mc",             // recognise among neighbours
  RECALL: "recall",     // the flip card
  LISTEN: "listen",     // hear it, then say what it was
  CLOZE: "cloze",       // a blank in a real sentence, answered by choosing a word
  TAPFILL: "tapfill",   // a blank in a real sentence, answered by choosing a PARTICLE
  ORDER: "order",       // the sentence in pieces, in the wrong order — arrange it
  BUILD: "build",       // English in, Japanese assembled from a bank that holds extras
  TYPE: "type",         // produce it from meaning, spelled out, no support
};

/* Support, most to least. Used to escalate within a session and to pick the finale — the
   ordering is the point, the numbers are not. */
export const SUPPORT = {
  [ACTIVITY.LEARN]: 0, [ACTIVITY.MC]: 1, [ACTIVITY.LISTEN]: 2, [ACTIVITY.CLOZE]: 3,
  [ACTIVITY.TAPFILL]: 3, [ACTIVITY.ORDER]: 4, [ACTIVITY.BUILD]: 5, [ACTIVITY.RECALL]: 5,
  [ACTIVITY.TYPE]: 6,
};

export const DEFAULTS = {
  minChunks: 3,          // below this a "puzzle" is a coin flip dressed as practice
  maxChunks: 8,
  recoveryAt: 0.45,      // where in the session a recent failure belongs (0..1)
  finale: true,          // end on the least-supported item available
};

/* ── 1. which activity ──
   The intervention engine has already chosen a skill and a cue. This turns that into the
   richest activity the card's MATERIAL can support, and falls back the moment it cannot —
   a card with no sentence cannot be a word bank however much the learner needs production. */
export function activityFor(pick, material = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const fmt = pick && pick.format;
  const cue = typeof (pick && pick.cue) === "number" ? pick.cue : CUE.FREE;
  const sent = sentenceFor(pick, material);

  if (fmt === "cloze") {
    if (!sent) return ACTIVITY.MC;                       // promised context, has none
    // A particle gap asks about grammar rather than vocabulary, which is a different and
    // usually harder question about the same sentence. Only offered when the sentence
    // actually contains one the drill generator can grade.
    return material.hasParticleGap && material.hasParticleGap(sent) ? ACTIVITY.TAPFILL : ACTIVITY.CLOZE;
  }

  if (fmt === "type") {
    /* Production, laddered by how much the learner still needs holding up. Tiles that are
       all correct (ORDER) is the gentlest — it only asks about order. Tiles with extras
       (BUILD) also asks which words belong. Typing asks for everything. */
    const chunks = material.chunkCount ? material.chunkCount(sent) : 0;
    const usable = sent && sent.en && chunks >= o.minChunks && chunks <= o.maxChunks;
    if (!usable) return ACTIVITY.TYPE;
    if (cue <= CUE.STRONG) return ACTIVITY.ORDER;
    if (cue === CUE.PARTIAL) return ACTIVITY.BUILD;
    return ACTIVITY.TYPE;
  }

  return fmt in SUPPORT ? fmt : ACTIVITY.MC;
}

function sentenceFor(pick, material) {
  if (!pick || !material || typeof material.sentenceFor !== "function") return null;
  const s = material.sentenceFor(pick.id);
  return s && s.sentence ? s : null;
}

/* ── 2. what order ──
   Four rules, applied in an order that matters: the opener and the finale claim their slots
   first because they are the two positions a learner actually notices, then the recovery item
   is placed, then everything else fills in around them avoiding repeats.

   Every rule degrades rather than failing. A three-item session has no room for an arc and
   simply comes back close to how it arrived. */
export function arrange(items, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const list = (items || []).filter(Boolean);
  if (list.length < 4) return list.slice();

  const support = (x) => SUPPORT[x.activity] ?? 3;
  const rest = list.slice();
  const take = (fn) => {
    const i = rest.findIndex(fn);
    return i < 0 ? null : rest.splice(i, 1)[0];
  };

  /* Open on something winnable. Not the easiest CARD — the most supported ACTIVITY — because
     the point is a confident first answer, and a well-known word asked for free production
     is not that. */
  const opener = take((x) => support(x) <= 1) || take((x) => support(x) <= 2) || rest.shift();

  /* Finish with the one question that offers no help. Only worth doing if it is meaningfully
     harder than the opener, otherwise the session has no shape to end. */
  let finale = null;
  if (o.finale) {
    const hardest = Math.max(...rest.map(support), -1);
    if (hardest > support(opener)) finale = take((x) => support(x) === hardest);
  }

  // A recent failure, placed once the learner is warm rather than cold-opened on it.
  const recovery = take((x) => x.recovery || x.wasMissed);

  const middle = [];
  let prev = opener ? opener.activity : null;
  while (rest.length) {
    // Prefer a different activity from the one just placed; take anything if that is all
    // that is left. Variety is a preference here, never a reason to drop an item.
    const next = take((x) => x.activity !== prev) || rest.shift();
    middle.push(next);
    prev = next.activity;
  }
  if (recovery) {
    const at = Math.min(middle.length, Math.max(0, Math.round(middle.length * o.recoveryAt)));
    middle.splice(at, 0, recovery);
  }

  return [opener, ...middle, ...(finale ? [finale] : [])].filter(Boolean);
}

/* The whole job: decide each activity, then arrange them. */
export function composeSession(picks, material = {}, opts = {}) {
  const withActivity = (picks || []).filter(Boolean)
    .map((p) => ({ ...p, activity: activityFor(p, material, opts) }));
  return arrange(withActivity, opts);
}

/* What the session turned out to be, for the screen that says what is coming. Counts the
   activities rather than the cards, because "4 kinds of question" is the thing a learner
   can feel and "12 cards" is not. */
export function describeComposition(items) {
  const counts = new Map();
  for (const x of items || []) counts.set(x.activity, (counts.get(x.activity) || 0) + 1);
  return {
    n: (items || []).length,
    kinds: counts.size,
    counts: Object.fromEntries(counts),
    opensWith: items && items[0] ? items[0].activity : null,
    endsWith: items && items.length ? items[items.length - 1].activity : null,
  };
}
