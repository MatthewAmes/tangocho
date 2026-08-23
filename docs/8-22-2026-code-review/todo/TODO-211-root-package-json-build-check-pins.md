# TODO-211 — Root `package.json` (build/test/check/dev/deploy scripts), `build.mjs --check`, pinned esbuild/wrangler, `.nvmrc`, `.gitattributes`

**Priority:** P0   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 8.1 (no `--check`, no target), § 8.3 (tools/package.json placement), § 8.4 (wrangler unpinned), § 8.2 (`.gitattributes`), § 9.3 step 0, F-12
**Depends on:** none   **Blocks:** TODO-213 (CI), TODO-221…227 (modularization), TODO-231/232 (tests)

## Why
Today there is no `npm test`, no `npm run build` at the root, no way for CI to verify that the committed `index.html` matches the source without copying the repo, and `npx wrangler deploy` pulls whatever wrangler is latest that day. The only reason `tools/package.json` is not at the root is a Netlify constraint that no longer exists (Netlify is now a 301). This is "step 0" of the modularization plan: every later item assumes `npm run check` exists.

## Current behaviour (verified)
- `tools/package.json`: `{ "name": "tangocho-build-tools", "private": true, "type": "module", "scripts": { "build": "node build.mjs" }, "devDependencies": { "esbuild": "^0.25.0", "react": "^18.3.1", "react-dom": "^18.3.1" } }` with description "Kept out of the repo root on purpose so Netlify keeps doing zero build steps…". Lockfile pins esbuild 0.25.12, react 18.3.1.
- `tools/build.mjs:22-25` comment: "a root package.json would make Netlify start auto-detecting a build step… Keep it that way." — stale (`netlify.toml` is a forced 301 for `/*`).
- `tools/build.mjs` always writes `index.html` in place (L81) — no dry-run.
- No `.nvmrc`/`engines`; works on Node v24.7.0. No `cf/package.json`; deploy is `cd cf && npx wrangler deploy` (documented only in `tools/REFRESH-VIDEO-INDEX.md:15`).
- `.gitignore` has `node_modules/`, `cf/public/`, `.wrangler/`, `.env*`.
- `index.html` appears in 36/45 commits; no `.gitattributes`.

## Intended behaviour
A root `package.json` that is the single entry point: `npm ci`, `npm run build`, `npm run check` (build to a temp file and diff against the committed `index.html`, exit 1 on drift), `npm test` (runs the existing two test scripts now; `node --test` later), `npm run dev` (`wrangler dev` in `cf/`), `npm run deploy`. esbuild and wrangler pinned exactly. `tools/package.json` removed (or reduced to a pointer). Node version declared.

## Implementation steps
1. Create `/package.json` at the repo root:
   ```json
   {
     "name": "tangocho",
     "private": true,
     "type": "module",
     "engines": { "node": ">=20" },
     "scripts": {
       "build": "node tools/build.mjs",
       "check": "node tools/build.mjs --check",
       "test": "node tools/test-fsrs.mjs && node tools/test-input-engine.mjs",
       "dev": "npm run build && wrangler dev --config cf/wrangler.toml",
       "deploy": "npm run check && wrangler deploy --config cf/wrangler.toml",
       "deploy:short": "wrangler deploy --config cf/short/wrangler.toml"
     },
     "devDependencies": {
       "esbuild": "0.25.12",
       "react": "18.3.1",
       "react-dom": "18.3.1",
       "wrangler": "4.x.y"
     }
   }
   ```
   Pin `wrangler` to the exact version currently installed by `npx wrangler --version` on the deploy laptop (run it and paste the number); do not use `^`.
2. `git mv tools/package.json tools/package.json.bak` → delete after the root one works; move `tools/package-lock.json` → regenerate with `npm install` at the root and commit the new `package-lock.json`. Update `.gitignore` if needed (`node_modules/` already covers root).
3. `tools/build.mjs`: remove the `nodePaths` hack (L40) once `node_modules` is at the root (esbuild resolves from the importing file's ancestors — `JpnFlashcards.jsx` is at the root, so root `node_modules` works); update the stale header comment (L3-4, L22-25) to say the build writes `index.html` + `cf/public/` and that the root `package.json` is the entry point.
4. Add `--check` to `tools/build.mjs`: after computing `out` (L80):
   ```js
   const CHECK = process.argv.includes("--check");
   if (CHECK) {
     const prev = fs.readFileSync(HTML, "utf8");
     const norm = (s) => s.replace(/<meta name="build" content="[^"]*">/, "").replace(/__BUILD__|"git-[0-9a-f]{7,}(-dirty)?"/g, "");
     if (norm(prev) !== norm(out)) {
       console.error("CHECK FAILED — index.html is out of date. Run `npm run build` and commit index.html.");
       process.exit(1);
     }
     console.log("ok  index.html matches source"); process.exit(0);
   }
   ```
   (Once TODO-210 lands, `norm` must strip the injected stamp exactly as it is embedded; if the deterministic `git-<sha>` stamp is chosen, the committed file and a CI build of the same commit are byte-identical and `norm` can be the identity.) `--check` must not write `index.html` or `cf/public/`.
5. `.nvmrc` containing `22` (matches the CI node version in TODO-213; v24 also works). `.gitattributes` containing `index.html -diff` and `data/videos.json -diff` so `git log -p` stays readable.
6. Update `tools/REFRESH-VIDEO-INDEX.md:13-15` to use `npm run build` / `npm run deploy`.

## Data migration / compatibility
Developers must run `npm ci` at the root instead of `cd tools && npm install`. Nothing user-facing.

## Testing & verification
- `rm -rf node_modules tools/node_modules && npm ci && npm run build` → same output line as before ("feeds 17 sources…", "ok bundle …"); `git diff --stat index.html` empty on a clean tree (before any JSX change).
- `npm run check` → exit 0 on a clean tree. Edit one character in `JpnFlashcards.jsx` (e.g. a comment) → `npm run check` → exit 1 with the message; revert.
- `npm test` → "all 32 FSRS tests passed" and "all 36 tests passed".
- `npx wrangler --version` inside the repo prints the pinned version.
- `npm run dev` serves `http://localhost:8787/` with the app and `/api/feed?src=rd-nhkeasier` working (needs a throwaway `cf/.dev.vars` with `SESSION_SECRET=dev` — see TODO-236).

## Acceptance criteria
- [ ] Root `package.json` + lockfile committed; `tools/package.json` removed.
- [ ] `npm run build`, `npm run check`, `npm test`, `npm run dev`, `npm run deploy` all work.
- [ ] esbuild + wrangler pinned exactly; `.nvmrc` + `.gitattributes` present.
- [ ] `tools/build.mjs` header comment and REFRESH doc updated.

## Pitfalls / notes
- `wrangler dev --config cf/wrangler.toml` resolves `assets.directory = "./public"` relative to the config file — fine. If not, `cd cf && npx wrangler dev` in the script instead.
- Keep `tools/build.mjs` writing `cf/public/` in non-check mode — `wrangler deploy` needs it.
- Theme A's Netlify-deletion item removes `netlify/` and maybe `netlify.toml`; this item only edits comments that reference Netlify.
