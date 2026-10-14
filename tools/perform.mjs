/* ── Perform: the turns of a scene, for one part ──
   A scene performed as one of its speakers is a run of TURNS: the lines that come before
   each of your lines are the cue you hear, and your line is what you say. Consecutive
   lines of yours are one turn each, with no cue between them, because that is how the
   scene goes — you keep talking. Pure — see tools/test-perform.mjs. */

import { lineText } from "./cloze.mjs";

export const SAY_SECONDS = 5;
export const PERFORM_GRADES = [["smooth", "Smooth"], ["hesitated", "Hesitated"], ["couldnt", "Couldn't"]];

export function performTurns(scene, part) {
  const lines = ((scene && scene.lines) || []).map((l, idx) => ({ ...l, idx, text: lineText(l) })).filter((l) => l.text);
  const turns = [];
  let cue = [];
  for (const l of lines) {
    if (l.speaker === part) { turns.push({ cue, line: l }); cue = []; }
    else cue.push(l);
  }
  return turns;
}

/* The evidence row a graded line becomes. Only "smooth" counts as right: the thing being
   practised is delivery, and a line got through with long pauses is not performed yet. */
export function performEvidence(rec, at = Date.now()) {
  return {
    id: `perform:${rec.scene}:${rec.lineIdx}`, deck: "scripts", format: "perform", skill: "production",
    ok: rec.grade === "smooth", ms: rec.ms || 0, at,
    failure: rec.grade === "smooth" ? null : rec.grade === "hesitated" ? "fluency" : "blank",
  };
}
