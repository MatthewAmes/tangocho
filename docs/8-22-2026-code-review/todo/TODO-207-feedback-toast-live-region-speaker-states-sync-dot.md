# TODO-207 — Feedback layer: toast slot, live-region announcements, speaker playing/failed states, header sync dot

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 3 I-3 (Medium), § 5 A-5 (Medium), A-11; § Prioritised fix list #12; 06-architecture § 4.8 (`liveRef` dead)
**Depends on:** TODO-206 (card/tools restructure)   **Blocks:** TODO-216 (undo toasts reuse this slot)

## Why
Every failure in the app is silent: 14 TTS 404s in the local run produced no on-screen indication, the 🔊 button has no playing/failed state, sync status lives only behind Browse › scroll, grades are never announced to assistive tech (the `aria-live` region exists but is never written), and the Input "Logged N min" flash is an ad-hoc local state. A single toast slot + a tiny event bus gives every tab one consistent, accessible way to say "Saved", "Audio unavailable on this device", "Not saved yet — retrying".

## Current behaviour (verified)
- `liveRef` declared L1528 `const liveRef = useRef(null);`, rendered L2037 `<div ref={liveRef} aria-live="polite" className="tc-sr" />` — never written (`grep -c liveRef` → 2, both shown).
- TTS chain L3394-3436 (`speakJa` → `speakJaAuthed` → `speakJaFallback`): all failures swallowed; `SpeakBtn` L3443-3449 has no state; `TTS_OK` L3353 only means `speechSynthesis` exists. "🔊 Voice on" pill shown regardless (L1962-1965).
- Sync state: mini-store `_syncState`/`watchSyncState` L1112-1118; rendered only in Browse L3964-3978 (`SYNC_UI` L3815-3820).
- Input flash: `const flash = (m) => { setNote(m); setTimeout(…2600) }` L4581, rendered L4890 `<p className="tc-innote">`.
- Grading: `grade()` L1735-1761 gives no feedback beyond the card advancing.

## Intended behaviour
- A module-level `flash(message, {kind, ms})` bus + one `<Toast/>` component mounted once in `.tc-shell` (bottom, above safe-area), `role="status"` (polite). Visible ≤ 2.6 s, max one at a time (newest wins).
- A visually-hidden `aria-live="polite"` region inside `<Toast/>` that also receives short announcements ("Got it", "Missed", "Session complete").
- `SpeakBtn` shows `.is-playing` (pulse) while audio plays and `.is-failed` (strike-through, `aria-label="Audio unavailable"`) if both the cached and authed paths failed; the *first* hard failure per page load flashes "Audio unavailable right now — using the device voice" (or "…no voice on this device" when `!TTS_OK`).
- Header: a small sync dot next to the wordmark (green idle/saved, amber saving, red pending) with `title` + `aria-label` text from `SYNC_UI`, tappable → Browse. Hidden when not signed in.

## Implementation steps
1. **Bus + component** (new section near `_syncState`, L1112):
   ```js
   const _toastWatchers = new Set(); let _toastSeq = 0;
   function flash(text, opts = {}) { const t = { id: ++_toastSeq, text, kind: opts.kind || "info", ms: opts.ms || 2600 }; _toastWatchers.forEach((fn) => fn(t)); }
   function announce(text) { flash(text, { kind: "sr", ms: 1000 }); }   // live-region only
   function Toast() {
     const [t, setT] = useState(null); const [sr, setSr] = useState("");
     useEffect(() => { const fn = (x) => { if (x.kind === "sr") { setSr(""); setTimeout(() => setSr(x.text), 30); return; } setT(x); }; _toastWatchers.add(fn); return () => _toastWatchers.delete(fn); }, []);
     useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), t.ms); return () => clearTimeout(id); }, [t]);
     return (<>
       <div className="tc-sr" aria-live="polite">{sr || (t ? t.text : "")}</div>
       {t && <div className={"tc-toast is-" + t.kind} role="status">{t.text}</div>}
     </>);
   }
   ```
   CSS: `.tc-toast{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(92vw,420px);background:rgba(20,26,51,.96);color:var(--washi);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 14px;font-size:14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);z-index:100;animation:tc-toastin .18s ease-out;} .tc-toast.is-warn{border-color:rgba(230,162,60,.5);} .tc-toast.is-error{border-color:rgba(216,72,47,.55);} @keyframes tc-toastin{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}`.
   Mount `<Toast />` as the last child of `.tc-shell` (after the tab content, ~L1491). Remove `liveRef` (L1528, L2037).
2. **Grades/session** — in Study `grade()` (L1735) add `announce(got ? "Got it" : "Missed");` after `onResult(...)`; when `done` becomes true add `announce("Session complete")` (in the existing debrief effect L1725 or a new one). Same one-liners in Kana `record`, Drill `grade`, Freq `grade`.
3. **Input flash** — replace `flash`/`note` (L4581, L4890) with the global `flash(...)` (rename the local to avoid shadowing).
4. **Speaker states** — in the TTS module add a tiny store `let _ttsStatus = "idle"; const _ttsWatchers = new Set();` set to `"playing"` in `speakJa` before `play()`, `"idle"` on `ended`/`stopJa`, `"failed"` inside `speakJaFallback` when `!TTS_OK`, and `"fallback"` when the fallback voice is used. Wire `_ttsAudioEl.onended = () => setTtsStatus("idle")` (L3402 area). `SpeakBtn` subscribes (`useEffect` + `useState`) and renders `className={"tc-speakbtn" + (status === "playing" ? " is-playing" : status === "failed" ? " is-failed" : "")}` with `aria-label` "Hear pronunciation" / "Playing" / "Audio unavailable". On the first `"failed"`/`"fallback"` per page load call `flash("Audio unavailable right now — using the device voice", {kind:"warn"})` (module flag `let _ttsWarned = false`). CSS: `.tc-speakbtn.is-playing{animation:tc-pulse 1s ease-in-out infinite;} .tc-speakbtn.is-failed{text-decoration:line-through;opacity:.5;} @keyframes tc-pulse{50%{transform:scale(1.15)}}` (guarded by the existing reduced-motion rule).
5. **Header sync dot** — in the root header (L1455-1462) after the wordmark:
   ```jsx
   {googleEmailNow() && <button className={"tc-syncdot is-" + syncState} onClick={() => go("browse")} aria-label={"Sync: " + SYNC_UI[syncState].label} title={SYNC_UI[syncState].label} />}
   ```
   with `const [syncState, setSyncStateUi] = useState(syncStateNow); useEffect(() => watchSyncState(setSyncStateUi), []);` in the root, and a helper `function googleEmailNow() { return _googleEmail; }` (L1045). CSS: `.tc-syncdot{width:12px;height:12px;border-radius:50%;border:0;padding:0;margin-left:10px;vertical-align:middle;cursor:pointer;box-shadow:0 0 6px currentColor;} .tc-syncdot.is-idle,.tc-syncdot.is-saved{background:#3ddc84;color:#3ddc84;} .tc-syncdot.is-saving{background:#ffd166;color:#ffd166;} .tc-syncdot.is-pending{background:#ff8a7a;color:#ff8a7a;}` — give it a 44px hit area via `::after{inset:-16px}` like `.tc-speakbtn`. `SYNC_UI` is defined at L3815, after the root component; hoist it above `JpnFlashcards` (it is a plain const).
6. Rebuild.

## Data migration / compatibility
none

## Testing & verification
- Local server (TTS 404s locally — a perfect test): Study → Smart Review → the first card auto-speaks → toast "Audio unavailable right now — using the device voice" appears once; 🔊 shows strike-through or pulse.
- Grade a card with VoiceOver on: "Got it"/"Missed" announced; "Session complete" announced at the end.
- Input → Log → verdict chip → toast "Logged 15 min" (text unchanged from today's `flash`).
- Sign in (prod) → header dot green; go offline → grade → dot turns red, tap → Browse opens to the sync box.
- `document.querySelectorAll('[aria-live]').length === 1`.

## Acceptance criteria
- [ ] One `<Toast/>` + one `aria-live` region; `liveRef` removed.
- [ ] Grades and session completion announced; Input uses the shared toast.
- [ ] Speaker button has playing/failed states; first TTS failure shows a toast.
- [ ] Header sync dot reflects `_syncState`, tappable, hidden when signed out.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Keep toasts ≤ 1 at a time and ≤ 2.6 s; never use them for errors that need action (those stay inline, e.g. the storage banner L1449).
- `_toastWatchers` is module-level state (same pattern as `_syncWatchers`) — in TODO-223 it moves to `src/lib/ui-bus.js`.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
