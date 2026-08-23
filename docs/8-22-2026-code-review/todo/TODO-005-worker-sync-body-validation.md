# TODO-005 — Worker: size cap, shape validation and server-stamped `updatedAt` on `POST /api/sync`; `handleTts` secret guard

**Priority:** P1   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § MEDIUM-5; 01-functionality-review § 3.6 (client-supplied `updatedAt`), § 7 (Worker: no body cap, `handleTts` lacks 503 guard); 06-architecture § 3.5, § 6.2 (snapshot schema version)
**Depends on:** TODO-003 (auth branch simplified), TODO-004 (payload is ≤ ~320 KB after the skip-set change)   **Blocks:** TODO-007 (partial pushes extend the same validation)

## Why
`handleSync` writes whatever JSON it receives straight into KV (`env.SYNC.put(storageKey, JSON.stringify(body))`) with no size cap (KV allows 25 MB per value) and no shape check. One valid session can fill KV and exhaust the 1,000 writes/day free-tier quota, which silently breaks sync for the real user. Separately, the record's `updatedAt` is the *sender's* `Date.now()`; `mergeSnapshots` compares it to this device's `syncLastPulled`, so a skewed clock on either device flips which side "wins" for every secondary key. Finally `handleTts` calls `verifySession(env.SESSION_SECRET, …)` without the `503` guard `handleSync` has — on a mis-deployed Worker `importKey(undefined)` throws and surfaces as a 500.

## Current behaviour (verified)
- `cf/src/index.js:138-143`:
  ```js
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
    await env.SYNC.put(storageKey, JSON.stringify(body));
    return json({ ok: true });
  }
  ```
- `:134-137` GET returns `json({ data: data || null })` where `data` is the stored `{updatedAt, snapshot}` object.
- Client `JpnFlashcards.jsx:1132` sends `JSON.stringify({ updatedAt: Date.now(), snapshot: collectLocalSnapshot() })`; `:1173-1180` pull reads `data.updatedAt`, merges with `lastPulled = localStorage["jpn101:syncLastPulled"]`, then sets `syncLastPulled = Date.now()` (client clock).
- `:1018` `mergeSnapshots`: `if (k in cloudSnap && cloudUpdatedAt && cloudUpdatedAt > (localLastPulled || 0)) out[k] = cloudSnap[k];`.
- `:172-173` `handleTts`: `const session = auth.startsWith("Bearer ") ? await verifySession(env.SESSION_SECRET, auth.slice(7)) : null;` — no `if (!env.SESSION_SECRET)` guard (`handleSync` has one at `:108-109`).
- Snapshot values are JSON strings (double-encoded); keys all start with `jpn101:`.

## Intended behaviour
- POST bodies over 1 MiB are rejected with 413 before parsing; malformed shapes with 400. Accepted shape: `{ updatedAt?: number, snapshot: { [key starting with "jpn101:"]: string }, v?: 1 }`, at most 64 keys, each value a string (optional: reject keys listed as device-local — see TODO-004). 
- The stored record is `{ v: 1, updatedAt: <server Date.now()>, snapshot }` — the Worker stamps the time. GET returns `{ data, now: Date.now() }` so the client can store a server-relative `syncLastPulled`.
- `handleTts` returns 503 "server not configured" when `SESSION_SECRET` is unset instead of throwing.

## Implementation steps
1. **Worker `handleSync` POST** (`cf/src/index.js:138-143`), replace with:
   ```js
   if (req.method === "POST") {
     const MAX_BODY = 1024 * 1024;                                   // 1 MiB; real snapshots are ~300 KB
     const len = Number(req.headers.get("content-length") || 0);
     if (len > MAX_BODY) return json({ error: "payload too large" }, 413);
     const raw = await req.text();
     if (raw.length > MAX_BODY) return json({ error: "payload too large" }, 413);
     let body;
     try { body = JSON.parse(raw); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
     const bad = validateSnapshotBody(body);
     if (bad) return json({ error: bad }, 400);
     const record = { v: 1, updatedAt: Date.now(), snapshot: body.snapshot };   // server clock, not the sender's
     await env.SYNC.put(storageKey, JSON.stringify(record));
     return json({ ok: true, updatedAt: record.updatedAt });
   }
   ```
   and add near the top of the sync section:
   ```js
   const SNAPSHOT_PREFIX = "jpn101:";
   const MAX_SNAPSHOT_KEYS = 64;
   function validateSnapshotBody(body) {
     if (!body || typeof body !== "object" || Array.isArray(body)) return "bad shape";
     const snap = body.snapshot;
     if (!snap || typeof snap !== "object" || Array.isArray(snap)) return "missing snapshot";
     const keys = Object.keys(snap);
     if (keys.length > MAX_SNAPSHOT_KEYS) return "too many keys";
     for (const k of keys) {
       if (!k.startsWith(SNAPSHOT_PREFIX) || k === "__proto__") return "bad key " + k;
       if (typeof snap[k] !== "string") return "value for " + k + " must be a string";
     }
     return null;
   }
   ```
2. **Worker GET** (`:134-137`): `return json({ data: data || null, now: Date.now() });` — `data` keeps its stored shape (old records lack `v`; that is fine).
3. **Client pull** (`JpnFlashcards.jsx:1173-1180`): read `const { data, now } = await res.json();` and after writing merged keys set `syncLastPulled` to the server time: `window.localStorage.setItem("jpn101:syncLastPulled", String(now || Date.now()));`. Since `data.updatedAt` is now server-stamped too, the comparison in `mergeSnapshots` is clock-consistent. (After TODO-008 only scalar settings still use that rule.)
4. **Client push** (`:1132`): keep sending `updatedAt` (ignored by the server now) — or drop it; harmless either way. Send `v: 1`.
5. **`handleTts` guard** (`:172` area): at the top of the cache-miss block, before `verifySession`:
   ```js
   if (!env.SESSION_SECRET) return json({ error: "server not configured" }, 503);
   ```
6. Deploy the Worker (`cd cf && npx wrangler deploy`); rebuild the client for step 3/4 (`cd tools && node build.mjs`), commit `index.html`.

## Data migration / compatibility
- Existing records `{updatedAt, snapshot}` are read as-is. The first POST rewrites them as `{v:1, updatedAt, snapshot}`.
- Old clients (a tab that has not reloaded) still send `{updatedAt, snapshot}` — accepted by the validator.
- If a real snapshot ever exceeds 1 MiB (a 3,000+ card deck), the client will see 413 and mark pending; raise `MAX_BODY` then — it is a guard, not a quota. Consider gzip (`Content-Encoding`) at that point, not before.

## Testing & verification
- Add `tools/test-worker.mjs` (same style as `tools/test-fsrs.mjs`, plain Node asserts; run with `node tools/test-worker.mjs`). To import Worker helpers, add named exports to `cf/src/index.js`: `export { validateSnapshotBody, signSession, verifySession, iso8601ToSeconds, parseFeed };` (wrangler ignores extra named exports; the default export stays). Assertions:
  - `validateSnapshotBody({snapshot:{"jpn101:deck":"[]"}})` → `null`
  - `validateSnapshotBody({snapshot:{"evil":"x"}})` → starts with `"bad key"`
  - `validateSnapshotBody({snapshot:{"jpn101:deck":{}}})` → `"value for jpn101:deck must be a string"`
  - `validateSnapshotBody([])`, `validateSnapshotBody(null)`, `validateSnapshotBody({})` → non-null
  - `signSession("s","sub","e")` → `verifySession("s", tok)` returns `{sub:"sub",…}`; `verifySession("other", tok)` → `null`; tampered body → `null`.
- curl against `wrangler dev`:
  - `curl -i -X POST localhost:8787/api/sync -H "Authorization: Bearer <tok>" -H "content-type: application/json" --data '{"snapshot":{"jpn101:deck":"[]"}}'` → 200 with `updatedAt`.
  - `--data '{"snapshot":{"x":"y"}}'` → 400; `--data '[]'` → 400; a 2 MB body (`head -c 2000000 /dev/zero | tr '\0' a`) → 413.
  - `GET` → body has `now`.
- Prod: after deploy, normal study still shows "All changes saved"; `wrangler tail` shows no 4xx for the real user.

## Acceptance criteria
- [ ] Oversized bodies → 413; malformed → 400; valid → 200 and stored with server `updatedAt` and `v:1`.
- [ ] GET returns `now`; client stores it as `syncLastPulled`.
- [ ] `handleTts` returns 503 (not 500) when the secret is missing.
- [ ] `tools/test-worker.mjs` passes.

## Pitfalls / notes
- `req.text()` on a 25 MB body still reads it; the `content-length` pre-check avoids most of that, but clients can omit the header — the post-read length check is the real guard. Acceptable.
- Do not validate *values* as JSON here (cost; and `jpn101:freqQuota` is a bare number string) — string type is enough.
- Keep the `exchange=1` branch before the auth check (it is).
- TODO-007 adds `{partial:true, …}` bodies — extend `validateSnapshotBody` there rather than bypassing it.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
