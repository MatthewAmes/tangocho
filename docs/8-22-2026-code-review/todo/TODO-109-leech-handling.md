# TODO-109 — Leech handling: suspend / reset from Browse, auto-offer a hook, surface confusable siblings

**Priority:** P2   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 05-expansion QW-13, §2.7; 02-pedagogy §3 (leech design is right), §4.2 leeches; 01-functionality §8 (`weakness()` unused)
**Depends on:** none (TODO-126 for the auto-hook; TODO-105 for confusables)   **Blocks:** none

## Why
Leech detection (`isLeech`), exclusion from Smart Review, a dedicated "Trouble words" session and a mnemonic box exist and are pedagogically right. What is missing is control: there is no way to suspend a word that is a duplicate/phrase you will never need, no way to reset a card whose history is polluted (e.g. by the Write→recognition leak, TODO-102), nothing re-offers the ✨ hook automatically for stuck words, and nothing shows *why* a word is stuck (its confusable sibling).

## Current behaviour (verified)
- `isLeech` L2078–2083: `t >= 8 && totalMisses >= 6 && acc < 0.6`.
- `smartPool` excludes leeches (L1574 `!isLeech(c)`); `start()` throttles to 3 unless `leechSession` (L1692–1698); Trouble button L1835–1839 (`leeches.slice(0, 12)`).
- Mnemonic box on the card back L2003–2015 (`tc-mnbox`, `onMnemonic`); `setMnemonic` L1384–1390 stores `mn` (≤ 120 chars).
- Browse rows L4042–4057: delete ✕ only; pills `🩹 stuck` / `needs review` / `solid`.
- Card schema (06 §6.1): no `susp` field; `removeCard` deletes permanently and sync resurrects deleted cards from other devices (01 §1.5, no tombstones).

## Intended behaviour
- `c.susp === true` → excluded from every Study pool (`smartPool`, `start` subsets, section chips' counts still include it but greyed), from Write (TODO-102 order), from `dueCount`/`forecast`. Browse gains a "Suspended" filter and a per-row "suspend/unsuspend" action. Suspension syncs (it is a card field; `mergeDeck` keeps the higher `seen·1e6+last` record — set `last = Date.now()` when toggling so the toggle wins).
- "Reset" on a Browse row clears `seen/correct/level/ease/streak/ms/msN/fsrs/rseen/rcorrect/rlevel/rms/rmsN/rfsrs/mn` (keeps `id`, content, `susp`) after a two-tap confirm; sets `last = Date.now()` so the reset propagates through `mergeDeck` (note: a device that studied the card *after* the reset wins — acceptable).
- When a card becomes a leech (first time `isLeech` flips true during `recordResult`) and has no `mn` and no cached hook, the next time it is shown the back auto-requests the hook (TODO-126's `callAI("hook")`) instead of waiting for the ✨ tap. Without TODO-126, show the mnemonic box focused.
- Confusable siblings (requires TODO-105): on the leech card back show "often confused with: X" = the card most frequently answered correctly within 60 s *after* this card was missed (from the revlog: for each AGAIN row of this item, look at the next `class` row; tally by itemId). Compute lazily on card show; cache in a ref per session.

## Implementation steps
1. Schema: treat `susp` as optional boolean on cards. Add to the root component (after `setMnemonic` L1384–1390):
   ```js
   const setSuspended = useCallback((id, susp) => setCards((prev) => { const next = prev.map((c) => c.id === id ? { ...c, susp, last: Date.now() } : c); sSet(STORE_KEY, JSON.stringify(next)); return next; }), []);
   const resetCard = useCallback((id) => setCards((prev) => { const next = prev.map((c) => { if (c.id !== id) return c; const { seen, correct, level, ease, streak, ms, msN, fsrs, rseen, rcorrect, rlevel, rms, rmsN, rfsrs, mn, ...keep } = c; return { ...keep, seen: 0, correct: 0, last: Date.now() }; }); sSet(STORE_KEY, JSON.stringify(next)); return next; }), []);
   ```
   Thread both to `<Browse … onSuspend={setSuspended} onReset={resetCard}>` (L1489).
2. Exclusions: `smartPool` L1574 `cards.filter((c) => (c.seen||0) > 0 && !isLeech(c) && !c.susp)`, fresh L1579 `!c.susp`, `prod` L1585 `!c.susp`; `start()` L1690 `pool0 = (...).filter((c) => !c.susp)`; `dueCount` L1608 and `forecast` loop L1630 skip `c.susp`; `leeches` L1604 skip `susp`; Write order (TODO-102) skip `susp`.
3. Browse: filters L4027 add `["suspended", "Suspended"]`; in `shown` memo (L3940–3948) `filter === "suspended" ? list.filter(c => c.susp) : list.filter(c => !c.susp)` for the others. Row actions (L4046): add two small buttons: `⏸`/`▶` → `onSuspend(c.id, !c.susp)` (aria-label "Suspend …"/"Resume …"), and `↺` → two-tap confirm then `onReset(c.id)`. Suspended rows get class `is-susp` (opacity .55) — CSS token one line.
4. Auto-hook: in Study, `useEffect` on `[card, flipped]`: `if (flipped && card && isLeech(card) && !card.mn && !hook) getHook(card);` (after TODO-126 `getHook` calls the Worker; before it, the call fails fast and falls back — so gate on `AI_ENABLED` or skip this step until 126).
5. Confusables (after TODO-105): helper `confusablesFor(itemId, revlog, cards)` → top 2 terms; render under the mnemonic box: `<p className="tc-mnshow">🔀 often mixed up with {terms}</p>`.
6. Tests: `confusablesFor` is pure — test with a synthetic log (`[["class","a","rec",t,1,...],["class","b","rec",t+20000,3,...]]` → `b`).

## Data migration / compatibility
`susp` is a new optional card field: existing decks have none (falsy). `mergeDeck` (L937–953) compares whole records by `seen·1e6+last`; bumping `last` on toggle/reset makes the newest action win. Backup/restore (L3843, L3856+) carry the deck verbatim, so `susp` survives. No new keys.

## Testing & verification
- Suspend a card in Browse → it disappears from Smart Review, `dueCount`, Write; "Suspended" filter lists it; resume restores it.
- Reset a card → Browse shows "not studied yet"; Smart Review treats it as fresh.
- Two devices: suspend on A, reload B after sync → suspended on B.
- Build + deploy.

## Acceptance criteria
- [ ] `susp` cards never appear in any Study/Write queue and are excluded from due/forecast counts.
- [ ] Browse has Suspended filter, suspend/resume and reset (confirmed) actions; both survive sync.
- [ ] Leech cards auto-request a hook (when AI is available) or focus the mnemonic box.
- [ ] (With TODO-105) leech back shows up to 2 confusable siblings from the log.

## Pitfalls / notes
- Do NOT implement suspend as delete: deletes resurrect via sync (no tombstones).
- TODO-216 (Theme C) covers the generic two-tap confirm/undo pattern; reuse it for Reset, and `tc-confirm` (L4004) styling meanwhile.
- Rebuild `index.html` and deploy.
