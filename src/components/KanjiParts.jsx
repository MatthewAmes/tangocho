import React from "react";
import { partsOf, lookalikesOf, kanjiDiff, diffSentence } from "../../tools/lookalike.mjs";

/* What a kanji is built from, and what it is easily mistaken for (tools/lookalike.mjs).
   `all` is the kanji list the tab is showing, for the meanings of the lookalikes; the
   lookalikes are kept to that list, so nothing is offered that the app cannot explain.
   `prefer` (kanji in the learner's own words) moves those to the front: 待 looks like
   several kanji, and the one worth knowing is 持, because 持つ is in the deck. */
export default function KanjiParts({ c, all = [], prefer = null }) {
  const parts = partsOf(c);
  const byC = new Map(all.map((k) => [k.c, k]));
  const gloss = (x) => { const k = byC.get(x); return k && k.m ? k.m[0] : ""; };
  const found = lookalikesOf(c, byC.size ? new Set(byC.keys()) : null);
  const looks = (prefer ? [...found.filter((x) => prefer.has(x)), ...found.filter((x) => !prefer.has(x))] : found).slice(0, 3);
  if (!parts.length && !looks.length) return null;
  const first = looks.length ? diffSentence(kanjiDiff(c, looks[0]), gloss) : null;
  return (
    <div className="tc-kparts" lang="ja">
      {parts.length > 0 && (
        <p><b>Parts</b> {parts.map((p, i) => <span key={i} className="tc-kpart">{p.show} <i>{p.name}</i></span>)}</p>
      )}
      {looks.length > 0 && (
        <p><b>Looks like</b> {looks.map((x) => <span key={x} className="tc-kpart">{x} <i>{gloss(x)}</i></span>)}</p>
      )}
      {first && <p className="tc-lknote">{first}</p>}
    </div>
  );
}
