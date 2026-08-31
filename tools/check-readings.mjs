/* Deck readings that are missing the kana printed in their own term.
     node tools/check-readings.mjs            report (build gate)
     node tools/check-readings.mjs --fix      repair src/data/seed.js

   Reported live: a card showing と with the reading じゅう and the meaning "ten". The deck
   holds readings truncated to a fragment of the word —

       気持ちがいい  reading きもち   (should be きもちがいい)
       確かに       reading たしか   (should be たしかに)
       実は         reading じつ     (should be じつは)

   which is invisible on a flashcard front and decides everything else: what the audio says,
   what typing is graded against, what romaji is shown, and which words a cloze can use. A
   wrong reading is not cosmetic — it is the app teaching the wrong word.

   ## Why this does not check against the glossary

   The obvious authority is the course glossary, and it is the wrong one: its romaji column
   carries the SAME truncation. It gives 一日中 as "juu" and 気持ちがいい as "kimochi". The deck
   imported that faithfully, so the two agree and a cross-check finds nothing. The deck is
   not corrupt; its source is, and the corruption was inherited.

   ## What is checkable without any source at all

   Kana printed in the term must appear in its reading. 確かに ends in に, so its reading ends
   in に — that is not a fact about Japanese vocabulary, it is a fact about writing, and it
   needs no dictionary to verify.

   The repair follows from the same observation. These readings are PREFIXES of the true
   reading, so the missing tail is appended, overlapping where the two already share
   characters: きもち + ちがいい overlaps on ち and yields きもちがいい, not きもちちがいい.
   Anything that cannot be repaired that way is reported for a human, never guessed. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The term without deck annotations: 便利（な） -> 便利, 通う(-u; 通った) -> 通う. */
export function baseOf(s) {
  return String(s || "")
    .replace(/[（(].*$/, "")        // （な） (IRR) (-RU; かけた)
    .replace(/[・/].*$/, "")        // 具合がいい・悪い, 伯父/叔父
    .replace(/[〜~]/g, "")
    .replace(/\s+/g, "")
    .trim();
}
const HIRA_RUN = /[぀-ゟ]+$/;

/** Longest suffix of `a` that is also a prefix of `b`. */
export function overlap(a, b) {
  for (let n = Math.min(a.length, b.length); n > 0; n--) {
    if (a.slice(-n) === b.slice(0, n)) return n;
  }
  return 0;
}

/** null when the entry is fine, otherwise what is wrong and whether it can be repaired. */
export function readingIssue(card) {
  const term = baseOf(card && card.term);
  const reading = baseOf(card && card.reading);
  if (!term || !reading) return null;
  // Nothing to check unless the term itself ends in kana.
  const tail = term.match(HIRA_RUN);
  if (!tail) return null;
  if (reading.endsWith(tail[0])) return null;
  const fixed = reading + tail[0].slice(overlap(reading, tail[0]));

  /* Which of these are safe to repair by appending, and which are a DIFFERENT bug wearing
     the same symptom. The first version of this check called all twenty repairable and
     would have written 思ったより as よりったより and 気持ちが悪い as きもちい. Appending is only
     right when the stored reading is the HEAD of the word with its tail clipped off; every
     rule below identifies a case where it is not.

     Kept explicit rather than collapsed into one condition, because each corresponds to a
     real entry in the deck and the next person needs to know which is which. */
  const kanji = (term.match(/[一-鿿]/g) || []).length;
  const kanaInTerm = term.length - kanji;
  const reasons = [];
  // Already there: 目覚まし with めざましどけい, 〜過ぎ（る） with すぎる. The annotation was
  // stripped from the term but not the reading, so nothing is actually missing.
  if (reading.includes(tail[0])) reasons.push("reading already contains the tail");
  // Inverted: 思ったより stores より — the TAIL of the word, not its head. Appending doubles it.
  if (tail[0].endsWith(reading)) reasons.push("stored reading is the tail, not the head");
  // An all-kana term is its own reading; a mismatch there is a slash-alternative artifact
  // (おじいさん/お祖父様), not a truncation.
  if (!kanji) reasons.push("all-kana term: reading should equal the term");
  // Too short to be the word at all: 気持ちが悪い as きもち is missing a whole kanji reading,
  // which appending kana cannot restore.
  if (fixed.length < kanji + kanaInTerm) reasons.push("still too short to be this word");
  if (fixed.length <= reading.length) reasons.push("appending changes nothing");

  const repairable = reasons.length === 0;
  return { term: card.term, reading: card.reading, base: reading, tail: tail[0], fixed, repairable,
           why: reasons[0] || "", meaning: (card.meaning || "").slice(0, 44) };
}

/* Runs on import, the same way check-seed.mjs does. A main-module guard would be quieter
   and useless: build.mjs imports this, so argv[1] is build.mjs and the guard is false — the
   check was wired into the build and silently did nothing for one commit. */
{
  const { SEED } = await import("../src/data/seed.js");
  const issues = SEED.map(readingIssue).filter(Boolean);
  const fixable = issues.filter((i) => i.repairable);
  const manual = issues.filter((i) => !i.repairable);

  if (!issues.length) {
    console.log(`    readings ${SEED.length} entries, every printed kana accounted for`);
    process.exit(0);
  }

  if (!process.argv.includes("--fix")) {
    /* Quiet inside a build, loud when asked directly. A gate that prints twelve lines on
       every build is a gate people learn to scroll past, and the known backlog is exactly
       the part nobody needs to re-read. */
    const direct = process.argv[1] && process.argv[1].endsWith("check-readings.mjs");
    if (direct || fixable.length) {
      console.error(`READING TRUNCATION — ${issues.length} entries drop kana printed in their own term:`);
      for (const i of issues.slice(0, 20)) {
        console.error(i.repairable
          ? `  FIX  ${i.term.padEnd(16)} "${i.reading}" -> "${i.fixed}"   ${i.meaning}`
          : `  ??   ${i.term.padEnd(16)} "${i.reading}"   ${i.why}`);
      }
      if (issues.length > 20) console.error(`  …and ${issues.length - 20} more`);
      console.error(`\n${fixable.length} repairable automatically, ${manual.length} need checking against the book.`);
    }
    /* Only a NEW repairable truncation fails the build. The twelve that need the book are a
       known backlog; blocking every build on them means the gate gets disabled within a
       week, and a disabled gate catches nothing. They stay visible, they do not stop work. */
    if (fixable.length) {
      console.error("Run: node tools/check-readings.mjs --fix");
      process.exit(1);
    }
    console.log(`    readings ${SEED.length} checked, ${manual.length} known truncations await the book`);
  }

  /* Guarded, and this needed saying twice. The report branch used to end in process.exit(1),
     so nothing below it ever ran; removing that exit — so a known backlog would stop failing
     the build — quietly turned every `npm run build` into a `--fix` run that rewrites
     src/data/seed.js. It repaired 0 and so did no damage, which is the only reason it was
     noticed rather than discovered later in a diff nobody made. A write this consequential
     gets an explicit condition, not the absence of an early return. */
  if (process.argv.includes("--fix")) {
  const file = path.join(ROOT, "src/data/seed.js");
  let src = fs.readFileSync(file, "utf8");
  let done = 0;
  for (const i of fixable) {
    const esc = (x) => JSON.stringify(x).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only on the line carrying this exact term, so a reading shared elsewhere is untouched.
    const re = new RegExp(`(term: "${esc(i.term)}",[^\\n]*?reading: )"${esc(i.reading)}"`);
    if (re.test(src)) { src = src.replace(re, `$1"${i.fixed}"`); done++; }
  }
  fs.writeFileSync(file, src);
  console.log(`repaired ${done} readings; ${manual.length} still need the book:`);
  for (const m of manual) console.log(`  ${m.term}  "${m.reading}"   ${m.meaning}`);
  }
}
