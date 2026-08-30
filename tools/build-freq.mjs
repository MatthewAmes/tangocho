/* ── build the 10k frequency deck ──
   The 10k tab shipped with 148 hand-picked words. This builds the real thing.

     node tools/build-freq.mjs            # writes data/freq.json

   Two sources, because neither is sufficient alone:

   1. RANK, from a corpus-derived frequency list. The words come out in genuine order —
      の, に, は, て, を … — which is the whole point of a frequency deck.

   2. READINGS AND MEANINGS, from JMdict (EDRDG, CC BY-SA 4.0), the same project behind
      the KANJIDIC data already powering the Kanji tab.

   The first attempt used only JMdict, ranking by its ke_pri/re_pri "nf" bands on the
   assumption that the top twenty bands would approximate the top 10,000 words. They do
   not. 日本 and 食べる are both nf25 and fell outside the cut, while particles like の and
   は carry no band at all — a 10k Japanese list missing 日本, する and 食べる is obviously
   broken, and it looked fine until it was checked against words a human would expect. */

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

/* Index JMdict by every written form and every reading, so a frequency-list token can be
   matched whether it is written in kanji or kana. */
function indexDict(xml) {
  const byForm = new Map();
  const entries = xml.split("<entry>").slice(1).map((entry) => {
    const glosses = all(entry, /<gloss[^>]*>([^<]+)<\/gloss>/g).filter((g) => !/^\(/.test(g)).slice(0, 3);
    if (!glosses.length) return null;
    return {
      kebs: all(entry, /<keb>([^<]+)<\/keb>/g),
      rebs: all(entry, /<reb>([^<]+)<\/reb>/g),
      pos: (all(entry, /<pos>([^<]+)<\/pos>/g)[0] || "").replace(/[&;]/g, ""),
      glosses,
      // How many priority markers the entry carries. A boolean was not enough: 今 and
      // 居間 are both "common", and the count is what separates the everyday one.
      pri: (entry.match(/<(?:ke|re)_pri>/g) || []).length,
    };
  }).filter(Boolean);

  /* Heavily-marked entries claim a spelling first, so the everyday sense wins over the
     obscure one that happens to share it.

     A known limit this does NOT fix: a kana token that is genuinely two different words.
     いま is both 今 ("now") and 居間 ("living room"), and a list of surface forms carries
     nothing to tell them apart — whichever entry is marked more heavily wins the slot.
     Roughly a handful of kana-only entries in 10,000 are affected. Disambiguating them
     properly needs the corpus context the frequency list threw away. */
  entries.sort((a, b) => b.pri - a.pri);
  for (const e of entries) {
    const rec = { r: e.rebs[0] || "", m: e.glosses.join("; "), p: e.pos };
    for (const form of [...e.kebs, ...e.rebs]) if (!byForm.has(form)) byForm.set(form, rec);
  }
  return byForm;
}

const dictXml = gunzipSync(await cached(DICT_CACHE, DICT_URL, true)).toString("utf8");
process.stderr.write(`parsed ${(dictXml.length / 1048576).toFixed(1)}MB of JMdict\n`);
const dict = indexDict(dictXml);
process.stderr.write(`indexed ${dict.size} dictionary forms\n`);

const freqText = await cached(FREQ_CACHE, FREQ_URL, false);
const ranked = freqText.split("\n").map((s) => s.trim()).filter(Boolean);
process.stderr.write(`frequency list: ${ranked.length} tokens\n`);

const words = [];
const seen = new Set();
let unmatched = 0;
for (const term of ranked) {
  if (words.length >= TARGET) break;
  if (seen.has(term)) continue;
  const hit = dict.get(term);
  if (!hit) { unmatched++; continue; }               // inflection fragments, names, noise
  seen.add(term);
  words.push({
    t: term,
    // A kana-written word needs no separate reading line.
    r: hit.r && hit.r !== term ? hit.r : "",
    m: hit.m,
    p: hit.p,
    k: words.length + 1,
  });
}

await mkdir(dirname(OUT), { recursive: true });
const payload = {
  v: 2,
  builtAt: Date.now(),
  source: "Frequency order from a corpus-derived list; readings and glosses from JMdict (EDRDG, CC BY-SA 4.0).",
  fields: "t=term r=reading m=meanings p=part of speech k=frequency rank",
  words,
};
const json = JSON.stringify(payload);
await writeFile(OUT, json);
process.stderr.write(`wrote ${words.length} words to data/freq.json (${(json.length / 1048576).toFixed(2)}MB)\n`);
process.stderr.write(`skipped ${unmatched} tokens with no dictionary entry\n`);
process.stderr.write(`top 12: ${words.slice(0, 12).map((w) => w.t).join(" ")}\n`);
