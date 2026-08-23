# TODO-236 — CONTRIBUTING.md (dev setup & conventions), `.env.example` + `cf/.dev.vars.example`, CLAUDE.md

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 8.7 (environment setup gaps), § 10.2 outlines for CONTRIBUTING/DEVELOPMENT and CLAUDE.md, § 8.5 (SEED bump process), F-13; 04-security (never commit secrets; `.env.local` is ignored)
**Depends on:** TODO-211 (scripts)   **Blocks:** none

## Why
Nothing tells a contributor (human or Claude session) which Node version to use, that `index.html` must be rebuilt and committed with every source change, that `SEED_VERSION` must be bumped, which env vars the tools need (`YOUTUBE_API_KEY` in `.env.local`), what `wrangler dev` needs in `.dev.vars`, or the commit-message convention that makes this repo's history so useful. `.claude/` is gitignored, so any local Claude conventions are invisible to the repo — a `CLAUDE.md` fixes that.

## Current behaviour (verified)
- No CONTRIBUTING/DEVELOPMENT/CLAUDE.md; `.gitignore` ignores `.claude/`, `.env`, `.env.local`, `.wrangler/`, `cf/public/`, `node_modules/`.
- Tools reading env: `tools/yt-index.mjs:23-28` and `tools/yt-discover.mjs:15-20` read `YOUTUBE_API_KEY` from `.env.local` (report 04 LOW-11).
- Worker secrets: `SESSION_SECRET`, `GOOGLE_TTS_API_KEY`, `ADMIN_WARM_TOKEN` (`cf/wrangler.toml` footer comment); set via `wrangler secret put`.
- Conventions visible in the code: `tc-` CSS prefix (484 uses), why-comments, Co-Authored-By Claude trailers, `SEED_VERSION` comment L14 "bump this each time I add/update words".
- `eslint-disable-line react-hooks/exhaustive-deps` appears twice (L4568, L4629) but no ESLint config is committed.

## Intended behaviour
Three short files that let someone go from clone to a deployed change without asking questions, plus example env files that contain **no real values**.

## Implementation steps
1. **CONTRIBUTING.md** (~100 lines):
   1. Prereqs: Node (`.nvmrc`), `npm ci`; optional `wrangler login` for deploys; Playwright browsers for e2e.
   2. Daily loop: edit source → `npm run build` (regenerates `index.html` + `cf/public/`) → `npm test` → `npm run dev` for the Worker-backed local app (`http://localhost:8787`) or `python3 -m http.server 8765` for static-only → commit **source + `index.html` together** → push; CI checks drift.
   3. Local env: copy `cf/.dev.vars.example` → `cf/.dev.vars` (throwaway `SESSION_SECRET=dev-only`; leave the Google key empty unless testing TTS generation); copy `.env.example` → `.env.local` for the YouTube tools.
   4. Adding a storage key: register in `K` (`src/lib/storage.js`), decide synced vs `SYNC_SKIP_KEYS`, choose a merge rule or `LAST_WINS`, add to backup if user data, document in DATA-SCHEMA — CI invariants enforce the first two.
   5. Adding a tab: file under `src/tabs/`, wire in `App.jsx` nav + `TAB_ALIAS`, CSS under its own `/* ── tab ── */` section with `tc-` prefix, run `tools/check-css.mjs`.
   6. SEED changes: append rows (never reorder), bump `SEED_VERSION`, `npm run build` (invariants: no duplicate `term|lesson|sec`, version bumped), deploy, open the app once and confirm the merge log/snapshot.
   7. Conventions: why-comments over what-comments; commit bodies carry data + verification + rejected alternatives (cite two exemplary hashes, e.g. `2acc723`, `22cf183`); Co-Authored-By trailer when Claude co-wrote; no secrets in tracked files; never edit `index.html` by hand.
   8. Pre-deploy checklist: tests green, `npm run check`, manual smoke list (sign-in, sync banner, TTS, one session per tab, backup/restore), note in the commit body.
   9. Optional: commit an `eslint.config.js` with `eslint-plugin-react-hooks` (flat config) and `npm run lint` — only if kept green.
2. **`.env.example`** (root): `# Used only by tools/yt-*.mjs (video index refresh). Restrict the key to YouTube Data API v3.\nYOUTUBE_API_KEY=`.
3. **`cf/.dev.vars.example`**: `# Copy to cf/.dev.vars for `npm run dev`. Never commit cf/.dev.vars.\nSESSION_SECRET=dev-only-not-secret\nGOOGLE_TTS_API_KEY=\nADMIN_WARM_TOKEN=` and add `cf/.dev.vars` to `.gitignore` (wrangler ignores it by convention, but be explicit).
4. **CLAUDE.md** (root, ~60 lines):
   - Project summary (one paragraph) + "progress is the one thing that can't be regenerated" principle.
   - Commands: `npm ci`, `npm run build`, `npm test`, `npm run check`, `npm run dev`, `npm run deploy`, `node tools/make-mascot.mjs`, video refresh doc.
   - Rules: never hand-edit `index.html`; always rebuild and commit it with the source; bump `SEED_VERSION` on SEED edits; never introduce client-side Anthropic/Google API calls or keys (the key goes in a Worker secret); keep `tc-` CSS prefix; write why-comments; describe manual verification in commit bodies.
   - Where things live (tree) and which files are generated.
   - Pointers: ARCHITECTURE.md, DATA-SCHEMA.md, RUNBOOK.md, CONTRIBUTING.md, `tools/REFRESH-VIDEO-INDEX.md`, `docs/8-22-2026-code-review/` (this review + TODO index).
5. Link all from README.

## Data migration / compatibility
none

## Testing & verification
- Fresh clone → follow CONTRIBUTING literally → `npm run dev` serves the app and `/api/feed?src=rd-nhkeasier` returns JSON with only the example `.dev.vars`.
- `git grep -n "AIza\|d89497a7" -- ':!docs'` → no matches in the new files.
- A new Claude Code session reads CLAUDE.md and correctly rebuilds + commits `index.html` after a trivial change (dry run).

## Acceptance criteria
- [ ] CONTRIBUTING.md, `.env.example`, `cf/.dev.vars.example`, CLAUDE.md committed; `.gitignore` covers `cf/.dev.vars`.
- [ ] Every command in CONTRIBUTING verified on a clean clone.
- [ ] No secret values in any tracked file.

## Pitfalls / notes
- Keep CLAUDE.md short and imperative; long rationale belongs in ARCHITECTURE.
- Theme A's secret-rotation and netlify-deletion items may change the secrets list — reference RUNBOOK as the source of truth for secrets.
