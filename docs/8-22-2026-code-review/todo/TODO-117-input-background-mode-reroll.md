# TODO-117 — "Background" (passive) mode: vary picks by seed instead of always returning the same three longest videos

**Priority:** P2   **Effort:** XS   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §4.1 ("Passive mode ignores the seed"), §6 row 5, §7 item 2
**Depends on:** none   **Blocks:** none

## Why
In passive mode `recommend()` returns the band filtered list sorted by duration descending and ignores `seed`, so "Show me others" does nothing until those three are opened or hidden. In every simulated scenario "Background 30" returned the identical three とんとん kids' videos for seed 1 and seed 8.

## Current behaviour (verified)
- L4400–4404:
  ```js
  if (mode === "passive") {
    // passive wants length and things already known to sit well
    return from.filter((it) => it.difficulty >= level - 10 && it.difficulty <= level + 4)
      .sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
  }
  ```
- `reroll = () => setSeed((s) => s + 7)` (L4653); `suggest` re-runs on `[seed]` (L4656–4659).
- Passive plan: `{ id: "passive", label: "Background", ja: "ながら", mode: "passive", medium: "listening" }` (L4514).

## Intended behaviour
Passive mode still prefers long, comfortable material, but rotates: take the comfortable band, keep items whose length fits the time budget (or ≥ 15 min when no budget), shuffle by `seed`, then lightly favour length (e.g. sort the top-12 shuffled by duration) so rerolls move through the set. Apply `avoidKids` (TODO-116) identically.

## Implementation steps
1. Replace L4400–4404 with:
   ```js
   if (mode === "passive") {
     // passive wants length and things already known to sit well — but a reroll has to
     // move: shuffle the comfortable band by seed first, then favour length among the
     // dozen that came up, instead of returning the three longest every time.
     const comfy = from.filter((it) => it.difficulty >= level - 10 && it.difficulty <= level + 4);
     const long = comfy.filter((it) => !it.durationSec || it.durationSec >= 600);       // ≥ 10 min reads as "background"
     const pool = long.length >= 3 ? long : comfy;
     return seededShuffle(pool, seed).slice(0, 12).sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
   }
   ```
2. Test (`tools/test-input-engine.mjs`, via a passive `recommendWrap` variant): with 20 comfortable items, seeds 1 and 8 return different sets (at least one difference); all returned items are within `[level−10, level+4]`.

## Data migration / compatibility
None.

## Testing & verification
- `node tools/test-input-engine.mjs`.
- `docs/8-22-2026-code-review/scripts/sim-input.mjs` "Background 30 seed1/seed8" lines differ.
- Manual: Background → "Show me others" changes the three picks.

## Acceptance criteria
- [ ] Passive picks differ between seeds.
- [ ] Passive picks stay in the comfortable band and prefer ≥ 10-minute items when available.

## Pitfalls / notes
- `minutes` budget filter (L4432–4435) still applies afterwards; for "60+" it is effectively off.
- Rebuild `index.html` and deploy.
