// Tests for the script-derived activities. The failure mode here is not a crash — it is a
// question that looks like practice and has the wrong answer, or two right answers, or a
// wrong option so implausible the exercise is answerable without reading the Japanese. So
// most of these check the generated activity back AGAINST the script it came from, and the
// last block runs every generator over all 34 real dialogues at once.
//
//   node tools/test-scriptplay.mjs
import {
  SCRIPT_FORMATS, ORDER_MIN, actSceneOf, provenanceFor, speakersOf,
  speakerQuiz, responseSelect, lineOrder, lineCloze, activitiesFor,
} from "./scriptplay.mjs";
import { lineText } from "./cloze.mjs";
import { gradeDrill } from "./production.mjs";
import { COGNITIVE_MODES } from "./learner.mjs";
import { SCRIPT_SEED } from "../src/data/scripts-seed.js";
import { SEED } from "../src/data/seed.js";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const gte = (a, b, m) => { if (!(a >= b)) throw new Error(`${m || ""} expected ${a} >= ${b}`); };

/* Two-speaker dialogue, one repeated line, one same-speaker continuation — every case the
   generators are supposed to refuse, in one fixture. */
const A = {
  id: "seed-9-1", name: "9-1",
  lines: [
    { speaker: "Aoki", tokens: [{ t: "毎日" }, { t: "食べ物", r: "たべもの" }, { t: "を買います。" }], romaji: "mainichi tabemono o kaimasu.", en: "I buy food every day." },
    { speaker: "Ben", tokens: [{ t: "そうですか。" }], romaji: "sō desu ka.", en: "Is that so." },
    { speaker: "Ben", tokens: [{ t: "大丈夫", r: "だいじょうぶ" }, { t: "です。" }], romaji: "daijōbu desu.", en: "It's fine." },
    { speaker: "Aoki", tokens: [{ t: "はい。" }], romaji: "hai.", en: "Yes." },
    { speaker: "Ben", tokens: [{ t: "はい。" }], romaji: "hai.", en: "Yes." },
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
    { speaker: "Gen", tokens: [{ t: "では、はじめます。" }], romaji: "dewa, hajimemasu.", en: "Well then, let's begin." },
  ],
};
const FIXTURES = [A, B, C, SOLO];
const CARDS = [
  { id: "a", term: "食べ物", reading: "たべもの", kind: "kanji" },
  { id: "b", term: "大丈夫", reading: "だいじょうぶ", kind: "kanji" },
  { id: "c", term: "学生", reading: "がくせい", kind: "kanji" },
  { id: "d", term: "先生", reading: "せんせい", kind: "kanji" },
  { id: "e", term: "時間", reading: "じかん", kind: "kanji" },
  { id: "f", term: "天気", reading: "てんき", kind: "kanji" },
];

console.log("=== where a dialogue sits in the book ===");
t("an id encodes its act and scene", () => {
  eq(actSceneOf("seed-2-3").act, 2);
  eq(actSceneOf("seed-2-3").scene, 3);
});
t("a suffixed id still reads as its own scene", () => {
  // seed-3-5-drill must not parse as scene "5-drill", and seed-3-2b must not become act 32.
  eq(actSceneOf("seed-3-5-drill").act, 3);
  eq(actSceneOf("seed-3-5-drill").scene, 5);
  eq(actSceneOf("seed-3-2b").scene, 2);
});
t("a script outside the act structure says so rather than guessing", () => {
  eq(actSceneOf("seed-culture-talk").act, null);
  eq(actSceneOf(null).act, null);
});
t("provenance names the script and the line", () => {
  const p = provenanceFor(A, 2);
  eq(p.scriptId, "seed-9-1");
  eq(p.lineIdx, 2);
  eq(p.act, 9);
});

console.log("\n=== who said it ===");
t("the answer is the speaker the script records", () => {
  const q = speakerQuiz(A, 0, 1);
  eq(q.answer, "Aoki");
  eq(q.prompt, lineText(A.lines[0]));
});
t("the choices are the dialogue's own speakers, and include the answer", () => {
  const q = speakerQuiz(A, 2, 4);
  eq(new Set(q.choices).size, q.choices.length, "no duplicate speakers");
  ok(q.choices.includes(q.answer), "the answer must be offered");
  eq(q.choices.slice().sort().join(","), speakersOf(A).slice().sort().join(","));
});
t("a line both speakers say is refused — it has two right answers", () => {
  // はい。 is line 3 (Aoki) and line 4 (Ben). Asking who said it is not a question.
  eq(speakerQuiz(A, 3, 0), null);
  eq(speakerQuiz(A, 4, 0), null);
});
t("a one-speaker script produces nothing rather than a one-option quiz", () => {
  eq(speakerQuiz(SOLO, 0, 0), null);
});
t("an index off the end is refused", () => {
  eq(speakerQuiz(A, 99, 0), null);
});

console.log("\n=== what comes next ===");
t("the answer is literally the next line of the script", () => {
  const q = responseSelect(A, 0, 3, FIXTURES);
  eq(q.answer, lineText(A.lines[1]));
  eq(q.prompt, lineText(A.lines[0]));
  eq(q.answerSpeaker, "Ben");
});
t("no wrong option equals the answer", () => {
  const q = responseSelect(A, 0, 3, FIXTURES);
  eq(q.choices.filter((c) => c === q.answer).length, 1, "the answer appears exactly once");
  eq(new Set(q.choices).size, q.choices.length, "no duplicate options");
});
t("no wrong option is a line from this same dialogue", () => {
  // Another line of the same conversation could genuinely be said here — an option that
  // might also be right is a broken question, not a hard one.
  const q = responseSelect(A, 0, 3, FIXTURES);
  const own = new Set(A.lines.map(lineText));
  for (const c of q.choices) {
    if (c === q.answer) continue;
    eq(own.has(c), false, "a distractor came from the source script: " + c);
  }
});
t("the same speaker continuing is not a response", () => {
  // A.lines[1] and A.lines[2] are both Ben. Asking "what does he say back" about his own
  // next sentence teaches the wrong shape of a conversation.
  eq(responseSelect(A, 1, 0, FIXTURES), null);
});
t("the last line has nothing following it", () => {
  eq(responseSelect(A, A.lines.length - 1, 0, FIXTURES), null);
});
t("wrong replies prefer the same act over a distant one", () => {
  // B is act 9 like A; C is act 4. With one slot the near one must win.
  const q = responseSelect(A, 0, 0, FIXTURES, 1);
  const wrong = q.choices.filter((c) => c !== q.answer);
  eq(wrong.length, 1);
  ok(B.lines.map(lineText).includes(wrong[0]), "expected a same-act distractor, got " + wrong[0]);
});
t("with no other scripts there is nothing to distract with", () => {
  eq(responseSelect(A, 0, 0, [A]), null);
});
t("every option carries its English so a correction can explain itself", () => {
  const q = responseSelect(A, 0, 3, FIXTURES);
  for (const c of q.choices) ok(c in q.glosses, "no gloss for " + c);
});

console.log("\n=== put the exchange back together ===");
t("the answer is the real consecutive order", () => {
  const d = lineOrder(A, 2);
  const texts = A.lines.map(lineText);
  const at = texts.indexOf(d.answer[0]);
  eq(d.answer.join("|"), texts.slice(at, at + d.answer.length).join("|"));
});
t("the tiles are the same pieces in a different order", () => {
  const d = lineOrder(A, 2);
  eq(d.tiles.slice().sort().join("|"), d.answer.slice().sort().join("|"), "same multiset");
  ok(d.tiles.join("|") !== d.answer.join("|"), "a puzzle that arrives solved is not a puzzle");
});
t("production.mjs grades it unchanged", () => {
  // The point of carrying type: DRILL.ORDER — the drill grader already knows this shape.
  const d = lineOrder(A, 2);
  eq(gradeDrill(d, d.answer).ok, true);
  const swapped = [d.answer[1], d.answer[0], ...d.answer.slice(2)];
  eq(gradeDrill(d, swapped).ok, false);
});
t("a window with a repeated line is skipped, not graded on a guess", () => {
  // A ends はい。/はい。 — any window covering both has two correct orderings.
  for (let seed = 0; seed < 8; seed++) {
    const d = lineOrder(A, seed);
    if (!d) continue;
    eq(new Set(d.answer).size, d.answer.length, "seed " + seed + " produced a duplicate tile");
  }
});
t("provenance points at the line as it sits in the script", () => {
  const d = lineOrder(A, 2);
  eq(lineText(A.lines[d.provenance.lineIdx]), d.answer[0]);
});
t("a two-turn script is too short to reassemble", () => {
  eq(lineOrder(B, 0), null);
  gte(ORDER_MIN, 3);
});
t("a one-speaker script still reassembles — the turns are still ordered", () => {
  ok(lineOrder(SOLO, 0), "a monologue has a sequence too");
});

console.log("\n=== a blank in a real line ===");
t("the sentence reassembles to the line it came from", () => {
  const c = lineCloze(A, 0, CARDS);
  eq(c.before + c.answer + c.after, lineText(A.lines[0]));
  eq(c.en, A.lines[0].en);
});
t("the answer is not visible in the prompt", () => {
  const c = lineCloze(A, 0, CARDS);
  eq(c.sentence.includes(c.answer), false, "the answer must be blanked out");
  eq(c.blank.length, c.answer.length);
});
t("the longest word in the line is the one blanked", () => {
  // 食べ物 over 買 — blanking the most contentful word asks the most.
  eq(lineCloze(A, 0, CARDS).answer, "食べ物");
});
t("the choices include the answer and nothing duplicated", () => {
  const c = lineCloze(A, 0, CARDS);
  ok(c.choices.includes(c.answer), "the answer must be offered");
  eq(new Set(c.choices).size, c.choices.length);
});
t("a line with no deck word in it produces nothing", () => {
  eq(lineCloze(A, 1, CARDS), null);        // そうですか。 contains no card term
  eq(lineCloze(A, 0, []), null);           // and no deck means no blank
});

console.log("\n=== every activity says where it came from and what it asked for ===");
t("format, modes and provenance are on all four types", () => {
  const { activities } = activitiesFor(A, { seed: 5, scripts: FIXTURES, cards: CARDS });
  gte(activities.length, 3);
  for (const a of activities) {
    ok(typeof a.format === "string" && a.format, "missing format");
    ok(Array.isArray(a.modes) && a.modes.length, a.format + " declares no cognitive mode");
    for (const m of a.modes) ok(COGNITIVE_MODES.includes(m), a.format + " claims an unknown mode: " + m);
    ok(a.provenance && a.provenance.scriptId === A.id, "missing scriptId");
    ok(Number.isInteger(a.provenance.lineIdx), "missing lineIdx");
  }
});
t("a refusal comes with a stated reason", () => {
  const { activities, skipped } = activitiesFor(SOLO, { seed: 0, scripts: FIXTURES, cards: CARDS });
  gte(skipped.length, 1);
  for (const s of skipped) ok(s.reason && s.reason.length > 10, "a bare skip with no reason: " + s.format);
  eq(activities.length + skipped.length, 4, "every generator either produced or explained");
});

console.log("\n=== over all 34 real dialogues ===");
const DECK = SEED.map((c, i) => ({ id: "seed:" + i, ...c }));
const SEEDS = [0, 1, 2, 7, 13];
const ALL = [];
for (const s of SCRIPT_SEED) for (const seed of SEEDS) ALL.push([s, seed, activitiesFor(s, { seed, scripts: SCRIPT_SEED, cards: DECK })]);

t("there are 34 of them", () => eq(SCRIPT_SEED.length, 34));
t("every script yields at least three activity types, or explains each gap", () => {
  for (const s of SCRIPT_SEED) {
    const { activities, skipped } = activitiesFor(s, { seed: 3, scripts: SCRIPT_SEED, cards: DECK });
    eq(new Set(activities.map((a) => a.format)).size, activities.length, s.id + " repeated a format");
    if (activities.length >= 3) continue;
    // Fewer than three is allowed only when the shortfall is accounted for line by line.
    eq(activities.length + skipped.length, 4, s.id + " produced " + activities.length + " and explained " + skipped.length);
    for (const k of skipped) ok(k.reason && k.reason.length > 10, s.id + ": " + k.format + " skipped without a reason");
  }
});
t("the same seed always gives the same activities", () => {
  for (const [s, seed, first] of ALL) {
    const again = activitiesFor(s, { seed, scripts: SCRIPT_SEED, cards: DECK });
    eq(JSON.stringify(again), JSON.stringify(first), s.id + " is not deterministic at seed " + seed);
  }
});
t("a different seed asks a different question", () => {
  // Determinism must not be reached by ignoring the seed and always returning line 0.
  let moved = 0;
  for (const s of SCRIPT_SEED) {
    const a = JSON.stringify(activitiesFor(s, { seed: 0, scripts: SCRIPT_SEED, cards: DECK }));
    const b = JSON.stringify(activitiesFor(s, { seed: 1, scripts: SCRIPT_SEED, cards: DECK }));
    if (a !== b) moved++;
  }
  gte(moved, 20, "only " + moved + " of 34 scripts responded to the seed");
});
t("every generated answer is actually correct against the script", () => {
  for (const [s, seed, { activities }] of ALL) {
    const texts = s.lines.map(lineText);
    for (const a of activities) {
      const where = s.id + " seed " + seed + " " + a.format;
      const i = a.provenance.lineIdx;
      if (a.format === SCRIPT_FORMATS.SPEAKER) {
        eq(a.answer, s.lines[i].speaker, where);
        eq(a.prompt, texts[i], where);
      } else if (a.format === SCRIPT_FORMATS.RESPONSE) {
        eq(a.prompt, texts[i], where);
        eq(a.answer, texts[i + 1], where);
        ok(s.lines[i].speaker !== s.lines[i + 1].speaker, where + ": same speaker twice");
      } else if (a.format === SCRIPT_FORMATS.ORDER) {
        eq(a.answer.join("|"), texts.slice(i, i + a.answer.length).join("|"), where);
      } else if (a.format === SCRIPT_FORMATS.CLOZE) {
        eq(a.before + a.answer + a.after, texts[i], where);
        eq(a.en, s.lines[i].en, where);
      }
    }
  }
});
t("no distractor ever equals the answer", () => {
  for (const [s, seed, { activities }] of ALL) {
    for (const a of activities) {
      const where = s.id + " seed " + seed + " " + a.format;
      if (Array.isArray(a.choices)) {
        eq(a.choices.filter((c) => c === a.answer).length, 1, where + ": the answer must appear exactly once");
        eq(new Set(a.choices).size, a.choices.length, where + ": duplicate options");
      }
      if (a.format === SCRIPT_FORMATS.ORDER) {
        eq(new Set(a.answer).size, a.answer.length, where + ": two identical tiles");
        eq(a.tiles.slice().sort().join("|"), a.answer.slice().sort().join("|"), where);
      }
    }
  }
});
t("a wrong reply never comes from the dialogue it has to fit into", () => {
  for (const [s, seed, { activities }] of ALL) {
    const own = new Set(s.lines.map(lineText));
    for (const a of activities) {
      if (a.format !== SCRIPT_FORMATS.RESPONSE) continue;
      for (const c of a.choices) {
        if (c === a.answer) continue;
        eq(own.has(c), false, s.id + " seed " + seed + ": distractor from the same script: " + c);
      }
    }
  }
});
t("wrong replies come from the same act far more often than not", () => {
  // The MP-07 tier, measured rather than asserted per-case: a same-act distractor is made
  // of words the learner has met, so choosing needs comprehension instead of elimination.
  let same = 0, total = 0;
  for (const [s, seed, { activities }] of ALL) {
    const here = actSceneOf(s.id).act;
    if (here == null) continue;
    const byText = new Map();
    for (const o of SCRIPT_SEED) for (const l of o.lines) if (!byText.has(lineText(l))) byText.set(lineText(l), o.id);
    for (const a of activities) {
      if (a.format !== SCRIPT_FORMATS.RESPONSE) continue;
      for (const c of a.choices) {
        if (c === a.answer) continue;
        total++;
        if (actSceneOf(byText.get(c)).act === here) same++;
      }
    }
  }
  gte(total, 50, "not enough distractors to measure");
  ok(same / total > 0.6, "only " + same + "/" + total + " distractors came from the same act");
});
t("every activity from every script carries a mode from the taxonomy", () => {
  for (const [s, seed, { activities }] of ALL) {
    for (const a of activities) {
      ok(a.modes.length >= 1, s.id + " seed " + seed + " " + a.format + " has no mode");
      for (const m of a.modes) ok(COGNITIVE_MODES.includes(m), a.format + " claims an unknown mode: " + m);
    }
  }
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} scriptplay tests passed`);
process.exit(fail ? 1 : 0);
