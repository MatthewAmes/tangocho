# TODO-208 — Contrast fixes, minimum type sizes, `color-scheme` meta (and an optional light theme)

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 5 Contrast table, § 1 V-5, V-7, § 8 Dark mode; § Prioritised fix list #7, #18
**Depends on:** none   **Blocks:** none

## Why
The contrast failures land exactly on what a learner squints at: white on the orange primary gradient (3.2:1 at the right end), "Got it" green (3.9:1), the 9.5px flip cue at 40% white (3.75:1), untouched-kana rōmaji (≈2.55:1), and furigana `rt` in vermilion (≈3.9:1 at ~11px). Several content strings are 9.5–10.5px, below iOS's 11pt floor. The app is dark-only but never declares it, so form controls/scrollbars render light on some browsers.

## Current behaviour (verified)
- `.tc-btn-primary` L5705 `background:linear-gradient(135deg,#d8482f 0%,#e86a3c 100%);…color:#fff;`
- `.tc-btn-got` L5711 `background:#3d9150;border-color:#3d9150;color:#fff;`; `.tc-btn-good` L5713 `#3d9150 !important`; `.tc-btn-bad` L5714 `#c23a26`.
- `.tc-flipcue` L5743 `font-size:9.5px;…color:rgba(255,255,255,.4);`
- `.tc-kanar` L5856 `font-size:9.5px;…color:var(--mut-2);` + `.kn-untouched{opacity:.55;}` L5857.
- `.tc-sentjp ruby rt` L5946 `font-size:.42em;color:var(--shu);` (`--shu:#d8482f`); `.tc-sentans ruby rt` L5947 `.5em;color:var(--shu)`.
- Tiny type: `.tc-bi small` L6046 `10px`; `.tc-sumitem span` L5898 `10px`; `.tc-batchhead>span` L5672 `10.5px`; `.tc-bubblewho` L6003 (dead); `.tc-rowkind` L5784 `10px` (dead).
- Light-theme remnants: `.tc-hookbtn:hover{background:rgba(43,38,32,.06)}` L5878; `.tc-sentbig{color:var(--sumi)}` L5944; `.tc-sentresult.ok{color:#2e7d32}` L5957; `.tc-senthint` L5955 / `.tc-sentfeedback` L5961 washi panels (dead Sentences).
- `index.html:8` `<meta name="theme-color" content="#1a1a2e">`; no `color-scheme` meta; `html,body{background:#0c1122}` L5602 (note the head inline style uses `#1a1a2e`, L10 of index.html — two different "page" colours).

## Intended behaviour
All text ≥ 4.5:1 against its background at body sizes (≥ 3:1 only for ≥ 24px/19px-bold); no content text < 11.5px (labels in all-caps mono may be 11px); the document declares `color-scheme: dark`; body background in the head matches the app background so first paint doesn't flash. Optional phase 2: a `prefers-color-scheme: light` token remap.

## Implementation steps
1. **Primary gradient** (L5705): `background:linear-gradient(135deg,#c63f28 0%,#d8582f 100%);` (white ≥ 4.6:1 at both ends). Apply the same to `.tc-smart-btn` only if its end stop `#b0543f` fails (it's ≈4.7:1 — keep).
2. **Greens/reds**: `.tc-btn-got` and `.tc-btn-good` → `#2f7a42` (white 5.0:1); `.tc-btn-bad` `#c23a26` → `#b4321f` (5.1:1). Update the matching `box-shadow` rgba to the new colour.
3. **Flip cue** (L5743): `font-size:11px;color:rgba(255,255,255,.62);`.
4. **Kana chart rōmaji** (L5856-5857): `.tc-kanar{font-size:11px;…}` and change `.kn-untouched{opacity:.55;}` to `.kn-untouched .tc-kanach{opacity:.6;}` so only the glyph dims and the rōmaji stays readable; add `.tc-kanacell{min-height:60px;}` (L5853).
5. **Furigana** (L5946-5947): `color:var(--shu-soft);` (#e06848, 5.0:1 on the card) and `.tc-sentjp ruby rt{font-size:.5em;}`.
6. **Type floors**: `.tc-bi small` 10px → 11.5px; `.tc-sumitem span` 10px → 11px; `.tc-batchhead>span` 10.5px → 11px; `.tc-hintline` 12px OK; `.tc-stat` 11.5px OK.
7. **Light remnants**: `.tc-hookbtn:hover` → `rgba(255,255,255,.18)` (also in TODO-202's hover block); `.tc-sentbig{color:#fff}`; `.tc-sentresult.ok{color:#8fd6a0}` `.mid{color:#ffd76e}` (or delete with Sentences per Theme B's decision); leave `.tc-senthint`/`.tc-sentfeedback` for TODO-228.
8. **Declare the scheme**: `index.html` head add `<meta name="color-scheme" content="dark">`; change the inline `<style>` at L10 to `html,body{margin:0;padding:0;background:#0c1122;color-scheme:dark}#root{min-height:100vh}` and `theme-color` (L8) to `#0c1122` so the status bar and first paint match `.tc-root`.
9. **(Optional phase 2 — light theme)**: introduce tokens `--bg`, `--card`, `--text`, `--text-2`, `--line-2` in `.tc-root` and replace the ~60 hard-coded `#fff`/`rgba(255,255,255,.x)` occurrences; add `@media (prefers-color-scheme: light){.tc-root{--bg:#f2ecde;…}}` and `<meta name="color-scheme" content="dark light">`. Only do this after the token pass is green in dark mode; list it as its own commit.
10. Rebuild.

## Data migration / compatibility
none

## Testing & verification
- Compute contrast in the in-app browser console for the changed pairs (a small helper):
  ```js
  const L=c=>{const [r,g,b]=c.match(/\d+/g).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
  const cr=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
  cr('rgb(255,255,255)','rgb(216,88,47)')  // → ≥ 4.5
  ```
  Check white on `#c63f28`, `#d8582f`, `#2f7a42`; `rgba(255,255,255,.62)` composited over the card (~#2a2f55) ≥ 4.5; `#e06848` on the card ≥ 4.5.
- Visual pass at 375×812: Study card (flip cue readable), Kana chart (untouched cells' rōmaji readable), Scripts rehearse (furigana legible), Input chips (Japanese sublabels ≥ 11.5px).
- `document.querySelector('meta[name=color-scheme]').content === 'dark'`; iOS standalone status bar area matches the page colour.

## Acceptance criteria
- [ ] All pairs in the report's contrast table that were "fail" now ≥ 4.5:1 (or the element was deleted as dead code).
- [ ] No live content text < 11px; `.tc-bi small` ≥ 11.5px.
- [ ] `color-scheme` meta present; head background = `#0c1122`.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- `tools/build.mjs` splices only the `<script>`; head edits are made directly in `index.html` and survive rebuilds — but they must be made in the *committed* `index.html` (the build reads it as the template).
- Don't lighten `--mut-2` globally — it passes (6.7:1) and is used everywhere.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
