import React from "react";
import { useReadingPrefs } from "../lib/readingPrefs.js";

/* The two switches for script lines: furigana, and English + rōmaji. Same chip style as the
   Voice and Slow switches beside them. */
export default function ReadingToggles() {
  const [p, set] = useReadingPrefs();
  return (
    <div className="tc-voicerow tc-readrow">
      <button type="button" className={"tc-fchip" + (p.furigana ? " is-on" : "")} aria-pressed={p.furigana}
              onClick={() => set({ furigana: !p.furigana })}>
        <span lang="ja">ふりがな</span> {p.furigana ? "on" : "off"}
      </button>
      <button type="button" className={"tc-fchip" + (p.helpers ? " is-on" : "")} aria-pressed={p.helpers}
              onClick={() => set({ helpers: !p.helpers })}>
        English &amp; rōmaji {p.helpers ? "shown" : "hidden"}
      </button>
    </div>
  );
}
