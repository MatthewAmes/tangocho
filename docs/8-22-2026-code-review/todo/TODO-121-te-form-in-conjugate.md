# TODO-121 — Add て-form (and たい) to `conjugate()`, a drill form for it, an explicit `null` for unknown irregulars, and a table test

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §4.3 ("Extend Drill to te-form"), §4.4 Drill row, §7 item 10; 05-expansion §4.4 (b); 01-functionality §6.1 (irregular falls into godan); 06-architecture §7.2 (`conjugate()` untested)
**Depends on:** none   **Blocks:** TODO-115 (uses the same て/た rules for deck expansion — soft)

## Why
NihonGO NOW! reaches 〜ています / 〜てください in the scope the deck already covers (SCRIPT_SEED has 〜ています lines; `聞いて` is a SEED card, L56). The drill computes the 2×2×2 grid but has no て-form; the て-form is the た-form with た→て / だ→で, so it is ~6 lines given `GODAN_ROWS`. Also `type: "irregular"` with a dictionary form other than する/くる/ある silently falls through to the godan branch and returns a conjugation of whatever the last kana is. And the 33 hand-authored negatives in `CONJ_BANK` were verified by hand once (commit 1eaa12c) but never kept as a test.

## Current behaviour (verified)
- `GODAN_ROWS` L4956–4960: `"う": ["い","わ","った"] … "く": ["き","か","いた"], "ぐ": ["ぎ","が","いだ"], "す": ["し","さ","した"]`.
- `conjugate(dict, type)` L4961–4988: returns `F(...)` with `formal/plain × presPos/presNeg/pastPos/pastNeg`; irregular branch L4973–4977 has no fallthrough return; godan L4982–4987 with `past = dict === "いく" ? "った" : ta`.
- `CONJ_FORMS` L4990–4999: 8 cells; ConjDrill `items` L5031–5042 builds `(word × form)` from `c[f.pol][f.key]`; `toggleForm` default fallback `"p-pn"` (L5092).
- `CONJ_BANK` L4124–4163: each entry has `neg`/`negR`; い-adj/な entries too.
- `tools/test-fsrs.mjs`/`test-input-engine.mjs` exist; no conjugation test.

## Intended behaviour
- `conjugate()` returns an extra `te` string (dictionary-form-agnostic: `食べて`, `行って`, `泳いで`, `死んで`, `して`, `きて`, `あって`; い-adj `高くて`, `いい→よくて`; な/noun `好きで`) and `tai` for verbs only (`食べたい`, `行きたい`, `したい`, `きたい`; null for adjectives/nouns). Shape: `{ formal, plain, te, tai }`.
- Unknown irregular → `return null` (ConjDrill already skips `null` at L5035).
- New drill forms: `{ id: "p-te", pol: "te", key: null, chip: "て", ask: "て-form" }` and `{ id: "p-tai", … ask: "want to (〜たい)" }`; `items` reads `f.pol === "te" ? c.te : f.pol === "tai" ? c.tai : c[f.pol][f.key]` and skips items whose answer is null. Rule text in `CONJ_TYPES` gets a て line per type.
- `tools/test-conjugate.mjs`: table test over the 33 `CONJ_BANK` negatives (`conjugate(w.reading, w.type).plain.presNeg === w.negR`), the five 音便 pasts, て-forms for one verb per godan row + exceptions, and `conjugate("いう", "irregular") === null`.

## Implementation steps
1. `conjugate()` (L4961–4988):
   ```js
   const teOf = (past) => past.replace(/た$/, "て").replace(/だ$/, "で");
   if (type === "iadj") { const s = …; const R = F(…); R.te = s + "くて"; R.tai = null; return R; }
   if (type === "na")   { const R = F(…); R.te = dict + "で"; R.tai = null; return R; }
   if (type === "irregular") {
     if (dict === "する") { const R = F(…); R.te = "して"; R.tai = "したい"; return R; }
     if (dict === "くる") { const R = F(…); R.te = "きて"; R.tai = "きたい"; return R; }
     if (dict === "ある") { const R = F(…); R.te = "あって"; R.tai = null; return R; }
     return null;                                   // unknown irregular: say so rather than guessing a godan ending
   }
   if (type === "ichidan") { const s = dict.slice(0, -1); const R = F(…); R.te = s + "て"; R.tai = s + "たい"; return R; }
   const g = GODAN_ROWS[dict.slice(-1)]; if (!g) return null;
   const stem = dict.slice(0, -1), [i, a, ta] = g;
   const past = dict === "いく" ? "った" : ta;
   const R = F(…); R.te = stem + teOf(past); R.tai = stem + i + "たい"; return R;
   ```
   (Keep `F` as is; attach `te`/`tai` after.)
2. `CONJ_FORMS` (L4990–4999): append the two forms; `CONJ_TYPES` rules (L4117–4123) append ": て-form = た-form with た→て" per type (short).
3. ConjDrill `items` (L5031–5042): `const ans = f.pol === "te" ? c.te : f.pol === "tai" ? c.tai : c[f.pol][f.key]; if (ans) out.push({ id: w.reading + "|" + f.id, w, f, answer: ans });`. Setup chips (L5190–5198) render automatically from `CONJ_FORMS`; the "all 8" toggle label (L5197) → "all {CONJ_FORMS.length}".
4. Optional content: add three verbs the te-form makes interesting to `CONJ_BANK` (`泳ぐ/およぐ`, `死ぬ/しぬ`, `話す/はなす`) with `neg/negR/polite/how` filled by hand — keeps the "33 negatives validated" claim extendable.
5. `tools/test-conjugate.mjs` — `conjugate`, `GODAN_ROWS`, `CONJ_BANK` are not importable; slice them with the `grab()` pattern from `tools/test-input-engine.mjs` (`grab("GODAN_ROWS","const")`, `grab("conjugate","function")`, `grab("CONJ_BANK","const")`). Assertions:
   - every `CONJ_BANK` entry: `conjugate(w.reading, w.type).plain.presNeg === w.negR`;
   - pasts: `いく→いった`, `およぐ→およいだ`, `しぬ→しんだ`, `あう→あった`, `はなす→はなした`;
   - te: `たべる→たべて`, `いく→いって`, `およぐ→およいで`, `しぬ→しんで`, `まつ→まって`, `する→して`, `くる→きて`, `たかい→たかくて`, `いい→よくて`, `すき→すきで`;
   - tai: `いく→いきたい`, `たべる→たべたい`, `くる→きたい`, `たかい→null`;
   - `conjugate("いう", "irregular") === null`.
6. Register the new test in TODO-211's root `package.json` `npm test` / TODO-213's CI once they exist; TODO-222 later replaces the text-slicing with a real import from `src/lib/conjugate.js`.

## Data migration / compatibility
`jpn101:conj` stats are keyed `reading|formId` (L5038); new form ids simply add new keys. None otherwise.

## Testing & verification
- `node tools/test-conjugate.mjs` → all pass.
- Drill setup shows 10 form chips; a session with only "て-form" selected asks `食べる → ?` and reveals `たべて`.
- Build + deploy.

## Acceptance criteria
- [ ] `conjugate()` returns `te` and `tai`; unknown irregular returns `null`.
- [ ] Drill offers て-form and 〜たい cells; items with null answers are skipped.
- [ ] Table test covers all CONJ_BANK negatives, 音便 pasts, て/たい forms.

## Pitfalls / notes
- `conjugate` is called with `w.reading` (kana), so outputs are kana; the card front shows `w.dict` (kanji) — consistent with existing cells.
- 05 §4.4 also lists counters and particle fill (TODO-123) for a Grammar tab; keep this item to conjugation.
- Rebuild `index.html` and deploy.
