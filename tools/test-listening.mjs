// Tests for the script listening mode. The failure that matters here is not a crash: it is
// an exercise that gives the answer away before it is answered. An audio-first question
// whose Japanese leaks into a rendered field is a reading exercise wearing a speaker icon,
// and nothing about it would look wrong on screen — so most of these check the SHAPE of the
// exercise as hard as they check its content, and the last block runs a whole session
// against all 34 real dialogues and the real deck.
//
//   node tools/test-listening.mjs
import {
  LISTEN_FORMATS, LISTEN_ORDER, LISTEN_SKILL, LISTEN_DECK, LISTEN_LABEL,
  provenanceLabel, meaningChoice, missingWord, speakerCall, lineKey,
  listeningExercise, actsMet, rankScripts, listeningSet, gradeListening,
  listeningEvidence, listeningSummary,
} from "./listening.mjs";
import { makeEvidence, modesForFormat, COGNITIVE_MODES, SKILLS, skillForFormat } from "./learner.mjs";
import { lineText } from "./cloze.mjs";
import { provenanceOf } from "./curriculum.mjs";
import { SCRIPT_SEED } from "../src/data/scripts-seed.js";
import { SEED } from "../src/data/seed.js";

/* SEED rows carry no id — the app stamps one when it first hydrates the deck
   (JpnFlashcards.jsx: SEED.map(c => ({ id: uid(), ... }))). So does this, because a deck
   without ids is not the deck the app runs on: pickDistractors excludes candidates by id
   and would return nothing for every card, which is a property of the fixture rather than
   of the code under test. */
const DECK = SEED.map((c, i) => ({ id: "seed" + i, ...c }));

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const gte = (a, b, m) => { if (!(a >= b)) throw new Error(`${m || ""} expected ${a} >= ${b}`); };

/* Two two-speaker dialogues in the same act, so the distractor tiering has somewhere to
   draw from, plus a one-speaker monologue that speakerCall must refuse. */
const A = {
  id: "seed-9-1", name: "9-1",
  lines: [
    { speaker: "Aoki", tokens: [{ t: "毎日" }, { t: "食べ物", r: "たべもの" }, { t: "を買います。" }], romaji: "mainichi tabemono o kaimasu.", en: "I buy food every day." },
    { speaker: "Ben", tokens: [{ t: "そうですか。" }], romaji: "sō desu ka.", en: "Is that so." },
    { speaker: "Ben", tokens: [{ t: "大丈夫", r: "だいじょうぶ" }, { t: "です。" }], romaji: "daijōbu desu.", en: "It's fine." },
    { speaker: "Aoki", tokens: [{ t: "はい。" }], romaji: "hai.", en: "Yes." },
  ],
};
const B = {
  id: "seed-9-2", name: "9-2",
  lines: [
    { speaker: "Chie", tokens: [{ t: "学生", r: "がくせい" }, { t: "ですか。" }], romaji: "gakusei desu ka.", en: "Are you a student?" },
    { speaker: "Dai", tokens: [{ t: "いいえ、ちがいます。" }], romaji: "iie, chigaimasu.", en: "No, that's not right." },
  ],
};
const C = {
  id: "seed-4-9", name: "4-9",
  lines: [
    { speaker: "Emi", tokens: [{ t: "時間", r: "じかん" }, { t: "がありません。" }], romaji: "jikan ga arimasen.", en: "There's no time." },
    { speaker: "Fumi", tokens: [{ t: "わかりました。" }], romaji: "wakarimashita.", en: "Understood." },
  ],
};
const SOLO = {
  id: "seed-9-3", name: "9-3",
  lines: [
    { speaker: "Gen", tokens: [{ t: "みなさん、こんにちは。" }], romaji: "minasan, konnichiwa.", en: "Hello everyone." },
    { speaker: "Gen", tokens: [{ t: "今日", r: "きょう" }, { t: "はいい天気ですね。" }], romaji: "kyō wa ii tenki desu ne.", en: "Nice weather today." },
  ],
};
const FIXTURES = [A, B, C, SOLO];
const CARDS = [
  { id: "a", term: "食べ物", reading: "たべもの", kind: "kanji", sec: "9-1" },
  { id: "b", term: "大丈夫", reading: "だいじょうぶ", kind: "kanji", sec: "9-1" },
  { id: "c", term: "学生", reading: "がくせい", kind: "kanji", sec: "9-2" },
  { id: "d", term: "時間", reading: "じかん", kind: "kanji", sec: "4-9" },
  { id: "e", term: "天気", reading: "てんき", kind: "kanji", sec: "9-3" },
];

console.log("=== the audio-first contract ===");

/* The single most important property in this file. Everything the learner may see before
   answering is checked here; everything they must not see lives under `reveal`. */
const VISIBLE = ["format", "prompt", "choices", "answer", "provenance", "audio", "voice", "skill", "deck", "modes", "evidenceId"];
function assertHidden(ex) {
  const jp = ex.reveal.text;
  ok(jp, "fixture has no Japanese to hide");
  for (const key of VISIBLE) {
    if (key === "audio") continue;                       // the audio IS the Japanese, spoken
    const v = ex[key];
    const flat = Array.isArray(v) ? v.join(" ") : typeof v === "object" ? JSON.stringify(v) : String(v == null ? "" : v);
    ok(flat.indexOf(jp) < 0, ex.format + " leaks the line into " + key);
  }
}

t("a meaning exercise never renders the Japanese before it is answered", () => {
  const ex = meaningChoice(A, 0, 3, FIXTURES);
  ok(ex, "no meaning exercise built");
  assertHidden(ex);
});
t("a speaker exercise never renders the Japanese before it is answered", () => {
  const ex = speakerCall(A, 0, 3);
  ok(ex, "no speaker exercise built");
  assertHidden(ex);
});
t("a missing-word exercise keeps the sentence in reveal, not in the choices", () => {
  const ex = missingWord(A, 0, CARDS, { seed: 1 });
  ok(ex, "no missing-word exercise built");
  ok(ex.blank && ex.blank.sentence, "no blanked sentence recorded");
  /* The blanked sentence is reveal-time material in the UI — showing it mid-question would
     put most of the line back on screen. It must not contain the answer either way. */
  ok(ex.blank.sentence.indexOf(ex.answer) < 0, "the blanked sentence still contains the answer");
  ok(ex.blank.before.indexOf(ex.answer) < 0 && ex.blank.after.indexOf(ex.answer) < 0, "the answer survives either side of the blank");
});
t("every exercise carries the audio it is supposed to play", () => {
  for (const ex of [meaningChoice(A, 0, 3, FIXTURES), speakerCall(A, 0, 3), missingWord(A, 0, CARDS, { seed: 1 })]) {
    eq(ex.audio, lineText(A.lines[0]), ex.format + " audio is not the line");
  }
});
t("audio is labelled as generated, never as textbook (spec 29)", () => {
  for (const ex of listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 4, count: 5 })) {
    eq(ex.voice, "generated", ex.format + " does not say where its audio came from");
  }
});

console.log("\n=== the questions themselves ===");

t("the meaning answer is this line's English", () => {
  const ex = meaningChoice(A, 2, 5, FIXTURES);
  eq(ex.answer, "It's fine.");
  ok(ex.choices.includes(ex.answer), "the answer is not among the choices");
});
t("no meaning distractor comes from this same dialogue", () => {
  const own = new Set(A.lines.map((l) => l.en));
  for (let i = 0; i < A.lines.length; i++) {
    for (let seed = 0; seed < 6; seed++) {
      const ex = meaningChoice(A, i, seed, FIXTURES);
      if (!ex) continue;
      for (const c of ex.choices) {
        if (c === ex.answer) continue;
        ok(!own.has(c), "distractor '" + c + "' is another line of the same script");
      }
    }
  }
});
t("meaning distractors are drawn from the same act first", () => {
  // A is act 9; B is act 9 and C is act 4, so the same-act pool must win.
  const ex = meaningChoice(A, 0, 0, [B, C], 1);
  const wrong = ex.choices.filter((c) => c !== ex.answer);
  eq(wrong.length, 1);
  ok(B.lines.some((l) => l.en === wrong[0]), "the distractor came from act 4 with act 9 available");
});
t("a line with no English cannot become a meaning question", () => {
  const noEn = { id: "seed-9-9", name: "9-9", lines: [{ speaker: "X", tokens: [{ t: "ええ。" }], en: "" }] };
  eq(meaningChoice(noEn, 0, 0, FIXTURES), null);
});
t("with nothing to draw distractors from, a meaning question is refused rather than faked", () => {
  eq(meaningChoice(A, 0, 0, [A]), null);
});
t("a line whose meaning dwarfs every distractor is refused, not offered", () => {
  const speech = {
    id: "seed-9-7", name: "9-7",
    lines: [{ speaker: "Hana", tokens: [{ t: "はじめまして。" }], romaji: "hajimemashite.",
      en: "Yes, I am Brian Wang. I came from Oregon, in America, and I am currently studying at the international student centre, where I am doing a homestay with the Shirai family." }],
  };
  eq(meaningChoice(speech, 0, 0, FIXTURES), null, "one paragraph against three one-liners is answerable with a ruler");
});
t("a short answer against short distractors is still a question", () => {
  // "Yes." against "Is that so." is 2.75x and eight characters — the ratio alone would
  // have refused it, and it is a perfectly fair thing to ask.
  const ex = meaningChoice(A, 3, 2, FIXTURES);
  ok(ex, "refused a fair short question");
  eq(ex.answer, "Yes.");
});
t("a one-speaker script produces no speaker question", () => {
  for (let i = 0; i < SOLO.lines.length; i++) eq(speakerCall(SOLO, i, 0), null, "line " + i);
});
t("the missing-word answer is a real deck word and its options are terms", () => {
  const ex = missingWord(A, 0, CARDS, { seed: 1 });
  eq(ex.answer, "食べ物");
  eq(ex.evidenceId, "a", "the evidence should name the CARD, not the line");
  ok(ex.choices.includes("食べ物"));
  eq(ex.choiceIds["食べ物"], "a", "the answer has no card id behind it");
});
t("a line with no deck word in it cannot become a missing-word question", () => {
  eq(missingWord(A, 1, CARDS, { seed: 1 }), null);   // そうですか。 holds no card term
});
t("a deck too thin to fill the options produces no question rather than a one-option one", () => {
  // Exactly one card, so there is nothing to be wrong with.
  eq(missingWord(A, 0, [CARDS[0]], { seed: 1 }), null);
});

t("a preference the line cannot satisfy falls through instead of skipping the line", () => {
  // SOLO has one speaker, so the preferred speaker question is impossible — the meaning
  // question behind it is not, and a line with something to teach must not be dropped.
  const ex = listeningExercise(SOLO, 0, {
    seed: 1, scripts: FIXTURES, cards: CARDS,
    prefer: [LISTEN_FORMATS.SPEAKER, LISTEN_FORMATS.MEANING],
  });
  ok(ex, "the line was skipped rather than asked about differently");
  eq(ex.format, LISTEN_FORMATS.MEANING);
});
t("a line that supports nothing at all returns null", () => {
  const empty = { id: "seed-9-8", name: "9-8", lines: [{ speaker: "X", tokens: [], en: "" }] };
  eq(listeningExercise(empty, 0, { seed: 0, scripts: FIXTURES, cards: CARDS }), null);
});

console.log("\n=== provenance ===");

t("the chip reads act and scene", () => {
  eq(provenanceLabel(A), "Act 9-1 · script");
  eq(provenanceLabel(C), "Act 4-9 · script");
});
t("an unplaceable script keeps its own name rather than inventing an act", () => {
  const odd = { id: "seed-culture-talk", name: "Culture talk", lines: [{ speaker: "X", tokens: [{ t: "はい。" }], en: "Yes." }] };
  const label = provenanceLabel(odd);
  ok(label.indexOf("Act") < 0, "made up an act: " + label);
});
t("every exercise points back at the line it came from", () => {
  const ex = meaningChoice(A, 2, 1, FIXTURES);
  eq(ex.provenance.scriptId, "seed-9-1");
  eq(ex.provenance.lineIdx, 2);
  eq(ex.provenance.act, 9);
  eq(ex.provenance.label, "Act 9-1 · script");
});
t("a line key round-trips to its script", () => {
  eq(lineKey(A, 3), "seed-9-1#3");
});

console.log("\n=== line selection ===");

t("with no evidence at all, every script is still eligible", () => {
  const ranked = rankScripts(FIXTURES, new Map(), 2);
  eq(ranked.length, FIXTURES.length, "a first session lost scripts it should have kept");
});
t("scripts from acts the learner has met come first", () => {
  const met = actsMet([{ id: "d", at: 1 }], CARDS);      // card d is sec 4-9, so act 4
  eq(met.get(4), 1);
  const ranked = rankScripts(FIXTURES, met, 2);
  eq(ranked[0].id, "seed-4-9", "the met act did not lead");
});
t("a previous listening answer counts toward its act too", () => {
  const met = actsMet([{ id: "seed-4-9#1", at: 1 }], CARDS);
  eq(met.get(4), 1, "a scriptId#lineIdx row was not placed");
});
t("evidence about an unplaceable item is ignored, not guessed at", () => {
  const met = actsMet([{ id: "nope", at: 1 }, { id: null, at: 1 }], CARDS);
  eq(met.size, 0);
});
t("a session spreads across scripts instead of draining one", () => {
  const set = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 7, count: 6 });
  gte(set.length, 4, "session too short to judge");
  const perScript = new Map();
  for (const ex of set) perScript.set(ex.provenance.scriptId, (perScript.get(ex.provenance.scriptId) || 0) + 1);
  gte(perScript.size, 3, "only " + perScript.size + " scripts in a " + set.length + "-question session");
  const worst = Math.max(...perScript.values());
  ok(worst <= Math.ceil(set.length / 2), "one script supplied " + worst + " of " + set.length);
});
t("a session asks more than one kind of question", () => {
  const set = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 3, count: 6 });
  const formats = new Set(set.map((ex) => ex.format));
  gte(formats.size, 2, "only one task type in the whole session");
});
t("no line is asked about twice in one session", () => {
  const set = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 11, count: 20 });
  const keys = set.map((ex) => lineKey({ id: ex.provenance.scriptId }, ex.provenance.lineIdx));
  eq(new Set(keys).size, keys.length, "a line came round twice");
});
t("the same seed builds the same session", () => {
  const a = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 5, count: 6 });
  const b = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 5, count: 6 });
  eq(JSON.stringify(a), JSON.stringify(b), "not deterministic under seed");
});
t("a different seed builds a different session", () => {
  const a = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 5, count: 6 });
  const b = listeningSet({ scripts: FIXTURES, cards: CARDS, seed: 12, count: 6 });
  ok(JSON.stringify(a) !== JSON.stringify(b), "two seeds produced identical sessions");
});
t("asking for more than the material can carry returns what exists, and terminates", () => {
  const set = listeningSet({ scripts: [B], cards: CARDS, seed: 1, count: 50 });
  ok(set.length > 0 && set.length < 50, "got " + set.length);
});
t("no scripts means no session, not a crash", () => {
  eq(listeningSet({ scripts: [], cards: CARDS, seed: 1, count: 5 }).length, 0);
});

console.log("\n=== grading and evidence ===");

t("a right answer grades right and a wrong one names what was picked", () => {
  const ex = meaningChoice(A, 0, 3, FIXTURES);
  const good = gradeListening(ex, ex.answer);
  eq(good.ok, true);
  eq(good.failure, null);
  const bad = gradeListening(ex, ex.choices.find((c) => c !== ex.answer));
  eq(bad.ok, false);
  eq(bad.failure, "listening");
});
t("no answer at all is a miss, not a crash", () => {
  const ex = meaningChoice(A, 0, 3, FIXTURES);
  eq(gradeListening(ex, null).ok, false);
});
t("a wrong missing-word pick is filed against the card id the confusion graph uses", () => {
  const ex = missingWord(A, 0, CARDS, { seed: 1 });
  const wrongTerm = ex.choices.find((c) => c !== ex.answer);
  const g = gradeListening(ex, wrongTerm);
  eq(g.confused, ex.choiceIds[wrongTerm]);
  ok(CARDS.some((c) => c.id === g.confused), "confused is not a card id: " + g.confused);
});
t("a wrong meaning pick records no confusion, because there is no card to blame", () => {
  const ex = meaningChoice(A, 0, 3, FIXTURES);
  eq(gradeListening(ex, ex.choices.find((c) => c !== ex.answer)).confused, null);
});
t("evidence goes through makeEvidence and lands on the listening skill", () => {
  const ex = meaningChoice(A, 0, 3, FIXTURES);
  const rec = makeEvidence(listeningEvidence(ex, gradeListening(ex, ex.answer), 4200));
  eq(rec.skill, LISTEN_SKILL);
  ok(SKILLS.includes(rec.skill), "listening is not a skill the model knows");
  eq(rec.deck, LISTEN_DECK);
  eq(rec.format, LISTEN_FORMATS.MEANING);
  eq(rec.ok, true);
  eq(rec.ms, 4200);
  eq(rec.id, "seed-9-1#0", "the meaning row must name the line");
});
t("makeEvidence derives the modes, so the format table is what decides them", () => {
  for (const format of Object.values(LISTEN_FORMATS)) {
    const modes = modesForFormat(format);
    gte(modes.length, 1, format + " is not in FORMAT_MODES");
    ok(modes.includes("listening"), format + " does not claim listening");
    for (const m of modes) ok(COGNITIVE_MODES.includes(m), format + " claims an unknown mode: " + m);
    eq(skillForFormat(format), LISTEN_SKILL, format + " does not map to the listening skill");
  }
});
t("an exercise's own modes match the ones its evidence will carry", () => {
  const ex = speakerCall(A, 0, 3);
  const rec = makeEvidence(listeningEvidence(ex, gradeListening(ex, ex.answer), 1000));
  eq(JSON.stringify(ex.modes), JSON.stringify(rec.mode), "the card and the log disagree about what was asked");
});
t("the summary counts by task", () => {
  const s = listeningSummary([
    { format: LISTEN_FORMATS.MEANING, ok: true },
    { format: LISTEN_FORMATS.MEANING, ok: false },
    { format: LISTEN_FORMATS.SPEAKER, ok: true },
  ]);
  eq(s.answered, 3);
  eq(s.correct, 2);
  eq(s.byFormat[LISTEN_FORMATS.MEANING].n, 2);
  eq(s.byFormat[LISTEN_FORMATS.MEANING].ok, 1);
});
t("an empty session summarises to zero rather than to nothing", () => {
  eq(listeningSummary([]).answered, 0);
});
t("every task has a name the done screen can print", () => {
  for (const format of LISTEN_ORDER) ok(LISTEN_LABEL[format], format + " has no label");
  eq(Object.keys(LISTEN_LABEL).length, LISTEN_ORDER.length, "the label table has drifted from the format list");
});

console.log("\n=== against the 34 real dialogues and the real deck ===");

const REAL = listeningSet({ scripts: SCRIPT_SEED, cards: DECK, seed: 21, count: 12 });

t("a real session fills up", () => {
  eq(REAL.length, 12, "only " + REAL.length + " exercises from 34 scripts");
});
t("every real exercise is answerable: an answer, and at least two options", () => {
  for (const ex of REAL) {
    ok(ex.answer, ex.format + " has no answer");
    gte(ex.choices.length, 2, ex.format + " offers " + ex.choices.length + " options");
    ok(ex.choices.includes(ex.answer), ex.format + " does not offer its own answer");
    eq(new Set(ex.choices).size, ex.choices.length, ex.format + " offers the same option twice");
  }
});
t("every real exercise has audio and something to reveal afterwards", () => {
  for (const ex of REAL) {
    ok(ex.audio && ex.audio.trim(), ex.provenance.scriptId + " has nothing to play");
    ok(ex.reveal.text, ex.provenance.scriptId + " has nothing to reveal");
    ok(ex.reveal.en || ex.format === LISTEN_FORMATS.SPEAKER, ex.provenance.scriptId + " reveals no English");
  }
});
t("no real meaning question can be won on option length alone", () => {
  let checked = 0;
  for (let seed = 0; seed < 10; seed++) {
    for (const ex of listeningSet({ scripts: SCRIPT_SEED, cards: DECK, seed, count: 9 })) {
      if (ex.format !== LISTEN_FORMATS.MEANING) continue;
      checked++;
      const lens = ex.choices.map((c) => c.length);
      const closest = Math.min(...ex.choices.filter((c) => c !== ex.answer).map((c) => Math.abs(c.length - ex.answer.length)));
      ok(!(closest > 40 && Math.max(...lens) / Math.min(...lens) > 2.5),
        "an option list the answer stands out of by size: " + JSON.stringify(lens));
    }
  }
  gte(checked, 20, "only " + checked + " meaning questions across ten seeds");
});
t("every real exercise carries a provenance chip", () => {
  for (const ex of REAL) {
    ok(ex.provenance.label, "no chip on " + ex.provenance.scriptId);
    ok(ex.provenance.scriptId, "no script id on an exercise");
  }
});
t("the real 34 cover all three task types across seeds", () => {
  const formats = new Set();
  for (let seed = 0; seed < 8; seed++) {
    for (const ex of listeningSet({ scripts: SCRIPT_SEED, cards: DECK, seed, count: 9 })) formats.add(ex.format);
  }
  eq(formats.size, LISTEN_ORDER.length, "only saw " + [...formats].join(", "));
});
t("a learner who has only studied act 2 hears act 2 first", () => {
  /* Act 2 is the case worth testing: no card in the deck states it in card.sec, so placing
     these cards goes through SECTION_MAP inside provenanceOf. A fixture built by string
     matching on sec would silently find nothing. */
  const act2 = DECK.filter((c) => provenanceOf(c).act === 2).slice(0, 20);
  gte(act2.length, 5, "no act 2 cards in the deck to build the fixture from");
  const evidence = act2.map((c) => ({ id: c.id, at: Date.now() }));
  const set = listeningSet({ scripts: SCRIPT_SEED, cards: DECK, evidence, seed: 2, count: 6 });
  gte(set.length, 4, "session too short to judge");
  const acts = set.map((ex) => ex.provenance.act);
  ok(acts.filter((a) => a === 2).length >= Math.ceil(set.length / 2), "act 2 supplied only " + acts.filter((a) => a === 2).length + " of " + set.length);
});
t("every real exercise grades and logs without the model refusing it", () => {
  for (const ex of REAL) {
    const rec = makeEvidence(listeningEvidence(ex, gradeListening(ex, ex.answer), 3000));
    eq(rec.skill, LISTEN_SKILL, ex.format);
    gte(rec.mode.length, 1, ex.format + " logged with no cognitive mode");
    ok(rec.id, ex.format + " logged with no item id");
  }
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} listening tests passed`);
process.exit(fail ? 1 : 0);
