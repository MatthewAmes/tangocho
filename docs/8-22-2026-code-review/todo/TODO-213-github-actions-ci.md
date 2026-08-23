# TODO-213 — GitHub Actions CI: tests + build + committed-artifact drift check + bundle assertions + optional deploy

**Priority:** P0   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 8.6 (CI design), F-3 (High); 05-expansion § 5.6; 04-security HIGH-2/INFO-12 (bus factor → CI deploy)
**Depends on:** TODO-211 (root `package.json`, `--check`)   **Blocks:** TODO-231…233 (tests run here), TODO-237 (deploy/rollback runbook references CI tags)

## Why
Nothing runs the tests, nothing verifies that the committed `index.html` matches the source (it is in sync today only because the last committer was careful), and deploys depend on one authenticated laptop. A blank-page incident already happened once from a build-path problem (`90cf825`). A 40-line workflow fixes all three.

## Current behaviour (verified)
- No `.github/` directory in the repo (`ls -a` at root: `.git .gitignore JpnFlashcards.jsx cf data docs index.html netlify netlify.toml tools`).
- Tests: `node tools/test-fsrs.mjs` (32), `node tools/test-input-engine.mjs` (36) — both pass; no `npm test` until TODO-211.
- Build: `tools/build.mjs` writes `index.html` + `cf/public/`; reproducible byte-for-byte today.
- Deploy: `cd cf && npx wrangler deploy` with a local wrangler login. 0 git tags.

## Intended behaviour
On every push/PR: install, test, build, fail if `index.html` drifted, assert bundle invariants, upload `cf/public` as an artifact. On push to `main`: deploy the Worker with `CLOUDFLARE_API_TOKEN` (+ account id) and tag the commit `deploy-YYYYMMDD-HHMM-<sha>`. Secrets (`SESSION_SECRET` etc.) never touch CI — they stay in Cloudflare.

## Implementation steps
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: ci
   on:
     push: { branches: [main, dev] }
     pull_request:
     workflow_dispatch:
   concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
   permissions: { contents: write }   # for the deploy tag; drop to read if you skip tagging

   jobs:
     test-build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version-file: .nvmrc, cache: npm }
         - run: npm ci
         - name: Unit tests
           run: npm test
         - name: Build
           run: npm run build
         - name: Committed artifact must match source
           run: |
             git diff --quiet -- index.html || {
               echo "::error file=index.html::index.html is out of date — run 'npm run build' and commit it"
               git --no-pager diff --stat -- index.html; exit 1; }
         - name: Bundle assertions
           run: |
             set -e
             grep -q 'createRoot(' index.html || { echo "::error::bundle lacks the React mount"; exit 1; }
             ! grep -q 'api.anthropic.com' index.html || { echo "::error::client bundle must not call Anthropic directly"; exit 1; }
             ! grep -qE 'AIza[0-9A-Za-z_-]{30,}' index.html || { echo "::error::looks like a Google API key in the bundle"; exit 1; }
             test "$(stat -c%s index.html)" -lt 650000 || { echo "::error::index.html over the 650 KB budget"; exit 1; }
             grep -q '<meta name="build"' index.html || echo "::warning::no build meta (TODO-210 not landed yet)"
         - uses: actions/upload-artifact@v4
           with: { name: site, path: cf/public, retention-days: 7 }

     deploy:
       needs: test-build
       if: github.ref == 'refs/heads/main' && github.event_name == 'push'
       runs-on: ubuntu-latest
       environment: production
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version-file: .nvmrc, cache: npm }
         - run: npm ci && npm run build
         - name: Deploy Worker
           uses: cloudflare/wrangler-action@v3
           with:
             apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
             accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
             workingDirectory: cf
             command: deploy
         - name: Tag release
           run: |
             git config user.name ci && git config user.email ci@users.noreply.github.com
             t="deploy-$(date -u +%Y%m%d-%H%M)-${GITHUB_SHA::7}"
             git tag "$t" && git push origin "$t"
   ```
   Notes: the `api.anthropic.com` assertion will **fail today** because `callClaude` (`JpnFlashcards.jsx:2184`) is still in the bundle — either land Theme B's `/api/ai` / removal first, or start with `echo "::warning"` instead of `exit 1` and flip it to an error afterwards. Same for the 650 KB budget (current 549 KB — passes).
2. Repo settings (manual, by Matthew): add secrets `CLOUDFLARE_API_TOKEN` (token scoped to *Workers Scripts: Edit*, *Workers KV Storage: Edit*, *Account Settings: Read*) and `CLOUDFLARE_ACCOUNT_ID`; create the `production` environment and (optionally) require a reviewer. Document where the token lives in RUNBOOK (TODO-237).
3. (Optional) add `deploy-short` job with `paths: [cf/short/**]` filter, `workingDirectory: cf/short`.
4. Add a status badge line to README (TODO-234).

## Data migration / compatibility
none

## Testing & verification
- Push a branch with the workflow → `test-build` green. Push a commit that edits `JpnFlashcards.jsx` without rebuilding → the "Committed artifact must match source" step fails with the error annotation; rebuild + push → green.
- `workflow_dispatch` run on `main` → deploy job runs, `https://tangocho.deskbuddies.workers.dev/` serves the new build meta (after TODO-210) and a `deploy-*` tag appears in `git tag`.
- Revoke/rotate the token in Cloudflare → deploy job fails clearly (proves CI never needs the app secrets).

## Acceptance criteria
- [ ] `.github/workflows/ci.yml` committed; first run green on `main`.
- [ ] A deliberately stale `index.html` fails CI.
- [ ] Deploy job works from a clean runner with only the two Cloudflare secrets.
- [ ] `deploy-*` tags appear per production deploy.

## Pitfalls / notes
- `actions/setup-node` cache needs the root `package-lock.json` (TODO-211).
- Avoid `npm run check` in CI for the drift test — `git diff --quiet` after a real build is simpler and also covers `cf/public` generation; keep `--check` for local use.
- If TODO-210 chose a timestamped stamp, the drift check will always fail — use the deterministic `git-<sha>` stamp or strip the meta before diffing (see TODO-211 step 4).
- The deploy job rebuilds on the runner; the committed `index.html` is still the source of truth (the drift check guarantees they are equal).
