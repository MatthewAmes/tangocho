/* ── pitch accent ──
   Tokyo Japanese marks each word with an accent number: the mora after which the pitch
   drops. 0 means it never drops within the word (heiban: low, then high and staying high);
   1 means high on the first mora and low after (atamadaka); n means low, high up to mora
   n, then a drop (nakadaka, or odaka when n is the last mora — the drop then falls on the
   particle after it). The numbers come from Kanjium (CC BY-SA 4.0), built into
   src/data/pitch.js by tools/build-pitch.mjs.

   This module only turns a reading and a number into what to draw. Pure. */

import { PITCH } from "../data/pitch.js";

const hira = (s) => String(s || "").replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const NOTE = /\s*[（(]\s*-?(?:RU|U|ARU|IRR)\b[^)）]*[)）]?/gi;
const plain = (s) => String(s || "").replace(NOTE, "").replace(/[（(][^）)]*[）)]/g, "").replace(/[〜~↓↑\s]/g, "").trim();

/* The accent for a card: the 10k list carries its own; deck words are looked up by word and
   reading together (src/data/pitch.js). null when unknown — and unknown is drawn as nothing. */
export function accentOf(card) {
  if (!card) return null;
  if (typeof card.accent === "number") return card.accent;
  const t = plain(card.term), r = hira(plain(card.reading || card.term));
  for (const k of [t + "|" + r, r + "|" + r]) if (Object.prototype.hasOwnProperty.call(PITCH, k)) return PITCH[k];
  return null;
}
export const readingFor = (card) => hira(plain((card && (card.reading || card.term)) || ""));

const SMALL = new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ");

/* Morae, not characters: きょう is きょ・う (two), がっこう is が・っ・こ・う (four).
   Small ゃゅょ and small vowels join the mora before them; っ, ん and ー are morae of
   their own. */
export function morae(kana) {
  const out = [];
  for (const ch of String(kana || "")) {
    if (SMALL.has(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/* [{ m, high, drop }] — drop marks the mora the pitch falls AFTER. */
export function contour(kana, accent) {
  const ms = morae(kana);
  const n = Number(accent);
  if (!ms.length || !Number.isInteger(n) || n < 0 || n > ms.length) return null;
  return ms.map((m, i) => {
    const pos = i + 1;
    const high = n === 1 ? pos === 1 : pos > 1 && (n === 0 || pos <= n);
    return { m, high, drop: n > 0 && pos === n };
  });
}

/* The name of the pattern, for a title tooltip. */
export function patternName(kana, accent) {
  const n = Number(accent), len = morae(kana).length;
  if (n === 0) return "heiban (flat)";
  if (n === 1) return "atamadaka (high start)";
  if (n === len) return "odaka (drops after the word)";
  return "nakadaka (drops mid-word)";
}
