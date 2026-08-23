# TODO-104 — Session composition: honour smartPool's production picks, fix slot accounting, make "Go again" draw the next due cards, and prefer the active scene for new words

**Priority:** P1   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 01-functionality §2.5 (LOW, slot accounting / prodSet); 02-pedagogy §4.2 "Session composition" (1)(2) and "Production recall" (prodSet consumes recognition-due cards), §7 item 7; 05-expansion §2.5; 06-architecture §4.3 (`smartPool` extractable & testable)
**Depends on:** TODO-100   **Blocks:** TODO-110 (catch-up mode builds on the same `smartPool`/`start` code)

## Why
Four small composition defects add up: (1) `smartPool` reserves `prodSlots` before filtering `chosenProd` against `review`, so filtered-out cards shrink the session below 16; (2) `start()` throws `smartPool`'s carefully interleaved production choice away and recomputes `prodSet = owed.slice(0, 6)` over the whole ordered queue — so a card that was selected because it is *recognition*-due can be asked backwards instead, and its overdue recognition review never happens; (3) "Go again" replays the *same* 16 (`lastPool.subset`), so clearing 40 due cards means Done → Smart Review → Done …; (4) new words are taken earliest-lesson-first, while a student with a quiz on Friday needs the current scene.

## Current behaviour (verified)
- `smartPool` L1571–1603: `prodSlots = Math.min(prod.length, 4)` (L1586); `reviewSlots = SESSION - newSlots - prodSlots` (L1587); `chosenProd = prod.slice(0, prodSlots).filter((c) => !review.includes(c))` (L1589) — cards dropped here are not replaced; interleave L1596–1601; return `[...body, ...fresh.slice(0, newSlots)]` (L1602). Fresh sorted `(a.lesson||0) - (b.lesson||0)` (L1579–1580).
- `start(subset, preordered, opts)` L1689–1719: `owed = ordered.filter((c) => prodDue(c, nowP)); setProdSet(new Set(owed.slice(0, 6).map((c) => c.id)));` (L1713–1715). `lastPool.current = { subset, preordered, opts }` (L1691). Deps `[cards, coverage]` (L1719) where `coverage` (L1560) is otherwise unused.
- "Go again" L1934–1937: `start(L && L.subset ? L.subset : smartPool, …)`.
- `grade` L1746 decides direction by `prodSet.has(c.id)`.
- Section chips call `start(b.cards)` (L1890) — a plain subset, not preordered.

## Intended behaviour
- `smartPool` returns the session **with direction attached**: each entry is either a card or `{card, dir: "prod"}`; production picks are exactly the `chosenProd` cards; a card never appears both as recognition and production in one session; slots lost to the `review` overlap are back-filled from the next production-due cards; session is 16 whenever ≥ 16 candidates exist.
- `start()` uses the direction the pool supplies when `preordered` (smart session) and only computes its own `prodSet` for ad-hoc subsets (section chips, Weak, All). In the ad-hoc case, only cards that are **not** recognition-due may be chosen for production (`!(dueness(c, now) >= 1)`).
- "Go again" after a smart session recomputes `smartPool` against the *updated* deck (next 16 due), excluding cards already seen this sitting when possible; after a subset session it replays the subset as today.
- New-word ordering: if the learner has opened a section chip in the last 24 h (store `jpn101:lastSection = {name, at}` via `sSet` when a chip is tapped), fresh cards from that section come first, then earliest-lesson.

## Implementation steps
1. Rewrite `smartPool` (L1571–1603) to produce `{ list: Card[], prodIds: Set<string> }`:
   ```js
   const review = [...due, ...rest].slice(0, Math.max(0, reviewSlots));
   const reviewIds = new Set(review.map((c) => c.id));
   const chosenProd = prod.filter((c) => !reviewIds.has(c.id)).slice(0, prodSlots);   // filter THEN slice: backfills
   const shortfall = prodSlots - chosenProd.length;                                      // fewer prod than planned → more reviews
   const reviewFull = [...due, ...rest].slice(0, Math.max(0, reviewSlots + shortfall));
   …interleave chosenProd into reviewFull exactly as L1596–1601…
   return { list: [...body, ...freshOrdered.slice(0, newSlots)], prodIds: new Set(chosenProd.map((c) => c.id)) };
   ```
   Update the three consumers: the button label (L1827–1828 `smartPool.length` → `smartPool.list.length`), `start(smartPool, true)` → `start(smartPool.list, true, { prodIds: smartPool.prodIds })`, and "Go again" (step 3).
2. `start()` (L1713–1715):
   ```js
   const nowP = Date.now();
   const prodIds = opts && opts.prodIds
     ? opts.prodIds
     : new Set(ordered.filter((c) => prodDue(c, nowP) && !(dueness(c, nowP) >= 1)).slice(0, 6).map((c) => c.id));
   setProdSet(prodIds);
   ```
   Remove `coverage` from the deps (L1719) and delete the unused `coverage`/`focusPool` memos (L1558, L1560) — or leave for Theme C's dead-code pass (TODO-22x); either is fine, but do not keep `coverage` in deps.
3. "Go again" (L1934–1937): if `lastPool.current.subset` is null (smart session) call `start(smartPool.list, true, { prodIds: smartPool.prodIds })` — `smartPool` is a memo on `[cards]` and has already recomputed after the session's grades, so it naturally yields the next due cards. Rename the button to "Next 16" when `lastPool.current.subset` is null and `dueCount > 0`.
4. Section preference for new words: in the chip `onClick` (L1890) add `sSet("jpn101:lastSection", JSON.stringify({ name: b.name, at: Date.now() }))` (note `sSet` triggers a cloud push — acceptable; or use `localStorage` directly to avoid the push). In `smartPool`, read it once (`useMemo` may read `localStorage` synchronously) and sort `fresh` with `(a,b) => (inSec(b)-inSec(a)) || (a.lesson-b.lesson)` where `inSec(c) = sectionOf(c) === last.name && Date.now()-last.at < 86400000 ? 1 : 0`.
5. Extract `smartPool`'s body into a pure module-level function `composeSmartSession(cards, now, opts)` so it can be tested by text-slicing (`grab("composeSmartSession","function")` in a new `tools/test-session.mjs`), with stubs for `isLeech/dueness/needScore/prodDue/sectionOf`. Assertions (from 05 §5.5 item 6): with 0/15/40 due → 8/5/3 new; `list.length === 16` when enough candidates; no id appears twice; no two adjacent `prodIds` entries; every `prodIds` member is `prodDue` and not recognition-due.

## Data migration / compatibility
New optional key `jpn101:lastSection` (tiny). If written via `sSet` it is synced under the generic "newer snapshot wins" rule in `mergeSnapshots` (L1017–1018), which is fine for a preference; add it to `SYNC_SKIP_KEYS` (L908) if TODO-004 (Theme A skip-keys) decides preferences should stay local.

## Testing & verification
- `node tools/test-session.mjs` (new) passes.
- Manual: with ≥ 30 due, run Smart Review, finish, tap "Next 16": the second session contains none of the first 16 (unless requeued) and `dueCount` on the home drops by ~32 after both.
- Manual: a card shown as production in a smart session never also appears as recognition in that session.
- Build + deploy.

## Acceptance criteria
- [ ] Smart sessions are 16 cards whenever ≥ 16 candidates exist.
- [ ] Production cards in a smart session are exactly `smartPool`'s picks; none is recognition-due.
- [ ] "Go again"/"Next 16" after a smart session serves the next due cards, not the same 16.
- [ ] Fresh cards prefer the section opened in the last 24 h.
- [ ] `composeSmartSession` is unit-tested (slot ladder, size, uniqueness, no adjacent production).

## Pitfalls / notes
- `grade` (L1735) reads `prodSet` without listing it in deps (01 §2.5) — safe because `setQueue`/`setProdSet` are batched in `start`; keep it that way or add `prodSet` to the deps.
- `lastPool.current` shape gains `opts.prodIds`; "Review the N you missed" (L1932) passes a plain subset — unaffected.
- Coordinate with TODO-110 (catch-up mode) which adds a `{ reviewsOnly: true }` option to the same composer.
- Rebuild `index.html` and deploy.
