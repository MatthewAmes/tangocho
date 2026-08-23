# TODO-205 — Accessibility: fix `lang` (en UI / ja content), add labels and input types to every form control

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 5 A-1 (High), A-4 (High), § 1 V-4 (Low); § Prioritised fix list #6
**Depends on:** none   **Blocks:** TODO-220 (labels/ids should exist before tabs move)

## Why
`<html lang="ja">` on a UI that is ~95% English makes screen readers read "Reveal answer" with a Japanese voice, makes Chrome offer to translate the English UI, and changes English line-breaking. Meanwhile none of the actual Japanese (term, reading, kana cells, furigana, conjugation answers) is marked `lang="ja"`, so correct CJK glyph/font selection is luck. There is not a single `<label>` in the file; every input is placeholder-only, which vanishes on focus and is not a label for assistive tech.

## Current behaviour (verified)
- `index.html:2` `<html lang="ja">`. `grep -c 'lang=' JpnFlashcards.jsx` → 0.
- `<label` count in JSX: 1 — and that one is inside the `scriptPrompt` string (L2944 `"speaker":"<label>"`), not markup.
- Inputs (all placeholder-only): mnemonic `.tc-mnin` L2011; Scripts name `input.tc-sentinput` L3595 + textarea L3596; Browse search `.tc-search` L3988 (no `type="search"`); restore `textarea.tc-restorebox` L4015; Input log `.tc-sentinput` L4895; link URL L4913 (no `type="url"`); link title L4914; coverage `textarea.tc-inarea` L4923; (dead) Add textarea L4098; (dead) Sentences inputs L2440, L2470.
- Japanese containers without `lang`: `.tc-term` L1985, `.tc-reading-front` L1986, `.tc-romaji` (pitch marks) L2001, `.tc-kanach` L2880, `.tc-sentjp` L3644, `.tc-conjanswer` L5118, `.tc-rowterm`/`.tc-rowread` L4044-4045, `.tc-writeanswer` L3801, `.tc-incover` L4932, `.tc-kindchip` L1984, `Bi` small L4510, `.tc-wordmark` L1459.
- `.tc-jp` (L5623) defines a JP font stack but is never used; JP stacks are instead repeated per class (`.tc-term` L5738, `.tc-reading` L5744, `.tc-kanach` L5855, `.tc-sentjp` L5945, `.tc-conjanswer` L6011, `.tc-wordmark` L5635, `.tc-rowterm` L5786, `.tc-writeanswer` L5979, `.tc-incover` L6070, `.tc-kanaweakch`, `.kn-ghost`, `.tc-ghost`, `.tc-wsword`).

## Intended behaviour
`<html lang="en">`; every element whose text content is Japanese carries `lang="ja"`; one `:lang(ja)` rule supplies the JP font stack (per-class stacks can stay for now and be removed in TODO-228); every input has an accessible name (visible `<label>` where it helps, `.tc-sr` label or `aria-label` elsewhere), a sensible `type`/`inputMode`, and Japanese inputs have `lang="ja" autoCapitalize="off" autoCorrect="off" spellCheck={false}`.

## Implementation steps
1. `index.html:2` → `<html lang="en">`. (The build splices only the `<script>`; the head is hand-edited, so this is safe and persists.)
2. Add to CSS (near `.tc-jp` L5623):
   ```css
   .tc-root :lang(ja){font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",Meiryo,sans-serif;}
   .tc-root :lang(ja).tc-romaji,.tc-root :lang(ja).tc-kanar{font-family:"Hiragino Sans","Noto Sans JP",var(--mono);}  /* pitch marks ⸢⸣ need a JP face in front of the mono stack */
   ```
   Delete the unused `.tc-jp` rule.
3. Add `lang="ja"` to: `.tc-term` (L1985, L5112, L5574), `.tc-reading-front` (L1986, L1999, L5113, L5575), `.tc-prodanswer` (L1995), `.tc-kindchip` (L1984 — only when the label is Japanese; the Freq chip mixes `#rank` + JP, wrap the JP part in `<span lang="ja">`), `.tc-kanach` (L2880), `.tc-kanaprompt` when it shows kana (`cur.r` is rōmaji — leave), `.kn-ghost` (L2767), `.tc-sentjp` (L3644), `.tc-conjanswer` (L5118), `.tc-rowterm` and `.tc-rowread` first child (L4044-4045; the `<em>` rōmaji stays un-tagged), `.tc-writeanswer` (L3801), `.tc-ghost` (L3785), `.tc-incover` (L4932), `.tc-wordmark` text node (wrap `単語帳` in `<span lang="ja">`), `.tc-seal` (L1457, decorative — already `aria-hidden`; add `lang="ja"` for font selection), `.tc-kanaweakch` (L2919).
   Split `Bi` (L4510): `const Bi = ({ en, ja }) => <span className="tc-bi">{en}<small lang="ja">{ja}</small></span>;`.
4. Labels — pattern: visible label where there is room, otherwise `.tc-sr`:
   ```jsx
   <label className="tc-sr" htmlFor="tc-search">Search words</label>
   <input id="tc-search" type="search" className="tc-search" placeholder="Search words…" autoComplete="off" … />
   ```
   Apply: Browse search (L3988, `type="search"`); mnemonic (L2011: `aria-label="Memory hook for this word"`, `lang="ja"` not needed — hooks are English); Scripts name (L3595 `aria-label="Script name"`), Scripts textarea (L3596 `aria-label="Dialogue text"`, `lang="ja"`, `autoCapitalize="off" autoCorrect="off" spellCheck={false}`); restore textarea (L4015 `aria-label="Backup JSON"`); Input log (L4895 `aria-label="What did you watch or read?"`); link URL (L4913 `type="url" inputMode="url" autoCapitalize="off" aria-label="Link URL"`); link title (L4914 `aria-label="Link title (optional)"`); coverage textarea (L4923 `aria-label="Japanese text to check" lang="ja"`). The two dead components (Add/Sentences) are Theme B's decision — label them only if they are mounted.
5. Rebuild.

## Data migration / compatibility
none

## Testing & verification
- Local server → in the in-app browser run:
  `document.documentElement.lang === 'en'`; `document.querySelectorAll('[lang="ja"]').length > 0` on Study card, Kana chart, Scripts rehearse, Browse, Drill back face, Write reveal; `[...document.querySelectorAll('input,textarea')].every(i => i.labels?.length || i.getAttribute('aria-label'))` → true on every tab.
- VoiceOver (Mac/iPhone): "Reveal answer" reads with the English voice; `感謝します` reads with a Japanese voice.
- Visual: no font change on English copy; Japanese glyphs identical (the same stacks).

## Acceptance criteria
- [ ] `<html lang="en">`; ≥ 15 `lang="ja"` sites in the JSX.
- [ ] Every rendered `input`/`textarea` has an accessible name and correct `type`/`inputMode`.
- [ ] `.tc-jp` removed; `:lang(ja)` rule present.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- `hreflang`-style mistakes: `lang` goes on the element containing the text, not on the parent list.
- Chrome's auto-translate prompt disappearing is a visible sign the `lang="en"` change deployed.
- The `Bi` change touches the Input tab's 14 chips — check alignment (`.tc-bi small` L6046).
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
