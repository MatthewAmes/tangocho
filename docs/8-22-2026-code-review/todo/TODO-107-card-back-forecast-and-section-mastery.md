# TODO-107 — Show "next in ~Nd" on the card back, per-section fading/mastery via `recallChance`, the week forecast, and derive "words solid" from stability

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 05-expansion QW-2, QW-6, QW-8; 02-pedagogy §4.5 ("words solid" after two fast hits), §7 item 6; 01-functionality §2.2 (two clocks on one screen)
**Depends on:** TODO-100 (forecast must match what is served)   **Blocks:** none

## Why
FSRS is invisible on the card: the back shows think-time and accuracy but not when the card comes back, and a scheduler you cannot inspect is one you do not trust (the code's own comment at L1623). Section chips show lifetime accuracy (never moves) instead of today's predicted recall, which is what tells a student which scene to hit before Friday. `forecast.week` is computed and never displayed. "Words solid" = `level >= 4`, which since commit 7322eee is reached after two sub-3 s recognitions — weaker than the label implies; stability is the honest measure.

## Current behaviour (verified)
- Card back L2002: `⏱ avg think …s · seen N× · P%` (`tc-timetag`). Nothing about the schedule. `fmtIn(ms)` exists at L5379–5386 (used by Freq).
- `batches` L1652–1679: `rate = correct/seen` per section; rendered L1895–1897 as `{b.cards.length} words · {rate}%`.
- `forecast` L1626–1639 computes `{fading, solid, week}`; only `fading` rendered (L1801).
- `knownCount` L1621 = `level >= 4`; `masteredPct` L1610–1613 same; buddy line uses `knownCount` (L1648); Browse "solid" pill L4055 uses `lvl >= 4`; Browse summary `mastered` (L3959) likewise.
- `recallChance(c, now)` L2134–2138 returns predicted R or null.

## Intended behaviour
- Card back (after flip, recognition and production): `next in ~6d` (or `~10m` in relearning) computed from the state *the card would have after this review*? No — keep it simple and truthful: show the **current** schedule (`st.due - now`, via `fmtIn`) before grading, and after TODO-105/106 optional. Label: `⏱ 1.4s · seen 9× · 89% · next ~6d`. For production cards use `rfsrs.due`.
- Section chips: `{n} words · {rate}% · {fading} fading` where `fading = count(recallChance(c, now) < retentionTarget)` among studied cards in the section; chips with `fading > 0` sort before others inside their Act order (keep `sectionRank` for ties). Act Dry-Run chips show the sum.
- Study home stats: add `<b>{forecast.week}</b> due this week`.
- "Solid" = studied and `S >= 21` days on the recognition state **and** `correct/seen >= 0.7` (keep the accuracy guard). Apply in `knownCount`, `masteredPct`, Browse summary/pill (`solid` pill text unchanged). Update the comment at L1796–1798 to state the new definition.

## Implementation steps
1. Helper next to `recallChance` (L2134):
   ```js
   function nextDueIn(c, now, dir = "rec") {        // ms until the scheduler wants this card again; null if never reviewed
     const st = dir === "prod" ? c.rfsrs : (c.fsrs || seedFromHistory(c));
     if (!st || !(st.S > 0)) return null;
     const due = st.due > (st.last || 0) ? st.due : (st.last || 0) + Math.max(1, intervalFor(st.S, retentionTarget)) * 86400000;
     return due - now;
   }
   function isSolid(c) {
     const seen = c.seen || 0; if (!seen) return false;
     const st = c.fsrs || seedFromHistory(c);
     return !!(st && st.S >= 21) && (c.correct || 0) / seen >= 0.7;
   }
   ```
2. Card back L2002: extend the tag:
   ```jsx
   {(card.msN || 0) > 0 && <span className="tc-timetag">⏱ avg think {…}s · seen {…}× · {…}%{(() => { const d = nextDueIn(card, Date.now(), isProd ? "prod" : "rec"); return d == null ? "" : " · next " + fmtIn(d); })()}</span>}
   ```
   `fmtIn` is declared at L5379 (function declarations hoist, so it is usable from Study). Note `fmtIn(ms <= 0) → "now"` — after TODO-100 a relearning card reads "next now"; acceptable, or special-case `"next: again soon"`.
3. `batches` (L1652–1679): inside `scored`/`base`, add `fading = group.filter((c) => (c.seen||0) > 0 && (recallChance(c, now) ?? 1) < retentionTarget).length` (compute `now` once at the top); add to Dry Run objects too; sort: `sectionRank(a.name) - sectionRank(b.name)` unchanged, but render the meta as `{b.cards.length} words · {rate}%{b.fading ? ` · ${b.fading} fading` : ""}` (L1895–1897) and add class `tc-rate-low` when `fading / studied > 0.3`.
4. Study home L1799–1801: add `{forecast.week > 0 && <span className="tc-stat"><b>{forecast.week}</b> due this week</span>}`; `forecast.week` is already computed (L1636).
5. Replace `level >= 4` with `isSolid(c)` at L1612 (`masteredPct`), L1621 (`knownCount`), Browse L3959's `summary.mastered` source (find `summary` memo above L3945 — it filters `level >= 4`; same change), and L4055 pill condition (`isSolid(c)` instead of `lvl >= 4 && correct/seen >= 0.5`). Update the comment at L1796–1798.
6. `useMemo` deps: `batches` and `forecast` depend on `[cards]`; add the `retention` state (L1622) so chip counts update when the target changes (see TODO-100 pitfall).
7. Tests: `isSolid`/`nextDueIn` are pure; slice with `grab()` into `tools/test-schedule.mjs` (from TODO-100): `isSolid({seen:2,correct:2,level:4,fsrs:{S:5}})` is false; `{seen:5,correct:5,fsrs:{S:30}}` true; `nextDueIn` uses `due` when present.

## Data migration / compatibility
None. No new keys.

## Testing & verification
- Flip any studied card: tag ends with `next ~Nd` consistent with `dueCount` behaviour (a due card says `next now`).
- Section chip for a recently studied scene shows `· k fading`; after reviewing those cards it drops.
- "Words solid" on the home screen drops (likely sharply) — expected; the buddy line still reads sensibly because `knownCount > 0` gating is unchanged.
- Build + deploy.

## Acceptance criteria
- [ ] Card back shows the scheduler's next due (`fmtIn`), per direction.
- [ ] Section chips show a fading count driven by `recallChance` vs `retentionTarget`.
- [ ] Study home shows "due this week".
- [ ] "solid"/"mastered" everywhere uses `isSolid` (S ≥ 21 d and ≥ 70 % accuracy).
- [ ] Unit tests for `isSolid` and `nextDueIn`.

## Pitfalls / notes
- `seedFromHistory` for never-FSRS'd legacy cards yields `S` from level/accuracy (fsrs.mjs L131–132): level-4 cards seed to `6·(0.45+acc)` ≈ 8.7 d → not solid until reviewed — intended.
- Freq's card back (L5583) can get the same tag for free; optional.
- Theme C (TODO-217) owns the visual polish of the chips (backdrop-filter etc.); keep markup changes minimal.
- Rebuild `index.html` and deploy.
