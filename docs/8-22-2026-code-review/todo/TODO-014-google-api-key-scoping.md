# TODO-014 — Scope the Google API key(s): API restrictions, quota caps, split TTS vs YouTube, confirm the old key is dead

**Priority:** P2   **Effort:** XS (code) + ops   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § HIGH-2, INFO-12; 06-architecture § 11 ("Other secrets"); 01-functionality-review § 7 (YouTube uses the TTS key)
**Depends on:** none   **Blocks:** none

## Why
A Google API key was committed in `226197d` and correctly revoked/rotated in `75c7254`, but (a) nobody has re-verified the old key is dead, (b) the *current* key is used for two different APIs — Cloud Text-to-Speech (`cf/src/index.js:178`) and YouTube Data API v3 (`:304-305`) — so if it is not API-restricted a future leak grants whatever the project has enabled, and (c) there is no billing circuit breaker: an abuse of the TTS endpoint (TODO-013) or a leaked key runs until someone notices. The local tooling (`tools/yt-index.mjs`) already uses a separate `YOUTUBE_API_KEY` from `.env.local`, restricted per `tools/REFRESH-VIDEO-INDEX.md` ("restrict it to YouTube Data API v3, nothing else") — the Worker should follow the same split.

## Current behaviour (verified)
- `cf/src/index.js:176-178`:
  ```js
  if (!env.GOOGLE_TTS_API_KEY) return json({ error: "TTS not configured yet" }, 503);
  const g = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + env.GOOGLE_TTS_API_KEY, {
  ```
- `:298` `if (!missing.length || !env.GOOGLE_TTS_API_KEY) return out;` and `:304-305`:
  ```js
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=" + missing.slice(0, 50).join(",") + "&key=" + env.GOOGLE_TTS_API_KEY);
  if (r.status === 403) { await env.TTS.put("dur:disabled", "1", { expirationTtl: 3600 }); return out; }
  ```
- `cf/wrangler.toml:26-28` lists `GOOGLE_TTS_API_KEY` as a required secret; there is no `YOUTUBE_API_KEY` secret on the Worker.
- `tools/yt-index.mjs:23-28` / `tools/yt-discover.mjs:15-20` read `YOUTUBE_API_KEY` from `.env.local` (gitignored).
- Commit `75c7254` message: "Revoked that key in Google Cloud, issued a new one…".

## Intended behaviour
- Worker uses `GOOGLE_TTS_API_KEY` only for Cloud TTS (key restricted to the Cloud Text-to-Speech API) and `YOUTUBE_API_KEY` for YouTube Data API v3 (key restricted to that API), falling back to the TTS key only if the YouTube key is unset (so nothing breaks before the secret is added).
- The old leaked key returns `API key not valid` (verified).
- Google Cloud project has a daily quota cap on Text-to-Speech characters and a billing budget alert.

## Implementation steps
1. **Worker code** (`cf/src/index.js:298`, `:305`):
   ```js
   const ytKey = env.YOUTUBE_API_KEY || env.GOOGLE_TTS_API_KEY;   // separate key preferred; TTS key as fallback during migration
   if (!missing.length || !ytKey) return out;
   …
   + "&key=" + ytKey);
   ```
   Update the `wrangler.toml` secrets comment: `Required: SESSION_SECRET, GOOGLE_TTS_API_KEY (Cloud TTS only), ADMIN_WARM_TOKEN. Optional: YOUTUBE_API_KEY (YouTube Data API v3 only; falls back to the TTS key).`
2. **Google Cloud console** (project that owns the client ID `249268364314-…`): APIs & Services → Credentials:
   - Confirm the key from `226197d` (`git show 226197d -- netlify/functions/tts.mjs | grep -o 'AIzaSy[A-Za-z0-9_-]*' | head -1`) is **deleted** — do not just check "restricted"; then run `curl -s "https://www.googleapis.com/youtube/v3/videos?part=id&id=8FhnCK0q-3k&key=<OLDKEY>"` and expect `API_KEY_INVALID`.
   - Current TTS key: *API restrictions* → Restrict key → **Cloud Text-to-Speech API** only. *Application restrictions*: "None" is required for a server-side key (no referrer/IP to pin from Workers); rely on API restriction + quota.
   - Create a second key `tangocho-worker-youtube`: API restrictions → **YouTube Data API v3** only. Enable that API on the project if it is not (commit `110a16f` notes durations 403 today because it is not enabled). Then `cd cf && npx wrangler secret put YOUTUBE_API_KEY` (paste at the prompt).
   - IAM & Admin → Quotas: Cloud Text-to-Speech → set a per-day cap on "Characters per day" (e.g. 200,000 — the whole deck + scripts is ~10-20k characters; pre-warming is a one-off); YouTube Data API v3 default 10,000 units/day is fine.
   - Billing → Budgets & alerts: a $5/month budget with email alerts at 50/90/100%.
3. Deploy the Worker: `cd cf && npx wrangler deploy`. Verify `npx wrangler secret list` shows `YOUTUBE_API_KEY`.
4. Record in the repo where these live: add to the `wrangler.toml` comment "Keys are created in Google Cloud project <id>; TTS key restricted to Cloud TTS, YouTube key to Data API v3; TTS chars/day capped in Quotas." (Theme C's RUNBOOK will expand this.)

## Data migration / compatibility
None. Until `YOUTUBE_API_KEY` is set, the fallback keeps current behaviour (which 403s anyway until the API is enabled).

## Testing & verification
- `curl` with the old key → invalid. `curl "https://texttospeech.googleapis.com/v1/voices?key=<NEW_YT_KEY>"` → 403 (restricted to YouTube) and `…/youtube/v3/videos?part=id&id=8FhnCK0q-3k&key=<NEW_YT_KEY>` → 200 — run these locally, never in CI, never paste keys into files.
- After deploy: `curl "https://tangocho.deskbuddies.workers.dev/api/feed?src=ci-tanaka&n=3&dur=1"` → items include `sec` (requires TODO-011's regex fix).
- TTS still works for a new word when signed in (`wrangler tail` shows no 4xx from Google).

## Acceptance criteria
- [ ] Old key deleted and verified invalid.
- [ ] TTS key restricted to Cloud TTS; separate YouTube key restricted to Data API v3; Worker uses `YOUTUBE_API_KEY`.
- [ ] Daily TTS character quota cap and a billing alert exist.

## Pitfalls / notes
- Do not set HTTP-referrer restrictions on a key used from the Worker — requests carry no browser referrer and will be rejected.
- `ADMIN_WARM_TOKEN` is the other billing lever; it is not a Google credential but treat it with the same care (TODO-001 step 5).
- Build/deploy reminder: Worker-only change (`cd cf && npx wrangler deploy`).
