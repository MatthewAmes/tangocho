# TODO-011 — Fix the Worker's `iso8601ToSeconds` regex (`(d+)` → `(\d+)`), make `T` optional, add a test

**Priority:** P2   **Effort:** XS   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 5.1 (MEDIUM, verified `PT5M30S → 0`); 04-security-review § INFO-14; 05-expansion § QW-4; 06-architecture § 1, F-4
**Depends on:** none (test file shared with TODO-005 if that lands first)   **Blocks:** none

## Why
The regex in `iso8601ToSeconds` matches the literal letter `d`, so every YouTube Data API duration parses to 0. `ytDurations` therefore never caches `dur:<id>` (re-asking the API on every `dur=1` request, spending quota for nothing), feed-resolved items never get `sec`, the Input tab's time-budget filter and "· N min" label are inert for the 17 feed-backed sources, and the enriched-cache write-back at the end of `handleFeed` never runs. The correct helper already exists in `tools/yt-index.mjs` (which is why the indexed videos *do* have durations).

## Current behaviour (verified)
- `cf/src/index.js:284-288`:
  ```js
  function iso8601ToSeconds(d) {
    const m = /^P(?:(d+)D)?T(?:(d+)H)?(?:(d+)M)?(?:(d+)S)?$/.exec(d || "");
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }
  ```
  Node check: `PT5M30S → 0`, `PT1H2M3S → 0`, `P1DT2H → 0`.
- `:309-314` `ytDurations` skips `!sec` results, so nothing is ever stored under `dur:<id>`.
- `:347-357` `handleFeed` `dur=1` branch: `got` stays 0 → no write-back.
- `tools/yt-index.mjs:89-92` has the correct form:
  ```js
  const iso = (d) => {
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
    return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
  };
  ```
- The Worker has no tests; none of its helpers are exported.

## Intended behaviour
- `iso8601ToSeconds("PT5M30S") === 330`, `"PT1H2M3S" === 3723`, `"P1DT2H" === 93600`, `"P1D" === 86400`, `"PT0S" === 0`, `"" === 0`, `"garbage" === 0`.
- Durations are cached and returned to the client; the feed cache is rewritten with `sec` filled in.

## Implementation steps
1. Replace the regex at `cf/src/index.js:285` with the `yt-index.mjs` form:
   ```js
   const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
   ```
2. Export the helper for tests (append at the bottom of `cf/src/index.js`, keep `export default`):
   ```js
   export { iso8601ToSeconds, parseFeed, unent };
   ```
   (If TODO-005 already added an export line, extend it.)
3. Create or extend `tools/test-worker.mjs` (plain Node, same style as `tools/test-fsrs.mjs`):
   ```js
   import { iso8601ToSeconds, parseFeed } from "../cf/src/index.js";
   let fail = 0, run = 0;
   const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
   const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
   t("PT5M30S", () => eq(iso8601ToSeconds("PT5M30S"), 330));
   t("PT1H2M3S", () => eq(iso8601ToSeconds("PT1H2M3S"), 3723));
   t("P1DT2H", () => eq(iso8601ToSeconds("P1DT2H"), 93600));
   t("P1D (no T)", () => eq(iso8601ToSeconds("P1D"), 86400));
   t("junk → 0", () => { eq(iso8601ToSeconds(""), 0); eq(iso8601ToSeconds("abc"), 0); eq(iso8601ToSeconds(undefined), 0); });
   t("parseFeed atom", () => { const items = parseFeed('<feed><entry><title>A &amp; B</title><yt:videoId>abc123</yt:videoId><published>2026-08-01T00:00:00Z</published></entry></feed>', 10); eq(items.length, 1); eq(items[0].url, "https://www.youtube.com/watch?v=abc123"); eq(items[0].title, "A & B"); eq(items[0].vid, "abc123"); });
   t("parseFeed rss itunes:duration", () => { const items = parseFeed('<rss><item><title>Ep</title><link>https://x/y</link><pubDate>Mon, 01 Aug 2026 00:00:00 GMT</pubDate><itunes:duration>12:34</itunes:duration></item></rss>', 10); eq(items[0].sec, 754); });
   console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} worker tests passed`); process.exit(fail ? 1 : 0);
   ```
   Importing `cf/src/index.js` in Node works because the module has no top-level side effects (it only defines functions and an object) — verify with `node tools/test-worker.mjs`.
4. Deploy the Worker: `cd cf && npx wrangler deploy`. No client rebuild needed.
5. After deploy, `curl "https://tangocho.deskbuddies.workers.dev/api/feed?src=ci-tanaka&n=5&dur=1"` → items carry `sec` *if* the YouTube Data API v3 is enabled for the project's key (commit `110a16f` says the Worker 403s today and writes `dur:disabled` for an hour; the fix is still required so durations appear the moment it is enabled — see TODO-014 for the key split).

## Data migration / compatibility
- Cached feed JSON (`feed:v2:*`) without `sec` expires within `FEED_TTL` (6 h) and is rewritten with durations on the next `dur=1` request — no `FEED_SCHEMA` bump needed because the shape did not change (`sec` was always optional).

## Testing & verification
- `node tools/test-worker.mjs` → all pass.
- `wrangler tail` while calling `/api/feed?…&dur=1`: no exceptions; a second call within the hour is served from the `dur:<id>` cache (no YouTube API request — verify by temporarily logging).
- In the app: Input → "Show me 3 things" for a feed-backed listening source shows "· N min" on the pick.

## Acceptance criteria
- [ ] Regex fixed; `T` optional; tests pass.
- [ ] `dur:<id>` keys appear in the TTS KV namespace after a `dur=1` request (`npx wrangler kv key list --namespace-id 65cb9739891549aeb8ac804b87b8b799 --prefix dur:`) once the API is enabled.

## Pitfalls / notes
- Keep the `dur:disabled` 1-hour backoff logic; only the parser changes.
- `ytDurations` uses `env.GOOGLE_TTS_API_KEY` for YouTube — TODO-014 introduces `YOUTUBE_API_KEY`; land whichever first, the regex fix is independent.
- Build/deploy reminder for Worker-only changes: `cd cf && npx wrangler deploy` (no `index.html` change).
