/* ── readings for a sentence that has none ──
   Sentence drills (which particle?, build the sentence, put it in order, the word in a
   sentence) draw on lines that are plain text: generated example sentences and the Volume
   2 book scenes carry no readings at all. Shown bare, 先日、友達＿会いました asks a learner
   who cannot read 先日 or 会 to answer a particle question — it is a kanji test first.

   This puts readings over the kanji using the learner's OWN deck as the dictionary — every
   word being studied comes with its reading — so the furigana are for words the app is
   teaching, read the way the course reads them:

   - each deck word's kanji part is paired with its reading with the okurigana trimmed off
     both ends: 会う/あう gives 会 → あ, 食べる/たべる gives 食 → た, 先日/せんじつ stays whole;
   - a sentence is read left to right, taking the LONGEST known kanji run at each point, so
     会社 is かいしゃ even though 会 alone is あ;
   - when one kanji has several readings, the one whose word ends in kana is preferred
     where kana follows in the sentence (会い… is the verb), and the bare noun reading
     where it does not;
   - a kanji nothing in the deck explains is left without a reading — no reading is
     better than a guessed one.

   Pure — see tools/test-furigana.mjs. */

const KANJI = /[一-鿿々〆ヶ]/;
const KANA = /[぀-ゟ゠-ヿー]/;
const NOTE = /\s*[（(]\s*-?(?:RU|U|ARU|IRR)\b[^)）]*[)）]?/gi;
const plain = (s) => String(s || "").replace(NOTE, "").replace(/[（(][^）)]*[）)]/g, "").replace(/[〜~↓↑\s]/g, "").trim();
const toHira = (s) => String(s || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/* term + reading -> { kanji, reading, okuri } with okurigana trimmed from both, or null. */
export function kanjiPart(term, reading) {
  let t = plain(term), r = toHira(plain(reading));
  if (!t || !r || !KANJI.test(t)) return null;
  // leading kana (お茶 → 茶 / ちゃ): trim while it matches the reading
  while (t && !KANJI.test(t[0]) && toHira(t[0]) === r[0]) { t = t.slice(1); r = r.slice(1); }
  let okuri = "";
  while (t && !KANJI.test(t[t.length - 1]) && toHira(t[t.length - 1]) === r[r.length - 1]) {
    okuri = t[t.length - 1] + okuri; t = t.slice(0, -1); r = r.slice(0, -1);
  }
  if (!t || !r || ![...t].every((c) => KANJI.test(c))) return null;   // kana inside the word: not a clean run
  return { kanji: t, reading: r, okuri };
}

/* The deck first; then `extra` — the 10,000-word list — for kanji runs the deck does not
   cover. Volume 1 taught many basics in kana (先生, 友達 are not kanji cards), so the deck
   alone would leave common words bare. Extra readings never override a deck reading for the
   same run, because the deck's is the one being taught. */
export function readingLexicon(cards = [], extra = []) {
  const lex = new Map();                 // kanji run -> [{ reading, okuri }]
  const add = (term, reading, fromDeck) => {
    const p = kanjiPart(term, reading);
    if (!p) return;
    if (!fromDeck && deckKeys.has(p.kanji)) return;
    if (!lex.has(p.kanji)) lex.set(p.kanji, []);
    const list = lex.get(p.kanji);
    if (!list.some((x) => x.reading === p.reading && !!x.okuri === !!p.okuri)) list.push({ reading: p.reading, okuri: p.okuri });
  };
  const deckKeys = new Set();
  for (const c of cards) { if (!c) continue; add(c.term, c.reading, true); const p = kanjiPart(c.term, c.reading); if (p) deckKeys.add(p.kanji); }
  for (const w of extra) if (w) add(w.t || w.term, w.r || w.reading || w.t || w.term, false);
  lex.maxLen = Math.max(1, ...[...lex.keys()].map((k) => k.length));
  return lex;
}

/* The kana row of a character (あ・か・さ… with voicing folded), so a verb's dictionary
   ending can be recognised conjugated: 会う → 会い, 行く → 行き / 行っ, 食べる → 食べ. */
const ROWS = ["あいうえお", "かきくけこがぎぐげご", "さしすせそざじずぜぞ", "たちつてとだぢづでどっ", "なにぬねのん",
  "はひふへほばびぶべぼぱぴぷぺぽ", "まみむめも", "やゆよゃゅょ", "らりるれろ", "わをん"];
const rowOf = (ch) => ROWS.findIndex((r) => r.includes(toHira(ch || "")));
function fitsOkuri(okuri, next) {
  if (!okuri || !next) return false;
  if (okuri.length > 1) return toHira(next) === toHira(okuri[0]);    // 食べる: the べ stays
  const a = rowOf(okuri[0]), b = rowOf(next);
  return a >= 0 && (a === b || next === "っ" || next === "ん");     // 会う → 会い, 行く → 行っ
}

/* Text -> [{ t, r? }], the token shape the Furigana component draws. */
export function annotate(text, lex) {
  const s = String(text || "");
  if (!lex || !lex.size || !KANJI.test(s)) return [{ t: s }];
  const out = [];
  let plainRun = "";
  const flush = () => { if (plainRun) { out.push({ t: plainRun }); plainRun = ""; } };
  for (let i = 0; i < s.length;) {
    if (!KANJI.test(s[i])) { plainRun += s[i]; i++; continue; }
    let hit = null;
    for (let len = Math.min(lex.maxLen, s.length - i); len >= 1 && !hit; len--) {
      const key = s.slice(i, i + len);
      const opts = lex.get(key);
      if (!opts) continue;
      const next = s[i + len] || "";
      /* A reading that belongs to a word with an ending (三つ みっ・つ) is only used when such an
         ending follows; 三年間 must not become みっねんかん. Nothing fitting: leave it bare. */
      const pick = opts.find((o) => fitsOkuri(o.okuri, next))
        || opts.find((o) => !o.okuri)
        || (KANA.test(next) ? opts[0] : null);
      if (pick) hit = { t: key, r: pick.reading };
    }
    if (hit) { flush(); out.push(hit); i += hit.t.length; }
    else { plainRun += s[i]; i++; }
  }
  flush();
  return out;
}
