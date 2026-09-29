import { useState, useEffect } from "react";

/* ── how a script line is shown ──
   Two reading supports the learner switches off as they outgrow them: the furigana over
   kanji, and the English + rōmaji under each line. One setting for every script screen
   (read-through, Listen, Dialogue, and the Tutor's Textbook mode), so turning furigana off
   in one place does not leave it on in the next.

   A per-device convenience, so localStorage — every access guarded, because a private
   window or blocked storage must still render the lines (with both supports on). Mounted
   screens are kept in step through a small listener set rather than a context provider,
   since the screens that use it live in different parts of the tree. */

const KEY = "tc:readingprefs";
const DEFAULTS = { furigana: true, helpers: true };
const listeners = new Set();

function read() {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? { ...DEFAULTS, ...v } : { ...DEFAULTS };
  } catch (e) { return { ...DEFAULTS }; }
}

let current = null;

export function useReadingPrefs() {
  const [prefs, setPrefs] = useState(() => (current || (current = read())));
  useEffect(() => { listeners.add(setPrefs); return () => { listeners.delete(setPrefs); }; }, []);
  const update = (patch) => {
    current = { ...(current || read()), ...patch };
    try { window.localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* kept for this visit only */ }
    for (const l of listeners) l(current);
  };
  return [prefs, update];
}
