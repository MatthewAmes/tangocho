import React, { createContext, useContext, useMemo } from "react";
import Furigana from "./Furigana.jsx";
import { annotate } from "../../tools/furigana.mjs";
import { useReadingPrefs } from "../lib/readingPrefs.js";

/* Japanese text with readings over its kanji, for the sentence drills whose lines carry
   none (tools/furigana.mjs). The reading dictionary — the deck, then the 10,000-word list —
   is built once at the top of the app and handed down here, so no exercise has to thread
   it through. Follows the ふりがな switch from the Scripts tab. */
export const LexContext = createContext(null);

export default function Ruby({ text }) {
  const lex = useContext(LexContext);
  const [rp] = useReadingPrefs();
  const tokens = useMemo(() => annotate(text, lex), [text, lex]);
  return <Furigana tokens={tokens} show={rp.furigana} />;
}
