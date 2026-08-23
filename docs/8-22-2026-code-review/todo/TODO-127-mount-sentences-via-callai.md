# TODO-127 — Mount the `Sentences` component (fill-in-the-blank / translate) on `/api/ai` with the local fallback; record results into the deck

**Priority:** P2   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §1 item 5, §2.3, §4.4 Sentences row, §5 item 4 (no context), §7 item 5 ("If proxied, mount Sentences — it is the only context/production-in-context feature"); 05-expansion §6.3, §7 table row 1 ("keep only if Section 6 ships within a month; else delete"); 06-architecture §4.8 (dead chain incl. `kanaToRomaji/canonR/fillMatch`)
**Depends on:** TODO-125, TODO-126   **Blocks:** none

## Decision
**Mount it** (recommended by 02 and conditionally by 05), as a mode inside an existing tab rather than a ninth tab: put "Sentences" behind a segmented chip in the **Write** tab ("Handwrite · Sentences") — both are production practice — so the tab bar does not grow (03-ux L-4 says 8 tabs already wrap). If TODO-125/126 slip by more than a month, Theme C's dead-code item deletes it instead; do not leave it half-wired.

## Why
The component is fully written (144 lines), with well-designed prompts (token-level furigana, N5 constraint, grading rubric), local fallbacks (`localFill`/`localTrans`), and it is the only feature that puts vocabulary in context and asks for production in context — the L2 vocabulary research consistently favours meeting words in varied contexts. It is dead only because `callClaude` cannot reach Anthropic and the tab is not in the list.

## Current behaviour (verified)
- `Sentences({ cards, onResult })` L2354–2493: `generate` L2366–2380 (`callClaude(fillPrompt|transPrompt)` → `parseJSON`; fallback `localFill/localTrans` with `offline: true`), `checkFill` L2384–2390 (`fillMatch` → `onResult(card.id, ok)`), `skipFill` L2392–2397, `checkTranslate` L2399–2408 (`callClaude(gradePrompt)`), render L2414–2492.
- Not in the tab list (L1464) nor the render switch (L1472–1490). Helper chain L2210–2342 (`norm`, `KANA_MAP`, `YOON_MAP`, `kataToHira`, `kanaToRomaji`, `canonR`, `fillMatch`, `vocabList`, prompts, `NOUN_SET`, `shortMeaning`, `pickTarget`, `localFill`, `localTrans`).
- 01 §6.2: `kanaToRomaji` mishandles extended katakana (ファ→"fua", ヴィ→"i", ティ→"tei"); `canonR` collapses doubled letters (きって→"kite") and `ou/oo` — both only matter here.
- CSS `tc-sent*` classes exist (L5935–5961) and are shared with Scripts.

## Intended behaviour
- Write tab gets a top chip row `Handwrite · Sentences`; `Sentences` renders with `cards` and `onResult`.
- `generate`: `callAI("sentence", { target, known })` where `target = pickTarget(cards)` (weak/unseen-first as today) and `known` = up to 12 cards with recognition `S >= 7` (`recallUnlocked`, L2066) plus the target; result schema from TODO-125 matches `ex` fields (`tokens, fullTokens, answer, reading, romaji, translation, hint`). Fallback to `localFill`/`localTrans` on `AIError` (shows the existing "Offline practice" note with the error's message).
- Translate mode: generation needs a `translate` schema — reuse `sentence` by asking the Worker for `fullTokens`/`translation` and presenting the English as the prompt (`english = translation`, `model = lineText(fullTokens)`, `modelTokens = fullTokens`, `reading`, `romaji`); grading via `callAI("grade", {english, model, answer})`.
- Results: fill-in correct/incorrect → `onResult(card.id, ok, "prod", think)` — it is production in context; "I don't know" → `onResult(card.id, false, "prod")`. Measure `think` from sentence shown → Check.
- `canonR`/`kanaToRomaji` fixes: keep sokuon doubling (do not collapse `(.)\1+`; instead normalise long vowels `ou→o`, `oo→o`, `uu→u` consistently on both sides) and add extended katakana to `YOON_MAP` (ファ fa, フィ fi, フェ fe, フォ fo, ティ ti, ディ di, ヴァ va, ヴィ vi, ヴ vu, ヴェ ve, ヴォ vo, ウィ wi, ウェ we, ウォ wo, シェ she, ジェ je, チェ che, トゥ tu, ドゥ du).

## Implementation steps
1. Write tab (L3708): add `const [mode, setMode] = useState("write")`; render a `tc-kanaseg` with two `tc-fchip`s above the eyebrow; when `mode === "sentences"` return `<Sentences cards={cards} onResult={onResult} />`.
2. `Sentences.generate` (L2366–2380): replace the `callClaude` line with
   ```js
   const target = pickTarget(cards);
   const known = cards.filter((c) => c.id !== target.id && recallUnlocked(c)).slice(0, 12).map((c) => ({ term: c.term, reading: c.reading, meaning: c.meaning }));
   const { result } = await callAI("sentence", { target: { term: target.term, reading: target.reading, meaning: target.meaning }, known: [...known, { term: target.term, reading: target.reading, meaning: target.meaning }] });
   setEx(mode === "fill" ? result : { english: result.translation, model: lineText(result.fullTokens), modelTokens: result.fullTokens, reading: result.reading, romaji: result.romaji, notes: result.hint });
   ```
   (`lineText` L3450 hoists.) Keep the catch → local fallback; set `setError` only when both fail.
3. `checkTranslate` (L2399–2408): `const { result } = await callAI("grade", { english: ex.english, model: ex.model, answer }); setResult(result);`.
4. `checkFill`/`skipFill` (L2384–2397): add `"prod"` and think time: `onResult(card.id, ok, "prod", Date.now() - shownRef.current)` with a `shownRef` set when `ex` changes.
5. `fillPrompt/transPrompt/gradePrompt/vocabList` → delete (Worker owns prompts). `parseJSON` → delete if unreferenced after TODO-126.
6. `canonR` (L2247–2253): remove `.replace(/(.)\1+/g, "$1")`; add `.replace(/oo/g, "o").replace(/uu/g, "u")` (ou→o already present; `wo→o` keep). `YOON_MAP` (L2227–2232): add the extended katakana entries as hiragana keys via `kataToHira` (e.g. `ふぁ:"fa"`, `てぃ:"ti"`, `う゛ぁ`… — note `kataToHira` maps ヴ (U+30F4) to ゔ (U+3094); add `ゔ:"vu"`, `ゔぁ:"va"`, `ゔぃ:"vi"`, `ゔぇ:"ve"`, `ゔぉ:"vo"`).
7. Tests: `tools/test-kana.mjs` slicing `KANA_MAP/YOON_MAP/kataToHira/kanaToRomaji/canonR/fillMatch`: `kanaToRomaji("きって") === "kitte"`, `canonR("kitte") !== canonR("kite")`, `kanaToRomaji("ファ") === "fa"`, `kanaToRomaji("ティ") === "ti"`, `canonR("Tōkyō") === canonR("toukyou")`, `fillMatch({romaji:"neko", reading:"ねこ", answer:"猫"}, "NEKO")` true.

## Data migration / compatibility
None. No new keys.

## Testing & verification
- Write → Sentences → Generate (signed in) → a sentence with a blank and furigana; Check with kana/kanji/romaji all accepted; the target card's `rseen` increments.
- Offline/not signed in → local fallback with the note.
- `node tools/test-kana.mjs`.
- Build + deploy.

## Acceptance criteria
- [ ] Sentences reachable from the Write tab; fill and translate modes work via `/api/ai`, fall back locally otherwise.
- [ ] Results recorded as production reviews.
- [ ] `kanaToRomaji`/`canonR` handle sokuon and extended katakana; tests added.

## Pitfalls / notes
- Sentence generation is the most expensive task (Sonnet); cached by `(target, sorted known list)` on the Worker, so repeated generates for the same target+vocab are free — vary `target` via `pickTarget` randomness (L2303–2307) as today.
- 03-ux flagged light-theme remnants in `tc-sent*` CSS (`.tc-sentbig` dark-on-dark, `.tc-sentresult.ok` 3.3:1) — Theme C fixes colours; check legibility once mounted.
- Rebuild `index.html` and deploy.
