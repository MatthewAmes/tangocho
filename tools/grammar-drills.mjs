/* ── Volume 2 grammar, drilled ──
   The textbook's grammar notes (src/data/book-grammar.js) are most of what Volume 2
   teaches, and until now the app modelled ten of them — all plain conjugation. This makes
   a practice item for every note whose answer can be built MECHANICALLY: a verb form plus a
   fixed ending (食べる + 〜てみる → たべてみる). The verb forms come from the tested
   conjugation engine (src/lib/conjugate.js), so no Japanese is invented and no answer can be
   wrong in a way a test would not catch.

   Notes that cannot be built that way — 〜さ nouns, embedded questions, んです nuances,
   sentence-final particles — are reported as "no drill yet" rather than approximated. A
   drill that accepts only one of several correct answers teaches the learner that correct
   Japanese is wrong, and that is worse than no drill.

   Each item is PRODUCTION: the learner types the whole form from the verb and the pattern's
   meaning. A textbook line that uses the pattern is attached as the example, found by the
   pattern's marker in the real Volume 2 scenes — shown, never generated. */

import { conjugate } from "../src/lib/conjugate.js";
import { CONJ_BANK } from "../src/data/conj-bank.js";
import { BOOK_GRAMMAR } from "../src/data/book-grammar.js";
import { hashSeed } from "./session.mjs";

const O_ROW = { "う": "お", "つ": "と", "る": "ろ", "む": "も", "ぶ": "ぼ", "ぬ": "の", "く": "こ", "ぐ": "ご", "す": "そ" };

/* Every form a pattern can be built on, for one verb (kana in, kana out). */
export function verbForms(v) {
  const c = conjugate(v.reading, v.type);
  if (!c || !c.te) return null;
  const stem = c.formal.presPos.replace(/ます$/, "");
  let vol;
  if (v.type === "ichidan") vol = stem + "よう";
  else if (v.reading === "する") vol = "しよう";
  else if (v.reading === "くる") vol = "こよう";
  else if (v.type === "godan" && O_ROW[v.reading.slice(-1)]) vol = v.reading.slice(0, -1) + O_ROW[v.reading.slice(-1)] + "う";
  return {
    dict: c.plain.presPos, nai: c.plain.presNeg, ta: c.plain.pastPos, te: c.te,
    stem, vol: vol || null, tara: c.plain.pastPos + "ら",
  };
}

const FORM_NAME = { dict: "dictionary form", nai: "ない-form", ta: "た-form", te: "て-form", stem: "stem (ます-form without ます)", vol: "volitional (let's)", tara: "た-form + ら" };

/* The drillable notes. `from` is the verb form the pattern attaches to, `add` what goes on
   the end, `gloss` what the pattern means (written here, not taken from the book), and
   `marker` finds the pattern in a textbook line for the example. */
export const PATTERNS = [
  { id: "7.12", from: "dict", add: "とおもう", gloss: "I think (someone) will …", marker: /と思|とおも|って思/ },
  { id: "8.1", from: "te", add: "みる", gloss: "try …-ing", marker: /[てで]み/ },
  { id: "8.4", from: "nai", add: "でください", gloss: "please don't …", marker: /ないで(?!しょう)(ください|くださ|ね|よ|[。！？、])/ },
  { id: "8.10", from: "ta", add: "ことがある", gloss: "have …-ed before (experience)", marker: /[ただ]こと[、,]?[がは]?あ/ },
  { id: "8.13", from: "dict", add: "だろう", gloss: "probably … (casual)", marker: /だろう/ },
  { id: "9.2", from: "dict", add: "のがすき", gloss: "like …-ing", marker: /のが(好|すき)|のは(好|すき)/ },
  { id: "9.5", from: "stem", add: "にいく", gloss: "go (somewhere) to …", marker: /に(行|い)[くきっか]|に来/ },
  { id: "9.15", from: "te", add: "から", gloss: "after …-ing, (then …)", marker: /[てで]から/ },
  { id: "10.1", from: "te", add: "おく", gloss: "… in advance, ahead of time", marker: /[てで]お[くきい]|[てで]おいた/ },
  { id: "10.2", from: "vol", add: "", gloss: "let's … (casual)", marker: /[よお]う[。か？！]|[よお]うよ/ },
  { id: "10.3", from: "dict", add: "ので", gloss: "because … (explaining a reason)", marker: /ので/ },
  { id: "10.8", from: "dict", add: "かもしれない", gloss: "might …, may …", marker: /かもしれ/ },
  { id: "10.13", from: "stem", add: "かた", gloss: "how to …, the way of …-ing", marker: /[いきしちにひみりぎびえけせてねべめれ]方/ },
  { id: "11.1", from: "tara", add: "", gloss: "if / when … (then …)", marker: /たら|だら/ },
  { id: "11.6", from: "stem", add: "すぎる", gloss: "… too much", marker: /すぎ|過ぎ/ },
  { id: "11.7", from: "dict", add: "ことにする", gloss: "decide to …", marker: /ことにし|ことにす/ },
  { id: "12.1", from: "te", add: "くれる", gloss: "(someone) … for me", marker: /[てで]くれ[るたてなま]|[てで]くださ[っる]/ },
  { id: "12.5", from: "te", add: "しまう", gloss: "end up …-ing; … completely", marker: /[てで]しま|ちゃ[うっ]|じゃ[うっ]/ },
  { id: "12.9", from: "te", add: "もらう", gloss: "have someone … (for me)", marker: /[てで]もら|[てで]いただ/ },
  { id: "12.13", from: "dict", add: "と", gloss: "whenever / if … (then naturally …)", marker: /[るうくすつむぶぐ]と[、,]/ },
  { id: "12.16", from: "ta", add: "まま", gloss: "leave …-ed as it is; while still …-ed", marker: /まま/ },
  { id: "12.17", from: "te", add: "ほしい", gloss: "want someone to …", marker: /[てで]ほし/ },
  { id: "12.18", from: "te", add: "あげる", gloss: "… for someone (else)", marker: /[てで]あげ|[てで]さしあげ/ },
  { id: "12.19", from: "dict", add: "ことになる", gloss: "it's been decided that …; it turns out …", marker: /ことにな/ },
];
export const PATTERN_BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));

/* Notes the existing conjugation drill already practises. */
export const COVERED_BY_CONJUGATION = { "7.1": "g-dict", "7.7": "g-plain-neg", "7.8": "g-plain-past" };

/* Verbs a person does on purpose. The patterns here are about choosing to act — try it,
   do it in advance, let's do it, please don't — and a state or an event makes them
   nonsense ("let's exist", "try being able to"), or has no volitional form at all (ある,
   できる). Humble 参る/伺う are left out too: 〜てみる on a humble verb is a register
   question, not the drill's. */
const NOT_DONE_ON_PURPOSE = new Set(["ある", "できる", "わかる", "おわる", "かかる", "かまう", "たすかる", "みえる", "あく", "こまる", "まいる", "うかがう", "まよう", "しる"]);
export const VERBS = CONJ_BANK.filter((v) => ["ichidan", "godan", "irregular"].includes(v.type)
  && !NOT_DONE_ON_PURPOSE.has(v.reading) && verbForms(v));

/* One item: a verb, a pattern, the answer, and how the answer is built. */
export function drillItem(patternId, verb) {
  const p = PATTERN_BY_ID.get(patternId);
  const f = verb && verbForms(verb);
  if (!p || !f || !f[p.from]) return null;
  return {
    pattern: p.id, verb: verb.dict, reading: verb.reading, meaning: verb.meaning,
    answer: f[p.from] + p.add,
    how: `${verb.dict} → ${FORM_NAME[p.from]} ${f[p.from]}${p.add ? " + " + p.add : ""}`,
  };
}

/* A session: the chosen notes INTERLEAVED — round-robin, never two of the same note in a
   row when there is more than one — each with a different verb, deterministic by seed. */
export function drillSession(patternIds, n = 10, seed = 1) {
  const ids = patternIds.filter((id) => PATTERN_BY_ID.has(id));
  if (!ids.length) return [];
  const verbs = VERBS.map((v) => ({ v, k: hashSeed(`gv:${seed}:${v.reading}`) })).sort((a, b) => a.k - b.k).map((x) => x.v);
  const order = ids.map((id) => ({ id, k: hashSeed(`gp:${seed}:${id}`) })).sort((a, b) => a.k - b.k).map((x) => x.id);
  const out = [];
  let vi = 0;
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const item = drillItem(order[i % order.length], verbs[vi++ % verbs.length]);
    if (item && !out.some((o) => o.pattern === item.pattern && o.reading === item.reading)) out.push(item);
  }
  return out;
}

/* A real textbook line that uses the pattern, for the example. `lines` are
   { ja, scene } from the Volume 2 scenes; the earliest scene that has one wins. */
export function bookExample(patternId, lines = []) {
  const p = PATTERN_BY_ID.get(patternId);
  if (!p) return null;
  const hit = lines.find((l) => l && l.ja && p.marker.test(l.ja));
  if (!hit) return null;
  const m = hit.ja.match(p.marker);
  return { scene: hit.scene, before: hit.ja.slice(0, m.index), match: m[0], after: hit.ja.slice(m.index + m[0].length) };
}

/* The whole inventory with what the app can do for each note. */
export function grammarInventory() {
  return BOOK_GRAMMAR.map((g) => ({
    ...g,
    drill: PATTERN_BY_ID.has(g.id) ? "drill" : COVERED_BY_CONJUGATION[g.id] ? "conjugation" : g.kind === "culture" ? "culture" : "none",
  }));
}
