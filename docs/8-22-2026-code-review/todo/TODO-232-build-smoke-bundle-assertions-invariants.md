# TODO-232 — Build smoke test, bundle assertions and a `check-invariants.mjs` (storage-key registry, merge-rule coverage, SEED duplicate keys, SEED_VERSION bump)

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 7.4 rows "Build" and "Invariants", § 8.1 (no size budget/content assertions), § 8.5 (SEED_VERSION bump process), § 6.4; 05-expansion § 5.6
**Depends on:** TODO-211 (root scripts), TODO-221/222 (data/lib importable)   **Blocks:** none

## Why
The build already hard-aborts on a missing mount call and on feed-list drift — the right instinct. What it does not check: that the committed artifact is reproducible (CI does that now), bundle content invariants (no `api.anthropic.com`, no `console.log`, size budget, build meta present), and the *cross-file data invariants* that have bitten before: every `jpn101:` key literal registered, every synced key has a merge rule or is explicitly last-wins, `SEED` has no duplicate `term|lesson|sec`, and `SEED_VERSION` was bumped when `SEED` content changed.

## Current behaviour (verified)
- `tools/build.mjs` checks: `createRoot(` + `getElementById("root")` in bundle (L46-57); `check-feeds.mjs` (L61); splice boundaries (L66-79); `videos.json` parses (L95-100). No size/content assertions; no invariants on keys/SEED.
- `SEED` has 17 duplicate `term`s (report 01 § 1.1) and the seed merge keys by `term` only (L1334) — the invariant to add is on `term|lesson|sec` (sync's `cardMergeKey`); duplicate *terms* with different lesson/sec are legitimate.
- `jpn101:` literals: 61 occurrences in the JSX; `SYNC_SKIP_KEYS` L908 lists 4; `mergeSnapshots` L1008-1020 special-cases deck/days/scripts/input, generic rule otherwise.
- `SEED_VERSION = 30` L14 with comment "bump this each time I add/update words"; nothing checks it.

## Intended behaviour
- `test/bundle.test.mjs` (node:test) reads the freshly built `index.html` and asserts: contains `createRoot(`; contains `<meta name="build"` (after TODO-210); does **not** contain `api.anthropic.com` (after Theme B), `console.log(`, `AIza` (Google API key prefix), `d89497a7` (the leaked secret prefix — cheap canary), `/.netlify/functions/` (after TODO-228); size < 650,000 bytes; the head still has `<html lang="en">` (after TODO-205), `<meta name="viewport"`, `<link rel="manifest">` (after TODO-214); exactly one `<script>` tag without `src` (the bundle).
- `tools/check-invariants.mjs` run from `build.mjs` next to `check-feeds.mjs` and from `npm test`:
  1. every string literal matching `/"jpn101:[^"]+"/` in `src/**` is a value in the `K` registry (TODO-223); fail otherwise;
  2. for every key in `K` that starts with `jpn101:` and is not in `SYNC_SKIP_KEYS`: either `merge.js` exports a rule for it (a `MERGE_RULES` map keyed by storage key, which TODO-222/223 should introduce: `{ [K.deck]: mergeDeck, [K.days]: mergeDays, [K.scripts]: mergeScripts, [K.scriptsMirror]: mergeScripts, [K.input]: mergeInput }`) or it is listed in an explicit `LAST_WINS` set — fail if neither;
  3. `SEED`: no duplicate `term|lesson|sec` (fail) and report the count of duplicate bare terms (warn);
  4. `SEED_VERSION`: compute `sha1(JSON.stringify(SEED))`, compare with the SEED hash and version from `git show HEAD:src/data/seed.js` (import via a temp file or `git cat-file`): if the hash changed and the version did not → fail with "bump SEED_VERSION"; skip when not in a git checkout; same for `FREQ_SEED`/`FREQ_VERSION`.
- `npm run build` still aborts on any failure; `npm test` runs the bundle test after a build (`pretest` script runs `npm run build`? — no: keep tests fast; `bundle.test.mjs` skips with a clear message if `index.html` is older than the newest `src/**` file, and CI runs build before test).

## Implementation steps
1. `tools/check-invariants.mjs` with the four checks above; import `K`, `SYNC_SKIP_KEYS`, `MERGE_RULES`, `LAST_WINS` from `src/lib/*`, `SEED/SEED_VERSION` from `src/data/seed.js`; scan `src/**/*.{js,jsx}` for `jpn101:` literals (exclude `storage.js` itself). Exit 1 with a bulleted list of problems, else print `    invariants ok (N keys, SEED M rows, no dup keys)`.
2. `tools/build.mjs`: `await import("./check-invariants.mjs");` right after `check-feeds.mjs`. Add the bundle assertions that don't depend on later items immediately into `build.mjs` as hard aborts: size budget, `console.log(` absent, `AIza`/`d89497a7` absent. Leave `api.anthropic.com` and `/.netlify/functions/` as **warnings** until Theme B/TODO-228 land, then promote to aborts.
3. `test/bundle.test.mjs` mirroring those assertions (so they show up as named tests in CI output), plus the head checks.
4. `package.json`: `"test": "node --test test/ cf/test/"`; CI order is already build → tests? (TODO-213 runs tests before build — swap to build → test, or keep both orders: unit tests don't need the bundle; `bundle.test.mjs` skips when `index.html` is stale.) Decide: **build first, then test** in CI.
5. Document the SEED bump process in CONTRIBUTING (TODO-236): append rows → bump → `npm run build` (invariants run) → commit both → deploy → open the app once and watch the merge.

6. **Sketch of `tools/check-invariants.mjs`** (the shape; fill in the imports per the actual module paths):
   ```js
   import fs from "node:fs"; import path from "node:path"; import { createHash } from "node:crypto"; import { execSync } from "node:child_process"; import { fileURLToPath } from "node:url";
   const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const problems = [];
   const { K, SYNC_SKIP_KEYS } = await import(path.join(ROOT, "src/lib/storage.js"));
   const { MERGE_RULES, LAST_WINS } = await import(path.join(ROOT, "src/lib/merge.js"));
   const { SEED, SEED_VERSION } = await import(path.join(ROOT, "src/data/seed.js"));
   const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
   const registered = new Set(Object.values(K));
   for (const f of walk(path.join(ROOT, "src"))) if (!f.endsWith("storage.js"))
     for (const m of fs.readFileSync(f, "utf8").matchAll(/"(jpn101:[^"]+)"/g)) if (!registered.has(m[1])) problems.push(`${path.relative(ROOT, f)}: unregistered storage key ${m[1]}`);
   for (const k of registered) if (k.startsWith("jpn101:") && !SYNC_SKIP_KEYS.has(k) && !MERGE_RULES[k] && !LAST_WINS.has(k)) problems.push(`${k}: synced but has no merge rule and is not in LAST_WINS`);
   const keys = new Set(); let dupTerms = 0; const terms = new Set();
   for (const c of SEED) { const k = `${c.term}|${c.lesson}|${c.sec || ""}`; if (keys.has(k)) problems.push(`SEED duplicate term|lesson|sec: ${k}`); keys.add(k); if (terms.has(c.term)) dupTerms++; terms.add(c.term); }
   try {   // SEED changed without a version bump?
     const prev = execSync("git show HEAD:src/data/seed.js", { cwd: ROOT, encoding: "utf8" }); const tmp = path.join(ROOT, ".seed-head.mjs"); fs.writeFileSync(tmp, prev);
     const { SEED: S0, SEED_VERSION: V0 } = await import(tmp); fs.unlinkSync(tmp);
     const h = (s) => createHash("sha1").update(JSON.stringify(s)).digest("hex");
     if (h(S0) !== h(SEED) && V0 === SEED_VERSION) problems.push(`SEED content changed but SEED_VERSION is still ${SEED_VERSION} — bump it`);
   } catch (e) { /* not a git checkout or first commit — skip */ }
   if (problems.length) { console.error("INVARIANTS FAILED"); problems.forEach((p) => console.error("  - " + p)); process.exit(1); }
   console.log(`    invariants ok (${registered.size} keys, SEED ${SEED.length} rows, ${dupTerms} duplicate terms across lessons)`);
   ```
   (`.seed-head.mjs` must be gitignored or written to `os.tmpdir()`; prefer the tmpdir.)

## Data migration / compatibility
none. `MERGE_RULES`/`LAST_WINS` are code-organisation only — no behaviour change (the generic branch of `mergeSnapshots` stays; `LAST_WINS` just names what it already does for `kana/conj/freq/freqVersion/freqQuota/hooks/retention/lastBackup/oralAttempts/freqSnapshot/videoIndex/session/userEmail` — Theme A will shrink that list).

## Testing & verification
- `npm run build` prints the invariants line; temporarily add a duplicate SEED row with the same term/lesson/sec → build aborts; revert. Temporarily change one SEED meaning without bumping → abort "bump SEED_VERSION"; revert.
- Add a stray `sSet("jpn101:newthing", …)` → abort "unregistered key"; revert.
- `node --test test/bundle.test.mjs` passes on a fresh build; edit `index.html` to inject `console.log(` → fails; rebuild.

## Acceptance criteria
- [ ] `check-invariants.mjs` wired into the build with the four checks.
- [ ] Bundle assertions in build (hard) and `test/bundle.test.mjs` (named).
- [ ] CI builds before testing; invariants documented in CONTRIBUTING.

## Pitfalls / notes
- The `SEED_VERSION` check compares against `HEAD`, so a multi-commit branch that bumps in one commit and edits in another passes at the end — fine; CI runs on the merge commit.
- Don't make `check-invariants` depend on network or wrangler.
- Keep the `AIza` canary: it catches a re-leak of a Google key at build time, the exact incident from `226197d`.
