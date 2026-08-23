# TODO-004 — Stop syncing the session token, email, video-index cache and sync bookkeeping keys

**Priority:** P1   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 3.2 (secondary effects a-c); 04-security-review § LOW-10; 05-expansion § QW-3; 06-architecture § 6.2, F-8
**Depends on:** none (pairs naturally with TODO-003)   **Blocks:** TODO-005 (size cap assumes the slimmer payload), TODO-006

## Why
`collectLocalSnapshot()` sweeps every `jpn101:*` localStorage key except four. So every debounced save uploads the bearer token (`jpn101:session`), the user's email (`jpn101:userEmail`), the `jpn101:syncPending` flag (which is stamped *before* the snapshot is collected, so a successful push tells other devices "⚠ Not saved yet"), `jpn101:lastBackup`, the ~107 KB `jpn101:videoIndex` cache, and the full 10k-deck pre-merge copy `jpn101:freqSnapshot`. On pull, `mergeSnapshots` writes another device's token over this device's own. Snapshot size today is ≈400 KB of which only ≈290 KB is study data; this is also why the `pagehide` keepalive flush can never fit (TODO-006).

## Current behaviour (verified)
- `JpnFlashcards.jsx:908`:
  ```js
  const SYNC_SKIP_KEYS = new Set(["jpn101:ping", "jpn101:syncCode", "jpn101:syncLastPulled", "jpn101:snapshot"]);
  ```
- `:926-935` `collectLocalSnapshot()` iterates `window.localStorage` and takes every key that `startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(k)`.
- `:896` `sSet` schedules a push for any non-skipped `jpn101:` key.
- `:1030-1031` `SESSION_KEY = "jpn101:session"`, `USER_EMAIL_KEY = "jpn101:userEmail"`; `:1111` `SYNC_PENDING_KEY = "jpn101:syncPending"`; `:4195` `VIDEOS_CACHE = "jpn101:videoIndex"`; `:5420` `"jpn101:freqSnapshot"`; `:3853` `"jpn101:lastBackup"`; `:1193` `RETENTION_KEY = "jpn101:retention"` (written with raw `localStorage.setItem` at `:1201`, so it never *triggers* a push but rides along in the next one).
- `:1125-1138` `pushCloudNow`: `markSyncPending()` happens only in the catch, but a *previous* failure's flag is still in storage when the next snapshot is collected at `:1132`, and `clearSyncPending()` runs at `:1137` only after success — so the flag is inside the uploaded snapshot.
- `:1017-1018` `mergeSnapshots`: unknown keys from the cloud are written locally (`if (!(k in localSnap)) out[k] = cloudSnap[k]`), so a cloud snapshot containing `jpn101:session` overwrites/creates it locally.
- Measured: deck JSON with FSRS fields ≈ 284 KB; `data/videos.json` 107,453 bytes.

## Intended behaviour
- The snapshot contains only study data. Never synced: `jpn101:session`, `jpn101:userEmail`, `jpn101:syncPending`, `jpn101:lastBackup`, `jpn101:videoIndex`, `jpn101:freqSnapshot`, `jpn101:snapshot`, `jpn101:ping`, `jpn101:syncLastPulled` (and `jpn101:syncCode` until TODO-003 deletes it).
- On pull, any of those keys present in an *old* cloud record are ignored (not written locally), and the next push (a full replace) drops them from KV.
- `jpn101:retention` is written through `sSet` so a changed target syncs like any other setting (merge rule: TODO-008).

## Implementation steps
1. **Extend the skip set** (`:908`):
   ```js
   // Keys that live on THIS device only. Anything else under jpn101: is study data and syncs.
   // A key listed here must never be written to the cloud and must be ignored if an old cloud
   // record still carries it.
   const SYNC_SKIP_KEYS = new Set([
     "jpn101:ping", "jpn101:syncLastPulled", "jpn101:snapshot", "jpn101:syncCode",
     "jpn101:session", "jpn101:userEmail", "jpn101:syncPending", "jpn101:lastBackup",
     "jpn101:videoIndex", "jpn101:freqSnapshot",
   ]);
   ```
   (`SESSION_KEY` etc. are declared later in the file; use the literals here — they are `const` strings declared with `const` at module level, and this set is evaluated at module load before them, so literals avoid a TDZ error.)
2. **Ignore skipped keys on pull** — in `mergeSnapshots` (`:1008-1020`) add as the first line of the `keys.forEach`:
   ```js
   if (SYNC_SKIP_KEYS.has(k)) { delete out[k]; return; }   // device-local keys never come from the cloud
   ```
   (`out` starts as a copy of `localSnap`, which already excludes them; the `delete` is belt-and-braces.)
3. **Pending flag ordering** — in `pushCloudNow` the flag is excluded by step 1, so nothing else is needed; but make the state honest: keep `markSyncPending()` in the catch, `clearSyncPending()` on success (unchanged).
4. **Retention through `sSet`** (`:1199-1202`):
   ```js
   function setRetention(r) {
     retentionTarget = Math.min(0.97, Math.max(0.7, r));
     sSet(RETENTION_KEY, String(retentionTarget));   // async, fire-and-forget; schedules a push
   }
   ```
   (`sSet` is defined at `:884`, above this point; it returns a promise — ignoring it is fine.)
5. **One-time cleanup of localStorage** is not needed (these keys are legitimately local). The cloud record is cleaned automatically by the next full push; no KV script required. If you want to confirm: `npx wrangler kv key get --namespace-id ba175d82f8fb41e4b60d5dad6d2d4543 "g:<sub>" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(Object.keys(j.snapshot))})'`.
6. Rebuild/commit/deploy.

## Data migration / compatibility
- Old cloud records still carry `jpn101:session` etc. Step 2 ignores them on pull; the next push replaces the record without them. No user action.
- A device that previously received another device's token via sync keeps whatever token it has locally; TODO-002 handles expiry.

## Testing & verification
- Manual: sign in, grade a card, in devtools Network capture the `POST /.netlify/functions/sync` body → `Object.keys(JSON.parse(body).snapshot)` contains no `jpn101:session`, `jpn101:userEmail`, `jpn101:syncPending`, `jpn101:videoIndex`, `jpn101:freqSnapshot`, `jpn101:lastBackup`; body size < 320 KB for an 821-card deck.
- Manual: pre-seed a cloud record with `"jpn101:session":"evil"` (use a second device or wrangler `kv key put` on a test sub), load the app → `localStorage["jpn101:session"]` unchanged.
- Unit (after TODO-008 moves merge functions into `tools/merge.mjs`): `mergeSnapshots({}, {"jpn101:session":"x","jpn101:deck":"[]"}, 2, 1)` → result has no `jpn101:session`.
- Change "Aim to remember" in Study → Network shows a push ~2.5 s later.

## Acceptance criteria
- [ ] Pushed snapshot contains only study keys (list above absent).
- [ ] Pull never writes a skipped key to localStorage.
- [ ] Retention changes trigger a push.
- [ ] Snapshot size for the current deck is under ~320 KB.

## Pitfalls / notes
- `jpn101:hooks` (AI memory hooks) and `jpn101:oralAttempts` (legacy) are study-ish data; leave them synced. `jpn101:scripts:mirror` is synced on purpose (merge rule exists).
- Do not add `jpn101:retention`, `jpn101:freqQuota`, `jpn101:kana/conj/freq` to the skip set — they are cross-device state; TODO-008 gives them real merge rules.
- TODO-006 relies on this slimmer payload and on knowing which keys are dirty; keep `SYNC_SKIP_KEYS` as the single source of truth for "local-only".
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
