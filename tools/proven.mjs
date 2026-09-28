/* ── what is PROVEN, per word ──
   Every other mastery number in this app is an estimate: a posterior mean, an FSRS
   stability, a level counter. Estimates are the right tool for choosing the next question,
   and the wrong one for telling a learner what they know — one lucky answer moves them, and
   none of them can say "you have shown this, on separate days, without help".

   This module answers only that question, from the evidence log, with a rule stated in one
   sentence:

     A word is MASTERED when it has been produced without help, correctly, on at least
     three different days spanning at least a week — and the most recent attempt was right.

   Everything short of that is named for what it is:

     recalls      produced without help at least once, not yet on enough separate days
     recognises   understood (chosen, heard, flipped) but never produced without help
     learning     attempted, never right
     new          no evidence at all

   What does NOT count as producing without help:
   - an answer with a hint on screen (cue below FREE: か＿＿び, a choice, the answer shown);
   - a tutor's judgement of a conversation turn (via "tutor"): real evidence for the
     learner model, but AI judgement is kept apart from deterministic scoring;
   - anything but the production skill. Recognising a word a hundred times proves you can
     recognise it, and the level says exactly that.

   A checkpoint answer (probe) DOES count: it is cold, unhinted production, the strongest
   single piece of evidence this app collects. */

import { CUE } from "./learner.mjs";

export const PROVEN = { successes: 3, days: 3, spanDays: 7 };
export const LEVEL = { NEW: "new", LEARNING: "learning", RECOGNISES: "recognises", RECALLS: "recalls", MASTERED: "mastered" };
export const LEVEL_ORDER = [LEVEL.NEW, LEVEL.LEARNING, LEVEL.RECOGNISES, LEVEL.RECALLS, LEVEL.MASTERED];

const DAY = 86400000;
const dayOf = (at, tz = 0) => Math.floor((at - tz) / DAY);

/* An unassisted production attempt. Rows written before cues were recorded (cue null)
   count when they were typed — the only production format those rows could be. */
export function unassistedProduction(row) {
  if (!row || row.skill !== "production") return false;
  if (row.via === "tutor") return false;
  if (typeof row.cue === "number") return row.cue >= CUE.FREE;
  return row.format === "type";
}

/* The level of one word from its own rows. Rows need not be sorted. */
export function levelOf(rows = [], rule = PROVEN) {
  if (!rows.length) return { level: LEVEL.NEW, days: 0, span: 0, successes: 0 };
  const sorted = [...rows].filter((r) => r && typeof r.at === "number").sort((a, b) => a.at - b.at);
  const prod = sorted.filter(unassistedProduction);
  const wins = prod.filter((r) => r.ok);
  const days = new Set(wins.map((r) => dayOf(r.at)));
  const span = wins.length ? (wins[wins.length - 1].at - wins[0].at) / DAY : 0;
  const lastProd = prod[prod.length - 1];
  const base = { days: days.size, span: Math.round(span * 10) / 10, successes: wins.length };

  if (wins.length >= rule.successes && days.size >= rule.days && span >= rule.spanDays && lastProd && lastProd.ok) {
    return { level: LEVEL.MASTERED, ...base };
  }
  if (wins.length) return { level: LEVEL.RECALLS, ...base, slipped: !!(lastProd && !lastProd.ok) };
  if (sorted.some((r) => r.ok)) return { level: LEVEL.RECOGNISES, ...base };
  return { level: LEVEL.LEARNING, ...base };
}

/* Levels for many words at once. `ids` limits and fixes the population — a word in `ids`
   with no rows is NEW, which is what makes "12 of 839 mastered" an honest fraction. */
export function levelsFor(evidence = [], ids = null) {
  const by = new Map();
  for (const r of evidence || []) {
    if (!r || r.id == null) continue;
    if (!by.has(r.id)) by.set(r.id, []);
    by.get(r.id).push(r);
  }
  const out = new Map();
  const population = ids ? [...ids] : [...by.keys()];
  for (const id of population) out.set(id, levelOf(by.get(id) || []));
  return out;
}

/* Counts per level, in LEVEL_ORDER. */
export function tally(levels) {
  const t = Object.fromEntries(LEVEL_ORDER.map((l) => [l, 0]));
  for (const v of levels.values()) t[v.level]++;
  t.total = levels.size;
  return t;
}

/* What the next proof needs, in words — for the one word in front of the learner. */
export function nextProof(status, rule = PROVEN) {
  if (!status) return "";
  if (status.level === LEVEL.MASTERED) return "Mastered: produced without help on separate days.";
  if (status.level === LEVEL.RECALLS) {
    if (status.slipped) return "You've produced this before, but missed it last time.";
    const needDays = Math.max(0, rule.days - status.days);
    if (needDays > 0) return `Produced without help on ${status.days} day${status.days === 1 ? "" : "s"} — ${needDays} more day${needDays === 1 ? "" : "s"} to master it.`;
    return `Produced on ${status.days} days — mastered once those span a week.`;
  }
  if (status.level === LEVEL.RECOGNISES) return "You recognise this. Producing it without help is next.";
  if (status.level === LEVEL.LEARNING) return "Still learning — not right yet.";
  return "";
}
