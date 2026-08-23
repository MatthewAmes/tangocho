# TODO-209 — One "selected" idiom, one "primary" idiom, consistent grade buttons and toggle labels, copy fixes

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 1 V-1 (Medium), § 5 A-6 (Medium), § 7 Copy and microcopy; § Prioritised fix list #9, #16
**Depends on:** none   **Blocks:** none

## Why
A student learns "orange = selected / orange = go" on Study and Kana; Drill flips it (white pills for selected, a grey Start button). Eight default-on form chips render as a wall of white that reads as blank/disabled. Grade buttons are "Missed it / Got it" on four tabs and "Got it ✓ / Missed ✗" *in the opposite order* on Kana — muscle memory matters. Toggle labels like "Rōmaji off" are ambiguous (state or command?). Several strings are developer-facing ("tell Claude the exact message…", "hit Backup in Stats" — there is no Stats tab), one is ungrammatical ("1 words"), casing and spelling drift.

## Current behaviour (verified)
- Selected styles: white fill `.tc-tab.is-on` L5646, `.tc-conjchip.is-on` L5992 (`background:rgba(255,255,255,.94);color:#141a33`); vermilion fill `.tc-fchip.is-on` L5906, `.tc-segbtn.is-on` L5666, `.tc-rpill.is-on` L5757; washi `.tc-szbtn.is-on` L5675 (unused).
- Drill start: L5208 `<button className="tc-btn tc-btn-wide" onClick={() => startSession()}>Start · …</button>` (no `tc-btn-primary`); Kana L2905 and Input L4815 and Freq L5530 use `tc-btn-primary`.
- Drill multi-select forms L5189-5198 (`tc-conjchip`, `aria-pressed`) plus "just one / all 8" toggle styled identically.
- Grade buttons: Study L2032-2033 `Missed it` / `Got it`; Drill L5131-5132 same; Freq L5592-5593 same; Write L3804-3805 same; **Kana L2778-2779** `Got it ✓` (`tc-btn-good`) then `Missed ✗` (`tc-btn-bad`).
- Toggles L1956-1965: `Rōmaji {showRomaji ? "on" : "off"}`, `Pitch {…}`, `🔊 Voice {…}` with `aria-pressed` ✓; Scripts L3627 `🔊 Voice {voiceOn ? "on" : "off"}`.
- Copy: L1895 `{b.cards.length} words · …` (no pluralisation; cf. L1795 `day{streak === 1 ? "" : "s"}`); L3513 "hit Backup in Stats"; L3562 and L3576 "tell Claude the exact message in these parentheses"; L4014 "update pack from Claude"; L5523 "Every review is logged: result, streak, level, and think time."; L3621 "Memorize" vs L4120 "memorised"; eyebrow casing lowercase at L2764 "write this kana", L2862 "nothing to drill", L2804/L2916/L5153 "needs the most work", L4894 "input you did somewhere else" vs sentence case at L1920 "Session complete", L4775 "How was it? · どうだった？"; Kana chip labels "46/marks/extended" (L2564 `KANA_GROUPS`), Drill "just one" (L5197); `KIND_LABEL.mixed = "混"` L1185; `.tc-sub` L5637 `text-transform:lowercase` prints "jpn 101".
- Colour-only mastery in the Kana chart: `kn-good/mid/weak` L5858-5860, stats only in `title=` L2878.

## Intended behaviour
- Selected = vermilion fill everywhere except the tab bar (white stays the "current page" idiom). Multi-select chips show a leading ✓. Every "Start" is `tc-btn-primary`.
- Grade buttons everywhere: **Missed** left (neutral), **Got it** right (green), same wording.
- Toggles: fixed label + `aria-pressed`; on-state shown by fill only ("Rōmaji", "Pitch", "Voice").
- Copy: sentence case for eyebrows; no developer-facing text; correct plurals; one spelling (US "memorize" — matches "Memorize ladder"); chip names a student would say ("46 basic", "dakuten", "combos", "small ゃゅょ / ー", "katakana extras"); `混` → `混合`.
- Kana chart cells carry a glyph/text cue in addition to colour (✓ / · / ✕ at the corner, or the stat inside the cell).

## Implementation steps
1. CSS: `.tc-conjchip.is-on{background:var(--shu);color:#fff;border-color:var(--shu);font-weight:600;}` (L5992). Delete `.tc-sizesel`/`.tc-szbtn` (L5673-5675, unused). Add `.tc-conjchip[aria-pressed="true"]::before,.tc-fchip[aria-pressed="true"]::before{content:"✓ ";opacity:.9;}` for multi-select chips (Drill forms L5192-5193, Kana sets L2838-2840).
2. Drill start L5208: add `tc-btn-primary`. Make the "just one / all 8" control visually distinct: `className="tc-conjchip tc-conjmode"` and CSS `.tc-conjmode{background:transparent;border-style:dashed;}` (the `.tc-conjmode` selector already exists at L5993 as `align-self:flex-start` — replace it).
3. Kana grade buttons L2778-2779 → order + wording `Missed it` (`tc-btn`) then `Got it` (`tc-btn tc-btn-got`); drop `tc-btn-good/tc-btn-bad` (delete L5713-5714 if no other user: `grep -c 'tc-btn-good\|tc-btn-bad'` → only these two).
4. Toggles L1956-1965 and L3627: labels `Rōmaji`, `Pitch`, `<span aria-hidden="true">🔊</span> Voice`; keep `aria-pressed`. Add `.tc-rpill.is-on::before{content:"● ";font-size:8px;vertical-align:middle;}` if a non-colour on-cue is wanted.
5. Copy edits:
   - L1895 → `{b.cards.length} word{b.cards.length === 1 ? "" : "s"} · …`.
   - L3513 → "…Keep it open, open Browse › More › Backup, then add the script again."
   - L3562/L3576 → "⚠️ Saved without furigana — the annotation service isn't available right now. Tap ＋ふりがな to retry later." (Theme B's AI-endpoint decision may change this again; keep the wording neutral.)
   - L4014 → "Paste a 💾 backup (replaces everything) or an update pack (adds new words & scripts — progress untouched), then Apply."
   - L5523 → delete the sentence "Every review is logged: …".
   - L4120 "memorised" → "memorized" (matches L3621). Also L4949 comment — leave comments alone.
   - Eyebrows → "Write this kana", "Nothing to drill", "Needs the most work", "Input you did somewhere else", "Add a source of your own" (L4911), "Paste Japanese — how much of it do you already have?" (L4922).
   - `KANA_GROUPS` labels (L2564-2569; open and edit the label strings only, keys unchanged): "46" → "46 basic", "marks" → "small ゃゅょっ · ー", "extended" → "katakana extras" (verify the exact current labels when editing).
   - Drill L5197 "just one" → "reset to one form".
   - L1185 `mixed: "混"` → `"混合"`.
   - `.tc-sub` L5637 remove `text-transform:lowercase`.
6. Kana chart non-colour cue: in the cell (L2878-2883) add `<span className="tc-kanamark" aria-hidden="true">{mark}</span>` where `mark` = "✓" for `kn-good`, "·" for `kn-mid`, "✕" for `kn-weak`, "" untouched; CSS `.tc-kanacell{position:relative;} .tc-kanamark{position:absolute;top:3px;right:5px;font-size:10px;opacity:.8;}`. Also move the stat out of `title` into an `aria-label` (`aria-label={`${r}, ${pct}% correct, ${avg}`}`) — TODO-219 covers surfacing it visually.
7. Rebuild.

## Data migration / compatibility
none (KANA_GROUPS keys unchanged — only labels).

## Testing & verification
- Visual at 375×812: Drill setup shows selected type/form chips in vermilion with ✓; Start is orange; Kana grade order Missed/Got it; Study pills read "Rōmaji / Pitch / 🔊 Voice" and fill when on.
- `grep -n 'tell Claude\|in Stats\|Every review is logged\|memorised\|"混"' JpnFlashcards.jsx` → no matches (except code comments).
- Section chip with one card reads "1 word · new".
- Kana chart: `document.querySelectorAll('.tc-kanamark').length > 0` after drilling a few.

## Acceptance criteria
- [ ] No white-fill `.is-on` outside `.tc-tab`.
- [ ] All Start buttons `tc-btn-primary`; grade buttons same order/wording on 5 tabs.
- [ ] Copy list above applied; eyebrows sentence case.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Do not rename `KANA_GROUPS` keys or `CONJ_FORMS` ids — they are storage/stat keys.
- TODO-210 owns the build stamp (`b59`) removal; TODO-220 owns tab label renames ("10k"/"Input"/"Drill").
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
