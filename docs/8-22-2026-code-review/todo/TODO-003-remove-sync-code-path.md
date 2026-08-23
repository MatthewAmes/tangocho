# TODO-003 — Remove the unauthenticated sync-code path (client and Worker)

**Priority:** P0   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § MEDIUM-4; 01-functionality-review § 3.5; 06-architecture § F-5, § 11 (KV key hygiene); 05-expansion § 5.9 #1, § 7
**Depends on:** TODO-002 (signed-out devices must simply stay local; the UI copy relies on the auth state)   **Blocks:** TODO-005 (simplifies the auth branch it validates)

## Why
Commit `2afa8d5` removed the sync-code *UI*, but the path is still live on both sides. Every visitor who is not signed in gets a random 8-char code minted into `jpn101:syncCode`, and then the app GETs and POSTs the **entire snapshot** to `/api/sync?code=XXXXXXXX` on load and after every debounced save (`setSyncState("saved")` is even reached). The Worker accepts any `[A-Za-z0-9]{4,32}` code as a KV key (`code:<code>`): an unauthenticated, guessable read/write bucket that anyone can use as free storage or to burn the 1,000 writes/day free-tier KV quota (which would block the real user's saves). Nobody can ever read those orphan records back.

## Current behaviour (verified)
- `JpnFlashcards.jsx:905-925`:
  ```js
  const SYNC_KEY = "jpn101:syncCode";
  …
  function genSyncCode() { … 8 chars from "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" … }
  function getSyncCode() { let c = localStorage.getItem(SYNC_KEY); if (!c) { c = genSyncCode(); localStorage.setItem(SYNC_KEY, c); } return c; }
  function setSyncCode(code) { … }   // no call sites
  ```
- `:1093-1101`:
  ```js
  function syncRequestOptions(extra) {
    …
    if (session) { opts.headers.authorization = "Bearer " + session; return { url: SYNC_ENDPOINT, opts }; }
    return { url: SYNC_ENDPOINT + "?code=" + encodeURIComponent(getSyncCode()), opts };
  }
  ```
- `:1125-1151` `pushCloudNow` and `:1168-1183` `pullAndMergeCloud` call `syncRequestOptions` unconditionally → signed-out devices hit the network with `?code=`.
- `:908` `SYNC_SKIP_KEYS` includes `"jpn101:syncCode"` (so the code itself is not synced).
- `:1022-1028` comment still says "Falls back to the manual sync code only if the user has never signed in".
- Worker `cf/src/index.js:122-132`:
  ```js
  } else {
    const code = (url.searchParams.get("code") || "").trim();
    if (/^[A-Za-z0-9]{4,32}$/.test(code)) storageKey = "code:" + code;
  }
  if (!storageKey) return json({ error: "no valid auth (session or sync code)" }, 400);
  ```
- 03-ui-ux Appendix B observed a fresh local load issuing 12 `POST /.netlify/functions/sync?code=…` requests.

## Intended behaviour
- Not signed in ⇒ zero sync network traffic. `pushCloudNow` returns `false` without marking pending; `pullAndMergeCloud` returns `false` immediately; sync state stays `"idle"` (Browse shows the sign-in prompt, not "Not saved yet").
- The Worker requires a valid Bearer session for every non-exchange `/api/sync` request and answers `401` otherwise. `?code=` is ignored.
- `genSyncCode/getSyncCode/setSyncCode/SYNC_KEY` are deleted; the stale `jpn101:syncCode` localStorage key is removed once on startup.

## Implementation steps
1. **Client — `syncRequestOptions`** (`:1093-1101`): return `null` when there is no session:
   ```js
   function syncRequestOptions(extra) {
     const session = loadSession();
     if (!session) return null;                 // local-only until the user signs in
     const opts = { ...extra, cache: "no-store", headers: { ...((extra && extra.headers) || {}), authorization: "Bearer " + session } };
     return { url: SYNC_ENDPOINT, opts };
   }
   ```
2. **Client — `pushCloudNow`** (`:1125`): right after clearing the debounce timer:
   ```js
   const req = syncRequestOptions({ method: "POST", headers: { "content-type": "application/json" }, body: …, keepalive });
   if (!req) { setSyncState("idle"); return false; }      // signed out: nothing to push anywhere
   ```
   Move `setSyncState("saving")` below this guard. Note: do **not** `markSyncPending()` here — the durable flag should only mean "a signed-in save failed". However, a device that *was* never signed in and then signs in must still push its local deck: that already happens via `initGoogleAuth(loadCardsAndSync)` → `pushCloudNow()` at the end of the chain (`:1345`), so no flag is needed.
3. **Client — `pullAndMergeCloud`** (`:1170`): `const req = syncRequestOptions({}); if (!req) return false;`.
4. **Client — listeners** (`:1157-1166`): the `online`/`visibilitychange`/`pagehide` handlers call `pushCloudNow` only `if (hasSyncPending())` / `if (_cloudPushTimer || hasSyncPending())`; with step 2 they become no-ops when signed out. Nothing to change, but verify no `?code=` request appears.
5. **Client — delete** `SYNC_KEY`, `genSyncCode`, `getSyncCode`, `setSyncCode` (`:905`, `:910-925`) and the `"jpn101:syncCode"` entry in `SYNC_SKIP_KEYS` (`:908`) — keep `"jpn101:ping"`, `"jpn101:syncLastPulled"`, `"jpn101:snapshot"` (TODO-004 extends this set). Update the comment block at `:900-904` and `:1022-1028` to describe Google-session-only sync. Add a one-time cleanup in the root load chain (`loadCardsAndSync`, before `pullAndMergeCloud`): `try { window.localStorage.removeItem("jpn101:syncCode"); } catch (e) {}`.
6. **Worker** (`cf/src/index.js:122-132`): replace the auth block with
   ```js
   const auth = req.headers.get("authorization") || "";
   if (!auth.startsWith("Bearer ")) return json({ error: "sign-in required" }, 401);
   const session = await verifySession(secret, auth.slice(7));
   if (!session) return json({ error: "invalid or expired session" }, 401);
   const storageKey = "g:" + session.sub;
   ```
   Remove the `code:` regex and the 400 "no valid auth (session or sync code)" response. Update the header comment (`:1-15`) if it mentions sync codes (it does not; the Netlify sentence can stay for now — Theme C retires the aliases).
7. **Orphan `code:*` KV records**: they hold data nobody can retrieve (codes were never shown to users after `2afa8d5`; before that, the UI showed codes — a user who only ever used a code and never signed in would have progress there, but the app has required Google sign-in since July and the deck is also local on their device). Decision: leave them for 30 days after this deploy, then delete:
   ```bash
   cd /Users/dan/Code/matthew-japanese/tangocho/cf
   npx wrangler kv key list --namespace-id ba175d82f8fb41e4b60d5dad6d2d4543 --prefix "code:" > /tmp/code-keys.json
   node -e 'const k=require("/tmp/code-keys.json").map(x=>x.name); console.log(k.length); require("fs").writeFileSync("/tmp/code-keys-names.json", JSON.stringify(k));'
   npx wrangler kv bulk delete --namespace-id ba175d82f8fb41e4b60d5dad6d2d4543 /tmp/code-keys-names.json
   ```
   Before deleting, run the backup script from TODO-015 once with `--prefix code:` so nothing is lost irrecoverably (KV deletes also count against the free-tier 1,000 deletes/day; batch accordingly).
8. Rebuild, commit `index.html`, deploy: `cd tools && npm install && node build.mjs && cd ../cf && npx wrangler deploy`.

## Data migration / compatibility
- Signed-in users: no change.
- Devices that were relying on the silent code fallback (not signed in): they keep studying locally; when they sign in, the existing chain pushes their local deck and merges with any cloud data. Their `code:` record is abandoned (same data is local).
- Remove `jpn101:syncCode` from localStorage (step 5).

## Testing & verification
- Local: `cd cf && npx wrangler dev`; open the app signed out; Network tab shows **no** `/api/sync` or `/.netlify/functions/sync` requests on load or after grading; Browse shows the sign-in prompt, not "Not saved yet".
- `curl -i "https://tangocho.deskbuddies.workers.dev/api/sync?code=ABCD"` → `401`; `curl -i -X POST … -d '{}'` → `401`.
- `curl -i -H "Authorization: Bearer <valid>" https://…/api/sync` → `200 {"data":…}` (unchanged).
- Build sanity: `grep -c "getSyncCode" JpnFlashcards.jsx` → 0; `grep -c "code:" cf/src/index.js` → 0 (except comments).
- After 30 days: `npx wrangler kv key list --namespace-id ba175d82… --prefix "code:"` → `[]`.

## Acceptance criteria
- [ ] Signed-out devices make no sync requests and never mint a code.
- [ ] Worker answers 401 to any `/api/sync` request without a valid Bearer session (exchange excepted).
- [ ] `genSyncCode/getSyncCode/setSyncCode/SYNC_KEY` are gone; `jpn101:syncCode` is cleaned from localStorage.
- [ ] Orphan `code:*` keys are backed up and deleted after the grace period.

## Pitfalls / notes
- Do not return 400 for missing auth — 401 is what TODO-002's client handler keys on, and `handleAuthFailure()` on a device that has no token is a harmless no-op (state "signed-out").
- The `exchange=1` branch (`cf/src/index.js:111-120`) must stay unauthenticated — it is how sessions are minted.
- Interacts with TODO-005 (body validation) and TODO-006/007 (partial pushes) — all three edit `handleSync`; do this one first.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
