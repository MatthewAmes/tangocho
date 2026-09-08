/* ── the tutor orchestrator ──
   Pure (no DOM, no storage, no network) — see tools/test-tutor.mjs.

   The brain behind a conversational tutor, and deliberately NOT the tutor itself. The rule
   this module exists to enforce:

       THE MODEL DOES NOT INVENT THE LEARNER'S STATE.

   An LLM asked "what does this learner know?" will answer, fluently, and be wrong. So the
   database answers that question and the model is TOLD. The model decides how to teach
   within those constraints; it never decides what is true about the learner.

       evidence log -> [ this module ] -> a brief -> the LLM

   Everything here is assembled from models that already exist: profileFrom for the five
   skills, grammarProfiles for the forms and their sound-change sub-rules, actProfiles for
   where the textbook stands, recentErrors for mistakes that are STILL mistakes, and
   planSession for what today's minutes should go on. Nothing is re-derived.

   ── the constraint that shapes all of this ──

   cf/src/ai.js caps a request at INPUT_MAX = 4000 characters of JSON, and the brief has to
   share that budget with the conversation history. A brief that grows with the deck would
   work for a week and then start failing with "input too large" once there was enough
   evidence to be worth sending — the failure arriving exactly when the feature got good.
   So the brief is BUDGETED: every list is capped, the caps are constants, and there is a
   test that a maximal brief still fits with room for the transcript. */

import { SKILLS, STATE, profileFrom, recentErrors, confusionFrom, biggestGap, posterior, stateOf } from "./learner.mjs";
import { grammarProfiles, weakestSubRule, GRAMMAR_NODES } from "./grammar.mjs";
import { planSession, abilitiesFromProfile } from "./planner.mjs";

/* Character budget. The brief must leave room for the transcript in the same 4000. */
export const BRIEF_MAX = 1800;
/* List caps, in the order they earn their space. */
export const MAX_WEAK = 3, MAX_TARGETS = 3, MAX_ERRORS = 4, MAX_CONFUSIONS = 3;

/* How much English the tutor should lean on. Adaptive rather than a mode switch: the point
   of scaffolding is that it goes away, and a learner who is producing should not be handed
   translations they did not need. Driven by production, because that is the ability
   scaffolding actually substitutes for. */
export const SCAFFOLD = { ALWAYS: "always", STRUGGLING: "when_struggling", RARELY: "rarely", NONE: "japanese_only" };

export function scaffoldFor(production, opts = {}) {
  const pref = opts.preference;
  if (pref && Object.values(SCAFFOLD).includes(pref)) return pref;
  if (!production || !production.measured) return SCAFFOLD.STRUGGLING;   // unknown: meet them halfway
  if (production.mean < 0.35) return SCAFFOLD.ALWAYS;
  if (production.mean < 0.65) return SCAFFOLD.STRUGGLING;
  if (production.mean < 0.85) return SCAFFOLD.RARELY;
  return SCAFFOLD.NONE;
}

/* Correction policy. Free conversation notices and says nothing until the end; tutor mode
   interrupts. Both are legitimate and they are not the same feature, so the mode is an
   input rather than something inferred. */
export const MODES = ["free", "tutor", "roleplay", "listening", "repair"];
export const CORRECTION = { NONE: "end_of_conversation", MAJOR: "major_only", IMMEDIATE: "immediate" };

export function correctionFor(mode, opts = {}) {
  if (opts.preference && Object.values(CORRECTION).includes(opts.preference)) return opts.preference;
  if (mode === "tutor") return CORRECTION.IMMEDIATE;
  if (mode === "repair") return CORRECTION.MAJOR;
  return CORRECTION.NONE;                       // free, roleplay, listening
}

const round2 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : null);

/* What this conversation should try to make happen. Targets are things the learner should
   be given a REASON to produce, not topics to lecture about — "create a situation needing
   に vs で" rather than "explain particles". Drawn from what is measured and weak, so an
   unmeasured ability never becomes a target: the honest response to "we have not looked at
   this" is to sample it in conversation, not to build a lesson around it. */
export function pickTargets(ctx, limit = MAX_TARGETS) {
  const out = [];
  for (const g of ctx.grammar_gaps || []) {
    out.push({ kind: "grammar", id: g.id, label: g.title, why: g.sub ? g.sub : "weak form", at: g.mastery });
  }
  for (const s of ctx.weaknesses || []) {
    out.push({ kind: "skill", id: s.skill, label: s.skill, why: "weak ability", at: s.mastery });
  }
  for (const c of ctx.confusions || []) {
    out.push({ kind: "confusion", id: c.pair, label: c.pair, why: "confused repeatedly", at: null });
  }
  return out.slice(0, limit);
}

/* ── the brief ──
   The structured ground truth handed to the model. Deliberately small, deliberately
   flat, and deliberately honest: an ability with no evidence is reported as unmeasured
   rather than omitted, because an omission reads as "fine" and unmeasured does not. */
export function buildBrief(opts = {}) {
  const evidence = opts.evidence || [];
  const cards = opts.cards || [];
  const mode = MODES.includes(opts.mode) ? opts.mode : "free";
  const now = opts.now || Date.now();

  const profile = profileFrom(evidence, { days: 60, now });
  const abilities = abilitiesFromProfile(profile);
  const gram = grammarProfiles(evidence, { days: 60, now });

  const skillRows = SKILLS.map((s) => {
    const post = abilities[s];
    const st = stateOf(post);
    return { skill: s, measured: st !== STATE.UNKNOWN, mastery: round2(post.mean), state: st, n: (profile[s] || {}).n || 0 };
  });

  const measured = skillRows.filter((r) => r.measured);
  const strengths = measured.filter((r) => r.mastery >= 0.8).sort((a, b) => b.mastery - a.mastery)
    .slice(0, MAX_WEAK).map((r) => r.skill);
  const weaknesses = measured.filter((r) => r.mastery < 0.6).sort((a, b) => a.mastery - b.mastery)
    .slice(0, MAX_WEAK).map((r) => ({ skill: r.skill, mastery: r.mastery }));

  /* Grammar gaps name the SUB-RULE where there is one. "て-form is at 63%" is a statistic;
     "む・ぶ・ぬ → んで is at 21%" is something a conversation can be built around. */
  const grammar_gaps = [];
  for (const node of GRAMMAR_NODES) {
    const row = gram[node.id];
    if (!row || !row.measured || row.mean >= 0.65) continue;
    const worst = weakestSubRule(node.id, gram);
    grammar_gaps.push({ id: node.id, title: node.title, mastery: round2(row.mean), sub: worst ? worst.explain || worst.rule : null });
  }
  grammar_gaps.sort((a, b) => a.mastery - b.mastery);

  /* Errors that are STILL errors — recentErrors already drops the ones since recovered, so
     this is not a list of everything ever got wrong. Trimmed to the produced text, because
     "you wrote 行きます where 行きました was wanted" is the useful part and the id is not. */
  /* Deduped by the pair itself. The same slip on the same word appears once per attempt,
     and four identical lines spend the character budget saying one thing — the model needs
     to know the mistake is happening, not how many times it is in the log. */
  const errs = [];
  const errSeen = new Set();
  for (const e of recentErrors(evidence, { days: 60, now, limit: 40 })) {
    if (!e.got || !e.want) continue;
    const said = String(e.got).slice(0, 24), wanted = String(e.want).slice(0, 24);
    const key = said + "␟" + wanted;
    if (errSeen.has(key)) continue;
    errSeen.add(key);
    errs.push({ said, wanted, kind: e.failure || null });
    if (errs.length >= MAX_ERRORS) break;
  }

  /* Confusions are keyed by CARD ID, and an id is meaningless to the model and to the
     learner alike — the brief was carrying "freq:人 / doijw37d", which reads as noise and
     spends characters saying nothing. Resolved to terms through the deck, and a pair that
     cannot be resolved on both sides is dropped rather than shown as an id. */
  const termOf = new Map();
  for (const c of cards) { if (c && c.id != null && c.term) termOf.set(c.id, c.term); }
  const readable = (x) => {
    const s = String(x == null ? "" : x);
    if (termOf.has(s)) return termOf.get(s);
    const bare = s.replace(/^[a-z]+:/, "");          // freq:人 and kana:a carry the term already
    if (bare && bare !== s) return bare;
    return /^[0-9a-z]{6,}$/i.test(s) ? null : s;      // a bare generated id is not a word
  };
  const confusions = [];
  for (const [id, withWhat] of confusionFrom(evidence)) {
    const a = readable(id), b = readable(withWhat && withWhat[0]);
    if (!a || !b) continue;
    confusions.push({ pair: a.slice(0, 16) + " / " + b.slice(0, 16) });
    if (confusions.length >= MAX_CONFUSIONS) break;
  }

  /* scaffoldFor reads `.mean`; a skill row carries `.mastery`. Passing the row straight in
     read undefined at every threshold and fell through to japanese_only — the most weakly
     scaffolded setting — for a learner producing at 38%, which is the exact opposite of
     what should happen. Adapted explicitly rather than by renaming either side, because
     both names are right where they live: a row is a display value, a posterior has a mean. */
  const asPosterior = (row) => (row ? { measured: row.measured, mean: row.mastery } : null);
  const production = skillRows.find((r) => r.skill === "production");
  const listening = skillRows.find((r) => r.skill === "listening");

  const ctx = {
    mode,
    scaffold: scaffoldFor(asPosterior(production), { preference: opts.scaffold }),
    correction: correctionFor(mode, { preference: opts.correction }),
    skills: skillRows.map((r) => ({ skill: r.skill, mastery: r.measured ? r.mastery : null })),
    strengths,
    weaknesses,
    grammar_gaps: grammar_gaps.slice(0, MAX_WEAK),
    recent_errors: errs,
    confusions,
    listening_level: listening && listening.measured ? listening.mastery : null,
    speaking_level: production && production.measured ? production.mastery : null,
  };
  ctx.targets = pickTargets(ctx);

  /* The plan is what today's minutes are for; a conversation that ignores it is a second,
     rival scheduler. Included only when a duration was actually asked for. */
  if (opts.minutes) {
    const plan = planSession({ minutes: opts.minutes, abilities, dueLoad: opts.dueLoad || 0, stage: opts.stage });
    ctx.session_plan = plan.slices.map((s) => ({ skill: s.skill, minutes: s.minutes }));
  }
  return ctx;
}

/* Serialise, and refuse to exceed the budget rather than discovering it at the API. Trims
   the least load-bearing lists first: a brief without its confusion list still teaches; a
   brief the endpoint rejects teaches nothing. */
export function serialiseBrief(ctx, max = BRIEF_MAX) {
  const shrink = ["confusions", "recent_errors", "grammar_gaps", "targets", "strengths"];
  let out = { ...ctx };
  let json = JSON.stringify(out);
  let i = 0;
  while (json.length > max && i < shrink.length) {
    const key = shrink[i];
    if (Array.isArray(out[key]) && out[key].length) out[key] = out[key].slice(0, Math.max(0, out[key].length - 1));
    else i++;
    json = JSON.stringify(out);
  }
  /* Last resort: the skills table is the one thing that must survive, because without it
     the model has no ground truth at all and is back to inventing. */
  if (json.length > max) {
    out = { mode: out.mode, scaffold: out.scaffold, correction: out.correction, skills: out.skills };
    json = JSON.stringify(out);
  }
  return json;
}
