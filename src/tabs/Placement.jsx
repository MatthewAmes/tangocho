import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  startPlacement, recordProbe, placementResult, buildProbe, PROBE_SIZE, MAX_QUESTIONS,
} from "../../tools/placement.mjs";

/* ── the placement run ──
   Twenty-five questions that find where the learner actually is, instead of making them
   grind up from Act 1 to prove it.

   Everything decided here is decided in tools/placement.mjs: which act to probe, what the
   result means, when to stop. This file shows a question and records an answer.

   IT WRITES ORDINARY EVIDENCE. Every answer goes into the same log a flashcard answer goes
   into, with the same shape, so the knowledge map, the planner, the grammar nodes and the
   tutor brief all populate from it without knowing placement exists. That is the whole
   reason this is worth building: it is not a separate score, it is the first evidence. */

export default function Placement({ cardsByAct, onAnswer, onDone, onExit }) {
  const seedRef = useRef(Math.floor(Date.now() / 1000));
  const [state, setState] = useState(() => startPlacement());
  const [queue, setQueue] = useState(() => []);
  const [at, setAt] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState(null);
  const [started, setStarted] = useState(false);
  const shownRef = useRef(0);

  const result = useMemo(() => placementResult(state), [state]);
  const total = Math.min(MAX_QUESTIONS, (state.probes.length + 1) * PROBE_SIZE);

  const loadProbe = useCallback((s) => {
    if (s.done || s.next == null) { setQueue([]); return s; }
    let act = s.next, qs = buildProbe(act, cardsByAct, { seed: seedRef.current + act });
    /* An act the deck cannot furnish is not a failure, it is an act to skip — recorded as a
       no-op probe so the search moves on rather than stalling on it forever. */
    let guard = 0;
    let next = s;
    while (!qs.length && !next.done && guard++ < 12) {
      next = recordProbe(next, act, 0, 0);
      act = next.next;
      if (act == null) break;
      qs = buildProbe(act, cardsByAct, { seed: seedRef.current + act });
    }
    setQueue(qs);
    setAt(0);
    setCorrect(0);
    shownRef.current = Date.now();
    return next;
  }, [cardsByAct]);

  const begin = useCallback(() => {
    const s = startPlacement();
    setStarted(true);
    setPicked(null);
    const s2 = loadProbe(s);
    setState(s2);
  }, [loadProbe]);

  const answer = useCallback((choice) => {
    if (picked != null) return;
    const q = queue[at];
    if (!q) return;
    const ok = choice === q.answer;
    setPicked(choice);
    const ms = Date.now() - shownRef.current;
    /* Recognition, because that is genuinely what a four-choice meaning question measures.
       Calling it production would inflate the one ability the learner most needs measured
       honestly. */
    if (onAnswer) onAnswer({ id: q.id, act: q.act, ok, ms, skill: "recognition", format: "mc" });

    window.setTimeout(() => {
      setPicked(null);
      const nextCorrect = correct + (ok ? 1 : 0);
      if (at + 1 < queue.length) {
        setCorrect(nextCorrect);
        setAt(at + 1);
        shownRef.current = Date.now();
        return;
      }
      const advanced = recordProbe(state, q.act, nextCorrect, queue.length);
      if (advanced.done) { setState(advanced); setQueue([]); if (onDone) onDone(placementResult(advanced)); return; }
      const loaded = loadProbe(advanced);
      setState(loaded);
    }, ok ? 260 : 700);
  }, [picked, queue, at, correct, state, onAnswer, onDone, loadProbe]);

  if (!started) {
    return (
      <div className="tc-place">
        <h2 className="tc-planh">Find my level</h2>
        <p className="tc-planhint">
          About {MAX_QUESTIONS} questions, three or four minutes. It jumps around the book on
          purpose — answer well and it skips ahead, miss a few and it drops back — so it finds
          where you are without walking you through everything you already know.
        </p>
        <p className="tc-planhint">
          Every answer counts as real evidence, so the maps and the tutor start knowing
          something about you the moment you finish.
        </p>
        <button className="tc-btn tc-start tc-smart-btn" onClick={begin}>Start</button>
        {onExit && <button className="tc-fchip" onClick={onExit}>Not now</button>}
      </div>
    );
  }

  if (state.done || !queue.length) {
    return (
      <div className="tc-place">
        <h2 className="tc-planh">Where you are</h2>
        <p className="tc-placesum">{result.summary}</p>
        <div className="tc-placemap">
          {state.acts.map((a) => {
            const p = state.probes.find((x) => x.act === a);
            const cls = p ? "is-" + p.verdict
              : result.solidThrough != null && a <= result.solidThrough ? "is-solid"
              : result.newFrom != null && a >= result.newFrom ? "is-new" : "is-untested";
            return (
              <div key={a} className={"tc-placerow " + cls}>
                <span className="tc-placeact">Act {a}</span>
                <span className="tc-placebar"><i /></span>
                <span className="tc-placeverdict">
                  {p ? (p.verdict === "solid" ? `${p.correct}/${p.asked} — solid`
                      : p.verdict === "new" ? `${p.correct}/${p.asked} — new`
                      : `${p.correct}/${p.asked} — gaps`)
                    : cls === "is-solid" ? "below your level"
                    : cls === "is-new" ? "above your level" : "not probed"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="tc-planhint">
          Asked {result.asked} questions across {state.probes.filter((p) => p.asked > 0).length} acts.
          Nothing here is a score — it is a starting point, and the maps in Plan now have real
          numbers behind them.
        </p>
        <div className="tc-tutorfoot">
          <button className="tc-fchip" onClick={begin}>Run it again</button>
          {onExit && <button className="tc-fchip" onClick={onExit}>Done</button>}
        </div>
      </div>
    );
  }

  const q = queue[at];
  const done = state.asked + at;
  return (
    <div className="tc-place">
      <div className="tc-placehead">
        <span className="tc-placeprog">{done + 1} of ~{Math.max(total, done + 1)}</span>
        <span className="tc-placewhere">Act {q.act}</span>
        {onExit && <button className="tc-fchip" onClick={onExit}>Stop</button>}
      </div>
      <div className="tc-placecard">
        <p className="tc-placeterm" lang="ja">{q.term}</p>
        {q.reading && q.reading !== q.term && <p className="tc-placeread" lang="ja">{q.reading}</p>}
      </div>
      <div className="tc-placeopts">
        {q.choices.map((c) => {
          const state2 = picked == null ? "" : c === q.answer ? " is-right" : c === picked ? " is-wrong" : "";
          return (
            <button key={c} className={"tc-mcopt" + state2} disabled={picked != null}
                    onClick={() => answer(c)}>{c}</button>
          );
        })}
      </div>
    </div>
  );
}
