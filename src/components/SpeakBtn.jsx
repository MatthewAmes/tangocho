import React from "react";
import { ttsUnlock, speakJa } from "../lib/tts.js";

export default function SpeakBtn({ text, slow }) {
  if (!text) return null;
  /* lang="en" because this button sits INSIDE the lang="ja" reading it plays. Language
     inherits, so without it a screen reader announces "Hear pronunciation" in a Japanese
     voice — the same mistake as the old lang="ja" on <html>, one element further in. */
  return (
    <button type="button" lang="en" className="tc-speakbtn" aria-label="Hear pronunciation"
      onClick={(e) => { e.stopPropagation(); ttsUnlock(); speakJa(text, slow ? 0.68 : 0.88); }}>🔊</button>
  );
}
