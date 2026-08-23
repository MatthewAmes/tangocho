# TODO-124 — Clean up the 17 duplicate terms in SEED (decide per pair), add a build-time duplicate-key check, and ship the one-off repair for decks corrupted by the term-keyed merge

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 01-functionality §1.1 (HIGH; simulation: 16 cards missing, うち/前/写真/方 corrupted); 02-pedagogy §4.3 duplicates, §7 item 8; 06-architecture §6.3, F-6; 05-expansion §5.5 invariants
**Depends on:** TODO-009 (Theme A: seed re-merge keyed by `cardMergeKey`, deck repair, 方 de-collision via `sec: "6-3#2"`, and a build-time duplicate-key check) — this item owns the *content* decisions per duplicate pair and the "warn on same-term distinct-key" extension of that check   **Blocks:** TODO-122 (examples/POS attach per row)

## Why
SEED contains 17 duplicated terms. Because the seed re-merge keys by `term`, on a deck that predates the Act 4–6 import the later row overwrites the earlier card's meaning/lesson (うち "house" → "our company", 前 "before" → "front", 写真 moves to lesson 43 with `sec` undefined so it lands in "Class notes") and the second card is never created (simulation: 805 cards vs 821 fresh). Theme A fixes the merge key; the content question — which duplicates are *legitimate* (two senses taught in two scenes) and which are accidental re-entries — is a deck decision that must be made explicitly, and an invariant must stop it recurring.

## Current behaviour (verified)
Duplicate pairs (line numbers in `JpnFlashcards.jsx`; `sec` shown):
| term | first | second | verdict proposal |
|---|---|---|---|
| 復習 | L62 lesson 3 (no sec) "review (of what you have learned)" | L644 lesson 39 sec 5-6 "review (する = to review)" | accidental → keep one (merge meanings; `sec 5-6`) |
| 写真 | L64 l3 "photograph; photo" | L712 l43 sec 6-3 "photo" | accidental → keep one, `sec 6-3`, meaning "photograph; photo" |
| 読み | L65 l3 | L635 l39 sec 5-6 | accidental → keep 5-6 |
| 書き | L66 l3 | L636 l39 sec 5-6 | accidental → keep 5-6 |
| あとで | L120 l9 | L650 l39 sec 5-6 "later; 〜のあとで = 'after ~'" | accidental → keep 5-6 (richer meaning) |
| うち | L158 l12 "house; home; one's in-group" | L611 l38 sec 5-5 "our company" | **legitimate two senses** → keep both, give the first `sec: "2-5"` (SECTION_MAP already maps うち→2-5, L2151) |
| 何か | L168 l12 | L778 l45 sec 6-5 | accidental → keep one (`sec 2-8` via SECTION_MAP vs 6-5 — pick 2-8, first taught) |
| 外 | L187 l14 "outside; the out-group" | L692 l42 sec 6-2 "outside" | accidental → keep one with the fuller meaning, `sec 6-2` |
| では | L230 l5 "well then; in that case" | L549 l33 sec 4-7R "written equivalent of じゃ" | legitimate (two uses) → keep both; give the first `sec` via SECTION_MAP or "Act 1" |
| なるほど | L272 sec 3-1 | L311 sec 3-3 | legitimate per `cardMergeKey` comment (L936) → keep both |
| 前 | L284 sec 3-2 "before (time); in front of" | L716 sec 6-3 "front" | legitimate (time vs space) → keep both |
| 〜で | L336 sec 3-4 "at/in ~ (place)" | L606 sec 5-4 "by means of ~" | legitimate → keep both |
| 〜に | L337 sec 3-4 "at ~ (time)" | L604 sec 5-4 "to, towards ~" | legitimate → keep both |
| 質問 | L350 sec Culture talk | L564 sec 5-2 | accidental → keep 5-2 |
| 〜つ | L360 sec 3-5 | L578 sec 5-3 | accidental → keep 3-5 |
| 〜人 | L367 sec 3-5 | L706 sec 6-2 | accidental → keep 3-5 (richer meaning) |
| 方 | L713 sec 6-3 "way, alternative" | L722 sec 6-3 "person (honorific)" | legitimate **but same key** — TODO-009 de-collides it (`sec: "6-3#2"` on L722, `sectionOf` strips `#n`); nothing further here |
- Seed merge L1331–1342 (TODO-009 rewrites); `cardMergeKey` L936; `tools/check-feeds.mjs` is the existing build-time invariant pattern (imported by `build.mjs` L61); TODO-009 step 5 adds the duplicate-key build check (`tools/check-seed.mjs`).

## Intended behaviour
- Every SEED row is unique by `cardMergeKey` (term|lesson|sec). Accidental duplicates are removed (one row survives with the merged/fuller meaning and the earliest-taught `sec`); legitimate sense pairs keep both rows with distinct `sec`. The 方 pair gets distinct keys.
- TODO-009's `tools/check-seed.mjs` fails the build when two SEED rows share `term|lesson|sec`; this item extends it to **warn** (not fail) on rows sharing `term` with different keys, so legitimate sense pairs are listed and reviewed on purpose.
- A one-off repair (TODO-009 ships the mechanism: re-add missing `(term,lesson,sec)` rows and restore overwritten meanings from SEED) — this item supplies the *target* SEED the repair converges to; the repair itself is "run the key-based seed merge once" after the content is fixed.

## Implementation steps
1. Edit SEED per the table (delete the accidental second rows, or the first when the second has the richer meaning/`sec`; merge meanings by hand; add `sec` to the surviving first-occurrence rows where SECTION_MAP already knows the scene). 方 is already de-collided by TODO-009 (`sec: "6-3#2"`); leave both rows.
2. `SEED_VERSION` 30 → 31 (L14).
3. `tools/check-seed.mjs` (create it if TODO-009 has not; otherwise add the same-term warning to TODO-009's version):
   ```js
   import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
   const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
   const src = fs.readFileSync(path.join(ROOT, "JpnFlashcards.jsx"), "utf8").slice(0, /* up to */ src.indexOf("const uid ="));
   // reuse the SEED row regex from the review scratch scripts (one row per line); extract term/lesson/sec/sense
   const keys = new Map(); let dupKeys = 0; const sameTerm = new Map();
   for (const m of src.matchAll(/\{ term: "([^"]+)",[^\n]*?lesson: (\d+)(?:, sec: "([^"]+)")?(?:, sense: "([^"]+)")?/g)) { const k = [m[1], m[2], m[3]||"", m[4]||""].join("|"); if (keys.has(k)) { dupKeys++; console.error("DUPLICATE SEED KEY " + k); } keys.set(k, 1); sameTerm.set(m[1], (sameTerm.get(m[1])||0)+1); }
   for (const [t, n] of sameTerm) if (n > 1) console.warn("note: " + t + " appears " + n + "× (distinct keys — intended senses)");
   if (dupKeys) { console.error(dupKeys + " duplicate seed keys"); process.exit(1); }
   console.log("seed keys unique (" + keys.size + " rows)");
   ```
   (Because `SEED` rows are one per line this regex is reliable; it is the same approach `tools/yt-index.mjs` L49–55 uses to scrape terms. Drop the `sense` capture if unused — TODO-009 uses `sec` suffixes, not a `sense` field.) Import it from `tools/build.mjs` next to `check-feeds.mjs` (L61).
4. After TODO-009's key-based merge lands, run the app once on a deck that has the corrupted state (the author's) and verify the repair converges: 821 rows after this cleanup → the deck ends with exactly the SEED key set ∪ user-added cards.

## Data migration / compatibility
Handled by TODO-009's key-based merge + repair; after this item, the repair's target is a SEED with unique keys, so devices converge to the same deck. Removing an accidental duplicate row from SEED does **not** delete the corresponding card from existing decks (merge only adds/updates) — decide whether the repair should drop cards whose `(term,lesson,sec)` no longer exists in SEED and were never studied (`seen === 0`); recommended yes for `seen === 0`, never for studied cards.

## Testing & verification
- `node tools/check-seed.mjs` passes; introduce a duplicate temporarily → build aborts.
- `node tools/build.mjs` runs the check (output line "seed keys unique (N rows)").
- Re-run the report's migration simulation (01 Appendix A: "deck = SEED rows with lesson ≤ 30, studied, then merged") against the new SEED + TODO-009's merge: result equals fresh-install card count, うち keeps "house; home", 前 keeps "before (time)".
- Build + deploy.

## Acceptance criteria
- [ ] No two SEED rows share `term|lesson|sec`; legitimate sense pairs are explicit (distinct `sec`, incl. TODO-009's `6-3#2`).
- [ ] `tools/check-seed.mjs` runs in the build, fails on duplicate keys and warns on same-term/different-key pairs.
- [ ] `SEED_VERSION` bumped; the simulation shows no lost/corrupted cards after migration.

## Pitfalls / notes
- Do the content edit in one commit with a table like the one above in the commit body — the project's commit-message discipline is its real documentation.
- `SECTION_MAP` (L2151) still maps some of these terms (うち→2-5, 何か→2-8); adding explicit `sec` to the rows makes `sectionOf` deterministic regardless of the map.
- Rebuild `index.html` and deploy.
