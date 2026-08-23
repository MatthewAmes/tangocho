# TODO-013 — Per-user daily quota and burst limit on billable TTS cache-misses (+ Worker observability)

**Priority:** P2   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § MEDIUM-6, LOW-7, HIGH-2 (quota cap), INFO-12; 05-expansion § 5.9 #3; 06-architecture § 11 (quota monitoring, observability)
**Depends on:** none (TODO-003/005 touch `handleSync`, not `handleTts`)   **Blocks:** none

## Why
A TTS cache miss is a real billable Google call plus a KV write. The only gate is "has a valid session": one signed-in account (or a forged token, see TODO-001) can script `GET /api/tts?text=<random>` and run up the Neural2 bill and the 1,000 writes/day KV free-tier quota. Normal study generates roughly one clip per genuinely new word and a few for new script lines — a tight per-user cap does not affect a real learner. Pair with a Google Cloud quota cap as the hard billing backstop (TODO-014).

## Current behaviour (verified)
- `cf/src/index.js:167-192`:
  ```js
  const hit = await env.TTS.get(key, { type: "arrayBuffer" });
  if (hit) return new Response(hit, { headers: audioHeaders });
  const auth = req.headers.get("authorization") || "";
  const session = auth.startsWith("Bearer ") ? await verifySession(env.SESSION_SECRET, auth.slice(7)) : null;
  const isAdmin = env.ADMIN_WARM_TOKEN && req.headers.get("x-admin-token") === env.ADMIN_WARM_TOKEN;
  if (!session && !isAdmin) return json({ error: "sign-in required to generate new audio" }, 401);
  if (!env.GOOGLE_TTS_API_KEY) return json({ error: "TTS not configured yet" }, 503);
  const g = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + env.GOOGLE_TTS_API_KEY, …);
  …
  await env.TTS.put(key, bytes);
  ```
- `:156` `text` capped at 500 chars; `:159-162` voice/rate clamped. No per-user or global counters anywhere; no `console.*` in the Worker; `cf/wrangler.toml` has no `[observability]`.
- Client: `speakJaAuthed` (`JpnFlashcards.jsx:3417-3436`) falls back to `speechSynthesis` on any `!res.ok`, so a 429 degrades gracefully to the browser voice.

## Intended behaviour
- Per-user (by `session.sub`) daily cap on cache-miss generations (default 300/day) and a global daily cap (default 1,500/day) enforced before calling Google; admin token bypasses both. Over cap → `429 {"error":"daily audio limit reached"}` with `retry-after`.
- Optional burst limit (e.g. 30 misses/minute per sub) via Cloudflare's Rate Limiting binding, if available on the account.
- Worker logs one structured line per generation and per rejection; `[observability]` enabled so `wrangler tail`/dashboard show them.

## Implementation steps
1. **KV daily counters** (uses the existing `TTS` namespace with a new prefix; one extra KV read+write per *miss* only):
   ```js
   const TTS_DAILY_PER_USER = 300, TTS_DAILY_GLOBAL = 1500;
   const dayKey = () => new Date().toISOString().slice(0, 10);   // UTC day is fine for a quota
   async function bumpQuota(env, key, limit) {                   // best-effort counter; races are acceptable for abuse control
     const k = "ttsq:" + key + ":" + dayKey();
     const n = Number((await env.TTS.get(k)) || 0) + 1;
     if (n > limit) return false;
     await env.TTS.put(k, String(n), { expirationTtl: 2 * 86400 });
     return true;
   }
   ```
   In `handleTts`, after the `!session && !isAdmin` check and before the Google call:
   ```js
   if (!isAdmin) {
     if (!(await bumpQuota(env, "u:" + session.sub, TTS_DAILY_PER_USER))
      || !(await bumpQuota(env, "all", TTS_DAILY_GLOBAL))) {
       console.warn(JSON.stringify({ ev: "tts_quota", sub: session.sub.slice(0, 6) }));
       return json({ error: "daily audio limit reached — try again tomorrow" }, 429, { "retry-after": "3600" });
     }
   }
   ```
   (`json()` already accepts extra headers.)
2. **Optional burst limit** — Cloudflare Workers Rate Limiting binding (check current docs: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ — the binding shape and plan availability may have changed). In `cf/wrangler.toml`:
   ```toml
   [[unsafe.bindings]]
   name = "TTS_LIMITER"
   type = "ratelimit"
   namespace_id = "1001"          # any unique integer within the account
   simple = { limit = 30, period = 60 }
   ```
   and in `handleTts` before the quota check: `if (env.TTS_LIMITER && !isAdmin) { const { success } = await env.TTS_LIMITER.limit({ key: session.sub }); if (!success) return json({ error: "slow down" }, 429, { "retry-after": "60" }); }`. Guarded by `env.TTS_LIMITER &&` so the Worker works without the binding.
3. **Logging**: add `console.log(JSON.stringify({ ev: "tts_gen", chars: text.length, voice: voiceName }))` after a successful Google call, and `console.warn(JSON.stringify({ ev: "tts_google_fail", status: g.status }))` on `!g.ok`. Also wrap the two swallowed errors in `ytDurations` (`:315`) and `handleFeed` (`:341`) with `console.warn(JSON.stringify({ ev: "feed_fail", id, msg: String(e && e.message) }))` — still swallowed, now visible.
4. **Observability** in `cf/wrangler.toml`:
   ```toml
   [observability]
   enabled = true
   head_sampling_rate = 1
   ```
5. **Client**: no change required (429 → browser-voice fallback). Optional: in `speakJaAuthed` (`:3424`) if `res.status === 429` set a module flag so the next few authed attempts are skipped for an hour (saves requests) — not required.
6. Deploy: `cd cf && npx wrangler deploy`.

## Data migration / compatibility
None. New KV keys `ttsq:*` expire after 2 days.

## Testing & verification
- `tools/test-worker.mjs`: export `bumpQuota` and test it with an in-memory KV stub (`{ store:new Map(), get:async k=>this.store.get(k)??null, put:async (k,v)=>{this.store.set(k,v)} }`): 1..limit → true, limit+1 → false; separate subs independent.
- Manual with `wrangler dev` and a valid Bearer: loop `curl "localhost:8787/api/tts?text=テスト$i"` for i=1..5 with `TTS_DAILY_PER_USER` temporarily set to 3 → first 3 return audio (needs a Google key in `.dev.vars`) or 503 if no key; 4th returns 429. Restore the constant.
- `npx wrangler tail` during normal study shows `tts_gen` lines only for brand-new words.
- Check KV write volume the next day: `npx wrangler kv key list --namespace-id 65cb9739891549aeb8ac804b87b8b799 --prefix ttsq:` shows one key per active user per day.

## Acceptance criteria
- [ ] A single session cannot generate more than the per-user cap per day; 429 is returned with `retry-after`.
- [ ] Admin warm path bypasses caps.
- [ ] Observability on; generation/rejection/feed failures visible in `wrangler tail`.
- [ ] Real study is unaffected (no 429s for the actual user under normal use).

## Pitfalls / notes
- KV counters are not atomic; two concurrent misses can both pass at the boundary — fine for abuse control, not for billing-exact accounting. The Google Cloud quota cap (TODO-014) is the hard stop.
- Do not count cache *hits* — they are free and unauthenticated by design.
- Keep `ADMIN_WARM_TOKEN` out of the quota (pre-warming ~1,200 clips would trip it) but note that the admin path is itself a billing lever — rotate the token if it ever leaks.
- The per-day counter adds one KV write per miss; misses are already one write each, so worst case doubles write volume under attack — which the cap then stops at 300+300 per user. Acceptable against the 1,000/day free tier only because the global cap (1,500 misses → ~3,000 writes) may exceed it — consider `TTS_DAILY_GLOBAL = 400` on the free plan.
- Build/deploy reminder: Worker-only change: `cd cf && npx wrangler deploy`.
