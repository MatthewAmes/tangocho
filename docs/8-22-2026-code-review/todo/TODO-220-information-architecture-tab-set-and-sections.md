# TODO-220 — Information architecture: a 5-item primary nav (Study · Kana · Grammar · Practice · More), student-facing names, Act-grouped section chips

**Priority:** P2   **Effort:** L   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 4 IA-1 (Medium), IA-2 (Low), § 7 "Tab names"; § Exec summary bullet 9
**Depends on:** TODO-203, TODO-204, TODO-206   **Blocks:** none

## Why
Eight tabs in mixed registers — "Study" (verb), "10k" (a deck size), "Drill" (means conjugation only), "Input" (SLA jargon), "Write", "Kana", "Scripts", "Browse" (which secretly holds sync/backup/sign-in = Settings) — ordered with the two extra decks before the core modes. A student's mental model is *what* (vocab, kana, grammar, dialogues, listening/reading) and *how*. Five top-level items with plain names, the rest one tap away under "More", fits a thumb and fits the product.

## Current behaviour (verified)
- Tab list L1464: `[["study","Study"],["freq","10k"],["drill","Drill"],["input","Input"],["write","Write"],["kana","Kana"],["scripts","Scripts"],["browse","Browse"]]`; `tab` is plain `useState("study")` (L1272) — **not persisted**, so no stored values to migrate; render switch L1474-1490.
- Section chips: `batches` L1652-1679 grouped by `sectionOf(c)` (L2153: `c.sec || SECTION_MAP[c.term] || (lesson<=6 ? "Act 1" : "Class notes")`), colour by `hueFor(name)` (hash → `SECTION_HUES`, L2156-2161), order by `sectionRank` (L2168-2177: Act 1 → 1000+act*100+scene → Dry Run after its act → Class notes). Names like "3-7R", "4-7R", "7/22", "Act 2 Dry Run", "Culture talk".
- Freq ("10k") is a separate component with its own deck/scheduler (L5388); Write L3708; Scripts L3461; Input L4544; Browse L3822.

## Intended behaviour
Primary nav (5 items, single row, same component as TODO-203; optionally fixed-bottom on phones):
1. **Study** — `tab="study"` (unchanged). Add a deck switcher row at the top of the setup screen: "Class deck · 821" / "Core words · 148" (the latter renders `<Freq/>` inside the Study tab; Freq keeps its own state/keys).
2. **Kana** — `tab="kana"` (unchanged).
3. **Grammar** — `tab="drill"` (label change only; heading "Conjugation" stays inside).
4. **Practice** — new `tab="practice"` with a segmented sub-nav: **Write** (`<Write/>`) and **Scripts** (`<Scripts/>`).
5. **More** — new `tab="more"` with a segmented sub-nav: **Watch & Read** (`<Input/>`, with 入力 underneath via `Bi`), **Deck** (`<Browse/>` list + filters), **Account** (the sync box, backup/restore/clear — today's Browse › More). Implementation choice: keep `Browse` as one component and pass `section="deck"|"account"` to render either half; or split it in TODO-225 when tabs move to files.

Internal tab ids stay `study|kana|drill|practice|more`; `freq|input|write|scripts|browse` remain valid *aliases* resolved by a map so any existing `setTab("browse")` call sites keep working (`goAdd`, TODO-207 sync dot, TODO-218 intents).

Section chips grouped under Act headers ("Act 1", "Act 2 · 2-1 … 2-8 · Dry Run", …, "Class notes", "Culture talk"), coloured by Act (one hue per act, lighter for the Dry Run), with "R" expanded in the label ("3-7 review") and date batches grouped under "Class notes (July)".

## Implementation steps
1. **Aliases + sub-tab state** in the root:
   ```js
   const TAB_ALIAS = { freq: ["study", "core"], input: ["more", "input"], write: ["practice", "write"], scripts: ["practice", "scripts"], browse: ["more", "deck"] };
   const [tab, setTabRaw] = useState("study"); const [sub, setSub] = useState({ study: "class", practice: "write", more: "input" });
   const setTab = (id, subId) => { const a = TAB_ALIAS[id]; const t = a ? a[0] : id; const s = subId || (a ? a[1] : undefined); setTabRaw(t); if (s) setSub((p) => ({ ...p, [t]: s })); };
   ```
   Route `go()` from TODO-204 through this `setTab`. Nav list: `[["study","Study"],["kana","Kana"],["drill","Grammar"],["practice","Practice"],["more","More"]]`.
2. **Sub-nav component**: `function SubNav({ items, value, onChange }) { return <div className="tc-kanaseg tc-subnav" role="group">{items.map(([id, label, ja]) => <button key={id} className={"tc-fchip" + (value === id ? " is-on" : "")} aria-pressed={value === id} onClick={() => onChange(id)}>{ja ? <Bi en={label} ja={ja} /> : label}</button>)}</div>; }`. Render switch:
   ```jsx
   tab === "study" ? (sub.study === "core" ? <Freq/> : <Study …/>) :
   tab === "kana" ? <Kana/> : tab === "drill" ? <ConjDrill/> :
   tab === "practice" ? (<><SubNav items={[["write","Write"],["scripts","Scripts"]]} value={sub.practice} onChange={(s) => setSub(p => ({...p, practice: s}))}/>{sub.practice === "write" ? <Write …/> : <Scripts/>}</>) :
   (<><SubNav items={[["input","Watch & Read","入力"],["deck","Deck"],["account","Account"]]} …/>{sub.more === "input" ? <Input cards={cards}/> : <Browse … section={sub.more}/>}</>)
   ```
   Study deck switcher: inside Study's setup screen top (L1783) render `<SubNav items={[["class",`Class deck · ${cards.length}`],["core","Core words · 148"]]} …/>` — needs `sub`/`setSub` passed as props (`deck`, `onDeck`). Freq's intro copy "Frequency 10k · Tier 1" (L5521) → "Core words · Tier 1".
3. **Browse split**: add prop `section` ("deck" | "account"); `section === "account"` renders the sync box (L3964-3985) + More panel contents (L3992-4026) always open (no "More" toggle); `section === "deck"` renders stat strip + search + filters + list. Default `section="deck"`.
4. **Section grouping** in Study (L1884-1903): compute `groups = Map<act, batches[]>` from `b.name` (`/^(\d+)-/` → act N; `/^Act (\d+)/` → N; dates `/^\d+\/\d+$/` → "Class notes"; else name). Render `<div className="tc-batchhead"><span>Act {n}</span></div>` per group then its chips; hue per act: `hueFor` → `ACT_HUES[n % ACT_HUES.length]` (define `const ACT_HUES = [214,258,186,152,42,22,350]`). Label: `b.name.replace(/^(\d+-\d+)R$/, "$1 review")`. Collapse groups other than the current act (the highest act with any unseen card) behind a "Show all sections" button to keep the default view ~10 chips (also helps TODO-217).
5. Copy: Input heading eyebrow "Watch & Read · 入力"; Browse eyebrow "Deck"; Account eyebrow "Account & sync".
6. Rebuild; update screenshots/docs (README TODO-234).

## Data migration / compatibility
`tab` is not persisted → no storage migration. All storage keys unchanged (`jpn101:freq` etc. stay). Internal call sites using old ids keep working via `TAB_ALIAS`. If TODO-218 added `browseIntent`, map it to `setTab("more","account")`.

## Testing & verification
- 320×568 / 375×812: nav fits in one row (5 items) without scrolling; each destination reachable in ≤ 2 taps; Study → "Core words" shows the Freq UI; Practice → Write/Scripts; More → Watch & Read / Deck / Account.
- `goAdd`/sync-dot/backup-nag routes land on the right sub-tab.
- Section chips grouped by Act with consistent hue; "3-7R" shows as "3-7 review"; collapsed acts expand.
- Keyboard: sub-nav buttons have `aria-pressed`; nav buttons `aria-current`.
- Regression: Kana/Drill/Freq sessions unaffected; sync/backup/restore work from Account.

## Acceptance criteria
- [ ] 5 primary items with the names above; old ids aliased.
- [ ] Freq lives under Study; Write/Scripts under Practice; Input/Browse/Account under More.
- [ ] Section chips grouped and coloured by Act; "R" expanded.
- [ ] `index.html` rebuilt + committed; README nav description updated.

## Pitfalls / notes
- Keep `Freq` a separate component (own keys/scheduler); only its mount point moves.
- The "10k" name appears in copy (L5521) and the review docs; the storage key `jpn101:freq` stays.
- Large UI change — ship behind a single commit with a before/after screenshot in the commit body (project convention).
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
