/* ── context, built from material the app already owns ──
   Every review put contextual use at the bottom of the scorecard, and they were right:
   knowing 取る = "take" says nothing about 写真を撮る, 休みを取る or メモを取る. Dictionary
   knowledge is not usage knowledge, and a word should not reach "mastery" on translation
   alone.

   The obvious way to build this is to have a language model write sentences. That costs
   money per sentence and needs a key. It is also unnecessary here, because the app ships
   with 227 lines of scripted dialogue — real Japanese, already levelled to this course,
   already carrying English translations and readings. Mining a blank out of an authentic
   sentence the learner has actually studied is better material than a generated one, and
   it costs nothing.

   The honest limit: coverage is whatever the scripts happen to contain. A word that never
   appears in a dialogue gets no contextual exercise, and the model reports "no evidence"
   for its context dimension rather than pretending otherwise. */

import { pickDistractors } from "./distractors.mjs";

/* Flatten a script line into plain Japanese text. */
export function lineText(line) {
  return ((line && line.tokens) || []).map((t) => t.t || "").join("");
}

/* Build term -> [occurrences] from the scripts. Longer terms win when several match, so
   食べ物 is blanked as one word rather than leaving 食べ inside it. */
export function buildClozeIndex(scripts = [], cards = []) {
  const byTerm = new Map();
  const terms = cards
    .map((c) => ({ id: c.id, term: c.term, reading: c.reading }))
    .filter((c) => c.term && c.term.length >= 2)          // single characters match noise
    .sort((a, b) => b.term.length - a.term.length);

  for (const script of scripts) {
    for (const line of (script && script.lines) || []) {
      const text = lineText(line);
      if (!text || !line.en) continue;
      for (const c of terms) {
        const at = text.indexOf(c.term);
        if (at < 0) continue;
        // A sentence that IS the word teaches nothing about using it.
        if (text.replace(/[。、！？\s]/g, "") === c.term) continue;
        if (!byTerm.has(c.id)) byTerm.set(c.id, []);
        const list = byTerm.get(c.id);
        if (list.length < 4) {
          list.push({ text, at, en: line.en, romaji: line.romaji || "", script: script.name || script.id });
        }
      }
    }
  }
  return byTerm;
}

/* A mined word arrives with the sentence it was found in, which is better contextual
   material than anything the scripts can offer: it is real Japanese, it is about something
   the learner chose to read, and it is the exact context in which they failed to understand
   the word. Folded into the same index so the rest of the app cannot tell the difference
   between a scripted line and a mined one. */
export function addMinedSources(index, cards = []) {
  const out = index instanceof Map ? index : new Map();
  for (const c of cards) {
    if (!c || !c.mined || !c.source || !c.term) continue;
    const at = c.source.indexOf(c.term);
    if (at < 0) continue;
    // A "sentence" that is only the word teaches nothing about using it.
    if (c.source.replace(/[。、！？s]/g, "") === c.term) continue;
    const list = out.get(c.id) || [];
    if (list.some((h) => h.text === c.source)) continue;
    list.push({ text: c.source, at, en: c.meaning || "", romaji: "", script: c.sourceLabel || "what you read" });
    out.set(c.id, list);
  }
  return out;
}

/* Does this item have any contextual material at all? Drives the `context` capability, so
   the scheduler never reserves a context slot it cannot fill. */
export function hasContext(index, id) {
  const list = index && index.get ? index.get(id) : null;
  return !!(list && list.length);
}

/* One cloze exercise: the sentence with the word replaced by a blank, plus the English so
   the task is "which word belongs here", not "guess the sentence". */
export function clozeFor(index, card, opts = {}) {
  const list = index && index.get ? index.get(card.id) : null;
  if (!list || !list.length) return null;
  // Deterministic pick so a reload does not reshuffle the question mid-answer.
  const seed = opts.seed == null
    ? String(card.id).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)
    : opts.seed;
  const hit = list[seed % list.length];
  const blank = "＿".repeat(Math.max(2, card.term.length));
  return {
    id: card.id,
    term: card.term,
    reading: card.reading || "",
    before: hit.text.slice(0, hit.at),
    after: hit.text.slice(hit.at + card.term.length),
    blank,
    sentence: hit.text.slice(0, hit.at) + blank + hit.text.slice(hit.at + card.term.length),
    en: hit.en,
    source: hit.script,
  };
}

/* Options for a contextual multiple choice, answer included and deterministically shuffled.
   The wrong ones come from pickDistractors, so they are drawn by curriculum priority —
   confusion history, then the same act-scene, then nearby scenes, then words that sound
   alike — rather than the "same kind, similar length" stand-in this used before. */
export function clozeChoices(card, cards, n = 3, seed = 0, confusedWith = []) {
  const picked = pickDistractors(card, cards, n, { confusedWith, seed });
  const all = [...picked.map((p) => p.card), card];
  return all.map((c, i) => ({ c, k: (seed + i * 31) % all.length })).sort((a, b) => a.k - b.k).map((x) => x.c);
}
