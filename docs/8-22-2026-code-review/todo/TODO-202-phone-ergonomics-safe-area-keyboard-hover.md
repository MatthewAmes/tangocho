# TODO-202 — Phone ergonomics: safe-area insets, no iOS zoom on inputs, keyboard avoidance, hover gating, desktop-only tips

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 2 L-3 (High), L-10 (Low), L-11 (Low); § 7 "Hints that help"; § Prioritised fix list #4
**Depends on:** none   **Blocks:** TODO-215 (service worker / standalone mode makes the notch problem permanent)

## Why
`index.html` invites "Add to Home Screen" (`apple-mobile-web-app-capable`, `black-translucent`, `viewport-fit=cover`) but nothing pads for `env(safe-area-inset-*)`, so in standalone mode the brand block and tab row sit under the iPhone status bar / notch and the grade buttons can sit under the home indicator. Two inputs are 14px so iOS Safari zooms the page on focus; no `scroll-padding` means the mnemonic input at the bottom of a 300px card scrolls half off-screen when the keyboard opens. Hover styles stick after a tap on touch screens. The "Space flips" tip is shown on phones that have no keyboard.

## Current behaviour (verified)
- `index.html:5-7`: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`, `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`.
- `JpnFlashcards.jsx:5621` `.tc-root{ … min-height:100vh; padding:22px 16px 44px; box-sizing:border-box;}` — no `env()` anywhere in the file (`grep -c 'safe-area' JpnFlashcards.jsx` → 0).
- Inputs < 16px: `.tc-search` L5778 `font-size:14px`; `.tc-mnin` L5834 `font-size:14px`; `.tc-restorebox` L5884 `font-size:11.5px` (textarea). Already ≥16px: `.tc-sentinput` L5953 `font-size:18px`, `.tc-inarea` L6069 `font-size:16px`, `.tc-textarea` L5797 `15px` (Add, unrendered).
- No `scroll-padding` anywhere; `.tc-mnin` lives inside `.tc-card` (L2011) near the bottom of a `min-height:300px` face.
- Hover rules not gated: `.tc-tab:hover` L5644, `.tc-btn:hover` L5704, `.tc-batchchip:hover` L5684, `.tc-segbtn:hover` L5665, `.tc-rpill:hover` L5756, `.tc-fchip` (no hover), `.tc-conjchip:hover` L5991, `.tc-scriptopen:hover` L5966, `.tc-hookbtn:hover` L5878, `.tc-del:hover` L5793, `.tc-btn-danger:hover`, `.tc-focus-btn:hover`, `.tc-idk:hover`, `.tc-smart-btn:hover`, `.tc-btn-primary:hover`, `.tc-btn-got:hover`.
- Desktop tip on phones: L1909 `<p className="tc-hintline">Tip: Space flips · → got it · ← missed</p>`.

## Intended behaviour
In standalone/home-screen mode the header clears the status bar and the bottom buttons clear the home indicator; focusing any input never zooms iOS; a focused input is scrolled into the visible area above the keyboard; hover styles only apply on hover-capable devices; the keyboard tip only shows on devices with a fine pointer + hover.

## Implementation steps
1. **Safe-area padding.** Replace the `.tc-root` padding line (L5621) with:
   ```css
   min-height:100vh; min-height:100dvh;
   padding:calc(22px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(44px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));
   box-sizing:border-box;
   ```
   (Keep the `100vh` fallback line before `100dvh`.) If TODO-203 option (b) (fixed bottom tab bar) is chosen later, that bar needs `padding-bottom:env(safe-area-inset-bottom)` too.
2. **16px inputs.** Change `.tc-search` (L5778) `font-size:14px` → `16px`; `.tc-mnin` (L5834) `14px` → `16px`; `.tc-restorebox` (L5884) `11.5px` → `16px` on `@media (pointer:coarse)` only (keep 11.5px for desktop by default):
   ```css
   @media (pointer:coarse){.tc-restorebox,.tc-search,.tc-mnin,.tc-sentinput,.tc-textarea{font-size:16px;}}
   ```
   Simpler alternative: set them all to 16px unconditionally.
3. **Keyboard avoidance.** Add to the top of the CSS string (after `html,body{…}` L5602): `html{scroll-padding-bottom:40vh;}` and give every text input `scroll-margin-bottom:40vh`:
   ```css
   .tc-root :is(input,textarea){scroll-margin-bottom:40vh;}
   ```
   Also call `e.target.scrollIntoView({block:"center",behavior:"smooth"})` in an `onFocus` on `.tc-mnin` (L2011) — the only input inside a transformed 3D card, where browser auto-scroll is unreliable.
4. **Hover gating.** Wrap every `:hover` rule listed above in `@media (hover:hover){ … }`. Practical approach: move all `:hover` declarations into one block at the end of the CSS string:
   ```css
   @media (hover:hover){
     .tc-tab:hover{color:#fff;}
     .tc-btn:hover{background:rgba(255,255,255,.12);}
     .tc-btn-primary:hover{filter:brightness(1.07);}
     .tc-btn-got:hover{filter:brightness(1.08);background:#3d9150;}
     .tc-btn-danger:hover{background:rgba(216,72,47,.16);}
     .tc-segbtn:hover{background:rgba(255,255,255,.14);}
     .tc-batchchip:hover{box-shadow:0 0 26px -6px rgba(216,72,47,.5);}
     .tc-rpill:hover{color:#fff;}
     .tc-del:hover{color:var(--shu-soft);background:rgba(216,72,47,.12);}
     .tc-conjchip:hover{color:#fff;background:rgba(255,255,255,.12);}
     .tc-scriptopen:hover{border-color:var(--shu);background:rgba(216,72,47,.1);}
     .tc-hookbtn:hover{background:rgba(255,255,255,.18);}   /* was rgba(43,38,32,.06) — a light-theme remnant that darkened a dark button */
     .tc-smart-btn:hover{filter:brightness(1.12);}
     .tc-focus-btn:hover,.tc-idk:hover{background:rgba(216,72,47,.12);}
   }
   ```
   and delete the originals.
5. **Desktop-only tip.** Wrap L1909 in a class and gate it: `<p className="tc-hintline tc-kbdtip">…</p>` + CSS `.tc-kbdtip{display:none;} @media (hover:hover) and (pointer:fine){.tc-kbdtip{display:block;}}`.
6. Rebuild.

## Data migration / compatibility
none

## Testing & verification
- In-app browser at 375×812: `getComputedStyle(document.querySelector('.tc-root')).paddingTop` is `22px` (no inset in a normal tab — expected). To verify the inset path, in the browser console run `document.documentElement.style.setProperty('--sat','47px')` — not possible for `env()`; instead test on a real iPhone after "Add to Home Screen" (prod) and confirm the seal/wordmark sits below the status bar.
- Focus the Browse search box and the mnemonic input on an iPhone: page does not zoom; the field scrolls into view above the keyboard.
- Tap a tab on a touch device: label does not stay white after the finger lifts (no sticky hover).
- At 1280×800 with a mouse, hover styles still work; the keyboard tip shows. At 375×812 (mobile emulation) the tip is hidden.

## Acceptance criteria
- [ ] `grep -c 'safe-area-inset' JpnFlashcards.jsx` ≥ 4.
- [ ] No text input has `font-size` < 16px on coarse pointers.
- [ ] All `:hover` rules live inside `@media (hover:hover)`.
- [ ] Keyboard tip hidden on touch-only devices.
- [ ] `index.html` rebuilt + committed; verified on a real phone in standalone mode after deploy.

## Pitfalls / notes
- `100dvh` is supported on iOS 15.4+/Chrome 108+; the `100vh` line before it is the fallback — keep both.
- Don't put `env()` on `.tc-shell` (max-width column) — the background gradient is painted by `.tc-root`, so the padding must be there.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
