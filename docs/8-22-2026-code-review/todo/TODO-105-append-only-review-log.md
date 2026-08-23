# TODO-105 — Append-only review log (`jpn101:revlog`) with union merge, local cap, and CSV export

**Priority:** P1   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 05-expansion §2.1 (the enabler), §5.10 (analytics), QW-17 (per-card stats export); 02-pedagogy §4.2 ("no optimizer run over the review log and no measurement of actual retention"); 06-architecture §6 (data model has only aggregates)
**Depends on:** none   **Blocks:** TODO-106 (optimiser), TODO-109 (leech "why is this stuck"), TODO-107 (optional per-card history)

## Why
Every answer mutates per-card aggregates (`seen/correct/ms/msN/level/fsrs{S,D,last,due}`) and a per-day counter; nothing records *which* grade happened *when* with *what* prior state. That blocks FSRS parameter optimisation (needs per-review rows), retention-curve measurement (predicted R vs observed recall), per-card history, and debugging ("why did this card come back today?"). The busiest logged day was 488 reviews; ~70 bytes/row means ~35 KB/day, ~4 MB for a semester — fine in localStorage if capped and compact, but it must be synced as its own KV key, not inside the ~400 KB snapshot (01 §3.4).

## Current behaviour (verified)
- Writes: `recordResult` L1392–1443 (deck), Kana `record` L2713–2725, ConjDrill `grade` L5066–5075, Freq `grade` L5475–5495. Each has the prior state (`prior` / `s0` / `x`) and the grade in scope.
- `logDay` L1210–1217 is the only time-series, per day.
- Merge: `mergeInput` L980–1007 shows the union-by-key pattern (`h.itemId + "|" + h.at`); `mergeSnapshots` L1008–1021 dispatches per key; unknown keys fall to "newer snapshot wins" (L1017–1018).
- `collectLocalSnapshot` L926–935 sweeps every `jpn101:*` key except `SYNC_SKIP_KEYS` (L908) into the push body; Worker `handleSync` L138–143 stores the whole body under `g:<sub>`.
- Browse "More" panel L3992–4025 has Export/Backup/Restore buttons (`exportText` L3950–3953).

## Intended behaviour
- Key `jpn101:revlog`: JSON array of compact rows `[deck, itemId, dir, ts, grade, ms, S0, D0, R0]`:
  - `deck` ∈ `"class" | "kana" | "conj" | "freq"`, `itemId` = card id / kana id (`h-あ`) / conj id (`たべる|f-pn`) / freq card id, `dir` ∈ `"rec" | "prod"`, `ts` ms, `grade` 1–4, `ms` think-time (0 if unknown), `S0/D0` prior state (null for first review), `R0` retrievability at review time (null for first).
  - Rows from requeue passes (TODO-103) are logged too with an extra 10th field `1` (relearn step) so the optimiser can exclude them.
- Append helper `logReview(row)` keeps an in-memory array, writes `localStorage` at most once per 2 s (debounce) — and always on `pagehide` — and caps at 60,000 rows (drop oldest).
- Sync: excluded from the main snapshot (`SYNC_SKIP_KEYS`), pushed separately to `POST /api/sync?part=revlog` as `{rows: <rows since last ack>}`; Worker appends to `g:<sub>:revlog` (array, capped at 200,000 rows); `GET /api/sync?part=revlog&since=<ts>` returns rows after `since`. Client keeps `jpn101:revlogAck = <last pushed ts>`; merge on pull is union by `(deck,itemId,ts)`.
- Export: Browse › More › "Export review log" downloads `tangocho-revlog-YYYY-MM-DD.csv` with a header row (`deck,item,dir,ts,iso,grade,ms,S0,D0,R0,relearn`) — the input to TODO-106.

## Implementation steps
1. Module-level helper after `logDay` (L1217):
   ```js
   const REVLOG_KEY = "jpn101:revlog", REVLOG_CAP = 60000;
   let _revlog = null, _revlogTimer = null;
   async function loadRevlog() { if (_revlog === null) { try { const r = await sGet(REVLOG_KEY); _revlog = r ? JSON.parse(r) : []; } catch (e) { _revlog = []; } } return _revlog; }
   function flushRevlog() { if (_revlogTimer) { clearTimeout(_revlogTimer); _revlogTimer = null; } if (_revlog) { try { window.localStorage.setItem(REVLOG_KEY, JSON.stringify(_revlog)); } catch (e) {} scheduleRevlogPush(); } }
   async function logReview(row) {            // [deck,itemId,dir,ts,grade,ms,S0,D0,R0,relearn]
     await loadRevlog();
     _revlog.push(row);
     if (_revlog.length > REVLOG_CAP) _revlog.splice(0, _revlog.length - REVLOG_CAP);
     if (!_revlogTimer) _revlogTimer = setTimeout(flushRevlog, 2000);
   }
   if (typeof window !== "undefined") window.addEventListener("pagehide", flushRevlog);
   ```
   Write with `localStorage.setItem` directly (not `sSet`) so it does not trigger the main snapshot push; add `"jpn101:revlog"` and `"jpn101:revlogAck"` to `SYNC_SKIP_KEYS` (L908).
2. Call sites — compute `R0` with `retrievability((now - prior.last)/86400000, prior.S)` (imported at L10):
   - `recordResult` (after L1418): `logReview(["class", c.id, isProd ? "prod" : "rec", Date.now(), grade, t, prior?.S ?? null, prior?.D ?? null, prior ? retrievability(...) : null, firstPass ? 0 : 1]);`
   - Kana L2722, Conj L5072, Freq L5487: same shape with `deck` = `"kana"/"conj"/"freq"`, `itemId` = `cur.id`/`cur.id`/`x.id`, grade = `gradeFromLatency(got, think, {streak})` (compute once and reuse for `statReview` — refactor `statReview` to accept a grade or return it).
3. Worker (`cf/src/index.js` `handleSync` L106–145): before the existing GET/POST branches add
   ```js
   if (url.searchParams.get("part") === "revlog") {
     const key = storageKey + ":revlog";
     if (req.method === "GET") {
       const since = Number(url.searchParams.get("since") || 0);
       const all = (await env.SYNC.get(key, { type: "json" })) || [];
       return json({ rows: since ? all.filter((r) => r[3] > since) : all });
     }
     if (req.method === "POST") {
       let body; try { body = await req.json(); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
       const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
       const all = (await env.SYNC.get(key, { type: "json" })) || [];
       const seen = new Set(all.map((r) => r[0] + "|" + r[1] + "|" + r[3]));
       for (const r of rows) { const k = r[0] + "|" + r[1] + "|" + r[3]; if (!seen.has(k)) { seen.add(k); all.push(r); } }
       if (all.length > 200000) all.splice(0, all.length - 200000);
       await env.SYNC.put(key, JSON.stringify(all));
       return json({ ok: true, count: all.length });
     }
   }
   ```
   Place it after the `storageKey` resolution (L132) so it is session-gated exactly like the snapshot. (TODO-003 removes the `code:` path; this branch must only accept Bearer sessions — if implemented before TODO-003, explicitly require `auth.startsWith("Bearer ")` here.)
4. Client push/pull: `scheduleRevlogPush()` debounced 10 s → `POST {rows: _revlog.filter(r => r[3] > ack)}` via `syncRequestOptions`-style headers but URL `SYNC_ENDPOINT + "?part=revlog"`; on 2xx set `jpn101:revlogAck`. In `pullAndMergeCloud` (L1168–1183) after the snapshot merge, `GET ?part=revlog&since=<max local ts − 7 d>` and union into `_revlog` by key, then `flushRevlog()`.
5. Export: in Browse More bar (L3997–4010) add `<button className="tc-btn tc-btn-sm" onClick={exportRevlog}>Export review log</button>`; `exportRevlog` builds CSV (`iso` = `new Date(ts).toISOString()`), downloads via the same `URL.createObjectURL` pattern as `doBackup` (L3845–3851). Also include `revlog` in the backup blob (L3843) and restore it (union) in `doRestore` (L3856+).
6. Tests: `tools/test-revlog.mjs` — slice `logReview`/cap logic or test the Worker branch with a 15-line in-memory KV stub (`{get,put}` map) as 06 §7.4 suggests: POST two batches with overlap → `count` is the union; GET `since` filters; cap respected.

## Data migration / compatibility
New keys `jpn101:revlog`, `jpn101:revlogAck` (local, skipped by snapshot sync); new KV key `g:<sub>:revlog`. No change to `mergeSnapshots` rules (the log is merged by its own union path). Backup v2 blob gains an optional `revlog` field; old backups without it restore fine.

## Testing & verification
- Grade 5 cards in Study, 3 kana, 2 conj, 2 freq; `JSON.parse(localStorage["jpn101:revlog"]).length === 12` after 2 s; rows have the right `deck` and non-null `S0` for previously seen items.
- Two devices: grade on A and B offline, come online, both end with the union (count equal on both after reload).
- `cd cf && npx wrangler dev` + curl `POST /api/sync?part=revlog` with a Bearer from localStorage → `{ok:true,count}`; GET with `since` works.
- Export CSV opens in a spreadsheet with the header.
- Build + deploy (`cd tools && node build.mjs`; `cd ../cf && npx wrangler deploy`).

## Acceptance criteria
- [ ] Every grade in all four decks appends one row; requeue passes are flagged.
- [ ] Log is capped at 60k rows locally, flushed on `pagehide`, excluded from the main snapshot.
- [ ] Worker stores/unions the log under `g:<sub>:revlog`, session-gated; GET supports `since`.
- [ ] Two-device union is idempotent (no duplicates by `(deck,item,ts)`).
- [ ] Browse offers "Export review log" CSV; backup includes `revlog`.

## Pitfalls / notes
- KV free tier allows ~1k writes/day; the revlog push is a separate write — debounce ≥ 10 s and skip when nothing new (05 §5.9 notes KV writes are the binding constraint).
- Do not log from `Sentences`/Write differently — Write goes through `recordResult` (TODO-102) and is logged as `prod`.
- `retrievability` is already imported at L10 (`import { review as fsrsReview, retrievability, seedFromHistory, gradeFromLatency, intervalFor }`).
- Rebuild `index.html` and deploy the Worker (the Worker change is required for sync; the client works locally without it).
