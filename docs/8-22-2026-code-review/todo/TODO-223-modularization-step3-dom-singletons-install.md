# TODO-223 — Modularization step 3: DOM-touching singletons become modules with explicit `install()` (`storage`, `sync`, `auth`, `tts`, `days`, `video-index`, `ui-bus`)

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 3.4 (implicit global state table), § 9.3 step 3, § 9.1 target tree `lib/storage.js … lib/video-index.js`, F-1, F-17
**Depends on:** TODO-222, TODO-212   **Blocks:** TODO-224, TODO-231 (Worker tests reuse `merge.js` fixtures)

## Why
After steps 1–2 the remaining non-UI code is the infrastructure that talks to `window`/`localStorage`/`Audio`/`fetch`: ~20 module-level mutable variables (`mem`, `_syncState`, `_syncWatchers`, `_retryTimer`, `_cloudPushTimer`, `_googleEmail`, `_gisReadyPromise`, `_googleTokenListeners`, `retentionTarget`, `_days`, `JP_VOICE`, `_ttsAudioEl`, `_ttsObjectUrl`, `_ttsToken`, `_videoPromise`, plus the toast bus from TODO-207) read by 8 components. Grouping them into modules with an explicit `install(window)` keeps the same behaviour, documents the pattern, and makes each piece importable in Node with a stub.

## Current behaviour (verified)
- Storage: `mem`, `sGet`, `sSet` L869-895 (`sSet` calls `scheduleCloudPush()` for `jpn101:*` keys not in `SYNC_SKIP_KEYS`, L893); `window.storage` branches L871-876, L882-885 (artifact-era; never present on the site).
- Sync: `SYNC_ENDPOINT`, `collectLocalSnapshot` L926-935; `_syncState`/watchers L1112-1118; `markSyncPending/clearSyncPending/hasSyncPending` L1119-1121; `pushCloudNow` L1124-1151; `scheduleCloudPush` L1152-1156; listeners L1157-1166 (moved into `installBrowserSideEffects()` by TODO-212); `pullAndMergeCloud` L1168-1183 (writes `localStorage` directly, L1177-1178).
- Auth: `GOOGLE_CLIENT_ID`, `SESSION_KEY`, `USER_EMAIL_KEY`, `loadSession`, `saveSession`, `signOutGoogle`, `_googleEmail`, `gisReady`, `exchangeForSession`, `initGoogleAuth` (pushes to `_googleTokenListeners`, never removed — F-17), `renderGoogleButton`, `syncRequestOptions` L1022-1102.
- Days/retention: `RETENTION_KEY`, `retentionTarget`, `setRetention` L1193-1202; `DAYS_KEY`, `_days`, `loadDays`, `logDay` L1204-1217 (Browse restore assigns `_days = cur` directly ~L3902).
- TTS: `TTS_ENDPOINT`, `TTS_OK`, `JP_VOICE`, `pickJpVoice`, `ttsUnlock`, `speakJaFallback`, `prefetchJa`, `speakJa`, `speakJaAuthed`, `stopJa`, `SpeakBtn` L3352-3449.
- Video index: `VIDEOS_URL`, `VIDEOS_CACHE`, `_videoPromise`, `loadVideoIndex` L4194-4215 (+ `unpackVideos` moved in 222).

## Intended behaviour
```
src/lib/storage.js      mem, sGet, sSet(key, value, {onSynced}) — no direct import of sync; instead `storage.onWrite(fn)` hook that sync.js registers; loadJSON(key, fallback) helper; STORAGE_KEYS registry (string constants for every jpn101:* key)
src/lib/sync.js         state store (setSyncState/watchSyncState/syncStateNow), pending flag, pushCloudNow, scheduleCloudPush, pullAndMergeCloud, installSyncListeners(win = window)
src/lib/auth.js         session load/save/signOut, googleEmailNow(), gisReady, exchangeForSession, initGoogleAuth(cb) → returns unsubscribe, renderGoogleButton, syncRequestOptions
src/lib/days.js         (+) loadDays, logDay, resetDaysCache() — pure streakFrom/mascotState already here
src/lib/retention.js    getRetention(), setRetention(), loadRetention()   (or fold into schedule.js)
src/lib/tts.js          everything TTS except the React SpeakBtn (→ components/SpeakBtn.jsx in TODO-225); installTts(win) does voice discovery; status store for TODO-207
src/lib/video-index.js  loadVideoIndex
src/lib/ui-bus.js       flash/announce + watcher set (TODO-207)
main.jsx                installSyncListeners(window); installTts(window); loadRetention(); then mount
```
Import order of side effects preserved: `main.jsx` calls the installs synchronously before `createRoot`.

## Implementation steps
1. Create the modules by cutting the blocks above verbatim. Break the circular import between storage and sync: in `storage.js` export `const _writeHooks = new Set(); export function onStorageWrite(fn) { _writeHooks.add(fn); }` and call hooks in `sSet` where `scheduleCloudPush()` was; in `sync.js` at module top `onStorageWrite((key) => { if (key.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(key)) scheduleCloudPush(); });` — pure registration, no DOM.
2. Delete the `window.storage` branches (L871-876, L882-885, and the self-test branch L1299-1303) — the API never exists on the deployed site (report 05 § 7); `sGet`/`sSet` become `localStorage` + `mem`. Update the stale header comment (`JpnFlashcards.jsx:4-5` "Cards are saved with window.storage").
3. `auth.js`: make `initGoogleAuth(cb)` return `() => _googleTokenListeners.delete(cb)` (use a `Set`), and have Browse's effect (~L3911-3914) return that unsubscribe (fixes F-17 leak). `gisReady` (L1047-1052) gets a give-up after 20 s (report 01 § 3.7) — optional, one line.
4. `days.js`: export `resetDaysCache()` (`_days = null`) and call it from `pullAndMergeCloud` after writing merged keys and from Browse restore instead of assigning `_days` directly (report 01 § 1.4 minimal mitigation; the full cache-invalidation design is Theme A's).
5. Every module has a `// @ts-check`-free but clear header: what it owns, which storage keys, which globals; STORAGE_KEYS registry in `storage.js`:
   ```js
   export const K = { deck: "jpn101:deck", deckVersion: "jpn101:deckVersion", days: "jpn101:days", kana: "jpn101:kana", conj: "jpn101:conj", freq: "jpn101:freq", freqVersion: "jpn101:freqVersion", freqQuota: "jpn101:freqQuota", freqSnapshot: "jpn101:freqSnapshot", scripts: "jpn101:scripts", scriptsMirror: "jpn101:scripts:mirror", input: "jpn101:input", hooks: "jpn101:hooks", retention: "jpn101:retention", lastBackup: "jpn101:lastBackup", oralAttempts: "jpn101:oralAttempts", videoIndex: "jpn101:videoIndex", session: "jpn101:session", userEmail: "jpn101:userEmail", syncPending: "jpn101:syncPending", syncLastPulled: "jpn101:syncLastPulled", syncCode: "jpn101:syncCode", snapshot: "jpn101:snapshot", ping: "jpn101:ping" };
   ```
   and replace string literals progressively (grep `"jpn101:` — 61 occurrences). TODO-232's invariant check asserts every literal in the app appears in `K`.
6. `main.jsx`: `import { installSyncListeners } from "./src/lib/sync.js"; import { installTts } from "./src/lib/tts.js"; import { loadRetention } from "./src/lib/retention.js"; installSyncListeners(window); installTts(window); loadRetention();` replacing `installBrowserSideEffects()`.
7. Build, check (bundle will now differ slightly — new module boundaries), `npm test`, manual smoke.

## Data migration / compatibility
none; storage keys unchanged. Removing `window.storage` support changes nothing on the deployed site.

## Testing & verification
- `node -e 'import("./src/lib/sync.js").then(m=>console.log(Object.keys(m)))'` works with no DOM (no install called).
- `test/storage.test.mjs` (new, 3 tests): `sSet` falls back to `mem` when `globalThis.localStorage` is undefined; `onStorageWrite` fires for `jpn101:x`; `loadJSON` returns fallback on bad JSON. (Stub `globalThis.localStorage` with a Map-backed object in the test.)
- Manual smoke (local + prod): sign-in, sync banner states, offline→online retry, TTS auto-voice + button, retention chip persistence, Input video list, restore a backup (days shown correctly without reload).
- `npm run check` after rebuild; bundle size within ±2 KB.

## Acceptance criteria
- [ ] No `window`/`localStorage`/`Audio` access at import time anywhere under `src/lib/`; all installs called from `main.jsx`.
- [ ] `window.storage` branches removed; `initGoogleAuth` returns an unsubscribe; `_days` has a reset path.
- [ ] `STORAGE_KEYS` registry exists and is used for at least the sync/merge code.
- [ ] `index.html` rebuilt + committed; manual smoke checklist in the commit body.

## Pitfalls / notes
- Keep the order: sync listeners + TTS voice discovery + retention load before `createRoot` — the Study setup reads `retentionTarget` on first render.
- `sSet` is `async` and awaited in places; keep signatures.
- Theme A's sync hardening (`SYNC_SKIP_KEYS`, 401 recovery, pull-before-push) lands in `sync.js`/`auth.js` — do this move first or coordinate so their diff applies to the new files.
