# tangocho

A Japanese study app — flashcards with an FSRS memory model, plus Kanji, Dates, Oral and
video-immersion tabs. Live at <https://tangocho.deskbuddies.workers.dev>.

Matthew does not write code. Drive the machine directly — install, build, commit and verify
yourself rather than handing over commands to run. When he genuinely has to act (a browser
sign-in, an authorize button), give click-by-click steps and say which step is his.

## Two machines, one repo

This project is worked on from **several computers** — a laptop, a home Windows PC and a
work machine — using Claude Code on all of them. Claude Code conversations are stored per-machine and **do not sync**. Git is
the only thing that crosses over, which is why this file exists: it is the shared briefing
both sides read.

- **`dev` is the working branch, and it is what is deployed.** `main` is stale (it was last
  touched 2026-08-04 and is 16 commits behind). Do not assume `main` is current.
- **Pull before starting work. Push when finishing.** The most likely way to lose an
  afternoon here is building on a stale checkout, not a subtle bug.
- Don't work on two machines at once.

### This is automated now

`.claude/settings.json` (committed, so every machine gets it) wires two hooks:

- **SessionStart** runs `tools/hooks/session-start.sh`: fetches, and fast-forwards if the
  branch is simply behind. It reports what it pulled as context. It deliberately refuses to
  pull when the tree is dirty or the branch has genuinely diverged — a fast-forward is
  always safe, anything else is a real decision and says so instead.
- **Stop** runs `tools/hooks/session-stop.sh`: warns when the turn ends with uncommitted or
  unpushed work. Silent otherwise.

So the pull is not something to remember. The push still is — do it at the end of a change.

## Build

`index.html` is the single deployed artifact — one self-contained file with the whole React
app inlined. **`JpnFlashcards.jsx` is the source; `index.html` is output.** Never hand-edit
`index.html`.

```
npm run build          # or: cd tools && node build.mjs
```

`tools/build.mjs` bundles with esbuild, runs sanity checks (a ReactDOM mount call must
survive, feed lists in the app and Worker must agree, Oral content must stay kana-only) and
splices the result into `index.html`, mirroring it to `cf/public/`. It hard-fails rather
than writing an `index.html` that loads but renders nothing — a build once shipped without
its mount call and produced a blank page. Trust its refusals.

The build's own dependencies live in `tools/`. There is also a thin root `package.json`
holding convenience scripts (`npm run dev` / `build` / `test` / `deploy` / `login`) and a
pinned wrangler; its postinstall installs `tools/` too, so a fresh machine needs one
`npm install`. See `SETUP.md` for the new-machine checklist.

A root `package.json` used to be forbidden because Netlify would auto-detect a build from
it. `netlify.toml` now pins `[build]` to a no-op explicitly, so that hazard is stated in
config rather than resting on a file staying absent.

## Deploy

```
npm run deploy         # builds first, then deploys
```

CI (`.github/workflows/ci.yml`) also deploys **every push to `dev`** once the
`CLOUDFLARE_API_TOKEN` repository secret is set (create the token from the "Edit
Cloudflare Workers" template; the account id is pinned in the workflow). Until the secret
exists the deploy job skips itself and CI just runs tests + build + a drift check that
`index.html` matches the source. With the secret in place, pushing dev IS deploying —
including from a phone via a merged PR — so don't push dev mid-experiment; that's what
local `npm run deploy` and branches are for. A local deploy needs credentials for
MATTHEW's Cloudflare account: on his machines the stored wrangler login is right; on
anyone else's, export his `CLOUDFLARE_API_TOKEN` in that terminal window first (never
commit it, never paste it into a Claude chat).

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
git checkout --ours index.html && npm run build
```

Resolve real conflicts in `JpnFlashcards.jsx`. `.gitattributes` marks both `index.html` and
`data/videos.json` as unmergeable so git won't attempt this on its own.
