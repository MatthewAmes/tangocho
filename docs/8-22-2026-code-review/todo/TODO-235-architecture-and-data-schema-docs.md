# TODO-235 — ARCHITECTURE.md and DATA-SCHEMA.md (promote the commit-log design journal into files)

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 3 (architecture map + diagrams), § 6 (data model, storage keys, versioning), § 10.2 outlines for ARCHITECTURE.md and DATA-SCHEMA.md, § 4.7 ("light on contracts"), F-13, F-21; 01-functionality § 1.5 (design limits worth documenting)
**Depends on:** none (update paths after TODO-221…225)   **Blocks:** none

## Why
A large share of the project's real documentation lives in 29 multi-paragraph commit messages and long code comments — excellent, but invisible to anyone who doesn't `git log`. The card shape, the 24 `jpn101:*` keys with their sync/merge/version semantics, the snapshot/backup/pack formats, the load→merge→push chain and the blind-overwrite server model are nowhere written down as a contract, which is how `jpn101:session` and the 145 KB video cache ended up being synced and how `kana/conj/freq` got last-snapshot-wins without anyone deciding it.

## Current behaviour (verified)
- No `ARCHITECTURE.md`/`DATA-SCHEMA.md`. Sources of truth to mine: `JpnFlashcards.jsx` comments (storage fallback L865-869; sync race L1312-1318; session-mix L1563-1572; FSRS plumbing ~L2098-2104; production clock ~L2120-2126; Input catalog L4166-4176; coverage tokenizer L4462-4469), `cf/src/index.js` headers (L1-15, L195-201, L271-283), `cf/wrangler.toml`, `netlify.toml`, `cf/short/src/index.js`, `tools/build.mjs` header, `tools/REFRESH-VIDEO-INDEX.md`, and `git log` bodies (`2acc723`, `22cf183`, `110a16f`, `5cc3ede`, `69b7305`, `4dcefd8`, `11dee08`, `1bb98c1`).
- Data facts (report 06 § 6): card fields `id, term, reading, romaji, meaning, kind, emoji, pitch?, lesson, sec?, sample?, seen, correct, level, ease, streak, last, ms, msN, fsrs{S,D,last,due,ivl,relearning}, rseen, rcorrect, rlevel, rms, rmsN, rfsrs, mn` + ad-hoc seed fields (`past, particle, time, irregular, watch, politer`); stat records for kana/conj/freq `{seen, correct, level, streak, last, ms, msN, fsrs}`; 24 storage keys under `jpn101:`; snapshot `{updatedAt, snapshot:{key: rawJSONString}}`; backup `{app:"tangocho", v:2, date, deck, kana, scripts, freq, days, hooks, quota, oral}`; pack `{app:"tangocho-pack", words, scripts}`; input state `v:1`; `videos.json` packed `fields` rows; KV prefixes `g:<sub>`, `code:<code>`, sha256 audio keys, `feed:v2:*`, `dur:*`, `dur:disabled`.

## Intended behaviour
Two Markdown files at the repo root (or `docs/`), each ≤ 300 lines, with Mermaid diagrams (GitHub renders them), tables, and "known limitations" sections that name the Theme A/B TODOs where a behaviour is slated to change.

## Implementation steps
1. **ARCHITECTURE.md** outline (copy the diagrams from report 06 § 3.1, § 3.2, § 3.4, § 3.5 — they are already Mermaid):
   1. One-paragraph summary + the single-artifact decision (why `index.html` is committed; `npm run check` rule; pros/cons).
   2. Runtime diagram (browser ⇄ Worker ⇄ KV/Google/feeds) + the short-URL and Netlify-301 boxes.
   3. Source layout tree (post-modularization target from report 06 § 9.1; mark "today" vs "target" until done).
   4. Storage layer: `sGet/sSet` → localStorage → mem; write hook → debounced cloud push (2.5 s); `SYNC_SKIP_KEYS`.
   5. Sync model: load→pull→merge→seed-merge→push chain (why serial), per-key merge rules table, blind-overwrite server + client-side merge, retry/backoff/pagehide flush, state machine diagram, **known limitations** (no tombstones → deletes resurrect; "Clear all" is per-device; secondary keys last-snapshot-wins; client clock decides — with links to Theme A items).
   6. Auth: GIS id_token → Worker verifies (RS256/JWKS/aud/iss/exp) → HMAC session (730 d) in localStorage; what secret rotation does; no per-user revocation (Theme A).
   7. Scheduling: FSRS-4 (`src/lib/fsrs.js`) + legacy counters kept for UI; recognition vs production (`fsrs` vs `rfsrs`); leech lane; session mix (slot ladder); latency grading; known wiring gaps (Theme B).
   8. TTS: cache-first by sha256(voice|rate|text), session-gated generation, prefetch, browser fallback.
   9. Input tab: level model, catalog + indexed videos + feeds (Worker allowlist), coverage tokenizer; known weakness (estimated difficulty).
   10. Worker routes table + KV layout (prefixes, TTLs) + the `/.netlify/functions/*` aliases retirement plan.
   11. Build/deploy: esbuild IIFE → splice → `cf/public/`; CI; build stamp; SW caching (after TODO-215).
   12. Deliberately-not-done list (kuromoji in the client, R2, caption scraping, D1/DO sync) with the reasons from the commits.
2. **DATA-SCHEMA.md** outline:
   1. Card (table: field, type, written by, notes) incl. the ad-hoc seed fields — decide "document" (default) or "strip at seed time" and note it.
   2. Stat record (kana/conj/freq) + FSRS state shape (`{S,D,last,due,ivl,relearning}`), `seedFromHistory` rule.
   3. Storage keys table: key · owner · synced? · merge rule · versioned? · size class — all 24 (from report 06 § 6.2), plus new keys from this review (`jpn101:nudgeOff` TODO-218) — and the rule "a new `jpn101:` key must be registered in `K`, choose sync or skip, choose a merge rule" (enforced by TODO-232).
   4. Cloud snapshot shape (double-encoded JSON strings; `updatedAt` client-supplied — limitation), KV key `g:<sub>`.
   5. Backup v2 (`oral` legacy: read, never written after TODO-228), update-pack format and how restore treats each key (seed back-fill, day merge).
   6. Input state (`v:1`, fields, merge rules: history append-only union, pending dedupe, hidden union, tagScores newer-wins) + the un-hide caveat (TODO-216).
   7. `videos.json` packed format (`fields` string, row order from `tools/yt-pack.mjs`), cache key `jpn101:videoIndex` keyed by `builtAt`.
   8. Versioning & migrations today (`SEED_VERSION`, `FREQ_VERSION`, pre-merge snapshots one level deep, inline script retirements) + the proposed per-key migration table from report 06 § 6.5 as "planned".
   9. Worker KV: prefixes, TTLs, sizes (clips ~15 KB), quotas (1k writes/day free tier).
3. Cross-link from README; keep line references out (they rot) — reference function names/files instead.

## Data migration / compatibility
none

## Testing & verification
- Mermaid renders on GitHub (open the file in the repo UI); tables complete (24 keys).
- A second reader (or a fresh Claude session) can answer from the docs alone: "which keys sync and how are conflicts resolved?", "what happens on Clear all with two devices?", "how do I add a new storage key?".

## Acceptance criteria
- [ ] `ARCHITECTURE.md` with the 12 sections and ≥ 3 diagrams; `DATA-SCHEMA.md` with the 9 sections and the 24-key table.
- [ ] Known limitations name the owning TODO ids.
- [ ] Linked from README; updated again when TODO-225 changes paths.

## Pitfalls / notes
- Write what the code *does today*; mark intended changes as such — these docs are contracts for Theme A/B work, not wishes.
- Don't duplicate RUNBOOK (ops) or CONTRIBUTING (how-to) content; link instead.
