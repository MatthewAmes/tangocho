import React, { useState, useRef, useEffect } from "react";
import { toKana } from "../../tools/romaji.mjs";
import { slipOf, slipMarks, confusedWith } from "../../tools/nearmiss.mjs";
import { acceptedForms, normalise, glossOf } from "../../tools/benchmark.mjs";
import { speakJa } from "../lib/tts.js";

/* ── the checkpoint follow-up ──
   Attempt, then support, then retry — for each word the checkpoint caught.

   1. ASK it cold again, English in, Japanese out, same as the checkpoint. Some of these
      come back on the second try, and a word that does has shown it was a slip, not a gap.
   2. If not, SHOW the word with exactly the sounds that went wrong highlighted, name the
      slip ("the small っ"), and play it. When what was typed is another deck word, show the
      two side by side, because that is a confusion to separate, not a word to drill.
   3. Then RETRY with the answer hidden. Seeing the answer and copying it proves nothing;
      producing it from memory seconds later is the retrieval that actually makes it stick.

   A word counts as fixed when it is produced correctly, first try or retry. Every attempt
   is recorded through the normal answer path, so these words enter the ordinary review
   schedule from here — the retry is a relearning step, not a new review. */

const kanaOf = (v) => { try { return toKana(String(v || "").trim()); } catch (e) { return String(v || "").trim(); } };
const rightFor = (card, kana) => acceptedForms(card).has(normalise(kana));

function Marked({ got, want }) {
  return (
    <span className="tc-nmword" lang="ja">
      {slipMarks(got, want).map((m, i) => (
        <span key={i} className={m.miss ? "is-miss" : undefined}>{m.ch}</span>
      ))}
    </span>
  );
}

export default function NearMiss({ items = [], cards = [], onAnswer, onFinish }) {
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState("ask");      // ask | show | retry | right | missed | done
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState("");          // the kana of the first attempt
  const [fixed, setFixed] = useState([]);
  const t0 = useRef(Date.now());
  const inputRef = useRef(null);

  const item = items[at];
  useEffect(() => {
    t0.current = Date.now();
    if ((phase === "ask" || phase === "retry") && inputRef.current) inputRef.current.focus();
  }, [at, phase]);

  if (!items.length) return null;

  if (phase === "done") {
    const n = fixed.length;
    return (
      <section className="tc-plansec">
        <h2 className="tc-planh">Follow-up done <span className="tc-planh-sub">{n} of {items.length} fixed</span></h2>
        <p className="tc-planhint" style={{ marginTop: 0 }}>
          {n === items.length
            ? "Every one of them came back. They're in your normal reviews now, so you'll see them again before they can slip."
            : `${items.length - n} still need work. All ${items.length} are in your normal reviews now, and the ones you missed come back soonest.`}
        </p>
        <div className="tc-checkrow"><button className="tc-btn" onClick={() => onFinish && onFinish(fixed)}>Done</button></div>
      </section>
    );
  }

  const card = item.card;
  const ms = () => Date.now() - t0.current;
  const firstTry = phase === "ask";

  const check = (raw = typed) => {
    const kana = kanaOf(raw);
    const ok = rightFor(card, kana);
    if (onAnswer) onAnswer(item, ok, ms(), firstTry, kana);
    setTyped("");
    if (ok) {
      setFixed((f) => [...f, card.id]);
      setPhase("right");
      speakJa(item.want, 0.9);
    } else if (firstTry) {
      setTried(kana);
      setPhase("show");
      speakJa(item.want, 0.85);
    } else {
      setTried(kana);
      setPhase("missed");
    }
  };

  const next = () => {
    setTyped(""); setTried("");
    if (at + 1 >= items.length) setPhase("done");
    else { setAt(at + 1); setPhase("ask"); }
  };

  /* The slip is judged on the attempt just made when there was one, else on what was
     written at the checkpoint — the freshest evidence of what is actually in their head. */
  const basis = tried || item.got;
  const other = basis === item.got ? item.other : confusedWith(basis, card, cards);
  const slip = slipOf(basis, item.want, other);

  const input = (
    <>
      <input
        ref={inputRef}
        aria-label="Your answer"
        className="tc-checkin"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return;
          if (e.key === "Enter") { e.preventDefault(); check(); }
        }}
        placeholder="type in rōmaji"
        autoComplete="off" autoCorrect="off" spellCheck={false}
      />
      <div className="tc-checkkana">{typed.trim() ? kanaOf(typed) : "　"}</div>
    </>
  );

  return (
    <section className="tc-plansec">
      <h2 className="tc-planh">Almost had them <span className="tc-planh-sub">{at + 1} of {items.length}</span></h2>
      <div className="tc-checkq">{glossOf(card)}</div>
      {item.got && firstTry && (
        <p className="tc-planhint">At the checkpoint you wrote <span lang="ja">{item.got}</span>.</p>
      )}

      {firstTry && (
        <>
          {input}
          <div className="tc-checkrow">
            <button className="tc-btn" onClick={() => check()}>Check</button>
            <button className="tc-btn tc-btn-quiet" onClick={() => check("")}>Show me</button>
          </div>
        </>
      )}

      {(phase === "show" || phase === "missed") && (
        <div className="tc-nmshow">
          <div className="tc-nmanswer">
            <span className="tc-checkterm" lang="ja">{card.term}</span>
            <Marked got={basis} want={item.want} />
            <button className="tc-btn tc-btn-sm tc-btn-quiet" aria-label="Hear it" onClick={() => speakJa(item.want, 0.85)}>🔊</button>
          </div>
          {basis && <p className="tc-nmgot">You wrote <span lang="ja">{basis}</span></p>}
          {slip.note && <p className="tc-nmnote">{slip.note}</p>}
          {other && (
            <div className="tc-nmpair" aria-label="The two words side by side">
              <div><span lang="ja">{card.term}</span><span lang="ja">{item.want}</span><span>{glossOf(card)}</span></div>
              <div><span lang="ja">{other.term}</span><span lang="ja">{other.reading || other.term}</span><span>{glossOf(other)}</span></div>
            </div>
          )}
          {phase === "show" ? (
            <div className="tc-checkrow">
              <button className="tc-btn" onClick={() => setPhase("retry")}>Now from memory</button>
            </div>
          ) : (
            <>
              <p className="tc-planhint">Not yet — it's in your reviews now and comes back soon.</p>
              <div className="tc-checkrow"><button className="tc-btn" onClick={next}>Next</button></div>
            </>
          )}
        </div>
      )}

      {phase === "retry" && (
        <>
          <p className="tc-planhint">Type it without looking.</p>
          {input}
          <div className="tc-checkrow"><button className="tc-btn" onClick={() => check()}>Check</button></div>
        </>
      )}

      {phase === "right" && (
        <div className="tc-nmshow">
          <p className="tc-nmright">✓ <span className="tc-checkterm" lang="ja">{card.term}</span> <span lang="ja">{item.want}</span></p>
          <div className="tc-checkrow"><button className="tc-btn" onClick={next}>Next</button></div>
        </div>
      )}
    </section>
  );
}
