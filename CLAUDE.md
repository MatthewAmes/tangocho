# tangocho

A Japanese study app — flashcards with an FSRS memory model, plus Kanji, Dates, Oral and
video-immersion tabs. Live at <https://tangocho.deskbuddies.workers.dev>.

Matthew does not write code. Drive the machine directly — install, build, commit and verify
yourself rather than handing over commands to run. When he genuinely has to act (a browser
sign-in, an authorize button), give click-by-click steps and say which step is his.

## Two machines, one repo

This project is worked on from **two computers** — a laptop and a Windows PC — using Claude
Code on both. Claude Code conversations are stored per-machine and **do not sync**. Git is
the only thing that crosses over, which is why this file exists: it is the shared briefing
both sides read.

- **`dev` is the working branch, and it is what is deployed.** `main` is stale (it was last
  touched 2026-08-04 and is 16 commits behind). Do not assume `main` is current.
- **Pull before starting work. Push when finishing.** The most likely way to lose an
  afternoon here is building on a stale checkout, not a subtle bug.
- Don't work on both machines at once.

## Build

`index.html` is the single deployed artifact — one self-contained file with the whole React
app inlined. **`JpnFlashcards.jsx` is the source; `index.html` is output.** Never hand-edit
`index.html`.

```
cd tools && node build.mjs
```

`tools/build.mjs` bundles with esbuild, runs sanity checks (a ReactDOM mount call must
survive, feed lists in the app and Worker must agree, Oral content must stay kana-only) and
splices the result into `index.html`, mirroring it to `cf/public/`. It hard-fails rather
than writing an `index.html` that loads but renders nothing — a build once shipped without
its mount call and produced a blank page. Trust its refusals.

Node modules live in `tools/`, deliberately not at the repo root: a root `package.json`
would make Netlify start auto-detecting a build step.

## Deploy

```
cd cf && wrangler deploy
```

Cloudflare Workers serves `cf/public/` as static assets and handles `/api/sync`, `/api/tts`
and `/api/feed` in `cf/src/index.js`. State lives in two KV namespaces (`SYNC`, `TTS`).

Secrets are set with `wrangler secret put`, never committed: `SESSION_SECRET` (changing it
signs out every device), `GOOGLE_TTS_API_KEY`, `ADMIN_WARM_TOKEN`.

Netlify is retained only to 301 old URLs to the Workers app — see the comment in
`netlify.toml` for why a live-but-orphaned Netlify deploy was actively harmful.

## If git reports a conflict in index.html

Don't merge it. It is generated, and a textual merge of minified JS yields a page that
loads and renders garbage. Take either side and rebuild:

```
git checkout --ours index.html && cd tools && node build.mjs
```

Resolve real conflicts in `JpnFlashcards.jsx`. `.gitattributes` marks both `index.html` and
`data/videos.json` as unmergeable so git won't attempt this on its own.
