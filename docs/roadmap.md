# Tangocho — lesson engine roadmap

Merged from two design passes (2026-08-26). The short version:

> Tangocho already out-thinks Duolingo. What it lacks is Duolingo's stagecraft.

The engine is strong and largely built. The **lesson experience layer is the gap.**

---

## Where the architecture actually stands

| Layer | Status | Lives in |
|---|---|---|
| 5. Evidence | **Built** — `makeEvidence` already carries id/deck/format/skill/cue/ok/ms/failure/predicted/pRecall/at/confused | `tools/learner.mjs` |
| 4. Learner model | **Built** — abilities, Bayesian uncertainty, confusion matrix, latency norms. *Missing: fatigue* | `tools/learner.mjs` |
| 3. Intervention engine | **Built** — skill + direction + cue, chosen just-in-time | `learner.mjs`, `session.mjs` |
| 2. Activity engine | **Partial** — 6 formats + 3 drill types; 3 components unmounted | `JpnFlashcards.jsx`, `production.mjs` |
| 1. Lesson experience | **Absent** — this is the work | — |

### What Tangocho has that Duolingo does not

- FSRS scheduling with per-ability due dates
- **5 skills tracked separately** (recognition, production, listening, orthography, context)
- **6-level cue ladder** — SHOWN / CHOOSE / STRONG / PARTIAL / FREE / CONTEXT
- **7 failure types**, each routing to a different next step
- Bayesian posteriors with credible intervals (honest uncertainty)
- **Personal confusion matrix** built from real mistakes
- Per-skill+format latency norms — *your* baseline, not a global one
- **Held-out benchmark**: 8% of the deck reserved, never taught, re-measured every 90 days
- Mining arbitrary text into cards with source sentences
- Immersion tracking with deck-fused level

### Architectural correction

The engine is **already modular** — 13 pure `.mjs` modules with tests. Do not rewrite it.

The monolith is the **UI**: `JpnFlashcards.jsx` is ~10,400 lines, and each new activity adds
~200. `TODO-221`-`227` cover the extraction. Thread it through before Slice 4.

---

## Build order — five vertical slices

### Slice 1 — Lights on + shell
- Mount `Sentences`, `Write`, and the 3 production drills (order / fill / build)
- Segmented session progress rail
- Combo that **degrades** rather than resets
- Session summary showing **movement** (words moved to gold, leeches broken), not accuracy

*Goal: ~3 felt activities becomes ~8, with visible progress.*

### Slice 2 — Recovery engine (the centerpiece)

A failure currently just lowers the cue by one. Instead each failure spawns a staged rescue
that **ends in success**:

    miss on ください  (failure: production)
      -> recognition        (see it, pick it)
      -> partial production (く＿＿＿い)
      -> full production

- `buildRecovery(failureType)` -> sequence, inserted dynamically into the queue
- Fluid downshift in the UI; never a red X
- "Comeback" reward when a rescue lands

Everything needed exists: `FAILURE_PLAN`, the cue ladder, `classifyFailure`. It needs a
sequencer, not new science.

### Slice 3 — A game layer that rewards learning

Score what predicts retention, not raw correctness. Every signal is already logged:

| Reward | Signal |
|---|---|
| Retrieval without support | `cue` level in evidence |
| Speed improvement | `latencyNorms` vs this answer |
| Recovery | `recent` string pattern |
| Delayed retention | `fsrs.S` at answer time |

- **Memory Check** as a first-class event — spacing becomes the most rewarding moment
- Personal-record rival ("18.4s -> 11.2s on 火曜日")
- Micro-missions generated from the learner model

### Slice 4 — Japanese-specific activities (the moat)
- Minimal pairs (おばさん / おばあさん), small tsu (きて / きって), small ya-yu-yo, long vowels
- Particle discrimination, transitivity pairs (開く / 開ける)
- Kanji decomposition (`tools/kanjicontext.mjs` exists)
- **Emoji-based image choice — free: 1632/1632 cards already carry an emoji**

### Slice 5 — Depth
- Fatigue + flow smoothing (see caveat)
- Adaptive stopping — end at 7 questions when learning value is low
- Boss conversations *(blocked on the Anthropic API key)*
- Morphology graph: 食べる -> 食べました as a *transformation* weakness, not a new word
- **Learning gain per minute** as the north-star metric

---

## Deliberate design decisions

### Rejected

- **Hearts / lives** — penalise practising exactly what you are worst at; hostile to SRS.
  Keep the run framing, use a **degrading combo** instead (4 flames -> 3, never a skull).
- **Leagues / leaderboards** — single user.
- **Gems / shop / loot** — noise that does not survive week three.
- **Endless easy lessons** — padding wastes real study time.

Keep: streak (built), mascot (built), and **stability-as-currency** (gold) — it cannot be
farmed by grinding easy content, because it *is* memory strength.

### Cautions

- **Fatigue has a confound.** Rising latency and more mistakes are also the exact signature of
  desirable difficulty *working*. Distinguish with rapid guessing (fast + wrong), abandonment,
  and session length — otherwise the app gets easier precisely when it is succeeding.
- **Do not add all 7 `scoreIntervention` weights at once.** Seven interacting terms produce a
  scheduler nobody can debug. One term at a time, each with a test and a simulation.
- **LLM as candidate, not authority.** The deterministic layer validates; the model proposes.
- **Adaptive selection, randomised presentation** — the policy picks the *intervention*; the
  game picks which visual treatment renders it. Never randomise pedagogy.

---

## The loop

    LEARNER STATE -> CANDIDATE POOL -> ADAPTIVE POLICY -> FUN ACTIVITY
          ^                                                    |
          |                                                    v
    UPDATE MODEL <- RECOVERY/NEXT <- DIAGNOSE ERROR <- PLAYER RESPONSE

The activity engine does not decide what to teach. The learner model does. The activity
engine is the renderer.

> Tangocho should feel like a Japanese RPG, behave like a Duolingo lesson, think like an
> intelligent tutor, and learn from the learner like an experimental scientist.

---

## Decisions (2026-08-26)

- **The run framing replaces Smart Review** rather than sitting beside it. To keep that
  reversible, the game layer is built as a *shell around* the existing session engine — the
  study logic underneath is untouched, so backing it out is a UI change, not an engine rewrite.
- **Deploy after each slice**, gated on the full test suite and a clean build.
- **UI extraction (`TODO-221`-`227`) is greenlit** when the file becomes the bottleneck.
- Work proceeds through the slices in order, as far as time allows.
