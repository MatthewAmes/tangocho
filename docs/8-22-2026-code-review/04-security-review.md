# tangocho — Security Review

**Scope:** Full security audit of the tangocho Japanese-learning web app (single-file React app `JpnFlashcards.jsx` → bundled `index.html`, served by a Cloudflare Worker `cf/src/index.js` with sync / TTS / feed APIs, legacy Netlify functions, and a build/data pipeline in `tools/`).
**Method:** Static review of the current tree and full git history (`main` + `origin/dev`), local reasoning about code paths, and passive read-only observation of the live Worker (a single `curl -sI`). No writes, brute-force, or quota probing against production.
**Date:** 2026-08-22
**Reviewer note:** This is a hobby app for one student. Severities are calibrated to that reality — a leaked signing secret is still Critical, but "no enterprise WAF" is not a finding. Every claim cites `file:line`.

---

## Executive summary

- **CRITICAL — the session signing secret is committed to the repo.** `SESSION_SECRET` = `d89497a7…329f0` is hardcoded in the minified Netlify bundles `netlify/functions/sync.mjs:1` and `netlify/functions/tts.mjs:1`, present in the current tree and in git history since commit `230b7fc`. If the live Cloudflare Worker uses this same secret (the `cf/wrangler.toml` comment strongly implies the values were kept identical during the port), anyone can forge a valid session token for **any** Google account and read/write that user's entire progress record. This must be rotated and purged.
- **The Google TTS API key was leaked historically** (commit `226197d`) and, to the developer's credit, was caught by GitHub secret scanning, **revoked, and rotated** (commit `75c7254`). The current key lives only in a Worker secret. The residual risk is history exposure of the old (dead) key and the fact that the *same* key is also used for YouTube Data API calls (`cf/src/index.js:305`).
- **The unauthenticated "sync code" path is still live server-side** (`cf/src/index.js:129-130`) even though commit `2afa8d5` removed the client UI. A 4-character code is effectively an unauthenticated, guessable storage bucket — an enumeration, data-exposure and KV write-abuse vector.
- **No security headers.** The live Worker sends no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS (confirmed by `curl -sI`). The third-party Google Identity script is loaded without Subresource Integrity.
- **No request-size limit or rate limiting** on `POST /api/sync` (`cf/src/index.js:138-143`) — unbounded JSON into KV — or on the billable `/api/tts` cache-miss path beyond requiring a session.
- **What's done well is substantial and deliberate.** The Google ID-token verification is genuinely correct (explicit `alg==="RS256"` check, `aud`/`iss`/`exp` validation, real JWKS signature verification) — no `alg:none` or key-confusion bypass. HMAC comparison is constant-time. The feed proxy is allowlisted (no SSRF). TTS billing is gated behind a session. Auth is Bearer-in-header (CSRF-resistant). `window.open` uses `noopener,noreferrer`. There is no `dangerouslySetInnerHTML`/`eval`/`innerHTML` anywhere in the client.
- **XSS surface is small.** React escapes all rendered content; user-supplied and synced data is rendered as text, not HTML. No `dangerouslySetInnerHTML`, `eval`, `new Function`, or string-built DOM in `JpnFlashcards.jsx`.
- **Privacy:** the app stores the user's Google `sub`, email, and full study history in Cloudflare KV. The email is included in the synced snapshot (`jpn101:userEmail` is *not* in `SYNC_SKIP_KEYS`, `JpnFlashcards.jsx:908`). No third-party analytics or telemetry. No token logging (`console.log` count in the client: zero).

---

## Threat model

### Assets
1. **Users' study progress** (decks, FSRS state, daily logs, immersion history) — stored in KV under `g:<sub>` or `code:<code>`. Not sensitive, but irreplaceable to the user; the whole app is built around never losing it.
2. **User identity data** — Google `sub` + email address, held in KV snapshots.
3. **The session signing secret (`SESSION_SECRET`)** — the master key. Whoever holds it can mint a session for any user.
4. **The Google Cloud API key (`GOOGLE_TTS_API_KEY`)** — billable; used for both Cloud TTS and YouTube Data API. Leak = someone spends the owner's Google Cloud quota/money.
5. **The admin warm token (`ADMIN_WARM_TOKEN`)** — lets the holder force billable TTS generation without a user session.

### Actors
- **Anonymous internet user** — can reach every API route (the Worker is public).
- **A legitimate signed-in student** — holds a valid 2-year session token.
- **A passive observer of the public GitHub repo** — sees all committed code and history.
- **An XSS attacker** — would need an injection vector to steal the localStorage session (assessed as low-likelihood here).

### Entry points
- `GET/POST /api/sync` (+ legacy `/.netlify/functions/sync`) — token exchange, progress read/write.
- `GET /api/tts` — TTS proxy / cache.
- `GET /api/feed` — RSS/news fetcher.
- Static asset serving (`env.ASSETS.fetch`) for everything else.
- Client: Google Identity Services script, localStorage, user-entered vocab / scripts / immersion links, imported JSON backups.

### Trust boundaries
- **Browser ↔ Worker:** the Worker must treat all request input as hostile. Auth is the Bearer session token (or the sync code).
- **Worker ↔ Google (JWKS, TTS, YouTube):** outbound, trusted endpoints.
- **Worker ↔ KV:** the storage key derivation (`g:<sub>` vs `code:<code>`) *is* the data-isolation boundary.
- **Repo ↔ world:** the repo is public, so anything committed (including the bundled functions) is public.

### Out of scope / accepted
- The Google **Client ID** (`GOOGLE_CLIENT_ID`, `cf/src/index.js:17`, `JpnFlashcards.jsx:1029`) is public by design — it's an identifier, not a secret; OAuth security comes from the authorized-origins list on the OAuth client, not from hiding the ID. Correctly not treated as a secret.
- Single-maintainer bus factor and KV backup/restore are operational, not code-security, but flagged briefly at the end.

---

## Findings

### AUTH & SECRETS

---

#### CRITICAL-1 — `SESSION_SECRET` committed to the repository (session-forgery / full account takeover)

**Files:** `netlify/functions/sync.mjs:1` (constant `X="d89497a76bf1f28ee83d78cd469d40ebc3cd2b4b0fa330d3e281c5bfda7329f0"`), `netlify/functions/tts.mjs:1` (constant `ue="d89497…329f0"`). Present in current tree and in git history since commit `230b7fc` ("Real persistent Google session…").

**Description.** The Netlify functions were the original backend and were committed as pre-minified `.mjs` bundles. During minification the session-signing secret was inlined as a string constant instead of being read from `process.env`. Grep confirms the literal appears in both bundles today and has been in history across multiple commits. It is **not** in `index.html` or `JpnFlashcards.jsx` (good — it never reached the client bundle), but the repo is public, so the bundled functions expose it to anyone.

The session token format (`cf/src/index.js:52-70`) is `base64url(JSON{sub,email,exp}) + "." + base64url(HMAC-SHA256(secret, body))`. With the secret known, an attacker computes the HMAC themselves and forges a token for any payload they like.

The port to Cloudflare kept the token format byte-for-byte identical (compare `signSession`/`verifySession` in `cf/src/index.js:52-70` with the minified `be`/`ge` in `netlify/functions/sync.mjs`). The `cf/wrangler.toml` comment states: *"SESSION_SECRET (must match the existing one or every device is signed out)."* That is a direct statement that the Worker's secret was set to the **same value** as the Netlify one — i.e., the value now sitting in the repo. (This can be *disproven* only by confirming the Worker's actual secret, which I cannot read; it must be treated as compromised.)

**Exploit scenario (concrete).**
1. Attacker clones the public repo, greps the bundle for the 64-hex constant.
2. Attacker obtains a target's Google `sub` — it is not secret (it's in any ID token the target's browser sends, and is a stable public-ish identifier). Even without a specific target, the attacker forges tokens for their own account to probe, then any `sub` they learn.
3. Attacker crafts `body = base64url({"sub":"<victim sub>","email":null,"exp":<far future>})`, computes `sig = HMAC_SHA256(leaked_secret, body)`, sends `Authorization: Bearer body.sig` to `GET /api/sync`.
4. The Worker's `verifySession` accepts it (`cf/src/index.js:124-127`), sets `storageKey = "g:" + sub`, and returns the victim's entire study snapshot — **including their email address** (`jpn101:userEmail` is synced). A `POST` overwrites/corrupts it.

**Impact.** Complete compromise of the authentication system: read/write any user's data, harvest emails, impersonate any user to the TTS endpoint (bypassing the billing gate). This is the single highest-impact issue in the codebase.

**Remediation.**
1. **Rotate `SESSION_SECRET` now** via `wrangler secret put SESSION_SECRET` with a fresh 256-bit random value. This immediately invalidates every existing session (all users re-sign-in once — acceptable) *and* every forged token.
2. **Stop committing the bundled functions.** The Netlify backend is dead (every path is 301-redirected to the Worker per `netlify.toml`). Delete `netlify/functions/*.mjs` from the tree, or at minimum ensure they read from `process.env` and never inline secrets. Since they are pre-built artifacts, the cleanest fix is to remove them entirely and rely on the Worker.
3. **Purge history.** The secret is in git history; after rotation the old value is worthless, but scrub it (`git filter-repo --replace-text`) to avoid confusion and to remove the also-committed dead TTS/YouTube key references. Rotation is what actually protects you; history-scrubbing is hygiene.
4. Going forward, the build for any serverless function must inject secrets from env at deploy time, never from a committed bundle.

---

#### HIGH-2 — Google API key exposed in history; verify current key restrictions and split TTS vs. YouTube usage

**Files:** old key in commit `226197d` (`netlify/functions/tts.mjs`), remediated in `75c7254` ("Fix exposed API key…"). Current usage: `cf/src/index.js:178` (TTS) and `cf/src/index.js:305` (YouTube Data API) — both read `env.GOOGLE_TTS_API_KEY`.

**Description.** History shows a hardcoded `AIzaSy…` key committed in `226197d`, then the fix commit `75c7254` whose message states the key was **revoked in Google Cloud, a new key issued, and stored as an environment variable**. That is exactly the right response and deserves credit. Two residual points:

1. The **old** key is still readable in git history. Per the commit message it was revoked, so this is Info-grade — but I cannot verify revocation from here; flagging it so the developer confirms the old key returns 4xx/`API key not valid`.
2. The **current** key is used for two different Google APIs (`cf/src/index.js:178` Cloud TTS, `cf/src/index.js:305` YouTube Data API v3). If this key is not tightly restricted, a leak grants access to whatever APIs the Cloud project has enabled, not just TTS.

**Exploit scenario.** If the current key ever leaks (e.g., a future bundling mistake like CRITICAL-1, or it being logged), and it is unrestricted, an attacker runs up Cloud TTS + YouTube quota/billing on the owner's project.

**Impact.** Financial (quota/billing) abuse; scope depends entirely on key restrictions.

**Remediation.**
- Confirm the old key (from `226197d`) is revoked.
- In Google Cloud, apply **API restrictions** to the current key so it can call *only* Cloud Text-to-Speech and YouTube Data API v3, and **application restrictions** (HTTP referrer won't help a server-side key, but you can restrict by nothing-else-needed). Since the key is only ever used server-side from the Worker, consider setting a Cloud **quota cap** on TTS characters/day as a billing circuit-breaker.
- Ideally split into two keys (one per API) so a future leak of one is contained.

---

#### MEDIUM-3 — Session tokens are long-lived (730 days) with no server-side revocation

**Files:** `cf/src/index.js:19` (`SESSION_DAYS = 730`), `cf/src/index.js:52-55` (`signSession`), client sign-out `JpnFlashcards.jsx:1088-1091` (`signOutGoogle`).

**Description.** Sessions live for two years. There is no server-side session store, so there is no per-session revocation and no "sign out on all devices." `signOutGoogle()` only deletes the token from the *local* browser's localStorage — a stolen/forged token remains valid until it expires or `SESSION_SECRET` is rotated. The token is a stateless HMAC bearer credential stored in localStorage, so any XSS (see MEDIUM-8's category, currently low-likelihood) or device compromise yields a 2-year credential.

**Exploit scenario.** A token exfiltrated once (shared machine, backup, forged via CRITICAL-1) is usable for up to two years with no way for the user to invalidate it short of the developer rotating the global secret (which logs *everyone* out).

**Impact.** Weak credential lifecycle. Low data sensitivity caps this at Medium.

**Remediation.** For a hobby app, the pragmatic fixes are: (a) shorten expiry to something like 90 days and rely on silent re-auth; or (b) add a monotonic "token version" — store an integer per `sub` in KV, embed it in the token, and reject tokens whose version is stale; incrementing the version becomes "sign out everywhere." (b) is the real fix but adds a KV read per request. Given the scale, (a) plus the CRITICAL-1 rotation is likely sufficient.

---

### AUTHORIZATION & DATA ISOLATION

---

#### MEDIUM-4 — Unauthenticated "sync code" path is still reachable server-side

**Files:** `cf/src/index.js:128-132` (the `else` branch: `code = url.searchParams.get("code")`, regex `^[A-Za-z0-9]{4,32}$` → `storageKey = "code:" + code`). Client still falls back to it in `syncRequestOptions` (`JpnFlashcards.jsx:1180-1185`) when no Google session exists. The client generator `genSyncCode` (`JpnFlashcards.jsx:910-915`) produces 8-char codes, but the **server accepts 4–32 chars**.

**Description.** Commit `2afa8d5` ("Remove code-based sync UI entirely") removed the *UI* for entering a code, but the server path and the client auto-fallback remain. `code:<code>` is an unauthenticated read/write bucket keyed by a string an attacker fully controls. The server's floor of **4 characters** ([A-Za-z0-9] → 62⁴ ≈ 14.8M) is enumerable by a determined scanner; more importantly, an attacker doesn't need to guess anyone's code — they can simply *use* the endpoint as free anonymous storage.

**Exploit scenario.**
- *Data exposure / tampering:* `GET /api/sync?code=AB12` returns whatever is stored there; `POST` overwrites it. Anyone using a sync code (users who never signed in with Google) has no protection — another party who learns/guesses the code reads and rewrites their progress.
- *Abuse / cost:* `POST /api/sync?code=<anything>` writes attacker-chosen JSON into KV with no auth. Combined with no body-size limit (MEDIUM-5), an attacker fills KV with large values under millions of distinct codes, exhausting the free-tier KV write quota (~1k/day) — a cheap denial-of-service on sync for real users — and consuming storage.

**Impact.** Anonymous data exposure/tampering for code-path users; anonymous KV write abuse / DoS of the sync feature.

**Remediation.** Since the code UI is gone, **remove the code path from the Worker** (`cf/src/index.js:128-131`) so `POST`/`GET` require a valid Bearer session — return 401 otherwise. Also remove the client fallback (`JpnFlashcards.jsx:1183-1184`) so unauthenticated devices simply stay local-only until sign-in. If backward compatibility for existing code-path users is a concern, keep read-only support briefly behind a longer minimum length, but the clean move is deletion.

---

#### Data isolation on the authenticated path — CORRECT

`storageKey = "g:" + session.sub` (`cf/src/index.js:127`) is derived from the *verified* token's `sub`, and there is no path parameter or client-supplied key. One authenticated user cannot address another's `g:<sub>` bucket without forging a token (which requires CRITICAL-1). The isolation logic itself is sound.

---

### INPUT VALIDATION & ABUSE

---

#### MEDIUM-5 — `POST /api/sync` writes an unbounded body into KV

**File:** `cf/src/index.js:138-143` — `body = await req.json(); await env.SYNC.put(storageKey, JSON.stringify(body))`. No length check.

**Description.** Any authenticated (or code-path) caller can POST arbitrarily large JSON, written verbatim to KV (25 MB per-value ceiling). There is no size guard, schema validation, or shape check — the server stores whatever it receives.

**Exploit scenario.** A single valid session (or any sync code) POSTs ~25 MB blobs repeatedly, consuming KV storage and burning the ~1k/day free-tier write budget, degrading sync for legitimate users and potentially incurring cost.

**Impact.** Storage/cost/quota abuse; sync DoS.

**Remediation.** Reject oversized/oddly-shaped bodies before the KV write:
```js
const raw = await req.text();
if (raw.length > 512 * 1024) return json({ error: "payload too large" }, 413); // 512KB is generous for this app
let body; try { body = JSON.parse(raw); } catch { return json({ error: "invalid JSON body" }, 400); }
if (typeof body !== "object" || body === null || typeof body.snapshot !== "object")
  return json({ error: "bad shape" }, 400);
await env.SYNC.put(storageKey, JSON.stringify(body));
```
Real snapshots are a few KB to low tens of KB; 512 KB is a comfortable ceiling.

---

#### MEDIUM-6 — No rate limiting on billable / write endpoints

**Files:** TTS cache-miss `cf/src/index.js:170-192`; sync writes `cf/src/index.js:138-143`; feed fetch `cf/src/index.js:319-358`.

**Description.** The TTS cache-miss path correctly requires a session (`cf/src/index.js:172-175`) — good — but a *single valid session* can then drive unlimited billable Google TTS generations (each miss is a real API call, `cf/src/index.js:178`). There is no per-user or per-IP rate limit anywhere. The feed endpoint triggers outbound fetches to third-party feeds and (with `dur=1`) YouTube Data API calls (`cf/src/index.js:347-357`); it's bounded per-request (≤8 sources, ≤50 video IDs) but unbounded across requests.

**Exploit scenario.** An attacker signs in with a throwaway Google account (or, via CRITICAL-1, forges a session) and scripts `GET /api/tts?text=<random unique strings>` — each unique text is a cache miss → a billed Google TTS call. This runs up the owner's Cloud TTS bill and burns KV writes.

**Impact.** Financial abuse of Google TTS; KV write-quota exhaustion.

**Remediation.** Add a lightweight per-session (and/or per-IP) rate limit. Cloudflare offers a native [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) usable directly from the Worker — e.g., cap `/api/tts` cache-*misses* to N/min per `sub`. Pair with the Google Cloud TTS quota cap from HIGH-2 as a hard billing backstop. Given the app writes ~one clip per genuinely new word in normal use, a tight limit won't affect real students.

---

#### Feed proxy SSRF — NOT vulnerable (verified)

`handleFeed` (`cf/src/index.js:319-322`) accepts only source *ids* and looks them up in the server-side `FEEDS` allowlist (`cf/src/index.js:202-222`); ids not in the map are filtered out (`.filter((s) => FEEDS[s])`). The client cannot supply a URL. The design comment at `cf/src/index.js:198-201` explicitly explains this is to avoid an open proxy. This is the correct pattern and closes SSRF. (Minor: the parsed feed XML is capped at 900 KB, `cf/src/index.js:337`, bounding memory.)

---

#### LOW-7 — TTS cache key derived from client-controlled text (cache-fill, not classic poisoning)

**File:** `cf/src/index.js:164` — `key = sha256Hex(voiceName + "|" + rate + "|" + text)`.

**Description.** The cache key is a SHA-256 over the normalized voice/rate/text, so distinct inputs map to distinct keys — an attacker cannot make text A return audio for text B (no cross-key collision, no poisoning of *other* entries). The only abuse is *filling* the cache with junk keys, which is the same write-abuse surface as MEDIUM-6. Not a poisoning vulnerability; noting it only to close the question raised in the brief.

**Remediation.** Covered by MEDIUM-6 (rate-limit misses).

---

### CLIENT-SIDE

---

#### MEDIUM-8 — No Content-Security-Policy or other security headers; third-party script without SRI

**Evidence:** live `curl -sI https://tangocho.deskbuddies.workers.dev/` returns only `content-type`, `cache-control`, Cloudflare's `report-to`/`nel`, and `server` — **no** `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security`. The Worker serves assets via `env.ASSETS.fetch(req)` (`cf/src/index.js:368`) with zero header augmentation. The GIS script is loaded plain in `index.html:11`: `<script src="https://accounts.google.com/gsi/client" async defer></script>` — no `integrity`/SRI.

**Description.** There's no defense-in-depth layer. The app is clickjackable (no `X-Frame-Options`/`frame-ancestors`), has no CSP to blunt an XSS if one were ever introduced, and no `Referrer-Policy` (so full URLs leak in the `Referer` header to the third-party feeds/YouTube links the app opens). The GIS `<script>` has no SRI — though SRI on Google's rotating GIS endpoint is impractical (it changes), so `script-src` allowlisting in a CSP is the better control there.

**Exploit scenario.** Clickjacking: an attacker frames the app and overlays UI to trick a signed-in user into actions. Absent CSP, any future injected `<script>` or inline handler runs unrestricted and can read the localStorage session token.

**Impact.** No exploit *today* (no known injection), but the app forgoes cheap, high-value hardening. Given the app holds a 2-year bearer token in localStorage, CSP + framing protection materially raise the bar.

**Remediation.** Wrap non-API responses in the Worker to add headers. Concretely, replace `return env.ASSETS.fetch(req)` with:
```js
const res = await env.ASSETS.fetch(req);
const h = new Headers(res.headers);
h.set("Content-Security-Policy",
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; " +
  "media-src 'self' blob:; " +
  "connect-src 'self' https://accounts.google.com; " +
  "frame-src https://accounts.google.com; " +
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
h.set("X-Frame-Options", "DENY");
h.set("X-Content-Type-Options", "nosniff");
h.set("Referrer-Policy", "strict-origin-when-cross-origin");
h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
return new Response(res.body, { status: res.status, headers: h });
```
Note the app is a single inlined `<script>`, so `'unsafe-inline'` in `script-src` is currently required; a nonce-based CSP would be stricter but needs build changes. Even this loose CSP plus `frame-ancestors 'none'` is a large improvement over nothing. Test GIS sign-in after applying — adjust `script-src`/`frame-src`/`connect-src` for `accounts.google.com` as needed.

---

#### XSS surface — small, and handled correctly (positive finding)

- **No dangerous sinks in the client.** Grep across `JpnFlashcards.jsx` finds **no** `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML`, `eval`, `new Function`, `document.write`, `insertAdjacentHTML`, or `srcdoc`. The only `window.open` (`JpnFlashcards.jsx:4671`) uses `"noopener,noreferrer"`.
- **User-supplied content** (Add-tab vocab, custom scripts, immersion links, imported JSON backups) and **synced server data** are all rendered as React children/text, which React escapes. A malicious synced field like `<img onerror=…>` renders as inert text.
- **Imported backups** (`doRestore`, `JpnFlashcards.jsx:3856-3918`) are validated for shape (`o.app === "tangocho"`, `Array.isArray(o.deck)`) and their fields are stored/rendered as text, not executed.
- **Custom immersion links** (`addLink`, `JpnFlashcards.jsx:4719-4732`) are validated with `^https?:\/\//`, blocking `javascript:` URLs before they reach `window.open`. Feed item URLs come from the allowlisted trusted feeds and are also opened with `noopener,noreferrer`.

This is genuinely good hygiene and is why MEDIUM-8's missing CSP is "defense-in-depth" rather than an active hole.

---

#### LOW-9 — Prototype-pollution surface in snapshot merge (low likelihood, low impact)

**Files:** `mergeSnapshots` (`JpnFlashcards.jsx:1013-1027`), `mergeInput` (`JpnFlashcards.jsx:985-1011`) — spread and index-assign objects parsed from server JSON.

**Description.** Merge functions do `items[id] = v` and `out[k] = cloudSnap[k]` where keys derive from server-controlled JSON. In practice this is not exploitable: assigning a *string* to `obj["__proto__"]` is ignored by the engine, and the merged snapshot values written to localStorage are strings. The object-valued cases (`mergeInput`'s `items[id] = v`) could in theory set `items.__proto__`, but the data source is the user's *own* cloud bucket (authenticated path) — an attacker would need CRITICAL-1 or the code path to inject it, and the blast radius is the victim's own in-memory object with no security-relevant sink downstream.

**Impact.** Negligible on its own; listed for completeness.

**Remediation.** If hardening cheaply: guard merge loops with `if (k === "__proto__" || k === "constructor" || k === "prototype") return;` and/or use `Object.create(null)` maps. Optional.

---

### PRIVACY

---

#### LOW-10 — Email address stored in the synced snapshot; no data-deletion path

**Files:** `USER_EMAIL_KEY = "jpn101:userEmail"` (`JpnFlashcards.jsx:1031`); `SYNC_SKIP_KEYS` (`JpnFlashcards.jsx:908`) does **not** include it; `collectLocalSnapshot` (`JpnFlashcards.jsx:927-937`) sweeps all `jpn101:*` keys except the skip set. So the user's email is uploaded and stored in KV under `g:<sub>`.

**Description.** Personal data stored: Google `sub`, email, and full study history, in Cloudflare KV. Positives: **no third-party analytics/telemetry**, **no token logging** (zero `console.log`/`console.error` calls in the client), and the app is otherwise privacy-frugal. The gaps: (a) email travels in the snapshot and thus is exposed by CRITICAL-1 / (for code-path users) MEDIUM-4; (b) there is no retention limit or user-facing "delete my cloud data" — sign-out only clears local storage, KV keeps the record indefinitely.

**Impact.** Modest — one student's email + study data. Elevated only in combination with CRITICAL-1/MEDIUM-4.

**Remediation.** Add `"jpn101:userEmail"` to `SYNC_SKIP_KEYS` so email isn't stored in the cloud snapshot (the Worker already tracks email in the session token itself if ever needed). Optionally offer a "delete my synced data" action that issues a `DELETE`/empty-`POST` to clear the KV key. Neither is urgent at this scale.

---

### SUPPLY CHAIN & BUILD

---

#### LOW-11 — Dead, secret-bearing build artifacts committed; pinned but unaudited deps

**Files:** `netlify/functions/*.mjs` (dead, and the CRITICAL-1 carrier), `tools/package.json` + `tools/package-lock.json` (esbuild `0.25.12`, react/react-dom `18.3.1`, lockfile present).

**Description.** The Netlify functions are dead code (all paths 301-redirect to the Worker, `netlify.toml`) yet remain committed and are the vehicle for CRITICAL-1. Positives on the build side: dependencies are pinned with a committed lockfile; the build tool set is tiny (esbuild + react) and reputable; `build.mjs` has real sanity checks (`createRoot`/`#root` presence, `check-feeds.mjs` consistency, valid `videos.json`) that fail the build rather than shipping a broken bundle. The YouTube indexing scripts read `YOUTUBE_API_KEY` from `.env.local` (`tools/yt-index.mjs:23-28`, `tools/yt-discover.mjs:15-20`), which is correctly `.gitignore`d.

**Impact.** Primary risk is CRITICAL-1 (already scored). Otherwise low.

**Remediation.** Delete the `netlify/` directory. Run `npm audit` in `tools/` periodically. Keep `.env.local` ignored (it is).

---

### OPERATIONAL SECURITY

---

#### INFO-12 — Secret-leak blast radius & single-maintainer notes

- **If `SESSION_SECRET` leaks** (it has — CRITICAL-1): forge any user's session. **Mitigation = rotate**, which is also the only "log everyone out" lever (MEDIUM-3).
- **If `GOOGLE_TTS_API_KEY` leaks:** billable TTS + YouTube abuse; scope bounded only if key is restricted (HIGH-2).
- **If `ADMIN_WARM_TOKEN` leaks** (`cf/src/index.js:174`): the holder can force billable TTS generation without a user session — same billing-abuse class as MEDIUM-6, and it bypasses the session requirement. Treat it as a secret of equal importance to the API key; rotate on any suspicion. It's correctly kept out of `wrangler.toml`.
- **KV backup/restore:** no export/backup of the KV namespaces is evident; a KV-side data loss would lose all users' cloud snapshots (users retain local copies + the in-app JSON backup feature, which mitigates this well).
- **Bus factor:** single maintainer, secrets held only in Cloudflare. Fine for a hobby project; just be aware losing Cloudflare account access loses the secrets.

---

#### INFO-13 — `callClaude` posts directly to `api.anthropic.com` with no credential (non-functional, not a leak)

**File:** `JpnFlashcards.jsx:2184-2191` — `fetch("https://api.anthropic.com/v1/messages", …)` with only `Content-Type` and no API key.

**Description.** The AI sentence/hook/grade helpers call the Anthropic API from the browser with **no** `x-api-key`/auth header and no proxy. This request cannot succeed from a browser (missing auth + CORS), and the code correctly falls back to a local generator on failure (`JpnFlashcards.jsx:2371-2378`). The security-relevant point is the *good* one: **no API key is embedded in the client** — the developer did not hardcode an Anthropic key to make this work. Functionally the "AI" paths are dead, but nothing is leaked.

**Remediation.** None required for security. If the AI features are wanted, add a server-side proxy route in the Worker that injects the key from a secret and rate-limits it — do **not** put an Anthropic key in the client.

---

#### INFO-14 — Minor functional bug noted in passing (not security)

`iso8601ToSeconds` (`cf/src/index.js:284-288`) has a regex with missing backslashes: `/^P(?:(d+)D)?T(?:(d+)H)?.../ ` matches the literal letter `d`, not `\d`. Durations from the YouTube API never parse. Harmless to security; flagged only because it silently disables the duration feature.

---

## What's done well (credit where due)

1. **Google ID-token verification is correct and complete** (`cf/src/index.js:73-98`): explicit `header.alg !== "RS256"` rejection (blocks `alg:none` and HS/RS key-confusion), `aud` check against the client ID, `iss` allowlist, `exp` check, real JWKS fetch with `kid` lookup, and genuine `RSASSA-PKCS1-v1_5` signature verification. No verification bypass found.
2. **Constant-time-ish HMAC comparison** in `verifySession` (`cf/src/index.js:61-65`) — length check then XOR-accumulate with no early exit. Good instinct, correctly implemented.
3. **Feed proxy is allowlisted, not URL-driven** (`cf/src/index.js:198-222, 321`) — deliberately closes SSRF, with a comment explaining exactly why.
4. **TTS billing gated behind a session** (`cf/src/index.js:170-175`) so anonymous users can only ever hit the cache, never generate.
5. **Bearer-token auth in a header, not a cookie** — inherently CSRF-resistant; no cookie usage anywhere.
6. **The prior API-key leak was handled textbook-correctly**: detected, key revoked, rotated, moved to env (`75c7254`).
7. **Secrets kept out of `wrangler.toml`** with an explicit comment on how they're injected (`cf/wrangler.toml` footer).
8. **Clean client-side XSS posture:** no dangerous DOM sinks, `noopener,noreferrer` on external links, `https?://`-only custom links, shape-validated backup import.
9. **No telemetry, no analytics, no token logging** — privacy-respecting by default.
10. **Input clamping** where it matters: TTS `text` sliced to 500 (`cf/src/index.js:156`), `rate` clamped 0.4–1.5 (`cf/src/index.js:162`), feed sources ≤8 and `n` clamped 1–30 (`cf/src/index.js:321-323`), feed XML capped at 900 KB (`cf/src/index.js:337`).

---

## Summary table

| ID | Severity | Title | Location |
|----|----------|-------|----------|
| CRITICAL-1 | **Critical** | `SESSION_SECRET` committed in bundled functions → session forgery / account takeover | `netlify/functions/sync.mjs:1`, `tts.mjs:1` |
| HIGH-2 | **High** | Google API key leaked in history (rotated); current key dual-use, verify restrictions | hist `226197d`/`75c7254`; `cf/src/index.js:178,305` |
| MEDIUM-3 | Medium | 730-day sessions, no revocation / sign-out-everywhere | `cf/src/index.js:19,52` |
| MEDIUM-4 | Medium | Unauthenticated sync-code path still live; guessable/abusable bucket | `cf/src/index.js:128-132` |
| MEDIUM-5 | Medium | Unbounded POST body into KV | `cf/src/index.js:138-143` |
| MEDIUM-6 | Medium | No rate limiting on billable TTS / KV writes | `cf/src/index.js:170-192,138-143` |
| MEDIUM-8 | Medium | No CSP / X-Frame-Options / nosniff / Referrer-Policy; GIS without SRI | `cf/src/index.js:368`; `index.html:11` |
| LOW-7 | Low | TTS cache-fill (not poisoning) via client text | `cf/src/index.js:164` |
| LOW-9 | Low | Prototype-pollution surface in merge (not exploitable in practice) | `JpnFlashcards.jsx:985-1027` |
| LOW-10 | Low | Email stored in synced snapshot; no cloud-delete/retention | `JpnFlashcards.jsx:908,1031` |
| LOW-11 | Low | Dead secret-bearing Netlify artifacts committed; audit deps | `netlify/functions/*`, `tools/package-lock.json` |
| INFO-12 | Info | Secret blast-radius / ADMIN_WARM_TOKEN / backup / bus factor | `cf/src/index.js:174` |
| INFO-13 | Info | Client `callClaude` has no credential (non-functional, no leak) | `JpnFlashcards.jsx:2184` |
| INFO-14 | Info | `iso8601ToSeconds` regex bug (functional, not security) | `cf/src/index.js:284` |

---

## Prioritized remediation checklist

**Do first (today):**
1. **Rotate `SESSION_SECRET`** via `wrangler secret put SESSION_SECRET <new-256-bit-random>` (CRITICAL-1). This invalidates the leaked secret and every forged token in one step.
2. **Delete `netlify/functions/*.mjs`** from the repo (they're dead code and the leak carrier), then scrub the secret from history with `git filter-repo` (CRITICAL-1 / LOW-11).
3. **Confirm the old Google API key (from `226197d`) is revoked** and apply API + quota restrictions to the current key (HIGH-2).

**Do soon (this week):**
4. **Remove the sync-code path** from the Worker and the client fallback (MEDIUM-4).
5. **Add a body-size cap + shape check** to `POST /api/sync` (MEDIUM-5).
6. **Add security headers** (CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS) by wrapping `env.ASSETS.fetch` (MEDIUM-8).
7. **Rate-limit `/api/tts` cache-misses** per session/IP and set a Google Cloud TTS quota cap (MEDIUM-6, HIGH-2).

**Nice to have:**
8. Shorten session lifetime and/or add a token-version revocation mechanism (MEDIUM-3).
9. Add `jpn101:userEmail` to `SYNC_SKIP_KEYS` and offer a cloud-data delete (LOW-10).
10. Guard merge loops against `__proto__` keys (LOW-9).
11. Treat `ADMIN_WARM_TOKEN` as a rotate-on-suspicion secret (INFO-12).
12. Fix the `iso8601ToSeconds` regex if durations are wanted (INFO-14).
