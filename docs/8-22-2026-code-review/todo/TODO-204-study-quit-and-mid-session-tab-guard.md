# TODO-204 — Add Quit to Study; guard against mid-session tab switches; keep session tabs mounted

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 3 I-1 (High), § Prioritised fix list #5; 06-architecture § 5 R7 / F-18
**Depends on:** none   **Blocks:** none

## Why
The tab row sits ~20px above the flashcard on a phone. A thumb slip onto any tab unmounts `Study` (tab content is chosen inline in the root render), which throws away the running session — queue, combo, first-try set, missed list, done screen — with no confirmation and no resume. Kana and Drill have a "Quit" chip; Study has none, so the *only* way out of a Study session is that destructive tab tap. `Input` also refetches `/videos.json` on every mount.

## Current behaviour (verified)
- Root render `JpnFlashcards.jsx:1472-1490`: `{!ready ? … : tab === "study" ? (<Study …/>) : tab === "freq" ? (<Freq/>) : … : (<Browse …/>)}` — conditional rendering, so switching tabs unmounts the previous tab.
- Study progress row L1948-1966 has Rōmaji / Pitch / Voice pills only; Kana has `<button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>` at L2761; ConjDrill at L5105.
- Study session state is local: `running`, `queue`, `pos`, `passed`, `firstTry`, `struggled`, `combo`, `prodSet`, `missRef` (L1499-1535). Individual grades are already persisted via `onResult` → `recordResult` (L1392-1439), so only the *session framing* is lost.
- `Input` L4587 `useEffect(() => { loadVideoIndex().then(setVideos); }, []);` — `loadVideoIndex` (L4196) caches its promise in `_videoPromise`, so the network fetch happens once per page load, not per mount; the cost per remount is only the state reset. (The report's "refetches on every mount" is therefore only the `cache:"no-cache"` first fetch; still, remounts reset `st`, `picks`, panels.)

## Intended behaviour
1. Study's progress row has a `Quit` chip identical to Kana/Drill that returns to the setup screen (`setRunning(false)`).
2. While a session is running in Study/Kana/Drill/Freq, tapping another tab shows a one-line confirm ("End this session? Your answers so far are saved.") — implemented as a tiny inline dialog in the header (no `window.confirm`, which is blocked in some PWAs), with "Keep going" focused by default and "Leave" as the secondary action.
3. (Optional, second commit) session tabs stay mounted and are hidden with `display:none` so coming back resumes exactly where the student left off; the confirm then becomes unnecessary for Study/Kana/Drill/Freq and is kept only as a "session in progress" pill that jumps back.

## Implementation steps
1. **Quit chip** — in Study's progress row (L1948-1966) add after `tc-progtext`:
   ```jsx
   <button className="tc-fchip" onClick={() => { stopJa(); setRunning(false); }}>Quit</button>
   ```
   (`stopJa` is in scope; mirrors Kana L2761.)
2. **Session-in-progress signal to the root.** Add a module-level mini-store next to `_syncState` (L1112-1118) — same pattern, no new dependency:
   ```js
   let _sessionBusy = false; const _busyWatchers = new Set();
   function setSessionBusy(b) { if (_sessionBusy === b) return; _sessionBusy = b; _busyWatchers.forEach((fn) => { try { fn(b); } catch (e) {} }); }
   function watchSessionBusy(fn) { _busyWatchers.add(fn); return () => _busyWatchers.delete(fn); }
   ```
   In Study add `useEffect(() => { setSessionBusy(running && !done); return () => setSessionBusy(false); }, [running, done]);` (after `done` is computed, L1723). Same one-liner in Kana (`view === "session"`), ConjDrill (`view === "session"` — check its state name around L5002-5060), Freq (`running && pos < queue.length`).
3. **Guarded tab switch** in the root (L1269+):
   ```jsx
   const [busy, setBusy] = useState(false);
   useEffect(() => watchSessionBusy(setBusy), []);
   const [pendingTab, setPendingTab] = useState(null);
   const go = (id) => { if (id === tab) return; if (busy) setPendingTab(id); else setTab(id); };
   ```
   Tabs call `onClick={() => go(id)}`. Render under the `<nav>`:
   ```jsx
   {pendingTab && (
     <div className="tc-leave" role="alertdialog" aria-label="End this session?">
       <span>End this session? Your answers so far are saved.</span>
       <button autoFocus className="tc-btn tc-btn-sm tc-btn-primary" onClick={() => setPendingTab(null)}>Keep going</button>
       <button className="tc-btn tc-btn-sm" onClick={() => { setTab(pendingTab); setPendingTab(null); }}>Leave</button>
     </div>
   )}
   ```
   CSS: `.tc-leave{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(216,72,47,.14);border:1px solid rgba(216,72,47,.4);border-radius:10px;padding:10px 12px;font-size:14px;}`. Add an `onKeyDown` Escape handler that cancels.
4. **(Optional) keep-mounted.** Replace the conditional chain with always-rendered panels: `<div hidden={tab !== "study"}><Study …/></div>` for study/kana/drill/freq only (Browse/Input/Scripts/Write can stay conditional). Verify the auto-speak effect in Study (L1537-1545) doesn't fire while hidden: add `if (!running || !voiceOn || !visible) return;` where `visible` is a prop. If this lands, the confirm in step 3 changes to a non-blocking pill "Session in progress — back to Study".

## Data migration / compatibility
none (session state is in memory only).

## Testing & verification
- Local server, 375×812: Study → Smart Review → grade 2 cards → tap **Browse** → inline confirm appears; "Keep going" returns; tap again → "Leave" → Browse opens. Back to Study: setup screen (step 3) or resumed card (step 4).
- Study → Quit chip visible; tapping returns to setup; TTS stops.
- Kana/Drill/Freq mid-session tab taps also confirm.
- Keyboard: Escape cancels the confirm; focus lands on "Keep going".
- Regression: `onResult` still records each grade (check Browse stats after a session).

## Acceptance criteria
- [ ] Study has a Quit chip in the progress row.
- [ ] No session is lost by a single tab tap; the confirm is keyboard-accessible.
- [ ] (If step 4 done) returning to Study resumes at the same card.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Do not use `window.confirm` — blocked/ugly in standalone PWAs and not styleable.
- Keep-mounted panels keep `useEffect`s alive: the Study `keydown` listener (L1764-1774) must bail when hidden (`if (!visible) return;` in the effect deps) or Space will flip a hidden card.
- TODO-220 (IA) will reshuffle the tabs; the `go()` guard should be the single entry point for tab changes so that work inherits it.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
