// Tests for the glossary importer (tools/import-nihongo.mjs).
//
//   node tools/test-import-nihongo.mjs
//
// The fixture below is the shape of the BYU glossary table, not a copy of it: five columns,
// act / scene / romanisation / Japanese / English. Nothing here touches the network — the
// real pull happens once, by hand, and a test that needed the site to be up would be a test
// that fails on a train.
//
// What is actually being pinned down is the split between an ENTITY and an OCCURRENCE. The
// importer emits one card per term and one occurrence per row, so a word the book teaches
// twice is one card and two occurrences. Both halves are asserted, because either one alone
// can be satisfied by throwing the other away.
import { parseGlossary, readGlossary } from "./import-nihongo.mjs";
import { buildOccurrenceIndex, mergeOccurrences, curriculumIndex } from "./curriculum.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

/* One glossary row. The real table wraps the cells in links and spans, so the fixture does
   too on one row — cells() strips tags, and a fixture of bare <td>s would not exercise it. */
const row = (act, scene, romaji, jp, en) =>
  "<tr><td>" + act + "</td><td>" + scene + "</td><td>" + romaji + "</td><td>" + jp + "</td><td>" + en + "</td></tr>";

const HTML = "<table><tbody>"
  + "<tr><th>Act</th><th>Scene</th><th>Romanization</th><th>Japanese</th><th>English</th></tr>"
  + row(2, 1, "otooto", "おとうと", "younger brother")
  + row(2, 1, "<a href='#'>tabemono</a>", "<span>食べ物</span>", "food")
  + row(2, 2, "gakusei", "学生", "student.")
  + row(9, 3, "otooto", "おとうと", "younger brother")            // the SAME word, taught again
  + row(9, 3, "denwa", "電話", "telephone")
  + row(12, "BTS 1", "shigoto", "仕事", "work")                   // a scene with no number
  + row(9, 4, "", "", "")                                        // an empty row
  + row(9, 4, "kore wa nan desu ka to iimashita", "これはなんですかとせんせいがいいました。", "He asked what it was.")
  + row(13, 1, "mirai", "未来", "future")                          // out of range
  + "</tbody></table>";

console.log("=== the entries: one card per term, exactly as before ===");
const { entries, occurrences } = readGlossary(HTML, 1, 12);

t("a row becomes a deck entry with its section and derived reading", () => {
  const food = entries.find((e) => e.term === "食べ物");
  eq(food.reading, "たべもの", "derived from the romanisation by toKana;");
  eq(food.sec, "2-1");
  eq(food.act, 2);
  eq(food.kind, "kanji");
  eq(food.meaning, "food");
});
t("a kana term keeps itself as its reading", () => {
  const otooto = entries.find((e) => e.term === "おとうと");
  eq(otooto.reading, "おとうと");
  eq(otooto.kind, "hiragana");
});
t("the trailing full stop the glossary writes on English is dropped", () => {
  eq(entries.find((e) => e.term === "学生").meaning, "student");
});
t("no duplicate cards — the word taught twice is one entity", () => {
  eq(entries.filter((e) => e.term === "おとうと").length, 1);
  eq(new Set(entries.map((e) => e.term)).size, entries.length);
});
t("the FIRST teaching wins the card, not the last", () => {
  // If the later row overwrote the earlier one the deck would say おとうと is Act 9
  // vocabulary, and Current Lesson would stop offering it until the learner got there.
  eq(entries.find((e) => e.term === "おとうと").sec, "2-1");
});
t("empty rows, whole sentences and out-of-range acts are not vocabulary", () => {
  eq(entries.some((e) => e.term.includes("これは")), false, "a sentence is teaching material;");
  eq(entries.some((e) => e.act === 13), false, "act 13 is outside the requested range;");
  eq(entries.length, 5, "おとうと 食べ物 学生 電話 仕事;");
});
t("parseGlossary still returns the entries array on its own", () => {
  const plain = parseGlossary(HTML, 1, 12);
  ok(Array.isArray(plain));
  eq(plain.length, entries.length);
  eq(plain[0].term, entries[0].term);
});

console.log("=== the occurrences: the duplicate row is recorded, not dropped ===");
t("every surviving row produces an occurrence, duplicates included", () => {
  eq(occurrences.length, 6, "five entries plus the second おとうと;");
  eq(occurrences.length - entries.length, 1, "exactly one row was a repeat;");
});
t("the word taught twice has both of its places", () => {
  const where = occurrences.filter((o) => o.term === "おとうと");
  eq(where.length, 2);
  eq(where.map((o) => o.act).join(","), "2,9");
  eq(where.map((o) => o.scene).join(","), "1,3");
});
t("the first teaching is recorded too, not only the repeat", () => {
  // Recording a word's second act and staying silent about its first would be a worse
  // answer to "where is this taught" than no answer at all.
  ok(occurrences.some((o) => o.term === "おとうと" && o.act === 2));
});
t("an occurrence carries the curriculum record shape", () => {
  const o = occurrences.find((x) => x.term === "電話");
  eq(o.source, "glossary");
  eq(o.act, 9); eq(o.scene, 3);
  eq(o.section, "9-3");
});
t("a scene with no number has no slot and does not invent one", () => {
  const o = occurrences.find((x) => x.term === "仕事");
  eq(o.act, 12);
  eq(o.scene, null, "'BTS 1' is a sub-section, not scene 1;");
  eq(o.section, "12-BTS 1", "and the label is kept verbatim;");
});
t("rows that are not vocabulary do not occur either", () => {
  eq(occurrences.some((o) => o.act === 13), false);
  eq(occurrences.some((o) => o.term === ""), false);
  eq(occurrences.some((o) => o.term.includes("これは")), false);
});

console.log("=== against a deck that already has the word ===");
const already = readGlossary(HTML, 1, 12, { known: ["おとうと", "学生"] });
t("a term already in the deck yields an occurrence and no second card", () => {
  eq(already.entries.some((e) => e.term === "おとうと"), false, "no duplicate card;");
  eq(already.entries.some((e) => e.term === "学生"), false);
  eq(already.occurrences.filter((o) => o.term === "おとうと").length, 2, "both places still recorded;");
  eq(already.occurrences.filter((o) => o.term === "学生").length, 1);
});
t("the rest of the pull is unaffected", () => {
  eq(already.entries.length, entries.length - 2);
  eq(already.occurrences.length, occurrences.length, "occurrences never depend on the deck;");
});
t("a Set is accepted as readily as an array", () => {
  eq(readGlossary(HTML, 1, 12, { known: new Set(["おとうと"]) }).entries.length, entries.length - 1);
});
t("no deck means the pull dedupes only against itself", () => {
  eq(readGlossary(HTML, 1, 12, {}).entries.length, entries.length);
});

console.log("=== one consumer merges glossary and script occurrences ===");
const SCRIPTS = [
  { id: "seed-2-1", name: "2-1", lines: [{ tokens: [{ t: "食べ物" }, { t: "です。" }] }] },
  { id: "seed-9-3", name: "9-3", lines: [{ tokens: [{ t: "おとうと" }, { t: "は。" }] }] },
];
t("both producers emit the same four fields", () => {
  const script = buildOccurrenceIndex(SCRIPTS, [{ term: "食べ物", reading: "たべもの" }]).get("食べ物")[0];
  const glossary = occurrences.find((o) => o.term === "食べ物");
  for (const k of ["term", "source", "act", "scene"]) {
    ok(k in script, "script occurrence is missing " + k);
    ok(k in glossary, "glossary occurrence is missing " + k);
  }
  eq(script.source, "script");
  eq(glossary.source, "glossary");
  eq(script.act, 2, "the script's own act, from provenanceOfScript;");
});
t("merged, a word's places read as one history in curriculum order", () => {
  const cards = entries.map((e) => ({ term: e.term, reading: e.reading }));
  const merged = mergeOccurrences(buildOccurrenceIndex(SCRIPTS, cards), occurrences);
  const otooto = merged.get("おとうと");
  eq(otooto.length, 3, "glossary act 2, glossary act 9, and the act 9 script line;");
  eq(otooto[0].act, 2, "the book introduces it in act 2;");
  eq(new Set(otooto.map((o) => o.source)).size, 2, "both sources present;");
  const order = otooto.map((o) => curriculumIndex(o));
  ok(order.every((v, i) => i === 0 || v >= order[i - 1]), "sorted by curriculum position");
});
t("a flat list needs no argument saying what it is a list of", () => {
  // The record carries its own term, so the importer's array merges the same way a
  // term-keyed Map does.
  const merged = mergeOccurrences(occurrences);
  eq(merged.get("電話").length, 1);
  eq(merged.get("電話")[0].term, "電話");
});
t("merging nothing is empty rather than an error", () => {
  eq(mergeOccurrences().size, 0);
  eq(mergeOccurrences(null, [], new Map()).size, 0);
  eq(mergeOccurrences([null, {}, { term: "" }]).size, 0, "records with no term are not places;");
});

console.log("=== junk in ===");
t("html with no table is an empty pull, not a throw", () => {
  eq(readGlossary("<p>nothing here</p>", 1, 12).entries.length, 0);
  eq(readGlossary("", 1, 12).occurrences.length, 0);
  eq(parseGlossary("<table><tr><td>only</td></tr></table>", 1, 12).length, 0);
});
t("an act range that matches nothing returns both halves empty", () => {
  const none = readGlossary(HTML, 20, 30);
  eq(none.entries.length, 0);
  eq(none.occurrences.length, 0);
});

console.log(`\nall ${run} importer tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exit(fail ? 1 : 0);
