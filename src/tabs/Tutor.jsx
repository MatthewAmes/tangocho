import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { buildBrief, serialiseBrief, MODES } from "../../tools/tutor.mjs";
import { MIC_OK, listenJa } from "../lib/listen.js";
import { speakJa, stopJa, ttsUnlock } from "../lib/tts.js";

/* ── the conversational tutor ──
   The presentation layer for tools/tutor.mjs. Everything that decides WHAT the tutor knows
   lives there and in the Worker's system prompt; this file moves text and shows bubbles.

   Two rules it exists to keep:

   1. IT NEVER BUILDS PROMPT TEXT. It sends {brief, history} and the Worker owns every
      instruction — the same guard as every other AI call in this app. A client that
      composed the tutor's personality would be a client that could compose anything.

   2. THE HISTORY IS TRIMMED HERE, not discovered at the endpoint. /api/ai rejects an input
      over 4000 characters of JSON and the brief already spends about a thousand of them, so
      an unbounded transcript would work for a dozen turns and then start failing — and the
      failure would arrive mid-conversation, which is the worst possible moment. */

const HISTORY_CHARS = 2400;     // what is left of INPUT_MAX once the brief is paid for
const TURN_CHARS = 400;         // one turn, matching the Worker's own per-message slice

/* Keep the most RECENT turns that fit. The oldest exchange is the one a conversation can
   most afford to forget, and the model is told the transcript may be partial. */
function trimHistory(history, budget = HISTORY_CHARS) {
  const out = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    const text = String(m.text || "").slice(0, TURN_CHARS);
    const cost = text.length + 12;
    if (used + cost > budget) break;
    out.unshift({ role: m.role, text });
    used += cost;
  }
  return out;
}

/* "dialogue" is not one of tools/tutor.mjs's MODES, and deliberately: those describe how
   the MODEL should behave, and this one does not use the model at all. It runs the
   deterministic dialogue engine (tools/dialogue.mjs) over the real textbook scenes — the
   one conversation practice in this app that costs nothing, works offline, and cannot be
   wrong about Japanese, because every line on offer was actually printed in the book. */
const OFFLINE = "dialogue";
const ALL_MODES = [OFFLINE, ...MODES];

const MODE_LABEL = {
  dialogue: "Textbook",
  free: "Free talk",
  tutor: "Tutor",
  roleplay: "Roleplay",
  listening: "Listening",
  repair: "Repair",
};
const MODE_NOTE = {
  dialogue: "A real conversation from the book — you play one side. No AI, no limit.",
  free: "Natural conversation. Mistakes are noted, not interrupted.",
  tutor: "Corrections as they happen, then a chance to say it again.",
  roleplay: "A scene to play through — shop, station, meeting someone.",
  listening: "Japanese only. Read it, then answer.",
  repair: "Practice getting unstuck: asking again, more slowly, in other words.",
};

export default function Tutor({ evidence = [], cards = [], minutes = 0, callAI, signedIn, renderDialogue }) {
  /* Open on something that WORKS. Free talk needs a signed-in session, so defaulting to it
     meant a signed-out visitor landed on a gate with no input and nothing to press — which
     reads as a broken tab, not as a prompt to sign in. Textbook needs no server at all, so
     it is the honest default when there is no session: the tab is usable on arrival and
     signing in upgrades it rather than unlocking it. */
  const [mode, setMode] = useState(() => (signedIn ? "free" : OFFLINE));
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showEn, setShowEn] = useState(true);
  /* Voice is opt-in and remembered for the session only. Default ON for output, because a
     spoken reply is the point of the feature; the toggle exists because studying next to
     someone else is a normal thing to be doing. */
  const [voiceOut, setVoiceOut] = useState(true);
  const [hearing, setHearing] = useState(false);
  const [micErr, setMicErr] = useState(null);
  const recRef = useRef(null);
  const endRef = useRef(null);

  /* Stop any audio and release the mic when the tab unmounts. Without this, switching tabs
     mid-reply leaves the tutor talking to an empty room. */
  useEffect(() => () => { stopJa(); if (recRef.current) recRef.current.stop(); }, []);

  /* The ground truth, rebuilt whenever the evidence moves. Cheap: it is a few passes over
     the log, and it is the whole reason the tutor is not guessing. */
  const brief = useMemo(
    () => buildBrief({ evidence, cards, mode, minutes }),
    [evidence, cards, mode, minutes]);

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [history, busy]);

  const send = useCallback(async (text, asOpening) => {
    if (busy) return;
    setErr(null);
    const next = asOpening ? [] : [...history, { role: "learner", text }];
    if (!asOpening) { setHistory(next); setDraft(""); }
    setBusy(true);
    try {
      const out = await callAI("converse", {
        brief: serialiseBrief(brief),
        history: trimHistory(next),
      });
      /* callAI resolves to the ENVELOPE, { result, cached } — not the result. Reading
         out.reply gave undefined on every turn, so each request succeeded, cost its quota,
         and rendered an empty bubble. Nothing failed loudly enough to notice. */
      const r = (out && out.result) || {};
      const reply = String(r.reply || "").trim();
      setHistory((h) => [...(asOpening ? [] : h), {
        role: "tutor",
        text: reply,
        en: String(r.en || "").trim(),
        correction: String(r.correction || "").trim(),
        targeted: String(r.targeted || "").trim(),
      }]);
      /* Speak the Japanese only. The English gloss is scaffolding for the eye; reading it
         aloud would hand the learner the answer before they had to parse anything. */
      if (!reply) { setErr("The tutor sent an empty reply — try again."); return; }
      if (voiceOut) speakJa(reply, 0.9);
    } catch (e) {
      setErr((e && e.message) || "Couldn't reach the tutor.");
    } finally {
      setBusy(false);
    }
  }, [busy, history, brief, callAI, voiceOut]);

  /* Push to talk. One utterance per press: continuous recognition keeps the mic open while
     the learner reads the reply, which means recording the room and eventually the tutor's
     own voice. The transcript lands in the SAME text box rather than sending itself, so a
     misheard word can be fixed before it becomes a turn — dictation is not reliable enough
     to skip that step, especially for a beginner's Japanese. */
  const toggleMic = useCallback(() => {
    setMicErr(null);
    if (hearing) { if (recRef.current) recRef.current.stop(); return; }
    stopJa();                       // do not transcribe the tutor talking over you
    ttsUnlock();                    // iOS wants the first audio touched inside a tap
    setHearing(true);
    recRef.current = listenJa({
      onPartial: (t) => setDraft(t),
      onFinal: (t) => setDraft(t),
      onError: (kind) => setMicErr(
        kind === "denied" ? "Microphone permission was refused — allow it in your browser settings."
        : kind === "no-speech" ? "Didn't catch anything. Try again, a little closer."
        : kind === "unsupported" ? "This browser can't do speech input. Typing still works."
        : "The microphone stopped unexpectedly. Typing still works."),
      onEnd: () => { setHearing(false); recRef.current = null; },
    });
  }, [hearing]);

  const restart = useCallback(() => { setHistory([]); setErr(null); send("", true); }, [send]);

  if (mode === OFFLINE) {
    return (
      <div className="tc-tutor">
        <div className="tc-modeseg" role="group" aria-label="Conversation mode">
          {ALL_MODES.map((m) => (
            <button key={m} className={"tc-segbtn" + (mode === m ? " is-on" : "")}
                    aria-pressed={mode === m} title={MODE_NOTE[m]}
                    onClick={() => { setMode(m); setHistory([]); }}>{MODE_LABEL[m] || m}</button>
          ))}
        </div>
        <p className="tc-planhint">{MODE_NOTE[OFFLINE]}</p>
        {renderDialogue ? renderDialogue(() => setMode("free")) : <p className="tc-planhint">Dialogue practice isn't available here.</p>}
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="tc-tutorempty">
        <h2 className="tc-planh">Talk with a tutor</h2>
        <p className="tc-planhint">
          Sign in on the Browse tab first — the AI tutor runs on the server, and the server
          needs to know which learner it is talking to.
        </p>
        <p className="tc-planhint">
          Textbook mode above needs none of that — it runs entirely on this device.
        </p>
        <div className="tc-modeseg" role="group" aria-label="Conversation mode">
          {ALL_MODES.map((m) => (
            <button key={m} className={"tc-segbtn" + (mode === m ? " is-on" : "")}
                    aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m] || m}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tc-tutor">
      <div className="tc-modeseg" role="group" aria-label="Conversation mode">
        {ALL_MODES.map((m) => (
          <button key={m} className={"tc-segbtn" + (mode === m ? " is-on" : "")}
                  aria-pressed={mode === m} title={MODE_NOTE[m]}
                  onClick={() => { setMode(m); setHistory([]); }}>{MODE_LABEL[m] || m}</button>
        ))}
      </div>
      <p className="tc-planhint">{MODE_NOTE[mode]}</p>

      {/* What the tutor has been told. Shown because a tutor that knows things about you
          should be able to say what it knows — and because a wrong line here is a bug you
          can see, rather than one that quietly shapes every reply. */}
      {brief.targets.length > 0 && (
        <p className="tc-tutortargets">
          Working on: {brief.targets.map((t) => t.label).join(" · ")}
        </p>
      )}

      <div className="tc-tutorlog" role="log" aria-live="polite" aria-label="Conversation">
        {history.length === 0 && !busy && (
          <p className="tc-planhint">
            {brief.skills.every((s) => s.mastery == null)
              ? "Nothing measured yet, so the tutor will start simple and find your level."
              : "Say something in Japanese or English — either is fine."}
          </p>
        )}
        {history.map((m, i) => (
          <div key={i} className={"tc-turn" + (m.role === "tutor" ? " is-tutor" : " is-learner")}>
            <p className="tc-turntext" lang={m.role === "tutor" ? "ja" : undefined}>{m.text}</p>
            {m.role === "tutor" && showEn && m.en && <p className="tc-turnen">{m.en}</p>}
            {m.role === "tutor" && m.correction && (
              <p className="tc-turnfix"><span lang="ja">{m.correction}</span></p>
            )}
          </div>
        ))}
        {busy && <p className="tc-planhint">…</p>}
        <div ref={endRef} />
      </div>

      {err && <p className="tc-tutorerr">{err}</p>}
      {micErr && <p className="tc-tutorerr">{micErr}</p>}
      {hearing && <p className="tc-planhint">Listening… speak, then press ■.</p>}

      <form className="tc-tutorbar" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send(draft.trim(), false); }}>
        <label className="tc-sr" htmlFor="tc-tutorin">Your reply</label>
        {MIC_OK && (
          <button type="button" className={"tc-mic" + (hearing ? " is-live" : "")}
                  aria-pressed={hearing} disabled={busy}
                  aria-label={hearing ? "Stop listening" : "Speak your reply"}
                  onClick={toggleMic}>{hearing ? "■" : "🎤"}</button>
        )}
        <input id="tc-tutorin" className="tc-tutorin" value={draft} disabled={busy}
               lang="ja" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
               placeholder="日本語 or English…" onChange={(e) => setDraft(e.target.value)} />
        <button className="tc-btn tc-btn-primary" type="submit" disabled={busy || !draft.trim()}>Send</button>
      </form>

      <div className="tc-tutorfoot">
        <button className="tc-fchip" type="button" onClick={restart} disabled={busy}>
          {history.length ? "Start over" : "Start"}
        </button>
        <button className="tc-fchip" type="button" aria-pressed={showEn} onClick={() => setShowEn((v) => !v)}>
          {showEn ? "English on" : "English off"}
        </button>
        <button className="tc-fchip" type="button" aria-pressed={voiceOut}
                onClick={() => { const on = !voiceOut; setVoiceOut(on); if (!on) stopJa(); else ttsUnlock(); }}>
          {voiceOut ? "Voice on" : "Voice off"}
        </button>
        {history.length > 0 && (
          <button className="tc-fchip" type="button" disabled={busy}
                  onClick={() => { ttsUnlock(); const last = [...history].reverse().find((m) => m.role === "tutor"); if (last) speakJa(last.text, 0.9); }}>
            Replay
          </button>
        )}
      </div>
    </div>
  );
}
