# TODO-237 — RUNBOOK.md (deploy/rollback, secrets, quotas, incidents, logs) + nightly KV backup (cron + `tools/kv-backup.mjs`)

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 8.4, § 8.5, § 10.2 RUNBOOK outline, § 11 ops gaps table (KV backup, rotation, quotas, observability, rollback, bus factor), F-12, F-14; 05-expansion § 5.8, § 5.9 item 5; 04-security INFO-12; 01-functionality § 3.1 (rotation consequences)
**Depends on:** TODO-213 (CI; cron job lives in the same workflows dir)   **Blocks:** none

## Why
There is no written recovery for a bad deploy, no backup of the KV namespace that holds every user's cloud progress (a mis-typed `wrangler kv key delete` or account problem loses it; the only other copies are each device's localStorage and manual backup files), the secrets process is a `wrangler.toml` comment, and a quota blip shows up only as "⚠ Not saved yet" on the client. Theme A rotates `SESSION_SECRET`; this item writes down what rotation does and how to do the rest safely.

## Current behaviour (verified)
- Deploy: `cd cf && npx wrangler deploy` (only in `tools/REFRESH-VIDEO-INDEX.md:15`); 0 tags; wrangler auth on one laptop.
- Secrets: `SESSION_SECRET` ("must match the existing one or every device is signed out"), `GOOGLE_TTS_API_KEY` (also used for YouTube Data API, `cf/src/index.js:305`), `ADMIN_WARM_TOKEN` — `cf/wrangler.toml` footer; `wrangler secret put` implied. Google client id is public (`cf/src/index.js:17`).
- KV: `SYNC` ns id `ba175d82f8fb41e4b60d5dad6d2d4543` (keys `g:<sub>`, `code:<code>`), `TTS` ns id `65cb9739891549aeb8ac804b87b8b799` (sha256 clips, `feed:v2:*`, `dur:*`, `dur:disabled`); free tier ≈ 1,000 writes/day (comment in `wrangler.toml`); no `[observability]`.
- Failure visibility: client `SYNC_UI` pending banner (L3815-3820); Worker swallows feed/duration errors (`cf/src/index.js:315, 341`); no logging.

## Intended behaviour
`RUNBOOK.md` at the root with copy-pasteable commands, and an automated nightly export of the `SYNC` namespace to a private location (GitHub Actions artifact with 90-day retention by default; optionally a private backup repo), plus a restore procedure that has been rehearsed once.

## Implementation steps
1. **RUNBOOK.md** sections:
   1. *Deploy*: `npm run deploy` (or CI on `main`); verify with `curl -s https://tangocho.deskbuddies.workers.dev/ | grep -o 'meta name="build"[^>]*'` and `/api/health` (TODO-238).
   2. *Rollback*: `cd cf && npx wrangler deployments list` → `npx wrangler rollback <deployment-id>`; or `git checkout deploy-<tag> -- index.html cf/src && npm run deploy`; note that rollback does not touch KV.
   3. *Secrets*: table — name · used by · where it comes from (Google Cloud project/console path for the TTS key; `openssl rand -hex 32` for the others) · how to set (`cd cf && npx wrangler secret put NAME`) · rotation consequence (`SESSION_SECRET` → every device signed out; clients need the 401-recovery from Theme A to re-sign-in cleanly; `GOOGLE_TTS_API_KEY` → new-word audio falls back to the device voice until rotated; `ADMIN_WARM_TOKEN` → only pre-warm scripts). Restrict the Google key to Cloud TTS + YouTube Data API v3; set a Cloud billing alert. Never paste values into chat or tracked files.
   4. *KV backup & restore* (below) + "how to restore one user" (`wrangler kv key put g:<sub> --path backup/g_<sub>.json --namespace-id …`).
   5. *Quotas*: KV writes (1k/day free) — what exhaustion looks like (client pending banner, Worker `put` throws → 500s on `/api/sync`); YouTube 10k units/day; TTS billing; where to look (Cloudflare dashboard → Workers & Pages → KV metrics; Google Cloud → APIs & Services → Quotas).
   6. *Incidents* (one paragraph each, with symptoms → cause → fix): blank page after deploy (bundle missing mount; rebuild; `90cf825`); TTS key revoked (silent fallback voice; rotate key); Google OAuth `origin_mismatch` (origin not on the OAuth client — console-only step; list the authorized origins); stuck "Not saved yet" (expired/rotated session — Theme A's fix; clear `jpn101:session` as a workaround); feed items missing (Worker feed fetch failing — `wrangler tail`).
   7. *Logs/observability*: enable `[observability] enabled = true` (TODO-238), `cd cf && npx wrangler tail --format pretty`, what to grep (`feed`, `tts`, `sync`).
   8. *Access/bus factor*: who owns the Cloudflare account, the Google Cloud project, the GitHub repo; CI token scope; how to add a second maintainer.
2. **`tools/kv-backup.mjs`** (run locally or in CI; uses the wrangler CLI so no API token handling in code):
   ```js
   // Export every key of a KV namespace to backup/<ns>/<date>/<key>.json. Usage: node tools/kv-backup.mjs SYNC [--prefix g:]
   import { execFileSync } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
   const NS = { SYNC: "ba175d82f8fb41e4b60d5dad6d2d4543", TTS: "65cb9739891549aeb8ac804b87b8b799" };
   const [,, nsName = "SYNC", ...rest] = process.argv; const id = NS[nsName]; if (!id) { console.error("unknown namespace"); process.exit(1); }
   const prefix = (rest.find((a) => a.startsWith("--prefix=")) || "--prefix=").slice(9);
   const w = (args) => execFileSync("npx", ["wrangler", "kv", "key", ...args, "--namespace-id", id, "--remote"], { cwd: "cf", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
   const keys = JSON.parse(w(["list", ...(prefix ? ["--prefix", prefix] : [])])).map((k) => k.name);
   const day = new Date().toISOString().slice(0, 10); const dir = path.join("backup", nsName, day); fs.mkdirSync(dir, { recursive: true });
   for (const k of keys) fs.writeFileSync(path.join(dir, encodeURIComponent(k) + ".json"), w(["get", k]));
   console.log(`backed up ${keys.length} keys from ${nsName} → ${dir}`);
   ```
   (Check the exact `wrangler kv key list/get` flags for the pinned wrangler version — v3 uses `kv:key`, v4 uses `kv key`; adjust.) Add `backup/` to `.gitignore`.
3. **Nightly cron** `.github/workflows/kv-backup.yml`: `on: schedule: [{cron: "17 9 * * *"}]` + `workflow_dispatch`; steps: checkout, setup-node, `npm ci`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` env from secrets (token needs *Workers KV Storage: Read*), `node tools/kv-backup.mjs SYNC --prefix=g:`, `actions/upload-artifact@v4` with `name: kv-sync-${{ github.run_id }}`, `retention-days: 90`. Optional: also back up `TTS` `feed:`/`dur:` prefixes weekly (clips are regenerable; skip). Optional: push to a private repo instead of artifacts.
4. **Rehearse restore** once: take today's export, `wrangler kv key put g:<your-sub> --path … --preview false` into a throwaway key `bak-test:…`, `get` it back, delete it. Record the commands in RUNBOOK § 4.
5. Link RUNBOOK from README and CLAUDE.md.

## Data migration / compatibility
none. The backup contains user data (progress + email in snapshots until Theme A's `SYNC_SKIP_KEYS` change) — keep artifacts private (GitHub artifacts are private to repo collaborators) and say so in RUNBOOK.

## Testing & verification
- `node tools/kv-backup.mjs SYNC --prefix=g:` locally (wrangler logged in) → files under `backup/SYNC/<date>/`; JSON parses; count equals `wrangler kv key list --prefix g:` length.
- Trigger the workflow via `workflow_dispatch` → artifact present, size reasonable (KB–MB).
- Restore rehearsal documented with real commands and the date it was done.
- Rollback rehearsal: `wrangler deployments list` shows ≥ 2 versions; `wrangler rollback` to the previous and back.

## Acceptance criteria
- [ ] RUNBOOK.md with the 8 sections; every command verified once.
- [ ] `tools/kv-backup.mjs` + nightly workflow producing artifacts; restore rehearsed and recorded.
- [ ] Secrets table complete with rotation consequences; no secret values anywhere.

## Pitfalls / notes
- The CI token for backups only needs KV *read*; keep it separate from the deploy token if you want least privilege (two secrets) — or reuse the deploy token for simplicity and say so.
- `code:*` orphan keys (anonymous sync path) are excluded by `--prefix=g:`; after Theme A removes that path, a one-off cleanup script can delete `code:*` (document as optional in RUNBOOK § 4).
