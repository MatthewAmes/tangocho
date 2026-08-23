# TODO-219 — Layout polish: Write prompt prominence, Scripts mode row wrap, Kana chip-bar density, canvas height clamp, tooltips into the UI

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 1 V-3 (Medium), § 2 L-6 (Medium), L-7 (Medium), L-9 (Low), § 5 A-10 (Low); § Prioritised fix list #15
**Depends on:** TODO-203 (chip heights) — do after   **Blocks:** none

## Why
On Write the prompt ("school") is the smallest, dimmest text on the card (15px italic 60% white) while the empty canvas is the loudest — the hierarchy is inverted for a production task. On Scripts rehearse the four mode buttons don't wrap, so "② My part: Kanda" breaks into three lines and the row is 130px tall. Kana shows three chip rows + a progress line (~190px) before any content; the only explanation of "extended"/"all" and every cell's stats is in `title=` tooltips, invisible on phones. Both canvases are a fixed 240px — small for multi-kanji words on a tall phone, tiny on desktop.

## Current behaviour (verified)
- Write prompt L3783 `<p className="tc-sentgoal">{card.meaning}</p>`; `.tc-sentgoal` L5943 `font-size:15px;color:rgba(255,255,255,.6);font-style:italic;`. `.tc-prodprompt` L5828 (26px/600 white, used by Study production cards) exists.
- Scripts modes L3622-3629: `<div className="tc-sentmodes">` + `.tc-segbtn` ×(2 + speakers); `.tc-sentmodes` L5935 `display:flex;gap:8px;` (no wrap); labels "① Read", "② My part: {sp}", "③ Both sides".
- Kana bar L2831-2849: three `.tc-kanaseg` groups inside `.tc-kanabar` (L5848 `flex-wrap:wrap`), then `.tc-kanaprog` L2850-2853; tooltips at L2840 (`title={key === "ext" ? "katakana-only loanword sounds" : undefined}`), L2843 (`title={allOn ? "back to base 46 only" : "select every set"}`), chart cells L2878 (`title={`${r} · …% · …`}`).
- Canvas: `.tc-canvaswrap` L5974 `height:240px;` (Kana L2766, Write L3784); `.tc-ghost` font-size computed at L3776.

## Intended behaviour
- Write: prompt styled like `.tc-prodprompt` (26px/600 white), eyebrow keeps the counter; the canvas follows.
- Scripts: mode row wraps; labels "① Read", "② Kanda", "② Sasha", "③ Both"; the ladder line (L3621) already explains ①②③.
- Kana: Practice/Chart becomes a 2-option segmented control in the hero area (above the Start button); the set chips stay in one row that scrolls horizontally on phones; the "extended"/"all" explanation moves into `.tc-kanaprog` text; chart cells show the stat inside the cell (rōmaji line becomes "ka · 80%" once drilled) and keep `aria-label`.
- Canvas height `clamp(200px, 38vh, 360px)`.

## Implementation steps
1. **Write** (L3783): `<p className="tc-prodprompt tc-writeprompt">{card.meaning}</p>` + CSS `.tc-writeprompt{margin:0 auto;}`; keep `.tc-sentgoal` for Scripts (L3643).
2. **Scripts** (L5935): `.tc-sentmodes{display:flex;gap:8px;flex-wrap:wrap;}` and at L3626 `② {sp}` (drop "My part:"), L3628 `③ Both`. Add `title`-free explanation: the ladder line L3621 already reads "① Read it through → ② drill your part → ③ both sides from memory" — fine.
3. **Kana bar**:
   - Move the Practice/Chart group (L2845-2848) out of `.tc-kanabar` into the hero block (before the session-length row, ~L2896) as `<div className="tc-kanaseg tc-kanaview">…same two chips…</div>`; when `view === "chart"` render the same control above the grid so the user can get back.
   - Set chips row (L2836-2844): wrap in `<div className="tc-kanaseg tc-kanasets">` and CSS `@media (max-width:560px){.tc-kanasets{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px;} .tc-kanasets::-webkit-scrollbar{display:none;}}`.
   - Replace the two `title=` attributes (L2840, L2843) with text in `.tc-kanaprog` (L2850-2853): append `{sets.has("ext") ? " · extended = katakana-only loanword sounds (ファ, ヴィ, ティ…)" : ""}` (already partly there for hira mode) and make the all/46 chip label self-explanatory: `{allOn ? "back to 46" : "all sets"}`.
   - Chart cells (L2876-2883): replace `title=` with `aria-label={`${r}${st.seen ? `, ${pct}% correct, ${avgSecs(st)}` : ", not drilled yet"}`}` and render `<span className="tc-kanar">{r}{st.seen ? ` · ${pct}%` : ""}</span>` (compute `st = getS(stats,id)`, `pct` once per cell). `.tc-kanar` is 11px after TODO-208; `.tc-kanacell{min-height:60px}`.
4. **Canvas** (L5974): `height:clamp(200px,38vh,360px);`. Both `setup()` functions size the canvas from `getBoundingClientRect()` on `pos`/resize (L2673-2680, L3724-3733) so a taller wrap just works; the Write ghost font size formula (L3776) uses 360/len — fine.
5. Rebuild.

6. **CSS additions in one block** (append near the Kana section of the stylesheet):
   ```css
   .tc-writeprompt{margin:0 auto;}
   .tc-sentmodes{flex-wrap:wrap;}
   .tc-kanaview{justify-content:center;margin:0 0 10px;}
   @media (max-width:560px){
     .tc-kanasets{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px;max-width:100%;}
     .tc-kanasets::-webkit-scrollbar{display:none;}
     .tc-kanasets .tc-fchip{flex:none;}
   }
   .tc-canvaswrap{height:clamp(200px,38vh,360px);}
   .tc-kanacell{min-height:60px;}
   ```
7. Also drop the `title` on the Input difficulty dots (L4829 `<span className="tc-indots" title={d.label}>`) — the label is already rendered next to it (L4832) — and mark the dots `aria-hidden="true"`.

## Data migration / compatibility
none

## Testing & verification
- 375×812: Write → prompt is the largest text on the card (26px) above the canvas; canvas ≈ 308px tall (38vh) and ≥ 200px at 320×568; desktop 1280×800 → 304px (38vh) capped 360.
- Scripts → rehearse a seeded script → the mode row is ≤ 2 lines, each button ≤ 56px tall.
- Kana → setup shows: script row, scrollable set row (one line), progress line, hero, Practice/Chart control, session chips, Start; total height above the hero < 120px. Chart → drilled cells show "ka · 80%"; `document.querySelectorAll('.tc-kanacell[title]').length === 0`.
- No page horizontal overflow.

## Acceptance criteria
- [ ] Write prompt uses the 26px style; canvas clamp applied.
- [ ] Scripts mode buttons wrap; short labels.
- [ ] Kana: ≤ 2 chip rows above the hero; no `title`-only information left on Kana.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Keep `KANA_GROUPS` keys untouched (storage keys).
- `38vh` with the on-screen keyboard is irrelevant here (no text input on these screens).
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
