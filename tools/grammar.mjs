/* ── grammar as a first-class skill ──
   Pure (no DOM, no storage) — see tools/test-grammar.mjs.

   The gap this closes: conjugation has SRS state, at the wrong grain. A drill card keys as
   `たべる|p-te`, so 食べる-in-て-form is a tracked item and て-FORM ITSELF is not. The app can
   therefore say "your production is weak" and cannot say "your て-form is weak", which is
   the sentence a textbook learner actually needs — when someone is stuck in Act 6 it is
   almost never the individual words.

   A node is a CONCEPT, not a surface form. `g-te` holds the mastery; 〜てもいいですか and
   〜てください are uses of it. Splitting SRS per surface form starves every node: the Beta
   posterior needs observations to leave UNKNOWN, and three-way-splitting て-form means none
   of the three ever gets enough evidence to say anything.

   The finer signal — む/ぶ/ぬ → んで going wrong while って is fine — is a SUB-RULE, not a
   separate node. It is reported underneath the node rather than scheduled beside it,
   because it is a diagnosis ("which rule is misfiring") and not a memory ("is this due").

   What this module does NOT do: schedule. Nodes report mastery and readiness; the planner
   and the intervention engine decide what to do about it. */

import { CONJ_BANK } from "../src/data/conj-bank.js";
import { CONJ_FORMS } from "../src/lib/conjugate.js";
import { posterior, stateOf, STATE } from "./learner.mjs";

/* ── the nodes ──
   One per drillable cell, because those are the forms the app has material for. The act
   numbers are the ONE authored thing here and they need checking against the book: the
   existing mapping in the app is `pol === "formal" ? 4 : 8`, a two-way guess that puts
   て-form and たい in the same act as every plain form. These follow the stated NihonGO NOW!
   sequence instead (ます in 3, past/adjectives in 5, て in 6, たい in 7, plain forms in 8).
   Wrong act numbers make the knowledge map point at the wrong lesson; they do not corrupt
   any mastery estimate, which is why this is safe to ship and worth verifying.

   PREREQS ARE LINGUISTIC, NOT JUST SEQUENTIAL. g-te depends on g-plain-past because they
   share the same 音便 sound changes — a learner who cannot form 読んだ will not form 読んで,
   and drilling て-form before that is drilling the wrong thing. That dependency is the
   reason to have a graph at all rather than an ordered list. */
export const GRAMMAR_NODES = [
  { id: "g-polite",        form: "f-pp",  act: 3, title: "polite present (〜ます)",        prereqs: [] },
  { id: "g-polite-neg",    form: "f-pn",  act: 3, title: "polite negative (〜ません)",      prereqs: ["g-polite"] },
  { id: "g-polite-past",   form: "f-ap",  act: 5, title: "polite past (〜ました)",          prereqs: ["g-polite"] },
  { id: "g-polite-pastneg",form: "f-an",  act: 5, title: "polite past negative",            prereqs: ["g-polite-past", "g-polite-neg"] },
  { id: "g-dict",          form: "p-pp",  act: 8, title: "dictionary form",                 prereqs: [] },
  { id: "g-plain-neg",     form: "p-pn",  act: 8, title: "plain negative (〜ない)",          prereqs: ["g-dict"] },
  { id: "g-plain-past",    form: "p-ap",  act: 8, title: "plain past (〜た, 音便)",          prereqs: ["g-dict"] },
  { id: "g-plain-pastneg", form: "p-an",  act: 8, title: "plain past negative",             prereqs: ["g-plain-past", "g-plain-neg"] },
  { id: "g-te",            form: "p-te",  act: 6, title: "て-form",                          prereqs: ["g-plain-past"] },
  { id: "g-tai",           form: "p-tai", act: 7, title: "want to (〜たい)",                 prereqs: ["g-polite"] },
];

export const NODE_BY_FORM = Object.fromEntries(GRAMMAR_NODES.map((n) => [n.form, n]));
export const NODE_BY_ID = Object.fromEntries(GRAMMAR_NODES.map((n) => [n.id, n]));

/* ── sub-rules ──
   Which rule a given verb exercises. For godan the 音便 group is decided by the final kana
   of the dictionary form, which is the actual table a learner gets wrong one row at a time:
   って is usually solid long before んで is. Derived from the data rather than authored, so
   it cannot drift from CONJ_BANK. */
export const GODAN_GROUPS = [
  { id: "godan-tte", ends: ["う", "つ", "る"], rule: "う・つ・る → って" },
  { id: "godan-nde", ends: ["む", "ぶ", "ぬ"], rule: "む・ぶ・ぬ → んで" },
  { id: "godan-ite", ends: ["く"],             rule: "く → いて" },
  { id: "godan-ide", ends: ["ぐ"],             rule: "ぐ → いで" },
  { id: "godan-shite", ends: ["す"],           rule: "す → して" },
];

const BANK_BY_READING = new Map(CONJ_BANK.map((w) => [w.reading, w]));

export function subRuleFor(word) {
  if (!word) return null;
  if (word.type !== "godan") return word.type || null;
  const last = (word.dict || "").slice(-1);
  const hit = GODAN_GROUPS.find((g) => g.ends.includes(last));
  return hit ? hit.id : "godan";
}

/* "conj:たべる|p-te" -> { reading: "たべる", form: "p-te" }. Returns null for anything that is
   not a conjugation row, which is most of the evidence log. */
export function parseConjId(id) {
  if (typeof id !== "string") return null;
  const body = id.startsWith("conj:") ? id.slice(5) : id;
  const bar = body.lastIndexOf("|");
  if (bar <= 0) return null;
  const form = body.slice(bar + 1);
  if (!NODE_BY_FORM[form] && !CONJ_FORMS.some((f) => f.id === form)) return null;
  return { reading: body.slice(0, bar), form };
}

/* ── mastery per node, and per sub-rule underneath it ──
   Windowed like every other ability estimate: what you can do now, not ever. */
export function grammarProfiles(evidence = [], opts = {}) {
  const windowMs = (opts.days || 60) * 86400000;
  const now = opts.now || Date.now();

  const counts = {};
  for (const e of evidence || []) {
    if (!e) continue;
    if (now - (e.at || 0) > windowMs) continue;
    const parsed = parseConjId(e.id);
    if (!parsed) continue;
    const node = NODE_BY_FORM[parsed.form];
    if (!node) continue;
    const row = counts[node.id] || (counts[node.id] = { n: 0, ok: 0, sub: {} });
    row.n += 1;
    if (e.ok) row.ok += 1;
    const sub = subRuleFor(BANK_BY_READING.get(parsed.reading));
    if (sub) {
      const s = row.sub[sub] || (row.sub[sub] = { n: 0, ok: 0 });
      s.n += 1;
      if (e.ok) s.ok += 1;
    }
  }

  const out = {};
  for (const node of GRAMMAR_NODES) {
    const c = counts[node.id] || { n: 0, ok: 0, sub: {} };
    const post = posterior(c.ok, Math.max(0, c.n - c.ok));
    const state = stateOf(post);
    const sub = {};
    for (const k of Object.keys(c.sub)) {
      const s = c.sub[k];
      const sp = posterior(s.ok, Math.max(0, s.n - s.ok));
      sub[k] = { n: s.n, ok: s.ok, mean: sp.mean, state: stateOf(sp),
                 measured: stateOf(sp) !== STATE.UNKNOWN };
    }
    out[node.id] = {
      id: node.id, act: node.act, title: node.title,
      n: c.n, ok: c.ok, mean: post.mean, width: post.width,
      state, measured: state !== STATE.UNKNOWN, sub,
    };
  }
  return out;
}

/* Is this node worth teaching yet? A node whose prerequisites are not holding is not
   "weak", it is PREMATURE — and the honest response is to send the learner to the
   prerequisite, not to drill the thing that depends on it.

   `blockedBy` names the prerequisite that is actually failing, so a UI can say "て-form
   needs plain past first" rather than showing a locked padlock and no reason. A prereq that
   has never been measured does NOT block: unknown is not weak here either, and refusing to
   ever ask would mean the evidence never arrives. */
export function nodeStatus(nodeId, profiles = {}, opts = {}) {
  const node = NODE_BY_ID[nodeId];
  if (!node) return null;
  const holding = opts.holding ?? 0.6;
  const blockedBy = [];
  for (const p of node.prereqs) {
    const row = profiles[p];
    if (row && row.measured && row.mean < holding) blockedBy.push(p);
  }
  const self = profiles[nodeId] || { measured: false, mean: null, state: STATE.UNKNOWN };
  return {
    id: nodeId, act: node.act, title: node.title,
    ready: blockedBy.length === 0,
    blockedBy,
    measured: self.measured,
    mean: self.measured ? self.mean : null,
    state: self.state,
  };
}

/* The sub-rule most worth a focused drill: measured, failing, and the worst of them.
   Returns null rather than guessing when nothing has enough evidence — the "Explain &
   Drill" micro-lesson should only fire on something actually observed. */
export function weakestSubRule(nodeId, profiles = {}, opts = {}) {
  const row = profiles[nodeId];
  if (!row || !row.sub) return null;
  const floor = opts.floor ?? 0.6;
  let worst = null;
  for (const k of Object.keys(row.sub)) {
    const s = row.sub[k];
    if (!s.measured || s.mean >= floor) continue;
    if (!worst || s.mean < worst.mean) worst = { rule: k, ...s };
  }
  if (!worst) return null;
  const group = GODAN_GROUPS.find((g) => g.id === worst.rule);
  return { ...worst, explain: group ? group.rule : null };
}

/* Every node that an act teaches. The knowledge map asks this: an act's grammar row should
   list the forms the book introduces there, not every form in the language. */
export function nodesForAct(act) {
  return GRAMMAR_NODES.filter((n) => n.act === act);
}
