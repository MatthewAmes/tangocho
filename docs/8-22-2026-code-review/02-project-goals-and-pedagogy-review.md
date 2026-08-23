# tangocho (単語帳) — Project Goals & Pedagogy Review

**Date:** 2026-08-22
**Scope:** Does the codebase achieve what it set out to do — product fit, learning-science soundness, and in particular the "feed study material tailored to the learner's knowledge level" goal?
**Method:** Full read of `JpnFlashcards.jsx` (6,084 lines), `tools/fsrs.mjs`, `tools/yt-*.mjs`, `tools/test-*.mjs`, `cf/src/index.js`, `data/videos.json`, the complete `git log` (45 commits, all bodies), plus three simulation scripts run against the real engine code and the real video index (see Appendix A). No source was modified. All line numbers refer to `JpnFlashcards.jsx` unless a different file is named.

---

## 1. Executive summary

1. **The project's goals are unusually well articulated** — in commit bodies, in long code comments, and in UI copy. The author (Matthew, JPN 101 at BYU using *NihonGO NOW!*, pair-programming with Claude) consistently states *why* a feature exists and what evidence motivated it (e.g. the "36% days" diagnosis in `2acc723`, the latency→accuracy split in `7322eee`). This is the strongest part of the project and makes the review tractable.
2. **Spaced repetition is built on a real memory model (FSRS-4) but the way it is wired undermines it.** (a) The retention knob (85/90/95%) is cosmetic: `dueness()` hard-codes a 0.9 target and ignores the `due` FSRS computes (L2086-2097 vs `tools/fsrs.mjs` L112-115). (b) Mapping every answer under 3 s to *Easy* means three quick correct answers push a card out ~10 months (5.8 d → 46 d → 315 d, simulated). FSRS default weights assume *Easy* is rare; here it is the majority grade. (c) The Write tab's production attempts are recorded against the **recognition** memory state (L3766 passes `dir = undefined`; L1416-1420), contradicting the explicit "separate fsrs/rfsrs" design of `4dcefd8`.
3. **"Tailored input" is half-realized.** The level engine and the 955-video index are thoughtfully built and honest about estimation limits, but: the level is seeded once from the deck and never re-informed by it (L4562); per-video ratings never propagate to the channel (L4693), so after the move from ~22 channels to 955 videos the item-learning half of the engine is effectively inert; "Just right" is an unconditional +1 (L4335), so the steady state requires ~1/3 of sessions to be rated "Hard"; "Background" mode returns the same three kids' videos regardless of reroll (L4400-4404); and at the seed level for this learner (~14) roughly a third of listening picks are children's cartoons with no channel-level opt-out (L4865 hides one video id at a time).
4. **The comprehensibility (coverage) tool has a correctness hole that makes it optimistic on exactly the texts a beginner reads.** Any kana run after a known word is counted as "covered" (L4485), so `これはペンです` against a deck containing only `これ` scores 100% — verified by running the real function. Beginner text is mostly kana.
5. **Three "AI" features (✨ hook, session debrief, script furigana annotation) can never work on the deployed site.** `callClaude` posts straight to `api.anthropic.com` with no key and no proxy (L2180-2203); the Worker has no Claude route. Every session that ends with misses still fires the call and shows "Coach is looking…" before falling back. The `Sentences` component (fill-in-the-blank / translate) is fully written but unmounted (L1464, L1472-1490) — dead code.
6. **Vocabulary coverage is good for the course and thin as a learning object.** 821 cards spanning *NihonGO NOW!* Acts 1–6 plus class-notes batches, with kanji/reading/rōmaji/meaning/emoji for every card — but no part of speech, no example sentence, no audio for sentences, pitch accent on only 4/821 cards (L17-861), 17 duplicate terms, and a seed-merge keyed on `term` alone (L1334-1339) that silently rewrites one duplicate's `lesson`.
7. **The motivation layer is honest by design but leaks in places:** streak/"today" only count vocab reviews (`logDay` is called from Study/Write and Freq only — L1394, L5481 — never from Kana, Drill, or Input), so a kana-only day breaks the streak; "words solid" (level ≥ 4) is reached after two sub-3-second recognitions (L1437) which is weaker than the label implies; day keys are UTC (L1212) while the streak grace logic uses local noon (L1227).
8. **Cross-device persistence is the most mature subsystem** — per-record merges, retry with backoff, pagehide flush, visible save state — and genuinely serves "never lose progress". Residual risks: server-side blind overwrite (`cf/src/index.js` L141) with client-only merging; a session-signing secret committed in `netlify/functions/sync.mjs`.
9. **Conjugation engine and kana tables are linguistically correct** for the scope they claim (全8 cells, 音便, いく→いった, いい→よく, ある→ない, 来る reading change). Kana coverage (base, dakuten, yōon, marks, extended katakana) is complete.
10. **Biggest needle-movers (ranked in §8):** fix the FSRS wiring (dueness/retention/Easy mapping/Write direction); fuse deck mastery into the input level continuously and propagate video ratings to channels; fix the coverage tokenizer; either proxy Claude through the Worker or remove the dead AI affordances; add a "no kids content" preference; fold Kana/Drill/Input into the day log.

---

## 2. Goals as evidenced

### 2.1 Stated goals (explicit in code comments, commit bodies, UI copy)

| # | Goal | Evidence |
|---|------|----------|
| G1 | Persistent, never-lose-progress vocabulary flashcard deck for JPN 101 | Header comment L3-7; `5cc3ede` "Progress is the one thing in this app that can't be regenerated"; `983b563`; L1103-1110 |
| G2 | Cross-device sync with Google Sign-In | `ff6964d`, `69b7305`, L900-1021, L1022-1031 |
| G3 | Schedule reviews with a real memory model aimed at a retention target (FSRS) | `22cf183`; `tools/fsrs.mjs` L1-22; L1188-1192 |
| G4 | Grade on hesitation so effort/latency feeds the scheduler | `7322eee`; L1399-1407; `tools/fsrs.mjs` L138-150 |
| G5 | Practise production (EN→JP), not only recognition, interleaved into normal sessions | `4dcefd8`; L2060-2065; L1591-1601 |
| G6 | Kana mastery with full coverage of sounds/modifiers | `23efe09`, `90c341d`; L2499-2570 |
| G7 | Dialogue/script rehearsal (read → my part → both sides from memory) | L3621-3628; SCRIPT_SEED L2947-3353 (34 scripts / 227 lines) |
| G8 | Conjugation drill over the class's 2×2×2 grid, computed from rules | `1eaa12c`; L4948-4999 |
| G9 | Volume of comprehensible input — "what should I watch or read right now", tuned to level, learning from ratings | `fb70c60`, `f0d4fe3`, `110a16f`; L4166-4178, L4504-4507 |
| G10 | Motivation: streak, earned mascot state, combo, honest counters | `2acc723`, `7322eee`; L1219-1249, L1640-1651 |
| G11 | Pronunciation via Google Neural2 TTS, auto-play, cache-first | `226197d`, `4426eb2`, `db16899` |
| G12 | Long-game frequency vocabulary ("10k") at a daily quota | L5217-5221 |

### 2.2 Implied goals (visible in design, not spelled out)

- **Immersion-only input** — channels with English/Spanish explanation are rejected (`tools/yt-channels.mjs` L9-11, L85-90); the REFRESH doc says "immersion only, that was a deliberate choice".
- **Low-friction, phone-first study** — two-button grading ("Two buttons in, four grades out"), 16-card sessions, English-first labels (`c476232`), many phone-width fixes (`e84f783`).
- **Course alignment** — section chips per textbook scene plus "Act N Dry Run" cumulative reviews (L1662-1676); class-notes batches by date (`2d86521`).
- **Self-contained single file, zero external dependencies at runtime** — repeated in comments (L4439-4443 on not using kuromoji; mascot as inline GIF).
- **Trustworthy numbers** — "a mascot that always looks happy carries no information" (L1241-1243); "words solid" deliberately small (L1796-1798).

### 2.3 Things the app does that serve no clear goal today

- `Sentences` (AI fill-in-the-blank / translation, L2354-2493) — complete component, not reachable from any tab.
- `hook`, `debrief`, script annotation via `callClaude` — UI exists, endpoint cannot work outside the original Claude-artifact sandbox (L2184).
- "Pitch on/off" toggle (L1958-1961) — only 4 of 821 cards carry `pitch`.
- Manual sync-code path (`genSyncCode`, L910-925; Worker `code:` key) — the commit `2afa8d5` removed the UI; the code path remains as an unauthenticated fallback.
- `jpn101:oralAttempts` backup field (L1283) — the Oral tab was removed in `07120db`.
- The legacy SM-2 ladder (`REVIEW_INTERVALS` L2059) is still consulted by `Freq` for "next reviews in ~" (L5441) even though scheduling is FSRS.

---

## 3. What works well (specific)

- **Evidence-driven iteration.** The session-mix fix (`2acc723`) was diagnosed from the day log (98% → 87% → 36% accuracy), root-caused to one line, and fixed with a review-debt-earns-slots rule (L1561-1582). The latency thresholds (3 s / 6 s) were chosen from the deck's own accuracy split (`7322eee`). That is exactly how a learning tool should evolve.
- **FSRS implementation itself is faithful** to FSRS-4 (`tools/fsrs.mjs` L25-116): retrievability, stability-after-recall/lapse, mean-reverting difficulty, 10-minute relearning step, interval cap, and a sensible `seedFromHistory` that converts the old level/accuracy counters instead of restarting 500 cards (L123-136). 32 tests, including ones that caught real bugs (lapse scheduling, century intervals).
- **Production gating and separate memory states** (L2060-2070, L1413-1420) reflect the recognition-precedes-production finding in L2 vocabulary research and avoid the common mistake of one shared ease for both directions. The "production has its own due clock" insight (L2121-2131) is subtle and correct.
- **Leech handling is pedagogically right:** stuck words leave the normal rotation, get their own session, and get a keyword-mnemonic field shown on every review (L1569-1570, L1692-1698, L2003-2015). The throttle bug ("same three cards forever") was found and fixed (`7322eee`).
- **Interleaving production cards through the session** rather than appending a block (L1591-1601) is a correct application of interleaving/desirable difficulty.
- **Input tab honesty:** difficulty is "ESTIMATED" and says so in the JSON header, in the README's "known weakness" section, and in code; every row carries a confidence the rating engine uses for damping (L4190-4193, `tools/yt-index.mjs` L11-16). Discovery was reviewed by hand and rejections are recorded so a refresh doesn't re-add them (`tools/yt-channels.mjs` L77-91). The time budget is a real constraint now that durations come from the API (L4430-4435).
- **The level engine's rules are unit-tested** (36 tests) including the one that matters most: a 375-word JPN 101 deck seeds into the true-beginner CI band, not the intermediate podcasts (`tools/test-input-engine.mjs` L161-170).
- **Coverage tool's stemming and okurigana rules** (L4447-4457, L4466-4472) are a thoughtful approximation that correctly handles 面白かったです / 勉強しました without a tokenizer.
- **Persistence is defensive:** response checked, durable pending flag, exponential backoff, retry on `online`/`visibilitychange`, `pagehide` flush with `keepalive`, and a sync box that stops lying (L1125-1166, L3815-3820, L3964-3985). Per-record merges for deck, days, scripts, and input (L937-1007). Auto-snapshot before every seed merge (L1333).
- **Conjugation engine** computes all 8 cells from rules with the right irregulars (L4961-4988) and the drill tracks each (word × form) pair separately (L5031-5042) with the same FSRS need score as everything else.
- **Kana tables are complete and correct**, with explanatory prompts for the modifier marks (L2537-2548) and katakana-only extended sounds hidden in hiragana mode (L2604-2612).
- **Tooling hygiene:** build hard-fails if the mount call disappears; `check-feeds.mjs` fails the build on app/Worker feed-id drift; REFRESH doc contains last-run numbers so a broken rebuild is obvious.

---

## 4. Per-goal assessment

### 4.1 G9 — Tailored comprehensible input (入力 tab) — **Partially achieved**

#### How the learner's level is estimated

- **Seed:** `seedLevelsFromDeck` (L4370-4373): `known` = cards with `seen > 0` and accuracy ≥ 0.6; `listening = 5 + known/40`, `reading = 8 + known/30`, clamped 0–100. The scale is documented as 0–15 absolute-beginner CI, 15–30 N5, 30–45 N4, … (L4170-4171). For the four deck states I simulated: empty deck → 5.0 / 8.0; 375 known → 14.4 / 20.5; 503 studied at ~87% → 16.0 / 22.7; all 821 known → 25.5 / 35.4. So a JPN 101 student's level lives in roughly 5–26 (listening) for the whole course.
- **Re-seed rule:** the level is re-derived from the deck only while no rating has been logged for either medium (L4562). After the first rating, deck growth never informs the level again. A learner who learns 400 more words over a semester but rates rarely will be recommended material for a 375-word learner indefinitely, unless ratings push it.
- **Update:** `applyRating` (L4345-4362): `level += v.user × evidenceWeight(minutes) × learningRate(count)`. Verdict weights (L4333-4338): too_easy +4 / item −3; just_right +1 / item pulled toward user; too_hard −2 / item +3; lost −4 / item +6. `evidenceWeight` = min(1, minutes/20), floor 0.25 (L4341). `learningRate` = 1/(1+count/12) (L4343). Listening and reading are separate (L4691-4692).

Observations from simulation (Appendix A, `sim-input.mjs`):

- **"Just right" is an unconditional ratchet upward.** Because just_right adds +1, a learner who honestly reports "just right" every time climbs 14 → 25 after 10 ratings, → 35 after 25, → 50 after 100 (mix 60% just_right / 30% too_easy / 10% too_hard). The only way the level stops rising is to rate "Hard" (−2) or "Lost" (−4) often enough: with no too_easy the equilibrium is **one third of all sessions rated Hard**. That is the opposite of what comprehensible-input practice wants (the learner should be mostly in the ~90%+ comprehension zone, with occasional stretch). A +1 on "just right" is defensible as a gentle i+1 nudge, but its magnitude relative to Hard's −2 sets the wrong steady state.
- **Permanent learning-rate decay** (indexed by lifetime rating count, not recency) means that after ~100 ratings a single "too easy" moves the level by ~0.36 (vs 4.0 at the start). A real learner's level is non-stationary — it rises a lot between JPN 101 and 102 — so the level should be able to keep moving. Thirty straight "too easy" after 100 prior ratings moves 14 → 22.6.
- **Cold start is handled** (deck seed; `c476232` re-seeds while the deck is still arriving from the cloud), but at level 5 (empty deck) the core band contains exactly one indexed video (a 6-minute NIJ clip); "Show me 3 things" returns two items, one of them labelled "probably too hard".

#### How a video's difficulty is estimated

`tools/yt-index.mjs` `scoreDifficulty` (L93-128): start at the channel anchor (conf 0.25); if the Japanese description has ≥ 40 chars and ≥ 8 tokens, blend 30% (12% for kids channels) of an "implied" score derived from how much of the description is in the deck (L105-108; deck = every `term:`/`reading:` regex-scraped from the JSX plus stems, L48-56); ± title kanji density (L113-119); +4 if > 30 min, −2 if < 4 min; −3 for kids channels. Confidence 0.35–0.7 only when a description was scored. The README and JSON header say plainly that this is an estimate because YouTube does not expose captions (REFRESH doc "The known weakness"). In the shipped index: median confidence is 25 in the 20–34 band and 39 in the < 20 band — i.e. at the levels this learner actually occupies, most rows are close to the channel anchor ± noise. That is acknowledged and is the honest ceiling without transcripts. Two caveats: (1) the description-coverage signal uses the same kana-after-known-word rule as the app (see below), so it is optimistic too; (2) a title's kanji density is a weak proxy that penalises kana-only titles such as "おしゃべりタクシー" (kids) and rewards news titles — which is partly why 「特殊詐欺の被害金回収へ 警察庁とメガバンク…」 from a channel anchored at 22 comes out at 30 and is offered to the "all 821 known" learner as "a stretch" (Appendix A output).

#### How `recommend()` picks

L4387-4437. Filter by medium and 14-day history; **active** mode builds `core = [level−3, level+6]`, `stretch = [level+6, level+14]` (30% of core's size), `comfort = [level−12, level−3]` (one item), seeded-shuffled (L4405-4408); resolvable sources (indexed videos or feed-backed ids) get first refusal (L4416-4423); then sort by accumulated tag score (L4426-4428); then filter to items that fit `minutes × 1.25` if at least 3 do (L4432-4435); return 3.

Findings:

- **Passive ("Background") mode ignores the seed**: it returns the same three items sorted by duration descending (L4400-4404). In every simulated scenario "Background 30" returned the identical three とんとん kids' videos for seed 1 and seed 8. "Show me others" does nothing until those three are opened (history) or hidden one by one.
- **Kids content dominates the learner's band.** From `data/videos.json`: in the < 20 band 56/116 rows are kids channels; at level 14.4 the core band holds 140 videos of which 62 are kids, and at level 20, 93/198. Across 129 simulated "Listen 15" picks at level 14.4, **33% were children's cartoons** (Peppa Pig, Bing, Cry Babies, とんとん). Adult CI channels (NIJ, Tanaka-san, にほんごのじかん, Masa, いろいろな日本語) are there too, but the learner has no way to say "no kids content" — "Not for me" hides a single video id (L4865), and each kids channel contributes up to 45 videos (`tools/yt-pack.mjs` L23). Tag scores (L4684-4688) can slowly demote the `kids` tag, but only after rating several of them, and only as a stable sort within the already-banded list.
- **Channel-level catalog entries coexist with their indexed videos** (L4590: `[...INPUT_CATALOG, ...videos]`), so e.g. "Peppa Pig (Japanese)" (channel, d18) and individual ペッパピッグ episodes (d18–22) can both be offered in one set of three (seen in the "JPN101 mid, Listen 5" output). The channel entry then resolves via `/api/feed` — whose duration parser has a regex bug (`cf/src/index.js` L285: `(d+)` instead of `(\d+)`), so `ytDurations` can never return a length and the "fits the time" promise is silently void for those picks.
- **Per-video ratings teach nothing reusable.** `rate()` stores difficulty/confidence per `entry.itemId` = `yt:<videoId>` (L4678, L4693). Since a video is excluded for 14 days after opening and is unlikely to be rewatched, each of 955 items is rated at most once and nothing propagates to its channel or to similar videos. The item-learning half of the engine was designed for ~22 channel-level sources (`fb70c60`) and became inert when `110a16f` replaced them with 955 videos. The user-level half still learns — but see the ratchet above.
- **No use of subtitle availability or per-video confidence in ranking.** `hasSubsJa` is shown as a chip (L4845) but a beginner benefits disproportionately from JP captions; 44/116 videos in the < 20 band have them and could be preferred.
- **Reading is thin:** 9 reading sources total, 4 resolvable to articles via feeds (L4243-4247, L4296-4326). At level 20.5 the three picks are Yomujp + NHK Easy/Watanoc + ふくむすめ — sensible, but there is no notion of an article's difficulty, only the site's, and Tadoku graded readers (the single best-fit resource for this level, d8) only appear as the "comfort" slot.

#### Does the coverage tool measure comprehensibility meaningfully?

`coverageAgainstDeck` (L4444-4502) does longest-match over deck terms, readings and crude stems. The two "honesty" rules (L4466-4472) are what make the numbers plausible on inflected text — and rule 1 is also the hole. Any unmatched **kana run immediately after a known word is counted as covered** (L4481-4487, `if (afterMatch) covered++`). Verified against the real function:

| text | deck | result |
|------|------|--------|
| これはペンです | [これ] | **100%**, no unknowns |
| 私はとても | [私] | **100%** |
| 猫がすきです | [猫] | **100%** |
| 私はとても | [] | 0%, unknown 私 (とても absorbed into the same gap) |

Beginner text — the only text this learner reads — is predominantly kana, so the measure systematically over-reports comprehensibility right where it matters, and "not in your deck" lists omit kana vocabulary after known words. The realistic-sentence test (`tools/test-input-engine.mjs` L239-245) passes because its only gap is a kanji word. The comment (L4439-4443) rejects kuromoji for size reasons, which is fair; TinySegmenter (~25 KB, no dictionary) or a small particle/copula list (は が を に の と へ で も です ます ました …) that is *not* counted as coverage would close most of this gap.

#### Is "i+1" realized?

Structurally yes — core band slightly above level, one stretch, one comfort (L4405-4408), shown as relative dots not numbers (L4522-4528). But three things mean that the system does not reliably converge on i+1 for a JPN 101 student: the level signal is noisy (seeded once; ratchet; decaying rate), the item difficulty signal is mostly the channel anchor, and the coverage bridge is optimistic. **Would a JPN 101 student actually get good recommendations?** At the realistic seed (level ~14–16, "Listen 15") the simulated picks were mostly reasonable — NIJ "Complete Beginner", Tanaka-san, Shun's N5-N4 コンビニ video — interleaved with Peppa/Bing/Cry Babies. A student who dislikes cartoons will start hiding videos one at a time or stop using the tab; a student who tolerates them gets decent CI. For reading, the picks are right but coarse (sites, not articles). For "Background", the same three kids' videos every time.

**Rating: Partially.** The plumbing is excellent and honest; the modelling choices (no channel propagation, one-shot seeding, verdict weights, passive mode) and the coverage bug stop it from being "tailored" in the adaptive sense the tab promises.

### 4.2 G3/G4/G5 — Spaced repetition, latency grading, production — **Partially achieved**

**Is FSRS used properly?** The model is implemented correctly, but the app does not schedule from the model's output:

- `dueness()` (L2086-2097) computes `elapsed / intervalFor(S, 0.9)` — the retention target is hard-coded to 0.9 and the `due`/`ivl` fields that `fsrsReview` writes with the user's `retentionTarget` (L1418; `tools/fsrs.mjs` L112-115) are never read for recognition scheduling (the only `.due` reads are `rfsrs.due` in `prodDue` L2130 and the "week" forecast L1636). Consequence: the "Aim to remember 85/90/95%" control (L1849-1863) changes nothing about what comes due in Study, Freq, Kana or Drill. Simulated: at target 0.85 FSRS says a card is due in 15.9 d; the app surfaces it at 10.0 d; at 0.95 FSRS says 4.7 d, the app still waits 10.0 d. The UI text "Many more reviews for a little more recall" (L1859) is therefore not true of the app's behaviour.
- The **10-minute relearning step is not honoured across sessions**: `dueness` recomputes from S, so a card lapsed at S=10 (post-lapse S=2.5) is not due again for 2.5 days unless the in-session requeue (L1755-1757, gap 3, cap 3) catches it. Within a session that is fine; a lapse on the last card of a session waits days. The `relearning` flag (`tools/fsrs.mjs` L115) is unused.
- **Latency → grade mapping.** `gradeFromLatency` (`tools/fsrs.mjs` L144-150): < 3 s → *Easy*, < 6 s → *Good*, else *Hard*. The idea is sound — latency is a well-established proxy for retrieval strength — but *Easy* in FSRS-4 carries an easy-bonus w[16]=2.61 on top of first-review stability w[3]=5.8 d, because in the data FSRS was fitted on, Easy is a rare "this review was a waste" signal. Here *Easy* is the modal correct grade (the author's own figure: 87% of sub-3-s answers are correct, and sub-3-s is common for a recognized word). Simulated with the real `review()`: a card answered fast at each due date goes **5.8 d → 46 d → 315 d → 1,846 d**; answered in 3–6 s it goes 2.4 → 8 → 24 → 65 → 161 d. Three quick recognitions and a *NihonGO NOW!* word seen twice is scheduled almost a year out. There is no optimizer run over the review log and no measurement of actual retention to catch this. A safer mapping is < 3 s → Good, 3–8 s → Good/Hard, and *Easy* reserved for an explicit "too easy" or extreme speed with several prior successes — or at minimum, use FSRS-4.5/5 weights where the easy bonus is smaller.
- **Production recall (G5)** — the design is right (L2060-2070, L2121-2131) and the Study tab implements it correctly. But the **Write tab records production attempts as recognition**: `Write` calls `onResult(card.id, got, undefined, think)` (L3766); `recordResult` treats `dir !== "prod"` as JP→EN (L1416-1420, L1432-1438). So handwriting 火曜日 from "Tuesday" increments `seen/correct/level` and advances the recognition FSRS state, and `rfsrs` is untouched. This silently contradicts the commit that verified "火曜日 written from Write at S 0.6" (`bc2f285`) — that S was written into the wrong direction. Also, in `start()` (L1713-1715) `prodSet` is built from *all* prod-due cards in the ordered queue (up to 6), including cards that were selected because they were recognition-due; such a card is then asked backwards only and its overdue recognition review is not performed.
- **Session composition** (L1571-1603): 16 cards = up to 8/5/3 new (by review debt) + up to 4 production + the rest reviews, most-overdue first, leeches excluded. This is sound and the rationale is well documented. Two issues: (1) new words are taken **earliest lesson first** (L1580), whereas a student with class deadlines needs the *current* scene — the section chips cover that manually; (2) there is no "do all due" path. With ~500 studied cards, daily due counts of 30–60 are plausible; Smart Review serves 16, "Go again" replays the *same* 16 (L1934-1937 → `lastPool.subset`), so clearing debt means Done → Smart Review → Done → … The mascot's "worried" at > 40 due (L1247) will be a frequent sight.
- **Leeches** (L2078-2083: ≥ 8 attempts, ≥ 6 misses, < 60%) — good; plus the keyword mnemonic. Nothing re-evaluates a leech's status once it recovers, but `isLeech` is stateless so it clears on its own as accuracy rises. ✓
- **Review-debt risk** is moderate: FSRS with the Easy mapping *under*-schedules fast cards (few reviews), while new-word intake is deliberately uncapped ("class deadlines"). The net effect is probably a deck that feels light now and produces a wave of forgotten "solid" words later — the failure mode that "fading" (L1626-1639) is meant to expose, which is good, but the forecast counts R < 0.9 and the app itself defines due as exactly that point, so "fading" ≈ "due".

**Rating: Partially.** The model is good; the scheduler around it needs four concrete fixes (use `due`/`retentionTarget` in `dueness`; honour relearning; rein in *Easy*; pass `"prod"` from Write).

### 4.3 G1 — Vocabulary coverage & card quality — **Mostly achieved (for the course), thin as a learning object**

- **Size and structure:** 821 cards (L17-861), SEED_VERSION 30. By `sectionOf` (L2153-2155): Act 1 bucket 67, Act 2 133, Act 3 129, Act 4 138, Act 5 100, Act 6 152, Culture talk 11, Class notes 44, dated class-note batches 47 (7/20–7/30). 595 cards carry an explicit textbook scene `sec` (e.g. "4-4", "3-9R"); the rest are placed via `SECTION_MAP` (L2151) or the lesson ≤ 6 → "Act 1" fallback. The "Act 1" bucket is actually the author's first batches (感謝します, 愛する天のお父様, 預言者, 祝福, 贖い…) — devotional vocabulary, not textbook Act 1 — so the label misleads slightly.
- **Fields:** term, reading, rōmaji, meaning, kind, emoji, lesson, (sec). **Missing:** part of speech (only 77 meanings embed "noun/verb/adj" in prose), example sentences, collocations/particle frames (partly compensated by meanings like "use に to mark what for"), pitch accent on 4 cards, kanji-vs-kana study separation (a kanji word is tested as a whole), audio for anything but the isolated word. 76 cards are multi-word phrases (〜は日本語で何と言いますか), which is fine for a phrasebook but noisy for FSRS (very different retrieval task).
- **Verb form convention is mixed:** 82 terms end in ます, ~139 end in a dictionary-form ending; the conjugation drill and the coverage stemmer assume dictionary forms. Not wrong (NihonGO NOW! introduces ます first) but unmarked.
- **Duplicates:** 17 terms appear twice (e.g. なるほど, 写真, 質問, 〜に). `cardMergeKey` handles them for cloud merge (L936), but the seed-version merge keys on `term` only (L1334-1339): the second SEED entry updates the *first* card's `reading/meaning/lesson` (not `sec`), so one of each pair has its `lesson` silently rewritten on every version bump.
- **Freq "10k" deck:** 148 words, Tier 1 only (L5224-5377); labelled "Frequency 10k" in UI (L5521).
- **What's missing for JPN 101 → 102:** kanji as first-class items (reading + meaning + writing), particles/grammar-pattern cards, counters, te-form and the remaining conjugations (て, たい, potential) in the drill, example sentences with audio, and listening-comprehension items. The import pipeline (pack format in `doRestore`, L3859-3880; "paste your class notes to Claude", L4104) makes adding content cheap, so this is a content gap rather than a design gap.

### 4.4 Kana / Scripts / Write / Drill / Freq / Sentences

| Tab | Goal served | Assessment |
|-----|-------------|------------|
| **Kana** (L2578-2934) | G6 | **Achieved.** Romaji → handwrite → self-grade; complete sound inventory; FSRS-based need ordering (L2629, L2105-2119); tracked sessions with think time; chart to drill one kana. Maps checked: base/dakuten/yōon/marks/extended all correct, ぢ/づ disambiguated, を romanised "wo" in the chart and "o" in `KANA_MAP` (L2224) — both acceptable. Self-grading of handwriting is the only option without stroke recognition; fine. |
| **Scripts** (L3461-3706) | G7 | **Mostly.** 34 seeded dialogues (2-1…6-6 + Culture talk) with furigana tokens, rōmaji, English; read → my part → both; TTS per line with slow mode. Rehearsal is *not* tracked (no FSRS, no log). "Build rehearsal" for a pasted dialogue depends on `callClaude` and will always fall back to plain lines with a warning "tell Claude the exact message" (L3557-3562) — the feature cannot succeed on the deployed site. |
| **Write** (L3708-3812) | G5 | **Partially.** Good production task, timed from show to reveal (L3764, L3793-3796); but results go to the recognition state (L3766, see §4.2) and order is fixed weakest-first over the whole deck with no session boundary — after a few sessions it keeps starting with the same words. |
| **Drill** (L5002-5215) | G8 | **Achieved** for the 2×2×2 grid. Rules engine correct (§1 bullet 9; GODAN_ROWS L4956-4960; いく L4985; いい L4965; ある L4976; 来る reading L4975). 33 words (L4124-4163). Missing te-form, which JPN 101 reaches — the deck already holds 聞いて as a vocab card (L56). |
| **Freq** (L5388-5599) | G12 | **Partially.** Quota + FSRS need; only 148 words; the "next reviews in ~" estimate uses the dead SM-2 ladder (L5441) and will disagree with the FSRS-based `due`. |
| **Sentences** (L2354-2493) | context/production | **Not reachable.** Not in the tab list (L1464) nor the render switch (L1472-1490). Prompts are well designed (token-level furigana, N5 constraint, grading rubric L2269-2299) and there are local fallbacks (`localFill`/`localTrans`, L2308-2342) that generate only "___ がすきです" for nine hard-coded nouns (L2301) and "Say in Japanese: X" otherwise. Even if mounted, `callClaude` cannot reach Anthropic from the deployed origin (L2180-2203: no API key, no proxy route in `cf/src/index.js`). |

### 4.5 G10 — Motivation / habit — **Mostly achieved, with honesty leaks**

- Mascot state is earned (L1244-1249) and the copy is one honest line (L1644-1649). ✓
- Streak counts any reviewed day with a grace window (L1223-1233). But `logDay` is only called from Study/Write (L1394) and Freq (L5481). A day of Kana, Drill, Scripts or Input does not count — the hint line says "the point is showing up" (L1222) but three of the app's eight tabs do not register as showing up.
- Day keys are UTC (`toISOString`, L1212) while `streakFrom` anchors "today" at local noon (L1227). For a Utah user studying after ~18:00 local, the reviews land on tomorrow's UTC key; the streak and the "N today" counter (L1619-1620, also UTC) disagree with the wall clock. The "36% day" analysis in `2acc723` was itself computed over these UTC buckets.
- "Words solid" = level ≥ 4 (L1621). Since `7322eee`, a sub-3-s correct answer adds +2 levels (L1437), so two fast recognitions on two days make a word "solid". The commit that introduced the counter justified it as "small and moves slowly" — the same commit made it move twice as fast.
- Combo counts instant recalls (L1740-1745) — coherent with the latency philosophy. The +2 level jump and the FSRS *Easy* mapping both reward speed; the concern is the grade, not the combo.
- No notion of a daily goal, and the 16-card session plus "Go again = same 16" makes "catch up" tedious (§4.2).

### 4.6 G1/G2 — Cross-device persistence — **Achieved**

- Load → pull/merge → seed-merge → push, serialised (L1312-1348); re-run after sign-in (L1350-1355). ✓
- Per-record merges: deck by term|lesson|sec with seen/last tiebreak (L936-953), days by max reviews (L954-964), scripts union (L965-976), input union with append-only history (L977-1007). Secondary keys: newer whole snapshot wins (L1017-1018) — Kana/Conj/Freq stats are whole-blob last-writer-wins keyed on `updatedAt` vs `syncLastPulled`, so simultaneous kana practice on two devices can lose one side's day. The `jpn101:freq` deck in particular is a per-card store that gets whole-blob semantics.
- Server is a blind PUT (`cf/src/index.js` L138-142); all merge logic is client-side. The serialisation makes this safe for one user on two devices; a third device or a stale tab could still overwrite, and there is no version/ETag check.
- Retry/flush/visible state (§3). ✓ Backup/restore with seed back-fill (L3833-3914). ✓
- `netlify/functions/sync.mjs` embeds the HMAC session secret in the bundled source; `11dee08` says the Worker deliberately keeps "the same value". Out of scope for pedagogy but it means anyone with the repo can mint a 2-year session for any `sub`. (Flagged for the security reviewer.)

### 4.7 G11 — Pronunciation — **Achieved**

Neural2 TTS via the Worker, cache-first, session-gated for new audio, prefetch of the next card/line, rate aligned so auto-play and the button share cache entries (L1536-1544, L3381-3436, `cf/src/index.js` L152-193). Browser `speechSynthesis` fallback. Solid.

---

## 5. Learning-science critique (concrete)

1. **Recognition vs production.** The design (production gated on recognition stability, separate memory states, interleaved) matches the literature on receptive vs productive vocabulary knowledge. The implementation leak in Write (§4.2) means the *only* typed/handwritten production channel feeds the wrong trace. Fix is one token (`"prod"` at L3766).
2. **Desirable difficulty and grading on speed.** Using latency is a good proxy for retrieval effort; but *Easy* in FSRS is not "fast", it is "wasteful". Over-rewarding speed produces intervals that look like mastery long before it exists (§4.2 simulation). Desirable difficulty argues for reviews *near* forgetting, not a year out after three looks.
3. **Testing effect is well exploited** (flip cards, write-from-meaning, kana from romaji, conjugate-on-demand). Scripts are the exception: rehearsal is read-aloud with reveal, no graded retrieval and no spacing; turning "my part" attempts into scored, scheduled items would make the script tab a retrieval task rather than a re-reading task.
4. **Context.** Cards are isolated words with an emoji; there are no sentences, no collocations, and the one sentence-generation feature is unmounted/unreachable. L2 vocabulary research is consistent that meeting words in varied contexts (and generating them) beats isolated pairs for depth of knowledge. The Input tab is the intended answer (volume of context), which is why its comprehensibility calibration matters so much.
5. **Interleaving** is done within Study (production mixed in, Dry Run cumulative sets) and within Drill (word × form items). New words are blocked by lesson order (L1580), which is fine for intake.
6. **Input/output balance.** The app is output-heavy (flash, write, conjugate, kana) plus a link-out input tab. There is no in-app listening comprehension (e.g., hear the word/sentence → pick meaning) even though TTS is already there and cached; that would be the cheapest way to add modality variety and to make the "listening" level signal less dependent on self-report.
7. **Feedback honesty.** The UI and commits are admirably sceptical of flattering numbers; the remaining gaps are "solid" (level ≥ 4 after two fast hits) and the retention chips that do not change scheduling.
8. **Self-report calibration for input.** Four verdict buttons with asymmetric weights is reasonable; the asymmetry just points the wrong way (§4.1). A small in-app comprehension probe (e.g. "what was it about?" or three quick vocabulary checks from the video's description/title) would make the level signal less noisy than a self-rating after a 5-minute clip.

---

## 6. Failure modes specific to a JPN 101 learner (summary)

| Scenario | What happens | Where |
|----------|--------------|-------|
| First open on a new phone before cloud pull | Level seeds at 5/8; core band has 1 video; two picks returned, one flagged too hard | L4562, recommend L4405 |
| Semester progresses, deck mastery triples, learner rarely rates | Input level stays where the first rating left it | L4562 |
| Learner always says "Just right" | Level climbs ~+1/rating until "Hard" is reported ~1/3 of the time | L4335 |
| Learner dislikes cartoons | Hides one video at a time; 124 kids rows, 45 per channel | L4865, `yt-pack.mjs` L23 |
| "Background" mode | Same three とんとん videos each time | L4400-4404 |
| Pastes a beginner dialogue into Coverage | Reports ~100% even when most kana words are unknown | L4485 |
| Answers quickly three times | Card scheduled ~315 d out | `fsrs.mjs` L144-150, L67-78 |
| Sets retention 95% before an exam | No change in what comes due | L2092 |
| Practises kana only on a given day | Streak breaks | L1394, L5481 (no Kana caller) |
| Taps ✨ hook / finishes a session with misses / builds a script | Always "Couldn't reach the AI" | L2184 |

---

## 7. Gap analysis — ranked

**Needle-movers (in order):**

1. **Fix the FSRS wiring.** (a) `dueness()` should use the stored `due` (or `intervalFor(S, retentionTarget)`) and honour the 10-minute relearning step; (b) tone down the latency→*Easy* mapping (e.g. < 3 s → Good; Easy only on ≥ 2 consecutive fast hits, or adopt FSRS-4.5/5 weights) and measure real retention from the day log; (c) pass `"prod"` from Write; (d) do not consume a recognition-due card as a production card. Small code, large effect on G3/G5.
2. **Make the input level actually track the learner.** Fuse the deck seed continuously (e.g. level = max(deck-derived, rating-derived) or a weighted blend that never decays to zero); give `learningRate` a floor; rebalance verdict weights so "Just right" is ≈ 0 and "Too easy" drives ascent; propagate per-video ratings to the channel anchor (hierarchical shrinkage) so ratings generalise; shuffle passive mode by seed.
3. **Fix the coverage tokenizer** (kana words after a known word must still be checked; either a particle/copula stoplist that is *not* counted, or TinySegmenter). This also improves `yt-index.mjs`' description-coverage signal.
4. **Content preferences in Input:** "no kids content" toggle; channel-level "Not for me"; prefer `hasSubsJa` for beginners; dedupe channel entries against indexed videos of the same channel.
5. **Either proxy Claude through the Worker (session-gated, like TTS) or remove the dead affordances** (hook, debrief, annotate, and the unmounted Sentences). If proxied, mount Sentences — it is the only context/production-in-context feature in the app and it is already written.
6. **Log every study modality to the day log** (Kana, Drill, Scripts, Input minutes) and key days by local date; re-derive "solid" from FSRS stability (e.g. S ≥ 21 d with ≥ 3 reviews) instead of level ≥ 4.
7. **Session ergonomics for review debt:** "Go again" should draw the next 16 due, or offer "clear all due"; take new words from the current scene first when a section is active.
8. **Card depth:** add part of speech and one example sentence (with TTS) per card via the existing pack import; mark ます vs dictionary-form verbs; fix duplicate handling in the seed merge (key on term|sec).
9. **Add in-app listening items** using the cached TTS (hear → choose meaning / type reading) to balance input/output and feed the listening level with objective evidence.
10. **Extend Drill to te-form** (and the polite request/invitation forms the deck already contains as fixed phrases).

**Polish (worthwhile, lower impact):**

- Fix `iso8601ToSeconds` regex in `cf/src/index.js` L285 (`\d`), and the duplicate-secret issue in `netlify/functions/sync.mjs`.
- Remove/relabel "Pitch" toggle until pitch data exists; relabel "Frequency 10k" to Tier 1 / 148 words; drop SM-2 `REVIEW_INTERVALS` from the Freq "next reviews" estimate.
- Rename the "Act 1" fallback bucket (devotional batch) to something truthful.
- Track Scripts rehearsal as graded, scheduled items.
- Add an ETag/version check on sync PUT so a stale tab cannot clobber.

---

## 8. Appendix A — Simulations run (reproducible)

Scripts are in `docs/8-22-2026-code-review/scripts/` (`sim-input.mjs`, `sim-fsrs.mjs`, `sec.mjs`); each extracts the real functions from `JpnFlashcards.jsx` the same way `tools/test-input-engine.mjs` does (no modification of source) and imports `tools/fsrs.mjs` directly.

- `node tools/test-fsrs.mjs` → 32/32 pass. `node tools/test-input-engine.mjs` → 36/36 pass.
- **Video index bands** (`data/videos.json`, 955 rows, 35 channels): difficulty 7–75 (median 41); confidence distribution 20s: 282, 30s: 80, 40s: 165, 50s: 111, 60s: 76, 70s: 241. Band < 20: 116 rows (56 kids, 44 captioned, median 9 min, median conf 39). Band 20–34: 277 (56 kids, 152 captioned, median conf 25).
- **Core band occupancy** (level−3 … level+6): level 5 → 1 video; 9.4 → 14; 14.4 → 140 (62 kids); 20 → 198 (93 kids); 25.5 → 149 (34 kids).
- **Recommendations** for four deck states × {Listen 15, Listen 5, Read 15, Background 30} × seeds {1, 8} — representative output quoted in §4.1; 129 Listen-15 picks at level 14.4: 33% kids, 11 channel-level (non-indexed) picks, 68 with JP captions.
- **Coverage edge cases** — table in §4.1.
- **Level dynamics** — 60/30/10 mix from 14.4: 25.0 after 10 ratings, 34.9 after 25, 41.4 after 50, 50.2 after 100, 55.7 after 150. Step size of "too easy" at n = 0/12/24/60/120 ratings: 4.00/2.00/1.33/0.67/0.36.
- **FSRS sequences** (reviewed exactly when `dueness()` says due): all Easy: S 5.8 → 46.4 → 315.5 → 1845.6 d; all Good: 2.4 → 8.0 → 24.0 → 64.8 → 160.6 d; all Hard: 0.6 → 1.0 → 1.4 → 1.8 → 2.2 d. Production unlock (S ≥ 7) after 3 Easy (S = 50.8) or 3 Good (S = 8.0). Target 0.85/0.95 vs `dueness()`: 15.9 d / 4.7 d vs 10.0 d. Lapse on S = 10: FSRS due in 10 min, `dueness()` after 2.5 d.

## 9. Appendix B — Key locations

| Area | Lines / files |
|------|---------------|
| SEED deck | L17-861 (821 cards); SEED_VERSION L14 |
| Storage / sync / merge | L865-1021; push/retry L1125-1166; pull L1168-1183; load chain L1319-1346 |
| Retention, days, streak, mascot | L1188-1249 |
| recordResult (grading, FSRS, prod/rec) | L1392-1443 |
| Study session mix / production interleave | L1561-1603, L1689-1719 |
| Scheduling helpers | L2042-2149 (dueness L2086; prodDue L2127; needScore L2139) |
| Claude calls & Sentences | L2180-2203, L2269-2342, L2354-2493 |
| Kana | L2499-2934 |
| Scripts | L2937-3706 |
| Write | L3708-3812 |
| Browse / backup / restore | L3822-4064 |
| Conjugation | L4117-4163, L4948-5215 |
| Input engine & tab | L4166-4946 (applyRating L4345; seed L4370; recommend L4387; coverage L4444; rate L4674) |
| Freq | L5217-5599 |
| FSRS model | `tools/fsrs.mjs` |
| Video index pipeline | `tools/yt-channels.mjs`, `tools/yt-index.mjs` (scoreDifficulty L93-128), `tools/yt-pack.mjs`, `tools/REFRESH-VIDEO-INDEX.md`, `data/videos.json` |
| Worker | `cf/src/index.js` (sync L106-145, TTS L152-193, feeds L195-359) |

## 10. Appendix C — Assumptions and open questions for the author

- **Learner context** is inferred: JPN 101 (header L4), *NihonGO NOW!* (commits `226197d`, `1eaa12c`; `hookPrompt` L3454), BYU companion site (`nihongonow.byu.edu` in `226197d`), Mountain time (commit timestamps `-0600`). The UTC-vs-local day-key observation (§4.5) assumes evening study in that timezone.
- **"375 solid words"** as the representative deck state comes from the engine's own test comment (`tools/test-input-engine.mjs` L162); the "503 studied, 87%" state comes from commits `22cf183`/`2acc723`. Real per-card latency distributions were not available, so the *Easy*-dominance claim rests on the author's stated split (87% of sub-3-s answers correct) plus the simulated consequences; it should be confirmed against the live deck's `ms/msN` fields.
- **Was `callClaude` ever meant to work on the deployed site?** The storage comment (L866-868) shows the app began as a Claude.ai artifact, where `api.anthropic.com` is reachable without a key. If the plan is to keep the AI helpers, they need a session-gated Worker route like TTS; if not, the buttons and the auto-fired debrief should go.
- **Is the retention control intended to drive scheduling?** Its copy (L1857-1861) says yes; `dueness()` says no. Either wire it or remove it.
- **Is children's programming a deliberate inclusion for this learner?** `tools/yt-channels.mjs` L13-14 frames it as "can be filtered or sought out", but no filter exists in the UI.
- **Is the Write tab meant to be a production channel?** Its copy says "Write it from memory" and the commit `bc2f285` treats it as production; the code records recognition. One of the two should change.
