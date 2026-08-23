# tangocho — Functionality / Correctness Review

**Date:** 2026-08-22
**Scope:** `JpnFlashcards.jsx` (app), `tools/fsrs.mjs` + tests, `cf/src/index.js` (Worker), `tools/build.mjs`, data/tools pipeline, legacy `netlify/`.
**Method:** Full read of every non-data code region of the JSX (≈2,900 lines of logic), the Worker, FSRS module and tests; `git log`/`git show` of all 45 commits; both test suites run; pure functions extracted and exercised with Node scripts (seed-migration simulation, snapshot sizing, FSRS trajectories, `conjugate()`, `kanaToRomaji()`, `parseFeed()`, `iso8601ToSeconds()`); a scratch build of `index.html` compared byte-for-byte with the committed one. No source files were modified.

---

## Executive summary

1. **Critical — the session-signing secret is committed to the public repo.** `netlify/functions/sync.mjs` (bundled legacy function, line 1) hard-codes `X="d89497a7…29f0"` as the HMAC key; commit `11dee08` states the Cloudflare Worker deliberately kept "the same value" so old sessions keep working. Anyone can mint a valid 2-year session for any Google `sub` and read/overwrite that user's sync blob and generate billable TTS. Rotate `SESSION_SECRET` now (it will sign everyone out once).
2. **High — sync pushes are blind overwrites, and only page-load pulls.** A tab left open (phone PWA) never re-pulls; every one of its debounced pushes replaces the whole cloud record. Per-card merge protects `jpn101:deck` and `jpn101:days`, but **kana, conjugation-drill, 10k-deck, retention and all other "secondary" keys use newest-snapshot-wins**, so two devices studying kana in the same week silently lose one side's progress (`mergeSnapshots` L1025).
3. **High — no recovery path from a 401.** When the session expires (730 days) or the secret is rotated, `pullAndMergeCloud` fails silently, `pushCloudNow` goes to `pending` forever, and the sign-in button is never re-rendered because `initGoogleAuth`/`renderGoogleButton` short-circuit on the presence of *any* stored token (L1074, L1088). `signOutGoogle()` (L1041) is defined but never called. The device is stuck on "⚠ Not saved yet" with no UI way out.
4. **High — the `pagehide` "flush with keepalive" cannot work.** The snapshot is ≈400 KB (deck 287 KB + the 107 KB video-index cache that is *also* synced), far above the browser's 64 KiB keepalive limit, so the fetch rejects immediately; the last 2.5 s of answers before closing the tab are dropped exactly as the commit `5cc3ede` claimed to fix.
5. **High — SEED re-merge corrupts cards whose term appears twice in `SEED`.** 17 terms are duplicated (e.g. 写真, うち, 前, 方, なるほど). The version-bump merge keys by `term` only (L1334), so on a deck that predates the Act 4–6 import the older card is overwritten with the later entry's meaning/lesson (うち "house" → "our company", 前 "before" → "front") and the second card is never created (simulation: 16 cards missing vs a fresh install).
6. **Medium — `dueness()` ignores the FSRS `due` it just computed.** It recomputes from `S` with a hard-coded 0.9 target (L2091), so the 85/90/95 % retention control changes nothing about *when* a card is offered, and a lapsed card is offered again in `S` days (3.6 d in the worked example) instead of the 10-minute relearning step `review()` returns.
7. **Medium — `Write` (EN→JP handwriting) records into the *recognition* state** (`onResult(card.id, got, undefined, …)` L3761) although production now has its own `rfsrs/rseen` track, inflating recognition stats and scheduling.
8. **Medium — Worker `iso8601ToSeconds` regex is `(d+)` not `(\d+)`** (cf/src/index.js L285); it matches nothing, so feed-episode durations are never resolved or cached (`ytDurations` always returns `{}`); verified with Node.
9. **Medium — the "removed" sync-code flow is still live on the network.** Any unsigned-in load generates a random code and POSTs the full snapshot to KV under `code:XXXXXXXX` on every debounced save (L1100, L1346), wasting KV writes and storing orphan data.
10. **Medium — all day-keyed logic uses UTC dates** (`toISOString().slice(0,10)` L1212, L1225, L1621, L5433): for a US-Mountain user the "day" rolls over at 6 pm, affecting streaks, "today" counts and the 10k daily quota.
11. Dead code that still runs: `callClaude` posts to api.anthropic.com with no key (L2180) so "✨ hook", session debrief and the (unrouted) `Sentences` tab always fail; `Add` component and `Sentences` component are unreachable; `genSyncCode/setSyncCode/signOutGoogle` partially dead.
12. **What works:** the build pipeline works and `index.html` is byte-identical to a fresh build; FSRS-4 formulas and weights match the published algorithm; `conjugate()` is correct on every case tried; both test suites pass (32 + 36) and assert real properties; TTS token/race handling is sound.

---

## 1. Storage, seeding, backup/restore

### 1.1 HIGH — Seed re-merge keys by `term` only; duplicated SEED terms corrupt existing cards
- **Where:** `JpnFlashcards.jsx` L1330–1341 (`loadCardsAndSync`, branch `ver < SEED_VERSION`), `cardMergeKey` L936.
- **What:** `SEED` contains 17 duplicated terms (verified by script: 復習, 写真, 読み, 書き, あとで, うち, 何か, 外, では, なるほど, 前, 〜で, 〜に, 質問, 〜つ, 〜人, 方). The migration builds `byTerm = new Map(list.map(c => [c.term, c]))` and then for *every* SEED row does `Object.assign(ex, {reading, romaji, meaning, kind, emoji, pitch, lesson})` — note `sec` is **not** assigned. For a deck that only has the first occurrence (any deck created before commit `226197d` added Act 4–6), the second SEED row overwrites the first card's meaning and lesson, and a second card is never pushed.
- **Verified (simulation on SEED filtered to lesson ≤ 30, then migrated):** deck ends with 805 cards vs 821 on a fresh install (16 missing); `うち` becomes `lesson=38 sec=undefined meaning="our company"`, `前` becomes `"front"` while keeping `sec=3-2`, `写真` moves from Act 1 to lesson 43 with `sec=undefined` (so it lands in "Class notes"), `方` has only the "person (honorific)" sense. Because the same deterministic migration runs on every device, devices agree — the corruption is permanent and invisible.
- **Why it matters:** the user's real deck almost certainly went through this path (his deck predates Act 4–6). Section chips for 5-x/6-x are missing those words; study history from the Act-1 card is now attached to a different meaning.
- **Fix:** key the migration by the same `cardMergeKey(term|lesson|sec)` used by sync; when an exact key is absent, add a new card rather than overwriting; include `sec` in the refresh; and de-duplicate `SEED` consciously (either give each dup a distinct `sec` or decide one card per term). Ship a one-off repair that re-adds missing `(term,lesson,sec)` rows.

### 1.2 MEDIUM — `JSON.parse` failure on the local deck silently reseeds and can push a blank deck
- **Where:** L1323–1329: `list = rawCards ? JSON.parse(rawCards) : null` in try/catch → `null` → `if (!list)` → fresh SEED (all `seen:0`) written and then `pushCloudNow()` (L1346).
- **Scenario:** corrupt/truncated localStorage while offline → reseed → later `online` handler pushes without pulling → cloud deck replaced by a zero-progress deck. Recoverable only if another device still holds progress (per-card merge keeps higher `seen`).
- **Fix:** treat an unparsable deck as "do not touch": keep the raw string under `jpn101:deck.corrupt`, surface a banner, and refuse to push until a successful pull.

### 1.3 LOW — Impure state updaters
- `recordResult` (L1382–1433), `addCards` (L1360), `removeCard` (L1370), `setMnemonic` (L1375) call `sSet()` *inside* `setCards(prev => …)`. React may invoke updaters lazily/twice (StrictMode, concurrent re-renders). Works today because StrictMode is not enabled; fragile. Move persistence to an effect on `cards` or call `sSet` after computing `next` outside the updater.

### 1.4 LOW — Module caches are not invalidated after a cloud pull
- `pullAndMergeCloud` writes straight to `localStorage` (L1178). `_days` (L1205, cached forever by `loadDays`), `retentionTarget` (L1194), Kana/Conj `statsRef`, `Freq` deck, `Input` `stRef`, `hooksRef` are all read once. After the post-sign-in chain (L1354–1356) writes merged data, the next `logDay` (L1220) overwrites `jpn101:days` with the stale in-memory copy, discarding days merged from the cloud until reload. Mitigated by `mergeDays` on other devices, but the local streak display is wrong until reload. Fix: have `pullAndMergeCloud` return the merged keys and reset caches (`_days = null`, re-read retention) or dispatch a `storage`-like event components subscribe to.

### 1.5 INFO — Backup/restore semantics interact oddly with sync
- "Clear all" (L1372) writes `[]` → pushed → other device's `mergeDeck` sees `!cloud.length` and keeps its deck → next push resurrects it everywhere. Restoring an old backup is partially undone on the next pull (per-card max `seen` wins). Deleted cards resurrect from any device that still has them (no tombstones). These are design limits worth documenting in the UI ("Clear all only clears this device").

---

## 2. FSRS implementation and scheduling

### 2.1 Algorithm fidelity (`tools/fsrs.mjs`) — correct for FSRS-4
Checked against open-spaced-repetition FSRS v4 (17 weights):
- Weights L26–29 are the FSRS-4.0 defaults `[0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]` ✓ (FSRS-4.5 changed both the weights and the curve to `(1+19/81·t/S)^-0.5`; the file consistently uses the v4 curve `(1+t/9S)^-1`, L43–46, and interval `9S(1/r−1)`, L49–51 ✓).
- `initialDifficulty = w4 − (G−3)·w5` ✓ (L55), mean-reversion `w7·D0(3) + (1−w7)·D'` ✓ (L61–64), recall growth `S·(1 + e^{w8}(11−D)S^{−w9}(e^{w10(1−R)}−1)·hard·easy)` ✓ (L67–78), lapse `w11·D^{−w12}((S+1)^{w13}−1)e^{w14(1−R)}` ✓ (L81–85).
- Minor deviations: (a) FSRS clamps post-lapse stability to `min(S_lapse, S)`; here not clamped (harmless at realistic S). (b) `MAX_INTERVAL=3650`, `RELEARN_DAYS=10/1440` are app choices, fine. (c) Same-day reviews: with elapsed=0 ⇒ R=1 ⇒ recall growth 0 — a good property — but **a same-day lapse is still applied in full** (see 2.3).
- **Tests:** `node tools/test-fsrs.mjs` → 32/32 pass; they assert monotonicity, clamping, expanding intervals (2.4→8→24→64.8→160.6→370 d), lapse shortening, seeding. They do not test `review()`'s `due`/`relearning` contract being *consumed* by the app, which is where the real gap is (2.2).

### 2.2 MEDIUM — `dueness()` ignores `due`, `relearning`, and the retention target
- **Where:** L2086–2097. `dueness = elapsed / intervalFor(st.S, 0.9)`; never reads `st.due`, never uses `retentionTarget` (L1194). `smartPool` (L1572–1577), `dueCount` (L1610), Freq `start` (L5463) all use it.
- **Verified numbers:** card S=20,D=5 lapsed → `review()` says due in 0.007 d (10 min) but `dueness` says due at 3.60 d. New card graded GOOD at target 0.95 → `review().ivl = 1.14 d`, app offers it at 2.40 d. New HARD card → `review()` clamps to 1 d, app offers at 0.6 d.
- **Why it matters:** the "Aim to remember" control (L1842–1858) changes `S/D` evolution slightly but not *when* cards are served; the documented "lapsed card goes to a 10-minute relearning step" only holds inside a session via requeue — a card missed on its last allowed requeue waits days. `forecast.week` (L1636) uses `st.due` while `fading` uses 0.9 — two different clocks on the same screen.
- **Fix:** `dueness = (now − st.last) / (st.due − st.last)` (or `now >= st.due ? 1 + overdueFraction : …`), and recompute seeded `due` with `retentionTarget`; treat `relearning` cards as due immediately in the next session.

### 2.3 LOW — In-session requeues are full FSRS reviews
- **Where:** `Study.grade` L1757–1764 requeues a missed card up to 3× and each pass calls `onResult` → `fsrsReview`. Same for Kana (L2735) and Conj (L5091), Freq (L5498).
- **Verified:** S=20 → 3.60 → 1.33 → 0.65 after three in-session misses, D 5 → 10 (clamped); the following fast correct answer (R=1) leaves S at 0.65. Anki/FSRS do not apply the lapse formula to relearning-step failures. Net effect: harsh but arguably desirable; worth knowing that `D` saturates at 10 quickly for any card missed thrice in a session, which then depresses future stability growth (`11−D` factor).
- **Fix:** only feed the *first* grade of a card per session into FSRS (keep requeue grades for session bookkeeping), or treat same-day AGAIN as "no state change, keep relearning".

### 2.4 MEDIUM — `Write` feeds the recognition track
- **Where:** L3760–3763 `onResult(card.id, got, undefined, thinkRef…)`; `recordResult` L1395 treats `dir===undefined` as recognition (`seen/correct/level/fsrs`).
- **Why it matters:** commit `4dcefd8` introduced separate `rfsrs/rseen` for production; the Write tab is pure production (meaning → write the Japanese) but bumps recognition stability and `level`, making recognition look stronger and pushing `recallUnlocked`. Also `gradeFromLatency` thresholds (3 s/6 s) are tuned for flip cards; hand-writing routinely exceeds 6 s so Write is graded HARD almost always.
- **Fix:** pass `"prod"` from Write; consider a per-direction latency threshold (e.g. ×2 for writing).

### 2.5 LOW — Session-mix details
- `smartPool` (L1570–1607): `chosenProd` filtered *after* `reviewSlots` was reduced by `prodSlots`, so filtered-out cards shrink the session below 16. `start()` then recomputes `prodSet = owed.slice(0,6)` over the whole ordered queue (L1720) — cards smartPool deliberately placed as production may not be in the first six `prodDue` cards, and for non-preordered sessions adjacent production cards are possible. `start` deps include unused `coverage` (L1728). `grade` (L1744) reads `prodSet` but does not list it in deps — safe only because `setQueue` and `setProdSet` are batched together.
- Freq `stats.nextIn` (L5443) uses the old `REVIEW_INTERVALS` ladder while `due` uses FSRS → "next reviews in ~Xh" can disagree with the due count.

---

## 3. Sync (pull → merge → seed → push)

### 3.1 CRITICAL — HMAC session secret committed in the repo
- **Where:** `netlify/functions/sync.mjs` L1 (`X="d89497a76bf1f28ee83d78cd469d40ebc3cd2b4b0fa330d3e281c5bfda7329f0"`, used as `createHmac("sha256", X)`); `git log -S` shows it entered in `230b7fc` and `226197d`. `cf/wrangler.toml` L27 and commit `11dee08` ("SESSION_SECRET stays the same value") indicate the live Worker uses this value.
- **Impact:** `verifySession` (cf/src/index.js L56–70) only checks the HMAC and `exp`; with the secret anyone can forge `{sub, email, exp}` for any Google subject and read/overwrite `g:<sub>` (`handleSync` L126–140) or force TTS generation (L172–175). The repo also still ships the legacy function even though Netlify now 301s everything.
- **Fix:** rotate the Worker secret immediately (accept the one-time sign-out), delete `netlify/functions/*` (Netlify is redirect-only now), and add a note that rotating secrets requires the 401-recovery fix in 3.3 or every device becomes permanently stuck.

### 3.2 HIGH — Push is a blind overwrite; nothing re-pulls after load
- **Where:** Worker `handleSync` POST = `env.SYNC.put(storageKey, body)` (L136–140); client `pushCloudNow` (L1125–1151) sends `collectLocalSnapshot()` with no version/etag; the only pulls are `loadCardsAndSync` (L1319) and the post-sign-in rerun (L1354). The `online`/`visibilitychange`/`pagehide` handlers (L1158–1166) and the 5× backoff retries push without pulling.
- **Merge rules:** `mergeDeck` per card by `term|lesson|sec`, winner = higher `(seen·1e6 + last)` (L945–950); `mergeDays` per day max `rev` (L958–962); `mergeScripts` union; `mergeInput` bespoke; **everything else** (`jpn101:kana`, `jpn101:conj`, `jpn101:freq`, `jpn101:retention`, `jpn101:freqQuota`, `jpn101:hooks`, `jpn101:session`, `jpn101:userEmail`, `jpn101:videoIndex`, `jpn101:freqSnapshot`, `jpn101:syncPending`, `jpn101:lastBackup`…) = "cloud wins if `cloudUpdatedAt > localLastPulled`" (L1025).
- **Concrete loss scenario (kana):** Phone tab open since Monday (lastPulled=Mon). Laptop pulls Tue, drills kana, pushes (cloud.kana = laptop's). Phone drills kana Wed, pushes — its snapshot still has Monday's kana (it never re-pulled) → cloud.kana = phone's; laptop's Tuesday kana is gone from the cloud. Laptop reloads Thu: cloud updated after its lastPulled → its local kana replaced by phone's → laptop's Tuesday kana progress is gone everywhere. Same for Drill, 10k deck (per-card stats!), retention setting.
- **Secondary effects:** (a) `jpn101:session` syncs, so signing in on device B pulls device A's bearer token over B's own (harmless today, surprising); (b) a stale `jpn101:syncPending` is uploaded inside a *successful* push (flag cleared only after collecting the snapshot, L1131/1137) so other devices briefly show "⚠ Not saved yet"; (c) `jpn101:videoIndex` (107 KB) and `jpn101:freqSnapshot` (full 10k deck copy) ride along in every push.
- **Fix:** (1) make every push `pull → merge → push` (and/or add `If-Match`/version on the Worker: store `{updatedAt, snapshot}`, reject POST whose `baseUpdatedAt` ≠ stored, client re-pulls and retries); (2) per-record merges for kana/conj/freq (they are `{id: stat}` maps / arrays with `seen,last` — reuse the `mergeDeck` rule); (3) extend `SYNC_SKIP_KEYS` with `session`, `userEmail`, `syncPending`, `videoIndex`, `freqSnapshot`, `lastBackup`, `hooks`(optional); (4) clear the pending flag *before* collecting the snapshot or strip it from the snapshot.

### 3.3 HIGH — No recovery from 401 / expired session; `signOutGoogle` unreachable
- **Where:** `pullAndMergeCloud` L1171 returns false silently on `!res.ok`; `pushCloudNow` throws on `!res.ok` → `markSyncPending` + 5 retries → stays `pending` (L1139–1150); `initGoogleAuth` returns early `if (loadSession())` (L1074) and `renderGoogleButton` likewise (L1088); Browse shows the signed-in branch whenever `googleEmail` is truthy (L3963). `signOutGoogle` (L1041) has zero call sites.
- **Scenario:** after 730 days (`SESSION_DAYS`, Worker L19) or after the secret rotation recommended above, every device shows "⚠ Not saved yet — will upload automatically" forever, keeps retrying on every visibility change, and offers no sign-in button. Only clearing site data fixes it.
- **Fix:** on HTTP 401 from `/api/sync` call `signOutGoogle()`, reset `_googleEmail`, notify watchers, and re-render the Google button with a "Session expired — sign in again" message; keep local data and pending flag so the post-sign-in chain pushes it. Add an explicit "Sign out" button.

### 3.4 HIGH — `pagehide` keepalive flush exceeds the 64 KiB limit
- **Where:** L1164–1166 → `pushCloudNow({keepalive:true})` with body `JSON.stringify({updatedAt, snapshot})`.
- **Verified size:** deck JSON ≈ 287 KB (821 cards with FSRS fields) + `jpn101:videoIndex` 107 KB + freq deck + `freqSnapshot` ⇒ well over 64 KiB. Browsers reject keepalive bodies > 64 KiB with a `TypeError` before sending, so the flush silently fails and only `markSyncPending` runs (good: the retry on next visit still happens, but the "answer a card and close within 2.5 s" case from commit `5cc3ede` is still lost if the user does not return).
- **Fix:** on `pagehide` do not send the whole snapshot; send only keys dirtied since last push (track a dirty set in `sSet`) or `navigator.sendBeacon` a small delta, and shrink the payload (3.2 fix 3). Alternatively push immediately (no debounce) after each grade while the card count is small.

### 3.5 MEDIUM — The "removed" sync-code path is still live
- **Where:** `syncRequestOptions` L1098–1100 falls back to `?code=<getSyncCode()>`; `getSyncCode` mints a random 8-char code (L916–921); Worker accepts `code:` keys (L128–131). Commit `2afa8d5` removed only the UI.
- **Effect:** every not-signed-in visitor (including anyone who opens the public URL) pulls and then POSTs their whole seeded snapshot into KV under a random key on load and after every debounced save — KV writes (free-tier 1k/day) and storage for data nobody can ever retrieve; anyone who guesses a code can read/write it. Also `setSyncState("saved")` is reached for these writes.
- **Fix:** when `!loadSession()` skip network entirely (`pushCloudNow` → return false without marking pending; `pullAndMergeCloud` → no-op); delete `genSyncCode/getSyncCode/setSyncCode/SYNC_KEY`; remove the `code:` branch from the Worker.

### 3.6 MEDIUM — Clock-dependent "newer snapshot" rule
- `mergeSnapshots` compares the *other* device's `Date.now()` (`updatedAt` is client-supplied, L1131) to this device's `localLastPulled` (L1179). Skewed clocks flip the outcome for every secondary key. Fix: have the Worker stamp `updatedAt` server-side and return it on GET.

### 3.7 LOW — Listener growth / minor races
- `Browse` effect (L3919–3923) pushes a new callback into `_googleTokenListeners` on every `googleEmail` change; never removed.
- If a debounced push (L1155) fires in the ~300 ms window while the post-sign-in `pullAndMergeCloud` is in flight, it pushes the pre-merge local snapshot with the new session and the pull then reads back local-only data (other devices' secondary keys lost per 3.2). Narrow; fixed by 3.2 (1).
- `gisReady` polls every 150 ms forever if the GSI script never loads (offline / blocked) (L1047–1052). Add a give-up.

### 3.8 INFO — `mergeDeck` tie-breaking
Winner is `seen`-dominant, `last` second. A card reviewed in *production* on device B (`rseen`, `last` newer, `seen` equal) loses to device A's recognition review (`seen+1`); mnemonic edits (`mn`, no `seen/last` change) can be lost the same way. Acceptable but worth documenting; a field-wise merge (max of each counter, newest `fsrs`/`rfsrs` by `last`) would be strictly better.

---

## 4. TTS (client + Worker)

### What is right
- Token/race handling (`_ttsToken`, `fallbackFired`, `stillCurrent()`, L3393–3441) correctly prevents double-play and stale fallbacks; `stopJa` invalidates in-flight chains; object URLs are revoked on replacement (L3427).
- Cache semantics: unauthenticated GET hits KV (`handleTts` L166–168) with immutable caching; miss requires a session (L172–175); `prefetchJa` never triggers generation (L3388–3389). Key = `sha256(voice|rate|text)` with `rate` normalised by `parseFloat` so `0.9`/`0.90` collapse (L161–166). Study and SpeakBtn both use 0.88 (L1538, L3447) — the earlier mismatch is fixed.

### 4.1 LOW — Autoplay rejection is treated like a cache miss
- `escalate` (L3399–3403) runs on *any* `play()` rejection, including `NotAllowedError` on iOS/Chrome before a gesture. That triggers an authenticated fetch (L3417–3436) and a second `play()` that will also be rejected, then falls back to `speechSynthesis`. Not harmful, but wasteful, and it means the auto-voice path on iOS may always end in the robotic fallback. Fix: inspect `err.name`; only escalate on a media error/HTTP failure; on `NotAllowedError` do nothing (or queue until next gesture). (Not device-verified.)

### 4.2 LOW — Scripts use rate 0.9 while words use 0.88
`Scripts` effect L3482 / L3590 vs `SpeakBtn` L3447 — different KV entries for the same text if a vocab term is also a whole script line. Pick one constant.

### 4.3 INFO — Worker details
- `text` truncated at 500 chars before keying (L156) — consistent between hit/miss. `env.TTS.put(key, bytes)` with a `Uint8Array` is fine. A failed Google call returns 502 with up to 300 chars of Google's error body — OK for a private app.

---

## 5. Input (入力) tab engine

### What is right
- `applyRating` (L4345–4368), `seedLevelsFromDeck`, `seededShuffle`, `coverageAgainstDeck` (L4444–4508) and `recommend` (L4387–4442) are covered by 36 passing tests that assert direction, damping, convergence, clamping, longest-match, inflection handling, and feed-first slotting — genuinely meaningful assertions. Writes go through `stRef` (L4575–4580) so rapid taps do not lose updates; `pending` ratings survive reload and are merged across devices (`mergeInput`, L980–1007).
- `loadVideoIndex` (L4197–4215) caches to localStorage, falls back offline, and checks `content-type` so the SPA fallback HTML cannot poison the cache. `unpackVideos` field order (L4218) matches `yt-pack.mjs` rows (L73–76). All 955 rows carry a duration.
- Edge cases: empty deck → level 5/8; all hidden → `picks=[]` and a message (L4823); `rate` with unknown item falls back to user level (L4677).

### 5.1 MEDIUM — Worker `iso8601ToSeconds` never matches
- **Where:** cf/src/index.js L284–288: `/^P(?:(d+)D)?T(?:(d+)H)?(?:(d+)M)?(?:(d+)S)?$/` — `d+` is a literal "d". Verified: `PT5M30S → 0`, `PT1H2M3S → 0`. `ytDurations` (L289–316) therefore never stores `dur:<id>` and feed items never get `sec`, so the time-budget filter for feed sources (L4631–4636) and the "· N min" label (L4853) are inert for non-indexed sources. (`tools/yt-index.mjs` L88–91 has the correct `\d+`, which is why the index has durations.)
- **Fix:** copy the `iso` helper from `yt-index.mjs` (note it also makes `T` optional for `P1D`).

### 5.2 LOW — Recommender quirks
- `recent` exclusion is by `itemId` (L4389): opening one episode of a *feed* source hides the whole channel for 14 days, while indexed videos are per-video. Channel-level ratings (feed sources) and per-video ratings (`yt:` ids) never inform each other even for the same channel — rating three "too hard" videos from NIJ does not move the other ~70 NIJ rows.
- `seed`-driven reroll effect (L4656–4659) relies on `suggest` from the latest render — fine, but `firstRun` guard means the first click goes through the button path only.

### 5.3 INFO — `mergeInput` details
`pending` dedupe uses a `"p"+itemId+at` key in the same `seen` set as history (`itemId|at`) — distinct namespaces, OK. `tagScores` is taken wholesale from the newer side (not merged).

---

## 6. Kana / Scripts / Write / ConjDrill / Freq

### 6.1 `conjugate()` — correct (verified)
L4961–4988 exercised on 帰る, 行く, 泳ぐ, 死ぬ, 会う, 話す, 待つ, 走る, 食べる, いい, 高い, きれい, する, くる, ある: all eight cells correct, including 音便 (いった/およいだ/しんだ), いい→よく〜, ある→ない. Only limitation: `type:"irregular"` for a dict other than する/くる/ある silently falls through to the godan branch (returns a conjugation of whatever the last kana is) — add an explicit `return null`.

### 6.2 Kana romaji mapping — only matters for dead code
`kanaToRomaji` (L2234–2246) mishandles extended katakana (ファ→"fua", ヴィ→"i", ティ→"tei"), and `canonR` (L2247–2253) collapses doubled letters (きって→"kite") and `ou/oo` — but both are only used by `fillMatch` in the unrouted `Sentences` component, and the Kana tab itself is self-graded drawing, so there is no live impact. If Sentences is ever re-enabled, add the ext sounds to `YOON_MAP` and keep sokuon doubling in `canonR`.

### 6.3 MEDIUM — UTC day boundary
`logDay` (L1212), `streakFrom` (L1225), `todayKey` (L1621), Freq `today` (L5433), Input `byDay` (L4750) all use `toISOString().slice(0,10)`. For a UTC−6 user a 7 pm review is logged under *tomorrow*: the streak can read one short after an evening-only day, "today" counts show the previous evening's reviews, and the 10k "new today" quota resets at 6 pm local. Fix: a `localDayKey()` helper using `getFullYear/getMonth/getDate` everywhere (and migrate existing keys or accept one off-by-one day).

### 6.4 LOW — Timing inputs
- Kana passes the raw `think` ms into `statReview` (L2742) without the 250 ms–180 s sanity clamp that `recordResult` (L1381) and Freq (L5479) apply; a walked-away kana lands as HARD (minimum for a correct answer), so impact is small.
- `Freq.grade` requeues a shallow copy `{...c, seen: 1}` (L5498); grading later maps over `deck` by id so stats are right, but `wasNew` logic relies on the copy — OK, just subtle.

### 6.5 LOW — Canvas handlers
`Kana`/`Write` touch-block effects depend on `[view]`/`[]` and attach to `canvasRef.current` at effect time (L2689–2695, L3736–3742): if the canvas is ever re-mounted without `view` changing (Write: it never is) the listeners would be lost. `setup()` on every `pos` change clears the pad — intended.

---

## 7. Worker (`cf/src/index.js`)

- Routing L360–368 is correct; `handleSync` method handling and 405s are right; JSON bodies are parsed defensively (L136–138); KV `get(..., {type:"json"})` returns `null` for missing keys → `{data:null}` handled by the client (L1173).
- **MEDIUM (3.1/3.2 above):** no body-size cap, no shape validation (`snapshot` object), no version/etag on POST, `code:` path still accepted.
- **MEDIUM (5.1):** `iso8601ToSeconds` regex bug.
- `handleFeed` (L318–358): `parseFeed` verified on sample Atom and RSS (titles unescaped, `yt:videoId` → URL, `itunes:duration` → seconds, items without a link skipped). Cache key includes `FEED_SCHEMA` and `limit`; `n` is clamped 1–30; `src` ids are whitelisted (no open proxy) ✓. The post-duration write-back (L352–355) never runs because `got` is always 0 (5.1).
- `verifyGoogleIdToken` (L73–98) checks alg/aud/iss/exp and verifies RS256 against JWKS ✓ (JWKS fetched per exchange; fine at this volume).
- LOW: `handleTts` reads `env.SESSION_SECRET` without the `503` guard used by `handleSync` — `verifySession(undefined, …)` would throw on `importKey` and surface as a 500 for a mis-deployed worker; add the same guard.
- `ytDurations` writes `dur:disabled` on 403 for an hour — reasonable; it uses the TTS API key for YouTube Data API, which requires that API enabled on the same project (commit `110a16f` says it is).

---

## 8. Build pipeline, dead code, repo hygiene

### Build — works, index.html is current
- `npm install` in a scratch copy of `tools/` (esbuild 0.25.12, React 18.3.1) and `node build.mjs` succeeded: "feeds 17 sources, app and Worker agree … bundle 535.7kb → index.html 536.2kb (+ cf/public, 955 videos)". The produced `index.html` is **byte-identical** to the committed one (549,163 bytes), so the deployed artifact matches `JpnFlashcards.jsx` at HEAD (both last changed in `4dcefd8`). Sanity checks (createRoot, `#root`, script boundary, feed-list agreement) are sound; the build aborts rather than writing a broken file ✓.
- `cf/public/` is gitignored and absent in a fresh clone — the Worker deploy depends on running the build first; worth a line in `wrangler.toml`/README.

### Dead or half-dead code (LOW/INFO, but some of it runs)
- `callClaude` (L2180–2202) POSTs to `https://api.anthropic.com/v1/messages` with no API key, no `anthropic-version`, no browser-access header — it can never succeed on the deployed site. It is still *invoked* by "✨ hook" (L1510–1525), the auto-debrief effect after every session with misses (L1734–1742, a wasted request per session, shows "Coach is looking…" then nothing), and `Scripts.annotateRaw` (L3518–3535, always falls back to `localBuild`). Either remove these paths or proxy through a Worker endpoint with a server-side key.
- `Sentences` (L2354–2495) and `Add` (L4067–4113) components have no route (`tab` list L1460); `goAdd` goes to Browse. `KANA_MAP/YOON_MAP/kanaToRomaji/canonR/fillMatch/localFill/localTrans/NOUN_SET/parseJSON` are only used by those. ≈350 lines of unreachable UI in the bundle.
- `genSyncCode/getSyncCode/setSyncCode/SYNC_KEY` (L905–925): `setSyncCode` unused; the rest live only through the fallback in 3.5. `signOutGoogle` unused (3.3). `REVIEW_INTERVALS` (L2059) still used by the pre-FSRS fallback and Freq `nextIn`. `weakness()` (L2042) unused. `SECTION_MAP` fine.
- `netlify/functions/*.mjs` are orphaned (Netlify 301s everything) and carry the secret (3.1) — delete them.
- Header shows a hand-maintained build tag `b59` (L1452); nothing bumps it.

---

## What works well

- **Commit discipline and intent capture** are excellent; each merge/sync/scheduling decision is explained in code comments and commit bodies, which made this review tractable and makes future bugs legible.
- **FSRS port** is a faithful FSRS-4 implementation with sensible app-level guards (relearning step, 10-year cap, seeding from legacy counters) and a real test suite that would catch regressions in the formulas.
- **Conjugation engine** is correct across all tested classes and exceptions, and the drill tracks each (word × form) cell separately.
- **Input engine** is well-factored, pure, and tested; the video index pipeline (`yt-index/yt-pack`) is compact and the on-client cache/fallback logic is robust.
- **Sync failure surfacing** (pending flag, backoff, visible state in Browse) is a big improvement over the earlier silent-loss behaviour, and the per-card/per-day/per-input merges are the right shape — they just need to be extended to the remaining keys and paired with pull-before-push.
- **TTS** token handling is careful and the KV-cache-first, auth-on-miss design keeps costs bounded.
- **Build script** is defensive (hard-aborts on missing mount call / feed drift) and the committed artifact is in sync with source.

---

## Findings summary

| # | Severity | Area | Finding | Location |
|---|----------|------|---------|----------|
| 3.1 | **Critical** | Sync/auth | HMAC session secret committed (legacy Netlify bundle); Worker uses the same value | `netlify/functions/sync.mjs:1`, `cf/wrangler.toml:27` |
| 3.2 | **High** | Sync | Blind-overwrite push, no re-pull after load; kana/conj/freq/etc. use newest-snapshot-wins → cross-device loss | `JpnFlashcards.jsx:1008-1027, 1125-1167`, `cf/src/index.js:136-140` |
| 3.3 | **High** | Sync/auth | No 401/expiry recovery; sign-in button never re-rendered; `signOutGoogle` unused | `:1041, 1074, 1088, 1139-1150, 1171` |
| 3.4 | **High** | Sync | `pagehide` keepalive flush exceeds 64 KiB → never sends | `:1164-1166` |
| 1.1 | **High** | Deck data | SEED re-merge keyed by `term`; 17 duplicate terms corrupt/miss cards | `:1330-1341`, SEED dups |
| 2.2 | Medium | Scheduling | `dueness()` ignores `due`/relearning/retention target | `:2086-2097, 1636` |
| 2.4 | Medium | Scheduling | `Write` records into recognition track | `:3761, 1395` |
| 5.1 | Medium | Worker/Input | `iso8601ToSeconds` regex `(d+)` never matches → feed durations never resolved | `cf/src/index.js:285` |
| 3.5 | Medium | Sync | Sync-code fallback still live: anonymous loads write snapshots to KV | `:1098-1100, 1346`, Worker `:128-131` |
| 6.3 | Medium | Stats | UTC day keys → streak/"today"/10k quota roll at 6 pm local | `:1212, 1225, 1621, 5433, 4750` |
| 1.2 | Medium | Deck data | Unparsable local deck silently reseeds and can be pushed | `:1323-1329, 1346` |
| 3.6 | Medium | Sync | Client-supplied `updatedAt` vs local clock decides secondary-key merge | `:1131, 1025, 1179` |
| 8.x | Medium | Dead code | `callClaude` can never succeed but is invoked per session (debrief) and by hook/annotate | `:2180-2202, 1734-1742` |
| 2.3 | Low | Scheduling | In-session requeue misses applied as full FSRS lapses (D saturates at 10 after 3 misses) | `:1757-1764`, `fsrs.mjs:94-120` |
| 2.5 | Low | Scheduling | Session-mix slot accounting / prodSet selection inconsistencies; Freq `nextIn` uses old ladder | `:1585-1607, 1720, 5443` |
| 1.3 | Low | React | Side effects inside `setCards` updaters | `:1360-1433` |
| 1.4 | Low | Storage | Module caches (`_days`, retention, component refs) not refreshed after pull | `:1178, 1205, 1220` |
| 3.7 | Low | Sync/React | Listener growth, narrow push-during-pull window, infinite GSI poll | `:3919-3923, 1047-1052` |
| 4.1 | Low | TTS | Autoplay `NotAllowedError` treated as cache miss (extra authed fetch, fallback voice) | `:3399-3403` |
| 4.2 | Low | TTS | Scripts rate 0.9 vs words 0.88 | `:3482, 3447` |
| 6.4 | Low | Stats | Kana think-time not sanity-clamped | `:2742` |
| 6.1 | Low | Conj | `irregular` with unknown dict falls into godan branch | `:4975-4979` |
| 7.x | Low | Worker | `handleTts` lacks the `SESSION_SECRET` 503 guard; no body-size cap on sync POST | `cf/src/index.js:173, 136-140` |
| 6.2 | Info | Kana | `kanaToRomaji`/`canonR` wrong on extended sounds/sokuon (dead path) | `:2234-2253` |
| 1.5 | Info | Backup | Clear-all / restore / delete semantics are undone by sync (no tombstones) | `:1372-1373, 945-950` |
| 3.8 | Info | Sync | `mergeDeck` winner is `seen`-dominant; production-only or mnemonic edits can lose | `:945-950` |
| 5.2 | Info | Input | Feed-source vs per-video ratings never inform each other | `:4389, 4674-4703` |
| 8.x | Info | Build | `cf/public` must be generated before `wrangler deploy`; `b59` tag is manual | `tools/build.mjs:93-97`, `:1452` |

---

## Appendix A — Verification log (commands run and observed output)

All scripts were run from the repo root with Node; pure functions were extracted from the JSX/Worker by string-slicing so no React code executed. No source files were changed (`git status` shows only `docs/`).

**Tests**
```
node tools/test-fsrs.mjs          → all 32 FSRS tests passed
                                    intervals (days): 2.4 -> 8 -> 24 -> 64.8 -> 160.6 -> 370
node tools/test-input-engine.mjs  → all 36 tests passed
```

**Build (in a scratch copy of the repo)**
```
cd <scratch>/tools && npm install && node build.mjs
    feeds 17 sources, app and Worker agree
ok  bundle 535.7kb  ->  index.html 536.2kb  (+ cf/public, 955 videos)
cmp <scratch>/index.html <repo>/index.html   → IDENTICAL (549,163 bytes)
```

**SEED duplicates and migration simulation** (deck = SEED rows with lesson ≤ 30, studied, then the `ver < SEED_VERSION` merge from L1330–1341)
```
SEED count 821, duplicate terms: 17
deck before 492, after migration 805, fresh install would have 821 → 16 cards missing
写真 lesson=43 sec=undefined meaning="photo"            (was Act 1 "photograph; photo")
うち lesson=38 sec=undefined meaning="our company"      (was "house; home")
前   lesson=43 sec=3-2       meaning="front"            (was "before (time)")
方   lesson=43 sec=6-3       meaning="person (honorific)" (the "way, alternative" card never created)
```

**Snapshot size vs keepalive**
```
deck JSON bytes: 286,819 ; data/videos.json (cached as jpn101:videoIndex): 107,453
snapshot > 394,272 bytes ; keepalive body limit 65,536
```

**Worker `iso8601ToSeconds`** (exact regex copied from cf/src/index.js:285)
```
PT5M30S -> 0   PT1H2M3S -> 0   P1DT2H -> 0
```

**FSRS consumption mismatch** (tools/fsrs.mjs `review()` vs app `dueness()` L2086–2097)
```
S=20,D=5 lapse:   review().due = 0.007 d ; app dueness says due at 3.60 d
same-session lapses: S 20 -> 3.60 -> 1.33 -> 0.65 ; D 5 -> 6.70 -> 8.39 -> 10.00
new GOOD @ retention .95: review().ivl = 1.14 d ; app (0.9 hard-coded) offers at 2.40 d
new HARD: S=0.6, review() clamps ivl to 1.00 d ; app offers at 0.60 d
```

**`conjugate()`** — all correct:
```
かえる ⑤ かえります/かえりません/かえりました/かえりませんでした | かえる/かえらない/かえった/かえらなかった
いく   ⑤ … | いく/いかない/いった/いかなかった        およぐ → およいだ   しぬ → しんだ   あう → あわない/あった
いい   い-adj いいです/よくないです/よかったです/よくなかったです | いい/よくない/よかった/よくなかった
くる   irregular きます/きません/きました/きませんでした | くる/こない/きた/こなかった     ある → ない/あった/なかった
```

**`kanaToRomaji` / `canonR`** (dead path, for the record): きって→"kitte"→canon "kite"; ファ→"fua"; ヴィ→"i"; ティ→"tei"; コーヒー→"koohii"→"kohi".

**`parseFeed`** (Worker) on synthetic Atom and RSS: titles unescaped, `yt:videoId` → watch URL + `vid`, RSS `itunes:duration` 12:34 → 754 s, item with empty `<link/>` skipped.

**Secret provenance**
```
grep -o 'X="[0-9a-f]{64}"' netlify/functions/sync.mjs → X="d89497a7…29f0"
git log --all -S'<that value>' → 226197d, 230b7fc
cf/wrangler.toml:27 "SESSION_SECRET (must match the existing one or every device is signed out)"
```

## Appendix B — Suggested fix order

1. Rotate `SESSION_SECRET`; delete `netlify/functions/`; ship 3.3 (401 → sign-out → re-render button) in the same deploy so devices can recover.
2. Sync hardening (3.2/3.4/3.5): pull-before-push (+ server version check), per-record merges for `kana/conj/freq`, extend `SYNC_SKIP_KEYS`, drop the code fallback, delta/`sendBeacon` on `pagehide`.
3. Deck repair + key migration by `term|lesson|sec` (1.1), guard against unparsable deck (1.2).
4. Scheduling coherence: `dueness` from `st.due` with `retentionTarget` (2.2), Write → `"prod"` (2.4), first-grade-only into FSRS per session (2.3).
5. Worker regex (5.1), local-day keys (6.3), remove/replace `callClaude` paths and unrouted components (8).
