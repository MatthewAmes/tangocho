import React, { useState, useEffect, useMemo, useRef } from "react";
import { statReview } from "../lib/schedule.js";
import { sGet, sSet } from "../lib/storage.js";

const QUIZ_KEY = "jpn101:quiz";
const QUIZ_MAX_CHOICES = 6;
const quizNorm = (s) => String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:'"]/g, "").trim();

export default function Quizzes({ cards = [], loadQuizzes, logDay = () => {} }) {
  const [all, setAll] = useState(null);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [openAct, setOpenAct] = useState(null);
  const [quiz, setQuiz] = useState(null);      // the exercise being taken
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState(null); // {ok, want}
  const [rows, setRows] = useState([]);
  const shownRef = useRef(0);

  useEffect(() => {
    if (typeof loadQuizzes === "function") {
      loadQuizzes().then(setAll).catch(() => setAll([]));
    } else {
      fetch("/quizzes.json", { cache: "force-cache" })
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setAll(Array.isArray(list) ? list : []))
        .catch(() => setAll([]));
    }
  }, [loadQuizzes]);

  useEffect(() => { (async () => {
    try { const r = await sGet(QUIZ_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  const byAct = useMemo(() => {
    const m = new Map();
    for (const q of all || []) {
      if (!m.has(q.act)) m.set(q.act, []);
      m.get(q.act).push(q);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [all]);

  /* How much of an exercise is holding, from the same stats every other strand keeps. */
  const scoreOf = (q) => {
    let seen = 0, weight = 0;
    for (const it of q.items) {
      const st = stats[it.id];
      if (!st || !st.seen) continue;
      seen++; weight += Math.max(0, Math.min(5, st.level || 0)) / 5;
    }
    return { seen, total: q.items.length, pct: seen ? Math.round((weight / seen) * 100) : null };
  };

  const item = quiz && quiz.items[at];
  /* The exercise's own answers, deduped. Fewer than two and there is nothing to choose
     between, so it is typed instead. */
  const choices = useMemo(() => {
    if (!quiz) return null;
    const set = [...new Set(quiz.items.map((i) => i.answer))];
    return set.length >= 2 && set.length <= QUIZ_MAX_CHOICES ? set.slice().sort() : null;
  }, [quiz]);

  const start = (q) => { setQuiz(q); setAt(0); setTyped(""); setVerdict(null); setRows([]); shownRef.current = Date.now(); };

  const answer = (given) => {
    if (!item || verdict) return;
    const ok = quizNorm(given) === quizNorm(item.answer);
    const ms = Date.now() - shownRef.current;
    setVerdict({ ok, want: item.answer });
    setRows((r) => [...r, { id: item.id, ok }]);
    /* Written in the same shape and through the same scheduler as every other strand, with
       the act alongside so the volume rollup can place it. The strand registry already
       reads this key; nothing else has to be told the tab exists. */
    const next = { ...statsRef.current };
    const s0 = next[item.id] || { seen: 0, correct: 0, level: 0, streak: 0 };
    next[item.id] = {
      ...s0,
      act: quiz.act,
      seen: s0.seen + 1,
      correct: s0.correct + (ok ? 1 : 0),
      level: ok ? Math.min(5, (s0.level || 0) + 1) : Math.max(0, (s0.level || 0) - 2),
      streak: ok ? (s0.streak || 0) + 1 : 0,
      last: Date.now(),
      fsrs: statReview(s0, ok, ms, Date.now()),
    };
    statsRef.current = next; setStats(next); sSet(QUIZ_KEY, JSON.stringify(next));
    logDay({ ok, ms, deck: "quiz", area: "quiz" });
  };

  const next = () => {
    setVerdict(null); setTyped(""); shownRef.current = Date.now();
    setAt((i) => i + 1);
  };

  if (all === null) return <div className="tc-charswait" />;
  if (!all.length) {
    return (
      <div className="tc-sentempty">
        <p>No activity-book exercises are loaded. They ship as a separate asset built from
           the books — run <code>tools/build-quiz-asset.mjs</code> and redeploy.</p>
      </div>
    );
  }

  // ── taking one ──
  if (quiz) {
    const done = at >= quiz.items.length;
    const right = rows.filter((r) => r.ok).length;
    return (
      <div>
        <div className="tc-rehhead">
          <button className="tc-btn tc-btn-sm" onClick={() => setQuiz(null)}>← Quizzes</button>
          <span className="tc-rehname">{quiz.id}</span>
        </div>
        {done ? (
          <div className="tc-card2">
            <p className="tc-donerate"><b>{right}</b> of {rows.length} right</p>
            <p className="tc-planhint">{quiz.title}</p>
            <button className="tc-btn tc-btn-primary" onClick={() => setQuiz(null)}>Back to quizzes</button>
          </div>
        ) : (
          <div className="tc-card2">
            <p className="tc-planhint">{quiz.title} · {at + 1}/{quiz.items.length}</p>
            <p className="tc-quizprompt">{item.prompt}</p>
            {choices ? (
              <div className="tc-modeseg" role="group" aria-label="Answer">
                {choices.map((c) => (
                  <button key={c} className={"tc-segbtn" + (verdict && quizNorm(c) === quizNorm(verdict.want) ? " is-on" : "")}
                          disabled={!!verdict} onClick={() => answer(c)}>{c}</button>
                ))}
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (!verdict) answer(typed); }}>
                <input aria-label="Your answer" className="tc-input" value={typed} disabled={!!verdict}
                       onChange={(e) => setTyped(e.target.value)} placeholder="Your answer" />
              </form>
            )}
            {verdict && (
              <p className={"tc-sentresult " + (verdict.ok ? "ok" : "no")}>
                {verdict.ok ? "Correct" : `Answer: ${verdict.want}`}
              </p>
            )}
            {verdict && <button className="tc-btn tc-btn-primary" onClick={next}>Next →</button>}
          </div>
        )}
      </div>
    );
  }

  // ── choosing one ──
  return (
    <div>
      <p className="tc-planhint">
        {all.length} exercises from the NihonGO NOW! Activity Books, marked against the book's
        own answer key. Results count toward your volume progress.
      </p>
      {byAct.map(([act, qs]) => {
        const open = openAct === act;
        return (
          <div key={act} className="tc-volrow">
            <button type="button" className="tc-volhead" aria-expanded={open}
                    onClick={() => setOpenAct(open ? null : act)}>
              <span className="tc-volname">Act {act}</span>
              <span className="tc-volpct">{qs.length}</span>
            </button>
            {open && (
              <ul className="tc-scriptlist">
                {qs.map((q) => {
                  const s = scoreOf(q);
                  return (
                    <li key={q.id} className="tc-scriptrow">
                      <button className="tc-scriptopen" onClick={() => start(q)}>
                        <span className="tc-scriptname">{q.title || q.id}</span>
                        <span className="tc-scriptmeta">
                          {q.items.length} items{s.pct == null ? "" : ` · ${s.pct}% holding`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
