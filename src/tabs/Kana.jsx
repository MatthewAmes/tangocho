import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { KANA_GROUPS, KANA_LENGTHS } from "../data/kana-tables.js";
import { statNeed, statReview } from "../lib/schedule.js";
import { setSessionBusy } from "../lib/session.js";
import { sGet, sSet } from "../lib/storage.js";

const KANA_KEY = "jpn101:kana";
const KANA_REQUEUE_GAP = 3;
const KANA_REQUEUE_CAP = 2;

const fmtSecs = (ms) => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
};

export default function Kana() {
  const [script, setScript] = useState("hira");     // hira | kata
  const [sets, setSets] = useState(() => new Set(["base"]));   // any mix of KANA_GROUPS keys
  const [view, setView] = useState("setup");        // setup | session | summary | chart
  // Live-session guard: a tab tap asks before discarding this. Cleared on unmount too.
  useEffect(() => { setSessionBusy(view === "session"); return () => setSessionBusy(false); }, [view]);
  const [sessionLen, setSessionLen] = useState(20);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [revealed, setRevealed] = useState(false);
  const [guide, setGuide] = useState(false);
  // session state — mirrors Study so both tabs behave the same way
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [passed, setPassed] = useState(() => new Set());
  const [firstTry, setFirstTry] = useState(() => new Set());
  const [struggled, setStruggled] = useState(() => new Set());
  const missRef = useRef({});
  const shownRef = useRef(0);        // when the current kana appeared
  const thinkRef = useRef(null);     // ms from shown → Check (think time)
  const sessionStartRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { (async () => {
    try { const r = await sGet(KANA_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  // Rows for whichever groups are switched on, dropping katakana-only entries (ー, ファ …)
  // when hiragana is selected, and any row those leave empty.
  const rows = useMemo(() => {
    const keep = (e) => !(e[4] && script !== "kata");
    return KANA_GROUPS
      .filter(([key]) => sets.has(key))
      .flatMap(([, , groupRows]) => groupRows.map((row) => row.filter(keep)))
      .filter((row) => row.length);
  }, [sets, script]);
  const list = useMemo(() => rows.flat().map(([h, k, r, note]) => ({
    id: (script === "hira" ? "h-" : "k-") + h,       // char-keyed: stable & collision-free
    ch: script === "hira" ? h : k, r, note,
  })), [rows, script]);
  const toggleSet = (key) => setSets((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next.size ? next : new Set(["base"]);      // never leave nothing to drill
  });
  const allOn = KANA_GROUPS.every(([key]) => sets.has(key));

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  const needK = (st, now) => statNeed(st, now) + (st.seen ? 0 : Math.random());
  const byNeed = useCallback((pool) => {
    const now = Date.now();
    return pool
      .map((x) => ({ x, k: needK(getS(statsRef.current, x.id), now) + Math.random() * 1.2 }))
      .sort((a, b) => b.k - a.k)
      .map((o) => o.x);
  }, []);

  const startSession = useCallback((subset) => {
    const ordered = byNeed(subset && subset.length ? subset : list);
    const pool = sessionLen === "all" ? ordered : ordered.slice(0, sessionLen);
    if (!pool.length) return;
    setQueue(pool); setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {};
    sessionStartRef.current = Date.now();
    setElapsed(0);
    setRevealed(false); setGuide(false);
    setView("session");
  }, [list, sessionLen, byNeed]);

  const cur = queue[pos] || null;
  const sessionDone = view === "session" && pos >= queue.length && queue.length > 0;

  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, view]);
  useEffect(() => {
    if (sessionDone) { setElapsed(Date.now() - sessionStartRef.current); setView("summary"); }
  }, [sessionDone]);

  const weakest = useMemo(() => {
    const now = Date.now();
    return list
      .filter((x) => (getS(stats, x.id).seen || 0) > 0)
      .map((x) => ({ x, st: getS(stats, x.id), k: needK(getS(stats, x.id), now) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, 6);
  }, [list, stats]);
  const untouched = useMemo(() => list.filter((x) => !(getS(stats, x.id).seen || 0)).length, [list, stats]);

  /* drawing pad */
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const setup = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
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
  useEffect(() => { if (view === "session") setup(); }, [pos, view, setup]);
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, [view]);
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
    const pnt = xy(e), l = lastRef.current;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(pnt.x, pnt.y); ctx.stroke();
    lastRef.current = pnt;
  };
  const up = () => { drawingRef.current = false; lastRef.current = null; };
  const clearPad = () => setup();

  const record = (got) => {
    if (!cur) return;
    const m = statsRef.current;
    const s0 = getS(m, cur.id);
    const think = thinkRef.current;
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (got ? 1 : 0),
      level: got ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: got ? (s0.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(s0, got, think, Date.now()),
      ms: (s0.ms || 0) + (think || 0), msN: (s0.msN || 0) + (think ? 1 : 0) };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(KANA_KEY, JSON.stringify(nx));

    if (got) {
      if (!missRef.current[cur.id]) setFirstTry((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      setPassed((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      setQueue((prev) => prev.filter((x, idx) => idx <= pos || x.id !== cur.id));
    } else {
      setStruggled((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      const n = (missRef.current[cur.id] || 0) + 1;
      missRef.current[cur.id] = n;
      if (n <= KANA_REQUEUE_CAP) {
        setQueue((prev) => { const next = prev.slice(); next.splice(Math.min(pos + 1 + KANA_REQUEUE_GAP, next.length), 0, cur); return next; });
      }
    }
    setRevealed(false); setGuide(false);
    setPos((p) => p + 1);
  };
  const avgSecs = (st) => (st.msN ? (st.ms / st.msN / 1000).toFixed(1) + "s" : "—");

  const mastered = list.filter((x) => getS(stats, x.id).level >= 4).length;
  const cellClass = (id) => {
    const st = getS(stats, id);
    if (!st.seen) return " kn-untouched";
    if (st.level >= 4) return " kn-good";
    if (st.correct / st.seen < 0.5 || st.level < 2) return " kn-weak";
    return " kn-mid";
  };

  // ── mid-session ──
  if (view === "session" && cur) {
    return (
      <div className="tc-kana">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
          <span className="tc-progtext">{passed.size} / {poolSize}</span>
          <button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>
        </div>
        <div className="tc-card2 tc-kanadrill">
          <p className="tc-eyebrow">write this kana</p>
          <p className="tc-kanaprompt">{cur.r}{cur.note ? <span className="tc-kananote"> {cur.note}</span> : null}</p>
          <div className="tc-canvaswrap">
            {(guide || revealed) && <div className={"kn-ghost" + (revealed ? " kn-ghost-strong" : "")}>{cur.ch}</div>}
            <canvas ref={canvasRef} className="tc-canvas"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
          </div>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-sm" onClick={clearPad}>Clear</button>
            {!revealed && <button className="tc-btn tc-btn-sm" onClick={() => setGuide((v) => !v)}>{guide ? "Hide hint" : "Hint"}</button>}
            {!revealed
              ? <button className="tc-btn tc-btn-primary" onClick={() => { thinkRef.current = Date.now() - shownRef.current; setRevealed(true); }}>Check</button>
              : (
                <>
                  <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => record(false)}>Missed ✗</button>
                  <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => record(true)}>Got it ✓</button>
                </>
              )}
          </div>
        </div>
      </div>
    );
  }

  // ── session summary ──
  if (view === "summary") {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missed = list.filter((x) => struggled.has(x.id));
    const graded = passed.size || 1;
    return (
      <div className="tc-kana">
        <div className="tc-done">
          <p className="tc-eyebrow">Session complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">
            {firstTry.size} nailed first try{missed.length > 0 ? ` · ${missed.length} missed` : ""} · {poolSize} kana
          </p>
          <p className="tc-donesub">{fmtSecs(elapsed)} total · {(elapsed / graded / 1000).toFixed(1)}s per kana</p>
          {missed.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {missed.slice(0, 6).map((x) => {
                const st = getS(stats, x.id);
                return (
                  <div key={x.id} className="tc-kanaweakrow">
                    <span className="tc-kanaweakch">{x.ch}</span>
                    <span className="tc-kanaweakr">{x.r}</span>
                    <span className="tc-kanaweakmeta">{st.seen ? Math.round((st.correct / st.seen) * 100) + "%" : "—"} · {avgSecs(st)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tc-donebtns">
            {missed.length > 0 && (
              <button className="tc-btn tc-btn-primary" onClick={() => startSession(missed)}>Review the {missed.length} you missed</button>
            )}
            <button className="tc-btn" onClick={() => startSession()}>Go again</button>
            <button className="tc-btn" onClick={() => setView("setup")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-kana">
      <div className="tc-kanabar">
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (script === "hira" ? " is-on" : "")} onClick={() => setScript("hira")}>ひらがな</button>
          <button className={"tc-fchip" + (script === "kata" ? " is-on" : "")} onClick={() => setScript("kata")}>カタカナ</button>
        </div>
        <div className="tc-kanaseg">
          {KANA_GROUPS.map(([key, label]) => (
            <button key={key} className={"tc-fchip" + (sets.has(key) ? " is-on" : "")}
              aria-pressed={sets.has(key)} onClick={() => toggleSet(key)}
              title={key === "ext" ? "katakana-only loanword sounds" : undefined}>{label}</button>
          ))}
          <button className={"tc-fchip" + (allOn ? " is-on" : "")}
            title={allOn ? "back to base 46 only" : "select every set"}
            onClick={() => setSets(allOn ? new Set(["base"]) : new Set(KANA_GROUPS.map(([k]) => k)))}>
            {allOn ? "only 46" : "all"}
          </button>
        </div>
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (view === "setup" ? " is-on" : "")} onClick={() => setView("setup")}>Practice</button>
          <button className={"tc-fchip" + (view === "chart" ? " is-on" : "")} onClick={() => setView("chart")}>Chart</button>
        </div>
      </div>
      <p className="tc-kanaprog">
        {mastered}/{list.length} mastered · {script === "hira" ? "hiragana" : "katakana"} · {allOn ? "all sets" : KANA_GROUPS.filter(([k]) => sets.has(k)).map(([, l]) => l).join(" + ")}
        {sets.has("ext") && script !== "kata" ? " · extended = katakana only" : ""}
      </p>

      {!list.length ? (
        <div className="tc-card2 tc-kanadrill">
          <p className="tc-eyebrow">nothing to drill</p>
          <p className="tc-kanaempty">The extended loanword sounds (ファ, ヴィ, ティ…) only exist in katakana.</p>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-primary" onClick={() => setScript("kata")}>Switch to カタカナ</button>
            <button className="tc-btn tc-btn-sm" onClick={() => setSets(new Set(["base"]))}>Back to base 46</button>
          </div>
        </div>
      ) : view === "chart" ? (
        <div className="tc-kanagrid">
          {rows.map((row, ri) => (
            <div key={ri} className="tc-kanarow">
              {row.map(([h, k, r]) => {
                const id = (script === "hira" ? "h-" : "k-") + h;
                const one = list.find((x) => x.id === id);
                return (
                  <button key={id} className={"tc-kanacell" + cellClass(id)}
                    title={`${r} · ${getS(stats, id).seen ? Math.round((getS(stats, id).correct / getS(stats, id).seen) * 100) + "% · " + avgSecs(getS(stats, id)) : "not drilled yet"}`}
                    onClick={() => one && startSession([one])}>
                    <span className="tc-kanach">{script === "hira" ? h : k}</span>
                    <span className="tc-kanar">{r}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="tc-study-setup">
          <div className="tc-hero">
            <div className="tc-heronum">{mastered}</div>
            <p className="tc-herolabel">of {list.length} mastered</p>
            <p className="tc-herosub">{untouched > 0 ? `${untouched} never drilled` : "every kana in this set has been drilled"}</p>
          </div>

          <div className="tc-kanaseg tc-kanalen">
            <span className="tc-kanalenlabel">session</span>
            {KANA_LENGTHS.map((n) => (
              <button key={n} className={"tc-fchip" + (sessionLen === n ? " is-on" : "")} onClick={() => setSessionLen(n)}>
                {n === "all" ? `all ${list.length}` : n}
              </button>
            ))}
          </div>

          <button className="tc-btn tc-btn-primary tc-start" onClick={() => startSession()}>
            Start · {sessionLen === "all" ? list.length : Math.min(sessionLen, list.length)} kana
          </button>
          <p className="tc-smarthint">
            {untouched > 0
              ? `New kana first, then whichever you've been missing most.`
              : `Ordered by what you get wrong, how long you take, and how long since you last saw it.`}
          </p>

          {weakest.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {weakest.map(({ x, st }) => (
                <div key={x.id} className="tc-kanaweakrow">
                  <span className="tc-kanaweakch">{x.ch}</span>
                  <span className="tc-kanaweakr">{x.r}</span>
                  <span className="tc-kanaweakmeta">{Math.round((st.correct / st.seen) * 100)}% · {avgSecs(st)} · seen {st.seen}×</span>
                </div>
              ))}
              <button className="tc-btn tc-btn-sm" onClick={() => startSession(weakest.map((w) => w.x))}>
                Drill these {weakest.length}
              </button>
            </div>
          )}
          <p className="tc-hintline">Tap a cell in Chart to drill just that one kana.</p>
        </div>
      )}
    </div>
  );
}
