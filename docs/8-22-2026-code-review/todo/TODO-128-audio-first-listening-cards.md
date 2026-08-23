# TODO-128 — Audio-first (listening) cards interleaved into Study, with their own `lfsrs` track

**Priority:** P3   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 05-expansion §2.4 ("Audio-first (listening) cards — S"); 02-pedagogy §5 item 6 (no in-app listening), §7 item 9
**Depends on:** TODO-104 (session composer with directions), TODO-100   **Blocks:** none

## Why
The deck is visual-only: every card is read. The TTS cache already holds audio for every seen word (auto-speak at L1536–1544 + prefetch), so "hear it → say the meaning" costs nothing in data and adds the modality the Input tab's listening level is supposed to reflect. Listening recall is a different trace from reading recall (the app already separates recognition from production for the same reason, L1413–1420).

## Current behaviour (verified)
- Study card front L1974–1991: production shows meaning, recognition shows term/reading/SpeakBtn; `isProd = prodSet.has(card.id)` (L1722).
- Auto-speak effect L1536–1544 speaks `c.reading || c.term` at 0.88 when `voiceOn`.
- `recordResult` L1392–1443 supports `dir === "prod"` and recognition; `prodDue` L2127–2131 schedules production on `rfsrs`.
- `smartPool`/`start` (TODO-104) carry a `prodIds` set.

## Intended behaviour
- Direction `"listen"`: front shows only a big 🔊 (auto-plays; tap replays), kind chip "👂 聞く"; back shows term + reading + meaning + emoji. Grade buttons unchanged. Grading writes to `lfsrs/lseen/lcorrect/lms/lmsN` via `recordResult(id, got, "listen", ms)`.
- Gate: only cards with recognition `S >= 3` d (`recallUnlocked`-style helper `listenUnlocked(c)`), and only when `voiceOn` and a session is not muted; due on its own clock: `listenDue(c, now) = listenUnlocked(c) && (!c.lfsrs || c.lfsrs.due <= now)`.
- Composition: ≤ 3 listening slots per 16-card smart session, interleaved like production (TODO-104 composer gets `listenIds`); never the same card in two directions in one session.
- If TTS fails (no cached clip and not signed in → browser voice or silence), the card still works: show "(audio unavailable — tap to reveal)" after 2 s.

## Implementation steps
1. `recordResult` (L1416–1438): generalise the direction switch: `const dirKey = dir === "prod" ? "r" : dir === "listen" ? "l" : "";` and read/write `c[dirKey + "fsrs"]`, `c[dirKey + "seen"]`, etc. Keep the recognition branch byte-identical for `dirKey === ""`. (This also makes a future `useSession` refactor simpler.) `firstProdTry` logic applies to `"listen"` too (first listening failure is learning, not a lapse).
2. Helpers next to `prodDue` (L2127): `const LISTEN_UNLOCK_STABILITY = 3; function listenUnlocked(c) { … st.S >= LISTEN_UNLOCK_STABILITY } function listenDue(c, now) { if (!listenUnlocked(c)) return false; if (!c.lfsrs || !(c.lfsrs.S > 0)) return true; return (c.lfsrs.due || 0) <= now; }`.
3. Composer (TODO-104 `composeSmartSession`): `listenSlots = Math.min(3, listenCandidates.length)` taken from `reviewSlots` (not from new/prod), interleaved with the same gap logic; return `listenIds`. `start()` sets `setListenSet(opts.listenIds || new Set())`.
4. Study: `const isListen = !!(card && listenSet.has(card.id));` front branch:
   ```jsx
   isListen ? (<><span className="tc-kindchip tc-prodchip">👂 聞く</span><button type="button" className="tc-speakbtn tc-speakbig" onClick={(e) => { e.stopPropagation(); ttsUnlock(); speakJa(card.reading || card.term, 0.88); }}>🔊</button><span className="tc-flipcue">listen, then tap</span></>) : …
   ```
   Back: same as recognition back but also show `card.term` and reading. Grade: `onResult(c.id, got, isListen ? "listen" : prodSet.has(c.id) ? "prod" : undefined, think, …)`.
5. Auto-speak effect (L1536–1544) speaks `c.reading || c.term` for **every** card, including production cards — verified: the effect has no `isProd` guard, so it hands the answer to a production card the moment it appears (contradicting the front-face comment at L1971–1973). For listening cards the auto-speak IS the prompt — keep it; add `if (prodSet.has(c.id)) return;` before `speakJa` so production cards stay silent. This is a real bug worth fixing in TODO-104 even if listening cards are never built.
6. CSS: `.tc-speakbig{font-size:44px;width:84px;height:84px;border-radius:50%}`.
7. Tests: `listenDue` pure; composer returns ≤ 3 listen ids, disjoint from prod ids (extend `tools/test-session.mjs`).

## Data migration / compatibility
New optional card fields `lfsrs/lseen/lcorrect/lms/lmsN` (whole-record merge via `mergeDeck` as for `r*`). No new keys.

## Testing & verification
- With voice on and ≥ 20 cards at S ≥ 3 d, a smart session contains up to 3 🔊-only cards; grading them changes `lseen`, not `seen`.
- Voice off → no listening cards composed.
- Build + deploy.

## Acceptance criteria
- [ ] Listening direction exists with its own FSRS state and due clock.
- [ ] ≤ 3 listening cards per smart session, interleaved, never duplicating a card's other direction.
- [ ] Production cards no longer auto-speak their answer.

## Pitfalls / notes
- `mergeDeck` winner is `seen`-dominant (01 §3.8); listening-only reviews on one device can lose to a recognition review elsewhere — same limitation as production; acceptable until TODO-008's field-wise merge.
- Rebuild `index.html` and deploy.
