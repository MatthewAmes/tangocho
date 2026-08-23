# TODO-230 — Tests (node:test): `conjugate()` table (the 33 negatives + euphonic pasts + irregulars) and kana helpers (`kanaToRomaji`, `canonR`, `fillMatch`, kana tables)

**Priority:** P2   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 7.2 (`conjugate()` untested — "33 hand-authored negatives and 5 euphonic pasts" verified by hand in `1eaa12c` and not kept), § 7.4; 05-expansion § 5.5 items 2, 5; 01-functionality § 6.1, § 6.2
**Depends on:** TODO-222   **Blocks:** none

## Why
`conjugate()` is pure, correct on every case tried by the reviewers, and covered by **no** test — the hand checks from commit `1eaa12c` were thrown away. A 30-line table test keeps them forever and protects the て-form extension Theme B wants. `kanaToRomaji`/`canonR` have known quirks (ファ→"fua", sokuon collapsed) that only matter if Sentences/kana-read mode is revived — pinning them now means that revival starts from a test file, not a guess. The kana tables themselves (46 base, dakuten, yōon, marks, extended) can be asserted for completeness.

## Current behaviour (verified)
- `conjugate(reading, type)` `JpnFlashcards.jsx:4961-4989` (moved to `src/lib/conjugate.js` by TODO-222) returns the 2×2×2 grid; `GODAN_ROWS` L4956-4960; `CONJ_FORMS` L4990-5001 (8 ids incl. `p-pn`); `CONJ_BANK` (data, 33 words with `negR` hand answers — verify field name by reading `src/data/conj-bank.js`); `type:"irregular"` with a dict other than する/くる/ある falls through to the godan branch (report 01 § 6.1).
- Verified by reviewers (report 01 Appendix A): かえる⑤ かえります/かえりません/かえりました/かえりませんでした | かえる/かえらない/かえった/かえらなかった; いく→いった; およぐ→およいだ; しぬ→しんだ; あう→あわない/あった; いい→よくないです/よかったです/よくなかったです, plain よくない/よかった/よくなかった; くる→きます/きません/きました/きませんでした | くる/こない/きた/こなかった; ある→ない/あった/なかった.
- `kanaToRomaji` L2234-2246, `canonR` L2247-2253, `fillMatch` L2254-2265 (`src/lib/kana.js` after 222): きって→"kitte", canonR→"kite"; ファ→"fua"; ヴィ→"i"; ティ→"tei"; コーヒー→"koohii"→"kohi"; を→"o".
- Kana tables `src/data/kana-tables.js` (rows + `KANA_GROUPS`): base 46, dakuten/handakuten, yōon combos, marks (っ, ー …), extended katakana.

## Intended behaviour
`test/conjugate.test.mjs` and `test/kana.test.mjs` under `node --test`.

## Implementation steps
1. `test/conjugate.test.mjs`:
   ```js
   import { test } from "node:test"; import assert from "node:assert/strict";
   import { conjugate, CONJ_FORMS } from "../src/lib/conjugate.js";
   import { CONJ_BANK } from "../src/data/conj-bank.js";
   const cases = [
     ["かえる", "godan",    { polite: ["かえります","かえりません","かえりました","かえりませんでした"], plain: ["かえる","かえらない","かえった","かえらなかった"] }],
     ["いく",   "godan",    { plain: ["いく","いかない","いった","いかなかった"] }],
     ["およぐ", "godan",    { plain: ["およぐ","およがない","およいだ","およがなかった"] }],
     ["しぬ",   "godan",    { plain: ["しぬ","しなない","しんだ","しななかった"] }],
     ["あう",   "godan",    { plain: ["あう","あわない","あった","あわなかった"] }],
     ["たべる", "ichidan",  { polite: ["たべます","たべません","たべました","たべませんでした"], plain: ["たべる","たべない","たべた","たべなかった"] }],
     ["いい",   "i-adj",    { polite: ["いいです","よくないです","よかったです","よくなかったです"], plain: ["いい","よくない","よかった","よくなかった"] }],
     ["たかい", "i-adj",    { plain: ["たかい","たかくない","たかかった","たかくなかった"] }],
     ["きれい", "na-adj",   { plain: ["きれいだ","きれいじゃない","きれいだった","きれいじゃなかった"] }],   // verify exact current output for the な-adj/noun plain-present cell and adjust
     ["する",   "irregular",{ polite: ["します","しません","しました","しませんでした"], plain: ["する","しない","した","しなかった"] }],
     ["くる",   "irregular",{ polite: ["きます","きません","きました","きませんでした"], plain: ["くる","こない","きた","こなかった"] }],
     ["ある",   "irregular",{ plain: ["ある","ない","あった","なかった"] }],
   ];
   ```
   Map the 4-tuples onto the actual return shape of `conjugate()` (read the function: it may return `{ polite: { pres, presNeg, past, pastNeg }, plain: {...} }` or keyed by `CONJ_FORMS[i].id` — adapt the accessor, don't change the function). Then a bank test: `for (const w of CONJ_BANK) assert.equal(conjugate(w.reading, w.type).<plain negative>, w.<hand-authored negative field>)` — the field names come from `conj-bank.js` (the commit says 33 negatives). Finally pin the irregular fall-through: `conjugate("いく", "irregular")` currently returns godan output — assert current and mark `// KNOWN-BUG report 01 § 6.1` (fix = `return null`, Theme B).
2. `test/kana.test.mjs`: `kanaToRomaji`: あ→a, きゃ→kya, きって→kitte, コーヒー→koohii, を→o, ファ→"fua" (KNOWN-LIMIT), ティ→"tei" (KNOWN-LIMIT); `canonR`: "kitte"→"kite" (KNOWN-LIMIT: sokuon collapsed), "ō"→"o", "wo"→"o"; `fillMatch({reading:"がっこう", answer:"学校", romaji:"gakkou"}, "gakko")` → true, kanji answer → true, wrong → false. Tables: base hiragana row count × columns = 46 unique chars; every katakana in the table has a hiragana counterpart except the extended group; `KANA_GROUPS` keys are exactly the documented set (read them; assert the array of keys).
3. Add both to `npm test` (automatic via `node --test test/`).

## Data migration / compatibility
none

## Testing & verification
- `node --test test/conjugate.test.mjs test/kana.test.mjs` → pass; deliberately break `GODAN_ROWS` (swap two entries) → the table fails; revert.
- Count: ≥ 12 conjugation cases + 33 bank rows + ≥ 10 kana assertions.

## Acceptance criteria
- [ ] Conjugation table test covers all verb classes, い/な-adj, irregulars and the 音便 pasts; bank negatives asserted.
- [ ] Kana helper quirks pinned with KNOWN-LIMIT markers; table completeness asserted.
- [ ] Runs in `npm test`/CI.

## Pitfalls / notes
- Read `conjugate()`'s actual return shape before writing accessors; keep the fixture strings in kana exactly as the drill displays them.
- If Theme B deletes `kanaToRomaji` with Sentences, drop `test/kana.test.mjs`'s helper section but keep the table tests (kana tables stay).
