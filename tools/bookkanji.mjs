/* ── textbook kanji, known through words ──
   The Volume 2 textbook numbers 133 kanji and introduces them scene by scene
   (src/data/book-kanji.js). Two things follow from that, and this module does both:

   1. ORDER. The characters the app unlocks next are the book's next characters, not the
      next by newspaper frequency. Kanji already studied stay in rotation whatever their
      position — reordering must never take away something being learned.

   2. WHAT "KNOWING" A KANJI MEANS. Recognising 食 next to the word "eat" is not the skill;
      reading 食べる and 食堂 is, and the reading 食 takes depends on the word. So a textbook
      kanji's standing is read from the WORDS in the deck that contain it, through the same
      proven levels as everything else (tools/proven.mjs): a kanji is as known as the best
      word it has been produced in, and the count of words says how far that reaches. */

import { BOOK_KANJI } from "../src/data/book-kanji.js";
import { LEVEL, LEVEL_ORDER } from "./proven.mjs";

export const BOOK_ORDER = new Map(BOOK_KANJI.map(([n, c, sec]) => [c, { n, sec }]));

/* Book kanji first, in book order; everything else after, in the order given. */
export function bookOrdered(list = []) {
  const book = [], rest = [];
  for (const k of list) (BOOK_ORDER.has(k.c) ? book : rest).push(k);
  book.sort((a, b) => BOOK_ORDER.get(a.c).n - BOOK_ORDER.get(b.c).n);
  return [...book, ...rest];
}

/* The unlocked set: the frontier of the ordered list, plus anything already seen. The
   frontier grows by `batch` as characters reach level 4, exactly as before. */
export function unlockedFrom(ordered = [], stats = {}, batch = 12) {
  const st = (c) => (stats && stats[c]) || {};
  const mastered = ordered.filter((k) => (st(k.c).level || 0) >= 4).length;
  const frontier = Math.min(ordered.length, batch * (Math.floor(mastered / batch) + 2));
  const out = ordered.slice(0, frontier);
  const inSet = new Set(out.map((k) => k.c));
  for (const k of ordered.slice(frontier)) if ((st(k.c).seen || 0) > 0 && !inSet.has(k.c)) out.push(k);
  return out;
}

const rank = (level) => LEVEL_ORDER.indexOf(level);

/* Each textbook kanji with the deck words that contain it and how well those are known.
   `levels` is a Map id -> { level } from proven.mjs::levelsFor. */
export function bookKanjiStatus(cards = [], levels = new Map()) {
  return BOOK_KANJI.map(([n, c, sec]) => {
    const words = cards.filter((w) => w && typeof w.term === "string" && w.term.includes(c));
    const tally = Object.fromEntries(LEVEL_ORDER.map((l) => [l, 0]));
    let best = LEVEL.NEW;
    for (const w of words) {
      const l = (levels.get(w.id) || {}).level || LEVEL.NEW;
      tally[l]++;
      if (rank(l) > rank(best)) best = l;
    }
    return { n, c, sec, act: parseInt(sec, 10), words: words.length, best, tally,
             /* words that are at least "can recall": the kanji has been read in them */
             recalled: tally[LEVEL.RECALLS] + tally[LEVEL.MASTERED] };
  });
}

/* Totals for the headline: how many of the 133 are mastered / recalled through a word. */
export function bookKanjiSummary(status = []) {
  const s = { total: status.length, mastered: 0, recalls: 0, started: 0, noWords: 0 };
  for (const k of status) {
    if (!k.words) s.noWords++;
    if (k.best === LEVEL.MASTERED) s.mastered++;
    else if (k.best === LEVEL.RECALLS) s.recalls++;
    if (k.best !== LEVEL.NEW) s.started++;
  }
  return s;
}
