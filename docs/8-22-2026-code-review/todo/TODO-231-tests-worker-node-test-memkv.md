# TODO-231 — Tests for the Cloudflare Worker: export the helpers, `node:test` with an in-memory KV stub (optionally `@cloudflare/vitest-pool-workers`)

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 7.2 (Worker row), § 7.3 obstacle 4, § 7.4 "Worker" row, F-4; 05-expansion § QW-4, § 5.5 items 3–4; 01-functionality § 5.1, § 7; 04-security (the sync/auth behaviours to pin)
**Depends on:** TODO-211 (root package.json / `npm test`)   **Blocks:** TODO-238 (health route tests land in the same suite)

## Why
`cf/src/index.js` (370 lines) has zero tests, and a one-character bug proves the cost: `iso8601ToSeconds` uses `(d+)` instead of `(\d+)` so every YouTube duration resolves to 0 (verified `PT5M30S → 0`). `signSession/verifySession`, Google ID-token claim checks, auth path selection, KV read/write, `parseFeed` (Atom vs RSS, CDATA, entities) and the feed cache logic are all plain functions over `Request`/`env` — testable under Node ≥ 20 (WebCrypto, `Request`/`Response`, `fetch` are global) with a 15-line KV stub. The fix for the regex itself is Theme A/B's item; this item makes it (and every future Worker change) verifiable.

## Current behaviour (verified)
- `cf/src/index.js` exports only `export default { async fetch(req, env) {…} }` (L360-369). Internals: `b64urlToBytes/bytesToB64url/b64ToBytes/utf8/fromUtf8` L22-45; `hmac/signSession/verifySession` L48-70; `verifyGoogleIdToken` L73-98 (fetches JWKS); `json()` L100-103; `handleSync` L106-145 (exchange, Bearer → `g:<sub>`, `?code=` → `code:<code>`, GET/POST KV); `sha256Hex` L148-151; `handleTts` L152-192; `FEEDS` L202-222; `FEED_TTL/FEED_SCHEMA` L223-227; `unent/tag/parseFeed` L229-261; `iso8601ToSeconds` L284-288 (**bug**); `ytDurations` L289-316; `handleFeed` L318-358.
- No `cf/package.json`, no test dir, no vitest config.
- KV API used: `env.SYNC.get(key, {type:"json"})`, `env.SYNC.put(key, string)`, `env.TTS.get(key, {type:"arrayBuffer"|"json"|undefined})`, `env.TTS.put(key, value, {expirationTtl})`.

## Intended behaviour
`cf/src/index.js` additionally exports its pure/handler functions (`export { signSession, verifySession, verifyGoogleIdToken, handleSync, handleTts, handleFeed, parseFeed, unent, iso8601ToSeconds, ytDurations, sha256Hex }`) — the default export is unchanged, so `wrangler` behaviour is identical. `cf/test/*.test.mjs` run with `node --test` using `cf/test/_env.mjs` (MemKV + env factory) and a `globalThis.fetch` stub for outbound calls. Optional second layer: `@cloudflare/vitest-pool-workers` for an integration test against `env.ASSETS` (SPA fallback, headers).

## Implementation steps
1. Add the named `export { … }` line at the end of `cf/src/index.js` (after the default export — function declarations hoist). `wrangler deploy --dry-run` must still succeed.
2. `cf/test/_env.mjs`:
   ```js
   export class MemKV { constructor() { this.m = new Map(); }
     async get(k, o) { const v = this.m.get(k); if (v == null) return null; const t = typeof o === "string" ? o : o && o.type;
       if (t === "json") return JSON.parse(typeof v === "string" ? v : new TextDecoder().decode(v));
       if (t === "arrayBuffer") return typeof v === "string" ? new TextEncoder().encode(v).buffer : v.buffer ?? v; return typeof v === "string" ? v : new TextDecoder().decode(v); }
     async put(k, v, o) { this.m.set(k, v); this.meta = { ...(this.meta||{}), [k]: o || {} }; }
     async delete(k) { this.m.delete(k); }
     async list(o) { return { keys: [...this.m.keys()].filter((k) => !o?.prefix || k.startsWith(o.prefix)).map((name) => ({ name })) }; } }
   export const mkEnv = (over = {}) => ({ SESSION_SECRET: "test-secret", GOOGLE_TTS_API_KEY: "", ADMIN_WARM_TOKEN: "", SYNC: new MemKV(), TTS: new MemKV(), ASSETS: { fetch: async () => new Response("<html>app</html>", { headers: { "content-type": "text/html" } }) }, ...over });
   export const req = (path, init) => new Request("https://t.test" + path, init);
   export function stubFetch(router) { const orig = globalThis.fetch; globalThis.fetch = async (url, init) => router(String(url), init); return () => { globalThis.fetch = orig; }; }
   ```
3. `cf/test/session.test.mjs` — first cases: `signSession` → `verifySession` round-trip returns `{sub,email,exp}`; tampered signature (flip one char) → `null`; tampered body → `null`; expired (`exp` in the past; build a token by calling `hmac`-equivalent via `signSession` then patch — or export a `signWith(secret, payload)` helper) → `null`; different secret → `null`; token with 3 parts → `null`.
4. `cf/test/sync.test.mjs`: `handleSync` GET without auth and without code → 400; with `?code=ab` (too short) → 400; `?code=ABCD1234` → 200 `{data:null}` (**pin**; Theme A removes the code path → flip to 401); Bearer invalid → 401; Bearer valid → GET `{data:null}` then POST `{updatedAt, snapshot:{}}` → `{ok:true}` and `env.SYNC.m.get("g:<sub>")` is the JSON; POST invalid JSON → 400; `exchange=1` with GET → 405; missing `SESSION_SECRET` → 503. (Theme A's size cap/shape check → add 413/400 cases then.)
5. `cf/test/tts.test.mjs`: GET without `text` → 400; cache hit serves `audio/mpeg` with `immutable` cache-control without any session; cache miss without session → 401; miss with session but no `GOOGLE_TTS_API_KEY` → 503; miss with admin token header and a stubbed Google fetch returning `{audioContent: base64}` → 200 and KV now holds the key `sha256(voice|rate|text)`; `rate` clamped (0.4–1.5) and `0.90` ≡ `0.9` (same key).
6. `cf/test/feed.test.mjs`: `unent` decodes CDATA/`&amp;`/`&#x3042;`; `parseFeed` on a minimal Atom fixture (YouTube shape with `<yt:videoId>`) → `{title,url:"https://www.youtube.com/watch?v=…",at,vid}`; RSS fixture with `<itunes:duration>12:34` → `sec 754`; item without link skipped; `limit` respected. `iso8601ToSeconds("PT5M30S")` → **currently 0** — write the assertion as the *correct* value 330 and mark `test.todo`/`{ skip: "TODO-0xx fixes the regex" }` so CI is green until the fix flips it (also `PT1H2M3S`→3723, `P1DT2H`→93600, `P1D` → 86400 if the `T` is made optional like `tools/yt-index.mjs:88`). `handleFeed`: unknown src → 400; stubbed fetch returns the Atom fixture → items cached under `feed:v2:<id>:<limit>` with `expirationTtl` 21600; second call served from KV (fetch not called).
7. `cf/test/router.test.mjs`: default export routes `/api/sync` and `/.netlify/functions/sync` to the same handler (405 on PUT), unknown path → `env.ASSETS.fetch` result.
8. Root `package.json`: `"test": "node --test test/ cf/test/"`. Optional: `cf/vitest.config.mjs` + `@cloudflare/vitest-pool-workers` devDependency with one integration test (`SELF.fetch("/")` returns the SPA, `/manifest.webmanifest` content-type after TODO-214, security headers after Theme A) — document as optional in CONTRIBUTING.

## Data migration / compatibility
none (exports only).

## Testing & verification
- `npm test` → all Worker tests pass (iso8601 case skipped/todo until fixed).
- `cd cf && npx wrangler deploy --dry-run --outdir /tmp/wk` succeeds with the new exports.
- Mutation check: change `alg !== "RS256"` to `!==` `"HS256"` locally → claim test fails (use a hand-built unsigned token and a stubbed JWKS fetch; `verifyGoogleIdToken` needs `fetch` stubbed to return a JWKS with a generated RSA key — `crypto.subtle.generateKey` in the test, sign the token with the private key, export the public JWK).

## Acceptance criteria
- [ ] ≥ 25 Worker assertions across session/sync/tts/feed/router; `MemKV` stub shared.
- [ ] `iso8601ToSeconds` correct-value test present (skipped/todo until the fix lands, then enabled).
- [ ] CI runs them (TODO-213 `npm test`).

## Pitfalls / notes
- Node's `Request` requires absolute URLs — `req()` helper prefixes a host.
- `handleTts` reads `env.SESSION_SECRET` without the 503 guard (report 01 § 7) — pin current behaviour (500) or add the guard in Theme A's item; don't mix.
- Keep fixtures tiny and inline; never hit the network in tests (stub `fetch` and restore it in `after()`).
