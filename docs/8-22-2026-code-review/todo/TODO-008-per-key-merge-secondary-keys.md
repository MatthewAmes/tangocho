# TODO-008 — Per-record merge for kana / conj / freq / hooks (no more "newest snapshot wins"), prototype guard, testable merge module

**Priority:** P1   **Effort:** M   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 3.2 (HIGH, kana loss scenario), § 3.6, § 3.8; 04-security-review § LOW-9; 06-architecture § 6.2, F-9, § 7.2 (merges untested); 05-expansion § 5.5 #1
**Depends on:** TODO-004 (skip set), TODO-005 (server `updatedAt`)   **Blocks:** TODO-007 (shares `cardMergeKey`), TODO-009 (seed merge reuses the module)

## Why
`mergeSnapshots` has real per-record rules for `deck`, `days`, `scripts`, `input`, `deckVersion`; **everything else** uses "cloud wins if the cloud record is newer than my last pull". Kana stats, conjugation-drill stats, the 10k deck (per-card FSRS state!), retention, quota and hooks are all whole-blob. Concrete loss: phone tab open since Monday; laptop pulls Tuesday, drills kana, pushes; phone drills kana Wednesday and pushes a snapshot that still holds Monday's kana → cloud kana = phone's; laptop reloads Thursday, cloud is newer than its last pull → laptop's Tuesday kana replaced → Tuesday's progress gone everywhere. The same shapes that already merge well for the deck (`{seen,last,fsrs}` per record) exist for these keys, so the fix is mechanical. Because the merge functions are the highest data-loss-risk code in the app and currently untestable (inside the 6k-line JSX), move them into a small imported module with tests, mirroring how `tools/fsrs.mjs` is already imported.

## Current behaviour (verified)
- `JpnFlashcards.jsx:936-1020`: `cardMergeKey`, `mergeDeck` (per-card winner `(seen||0)*1e6 + (last||0)`), `mergeDays` (per-day max `rev`), `mergeScripts` (union by id), `mergeInput` (bespoke), `mergeSnapshots`:
  ```js
  if (k === "jpn101:deck") …; if (k === "jpn101:days") …; if (k === "jpn101:scripts" || k === "jpn101:scripts:mirror") …;
  if (k === "jpn101:input") …; if (k === "jpn101:deckVersion") …;
  if (!(k in localSnap)) { out[k] = cloudSnap[k]; return; }
  if (k in cloudSnap && cloudUpdatedAt && cloudUpdatedAt > (localLastPulled || 0)) out[k] = cloudSnap[k];   // secondary keys
  ```
- Shapes: `jpn101:kana` and `jpn101:conj` are `{ [id]: {seen, correct, level, streak, last, fsrs, ms, msN} }` (`:2713-2725`, `:5066-5075`; `getS` default `{seen:0,correct:0,level:0,streak:0}` at `:2624`/`:5044`). `jpn101:freq` is an array of cards `{id, term, …, seen, correct, ms, msN, level, ease, streak, last, fsrs}` (`:5417`, `:5482-5493`); terms unique in `FREQ_SEED`. `jpn101:hooks` is `{ [term]: string }` (`:1520`). `jpn101:retention` and `jpn101:freqQuota` are scalar strings. `jpn101:freqVersion` is an int string.
- `merge*` functions parse the raw strings themselves; keys from the cloud are used directly as object keys (`items[id] = v`, `out[k] = …`).
- Import precedent: `:10` `import { review as fsrsReview, … } from "./tools/fsrs.mjs";` — esbuild bundles it (`tools/build.mjs:31-43`).
- Tests: `tools/test-fsrs.mjs` (plain asserts, `node tools/test-fsrs.mjs`).

## Intended behaviour
- `jpn101:kana`, `jpn101:conj`: per-id merge, winner = higher `(seen*1e6+last)`.
- `jpn101:freq`: per-card merge by `term` (reuse `mergeDeck`; `cardMergeKey` yields `term||` since freq cards have no lesson/sec — fine), plus `freqVersion` max like `deckVersion`.
- `jpn101:hooks`: union; on conflict keep local (hooks are deterministic text; either is fine).
- `jpn101:retention`, `jpn101:freqQuota` (scalars): keep "newer snapshot wins", now clock-safe thanks to TODO-005's server timestamps.
- Merge loops skip `__proto__`/`constructor`/`prototype` keys.
- All merge functions live in `tools/merge.mjs` (pure, no DOM), imported by the JSX, covered by `tools/test-merge.mjs`.

## Implementation steps
1. **Create `tools/merge.mjs`** — move `cardMergeKey`, `mergeDeck`, `mergeDays`, `mergeScripts`, `mergeInput`, `mergeSnapshots` from `JpnFlashcards.jsx:936-1020` verbatim (they reference nothing else), export them, and add:
   ```js
   const SAFE = (k) => k !== "__proto__" && k !== "constructor" && k !== "prototype";
   const score = (r) => ((r && r.seen) || 0) * 1e6 + ((r && r.last) || 0);
   export function mergeStatMap(localRaw, cloudRaw) {        // jpn101:kana, jpn101:conj: { id: {seen,last,fsrs,…} }
     let local = {}, cloud = {};
     try { local = localRaw ? JSON.parse(localRaw) : {}; } catch (e) {}
     try { cloud = cloudRaw ? JSON.parse(cloudRaw) : {}; } catch (e) {}
     if (!cloud || typeof cloud !== "object") return localRaw;
     if (!local || typeof local !== "object") return cloudRaw;
     const out = { ...local };
     Object.keys(cloud).filter(SAFE).forEach((id) => {
       const c = cloud[id], l = out[id];
       if (!l || score(c) > score(l)) out[id] = c;
     });
     return JSON.stringify(out);
   }
   export function mergeHooks(localRaw, cloudRaw) {           // jpn101:hooks: { term: text } — union, local wins
     let local = {}, cloud = {};
     try { local = localRaw ? JSON.parse(localRaw) : {}; } catch (e) {}
     try { cloud = cloudRaw ? JSON.parse(cloudRaw) : {}; } catch (e) {}
     const out = { ...(cloud || {}) };
     Object.keys(local || {}).filter(SAFE).forEach((k) => { out[k] = local[k]; });
     return JSON.stringify(out);
   }
   ```
   Add `SAFE` filtering inside `mergeInput` (`items[id] = v` loop) and `mergeDays` (`Object.keys(cloud)`), and in `mergeSnapshots`'s `keys.forEach` skip unsafe keys.
2. **Extend `mergeSnapshots`** (in the new module):
   ```js
   if (k === "jpn101:kana" || k === "jpn101:conj") { out[k] = mergeStatMap(localSnap[k], cloudSnap[k]); return; }
   if (k === "jpn101:freq") { out[k] = mergeDeck(localSnap[k], cloudSnap[k]); return; }
   if (k === "jpn101:freqVersion" || k === "jpn101:deckVersion") { out[k] = String(Math.max(Number(localSnap[k] || 0), Number(cloudSnap[k] || 0))); return; }
   if (k === "jpn101:hooks") { out[k] = mergeHooks(localSnap[k], cloudSnap[k]); return; }
   ```
   Keep the two generic lines last for scalars. Also accept an optional `skip` set param or import `SYNC_SKIP_KEYS` handling per TODO-004 step 2 (pass the set in from the JSX: `mergeSnapshots(localSnap, cloudSnap, updatedAt, lastPulled, SYNC_SKIP_KEYS)`).
   Careful with `mergeDeck`'s early returns `if (!cloud.length) return localRaw; if (!local.length) return cloudRaw;` — for freq this is right (an empty side means "never opened the 10k tab").
3. **JSX**: delete the moved functions (`:936-1020`) and add `import { cardMergeKey, mergeDeck, mergeDays, mergeScripts, mergeInput, mergeSnapshots } from "./tools/merge.mjs";` next to the fsrs import (`:10`). Grep for every call site (`mergeSnapshots` at `:1178`; `cardMergeKey` needed by TODO-007/009) — nothing else calls them today.
4. **Tests — `tools/test-merge.mjs`** (copy the `t/near/gt` helper style from `test-fsrs.mjs`; run `node tools/test-merge.mjs`). Cases:
   - `mergeDeck`: same key, cloud higher `seen` wins; equal `seen`, newer `last` wins; card only on one side kept; `cardMergeKey` separates `なるほど|18|3-1` from `なるほど|20|3-3`; empty cloud returns local raw unchanged.
   - `mergeStatMap`: two-device kana scenario from 01 § 3.2 — local `{あ:{seen:3,last:2}}`, cloud `{あ:{seen:2,last:9}, い:{seen:1,last:1}}` → あ local, い added; unparsable cloud → local raw; `__proto__` key ignored.
   - `mergeHooks`: union, local wins on conflict.
   - `mergeSnapshots`: kana uses per-record rule even when `cloudUpdatedAt > lastPulled`; `jpn101:retention` follows newer-snapshot rule; skipped keys (pass a set) never appear in output; `deckVersion`/`freqVersion` max.
   - `mergeInput`: history union by `itemId|at`, capped 400, `pending` dedupe (existing behaviour pinned).
5. Rebuild (`cd tools && node build.mjs` — esbuild resolves `./tools/merge.mjs` like fsrs), run all three test files, commit, deploy.

## Data migration / compatibility
- None for storage shapes. First pull after deploy merges kana/conj/freq per record; if two devices currently disagree, the union with higher-`seen` per record is strictly better than what exists.
- Note: `mergeStatMap`'s winner rule can pick a record with higher `seen` but older `fsrs.last`; acceptable and identical to the deck rule (01 § 3.8).

## Testing & verification
- `node tools/test-merge.mjs`, `node tools/test-fsrs.mjs`, `node tools/test-input-engine.mjs` all pass.
- Manual two-device kana check: device A drills か (seen 1); device B (stale tab, never re-pulled) drills さ and pushes; reload A → both か and さ have stats.
- Build output size unchanged within a few hundred bytes.

## Acceptance criteria
- [ ] `kana/conj/freq/hooks` merge per record; the 01 § 3.2 scenario no longer loses the laptop's kana.
- [ ] Merge functions live in `tools/merge.mjs`, imported by the JSX; `tools/test-merge.mjs` passes.
- [ ] Unsafe keys are ignored in every merge loop.

## Pitfalls / notes
- Do not change the deck winner rule here (field-wise merge is a separate, riskier improvement — 01 § 3.8).
- If Theme C's modularization (`src/lib/merge.js`) lands first, put the module there instead and point the test at it; the content is the same.
- `mergeDeck` for `jpn101:freq` relies on unique `term` in `FREQ_SEED` (true today, 148 entries); if a future tier adds a duplicate term, give it a `sec` or the two collapse.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
