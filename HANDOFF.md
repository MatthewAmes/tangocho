# Handoff — 2026-09-22

Written for a session on another machine picking this up cold.
**Read `CLAUDE.md` first** — it has the build, deploy and multi-machine rules. This file is
only what `CLAUDE.md` cannot know: where things stand *right now* and what to do next.

Branch `dev`. `dev` is what's deployed (CI deploys every push once the Cloudflare token
secret is set). The last handoff was written 2026-08-27; everything below replaces it.

---

## What the app is now

Tabs, in order: **Study · Tutor · Shadow · Write · Drill · Input · Kanji・Kana · Dates ·
Scripts · Quizzes · Browse · Plan.** Add, Contrast, Sentences, Spelling and the 10k tab are
gone — don't resurrect them from old notes.

- **Study** is a one-button daily session. The learner picks a length (5–75 min); the
  planner picks the mix. Matthew asked for "a one stop shop for daily linear learning" —
  keep new options *behind* the Study screen, not on it.
- **Tutor** has six modes. **Textbook** (the default when signed out) needs no AI and no
  quota: you play one side of a real scene from the book. The other five (Free talk, Tutor,
  Roleplay, Listening, Repair) call Gemini through the Worker. Mic input and spoken replies.
- **Shadow** plays a textbook line; the learner repeats and self-rates. Logs listening
  evidence.
- **Plan** holds the placement test (25 questions, reports a range, sets the current act),
  the knowledge map (per-act, per-skill), grammar nodes, and learning gain per minute.

## The learning model — the part worth not re-deriving

The pieces, all pure modules in `tools/` with their own tests:

| Module | What it decides |
|---|---|
| `learner.mjs` | Evidence rows → per-skill Beta posteriors over five SKILLS (recognition, production, listening, orthography, context). **UNKNOWN ≠ WEAK**: no evidence is a separate state, never a low score. |
| `planner.mjs` | Session composition from minutes + abilities + due load + stage. Evidence pulls against stage priors; no activity over 45%. |
| `session.mjs` | Builds the actual item list; `biasFor` steers formats toward the plan's deficits as items are served. |
| `curriculum.mjs` | Which act the learner is in. **Ignores rows with `probe:true`** (placement questions are evidence of ability, not of place in the book). |
| `grammar.mjs` | Grammar forms as first-class nodes with prerequisites; conjugation drill ids parse into sub-rules. |
| `placement.mjs` | Adaptive probe of 5-question blocks, max 25. |
| `tutor.mjs` | The tutor's **brief** (ground truth sent with every turn), scaffolding/correction policy, and — new — `observationsToEvidence`. |

**The tutor loop (newest work, `da83f3e`).** Every AI tutor reply now carries up to three
observations about the learner's latest turn. The client validates them (known skill,
boolean verdict, cap of 3), logs them as evidence tagged `via:"tutor"`, and shows them under
the reply ("✗ たべました → たべます  ✓ すし"). The brief rebuilds from the new evidence, so the
next turn already targets the slip. Tagging `via` exists so calibration can later ask
whether the model's judgements agree with the app's exact-match grading — if they don't,
down-weight them there rather than deleting them.

## AI backend

Gemini (`gemini-3.6-flash`, overridable with the `GEMINI_MODEL` secret) behind
`cf/src/ai.js`. The client sends `{task, input}` only; every prompt lives in the Worker —
that is the abuse guard, keep it. Caps: 4000 chars of input JSON, 80 calls per user per day.

**The free tier runs out.** When it does, the error is Google's quota, not the app's, and
the app says so. Textbook mode and everything else keep working. Fixing it for good means
enabling billing on the Google AI Studio project (Matthew's decision — cents per day at
this volume), not code.

## Things that bit this session

**Build / source traps** (older ones in git history of this file, still true):
- `src/styles.js` is one template literal: a backtick or a backslash escape — even in a
  CSS comment — breaks the build.
- `var(--x)` on a token that doesn't exist renders transparent, silently. The real tokens
  are `--ok --warn --info --mut --line --card --surface …` — there is no `--due`, `--good`
  or `--muted`. Grep `:root` before using one.
- Several files are CRLF. Multi-line string patches must detect the EOL.
- **Git Bash heredocs and `node -e '…'` both turn `\n` inside a JS string into a real
  newline** before the file is written. Use the Edit/Write tools for anything with escapes.
- `grep` needs `-a` on `JpnFlashcards.jsx` (it's detected as binary).

**App-logic traps:**
- `callAI` resolves to an **envelope** `{result, cached}`. Reading `out.reply` instead of
  `out.result.reply` rendered empty bubbles while every call succeeded and burned quota.
- `loadPlan()` is **async**. Reading `.pace` off the promise silently gave the default.
- `actProfiles` must be given the live deck, not `SEED` (SEED rows have no ids).
- The Tutor tab used to gate everything behind sign-in and looked broken on the PC. Open
  on something that works.

## What's next

Ordered by judgement of value; Matthew has not committed to any of these.

1. **Feed checkpoint near-misses back into study.** His checkpoint showed many near-misses
   (~440 words known cold). Confusion pairs from it should become Drill/Study items.
2. **Calibration of tutor judgements** — compare `via:"tutor"` rows against graded rows for
   the same cards once there is enough data.
3. **Component extraction** of the remaining big components in `JpnFlashcards.jsx`
   (~8,260 lines). Use `sh tools/verify-refactor.sh` — it only proves pure moves.

## Working agreements

- **Matthew does not write code.** Drive the machine. When he must act (a sign-in, a
  billing page), give click-by-click steps and say which step is his.
- **Never hand him links to click in the terminal** — it has crashed Claude Code for him.
  Use the Browser pane, or have him type the address.
- **He wants visible change.** "I give you all this input but nothing changes" — ship
  things he can see in the app, deploy them, and say where to look.
- **Verify in the browser, not only in tests.** To test AI tabs without spending quota,
  stub `window.fetch` for `/api/ai` in the preview and set a throwaway
  `jpn101:session`; clean both up afterwards.
- `data/private/` is licensed textbook content. The repo is public. **Never commit it.**
- He is blunt ("this app is messy as hell", "wtf is this quiz"). Take it at face value.
  He also gets discouraged; show him concrete progress from his own data.

## Commands

```powershell
npm test                      # every suite; all must pass
npm run build                 # esbuild -> index.html + cf/public
npm run deploy                # build, then wrangler deploy
sh tools/verify-refactor.sh   # prove a refactor changed nothing
```
