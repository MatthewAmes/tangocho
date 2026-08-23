# TODO-214 — PWA manifest, home-screen icons, favicon, apple-touch-icon served as real assets

**Priority:** P2   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 9 PWA-ness, § Prioritised fix list #13; 05-expansion § QW-12, § 5.1
**Depends on:** TODO-210 (build pipeline touches)   **Blocks:** TODO-215 (service worker precaches these)

## Why
There is no manifest, no icon, no favicon. Android "Add to Home Screen" gives a browser shortcut, not an app; iOS uses a page screenshot as the icon; every desktop tab open fetches `/favicon.ico`, which the SPA fallback answers with the **whole 226 KB app HTML** (`/favicon.ico` and `/manifest.json` both return `200 text/html` from the Worker). The pixel nigiri already exists as a rasterisable sprite (`tools/make-mascot.mjs`).

## Current behaviour (verified)
- `index.html:1-12` head: viewport, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color #1a1a2e`, title, inline style, GSI script. No `<link rel="manifest">`, `<link rel="icon">`, `<link rel="apple-touch-icon">`.
- `cf/wrangler.toml` `[assets] directory="./public" not_found_handling="single-page-application"` → any unknown path returns `index.html`.
- `tools/build.mjs:83-102` copies `index.html` and `data/videos.json` into `cf/public/` (gitignored).
- `tools/make-mascot.mjs` draws a 32×30 pixel sprite per mood (`PAL`, `rice()`, `salmon()`, `nori()`, …) and encodes GIFs via `tools/gifenc.mjs`; `data/mascot.js` exports `MASCOT_GIFS`.
- `cf/src/index.js:362-368` routes `/api/*` and falls through to `env.ASSETS.fetch(req)`.

## Intended behaviour
`cf/public/` (and a committed `public/` source folder) contains `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180×180), `favicon.ico` (or `favicon.svg` + 32px PNG). `index.html` links them. Lighthouse "Installable" passes; `/favicon.ico` returns an image, not HTML.

## Implementation steps
1. **Icon generation.** Add `tools/make-icons.mjs` that reuses the sprite drawing from `make-mascot.mjs` (export a `drawFrame(mood)` returning the `W×H` palette-index grid) and writes PNGs with no new dependency by emitting a minimal PNG encoder (zlib via `node:zlib` `deflateSync`, CRC32 table — ~60 lines), scaling nearest-neighbour ×6 (192), ×16 (512) with a solid `#0c1122` background for the maskable variant (sprite centred in the safe zone, 80% of the canvas) and transparent background for the standard icons. Output to `/public/icons/*.png` (new, committed, small: ~2–8 KB each). If writing a PNG encoder is unwelcome, add `pngjs` as a devDependency instead — keep it out of the runtime bundle.
2. **Manifest** `/public/manifest.webmanifest`:
   ```json
   {
     "name": "単語帳 — tangocho",
     "short_name": "単語帳",
     "description": "JPN 101 flashcards, kana, scripts and comprehensible input",
     "start_url": "/?source=pwa",
     "scope": "/",
     "display": "standalone",
     "orientation": "portrait",
     "background_color": "#0c1122",
     "theme_color": "#0c1122",
     "lang": "en",
     "icons": [
       { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
       { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
     ]
   }
   ```
3. **Head links** in `index.html` (after `<title>`):
   ```html
   <link rel="manifest" href="/manifest.webmanifest">
   <link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192">
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
   <meta name="apple-mobile-web-app-title" content="単語帳">
   ```
   Keep `theme-color` in sync with TODO-208 (`#0c1122`).
4. **Build copies** — in `tools/build.mjs` after the videos copy (L102): `fs.cpSync(path.join(ROOT, "public"), CF_PUBLIC, { recursive: true });` (Node ≥16.7). Also copy `public/favicon.ico`.
5. **favicon.ico**: generate a 32×32 PNG and name it `favicon.png`, link it with `<link rel="icon" href="/favicon.png" type="image/png">`, **and** add a real `/favicon.ico` (ICO container with one 32×32 PNG entry is ~40 lines; or just copy the PNG to `favicon.ico` — browsers sniff) so the bare `/favicon.ico` request stops returning HTML.
6. Optional Worker hardening: in `cf/src/index.js` fetch handler, for paths with an extension (`/\.[a-z0-9]+$/`) that the asset binding 404s, return a real 404 instead of the SPA fallback — `const res = await env.ASSETS.fetch(req); if (res.status === 404 ...)` is not reachable with `single-page-application` mode; instead set `not_found_handling = "404-page"` **only if** the app has no deep links (it doesn't — all state is in-memory; the only URL is `/`). Decide with TODO-215 (SW) in mind and document in ARCHITECTURE.

## Data migration / compatibility
none. `?source=pwa` on `start_url` is ignored by the app (no router) — harmless; it lets the Worker logs distinguish installs.

## Testing & verification
- `npm run build && ls cf/public/icons cf/public/manifest.webmanifest`.
- Local: `cd cf && npx wrangler dev` → `curl -sI http://localhost:8787/manifest.webmanifest | grep content-type` → `application/manifest+json`; `curl -sI http://localhost:8787/favicon.ico` → `image/*` not `text/html`.
- Chrome DevTools → Application → Manifest: no errors, icons render; Lighthouse PWA "Installable" ✓.
- Android: Add to Home Screen → standalone window with nigiri icon; iOS: icon is the nigiri, title 単語帳.
- Prod after deploy: same curls against `https://tangocho.deskbuddies.workers.dev/`.

## Acceptance criteria
- [ ] Manifest + 4 icons + favicon committed under `/public/` and copied to `cf/public/` by the build.
- [ ] `index.html` head links them; Lighthouse installable passes.
- [ ] `/favicon.ico` and `/manifest.webmanifest` return the right content types in prod.

## Pitfalls / notes
- `start_url` must be same-origin and inside `scope`; the short `jp.deskbuddies.workers.dev` redirector is not the PWA origin.
- Don't put the icons in `data/` (that folder is generated data); `public/` is source.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
