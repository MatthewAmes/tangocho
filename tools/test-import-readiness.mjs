// Vol. 3 import-readiness (spec §24, §25, §51).
//
//   node tools/test-import-readiness.mjs
//
// §24 is a hard requirement: a future volume must arrive as an IMPORT, not as a rewrite.
// That claim is easy to make and easy to quietly break — one `if (act >= 7)` is all it
// takes — so it is asserted here twice, from both ends.
//
// 1. A synthetic glossary for a fictional ACT 99 is pushed through the whole pipeline:
//    parseGlossary -> curriculum placement -> objectives -> session candidates and
//    ordering. Then the SAME fixture is relabelled as act 3 and the two are compared. Every
//    number the scheduler produces has to come out identical, because nothing downstream is
//    allowed to know which volume a card belongs to. A parity test says that far more
//    sharply than any single assertion about act 99 on its own.
//
// 2. A source scan over the engine modules for literal act and volume ranges. VOLUME_ACTS
//    in curriculum.mjs is the one place an act range may be written down; anywhere else it
//    is a branch on volume identity, which is exactly what §24 forbids. The detector is
//    itself tested against synthetic bad code, because a scan that has quietly stopped
//    matching passes forever.
//
// Act 99 is deliberately in NO volume: volumeOfAct returns null for it, and the point is
// that a null volume disqualifies nothing. A card is scheduled on its memory, not on its
// membership.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGlossary, readGlossary } from "./import-nihongo.mjs";
import {
  provenanceOf, volumeOfAct, currentAct, coordsOf, curriculumIndex, sceneDistance,
  deriveObjectives, mergeOccurrences, VOLUME_ACTS,
} from "./curriculum.mjs";
import { candidates, buildSession, withFormats, scopeShiftFor, DEFAULTS } from "./session.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const gte = (a, b, m) => { if (!(a >= b)) throw new Error(`${m || ""} expected ${a} >= ${b}`); };

const NEW_ACT = 99;
const OLD_ACT = 3;

/* The same six glossary rows, written for whichever act is asked for. Terms the deck does
   not already hold, so nothing here is placed by SECTION_MAP behind the test's back. */
const row = (act, scene, romaji, jp, en) =>
  "<tr><td>" + act + "</td><td>" + scene + "</td><td>" + romaji + "</td><td>" + jp + "</td><td>" + en + "</td></tr>";
const glossary = (act) => "<table>"
  + row(act, 1, "uchuu", "うちゅう", "space")
  + row(act, 1, "hoshi", "星", "star")
  + row(act, 2, "wakusei", "わくせい", "planet")
  + row(act, 2, "ginga", "ぎんが", "galaxy")
  + row(act, 3, "kouro", "こうろ", "route")
  + row(act, 3, "uchuu", "うちゅう", "space")            // taught again — MP-02's occurrence
  + "</table>";

/* The deck the app would hold after the import. Ids and order are the SAME for both acts,
   because the parity comparison below is only meaningful if the act is the one difference. */
const deckFor = (act) => parseGlossary(glossary(act), act, act).map((e, i) => ({ id: "w" + i, order: i, ...e }));
const sourceFor = (act) => [{ deck: "vocab", caps: { type: true, listen: true }, items: deckFor(act), stats: {} }];

const NOW = Date.UTC(2026, 7, 30);
const SEED_DAY = "2026-08-30";

console.log("=== import: a fictional act parses like any other ===");
const { entries, occurrences } = readGlossary(glossary(NEW_ACT), NEW_ACT, NEW_ACT);
t("the pull yields cards and occurrences with no special casing", () => {
  eq(entries.length, 5, "five terms, one of them taught twice;");
  eq(occurrences.length, 6);
  eq(entries[0].sec, NEW_ACT + "-1");
  eq(entries[0].act, NEW_ACT);
});
t("its occurrences merge with everything else's", () => {
  const merged = mergeOccurrences(occurrences);
  eq(merged.get("うちゅう").length, 2);
  eq(merged.get("うちゅう")[0].act, NEW_ACT);
});

console.log("=== curriculum: placed in a book it belongs to, and no volume it does not ===");
const DECK = deckFor(NEW_ACT);
t("every card resolves to act 99 through its own section", () => {
  for (const card of DECK) {
    const p = provenanceOf(card);
    eq(p.act, NEW_ACT, `${card.term};`);
    eq(p.via, "sec");
    ok(p.textbookId, "a placed card names the textbook");
  }
});
t("act 99 is in no volume, and that is a null rather than a guess", () => {
  eq(volumeOfAct(NEW_ACT), null);
  eq(VOLUME_ACTS.some((v) => NEW_ACT >= v.from && NEW_ACT <= v.to), false, "the table has not silently grown;");
  eq(provenanceOf(DECK[0]).volume, null);
});
t("the scene helpers place it without knowing the volume", () => {
  eq(coordsOf(DECK[0]).scene, 1);
  eq(curriculumIndex(DECK[0]), NEW_ACT * 10 + 1);
  eq(sceneDistance(DECK[0], OLD_ACT + "-1"), (NEW_ACT - OLD_ACT) * 10);
});
t("studying it moves the learner's position like any other act", () => {
  eq(currentAct([{ id: "w0" }], DECK), NEW_ACT);
  const mixed = [...deckFor(OLD_ACT).map((c) => ({ ...c, id: "old" + c.id })), ...DECK];
  eq(currentAct([{ id: "oldw0" }], mixed), OLD_ACT);
  eq(currentAct([{ id: "oldw0" }, { id: "w0" }], mixed), NEW_ACT, "the furthest act reached wins;");
});
t("objectives derive from the new material with nothing added or withheld", () => {
  const objectives = deriveObjectives(NEW_ACT, { cards: DECK, scripts: [], conj: [] });
  eq(objectives.filter((o) => o.kind === "script").length, 0, "no scripts came with the import;");
  eq(objectives.map((o) => o.type).join(","), "recognize,recall_meaning,recall_japanese",
    "and use_in_context needs a dialogue to build a sentence from;");
  eq(objectives[0].provenance.volume, null);
  eq(objectives[0].items, DECK.length);
});

console.log("=== session: it schedules exactly as the same cards in a known act do ===");
const strip = (c) => ({ id: c.item.id, fresh: c.fresh, cooling: c.cooling, stale: c.stale, need: c.need, score: c.score });
t("candidate building produces identical numbers for act 99 and act 3", () => {
  // The whole §24 claim in one assertion: relabel the act and nothing the scheduler
  // computes may move. A branch keyed on volume identity anywhere below breaks this.
  const a = candidates(sourceFor(NEW_ACT), { now: NOW, seed: SEED_DAY }).map(strip);
  const b = candidates(sourceFor(OLD_ACT), { now: NOW, seed: SEED_DAY }).map(strip);
  eq(JSON.stringify(a), JSON.stringify(b));
  eq(a.length, 5);
});
t("a built session is the same session, item for item and format for format", () => {
  const a = withFormats(buildSession(sourceFor(NEW_ACT), { now: NOW, size: 12, seed: SEED_DAY }));
  const b = withFormats(buildSession(sourceFor(OLD_ACT), { now: NOW, size: 12, seed: SEED_DAY }));
  gte(a.length, 1, "the new material must actually be schedulable;");
  eq(a.map((p) => p.item.id + ":" + p.step + ":" + p.format).join(),
     b.map((p) => p.item.id + ":" + p.step + ":" + p.format).join());
});
t("Current Lesson leans on act 99 by exactly the weight it leans on act 3", () => {
  const shift = scopeShiftFor(DECK[0], { mode: "current", act: NEW_ACT });
  eq(shift, DEFAULTS.scopeWeight);
  eq(shift, scopeShiftFor(deckFor(OLD_ACT)[0], { mode: "current", act: OLD_ACT }));
  eq(scopeShiftFor(DECK[0], { mode: "review", act: NEW_ACT }), -DEFAULTS.scopeWeight);
});
t("and leaves it alone when the learner is somewhere else", () => {
  eq(scopeShiftFor(DECK[0], { mode: "current", act: OLD_ACT }), 0);
});
t("a scoped session treats the two acts identically too", () => {
  const a = candidates(sourceFor(NEW_ACT), { now: NOW, seed: SEED_DAY, scope: { mode: "current", act: NEW_ACT } });
  const b = candidates(sourceFor(OLD_ACT), { now: NOW, seed: SEED_DAY, scope: { mode: "current", act: OLD_ACT } });
  eq(JSON.stringify(a.map(strip)), JSON.stringify(b.map(strip)));
  ok(a.every((c) => c.scopeShift === DEFAULTS.scopeWeight));
});

console.log("=== the source scan: no volume identity anywhere in the engine ===");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/* What counts as an engine module. Tests are excluded because they assert about real acts
   on purpose ("Vol. 2 is 792 cards"), and so are the data tables and the vendored GIF
   encoder — data is where literals are SUPPOSED to live. */
const NOT_ENGINE = /^(test-.*|.*-data\.mjs|gifenc\.mjs)$/;
const ENGINE = [];
for (const f of readdirSync(join(ROOT, "tools"))) if (f.endsWith(".mjs") && !NOT_ENGINE.test(f)) ENGINE.push("tools/" + f);
for (const f of readdirSync(join(ROOT, "src/lib"))) if (f.endsWith(".js")) ENGINE.push("src/lib/" + f);
ENGINE.push("JpnFlashcards.jsx");

/* Comments are stripped first. The taxonomy is DOCUMENTED in prose in several files —
   "ACTS 1-6 ARE VOLUME 1" is the header of curriculum.mjs — and prose is where that belongs.
   What is being hunted is a branch. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");

/* An identifier ending in `act` or `volume`, compared against a number. `(?![a-zA-Z])` is
   load-bearing: without it "active" is an act and `i >= active` reads as a hard-coded act
   range. Ranges written the other way round ("7 <= act") are matched separately, because a
   reversed comparison is the obvious way to slip past a one-sided rule. */
const BRANCHES = [
  [/\b\w*[aA]ct(?![a-zA-Z])\s*(?:===|!==|==|>=|<=|>|<)\s*\d+/g, "an act compared to a literal"],
  [/\d+\s*(?:<=|<|>=|>)\s*\b\w*[aA]ct(?![a-zA-Z])/g, "a literal compared to an act"],
  [/\b\w*[vV]olume(?![a-zA-Z])\s*(?:===|!==|==|>=|<=|>|<)\s*\d+/g, "a volume compared to a literal"],
];
const scan = (src) => {
  const clean = stripComments(src);
  const hits = [];
  for (const [re, what] of BRANCHES) for (const m of clean.matchAll(re)) hits.push(what + ": " + m[0].trim());
  return hits;
};

t("the scan is looking at the whole engine, not at nothing", () => {
  gte(ENGINE.length, 30, "the file list collapsed — a passing scan would mean nothing;");
  for (const f of ["tools/session.mjs", "tools/curriculum.mjs", "tools/learner.mjs",
    "tools/distractors.mjs", "tools/listening.mjs", "JpnFlashcards.jsx"]) {
    ok(ENGINE.includes(f), `${f} is not being scanned`);
  }
});
t("the detector catches the branch it exists to catch", () => {
  // A scan that has quietly stopped matching passes forever, so it is shown a regression.
  eq(scan("if (act >= 7) return vol2Rules;").length, 1);
  eq(scan("const vol = act <= 6 ? 1 : 2;").length, 1);
  eq(scan("if (7 <= act) {}").length, 1);
  eq(scan("if (card.volume === 2) skip();").length, 1);
  eq(scan("if (p.act===12) {}").length, 1, "whitespace is not a hiding place;");
  eq(scan("if (fromAct > 3) {}").length, 1, "nor is a prefix;");
});
t("and does not fire on things that only look like one", () => {
  eq(scan("if (i >= active) {}").length, 0, "'active' is not an act;");
  eq(scan("if (act < fromAct || act > toAct) return;").length, 0, "a range from its arguments;");
  eq(scan("audio.volume = 0.8;").length, 0);
  eq(scan("/* ACTS 1-6 ARE VOLUME 1, and act >= 7 would be wrong */").length, 0, "prose is not a branch;");
  eq(scan("// act === 9 was the old rule").length, 0);
});
t("no engine module hard-codes an act or volume range", () => {
  const found = [];
  for (const f of ENGINE) for (const hit of scan(readFileSync(join(ROOT, f), "utf8"))) found.push(f + " — " + hit);
  eq(found.length, 0, "curriculum data belongs in VOLUME_ACTS, not in a branch:\n        " + found.join("\n        "));
});
t("the volume table has exactly one home", () => {
  const declares = ENGINE.filter((f) => /(?:export\s+)?const\s+VOLUME_ACTS\s*=/.test(readFileSync(join(ROOT, f), "utf8")));
  eq(declares.join(), "tools/curriculum.mjs", "a second copy of the table is a second answer;");
});
t("everything that needs a volume reads it from that table", () => {
  const users = ENGINE.filter((f) => {
    const src = stripComments(readFileSync(join(ROOT, f), "utf8"));
    return /\bVOLUME_ACTS\b|\bvolumeOfAct\b/.test(src);
  });
  gte(users.length, 2, "if nothing reads the table this assertion proves nothing;");
  for (const f of users) {
    if (f === "tools/curriculum.mjs") continue;
    ok(/from\s+"\.[^"]*curriculum\.mjs"/.test(readFileSync(join(ROOT, f), "utf8")),
      `${f} names the volume table without importing it from curriculum.mjs`);
  }
  console.log("     reading the volume table: " + users.join(", "));
});

console.log(`\nall ${run} import-readiness tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exit(fail ? 1 : 0);
