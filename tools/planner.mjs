/* ── the session planner ──
   Pure (no DOM, no storage) — see tools/test-planner.mjs.

   The layer between the learner model and the intervention engine. The stack was:

       learner model  ->  intervention engine  ->  composer  ->  render

   which answers "which items need work?" and "how should they be practised?", but never
   "how much of today should listening get?". Nothing allocated TIME across abilities, so a
   learner strong at recognition and weak at listening got another session of recognition —
   because that is where the due cards were.

       learner model  ->  PLANNER  ->  intervention engine  ->  composer  ->  render

   The division of labour this exists to enforce:

       the learner chooses DURATION      ("I have 20 minutes")
       the planner chooses COMPOSITION   (8 listening, 6 production, 4 review, 2 vocab)

   Duration is never the planner's to decide. A 60-minute recommendation that turns into a
   60-minute REQUIREMENT is how a study app becomes something you avoid opening.

   What this module deliberately does NOT do: choose items, formats, or order. Those are
   the intervention engine's and the composer's. The planner emits a time budget per skill
   and nothing else. */

import { SKILLS, STATE, posterior, stateOf, practiceValue } from "./learner.mjs";

/* ── stage priors ──
   Where a session starts before evidence moves it. From the learning-model spec §10:
   beginners need proportionally more explicit instruction, and the balance shifts toward
   input and output as ability grows.

   These are PRIORS, not a recipe. The spec is explicit that a fixed 15/15/15 split is the
   wrong thing to implement forever: "This learner has excellent vocabulary retention but
   poor listening comprehension. Giving them another 15 minutes of vocabulary is low
   marginal value." Evidence is allowed to move every one of these numbers, bounded only by
   MAX_SHARE and the review floor below.

   Keyed by the learner model's SKILLS, not the spec's prose taxonomy, because SKILLS is
   what evidence is actually recorded against. The rough correspondence:
     recognition  <- explicit knowledge: does the item mean anything to you
     production   <- output: concept -> Japanese
     listening    <- input: real-time auditory comprehension
     orthography  <- written form, kanji and kana accuracy
     context      <- grammar in a sentence, cloze and particle work */
export const STAGES = ["beginner", "advanced-beginner", "intermediate", "advanced"];

export const STAGE_PRIORS = {
  "beginner":          { recognition: 0.34, production: 0.18, listening: 0.20, orthography: 0.14, context: 0.14 },
  "advanced-beginner": { recognition: 0.26, production: 0.24, listening: 0.24, orthography: 0.12, context: 0.14 },
  "intermediate":      { recognition: 0.18, production: 0.28, listening: 0.28, orthography: 0.10, context: 0.16 },
  "advanced":          { recognition: 0.12, production: 0.32, listening: 0.32, orthography: 0.08, context: 0.16 },
};

/* No single ability may take more than this share of a session, however badly it scores.
   The spec's own warning: an ability must not be allowed to monopolise every session. A
   learner who cannot listen still needs the rest of the language. */
export const MAX_SHARE = 0.45;

/* An ability with no evidence gets a DIAGNOSTIC slice, not a full allocation. This is the
   distinction the spec insists on: "no evidence" and "weak evidence" are different states,
   and the response to the first is to go and measure, not to hand it 40% of the session.
   practiceValue() already caps how much uncertainty can earn; this caps it again in time
   terms, so a fresh install cannot spend half its first session on an unmeasured skill. */
export const DIAGNOSTIC_SHARE = 0.15;

/* Retention is the one thing that degrades without attention, so overdue material takes its
   cut before anything else competes. Expressed as a share of the session, scaled by how
   much is actually due — a clear backlog earns the floor, an empty one earns nothing. */
export const REVIEW_FLOOR = 0.10;
export const REVIEW_CEILING = 0.40;

/* Below this, a slice is not worth switching context for. Four minutes of listening is a
   activity; forty seconds is an interruption. Skills that cannot clear it are dropped and
   their time is redistributed, which is why a 5-minute session plans two or three skills
   rather than a thin smear across five. */
export const MIN_SLICE_MIN = 3;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/* Largest-remainder apportionment. Naive rounding of five shares against a fixed total
   loses or invents a minute or two, and a plan whose parts do not sum to the time the
   learner said they had is not a plan. */
export function apportion(weights, total) {
  const keys = Object.keys(weights);
  const sum = keys.reduce((a, k) => a + Math.max(0, weights[k] || 0), 0);
  if (!(sum > 0) || !(total > 0)) return keys.reduce((o, k) => ((o[k] = 0), o), {});
  const exact = {}, floor = {}, out = {};
  let used = 0;
  for (const k of keys) {
    exact[k] = (Math.max(0, weights[k] || 0) / sum) * total;
    floor[k] = Math.floor(exact[k]);
    out[k] = floor[k];
    used += floor[k];
  }
  const order = keys
    .map((k) => ({ k, rem: exact[k] - floor[k] }))
    .sort((a, b) => b.rem - a.rem || (a.k < b.k ? -1 : 1));
  let left = Math.round(total) - used;
  for (let i = 0; left > 0 && i < order.length; i++, left--) out[order[i].k] += 1;
  // Still short only when there are fewer keys than spare minutes; hand the rest to the
  // largest share rather than losing them.
  if (left > 0 && order.length) out[order[0].k] += left;
  return out;
}

/* How far evidence is allowed to move the stage prior. At 0 the plan is just the stage
   table; at 1 the priors do nothing and allocation is pure practiceValue.

   This has to be high. The spec's central complaint is that a fixed recipe keeps handing
   vocabulary time to someone whose vocabulary is already excellent, and a gentle nudge does
   not fix that: the beginner prior puts recognition at 0.34 and listening at 0.20, so a
   multiplier on the prior could not make failing listening outrank strong recognition. The
   blend is therefore between two SHARES — what the stage says, and what the evidence says —
   not a prior scaled by a factor. */
export const EVIDENCE_PULL = 0.65;

/* Normalise practiceValue across the skills into shares that sum to 1. Normalising is what
   lets evidence compete with the priors on equal terms; practiceValue on its own is an
   absolute number with no opinion about the other four skills. */
export function practiceShares(abilities = {}) {
  const raw = {};
  for (const s of SKILLS) {
    const a = abilities[s];
    const post = a && typeof a.mean === "number" ? a : posterior(0, 0);
    raw[s] = Math.max(0, practiceValue(post));
  }
  const sum = SKILLS.reduce((acc, s) => acc + raw[s], 0);
  const out = {};
  for (const s of SKILLS) out[s] = sum > 0 ? raw[s] / sum : 1 / SKILLS.length;
  return out;
}

/* Blend the stage prior with what the evidence wants. Both sides are shares over the same
   five skills, so the result is still a share. */
export function blendWeights(priors, shares, pull = EVIDENCE_PULL) {
  const p = clamp01(pull);
  const out = {};
  for (const s of SKILLS) out[s] = (1 - p) * (priors[s] ?? 0.2) + p * (shares[s] ?? 0.2);
  return out;
}

/* ── the planner ──
   minutes    the learner's stated time, and the only thing they choose
   abilities  { skill: posterior-ish } from abilityFrom()/posterior(); missing = unknown
   dueLoad    0..1, how much overdue material is waiting (1 = a full backlog)
   stage      one of STAGES
   Returns { minutes, stage, slices: [{ skill, minutes, share, state, reason }] } */
export function planSession(opts = {}) {
  const minutes = Math.max(0, Math.round(opts.minutes || 0));
  const stage = STAGE_PRIORS[opts.stage] ? opts.stage : "beginner";
  const priors = STAGE_PRIORS[stage];
  const abilities = opts.abilities || {};
  const dueLoad = clamp01(opts.dueLoad ?? 0);
  const minSlice = opts.minSlice ?? MIN_SLICE_MIN;

  if (!minutes) return { minutes: 0, stage, review: 0, slices: [] };

  /* 1. Review takes its cut first — it is the only component whose cost rises if skipped. */
  const reviewShare = dueLoad <= 0 ? 0 : REVIEW_FLOOR + (REVIEW_CEILING - REVIEW_FLOOR) * dueLoad;
  const reviewMinutes = Math.round(minutes * reviewShare);
  const trainable = Math.max(0, minutes - reviewMinutes);

  /* 2. Weight every skill: the stage prior blended with what the evidence wants. */
  const states = {};
  for (const s of SKILLS) {
    const a = abilities[s];
    const post = a && typeof a.mean === "number" ? a : null;
    states[s] = post ? (post.state || stateOf(post)) : STATE.UNKNOWN;
  }
  const weights = blendWeights(priors, practiceShares(abilities), opts.evidencePull ?? EVIDENCE_PULL);

  /* 3. Cap the unmeasured. An unknown skill is being SAMPLED, not trained: it may not take
        more than a diagnostic slice while something with evidence behind it is competing. */
  const known = SKILLS.filter((s) => states[s] !== STATE.UNKNOWN);
  if (known.length) {
    const total = SKILLS.reduce((a, s) => a + weights[s], 0);
    for (const s of SKILLS) {
      if (states[s] !== STATE.UNKNOWN) continue;
      const cap = DIAGNOSTIC_SHARE * total;
      if (weights[s] > cap) weights[s] = cap;
    }
  }

  /* 4. Nothing monopolises. Applied after the diagnostic cap so a genuinely failing ability
        is what gets trimmed here, not an unmeasured one. */
  {
    const total = SKILLS.reduce((a, s) => a + weights[s], 0);
    for (const s of SKILLS) {
      const cap = MAX_SHARE * total;
      if (weights[s] > cap) weights[s] = cap;
    }
  }

  /* 5. Minutes, then drop slices too small to be an activity and re-apportion their time.

     Iterative, dropping ONE skill at a time and re-apportioning. The first version filtered
     once and kept everything when nothing cleared the bar — so a 5-minute session came back
     as five one-minute slivers, which is exactly the thing the minimum exists to prevent.
     Dropping the lowest-weight skill and trying again converges on the largest set of
     skills that can each hold a real slice. */
  const pool = SKILLS.slice();
  let mins = apportion(weights, trainable);
  while (pool.length > 1) {
    const sub = {};
    for (const s of pool) sub[s] = weights[s];
    mins = apportion(sub, trainable);
    const slivers = pool.filter((s) => mins[s] < minSlice);
    if (!slivers.length) break;
    slivers.sort((a, b) => weights[a] - weights[b] || (a < b ? -1 : 1));
    pool.splice(pool.indexOf(slivers[0]), 1);
  }
  if (pool.length === 1) {
    mins = {};
    mins[pool[0]] = trainable;
  }
  for (const s of SKILLS) if (!(s in mins)) mins[s] = 0;

  const slices = SKILLS
    .filter((s) => (mins[s] || 0) > 0)
    .map((s) => ({
      skill: s,
      minutes: mins[s],
      share: minutes ? mins[s] / minutes : 0,
      state: states[s],
      reason: states[s] === STATE.UNKNOWN ? "not measured yet — sampling to find out"
        : states[s] === STATE.WEAK ? "weakest ability with evidence behind it"
        : states[s] === STATE.EMERGING ? "still being measured"
        : "keeping a strong ability alive",
    }))
    .sort((a, b) => b.minutes - a.minutes || (a.skill < b.skill ? -1 : 1));

  return { minutes, stage, review: reviewMinutes, slices };
}

/* ── feeding the plan back into the session (Phase 4) ──

   The plan allocates TIME across skills. The intervention engine chooses a skill per card,
   by maximising practiceValue. Those two have to meet somewhere, and this is the seam:
   the plan becomes a per-skill bias added to that score.

   A bias rather than a filter, for the same reason the practice modes are a weight rather
   than a filter: forcing the next eight cards to be listening would stop the memory model
   having a say, and the card that has quietly decayed to 40% would be locked out of the
   session that should have rescued it. Eligibility still wins — production stays locked
   until a word can be recognised at all, and no bias unlocks it. */

/* How hard the plan may push. practiceValue spans roughly [0, 1.15], so at 0.8 a skill a
   third of the session behind its target can overtake one that is moderately ahead, but
   cannot overtake a genuinely failing ability. That ordering is deliberate: the plan is a
   budget, not an instruction. */
export const BIAS_STRENGTH = 0.8;

/* Convert profileFrom()'s per-skill counts into the posteriors planSession wants. The two
   speak different dialects of the same evidence: profileFrom counts, planSession needs a
   distribution. Skills with no evidence become posterior(0, 0), whose state is UNKNOWN —
   which is exactly what should reach the planner, rather than a rate of zero that would
   read as total failure. */
export function abilitiesFromProfile(profile = {}) {
  const out = {};
  for (const s of SKILLS) {
    const row = profile[s];
    const n = (row && row.n) || 0;
    const ok = (row && row.ok) || 0;
    out[s] = posterior(ok, Math.max(0, n - ok));
  }
  return out;
}

/* The running deficit, as a bias map. `served` counts how many items each skill has already
   taken this session; the bias is how far behind its share each one is.

   Deficit rather than a fixed nudge, because a fixed nudge cannot converge: it pushes just
   as hard on the tenth listening card as on the first, and a session that opens with three
   listening items would keep being pushed toward listening. A deficit falls to zero as the
   skill is served and goes negative once it is over-served, which is what makes the session
   land on the allocation instead of leaning at it. */
export function biasFor(plan, served = {}, opts = {}) {
  const strength = opts.strength ?? BIAS_STRENGTH;
  const out = {};
  if (!plan || !plan.slices || !plan.slices.length) return out;
  const target = {};
  let planned = 0;
  for (const s of plan.slices) { target[s.skill] = s.minutes; planned += s.minutes; }
  if (!(planned > 0)) return out;

  let done = 0;
  for (const k of Object.keys(served)) done += served[k] || 0;

  for (const s of SKILLS) {
    const want = (target[s] || 0) / planned;
    /* Before anything has been asked there is no served share to compare against, so the
       first card is steered by the plan alone. */
    const got = done > 0 ? (served[s] || 0) / done : 0;
    out[s] = strength * (want - got);
  }
  return out;
}

/* A one-line summary for the UI: "18 listening · 15 production · 10 vocabulary". The plan
   should be legible to the learner — the spec's coach is one that can say what it is doing
   and why, not one that silently reallocates. */
export function describePlan(plan) {
  if (!plan || !plan.slices || !plan.slices.length) return "";
  const parts = plan.slices.map((s) => `${s.minutes} min ${s.skill}`);
  if (plan.review > 0) parts.unshift(`${plan.review} min review`);
  return parts.join(" · ");
}
