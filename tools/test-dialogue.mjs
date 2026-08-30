// Tests for dialogue mode. Two failures matter more than a crash here, and neither of them
// looks wrong on screen: a turn that cannot be finished (the conversation stops dead), and
// a distractor that is also a right answer (the learner is told "no" for saying something
// correct). Most of what follows is about those two, and the last block runs every playable
// part of all 34 real dialogues to prove they hold on the material Matthew actually has.
//
//   node tools/test-dialogue.mjs
import {
  DIALOGUE_FORMAT, DIALOGUE_SKILL, DIALOGUE_DECK, TURN, STEP, CHOICES,
  nextStep, replyIndex, interchangeable, outOfScale, castFor, suggestPart, bossScripts,
  buildDialogue, gradeTurn, downshift, turnEvidence, scoreTurn, dialogueSummary,
  playableScripts,
} from "./dialogue.mjs";
import { makeEvidence, modesForFormat, skillForFormat, SKILLS, COGNITIVE_MODES, CUE, SCORE } from "./learner.mjs";
import { lineText } from "./cloze.mjs";
import { coordsOf } from "./curriculum.mjs";
import { SCRIPT_SEED } from "../src/data/scripts-seed.js";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "") + " expected " + b + ", got " + a); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const gte = (a, b, m) => { if (!(a >= b)) throw new Error((m || "") + " expected " + a + " >= " + b); };

/* Two two-speaker dialogues in the same act, so the distractor tiering has somewhere to
   draw from; a third one act away; and a monologue the mode must refuse. */
const A = {
  id: "seed-9-1", name: "9-1",
  lines: [
    { speaker: "Aoki", tokens: [{ t: "毎日" }, { t: "食べ物", r: "たべもの" }, { t: "を買いますか。" }], romaji: "mainichi tabemono o kaimasu ka.", en: "Do you buy food every day?" },
    { speaker: "Ben", tokens: [{ t: "はい、買います。" }], romaji: "hai, kaimasu.", en: "Yes, I buy it." },
    { speaker: "Aoki", tokens: [{ t: "大丈夫", r: "だいじょうぶ" }, { t: "ですか。" }], romaji: "daijōbu desu ka.", en: "Is it all right?" },
    { speaker: "Ben", tokens: [{ t: "ええ、大丈夫です。" }], romaji: "ē, daijōbu desu.", en: "Yes, it's fine." },
    { speaker: "Aoki", tokens: [{ t: "じゃあ、また。" }], romaji: "jā, mata.", en: "See you then." },
  ],
};
const B = {
  id: "seed-9-2", name: "9-2",
  lines: [
    { speaker: "Chie", tokens: [{ t: "学生", r: "がくせい" }, { t: "ですか。" }], romaji: "gakusei desu ka.", en: "Are you a student?" },
    { speaker: "Dai", tokens: [{ t: "いいえ、ちがいます。" }], romaji: "iie, chigaimasu.", en: "No, that's not right." },
    { speaker: "Chie", tokens: [{ t: "そうですか。" }], romaji: "sō desu ka.", en: "Is that so." },
    { speaker: "Dai", tokens: [{ t: "すみません。" }], romaji: "sumimasen.", en: "Sorry." },
  ],
};
const C = {
  id: "seed-8-4", name: "8-4",
  lines: [
    { speaker: "Emi", tokens: [{ t: "時間", r: "じかん" }, { t: "がありません。" }], romaji: "jikan ga arimasen.", en: "There's no time." },
    { speaker: "Fumi", tokens: [{ t: "わかりました。" }], romaji: "wakarimashita.", en: "Understood." },
    { speaker: "Emi", tokens: [{ t: "ありがとうございます。" }], romaji: "arigatō gozaimasu.", en: "Thank you." },
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

console.log("=== the conversation always completes ===");

/* The single most important property in this file. A miss must not be able to end the run
   or to loop, from any state, however many times it happens. */
t("every step reaches DONE, and a wrong answer never returns to ASK", () => {
  for (const from of [STEP.ASK, STEP.CUE, STEP.REVEAL]) {
    eq(nextStep(from, true), STEP.DONE, "correct at " + from);
    ok(nextStep(from, false) !== STEP.ASK, "wrong at " + from + " went back to the top");
  }
  // Three misses in a row, which is more than the ladder has rungs.
  let s = STEP.ASK;
  for (let i = 0; i < 3; i++) s = nextStep(s, false);
  eq(s, STEP.REVEAL, "a run of misses did not settle on the reveal");
});

t("the downshift never removes the answer, however many wrong picks pile up", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  const turn = d.beats.map((b) => b.turn).find((x) => x && x.kind === TURN.CHOICE);
  ok(turn, "no choice turn in the fixture");
  const left = downshift(turn, turn.choices.slice());     // pretend they picked everything
  ok(left.includes(turn.answer), "the answer was downshifted away");
  gte(left.length, 2, "the downshift left fewer than two options");
});

t("a wrong pick is dropped and the rest keep their order", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  const turn = d.beats.map((b) => b.turn).find((x) => x && x.kind === TURN.CHOICE);
  const wrong = turn.choices.find((c) => c !== turn.answer);
  const left = downshift(turn, [wrong]);
  eq(left.length, turn.choices.length - 1, "wrong option not removed");
  ok(!left.includes(wrong), "the wrong pick is still on offer");
  eq(left.join("|"), turn.choices.filter((c) => c !== wrong).join("|"), "order moved under the learner");
});

console.log("=== distractors that might also be right ===");

t("an option glossed the same as the answer is barred", () => {
  const idx = replyIndex(FIXTURES);
  ok(interchangeable(idx, { text: "x", en: "y" }, "Yes, it's fine.", "ええ、大丈夫です。", "  YES, it's FINE!!  "),
    "a gloss differing only in case and punctuation was let through");
  ok(!interchangeable(idx, { text: "x", en: "y" }, "Yes, it's fine.", "すみません。", "Sorry."));
});

t("an option attested as a reply to this very cue is barred", () => {
  const idx = replyIndex(FIXTURES);
  // 学生ですか。 is answered by いいえ、ちがいます。 in B, so it cannot be a wrong answer to it.
  ok(interchangeable(idx, { text: "学生ですか。", en: "Are you a student?" }, "はい、そうです。", "いいえ、ちがいます。", "No."),
    "an attested reply to the same Japanese cue was offered as a distractor");
});

t("an option attested as a reply to a cue that MEANS the same is barred", () => {
  const idx = replyIndex(FIXTURES);
  ok(interchangeable(idx, { text: "べつの日本語。", en: "are you a student" }, "はい、そうです。", "いいえ、ちがいます。", "No."),
    "the English key of the reply index did not fire");
});

t("an option answerable with a ruler is barred", () => {
  const short = "いえいえ。";
  const para = "はい、ブライアン・ワンです。アメリカのオレゴン州から来ました。今福沢大学の留学生センターで勉強しています。";
  ok(outOfScale(short, para), "a paragraph against a four-character reply was let through");
  // Both halves of the rule have to be doing work.
  ok(!outOfScale("はい。", "そうですか。"), "a 2x pair of short lines was refused on ratio alone");
  ok(!outOfScale("今日はいい天気ですね、本当に。", "すみません、ちょっと時間がありませんので、また今度お願いします。"),
    "two ordinary long lines were refused on gap alone");
  ok(!outOfScale("", "x"), "an empty string should not throw or refuse");
});

t("no real turn puts a paragraph against a one-liner", () => {
  for (const row of playableScripts(SCRIPT_SEED)) {
    if (!row.playable) continue;
    for (const p of row.parts) {
      for (let seed = 0; seed < 3; seed++) {
        const d = buildDialogue(row.script, { scripts: SCRIPT_SEED, seed, part: p.speaker });
        for (const b of d.beats) {
          const turn = b.turn;
          if (!turn || turn.kind !== TURN.CHOICE) continue;
          for (const c of turn.choices) {
            if (c === turn.answer) continue;
            ok(!outOfScale(turn.answer, c), row.id + ": " + turn.answer + " against " + c.slice(0, 20));
          }
        }
      }
    }
  }
});

t("the index skips a speaker continuing their own turn", () => {
  // SOLO is one speaker throughout, so nothing in it is a reply to anything.
  const idx = replyIndex([SOLO]);
  eq(idx.byJa.size, 0, "a monologue produced reply pairs");
});

t("no real turn offers an option the guard would have called interchangeable", () => {
  const idx = replyIndex(SCRIPT_SEED);
  let checked = 0;
  for (const row of playableScripts(SCRIPT_SEED)) {
    if (!row.playable) continue;
    for (const p of row.parts) {
      for (let seed = 0; seed < 3; seed++) {
        const d = buildDialogue(row.script, { scripts: SCRIPT_SEED, seed, part: p.speaker, index: idx });
        for (const b of d.beats) {
          const turn = b.turn;
          if (!turn || turn.kind !== TURN.CHOICE) continue;
          checked += 1;
          for (const c of turn.choices) {
            if (c === turn.answer) continue;
            ok(!interchangeable(idx, turn.cueLine, turn.reveal.en, c, turn.glosses[c]),
              row.id + " offered " + c + " against " + turn.answer);
          }
        }
      }
    }
  }
  gte(checked, 300, "only checked " + checked + " turns");
});

t("no turn offers the answer twice, or an option from the same dialogue", () => {
  for (const row of playableScripts(SCRIPT_SEED)) {
    if (!row.playable) continue;
    const own = new Set(row.script.lines.map(lineText));
    for (const p of row.parts) {
      const d = buildDialogue(row.script, { scripts: SCRIPT_SEED, seed: 5, part: p.speaker });
      for (const b of d.beats) {
        const turn = b.turn;
        if (!turn || turn.kind !== TURN.CHOICE) continue;
        eq(new Set(turn.choices).size, turn.choices.length, row.id + " repeated an option");
        for (const c of turn.choices) {
          if (c === turn.answer) continue;
          ok(!own.has(c), row.id + " drew " + c + " from its own dialogue");
        }
      }
    }
  }
});

console.log("=== who plays which side ===");

t("a two-speaker script is playable from either side", () => {
  const cast = castFor(A);
  ok(cast.playable);
  eq(cast.parts.length, 2);
  ok(cast.parts.every((p) => p.lines > 0));
});

t("a monologue is refused, with a reason", () => {
  const cast = castFor(SOLO);
  eq(cast.playable, false);
  ok(/one speaker/.test(cast.reason), cast.reason);
  eq(buildDialogue(SOLO, { scripts: FIXTURES }).playable, false);
  eq(suggestPart(SOLO), null);
});

t("the suggested part is the side with the most askable turns", () => {
  /* A is Aoki, Ben, Aoki, Ben, Aoki. Both sides get two askable turns, but Aoki also opens
     the conversation, and an opening line cannot be a question — so Ben is the side where
     every turn is a real one, which is the tie-break. */
  const cast = castFor(A);
  const ben = cast.parts.find((p) => p.speaker === "Ben");
  const aoki = cast.parts.find((p) => p.speaker === "Aoki");
  eq(ben.graded, aoki.graded, "the fixture no longer ties");
  eq(ben.lines, 2); eq(aoki.lines, 3);
  eq(suggestPart(A), "Ben");
});

t("an unknown part falls back to the suggested one rather than an empty run", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, part: "Nobody" });
  eq(d.part, suggestPart(A));
  gte(d.turnsTotal, 1);
});

console.log("=== the run ===");

t("the other side's lines are grouped into the turn they set up", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  // A: Aoki, Ben, Aoki, Ben, Aoki -> two beats with a turn, then a closing beat.
  eq(d.beats.length, 3);
  eq(d.beats[0].npc.length, 1);
  ok(d.beats[0].turn && d.beats[0].turn.kind === TURN.CHOICE);
  eq(d.beats[2].turn, null, "the closing line was not left as its own beat");
  eq(d.beats[2].npc.length, 1);
});

t("every line of the script appears exactly once across the beats", () => {
  for (const part of ["Aoki", "Ben"]) {
    const d = buildDialogue(A, { scripts: FIXTURES, seed: 2, part });
    const seen = [];
    for (const b of d.beats) {
      for (const n of b.npc) seen.push(n.lineIdx);
      if (b.turn) seen.push(b.turn.lineIdx);
    }
    eq(seen.length, A.lines.length, part + " lost or duplicated a line");
    eq(seen.slice().sort((x, y) => x - y).join(","), A.lines.map((_, i) => i).join(","), part + " reordered the script");
  }
});

t("the opening line is a say turn, with the reason stated", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Aoki" });
  const first = d.beats[0].turn;
  eq(first.kind, TURN.SAY);
  eq(first.lineIdx, 0);
  ok(/opening line/.test(first.reason), first.reason);
  eq(d.beats[0].npc.length, 0, "an opener should have nothing before it");
});

t("a say turn still carries the line, so the conversation is complete", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Aoki" });
  const say = d.beats[0].turn;
  eq(say.reveal.text, lineText(A.lines[0]));
  ok(say.reveal.en, "no English to say it from");
});

t("a choice turn shows the cue line and hides its English until the turn resolves", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  const turn = d.beats[0].turn;
  eq(turn.cueLine.lineIdx, turn.lineIdx - 1);
  ok(turn.cueLine.text, "the cue has no Japanese to show");
  /* The learner's own line must not be on the turn anywhere the component renders before
     an answer: it lives under `reveal`, the same boundary listening.mjs draws. */
  const VISIBLE = ["kind", "lineIdx", "speaker", "format", "modes", "skill", "deck", "cue",
    "prompt", "cueLine", "answer", "choices", "glosses", "romaji", "reveal", "provenance", "evidenceId"];
  for (const k of Object.keys(turn)) ok(VISIBLE.includes(k), "unexpected field " + k + " on a turn");
});

t("the same seed builds the same run, a different seed moves the options", () => {
  const one = buildDialogue(A, { scripts: FIXTURES, seed: 7, part: "Ben" });
  const two = buildDialogue(A, { scripts: FIXTURES, seed: 7, part: "Ben" });
  eq(JSON.stringify(one), JSON.stringify(two), "not deterministic under seed");
  let moved = false;
  for (let s = 0; s < 6 && !moved; s++) {
    const other = buildDialogue(A, { scripts: FIXTURES, seed: s, part: "Ben" });
    const a = one.beats.map((b) => (b.turn && b.turn.choices || []).join("|")).join("//");
    const c = other.beats.map((b) => (b.turn && b.turn.choices || []).join("|")).join("//");
    if (a !== c) moved = true;
  }
  ok(moved, "every seed produced the same options");
});

t("two turns in one run do not get the same option set", () => {
  const d = buildDialogue(SCRIPT_SEED.find((s) => s.id === "seed-6-6"), { scripts: SCRIPT_SEED, seed: 3, part: "Sasha" });
  const sets = d.beats.map((b) => b.turn).filter((x) => x && x.kind === TURN.CHOICE)
    .map((x) => x.choices.slice().sort().join("|"));
  gte(sets.length, 3, "not enough turns to judge");
  eq(new Set(sets).size, sets.length, "a turn repeated another turn's options");
});

console.log("=== grading, evidence and reward ===");

t("the real line is right and everything else is wrong", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  const turn = d.beats[0].turn;
  eq(gradeTurn(turn, turn.answer).ok, true);
  for (const c of turn.choices) {
    if (c === turn.answer) continue;
    const g = gradeTurn(turn, c);
    eq(g.ok, false, c + " graded correct");
    eq(g.failure, "context", "wrong failure type");
    ok(typeof g.choseEn === "string", "no gloss for the correction");
  }
  eq(gradeTurn(turn, null).ok, false, "answering nothing is not correct");
});

t("a say turn cannot be graded", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Aoki" });
  eq(gradeTurn(d.beats[0].turn, "anything"), null);
  eq(turnEvidence(d.beats[0].turn, { ok: true }, 1000), null, "a say turn wrote evidence");
});

t("evidence carries the format, the skill, the cue and a line the curriculum can place", () => {
  const script = SCRIPT_SEED.find((s) => s.id === "seed-4-2");
  const d = buildDialogue(script, { scripts: SCRIPT_SEED, seed: 1, part: "Kanda" });
  const turn = d.beats.map((b) => b.turn).find((x) => x && x.kind === TURN.CHOICE);
  const rec = makeEvidence(turnEvidence(turn, gradeTurn(turn, turn.answer), 4200));
  eq(rec.format, DIALOGUE_FORMAT);
  eq(rec.skill, DIALOGUE_SKILL);
  eq(rec.deck, DIALOGUE_DECK);
  eq(rec.cue, CUE.CHOOSE);
  eq(rec.ok, true);
  eq(rec.ms, 4200);
  gte(rec.mode.length, 1, "logged with no cognitive mode");
  ok(rec.mode.every((m) => COGNITIVE_MODES.includes(m)), "an invented cognitive mode: " + rec.mode.join(","));
  eq(coordsOf(String(rec.id).split("#")[0]).act, 4, "the row cannot be placed back on the curriculum");
});

t("the model agrees about the format on its own", () => {
  // skillForFormat and FORMAT_MODES are the join with the learner model. If the format is
  // only known to this file, the profile reports a skill nobody was ever tested on.
  eq(skillForFormat(DIALOGUE_FORMAT), DIALOGUE_SKILL);
  ok(SKILLS.includes(DIALOGUE_SKILL));
  gte(modesForFormat(DIALOGUE_FORMAT).length, 1, "the format is not in FORMAT_MODES");
});

t("XP comes from the session engine's own scorer, and never goes down", () => {
  const hit = scoreTurn({ ok: true });
  const miss = scoreTurn({ ok: false });
  eq(hit.points, SCORE.attempt + SCORE.correct, "a picked-from-options hit is worth attempt + correct");
  eq(miss.points, SCORE.attempt, "a miss earns the attempt and nothing else");
  gte(miss.points, 0, "points went negative");
  gte(scoreTurn({ ok: true }, "fast").points, hit.points, "answering fast paid less");
});

console.log("=== the end screen ===");

t("comprehension counts the first attempt only, and cue usage is reported beside it", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  const rows = [
    { kind: TURN.CHOICE, ok: true, act: 9 },
    { kind: TURN.CHOICE, ok: false, cued: true, act: 9 },
    { kind: TURN.CHOICE, ok: false, revealed: true, act: 9 },
    { kind: TURN.SAY, act: 9 },
  ];
  const sum = dialogueSummary(rows, d);
  eq(sum.graded, 3);
  eq(sum.unaided, 1);
  eq(sum.cued, 1);
  eq(sum.revealed, 1);
  eq(sum.said, 1);
  eq(Math.round(sum.comprehension * 100), 33);
  eq(sum.acts.join(","), "9", "act provenance lost");
});

t("a run with nothing graded reports no comprehension rather than zero", () => {
  const sum = dialogueSummary([{ kind: TURN.SAY }], null);
  eq(sum.comprehension, null);
  eq(sum.graded, 0);
});

t("the summary knows the conversation finished", () => {
  const d = buildDialogue(A, { scripts: FIXTURES, seed: 1, part: "Ben" });
  const rows = d.beats.filter((b) => b.turn).map((b) => ({ kind: b.turn.kind, ok: true, act: 9 }));
  eq(dialogueSummary(rows, d).completed, true);
  eq(dialogueSummary(rows.slice(0, 1), d).completed, false, "a run cut short reported as completed");
});

console.log("=== the boss ===");

t("the boss of an act is its last playable scene", () => {
  const bosses = bossScripts(SCRIPT_SEED);
  ok(bosses.has("seed-2-8"), "act 2 boss");
  ok(bosses.has("seed-4-6"), "act 4 boss");
  ok(bosses.has("seed-6-6"), "act 6 boss");
  ok(!bosses.has("seed-2-1"), "an opening scene was crowned");
  /* Act 3 ends on Kuno's monologue, which this mode cannot run. The boss is the last scene
     that CAN be played, not the last scene. */
  ok(!bosses.has("seed-3-7"), "a monologue was crowned as a boss");
  ok(bosses.has("seed-3-6"), "act 3 boss should fall back to the last playable scene");
});

t("a script outside the act structure is not a boss", () => {
  eq(bossScripts(SCRIPT_SEED).has("seed-culture-talk"), false);
  eq(bossScripts([{ id: "pasted-in", lines: A.lines }]).size, 0, "an unplaceable script was crowned");
});

console.log("=== all 34 real dialogues ===");

t("32 of the 34 are playable, and the two that are not say why", () => {
  const rows = playableScripts(SCRIPT_SEED);
  eq(rows.length, SCRIPT_SEED.length);
  const no = rows.filter((r) => !r.playable);
  eq(no.length, 2, "expected exactly the two monologues, got " + no.map((r) => r.id).join(","));
  ok(no.every((r) => r.reason), "a refusal with no reason");
  ok(rows.slice(0, rows.length - no.length).every((r) => r.playable), "the picker did not sort playable first");
});

t("the picker reads in book order", () => {
  const acts = playableScripts(SCRIPT_SEED).filter((r) => r.playable && r.act != null).map((r) => r.act);
  for (let i = 1; i < acts.length; i++) gte(acts[i], acts[i - 1], "act " + acts[i] + " after act " + acts[i - 1]);
});

t("every playable part of every script produces a finishable run", () => {
  const idx = replyIndex(SCRIPT_SEED);
  let runs = 0, turns = 0, graded = 0;
  for (const row of playableScripts(SCRIPT_SEED)) {
    if (!row.playable) continue;
    for (const p of row.parts) {
      const d = buildDialogue(row.script, { scripts: SCRIPT_SEED, seed: 4, part: p.speaker, index: idx });
      ok(d.playable, row.id + " / " + p.speaker + " is not playable");
      gte(d.turnsTotal, 1, row.id + " / " + p.speaker + " gave the learner nothing to say");
      runs += 1; turns += d.turnsTotal; graded += d.graded;
      for (const b of d.beats) {
        const turn = b.turn;
        if (!turn || turn.kind !== TURN.CHOICE) continue;
        gte(turn.choices.length, 3, row.id + " offered a coin flip");
        ok(turn.choices.length <= CHOICES + 1, row.id + " offered " + turn.choices.length + " options");
        ok(turn.choices.includes(turn.answer), row.id + " left the answer off the list");
        ok(turn.romaji, row.id + " has no rōmaji for the downshift");
        ok(turn.provenance.label, row.id + " has no provenance chip");
      }
    }
  }
  gte(runs, 60, "only " + runs + " playable parts");
  gte(turns, 180, "only " + turns + " learner turns across the book");
  // Most of a learner's turns should be real questions rather than say-it-out-loud beats.
  ok(graded / turns > 0.75, "only " + Math.round((graded / turns) * 100) + "% of turns could be graded");
});

t("every real turn grades, logs and scores without the model refusing it", () => {
  for (const row of playableScripts(SCRIPT_SEED)) {
    if (!row.playable) continue;
    const d = buildDialogue(row.script, { scripts: SCRIPT_SEED, seed: 6, part: row.suggested });
    for (const b of d.beats) {
      const turn = b.turn;
      if (!turn || turn.kind !== TURN.CHOICE) continue;
      const g = gradeTurn(turn, turn.choices[0]);
      const rec = makeEvidence(turnEvidence(turn, g, 3000));
      eq(rec.skill, DIALOGUE_SKILL, row.id);
      ok(rec.id, row.id + " logged with no item id");
      gte(scoreTurn(g).points, SCORE.attempt, row.id + " paid nothing for the attempt");
    }
  }
});

console.log(fail ? "\n" + fail + "/" + run + " FAILED" : "\nall " + run + " dialogue tests passed");
process.exit(fail ? 1 : 0);
