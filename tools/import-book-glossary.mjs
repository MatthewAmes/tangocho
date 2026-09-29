/* ── the textbook's own glossary, checked against the deck ──
   The deck's Volume 2 vocabulary came from the course website's glossary
   (tools/import-nihongo.mjs). Checked against Appendix B of the printed Volume 2 textbook
   ("Japanese-English glossary by Act and Scene"), almost all of it matches — and a few
   dozen book entries are simply absent. The pattern is visible in the deck itself: 7-1 runs
   売店, ATM, びっくりする, and the book's (X に) 慣れる between them is gone. Entries that
   open with a bracketed frame did not survive the web import.

   This reads the book's glossary instead and reports every row whose word is not in the
   deck, with its act, scene, part of speech and the book's own gloss.

     pdftotext -enc UTF-8 -layout -f 315 -l 345 vol2-textbook.pdf appB.txt
     node tools/import-book-glossary.mjs appB.txt > data/private/vol2-book-missing.json

   Why -layout: without it pdftotext emits each column as its own run of lines, and a word
   can no longer be put back together with its meaning. With it, term, part of speech,
   meaning and scene sit on one line. The READING column still drifts a line or two against
   the rest, so readings are not taken positionally: each row's reading is chosen from
   reading-column tokens that are consistent with the written form (its kana must appear in
   the same places), and a row with no consistent candidate is flagged rather than guessed.
   Nothing here is written into the deck; that is a separate, reviewed step.

   The PDF is licensed and never enters the repo. Only this parser does. */

import fs from "node:fs";
import { normalise } from "./benchmark.mjs";

export const POS = ["N", "V", "Adj", "Adv", "Sp. Exp.", "Kotowaza", "Numbers", "Classifier", "Prt", "Particle", "Conj", "Pron", "Aux", "Counter", "Interj", "Suffix", "Prefix", "Cop"];
const KANA = /^[぀-ヿ・ー〜]+$/;
const KANJI = /[一-鿿々]/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const POS_RE = new RegExp("(^|\\s)(" + POS.map(esc).join("|") + ")(?=\\s)");

/* "71" / "7 1" / "10 2" / "112" / "12 7R" -> { act, scene } */
export function sceneOf(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2}) (\d{1,2}R?)$/);
  if (m) return { act: +m[1], scene: m[2] };
  m = t.match(/^(\d{2,3})(R?)$/);
  if (!m) return null;
  const d = m[1];
  if (d.length === 2) return { act: +d[0], scene: d[1] + m[2] };
  if (+d.slice(0, 2) <= 12) return { act: +d.slice(0, 2), scene: d[2] + m[2] };
  return null;
}

/* The dictionary form from a glossary term: drop a leading frame "(X に)", trailing
   conjugation notes "(-RU; 慣れた)" (possibly cut off at the column edge), and the
   leading "+" the book uses to mark supplementary items. */
export function headword(term) {
  return String(term || "")
    .replace(/^\+\s*/, "")
    .replace(/^[(（][^)）]*[)）]\s*/, "")
    .replace(/\s*\(-?(?:RU|U|u|ru|IRR)\b.*$/, "")
    .trim();
}

/* Does a reading fit a written form? Every kana in the written form must appear, in order,
   with each kanji run standing for one or more kana. */
export function fits(term, reading) {
  const t = normalise(headword(term)).replace(/[（(][^）)]*[）)]/g, "");
  if (!t || !reading) return false;
  let pat = "^";
  for (const run of t.match(/[一-鿿々]+|[^一-鿿々]+/g) || []) {
    pat += KANJI.test(run) ? "[\\u3040-\\u30ff]+" : esc(run);
  }
  try { return new RegExp(pat + "$").test(normalise(reading)); } catch (e) { return false; }
}

/* A row is: [reading] term  POS  meaning  scene. The POS token is the anchor — it comes
   from a closed list and has space on both sides. Columns are separated by two or more
   spaces on sparse pages and sometimes by one on dense ones, so the split is on the anchor
   and the trailing scene number rather than on column gaps. */
export function parseRow(line) {
  const m = line.match(POS_RE);
  if (!m) return null;
  const posAt = m.index + m[1].length;
  const left = line.slice(0, posAt).replace(/\s+$/, "");
  const right = line.slice(posAt + m[2].length);
  const sm = right.match(/\s(\d{1,2} ?\d{1,2}R?)\s*$/);
  const sc = sm ? sceneOf(sm[1]) : null;
  if (!sc) return null;
  const meaning = right.slice(0, sm.index).trim();
  // the left side holds reading-column spill and then the term; the term is the trailing
  // run, including a leading "(X に)" frame and excluding a cut-off "れた)" tail
  const toks = left.replace(/^\s*\+\s*/, "").trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  let end = toks.length - 1;
  /* A conjugation note ends the term: "慣れる(-RU; 慣" wraps at the column edge, and the
     fragment after the note ("慣") is the note's tail, not the word. */
  const note = toks.findIndex((x) => /\(-?(?:RU|U|u|ru|IRR|ARU)\b/.test(x));
  if (note >= 0) end = note;
  while (end > 0 && /[)）]$/.test(toks[end]) && !KANJI.test(toks[end]) && !/^[(（]/.test(toks[end])) end--;
  let start = end;
  while (start > 0 && (/^[(（]/.test(toks[start - 1]) || /^[XYZ]$/.test(toks[start - 1]) || /[にがをと][)）]$/.test(toks[start - 1]))) start--;
  const term = toks.slice(start, end + 1).join(" ");
  return {
    term, headword: headword(term), pos: m[2], meaning, act: sc.act, scene: sc.scene,
    posAt, meaningAt: posAt + m[2].length + (right.length - right.trimStart().length),
    termAt: line.indexOf(toks[start]),
    leftReadings: toks.slice(0, start).filter((x) => KANA.test(x)),
  };
}

export function parseLayout(text, { acts = [7, 12] } = {}) {
  const lines = String(text).split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const r = parseRow(lines[i]);
    if (!r || r.act < acts[0] || r.act > acts[1]) continue;
    // a meaning that wraps continues in the same column on the next line or two
    for (let k = 1; k <= 2; k++) {
      const next = lines[i + k] || "";
      if (POS_RE.test(next)) break;
      const seg = next.slice(Math.max(0, r.meaningAt - 2)).trim().replace(/\s{2,}.*$/, "");
      if (seg && /[a-z]/i.test(seg) && !KANJI.test(seg) && !/^\d/.test(seg)) r.meaning += " " + seg;
      else break;
    }
    r.line = i + 1;
    rows.push(r);
  }
  // readings: the row's own spill first, then reading-column tokens within three lines,
  // kept only when they fit the written form
  for (const r of rows) {
    const hw = r.headword;
    if (KANA.test(normalise(hw).replace(/\s/g, ""))) { r.reading = hw; r.readingSure = true; continue; }
    const cands = r.leftReadings.filter((tok) => fits(hw, tok)).map((tok) => ({ tok, dist: 0 }));
    for (let k = -3; k <= 3; k++) {
      const line = lines[r.line - 1 + k] || "";
      for (const tok of line.slice(0, Math.max(0, r.termAt)).replace(/\+/g, " ").trim().split(/\s+/)) {
        if (tok && KANA.test(tok) && fits(hw, tok)) cands.push({ tok, dist: Math.abs(k) });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    const uniq = [...new Set(cands.map((c) => c.tok))];
    r.reading = uniq[0] || null;
    r.readingSure = uniq.length === 1;
    if (uniq.length > 1) r.readingAlternatives = uniq;
    delete r.leftReadings;
  }
  return rows;
}

/* Rows whose word the deck does not have. A deck card matches on its written form with
   the deck's own bracket notation removed. */
export function missingFrom(rows, deck) {
  const have = new Set();
  const strip = (x) => normalise(String(x || "").replace(/[（(][^）)]*[）)]/g, "").replace(/[↓↑]/g, "").trim().split(/\s+/)[0] || "");
  for (const c of deck) { have.add(strip(c.term)); have.add(normalise(headword(c.term))); }
  const seen = new Set();
  return rows.filter((r) => {
    const k = strip(r.headword);
    if (!k || have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const invoked = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/import-book-glossary.mjs");
if (invoked) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node tools/import-book-glossary.mjs appB.txt"); process.exit(2); }
  const { SEED } = await import("../src/data/seed.js");
  const rows = parseLayout(fs.readFileSync(file, "utf8"));
  console.log(JSON.stringify({ parsedRows: rows.length, missing: missingFrom(rows, SEED) }, null, 1));
}
