# TODO-012 — Security headers from the Worker: CSP (GIS-compatible), frame-ancestors, nosniff, Referrer-Policy, HSTS

**Priority:** P1   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § MEDIUM-8 (live `curl -sI` shows no security headers; GIS script without SRI); 06-architecture § 3.1
**Depends on:** TODO-016 (removes the only cross-origin `fetch` — `api.anthropic.com` — so `connect-src` can be tight)   **Blocks:** none

## Why
The Worker serves `index.html` via `env.ASSETS.fetch(req)` with no header augmentation: no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS. The app holds a 2-year bearer token in localStorage; any future injection would run unrestricted and exfiltrate it, and the app is framable (clickjacking). A CSP that still allows Google Identity Services, the inline app bundle, data-URI mascots and blob audio is cheap and high-value. SRI on the GIS script is impractical (Google rotates it); allow-listing its origin in CSP is the right control.

## Current behaviour (verified)
- `cf/src/index.js:361-370`:
  ```js
  export default {
    async fetch(req, env) {
      const { pathname } = new URL(req.url);
      if (pathname === "/api/sync" || …) return handleSync(req, env);
      if (pathname === "/api/tts" || …) return handleTts(req, env);
      if (pathname === "/api/feed" || …) return handleFeed(req, env);
      return env.ASSETS.fetch(req);
    },
  };
  ```
- `index.html` (committed artifact, 14 lines of head): L2 `<html lang="ja">`, L10 inline `<style>html,body{…}</style>`, L11 `<script src="https://accounts.google.com/gsi/client" async defer></script>`, L14 `<div id="root"></div>`, L15 the inline `<script>…bundle…</script>`.
- What the page loads/uses (grep of `JpnFlashcards.jsx`): React injects `<style>{CSS}</style>` (`:1447`) → inline style element; `<img src="data:image/gif;base64,…">` mascots (`data/mascot.js`, `:1252`); CSS `background-image:url("data:image/svg+xml,…")` (`:6077`); `new Audio()` playing `/.netlify/functions/tts?…` (same origin) and `blob:` object URLs (`:3405-3431`); `fetch` to same-origin `/.netlify/functions/sync|tts|feed` and `/videos.json` (`:1056, 1135, 1171, 3389, 3422, 4203, 4627`); one cross-origin `fetch` to `https://api.anthropic.com` (`:2184`, dead — removed by TODO-016); `window.open(url, "_blank", "noopener,noreferrer")` for external links (`:4671`, navigation — not governed by CSP); GIS (`window.google.accounts.id.initialize/renderButton`, `:1076`, `:1090`) which injects an iframe and styles from `accounts.google.com`. No external fonts, no external images, no web workers, no `eval`.
- `cf/wrangler.toml` assets binding: `not_found_handling = "single-page-application"` — `/favicon.ico` etc. return the HTML.

## Intended behaviour
- Every non-API response gets: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- API JSON/audio responses get `X-Content-Type-Options: nosniff` (CSP is irrelevant for them).
- Sign-in, TTS, feeds, mascots, and the Input tab all still work. The CSP is first deployed as `Content-Security-Policy-Report-Only` for a few days, then enforced.

## Implementation steps
1. **Add a header helper** in `cf/src/index.js` (near `json`):
   ```js
   // GIS requirements per https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy
   // (verify against that page when editing — Google occasionally changes the paths).
   const CSP = [
     "default-src 'self'",
     "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",   // the app is one inline <script>; see step 5 for the hash upgrade
     "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",     // React's <style>{CSS}</style> + head <style> + GIS button styles
     "img-src 'self' data:",                                                       // mascot GIF data URIs, SVG-noise background
     "media-src 'self' blob:",                                                     // TTS: same-origin clips + object URLs
     "connect-src 'self' https://accounts.google.com/gsi/",
     "frame-src https://accounts.google.com/gsi/",
     "font-src 'self'",
     "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
   ].join("; ");
   const SECURITY_HEADERS = {
     "x-content-type-options": "nosniff",
     "referrer-policy": "strict-origin-when-cross-origin",
     "x-frame-options": "DENY",
     "strict-transport-security": "max-age=31536000; includeSubDomains",
     "permissions-policy": "camera=(), microphone=(), geolocation=()",
   };
   function withSecurityHeaders(res, { csp = true, reportOnly = false } = {}) {
     const h = new Headers(res.headers);
     for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
     if (csp) h.set(reportOnly ? "content-security-policy-report-only" : "content-security-policy", CSP);
     return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
   }
   ```
2. **Wrap responses** in `fetch`:
   ```js
   if (pathname === "/api/sync" || …) return withSecurityHeaders(await handleSync(req, env), { csp: false });
   … same for tts/feed …
   const asset = await env.ASSETS.fetch(req);
   const isHtml = (asset.headers.get("content-type") || "").includes("text/html");
   return withSecurityHeaders(asset, { csp: isHtml, reportOnly: true });   // flip reportOnly → false after verification
   ```
   (For `videos.json` CSP is harmless either way; gating on HTML keeps headers minimal.)
3. **Deploy report-only** (`cd cf && npx wrangler deploy`). Open the app in Chrome and Safari; do the full checklist: sign in with Google (button renders, popup/iframe works, session exchanged), play TTS (cached + new word), Input "Show me 3 things", Scripts rehearse with voice, Browse backup download, mascot visible. Watch the console for `[Report Only]` CSP violations; add any missing GIS origin/path (common ones: `https://accounts.google.com/gsi/` for `connect-src`/`frame-src`, `https://accounts.google.com/gsi/style` for `style-src`). If GIS One-Tap/FedCM is ever enabled, `connect-src` may need `https://accounts.google.com/gsi/` (already there).
4. **Enforce**: set `reportOnly: false`, redeploy, repeat the checklist.
5. **Optional hardening (hash instead of `'unsafe-inline'` for scripts)**: in `tools/build.mjs` after `code` is produced, compute `const hash = "sha256-" + crypto.createHash("sha256").update(code).digest("base64");` and write `cf/src/csp.json` → `{ "scriptHash": "sha256-…" }` (commit it; it changes with every build). In the Worker: `import csp from "./csp.json";` and use `"script-src 'self' '" + csp.scriptHash + "' https://accounts.google.com/gsi/client"`. The head `<style>` and React's style element still need `'unsafe-inline'` in `style-src` (acceptable; style injection is not a token-exfil vector). Keep `'unsafe-inline'` out of `script-src` once the hash is in place. Note: the hash must be of the exact inline script text — `code` as spliced (no surrounding whitespace). Verify in devtools: no CSP error on load.
6. `X-Frame-Options: DENY` duplicates `frame-ancestors 'none'` for old browsers — keep both.

## Data migration / compatibility
None.

## Testing & verification
- `curl -sI https://tangocho.deskbuddies.workers.dev/ | grep -i -E "content-security|x-frame|nosniff|referrer|strict-transport|permissions-policy"` → all present.
- `curl -sI https://tangocho.deskbuddies.workers.dev/api/feed?src=ci-tanaka | grep -i nosniff` → present; no CSP header on API responses.
- Browser checklist in step 3 passes with zero CSP violations in the console under enforcement (Chrome + iOS Safari — GIS behaves differently on each).
- Try to frame the app from another origin (a local HTML file with `<iframe src="https://tangocho…">`) → blocked.
- Add to `tools/test-worker.mjs`: `withSecurityHeaders(new Response("x", {headers:{"content-type":"text/html"}}))` has CSP + nosniff; with `{csp:false}` has nosniff but no CSP.

## Acceptance criteria
- [ ] Headers present on HTML; nosniff on all responses.
- [ ] Sign-in, TTS (both paths), feeds, mascot, backup all work with CSP enforced; console clean.
- [ ] Framing blocked.

## Pitfalls / notes
- Do not enforce on the first deploy; GIS paths are the part most likely to need a tweak.
- Keep `'unsafe-inline'` in `style-src` — React's `<style>{CSS}</style>` (`:1447`) needs it, and `inline style={{}}` attributes are CSSOM writes (not affected).
- `connect-src 'self'` also covers the legacy `/.netlify/functions/*` paths (same origin). `api.anthropic.com` must stay out (TODO-016).
- The `cf/short` redirect Worker needs nothing.
- The page is also served by Netlify? No — Netlify 301s to the Worker; headers belong here only.
- Build/deploy reminder: Worker-only change unless you adopt step 5 (then `cd tools && node build.mjs` regenerates `cf/src/csp.json`; commit both `index.html` and `csp.json`, then `cd cf && npx wrangler deploy`).
