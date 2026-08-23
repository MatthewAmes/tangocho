# TODO-108 — Freq (10k) "next reviews in ~" from FSRS `due`, not the retired SM-2 ladder

**Priority:** P2   **Effort:** XS   **Theme:** B — learning engine
**Source findings:** 05-expansion QW-14; 01-functionality §2.5; 02-pedagogy §2.3 and §4.4 Freq row
**Depends on:** TODO-100 (share the same `due` derivation)   **Blocks:** none

## Why
The 10k setup screen says "next reviews in ~Xh" using `REVIEW_INTERVALS[effLevel(c)] * ease` — the pre-FSRS ladder — while `stats.due` and the session use `dueness()`/FSRS. The two can disagree ("0 due · next reviews in ~3h" while FSRS would make a card due in 20 minutes, or vice-versa).

## Current behaviour (verified)
- `JpnFlashcards.jsx` L5440–5441:
  ```js
  let nextIn = null;
  if (studied.length) nextIn = Math.min(...studied.map((c) => (c.last || 0) + REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1) - now));
  ```
- Rendered L5518: `` · next reviews ${fmtIn(stats.nextIn)}`` when `stats.due === 0`.
- `REVIEW_INTERVALS` L2059; `effLevel` L2071–2074.

## Intended behaviour
`nextIn = min over studied cards of (due − now)` where `due` is the FSRS due (stored, else recomputed from S and the current retention target) — the same function TODO-100/107 use (`nextDueIn`).

## Implementation steps
1. Replace L5441 with:
   ```js
   if (studied.length) nextIn = Math.min(...studied.map((c) => { const d = nextDueIn(c, now); return d == null ? Infinity : d; }));
   if (!isFinite(nextIn)) nextIn = null;
   ```
   (`nextDueIn` from TODO-107; if implementing this first, inline: `const st = c.fsrs || seedFromHistory(c); const due = st && st.due > (st.last||0) ? st.due : (st.last||0) + Math.max(1, intervalFor(st.S, retentionTarget))*86400000; return due - now;`).
2. Remove the last remaining `REVIEW_INTERVALS` consumer outside `dueness`'s fallback; leave the constant (Theme C decides on deleting legacy ladder code).
3. Also relabel the heading at L5521 only if Theme C has not: "Frequency 10k · Tier 1 (148 words)" — optional here.

## Data migration / compatibility
None.

## Testing & verification
- With all Freq cards reviewed just now, setup shows "next reviews in ~1d" (FSRS minimum 1 d for a GOOD first review) rather than "~1m"/"~3h" from the ladder.
- After a lapse in the last session (TODO-100/103), it shows "~10m".
- Build + deploy.

## Acceptance criteria
- [ ] `stats.nextIn` is derived from FSRS `due`.
- [ ] `stats.due === 0` and `nextIn <= 0` never co-occur (the two clocks agree).

## Pitfalls / notes
- `stats` memo depends on `[deck]`; fine.
- Rebuild `index.html` and deploy.
