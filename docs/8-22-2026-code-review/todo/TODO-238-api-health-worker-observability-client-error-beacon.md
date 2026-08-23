# TODO-238 — `/api/health`, Worker observability (`[observability]` + warn on swallowed errors), client error beacon to `/api/log`

**Priority:** P2   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 11 ("No Worker logging/observability", "No client error reporting", "Other secrets" → `/api/health`), F-10, F-14; 05-expansion § 5.7, QW-16; 03 § 3 I-3 (silent failures)
**Depends on:** TODO-210 (build stamp), TODO-231 (tests for the new routes), TODO-224 (ErrorBoundary hook)   **Blocks:** none

## Why
From the dashboard you cannot tell whether feeds are failing, durations are 403ing, TTS is erroring, or which build is live. `console.*` count in the Worker is zero and errors at the feed/duration fetches are swallowed; there is no `[observability]` block so even thrown errors are not retained. On the client, 59 empty `catch (e) {}` blocks and no `window.onerror` mean crashes are only noticed by the student. A health route with booleans (never values), structured warnings, and a tiny rate-limited log route close the gap without adding a vendor.

## Current behaviour (verified)
- `cf/src/index.js`: no `console.*`; swallowed errors at `ytDurations` catch (L315 `/* leave durations unknown rather than wrong */`) and `handleFeed` catch (L341 `out[id] = []`); router L360-369 has three routes + assets fallthrough.
- `cf/wrangler.toml`: no `[observability]`, no `[vars]`.
- Client: no `window.addEventListener("error"|"unhandledrejection")`; ErrorBoundary arrives with TODO-224 (`window.__tcReport` hook).
- Build stamp: `cf/public/build.txt` after TODO-210 (readable via `env.ASSETS.fetch(new Request(origin + "/build.txt"))`).

## Intended behaviour
- `GET /api/health` → `200 {"ok":true,"build":"git-7b9e110","time":"…","kv":{"sync":true,"tts":true},"secrets":{"session":true,"tts":true,"admin":false},"feeds":17}` — booleans only; KV checked with a cheap `get` of a known-missing key (no writes); `cache-control: no-store`. Returns `503 {"ok":false,…}` if `SESSION_SECRET` is missing or a KV binding throws.
- `POST /api/log` → accepts `{kind:"error"|"unhandledrejection"|"boundary", message, stack, build, url}` (≤ 2 KB), requires a valid session **or** is limited to 20/day per IP via a KV counter (`log:q:<ip>:<date>`, TTL 86400), `console.error`s a single structured line, returns 204. No storage of bodies beyond the log stream (or optional 7-day KV with TTL if wanted later).
- `wrangler.toml` gets `[observability] enabled = true` and `head_sampling_rate = 1` (tiny traffic); Worker `console.warn` lines on every swallowed error with the source id and status.
- Client `main.jsx` installs `error`/`unhandledrejection` listeners → `navigator.sendBeacon("/api/log", JSON.stringify(payload))` (falls back to `fetch(..., {keepalive:true})`), throttled to 3 per page load; ErrorBoundary's `window.__tcReport` uses the same sender.

## Implementation steps
1. `cf/src/index.js`:
   ```js
   async function handleHealth(req, env) {
     const origin = new URL(req.url).origin;
     let build = "unknown"; try { const r = await env.ASSETS.fetch(new Request(origin + "/build.txt")); if (r.ok) build = (await r.text()).trim(); } catch (e) {}
     const kv = { sync: false, tts: false };
     try { await env.SYNC.get("health:probe"); kv.sync = true; } catch (e) { console.warn("health: SYNC kv error", String(e)); }
     try { await env.TTS.get("health:probe"); kv.tts = true; } catch (e) { console.warn("health: TTS kv error", String(e)); }
     const secrets = { session: !!env.SESSION_SECRET, tts: !!env.GOOGLE_TTS_API_KEY, admin: !!env.ADMIN_WARM_TOKEN };
     const ok = secrets.session && kv.sync && kv.tts;
     return json({ ok, build, time: new Date().toISOString(), kv, secrets, feeds: Object.keys(FEEDS).length }, ok ? 200 : 503);
   }
   async function handleLog(req, env) {
     if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
     const raw = (await req.text()).slice(0, 2048);
     const ip = req.headers.get("cf-connecting-ip") || "?"; const day = new Date().toISOString().slice(0, 10);
     const qk = `log:q:${ip}:${day}`; const n = Number((await env.TTS.get(qk)) || 0);
     if (n >= 20) return new Response(null, { status: 429 });
     await env.TTS.put(qk, String(n + 1), { expirationTtl: 86400 });       // TTS ns already hosts the other cache prefixes
     let body = {}; try { body = JSON.parse(raw); } catch (e) {}
     console.error(JSON.stringify({ t: "client-error", ip: ip.slice(0, 7) + "…", kind: body.kind, build: body.build, url: body.url, message: String(body.message || "").slice(0, 300), stack: String(body.stack || "").slice(0, 800) }));
     return new Response(null, { status: 204 });
   }
   ```
   Router: `if (pathname === "/api/health") return handleHealth(req, env); if (pathname === "/api/log") return handleLog(req, env);`. Add `console.warn` in `handleFeed` catch (`console.warn("feed fetch failed", id, String(e))` and on `!r.ok` with `r.status`) and in `ytDurations` (`console.warn("yt durations", r.status)` on non-OK; catch → warn).
2. `cf/wrangler.toml`: append `[observability]\nenabled = true\nhead_sampling_rate = 1`.
3. Client `src/main.jsx`:
   ```js
   let _reported = 0;
   function report(kind, err) {
     if (_reported++ >= 3) return;
     const payload = JSON.stringify({ kind, message: String(err && err.message || err).slice(0, 300), stack: String(err && err.stack || "").slice(0, 800), build: BUILD_ID, url: location.pathname });
     try { if (!navigator.sendBeacon || !navigator.sendBeacon("/api/log", new Blob([payload], { type: "application/json" }))) fetch("/api/log", { method: "POST", body: payload, keepalive: true }).catch(() => {}); } catch (e) {}
   }
   window.addEventListener("error", (e) => report("error", e.error || e.message));
   window.addEventListener("unhandledrejection", (e) => report("unhandledrejection", e.reason));
   window.__tcReport = (err) => report("boundary", err);
   ```
   Keep it out of `file://`/localhost (`if (location.protocol === "https:")`).
4. Tests (`cf/test/health.test.mjs`, `cf/test/log.test.mjs` — TODO-231 harness): health returns 200 with booleans and no secret values (`assert(!JSON.stringify(body).includes("test-secret"))`); 503 when `SESSION_SECRET` missing; log: 21st POST from the same IP → 429; body > 2 KB truncated; GET → 405.
5. RUNBOOK (TODO-237) § 1 and § 7: `curl -s https://tangocho.deskbuddies.workers.dev/api/health | jq`; `npx wrangler tail` shows `client-error` lines and feed warnings.

## Data migration / compatibility
none. New KV keys `log:q:*` (TTL 1 day) in the TTS namespace — document the prefix in DATA-SCHEMA § 9.

## Testing & verification
- `npm test` (Worker tests) green; `cd cf && npx wrangler dev` → `curl -s localhost:8787/api/health` → JSON with `secrets.session:true` (from `.dev.vars`), `kv` true (local KV), `build` from `cf/public/build.txt`.
- Throw in the console on prod (`setTimeout(() => { throw new Error("beacon test"); })`) → `wrangler tail` shows one `client-error` line; `/api/log` returns 204; 21 rapid posts → 429.
- Dashboard: Workers → tangocho → Logs shows invocations after enabling observability.

## Acceptance criteria
- [ ] `/api/health` live with booleans + build; `/api/log` rate-limited and logging one structured line.
- [ ] `[observability]` enabled; swallowed feed/duration errors now `console.warn`.
- [ ] Client reports `error`/`unhandledrejection`/boundary errors (≤ 3 per load) in prod only.
- [ ] Tests + RUNBOOK updated; Worker deployed.

## Pitfalls / notes
- Never include secret values or full IPs in logs; the IP is truncated; health returns booleans only.
- `sendBeacon` is limited to 64 KB — payload is ≤ 2 KB.
- Theme A's security-headers item wraps `env.ASSETS.fetch`; make sure `/api/health` and `/api/log` are routed *before* that wrapper (they return JSON with `no-store`).
