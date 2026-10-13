/* ── a word as the learner should see it ──
   The course glossary writes verbs with their class and past form attached:
   通う(-u; 通った), 遅れる (-RU; 遅れた), びっくりする (IRR). That annotation is useful in a
   glossary and noise on a flashcard — and in a few rows it reached the READING too
   ("びっくりする (IRR)"), so a typed answer could never be marked right.

   The stored deck keeps the original text: card merge keys are built from the term, so
   rewriting it would orphan every card's progress. This cleans it at the point of showing
   and checking, and leaves frames like "(X に)" and optional parts like "(な)" or "(する)"
   alone — those are part of how the word is used, not notes about its conjugation. */

const CONJ_NOTE = /\s*[（(]\s*-?(?:RU|U|ARU|IRR)\b[^)）]*[)）]?/gi;

export function cleanWord(s) {
  return String(s == null ? "" : s).replace(CONJ_NOTE, "").trim();
}

/* A card with its term and reading cleaned for a session. Everything else, the id above
   all, is untouched. */
export function sessionCard(c) {
  if (!c) return c;
  const term = cleanWord(c.term), reading = cleanWord(c.reading);
  return term === c.term && reading === c.reading ? c : { ...c, term, reading };
}
