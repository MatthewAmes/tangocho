/* ── sentence mining ──
   Turning what you actually read into what you actually study.

   The app already knows how to read a Japanese text and say which words are unknown —
   `coverageAgainstDeck` does it, and it is careful about inflection so 勉強しました counts as
   one known word rather than a gap. What it never did was let you keep anything. You pasted
   a paragraph, saw a percentage, and closed the tab.

   Mining keeps the words, AND the sentence they came from. That second half is the point.
   A card that says 持ってくる = "bring (a thing)" has been answered 22 times at 32%; the
   reason is that 持ってくる is not a word so much as a construction, and a dictionary gloss
   for a construction teaches nothing. The sentence is the unit that carries the grammar.

   ── the displacement rule ──

   Mining is a firehose, and pointing a firehose at this deck would make it worse. There are
   already 1,058 words never touched and 379 that would not survive a day; adding 500 more
   would not produce a better learner, it would produce a longer list.

   So every mined word DISPLACES an untouched textbook word rather than joining it. The
   number of words competing for attention stays fixed; what changes is that the words in
   the queue are ones you met in something you chose to read. Nothing is deleted — parked
   words keep their place and come back when there is room. */

/* Sentence boundaries. Japanese punctuation plus the newline, because pasted text from a
   web page is often line-broken rather than punctuated. */
export function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/* term -> { reading, meaning, rank } from the shipped frequency list. This is the only
   dictionary the app has, and it is the reason mining can work offline and for free: a
   mined surface form is looked up here rather than sent anywhere. */
export function makeLexicon(freqWords = []) {
  const m = new Map();
  for (const w of freqWords) {
    if (!w || !w.t) continue;
    if (!m.has(w.t)) m.set(w.t, { term: w.t, reading: w.r || w.t, meaning: w.m || "", rank: w.k || 0, pos: w.p || "" });
  }
  return m;
}

/* Short kana strings are where the frequency list's glosses are worst — it lists の as
   "field" and に as "load", homographs of the particles. Mining those would inject
   confident nonsense into the deck, so a candidate has to clear a bar before it counts. */
export function minable(term, entry) {
  if (!term || term.length < 2) return false;
  if (!entry || !entry.meaning) return false;
  const kana = /^[ぁ-んァ-ヶー]+$/.test(term);
  if (kana && term.length < 3) return false;      // で, から, ます — grammar, not vocabulary
  return true;
}

/* What is worth learning from this text.

   `unknownOf` is the app's own coverage scanner, passed in rather than imported so this
   module stays testable without the app. It returns the surface forms that were not
   matched against the deck. */
export function mine(text, opts = {}) {
  const lexicon = opts.lexicon || new Map();
  const unknownOf = opts.unknownOf;
  const known = opts.known || new Set();
  const sentences = sentencesOf(text);

  /* Per sentence, so every candidate carries the context it appeared in. A word met in
     three sentences keeps the shortest one — fewer unknown words around the target means
     the sentence can actually be read. */
  const found = new Map();
  for (const s of sentences) {
    const unknown = unknownOf ? unknownOf(s) : [];
    for (const u of unknown) {
      const term = typeof u === "string" ? u : u.w;
      if (!term || known.has(term)) continue;
      const entry = lexicon.get(term);
      if (!minable(term, entry)) continue;
      if (!found.has(term)) found.set(term, { ...entry, count: 0, sentence: s, seenIn: [] });
      const rec = found.get(term);
      rec.count++;
      if (s.length < rec.sentence.length) rec.sentence = s;
      if (rec.seenIn.length < 3) rec.seenIn.push(s);
    }
  }

  /* Ordered by what will pay off soonest: words that recur in this text first, then by
     corpus frequency. A word you just met three times in one chapter is worth more than a
     rarer one you met once, and both beat a word ranked 9,000th. */
  const candidates = [...found.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (a.rank || 99999) - (b.rank || 99999);
  });

  return { sentences: sentences.length, candidates };
}

/* Turn a candidate into a deck card. `source` is what makes it more than a glossary entry:
   the sentence travels with the word and becomes its contextual exercise. */
export function cardFor(candidate, opts = {}) {
  return {
    term: candidate.term,
    reading: candidate.reading || candidate.term,
    meaning: candidate.meaning || "",
    romaji: "",
    emoji: "",
    mined: true,
    /* Where it came from, kept so the word can be asked in context and so you can see why
       it is in your deck at all. */
    source: candidate.sentence || "",
    sourceLabel: opts.label || "",
    minedAt: opts.at || Date.now(),
  };
}

/* ── the displacement rule ──
   Park one untouched word for every mined word added, so the active set does not grow.

   Only words you have NEVER answered are eligible. Parking something you are part-way
   through would throw away exactly the progress this whole exercise is meant to protect.
   Later lessons go first, because they are furthest from what you are working on. */
export function displacementPlan(deck = [], addCount = 0, opts = {}) {
  if (!addCount) return { park: [], shortfall: 0 };
  const eligible = deck.filter((c) =>
    c && !c.parked && !(c.seen > 0) && !c.mined && c.id);

  /* Furthest-out first: the highest lesson number, and within a lesson the later entries.
     These are the words the scheduler would have reached last anyway. */
  const ordered = eligible.sort((a, b) => (b.lesson || 0) - (a.lesson || 0));
  const park = ordered.slice(0, addCount).map((c) => c.id);
  return { park, shortfall: Math.max(0, addCount - park.length) };
}

/* Bring parked words back when the active set has room — a word displaced in March should
   not be gone forever because you read a manga that week. Called when mined words get
   retired or the deck shrinks. */
export function unparkPlan(deck = [], room = 0) {
  if (!room) return [];
  return deck
    .filter((c) => c && c.parked)
    .sort((a, b) => (a.lesson || 0) - (b.lesson || 0))
    .slice(0, room)
    .map((c) => c.id);
}

/* A short human summary for the mining screen. Says what will happen BEFORE it happens,
   because silently retiring words from someone's deck would be an unpleasant surprise. */
export function describePlan(addCount, plan) {
  if (!addCount) return "Nothing selected.";
  const parked = plan.park.length;
  const parts = [`Adding ${addCount} word${addCount === 1 ? "" : "s"} from what you read.`];
  if (parked) {
    parts.push(`${parked} textbook word${parked === 1 ? "" : "s"} you have not started yet will step aside to make room — they come back later, nothing is deleted.`);
  }
  if (plan.shortfall) {
    parts.push(`${plan.shortfall} of them will grow the deck, because there are no untouched words left to park.`);
  }
  return parts.join(" ");
}
