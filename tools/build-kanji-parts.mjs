/* ── kanji parts and lookalikes, from KRADFILE ──
   Writes src/data/kanji-parts.js: for every kanji in data/kanji.json, the visual elements
   it is built from and the kanji it is most easily mistaken for.

     node tools/build-kanji-parts.mjs <dir holding kradfile + radkfile>

   The source is KRADFILE (Michael Raine, Jim Breen and the EDRDG; CC BY-SA 4.0, the same
   licence as JMdict), unpacked from http://ftp.edrdg.org/pub/Nihongo/kradzip.zip. It lists
   what can be SEEN in a kanji — 話 is <口 舌 言> — which is exactly the question a learner
   who mixed up 待 and 持 is asking. It makes no claim about origin or which part carries the
   sound, and neither does anything built on it: the breakdown says what the parts are,
   never a story about why.

   Lookalikes are scored on shared elements weighted by their stroke counts (a shared 門
   says more than a shared 一), among kanji of similar size. A few pairs are built from the
   same elements and differ only in a stroke's length — 未/末, 土/士 — so no decomposition
   can separate them; those come from the hand-written list in src/data/lookalike-notes.js and are
   always included. */
import fs from "node:fs";
import path from "node:path";
import { CURATED } from "../src/data/lookalike-notes.js";

const dir = process.argv[2];
if (!dir) { console.error("usage: node tools/build-kanji-parts.mjs <dir with kradfile and radkfile>"); process.exit(1); }
const dec = new TextDecoder("euc-jp");
const read = (f) => dec.decode(fs.readFileSync(path.join(dir, f)));

const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const KANJI = JSON.parse(fs.readFileSync(path.join(root, "data/kanji.json"), "utf8")).kanji;
const strokesOf = new Map(KANJI.map((k) => [k.c, k.s || 0]));

// element -> its stroke count, from the radkfile's "$ 口 3" lines
const elStrokes = new Map();
for (const l of read("radkfile").split("\n")) {
  if (!l.startsWith("$")) continue;
  const [, el, n] = l.trim().split(/\s+/);
  elStrokes.set(el, Number(n) || 1);
}
// kanji -> elements
const krad = new Map();
for (const l of read("kradfile").split("\n")) {
  if (!l || l.startsWith("#")) continue;
  const [c, rest] = l.split(" : ");
  if (c && rest) krad.set(c.trim(), rest.trim().split(/\s+/));
}

/* Stand-in characters: KRADFILE writes the person radical as 化, water as 汁 and so on,
   because JIS X 0208 has no code for the bare radical. Their own KRADFILE lines are for the
   kanji they really are (化 is 亻+匕), so they must not be used to explain other elements. */
const STANDIN = new Set("化个并刈込尚忙扎汁犯艾邦阡老杰礼疔禹初買滴乞");

/* What a learner would call the parts: drop an element that is itself inside another
   element of the same kanji. 晴 is listed as <月 青 土 二 日 亠>; four of those are just
   the inside of 青, so the parts are 日 and 青. */
function topLevel(els) {
  return els.filter((x) => !els.some((y) => y !== x && !STANDIN.has(y) && (krad.get(y) || []).includes(x)));
}

/* An element's weight is its size times how rare it is. Sharing 言 — the left side of over
   a hundred kanji — is weak evidence two kanji look alike; sharing 売, the whole right side
   of 読 and 続, is strong. */
const df = new Map();
for (const els of krad.values()) for (const e of new Set(els)) df.set(e, (df.get(e) || 0) + 1);
const idf = (e) => Math.log((krad.size + 1) / ((df.get(e) || 0) + 1));
const weight = (els) => els.reduce((a, e) => a + (elStrokes.get(e) || 1) * idf(e), 0);
/* Compared on TOP-LEVEL parts, so 糸 is not counted again as 幺 and 小, and normalised by
   the larger kanji: 待 and 持 share 寺, six of their nine strokes, and that is what makes
   them confusable — a union-based score called them barely alike. */
const topOf = new Map();
const tops = (c) => { if (!topOf.has(c)) topOf.set(c, new Set(topLevel(krad.get(c) || []).filter((e) => e !== c || STANDIN.has(e)))); return topOf.get(c); };
function similarity(a, b) {
  const A = tops(a), B = tops(b);
  if (!A.size || !B.size) return 0;
  const shared = [...A].filter((e) => B.has(e));
  return weight(shared) / Math.max(weight([...A]), weight([...B]));
}

const chars = KANJI.map((k) => k.c).filter((c) => krad.has(c));
const parts = {};
const looks = {};
for (const c of chars) {
  const els = krad.get(c);
  // an element equal to the kanji is the kanji itself — unless it is a stand-in (買 lists 買 for 罒)
  const top = topLevel(els).filter((e) => e !== c || STANDIN.has(e));
  parts[c] = top.join(" ");
  const sc = strokesOf.get(c) || 0;
  const scored = [];
  for (const o of chars) {
    if (o === c) continue;
    const so = strokesOf.get(o) || 0;
    // a kanji and one that merely contains it (未, 味) are told apart by size at a glance
    if (Math.abs(so - sc) > (sc <= 5 ? 1 : 2)) continue;
    const s = similarity(c, o);
    // small kanji share small elements by accident; ask more of them
    const floor = sc <= 5 ? 0.75 : 0.5;
    // the same size reads as the same shape at a glance: 待 and 持 are both nine strokes
    if (s >= floor) scored.push([o, s + 0.05 * (2 - Math.abs(so - sc))]);
  }
  scored.sort((x, y) => y[1] - x[1] || (strokesOf.get(x[0]) || 0) - (strokesOf.get(y[0]) || 0));
  const list = scored.slice(0, 8).map(([o]) => o);
  for (const pair of CURATED) {
    const [a, b] = [...pair.pair];
    const other = a === c ? b : b === c ? a : null;
    if (other && strokesOf.has(other) && !list.includes(other)) list.unshift(other);
  }
  if (list.length) looks[c] = list.join("");
}

const elements = {};
for (const c of chars) for (const e of krad.get(c)) elements[e] = elStrokes.get(e) || 1;

const out = `/* Generated by tools/build-kanji-parts.mjs — do not edit.
   Source: KRADFILE, (c) Michael Raine, James Breen and the Electronic Dictionary Research
   and Development Group, used under CC BY-SA 4.0 (http://www.edrdg.org/edrdg/licence.html).

   KANJI_ELEMENTS  every visual element KRADFILE lists, space-separated (for comparing)
   KANJI_PARTS     the top-level parts a learner would name (for showing)
   LOOKALIKES      the kanji each is most easily mistaken for, most alike first
   ELEMENT_STROKES stroke count of each element */
export const KANJI_ELEMENTS = ${JSON.stringify(Object.fromEntries(chars.map((c) => [c, krad.get(c).join(" ")])))};
export const KANJI_PARTS = ${JSON.stringify(parts)};
export const LOOKALIKES = ${JSON.stringify(looks)};
export const ELEMENT_STROKES = ${JSON.stringify(elements)};
`;
fs.writeFileSync(path.join(root, "src/data/kanji-parts.js"), out);
console.log(`kanji parts: ${chars.length} kanji, ${Object.keys(looks).length} with lookalikes, ${(out.length / 1024).toFixed(0)}kb`);
for (const c of "休待持時間聞晴読続買売未土力見右大午千白語話先生学字雪電") console.log(" ", c, "parts:", parts[c], " looks like:", looks[c] || "-");
