# Review reproduction scripts

Small Node scripts the review agents wrote to verify findings by execution rather than inspection. They read the source files in the repo relative to this folder, so run them from anywhere:

```bash
node docs/8-22-2026-code-review/scripts/sim-fsrs.mjs
node docs/8-22-2026-code-review/scripts/sim-input.mjs
node docs/8-22-2026-code-review/scripts/sec.mjs
```

| Script | What it shows | Used by |
|---|---|---|
| `sim-fsrs.mjs` | Imports the real `tools/fsrs.mjs` and prints the stability/interval sequence for runs of Easy/Good/Hard grades (Easy×3 → 5.8 → 46 → 315 days), how many reviews unlock production recall, and the gap between FSRS `due` and what `dueness()` (hard-coded 0.9, no relearning step) actually does | Report 01 §FSRS, Report 02 §4.2, TODO-100, TODO-101, TODO-103 |
| `sim-input.mjs` | Text-extracts the Input (入力) engine functions from `JpnFlashcards.jsx` (same technique as `tools/test-input-engine.mjs`), loads `data/videos.json`, and prints recommendations for several simulated decks/levels, the kids-content share, the "Just right" level dynamics, the Background-mode reroll behaviour, and the `coverageAgainstDeck` kana-run bug (`これはペンです` vs `[これ]` = 100 %) | Report 02 §4.1, TODO-112…117 |
| `sec.mjs` | Extracts `SEED` from the JSX and prints card counts per section plus the 17 duplicated terms that the `term`-keyed seed merge collapses | Report 01 §seed-merge, Report 02 §4.3, TODO-009, TODO-124 |

They are deliberately crude (regex extraction of functions from a 6,000-line file) — once TODO-212/TODO-222 make the app importable, port the useful assertions into real `node --test` files and delete these.
