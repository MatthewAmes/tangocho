// Build data/kanji.json — the jōyō kanji, ordered most-essential-first.
//
//   node tools/kanji-fetch.mjs
//
// Source: KANJIDIC2 via kanjiapi.dev. KANJIDIC is the property of the Electronic
// Dictionary Research and Development Group and is released under Creative Commons
// Attribution-ShareAlike 4.0. JLPT levels come from Jonathan Waller's JLPT Resources.
// That attribution is carried into data/kanji.json and shown in the app.
//
// Ordering is by newspaper frequency rank, not by school grade. Grade order is how
// Japanese children learn — spread over six years and organised around what a seven-year-
// old can talk about. Frequency order is what an adult learner wants: 日 (rank 1) appears
// in roughly one newspaper article in one, and learning the first 500 by frequency covers
// far more real text than the first 500 by grade. Kanji with no frequency rank (rare
// jōyō characters) sort last, ordered by grade.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools/.kanji-cache.json");
const API = "https://kanjiapi.dev/v1/kanji/";

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

const list = await (await fetch(API + "jouyou")).json();
console.log(`${list.length} jōyō kanji to fetch`);

const todo = list.filter((k) => !cache[k]);
console.log(`${list.length - todo.length} already cached, fetching ${todo.length}`);

let done = 0, failed = 0;
const CONCURRENCY = 16;
async function worker(queue) {
  while (queue.length) {
    const k = queue.pop();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(API + encodeURIComponent(k));
        if (!r.ok) throw new Error("HTTP " + r.status);
        cache[k] = await r.json();
        break;
      } catch (e) {
        if (attempt === 2) { failed++; console.error("  failed: " + k + " (" + e.message + ")"); }
        else await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      }
    }
    if (++done % 200 === 0) {
      console.log(`  ${done}/${todo.length}`);
      fs.writeFileSync(CACHE, JSON.stringify(cache));      // checkpoint, so a crash isn't fatal
    }
  }
}
const queue = todo.slice();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(CACHE, JSON.stringify(cache));
console.log(`fetched ${done}, failed ${failed}`);

// ── pack ──
const rows = list
  .map((k) => cache[k])
  .filter(Boolean)
  .map((k) => ({
    c: k.kanji,
    // All of them. A kanji carries several distinct senses and picking three at random
    // teaches a partial word: 生 is life AND raw AND birth AND student, and which one is
    // meant depends entirely on the compound it sits in.
    m: (k.meanings || []).slice(0, 8),
    on: (k.on_readings || []).slice(0, 4),
    kun: (k.kun_readings || []).slice(0, 4),
    g: k.grade || 0,
    f: k.freq_mainichi_shinbun || 0,
    s: k.stroke_count || 0,
    j: k.jlpt || 0,
  }))
  .filter((k) => k.m.length)                                // a kanji with no gloss is undrillable
  .sort((a, b) => {
    const af = a.f || 99999, bf = b.f || 99999;
    if (af !== bf) return af - bf;
    return (a.g || 99) - (b.g || 99);
  });

const out = {
  v: 1,
  builtAt: Date.now(),
  source: "KANJIDIC2 (EDRDG) via kanjiapi.dev — CC BY-SA 4.0. JLPT levels: Jonathan Waller.",
  order: "newspaper frequency rank, most essential first; unranked kanji last by grade",
  fields: "c=kanji m=meanings on=on-readings kun=kun-readings g=school grade f=freq rank s=strokes j=JLPT",
  total: rows.length,
  kanji: rows,
};
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
const file = path.join(ROOT, "data/kanji.json");
fs.writeFileSync(file, JSON.stringify(out));

const withFreq = rows.filter((k) => k.f).length;
console.log(`\n${rows.length} kanji packed`);
console.log(`  ${withFreq} have a frequency rank, ${rows.length - withFreq} do not`);
console.log(`  first 15: ${rows.slice(0, 15).map((k) => k.c).join(" ")}`);
console.log(`  grades: ${[1, 2, 3, 4, 5, 6, 8].map((g) => g + "→" + rows.filter((k) => k.g === g).length).join("  ")}`);
console.log(`  data/kanji.json  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
