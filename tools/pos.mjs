/* ── rough part of speech, from the English gloss ──
   Only exists to make multiple-choice distractors honest. The bug it fixes: asking for
   急ぎます against {to hurry, Who is it that cleaned up?, Vietnamese (language), break} is
   not a vocabulary question. Exactly one option is a verb, and the target visibly ends in
   ます, so the answer is recoverable from grammar alone without knowing 急ぐ at all.

   The Study tab already tried to avoid this — its comment says picking "Tuesday" out of
   {Tuesday, to swim, expensive, library} tests nothing — but it grouped by `kind`, which is
   the WRITING SYSTEM (hiragana/katakana/kanji), not the part of speech. Same-script
   distractors are no help; same-category ones are the whole point.

   Inferred from the English gloss because that is what the learner reads and compares. It
   is a heuristic over one deck's own conventions, not a parser, and it says UNKNOWN freely
   — a wrong category would group worse than no category. */

export const POS = {
  VERB: "verb", ADJ: "adj", PHRASE: "phrase", QUESTION: "question",
  NUMBER: "number", NAME: "name", NOUN: "noun", UNKNOWN: "unknown",
};

/* Leading article/marker text that should not decide the category. */
const stripLead = (s) => s.replace(/^\((?:[^)]*)\)\s*/, "").trim();

export function posOf(card) {
  const raw = String((card && card.meaning) || "").trim();
  if (!raw) return POS.UNKNOWN;
  const m = stripLead(raw);
  const low = m.toLowerCase();

  /* A question gloss ends in "?" — these are set phrases in this deck ("What does ~ mean?")
     and grouping them together keeps them from being the obvious odd one out. */
  if (/\?\s*$/.test(m)) return POS.QUESTION;

  // "to hurry", "to be grateful" — the deck's consistent verb convention
  if (/^to\s+\w/.test(low)) return POS.VERB;
  /* Set phrases and greetings are checked BEFORE the ます rule, not after. いただきます and
     お願いします end in ます and are not action verbs, and offering "Pleased to meet you" as a
     distractor for 急ぎます still lets the odd one out be picked by meaning-shape even once
     the grammar matches. */
  if (/\b(said|greeting|set phrase|lit\.|politely|informal parting)\b/.test(low)) return POS.PHRASE;
  if (/^(i|you|we|it|that|this|please|let's|thank)\b/.test(low) && m.split(/\s+/).length >= 3) return POS.PHRASE;

  // the Japanese side ending in ます is a polite verb regardless of how the gloss reads
  const term = String((card && card.reading) || (card && card.term) || "");
  if (/ます$/.test(term) || /ません$/.test(term)) return POS.VERB;

  if (/\b(-i adj|-na adj|adjective|i-adj|na-adj)\b/.test(low)) return POS.ADJ;
  if (/\bcounter\b|\bnumber\b|^\d/.test(low)) return POS.NUMBER;
  if (/\b(name|surname|given name)\b/.test(low)) return POS.NAME;


  return POS.NOUN;
}

/* Glosses in this deck often carry parenthetical grammar notes — "to hurry (u-verb; past:
   急いだ)". When the target has one and the distractors do not, the longest option is the
   answer, which is a second way to win without knowing the word. This trims the note for
   DISPLAY comparison purposes only; the card itself is untouched. */
export function shortGloss(meaning, max = 48) {
  let s = String(meaning || "").trim();
  s = s.replace(/\s*\((?:[^()]*)\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  s = s.split(/\s*;\s*/)[0].trim();          // first sense only
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s || String(meaning || "").trim();
}
