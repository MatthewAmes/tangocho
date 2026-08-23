# tangocho — Expansion & Improvement Opportunities

*Review date: 2026-08-22 · Reviewer: Claude (Fable 5) · Scope: `JpnFlashcards.jsx` (6,084 lines, b59), `cf/src/index.js` (370 lines), `tools/*`, `data/*`, full git history (45 commits, 2026-07-20 → 2026-08-04).*

Every claim about current behaviour below cites `file:line` in the repo as cloned today. Nothing in the source was modified during this review. `tools/` dependencies were installed and both test suites and the build were run: **32/32 FSRS tests pass, 36/36 input-engine tests pass, and a fresh `node tools/build.mjs` reproduces the committed `index.html` byte-for-byte** (536.2 KB, 955 videos) — so the repo is in a clean, reproducible state to build on.

---

## Executive summary

tangocho is a genuinely good single-learner tool: a real FSRS-4 scheduler with latency-derived grades, separate recognition/production memory states, a leech lane, a hesitation-aware combo, a cross-device sync layer that has been hardened against every failure mode the commit log records, and an Input tab that already does the hard part of comprehensible-input recommendation (a level model with damped updates, 955 indexed videos with real durations, server-side feed resolution). The commit messages show unusual rigour — each change carries the data that motivated it.

The biggest opportunities are not new tabs. They are five structural gaps that the existing code makes cheap to close:

1. **Every LLM feature in the app is dead today.** `callClaude()` (`JpnFlashcards.jsx:2180-2203`) POSTs straight from the browser to `https://api.anthropic.com/v1/messages` with **no API key, no `anthropic-version` header, and no CORS opt-in**, so it fails 100% of the time. The ✨ hook button, the post-session coach debrief, sentence generation, translation grading, and script furigana annotation all silently fall back (`localFill`/`localTrans` at 2308-2342, `localBuild` at 3516) or show "Couldn't reach the AI". The prompts are already written; a ~150-line Worker endpoint revives five features at once (Section 6).
2. **There is no review log**, only per-card aggregates (`seen/correct/ms/msN/level/fsrs{S,D,last,due}` written at 1392-1443). That blocks FSRS parameter optimisation, per-card history, retention curves, and any serious analytics. An append-only log with the same union-merge pattern already used for `jpn101:input` history (980-1007) is a day of work and unlocks the rest of Section 2.
3. **Input-tab difficulty is the acknowledged weak link** ("The known weakness", `tools/REFRESH-VIDEO-INDEX.md`). Captions are closed, but three things are open and cheap: (a) a one-character regex bug in the Worker means feed-route durations never resolve (`cf/src/index.js:234`, `(d+)` should be `(\d+)` — verified: `PT5M30S` returns `null`); (b) the index pipeline already computes per-video deck coverage but throws the word lists away (`tools/yt-index.mjs:63-88`) — shipping the top unknown words per video enables a "watch with the deck" mode; (c) a maintainer-side offline caption pipeline (yt-dlp, with ToS caveats) producing *numbers only* is feasible and would replace the estimate for the ~500 captioned videos.
4. **Housekeeping that costs nothing and removes real risk**: two never-rendered components (`Sentences` 2354-2493, `Add` 4067-4107), the unauthenticated sync-code write path (`cf/src/index.js:132-135` — anyone can POST JSON into KV), the sync snapshot that currently pushes the **session token and the 145 KB video-index cache** into KV on every save (`SYNC_SKIP_KEYS` at 908 doesn't exclude `jpn101:session`, `jpn101:userEmail`, `jpn101:videoIndex`, `jpn101:syncPending`), orphaned `jpn101:oralAttempts`, and the dead `netlify/functions/*` bundles.
5. **Platform basics** that matter the moment a second learner appears: a PWA manifest (there is none — only two Apple meta tags in `index.html`), a GitHub Actions check that `index.html` is in sync with the source, `/api/health`, per-user quotas on the TTS and (future) AI endpoints, and a module split so `tools/test-input-engine.mjs` stops parsing the React source as text to extract functions (`tools/test-input-engine.mjs:12-40`).

**If you only do three things:** (1) ship the Worker AI endpoint and delete the browser-direct `callClaude`; (2) add the review log + per-section recall forecast; (3) fix the duration regex, exclude the junk keys from sync, and ship per-video unknown-word lists from the index.

---

## 1. Quick wins (≤ 1 day each)

Format per item: **Value · Effort · Depends on · Where · Risk · Done when.**

### QW-1 · Mount the orphaned `Add` form (or delete it)
`Add` (`JpnFlashcards.jsx:4067-4107`) parses `term, reading, rōmaji, meaning, 📷` lines and calls `onAdd`, but it is never rendered — the tab list at 1464 has no `add` entry and `Study`'s empty-deck button does `goAdd={() => setTab("browse")}` (1475), landing on a tab with no add form. Today the only ways to add words are a seed bump in source or pasting a `tangocho-pack` JSON into Restore (3859-3880).
- **Value:** lets Matthew add class-notes words from his phone between commits. Also needed by QW-10.
- **Effort:** S. **Depends on:** nothing. **Where:** render `<Add onAdd={addCards} count={cards.length} />` inside Browse's "More" panel (3992-4025), thread `addCards` (1362-1374) through `JpnFlashcards` props.
- **Risk:** `addCards` assigns `lesson = max+1` (1368) so ad-hoc words get a new numeric lesson and fall into the "Class notes" section via `sectionOf` (2153-2155) — fine.
- **Done when:** a word typed on the phone appears in Study's next session and syncs to the laptop.

### QW-2 · Per-section recall forecast on the section chips
Section chips already compute a historical accuracy (`batches` at 1652-1679). The FSRS model can do better: `recallChance(c, now)` (2134-2138) gives today's predicted recall per card.
- **Value:** the chip currently says "4-4 · 57 words · 71%" (lifetime accuracy, never changes much). "71% · 12 fading" tells Matthew which section to hit before Friday's quiz.
- **Effort:** S. **Where:** extend `batches` with `fading = group.filter(c => recallChance(c, now) < 0.9).length`; render in `tc-batchmeta` (1895-1897).
- **Done when:** chips show a fading count and the Act Dry-Run chips sort by it.

### QW-3 · Stop syncing the session token and the video index
`collectLocalSnapshot()` (926-935) pushes every `jpn101:*` key except four (908). That means each debounced save (2.5 s after the last answer, 1153-1156) uploads `jpn101:session` (the bearer token), `jpn101:userEmail`, `jpn101:syncPending`, `jpn101:lastBackup`, and — since the video index is cached under `jpn101:videoIndex` at 4195/4207 — **~145 KB of video data on every push** into the `SYNC` KV namespace. On the way back, `mergeSnapshots` (1008-1021) will write another device's session token into this device's `localStorage` as a "secondary key" (1018).
- **Value:** smaller/faster saves (the KV value is JSON-of-JSON already), no credential at rest in KV, no cross-device token clobbering.
- **Effort:** S (one `Set` edit + a one-time cleanup that deletes those keys from the cloud snapshot on next push).
- **Where:** `SYNC_SKIP_KEYS` (908). Add `jpn101:session`, `jpn101:userEmail`, `jpn101:syncPending`, `jpn101:lastBackup`, `jpn101:videoIndex`, `jpn101:freqSnapshot`, `jpn101:snapshot` is already there.
- **Risk:** none functional; consider whether `jpn101:retention` *should* sync (it is written with raw `localStorage.setItem` at 1201 so it never triggers a push but rides along on the next one — inconsistent; decide explicitly).
- **Done when:** a captured POST body contains only study data and is < 300 KB.

### QW-4 · Fix the Worker's ISO-8601 duration regex
`cf/src/index.js:234`: `/^P(?:(d+)D)?T(?:(d+)H)?(?:(d+)M)?(?:(d+)S)?$/` — every `d+` is a literal "d". `iso8601ToSeconds("PT5M30S")` returns 0, so `ytDurations` (238-263) never stores a length and feed-resolved items never get a `sec`. The copy in `tools/yt-index.mjs:90-93` is correct (`\d+`), which is why indexed videos *do* have durations. Side effect: the client's "Shorts" filter for feed items falls back to the `#shorts` title tag only (4643).
- **Value:** the "I have 15 minutes" promise holds for the 17 feed-backed sources, not just indexed ones.
- **Effort:** XS. **Where:** `cf/src/index.js:234`. Add a `tools/test-worker.mjs` that imports `iso8601ToSeconds` and `parseFeed` (requires exporting them — see Section 5).
- **Done when:** `/api/feed?src=ci-natural&dur=1` returns items with `sec` once the YouTube Data API is enabled on the project (the commit notes say it 403s today; the fix is still needed for when it is switched on).

### QW-5 · Undo last grade
A mis-tap on "Got it" (or `→` on the keyboard, 1763-1774) permanently advances a card's FSRS state. `recordResult` (1392-1443) is a pure map over `prev`; keeping the previous card object in a ref and restoring it is ~20 lines.
- **Value:** the single most-requested feature in every SRS; protects the scheduler from fat-finger noise that latency grading otherwise trusts.
- **Effort:** S. **Where:** `Study.grade` (1735-1761) — push `{card, queue, pos, passed, firstTry, struggled, combo}` to an undo ref; an "Undo" pill in `tc-progress`; also revert the `logDay` increment (1210-1217).
- **Done when:** `Z` / a pill undoes exactly one grade, including the day log.

### QW-6 · Show the schedule on the back of the card
FSRS is invisible on the card itself. The back shows think-time and accuracy (2002) but not "next review in ~6 days". `intervalFor(S, retentionTarget)` and `fmtIn` (5379-5386) already exist.
- **Value:** "a scheduler you can't inspect is a scheduler you don't trust" (comment at 1623). Cheap trust.
- **Effort:** XS. **Where:** 2002, after flip; compute from `card.fsrs` (or `seedFromHistory`).
- **Done when:** the back reads "⏱ 1.4s · seen 9× · 89% · next in ~6d".

### QW-7 · Kana recognition mode (kana → typed rōmaji, auto-checked)
Kana is write-only and self-graded ("write this kana", 2764). The app already has `kanaToRomaji` (2234-2246) and `canonR` (2247-2253) to normalise typed rōmaji.
- **Value:** reading kana fast is the JPN 101 bottleneck and is objectively gradeable; auto-check gives FSRS a clean latency signal (measured to Enter, not to self-reveal).
- **Effort:** S-M. **Where:** `Kana` gets a `mode: "write" | "read"` chip next to script (2832-2835); in read mode render `cur.ch` large with an input; grade with `canonR(input) === canonR(cur.r)`; stats key `r-h-あ` vs the existing `h-あ` so the two directions keep separate FSRS states (mirrors `fsrs`/`rfsrs` on vocab).
- **Done when:** a 20-kana read session takes < 60 s and populates the chart.

### QW-8 · "Due tomorrow / this week" forecast
`forecast.week` is computed at 1636 (cards due within 7 days) but never displayed; only `fading` is shown (1801).
- **Value:** lets Matthew plan around class days; honest pre-warning before the mascot turns "worried" (`mascotState`, 1244-1249).
- **Effort:** XS. **Where:** add a `tc-stat` in 1792-1802; optionally a 7-bar sparkline bucketed by `fsrs.due`.
- **Done when:** the setup screen shows "34 fading · 61 due this week".

### QW-9 · Learner dashboard from `jpn101:days`
`logDay` (1210-1217) already records per-day `rev/ok/ms/frev/fnew`. Nothing renders it beyond the streak.
- **Value:** reviews/day, accuracy trend, average think time, new-words/day — the "working harder, doing worse" regression in commit 2acc723 would have been visible weeks earlier.
- **Effort:** S. **Where:** a "Stats" panel in Browse "More" (or a new section on the Study setup screen); inline SVG bars; no library.
- **Done when:** 30-day bars for reviews and accuracy render on the phone.

### QW-10 · Coverage tool → "add the unknown words"
The Coverage panel lists words not in the deck (`coverageAgainstDeck`, 4444-4502; rendered 4929-4933) but offers nothing to do with them. With QW-1 in place, a button "add these to the deck" can open `Add` pre-filled with the unknown terms (readings/meanings blank — or filled by the AI endpoint in Section 6).
- **Value:** closes the loop between input and the deck — the thing i+1 is supposed to do.
- **Effort:** S. **Where:** 4929-4933 → `setTab("browse")` with a prefill; `Add.parse` (4071-4088) already tolerates missing columns.
- **Done when:** pasting an NHK Easy paragraph ends with three new cards in the deck.

### QW-11 · Measure actual input minutes
`open()` stores `minutes` = the *planned* time chip (4668), and `evidenceWeight(minutes)` (4341) weights the rating by it. A 60-minute plan abandoned after 3 minutes is recorded as strong evidence.
- **Value:** the level model's evidence weighting becomes honest; the weekly export (4745-4767) becomes a real input diary.
- **Effort:** S. **Where:** the rating card (4773-4790): compute `elapsed = ratedAt - at` when the rating happens on the same day; offer three chips "bailed early / about half / finished" that set `minutes` to `min(planned, elapsed)`-derived values; store both `planned` and `minutes`.
- **Done when:** `history` rows carry `planned` and `minutes`, and `evidenceWeight` uses the latter.

### QW-12 · PWA manifest (no service worker yet)
`index.html` has `apple-mobile-web-app-capable` and a theme colour but no `<link rel="manifest">`, no icons. Android "Add to Home Screen" therefore gives a browser shortcut, not an app.
- **Value:** full-screen app on Android, proper icon, named window; prerequisite for Section 5 offline work.
- **Effort:** XS. **Where:** `cf/public/manifest.webmanifest` + 192/512 PNG icons (the mascot GIF pipeline in `tools/make-mascot.mjs` can rasterise a static frame), one `<link>` in `index.html`.
- **Done when:** Lighthouse "installable" passes.

### QW-13 · Leech controls: suspend / reset / unhide
Leech detection and a mnemonic box exist (`isLeech` 2078-2083; 2003-2015). There is no way to suspend a word that is, e.g., a duplicate, nor to reset a card's history, nor to un-hide an Input source ("Not for me" at 4865 appends to `hidden` forever).
- **Effort:** S. **Where:** Browse row actions (4042-4057): "suspend" sets `c.susp = true` and `smartPool`/`start` filter it; "reset" deletes `fsrs/rfsrs/seen/...`; Input: a "hidden sources" list under the Link panel with unhide.
- **Done when:** a suspended card never appears and is listed under a "Suspended" filter.

### QW-14 · Freq "next reviews in…" uses the pre-FSRS ladder
`Freq.stats.nextIn` (5441) computes `REVIEW_INTERVALS[effLevel(c)] * ease`, i.e. the retired SM-2 ladder, while scheduling itself uses `dueness()`/FSRS. The number shown can disagree with when cards actually come due.
- **Effort:** XS. **Where:** 5441 → `Math.min(...studied.map(c => (c.fsrs || seedFromHistory(c)).due - now))`.

### QW-15 · `dueness()` ignores the chosen retention target
`dueness` (2086-2097) recomputes the interval with `intervalFor(st.S, 0.9)` hard-coded, while `fsrsReview` stores `due` using `retentionTarget` (1418, 2107). With the knob at 85% or 95% (1852-1855), "due" on the setup screen and the stored `due` diverge.
- **Effort:** XS. **Where:** 2092 → use `st.due` when present, else `retentionTarget`.
- **Done when:** setting 95% visibly increases the due count.

### QW-16 · Build stamp from the build, not by hand
`b59` is a string literal at 1459. `tools/build.mjs` can inject `git rev-parse --short HEAD` + date via esbuild `define`.
- **Effort:** XS. Also expose it at `/api/health` (Section 5).

### QW-17 · Export per-card stats (CSV)
Browse "Export" (3950-3953) copies `term/reading/romaji/meaning/emoji` only. A second export with `seen, correct, ms/msN, level, fsrs.S, fsrs.D, fsrs.due, rseen, rcorrect, rfsrs.S` gives Matthew (and anyone analysing the deck) a real dataset.
- **Effort:** XS. **Where:** next to `exportText`.

---

## 2. Core-loop improvements (Study / FSRS)

### 2.1 Append-only review log  — *the enabler*
**Current state.** Each answer mutates per-card aggregates (1422-1438) and a per-day counter (1210-1217). The FSRS state is a single `{S,D,last,due,ivl}` per direction. Nothing records *which* grade happened *when* with *what* prior state. Kana/Drill/Freq do the same (2713-2742, 5066-5087, 5475-5505).

**Proposal.** `jpn101:revlog` — a JSON array of compact rows appended by one helper called from `recordResult`, `Kana.record`, `ConjDrill.grade`, `Freq.grade`:

```js
// [deck, itemId, dir, ts, grade(1-4), ms, S_before, D_before, R_at_review]
["class", c.id, "rec", 1755900000000, 4, 1400, 12.3, 5.1, 0.87]
```
~70 bytes/row; 400 reviews/day (the busiest day in the log was 488) → 28 KB/day, 10 MB/year. Cap at e.g. 60,000 rows client-side (≈ 4 MB in `localStorage` — tight on iOS Safari; prefer IndexedDB for this key, or rotate older rows into monthly chunks that sync once and are dropped locally). Merge rule: union by `(itemId, ts)` exactly like `mergeInput` does for history (986-989); add a `jpn101:revlog` branch to `mergeSnapshots` (1011-1019).

- **Value:** prerequisite for 2.2, 2.8, Section 5 analytics, and honest debugging ("why did this card come back today?").
- **Effort:** M. **Risk:** sync payload growth — sync the log as its own KV key (`g:{sub}:revlog`) rather than inside the single snapshot, with the Worker accepting `POST /api/sync?part=revlog` to append. Keep the main snapshot small.
- **Done when:** every grade in all four decks writes a row; a Browse "Export review log" button downloads CSV; the log survives a two-device merge.

### 2.2 FSRS parameter optimisation
`tools/fsrs.mjs` already accepts a weight vector in every function (`review(state, grade, now, target, w = FSRS_W)`, L97), so per-learner parameters are a one-line plumbing change (`jpn101:fsrsParams` → pass as `w`). What is missing is the data (2.1) and the optimiser.
- **Realistic path:** an offline `tools/fsrs-optimize.mjs` run by the maintainer on the exported log. Options: (a) port the open-spaced-repetition optimiser's loss (log-loss of predicted R vs. observed recall over the log) with simple gradient descent over 17 weights — a few hundred lines, adequate for one learner; (b) shell out to the Python `fsrs-optimizer` package on a CSV export in Anki revlog format (it expects `card_id, review_time, review_rating, review_state, review_duration`). Matthew has ~5,000+ reviews already logged in aggregate; the optimiser wants per-review rows, so it starts paying off ~4-6 weeks after 2.1 ships.
- **Also worth doing first:** the FSRS-4 weights here are the published 2023 defaults. FSRS-5/6 changed the power-law decay (`R = (1 + FACTOR·t/S)^DECAY`, with learnable decay in v6) and added same-day review handling. Upgrading the formulas is a contained change in `tools/fsrs.mjs` covered by `test-fsrs.mjs`; do it with the optimiser so both the model and weights move together.
- **Effort:** M (tool) + S (plumbing). **Done when:** `jpn101:fsrsParams` exists, the Study setup screen shows "personalised on N reviews", and `test-fsrs.mjs` covers the new decay.

### 2.3 Grading: keep two buttons, make latency honest
The commit log makes a careful, data-backed case for two buttons + latency (`gradeFromLatency`, `tools/fsrs.mjs:135-141`). Keep it, but close three holes:
1. **Think time is only captured on flip.** `thinkRef` is set in `flip()` (1545-1550). In Kana/Drill/Write it is set on "Check/Reveal". If the learner reveals with the keyboard instantly and thinks *after* the reveal, latency is 0.3 s and the grade is EASY. Consider measuring to the grade press when `think < 700 ms`, or showing the answer only after a minimum 400 ms "commit" (a common SRS anti-cheat).
2. **No "I knew it but slow" override.** A long-press on "Got it" (or `↓`) that forces HARD would let the learner correct the one case latency mis-reads (interrupted, looked away). Low friction, opt-in.
3. **Production cards**: `recordResult` treats a first production failure as not-a-lapse (1398) — good — but `gradeFromLatency` uses the same 3 s/6 s thresholds for production as for recognition. Production is slower by nature; the 87%/71% split was measured on recognition. Gather production latency stats from the review log (2.1) and set separate thresholds.

### 2.4 Card types the data already supports
- **Audio-first (listening) cards — S.** Front = 🔊 only (`speakJa(card.reading)`, 3394); back = term + meaning. The TTS cache (`cf/src/index.js:154-189`) and pre-warm make this free for seen words. Gate: only for cards with recognition `S ≥ 3 d`. Direction key `lfsrs`. Value: the deck is visual-only today; Matthew's listening level seeds lower than reading for this reason (4370-4373).
- **Typing-answer cards — S.** For production cards (1975-1981) add an optional input: the learner types kana/rōmaji before flipping; `fillMatch` (2254-2265) already grades kana, kanji or rōmaji against `reading/term/romaji`. Gives an objective production grade and a clean latency (to Enter).
- **Cloze / example-sentence cards — M (needs data).** The deck has no example sentences (`SEED` fields: term, reading, romaji, meaning, kind, emoji, lesson, sec, 4× pitch). Sources: (a) SCRIPT_SEED already contains 227 tokenised lines with furigana and English (2947-3351) — a deterministic generator can blank a deck word that appears in a script line (no LLM needed, same idea as `localFill`); (b) LLM-generated sentences via the Section 6 endpoint, precomputed once per card and shipped as `data/examples.json`.
- **Kanji-component cards — L.** 416 unique kanji appear in `SEED` terms (458 incl. FREQ). Would need KANJIDIC2 (readings/meanings; CC BY-SA 4.0 from EDRDG) and RADKFILE/KRADFILE (components). A tools script can emit `data/kanji.json` restricted to those 458 → ~100 KB. UI: "which kanji is this?", component hints, stroke order (Section 4).
- **Reverse (EN→JP) — exists** as interleaved production cards (1583-1602); don't duplicate.

### 2.5 Session shape controls
`SESSION = 16` is fixed (1573); new-card slots 3/5/8 by due pressure (1582); production slots ≤ 4 (1586). Add a session-length chip (10/16/25/40) like Kana's `KANA_LENGTHS` (2571) and a **catch-up mode** when `dueCount > 60`: reviews only, no new, no production, retention temporarily 0.85 for that session (the knob exists, 1199-1202). The mascot already knows when to be "worried" (1247); it should offer the mode.

### 2.6 Daily new-card limit (soft)
The design deliberately never zeroes new words (1567-1568, "class deadlines"). Keep that, but make the *cap* visible and adjustable ("new/day: 8 · 15 · 25 · no limit"), as `Freq` already does with `quota` (5390, 5525-5529). Persist in `jpn101:studyPrefs` (sync it).

### 2.7 Leech handling
What exists: detection (2078-2083), exclusion from smart review (1574), a dedicated session (1835-1839), a mnemonic box (2009-2013). Missing: suspend (QW-13), an automatic hook (Section 6 revives ✨ hook), and a "why is this stuck" view (confusable siblings — with the review log you can find the card most often answered right after this one is missed).

### 2.8 Per-card history view
With 2.1: tapping a Browse row shows its last 20 reviews (grade, latency, S/D over time) as a tiny chart. Effort S once the log exists.

### 2.9 Unify the four session state machines
`Study` (1497-2040), `Kana` (2578-2934), `ConjDrill` (5002-5215) and `Freq` (5388-5599) each re-implement queue/pos/passed/firstTry/struggled/missRef/requeue. A `useSession({items, requeueGap, requeueCap})` hook would cut ~250 lines and make every improvement in this section land in all four decks at once. Effort M; do it alongside the module split (Section 5).

---

## 3. The tailored-input engine (入力)

### 3.1 What exists and how it behaves
- **Level model:** two scalars 0-100 (`levels.listening/reading`, seeded from the deck at 4370-4373), moved per rating by `applyRating` (4345-4362): `Δuser ∈ {+4,+1,-2,-4}` × `evidenceWeight(minutes)` × `learningRate(n) = 1/(1+n/12)`. Items move in the opposite direction, damped by confidence. Bands are `floor(level/17)` (4519). Relative difficulty is shown as 1-4 dots (4522-4528). Unit-tested (36 tests).
- **Catalog:** 23 hand-verified sources (4248-4327) + 955 indexed videos (`data/videos.json`, unpacked at 4216-4239) + user links. `recommend()` (4387-4437) bands by `level±`, prefers sources that resolve to one episode, nudges by tag scores, filters by duration.
- **Ratings** attach to `itemId` = the *source* for feed items and the *video* for indexed ones (4666-4672) — so 955 videos learn individually, channels learn as a whole.
- **Difficulty data:** estimated in `tools/yt-index.mjs:93-127` from channel anchor (blend), description coverage against the deck (`known()`, 63-88 — the same longest-match algorithm as the client), title kanji density, length, kids flag; confidence 0.25-0.7.

### 3.2 Options, ranked by feasibility

| # | Option | Feasibility | Effort | What it buys |
|---|---|---|---|---|
| A | Fix the duration regex (QW-4) | trivial | XS | real lengths for feed items once the Data API is on |
| B | Ship per-video **unknown-word lists** from the index | high — data already computed then discarded | S | pre-teach / post-quiz ("watch with the deck"); better coverage numbers |
| C | Score with a **frequency list**, not only Matthew's deck | high | M | learner-independent difficulty (needed for any second user); better confidence |
| D | **Proper tokeniser in `tools/`** (not the client) | high | M | lemma-level coverage, verb inflection handled properly, speech-rate features |
| E | **Offline caption pipeline** (maintainer-run yt-dlp) | medium — works technically, ToS caveats | L | measured difficulty for ~507 captioned videos; words/min; true coverage |
| F | More reading sources with per-item feeds (Tadoku by level, NHK Easy via mirror exists) | high | S-M | reading side has only 9 sources, 4 with feeds |
| G | Anime/manga with JP subs (Jimaku/Kitsunekko) | low-medium — legal grey, content often N3+ | M | motivation for later; not for JPN 101 |
| H | "Watch with the deck" mode | high after B | M | the feature that makes recommendations *teach* |
| I | Measured session time + input diary (QW-11) | high | S | honest evidence weights, a log worth exporting |
| J | Rating UX & level model refinements | high | S | trust; fewer oscillations |

**B — per-video unknown words.** In `yt-index.mjs`, `known()` returns only `{pct, tokens}`. Return the unmatched tokens (kanji runs + unknown kana words, exactly as the client's `coverageAgainstDeck` collects `unknown`, 4474-4500), keep the top 8 by frequency, and pack them as a tenth field in `yt-pack.mjs` (rows at 81-84). Cost: ~40-60 bytes/video → +50 KB on `videos.json`; acceptable, or lazy-load a second file. Client: `unpackVideos` adds `unknown: [...]`. The recommendation card can then show "3 words you'll meet: 天気・買い物・来週" with an add-to-deck button (QW-10), and the rating card can ask "did you catch 天気?" — a one-tap post-quiz that feeds both the level model and the deck.

**C — frequency-list scoring.** Matthew's 821-word deck is a fine coverage reference *for Matthew*, but it's noisy as a difficulty measure (it includes 預言者 "prophet" and 贖い "atonement" from class context, and is missing はい-level function words that appear in FREQ_SEED only). Add a public frequency resource to `tools/` and score description text by the *rank* of its words: e.g. JMdict priority tags (`ichi1/news1/nfXX`, CC BY-SA 4.0 — verify the EDRDG licence terms before shipping derived data) or a community BCCWJ/anime/Netflix frequency list (check each list's licence; several are CC BY-SA). Output a `freqScore` next to `known` and blend both into `scoreDifficulty`. This also lets `coverageAgainstDeck` report "90% by frequency, 62% by your deck" — two honest numbers.

**D — tokeniser in the pipeline.** The client deliberately avoids kuromoji (comment at 4439-4443, ~15 MB of dictionaries) — correct. But `tools/` runs on Node with no size constraint: `kuromoji` (Apache-2.0, IPADIC) or Sudachi via `sudachipy` in a Python step gives lemmas and parts of speech. Use it to (1) score descriptions by lemma frequency (C), (2) precompute per-video unknown lemmas (B) rather than surface strings, (3) build the deck's own lemma/stem table once at build time so the *client* stays dictionary-free (`coverageAgainstDeck` keeps its longest-match, but `terms` is pre-expanded with real inflections instead of the heuristic `addStem`, 4450-4453, which e.g. turns いい into い only by exclusion and cannot produce 来ない from 来る).

**E — captions, honestly.** The YouTube Data API only returns caption tracks for videos you own; the web player's timedtext endpoint is gated by a proof-of-origin token (as the repo notes). `yt-dlp --write-subs --write-auto-subs --sub-langs ja --skip-download` run *locally by the maintainer* does retrieve caption tracks for most videos today (it integrates PO-token providers; this changes month to month). Two honest caveats: (1) YouTube's ToS prohibits automated access outside the API, so this is a personal-use-risk decision, not something to put in the Worker or in CI; (2) never redistribute caption text — ship only derived numbers (coverage %, words/minute, top unknown lemmas, type-token ratio). With D in place, a `tools/yt-captions.mjs` that reads a local `.vtt` folder and rewrites `difficulty/confidence` for those rows (confidence 0.9) is ~150 lines. For the 507 videos flagged `cc` (human captions, `yt-index.mjs:197`) this would replace the estimate outright; auto-captions are noisier but still better than descriptions. Alternative for uncaptioned videos: local Whisper on the audio — same ToS caveat, much more compute; skip unless E proves valuable.

**F — reading side.** Reading has 9 catalog entries (4297-4326), 4 with feeds. Tadoku's free graded readers are organised by level 0-4 (the catalog has one entry at difficulty 8); each level could be its own item with a per-level PDF index so "Read · 15 min" resolves to *a book*, not a site (verify Tadoku's redistribution terms — I believe the free books are CC BY-NC-ND but confirm before mirroring links or text). NHK Easy via `nhkeasier.com` already resolves to articles (Worker `FEEDS["rd-nhkeasier"]`). Both Yomujp and Watanoc have feeds already. Podcasts with published transcripts (several CI channels publish scripts on their sites/Patreon — verify per source) would give the listening side a coverage number without touching YouTube.

**H — "watch with the deck".** After B: recommendation card → "Preview 5 words" (deck words expected + unknown words) → open → rating card gains "which of these did you catch?" chips → correct ones get a recognition review logged (they were retrieved in context — arguably better evidence than a flashcard), missed ones are offered to the deck. This is the feature that makes the Input tab *teach* rather than *point*.

### 3.3 Rating UX and level-model refinements (J)
- The four verdicts (4333-4338) are good. Add an optional "how much did you understand?" slider (25/50/75/90%) that maps to the verdict and also to `evidenceWeight`; students find "percent understood" easier than "too hard" (which feels like a confession).
- Show Δlevel after a rating ("Listening 23 → 24") — the model is invisible today (the bar at 4796 moves silently), and invisible models get argued with.
- `band()` is linear in 17-point steps (4519) over a scale whose comment says 0-15 absolute-beginner CI, 15-30 N5, 30-45 N4… (4170-4171). Make the band table explicit (`[0,15,30,45,60,75]`) so labels agree with the scale the difficulties were authored on.
- `learningRate` decays by rating count forever (4343). After ~60 ratings a genuine level jump (end of semester) moves 0.17/rating. Floor it at ~0.25 or re-open it when recent verdicts are consistently one-sided (4 of 5 "too easy").
- Cold-start for a new learner is `5 + known/40` (4372) — tuned to Matthew. With C in place, seed from the deck's *frequency coverage* instead of card count.
- "Not for me" (4865) is permanent with no UI to undo (QW-13).
- Custom links (4719-4731) default to `medium: video` for listening and never get duration; allow choosing audio/video and an optional minutes field.

---

## 4. Content & data

### 4.1 Deck schema
Today: `term, reading, romaji, meaning, kind, emoji, lesson (1-54), sec (scene like "4-4", or a date like "7/30"), pitch (5 cards)`. Sections and Acts are derived by regex from `sec` (2153-2176). Proposed additions, all optional and backward-compatible:

| Field | Why | Source |
|---|---|---|
| `pos` (n/v-ichidan/v-godan/i-adj/na-adj/expr/particle/counter) | drives ConjDrill automatically (CONJ_BANK is 33 hand-entered words, 4124-4163), filters, production hints | hand-tag 821 once (an LLM batch can propose; review) |
| `act`, `scene` as explicit ints | stop parsing `sec`; Dry Runs and sorting get simpler (1664-1676, 2168-2176) | derive once from `sec` |
| `ex: [{ja, tokens, en}]` | cloze cards, context on the back | SCRIPT_SEED lines that contain the term; LLM batch (Section 6) |
| `pitch` for all cards | shown when `showPitch` (2001) but only 5 cards have it | OJAD or a pitch dictionary (licence check); LLM is *not* reliable for pitch |
| `kanji: [{k, on, kun, meaning}]` | kanji cards; Write hints | KANJIDIC2 subset |
| `audio` | not needed — TTS cache covers it | — |
| `tags` | "religious register", "classroom", "counter" … | hand |

**One trap to fix first:** the seed re-merge at 1331-1342 `Object.assign`s only `reading, romaji, meaning, kind, emoji, pitch, lesson` — `sec` is not refreshed, and any new field you add to SEED will not reach existing decks unless added to that list. Make it data-driven (`SEED_FIELDS = [...]`) and cover it with a test.

### 4.2 Importing
- **CSV/TSV** — `Add` handles it (QW-1). Document the column order in the UI (it does, 4093-4097).
- **Anki** — don't parse `.apkg` in the browser (SQLite in a zip). Accept Anki's *Notes in Plain Text* export (TSV) via `Add`; map fields by header. If progress import is wanted, the Anki revlog → `jpn101:revlog` (2.1) mapping is straightforward offline in `tools/`.
- **Google Sheets** — a published-to-web CSV URL is fetchable server-side; add `/api/import?sheet=<id>` in the Worker with an **allowlist of sheet IDs in an env var** (never a free URL — the same open-proxy reasoning as `FEEDS`, `cf/src/index.js:192-197`). Client pastes into `Add`.
- **Jisho lookup for missing readings/meanings** — jisho.org's `api/v1/search/words` is unofficial and has no CORS; proxy via the Worker with caching and a per-user cap, or use the AI endpoint (Section 6) which is more robust for readings of compound words.

### 4.3 Example sentences at scale
Precompute, don't generate on demand: an admin script (`tools/gen-examples.mjs`, runs with `ADMIN_WARM_TOKEN` like the TTS pre-warm) asks the AI endpoint for 2 sentences per card constrained to words *earlier in the deck* (lesson ≤ card.lesson), validates them with `coverageAgainstDeck` (must be ≥ 90% covered by the deck up to that lesson), and writes `data/examples.json` (821 × 2 × ~120 bytes ≈ 200 KB; ship as a separate asset like `videos.json`). Tatoeba (CC BY 2.0 FR) is a free non-LLM alternative, but its sentences rarely stay inside a JPN 101 vocabulary; the coverage filter will reject most.

### 4.4 Grammar points tab tied to NihonGO NOW! chapters
Structure: `GRAMMAR_SEED = [{act, scene, id, title, pattern, explanation, examples:[...], drill: {type, ...}}]`. Drill types that need no LLM: (a) **particle fill** — SCRIPT_SEED lines already carry tokens; blank は/が/を/に/で/と/へ/も/の and grade by exact match (a `localFill` sibling; see 2308-2326); (b) **conjugation** — `conjugate()` (4961-4988) covers the 2×2×2 grid but **has no て-form**, which NihonGO NOW! needs for 〜ています (it appears in SCRIPT_SEED at 3260-3261) and 〜てください (`聞いて` is a SEED card at line 56). Add て-form (godan 音便 rows are already in `GODAN_ROWS`, 4956-4960: the て-form is the た-form with た→て/だ→で), then たい, volitional, potential later. (c) **counters** — a small table (〜つ, 〜人, 〜枚, 〜本, 〜時/分) with a generated "how do you say 3 people" drill; the irregular readings (ひとり/ふたり, さんぼん) are the whole point. (d) **keigo** — later; not JPN 101.

### 4.5 Kanji writing and handwriting recognition
- **Stroke order:** KanjiVG (CC BY-SA 3.0) provides one SVG per kanji with numbered strokes. Restrict to the 458 kanji in the app → ~1-2 MB raw, ~300 KB gzipped, shippable as a separate asset. Render as an animated ghost on the Write canvas (3786) — the `guide` toggle already exists.
- **Handwriting recognition:** (a) *Kana* — feasible on-device: 143 classes, a few-hundred-KB CNN in TF.js, or a stroke-direction matcher against KanjiVG kana strokes (Kana has SVGs there too). (b) *Kanji* — Google Input Tools' handwriting endpoint (`inputtools.google.com/request?itc=ja-t-i0-handwrit`) works and is widely used but is undocumented and unsupported; if used, proxy it through the Worker with a per-user cap and expect it to break. On-device kanji recognition (Zinnia/Tomoe models ≈ 10+ MB) is too heavy for this app. Recommendation: auto-check kana, keep kanji self-graded with stroke-order hints.

---

## 5. Platform & infrastructure

### 5.1 PWA / offline
- Manifest (QW-12) first. Then a service worker that precaches `index.html` + `videos.json` + the manifest, serves TTS `/api/tts?text=…` cache-first (responses already carry `cache-control: public, max-age=31536000, immutable`, `cf/src/index.js:163`), and uses network-first for `/api/sync` and `/api/feed`. The single-file architecture makes the cache trivial (one 536 KB file), but **stale-HTML** is the classic failure: version the SW by the build stamp (QW-16) and show an "update available" pill.
- Offline study already works (localStorage + pending-sync flag, 1111-1167); the SW only adds *cold-start* offline.

### 5.2 Reminders
Web Push needs a subscription store (KV key per user) and a scheduled Worker (Cron Triggers are available on the free plan) to send "34 fading" at a chosen hour via VAPID — feasible, ~1 day; iOS requires the app to be installed to the Home Screen (16.4+). A lower-tech alternative that works everywhere: the weekly email note (Section 6.7) via Cloudflare Email Sending. Do the PWA first; push second.

### 5.3 Split the 6,084-line file (keep the build)
`tools/build.mjs` already bundles with esbuild (entry `JpnFlashcards.jsx`, 47-58); the split is purely about source layout. Suggested first cut, lowest risk first:

```
src/lib/fsrs.mjs            (move tools/fsrs.mjs; keep re-export for tests)
src/lib/kana.js             KANA_MAP, YOON_MAP, kanaToRomaji, canonR, fillMatch, norm   (2210-2265)
src/lib/conjugate.js        GODAN_ROWS, conjugate, CONJ_FORMS                            (4954-4999)
src/lib/input-engine.js     INPUT_VERDICTS…coverageAgainstDeck                           (4333-4502)
src/lib/sync.js             sGet/sSet, merge*, push/pull, session                         (863-1183)
src/lib/tts.js              speakJa & friends                                              (3352-3450)
src/data/seed.js, scripts.js, freq.js, conj-bank.js, input-catalog.js, section-map.js
src/ui/Study.jsx, Kana.jsx, Scripts.jsx, Write.jsx, Browse.jsx, Add.jsx, Input.jsx, ConjDrill.jsx, Freq.jsx, App.jsx
src/styles.css              (the CSS template string 5601-6082; esbuild can import .css as text or inject)
```
Immediate payoff: `tools/test-input-engine.mjs` stops extracting functions by scanning the source text with a hand-written brace matcher (12-40) and just `import`s them. Effort M (mechanical), risk low with the byte-identical build check as the regression test.

### 5.4 TypeScript
Not a priority; the payoff is in the data shapes (card, fsrs state, input state). Start with `// @ts-check` + JSDoc typedefs on `src/lib/*` after the split; esbuild strips types for free if you later rename to `.ts`.

### 5.5 Tests worth adding (beyond the 68 that exist)
1. `mergeDeck/mergeDays/mergeScripts/mergeInput/mergeSnapshots` (937-1021) — the sync race fixes in the log were verified by hand; a table of two-device scenarios would lock them in.
2. `conjugate()` — commit 1eaa12c says it reproduced all 33 hand-written negatives; that check should be a test file (`CONJ_BANK[i].negR === conjugate(reading,type).plain.presNeg`).
3. `parseFeed`, `iso8601ToSeconds`, `unent` in the Worker (needs exporting them; `export default` stays). QW-4 would have been caught.
4. `verifySession`/`signSession` round-trip + tamper cases (the commit says tools verified byte-identical tokens vs node:crypto — the test isn't in the repo).
5. `kanaToRomaji`/`canonR`/`fillMatch` — small tables.
6. `smartPool` composition — given a synthetic deck, assert new/review/production slot counts and that production cards are never adjacent (the "verified alternating" claim in 4dcefd8).
7. `recommend()` — already partially covered; add duration filtering and `hidden`.

### 5.6 CI
`.github/workflows/ci.yml`: `npm ci` in `tools/`, run both tests, `node tools/build.mjs`, then `git diff --exit-code index.html` (fails the PR if someone edited the JSX without rebuilding — today nothing prevents that; the log shows a blank-page incident caused by a build-path problem, 90cf825). On `main`, `cloudflare/wrangler-action` with `CLOUDFLARE_API_TOKEN` to deploy `cf/`. Effort S.

### 5.7 Observability
- `/api/health` → `{ok, build, kvSync: bool, kvTts: bool, secrets: {session, tts, admin, ai}}` with no secret values. XS.
- Client error reporting: `window.onerror`/`unhandledrejection` → `POST /api/log` (auth'd, 20/day/user cap, stored in KV with 7-day TTL, or Workers Analytics Engine which is free-tier friendly). S.
- Worker: `console.log` structured lines + `wrangler tail` is adequate for one user; add `[observability] enabled = true` in `wrangler.toml`.

### 5.8 Backup / export / import of KV
- Scheduled Worker (cron, daily) that copies `g:{sub}` → `bak:{sub}:{yyyy-mm-dd}` with a 30-day `expirationTtl` — a server-side safety net for the "Clear all" button (4002-4008) and for merge bugs. XS-S.
- `tools/kv-backup.mjs` using `wrangler kv key list/get` for an offline copy. XS.

### 5.9 Multi-user readiness (friends / classmates)
What already works: per-user keys `g:{sub}` (`cf/src/index.js:135`), Google-verified sessions, client-side merge. What needs to change:
1. **Remove the anonymous sync-code path** (`code:` keys, 136-138; client 905-925, 1100). It lets anyone POST arbitrary JSON into KV with no auth — an easy way to burn the 1,000 writes/day free quota.
2. **Allowlist or invite**: `ALLOWED_EMAILS` env var (or an `invite:` KV key) checked in the exchange handler (117-126) so strangers who find the URL can't consume TTS/AI budget.
3. **Per-user quotas**: TTS generation is gated only on "signed in" (179-181); add `tts:{sub}:{date}` counters (e.g. 300 new clips/day) and the same for AI.
4. **Decks per user**: `SEED` is Matthew's JPN 101 vocabulary baked into the bundle. A classmate in the same course is fine; anyone else needs "deck packs" — the `tangocho-pack` restore format (3859-3880) is already halfway there; serve packs from `cf/public/packs/*.json` and let the first-run screen choose.
5. **Cost on Cloudflare free tier (as I understand the limits; verify on the dashboard):** Workers 100k requests/day; KV 100k reads, **1k writes**, 1k deletes/day, 1 GB. Writes are the binding constraint: each debounced save is one KV write; a 16-card session produces roughly 5-15 writes → a daily-active user costs ~20-40 writes/day → **~25-40 users** before the free write cap. Mitigations in order of effort: raise the debounce to 8-10 s (the `pagehide` keepalive flush already protects against tab-close loss, 1164-1166); write the review log (2.1) separately and less often; or move sync to **D1** (free tier ~100k row writes/day) or a **Durable Object per user** (now on the free plan) which also gives you server-side merge and an end to the client-side race concerns. Google TTS: Neural2 is ~$16 per 1M characters; the whole deck + scripts is on the order of 10-20k characters ≈ $0.30, and the KV cache makes it one-time. Workers paid plan ($5/mo) lifts KV to 1M writes/day if this ever matters.

### 5.10 Analytics dashboard for the learner
With `jpn101:days` (now) and the review log (2.1): reviews/day, accuracy, think-time trend, words crossing S ≥ 7 d ("solid"), retention curve (predicted vs observed recall by elapsed-days bucket — the one chart that tells you whether FSRS is calibrated), hours of input by week and medium (from `jpn101:input.history`), words/week added. All computable client-side; no backend.

---

## 6. LLM-powered features

### 6.0 Current state (important)
`callClaude` (`JpnFlashcards.jsx:2180-2203`) sends `{model: "claude-sonnet-4-6", max_tokens: 1000, messages}` to `https://api.anthropic.com/v1/messages` **from the browser with only a `Content-Type` header** — no `x-api-key`, no `anthropic-version`, and no CORS opt-in header. The request can never succeed. Consequences today:
- ✨ hook (1510-1524) → "Couldn't reach the AI"; hooks cache `jpn101:hooks` stays empty.
- Post-session coach debrief (1725-1733) → error branch (1927-1929).
- `Sentences` tab → would fall back to `localFill/localTrans` — but the component isn't even mounted (no `sentences` tab at 1464), so its 140 lines and the three prompts are dead twice over.
- Scripts "Build rehearsal" → `localBuild` (3516-3530): saved "without furigana", with an error message telling Matthew to "tell Claude the exact message" (3562).
- The UI copy still promises the feature ("Claude builds a sentence from your own vocabulary", 2426; "Claude adds furigana, rōmaji, and a translation", 3603).

Never put the key in the browser. The fix is a Worker endpoint.

### 6.1 Endpoint design: `POST /api/ai`
```
POST /api/ai
Authorization: Bearer <tangocho session>          // verifySession() as for sync/TTS
{ "task": "hook" | "debrief" | "sentence" | "grade" | "annotate" | "explain" | "rewrite" | "weekly" | "chat",
  "input": { ...task-specific, size-capped... },
  "v": 1 }                                         // prompt-template version, part of the cache key
→ 200 { "result": <schema-typed JSON>, "cached": true|false, "model": "...", "remaining": 47 }
→ 401 no session · 403 not on allowlist · 413 input too large · 429 daily cap · 502 upstream
```
Worker internals (~150-200 lines in `cf/src/index.js`, or a new `cf/src/ai.js`):
1. **Auth + allowlist** via the existing `verifySession` (53-66) and Section 5.9 item 2.
2. **Task allowlist**: prompts live in the Worker; the client sends *data*, never a prompt string. This is the single most important abuse guard — it makes the endpoint useless as a general LLM proxy.
3. **Input caps**: `JSON.stringify(input).length ≤ 4,000` (chat: ≤ 12,000), arrays truncated server-side.
4. **Cache**: `ai:v{v}:{task}:{sha256(canonical JSON input)}` in KV (the `sha256Hex` helper at 150-153 exists), with `expirationTtl` per task (hooks/annotations: none; sentences: none — they are reusable; grading: 7 d; weekly: none, keyed by ISO week). Same-card hooks are requested once ever.
5. **Quotas**: `ai:q:{sub}:{yyyy-mm-dd}` counter (KV `put` with `expirationTtl: 86400`), e.g. 80 calls/day/user, plus a global `ai:q:all:{date}` ceiling (e.g. 600). Return `remaining` so the UI can grey out.
6. **Model per task** (first-party API pricing per the Claude API reference, cached 2026-06-24): **Haiku 4.5 (`claude-haiku-4-5`, $1/$5 per MTok)** for hook, debrief, grade, explain, annotate; **Sonnet 5 (`claude-sonnet-5`, $3/$15; intro $2/$10 through 2026-08-31)** for sentence generation, rewrite, chat; **Opus 5 (`claude-opus-5`, $5/$25)** for the weekly note. (Note: the task brief listed `claude-haiku-4-5-20251001`; per the current model table the ID is `claude-haiku-4-5` — don't append a date suffix.)
7. **Request shape** (raw HTTP is fine in a dependency-free Worker; the `@anthropic-ai/sdk` also runs on Workers since wrangler bundles npm deps — use it if you add any other dependency):
   ```js
   const r = await fetch("https://api.anthropic.com/v1/messages", {
     method: "POST",
     headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
     body: JSON.stringify({
       model, max_tokens,                       // 512-2048 for these short tasks; the 16k default guidance is for open-ended work
       system: SYSTEM[task],                    // the tutor persona + level constraints, stable text first (cacheable prefix)
       messages: [{ role: "user", content: userText }],
       output_config: { format: { type: "json_schema", schema: SCHEMA[task] } },   // structured outputs: Haiku 4.5, Sonnet 5, Opus 5 all support it
     }),
     signal: AbortSignal.timeout(30000),
   });
   const data = await r.json();
   if (data.stop_reason === "refusal") …;       // guard before reading content
   const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
   ```
   Structured outputs remove the `parseJSON` prose-stripping hack (2204-2209) and the "no markdown" pleading in every prompt. Schemas must use `additionalProperties: false` and no min/max constraints. Put the key in with `wrangler secret put ANTHROPIC_API_KEY` (the `wrangler.toml` comment at the bottom already documents the secret convention).
8. **Prompt caching**: the per-task `system` text is short (< 1,024 tokens), so caching won't engage — don't bother. For `chat` with a long script context it might; mark the script block with `cache_control` if turns get long.
9. **Batch precompute** for hooks/examples: the Message Batches API runs at 50% cost — run `tools/gen-hooks.mjs` once for all 821 cards (admin token path like TTS pre-warm, 180) and ship the results as `data/hooks.json`; the live endpoint then only serves words added later.

### 6.2 Per-feature designs and costs
Token estimates are rough; costs use the first-party prices above.

| Feature | Model | ~tokens in/out | ~$/call | Prompt design (system / user / schema) | Cache key |
|---|---|---|---|---|---|
| **Hook** (revives `hookPrompt`, 3453) | Haiku 4.5 | 180 / 80 | $0.0006 | system: "JPN101 tutor, NihonGO NOW!, keyword-mnemonic technique, ≤2 sentences, contrast a confusable sibling if one exists at this level"; user: term/reading/romaji/meaning + 3 nearest deck words by reading (cheap confusables); schema `{hook: string, confusable?: string}` | term+meaning |
| **Debrief** (`debriefPrompt`, 3456) | Haiku 4.5 | 250 / 120 | $0.0009 | user: ≤5 missed cards with think times + 3 passed cards; schema `{pairs: [{a,b,why}], hook: {term, text}, tip: string}` — render as chips, not a paragraph | sorted missed terms |
| **Sentence generation** (revives `fillPrompt/transPrompt`, 2269-2289, level-aware) | Sonnet 5 | 500 / 250 | $0.005 | user: 12 *known* words (recognition S ≥ 7 d) + 1 target word + allowed grammar (from the Grammar tab's act list, 4.4) + "≤ 10 words"; schema = the existing token format `{tokens:[{t,r?}], fullTokens, answer, reading, romaji, translation, hint}`; validate server-side with the same longest-match coverage (port `coverageAgainstDeck`) and **reject/retry if < 90% covered** | target + sorted known list |
| **Grade a typed translation** (`gradePrompt`, 2291) | Haiku 4.5 | 220 / 100 | $0.0007 | schema `{rating: "correct"\|"close"\|"off", feedback, corrected}`; also return `errors: [{type: particle\|conjugation\|vocab\|politeness}]` to feed the Grammar tab | english+model+answer |
| **Explain a failed card** (new) | Haiku 4.5 | 300 / 200 | $0.0013 | user: the card + the last 5 review outcomes + the 2 cards most often confused (from the review log) ; schema `{why: string, contrast: [{term, meaning, tell}], try: string}` | term + confusables |
| **Script annotation** (`scriptPrompt`, 2937) | Haiku 4.5 | 600 / 900 (whole dialogue) | $0.005 | drop the 3-line chunking (3532-3550) that existed because of `max_tokens: 1000`; `max_tokens: 4000`; schema = `{lines:[{speaker,tokens,romaji,en}]}`; validate token concatenation equals the input line | sha of raw |
| **Conversation practice in Scripts** (new) | Sonnet 5 | 1,500 / 150 per turn, ~10 turns | ~$0.07/session | system: "You are {speaker B} in this NihonGO NOW! scene; stay inside this vocabulary list; ≤ 2 sentences; if the learner's line has an error, continue naturally and put a one-line correction in `note`"; stateless — client sends the transcript each turn; schema `{reply_tokens:[…], reply_en, note?}`; TTS the reply via the existing cache | none (cap 10 turns/session, 3 sessions/day) |
| **i+1 article rewrite** (new) | Sonnet 5 | 1,000 / 600 | $0.012 | Worker fetches the article only from allowlisted hosts (`nhkeasier.com`, `yomujp.com`, `watanoc.com`) — same reasoning as `FEEDS`; user: article text + the learner's known-word list (top 400 by S) + level band; schema `{title, paragraphs:[{tokens:[{t,r?}], en}], new_words:[{term, reading, meaning}]}`; show coverage before/after. Copyright: personal-use paraphrase shown once, **cache at most 24 h and never store article text long-term** | url+date |
| **Weekly "what to study next"** (new) | Opus 5 | 3,000 / 600 | $0.03/week | input: 7-day aggregates only (days log, fading count by section, leech list, input minutes by medium, level deltas) — no raw text; schema `{headline, wins:[…], focus:[{what, why, action}], input_pick: string}`; optionally email it (Cloudflare Email Sending) | ISO week |

Monthly cost for one learner using everything daily: roughly $3-6, dominated by sentence generation and chat; hooks/annotations are one-time. A hard cap of 80 calls/day/user bounds the worst case at well under $1/day even on Sonnet.

### 6.3 Client changes
Replace `callClaude(prompt)` with `callAI(task, input)` that POSTs to `/api/ai` with the session header (reuse `syncRequestOptions`, 1093-1101), shows `remaining` when < 10, and keeps the existing local fallbacks for offline. Mount `Sentences` (or fold fill/translate into Study as card types — 2.4) once the endpoint exists; otherwise delete it (Section 7).

### 6.4 Abuse/safety summary
Session-gated · allowlisted emails · tasks not prompts · input size caps · per-user and global daily caps · KV cache · 30 s timeout · `stop_reason === "refusal"` handled · no PII sent (only vocab and aggregates; the email is never included) · key only in a Worker secret · `/api/health` reports `ai: configured` without the value.

---

## 7. Things to remove or simplify

| Item | Where | Why | Action |
|---|---|---|---|
| `Sentences` component + `fillPrompt/transPrompt/gradePrompt/localFill/localTrans/pickTarget/NOUN_SET` | 2269-2342, 2354-2493 | never mounted (tab list at 1464); all call paths dead | keep only if Section 6 ships within a month; else delete (keep `tc-sent*` CSS — Scripts uses 13 of those classes) |
| `Add` component | 4067-4107 | never mounted | mount (QW-1) or delete |
| Sync-code path | client 905-925, 1100; Worker `cf/src/index.js:136-138` | superseded by Google sign-in (2afa8d5); server side accepts unauthenticated writes | delete both; return 401 when no bearer |
| Sync snapshot junk keys | `SYNC_SKIP_KEYS` 908 | pushes session token + 145 KB video cache every save | QW-3 |
| `/.netlify/functions/*` constants | 906, 3352, 4181; Worker aliases 364-366 | Netlify is a 301 redirect now (`netlify.toml`) | switch client to `/api/*`; keep Worker aliases one more release, then drop |
| `netlify/functions/sync.mjs`, `tts.mjs` | 1-line minified bundles | orphaned backend; `netlify.toml` redirects everything | delete the folder; keep `netlify.toml` only while the Netlify site exists |
| `jpn101:oralAttempts` | 1283, 3842, 3886 | Oral tab removed in 07120db | drop from backup/restore; one-time delete from storage |
| `window.storage` branches | 871-895, 1299-1303 | Claude-artifact sandbox API; never present on the deployed site | delete; simplify `sGet/sSet` to localStorage + mem |
| Pre-FSRS scheduler remnants: `REVIEW_INTERVALS`, `ease`, `level` deltas, `effLevel`, `weakness()` (unused), `coverage` (1560, unused except as a stale dep at 1719) | 2042-2097, 1405-1407, 1421 | FSRS is the schedule; `level` still drives "solid"/mastery UI and Browse meters | phase 1: remove `weakness`, `coverage`; phase 2: derive "solid" from `S ≥ 7 d` and retire `level/ease` once the review log exists |
| Hard-coded `b59` | 1459 | stale by construction | QW-16 |
| Two identical canvas pads | Kana 2672-2711, Write 3719-3762 | duplicate | `DrawPad` component |
| Four session state machines | Study/Kana/Conj/Freq | duplicate | `useSession` (2.9) |
| `liveRef` aria-live region | 1528, 2037 | never written to | either announce card/grade or remove |
| `forecast.week` | 1636 | computed, unused | QW-8 |
| `INPUT_CATALOG` channel entries that are also indexed channels (e.g. `ci-natural`, `ci-tanaka`, `ci-peppa`, `ci-shun`) | 4250-4263 vs `data/videos.json` channels | a channel-level item and its 45 indexed videos compete for the same three slots | keep channel entries only for non-indexed sources, or mark them `indexedBy` so `recommend()` dedupes |
| `jpn101:hooks` | 1513-1521 | empty forever while AI is dead | lives again with Section 6 |
| `mascot.js` `waiting` state | `MASCOT_GIFS.waiting` fallback at 1251 | `mascotState` never returns `waiting` (1244-1249) | fine as a fallback; or remove 0.5 KB |

---

## Prioritised roadmap

### Now (next 2-3 weeks; mostly S efforts, highest value per hour)
1. **Worker AI endpoint** (6.1) with hook + debrief + annotate on Haiku 4.5; delete browser-direct `callClaude`. *Rationale:* five shipped-but-dead features come alive; the UI already promises them.
2. **QW-3 sync junk keys, QW-4 duration regex, QW-15 dueness/retention, QW-14 Freq nextIn** — four one-line fixes.
3. **Review log (2.1)** — the enabler for everything in Section 2 and 5.10.
4. **QW-1 Add, QW-5 Undo, QW-6 schedule on card, QW-8 week forecast, QW-2 section fading.**
5. **CI (5.6) + /api/health (5.7)** — prevents the "edited JSX, forgot to build" class of incident.
6. **Remove sync-code path + allowlist (5.9 #1-2)** before sharing the URL with anyone.

### Next (1-2 months)
7. **Per-video unknown words from the index (3.2-B) + "watch with the deck" (3.2-H) + measured minutes (QW-11).**
8. **Audio-first and typing-answer cards (2.4), session length + catch-up mode (2.5), kana read mode (QW-7).**
9. **Sentence generation + grading via the endpoint (6.2)** with the coverage validator; mount fill/translate as Study card types.
10. **Module split (5.3) + `useSession` (2.9) + the test backlog (5.5).**
11. **Grammar tab v1 (4.4): て-form in `conjugate()`, particle fill from SCRIPT_SEED, counters.**
12. **PWA manifest (QW-12) then service worker (5.1).**

### Later (semester 2+)
13. **Frequency-list scoring + tokeniser in tools (3.2-C/D); offline caption pipeline (3.2-E) if the maintainer accepts the ToS trade-off.**
14. **FSRS optimiser + FSRS-5/6 formulas (2.2)** once ~4-6 weeks of review log exist.
15. **Kanji cards + KanjiVG stroke order (2.4/4.5); kana handwriting auto-check.**
16. **Conversation practice, i+1 rewrite, weekly note (6.2); Web Push (5.2).**
17. **Multi-user: deck packs, D1 or Durable Object sync, per-user quotas (5.9).**

### If you only do three things
1. Ship `/api/ai` and wire hook/debrief/annotate — the prompts and UI exist; only the transport is missing.
2. Add the append-only review log and show the FSRS forecast on cards and section chips.
3. Fix the duration regex and sync-key leak, and ship per-video unknown-word lists so Input can pre-teach and post-quiz.

---

## Summary table

| # | Opportunity | Value | Effort | Priority |
|---|---|---|---|---|
| QW-1 | Mount the `Add` form | add words from the phone | S | Now |
| QW-2 | Per-section fading count | target the right section before class | S | Now |
| QW-3 | Stop syncing session token + video cache | smaller saves, no credential in KV | S | Now |
| QW-4 | Fix Worker ISO-8601 regex | real durations for feed items | XS | Now |
| QW-5 | Undo last grade | protects the scheduler from mis-taps | S | Now |
| QW-6 | Show "next in ~Nd" on the card | trust in FSRS | XS | Now |
| QW-7 | Kana read mode (typed rōmaji) | objective, fast kana reading drill | S-M | Next |
| QW-8 | Due-this-week forecast | planning | XS | Now |
| QW-9 | Days-log dashboard | catch regressions early | S | Next |
| QW-10 | Coverage → add unknown words | input feeds the deck | S | Next |
| QW-11 | Measure actual input minutes | honest evidence weights | S | Next |
| QW-12 | PWA manifest | installable | XS | Next |
| QW-13 | Suspend / reset / unhide | control | S | Next |
| QW-14 | Freq nextIn via FSRS | correctness | XS | Now |
| QW-15 | dueness honours retention target | correctness | XS | Now |
| QW-16 | Build stamp from git | hygiene | XS | Now |
| QW-17 | Per-card stats CSV | data | XS | Next |
| 2.1 | Append-only review log | enables optimiser, history, analytics | M | Now |
| 2.2 | FSRS optimiser + FSRS-5/6 | better schedule | M | Later |
| 2.3 | Latency grading hardening | cleaner grades | S | Next |
| 2.4 | Audio-first / typing / cloze / kanji cards | listening & production | S–L | Next/Later |
| 2.5 | Session length + catch-up mode | sustainable review debt | S | Next |
| 2.6 | Soft daily new-card cap | sustainable intake | S | Next |
| 2.8 | Per-card history view | insight | S | Later |
| 2.9 | `useSession` hook | −250 lines, consistency | M | Next |
| 3.2-B | Per-video unknown words | pre-teach / post-quiz | S | Next |
| 3.2-C | Frequency-list difficulty | learner-independent difficulty | M | Later |
| 3.2-D | Tokeniser in tools | lemma-level coverage | M | Later |
| 3.2-E | Offline caption pipeline | measured difficulty (ToS caveat) | L | Later |
| 3.2-F | Tadoku by level, more feeds | reading side depth | S-M | Next |
| 3.2-H | "Watch with the deck" | recommendations that teach | M | Next |
| 3.3 | Rating UX / level model tweaks | trust, stability | S | Next |
| 4.1 | Deck schema (pos, ex, kanji) + fix re-seed field list | content depth | M | Next |
| 4.2 | Anki TSV / Sheets / Jisho import | content intake | S-M | Later |
| 4.3 | Precomputed example sentences | context on cards | M | Later |
| 4.4 | Grammar tab (て-form, particles, counters) | course alignment | M | Next |
| 4.5 | KanjiVG stroke order; kana auto-check | writing | M-L | Later |
| 5.1 | Service worker offline | cold-start offline | M | Next |
| 5.2 | Web Push reminders | retention habit | M | Later |
| 5.3 | Module split | maintainability, real tests | M | Next |
| 5.5 | Test backlog | safety | S-M | Next |
| 5.6 | CI: test + build + sync check + deploy | prevents stale builds | S | Now |
| 5.7 | /api/health, error log | observability | S | Now |
| 5.8 | KV daily backup | safety net | XS-S | Next |
| 5.9 | Multi-user: remove code path, allowlist, quotas, packs, D1/DO | share with classmates | M-L | Now (1-2) / Later (rest) |
| 5.10 | Analytics dashboard | learner insight | S-M | Later |
| 6.1 | `/api/ai` endpoint | revives 5 features | M | Now |
| 6.2 | Sentences, grading, explain, chat, rewrite, weekly | tutoring layer | S-M each | Next/Later |
| 7 | Dead code removal | clarity, security | S | Now |
