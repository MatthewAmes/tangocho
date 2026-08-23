# TODO-221 — Modularization step 1: move the data blocks (SEED, SCRIPT_SEED, FREQ_SEED, CONJ_*, INPUT_CATALOG/FEED_SOURCES, kana tables, SECTION_MAP) into `src/data/*.js`

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 1 bullet 3, § 3.3 line map, § 9.1 target tree, § 9.3 step 1, Appendix B byte composition; 05-expansion § 5.3
**Depends on:** TODO-211 (`npm run check`), TODO-212 (importable file, `main.jsx` entry)   **Blocks:** TODO-222

## Why
57% of `JpnFlashcards.jsx` by bytes is data and CSS (SEED 131.6 KB, SCRIPT_SEED 60.2 KB, FREQ_SEED 17.2 KB, INPUT_CATALOG 8.2 KB, CONJ_BANK 7.3 KB, kana tables 5.4 KB, SECTION_MAP 2.6 KB). Moving these out is pure cut-and-paste of `const` declarations into `export const`, cuts the file roughly in half, and — because esbuild inlines constants identically — is expected to produce a **byte-identical** bundle, which `npm run check` proves. It also makes the later test items trivial (tests import `SEED` instead of slicing it).

## Current behaviour (verified)
- `JpnFlashcards.jsx` top-level data (line ranges from the 06 report, re-confirmed by grep): `SEED` L17-862 (`const SEED = [` … `];`), `SEED_VERSION` L14, `KIND_LABEL` L1185, `SECTION_MAP` L2151 (one 2,554-char line) + `SECTION_HUES` L2156, kana tables L2498-2570 (rows + `KANA_GROUPS` L2564 + `KANA_LENGTHS` L2571), `SCRIPT_SEED` L2947-3350 (+ `scriptPrompt` L2937), `CONJ_TYPES`/`CONJ_BANK`/`CONJ_FILTERS` L4117-4178, `FEED_SOURCES` + `INPUT_CATALOG` L4179-4332 (with `INPUT_KEY`, `FEED_ENDPOINT`, `VIDEOS_URL` nearby), `INPUT_VERDICTS`/`INPUT_PLANS`/`INPUT_TIMES`/`INPUT_BANDS` L4333-4520, `GODAN_ROWS`/`CONJ_FORMS` L4954-5001 (with `conjugate`), `FREQ_SEED` + `FREQ_VERSION` L5222-5378, `CSS` L5601-6080.
- `tools/check-feeds.mjs` reads `JpnFlashcards.jsx` text and brace-matches `const FEED_SOURCES = new Set(` and the catalog regex `/\{\s*id:\s*"([\w-]+)",\s*title:/g` — it must be repointed.
- `data/` today holds generated files only (`mascot.js`, `videos.json`).

## Intended behaviour
```
src/data/seed.js            export const SEED_VERSION = 30; export const SEED = [...]
src/data/scripts-seed.js    export const SCRIPT_SEED = [...]
src/data/freq-seed.js       export const FREQ_VERSION = …; export const FREQ_SEED = [...]
src/data/conj-bank.js       export const CONJ_TYPES, CONJ_BANK, CONJ_FILTERS
src/data/input-catalog.js   export const FEED_SOURCES, INPUT_CATALOG, INPUT_VERDICTS, INPUT_PLANS, INPUT_TIMES, INPUT_BANDS
src/data/kana-tables.js     export const KANA_ROWS… (whatever the row consts are named), KANA_GROUPS, KANA_LENGTHS
src/data/sections.js        export const SECTION_MAP, SECTION_HUES
src/data/mascot.js          (git mv data/mascot.js; update tools/make-mascot.mjs output path)
```
`JpnFlashcards.jsx` imports them; no behaviour change; bundle byte-identical (or, after TODO-210's stamp, identical modulo the stamp).

## Implementation steps
1. `mkdir -p src/data`. For each block: cut the exact `const X = …;` text (including its leading rationale comment) into the new file, prefix `export`, and add `import { X } from "./src/data/….js";` at the top of `JpnFlashcards.jsx`. Keep declaration order inside each file as it was (some blocks reference earlier ones, e.g. `CONJ_FILTERS` references `CONJ_TYPES`). Do **not** move functions in this step (`conjugate`, `scriptPrompt`, `sectionOf`, `band` stay) — only constants.
2. `SEED_VERSION` goes with `SEED`; `FREQ_VERSION` with `FREQ_SEED`. `KIND_LABEL` can move to `sections.js` or stay.
3. `git mv data/mascot.js src/data/mascot.js`; in `tools/make-mascot.mjs` change the output path (`path.join(ROOT, "data", "mascot.js")` → `src/data/mascot.js`; grep for `"data", "mascot.js"`); update the import at `JpnFlashcards.jsx:9`. `data/videos.json` stays (it is an asset, not source).
4. `tools/check-feeds.mjs`: replace the text-slicing with real imports:
   ```js
   const { FEED_SOURCES, INPUT_CATALOG } = await import(path.join(ROOT, "src/data/input-catalog.js"));
   const appIds = new Set(FEED_SOURCES); const catalogIds = new Set(INPUT_CATALOG.map((s) => s.id));
   ```
   keep the Worker-side regex on `cf/src/index.js` (it is not importable without `env` until TODO-227 shares the list).
5. `npm run build` then `npm run check` (or `cmp` against the pre-move `index.html` saved aside) — expect identical. If esbuild reorders something and bytes differ, build both versions with `minify:false` and `diff` to confirm only import boilerplate moved.
6. Commit: "Split data out of JpnFlashcards.jsx (no behaviour change; bundle identical)".

## Data migration / compatibility
none at runtime. `SEED_VERSION` stays 30 — no seed merge runs.

## Testing & verification
- Before: `cp index.html /tmp/index.before.html`. After: `npm run build && cmp index.html /tmp/index.before.html` → identical (strip the build meta if TODO-210 is in: `diff <(sed 's/<meta name="build"[^>]*>//' index.html) <(sed … /tmp/index.before.html)`).
- `npm test` green (input-engine test still slices until TODO-222; the smoke import passes).
- `node tools/check-feeds.mjs` → "feeds 17 sources, app and Worker agree".
- `wc -l JpnFlashcards.jsx` ≈ 3,900 (from 6,084).

## Acceptance criteria
- [ ] All listed constants live in `src/data/*.js` as named exports; JSX imports them.
- [ ] Bundle byte-identical (modulo build stamp); `npm run check` green.
- [ ] `check-feeds.mjs` imports instead of slicing the app source.
- [ ] `index.html` rebuilt + committed (unchanged content) and `src/data/` committed.

## Pitfalls / notes
- `SECTION_MAP` is a single 2,554-char line — move it verbatim; don't reformat (keeps the diff reviewable).
- esbuild resolves `./src/data/seed.js` relative to `JpnFlashcards.jsx` (repo root) — fine with the root entry from TODO-212.
- Theme B may bump `SEED_VERSION`/edit SEED concurrently — coordinate the move to avoid a conflict in a 130 KB file (do this step in one sitting and merge quickly).
