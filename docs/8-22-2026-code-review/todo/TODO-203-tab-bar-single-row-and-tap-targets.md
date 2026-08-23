# TODO-203 — Tab bar as one scrollable row (≥44px tabs) and a 44px tap-target floor everywhere

**Priority:** P1   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 2 L-4 (High), L-5 (Medium); § Prioritised fix list #5, #10
**Depends on:** none   **Blocks:** TODO-220 (information architecture builds on the new bar)

## Why
On a 375px phone the 8-tab pill wraps to 2 rows (3 rows at 320px), the header + tabs consume 180–230px before any content, and at 320×568 the Smart Review button is below the fold. Tabs are 42px tall; several daily-use controls are 24–36px (speaker button 32×24, Rōmaji/Pitch/Voice pills 26–28px, ✕ buttons 32px). The app is used with a thumb on the bus; Apple/Google both specify 44/48px minimum targets.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1463-1467`:
  ```jsx
  <nav className="tc-tabs" role="tablist" aria-label="Sections">
    {[["study","Study"],["freq","10k"],["drill","Drill"],["input","Input"],["write","Write"],["kana","Kana"],["scripts","Scripts"],["browse","Browse"]].map(([id,label]) => (
      <button key={id} role="tab" aria-selected={tab === id} className={"tc-tab" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)}>{label}</button>
    ))}
  </nav>
  ```
- CSS L5640-5646: `.tc-tabs{display:flex;gap:4px;…padding:4px;border-radius:999px;width:fit-content;flex-wrap:wrap;}` `.tc-tab{…min-height:42px;padding:8px 15px;…white-space:nowrap;}`.
- Tap targets: `.tc-rpill` L5753-5755 `padding:5px 12px` (≈26-28px tall); `.tc-speakbtn` L5994 `padding:5px 9px;font-size:14px` (≈32×24); `.tc-del` L5791 `min-width:32px;min-height:32px`; `.tc-inx` L6058 `min-height:32px`; `.tc-fchip` L5903 `min-height:36px`; `.tc-btn-sm` L5708 `min-height:38px`; `.tc-hookbtn` L5875 `min-height:34px`; `.tc-kanacell` L5853 `min-height:56px` (OK); `--tap:46px` is defined at L5610 and used by `.tc-btn` only.

## Intended behaviour
Option (a) from the report — lowest effort, ships now: the tab bar is a single horizontally scrollable row with scroll-snap, no wrap, 44px-tall tabs, a subtle fade at the right edge so the user knows it scrolls, and the active tab scrolled into view on mount. (Option (b), a fixed bottom bar with 5 items, is the IA change in TODO-220.) Every interactive control has a ≥44×44px hit area; small visuals keep their size by using a transparent pseudo-element hit area.

## Implementation steps
1. **Tab bar CSS** — replace L5640-5646 with:
   ```css
   .tc-tabs{display:flex;gap:4px;background:rgba(255,255,255,.07);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);
     padding:4px;border-radius:999px;max-width:100%;flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain;
     scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none;
     -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);}
   .tc-tabs::-webkit-scrollbar{display:none;}
   .tc-tabs.is-end{-webkit-mask-image:none;mask-image:none;}
   .tc-tab{appearance:none;border:0;background:transparent;color:var(--mut-2);
     font:inherit;font-size:13.5px;font-weight:600;letter-spacing:.01em;min-height:44px;padding:8px 15px;border-radius:999px;cursor:pointer;
     transition:background .15s,color .15s,transform .1s;white-space:nowrap;scroll-snap-align:start;flex:none;}
   ```
   (Keep `.tc-tab:active`, `.tc-tab.is-on`; `.tc-tab:hover` moves into the hover block per TODO-202.)
2. **Scroll active tab into view + hide the fade at the end.** In `JpnFlashcards` (L1269) add:
   ```jsx
   const tabsRef = useRef(null);
   useEffect(() => {
     const el = tabsRef.current; if (!el) return;
     el.querySelector(".tc-tab.is-on")?.scrollIntoView({ inline: "nearest", block: "nearest" });
     const onScroll = () => el.classList.toggle("is-end", el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
     onScroll(); el.addEventListener("scroll", onScroll, { passive: true });
     return () => el.removeEventListener("scroll", onScroll);
   }, [tab]);
   ```
   and `<nav ref={tabsRef} className="tc-tabs" …>`.
3. **Tap-target floor.** Change `--tap:46px` (L5610) to `--tap:44px` and apply:
   ```css
   .tc-rpill{min-height:44px;padding:5px 14px;}
   .tc-fchip{min-height:44px;}
   @media (max-width:460px){.tc-fchip{min-height:40px;}}   /* replaces the existing 460px rule's padding tweak; keep font-size:12.5px */
   .tc-del,.tc-inx{min-width:44px;min-height:44px;display:inline-grid;place-items:center;}
   .tc-btn-sm{min-height:44px;}
   .tc-hookbtn{min-height:40px;}
   .tc-speakbtn{position:relative;}
   .tc-speakbtn::after{content:"";position:absolute;inset:-10px;}   /* 44×44 hit area, visual stays 32×24 */
   ```
   Visual density check: `.tc-kanaseg` rows grow ~8px; if the Kana chip bar gets too tall, TODO-219 (chip-bar density) compensates.
4. Rebuild.

## Data migration / compatibility
none — `tab` state values unchanged (that migration is TODO-220).

## Testing & verification
- `python3 -m http.server 8765`, in-app browser at 320×568, 375×812, 1280×800:
  - `document.querySelector('.tc-tabs').getBoundingClientRect().height` ≤ 56 at every width; scrolls horizontally at 320/375; all 8 tabs reachable by swipe; no page horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).
  - Tap "Browse" (last tab) → reload → it is scrolled into view.
  - `[...document.querySelectorAll('.tc-tab,.tc-rpill,.tc-fchip,.tc-del,.tc-inx,.tc-btn-sm')].every(b => b.getBoundingClientRect().height >= 40)` (44 on ≥461px).
  - Speaker button: `getComputedStyle(document.querySelector('.tc-speakbtn'),'::after').inset` is `-10px`.
- At 320×568 the Smart Review button is visible without scrolling (header ≈ 120px).

## Acceptance criteria
- [ ] Tab bar is one row at 320px; no wrapping; active tab auto-scrolled into view.
- [ ] All listed controls ≥ 44px (≥ 40px for `.tc-fchip` under 460px).
- [ ] No horizontal page overflow at 320/375/1280.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- `mask-image` on the scroller also fades the active tab when it is last; the `is-end` toggle removes the mask at the end of scroll — keep that effect.
- `role="tablist"` semantics are addressed in TODO-206 (either complete the pattern or switch to `<nav>` + `aria-current`); do the two together if convenient.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
