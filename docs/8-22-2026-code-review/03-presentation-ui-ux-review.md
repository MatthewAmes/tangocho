# tangocho (単語帳) — Presentation / UI / UX / Layout / Accessibility Review

Date: 2026-08-22 · Build reviewed: `b59` (local `index.html` == live `https://tangocho.deskbuddies.workers.dev`, both report b59)
Scope: everything the student sees and touches. No source was modified. All line references are to `/Users/dan/Code/matthew-japanese/tangocho/JpnFlashcards.jsx` unless another file is named; the CSS template string is L5601–6080.

---

## Executive summary

- **The visual language is genuinely coherent and attractive** — an indigo/vermilion/washi palette, tabular numerals, big 54px kanji, a pixel-nigiri mascot, frosted "liquid-glass" cards. For a student-built single-file app this is far above average. Most problems below are *finish* problems, not direction problems.
- **Two real layout bugs ship in b59:** (1) the 10k/Freq "session complete" screen renders as a broken horizontal strip — `セッション終了！` is squeezed into a 50px column one character per line and the two buttons become 400px-tall slabs (`.tc-summary` L5895 is the Browse stat-strip style, `.tc-sumgrid` is never defined); (2) on phones the Browse tab **hides every word's reading/rōmaji** because a media rule written for the old table layout (`.tc-rowread{display:none}` L5811-5812) still matches the new card rows (L4043-4045). A JPN 101 student cannot read 預言者 without its kana.
- **The Input (入力) tab is wrapped in a stray bordered box** because `.tc-input` is defined twice — once as the dead Oral-tab text field (L6005) and once as the Input tab container (L6040). The first definition's background/border/radius bleed through. Visible on every visit to that tab.
- **The streak counter is wrong in the evening.** `streakFrom` keys days by `toISOString()` of *local noon* (L1227-1229) while `logDay` keys by `toISOString()` of *now* (L1212). After ~17:00 Pacific a session is logged under tomorrow's UTC date, so right after studying the buddy says "Nice — that's a start · **0 days in a row** · 8 today". That is the one number meant to make a student come back.
- **Phone ergonomics are uneven:** no `env(safe-area-inset-*)` despite `viewport-fit=cover` + standalone-capable meta (index.html L5-7), so in home-screen mode the header sits under the notch/status bar; 8 tabs wrap into 2 rows at 375px and 3 rows at 320px inside a pill; several controls are 24–36px tall (`.tc-rpill` 26px, `.tc-speakbtn` 32×24, `.tc-del`/`.tc-inx` 32px, tabs 42px).
- **A mid-session tab tap silently throws the study session away** (Study unmounts, L1474-1490) and Study has no Quit button (Kana and Drill do). There is no undo for a mis-tapped grade.
- **Accessibility is thin underneath the nice surface:** zero `<label>` elements, an `aria-live` region that is never written to (L2037), `role="tablist"` with no panels/arrow keys (L1463-1467), focusable buttons nested inside `role="button"` cards, `<html lang="ja">` on an English UI with no `lang="ja"` on the actual Japanese, canvas-only Kana/Write with no alternative, one-tap permanent deletes for cards and scripts.
- **Contrast misses on exactly the things a learner squints at:** white on the primary-button gradient end (#e86a3c) is 3.2:1; "Got it" green 3.9:1; the 9.5px flip cue at 40% white 3.75:1; untouched-kana rōmaji ≈2.55:1; furigana `rt` in vermilion on the card ≈3.9:1 at ~11px.
- **Not a PWA yet:** no manifest, no icons, no service worker, `cache-control: max-age=0, must-revalidate` on a 549KB (226KB compressed) HTML — every cold open on the bus re-downloads the app, and there is no offline mode for a phone study tool. `/favicon.ico` and `/manifest.json` return the whole app HTML via SPA fallback.
- **Information architecture:** two of the "ten tabs" in the brief (Sentences, Add) are dead code; the live bar has 8 tabs ordered Study · 10k · Drill · Input · Write · Kana · Scripts · Browse. The names mix registers ("10k" is a deck, "Input" is jargon, "Drill" means conjugation only), and the empty-deck CTA "Add your first words" routes to Browse, which has no add UI.

---

## How I reviewed it

- Read the whole shell (L1269-1496), the CSS block (L5601-6080), Study (L1497-2041), Kana, Scripts, Write, Browse, Add, Input, ConjDrill and Freq render paths, `index.html` head, `netlify.toml`, `cf/wrangler.toml`, `cf/src/index.js`, `tools/build.mjs`, `data/mascot.js`, and the git log for design intent (commits 07120db, 198186e, e84f783, c476232, 6cfa4c4, 640049f, 230b7fc).
- Ran the built `index.html` from a local static server and drove it in headless Chrome at **375×812 (iPhone), 320×568 (small phone), 1280×800 (desktop)**, dark and light `prefers-color-scheme`. Clicked through: Study home → Smart Review (8 cards, flip, grade, done) → 10k setup → 15-card 10k session → summary; Drill setup + card; Input → "Show me 3 things" → Log panel; Write; Kana setup + Chart; Scripts list + rehearse; Browse. Measured element boxes with `getBoundingClientRect`, read computed styles, and watched the console/network.
- A subagent did a line-by-line semantic/a11y/copy sweep of the JSX; its findings are folded in with citations.
- **What I could not do:** sign in with Google (not attempted), hear TTS (local server 404s `/.netlify/functions/tts`, so the app fell back to `speechSynthesis`/silence), sync (POST → 501), or load `videos.json` (404 locally — Input returned one pick instead of three). The app handled every one of these *silently*: no banner, no toast, the 🔊 button just does nothing. I compared the live Worker with `curl` (headers, build number, SPA fallback) but did not interact with it.
- Screenshots are described in words inline ("observed:").

---

## Per-tab walkthrough (375×812, fresh deck)

| Tab (label) | Purpose | First impression | Issues observed |
|---|---|---|---|
| **Study** | FSRS flashcards, buddy, streak, 49 section chips, Smart Review | Strong hero ("821 / NEW WORDS READY TO LEARN"), buddy card, purple "🧠 Smart Review · 8 cards" CTA. Polished. | 49 glass chips with `backdrop-filter` — off-screen chips painted as blank gradient slabs for a frame while scrolling (compositor lag). "1 words · new" (L1895). Section names "3-7R", "4-7R", "7/22" cryptic. No Quit in session. Card flip screenshot caught mid-transition (0.5s) — fine, but grade buttons appear *before* the back face is readable. "Go again / Done" not full-width. Streak 0 after studying (evening). |
| **10k** (Freq) | Tier-1 frequency deck, daily quota | Clean hero "15 / IN TODAY'S SESSION", one card, orange "Start session". | Tab name cryptic. Intro copy developer-facing ("Every review is logged: result, streak, level, and think time"). **Session-complete screen is visually broken** (see High-1). `<h2>` unstyled. |
| **Drill** (ConjDrill) | Conjugation grid drill | Card with heading "Conjugation", 6 type chips, 9 form chips, session sizes. | 8 of 9 form chips default-selected in *white* → wall of white pills; "just one" is a mode, not a form, but styled the same. Start button is grey (not primary) unlike every other tab's start. Two "selected" styles on one screen (white pill vs vermilion pill). Card back shows only kana answer (すきでした) — kanji form not shown. |
| **Input** (入力) | Pick what to watch/read; log minutes; rate difficulty | Bilingual chips ("Listen 聞く"), two level bars, big orange "Show me 3 things · 15 min". | **Stray bordered box around the whole tab** (`.tc-input` collision). No heading/intro — opens cold on level bars. Bilingual `<small>` is 10px. Log panel: white input on dark UI (only white field in the app besides Scripts), the verdict chip *is* the submit (no "Log it" button). Picks returned 1 not 3 (local 404). Difficulty dots + label good. "Not for me" is permanent with no un-hide. |
| **Write** | Handwrite the Japanese for a meaning | Cream canvas card, "Show guide / Clear / Reveal". | The prompt ("school") is 15px italic 60% white — the least prominent thing on screen. Canvas `height:240px` fixed. Sequential "1/821" with no skip. No keyboard/typed alternative. |
| **Kana** | Hiragana/katakana handwriting drill + chart | Three chip rows then hero "0 / OF 46 MASTERED". | Chip bar is 3 rows (+ progress line) before content; "46" chip is the base set; "all" orphaned on its own row. Chart cells' stats only in `title=` tooltips (L2878). Mastery is colour-only (kn-good/mid/weak). Untouched cell rōmaji ≈2.55:1. |
| **Scripts** | Dialogue rehearsal with furigana + TTS | "Your scripts" + orange "+ New script", 34 rows. | Every row has a one-tap permanent ✕ (L3699). Names are "2-1", "3-2 drill" with no preview. Rehearse: 4-up mode buttons wrap to 3 lines each ("② My part: Kanda"); 🔊 button has no aria-label (L3653); seed scripts render 0 `<ruby>` (no furigana tokens), despite the empty-state promise "furigana over every kanji". |
| **Browse** | Deck list, filters, sync, backup/restore, clear | Stat strip (821 / 0 / 8 / 813), sync box with Google button, search, filter chips, cards. | **Readings hidden on phones** (High-2). All 821 rows rendered. "needs review" pill on a 100%-correct card seen once (L4041 `lvl<2`). Sync status only here and only behind scrolling; no sign-out anywhere (`signOutGoogle` L1041 has no call site). Delete ✕ no confirm. |
| (Sentences, Add) | — | — | Dead code: never rendered (`<Sentences`/`<Add` have no call sites). `goAdd` → `setTab("browse")` (L1475). |

---

## 1. Visual design

### What the system is
- Tokens at L5606-5610: `--ai` indigo, `--shu` vermilion (朱), `--washi` paper, `--mut/--mut-2` muted, `--violet`, radii 9/12, `--tap:46px`. Page background is a 4-layer radial/linear gradient (L5615-5619) plus a fixed SVG-noise overlay (L6076-6077). Cards are translucent white with `backdrop-filter: blur(9–22px) saturate(150%)`.
- Typography: system sans (`-apple-system … Segoe UI Variable … Roboto`), `ui-monospace` for eyebrows/rōmaji, Japanese stacks `"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",Meiryo` applied per class (`.tc-term` L5738, `.tc-reading` L5744, `.tc-kanach` L5855, `.tc-sentjp` L5945, etc.). `.tc-jp` (L5623) is defined but never used.
- Sizes: term 54px (46px ≤560px), reading 34px, meaning 20–26px, kana cell glyph 24px, furigana `rt` 0.42em of 26px ≈ 11px.

### Findings

**V-1 (Medium) — Two "selected" idioms and two "primary" idioms coexist.**
Where: white pill = `.tc-tab.is-on` L5646, `.tc-conjchip.is-on` L5992 (Drill + 10k quota); vermilion fill = `.tc-fchip.is-on` L5906, `.tc-segbtn.is-on` L5666, `.tc-rpill.is-on` L5757, `.tc-szbtn.is-on` L5675 (washi). Observed on Drill: six type chips (white-when-on) sit directly above nine form chips (also white-when-on) above session-size chips (vermilion-when-on), and the Start button is plain grey while 10k/Kana/Input use orange `tc-btn-primary`.
Why: a student learns "orange = on / orange = go" on Study and Kana, then Drill flips it. The 8 white default-on form chips read as disabled/blank.
Fix: pick one. Recommend vermilion fill for *selected* everywhere (`.tc-conjchip.is-on{background:var(--shu);color:#fff}`), keep white only for the tab bar; make every "Start" `tc-btn-primary`; render multi-select form chips with a leading ✓ glyph so "9 selected" doesn't look like "9 blank".

**V-2 (Medium) — Emoji carry semantic weight as icons.**
Where: 🧠 Smart Review (L1828), 🩹 Trouble words (L1836), 🔊 Voice (L1964, L3446), 🐢 Slow (L3627), ✨ hook (L2021), 💾 Backup (L3999), 🔄 Sync (L3965), ⚠️ banners, 📷 in Add help. Section art is also emoji (`sectionArt` L2163 picks the most-used emoji; observed 🙇 used for three different sections, ✝️ and 🙏 for others).
Why: emoji render differently on iOS/Android/Windows (the student's phone vs. a lab PC), sit off-baseline in buttons, and are announced literally by VoiceOver ("brain Smart Review 8 cards"). Duplicated section art weakens the "recognisable" intent of commit 198186e.
Fix: wrap decorative emoji in `<span aria-hidden="true">` (already done for `.tc-batchicon` L1893 — extend it); for the 5–6 recurring glyphs use inline SVG (Lucide-style, `currentColor`) so they track text colour and theme; when `sectionArt` would duplicate an emoji already used, fall back to the section number badge.

**V-3 (Medium) — Visual hierarchy inverts on Write.**
Where: `.tc-sentgoal{font-size:15px;color:rgba(255,255,255,.6);font-style:italic}` L5943 used for the prompt at L3783. Observed: "school" is the smallest, dimmest text on the card; the empty canvas is the loudest.
Fix: give Write its own prompt style — 26px/600 white (reuse `.tc-prodprompt` L5828) — and keep the eyebrow for the "1/821" counter.

**V-4 (Low) — Japanese font handling is good where it is explicit, absent where it isn't.**
Where: `.tc-conjrule`, `.tc-conjask`, `.tc-incover` (has stack), `.tc-sentgoal`, `.tc-kanaprompt` (rōmaji, fine), `.tc-inpickja`, `.tc-bi small`, `.tc-batchnum` (section names are English), `.tc-prow-mean` (meanings contain に/〜 fragments), `.tc-rowread` (the reading!) have no JP stack. The pitch-accent marks `⸢ ⸣` are rendered in `var(--mono)` (`.tc-romaji` L5746 shows `card.pitch`), and U+2E22/2E23 are missing from SF Mono/Menlo — expect fallback glyph swaps on some devices.
Why: on Windows/Android, mixed runs fall back to a different CJK face mid-line; kana in a Latin mono face looks wrong.
Fix: define `.tc-root :lang(ja){font-family:<JP stack>}` once and add `lang="ja"` to the Japanese containers (see A-4); put `"Hiragino Sans","Noto Sans JP"` in front of the mono stack for `.tc-romaji` when pitch is shown, or render pitch marks in a separate span with the JP stack.

**V-5 (Low) — Tiny type.** `.tc-flipcue` 9.5px (L5743), `.tc-kanar` 9.5px (L5856), `.tc-bi small` 10px (L6046), `.tc-sumitem span` 10px (L5898), `.tc-batchhead>span` 10.5px (L5672), `.tc-bubblewho` 10.5px (dead). Letter-spaced mono eyebrows at 11px are fine as labels, but 9.5–10px *content* (rōmaji under a kana cell, Japanese under a chip) is below iOS's 11pt minimum.
Fix: floor content text at 11.5px; the kana-cell rōmaji can be 11px with `.tc-kanacell{min-height:60px}`.

**V-6 (Low) — Brand block.** `<h1>単語帳 <span class="tc-build">b59</span></h1>` (L1459) puts a build number in the product name; the `朱` seal (L1457) is a decorative kanji unrelated to 単語帳; subtitle "jpn 101 · flashcards · 821 words" is `text-transform:lowercase` (L5637) so "JPN 101" prints as "jpn 101".
Fix: move `b59` to the Browse › More panel or a `title=`; seal could be 単 or the nigiri; drop the lowercase transform.

**V-7 (Polish) — Light-theme remnants.** `.tc-hookbtn:hover{background:rgba(43,38,32,.06)}` L5878 darkens a button on a dark background; `.tc-sentbig{color:var(--sumi)}` L5944 and `.tc-sentresult.ok{color:#2e7d32}` L5957 (3.3:1 on the card) are dark-on-dark; `.tc-senthint`/`.tc-sentfeedback` (L5955, L5961) are washi panels from the light design used by dead Sentences code. `--line`, `--sumi` survive only for the two white inputs.

**V-8 (Polish) — CSS hygiene that affects presentation.** `.tc-seg` is defined twice with incompatible meanings (segmented control L5661; 20×4px meter bar L5918 — only the latter is used, at L4051). Four classes are used but never defined (`tc-front`, `tc-kana`, `tc-study`, `tc-sumgrid`); ~40 are defined but unused (oral/coach/tc-row family, `kn-*`, `tc-toggle`, `tc-field`, `tc-controls`, `tc-sizesel`…). 22 inline `style={{}}` blocks, concentrated in Browse's sync/backup panels (L3964-3985, L3992-4026). Not user-visible per se, but it's how the `.tc-input` and `.tc-rowread` collisions happened.
Fix: delete the Oral/Sentences/Add/coach CSS and components together; run a one-off "used vs defined" diff (the two `sort -u` lists take 30 seconds) before each release.

---

## 2. Layout and responsiveness

Observed: no horizontal overflow at 320/375/1280 on any tab (`scrollWidth === innerWidth` everywhere I checked). The 660px `.tc-shell` column centres on desktop; the app is essentially a phone layout at every width, which is appropriate.

**L-1 (High) — 10k session-complete screen is broken.**
Where: Freq renders `<div className="tc-summary"><h2>セッション終了！</h2><div className="tc-sumgrid">…</div><div className="tc-gradebtns">…</div></div>` (L5545-5556). `.tc-summary{display:flex;gap:8px;margin-bottom:12px}` (L5895) is the *horizontal* stat strip for Browse; `.tc-sumgrid` is undefined; `<h2>` is unstyled.
Observed at 375px: the heading becomes a 50px-wide column with one character per line (セ/ッ/シ/ョ/ン/終/了/！), the three stats stack in an 87px column, and "Back" / "Extra practice" stretch to ~400px tall. Measured children: H2 50px, DIV 87px, DIV 190px wide, all on one row.
Why: this is the screen a student sees at the end of every daily 10k quota.
Fix: reuse the Study done pattern — `<div className="tc-done"><p className="tc-eyebrow">Session complete</p>…` — or add `.tc-freqdone{display:flex;flex-direction:column;gap:14px;align-items:stretch}` and `.tc-sumgrid{display:flex;gap:8px}`; style the h2 like `.tc-conjtitle`.

**L-2 (High) — Browse hides readings on phones.**
Where: `@media (max-width:560px){ .tc-row{…} .tc-rowread,.tc-rowstat{display:none;} }` L5809-5813 — written for the old grid rows (`.tc-row`, now unused). The current rows use `.tc-prow-top .tc-rowread` (L4045) for reading + rōmaji.
Observed: every Browse row on a phone shows "🙇 感謝します ✕" with no かんしゃします. On desktop the reading appears.
Fix: scope to `.tc-row .tc-rowread,.tc-row .tc-rowstat{display:none}` or delete the block; optionally wrap `.tc-prow-top` so reading drops to its own line under 400px.

**L-3 (High) — No safe-area insets in standalone mode.**
Where: `index.html` L5-7 sets `viewport-fit=cover`, `apple-mobile-web-app-capable=yes`, `black-translucent`; `.tc-root{padding:22px 16px 44px}` L5621; nothing references `env(safe-area-inset-*)`.
Why: when the student adds the app to the home screen (which the meta tags invite), the status bar overlays the brand block and tab row; on a landscape or home-indicator device the grade buttons can sit under the gesture bar. In Safari-tab mode this is invisible, so it's easy to miss.
Fix: `.tc-root{padding:calc(22px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(44px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));}`. If the tab bar ever becomes fixed-bottom, give it `padding-bottom:env(safe-area-inset-bottom)` too.

**L-4 (High) — The 8-tab pill wraps.**
Where: `.tc-tabs{display:flex;flex-wrap:wrap;border-radius:999px;width:fit-content}` L5640-5641, `.tc-tab{min-height:42px;padding:8px 15px}` L5643.
Observed: 375px → 2 rows (Study 10k Drill Input Write / Kana Scripts Browse), 320px → 3 rows with Browse alone; the pill is ~100px tall at 375 and ~140px at 320; the header+tabs consume 180–230px of an 812/568px viewport before any content; tabs measure 42px tall (56–79px wide). With the rows uneven, the pill's 999px radius reads as a blob.
Why: daily-use phone app; the primary action drifts below the fold on shorter phones (at 320×568 the Smart Review button is off-screen).
Fix options (in order of effort): (a) single-row horizontal scroll — `.tc-tabs{flex-wrap:nowrap;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;max-width:100%;scrollbar-width:none}` and `.tc-tab{scroll-snap-align:start;min-height:44px}`; (b) a fixed bottom bar with 5 icons+labels (Study, 10k, Kana, Scripts, More) — the iOS idiom for a study app, thumb-reachable, and it frees the top; (c) fold Drill/Write/Input/Browse under "More".

**L-5 (Medium) — Tap targets under 44px.**
Measured at 375px: `.tc-rpill` (Rōmaji/Pitch/Voice toggles) 86–91×26–28px (L5753-5755); `.tc-speakbtn` 32×24px (L5994) — the pronunciation button, used every card; `.tc-del` 32×32 (L5788); `.tc-inx` ×-dismiss 32px (L6058); `.tc-tab` 42px; `.tc-szbtn` ~26px (unused now); `.tc-kanacell` 64×57 OK; grade buttons 167×46 OK; `.tc-fchip` 36px (L5903).
Fix: `--tap:44px` applied as `min-height` to `.tc-rpill/.tc-fchip/.tc-del/.tc-inx/.tc-tab`; for `.tc-speakbtn` keep the visual 32×24 but add a 44×44 hit area: `position:relative;` + `::after{content:"";position:absolute;inset:-10px}`.

**L-6 (Medium) — Scripts rehearse mode row doesn't wrap.**
Where: `.tc-sentmodes{display:flex;gap:8px}` L5935 with 4 `.tc-segbtn` (L3625-3630).
Observed at 375px: "② My part: Kanda" and "② My part: Sasha" each break into 3 lines; buttons are 85px wide × 130px tall.
Fix: `flex-wrap:wrap` + shorter labels ("① Read", "② Kanda", "② Sasha", "③ Both") with the role explained once in the ladder line above.

**L-7 (Medium) — Kana chip bar is three rows before the content.**
Where: `.tc-kanabar` L5848, three `.tc-kanaseg` groups (L2831-2849).
Observed: ひらがな/カタカナ · 46/dakuten/combos/marks/extended · all (orphan) · Practice/Chart, then the progress line, then the hero — ~190px of controls. Commit e84f783 fixed overflow; the density remains.
Fix: move Practice/Chart to a two-option segmented control in the hero area; collapse the set chips behind "Sets ▾ (46)" with a bottom sheet; or render the set chips as a single scrollable row with `.tc-kanaseg{flex-wrap:nowrap;overflow-x:auto}`.

**L-8 (Medium) — Study home: 49 glass chips.**
Where: `.tc-batchchip`/`.tc-batchglass` with `backdrop-filter:blur(9px)` per chip (L5677-5687); 49 rendered (L1886-1902).
Observed: scrolling the home screen at 375px, chips below the fold painted as flat gradient rectangles with no glass/text for a frame (screenshot caught it) — the compositor couldn't keep 49 blurred layers hot. On a mid-range Android that is visible jank.
Fix: drop `backdrop-filter` on chips (the gradient + 1px border already reads as glass), or apply it only to the first ~12 and use a solid `rgba(255,255,255,.08)` below; group sections by Act with collapsible headers so the default view is ~10 chips.

**L-9 (Low) — Fixed-height canvases.** `.tc-canvaswrap{height:240px}` L5974 (Write, Kana). On a 320-wide phone in landscape or with the keyboard up that's fine, but on a 430×932 phone it's small for multi-character words; on desktop it's tiny.
Fix: `height:clamp(200px, 38vh, 360px)`.

**L-10 (Low) — Keyboard avoidance.** Inputs are few (Scripts new-script name/textarea L3595-3596, Browse search L3988, restore textarea L4015, Input log/link/coverage L4895-4923, mnemonic L2011). None scroll themselves into view and the page has no `scroll-padding`; the mnemonic input sits at the bottom of a 300px card so iOS will scroll the card half off. `.tc-sentinput{font-size:18px}` avoids iOS zoom; `.tc-search` is 14px and `.tc-mnin` 14px → **iOS Safari zooms the page on focus** (<16px).
Fix: `font-size:16px` minimum on every input; `html{scroll-padding-bottom:40vh}`.

**L-11 (Low) — Desktop.** At 1280×800 everything sits in a 660px column; the hero number is 96px; fine. Hover styles exist (`.tc-tab:hover`, `.tc-btn:hover`, `.tc-batchchip:hover` glow) but are not gated by `@media (hover:hover)`, so on touch they stick after a tap (the "sticky hover" white tab label).

---

## 3. Interaction design

**I-1 (High) — Tab switch destroys a running session; Study has no Quit.**
Where: tab content is chosen inline (L1474-1490), so Study unmounts on any tab tap; Kana (L2759) and Drill (L5103) have a "Quit" chip in the progress row; Study's progress row (L1946-1966) has Rōmaji/Pitch/Voice only.
Why: the tab row is 20px above the card on a phone — a thumb slip ends the session with no "are you sure" and no "resume". Individual card results are saved, but the session framing (combo, first-try set, missed list, done screen) is lost.
Fix: add the same `Quit` chip to Study; when `running`, either confirm before `setTab` or keep `running`/`queue` in the parent (or `sessionStorage`) so returning to Study resumes.

**I-2 (High) — Streak/buddy is wrong after an evening session (timezone).**
Where: `logDay` key `new Date().toISOString().slice(0,10)` (L1212, UTC date); `streakFrom` builds `today` at local noon and keys via `toISOString()` (L1225-1229) — also UTC but of a *different instant*; `todayKey` in Study (L1619) matches `logDay`.
Observed (20:50 PDT): after 8 reviews the buddy card read "Nice — that's a start. · 0 days in a row · 0 words solid · 8 today". The mascot state was "happy" (uses `todayRev`), but the streak stat — the hook that brings a student back tomorrow — said 0.
Fix: one helper `const dayKey = (d=new Date()) => { const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); }` used by `logDay`, `streakFrom`, `todayKey`, Freq's `todayNew`, and Input's week log; migrate old UTC keys once.

**I-3 (Medium) — Feedback on actions is mostly absent or silent.**
- TTS: `speakJa` (L3394-3436) chains cached GET → authed GET → `speechSynthesis`; every failure path is swallowed. The 🔊 button has no pressed/playing/failed state; "🔊 Voice on" is shown in Study/10k/Drill even when `TTS_OK` is false (only Scripts shows "This device has no speech voices available", L3635). Observed locally: 14 TTS 404s, zero on-screen indication.
- Sync: status is only in Browse (L3964-3978) and only as a dot+label; failures (`pending`) never surface on the Study screen where the student actually is.
- Grading: no toast/undo; `aria-live` region never written (L2037).
- Input log: tapping a verdict chip logs and flashes "Logged N min" for 2.6s (L4581, L4890) — there is no visible "Log" button, so the chip doubling as submit is discoverable only by accident.
Fix: a single `<Toast/>` slot at the bottom of `.tc-shell` fed by a tiny event bus (`flash("Saved")`, `flash("Audio unavailable on this device")`); a sync dot in the header (`●` green/amber/red + tooltip text) that is tappable → Browse; speaker button gets `.is-playing` (pulse) and `.is-failed` (strike-through) classes; show "Undo" for 4s after a grade.

**I-4 (Medium) — Destructive actions without confirmation or undo.**
Where: delete card `.tc-del` L4046 → `removeCard` immediately; delete script L3699 (loses the Claude-annotated furigana that cost an API call); "Not for me" L4865 permanently hides a source with no un-hide UI; only "Clear all" has a two-tap confirm (L4001-4009), which is a plain `<span>` with no focus move.
Fix: two-tap pattern for every ✕ (first tap turns the ✕ into "Delete?" for 3s), or soft-delete with a 5s "Undo" toast; move the script ✕ off the list row into the rehearse header; add "Hidden sources (3) — show" under Input › Coverage.

**I-5 (Medium) — Empty-deck dead end.**
Where: Study empty state → `goAdd` → `setTab("browse")` (L1475, L1780); `Add` component (L4067) is never rendered; Browse has Restore but no Add.
Why: after "Clear all" (which exists in Browse) the student is told "Add your first words" and lands on a search box.
Fix: either mount `<Add>` inside Browse › More (it's 40 lines and already written) or change the CTA to "Restore a backup" and route to `showMore+showRestore`.

**I-6 (Medium) — First-run sign-in is undiscoverable.**
Where: the Google button only mounts in Browse (L3982). Study home never mentions sync; a new phone studies for days locally.
Fix: if `!loadSession()` and `cards.some(c=>c.seen)` show a one-line dismissible card under the buddy: "Sync to your account so this progress survives a new phone → Sign in". Also expose sign-out (`signOutGoogle` L1041 has no call site).

**I-7 (Low) — Loading and empty states are adequate but plain.** "Loading your deck…" (L1473) appears in a bare `.tc-empty` box with no brand; first paint of a 549KB HTML on 3G is 1–3s of blank `#1a1a2e` then this text. Kana's extended-only empty state (L2860-2868) is a good model — explains *why* and offers a way out.
Fix: render the brand block + tab bar skeleton before `ready` (they don't depend on data), and a 3-line skeleton for the hero.

**I-8 (Low) — Discoverability of power features.** Keyboard shortcuts are only on the Study setup hint (L1909); Kana chart per-cell drill is a tooltip+hint; Browse › More hides Backup/Restore/Clear (good) but also hides the *only* place the backup nag appears (L3993-3996) — a student who never taps More never sees "Last backup was 30 days ago".
Fix: surface the backup nag on Study home when `lastBk` > 14 days and not signed in.

---

## 4. Information architecture

- **Live tabs (L1464):** `Study · 10k · Drill · Input · Write · Kana · Scripts · Browse`. The brief's "Sentences" and "Add" are dead code (`function Sentences` L2354, `function Add` L4067 — no render sites). So the real question is 8 tabs, not 10.
- **Naming mixes registers:** Study (verb), 10k (a deck name/size), Drill (means conjugation only), Input (SLA jargon; commit c476232 already recognised the Japanese-only labels were backwards), Write, Kana, Scripts, Browse. A student's mental model is *what* (vocab, kana, grammar, dialogues, listening/reading) and *how* (flashcards, write, chart).
- **Ordering** puts the two "extra" decks (10k, Drill) before the core practice modes and puts Browse (which also holds sync/backup/sign-in — i.e. *Settings*) last with a name that hides that.
- **Redundancy:** Study vs 10k are the same flashcard UI on two decks with two schedulers and two done screens (one broken); Write is "Study, production direction, on a canvas"; Browse's filters duplicate Study's "Weak" button. Kana's chart and Browse's list are both "inventory" views.

**IA-1 (Medium) — Recommended structure (one possible shape):**
- Bottom bar, 5 items: **Study** (vocab deck + 10k as a *deck switcher* inside Study, not a tab) · **Kana** · **Grammar** (= Drill, renamed) · **Practice** (Write + Scripts + Sentences-if-revived, as segmented modes) · **More** (Input/"Watch & Read", Browse/"Deck", Sync & Backup/"Account").
- Rename `10k` → "Core 10k" inside a deck picker ("Class deck · 821" / "Core words · 148"), `Input` → "Watch & Read" with 入力 underneath (the Bi pattern already exists), `Browse` → "Deck".
- Keep the Study home as the *home screen*; it already behaves like one (buddy, hero, CTA).

**IA-2 (Low) — Section names.** "3-7R", "4-7R" (R = ?), "7/22" (class-notes dates), "Act 2 Dry Run", "Culture talk" — `hueFor` (L2157) assigns colours by hash so adjacent lessons get unrelated hues. Group chips under Act headers (Act 1 · Act 2 (2-1…2-8, Dry Run) …) and colour by Act; expand "R" in the label ("3-7 review").

---

## 5. Accessibility

(Detailed sweep by line; the subagent report is the source for most citations.)

**A-1 (High) — Form controls have no labels.** There is not a single `<label>` in the file; every input is placeholder-only: mnemonic L2011, Scripts name/textarea L3595-3596, Browse search L3988 (no `type="search"`), restore L4015, Input log L4895, link URL L4913 (no `type="url"`/`inputMode`), link title L4914, coverage L4923. Placeholders vanish on focus and are not labels for AT.
Fix: `<label className="tc-sr" htmlFor=…>` or `aria-label` on each; `type="search"`/`type="url"`; on Japanese-input fields add `lang="ja" autoCapitalize="off" autoCorrect="off" spellCheck={false}`.

**A-2 (High) — Tabs pattern is incomplete.** `<nav role="tablist">` (L1463) overrides the nav landmark; tabs have no `id`/`aria-controls`; there is no `role="tabpanel"`; no roving `tabIndex`/arrow keys — 8 separate tab stops; switching tabs moves no focus and announces nothing.
Fix: either drop `role=tablist/tab` and use `<nav><button aria-current="page">` (honest, simple), or complete the pattern (`aria-controls`, `tabpanel` wrapper with `tabIndex=0`, ←/→ handling, `tabIndex=-1` on inactive tabs).

**A-3 (High) — Flashcards are `role="button"` divs containing real buttons/inputs.** Study card L1968-1969 contains `SpeakBtn` (L1986, L2001), `<input className="tc-mnin">` (L2011), `.tc-hookbtn` (L2021); Drill L5107 and Freq L5569 contain `SpeakBtn`. Nested interactive content inside a button role is invalid and confuses VoiceOver's swipe order. The cards also lack `onKeyDown` — Study flips via a `window` keydown (L1764-1774; Space on any focused `<button>` both activates it *and* flips; Backspace is swallowed); Drill and Freq have no keyboard flip at all. The `:focus-visible` ring rule (L6078) targets `button,[role="tab"]` so the three `role="button"` cards have **no visible focus**.
Fix: make the card a `<button type="button" class="tc-card">` whose *children are non-interactive*, and move Speak/hook/mnemonic below the card (they already `stopPropagation`, so the intent is there); add `[role="button"]` to the focus-visible selector; scope the key handler to the card element.

**A-4 (High) — `lang` is inverted.** `index.html` L2 `<html lang="ja">` while ~95% of UI text is English; zero `lang="ja"` attributes in the JSX (card term/reading L1985-1986, kana cells L2880, `.tc-sentjp` furigana L3644, conj answers L5118, Browse rows L4044-4045, the `Bi` span L4510 mixes EN+JA in one node).
Why: screen readers read "Reveal answer" with a Japanese voice and 感謝します with — also Japanese, by luck. Browser auto-translate offers to translate the *English* UI. Font selection for ambiguous CJK glyphs is right by accident; Chrome's `lang=ja` also changes line-breaking and quote glyphs for the English copy.
Fix: `<html lang="en">`; `lang="ja"` on `.tc-term`, `.tc-reading*`, `.tc-kanach`, `.tc-sentjp`, `.tc-conjanswer`, `.tc-rowterm`, `.tc-rowread`, `.tc-writeanswer`, `.tc-incover`, `.tc-kindchip`; split `Bi` into `<span>{en}</span><small lang="ja">{ja}</small>`; add a `[lang=ja]{font-family:<JP stack>}` rule.

**A-5 (Medium) — The only `aria-live` region is inert.** `liveRef` (L1528) attached at L2037, never written. Grades, "Session complete", sync changes, Input toasts (`.tc-innote` L4890) are all silent.
Fix: write `liveRef.current.textContent = got ? "Got it" : "Missed"` in `grade()`, and make the toast slot `role="status"`.

**A-6 (Medium) — Colour-only signals.** Kana chart mastery (`kn-good/mid/weak` L5858-5860, untouched at 55% opacity) has no glyph or text; sync dot L3969 has no `aria-hidden` and `idle`/`saved` share one green; Browse mastery meter (L4050) has `aria-label` ✓; Input difficulty dots have a text label ✓ (L4832); combo colours are decorative ✓.
Fix: tiny ✓ / · / ✕ glyph or a 2px bottom border pattern on kana cells plus the stats moved from `title=` into the cell (`.tc-kanar` could show "ka · 80%").

**A-7 (Medium) — Canvas-only tasks.** Kana drill (L2768) and Write (L3787) are pointer-only `<canvas>` with no role/label and no typed alternative. For a keyboard, switch-access or screen-reader user those tabs are unusable; for everyone else a typed-kana fallback ("type it" toggle) is also a genuinely useful study mode.
Fix: `role="img" aria-label="Writing pad — draw here"` on the canvas plus a "Type instead" toggle that swaps in an `<input lang="ja">` graded by `norm()` (the helper already exists at L2210).

**A-8 (Medium) — Headings.** Four headings total: `h1` brand (L1459, includes "b59"), `h2` Conjugation (L5180), `h2` Frequency 10k (L5521), `h2` セッション終了！ (L5548). Study/Kana/Write/Scripts/Browse/Input have none; section titles are `<p class="tc-eyebrow">`.
Fix: make each tab's first eyebrow an `<h2 className="tc-eyebrow">` (same look), e.g. "Session complete", "Your scripts", "Sync across your devices".

**A-9 (Medium) — Reduced motion and the GIF.** `@media (prefers-reduced-motion:reduce)` kills all CSS transitions/animations (L5814-5816, L6027, L6079 — note `.tc-root *` with `!important` also stops the progress-bar width transition, fine). The mascot is an animated GIF (L1250-1254, `data/mascot.js`) which **cannot** be paused by CSS; commit 6cfa4c4's own note flagged this before the GIF switch in 640049f.
Fix: keep the GIFs, but under reduced-motion render a static first-frame PNG (make-mascot.mjs can emit one per mood; ~300 bytes each) — `const still = matchMedia('(prefers-reduced-motion: reduce)').matches;`.

**A-10 (Low) — Tooltips on touch.** `title=` is the only explanation of "extended" (L2840), "all/only 46" (L2843), kana cell stats (L2878). Invisible on phones.
Fix: move text into the UI (a `.tc-smarthint` line under the chips; stats inside the cell or in a tap-to-reveal sheet).

**A-11 (Low) — Emoji-only/nameless buttons.** Scripts 🔊 (L3653) has no `aria-label`; "＋ふりがな" (L3697) becomes "…" while building; `aria-label="dismiss"` (L4780) lowercase vs "Delete …" pattern. `SpeakBtn` (L3446) has the label ✓.

**A-12 (Low) — Focus order and dialogs.** "Clear all → Delete everything? Yes/No" (L4001-4009) is an inline span; focus stays on the now-unmounted button. Add `role="alertdialog"`-lite: move focus to "No", Escape cancels.

### Contrast (computed from the CSS palette over the mid-page background ≈ #141b38)

| Pair | Ratio | WCAG AA | Where |
|---|---|---|---|
| `--mut-2` #9aa3bd on page | 6.7:1 | pass | most secondary text |
| `--washi` #f2ecde on page | 14.3:1 | pass | body text |
| active tab #141a33 on white 94% | 15.2:1 | pass | L5646 |
| inactive tab #9aa3bd on pill | 5.5:1 | pass | L5642 |
| white on primary gradient start #d8482f | 4.3:1 | **fail** (15px/600 is not "large") | L5705 |
| white on primary gradient end #e86a3c | **3.2:1** | **fail** | L5705 — right half of every orange CTA |
| white on "Got it" #3d9150 | **3.9:1** | **fail** | L5711 |
| flip cue white 40% (9.5px) | **3.75:1** | **fail** | L5743 |
| hero sub / eyebrow white 50–55% | 5.1–5.9:1 | pass | L5657, L5649 |
| untouched kana rōmaji (mut-2 × .55) | **2.55:1** | **fail** | L5856 + L5857 |
| furigana `rt` `--shu` #d8482f on card (~11px) | **3.9:1** | **fail** | L5946 |
| `.tc-senthint` #7d7361 on #ece4d2 | 3.7:1 | fail (dead code) | L5955 |
| `.tc-sentresult.ok` #2e7d32 on card | 3.3:1 | fail (dead code) | L5957 |
| leech amber #e6a23c | 7.7:1 | pass | |
| combo green #8fd6a0 | 9.9:1 | pass | |
| sync dots green/amber/red | 9.5 / 11.7 / 7.4 | pass | L3815-3820 |

Fixes: primary gradient `#c63f28 → #d8582f` (white ≥4.6:1 at both ends) or darken text-shadow; "Got it" `#2f7a42`; flip cue `rgba(255,255,255,.62)` and 11px; `.tc-kanar` 11px and `.kn-untouched{opacity:.8}` (or dim only the glyph, not the rōmaji); `rt` colour `var(--shu-soft)` (#e06848 = 5.0:1) and `.tc-sentjp ruby rt{font-size:.5em}`.

---

## 6. Performance as it affects presentation

- **Payload:** `index.html` 549,163 B (gzip 147.8 KB locally; the Worker served 226 KB with `Accept-Encoding: br, gzip`). Of the JSX source, the inlined `SEED` (L17-861) is ~133 KB and CSS ~40 KB; React+ReactDOM are inlined; the 5 mascot GIFs total 3.4 KB (`data/mascot.js`). `videos.json` (145 KB) is a separate fetch cached in `localStorage` (L4194-4207). The Google GSI script is `async defer` (index.html L11).
- **Caching:** live headers `cache-control: public, max-age=0, must-revalidate`, `cf-cache-status: HIT` — every open revalidates; with no service worker there is no offline and on a flaky connection the student sees the `#1a1a2e` body until the whole script arrives. Inline `<style>` in `<head>` only sets the body colour; the React tree injects `<style>{CSS}</style>` (L1446) — so first paint is a blank indigo page, then everything at once.
- **Paint cost on phones:** `backdrop-filter` on tabs (L5640), 49 batch chips (L5685), both flashcard faces (L5729 — during the 3D flip *both* blurred faces composite), `.tc-card2` (L5940), plus a full-viewport `position:fixed` `::after` noise layer with `mix-blend-mode:soft-light` (L6076-6077). Observed: off-screen chips painting as blank slabs while scrolling the home screen. Expect dropped frames on mid-range Android; iPhones cope.
- **Browse** renders all 821 `<li class="tc-prow">` at once (L4036-4062) with a 5-segment meter each; typing in search re-filters/re-sorts on every keystroke (`useMemo` helps, but the DOM diff is 821 rows).
- **Re-render hot spots:** `recordResult` maps the whole deck per grade (L1392-1439) and `JSON.stringify`s 821 cards to storage per grade — fine at 821, visible at 5k; Study's `useMemo`s over `cards` (ranked, weak, smartPool…) recompute per grade.
Fixes: drop `backdrop-filter` from `.tc-batchglass` and the noise `::after` (or gate both behind `@media (min-width:700px)`), keep it on the 1–2 hero cards; `content-visibility:auto` on `.tc-prow` (`contain-intrinsic-size: 0 96px`) or paginate Browse at 100 with "Show more"; add a minimal service worker (cache-first for `/`, `/videos.json`, and `/.netlify/functions/tts?*` responses which are already `immutable`) — this alone turns the app into an offline study tool.

---

## 7. Copy and microcopy

Tone is warm, honest and specific — "Nice — that's a start.", "Little and often beats a big catch-up.", "The researched default — reviews land just as a word starts to slip." This is a real strength; the buddy lines (L1640-1651) are the best copy in the app.

Issues:
- **Grammar/number:** "1 words · new" (L1895) — `b.cards.length` needs pluralisation like the streak line already does (L1795).
- **Developer-facing text in the UI:** "Every review is logged: result, streak, level, and think time." (L5523); error copy telling the student to "tell Claude the exact message in these parentheses" (L3562, L3576); "hit Backup in **Stats**" (L3513) — there is no Stats tab; "update pack from Claude" (L4014); "b59" in the h1.
- **Eyebrow casing is inconsistent:** lowercase "write this kana" (L2764), "nothing to drill" (L2862), "needs the most work" (L2804/2916/5153), "input you did somewhere else" (L4894) vs. "Session complete" (L1919), "Add words" (L4092), "How was it? · どうだった？" (L4775). Pick sentence case.
- **Toggle labels read as ambiguous state/verb:** "Rōmaji off", "Pitch on", "🔊 Voice on" (L1956-1964) — is "Voice on" the state or the command? Use `aria-pressed` (already there) + a fixed label ("Rōmaji", "Pitch", "Voice") with the on-state shown by fill.
- **Grade buttons differ per tab:** "Missed it / Got it" (Study, Drill, Freq, Write) vs "Got it ✓ / Missed ✗" *in the opposite order* (Kana, L2778-2779). Muscle memory matters here; unify order and wording (Missed left, Got it right, everywhere).
- **Spelling:** "Memorize" (L3621) vs "memorised" (L4120).
- **Japanese labels:** 単語帳 ✓, 入力 ✓ (as "input" in the SLA sense; a student might read it as "typing"), 漢字/ひらがな/カタカナ/混 kind chips ✓ (混 alone is cryptic — "混合"/"mix"), 朱 seal unexplained, セッション終了！ is the only Japanese heading. Bi labels (簡単すぎ / ちょうどいい / 難しい / わからなかった, 聞く/読む/ながら, 記録/リンク追加/カバー率/書き出し) are correct and natural.
- **Tab names:** "10k" and "Input" need a word a JPN 101 student would say out loud. "Drill" → "Grammar" or "Conjugate".
- **Hints that help:** "Tip: Space flips · → got it · ← missed" (L1909) is desktop-only advice shown on a phone; gate it with `@media (hover:hover) and (pointer:fine)`.
- **Cryptic chip names:** Kana "46" (base set), "marks", "extended"; Drill "just one".

---

## 8. Dark mode / theming

- The app is **dark-only**: `html,body{background:#0c1122}` (L5602), `<meta name="theme-color" content="#1a1a2e">`, no `prefers-color-scheme` anywhere. Light-scheme rendering at 1280×800 was identical to dark.
- Not necessarily wrong — a single deliberate look is defensible — but a student in a bright classroom or outdoors gets a low-luminance UI with 40–60% white secondary text. A light theme is also cheap here because the tokens already exist (`--washi`, `--sumi`, `--line`, `--ai` are the light palette from the original design and still used by `.tc-sentinput`, `.tc-rowkind`, `.tc-mnin`).
- Fix (Low): either (a) add a `@media (prefers-color-scheme: light)` block that remaps ~12 tokens (`--bg`, `--card`, `--text`, `--text-2`, `--line`) and switch the hard-coded `#fff`/`rgba(255,255,255,.x)` in the CSS to those tokens (about 60 occurrences), or (b) keep dark-only but state it: `<meta name="color-scheme" content="dark">` so form controls and scrollbars match, and bump secondary text to ≥60% white.

---

## 9. PWA-ness

- Present: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color`, `<title>単語帳 — tangocho</title>`, SPA fallback on the Worker (`not_found_handling = "single-page-application"`), `overscroll-behavior-y:none`, `touch-action:none` + non-passive touch blockers on canvases (L3741-3746).
- Missing: **`manifest.webmanifest`** (name/short_name 単語帳, `display: standalone`, `start_url: /`, `background_color #0c1122`, `theme_color`, icons 192/512 + maskable), **`apple-touch-icon`** (iOS home-screen icon is currently a screenshot of the page), **favicon** (`/favicon.ico` → 200 `text/html`, i.e. the whole 226 KB app, on every tab open in a desktop browser), **service worker** (offline + instant open), `<meta name="color-scheme">`. `apple-mobile-web-app-capable` without a manifest means Android gets nothing.
- Why it matters: this is a phone-first daily app; "open from home screen, works on the train" is the baseline. The noise layer + backdrop blur cost more battery than a SW costs bytes.
- Fix (Medium): add `manifest.webmanifest` + two PNG icons (the nigiri at 192/512 is on-brand and already rasterisable via `tools/make-mascot.mjs`) + `<link rel="manifest">`/`<link rel="apple-touch-icon">`/`<link rel="icon">` in `index.html`; a ~25-line SW with cache-first for `/` and `/videos.json`, network-first for `/.netlify/functions/*` and `/api/*`; serve `/favicon.ico` and `/manifest.webmanifest` as real assets in `cf/public`.

---

## What works well

- **A real design language.** Indigo/vermilion/washi tokens, one radius scale, `tabular-nums`, a mono eyebrow style used consistently, frosted cards with inset highlights — it looks like one product, not a pile of widgets.
- **Kanji legibility is taken seriously:** 54/46px term, 34px reading, explicit Hiragino/Yu Gothic/Noto JP stacks on the card faces, kana cells at 24px, `image-rendering:pixelated` for the mascot.
- **Honest, specific microcopy** on the home screen and done screens; the buddy's state is earned, not decorative (commit 2acc723/6cfa4c4 reasoning is visible in the UI).
- **Good a11y bones where someone thought about it:** `aria-pressed` on toggles (L1955-1963, L2839, L5193), `aria-label` on Speak/Delete/meter, `:focus-visible` rings (L5805-5807, L6078), two `prefers-reduced-motion` blocks, `.tc-sr` utility, `role="group"` + labels on chip groups (L5184-5190, L5525).
- **Destructive "Clear all" is two-tap; storage failure is surfaced with a one-tap Backup** (L1449-1453) — most student apps would silently lose data.
- **SYNC_UI** (L3815-3820) never lets a failed save look like success; "Retry now" appears only when it matters.
- **Canvas UX details:** DPR-aware setup, `setPointerCapture`, `touchmove` blocked non-passively so iOS doesn't pan while writing, resize re-setup.
- **Input tab's bilingual chips** ("Listen 聞く") are a lovely pattern — English leads, Japanese is picked up for free.
- **Empty states explain themselves** (Kana extended-only; Scripts; Input "nothing left at this level… reroll or add a link").
- **Performance hygiene elsewhere:** mascot GIFs 3.4 KB total, `videos.json` localStorage-cached, TTS prefetch for the next card, esbuild minified single file, GSI loaded async.
- **Hover states are subtle; active states scale .96–.97** — tactile without being noisy.

---

## Prioritised fix list

| # | Sev | Fix | Where |
|---|---|---|---|
| 1 | High | Fix 10k session-complete layout (`.tc-summary`/`.tc-sumgrid`) | L5545-5556, L5895 |
| 2 | High | Stop hiding `.tc-rowread` on phones (scope or delete the media rule) | L5809-5813 |
| 3 | High | Unify day-key (local date) for `logDay`/`streakFrom`/`todayKey` | L1212, L1225-1229, L1619 |
| 4 | High | `env(safe-area-inset-*)` padding on `.tc-root` | L5621 |
| 5 | High | Tab bar: single scrollable row or bottom bar; 44px tabs; confirm/resume on mid-session switch; add Quit to Study | L5640-5646, L1463-1490, L1946 |
| 6 | High | Labels on every input; complete or drop the tabs ARIA; un-nest interactives from card `role="button"`; `lang` fix | L1968, L1463, index.html L2 |
| 7 | High | Contrast: primary gradient, Got-it green, flip cue, kana rōmaji, furigana `rt` | L5705, L5711, L5743, L5856, L5946 |
| 8 | Med | Remove dead `.tc-input` (Oral) style so the Input tab loses its stray box | L5998-6010 vs L6040 |
| 9 | Med | One selected/primary idiom across Drill/10k/Kana/Study | L5646, L5666, L5906, L5992 |
| 10 | Med | Tap targets ≥44px (rpill, speakbtn hit-area, del, inx, fchip) | L5753, L5994, L5788, L6058, L5903 |
| 11 | Med | Confirm/undo on card & script delete; un-hide for "Not for me" | L4046, L3699, L4865 |
| 12 | Med | Toast slot + header sync dot + speaker playing/failed states + live-region writes | L2037, L3964, L3443 |
| 13 | Med | Manifest + icons + favicon + minimal service worker | index.html, cf/public |
| 14 | Med | Drop `backdrop-filter` from 49 chips and the noise overlay; `content-visibility` on Browse rows | L5685, L6076, L5909 |
| 15 | Med | Write prompt prominence; Scripts mode row wrap; Kana chip bar density | L5943, L5935, L5848 |
| 16 | Low | Copy: "1 words", "Stats", Claude-facing errors, eyebrow casing, grade-button order, tab names | L1895, L3513, L3562, L2778 |
| 17 | Low | Delete dead Sentences/Add/Oral/coach CSS+JSX; mount `<Add>` or reroute the empty CTA | L2354, L4067, L1475 |
| 18 | Low | Light theme or `color-scheme: dark` meta; `@media (hover:hover)` gating | L5602, L5644 |
| 19 | Low | Static mascot frame under reduced-motion | L1250, data/mascot.js |
| 20 | Polish | Move `b59` out of the `<h1>`; drop `text-transform:lowercase` on the subtitle | L1459, L5637 |

---

## Appendix A — Observed screens (words)

- **Study home 375×812:** brand block (seal, 単語帳, b59 pill, "jpn 101 · flashcards · 821 words" in orange); two-row tab pill; buddy card (nigiri, "Ready when you are.", two grey stat pills); 96px "821"; mono "NEW WORDS READY TO LEARN"; purple→pink "🧠 Smart Review · 8 cards" full-width; hint line; "SECTIONS" eyebrow; 2-column grid of glass chips with emoji at right; "All · 821" small button; keyboard tip. Scroll height 2554px.
- **Study card:** 0/8 progress + three toggle pills; 26px-radius glass card with 漢字 chip top-right, 54px 感謝します, 24px かんしゃします + 🔊, "TAP TO FLIP" 9.5px; "Reveal answer" full-width grey. After reveal: 🙇 emoji 88px, 26px meaning, orange mono "kansha shimasu" + 🔊, "✨ hook" pill; "Missed it" grey / "Got it" green at 167×46.
- **Done:** "SESSION COMPLETE", 82px "100%", "8 nailed first try · 8 cards", "best run: 7 instant recalls back to back", "Go again" / "Done".
- **10k done:** broken — see L-1.
- **Drill setup:** see table; **card back** "すきでした 🔊 / polite past (orange) / rule line" with Quit chip in the progress row.
- **Input:** faint bordered box around the whole tab; level cards; bilingual chips; big orange CTA; hint; four tool chips; after "Show me 3 things": one pick card ("Learn Japanese with Tanaka san · ~12 min · a stretch ●●●○"), "Open"/"Not for me", "Show me others"/"Back".
- **Write:** eyebrow "WRITE IT FROM MEMORY · 1/821", card with italic "school", cream canvas, three buttons.
- **Kana:** three chip rows, progress line, hero "0 / OF 46 MASTERED / 46 never drilled", session sizes, orange Start, two hint lines. Chart: 5-across cells, glyph 24px, rōmaji 9.5px dim.
- **Scripts:** "Your scripts" + orange "+ New script"; 34 rows each with ✕. Rehearse: "← Scripts / 2-1", ladder line, four tall mode buttons, Voice/Slow chips, card "KANDA · 1/6 / Do you understand that? / それ、わかりますか？ / sore, wakarimasu ka?", "← Back / 🔊 / Next line →".
- **Browse:** 4-stat strip, sync box with real Google button, search + More, 5 filter chips (wrap to 2 rows), cards with emoji+kanji, ✕, meaning, meter, "seen 1 · ✓ 1 (100%)", "needs review" pill — no reading visible.
- **320×568:** three-row tab pill; buddy stats stack vertically; Smart Review below the fold.
- **1280×800 light:** identical dark rendering in a centred 660px column.

## Appendix B — Console/network during the local run
`/.netlify/functions/tts?…` ×14 → 404 (silent); `/.netlify/functions/sync?code=…` POST ×12 → 501 (silent; sync box shows sign-in button); `/videos.json` → 404 (Input degraded to 1 pick, silent); `/.netlify/functions/feed?src=ci-tanaka` → 404. No JS exceptions. Live Worker: `/` 200 `text/html`, 226 KB compressed, `cf-cache-status: HIT`, `max-age=0, must-revalidate`; `/manifest.json` and `/favicon.ico` → 200 `text/html` (SPA fallback).
