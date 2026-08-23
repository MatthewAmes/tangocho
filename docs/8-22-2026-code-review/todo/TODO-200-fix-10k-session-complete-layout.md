# TODO-200 — Fix the broken 10k (Freq) "session complete" screen

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 2 L-1 (High), § Prioritised fix list #1; § Appendix A "10k done: broken"
**Depends on:** none   **Blocks:** none

## Why
Every day the student finishes the 10k quota they land on a screen where `セッション終了！` is rendered one character per line in a 50px column and the two buttons become ~400px-tall slabs. The Freq component reuses the `.tc-summary` class, which is the *horizontal* Browse stat strip (`display:flex`), wraps its stats in `.tc-sumgrid`, which is never defined, and uses a bare `<h2>` that has no style. It is the single most visible layout bug in b59 and is a 10-line fix.

## Current behaviour (verified)
- `JpnFlashcards.jsx:5545-5556` (inside `Freq`, the `if (pos >= queue.length)` branch):
  ```jsx
  <div className="tc-summary">
    <h2>セッション終了！</h2>
    <div className="tc-sumgrid">
      <div className="tc-sumitem"><b>{pct}%</b><span>accuracy</span></div>
      <div className="tc-sumitem"><b>{right}/{total}</b><span>correct</span></div>
      <div className="tc-sumitem"><b>{todayNew}/{quota}</b><span>new today</span></div>
    </div>
    <div className="tc-gradebtns">
      <button className="tc-btn" onClick={() => { setRunning(false); }}>Back</button>
      <button className="tc-btn" onClick={freeStart}>Extra practice</button>
    </div>
  </div>
  ```
- `JpnFlashcards.jsx:5895` `.tc-summary{display:flex;gap:8px;margin-bottom:12px;}` — the Browse stat-strip style (used at L3957-3962 by Browse).
- `.tc-sumgrid` — **zero** CSS definitions (confirmed with the used-vs-defined script: `tc-sumgrid` is in the "USED BUT UNDEFINED" list).
- `.tc-sumitem` L5896-5898 is styled for the Browse strip (`flex:1; ... span{font-size:10px}`).
- The Study done screen pattern that already works: L1919-1938 `<div className="tc-done"><p className="tc-eyebrow">Session complete</p><div className="tc-bignum">…</div><p className="tc-donesub">…</p><div className="tc-donebtns">…</div></div>` with CSS `.tc-done` L5768-5773.

## Intended behaviour
The Freq done screen looks like the Study/Kana done screens: a centred card, "Session complete" eyebrow, big percentage, a one-line summary (`12/15 correct · 15/15 new today`), and two full-width-ish buttons side by side that wrap on narrow phones. No Japanese-only heading (keep the UI English-led like every other screen; see TODO-209 copy rules). `.tc-summary` stays the Browse strip, untouched.

## Implementation steps
1. In `JpnFlashcards.jsx` replace the block at L5545-5556 with the Study-done markup:
   ```jsx
   <div className="tc-done">
     <p className="tc-eyebrow">Session complete</p>
     <div className="tc-bignum">{pct}<span>%</span></div>
     <p className="tc-donesub">{right}/{total} correct · {todayNew}/{quota} new today</p>
     <div className="tc-donebtns">
       <button className="tc-btn" onClick={() => { setRunning(false); }}>Back</button>
       <button className="tc-btn tc-btn-primary" onClick={freeStart}>Extra practice</button>
     </div>
   </div>
   ```
   (`pct`, `right`, `total`, `todayNew`, `quota`, `freeStart`, `setRunning` are all already in scope — see L5541-5544 and L5388-5400.)
2. Do NOT add a `.tc-sumgrid` rule or touch `.tc-summary` (Browse depends on it). If you prefer to keep the three-stat layout instead of the one-liner, wrap the three `.tc-sumitem`s in `<div className="tc-summary" style={{justifyContent:"center"}}>` *inside* `.tc-done` — that reuses the strip style correctly.
3. Rebuild: `cd tools && npm install && node build.mjs` (writes `index.html` and `cf/public/`).

## Data migration / compatibility
none

## Testing & verification
- Local: `python3 -m http.server 8765` from the repo root → open `http://localhost:8765/` at 375×812 in the in-app browser → tab **10k** → "Start session" → answer all 15 cards (Reveal → Got it/Missed it). The done screen must render as a centred card; `document.querySelector('.tc-done h2')` is null; `getBoundingClientRect()` of the two buttons is < 60px tall; no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).
- Also check 320×568 (buttons wrap, stay readable) and 1280×800.
- Browse tab still shows the 4-stat strip (`.tc-summary`) unchanged.
- Prod: after `cd cf && npx wrangler deploy`, repeat on the phone.

## Acceptance criteria
- [ ] Freq done screen uses `.tc-done` markup; `tc-sumgrid` no longer appears in `JpnFlashcards.jsx` (`grep -c tc-sumgrid JpnFlashcards.jsx` → 0).
- [ ] No `<h2>` in the Freq done branch; eyebrow reads "Session complete".
- [ ] Buttons ≤ 60px tall at 375px; Browse stat strip unaffected.
- [ ] `index.html` rebuilt and committed together with the JSX change.

## Pitfalls / notes
- `index.html` is a committed build artifact: always `cd tools && npm install && node build.mjs`, then commit both files, then `cd ../cf && npx wrangler deploy`.
- TODO-209 (grade-button/idiom unification) later makes "Extra practice" vs "Back" consistent with other done screens; the primary-button choice here already matches that direction.
- If TODO-226 (SessionSummary component) lands first, implement this by reusing that component instead.
