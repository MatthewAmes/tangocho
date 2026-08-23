# TODO-111 — Log every study modality to the day log (Kana, Drill, Scripts, Input minutes) and keep the streak consistent with the day key

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §1 item 7, §4.5, §6 ("Practises kana only → streak breaks"), §7 item 6; 01-functionality §1.4 (`_days` cache — TODO-018) and §6.3 (UTC keys — TODO-010); 03-ux I-2 (streak wrong in the evening — TODO-010)
**Depends on:** TODO-010 (Theme A: local day keys — provides `localDayKey()`; use it, do not add a second date helper)   **Blocks:** none

## Why
The streak and "today" counters only see vocabulary reviews: `logDay` is called from `recordResult` (Study/Write) and Freq. A day spent on Kana, the conjugation Drill, Scripts rehearsal or Input (watching 30 minutes of Japanese) does not count as "showing up", although the streak's own comment says "the point is showing up". Three of eight tabs are invisible to the motivation layer. Separately, `streakFrom` anchors "today" at local noon while `logDay` keys by `toISOString()` of *now* — the streak reads 0 right after an evening session (03-ux observed at 20:50 PDT). The key migration belongs to Theme A; this item must call whatever helper they introduce and must not add a second date function.

## Current behaviour (verified)
- `logDay({ ok, ms, deck, fnew })` L1210–1217: key `new Date().toISOString().slice(0, 10)` (L1212); record `{rev, ok, ms, frev, fnew}`; called at L1394 (`recordResult`, `deck: "class"`) and L5481 (Freq, `deck: "freq"`).
- `streakFrom(days)` L1223–1233: `has(d)` requires `(v.rev||0) > 0`; today = local noon → `toISOString()`.
- `Study` reads `days` via `loadDays()` in an effect on `[running]` (L1616–1617); `todayKey` L1619; `todayRev` L1620; `mascotState({studiedToday: todayRev > 0, …})` L1641.
- Kana `record` L2713–2742, ConjDrill `grade` L5066–5087: no `logDay`. Scripts: `next()` L3582 and "Finish" L3656; no log. Input `rate()` L4674–4699 and `logOffline` L4702–4717 record minutes into `jpn101:input.history` only.
- `_days` module cache (L1205) is not invalidated after `pullAndMergeCloud` writes `jpn101:days` (01 §1.4).

## Intended behaviour
- One day record per local day (TODO-010's `localDayKey()`), shape extended backwards-compatibly: `{ rev, ok, ms, frev, fnew, cnew?, kana?, conj?, scripts?, inputMin? }` where `kana`/`conj` count graded items, `scripts` counts completed rehearsal runs (reaching the "Script complete" screen), `inputMin` sums rated/logged minutes.
- "Showed up" = any of `rev > 0 || kana > 0 || conj > 0 || scripts > 0 || inputMin >= 10`. `streakFrom` uses this predicate; `mascotState.studiedToday` too. The buddy's "N today" stays vocabulary reviews (`rev`) but add a second small stat when other modalities were used today: "+ 20 kana · 15 min input".
- `mergeDays` keeps the richer record: merge field-wise by max instead of whole-record by `rev`.
- `_days` cache is reset after a cloud pull (`_days = null`) so merged days from other devices are visible without reload.

## Implementation steps
1. `logDay` (L1210–1217) → generalise:
   ```js
   async function logDay({ ok, ms, deck, fnew, cnew, kind = "rev", minutes = 0 }) {
     await loadDays();
     const k = localDayKey();                                   // TODO-010's helper (local date); falls back to UTC until it lands
     const d = _days[k] || (_days[k] = { rev: 0, ok: 0, ms: 0, frev: 0, fnew: 0 });
     if (kind === "rev") { d.rev += 1; if (ok) d.ok += 1; if (ms) d.ms += ms; if (deck === "freq") { d.frev += 1; if (fnew) d.fnew += 1; } if (cnew) d.cnew = (d.cnew || 0) + 1; }
     else if (kind === "input") d.inputMin = (d.inputMin || 0) + (minutes || 0);
     else d[kind] = (d[kind] || 0) + 1;                  // "kana" | "conj" | "scripts"
     sSet(DAYS_KEY, JSON.stringify(_days));
   }
   const showedUp = (v) => !!v && ((v.rev||0) > 0 || (v.kana||0) > 0 || (v.conj||0) > 0 || (v.scripts||0) > 0 || (v.inputMin||0) >= 10);
   ```
   Until TODO-010's `localDayKey()` exists, define `const dayKey = () => new Date().toISOString().slice(0, 10);` here **once** and have Theme A replace it — agree on the name `localDayKey`.
2. `streakFrom` L1226: `const has = (d) => showedUp(days[key(d)]);` (and `key` switches to `localDayKey(d)` under TODO-010).
3. Callers: Kana `record` (after L2725) `logDay({ kind: "kana", ok: got });` · ConjDrill `grade` (after L5075) `logDay({ kind: "conj", ok });` · Scripts: where the session reaches the end (`next()` when `last`, L3582/L3656 — add `if (idx + 1 >= active.lines.length) logDay({ kind: "scripts" })` inside `next`) · Input `rate()` (L4689 return) and `logOffline` (L4710): `logDay({ kind: "input", minutes: entry.minutes })` / `minutes: logMin` (after TODO-120, use measured minutes).
4. Study: `mascotState({ studiedToday: showedUp(days && days[todayKey]), … })` (L1641); extra stat under L1800: `{(d.kana||d.conj||d.inputMin) ? <span className="tc-stat">+ {[d.kana && `${d.kana} kana`, d.conj && `${d.conj} forms`, d.inputMin && `${d.inputMin} min input`].filter(Boolean).join(" · ")}</span> : null}` where `d = days?.[todayKey] || {}`.
5. `mergeDays` (L954–963): field-wise max —
   ```js
   Object.keys(cloud).forEach((day) => { const c = cloud[day], l = out[day]; if (!l) { out[day] = c; return; } const m = { ...l }; for (const f of new Set([...Object.keys(l), ...Object.keys(c)])) m[f] = Math.max(l[f] || 0, c[f] || 0); out[day] = m; });
   ```
   (Per-field max is monotone and idempotent; previously a day with more `rev` on one side dropped the other side's `fnew`.)
6. `pullAndMergeCloud` (L1168–1183): after writing merged keys add `_days = null;` so `loadDays()` re-reads. (TODO-018 generalises cache invalidation after pull; if it has landed, this line is already there.)
7. Tests: `showedUp`/`streakFrom` pure — slice into `tools/test-days.mjs` with a fixed `now`: a kana-only day keeps the streak; an input-only day with 5 min does not, 10 min does; `mergeDays` field-wise max.

## Data migration / compatibility
`jpn101:days` records gain optional fields; older records lack them (treated as 0). `mergeDays` rule changes from "higher `rev` wins whole record" to field-wise max — strictly safer. TODO-010's UTC→local key migration must run before/with this; this item does not rename keys.

## Testing & verification
- Do a 20-kana session on a fresh day → Study home streak counts today; mascot is "happy"; "+ 20 kana" stat shows.
- Rate an Input item (15 min) → "+ 15 min input" shows and the day counts for the streak.
- `node tools/test-days.mjs`.
- Build + deploy.

## Acceptance criteria
- [ ] Kana, Drill, Scripts completion and Input minutes write to the day log.
- [ ] Streak and mascot "studied today" honour any modality (input ≥ 10 min).
- [ ] `mergeDays` merges field-wise; `_days` refreshed after a cloud pull.
- [ ] Single `localDayKey()` helper shared with TODO-010 (no second date function).

## Pitfalls / notes
- Do not count Scripts *line advances* (cheap taps) — only a completed run.
- Freq's `todayNew` (L5427–5429) reads `days[today]` with the same key expression — switch it to `localDayKey()` at the same time.
- Rebuild `index.html` and deploy.
