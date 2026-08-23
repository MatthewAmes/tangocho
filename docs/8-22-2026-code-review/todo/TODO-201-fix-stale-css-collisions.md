# TODO-201 — Fix stale-CSS collisions: Browse readings hidden on phones, Input tab stray box, duplicate `.tc-seg`/`.tc-input`

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 2 L-2 (High), § Exec summary bullet 3, § 1 V-8, § Prioritised fix list #2 and #8
**Depends on:** none   **Blocks:** TODO-228 (the CSS audit builds on the clean-up started here)

## Why
Two old CSS rules written for layouts that no longer exist still match the new markup. On any phone ≤560px wide the Browse list hides every word's kana reading and rōmaji — a JPN 101 student cannot read 預言者 without かな. On every visit to the Input tab the whole tab is wrapped in a faint bordered box with padding because `.tc-input` is defined twice (once as the dead Oral-tab text field, once as the Input container). `.tc-seg` is also defined twice with incompatible meanings. These are pure CSS deletions/scopings.

## Current behaviour (verified)
- `JpnFlashcards.jsx:5809-5813`:
  ```css
  @media (max-width:560px){
    .tc-term{font-size:46px;}
    .tc-row{grid-template-columns:auto 1fr auto auto;}
    .tc-rowread,.tc-rowstat{display:none;}
  }
  ```
  `.tc-row` is defined at L5782 but **never used** in JSX (`grep -c 'tc-row"' JpnFlashcards.jsx` → 0). The live Browse row markup at L4043-4046 is `<div className="tc-prow-top"><span className="tc-rowterm">…</span><span className="tc-rowread">{c.reading}<em>{c.romaji}</em></span><button className="tc-del">✕</button></div>` — so the `display:none` hides the reading on phones.
- `.tc-input` #1 at L6005: `.tc-input{appearance:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#fff;padding:10px 12px;font-size:15px;}` and L6006 `.tc-input:focus{…}` — belongs to the removed Oral tab (`.tc-oral*`, `.tc-bubble*`, `.tc-oralinput` are all unused; see the defined-but-unused list in TODO-228).
- `.tc-input` #2 at L6040: `.tc-input{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}` — the Input tab container, used at L4772 `<div className="tc-input">`. Because #1 comes first and #2 does not reset `background/border/border-radius`, the box bleeds through.
- `.tc-seg` #1 L5661 `.tc-seg{display:flex;gap:8px;flex-wrap:wrap;}` (segmented control, unused); `.tc-seg` #2 L5918 `.tc-seg{width:20px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);}` + `.tc-seg.on` — the Browse mastery meter, used at L4051. Because both apply, every meter segment also gets `display:flex;gap:8px;flex-wrap:wrap` (harmless today, but fragile).
- Used-but-undefined classes (from the defined-vs-used script): `tc-front` (L1971, L5110, L5572 `className="tc-face tc-front"`), `tc-kana` (L2757, L2792, L2830), `tc-study` (L1946), `tc-sumgrid` (TODO-200).

## Intended behaviour
Readings visible in Browse at every width; Input tab has no stray box; each class has exactly one definition; no class is used without a definition (either define intentionally as an empty hook or remove the className).

## Implementation steps
1. **Browse readings.** Edit the media block at L5809-5813 to:
   ```css
   @media (max-width:560px){
     .tc-term{font-size:46px;}
     .tc-prow-top{flex-wrap:wrap;}            /* let the reading drop under the term on narrow phones */
     .tc-prow-top .tc-rowread{flex-basis:100%;order:3;}
     .tc-prow-top .tc-del{margin-left:auto;}
   }
   ```
   and delete the now-dead rules `.tc-row` (L5782-5783), `.tc-rowkind` (L5784-5785), `.tc-rowmean` (L5789), `.tc-rowstat` (L5790). Keep `.tc-rowterm` (L5786) and `.tc-rowread` (L5787-5788) — they are used by the new rows (L4044-4045) and by the `.tc-prow-top .tc-rowread` overrides at L5912-5913.
2. **Input stray box.** Delete the Oral-era `.tc-input{…}` and `.tc-input:focus{…}` at L6005-6006 (they belong with the `.tc-oral`, `.tc-oralchat`, `.tc-bubble*`, `.tc-oralbar`, `.tc-oralinput`, `.tc-oraldebrief`, `.tc-debrieftext` block at L5999-6009 — delete that whole block; none of those classes is used: verified counts `tc-oral` 6 (all CSS), `tc-bubble` 4 (all CSS)). Keep the `.tc-input{display:flex;…}` at L6040.
3. **`.tc-seg` duplicate.** Delete the first `.tc-seg{display:flex;gap:8px;flex-wrap:wrap;}` at L5661 (the segmented-control idiom is realised by `.tc-kanaseg`/`.tc-segbtn`; `.tc-seg` as a container is unused). Keep the meter rules at L5918-5919. Optionally rename the meter class to `.tc-meterseg` in both CSS (L5918-5919) and JSX (L4051) for clarity.
4. **Used-but-undefined.** Add explicit (possibly empty) hooks so the audit script in TODO-228 stays clean, or remove the classNames:
   ```css
   .tc-front{}            /* front face; .tc-back carries the rotate */
   .tc-kana,.tc-study{display:flex;flex-direction:column;gap:0;}   /* tab wrappers, layout hooks only */
   ```
   (Check visually that adding `display:flex;flex-direction:column` to `.tc-study`/`.tc-kana` changes nothing: their children are block-level already; if spacing shifts, use `.tc-kana,.tc-study{}` instead.)
5. Rebuild (`cd tools && node build.mjs`).

## Data migration / compatibility
none

## Testing & verification
- `python3 -m http.server 8765` → 375×812 → **Browse**: every row shows term, then kana reading + italic rōmaji (on its own line under 560px), ✕ at the right. At 1280×800 the reading sits inline after the term as before.
- **Input** tab at 375px: no border/background box around the whole tab (`getComputedStyle(document.querySelector('.tc-input')).borderStyle === 'none'` and `backgroundColor` is transparent).
- Browse mastery meter still shows 5 segments 20×4px (`.tc-seg`/`.tc-meterseg`).
- Run the used-vs-defined script from TODO-228 (or the inline node one-liner there): `tc-sumgrid` (after TODO-200), `tc-front`, `tc-kana`, `tc-study` no longer appear in "USED BUT UNDEFINED"; `tc-row`, `tc-rowkind`, `tc-rowmean`, `tc-rowstat`, `tc-oral*`, `tc-bubble*` no longer appear in "DEFINED BUT UNUSED".

## Acceptance criteria
- [ ] Readings visible in Browse at 320/375/560/1280 px.
- [ ] Input tab has no stray border/box.
- [ ] `grep -c '^\.tc-input{' JpnFlashcards.jsx` → 1 and `grep -c '^\.tc-seg{' JpnFlashcards.jsx` → 1.
- [ ] No visual regression on the Browse meter or Study/Kana tabs.
- [ ] `index.html` rebuilt and committed.

## Pitfalls / notes
- The CSS is a template string (`const CSS = \`…\``, L5601-6080); backticks and `${` inside it would break the build — none of the proposed CSS contains either.
- Do not delete `.tc-sent*` classes wholesale: Scripts uses 13 of them (report 05 § 7). Only the `.tc-row*`/Oral block is touched here; the broader dead-CSS sweep is TODO-228.
- Remember to rebuild and commit `index.html`; then `cd cf && npx wrangler deploy`.
