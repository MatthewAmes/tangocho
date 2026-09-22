/* ── checkpoint follow-up ──
   The checkpoint is a test the app is not allowed to teach during. That is what makes its
   number honest, and it is also why its most useful output used to evaporate: the result
   screen listed what you missed, promised those words "go back into normal study now", and
   then threw the list away. They did not go back into study either — every checkpoint word
   is quarantined from Smart Review for the whole ninety-day cycle.

   This module closes that gap without weakening the test:

   1. A word that has been ASKED is spent as a test item. It leaves the quarantine and
      rejoins study. What remains of the reserve is still a uniform random subset of the
      deck (the asked words were themselves a uniform draw from it), so later checkpoints in
      the same cycle stay exactly as honest as the first.
   2. The misses are kept, so they can be worked on straight away — near misses first,
      because a word one character off is the cheapest word in the deck to finish learning.
   3. Each miss is explained in terms of what actually went wrong. "One character off" is a
      measurement; "you dropped the small っ" is something a learner can fix. And when what
      was typed is ANOTHER word in the deck, that is a confusion pair, which needs the two
      words side by side rather than more drilling of either one. */

import { acceptedForms, normalise, glossOf, cycleFor } from "./benchmark.mjs";
import { classifyFailure, editDistance } from "./learner.mjs";

/* How many to work on in one go. Twelve typed items with a retry each is about four
   minutes, which is short enough to do on the result screen and long enough to matter. */
export const FOLLOW_UP_MAX = 12;
/* A follow-up stops being offered after this. A month-old miss is not a near miss any more
   — the reviews have had their say about that word since, one way or the other. */
export const FOLLOW_UP_DAYS = 30;

/* Every word asked by a checkpoint in this cycle. Runs saved before `asked` was recorded
   contribute nothing, which is the conservative reading: those words stay quarantined. */
export function spentIds(history = [], cycle = cycleFor()) {
  const out = new Set();
  for (const r of Array.isArray(history) ? history : []) {
    if (!r || !Array.isArray(r.asked) || cycleFor(r.at) !== cycle) continue;
    for (const id of r.asked) out.add(id);
  }
  return out;
}

/* The quarantine as it stands now: the cycle's reserve, less what has been spent. Smart
   Review excludes exactly this set and the checkpoint samples from exactly this set, so the
   two can never disagree about which words are still test words. */
export function liveReserve(reserve, history = [], cycle = cycleFor()) {
  const spent = spentIds(history, cycle);
  if (!spent.size) return reserve;
  const out = new Set();
  for (const id of reserve) if (!spent.has(id)) out.add(id);
  return out;
}

/* Record that the follow-up for a run was worked through. Stored on the run itself, so
   there is no second list to drift from the first. Ids already fixed stay fixed. */
export function markFixed(history = [], at, ids = []) {
  return (Array.isArray(history) ? history : []).map((r) => {
    if (!r || r.at !== at) return r;
    const fixed = new Set([...(r.fixed || []), ...ids]);
    return { ...r, fixed: [...fixed] };
  });
}

/* Another card in the deck that the typed answer IS. かようび typed for "Wednesday" is not a
   misspelling of すいようび; it is Tuesday, correctly spelled, and the learner needs to see
   the two days next to each other. */
export function confusedWith(got, card, cards = []) {
  const g = normalise(got);
  if (!g) return null;
  for (const c of cards) {
    if (!c || c.id === card.id || !c.term) continue;
    if (acceptedForms(c).has(g)) return c;
  }
  return null;
}

/* ── naming the slip ──
   The handful of mistakes that account for most "one character off" answers in beginner
   Japanese, each of which has a specific fix. Checked in this order because they are
   mutually exclusive on a single-character difference and the cheap tests go first. */
const SMALL = { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゎ": "わ" };
const bigger = (s) => [...s].map((ch) => SMALL[ch] || ch).join("");
/* Voicing marks come apart under NFD: が is か followed by U+3099. */
const unvoiced = (s) => s.normalize("NFD").replace(/[゙゚]/g, "").normalize("NFC");

const ROW = {};
for (const [v, chars] of Object.entries({
  a: "あかさたなはまやらわがざだばぱゃ", i: "いきしちにひみりぎじぢびぴ",
  u: "うくすつぬふむゆるぐずづぶぷゅ", e: "えけせてねへめれげぜでべぺ",
  o: "おこそとのほもよろをごぞどぼぽょ",
})) for (const ch of chars) ROW[ch] = v;
/* Which extra vowel lengthens a syllable of each row: おう and おお both lengthen o, えい
   and ええ both lengthen e. */
const LENGTHENS = { a: "あ", i: "い", u: "う", e: "いえ", o: "うお" };

function longVowelOnly(a, b) {
  // true when `long` is `short` with one lengthening vowel inserted
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (long.length !== short.length + 1) return false;
  for (let i = 1; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) !== short) continue;
    const v = ROW[long[i - 1]];
    if (v && LENGTHENS[v].includes(long[i])) return true;
  }
  return false;
}

/* What went wrong, in a form the screen can explain. `kind` is stable for tests and for
   evidence; `note` is what the learner reads. */
export function slipOf(got, want, other = null) {
  const g = normalise(got), w = normalise(want);
  if (!g) return { kind: "blank", note: "It didn't come to you — learn it fresh, then type it once from memory." };
  if (other) {
    return { kind: "confusion", note: `${g} is a different word — ${other.term}${other.reading && other.reading !== other.term ? ` (${other.reading})` : ""}, “${glossOf(other)}”. Keep the two apart.` };
  }
  if (g === w) return { kind: "none", note: "" };
  if (g.length === w.length && unvoiced(g) === unvoiced(w)) {
    return { kind: "voicing", note: "Right sounds, wrong ゛ mark — check which syllable is voiced." };
  }
  if (g.length === w.length && bigger(g) === bigger(w)) {
    return { kind: "small-kana", note: "It's the small ゃ・ゅ・ょ — きゃ is one sound, きや is two." };
  }
  if (g.replace(/っ/g, "") === w.replace(/っ/g, "") && g !== w) {
    return { kind: "sokuon", note: "The small っ — a short pause before the next sound." };
  }
  if (longVowelOnly(g, w)) {
    return { kind: "long-vowel", note: w.length > g.length ? "A long vowel — hold that sound twice as long." : "No long vowel here — keep that sound short." };
  }
  const failure = classifyFailure({ format: "type", expected: w, got: g });
  if (failure === "conjugation") return { kind: "conjugation", note: "Right word, wrong form — the dictionary form is what's asked." };
  if (failure === "reading") return { kind: "reading", note: "Nearly — the highlighted sounds are the ones that differ." };
  return { kind: "different", note: "A different word — this one needs learning properly." };
}

/* Character-level alignment of the answer against the target, for highlighting. Each
   character of `want` is marked `miss` when it is not part of the longest common
   subsequence with what was typed — which is exactly "the sounds you got wrong or left
   out", without pretending to know which typed character was meant for which. */
export function slipMarks(got, want) {
  const a = [...normalise(got)], b = [...String(want || "")];
  const nb = b.map((ch) => normalise(ch) || ch);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = a[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Array(b.length).fill(false);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === nb[j]) { hit[j] = true; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return b.map((ch, k) => ({ ch, miss: !hit[k] }));
}

const RANK = { near: 0, wrong: 1, blank: 2 };

/* Which accepted form to compare against. A glossary entry like 実験（する） accepts both
   じっけん and じっけんする, and a slip should be measured against the one the learner was
   reaching for, not whichever happens to be listed first. The reading's forms are preferred
   because the answer was typed as kana. */
export function wantFor(card, got) {
  const g = normalise(got);
  const fromReading = card.reading ? acceptedForms({ reading: card.reading }) : new Set();
  const forms = [...(fromReading.size ? fromReading : acceptedForms(card))];
  if (!forms.length) return card.reading || card.term || "";
  if (!g) return forms[0];
  let best = forms[0], d0 = Infinity;
  for (const f of forms) { const d = editDistance(g, f); if (d < d0) { d0 = d; best = f; } }
  return best;
}

/* The work to do: the latest checkpoint's misses that are not fixed yet. Near misses
   first, then wrong answers (a confusion pair is in there), then blanks — cheapest to
   finish first, so a short sitting still clears the words closest to known. */
export function followUpFor(history = [], cards = [], { now = Date.now(), limit = FOLLOW_UP_MAX } = {}) {
  const list = Array.isArray(history) ? history : [];
  let run = null;
  for (let k = list.length - 1; k >= 0; k--) {
    if (list[k] && Array.isArray(list[k].missed)) { run = list[k]; break; }
  }
  if (!run || now - run.at > FOLLOW_UP_DAYS * 86400000) return { run: null, items: [] };
  const byId = new Map(cards.filter(Boolean).map((c) => [c.id, c]));
  const fixed = new Set(run.fixed || []);
  const items = [];
  for (const m of run.missed) {
    const card = byId.get(m.id);
    if (!card || fixed.has(m.id)) continue;
    const got = String(m.got || "");
    const kind = !got.trim() ? "blank" : m.near ? "near" : "wrong";
    const other = kind === "wrong" ? confusedWith(got, card, cards) : null;
    const want = wantFor(card, got);
    items.push({ card, got, kind, other, want, slip: slipOf(got, want, other) });
  }
  items.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  return { run, items: items.slice(0, limit), total: items.length };
}
