/* ── grow CONJ_BANK from the deck, without guessing ──
 *
 * The bank is thin where it matters most: 33 verbs, and only two of them in the む・ぶ・ぬ
 * group, which is the 音便 row learners actually get wrong. Adding verbs by hand means
 * deciding godan-vs-ichidan by eye, and かえる alone (帰る godan, 変える ichidan) is enough to
 * show why that is a bad idea.
 *
 * The deck already knows. NihonGO NOW!'s glossary tags every verb — "to make (u-verb; past:
 * 作った)" — so the class is stated, not inferred, and the past form is stated too, which
 * gives a way to CHECK the derivation rather than trust it.
 *
 * The pipeline:
 *   1. take SEED rows whose gloss carries a u-verb / ru-verb tag
 *   2. turn the ます-form the deck stores into the dictionary form
 *   3. run conjugate() on the result
 *   4. keep it ONLY if the computed past matches the past the glossary states
 *
 * Step 4 is the point. Anything where the derivation and the textbook disagree is dropped
 * rather than reconciled, so a wrong class or a bad stem cannot reach the bank quietly.
 *
 *   node tools/conj-candidates.mjs           # report
 *   node tools/conj-candidates.mjs --emit    # print entries ready to paste
 */
import { SEED } from "../src/data/seed.js";
import { CONJ_BANK } from "../src/data/conj-bank.js";
import { conjugate } from "../src/lib/conjugate.js";

/* い-row to う-row: the shift that turns a godan ます-stem back into its dictionary form. */
const I_TO_U = { い: "う", き: "く", ぎ: "ぐ", し: "す", ち: "つ", に: "ぬ", び: "ぶ", み: "む", り: "る" };

const stripNote = (s) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

export function classOf(meaning) {
  const m = String(meaning || "").toLowerCase();
  if (/\bru-verb\b/.test(m)) return "ichidan";
  if (/\bu-verb\b/.test(m)) return "godan";
  if (/\birregular\b/.test(m)) return "irregular";
  return null;
}

export function statedPast(meaning) {
  const m = /past:\s*([^);,]+)/.exec(String(meaning || ""));
  return m ? m[1].trim() : null;
}

/* ますform -> dictionary form, for both the kanji surface and the kana reading. */
export function toDictionary(masu, type) {
  const s = String(masu || "");
  if (!s.endsWith("ます")) return null;
  const stem = s.slice(0, -2);
  if (!stem) return null;
  if (type === "ichidan") return stem + "る";
  if (type === "godan") {
    const last = stem.slice(-1);
    const u = I_TO_U[last];
    return u ? stem.slice(0, -1) + u : null;
  }
  return null;
}

export function candidates() {
  const have = new Set(CONJ_BANK.map((w) => w.reading));
  const seen = new Set();
  const kept = [], rejected = [];

  for (const c of SEED) {
    const type = classOf(c.meaning);
    if (!type || type === "irregular") continue;              // する/くる are already in the bank
    const dict = toDictionary(c.term, type);
    const reading = toDictionary(c.reading, type);
    if (!dict || !reading) { rejected.push({ c, why: "could not derive a dictionary form" }); continue; }
    if (have.has(reading) || seen.has(reading)) continue;      // already in the bank, or a duplicate row

    const conj = conjugate(reading, type);
    if (!conj) { rejected.push({ c, why: "conjugate() returned null" }); continue; }

    /* The check that makes this safe: the glossary states the past, in kanji. Compare the
       kanji surface we derived, not the kana, because that is what the book prints. */
    const want = statedPast(c.meaning);
    if (want) {
      const gotKanji = dict.slice(0, dict.length - 1) + conj.plain.pastPos.slice(reading.length - 1);
      if (gotKanji !== want) {
        rejected.push({ c, why: "past mismatch: derived " + gotKanji + ", glossary says " + want });
        continue;
      }
    }

    seen.add(reading);
    kept.push({
      dict, reading, meaning: stripNote(c.meaning), type,
      neg: dict.slice(0, dict.length - 1) + conj.plain.presNeg.slice(reading.length - 1),
      negR: conj.plain.presNeg,
      polite: conj.formal.presNeg + " / " + conj.plain.presNeg + "です",
      how: conj.formal.presPos.replace(/ます$/, "〼") + " + ない",
      te: conj.te,
      statedPast: want,
    });
  }
  return { kept, rejected };
}

const { kept, rejected } = candidates();
const groupOf = (w) => {
  if (w.type !== "godan") return w.type;
  const last = w.dict.slice(-1);
  if ("うつる".includes(last)) return "godan って";
  if ("むぶぬ".includes(last)) return "godan んで";
  if (last === "く") return "godan いて";
  if (last === "ぐ") return "godan いで";
  if (last === "す") return "godan して";
  return "godan ?";
};

if (process.argv.includes("--emit")) {
  for (const w of kept) {
    console.log(`  { dict: "${w.dict}", reading: "${w.reading}", meaning: ${JSON.stringify(w.meaning)}, type: "${w.type}", neg: "${w.neg}", negR: "${w.negR}", polite: "${w.polite}", how: "${w.how}" },`);
  }
} else {
  console.log("verified candidates: " + kept.length + "   rejected: " + rejected.length + "\n");
  const by = {};
  for (const w of kept) (by[groupOf(w)] || (by[groupOf(w)] = [])).push(w);
  const bankBy = {};
  for (const w of CONJ_BANK) (bankBy[groupOf(w)] || (bankBy[groupOf(w)] = [])).push(w);
  console.log("group".padEnd(14) + "in bank".padStart(8) + "  new".padStart(5) + "   after");
  for (const g of Object.keys({ ...bankBy, ...by }).sort()) {
    const b = (bankBy[g] || []).length, n = (by[g] || []).length;
    console.log(g.padEnd(14) + String(b).padStart(8) + String(n).padStart(5) + "   " + (b + n));
  }
  console.log("\nsample:");
  for (const w of kept.slice(0, 8)) console.log("  " + w.dict + " (" + w.reading + ") " + w.type + " te=" + w.te + "  past ok: " + (w.statedPast || "-"));
  if (rejected.length) {
    console.log("\nrejected:");
    for (const r of rejected.slice(0, 10)) console.log("  " + r.c.term + " — " + r.why);
  }
}
