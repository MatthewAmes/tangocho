# Handoff — 2026-08-27

Written for a Remote Control / PowerShell session picking this up cold.
**Read `CLAUDE.md` first** — it has the build, deploy and two-machine rules. This file is
only what `CLAUDE.md` cannot know: where things stand *right now* and what to do next.

Branch `dev`, clean, pushed through `5359993`. `dev` is what's deployed.

---

## Matthew's one open decision

**He is switching the AI backend from Anthropic to Google Gemini (AI Studio).**

He asked for the key-setup walkthrough and was given it. The step that is *his*:

1. aistudio.google.com → sign in → **Get API key** → **Create API key** → copy (`AIza…`)
2. Then he runs, and pastes at the prompt:

```powershell
cd C:\Users\Matthew\tangocho\cf; npx wrangler secret put GEMINI_API_KEY
```

**Nothing has been written for Gemini yet.** `cf/src/ai.js` still speaks the Anthropic
Messages API. Switching means a real rewrite of that one file — different endpoint, auth
(`?key=` query param, not `x-api-key`), request/response shape, and a different structured
-output mechanism (`responseSchema` / `responseMimeType`, not `output_config`). The four
features that call it do not change from the app side.

He was asked "want me to write the Gemini backend now?" and had not answered when the
session moved. **Ask before building it** — he may have picked Gemini on price and might
still want Anthropic if he has credits.

Secrets currently set on the Worker: `ADMIN_WARM_TOKEN`, `GOOGLE_TTS_API_KEY`,
`SESSION_SECRET`. **No `ANTHROPIC_API_KEY`, no `GEMINI_API_KEY`.**

### What the AI actually powers (all four degrade gracefully today)

| Feature | Where | Without a key |
|---|---|---|
| ✨ Memory hook | Card back, on words you keep failing | Button isn't offered |
| Session debrief | After a session | Falls back to a plain "Missed: …" list |
| Script annotation | Scripts tab — paste JP, get readings | No fallback |
| Sentence generation | Sentences tab | **Local fallback** builds one from the deck |

Boss conversations (roadmap, Slice 5) are **not built** and were blocked on the key.

---

## What shipped this session

Five commits, each deployed and pushed, each verified in the browser — not only by tests.

1. **`b2e3546` Academic Dark tokens over the glass.** Applied the token system from his new
   design across the app while keeping the liquid-glass/foil look. Semantic accents added
   (emerald = correct, amber = due, blue = primary action; crimson demoted to error only).
   53 half-pixel font sizes and 47 off-scale radii snapped onto the scale. Contrast audited
   at 375px across all tabs: 0 failures, down from 7.
2. **`f5aeecb` Learning gain per minute** — the north-star metric. `tools/gain.mjs`.
3. **`36e7ce4` → `f18f154` Modularization**, four commits. See below.
4. **`5359993` Retired the 10k tab.**

### Learning gain per minute — the bit worth not re-deriving

Gain is measured in **doublings of FSRS stability**, `log2(S1/S0)` — *not* in days. Summing
ΔS in days makes one easy review of a mature card (+140 days) beat learning a new word
(+3) forty times over, so a days-based north star points at the least useful session
available. Lapses floor at zero (the review revealed decay, it did not cause it); new
cards are measured from a half-day floor. Re-answering a card seen seconds ago earns ~0
because FSRS grants almost no stability at retrievability 1, so it cannot be farmed by
cramming either.

Shown in Plan (rate, which formats earn their minutes, and a fade point) and on the done
screen against his own recent rate. **It reads "nothing measurable yet" until he studies** —
evidence rows only carry `s0`/`s1` from this session onward, and older rows are skipped
rather than counted as zero.

### Modularization — `JpnFlashcards.jsx` 11,404 → 7,073 lines

```
src/data/   seed, scripts-seed, input-catalog, conj-bank, kana-tables, sections
src/styles.js   the whole stylesheet
src/lib/    kana, conjugate, input-engine, schedule, tts, session, freq
```

**Use `tools/verify-refactor.sh` for any further move.** Comparing minified builds is
useless (moving a declaration shifts esbuild's name mangling). It builds both sides
unminified and compares the **sorted** line sets — module boundaries relocate code, so a
plain diff reports thousands of moved lines while the sorted multiset is equal iff the
code is. The data, styles, pure-lib and TTS commits all came back IDENTICAL.

```powershell
sh tools/verify-refactor.sh          # against HEAD
sh tools/verify-refactor.sh HEAD~3
```

Also: `tools/extract-data.mjs` and `tools/extract-lib.mjs` do the moves (string-aware
bracket scanner — the vocabulary literals are full of quotes containing brackets), and
`tools/coupling.mjs` prints what each component still reaches for.

---

## Three traps this codebase has already sprung

Do not re-learn these the hard way.

**1. The bundle hides missing imports.** esbuild emits an IIFE where every module shares one
function scope, so a module referencing a name it never imported *still resolves*. The app
keeps working and every tab renders. The only tell is the bundle getting **smaller** — the
"unused" constant gets tree-shaken. `src/lib/input-engine.js` shipped that way twice
(`INPUT_BANDS`, `INPUT_VERDICTS`). **A refactor whose output shrinks has deleted something.**
`tools/test-modules.mjs` (first in `npm test`) imports every module standalone and *runs*
something in each, because a bare import is not enough — a free variable only throws when
the code executes.

**2. Renames create shadowing that build + tests both miss.** Renaming `retentionTarget` →
`retention.target` collided with a React state variable also called `retention`, producing
`const [retention] = useState(retention.target)` — a read inside its own temporal dead
zone. Build passed, tests passed. It showed up only as esbuild renaming the import to
`retention2` in the verify diff. **An identifier suffix appearing from nowhere means two
things now share a name.** The local is `retentionPref` now.

**3. Backticks inside template literals.** The stylesheet was one giant template literal
(now `src/styles.js`). A backtick in a CSS comment ends the string and breaks the build.
Same class of bug bit a doc comment in `tools/unmin.mjs` that contained `*/` inside a shell
example. Now line comments.

### PowerShell / Git Bash specifics

- **Git Bash heredocs mangle backslashes.** Writing a `.mjs` file via
  `cat > f.mjs <<'EOF'` silently turns `\\s` into `\s` (i.e. `s`), so
  `new RegExp("^const " + name + "\\s*=")` stops matching. Cost a debugging round.
  **Use the Write tool for any script containing regex escapes.**
- Several `tools/*.mjs` are **CRLF**. String-matching patches with `\n` will miss; split on
  `/\r?\n/` and rejoin with the detected EOL.
- `/tmp` maps to `C:\Users\Matthew\AppData\Local\Temp` in Git Bash but *not* for Node
  invoked as `node -e` (which sees `C:\tmp`). Pass `$TEMP` explicitly or use the scratchpad.

---

## What's next (nothing is in flight — the tree is clean)

Ordered by my judgement of value. He has not committed to any of these.

1. **Gemini backend** — ask first (see above). Unblocks the four AI features properly, plus
   boss conversations.
2. **Component extraction** — 23 components, ~5,200 lines, 72% of what's left in the app
   file. Shared blockers are gone now (scheduler, TTS, session, freq are all modules).
   Start with the loosely-coupled ones — counts are module-scope references, measured
   after the moves above:

   | Component | Lines | Reaches for |
   |---|---|---|
   | `ProductionBlock` | 84 | 0 |
   | `Contrast` | 101 | 0 |
   | `ConjDrill` | 214 | 4 |
   | `Kana` | 357 | 4 |
   | `Scripts` | 239 | 4 |
   | `Dates` | 434 | 6 |
   | `Input` | 500 | 6 |
   | `Study` | 1,276 | 24 — do this one last |

   `Browse` (254 lines, 12) also touches the mutable `_days` / `_googleEmail` singletons,
   so it needs the auth store dealt with first. Run `node tools/coupling.mjs <Name>` for
   the exact list of names any one of them needs.
   **This stops being provable the moment you change code rather than move it** — the
   zero-diff proof only holds for pure moves.
3. **He should just use the app.** The gain metric has no data until he studies, and it was
   built to answer "which activity buys me the most memory per minute". Nothing else can
   answer that for him.

### Open question I raised and he hasn't answered

Retiring the 10k tab wired all 10,000 frequency words into Smart Review (frontier of the
next unstarted ranks, capped by the daily new-word quota). **But he has ~1,590 unstudied
words in his own course deck competing for the same "new" slots**, so course vocabulary
will usually win. That is probably right for JPN 101. He was asked whether frequency words
should get a guaranteed share and did not answer.

---

## Working agreements (from the session, not in CLAUDE.md)

- **Matthew does not write code.** Drive the machine — install, build, commit, deploy,
  verify. When he genuinely must act (browser sign-in, an authorize button), give
  click-by-click steps and say which step is his.
- **Deploy after each meaningful change**, gated on `npm test` and a clean build.
- **Verify in the browser, not only in tests.** Every bug that actually mattered this
  session was found by driving the real app. The Browser pane may refuse to screenshot
  ("pane is not displayed"); `javascript_tool` still works — drive and assert through it.
- He is blunt and will tell you when something is wrong ("the tab up top still isnt
  fixed"). Take it at face value; the first fix was treating a symptom.

## Commands

```powershell
npm test                      # 594 assertions incl. tools/test-modules.mjs
npm run build                 # esbuild -> index.html + cf/public
npm run deploy                # build, then wrangler deploy
sh tools/verify-refactor.sh   # prove a refactor changed nothing
node tools/coupling.mjs Kana  # what a component still reaches for
```
