import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CONJ_TYPES, CONJ_BANK, CONJ_FILTERS } from "../data/conj-bank.js";
import { conjugate, CONJ_FORMS } from "../lib/conjugate.js";
import { statNeed, statReview } from "../lib/schedule.js";
import { sGet, sSet } from "../lib/storage.js";
import { setSessionBusy } from "../lib/session.js";
import SpeakBtn from "../components/SpeakBtn.jsx";

const CONJ_KEY = "jpn101:conj";
const CONJ_LENGTHS = [10, 20, 40, "all"];

const fmtSecs = (ms) => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
};

export default function ConjDrill() {
  const [filter, setFilter] = useState("all");
  const [forms, setForms] = useState(() => new Set(CONJ_FORMS.map((f) => f.id)));   // whole grid by default
  const [len, setLen] = useState(20);
  const [view, setView] = useState("setup");     // setup | session | summary
  // Live-session guard: a tab tap asks before discarding this. Cleared on unmount too.
  useEffect(() => { setSessionBusy(view === "session"); return () => setSessionBusy(false); }, [view]);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [passed, setPassed] = useState(() => new Set());
  const [firstTry, setFirstTry] = useState(() => new Set());
  const [struggled, setStruggled] = useState(() => new Set());
  const missRef = useRef({});
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
  const startedRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { (async () => {
    try { const r = await sGet(CONJ_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  const words = useMemo(
    () => (filter === "all" ? CONJ_BANK : CONJ_BANK.filter((w) => w.type === filter)),
    [filter]
  );
  // every (word × selected form) pair is its own drillable item with its own history
  const items = useMemo(() => {
    const out = [];
    words.forEach((w) => {
      const c = conjugate(w.reading, w.type);
      if (!c) return;
      CONJ_FORMS.forEach((f) => {
        if (!forms.has(f.id)) return;
        const ans = f.pol === "te" ? c.te : f.pol === "tai" ? c.tai : c[f.pol][f.key];
        if (ans) out.push({ id: w.reading + "|" + f.id, w, f, answer: ans });
      });
    });
    return out;
  }, [words, forms]);

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  const needC = (st, now) => statNeed(st, now) + (st.seen ? 0 : Math.random());

  const startSession = useCallback((subset) => {
    const now = Date.now();
    const pool0 = subset && subset.length ? subset : items;
    if (!pool0.length) return;
    const ordered = pool0
      .map((x) => ({ x, k: needC(getS(statsRef.current, x.id), now) + Math.random() * 1.2 }))
      .sort((a, b) => b.k - a.k).map((o) => o.x);
    const pool = len === "all" ? ordered : ordered.slice(0, len);
    setQueue(pool); setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {}; startedRef.current = Date.now(); setElapsed(0);
    setFlipped(false); setView("session");
  }, [items, len]);

  const cur = queue[pos] || null;
  const done = view === "session" && queue.length > 0 && pos >= queue.length;
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, view]);
  useEffect(() => { if (done) { setElapsed(Date.now() - startedRef.current); setView("summary"); } }, [done]);

  const grade = (ok) => {
    if (!cur) return;
    const m = statsRef.current, s0 = getS(m, cur.id), think = thinkRef.current;
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (ok ? 1 : 0),
      level: ok ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: ok ? (s0.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(s0, ok, think, Date.now()),
      ms: (s0.ms || 0) + (think || 0), msN: (s0.msN || 0) + (think ? 1 : 0) };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(CONJ_KEY, JSON.stringify(nx));
    if (ok) {
      if (!missRef.current[cur.id]) setFirstTry((p) => { const n = new Set(p); n.add(cur.id); return n; });
      setPassed((p) => { const n = new Set(p); n.add(cur.id); return n; });
      setQueue((q) => q.filter((x, i) => i <= pos || x.id !== cur.id));
    } else {
      setStruggled((p) => { const n = new Set(p); n.add(cur.id); return n; });
      const c = (missRef.current[cur.id] || 0) + 1;
      missRef.current[cur.id] = c;
      if (c <= 2) setQueue((q) => { const n = q.slice(); n.splice(Math.min(pos + 4, n.length), 0, cur); return n; });
    }
    setFlipped(false); setPos((p) => p + 1);
  };

  const toggleForm = (id) => setForms((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n.size ? n : new Set(["p-pn"]);        // never leave nothing to ask
  });
  const mastered = items.filter((x) => getS(stats, x.id).level >= 4).length;
  const avgSecs = (st) => (st.msN ? (st.ms / st.msN / 1000).toFixed(1) + "s" : "—");

  // ── session ──
  if (view === "session" && cur) {
    const meta = CONJ_TYPES[cur.w.type];
    return (
      <div className="tc-conj">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
          <span className="tc-progtext">{passed.size} / {poolSize}</span>
          <button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>
        </div>
        <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={() => setFlipped((f) => !f)}>
          <div className="tc-card-inner">
            <div className="tc-face tc-front">
              <span className="tc-kindchip">{meta.chip}</span>
              <div lang="ja" className="tc-term">{cur.w.dict}</div>
              <div lang="ja" className="tc-reading-front">{cur.w.reading} · {cur.w.meaning}</div>
              <div className="tc-conjask">→ {cur.f.ask}?</div>
              <span className="tc-flipcue">tap to flip</span>
            </div>
            <div className="tc-face tc-back">
              <div className="tc-conjanswer">{cur.answer} <SpeakBtn text={cur.answer} /></div>
              <div className="tc-conjhow">{cur.f.ask}</div>
              <div className="tc-conjrule">{meta.rule}</div>
              {cur.w.note && <p className="tc-conjnote"><span aria-hidden="true">⚠️</span> {cur.w.note}</p>}
            </div>
          </div>
        </div>
        <div className="tc-grade">
          {!flipped ? (
            <button type="button" className="tc-btn tc-btn-wide"
              onClick={(e) => { e.stopPropagation(); thinkRef.current = Date.now() - shownRef.current; setFlipped(true); }}>Reveal answer</button>
          ) : (
            <>
              <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
              <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── summary ──
  if (view === "summary") {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missed = items.filter((x) => struggled.has(x.id));
    return (
      <div className="tc-conj">
        <div className="tc-done">
          <p className="tc-eyebrow">Session complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{firstTry.size} nailed first try{missed.length ? ` · ${missed.length} missed` : ""} · {poolSize} prompts</p>
          <p className="tc-donesub">{fmtSecs(elapsed)} total · {(elapsed / (passed.size || 1) / 1000).toFixed(1)}s each</p>
          {missed.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {missed.slice(0, 6).map((x) => {
                const st = getS(stats, x.id);
                return (
                  <div key={x.id} className="tc-kanaweakrow">
                    <span className="tc-kanaweakch" style={{ fontSize: 18 }}>{x.w.dict}</span>
                    <span className="tc-kanaweakr">{x.f.ask}</span>
                    <span className="tc-kanaweakmeta">{st.seen ? Math.round((st.correct / st.seen) * 100) + "%" : "—"} · {avgSecs(st)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tc-donebtns">
            {missed.length > 0 && <button className="tc-btn tc-btn-primary" onClick={() => startSession(missed)}>Review the {missed.length} you missed</button>}
            <button className="tc-btn" onClick={() => startSession()}>Go again</button>
            <button className="tc-btn" onClick={() => setView("setup")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // ── setup ──
  return (
    <div className="tc-conj">
      <div className="tc-conjintro">
        <h2 className="tc-conjtitle">Conjugation</h2>
        <p className="tc-conjsub">The full grid from class — present/past × positive/negative, polite and plain.
          ① ichidan: drop る · ⑤ godan: shift across the あいうえお rows ·
          い-adj: 〜く〜 · noun/な-adj: 〜じゃ〜</p>
        <div className="tc-conjchips" role="group" aria-label="Word type">
          {CONJ_FILTERS.map(([id, label]) => (
            <button key={id} className={"tc-conjchip" + (filter === id ? " is-on" : "")}
              onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="tc-conjchips" role="group" aria-label="Which forms to drill">
          {CONJ_FORMS.map((f) => (
            <button key={f.id} className={"tc-conjchip" + (forms.has(f.id) ? " is-on" : "")}
              aria-pressed={forms.has(f.id)} onClick={() => toggleForm(f.id)}>{f.ask}</button>
          ))}
          <button className="tc-conjchip"
            onClick={() => setForms(forms.size === CONJ_FORMS.length ? new Set(["p-pn"]) : new Set(CONJ_FORMS.map((f) => f.id)))}>
            {forms.size === CONJ_FORMS.length ? "just one" : `all ${CONJ_FORMS.length}`}
          </button>
        </div>
        <div className="tc-kanaseg tc-kanalen">
          <span className="tc-kanalenlabel">session</span>
          {CONJ_LENGTHS.map((n) => (
            <button key={n} className={"tc-fchip" + (len === n ? " is-on" : "")} onClick={() => setLen(n)}>
              {n === "all" ? `all ${items.length}` : n}
            </button>
          ))}
        </div>
        <button className="tc-btn tc-btn-wide" onClick={() => startSession()}>
          Start · {len === "all" ? items.length : Math.min(len, items.length)} prompts
        </button>
        <p className="tc-conjsub">{mastered}/{items.length} mastered · {words.length} words × {forms.size} form{forms.size === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
}
