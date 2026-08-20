/* ── kanji as part of words, not as characters with abstract meanings ──

   The kanji deck was answered 68 times at 99% correct. That is not a learner who has
   mastered kanji; it is a question that asks nothing. The card showed a character and its
   on/kun readings — 食 / ショク・く.う — and asked for a meaning from a list. Recognising
   "eat" next to 食 is barely a memory task, and it transfers to reading Japanese hardly at
   all, because no Japanese text contains a character sitting on its own with its
   dictionary readings printed underneath.

   What actually has to happen when reading is: see 食べる, know it says たべる. The reading a
   kanji takes depends on the word it is in — 食べる is た, 食事 is ショク — so a card that
   drills the character in isolation is teaching a list while the skill needs a word.

   So a kanji is asked INSIDE a word from the learner's own deck. The progress record stays
   keyed to the character, because what is being tracked is still "do you know this kanji";
   only the question changes. Where no word in the deck contains the character, the old
   isolated card is still used — that is a real limit, and inventing an example sentence
   would be worse than admitting it. */

/* The best word to teach a character through.

   Preference order, and the reasons:
   1. A word already studied. The character is the new thing; the word should be familiar,
      or the card is testing two unknowns at once and a failure says nothing about either.
   2. A word where the character does real work — 食べる over 定食 for a beginner — which in
      practice means a shorter word, since the character carries more of it.
   3. Earlier lessons, because they are closer to what is being worked on now. */
export function anchorFor(entry, opts = {}) {
  const words = (entry && entry.words) || [];
  const usable = words.filter((w) => w && w.term && w.reading && w.reading !== w.term);
  if (!usable.length) return null;

  const scored = usable.map((w) => ({
    w,
    studied: (w.seen || 0) > 0 ? 0 : 1,
    len: w.term.length,
    lesson: w.lesson || 999,
  }));
  scored.sort((a, b) => a.studied - b.studied || a.len - b.len || a.lesson - b.lesson);
  return scored[0].w;
}

/* Turn an isolated kanji card into one asked through a word.

   The identity is deliberately unchanged: same id, same src, same srcId. Everything that
   reads or writes progress keeps working, the Kanji tab still sees the same record, and
   the only difference is what appears on screen and what counts as a right answer. */
export function contextCardFor(card, anchor) {
  if (!card || !anchor) return card;
  return {
    ...card,
    /* Asked as the WORD. The reading of the word is the answer, because that is the thing
       reading Japanese actually requires. */
    term: anchor.term,
    reading: anchor.reading,
    meaning: anchor.meaning || card.meaning,
    /* Which character this card is really about, so the screen can point at it and so the
       explanation can say why this word is being shown. */
    kanji: card.srcId || card.term,
    kanjiMeaning: card.meaning,
    kanjiReadings: card.reading,
    inContext: true,
    kind: "kanji",
  };
}

/* Where in the displayed word the character sits, so the UI can highlight it rather than
   leaving the learner to hunt. Returns -1 when it is absent, which should not happen but
   must not throw if the deck and the index ever disagree. */
export function highlightAt(card) {
  if (!card || !card.inContext || !card.kanji) return -1;
  return String(card.term || "").indexOf(card.kanji);
}

/* Split a word into the part before the target character, the character, and the part
   after — everything the renderer needs to emphasise one character in a word. */
export function splitAround(card) {
  const at = highlightAt(card);
  const term = String((card && card.term) || "");
  if (at < 0) return { before: term, hit: "", after: "" };
  const k = String(card.kanji);
  return { before: term.slice(0, at), hit: term.slice(at, at + k.length), after: term.slice(at + k.length) };
}

/* Apply the whole thing to a kanji deck: each item gets its anchor if one exists.

   `index` is the app's deckKanjiIndex — character -> { words, n, studied }. Passed in
   rather than rebuilt so there is exactly one definition of which words contain which
   character. */
export function inContext(items = [], index, opts = {}) {
  if (!index || !index.get) return items;
  let withContext = 0;
  const out = items.map((it) => {
    const ch = it.srcId || it.term;
    const anchor = anchorFor(index.get(ch), opts);
    if (!anchor) return it;
    withContext++;
    return contextCardFor(it, anchor);
  });
  out.withContext = withContext;
  return out;
}

/* How much of the kanji deck can be taught this way at all. Worth surfacing: if it is low,
   the answer is more vocabulary, not more kanji drilling. */
export function contextCoverage(items = [], index) {
  if (!index || !index.get) return { total: items.length, covered: 0 };
  let covered = 0;
  for (const it of items) if (anchorFor(index.get(it.srcId || it.term))) covered++;
  return { total: items.length, covered };
}
