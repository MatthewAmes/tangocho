// Tests for tools/perform.mjs — performing a scene as one of its speakers.
//
//   node tools/test-perform.mjs
import { performTurns, performEvidence, PERFORM_GRADES } from "./perform.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const L = (speaker, t) => ({ speaker, tokens: [{ t }] });
const SCENE = { name: "7-1", lines: [L("A", "おはよう。"), L("B", "おはよう。"), L("A", "寒いね。"), L("A", "大丈夫？"), L("B", "うん。")] };

t("each of my lines is a turn, cued by what was said before it", () => {
  const turns = performTurns(SCENE, "B");
  eq(turns.length, 2);
  eq(turns[0].cue.map((c) => c.text), ["おはよう。"]);
  eq(turns[1].cue.map((c) => c.text), ["寒いね。", "大丈夫？"], "two lines of theirs cue one of mine");
  eq(turns[1].line.text, "うん。");
});
t("opening the scene means a turn with no cue; consecutive lines are separate turns", () => {
  const turns = performTurns(SCENE, "A");
  eq(turns.map((x) => x.cue.length), [0, 1, 0]);
  eq(turns.map((x) => x.line.idx), [0, 2, 3]);
});
t("only a smooth delivery counts as right", () => {
  eq(performEvidence({ scene: "7-1", lineIdx: 2, grade: "smooth", ms: 3000 }, 1).ok, true);
  const h = performEvidence({ scene: "7-1", lineIdx: 2, grade: "hesitated" }, 1);
  eq([h.ok, h.failure, h.id], [false, "fluency", "perform:7-1:2"]);
  eq(performEvidence({ scene: "7-1", lineIdx: 2, grade: "couldnt" }, 1).failure, "blank");
  eq(PERFORM_GRADES.map((g) => g[0]), ["smooth", "hesitated", "couldnt"]);
});
t("a part with no lines has nothing to perform", () => eq(performTurns(SCENE, "C").length, 0));

console.log(fail ? `${fail} of ${run} perform tests FAILED` : `all ${run} perform tests passed`);
process.exit(fail ? 1 : 0);
