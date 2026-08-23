# TODO-102 — Route the Write tab into the production (`rfsrs`) track, with a writing-appropriate latency scale

**Priority:** P0   **Effort:** XS   **Theme:** B — learning engine
**Source findings:** 01-functionality §2.4 (MEDIUM); 02-pedagogy §1 item 2(c), §4.2, §4.4 Write row, §5 item 1; 06-architecture R13 / F-7
**Depends on:** none (TODO-101 recommended first so the threshold scale below matches the new mapping)   **Blocks:** none

## Why
The Write tab asks "write the Japanese for this meaning" — pure production (EN→JP) — but records the result with `dir === undefined`, which `recordResult` treats as recognition. Every handwritten answer therefore bumps `seen/correct/level` and the **recognition** FSRS state (`fsrs`), pushing `recallUnlocked` and the "words solid" count, while the production state `rfsrs` that commit 4dcefd8 created for exactly this direction stays untouched. Commit bc2f285's "火曜日 written from Write at S 0.6" was written into the wrong direction. Also, handwriting routinely takes > 6 s, so under the current 3 s/6 s thresholds Write grades almost always land HARD.

## Current behaviour (verified)
- `JpnFlashcards.jsx` L3765–3768:
  ```js
  const next = (got) => {
    if (card) onResult(card.id, got, undefined, thinkRef.current || undefined);
    setRevealed(false); setGuide(false); setPos((p) => p + 1);
  };
  ```
- `recordResult` L1392–1443: `const isProd = dir === "prod";` (L1416) selects `rfsrs`/`rseen`/`rcorrect`/`rlevel` (L1423–1430) vs `fsrs`/`seen`/`correct`/`level` (L1432–1438). `firstProdTry` (L1398) makes the first production failure not a lapse (`delta 0`).
- Write orders cards by `masteryScore` weakest-first over the whole deck (L3709) with no session boundary or gating on `recallUnlocked` (L2066–2070) — so it asks for production of words never recognised.
- Think time is measured show→Reveal (L3764, L3793–3796); grade via `gradeFromLatency` with 3 s/6 s (or TODO-101's 1.5 s/9 s).

## Intended behaviour
- Write records into the production track: `onResult(card.id, got, "prod", think)`.
- Production latency is scaled: writing a word by hand is slower than recognising it, so Write's think time is divided by a `WRITE_LATENCY_SCALE = 2.5` before grading (a 12 s correct handwrite ≈ a 4.8 s flip → GOOD under TODO-101; 25 s → HARD). Keep the raw time in `rms/rmsN` for display.
- Write's queue is ordered by production need: cards that are `prodDue` (L2127–2131) first, then `recallUnlocked` cards by weakest `rlevel`, then the rest — so the tab stops asking for production of words never recognised, and stops restarting with the same words every visit. Limit a pass to 20 cards ("Writing set complete" already exists at L3771–3776).

## Implementation steps
1. L3766 → `if (card) onResult(card.id, got, "prod", thinkRef.current ? thinkRef.current / WRITE_LATENCY_SCALE : undefined);` and add `const WRITE_LATENCY_SCALE = 2.5;` above `function Write` (L3708) with a one-line comment. (If TODO-101's `force` argument exists, pass nothing — let latency decide.)
2. Order (L3709): replace with
   ```js
   const order = useMemo(() => {
     const now = Date.now();
     const owed = cards.filter((c) => prodDue(c, now));
     const unlocked = cards.filter((c) => !prodDue(c, now) && recallUnlocked(c))
       .sort((a, b) => (a.rlevel || 0) - (b.rlevel || 0));
     const rest = cards.filter((c) => !recallUnlocked(c)).sort((a, b) => masteryScore(a) - masteryScore(b));
     return [...owed.sort((a, b) => (a.rfsrs?.due || 0) - (b.rfsrs?.due || 0)), ...unlocked, ...rest].slice(0, 20);
   }, [cards]);
   ```
   Note `cards` is replaced on every grade (`recordResult` maps the deck), so this memo re-sorts after each answer; to keep the order stable within a pass, compute the pass list once into a `useRef` on mount / "Go again" and index into it by `pos` (the `order` is only needed for `order.length` and `order[pos]`).
3. Eyebrow copy at L3782: append the direction so the learner knows this counts as production ("Write it from memory · production · 3/20").
4. `recordResult` needs no change. Optionally (nice to have): also store `rstreak` in the prod branch (L1424–1430) so TODO-101's EASY gate can read production streaks.
5. Tests: `recordResult` lives inside the component; the direction routing can be asserted by slicing the pure grading logic into a function `applyReview(card, {got, dir, ms, now, retention})` (06-architecture §9 step 7 recommends this extraction). Minimal test: `applyReview({seen:3, correct:3, level:2}, {got:true, dir:"prod", ms:4000})` returns `rseen === 1`, `seen === 3`, `rfsrs` set, `fsrs` unchanged.

## Data migration / compatibility
None. Existing cards whose recognition counters were inflated by past Write sessions are not repaired (there is no way to tell which reviews came from Write); document it. No new keys; merge rules unchanged.

## Testing & verification
- Manual: open Write, answer one card correctly; in Browse the row's `seen` must not change; in a console `JSON.parse(localStorage["jpn101:deck"]).find(c=>c.term==="…")` shows `rseen: 1` and `rfsrs` set, `fsrs` unchanged.
- Study "Smart Review" afterwards should include that card only if `prodDue` (it was just produced, so it should NOT be offered backwards immediately).
- Build + deploy (`cd tools && node build.mjs`; `cd ../cf && npx wrangler deploy`).

## Acceptance criteria
- [ ] A Write answer changes `rseen/rcorrect/rlevel/rfsrs` and never `seen/correct/level/fsrs`.
- [ ] Write's pass starts with production-due words, then unlocked-but-weak, then others; a pass is ≤ 20 cards.
- [ ] A 12 s correct handwrite is graded GOOD (not HARD).
- [ ] Eyebrow shows the direction.

## Pitfalls / notes
- `recordResult` calls `logDay({ ok: got, ms: t, deck: "class" })` for prod too — fine (TODO-111 extends logDay anyway).
- `firstProdTry` (L1398) keeps the first failed handwrite from being an ease penalty; unchanged.
- `index.html` is a committed build artifact — rebuild and commit.
