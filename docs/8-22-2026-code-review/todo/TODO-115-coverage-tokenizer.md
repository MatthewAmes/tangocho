# TODO-115 — Fix `coverageAgainstDeck`'s kana-run-after-known-word hole and use a better segmenter (particle/copula stoplist + dictionary longest-match)

**Priority:** P1   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §1 item 4, §4.1 "Does the coverage tool measure comprehensibility meaningfully?", §7 item 3; 05-expansion §3.2-D (tokeniser in tools), QW-10; 01-functionality §5 (coverage tests pass but miss the case)
**Depends on:** none   **Blocks:** TODO-118/119 (pipeline unknown-word lists reuse the same algorithm), TODO-123 (particle-fill needs the particle list)

## Why
Rule 1 of the coverage tokenizer counts *any* unmatched kana run immediately after a known word as "covered" (it is treated as okurigana/particle/copula). Verified with the real function (report 02): `これはペンです` against a deck containing only `これ` → **100 %**, no unknowns; `私はとても` with `[私]` → 100 %; `猫がすきです` with `[猫]` → 100 %. Beginner text — the only text this learner reads — is mostly kana, so the measure is systematically optimistic exactly where it matters, and "not in your deck" omits kana vocabulary after known words. The same algorithm in `tools/yt-index.mjs` (`known()`, L63–84) makes the index's description-coverage signal optimistic too.

## Current behaviour (verified)
- `coverageAgainstDeck(text, cards)` L4444–4502. Stems L4450–4453 (`addStem`); `longest(i)` L4461–4464; main loop L4475–4497; the hole is L4481–4488:
  ```js
  if (!isKanji(ch)) {                                // unmatched kana run
    let j = i; while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;
    if (j === i) j = i + 1;
    total++;
    if (afterMatch) covered++;                       // inflection of a word you know
    else unknown.set(text.slice(i, j), …);
    i = j; afterMatch = false; continue;
  }
  ```
- `tools/yt-index.mjs` `known()` L63–84 duplicates the loop; `scoreDifficulty` L93–128 blends `implied` from `k.pct`.
- Tests: `tools/test-input-engine.mjs` "inflection after a known word…" (`勉強しました` → 100 %), "a particle after a known word doesn't count against you" (`私は`), "an unknown kanji word absorbs its okurigana", "a realistic sentence scores in a believable range" (gap is 難 only).

## Intended behaviour
A pragmatic segmenter, no dictionary download:
1. **Function-word stoplist** (not counted in `total` at all — they are grammar, not vocabulary): particles `は が を に の と へ で も か ね よ から まで より や し ば`, copula/aux `です でした ます ました ません ませんでした だ だった じゃ ない なかった たい て で た`, and common okurigana endings `しました しています している した して ます ました` when directly after a known stem. Implement as a small Set `FUNCTION_WORDS` matched longest-first at the *start* of an unmatched kana run.
2. **Inflection rule tightened**: after a known word, a following kana run is absorbed only as far as the longest match of `FUNCTION_WORDS` at that position (repeat while it keeps matching — `勉強 + し + ました`); the remainder of the run is **tokenised by longest-match against the deck** (terms + readings + stems), and anything left is an unknown kana word (surfaced in `unknown`).
3. Deck-side: pre-expand inflections instead of the `addStem` heuristic — for ichidan/godan dictionary forms produce the い-row stem (ます-stem), ない-stem and て/た forms using the same `GODAN_ROWS` table `conjugate()` uses (L4956–4960), so `来ない`/`食べて`/`行った` match their dictionary cards. Keep `addStem` as a fallback for unknown `pos`.
4. Port the same function to `tools/yt-index.mjs` (or better, move the segmenter to a tiny shared module `tools/segment.mjs` that both the JSX build and the index script import — esbuild bundles it; `test-input-engine.mjs` can then import it directly instead of slicing).

Expected results (new tests): `これはペンです` vs `[これ]` → 50 % with unknown `ペン`; `猫がすきです` vs `[猫]` → 50 %, unknown `すき`; `私はとても` vs `[私]` → 50 %, unknown `とても`; all existing tests still pass (`勉強しました` → 100 %, `私は` → 100 %, `難しかったですが` → one gap `難`, `東京大学` → 50 %, `面白かったです` vs `[面白い]` → 100 %).

## Implementation steps
1. Create `tools/segment.mjs` exporting `FUNCTION_WORDS`, `expandDeckTerms(cards)` (returns a `Set` of surface forms), and `coverage(text, termSet)` returning `{ pct, unknown, tokens }` — the loop from L4475–4497 rewritten:
   ```js
   if (!isKanji(ch)) {
     let j = i;
     if (afterMatch) { let f; while ((f = longestIn(FUNCTION_WORDS, text, j))) j += f; }   // absorb grammar after a known word
     if (j > i) { i = j; afterMatch = true; continue; }                                      // pure grammar: not vocabulary, not counted
     let f = longestIn(FUNCTION_WORDS, text, i);                                             // grammar at sentence start (e.g. でも)
     if (f) { i += f; afterMatch = false; continue; }
     // unknown kana word: extend until the next deck match or function word or non-kana
     j = i + 1; while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j) && !longestIn(FUNCTION_WORDS, text, j)) j++;
     total++; unknown.set(text.slice(i, j), …); i = j; afterMatch = false; continue;
   }
   ```
   `longestIn(set, text, i)` = length of the longest member of `set` that `text.startsWith` at `i`, max length 8. Note `です/ます/ました` etc. come via `FUNCTION_WORDS` so `勉強しました` is `勉強` + `し` + `ました` → covered 1/1.
2. `expandDeckTerms(cards)`: for each card add `term`, `reading`; if `c.pos` (TODO-122) or a heuristic says verb (`term` ends in る/う-row kana and `kind !== "katakana"`), add ます-stem, ない-stem, て/た forms via `GODAN_ROWS`; for い-adjectives (`pos === "i-adj"` or ends in い and meaning looks adjectival — skip the heuristic, rely on `pos` or `addStem`) add stem. Keep `addStem`.
3. In `JpnFlashcards.jsx`, `import { coverage as segCoverage, expandDeckTerms } from "./tools/segment.mjs";` and make `coverageAgainstDeck(text, cards)` a thin wrapper (`segCoverage(text, expandDeckTerms(cards))`) so all call sites (L4733 Coverage panel; future TODO-119) are unchanged. Memoise `expandDeckTerms(cards)` in `Input` (`useMemo` on `cards`).
4. `tools/yt-index.mjs`: replace `known()` (L63–84) with `coverage(jaText, DECK_SET)` from `tools/segment.mjs` (DECK_SET built once from the regex-scraped terms at L49–55 via `expandDeckTerms`); keep the `total >= 8` guard.
5. Tests: `tools/test-input-engine.mjs` — switch the coverage block to `import { coverage, expandDeckTerms } from "./segment.mjs"` (remove `coverageAgainstDeck` from the `grab` list) and add the expected results listed above plus: `食べて` vs `[食べる]` → 100 %; `来ない` vs `[来る]` → 100 % (reading `くる`→`こない` is irregular: add explicit irregular forms for する/くる in `expandDeckTerms`).
6. Copy in the Coverage panel (L4935–4939) unchanged; the numbers become honest.

## Data migration / compatibility
None for the app. `data/videos.json` difficulties will shift slightly on the next index refresh (descriptions now score lower coverage → `implied` difficulty up a bit); note it in `tools/REFRESH-VIDEO-INDEX.md`'s expected-numbers section when re-running.

## Testing & verification
- `node tools/test-input-engine.mjs` (all old + new).
- Run `docs/8-22-2026-code-review/scripts/sim-input.mjs` coverage block: the four edge cases print 50 % with the kana unknown surfaced; the "simple paragraph vs full SEED" line stays plausible (≥ 80 %).
- `node tools/build.mjs` succeeds (esbuild resolves `./tools/segment.mjs`, same as `./tools/fsrs.mjs`).
- Build + deploy.

## Acceptance criteria
- [ ] `これはペンです` vs `[これ]` → 50 % and `ペン` listed as unknown (and the other three edge cases).
- [ ] All pre-existing coverage tests still pass.
- [ ] Inflected verb forms (て/た/ない/ます) of deck verbs are recognised.
- [ ] One shared segmenter module used by the app and `tools/yt-index.mjs`.

## Pitfalls / notes
- Do not add kuromoji/TinySegmenter to the client (the comment at L4439–4443 is right about size); TinySegmenter in `tools/` only is acceptable later (05 §3.2-D).
- `FUNCTION_WORDS` must not contain deck-worthy words the course teaches as vocabulary (e.g. `たい` is fine; `から` "because/from" is taught as a particle — keep it in the list).
- `esbuild` bundling `tools/segment.mjs` into the app mirrors `tools/fsrs.mjs`; `tools/check-feeds.mjs` unaffected.
- Rebuild `index.html` and deploy.
