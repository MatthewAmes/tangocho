# TODO-206 — Accessibility: honest tab semantics, flashcards as real buttons, visible focus, headings, confirm-dialog focus, decorative emoji

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 5 A-2 (High), A-3 (High), A-8 (Medium), A-12 (Low), A-11 (Low); § 1 V-2; § Prioritised fix list #6
**Depends on:** TODO-203 (tab bar CSS — do together)   **Blocks:** TODO-220

## Why
`<nav role="tablist">` overrides the nav landmark, has no `aria-controls`/`tabpanel`, no arrow keys — 8 separate tab stops that announce nothing on switch. Three flashcards are `role="button"` divs that *contain* real buttons and an input (invalid nesting; VoiceOver swipe order breaks), and the `:focus-visible` rule targets `button,[role="tab"]` so those cards show **no** focus ring at all. Only four headings exist in the app (one of them includes "b59"), and the Clear-all confirm is an inline span that leaves focus on an unmounted button.

## Current behaviour (verified)
- Tabs: L1463-1467 `<nav className="tc-tabs" role="tablist" aria-label="Sections">` with `<button role="tab" aria-selected=…>`; no `id`, `aria-controls`, `tabpanel`, `tabIndex=-1`, or key handling.
- Cards: Study L1968-1969 `<div key={pos} className="tc-card…" onClick={flip} role="button" tabIndex={0} aria-label="Flashcard, click or press space to flip">` containing `SpeakBtn` (L1986, L2001), `<input className="tc-mnin">` (L2011), `.tc-hookbtn` (L2021). Drill L5107-5108 and Freq L5569-5570 same pattern with `SpeakBtn` inside. Study flips via a `window` keydown (L1764-1774); Drill/Freq have no keyboard flip.
- Focus ring: L6078 `.tc-root :is(button,[role="tab"]):focus-visible{outline:2px solid var(--shu-soft);…}` and L5805-5807 `.tc-btn:focus-visible,.tc-tab:focus-visible,…,.tc-card:focus-visible,…{outline:…}` — `.tc-card:focus-visible` *is* listed at L5805, so the card has a ring only if the browser treats the div's keyboard focus as focus-visible (it does when tabbed to). Verify; the report says none is visible, likely because the ring is painted behind the 3D-transformed faces. Either way, moving to a `<button>` fixes it.
- Headings: `h1` L1459 (brand incl. `b59`), `h2` L5180 "Conjugation", `h2` L5521 "Frequency 10k · Tier 1", `h2` L5548 (Freq done, removed by TODO-200). Section titles elsewhere are `<p className="tc-eyebrow">`.
- Clear-all confirm L4001-4009: `<span className="tc-confirm">Delete everything? <button>Yes</button><button>No</button></span>` — no focus move, no Escape.
- Emoji as icons: 🧠 L1828, 🩹 L1837, 🔊 L1964/L3446/L3653, 🐢 L3627, ✨ L2021, 💾 L3999, 🔄 L3965, ⚠️ banners; `.tc-batchicon` L1893 is already `aria-hidden`.

## Intended behaviour
- Tabs: drop the ARIA tabs pattern (honest + simple): `<nav aria-label="Sections"><button aria-current={tab===id ? "page" : undefined}>` — one tab stop per button, screen reader announces "current page". (If the full pattern is preferred, implement `aria-controls` + `role="tabpanel"` + roving tabindex + ←/→; the simple form is recommended.)
- Each flashcard is a `<button type="button" className="tc-card">` whose *children are non-interactive*; Speak / hook / mnemonic move to a `.tc-cardtools` row directly under the card; keyboard Space/Enter flip naturally via the button; Drill/Freq gain keyboard flip for free.
- Focus ring visible on cards and `[role="button"]`.
- Each tab's first eyebrow is an `<h2 className="tc-eyebrow">` (same look).
- Clear-all confirm moves focus to "No", Escape cancels.
- Decorative emoji wrapped in `<span aria-hidden="true">`.

## Implementation steps
1. **Tabs** (L1463-1467): remove `role="tablist"` and `role="tab"`/`aria-selected`; add `aria-current={tab === id ? "page" : undefined}`. Update the focus selector at L6078 to `.tc-root :is(button,[role="button"],[role="tab"],a):focus-visible`.
2. **Study card** (L1968-2026): change the wrapper to `<button type="button" key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={flip} aria-label={flipped ? "Flashcard, showing answer" : "Flashcard, press to reveal"} aria-pressed={flipped}>`; add CSS `.tc-card{appearance:none;border:0;background:none;padding:0;width:100%;text-align:center;font:inherit;color:inherit;display:block;}`. Remove `SpeakBtn` from L1986 and L2001, remove the `.tc-mnbox` (L2003-2015) and hook UI (L2016-2024) from inside the card, and render them under the card:
   ```jsx
   <div className="tc-cardtools">
     {!isProd || flipped ? <SpeakBtn text={card.reading || card.term} /> : null}
     {flipped && (isLeech(card) ? <div className="tc-mnbox">…</div> : card.mn ? <p className="tc-mnshow">🔗 {card.mn}</p> : null)}
     {flipped && (hook && hook.term === card.term ? <p className="tc-hooktext">…</p> : <button className="tc-hookbtn" onClick={() => getHook(card)}>✨ hook</button>)}
   </div>
   ```
   (The `e.stopPropagation()` calls become unnecessary.) CSS `.tc-cardtools{display:flex;flex-direction:column;align-items:center;gap:8px;margin:-8px 0 14px;}`. Keep the visual: the 🔊 next to the reading can stay as *decoration* inside the card (`<span aria-hidden="true">🔊</span>`) only if the real button is outside; simpler: show it only outside.
   Remove the `window` keydown Space/Enter branch at L1768 (the button handles it); keep →/←/Backspace grading keys (they are fine on `window` because they are gated by `flipped`).
3. **Drill card** (L5107-5124) and **Freq card** (L5569-5585): same conversion; move `SpeakBtn` (L5118, L5575, L5581) into a `.tc-cardtools` row.
4. **Headings**: change the first `tc-eyebrow` `<p>` of each tab/screen to `<h2 className="tc-eyebrow">` — Study done L1920 "Session complete", Study setup: add a visually-hidden `<h2 className="tc-sr">Study</h2>` at the top (L1783); Kana setup/chart/session eyebrows L2764, L2804, L2916; Write L3779; Scripts list header: wrap "Your scripts" (find it near L3670-3690) in `<h2>`; Browse: `<h2 className="tc-sr">Deck</h2>` + the sync box title L3965 `<p style=…>🔄 Sync…` → `<h2 className="tc-syncttl">`; Input L4775; Drill L5180 keep; Freq L5521 keep. Add `.tc-eyebrow` margin reset for `h2` (`h2.tc-eyebrow{font-weight:400;}`).
5. **Confirm dialog** (L4001-4009): wrap in `<span className="tc-confirm" role="alertdialog" aria-label="Delete everything?" onKeyDown={(e) => { if (e.key === "Escape") setConfirm(false); }}>` and give the "No" button `autoFocus`.
6. **Decorative emoji**: wrap 🧠 🩹 🐢 ✨ 💾 🔄 ⚠️ in `<span aria-hidden="true">…</span>`; Scripts 🔊 button at L3653 gets `aria-label="Hear this line"`; the "＋ふりがな" button (L3697) gets `aria-label="Add furigana"` and `aria-busy={building}`; L4780 `aria-label="dismiss"` → `"Dismiss"`.
7. Rebuild.

## Data migration / compatibility
none

## Testing & verification
- Keyboard only (1280×800): Tab reaches each nav button (announced "current page" on the active one), Tab to the card → visible ring; Space flips; → / ← grade; Tab reaches Speak, hook, mnemonic *after* the card; no nested interactive elements (`document.querySelectorAll('button button, button input').length === 0`).
- axe DevTools or `npx @axe-core/cli http://localhost:8765` (optional): zero "nested-interactive", zero "aria-required-children" violations.
- 375×812: card still flips on tap; tools row sits under the card; no layout jump.
- VoiceOver rotor → Headings lists one `h2` per tab.

## Acceptance criteria
- [ ] No `role="tablist"`/`role="tab"`; active tab has `aria-current="page"`.
- [ ] All three flashcards are `<button>` elements with no interactive descendants.
- [ ] Focus ring visible on cards, tabs, pills.
- [ ] ≥ 8 `h2` elements across tabs; Clear-all confirm is keyboard-dismissable.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- `<button>` default styles: reset `appearance/border/background/padding/width/text-align`; Safari adds `margin` and `align-items:flex-start` for flex children — `.tc-card-inner` is `position:relative`, so fine.
- Moving the mnemonic input out of the card changes `.tc-mnin` layout (L5834) — keep `width:min(100%,300px)`.
- TODO-207 (live region) writes grade announcements — same area of code; sequence 206 → 207.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
