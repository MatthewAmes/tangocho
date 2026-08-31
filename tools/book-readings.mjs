/* Build a term -> reading dictionary from the NihonGO NOW! PDFs.
     node tools/book-readings.mjs <dir-of-extracted-txt>

   The course glossary's romaji column is truncated (一日中 as "juu", 気持ちがいい as "kimochi"),
   which is where the deck's bad readings came from — see tools/check-readings.mjs. The books
   are the authority the glossary should have been.

   The vocabulary sections print each entry as furigana above the word, and pdftotext emits
   ruby as its own line immediately before the line it annotates:

       きゃんぱす
       キャンパス
       とお
       遠く

   So a kana-only line followed by a line containing kanji or katakana is a reading/term
   pair. That is a weak signal on its own — plenty of Japanese prose is kana followed by
   kanji — so every pair is checked before it is trusted:

     - the reading must be entirely kana
     - the term must not be
     - the reading must be at least as long as the term (kanji expand, never contract)
     - a term that appears twice with DIFFERENT readings is dropped rather than guessed at,
       because a wrong reading is worse than a missing one

   Ruby is sometimes spaced out per character (き ゃ ん ぱ す), so spaces come out first. */
import fs from "node:fs";
import path from "node:path";

const KANA_ONLY = /^[぀-ゟ゠-ヿー]+$/;
const HAS_KANJI = /[一-龯]/;
const clean = (s) => String(s || "").replace(/[\s　]/g, "").trim();

export function pairsFromText(text) {
  const lines = String(text || "").split("\n").map(clean);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const reading = lines[i], term = lines[i + 1];
    if (!reading || !term) continue;
    if (!KANA_ONLY.test(reading)) continue;      // the ruby line must be pure kana
    if (KANA_ONLY.test(term)) continue;          // …and the word must not be
    if (!HAS_KANJI.test(term) && !/[゠-ヿ]/.test(term)) continue;
    if (term.length > 12 || reading.length > 24) continue;
    // A kanji becomes at least one kana; a shorter reading is a ruby fragment, not a word.
    if (reading.length < term.length) continue;
    out.push({ term, reading });
  }
  return out;
}

/** term -> reading, keeping only terms every occurrence agrees on. */
export function dictionaryFrom(texts) {
  const seen = new Map();
  for (const t of texts) {
    for (const { term, reading } of pairsFromText(t)) {
      if (!seen.has(term)) seen.set(term, new Map());
      const counts = seen.get(term);
      counts.set(reading, (counts.get(reading) || 0) + 1);
    }
  }
  const dict = new Map();
  const ambiguous = [];
  for (const [term, counts] of seen) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    /* One clear winner, or nothing. A term the books read two ways here is usually a ruby
       fragment that happened to line up, and inventing a reading is the failure this whole
       exercise exists to undo. */
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) { ambiguous.push(term); continue; }
    dict.set(term, ranked[0][0]);
  }
  return { dict, ambiguous };
}

if (process.argv[1] && process.argv[1].endsWith("book-readings.mjs")) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error("usage: node tools/book-readings.mjs <dir with pdftotext output>");
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  const texts = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const { dict, ambiguous } = dictionaryFrom(texts);
  console.log(`${files.length} books -> ${dict.size} terms with an agreed reading (${ambiguous.length} ambiguous, dropped)`);
  const out = path.join(dir, "book-readings.json");
  fs.writeFileSync(out, JSON.stringify(Object.fromEntries(dict), null, 0));
  console.log("wrote " + out);
}
