# TODO-010 — Key days by local date, not UTC (streak, "today", 10k quota, Input log)

**Priority:** P1   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 6.3; 02-pedagogy § 4.5 and § 6; 03-ui-ux § I-2 (HIGH, observed "0 days in a row · 8 today" at 20:50); 06-architecture § 7.2 (date arithmetic untested)
**Depends on:** none   **Blocks:** TODO-111 (Theme B: log every modality to the day log — must use the same `localDayKey()` helper, not a second one)

## Why
Every day bucket uses `new Date().toISOString().slice(0,10)`, i.e. the UTC date. For a US-Mountain user the "day" rolls over at 17:00/18:00 local, so an evening session is logged under tomorrow: the streak reads 0 right after studying, "N today" shows last evening's reviews the next morning, and the 10k "new today" quota resets at dinner time. `streakFrom` even mixes clocks — it anchors at local noon and then keys with `toISOString()`. This is the one number meant to bring a student back tomorrow, and it is wrong exactly when he studies.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1212` (`logDay`): `const k = new Date().toISOString().slice(0, 10);`
- `:1225` (`streakFrom`): `const key = (d) => new Date(d).toISOString().slice(0, 10);` with `today.setHours(12,0,0,0)` at `:1227`.
- `:1619` (Study): `const todayKey = new Date().toISOString().slice(0, 10);`
- `:5428` (Freq): `const today = days[new Date().toISOString().slice(0, 10)];`
- `:4740` (Input `week` memo): `const d = new Date(h.at).toISOString().slice(0, 10);` and `:4748`, `:4756` in `exportWeek` (display only).
- `:1288`, `:3848`, `:4761` — file names (`tangocho-backup-YYYY-MM-DD.json`) — cosmetic, may also switch.
- `mergeDays` (`:954-963`) merges by key string; keys are opaque to it.

## Intended behaviour
- One helper `localDayKey(d = new Date())` → `"YYYY-MM-DD"` in the device's local time zone, used by every day-bucket read and write.
- Existing UTC-keyed history is left as-is (no rewrite); the streak/"today" logic is self-consistent from the first session after deploy.

## Implementation steps
1. **Add the helper** above `logDay` (~`:1204`):
   ```js
   /** Local calendar date "YYYY-MM-DD". toISOString() is UTC, which for a US-Mountain user
    *  rolls the "day" over at dinner time — evening reviews were landing on tomorrow's key. */
   function localDayKey(d = new Date()) {
     const x = d instanceof Date ? d : new Date(d);
     const p = (n) => String(n).padStart(2, "0");
     return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
   }
   ```
2. **Replace call sites**: `:1212` → `const k = localDayKey();`; `:1225` → `const key = (d) => localDayKey(d);`; `:1619` → `const todayKey = localDayKey();`; `:5428` → `days[localDayKey()]`; `:4740` → `localDayKey(h.at)`; `:4748`, `:4756` → `localDayKey(...)`. File names at `:1288`, `:3848`, `:4761` → `localDayKey()` (optional, but consistent).
3. **`streakFrom`** now: `today` at local noon, `cursor.setDate(cursor.getDate() - 1)` steps local days, `key()` is local — all one clock. Keep the grace rule.
4. **Do not migrate old keys.** Rationale: a day bucket has no timestamps, so the true local day of old entries is unknowable; and the switch cannot break a streak — an evening session yesterday was logged under *today's* UTC key, which equals today's local key, so today already counts. Document this in the helper comment.
5. **Make `streakFrom` testable** while you are there: `function streakFrom(days, now = new Date())` and `const today = new Date(now); today.setHours(12, 0, 0, 0);` — the default keeps every caller (`:1618` `streakFrom(days)`) unchanged. If TODO-008 created `tools/merge.mjs`, put `localDayKey` and `streakFrom` in a sibling `tools/days.mjs` and import them (`import { localDayKey, streakFrom } from "./tools/days.mjs";`) so the test can import real code instead of slicing source text; `logDay`/`loadDays` stay in the JSX (they touch storage).
6. Rebuild, commit `index.html`, deploy.

## Data migration / compatibility
- `jpn101:days` keeps existing entries. At most one historical day may look doubled/empty around the switch; the streak cannot decrease because of the switch (see step 4). `mergeDays` is unaffected.
- Devices in different time zones (travel) will bucket differently — same as any local-date app; acceptable.

## Testing & verification
- Add to `tools/test-merge.mjs` (or a tiny `tools/test-days.mjs` if the helper is moved to `tools/merge.mjs`/`days.mjs`): `localDayKey(new Date(2026, 7, 22, 23, 30))` → `"2026-08-22"` regardless of `TZ`; run with `TZ=America/Denver node tools/test-days.mjs` and `TZ=UTC …` to confirm both give the local date of the Date object constructed in that TZ. Also `streakFrom` with a fixed `days` map and a mocked "now" is best tested by giving `streakFrom` an optional `now` param: `function streakFrom(days, now = new Date())` — do that (non-breaking) and assert: studied today → n≥1; studied yesterday only → 1 (grace); gap of one day → 0; across a DST change (2026-11-01 in Denver) the count still steps one day at a time.
- Manual: set the machine clock to 21:00 local, grade a card → buddy shows "1 days in a row" (with the plural fix from Theme C, "1 day") and "1 today"; the 10k quota counter increments under today's local date.

## Acceptance criteria
- [ ] No `toISOString().slice(0, 10)` remains for day buckets (grep).
- [ ] Evening sessions count toward today's streak/"today"/10k quota.
- [ ] `streakFrom` unit tests pass under `TZ=UTC` and `TZ=America/Denver`.

## Pitfalls / notes
- Do not use `toISOString()` on a date shifted by `getTimezoneOffset()` (the trick in 03 § I-2) — it breaks on DST transition days; the `getFullYear/getMonth/getDate` form is exact.
- `logDay` is only called from Study/Write (`:1394`) and Freq (`:5481`); counting Kana/Drill/Input toward the streak is a Theme B/C pedagogy change, not this item.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
