# Tangocho — Textbook-Integrated Adaptive Learning Engine

**Source:** "Mega prompt" email from Matthew (mathoozala@gmail.com), 2026-08-30 — the
outcome of a Matt + Dan session with ChatGPT comparing Tangocho against Duolingo. The raw
email is `Mega prompt.eml` in the repo root (untracked). This document is the durable,
code-aware rewrite.

**Tracking:** every actionable item from this analysis is a GitHub issue labeled
**`duolingo megaprompt`**, numbered `MP-01`…`MP-22`. The index is at the bottom.

**Read this alongside** [`docs/roadmap.md`](roadmap.md) (2026-08-26 lesson-engine roadmap).
The two documents agree; this one adds the *curriculum* dimension the roadmap lacked.

---

## The north star

> Do not build "Duolingo with a Nihongo NOW! vocabulary list."
> Build an adaptive Japanese tutor **whose curriculum is Nihongo NOW!**, whose interaction
> quality is comparable to the best language-learning apps, and whose learner model is
> significantly more granular and personalized.

Duolingo teaches Japanese generally. Tangocho teaches **Matthew's specific curriculum** —
NihonGO NOW! Vol. 1 & 2 — with Duolingo-quality activities and a smarter adaptive engine.
The learner should always be able to say: *"Everything I'm practicing is helping me master
my actual Japanese course."* That is the moat.

The single most important architectural idea:

> **Don't make "Nihongo NOW!" a filter. Make it the curriculum graph.**

A weak implementation feeds a Duolingo-style activity engine only textbook vocabulary. The
right implementation *understands* the textbook — its vocabulary, scripts, grammar,
relationships, progression, context — and dynamically generates the best learning
experience from that material. And the corollary hard requirement:

> **Nihongo NOW! Vol. 1 and Vol. 2 are data, not code.** Adding Vol. 3 must be an import,
> not a rewrite.

## The architecture stack

```
TEXTBOOK CURRICULUM        what should ultimately be learned
        ↓
CONTENT / KNOWLEDGE GRAPH  how textbook content relates
        ↓
LEARNER MODEL              what this learner currently knows
        ↓
INTERVENTION ENGINE        what to practice RIGHT NOW
        ↓
ACTIVITY ENGINE            the best way to practice it
        ↓
GAME LAYER                 how it feels fun, rewarding, motivating
        ↓
RESPONSE → DIAGNOSIS → EVIDENCE → LEARNER MODEL UPDATE → NEXT INTERVENTION
```

Keep these layers conceptually separate (curriculum data / knowledge graph / learner model
/ intervention engine / activity engine / evidence / game / UI). Do not collapse them into
one component. The loop at the bottom **must be real**: the next activity must actually be
capable of changing because of what happened in the previous one.

## Where Tangocho already stands (2026-08-30)

The mega prompt was written without full knowledge of the codebase. **Much of what it asks
for already exists** — future sessions must not rebuild these:

| Mega-prompt ask | Status in code |
|---|---|
| FSRS spaced repetition | Built — `tools/fsrs.mjs`, per-ability due dates |
| Multidimensional mastery (§27) | Built — 5 skills (recognition, production, listening, orthography, context), Bayesian posteriors with credible intervals, `tools/learner.mjs` |
| Cue-level tracking (§10) | Built — 6-level cue ladder SHOWN→CONTEXT |
| Error diagnosis (§18) | Built — 8 failure types, `classifyFailure`, `FAILURE_PLAN` |
| Recovery ladders (§18) | Built as **data** (`RECOVERY_LADDERS`, `buildRecovery`) — **not wired into the live session queue** (roadmap Slice 2) |
| Confusion graph (§17) | Built — `confusionFrom(evidence)` personal confusion matrix |
| Latency norms | Built — per skill+format, personal baseline |
| Fatigue model (§38) | Built — `tools/fatigue.mjs`; wired into the live session through `tools/pacing.mjs` (MP-11), logged on every evidence row |
| Pacing + early stop (§39) | Built — three presets (`PACES`) reaching `session.mjs`'s `minutes`, and a dismissible stopping point on fatigue / time spent / gain fade (MP-12) |
| Calibration (§40) | Built as module (`tools/calibration.mjs`) |
| Learning value metric (§42) | Built — `tools/gain.mjs`, gain/minute in stability doublings |
| Session builder (§22, §36) | Built — `tools/session.mjs`: learning steps, staleness ceiling, new-item budget, multi-deck interleaving |
| Script-based cloze (§7) | Built — `tools/cloze.mjs` builds cloze from real script lines, confusion-aware choices |
| Production drills (§11) | Built as modules — order / fill / build (`tools/production.mjs`) |
| Textbook scripts (§7) | 34 scripts in `src/data/scripts-seed.js` — tokenized, per-speaker, with readings, romaji, English |
| Curriculum position | Partial — cards carry `lesson`; `SECTION_MAP` maps ~140 terms → act-scene ("2-1"…"2-8"); script ids encode act-scene |
| Import pipeline (§25) | Partial — `tools/import-nihongo.mjs` pulls the BYU NihonGO NOW! glossary by act range |
| Game layer (§34) | Partial — XP, combo, streak, mascot, `scoreAnswer` (rewards low-cue success, comebacks, memory checks) |

What is genuinely **missing** is the curriculum layer as a first-class structure, the
wiring of built-but-dormant modules into the live experience, script-derived activities
beyond cloze, and the learner-facing mastery view. That is what the MP issues cover.

## Design principles (distilled from the 55-section spec)

### 1. Curriculum layer

- **Provenance everywhere** (§3, §10): every knowledge item and every activity should be
  traceable to `{textbookId, volumeId, lessonId, sectionId, sourceType, sourceId}`. The UI
  should eventually answer "where did I learn this?" ("NihonGO NOW! Vol. 2, Act 2-3,
  Script"). Preserve the taxonomy already in the data (volumes → acts → scenes); do not
  invent a new one.
- **Knowledge entity ≠ occurrence** (§26): a word appearing in three places is ONE entity
  with three occurrences, not three unrelated cards. The learner model tracks the entity;
  occurrences retain context. (The importer already dedupes by term — the occurrence list
  is the missing half.)
- **Curriculum progress ≠ mastery** (§4, §21): "reached Act 8" and "mastered Act 8" are
  separate concepts. A lesson can be 100% complete with production mastery at 34%. Both
  must be tracked and shown.
- **Objectives derive from data** (§5): per-lesson objectives (recognize / recall /
  produce / comprehend / use-in-context per vocabulary, script, grammar item) are generated
  from what the curriculum data actually contains — never fabricated.
- **Curriculum is data, not code** (§24, §25): Vol. 3 arrives via import → validate →
  normalize → curriculum graph → activities become available. No changes to
  lessonEngine / learnerModel / FSRS / evidence / game code.

### 2. Scripts are a major learning asset (§7–§9, §23)

The 34 textbook scripts are the highest-leverage under-used content. One script line can
generate: line recognition, listening comprehension, speaker identification, meaning
comprehension, vocabulary extraction, grammar identification, sentence reconstruction,
cloze, response selection, role-play, free production. Never generate an arbitrary
sentence when a relevant textbook script line exists.

- **Script listening mode** (§8): play a line (TTS exists), learner identifies meaning /
  missing word / speaker / appropriate response — always labeled with its act.
- **Dialogue mode / boss conversations** (§9, §23): script becomes an interactive
  conversation; the deterministic version (choose the appropriate response from the real
  script) needs no AI key. The lesson culminates in "I can actually use what I learned,"
  not "you completed 15 cards."

### 3. Intervention engine rules (§13–§17)

- Candidate value = **curriculum relevance × learner need** — current lesson, prerequisite
  status, mastery, uncertainty, memory stability, weaknesses by skill, confusion graph,
  time cost, predicted success, expected gain, variety, fatigue. Keep the formula modular
  and calibratable; no magic numbers outside config. **Roadmap caution stands: add one
  scoring term at a time, each with a test.**
- **Three practice modes** (§14): A — Current Lesson; B — Cumulative Review; C — Smart
  Mix. Learner picks the mode; the engine still picks the exercises.
- **Don't let FSRS destroy curriculum flow** (§15, §16): a due Act-3 item surfaces
  *inside* Act-10 practice (e.g. as the review word in a current-lesson sentence, or
  interleaved between current-lesson activities), not as a jarring detour.
- **Distractors are curriculum-aware** (§17): prefer (1) the learner's own confusion
  pairs, (2) same act-scene, (3) nearby acts, (4) semantic/phonological/orthographic
  neighbors. Two confusable words from the same chapter are the most valuable distractors.

### 4. Activities (§11, §12, §30, §31)

- Target library (~25 formats): word-bank translation both directions, ordering, partial
  construction, cloze, particle selection, MC, matching, listening→meaning,
  listening→reconstruction, listening discrimination, kana/kanji recognition & reading,
  typed & guided production, contextual/dialogue response, script comprehension,
  mistake recovery, delayed retrieval, transfer, optional speaking. The engine chooses;
  not every format in every lesson.
- **Format ≠ cognitive mode** (§12): track both. MC = recognition; word bank =
  reconstruction; typing = recall/production; audio choice = listening+recognition;
  dialogue = comprehension+production+transfer. Prevents visual variety being mistaken
  for cognitive variety.
- **Generate, don't author** (§30): activities are transformations of curriculum content.
- **Validate generated content** (§31): LLM proposes (distractors, explanations,
  variants); the deterministic curriculum layer validates and stays authoritative.
  (Matches roadmap: "LLM as candidate, not authority.")

### 5. Mistake recovery (§18)

A failure spawns a structured ErrorRecord (item, provenance, activity, error type, given
vs expected, latency, cue, confusion target) and later a **different** intervention —
recognition → contextual cloze → reconstruction → listening → delayed production →
transfer. The goal is not "can you remember the answer?" but "did you repair the
underlying knowledge?" This is roadmap Slice 2; `buildRecovery` and the ladders exist.

### 6. Learner-facing intelligence (§19–§21)

- Lesson mastery dashboard: per-act bars for vocabulary / grammar / listening /
  production / kanji / context, derived from posteriors, **never** from cards-completed
  counts.
- Evidence-based statements: "You know most of Act 7 but struggle with production";
  "You consistently confuse 会社 and 学校."
- Lesson complete → "Mastery: 74%. 3 areas need review. 2 previous mistakes recovered.
  Listening remains your weakest skill."

### 7. Session shape (§22, §36–§39)

- The Duolingo-style lesson template (warm-up → retrieval → listening → construction →
  matching → production → previous mistake → context → listening challenge → boss) is a
  **policy template, not a fixed sequence** — the learner model may replace any step.
- Daily review intelligently mixes due items, weak abilities, previous mistakes, textbook
  objectives, listening, production, transfer — a personalized training session, not
  "today's FSRS cards."
- Track recent formats/modes/skills for variety, but **learning value first; variety is a
  secondary objective** (§37).
- Fatigue (§38): simplify / shorten / end early as it rises — mind the roadmap's
  confound (rising latency + mistakes is also desirable difficulty working; distinguish
  via rapid guessing, abandonment, session length).
- Pacing (§39): Quick 5–7 min / Standard 8–10 / Deep 12–15+, with early termination when
  objectives are sampled, fatigue is high, or learning value has declined.

### 8. Scope control (§32, §33)

Default: **stay inside the learner's curriculum.** No random N5/N4 corpus vocabulary
during textbook study. An optional enrichment mode may carefully introduce related
Japanese, clearly labeled. (This also resolves the open question from the 2026-08-27
handoff about frequency words competing for new-card slots.)

### 9. Game layer (§34, §35)

Reward what predicts retention, not grinding: recovered mistakes, cue-free recalls, speed
PRs, listening challenges, mastered textbook objectives. Curriculum quests ("Master 5
words from Act 6", "Recover 2 mistakes from Vol. 1", "Reach 80% mastery on this
chapter"). Roadmap's rejections stand: no hearts, no leagues, no gem shop; degrading
combo, stability-as-currency.

### 10. UX invariants (§46–§48)

The textbook is the **invisible** backbone — the learner should feel "I'm playing a
really good Japanese-learning game," never "I'm studying a textbook database." Fast,
visual, thumb-friendly, large touch targets, fast feedback, minimal clutter. Feedback is
short ("Nice!" / "Almost.") with an optional EXPLAIN — no grammar lectures after every
answer.

### 11. Long-term intelligence (§40–§42)

Calibrate predicted-vs-actual success, difficulty, cue effects, recovery-vs-retention.
Avoid piling up hand-written `if weakness > X then format Y` rules — the long-term shape
is candidates → estimated utility → calibrated selection. Architecture should permit A/B
testing formats, cue levels, interleaving, recovery timing — measured on retention and
next-day performance, not immediate correctness.

## The vertical slice (§52)

Prove the loop end-to-end on real Vol. 1/2 data before building every activity:
lesson selection → textbook vocab + script material → adaptive selection → JA↔EN
construction, listening, matching, contextual cloze → mistake recovery → evidence →
learner update → **provably different next intervention** — with provenance and basic
XP/combo throughout.

## Issue index

All issues carry the label **`duolingo megaprompt`** in
[matthewames/tangocho](https://github.com/matthewames/tangocho/issues?q=label%3A%22duolingo+megaprompt%22).
★ = identified as low-hanging fruit / biggest bang for the buck.

| MP | Issue | Title | Spec §§ |
|---|---|---|---|
| MP-01 ★ | [#91](https://github.com/matthewames/tangocho/issues/91) | Curriculum module: provenance + occurrence index | 2, 3, 24–26 |
| MP-02 | [#92](https://github.com/matthewames/tangocho/issues/92) | Importer records occurrences instead of skipping duplicates | 25, 26 |
| MP-03 | [#93](https://github.com/matthewames/tangocho/issues/93) | Per-lesson objectives derived from curriculum data | 5 |
| MP-04 | [#94](https://github.com/matthewames/tangocho/issues/94) | Vol. 3 import-readiness test | 24, 25, 51 |
| MP-05 | [#95](https://github.com/matthewames/tangocho/issues/95) | Practice modes: Current Lesson / Cumulative / Smart Mix | 14 |
| MP-06 | [#96](https://github.com/matthewames/tangocho/issues/96) | Curriculum-relevance term in intervention scoring | 13, 15, 16 |
| MP-07 ★ | [#97](https://github.com/matthewames/tangocho/issues/97) | Curriculum-aware distractor sourcing | 17 |
| MP-08 ★ | [#98](https://github.com/matthewames/tangocho/issues/98) | Recovery sequencer: wire buildRecovery into the live queue | 18; roadmap Slice 2 |
| MP-09 | [#99](https://github.com/matthewames/tangocho/issues/99) | Structured ErrorRecord persistence | 18, 19 |
| MP-10 | [#100](https://github.com/matthewames/tangocho/issues/100) | Session variety tracking (format + cognitive mode) | 37 |
| MP-11 | [#101](https://github.com/matthewames/tangocho/issues/101) | Wire the fatigue model into live sessions | 38 |
| MP-12 | [#102](https://github.com/matthewames/tangocho/issues/102) | Pacing presets + adaptive early stop | 39 |
| MP-13 ★ | [#103](https://github.com/matthewames/tangocho/issues/103) | Cognitive-mode tagging on activities and evidence | 12 |
| MP-14 | [#104](https://github.com/matthewames/tangocho/issues/104) | Script listening mode | 8, 29 |
| MP-15 ★ | [#105](https://github.com/matthewames/tangocho/issues/105) | Script comprehension activity generators | 7, 30 |
| MP-16 | [#106](https://github.com/matthewames/tangocho/issues/106) | Dialogue mode (deterministic v1, boss battles later) | 9, 23 |
| MP-17 ★ | [#107](https://github.com/matthewames/tangocho/issues/107) | Lesson mastery dashboard | 4, 19–21 |
| MP-18 | [#108](https://github.com/matthewames/tangocho/issues/108) | Session summary: mastery movement + weakest skill | 21 |
| MP-19 | [#109](https://github.com/matthewames/tangocho/issues/109) | Curriculum quests / micro-missions | 34, 35 |
| MP-20 | [#110](https://github.com/matthewames/tangocho/issues/110) | Surface meaningful-behavior rewards in the UI | 34 |
| MP-21 | [#111](https://github.com/matthewames/tangocho/issues/111) | Strict-textbook vs enrichment mode | 32, 33 |
| MP-22 ★ | [#112](https://github.com/matthewames/tangocho/issues/112) | Adaptive-loop integration test | 43, 51 |

(Issue numbers are filled in by the session that created them; see the label query above
for the live list.)
