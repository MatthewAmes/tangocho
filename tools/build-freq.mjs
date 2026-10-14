/* ── build the 10k frequency deck ──

     node tools/build-freq.mjs            # writes data/freq.json (the build mirrors it)

   Two sources, both open:

   1. RANK, from a corpus-derived frequency list (hingston/japanese, 44,492 tokens). The
      words come out in genuine order, which is the whole point of a frequency deck.

   2. WHAT EACH WORD IS — reading, part of speech, meaning — from JMdict (EDRDG,
      CC BY-SA 4.0), the project behind the KANJIDIC data in the Kanji tab.

   ## Version 3 (2026-10-13): matching the token to the RIGHT entry

   Version 2 looked each token up by spelling and took whichever entry claimed that
   spelling first, ranked by how many priority markers the entry carried in total. The
   corpus list is surface tokens, and the top of it is particles and endings — so の was
   matched to 野 ("field", read の), が to 蛾 ("moth"), いる to 射る ("to shoot"), する to 擦る
   ("to rub"), この to 九 ("nine"), あなた to 彼方 ("beyond"), 本 to もと ("origin"). Matthew
   was being taught those. JMdict already says which of its spellings and readings are the
   everyday ones; version 2 just never asked.

   Version 3 asks:

   - A KANA token matches only entries actually written in kana: no real kanji spelling
     (search-only and rare kanji, sK/rK/oK, do not count), or marked "usually kana" (uk)
     in its first sense, or a reading marked as not attaching to the kanji. の therefore
     matches the particle (filed under search-only 乃/之), not 野.
   - A KANJI token matches entries by that written form, ranked by the priority markers
     on THAT spelling (ke_pri), and takes the reading that belongs to it — the first
     reading not restricted to another spelling, preferring one with its own priority
     markers. 本 → ほん "book".
   - The meaning is the FIRST SENSE's glosses, not the first three glosses of the entry
     wherever they fell, which could run several unrelated senses together.
   - Rows that are not a word worth a card are not written at all: particles, auxiliaries,
     copula, prefixes and suffixes, counters, expressions, unclassified, and one- or
     two-character hiragana tokens (the endings and fragments).

   The ranking is unchanged — corpus order. Within-rank ambiguity a surface list cannot
   resolve (いま as 今 or 居間) is settled by priority markers, which picks the everyday
   word. */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DICT_URL = "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz";
const FREQ_URL = "https://raw.githubusercontent.com/hingston/japanese/master/44492-japanese-words-latin-lines-removed.txt";
const DICT_CACHE = resolve(ROOT, "tools", ".jmdict-cache.gz");
const FREQ_CACHE = resolve(ROOT, "tools", ".freqlist-cache.txt");
const OUT = resolve(ROOT, "data", "freq.json");
const ACCENTS = resolve(ROOT, "tools", ".accents-cache.txt");   // Kanjium, optional (tools/build-pitch.mjs)
const TARGET = 10000;

async function cached(path, url, binary) {
  try {
    const s = await stat(path);
    if (s.size > 1000) {
      process.stderr.write(`cache hit ${path.split(/[\\/]/).pop()} (${(s.size / 1048576).toFixed(1)}MB)\n`);
      return binary ? readFile(path) : readFile(path, "utf8");
    }
  } catch (e) { /* first run */ }
  process.stderr.write(`downloading ${url} …\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return binary ? buf : buf.toString("utf8");
}

const all = (s, re) => [...s.matchAll(re)].map((m) => m[1]);
const one = (s, re) => { const m = s.match(re); return m ? m[1] : null; };
const KANJI = /[一-鿿々〆]/;
const NOT_REAL_KANJI = new Set(["sK", "rK", "oK"]);
export const NOT_A_CARD_POS = new Set(["prt", "aux", "aux-v", "aux-adj", "cop", "suf", "pref", "n-suf", "n-pref", "unc", "ctr", "exp", "conj-x"]);

/* One JMdict entry, with the element-level detail version 2 threw away. */
export function parseEntry(xml) {
  const kele = all(xml, /<k_ele>([\s\S]*?)<\/k_ele>/g).map((k) => ({
    keb: one(k, /<keb>([^<]+)<\/keb>/),
    pri: priScore(all(k, /<ke_pri>([^<]+)<\/ke_pri>/g)),
    real: !all(k, /<ke_inf>&([^;]+);<\/ke_inf>/g).some((x) => NOT_REAL_KANJI.has(x)),
  }));
  const rele = all(xml, /<r_ele>([\s\S]*?)<\/r_ele>/g).map((r) => ({
    reb: one(r, /<reb>([^<]+)<\/reb>/),
    pri: priScore(all(r, /<re_pri>([^<]+)<\/re_pri>/g)),
    restr: all(r, /<re_restr>([^<]+)<\/re_restr>/g),
    nokanji: /<re_nokanji/.test(r),
  }));
  const senses = all(xml, /<sense>([\s\S]*?)<\/sense>/g);
  if (!senses.length) return null;
  const first = senses[0];
  const glosses = all(first, /<gloss[^>]*>([^<]+)<\/gloss>/g).slice(0, 3);
  if (!glosses.length) return null;
  return {
    kele, rele,
    pos: (all(first, /<pos>&([^;]+);<\/pos>/g)[0] || ""),
    // "usually written in kana" can sit on any sense: 所 carries it from its second on
    uk: /<misc>&uk;<\/misc>/.test(xml),
    gloss: glosses.join("; "),
  };
}

/* How common one spelling or reading is, from its JMdict priority tags: one point per
   tag, plus up to one more for a newspaper-frequency band (nf01 is the top 500 words). */
export function priScore(tags) {
  let s = tags.length;
  for (const t of tags) { const m = t.match(/^nf(\d+)$/); if (m) s += (49 - +m[1]) / 48; }
  return s;
}

/* Index by written form and by reading, keeping the detail needed to choose between
   entries that share a form. */
export function indexEntries(entries) {
  const byKanji = new Map(), byKana = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const e of entries) {
    const realKebs = e.kele.filter((k) => k.real);
    const worthy = !NOT_A_CARD_POS.has(e.pos);
    realKebs.forEach((k, i) => {
      const rs = e.rele.filter((r) => !r.nokanji && (!r.restr.length || r.restr.includes(k.keb)));
      const reading = (rs.find((r) => r.pri) || rs[0] || e.rele[0] || {}).reb || "";
      /* Ties are common (本 is ichi1 both as ほん "book" and as a spelling of もと "origin"),
         and the right answer is the entry the spelling HEADS: 本 is the first spelling of
         the ほん entry and the second of the もと one. Then a real word over a prefix or
         suffix (人 ひと over 人 じん). */
      push(byKanji, k.keb, { e, pri: k.pri + (i === 0 ? 0.6 : 0) + (worthy ? 0.3 : 0), reading });
    });
    for (const r of e.rele) {
      const kanaWord = !realKebs.length || e.uk || r.nokanji;
      push(byKana, r.reb, { e, pri: r.pri + (worthy ? 0.3 : 0), reading: r.reb, kanaWord });
    }
  }
  return { byKanji, byKana };
}

/* The few kana homophones a surface list cannot settle and priority tags settle wrongly:
   いる is 居る "to be" far more often than 要る "to need", なる is 成る "to become" and not
   生る "to bear fruit". Named here rather than guessed — the list is short because it only
   has to cover the commonest words, where the everyday sense is not in doubt. */
export const KANA_SENSE = {
  "いる": "居る", "なる": "成る", "ある": "有る", "いう": "言う", "みる": "見る", "くる": "来る",
  "いく": "行く", "おる": "居る", "できる": "出来る", "こと": "事", "もの": "物", "とき": "時",
  "ところ": "所", "いい": "良い", "わけ": "訳", "ため": "為", "いま": "今", "ほう": "方",
};

/* The entry a corpus token means, or null. */
export function matchToken(token, index) {
  if (KANJI.test(token)) {
    const c = index.byKanji.get(token) || [];
    return c.length ? c.reduce((a, b) => (b.pri > a.pri ? b : a)) : null;
  }
  const c = (index.byKana.get(token) || []).filter((x) => x.kanaWord);
  const named = KANA_SENSE[token];
  if (named) {
    const hit = (index.byKana.get(token) || []).find((x) => x.e.kele.some((k) => k.keb === named));
    if (hit) return hit;
  }
  return c.length ? c.reduce((a, b) => (b.pri > a.pri ? b : a)) : null;
}

export function worthACard(token, hit) {
  if (!hit) return false;
  if (NOT_A_CARD_POS.has(hit.e.pos)) return false;
  /* Short hiragana tokens are mostly endings and fragments (ます, まし, あり), but some are
     the commonest words there are — する, いる, ある, なる, この, いい. Those are verbs,
     adjectives and pronouns; the fragments match as nouns. */
  if (/^[぀-ゟ]$/.test(token)) return false;
  // ...and the everyday nouns named in KANA_SENSE (こと, もの, とき). ます "trout" and あり
  // "ant" are common words too, but as corpus tokens they are 〜ます and 〜あります.
  if (/^[぀-ゟ]{2}$/.test(token) && !/^(v|adj-i|pn|adj-pn|adv)/.test(hit.e.pos) && !KANA_SENSE[token]) return false;
  return true;
}

const invoked = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/build-freq.mjs");
if (invoked) {
  const dictXml = gunzipSync(await cached(DICT_CACHE, DICT_URL, true)).toString("utf8");
  const entries = dictXml.split("<entry>").slice(1).map(parseEntry).filter(Boolean);
  process.stderr.write(`parsed ${entries.length} JMdict entries\n`);
  const index = indexEntries(entries);

  const freqText = await cached(FREQ_CACHE, FREQ_URL, false);
  const ranked = freqText.split("\n").map((s) => s.trim()).filter(Boolean);
  process.stderr.write(`frequency list: ${ranked.length} tokens\n`);

  /* Pitch accents, when the Kanjium cache is present: looked up by word AND reading, as
     the deck's are (tools/build-pitch.mjs). Absent cache, absent field — never a guess. */
  let accents = null;
  try {
    const { accentIndex, accentFor } = await import("./build-pitch.mjs");
    const idx = accentIndex(await readFile(ACCENTS, "utf8"));
    accents = (t, r) => accentFor(idx, t, r || t);
  } catch (e) { process.stderr.write("no accent cache — building without pitch\n"); }

  const words = [];
  const seen = new Set();
  let unmatched = 0, notCards = 0;
  for (const term of ranked) {
    if (words.length >= TARGET) break;
    if (seen.has(term)) continue;
    seen.add(term);
    const hit = matchToken(term, index);
    if (!hit) { unmatched++; continue; }
    if (!worthACard(term, hit)) { notCards++; continue; }
    const row = {
      t: term,
      r: hit.reading && hit.reading !== term ? hit.reading : "",
      m: hit.e.gloss,
      p: hit.e.pos,
      k: words.length + 1,
    };
    /* the word itself, then its dictionary spellings: Kanjium files いる under 居る */
    let a = accents ? accents(term, hit.reading) : null;
    for (const k of (accents && a === null ? hit.e.kele : [])) { if (a !== null) break; a = accents(k.keb, hit.reading || term); }
    if (a !== null) row.a = a;
    words.push(row);
  }

  await mkdir(dirname(OUT), { recursive: true });
  const payload = {
    v: 3,
    builtAt: Date.now(),
    source: "Frequency order from a corpus-derived list (hingston/japanese); each word matched to its JMdict entry by the spelling and reading JMdict marks as common, meaning from the first sense (EDRDG, CC BY-SA 4.0).",
    fields: "t=term r=reading m=meaning (first sense) p=part of speech k=frequency rank a=pitch accent (Kanjium, CC BY-SA 4.0)",
    words,
  };
  const json = JSON.stringify(payload);
  await writeFile(OUT, json);
  process.stderr.write(`wrote ${words.length} words (${(json.length / 1048576).toFixed(2)}MB)\n`);
  process.stderr.write(`skipped ${unmatched} tokens with no fitting entry, ${notCards} that are not words to learn\n`);
}
