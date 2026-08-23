# TODO-015 — KV backup: `tools/kv-backup.mjs` (export every sync record) + restore procedure

**Priority:** P2   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 04-security-review § INFO-12 (no KV backup); 06-architecture § 11 (first row), F-14; 05-expansion § 5.8
**Depends on:** none (TODO-003 step 7 uses it before deleting `code:*` keys)   **Blocks:** none

## Why
All users' cloud progress lives in one KV namespace (`SYNC`, id `ba175d82f8fb41e4b60d5dad6d2d4543`) under `g:<sub>` keys. A bad deploy, a merge bug that pushes an empty deck (01 § 1.2), "Clear all" on one device, an accidental `wrangler kv key delete`, or losing the Cloudflare account loses every cloud copy. The only other copies are each device's localStorage and manual Backup files. A 40-line script that dumps every record to a dated folder is cheap insurance and is also the prerequisite for safely deleting the orphan `code:*` records (TODO-003).

## Current behaviour (verified)
- `cf/wrangler.toml:13-15` SYNC namespace id `ba175d82f8fb41e4b60d5dad6d2d4543`; `:22-24` TTS namespace id `65cb9739891549aeb8ac804b87b8b799` (audio clips, `feed:*`, `dur:*` — caches, not worth backing up).
- Record shape: `{updatedAt, snapshot:{ "jpn101:deck": "<json string>", … }}` (TODO-005 adds `v:1`).
- Nothing in `tools/` or docs touches KV; `.gitignore` has no `backups/` entry.
- `wrangler` is invoked via `npx wrangler` (no local dependency); wrangler v4 syntax: `wrangler kv key list --namespace-id <id> [--prefix p]`, `wrangler kv key get --namespace-id <id> <key>`, `wrangler kv key put --namespace-id <id> <key> <value>` / `--path file`, `wrangler kv bulk put --namespace-id <id> file.json` (array of `{key, value}`).

## Intended behaviour
- `node tools/kv-backup.mjs [--prefix g:] [--out backups]` writes `backups/<YYYY-MM-DD>T<HHMM>/<key>.json` for every key under the prefix and a `manifest.json` (key, bytes, updatedAt, number of deck cards), and prints a one-line summary. `backups/` is gitignored.
- `node tools/kv-restore.mjs <backup-dir> <key>` puts one record back (with a confirmation prompt). Bulk restore is documented but manual.
- Optional: a Worker Cron Trigger copies `g:<sub>` → `bak:<sub>:<date>` with a 30-day TTL — server-side safety net independent of the maintainer's laptop.

## Implementation steps
1. **`tools/kv-backup.mjs`**:
   ```js
   // Dump every sync record from the SYNC KV namespace to a dated folder. Needs an authenticated
   // wrangler (npx wrangler whoami). Usage: node tools/kv-backup.mjs [--prefix g:] [--out backups]
   import { execFileSync } from "node:child_process";
   import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
   const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
   const NS = "ba175d82f8fb41e4b60d5dad6d2d4543";            // cf/wrangler.toml [[kv_namespaces]] SYNC
   const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
   const prefix = arg("--prefix", "g:"), outRoot = arg("--out", path.join(ROOT, "backups"));
   const wr = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: path.join(ROOT, "cf"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
   const keys = JSON.parse(wr(["kv", "key", "list", "--namespace-id", NS, "--prefix", prefix]));
   const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
   const dir = path.join(outRoot, stamp); fs.mkdirSync(dir, { recursive: true });
   const manifest = [];
   for (const { name } of keys) {
     const raw = wr(["kv", "key", "get", "--namespace-id", NS, name]);
     fs.writeFileSync(path.join(dir, encodeURIComponent(name) + ".json"), raw);
     let cards = null, updatedAt = null;
     try { const r = JSON.parse(raw); updatedAt = r.updatedAt; cards = JSON.parse(r.snapshot["jpn101:deck"] || "[]").length; } catch (e) {}
     manifest.push({ key: name, bytes: raw.length, updatedAt, cards });
   }
   fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
   console.log(`backed up ${keys.length} key(s) under "${prefix}" to ${dir}`);
   ```
   (`wrangler kv key get` prints the raw value; if a future wrangler version wraps output, use `--text`/check `npx wrangler kv key get --help`.)
2. **`tools/kv-restore.mjs`**: `node tools/kv-restore.mjs <dir> <key>` → reads `<dir>/<encodeURIComponent(key)>.json`, prints its `updatedAt` and card count, asks `Restore this record over the live one? (yes/no)` via `readline`, then `npx wrangler kv key put --namespace-id <NS> <key> --path <file>`. Refuse if the file does not parse as `{snapshot:{…}}`.
3. **`.gitignore`**: add `backups/`.
4. **Docs**: add a `## Backups` section to `tools/REFRESH-VIDEO-INDEX.md`? No — that file is about videos. Put a short `tools/KV-BACKUP.md` (usage, where files go, how to restore one user, reminder that the TTS namespace is a cache and is not backed up). Theme C's RUNBOOK can absorb it later.
5. **Optional server-side cron** (cheap, independent of the laptop): in `cf/wrangler.toml` add
   ```toml
   [triggers]
   crons = ["0 9 * * *"]   # daily 09:00 UTC
   ```
   and in `cf/src/index.js` export `scheduled`:
   ```js
   async scheduled(event, env) {
     const day = new Date().toISOString().slice(0, 10);
     let cursor; do {
       const page = await env.SYNC.list({ prefix: "g:", cursor });
       for (const { name } of page.keys) {
         const v = await env.SYNC.get(name);
         if (v) await env.SYNC.put("bak:" + name.slice(2) + ":" + day, v, { expirationTtl: 30 * 86400 });
       }
       cursor = page.list_complete ? null : page.cursor;
     } while (cursor);
   }
   ```
   Cost: one KV write per user per day (fine at this scale; revisit if users > ~100 on the free tier). `handleSync` never reads `bak:*`; restoring is `kv key get bak:… | kv key put g:…` by hand. Ensure `SYNC_SKIP`/TODO-003 never lets a client address `bak:` keys (storage key is always `"g:" + sub` — it cannot).
6. Run the backup once now and keep the folder outside the repo or in the gitignored `backups/`.

## Data migration / compatibility
None.

## Testing & verification
- `cd /Users/dan/Code/matthew-japanese/tangocho && npx wrangler whoami` (authenticated) → `node tools/kv-backup.mjs` → prints count; `backups/<stamp>/manifest.json` lists `g:<sub>` with a plausible card count (821 for Matthew).
- Restore dry run: run `kv-restore` against a throwaway key (`kv key put … "g:test-restore" …` first), answer `no`, confirm nothing changed; answer `yes`, confirm `kv key get` returns the file.
- Cron (if added): `cd cf && npx wrangler dev --test-scheduled` then `curl "http://localhost:8787/__scheduled?cron=0+9+*+*+*"` → `bak:*` keys appear in the local KV (or deploy and check the next day with `kv key list --prefix bak:`).
- `git status` shows `backups/` ignored.

## Acceptance criteria
- [ ] `tools/kv-backup.mjs` produces a dated folder with one file per key and a manifest.
- [ ] `tools/kv-restore.mjs` restores one record with confirmation.
- [ ] `backups/` is gitignored; usage is documented.
- [ ] (Optional) daily `bak:` copies exist with 30-day TTL.

## Pitfalls / notes
- Backups contain the user's Google `sub` and full study data (the email is excluded once TODO-004 lands, but old records still carry `jpn101:userEmail`); keep the folder private, never commit it.
- KV free tier: 100k reads/day, 1k writes/day — the backup script is reads only; the cron adds writes.
- `wrangler kv key list` paginates automatically in v4; for >1,000 keys verify it returned everything.
- Build/deploy reminder: only the optional cron changes the Worker (`cd cf && npx wrangler deploy`); no `index.html` change.
