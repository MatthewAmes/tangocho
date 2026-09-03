import React, { useState, useEffect, useRef, useCallback } from "react";
import { prodDue, recallUnlocked, masteryScore } from "../lib/schedule.js";

const WRITE_LATENCY_SCALE = 2.5;

export default function Write({ cards, onResult }) {
  /* Order by production need, not raw weakness: cards owed a production review (prodDue)
     first, then recognition-unlocked-but-weak cards, then everything else. Without this
     Write asked for production of words never even recognised, and reused the same
     weakest-first list every visit regardless of what had just been produced.
     `cards` is replaced by a new array on every grade (recordResult maps the deck), so this
     is built once per pass (mount / "Go again") rather than as a useMemo on [cards] — otherwise
     the list would reshuffle under the learner's feet mid-pass. */
  const buildOrder = useCallback(() => {
    const now = Date.now();
    const owed = cards.filter((c) => prodDue(c, now)).sort((a, b) => (a.rfsrs?.due || 0) - (b.rfsrs?.due || 0));
    const unlocked = cards.filter((c) => !prodDue(c, now) && recallUnlocked(c))
      .sort((a, b) => (a.rlevel || 0) - (b.rlevel || 0));
    const rest = cards.filter((c) => !recallUnlocked(c)).sort((a, b) => masteryScore(a) - masteryScore(b));
    return [...owed, ...unlocked, ...rest].slice(0, 20);
  }, [cards]);
  const [order, setOrder] = useState(buildOrder);
  const [pos, setPos] = useState(0);
  const goAgain = () => { setOrder(buildOrder()); setPos(0); };
  /* Writing was feeding the scheduler without ever timing the answer, so every card here
     landed as a middling grade no matter how long it took. Production recall is the
     harder direction and the more valuable signal — it deserves the same fast/slow
     distinction the flip cards get. Timed from the card appearing to the reveal. */
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
  const [guide, setGuide] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);

  const card = pos < order.length ? order[pos] : null;

  const setup = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2620";
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => { setup(); }, [pos, setup]);
  useEffect(() => {                                   // iOS: stop the page panning while drawing
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, []);
  useEffect(() => {
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  const xy = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const down = (e) => { e.preventDefault(); drawingRef.current = true; lastRef.current = xy(e); try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = xy(e), l = lastRef.current;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p;
  };
  const up = () => { drawingRef.current = false; lastRef.current = null; };

  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos]);
  const next = (got) => {
    // dir "prod": this is EN->JP production, and must land in rfsrs/rseen/rlevel, not the
    // recognition fsrs/seen/level — those track being able to READ the word, which writing
    // it from its meaning never tested. area "writing" buckets its latency norm together with
    // Study's typed-production answers (both are "produce this word", just different input).
    // Scale think time for the slower handwriting motion.
    if (card) onResult(card.id, got, "prod", thinkRef.current ? thinkRef.current / WRITE_LATENCY_SCALE : undefined, "writing");
    setRevealed(false); setGuide(false); setPos((p) => p + 1);
  };

  if (!order.length) return <div className="tc-empty"><p>Add some words first, then come here to practice writing them by hand.</p></div>;
  if (!card) return (
    <div className="tc-done">
      <p className="tc-eyebrow">Writing set complete ✍️</p>
      <div className="tc-donebtns"><button className="tc-btn tc-btn-primary" onClick={goAgain}>Go again</button></div>
    </div>
  );

  const ghostSize = Math.max(26, Math.min(120, Math.floor(360 / Math.max(1, card.term.length))));

  return (
    <div className="tc-write">
      <p className="tc-eyebrow">Write it from memory · production · {pos + 1}/{order.length}</p>
      <div className="tc-card2">
        <p className="tc-sentgoal">{card.meaning}</p>
        <div className="tc-canvaswrap">
          {guide && <div className="tc-ghost" style={{ fontSize: ghostSize + "px" }}>{card.term}</div>}
          <canvas ref={canvasRef} className="tc-canvas"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
        </div>
        <div className="tc-sentbtns tc-writetools">
          <button className="tc-btn tc-btn-sm" onClick={() => setGuide((g) => !g)}>{guide ? "Hide guide" : "Show guide"}</button>
          <button className="tc-btn tc-btn-sm" onClick={setup}>Clear</button>
          {!revealed && <button className="tc-btn tc-btn-primary" onClick={() => {
            if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
            setRevealed(true);
          }}>Reveal</button>}
        </div>
        {revealed && (
          <div className="tc-writereveal">
            <p className="tc-writeanswer">{card.term}</p>
            <p className="tc-sentans">{card.reading}{card.romaji ? " · " + card.romaji : ""}</p>
            <div className="tc-gradebtns">
              <button className="tc-btn" onClick={() => next(false)}>Missed it</button>
              <button className="tc-btn tc-btn-got" onClick={() => next(true)}>Got it</button>
            </div>
          </div>
        )}
      </div>
      <p className="tc-hintline">Write the Japanese for the meaning above — finger or stylus. Stuck? Show the guide to trace, then reveal to check.</p>
    </div>
  );
}
