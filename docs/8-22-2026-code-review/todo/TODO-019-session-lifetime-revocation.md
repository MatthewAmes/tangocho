# TODO-019 — Shorter sessions, `iat` in the token, per-user revocation ("sign out everywhere"), and a cloud-data delete

**Priority:** P3   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § MEDIUM-3, LOW-10 (no cloud-delete), INFO-12; 06-architecture § 11 (SESSION_SECRET rotation row)
**Depends on:** TODO-002 (401 recovery makes shorter sessions painless), TODO-003, TODO-005   **Blocks:** none

## Why
Sessions are stateless HMAC bearer tokens valid for 730 days with no server-side state, so a token copied once (shared machine, backup of localStorage, forged via TODO-001) works for two years, and the only revocation lever is rotating the global secret (signs everyone out). There is also no way for a user to delete their cloud record. With TODO-002 in place, re-sign-in is a one-click affair, so a shorter lifetime costs nothing; a per-`sub` "not-before" value in KV gives a cheap "sign out everywhere".

## Current behaviour (verified)
- `cf/src/index.js:19` `const SESSION_DAYS = 730;`
- `:52-55` `signSession`: payload `{ sub, email, exp: Date.now() + SESSION_DAYS*86400000 }`.
- `:56-70` `verifySession`: HMAC check, `exp` check only — no `iat`, no server lookup.
- `:134-144` `handleSync` supports GET/POST only; no DELETE.
- Client `signOutGoogle` (`JpnFlashcards.jsx:1041-1044`) only clears local storage (and, after TODO-002, is reachable from Browse).

## Intended behaviour
- New tokens carry `iat` and expire after 180 days. Old 730-day tokens keep working until they expire or the user revokes.
- `verifySession` rejects tokens whose `iat` is older than the per-user `nbf:<sub>` value in KV (one KV read per authenticated request — acceptable at this scale; cache in memory for 60 s per isolate to reduce reads).
- `POST /api/sync?revoke=1` (auth required) sets `nbf:<sub> = Date.now()`, returns 200; the client then clears its own token and shows the sign-in button. Browse gets a "Sign out everywhere" button next to "Sign out".
- `DELETE /api/sync` (auth required) deletes `g:<sub>` (and any `bak:<sub>:*` if TODO-015's cron exists). Browse → More gets "Delete my cloud copy" behind a two-tap confirm; local data stays.

## Implementation steps
1. **Worker constants/tokens**: `const SESSION_DAYS = 180;` and in `signSession` add `iat: Date.now()` to the payload. In `verifySession`, after the `exp` check:
   ```js
   return payload;   // unchanged here; the nbf check needs env, so do it in the caller:
   ```
   add a helper used by `handleSync`/`handleTts` after a successful verify:
   ```js
   const _nbfCache = new Map();   // sub -> {at, nbf}; per-isolate, best effort
   async function sessionRevoked(env, session) {
     const c = _nbfCache.get(session.sub);
     let nbf;
     if (c && Date.now() - c.at < 60000) nbf = c.nbf;
     else { nbf = Number((await env.SYNC.get("nbf:" + session.sub)) || 0); _nbfCache.set(session.sub, { at: Date.now(), nbf }); }
     return nbf && (!session.iat || session.iat < nbf);   // tokens without iat (pre-upgrade) count as issued at 0 → revoked once nbf is set
   }
   ```
   In `handleSync` after `verifySession`: `if (await sessionRevoked(env, session)) return json({ error: "session revoked" }, 401);` — same in `handleTts` (after the session is obtained, only when `session` is non-null).
2. **Revoke endpoint** — in `handleSync` before the GET/POST dispatch:
   ```js
   if (url.searchParams.get("revoke") === "1") {
     if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
     await env.SYNC.put("nbf:" + session.sub, String(Date.now()));
     _nbfCache.delete(session.sub);
     return json({ ok: true });
   }
   ```
   The calling device's own token is now revoked too; the client must `signOutGoogle()` right after a 200.
3. **Delete endpoint** — add `if (req.method === "DELETE") { await env.SYNC.delete(storageKey); return json({ ok: true }); }` (optionally also list/delete `bak:<sub>:` keys).
4. **Client** (Browse, next to the Sign out button from TODO-002):
   ```js
   const signOutEverywhere = async () => {
     const req = syncRequestOptions({ method: "POST" }); if (!req) return;
     try { await fetch(req.url + "?revoke=1", req.opts); } catch (e) {}
     signOutGoogle();
   };
   const deleteCloudCopy = async () => {       // two-tap confirm like "Clear all"
     const req = syncRequestOptions({ method: "DELETE" }); if (!req) return;
     const res = await fetch(req.url, req.opts);
     setRestoreMsg(res.ok ? "Cloud copy deleted. This device still has everything; the next save will re-upload unless you sign out first." : "Couldn't delete — try again.");
   };
   ```
   Put "Delete my cloud copy" under Browse → More with the same `confirm` pattern as Clear all (`:4001-4009`). Note the next debounced push re-creates the record — say so in the copy (as above) or call `signOutGoogle()` after a successful delete when the user chose "delete and sign out".
5. **Validation** (TODO-005): `revoke=1` POST has no body — handle before body parsing.
6. Deploy Worker; rebuild client; commit `index.html`.

## Data migration / compatibility
- Existing 730-day tokens (no `iat`) remain valid until expiry or until that user revokes (then they are rejected, which is the intent). After TODO-001's rotation, all tokens are new and carry `iat` anyway.
- `nbf:<sub>` keys are tiny and permanent; fine.

## Testing & verification
- `tools/test-worker.mjs`: `signSession` payload includes `iat` and `exp ≈ now + 180 d`; with an in-memory KV stub, `sessionRevoked(env, {sub, iat: nbf - 1})` → true, `{iat: nbf + 1}` → false, `{sub}` with no `nbf` key → false.
- Manual: two devices signed in; on A click "Sign out everywhere"; B's next save → 401 → TODO-002 expired notice; sign in again on B → works (new `iat` > nbf).
- Manual: "Delete my cloud copy" → `npx wrangler kv key get --namespace-id ba175d82… "g:<sub>"` → not found; grade a card → record re-created (expected, documented).

## Acceptance criteria
- [ ] New sessions last 180 days and carry `iat`.
- [ ] Revoke invalidates all of a user's tokens within 60 s; old tokens without `iat` are rejected after a revoke.
- [ ] DELETE removes the cloud record; UI explains re-upload behaviour.

## Pitfalls / notes
- KV is eventually consistent (up to ~60 s across edges) plus the 60 s in-memory cache — "sign out everywhere" is not instant; document "within a couple of minutes".
- One KV read per authenticated request is the cost; `handleTts` cache hits need no session so they are unaffected.
- Do not shorten below ~90 days without a silent re-auth story; 180 is a compromise with TODO-002's one-click recovery.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
