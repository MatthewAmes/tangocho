# TODO-006 — Make the "flush before the page goes away" actually send: hidden-tab push, size-guarded keepalive, dirty tracking

**Priority:** P1   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 3.4 (HIGH); 06-architecture § 3.4 (`_retryTimer` overlapping POSTs), R4; 05-expansion § 5.9 (debounce vs KV writes)
**Depends on:** TODO-004 (smaller payload)   **Blocks:** TODO-007 (delta push needs the dirty tracking added here)

## Why
`pagehide` calls `pushCloudNow({ keepalive: true })` with the whole snapshot (~300-400 KB). Browsers reject `fetch(..., {keepalive:true})` whose body exceeds 64 KiB with a `TypeError` *before sending*, so the flush never leaves the device; only `markSyncPending` runs. The last ≤2.5 s of grading before closing the tab reach the cloud only on the next visit of that same device — exactly the case commit `5cc3ede` believed it had fixed. Meanwhile, `visibilitychange → hidden` (the most reliable "last chance" signal on mobile, fired when the user switches apps) is only used to *retry pending*, not to flush a debounced save.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1152-1166`:
  ```js
  let _cloudPushTimer = null;
  function scheduleCloudPush() { if (_cloudPushTimer) clearTimeout(_cloudPushTimer); _cloudPushTimer = setTimeout(() => pushCloudNow(), 2500); }
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { if (hasSyncPending()) pushCloudNow(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && hasSyncPending()) pushCloudNow(); });
    window.addEventListener("pagehide", () => { if (_cloudPushTimer || hasSyncPending()) pushCloudNow({ keepalive: true }); });
  }
  ```
- `:1125-1151` `pushCloudNow({attempt, keepalive})` builds `body = JSON.stringify({ updatedAt, snapshot: collectLocalSnapshot() })` and `fetch(url, opts)` with `keepalive` in `opts`.
- Measured: deck JSON ≈ 284 KB (821 cards with FSRS) → body always > 64 KiB; keepalive limit is 64 KiB of outstanding keepalive bytes per origin.
- `sSet` (`:884-898`) knows which key was written but does not record it anywhere; there is no notion of "dirty since last successful push".

## Intended behaviour
- `sSet` records each synced key it writes into a module-level `_dirtyKeys` set; a successful full push clears the set; a failed push keeps it.
- When the document becomes hidden and a debounced push is waiting, push immediately with a normal `fetch` (no keepalive). In-flight fetches from a backgrounded tab normally complete; this covers the mobile app-switch and most desktop tab-close cases.
- On `pagehide`, only use `keepalive` when the body is ≤ 60 KiB; otherwise (until TODO-007 adds delta bodies) do not attempt the doomed fetch — just `markSyncPending()` so the next visit retries. No `TypeError` is thrown into the console.
- Concurrent pushes are coalesced: if a push is in flight, a second call sets a "push again when done" flag instead of racing it (last writer wins on a blind-overwrite server, so two overlapping POSTs can land out of order).

## Implementation steps
1. **Dirty tracking** — above `sSet` (`:884`):
   ```js
   const _dirtyKeys = new Set();            // jpn101:* keys written since the last successful full push
   function markDirty(key) { if (key.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(key)) _dirtyKeys.add(key); }
   ```
   In `sSet` (`:896`): `if (ok && key.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(key)) { markDirty(key); scheduleCloudPush(); }`. Note `SYNC_PREFIX`/`SYNC_SKIP_KEYS` are declared at `:907-908`, after `sSet` — that is fine because `sSet` runs later, but `_dirtyKeys`/`markDirty` must be declared at module level before first use; place them right after `SYNC_SKIP_KEYS`.
   Also call `markDirty(k)` in `pullAndMergeCloud` for every merged key written to localStorage (`:1179`) — after a pull+merge the local state differs from the cloud and the chain pushes it anyway.
2. **Coalesce overlapping pushes** — add `let _pushInFlight = false, _pushAgain = false;` and wrap `pushCloudNow`:
   ```js
   async function pushCloudNow(opts = {}) {
     if (_pushInFlight) { _pushAgain = true; return false; }
     _pushInFlight = true;
     try { return await pushCloudOnce(opts); }
     finally { _pushInFlight = false; if (_pushAgain) { _pushAgain = false; pushCloudNow(); } }
   }
   async function pushCloudOnce({ attempt = 0, keepalive = false } = {}) { …existing body… }
   ```
   In `pushCloudOnce` after a successful response: `_dirtyKeys.clear();` (do this *before* `await fetch` resolves? No — clear only on success; keys written during the request were added after the snapshot was collected, so snapshot the set first: `const sent = new Set(_dirtyKeys);` before building the body, and on success `sent.forEach((k) => _dirtyKeys.delete(k))`.)
3. **Size-guarded keepalive** — in `pushCloudOnce`, after building `body`:
   ```js
   const KEEPALIVE_MAX = 60 * 1024;
   if (keepalive && body.length > KEEPALIVE_MAX) {       // browsers reject keepalive bodies > 64 KiB before sending
     markSyncPending(); setSyncState("pending");
     return false;                                       // TODO-007 sends a delta here instead
   }
   ```
   (`body.length` counts UTF-16 code units; Japanese characters are 3 bytes in UTF-8, so use `new TextEncoder().encode(body).length` for the real byte size — it is cheap.)
4. **Flush on hidden** — replace the `visibilitychange` listener (`:1160-1162`):
   ```js
   document.addEventListener("visibilitychange", () => {
     if (document.visibilityState === "hidden") {
       if (_cloudPushTimer) pushCloudNow();              // flush the debounce now; a normal fetch from a hidden tab usually completes
     } else if (hasSyncPending()) pushCloudNow();
   });
   ```
   Keep the `pagehide` listener but it now goes through the size guard. Keep `online`.
5. **Debounce**: leave 2,500 ms (writes/day are the KV constraint; see 05-expansion § 5.9). Do not push per grade.
6. Rebuild, commit `index.html`, deploy.

## Data migration / compatibility
None. `_dirtyKeys` is in-memory only; on reload everything is considered clean except that `jpn101:syncPending` still triggers a full push.

## Testing & verification
- Manual (desktop Chrome, signed in): grade a card, immediately switch to another tab (within 2.5 s) → Network shows the POST completing (status 200) while hidden; reopen → Browse shows "All changes saved". Repeat with closing the tab: reopen the app → the pending flag is set (expected until TODO-007) and a push happens on load; no `TypeError: Failed to execute 'fetch'… keepalive` in the console (check with `chrome://inspect` or Preserve log).
- Manual (iOS Safari/Android Chrome): grade a card, press Home within 2 s, open the app on another device → the grade arrived (visibilitychange path).
- Manual: rapidly grade 5 cards → only one POST in flight at a time; at most one follow-up POST after it finishes (coalescing).
- Console check: `collectLocalSnapshot` unchanged; `_dirtyKeys` (expose on `window.__tangocho = { dirty: () => [..._dirtyKeys] }` temporarily while testing, remove before commit) shows `jpn101:deck`, `jpn101:days` after a grade and empties after a successful push.

## Acceptance criteria
- [ ] No keepalive fetch is attempted with a body > 60 KiB; no console TypeError on tab close.
- [ ] A debounced save is pushed immediately when the tab becomes hidden.
- [ ] Overlapping pushes are coalesced (never two concurrent POSTs).
- [ ] `_dirtyKeys` tracks written keys and clears on success.

## Pitfalls / notes
- Do not `await` anything *before* calling `fetch` inside the `pagehide`/hidden handlers (no async compression, no `sGet`) — the page may be frozen after the handler returns; the fetch must be issued synchronously inside the handler. `pushCloudNow` today does `syncRequestOptions` + `collectLocalSnapshot()` synchronously before `fetch` — keep it that way (don't insert `await` above the `fetch` line).
- `sendBeacon` has the same 64 KiB practical limit and no auth header — not a fix.
- A full-deck push per grade would be the simplest fix but costs one KV write per grade; at 1,000 writes/day free tier that is unsafe. Keep the debounce.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
