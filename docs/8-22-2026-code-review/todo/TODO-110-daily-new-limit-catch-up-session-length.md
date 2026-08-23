# TODO-110 — Visible daily new-card limit, catch-up mode when review debt is high, and a session-length chip

**Priority:** P1   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 05-expansion §2.5, §2.6; 02-pedagogy §4.2 ("no do-all-due path", review-debt risk), §4.5 (no daily goal), §7 item 7
**Depends on:** TODO-104 (uses the extracted `composeSmartSession`), TODO-100   **Blocks:** none

## Why
Session size is fixed at 16 and the new-word ladder (8/5/3 by due pressure) is invisible and unadjustable, while new-card intake is deliberately uncapped for class deadlines. With ~500 studied cards, daily due counts of 30–60 are plausible; the mascot turns "worried" at > 40 due but the app offers no way to clear debt other than repeated 16-card sessions. Freq already has a visible, adjustable quota (`10/15/20 new/day`, L5525–5529) — Study should have the same honesty plus a reviews-only catch-up mode.

## Current behaviour (verified)
- `smartPool` L1571–1603: `SESSION = 16` (L1573); `newSlots = Math.min(fresh.length, due.length >= 40 ? 3 : due.length >= 15 ? 5 : 8)` (L1582); `prodSlots ≤ 4` (L1586).
- Study home: Smart Review button L1826–1830; hint L1840–1846; retention chips L1849–1863; mascot L1244–1249 (`worried` when `dueCount > 40`).
- Freq quota UI L5525–5529, persisted as `jpn101:freqQuota` (L5434); daily new count from `days[today].fnew` (L5427–5429, `logDay` L1215).
- `logDay` (L1210–1217) records `rev/ok/ms/frev/fnew` — there is no per-day count of **class-deck new cards**.
- Kana has `KANA_LENGTHS = [10, 20, 40, "all"]` (L2571) as the chip pattern.

## Intended behaviour
- `jpn101:studyPrefs = { newPerDay: 8|15|25|0 (0 = no limit, default 15), session: 10|16|25|40 (default 16) }`, synced (generic rule is fine).
- `logDay` gains `cnew` (class-deck new cards today). `smartPool` computes `newAllowance = newPerDay ? max(0, newPerDay − today.cnew) : ∞` and `newSlots = min(fresh.length, ladder(due), newAllowance)`; session size = `prefs.session`.
- Catch-up mode: when `dueCount > 40` (or `> 2 × session`), the Study home shows a second button "Catch up · reviews only · N" that starts `composeSmartSession(cards, now, { reviewsOnly: true, size: min(40, dueCount) })` — no new cards, no production, most-overdue first; the mascot's "worried" line points at it ("… Try a catch-up: reviews only."). Do **not** silently change the retention target (05 suggested 0.85 for the session; keep it explicit — mention the 85 % chip in the hint instead).
- Home copy shows the day's intake: "New today 6/15".

## Implementation steps
1. Prefs: module-level `const PREFS_KEY = "jpn101:studyPrefs"; const DEFAULT_PREFS = { newPerDay: 15, session: 16 };` + `loadPrefs()`/`savePrefs()` via `sGet/sSet` (JSON). In `Study` add `const [prefs, setPrefs] = useState(DEFAULT_PREFS); useEffect(() => { loadPrefs().then(setPrefs); }, []);`.
2. `logDay` (L1210–1217): accept `cnew` and add `d.cnew = (d.cnew||0) + (cnew ? 1 : 0)`. In `recordResult` (L1394) pass `cnew: !isProd && (c.seen||0) === 0` — `c` is only known inside the updater; compute `const wasNew = prev.find(x => x.id === id)?.seen === 0` before `logDay` or move `logDay` inside the updater's branch (it already runs impure code there; see 01 §1.3). Simplest: inside `setCards` updater, right before `return next`, call `logDay({ ok: got, ms: t, deck: "class", cnew: wasNew })` and delete the call at L1394.
3. `composeSmartSession(cards, now, { size, newAllowance, reviewsOnly, prodIdsWanted })` (from TODO-104): `const SESSION = opts.size || 16; const newSlots = opts.reviewsOnly ? 0 : Math.min(fresh.length, ladder, opts.newAllowance ?? Infinity); const prodSlots = opts.reviewsOnly ? 0 : Math.min(prod.length, 4);`. Study's `smartPool` memo passes `size: prefs.session, newAllowance` (from `days[todayKey].cnew`; `days` state exists L1616–1620 — add `days`/`prefs` to the memo deps).
4. Catch-up: `const catchUp = useMemo(() => dueCount > Math.max(40, 2 * prefs.session) ? composeSmartSession(cards, Date.now(), { size: Math.min(40, dueCount), reviewsOnly: true }) : null, [cards, dueCount, prefs]);` and render after the Smart Review button:
   ```jsx
   {catchUp && <button className="tc-btn tc-start" onClick={() => start(catchUp.list, true, { prodIds: new Set() })}>⏱ Catch up · {catchUp.list.length} reviews only</button>}
   ```
   Mascot line (L1646): append " Try a catch-up session — reviews only." when `catchUp` exists (pass via `buddy` memo deps).
5. Chips in the retention block area (L1849–1863), same `tc-kanaseg`/`tc-fchip` markup: "New/day: 8 · 15 · 25 · ∞" and "Session: 10 · 16 · 25 · 40"; `onClick` → `setPrefs(p => {const n = {...p, newPerDay}; savePrefs(n); return n;})`. Add `New today {today.cnew||0}/{newPerDay||"∞"}` to the hint line L1840–1846.
6. Tests: extend `tools/test-session.mjs` (TODO-104): `reviewsOnly` yields 0 new and 0 prod; `newAllowance: 2` caps new at 2; `size: 25` yields 25 when available.

## Data migration / compatibility
New key `jpn101:studyPrefs` (tiny JSON; generic "newer snapshot wins" merge is acceptable). `days[k].cnew` is a new optional counter inside the existing `jpn101:days` records; `mergeDays` (L954–963) keeps the record with higher `rev` per day — unchanged. Older days lack `cnew` (treated as 0).

## Testing & verification
- Set New/day 8, study 8 new words → Smart Review composes with 0 new; hint shows "New today 8/8"; next local day resets (depends on TODO-010's `localDayKey()`; until it lands the reset happens at UTC midnight).
- With > 40 due, the Catch-up button appears, its session has no production/new cards, and `dueCount` drops by the session size afterwards.
- Session 40 chip → Smart Review shows "· 40 cards".
- Build + deploy.

## Acceptance criteria
- [ ] `jpn101:studyPrefs` with `newPerDay` and `session`, adjustable from Study home, persisted and synced.
- [ ] New-card intake respects the daily allowance (tracked via `days[k].cnew`).
- [ ] Catch-up (reviews-only) button appears at high due counts; the mascot hints at it.
- [ ] Session-length chip changes the composed size.
- [ ] `composeSmartSession` options are unit-tested.

## Pitfalls / notes
- Day key: `todayKey` (L1619) is UTC today; TODO-010 changes `logDay`/`todayKey` together — use its `localDayKey()` helper, not a new one.
- Keep "never zero new words" spirit: default `newPerDay: 15` and `∞` available; do not hard-cap.
- Rebuild `index.html` and deploy.
