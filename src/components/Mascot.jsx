import React from "react";
import { MASCOT_GIFS } from "../../data/mascot.js";

/* The four mascot moods. Responsive to what the student is doing right now: sleeping when
   no study has happened, worried when a backlog forms, proud when a streak is alive, happy
   when an answer lands. Kept pure and deterministic so any view can show the mood that
   matches the stats. */
export function mascotState({ studiedToday, dueCount, streak }) {
  if (!studiedToday) return dueCount > 30 ? "worried" : "sleeping";
  if (streak >= 7) return "proud";
  if (dueCount > 40) return "worried";
  return "happy";
}

export default function Mascot({ state, size = 84 }) {
  const src = MASCOT_GIFS[state] || MASCOT_GIFS.waiting;
  return <img className={"tc-mascot is-" + state} src={src} width={size} height={size * 30 / 32}
              alt={"Study buddy, looking " + state} draggable="false" />;
}
