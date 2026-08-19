/* ── import NihonGO NOW! vocabulary ──
   Pulls the course glossary and emits deck entries for a given act range.

     node tools/import-nihongo.mjs 7 12 > /tmp/vol2.js

   The glossary gives ACT, scene, romanisation, Japanese and English — but no kana
   reading, which the deck needs. The romanisation is enough: toKana() already converts it
   and is covered by 61 tested readings, so the reading is derived rather than guessed.

   Entries are checked against the existing deck by term before being emitted, so a word
   taught in both volumes is not added twice.
*/
import { toKana } from "./romaji.mjs";

const URL_ = "https://nihongonow.byu.edu/glossary/";

const KANJI = /[一-龯]/;
const KATA = /^[゠-ヿー\s]+$/;

function cells(row) {
  return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
      .replace(/&#8220;|&#8221;/g, '"')
      .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim());
}

/* Trailing 、。？！ are sentence punctuation from the glossary, not part of the word. */
const stripPunct = (s) => s.replace(/[、。！？\s]+$/g, "").replace(/^[、。\s]+/g, "");

function kindOf(term) {
  if (KANJI.test(term)) return "kanji";
  if (KATA.test(term)) return "katakana";
  return "hiragana";
}

export function parseGlossary(html, fromAct, toAct) {
  const out = [];
  const seen = new Set();
  for (const row of html.split(/<tr[^>]*>/i).slice(1)) {
    const c = cells(row);
    if (c.length < 5) continue;
    const act = parseInt(c[0], 10);
    if (!Number.isFinite(act) || act < fromAct || act > toAct) continue;

    const romaji = stripPunct(c[2]);
    const term = stripPunct(c[3]);
    const meaning = c[4].replace(/\s*\.$/, "");
    if (!term || !meaning || !romaji) continue;
    // Whole-sentence glossary lines are teaching material, not vocabulary items.
    if (term.length > 14) continue;
    if (seen.has(term)) continue;
    seen.add(term);

    const reading = KANJI.test(term) ? toKana(romaji.replace(/[^a-zA-ZĀ-ſ']/g, "")) : term;
    out.push({
      term,
      reading: reading || term,
      romaji,
      meaning,
      kind: kindOf(term),
      sec: `${act}-${stripPunct(c[1]) || "0"}`,
      act,
    });
  }
  return out;
}

/* Emit as source ready to splice into SEED. */
function emit(entries, lessonBase) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines = entries.map((e) => {
    const lesson = lessonBase + (e.act - entries[0].act);
    return `  { term: "${esc(e.term)}", reading: "${esc(e.reading)}", romaji: "${esc(e.romaji)}", `
      + `meaning: "${esc(e.meaning)}", kind: "${e.kind}", emoji: "📗", lesson: ${lesson}, sec: "${esc(e.sec)}" },`;
  });
  return lines.join("\n");
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const from = parseInt(process.argv[2] || "7", 10);
  const to = parseInt(process.argv[3] || "12", 10);
  const res = await fetch(URL_);
  const html = await res.text();
  const entries = parseGlossary(html, from, to);
  process.stderr.write(`parsed ${entries.length} entries from acts ${from}-${to}\n`);
  const byAct = {};
  for (const e of entries) byAct[e.act] = (byAct[e.act] || 0) + 1;
  process.stderr.write(`per act: ${JSON.stringify(byAct)}\n`);
  process.stdout.write(emit(entries, 60) + "\n");
}
