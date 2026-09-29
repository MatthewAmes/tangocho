import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toKana, kanaEqual } from "../../tools/romaji.mjs";
import { grammarInventory, drillSession, bookExample, PATTERN_BY_ID } from "../../tools/grammar-drills.mjs";
import { levelsFor, LEVEL } from "../../tools/proven.mjs";
import { lineText } from "../../tools/cloze.mjs";
import FeedbackSheet from "../components/FeedbackSheet.jsx";
import { setSessionBusy } from "../lib/session.js";
import { speakJa } from "../lib/tts.js";

/* ── Volume 2 grammar ──
   Every grammar note in the Volume 2 textbook, act by act, with what the app can do for it
   and how well it is known. Notes with a mechanical drill (tools/grammar-drills.mjs) can be
   practised here: the learner types the whole form — 食べる + 〜てみる → たべてみる — and a
   real textbook line using the pattern is shown with the answer.

   Sessions mix notes by default. Practising one pattern ten times in a row feels fluent and
   fades fast; alternating between patterns makes each retrieval choose which rule applies,
   which is the skill a real sentence asks for. */

const LEVEL_TEXT = { mastered: "mastered", recalls: "can produce", recognises: "recognise", learning: "learning", new: "not started" };
const SESSION = 10;

const kanaOf = (v) => { try { return toKana(String(v || "").trim()); } catch (e) { return String(v || "").trim(); } };
const gid = (id) => "gram:" + id;

export default function GrammarDrill({ evidence = [], scripts = [], onAnswer }) {
  const inventory = useMemo(() => grammarInventory(), []);
  const levels = useMemo(() => levelsFor(evidence, inventory.map((g) => gid(g.id))), [evidence, inventory]);
  const levelOf = (id) => (levels.get(gid(id)) || {}).level || LEVEL.NEW;

  const bookLines = useMemo(() => {
    const out = [];
    for (const s of scripts || []) {
      const act = s.act || parseInt(s.name, 10);
      if (!(act >= 7 && act <= 12)) continue;
      for (const l of s.lines || []) out.push({ ja: lineText(l), scene: s.name || `${act}-${s.scene}` });
    }
    out.sort((a, b) => a.scene.localeCompare(b.scene, "en", { numeric: true }));
    return out;
  }, [scripts]);

  const [view, setView] = useState("list");       // list | session | done
  useEffect(() => { setSessionBusy(view === "session"); return () => setSessionBusy(false); }, [view]);
  const [items, setItems] = useState([]);
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [right, setRight] = useState(0);
  const [openAct, setOpenAct] = useState(null);
  const t0 = useRef(Date.now());
  const inputRef = useRef(null);

  const drillable = inventory.filter((g) => g.drill === "drill");
  const counts = useMemo(() => {
    const c = { mastered: 0, recalls: 0 };
    for (const g of drillable) { const l = levelOf(g.id); if (l === LEVEL.MASTERED) c.mastered++; else if (l === LEVEL.RECALLS) c.recalls++; }
    return c;
  }, [drillable, levels]);

  /* The mixed set: up to five notes, least known first and earliest in the book first, so a
     session works where the gaps are and in the order the book builds them. */
  const mixedIds = useMemo(() => {
    const rank = { new: 0, learning: 1, recognises: 2, recalls: 3, mastered: 4 };
    return [...drillable]
      .sort((a, b) => rank[levelOf(a.id)] - rank[levelOf(b.id)] || a.act - b.act || parseFloat(a.id) - parseFloat(b.id))
      .slice(0, 5).map((g) => g.id);
  }, [drillable, levels]);

  const start = (ids) => {
    const s = drillSession(ids, ids.length === 1 ? 6 : SESSION, Date.now());
    if (!s.length) return;
    setItems(s); setAt(0); setTyped(""); setVerdict(null); setRight(0); setView("session");
    t0.current = Date.now();
  };

  const item = items[at];
  useEffect(() => { if (view === "session" && !verdict && inputRef.current) inputRef.current.focus(); t0.current = Date.now(); }, [view, at, verdict]);

  const check = useCallback((raw) => {
    if (!item || verdict) return;
    const kana = kanaOf(raw);
    const ok = !!kana && kanaEqual(kana, item.answer);
    setVerdict({ ok, got: kana });
    if (ok) setRight((n) => n + 1);
    if (onAnswer) onAnswer(item, ok, Date.now() - t0.current, kana);
    speakJa(item.answer, 0.9);
  }, [item, verdict, onAnswer]);

  const next = useCallback(() => {
    setTyped(""); setVerdict(null);
    if (at + 1 >= items.length) setView("done"); else setAt(at + 1);
  }, [at, items.length]);

  // with an answer on screen, Enter moves on
  useEffect(() => {
    if (view !== "session" || !verdict) return;
    const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); next(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, verdict, next]);

  if (view === "done") {
    return (
      <section className="tc-plansec tc-gram">
        <h2 className="tc-planh">Grammar round done <span className="tc-planh-sub">{right} of {items.length}</span></h2>
        <p className="tc-planhint" style={{ marginTop: 0 }}>
          A pattern counts as mastered once you've produced it correctly on three different days across a week —
          so coming back to these tomorrow is what moves them.
        </p>
        <div className="tc-checkrow">
          <button className="tc-btn tc-btn-primary" onClick={() => start([...new Set(items.map((i) => i.pattern))])}>Go again</button>
          <button className="tc-btn" onClick={() => setView("list")}>Back to grammar</button>
        </div>
      </section>
    );
  }

  if (view === "session" && item) {
    const note = inventory.find((g) => g.id === item.pattern);
    const p = PATTERN_BY_ID.get(item.pattern);
    const ex = bookExample(item.pattern, bookLines);
    return (
      <section className="tc-plansec tc-gram">
        <div className="tc-gramtop">
          <span className="tc-kindchip">Grammar {note.id} · Scene {note.scene}</span>
          <span className="tc-planh-sub">{at + 1} of {items.length}</span>
          <button type="button" className="tc-btn tc-btn-sm tc-btn-quiet" onClick={() => setView("list")}>Quit</button>
        </div>
        <p className="tc-gramtitle">{note.title}</p>
        <p className="tc-gramgloss">{p.gloss}</p>
        <div className="tc-gramverb">
          <span lang="ja" className="tc-gramverbjp">{item.verb}</span>
          {item.reading !== item.verb && <span lang="ja" className="tc-gramverbread">{item.reading}</span>}
          <span className="tc-gramverben">{item.meaning}</span>
        </div>
        <p className="tc-planhint">Type the whole form in rōmaji — the verb with the pattern on it.</p>
        <input ref={inputRef} className="tc-checkin" aria-label="Your answer" value={typed} disabled={!!verdict}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return;
            if (e.key === "Enter" && !verdict) { e.preventDefault(); e.stopPropagation(); check(typed); }
          }}
          placeholder="e.g. tabetemiru" autoComplete="off" autoCorrect="off" spellCheck={false} />
        <div className="tc-checkkana">{typed.trim() ? kanaOf(typed) : "　"}</div>
        {!verdict && (
          <div className="tc-checkrow">
            <button className="tc-btn tc-btn-primary" onClick={() => check(typed)} disabled={!typed.trim()}>Check</button>
            <button className="tc-btn tc-btn-quiet" onClick={() => check("")}>Show me</button>
          </div>
        )}
        {verdict && (
          <div className="tc-grade has-sheet">
            <FeedbackSheet key={at} ok={verdict.ok}
              answer={{ term: item.answer, reading: "", meaning: p.gloss }}
              nextLabel={at + 1 >= items.length ? "Finish" : "Next →"}
              onNext={next}
              explain={{ ok: verdict.ok, marks: null, lines: [
                item.how + ".",
                ...(verdict.ok || !verdict.got ? [] : [`You wrote ${verdict.got}.`]),
              ] }}
              extra={ex && (
                <p lang="ja" className="tc-gramex">
                  <span className="tc-gramexsrc">In the book, Scene {ex.scene}:</span>{" "}
                  {ex.before}<b>{ex.match}</b>{ex.after}
                </p>
              )} />
          </div>
        )}
      </section>
    );
  }

  const acts = [7, 8, 9, 10, 11, 12];
  return (
    <section className="tc-plansec tc-gram">
      <h2 className="tc-planh">Volume 2 grammar <span className="tc-planh-sub">{inventory.length} notes from the textbook</span></h2>
      <p className="tc-planhint" style={{ marginTop: 0 }}>
        Every grammar note in Volume 2, act by act. {drillable.length} can be drilled here — you build the
        form yourself, and a real line from the book shows it in use.
        {counts.mastered + counts.recalls > 0 ? ` You can produce ${counts.mastered + counts.recalls} of them (${counts.mastered} mastered).` : ""}
      </p>
      <button className="tc-btn tc-btn-primary tc-start" onClick={() => start(mixedIds)}>
        Practise · {SESSION} mixed
      </button>
      <p className="tc-smarthint">Mixes the {mixedIds.length} patterns you know least, earliest in the book first.</p>

      {acts.map((act) => {
        const notes = inventory.filter((g) => g.act === act);
        const drills = notes.filter((g) => g.drill === "drill");
        const known = drills.filter((g) => [LEVEL.MASTERED, LEVEL.RECALLS].includes(levelOf(g.id))).length;
        const open = openAct === act;
        return (
          <div key={act} className="tc-gramact">
            <button type="button" className="tc-gramacthead" aria-expanded={open} onClick={() => setOpenAct(open ? null : act)}>
              <span>Act {act}</span>
              <span className="tc-planh-sub">{notes.length} notes · {drills.length} drills{drills.length ? ` · ${known} produced` : ""}</span>
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
            {open && notes.map((g) => {
              const lv = levelOf(g.id);
              return (
                <div key={g.id} className={"tc-gramrow" + (g.drill === "culture" ? " is-culture" : "")}>
                  <span className="tc-gramid">{g.id}</span>
                  <span className="tc-gramname">{g.title}<span className="tc-gramscene"> · {g.scene}</span></span>
                  {g.drill === "drill" ? (
                    <>
                      <span className={"tc-gramchip is-" + lv}>{LEVEL_TEXT[lv]}</span>
                      <button type="button" className="tc-btn tc-btn-sm" onClick={() => start([g.id])}>Practise</button>
                    </>
                  ) : (
                    <span className="tc-gramchip is-none">
                      {g.drill === "conjugation" ? "in Conjugation" : g.drill === "culture" ? "culture note" : "no drill yet"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
