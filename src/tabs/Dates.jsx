import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { buildItems as buildDateItems, sequenceForm, acceptedReadings } from "../../tools/counters-data.mjs";
import { toKana, kanaEqual } from "../../tools/romaji.mjs";
import { statNeed, statReview } from "../lib/schedule.js";
import { speakJa } from "../lib/tts.js";
import { sGet, sSet } from "../lib/storage.js";

const DATES_KEY = "jpn101:dates";

export const DATE_GROUPS = [
  { id: "weekday", label: "Days of the week", hint: "七曜", match: (i) => i.kind === "weekday" },
  { id: "month", label: "Months", hint: "月", match: (i) => i.kind === "month" },
  { id: "day", label: "Days of the month", hint: "日", match: (i) => i.kind === "day" },
  { id: "time", label: "Hours & minutes", hint: "時・分", match: (i) => i.id.startsWith("ctr:ji:") || i.id.startsWith("ctr:fun:") },
  { id: "counter", label: "Counters", hint: "助数詞", match: (i) => i.kind === "counter" && !i.id.startsWith("ctr:ji:") && !i.id.startsWith("ctr:fun:") },
];

export const DATE_ITEMS = buildDateItems();
const dateGroupOf = (i) => (DATE_GROUPS.find((g) => g.match(i)) || DATE_GROUPS[4]).id;

const pickN = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
const randOf = (a) => a[Math.floor(Math.random() * a.length)];
const num = (id) => Number(id.split(":").pop()) || 0;

/* Distractors come from the same group, so a 〜日 question is answered against other 〜日
   readings. Anything else makes the question answerable by shape alone. */
function dateDistractors(item, n) {
  const g = dateGroupOf(item);
  const sameCounter = item.id.startsWith("ctr:") ? item.id.split(":")[1] : null;
  const pool = DATE_ITEMS.filter((x) => {
    if (x.id === item.id || x.reading === item.reading) return false;
    if (sameCounter) return x.id.startsWith("ctr:" + sameCounter + ":");
    return dateGroupOf(x) === g;
  });
  const near = pool.filter((x) => Math.abs(num(x.id) - num(item.id)) <= 6);
  const chosen = pickN(near.length >= n ? near : pool, n);
  return chosen.length >= n ? chosen : pickN(pool, n);
}

/* A full exam-shaped prompt, assembled from pieces he has already met. */
function makeSequence() {
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const dow = Math.floor(Math.random() * 7);
  const hour = 1 + Math.floor(Math.random() * 23);
  const minute = randOf([0, 0, 15, 30, 30, 45, 10, 20]);
  return sequenceForm(month, day, dow, hour, minute);
}

export default function Dates({ logDay = () => {} }) {
  const [stats, setStats] = useState({});
  const [view, setView] = useState("home");
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState(null);
  const [judged, setJudged] = useState(null);     // {ok, want} once an answer is committed
  const [lastAnswer, setLastAnswer] = useState(""); // what he actually gave, shown back on a miss
  const judgedAtRef = useRef(0);                  // guards Enter auto-repeat from skipping the answer
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const [chart, setChart] = useState(null);       // which group's reference chart is open
  const statsRef = useRef({});
  const shownRef = useRef(Date.now());
  const thinkRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let live = true;
    sGet(DATES_KEY).then((raw) => {
      if (!live) return;
      let v = {};
      try { v = JSON.parse(raw || "{}") || {}; } catch (e) {}
      statsRef.current = v; setStats(v);
    });
    return () => { live = false; };
  }, []);

  const getS = useCallback((id) => statsRef.current[id] || {}, []);

  const save = (item, ok, ms) => {
    const st = getS(item.id);
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, ms, Date.now()),
      ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
    };
    const nx = { ...statsRef.current, [item.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(DATES_KEY, JSON.stringify(nx));
    logDay({ ok, ms: ms || 0, deck: "dates" });
  };

  const speak = useCallback((text) => {
    try { speakJa(String(text), 0.95); } catch (e) {}
  }, []);

  const solid = useCallback((id) => ((stats[id] || {}).level || 0) >= 4, [stats]);
  const met = useCallback((id) => ((stats[id] || {}).seen || 0) > 0, [stats]);

  const groupProgress = useMemo(() => DATE_GROUPS.map((g) => {
    const items = DATE_ITEMS.filter(g.match);
    return {
      ...g, items,
      solid: items.filter((i) => solid(i.id)).length,
      met: items.filter((i) => met(i.id)).length,
    };
  }), [solid, met]);

  const overall = useMemo(() => {
    const done = DATE_ITEMS.filter((i) => solid(i.id)).length;
    return { done, total: DATE_ITEMS.length, pct: Math.round((done / DATE_ITEMS.length) * 100) };
  }, [solid]);

  const dueNow = useMemo(() => {
    const now = Date.now();
    return DATE_ITEMS.filter((i) => {
      const f = (stats[i.id] || {}).fsrs;
      return f && f.due && f.due <= now;
    }).length;
  }, [stats]);

  /* A question's form follows how well the item is known: meet it, then recognise it, then
     produce it. Typing is the goal state — it is the only one that proves recall rather
     than recognition. */
  const formFor = (item) => {
    const st = getS(item.id);
    if (!(st.seen > 0)) return "learn";
    if ((st.level || 0) >= 3) return "type";
    if ((st.level || 0) >= 1) return Math.random() < 0.5 ? "type" : "mc";
    return "mc";
  };

  const startSession = useCallback((groupId) => {
    const now = Date.now();
    const pool = groupId ? DATE_ITEMS.filter((i) => dateGroupOf(i) === groupId) : DATE_ITEMS;
    const isSeen = (i) => ((statsRef.current[i.id] || {}).seen || 0) > 0;
    const review = pool.filter(isSeen)
      .map((i) => ({ i, need: statNeed(statsRef.current[i.id], now) + (i.weight ?? (i.trap ? 0.6 : 0)) }))
      .sort((a, b) => b.need - a.need)
      .slice(0, 8).map((x) => x.i);
    const fresh = pool.filter((i) => !isSeen(i)).slice(0, Math.max(4, 12 - review.length));
    const chosen = [...review, ...fresh].slice(0, 12);
    const steps = [];
    for (const item of chosen) {
      const form = formFor(item);
      if (form === "learn") steps.push({ kind: "learn", item }, { kind: "mc", item });
      else steps.push({ kind: form, item });
    }
    const waves = [];
    let depth = 0;
    while (steps.some((s) => s.wave === undefined)) {
      for (const item of chosen) {
        const next = steps.find((s) => s.item.id === item.id && s.wave === undefined);
        if (next) { next.wave = depth; waves.push(next); }
      }
      depth++;
    }
    if (!groupId) for (let i = 0; i < 3; i++) waves.push({ kind: "seq", seq: makeSequence() });

    setQueue(waves);
    setPos(0); setHits(0); setTotal(0);
    setTyped(""); setPicked(null); setJudged(null);
    shownRef.current = Date.now(); thinkRef.current = null;
    setView("session");
  }, []);

  const step = queue[pos] || null;
  const item = step ? step.item : null;

  /* Options for a multiple-choice step, stable for the life of the step. */
  const choices = useMemo(() => {
    if (!step || step.kind !== "mc" || !item) return [];
    return [item, ...dateDistractors(item, 3)].sort(() => Math.random() - 0.5);
  }, [step, item]);

  useEffect(() => {
    shownRef.current = Date.now(); thinkRef.current = null;
    setTyped(""); setPicked(null); setJudged(null); setLastAnswer("");
    if (step && (step.kind === "type" || step.kind === "seq")) {
      setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 30);
    }
    if (step && step.kind === "learn" && step.item) setTimeout(() => speak(step.item.reading), 250);
  }, [pos, speak]);

  useEffect(() => {
    if (view === "session" && queue.length && pos >= queue.length) setView("summary");
  }, [pos, queue.length, view]);

  const advance = () => setPos((x) => x + 1);

  useEffect(() => {
    if (!judged) return;
    const onKey = (e) => {
      if (e.key !== "Enter") return;
      if (e.repeat || Date.now() - judgedAtRef.current < 600) return;
      e.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [judged]);

  const commit = (ok, want) => {
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    setJudged({ ok, want });
    judgedAtRef.current = Date.now();
    setTotal((t) => t + 1);
    if (ok) setHits((h) => h + 1);
    if (item) save(item, ok, thinkRef.current);
    speak(want);
    if (!ok && item) {
      setQueue((q) => {
        const nq = q.slice();
        nq.splice(Math.min(nq.length, pos + 4), 0, { kind: "mc", item });
        return nq;
      });
    }
  };

  const answerMC = (opt) => {
    if (judged || !item) return;
    setPicked(opt);
    setLastAnswer(opt.reading);
    commit(opt.id === item.id, item.reading);
  };

  const submitTyped = () => {
    if (judged) return;
    const kana = toKana(typed);
    if (!kana) return;
    setLastAnswer(kana);
    if (step.kind === "seq") {
      const ok = acceptedReadings(step.seq.reading).some((r) => kanaEqual(kana, r));
      if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
      setJudged({ ok, want: step.seq.reading });
      judgedAtRef.current = Date.now();
      setTotal((t) => t + 1);
      if (ok) setHits((h) => h + 1);
      for (const part of ["date", "weekday", "time"]) {
        const piece = step.seq.parts[part];
        const sub = DATE_ITEMS.find((x) => x.reading === piece.reading);
        if (sub) save(sub, ok, thinkRef.current);
      }
      logDay({ ok, ms: thinkRef.current || 0, deck: "dates" });
      speak(step.seq.reading);
      return;
    }
    const strictSeven = item.kind === "month" || item.kind === "day";
    const ok = acceptedReadings(item.reading, { strictSeven }).some((r) => kanaEqual(kana, r));
    commit(ok, item.reading);
  };

  /* ── reference chart ── */
  if (chart) {
    const g = groupProgress.find((x) => x.id === chart);
    return (
      <div className="tc-dates">
        <div className="tc-dhead">
          <button className="tc-fchip" onClick={() => setChart(null)}>← Back</button>
          <h2 className="tc-dtitle">{g.label}</h2>
        </div>
        <p className="tc-smarthint">Tap any row to hear it. Red rows are the ones that break the pattern.</p>
        <div className="tc-dchart">
          {g.items.map((i) => (
            <button key={i.id} className={"tc-drow" + (i.trap ? " is-trap" : "") + (solid(i.id) ? " is-solid" : "")}
              onClick={() => speak(i.reading)}>
              <span className="tc-drowk">{i.kanji}</span>
              <span className="tc-drowr">{i.reading}</span>
              <span className="tc-drowe">{i.en}</span>
            </button>
          ))}
        </div>
        <button className="tc-btn tc-btn-primary tc-dwide" onClick={() => { setChart(null); startSession(g.id); }}>
          Drill {g.label.toLowerCase()}
        </button>
      </div>
    );
  }

  /* ── session ── */
  if (view === "session" && step) {
    const pct = queue.length ? (pos / queue.length) * 100 : 0;
    const isSeq = step.kind === "seq";
    const kana = toKana(typed);
    return (
      <div className="tc-dates">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: pct + "%" }} /></div>
          <span className="tc-progtext">{pos} / {queue.length}</span>
          <button className="tc-fchip" onClick={() => setView("home")}>Quit</button>
        </div>

        {step.kind === "learn" ? (
          <div className="tc-dcard">
            <p className="tc-eyebrow">new</p>
            <div className="tc-dbig">{item.kanji}</div>
            <div className="tc-dread">{item.reading}</div>
            <div className="tc-den">{item.en}</div>
            <button className="tc-btn tc-btn-sm" onClick={() => speak(item.reading)}>🔊 Hear it</button>
            {item.trap && <p className="tc-dnote">⚠ {item.note || "This one breaks the pattern — learn it as its own word."}</p>}
            <button className="tc-btn tc-btn-primary tc-dwide" onClick={advance}>Got it</button>
          </div>
        ) : (
          <div className="tc-dq">
            <p className="tc-kprompt">
              {isSeq ? "Write this out in Japanese"
                : step.kind === "type" ? "Type the reading"
                : "Which reading is this?"}
            </p>
            <div className="tc-dstem">
              {isSeq ? <span className="tc-dseqen">{step.seq.en}</span> : (
                <>
                  <span className="tc-dbig">{item.kanji}</span>
                  <span className="tc-den">{item.en}</span>
                </>
              )}
            </div>

            {step.kind === "mc" ? (
              <div className="tc-kopts">
                {choices.map((o) => {
                  const state = !judged ? ""
                    : o.id === item.id ? " is-right"
                    : picked && o.id === picked.id ? " is-wrong" : " is-dim";
                  return (
                    <button key={o.id} className={"tc-kopt" + state} disabled={!!judged}
                      onClick={() => answerMC(o)}>{o.reading}</button>
                  );
                })}
              </div>
            ) : (
              <div className="tc-dtype">
                <input ref={inputRef} aria-label="Your answer" className="tc-dinput" value={typed} disabled={!!judged}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!judged) { submitTyped(); return; }
                    if (Date.now() - judgedAtRef.current > 600) advance();
                  }}
                  placeholder="type in romaji — shigatsu youka"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                <div className="tc-dkana">{kana || "　"}</div>
                {!judged && (
                  <button className="tc-btn tc-btn-primary tc-dwide" onClick={submitTyped} disabled={!kana}>
                    Check
                  </button>
                )}
              </div>
            )}

            {judged && (
              <div className={"tc-dfeedwrap" + (judged.ok ? " is-ok" : "")}>
                <div className="tc-dfeed">
                  <div className="tc-dfeedhead">
                    <span className="tc-dfeedmark">{judged.ok ? "✓" : "✗"}</span>
                    <span className="tc-dfeedverdict">{judged.ok ? "Correct" : "Not quite"}</span>
                  </div>
                  {!judged.ok && lastAnswer && (
                    <p className="tc-dfeedyours">you wrote <b>{lastAnswer}</b></p>
                  )}
                  <p className="tc-dfeedans">
                    <b>{isSeq ? step.seq.kanji : item.kanji}</b>
                    <span className="tc-dfeedread">{judged.want}</span>
                  </p>
                  {isSeq && <p className="tc-dfeedsub">{step.seq.en}</p>}
                  {!isSeq && item.note && <p className="tc-dfeedsub">{item.note}</p>}
                  <button className="tc-btn tc-btn-primary tc-dwide" onClick={advance}>Continue</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── summary ── */
  if (view === "summary") {
    const pct = total ? Math.round((hits / total) * 100) : 0;
    return (
      <div className="tc-dates">
        <div className="tc-done">
          <p className="tc-eyebrow">Drill complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{hits} right of {total}</p>
          <div className="tc-donebtns">
            <button className="tc-btn tc-btn-primary" onClick={() => startSession(null)}>Another round</button>
            <button className="tc-btn" onClick={() => setView("home")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── home ── */
  return (
    <div className="tc-dates">
      <div className="tc-dhero">
        <p className="tc-eyebrow">dates · times · counters</p>
        <div className="tc-bignum">{overall.done}<span>/{overall.total}</span></div>
        <p className="tc-donesub">{overall.pct}% solid{dueNow > 0 ? ` · ${dueNow} due for review` : ""}</p>
      </div>

      <button className="tc-btn tc-btn-primary tc-dwide" onClick={() => startSession(null)}>
        Start mixed drill
      </button>
      <p className="tc-smarthint">
        Mixed drills end with full exam-shaped prompts — “Thursday, April 8 at 7:00 PM” —
        written out from scratch. Everything is typed in romaji and converted as you go, so
        no Japanese keyboard is needed.
      </p>

      <div className="tc-dgroups">
        {groupProgress.map((g) => (
          <div key={g.id} className="tc-dgroup">
            <div className="tc-dgroupinfo">
              <b>{g.label}</b>
              <span className="tc-dgrouphint">{g.hint} · {g.solid}/{g.items.length} solid</span>
              <div className="tc-dbar"><div className="tc-dbarfill" style={{ width: (g.solid / g.items.length) * 100 + "%" }} /></div>
            </div>
            <div className="tc-dgroupbtns">
              <button className="tc-btn tc-btn-sm" onClick={() => setChart(g.id)}>Chart</button>
              <button className="tc-btn tc-btn-sm" onClick={() => startSession(g.id)}>Drill</button>
            </div>
          </div>
        ))}
      </div>

      <p className="tc-smarthint">
        Every reading is stored and scheduled on its own, so missing 二十日 brings back
        二十日 and not the whole list. Traps — the readings that break the pattern — are
        drilled sooner than the regular ones.
      </p>
    </div>
  );
}
