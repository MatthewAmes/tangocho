# TODO-120 — Input: record measured (not planned) minutes and weight evidence by them

**Priority:** P2   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 05-expansion QW-11, §3.2-I; 02-pedagogy §4.1 (evidenceWeight by planned minutes), §4.5
**Depends on:** none   **Blocks:** none (TODO-111 logs `inputMin` from whatever `minutes` is stored — prefer measured)

## Why
`open()` stores `minutes` = the planned time chip, and `evidenceWeight(minutes)` weights the rating by it. A 60-minute plan abandoned after 3 minutes is recorded as strong evidence; the weekly export is a plan diary, not an input diary.

## Current behaviour (verified)
- `open()` L4666–4672: `entry = { itemId, at: Date.now(), medium, mode, minutes, title, source, url }` (planned `minutes` from the chip, L4547).
- Pending card L4773–4790: verdict chips only.
- `rate()` L4674–4699: `applyRating({ …, verdict, minutes: entry.minutes })`; history row `{ ...entry, verdict, ratedAt }`.
- `evidenceWeight(minutes)` L4341: `max(0.25, min(1, minutes/20))`.
- `logOffline` L4702–4717 uses `logMin` (an explicit chip) — that one is already "measured" by the learner.

## Intended behaviour
- The pending card shows three chips before the verdict: "bailed early (≈⅕) · about half · finished" (default "finished"), plus the elapsed hint "opened 23 min ago". `minutes` stored on the history row = `planned` if finished, `planned/2` if half, `max(1, planned/5)` if bailed — and in all cases capped by elapsed time since `at` when the rating happens within 3 h of opening (`elapsed = (ratedAt − at)/60000`; `minutes = min(minutes, max(1, elapsed))`). Store both `planned` and `minutes`.
- `evidenceWeight` uses `minutes` (measured) — unchanged function, different input.
- Export (L4745–4767) prints measured minutes; the weekly total becomes honest.

## Implementation steps
1. `open()` L4668: `{ …, planned: minutes, minutes, … }`.
2. Pending card: per-entry state `done[p.itemId+p.at] ∈ "bail"|"half"|"full"` (default `"full"`); render a `tc-kanaseg` row with three `tc-fchip` (Bi labels: "Bailed early 途中でやめた" / "About half 半分" / "Finished 最後まで") above the verdicts; hint `agoLabel`-style "opened {m} min ago" using `Math.round((Date.now()-p.at)/60000)` when < 180.
3. `rate(entry, verdict, done)`: compute
   ```js
   const planned = entry.planned || entry.minutes || 0;
   let mins = done === "bail" ? Math.max(1, Math.round(planned / 5)) : done === "half" ? Math.round(planned / 2) : planned;
   const elapsed = (Date.now() - entry.at) / 60000;
   if (elapsed < 180) mins = Math.min(mins, Math.max(1, Math.round(elapsed)));
   ```
   and pass `minutes: mins` to `applyRating` and store `{ ...entry, planned, minutes: mins, done, verdict, ratedAt }`.
4. TODO-111's `logDay({ kind: "input", minutes })` uses `mins`.
5. Test: `computeMeasuredMinutes(entry, done, now)` as a pure helper (slice into `tools/test-input-engine.mjs`): planned 60, bail, 3 min elapsed → 3; planned 15, full, elapsed 40 → 15; planned 30, half, elapsed 200 (> 3 h, rating next day) → 15.

## Data migration / compatibility
History rows gain `planned`, `done`; old rows have only `minutes` (treated as measured). No merge change.

## Testing & verification
- Open a 60-min pick, rate 2 minutes later with "bailed" → history row `minutes: 2`; level moves by the 0.25 floor weight.
- Export shows `2m` for that row.
- Build + deploy.

## Acceptance criteria
- [ ] History rows carry `planned` and measured `minutes`; `evidenceWeight` uses the latter.
- [ ] Completion chips default to "finished" and elapsed caps the minutes within 3 h.
- [ ] Pure helper unit-tested.

## Pitfalls / notes
- Keep the verdict chip as the submit (the UI pattern today); the completion chip just sets state first.
- Rebuild `index.html` and deploy.
