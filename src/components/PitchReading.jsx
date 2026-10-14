import React from "react";
import { contour, patternName, accentOf, readingFor } from "../lib/pitch.js";

/* A reading with its pitch drawn on it: a line over the high morae and a small hook where
   the pitch drops. Nothing at all when the accent is not known — a wrong contour would be
   learned as confidently as a right one. */
export default function PitchReading({ card, kana, accent, className = "", fallback = null }) {
  const k = kana || readingFor(card);
  const a = typeof accent === "number" ? accent : accentOf(card);
  const c = a === null || a === undefined ? null : contour(k, a);
  if (!c) return fallback;
  return (
    <span className={"tc-pitch " + className} lang="ja" title={`Pitch: ${patternName(k, a)}`}
          aria-label={`${k}, pitch accent ${a}`}>
      {c.map((x, i) => (
        <span key={i} className={"tc-mora" + (x.high ? " is-high" : "") + (x.drop ? " is-drop" : "")}>{x.m}</span>
      ))}
    </span>
  );
}
