import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { buildBrief, serialiseBrief, MODES } from "../../tools/tutor.mjs";

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

const MODE_LABEL = {
  free: "Free talk",
  tutor: "Tutor",
  roleplay: "Roleplay",
  listening: "Listening",
  repair: "Repair",
};
const MODE_NOTE = {
  free: "Natural conversation. Mistakes are noted, not interrupted.",
  tutor: "Corrections as they happen, then a chance to say it again.",
  roleplay: "A scene to play through — shop, station, meeting someone.",
  listening: "Japanese only. Read it, then answer.",
  repair: "Practice getting unstuck: asking again, more slowly, in other words.",
};

export default function Tutor({ evidence = [], cards = [], minutes = 0, callAI, signedIn }) {
  const [mode, setMode] = useState("free");
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showEn, setShowEn] = useState(true);
  const endRef = useRef(null);

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
      setHistory((h) => [...(asOpening ? [] : h), {
        role: "tutor",
        text: String((out && out.reply) || "").trim(),
        en: String((out && out.en) || "").trim(),
        correction: String((out && out.correction) || "").trim(),
        targeted: String((out && out.targeted) || "").trim(),
      }]);
    } catch (e) {
      setErr((e && e.message) || "Couldn't reach the tutor.");
    } finally {
      setBusy(false);
    }
  }, [busy, history, brief, callAI]);

  const restart = useCallback(() => { setHistory([]); setErr(null); send("", true); }, [send]);

  if (!signedIn) {
    return (
      <div className="tc-tutorempty">
        <h2 className="tc-planh">Talk with a tutor</h2>
        <p className="tc-planhint">
          Sign in on the Browse tab first — the tutor runs on the server, and the server needs
          to know which learner it is talking to.
        </p>
      </div>
    );
  }

  return (
    <div className="tc-tutor">
      <div className="tc-modeseg" role="group" aria-label="Conversation mode">
        {MODES.map((m) => (
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

      <form className="tc-tutorbar" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send(draft.trim(), false); }}>
        <label className="tc-sr" htmlFor="tc-tutorin">Your reply</label>
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
      </div>
    </div>
  );
}
