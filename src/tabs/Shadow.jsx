import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { speakJa, stopJa, ttsUnlock } from "../lib/tts.js";

/* ── shadowing ──
   Hear a line, say it back, then check. The one practice in this app where the learner
   makes SOUND, and the cheapest useful version of it: no microphone, no scoring, no speech
   recognition. Play, repeat aloud, reveal, rate yourself.

   That is deliberate rather than a first draft. Pronunciation scoring needs the audio
   analysed, which is a genuinely different project; a version that pretended to grade
   pronunciation from a transcript would be worse than one that admits it cannot. Self-
   rating is also how every other grade in this app already works, so nothing here is a
   weaker signal than a flashcard answer.

   AUDIO FIRST, TEXT SECOND, and that ordering is the whole exercise. Shadowing from the
   page is reading aloud; shadowing from sound is the thing that builds the ear. So the
   line is spoken with nothing on screen, and the text only appears once the learner asks
   for it. */

const SLOW = 0.62, NORMAL = 0.92;

/* A line worth shadowing: real Japanese, long enough to have rhythm, short enough to hold
   in your head after one listen. */
function shadowLines(scripts) {
  const out = [];
  for (const s of scripts || []) {
    for (const line of (s && s.lines) || []) {
      const text = ((line && line.tokens) || []).map((t) => t.t || "").join("");
      if (!text || text.length < 4 || text.length > 44) continue;
      out.push({
        id: (s.name || "?") + ":" + out.length,
        text,
        kana: ((line && line.tokens) || []).map((t) => t.r || t.t || "").join(""),
        en: (line && line.en) || "",
        speaker: (line && line.speaker) || "",
        script: s.name || "",
      });
    }
  }
  return out;
}

export default function Shadow({ scripts = [], onResult, onMinute }) {
  const all = useMemo(() => shadowLines(scripts), [scripts]);
  const [order, setOrder] = useState([]);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [slow, setSlow] = useState(false);
  const [done, setDone] = useState({ n: 0, ok: 0 });
  const startedRef = useRef(0);
  const heardRef = useRef(0);

  useEffect(() => {
    if (!all.length) return;
    /* Shuffled once per mount: shadowing the same six lines in the same order every session
       trains the order as much as the language. */
    const idx = all.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setOrder(idx);
    setAt(0);
    setShown(false);
  }, [all]);

  useEffect(() => () => stopJa(), []);

  const line = order.length ? all[order[at % order.length]] : null;

  const play = useCallback((rate) => {
    if (!line) return;
    ttsUnlock();
    stopJa();
    speakJa(line.text, rate == null ? (slow ? SLOW : NORMAL) : rate);
    if (!heardRef.current) heardRef.current = Date.now();
    if (!startedRef.current) startedRef.current = Date.now();
  }, [line, slow]);

  /* Play automatically on arrival: the exercise starts with sound, and making the learner
     press a button first only adds a step between them and the thing they came to do. */
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => play(), 250);
    return () => clearTimeout(t);
  }, [line, play]);

  const rate = useCallback((ok) => {
    if (!line) return;
    const ms = heardRef.current ? Date.now() - heardRef.current : 0;
    if (onResult) onResult({ id: line.id, ok, ms, text: line.text });
    setDone((d) => ({ n: d.n + 1, ok: d.ok + (ok ? 1 : 0) }));
    heardRef.current = 0;
    setShown(false);
    setAt((i) => i + 1);
  }, [line, onResult]);

  /* Minutes, once, when the learner leaves. The day log wants time spent, not a count of
     lines — and a per-line write would report a fifteen-second session as ten. */
  useEffect(() => () => {
    if (!startedRef.current || !onMinute) return;
    const mins = Math.round((Date.now() - startedRef.current) / 60000);
    if (mins > 0) onMinute(mins);
  }, [onMinute]);

  if (!all.length) {
    return (
      <div className="tc-shadow">
        <h2 className="tc-planh">Shadowing</h2>
        <p className="tc-planhint">
          No dialogue lines are loaded yet. They ship with the textbook scenes — open the
          Scripts tab once and they will be here.
        </p>
      </div>
    );
  }

  return (
    <div className="tc-shadow">
      <div className="tc-shadowhead">
        <span className="tc-shadowcount">{done.n} said{done.n ? ` · ${done.ok} clean` : ""}</span>
        <button className={"tc-fchip" + (slow ? " is-on" : "")} aria-pressed={slow}
                onClick={() => { setSlow((v) => { const n = !v; play(n ? SLOW : NORMAL); return n; }); }}>
          {slow ? "🐢 Slow" : "Normal speed"}
        </button>
        <span className="tc-shadowsrc">{line ? line.script : ""}</span>
      </div>

      <div className="tc-shadowcard">
        {!shown ? (
          <>
            <p className="tc-shadowcue">Listen, then say it out loud.</p>
            <p className="tc-shadowhint">Nothing on screen on purpose — this is for your ear.</p>
          </>
        ) : (
          <>
            <p className="tc-shadowline" lang="ja">{line.text}</p>
            {line.kana && line.kana !== line.text && (
              <p className="tc-shadowkana" lang="ja">{line.kana}</p>
            )}
            {line.en && <p className="tc-shadowen">{line.en}</p>}
          </>
        )}
      </div>

      <div className="tc-shadowbar">
        <button className="tc-btn tc-btn-sm" onClick={() => play()}>🔊 Again</button>
        {!shown ? (
          <button className="tc-btn tc-btn-primary" onClick={() => setShown(true)}>Show me</button>
        ) : (
          <button className="tc-btn tc-btn-sm" onClick={() => play()}>Compare</button>
        )}
      </div>

      {shown && (
        <div className="tc-shadowrate">
          <button className="tc-btn tc-btn-got" onClick={() => rate(true)}>Said it cleanly</button>
          <button className="tc-btn" onClick={() => rate(false)}>Struggled</button>
        </div>
      )}

      <p className="tc-planhint">
        Rate yourself honestly — this feeds the same model your flashcards do. It cannot hear
        you, so nothing here checks your pronunciation; it tracks whether you could keep up.
      </p>
    </div>
  );
}
