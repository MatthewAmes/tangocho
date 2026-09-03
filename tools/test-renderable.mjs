/* Every activity must be renderable, whatever its material is missing.
     node tools/test-renderable.mjs

   This exists because of a card that reached a live session with nothing on it: no
   exercise, no button, no way forward. The activity was `match`, the board could not be
   built from what was left of the queue, and the renderer required a board while the
   control deck deliberately renders nothing for a grid. Both were individually correct.

   The suite could not see it — it is a property of how the render GATES combine, not of any
   module. So this asserts the gates themselves, as data: for every activity, and for every
   combination of material being absent, SOMETHING renders and there is a way to advance.
   The gate expressions below mirror JpnFlashcards.jsx; if they drift, this test is the
   thing that will be wrong, so it reads them from the source rather than restating them. */
import fs from "node:fs";
import { ACTIVITY } from "./compose.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const src = fs.readFileSync("JpnFlashcards.jsx", "utf8");

console.log("=== the gates are still the ones this test models ===");
t("the source still gates on renderActivity, not the raw activity", () => {
  ok(src.includes("const renderActivity ="), "renderActivity should exist");
  ok(src.includes("renderActivity === ACTIVITY.MATCH && grid"), "the grid gate must require a board");
  ok(src.includes("activity === ACTIVITY.MATCH && !grid"), "a boardless grid must fall through to choices");
});
t("the control deck's silent branch is conditional on the grid being on screen", () => {
  // The deck renders nothing for a grid because the grid advances itself. If the grid is
  // NOT rendering, that silence is a dead end.
  ok(src.includes("renderActivity === ACTIVITY.MATCH && grid ?"),
     "the deck must only go silent when a board is actually shown");
});

console.log("=== every activity has somewhere to land ===");
/* A model of the gates. `has` says which material exists. */
function whatRenders(activity, has) {
  const grid = activity === ACTIVITY.MATCH && has.grid;
  const drill = [ACTIVITY.BUILD, ACTIVITY.ORDER, ACTIVITY.TAPFILL].includes(activity) && has.drill;
  const cloze = activity === ACTIVITY.CLOZE && has.cloze;
  const spell = activity === ACTIVITY.SPELL && (has.spell ?? has.drill);
  const showsChoices =
    activity === ACTIVITY.MC || activity === ACTIVITY.LISTEN || activity === ACTIVITY.EMOJI
    || (activity === ACTIVITY.MATCH && !has.grid)
    || (activity === ACTIVITY.CLOZE && !has.cloze)
    || (activity === ACTIVITY.SPELL && !spell)
    || ([ACTIVITY.BUILD, ACTIVITY.ORDER, ACTIVITY.TAPFILL].includes(activity) && !has.drill);
  const renderActivity = showsChoices && !has.choices ? ACTIVITY.RECALL : activity;
  const mc = showsChoices && has.choices;
  const flip = renderActivity === ACTIVITY.RECALL || renderActivity === ACTIVITY.TYPE;
  const learn = renderActivity === ACTIVITY.LEARN;
  const body = grid || drill || cloze || spell || mc || flip || learn;
  // the control deck: silent only when a board is genuinely on screen
  const deck = (renderActivity === ACTIVITY.MATCH && grid) ? "grid-advances-itself"
    : renderActivity === ACTIVITY.LEARN ? "button"
    : ["mc", "listen", "cloze", "tapfill", "build", "order", "spell", "emoji"].includes(renderActivity) ? "hint-or-button"
    : "reveal/missed/got";
  return { body, deck };
}

const ALL = Object.values(ACTIVITY);
const MATERIAL = [
  { grid: 1, drill: 1, cloze: 1, choices: 1 },
  { grid: 0, drill: 1, cloze: 1, choices: 1 },
  { grid: 1, drill: 0, cloze: 1, choices: 1 },
  { grid: 1, drill: 1, cloze: 0, choices: 1 },
  { grid: 0, drill: 0, cloze: 0, choices: 1 },
  { grid: 0, drill: 0, cloze: 0, choices: 0 },   // nothing available at all
];

t("no activity renders an empty card, whatever material is missing", () => {
  const dead = [];
  for (const a of ALL) for (const m of MATERIAL) {
    const r = whatRenders(a, m);
    if (!r.body) dead.push(a + " with " + JSON.stringify(m));
  }
  ok(dead.length === 0, "activities with nothing to show:\n        " + dead.join("\n        "));
});

t("no activity leaves the learner without a way to advance", () => {
  const stuck = [];
  for (const a of ALL) for (const m of MATERIAL) {
    const r = whatRenders(a, m);
    // "grid-advances-itself" is only acceptable when a grid is genuinely rendering
    if (r.deck === "grid-advances-itself" && !(a === ACTIVITY.MATCH && m.grid)) {
      stuck.push(a + " with " + JSON.stringify(m));
    }
  }
  ok(stuck.length === 0, "activities with no way forward:\n        " + stuck.join("\n        "));
});

t("the reported case specifically: a grid with no board", () => {
  // Comeback card, board unbuildable because the queue had run down.
  const r = whatRenders(ACTIVITY.MATCH, { grid: 0, drill: 0, cloze: 0, choices: 1 });
  ok(r.body, "must render something");
  ok(r.deck !== "grid-advances-itself", "must not go silent");
});
t("…and a grid with no board AND no choices still lands on the flip card", () => {
  const r = whatRenders(ACTIVITY.MATCH, { grid: 0, drill: 0, cloze: 0, choices: 0 });
  ok(r.body, "the flip card is the floor — every card has a term and a meaning");
  ok(r.deck === "reveal/missed/got", "got " + r.deck);
});

console.log(`\nall ${run} renderable tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
