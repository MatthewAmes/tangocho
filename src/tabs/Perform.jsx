import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Furigana from "../components/Furigana.jsx";
import { useReadingPrefs } from "../lib/readingPrefs.js";
import { speakJa, stopJa, ttsUnlock } from "../lib/tts.js";
import { setSessionBusy } from "../lib/session.js";
import { performTurns, PERFORM_GRADES, SAY_SECONDS } from "../../tools/perform.mjs";

/* ── Perform: a scene, out loud ──
   NihonGO NOW! is graded on performing scenes — hearing a line and answering in role, at
   speed, with the right delivery — and nothing in the app practised that shape. Listen
   hides the text; Dialogue lets you pick your line from options; Rehearse shows your line
   once you ask. This is the performance: their line is HEARD (text blurred until you want
   it), you say yours out loud against a short countdown, then the model line plays so you
   can shadow it, and you grade the delivery honestly — smooth, hesitated, or couldn't.

   Self-graded on purpose: speech recognition cannot judge pitch or fluency, and a fake
   score would be worse than an honest one. The grade is recorded against the line, so
   lines that were not smooth come back first next time (tools/perform.mjs). */

export default function Perform({ scripts = [], onExit, onGrade }) {
  const [rp] = useReadingPrefs();
  const [scene, setScene] = useState(null);
  const [part, setPart] = useState(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("cue");        // cue | say | model | done
  const [peek, setPeek] = useState(false);
  const [left, setLeft] = useState(SAY_SECONDS);
  const [grades, setGrades] = useState([]);
  const [slow, setSlow] = useState(false);
  const timer = useRef(null);
  const t0 = useRef(0);
  useEffect(() => { setSessionBusy(!!part && phase !== "done"); return () => setSessionBusy(false); }, [part, phase]);
  useEffect(() => () => { clearInterval(timer.current); stopJa(); }, []);

  /* Volume 2 scenes first, in book order — that is the course being performed now. */
  const scenes = useMemo(() => {
    const list = (scripts || []).filter((s) => s && Array.isArray(s.lines) && s.lines.length > 1);
    const act = (s) => s.act || parseInt(s.name, 10) || 0;
    return list.sort((a, b) => ((act(b) >= 7) - (act(a) >= 7)) || String(a.name).localeCompare(String(b.name), "en", { numeric: true }));
  }, [scripts]);

  const turns = useMemo(() => (scene && part ? performTurns(scene, part) : []), [scene, part]);
  const turn = turns[step];
  const say = (text) => { ttsUnlock(); speakJa(text, slow ? 0.68 : 0.92); };

  // A new turn: play the cue, blur the text.
  useEffect(() => {
    if (!turn || phase !== "cue") return;
    setPeek(false);
    if (turn.cue.length) say(turn.cue.map((c) => c.text).join("　"));
  }, [turn, phase]);   // eslint-disable-line react-hooks/exhaustive-deps

  const startSay = useCallback(() => {
    stopJa();
    setPhase("say"); setLeft(SAY_SECONDS); t0.current = Date.now();
    clearInterval(timer.current);
    timer.current = setInterval(() => setLeft((n) => {
      if (n <= 1) { clearInterval(timer.current); setPhase("model"); return 0; }
      return n - 1;
    }), 1000);
  }, []);
  useEffect(() => { if (phase === "model" && turn) { clearInterval(timer.current); say(turn.line.text); } }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps

  const grade = (g) => {
    const rec = { scene: scene.name, lineIdx: turn.line.idx, grade: g, ms: Date.now() - t0.current };
    setGrades((x) => [...x, rec]);
    if (onGrade) onGrade(rec);
    if (step + 1 >= turns.length) setPhase("done");
    else { setStep(step + 1); setPhase("cue"); }
  };

  // ── choose a scene and a part ──
  if (!scene || !part) {
    const speakers = scene ? [...new Set(scene.lines.map((l) => l.speaker).filter(Boolean))] : [];
    return (
      <div className="tc-sent tc-perform">
        <div className="tc-rehhead">
          <button className="tc-btn tc-btn-sm" onClick={() => (scene ? setScene(null) : onExit && onExit())}>← {scene ? "Scenes" : "Scripts"}</button>
          <span className="tc-rehname">{scene ? scene.name + " · pick your part" : "Perform a scene"}</span>
        </div>
        {!scene ? (
          <>
            <p className="tc-planhint" style={{ marginTop: 0 }}>
              Hear their line, say yours out loud before the countdown ends, then hear the model and shadow it.
              Grade your delivery honestly — that's what the performance is graded on.
            </p>
            <div className="tc-performlist">
              {scenes.map((s) => (
                <button key={s.id || s.name} type="button" className="tc-moreitem" onClick={() => setScene(s)}>
                  <span className="tc-morelabel">{s.name}{s.title ? " — " + s.title : ""}</span>
                  <span className="tc-morenote">{s.lines.length} lines</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="tc-sentmodes">
            {speakers.map((sp) => (
              <button key={sp} className="tc-segbtn" onClick={() => { setPart(sp); setStep(0); setPhase("cue"); setGrades([]); }}>I'm {sp}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "done" || !turn) {
    const n = (g) => grades.filter((x) => x.grade === g).length;
    const shaky = grades.filter((x) => x.grade !== "smooth").length;
    return (
      <div className="tc-done">
        <p className="tc-eyebrow">Scene performed · {scene.name}</p>
        <p className="tc-calmscore"><b>{n("smooth")}</b> of {grades.length} lines smooth</p>
        <p className="tc-donenext">{n("hesitated")} hesitated · {n("couldnt")} couldn't yet</p>
        <div className="tc-donebtns">
          {shaky > 0 && <button className="tc-btn tc-btn-primary" onClick={() => { setStep(0); setPhase("cue"); setGrades([]); }}>Perform it again</button>}
          <button className="tc-btn" onClick={() => { setPart(null); setScene(null); }}>Another scene</button>
          <button className="tc-btn" onClick={() => onExit && onExit()}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-sent tc-perform">
      <div className="tc-rehhead">
        <button className="tc-btn tc-btn-sm" onClick={() => { stopJa(); clearInterval(timer.current); setPart(null); }}>← Parts</button>
        <span className="tc-rehname">{scene.name} · you are {part} · {step + 1}/{turns.length}</span>
      </div>
      <div className="tc-voicerow">
        <button className={"tc-fchip" + (slow ? " is-on" : "")} onClick={() => setSlow((v) => !v)}><span aria-hidden="true">🐢</span> Slow</button>
      </div>

      {turn.cue.map((c, i) => (
        <div key={i} className="tc-performcue">
          <p className="tc-dialwho">{c.speaker}
            <button type="button" className="tc-speakbtn" aria-label="Hear it again" onClick={() => say(c.text)}>🔊</button>
          </p>
          <p lang="ja" className={"tc-dialjp" + (peek || phase === "model" ? "" : " is-blurred")}
             onClick={() => setPeek(true)} title={peek ? undefined : "Tap to show the text"}>
            <Furigana tokens={c.tokens} show={rp.furigana} />
          </p>
        </div>
      ))}
      {!turn.cue.length && <p className="tc-planhint">You open the scene.</p>}

      {phase === "cue" && (
        <button className="tc-btn tc-btn-primary tc-start" onClick={startSay}>My turn — say it</button>
      )}
      {phase === "say" && (
        <div className="tc-performsay" role="timer" aria-live="polite">
          <span className="tc-performring" style={{ "--p": left / SAY_SECONDS }}>{left}</span>
          <span>Say your line out loud now.</span>
          <button className="tc-btn tc-btn-sm" onClick={() => setPhase("model")}>Done — show me</button>
        </div>
      )}
      {phase === "model" && (
        <div className="tc-performmodel">
          <p className="tc-eyebrow">Your line</p>
          <p lang="ja" className="tc-sentjp"><Furigana tokens={turn.line.tokens} show={rp.furigana} /></p>
          {rp.helpers && turn.line.romaji && <p className="tc-sentans">{turn.line.romaji}</p>}
          {rp.helpers && turn.line.en && <p className="tc-sentgoal">{turn.line.en}</p>}
          <div className="tc-checkrow">
            <button className="tc-btn tc-btn-sm" onClick={() => say(turn.line.text)}>🔊 Hear it — shadow it</button>
          </div>
          <p className="tc-planhint">How did your delivery go?</p>
          <div className="tc-checkrow">
            {PERFORM_GRADES.map(([g, label]) => (
              <button key={g} className={"tc-btn" + (g === "smooth" ? " tc-btn-primary" : "")} onClick={() => grade(g)}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
