/* ── import NihonGO NOW! vocabulary ──
   Pulls the course glossary and emits deck entries for a given act range.

     node tools/import-nihongo.mjs 7 12 > /tmp/vol2.js

   The glossary gives ACT, scene, romanisation, Japanese and English — but no kana
   reading, which the deck needs. The romanisation is enough: toKana() already converts it
   and is covered by 61 tested readings, so the reading is derived rather than guessed.

   Entries are checked against the existing deck by term before being emitted, so a word
   taught in both volumes is not added twice.

   ── the duplicate is not noise (spec §26, MP-02) ──

   That last rule used to end the story: a term already in the deck, or already met earlier
   in the same pull, was dropped on the floor. But the row is a FACT — the book teaches
   おとうと in Act 2 and uses it again in Act 9, and throwing the second row away loses the
   only record that Act 9 covers the word at all. One knowledge entity, several occurrences.

   So `readGlossary` returns both halves:

     entries       one per NEW term, exactly what the importer always emitted
     occurrences   one per surviving glossary ROW, duplicates included

   Every row produces an occurrence, not only the duplicates. The alternative — recording a
   word's second teaching but not its first — would make the list say Act 9 and stay silent
   about Act 2, which is a worse answer to "where is this taught" than no answer at all.

   The records are curriculum.mjs's occurrence shape, so a consumer can merge them with the
   script occurrences from buildOccurrenceIndex without knowing where either came from; see
   the occurrence block in that file's header for the shape and why it is the same one.

   `parseGlossary` still returns the entries array on its own, unchanged. It is a separate
   function rather than a property hung off the array because a property does not survive
   the first .map() or .filter() a caller writes, and losing the occurrences silently is the
   failure this whole change exists to stop.
*/
import { toKana } from "./romaji.mjs";
import { parseSection, VOLUME_ACTS } from "./curriculum.mjs";

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

/* Parse the glossary into { entries, occurrences }.

   `opts.known` is the terms the deck already holds — pass SEED's terms and a word taught in
   an earlier volume yields an occurrence here and no second card. Omit it and the only
   dedupe is within this pull, which is what the acts 7–12 import did. */
export function readGlossary(html, fromAct, toAct, opts = {}) {
  const entries = [];
  const occurrences = [];
  const known = opts.known instanceof Set ? opts.known : new Set(opts.known || []);
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

    /* The section label is built here and parsed back by curriculum.mjs rather than the
       scene being read straight out of the cell. That is not a detour: the cell can say
       "9R" or "BTS 1", and parseSection is the one place that knows a scene slot from a
       sub-section label. Two parsers would eventually disagree. */
    const section = `${act}-${stripPunct(c[1]) || "0"}`;
    const parsed = parseSection(section);
    occurrences.push({
      term,
      source: "glossary",
      act,
      scene: parsed ? parsed.scene : null,
      section,
    });

    // The card is still deduped — one entity, one card. Only the occurrence repeats.
    if (known.has(term) || seen.has(term)) continue;
    seen.add(term);

    const reading = KANJI.test(term) ? toKana(romaji.replace(/[^a-zA-ZĀ-ſ']/g, "")) : term;
    entries.push({
      term,
      reading: reading || term,
      romaji,
      meaning,
      kind: kindOf(term),
      sec: section,
      act,
    });
  }
  return { entries, occurrences };
}

/* The entries alone, for callers that only want deck rows. */
export function parseGlossary(html, fromAct, toAct, opts = {}) {
  return readGlossary(html, fromAct, toAct, opts).entries;
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
  /* The default range is the newest volume the curriculum data knows about, read from
     VOLUME_ACTS rather than written here as 7 and 12. Adding Vol. 3 is then a row in that
     table and a re-run of this command — which is the whole claim of spec §24. */
  const latest = VOLUME_ACTS[VOLUME_ACTS.length - 1];
  const from = parseInt(process.argv[2] || latest.from, 10);
  const to = parseInt(process.argv[3] || latest.to, 10);
  /* The deck the pull is being added TO. A term already in it gets an occurrence instead of
     a duplicate card, so the count of skipped rows below is a real curriculum figure. */
  const { SEED } = await import("../src/data/seed.js");
  const res = await fetch(URL_);
  const html = await res.text();
  const { entries, occurrences } = readGlossary(html, from, to, { known: SEED.map((c) => c.term) });
  process.stderr.write(`parsed ${entries.length} entries from acts ${from}-${to}\n`);
  const byAct = {};
  for (const e of entries) byAct[e.act] = (byAct[e.act] || 0) + 1;
  process.stderr.write(`per act: ${JSON.stringify(byAct)}\n`);
  const repeats = occurrences.length - entries.length;
  process.stderr.write(`${occurrences.length} occurrences — ${repeats} of them rows the deck already covers\n`);
  process.stdout.write(emit(entries, 60) + "\n");
}
