import React, { useState } from "react";

/* ── the feedback sheet ──
   What appears at the bottom once an answer is in: green for right, red for wrong, the
   answer itself, one button to learn WHY, and one to move on.

   The explain button is the point. Testing and teaching used to be separate here — a wrong
   answer showed the right one and waited for "Noted — next" — and a miss is exactly the
   moment the learner is most ready to be told something. The explanation is built offline
   from the card, the answer and the deck (tools/explain.mjs), so it is always available
   and never costs an AI call.

   Enter moves on (the Study screen's own key handler owns that, so it cannot fire twice);
   the explanation stays one tap away rather than opening itself, because on a run of easy
   cards it would only be in the way. */

function Marked({ marks }) {
  return (
    <span className="tc-fbmarked" lang="ja">
      {marks.map((m, i) => <span key={i} className={m.miss ? "is-miss" : undefined}>{m.ch}</span>)}
    </span>
  );
}

export default function FeedbackSheet({ ok, answer, onNext, nextLabel, explain, onExplain, extra }) {
  const [open, setOpen] = useState(false);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && onExplain) onExplain();
    setOpen((o) => !o);
  };

  return (
    <div className={"tc-fb " + (ok ? "is-ok" : "is-bad")} role="status" aria-live="polite" onClick={(e) => e.stopPropagation()}>
      <div className="tc-fbhead">
        <span className="tc-fbmark" aria-hidden="true">{ok ? "✓" : "✗"}</span>
        <span className="tc-fbtitle">{ok ? "Correct" : "Not quite"}</span>
      </div>
      {answer && (
        <p className="tc-fbanswer">
          {!ok && <span className="tc-fblabel">Answer: </span>}
          <span lang="ja" className="tc-fbterm">{answer.term}</span>
          {answer.reading && answer.reading !== answer.term && <span lang="ja" className="tc-fbread">{answer.reading}</span>}
          {answer.meaning && <span className="tc-fbmean">{answer.meaning}</span>}
        </p>
      )}
      {open && explain && (
        <div className="tc-fbexplain">
          {explain.marks && explain.marks.some((m) => m.miss) && <Marked marks={explain.marks} />}
          {explain.lines.map((l, i) => <p key={i}>{l}</p>)}
          {extra}
        </div>
      )}
      <div className="tc-fbbtns">
        {explain && (
          <button type="button" className="tc-btn tc-fbexplainbtn" aria-expanded={open} onClick={toggle}>
            {open ? "Hide" : ok ? "Explain my answer" : "Explain my mistake"}
          </button>
        )}
        <button type="button" className={"tc-btn tc-btn-wide " + (ok ? "tc-btn-got" : "tc-btn-miss")}
                onClick={(e) => { e.stopPropagation(); onNext(); }}>
          {nextLabel || "Next →"}
        </button>
      </div>
    </div>
  );
}
