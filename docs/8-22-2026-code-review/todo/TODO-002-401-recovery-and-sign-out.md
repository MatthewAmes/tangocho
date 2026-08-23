# TODO-002 — Recover from 401 / expired sessions and add a working Sign out

**Priority:** P0   **Effort:** M   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 3.3 (HIGH), § 3.7 (listener growth, infinite GSI poll); 04-security-review § MEDIUM-3; 06-architecture § R3, F-17; 03-ui-ux § I-6 ("no sign-out anywhere")
**Depends on:** none   **Blocks:** TODO-001 (rotation needs this), TODO-019; TODO-218 (Theme C sign-in nudge) should reuse `watchAuthState`/`authStateNow` from here

## Why
When the Worker answers 401 (session expired after 730 days, or `SESSION_SECRET` rotated per TODO-001, or a tampered token), the client has no way out: `pullAndMergeCloud` returns `false` silently, `pushCloudNow` marks `jpn101:syncPending` and retries five times, and both `initGoogleAuth` and `renderGoogleButton` refuse to do anything while *any* token string sits in `jpn101:session`. Browse shows the "Signed in as …" branch whenever `_googleEmail` is truthy. The device displays "⚠ Not saved yet — will upload automatically" forever and never offers a sign-in button; only clearing site data fixes it. `signOutGoogle()` exists but has zero call sites, so there is also no manual escape hatch and no way to switch accounts.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1032-1044`:
  ```js
  function loadSession() { try { return window.localStorage.getItem(SESSION_KEY); } catch (e) { return null; } }
  function saveSession(session, email) { … }
  function signOutGoogle() {
    try { window.localStorage.removeItem(SESSION_KEY); window.localStorage.removeItem(USER_EMAIL_KEY); } catch (e) {}
    _googleEmail = null;
  }
  ```
  `signOutGoogle` is never called (grep confirms: only its definition at `:1041`).
- `:1047-1053` `gisReady()` polls `window.google?.accounts?.id` every 150 ms forever.
- `:1069-1086` `initGoogleAuth(onToken)` pushes `onToken` into `_googleTokenListeners` (never removed) and returns early `if (loadSession())`.
- `:1087-1092` `renderGoogleButton(el)` returns early `if (!el || loadSession())`.
- `:1125-1151` `pushCloudNow`: `if (!res.ok) throw new Error("save rejected: HTTP " + res.status);` → catch → `markSyncPending(); setSyncState("pending");` retry with backoff (max 5).
- `:1168-1183` `pullAndMergeCloud`: `if (!res.ok) return false;`.
- `:3922-3927` Browse:
  ```js
  const [googleEmail, setGoogleEmail] = useState(() => _googleEmail);
  const googleBtnRef = useRef(null);
  useEffect(() => {
    if (!googleEmail) renderGoogleButton(googleBtnRef.current);
    initGoogleAuth(() => setGoogleEmail(_googleEmail));
  }, [googleEmail]);
  ```
  and `:3966-3984` renders "Signed in as <b>{googleEmail}</b>" vs the button container.
- Worker: `cf/src/index.js:126` returns `json({ error: "invalid or expired session" }, 401)` for a bad Bearer; `:175` TTS miss returns 401 "sign-in required to generate new audio".

## Intended behaviour
- A 401 from `/api/sync` (GET or POST) is treated as "this session is dead": the token and email are removed, an `auth` state becomes `"expired"`, every watcher (Browse) re-renders, the Google button is rendered again with the text "Your sign-in expired — sign in again to keep syncing. Nothing on this device is lost." Local data and `jpn101:syncPending` are left intact so the existing post-sign-in chain re-pushes.
- A 401 from the TTS authed path does not sign the user out by itself (a cached-miss 401 is normal when not signed in), but if a session exists and TTS returns 401 it may call the same handler — optional; keep it to `/api/sync` to be safe.
- Browse has an explicit "Sign out" button next to "Signed in as …" that calls `signOutGoogle()`; after sign-out the app stays local-only (no network — see TODO-003) and shows the sign-in button.
- `initGoogleAuth` returns an unsubscribe function; Browse unsubscribes on cleanup. `gisReady` gives up after ~20 s (rejects) so offline/blocked GIS does not poll forever.
- `pushCloudNow` does not schedule retries after a 401 (retrying an auth failure is pointless and spams the Worker).

## Implementation steps
1. **Add an auth mini-store** next to the sync mini-store (after `signOutGoogle`, ~`:1044`):
   ```js
   let _authState = loadSession() ? "signed-in" : "signed-out";   // signed-in | signed-out | expired
   const _authWatchers = new Set();
   function setAuthState(s) { _authState = s; _authWatchers.forEach((fn) => { try { fn(s); } catch (e) {} }); }
   function watchAuthState(fn) { _authWatchers.add(fn); return () => _authWatchers.delete(fn); }
   function authStateNow() { return _authState; }
   function handleAuthFailure() {            // 401 from the sync API: the token is dead
     const had = !!loadSession();
     signOutGoogle();                         // removes token + email, nulls _googleEmail
     setAuthState(had ? "expired" : "signed-out");
   }
   ```
   Update `signOutGoogle` to also `setAuthState("signed-out")` when called directly (guard against recursion: have `handleAuthFailure` call a lower-level `clearSessionStorage()` that both use), and update `exchangeForSession` (`:1054-1068`) to `setAuthState("signed-in")` after `saveSession`.
2. **Make `initGoogleAuth` idempotent per callback and not depend on `loadSession()` at call time**:
   ```js
   function initGoogleAuth(onToken) {
     if (onToken) _googleTokenListeners.push(onToken);
     const unsubscribe = () => { _googleTokenListeners = _googleTokenListeners.filter((fn) => fn !== onToken); };
     if (loadSession()) return unsubscribe;
     gisReady().then(() => { …existing initialize block… }).catch(() => {});
     return unsubscribe;
   }
   ```
   `renderGoogleButton` keeps its `loadSession()` guard (after `handleAuthFailure` the token is gone, so it renders). Make `gisReady` give up:
   ```js
   function gisReady() {
     if (_gisReadyPromise) return _gisReadyPromise;
     _gisReadyPromise = new Promise((resolve, reject) => {
       const t0 = Date.now();
       (function check() {
         if (window.google?.accounts?.id) resolve();
         else if (Date.now() - t0 > 20000) { _gisReadyPromise = null; reject(new Error("gsi not loaded")); }
         else setTimeout(check, 150);
       })();
     });
     return _gisReadyPromise;
   }
   ```
   and add `.catch(() => {})` to every `gisReady().then(...)` call (`:1074`, `:1089`).
3. **Handle 401 in the two network paths.** In `pullAndMergeCloud` (`:1172`):
   ```js
   if (res.status === 401) { handleAuthFailure(); return false; }
   if (!res.ok) return false;
   ```
   In `pushCloudNow` (`:1136`):
   ```js
   if (res.status === 401) { handleAuthFailure(); markSyncPending(); setSyncState("pending"); return false; }   // keep the flag; do NOT retry
   if (!res.ok) throw new Error("save rejected: HTTP " + res.status);
   ```
   (With TODO-003, `pushCloudNow`/`pullAndMergeCloud` return early when there is no session, so the retry loop does not fire for signed-out devices.)
4. **Browse UI** (`:3922-3927` and `:3964-3985`): subscribe to auth state instead of a one-shot `useState(() => _googleEmail)`:
   ```js
   const [googleEmail, setGoogleEmail] = useState(() => _googleEmail);
   const [authState, setAuthStateUi] = useState(authStateNow);
   useEffect(() => watchAuthState((s) => { setAuthStateUi(s); setGoogleEmail(_googleEmail); }), []);
   const googleBtnRef = useRef(null);
   useEffect(() => {
     if (!googleEmail) renderGoogleButton(googleBtnRef.current);
     return initGoogleAuth(() => setGoogleEmail(_googleEmail));   // returns unsubscribe → effect cleanup
   }, [googleEmail]);
   ```
   Render: when `googleEmail` → keep the existing block and add
   `<button className="tc-btn tc-btn-sm" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => { signOutGoogle(); }}>Sign out</button>`.
   When `!googleEmail` → before the button container, if `authState === "expired"` show
   `<p className="tc-conjnote" style={{ marginTop: 0 }}>⚠ Your sign-in expired — sign in again to keep syncing. Nothing on this device is lost{hasSyncPending() ? ", and unsaved progress will upload as soon as you do" : ""}.</p>`.
   Note `renderGoogleButton` must run again after expiry: because `googleEmail` flips to `null`, the `[googleEmail]` effect re-runs and the guard `loadSession()` is now false, so the button renders. GIS `initialize` was already done once (`_googleInitDone`), and the callback exchanges a new token and fires the listeners — including the root's `loadCardsAndSync` (`:1353-1355`). But that root effect registered only `if (!loadSession())` at mount; after an expiry mid-session it is *not* registered. Fix: in the root component, register unconditionally and keep the unsubscribe:
   ```js
   useEffect(() => initGoogleAuth(loadCardsAndSync), [loadCardsAndSync]);   // returns unsubscribe
   ```
   (`initGoogleAuth` still skips the GIS init when a session exists, so this is cheap.)
5. **Sign-out semantics**: `signOutGoogle()` only clears the local token/email and sets auth state. Do not clear decks or `jpn101:syncPending`. After sign-out, `pushCloudNow`/`pullAndMergeCloud` must no-op (TODO-003). Also reset `setSyncState("idle")` on sign-out so Browse does not keep showing "Saving…".
6. Rebuild and deploy: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; commit `index.html`.

## Data migration / compatibility
None. Existing tokens keep working until they 401. `jpn101:userEmail` removal on expiry only affects the "Signed in as" label.

## Testing & verification
- Manual (local, `cd cf && npx wrangler dev` with a throwaway `SESSION_SECRET` in `cf/.dev.vars`): sign in (requires the dev origin to be allowed on the OAuth client; if not, test the 401 path by editing `localStorage["jpn101:session"]` to `"x.y"` in devtools) → reload → Browse shows the expired notice and the Google button; study a card → "Not saved yet" pending; sign in → pending clears and the card arrives on another device/tab.
- Manual: click "Sign out" → Browse shows the button; no `/api/sync` requests appear in the Network tab afterwards (with TODO-003); sign back in → progress intact.
- Manual: block `accounts.google.com` in devtools → `gisReady` rejects after 20 s; no infinite polling in the Performance tab; no console errors.
- Unit: none required; functions are DOM-bound. (If Theme C's module split lands, add a test that `handleAuthFailure` clears the token and sets `"expired"`.)
- Prod: after deploy, in devtools set `localStorage["jpn101:session"]="bad.token"` and reload → expired notice appears; sign in → synced.

## Acceptance criteria
- [ ] A 401 from `/api/sync` clears the token, shows the sign-in button with an "expired" explanation, and keeps local data + pending flag.
- [ ] After re-sign-in, pending progress is pushed without a reload.
- [ ] "Sign out" exists in Browse, works, and leaves the app usable locally.
- [ ] `pushCloudNow` does not retry on 401.
- [ ] `_googleTokenListeners` does not grow on Browse re-renders (unsubscribe on cleanup); `gisReady` gives up after ~20 s.

## Pitfalls / notes
- Do not call `signOutGoogle()` on a *network* failure or 5xx — only on 401. A 5xx is the Worker's problem; keep retrying.
- Do not wipe `jpn101:syncPending` or any `jpn101:*` study key on sign-out/expiry; "progress is sacred".
- The Google button is only rendered in Browse; the root post-sign-in effect must stay registered (step 4) or a mid-session expiry never re-pulls.
- `initGoogleAuth`'s `_googleInitDone` stays true across sign-outs; GIS `initialize` must not be called twice (it would warn/ignore). The callback still fires for a new sign-in.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
