/* The 10,000 most frequent Japanese words, as study material for the rest of the app.

   The list itself ships as cf/public/freq.json (851 KB, ranked by corpus frequency, with
   reading, gloss and part of speech). It is deliberately NOT in the bundle: at 851 KB it
   would be the single largest thing in index.html, and most sessions never touch most of
   it. The app fetches it once and caches it.

   This module is the pure half — turning a raw row into a card, and deciding which words
   a session may draw on. Storage lives in the app, as everywhere else.

   ## Why a frontier rather than the whole list

   A session builder handed 10,000 candidates spends its time scoring words nobody will
   see. More importantly, the list is RANKED: word 30 is worth learning before word 3,000,
   so "which of these should I study" has an obvious answer that does not need computing.
   The pool is therefore everything already started, plus a small run of the next unstarted
   ranks — enough for the builder to choose from, in the order the corpus already put them.

   ## The stats shape

   Progress is a MAP keyed by term, holding only words actually studied. Ten thousand
   untouched records would be a megabyte of zeroes re-synced on every save. This was once
   an array of full records and two readers still expected that shape long after the
   writer changed — see freqStatsFrom, which accepts either.
*/

/** New words from the frequency list a day may introduce, when nothing says otherwise. */
export const FREQ_DEFAULT_QUOTA = 15;
/** How many unstarted words to offer the session builder beyond what it can introduce. */
export const FREQ_FRONTIER = 40;

/** A freq.json row -> the card shape the rest of the app uses.
 *  Rows are terse to keep the file small: t=term, r=reading, m=meaning, p=part of speech,
 *  k=rank. A word written in kana already has no separate reading, hence the fallback. */
export function freqCard(w, stat) {
  const term = w.t;
  return {
    id: term, term,
    reading: w.r || term,
    romaji: "",
    meaning: w.m || "",
    kind: /[一-龯]/.test(term) ? "kanji" : /^[゠-ヿー]+$/.test(term) ? "katakana" : "hiragana",
    rank: w.k, pos: w.p,
    seen: 0, correct: 0, ms: 0, msN: 0,
    ...(stat || {}),
  };
}

/** Read the stored progress whatever shape it is in.
 *  The array form is what the retired 10k tab wrote before it moved to a map; a stored
 *  array is converted rather than ignored, because ignoring it silently discards every
 *  word the learner had already studied. */
export function freqStatsFrom(stored) {
  if (!stored) return {};
  if (Array.isArray(stored)) {
    const map = {};
    for (const c of stored) {
      if (!c || !c.term || !((c.seen || 0) > 0)) continue;
      map[c.term] = {
        seen: c.seen, correct: c.correct || 0, level: c.level || 0, streak: c.streak || 0,
        last: c.last || 0, ease: c.ease || 1, fsrs: c.fsrs || null, ms: c.ms || 0, msN: c.msN || 0,
      };
    }
    return map;
  }
  return typeof stored === "object" ? stored : {};
}

/** Only studied words are kept, so the synced record stays proportional to real progress. */
export function freqStatsOf(cards) {
  const map = {};
  for (const c of cards || []) {
    if (!((c.seen || 0) > 0)) continue;
    map[c.term] = {
      seen: c.seen, correct: c.correct || 0, level: c.level || 0, streak: c.streak || 0,
      last: c.last || 0, ease: c.ease || 1, fsrs: c.fsrs || null, ms: c.ms || 0, msN: c.msN || 0,
    };
  }
  return map;
}

/** What a session may draw on: everything started, plus the next unstarted ranks.
 *  `room` is how many new words the day still allows; when it is 0 the frontier is empty
 *  and only review material comes back, which is what a daily new-word limit is for. */
export function freqPool(words, stats, { room = FREQ_DEFAULT_QUOTA, frontier = FREQ_FRONTIER } = {}) {
  const st = stats || {};
  const started = [], fresh = [];
  for (const w of words || []) {
    const s = st[w.t];
    if (s && (s.seen || 0) > 0) started.push(freqCard(w, s));
    else if (room > 0 && fresh.length < Math.min(frontier, room * 3)) fresh.push(freqCard(w, null));
  }
  return { started, fresh };
}
