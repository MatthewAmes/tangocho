# TODO-212 — Make the app importable in Node without side effects (guard module-level DOM access; side-effect-free exports)

**Priority:** P0   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 1 bullet 4, § 3.4 "Module-load side effects", § 7.3 obstacle 1, F-1 (High); 05-expansion § 5.3
**Depends on:** TODO-211   **Blocks:** TODO-221…224 (modularization), TODO-228/229 (tests import instead of slicing)

## Why
`tools/test-input-engine.mjs` has to regex/brace-slice functions out of the 6k-line source and `eval` them because importing `JpnFlashcards.jsx` in Node throws: `retentionTarget` reads `window.localStorage` at import, `_googleEmail` reads storage, `TTS_OK` touches `window.speechSynthesis`, and the last line mounts React. This is the root testability blocker. The minimal fix — guard the handful of import-time DOM touches and move the mount into a separate entry — lets the modularization steps start from an importable file and lets tests `import` real functions.

## Current behaviour (verified)
- Import-time DOM access in `JpnFlashcards.jsx`:
  - L1045 `let _googleEmail = (() => { try { return window.localStorage.getItem(USER_EMAIL_KEY); } catch (e) { return null; } })();` — safe in Node (ReferenceError is caught) but reads storage at import.
  - L1157-1166 `if (typeof window !== "undefined") { window.addEventListener("online", …); document.addEventListener("visibilitychange", …); window.addEventListener("pagehide", …); }` — already guarded.
  - L1194-1198 `let retentionTarget = 0.9; try { const r = Number(window.localStorage.getItem(RETENTION_KEY)); … } catch (e) {}` — safe (caught) but import-time.
  - L3353 `const TTS_OK = typeof window !== "undefined" && !!window.speechSynthesis;` guarded; L3361-3364 `if (TTS_OK) { pickJpVoice(); … }` guarded.
  - L6083-6084 `import ReactDOM from "react-dom/client"; ReactDOM.createRoot(document.getElementById("root")).render(<JpnFlashcards />);` — **throws in Node** (`document` undefined) and mounts on import in the browser.
  - `export default function JpnFlashcards()` L1269 is the only export; pure functions (`mergeDeck`, `conjugate`, `applyRating`, `coverageAgainstDeck`, `kanaToRomaji`, `streakFrom`, …) are module-private.
- `tools/build.mjs:31-42` bundles `JpnFlashcards.jsx` as the entry (`format:"iife"`) and asserts the bundle contains `createRoot(` and `getElementById("root")` (L46-57).
- `tools/test-input-engine.mjs:13-46` `grab()` slices source text; imports via `data:` URL.

## Intended behaviour
`import("./JpnFlashcards.jsx")` (via esbuild or a JSX-capable loader) in Node succeeds with no DOM, registers no listeners, reads no storage, mounts nothing; it exports the root component *and* the pure functions needed by tests. A new `src/main.jsx` (or `main.jsx` at the root for now) does the mount and is the esbuild entry. The build sanity check still passes because `main.jsx` contains the `createRoot` call.

## Implementation steps
1. **Mount entry.** Create `/main.jsx`:
   ```jsx
   import React from "react";
   import ReactDOM from "react-dom/client";
   import JpnFlashcards, { installBrowserSideEffects } from "./JpnFlashcards.jsx";
   installBrowserSideEffects();
   ReactDOM.createRoot(document.getElementById("root")).render(<JpnFlashcards />);
   ```
   Delete L6082-6084 from `JpnFlashcards.jsx`. Change `tools/build.mjs` `SRC` (L28) to `path.join(ROOT, "main.jsx")`. The `must` checks (L46-57) still find `createRoot(` and `getElementById("root")` in the bundle.
2. **Gather import-time effects into one function** in `JpnFlashcards.jsx`, exported:
   ```js
   export function installBrowserSideEffects() {
     if (typeof window === "undefined") return;
     // sync retry listeners (moved from L1157-1166)
     window.addEventListener("online", () => { if (hasSyncPending()) pushCloudNow(); });
     document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && hasSyncPending()) pushCloudNow(); });
     window.addEventListener("pagehide", () => { if (_cloudPushTimer || hasSyncPending()) pushCloudNow({ keepalive: true }); });
     // TTS voice discovery (moved from L3361-3364)
     if (TTS_OK) { pickJpVoice(); try { window.speechSynthesis.onvoiceschanged = pickJpVoice; } catch (e) {} }
   }
   ```
   Replace L1157-1166 and L3361-3364 with a comment pointing here.
3. **Lazy storage reads.** `_googleEmail` (L1045): keep the variable but initialise lazily — `let _googleEmail = undefined; function googleEmailNow() { if (_googleEmail === undefined) { try { _googleEmail = window.localStorage.getItem(USER_EMAIL_KEY); } catch (e) { _googleEmail = null; } } return _googleEmail; }` and update the 3–4 readers (`grep -n _googleEmail`) to call `googleEmailNow()` (Browse initial state ~L3911; `signOutGoogle` L1041 sets it to `null`; `exchangeForSession` sets it). `retentionTarget` (L1194-1198): wrap the read in `function loadRetention() { … }` called from `installBrowserSideEffects()` **before** render (and from `setRetention`), keeping the module `let` so `fsrsReview(prior, grade, Date.now(), retentionTarget)` call sites (L1418) are untouched.
4. **Exports for tests.** Append to `JpnFlashcards.jsx` (temporary, until TODO-221/222 move these into modules):
   ```js
   export { mergeDeck, mergeDays, mergeScripts, mergeInput, mergeSnapshots, cardMergeKey, collectLocalSnapshot,
            streakFrom, mascotState, detectKind, sectionOf, sectionRank, hueFor,
            isWeak, masteryScore, dueness, statNeed, statReview, isLeech, prodDue, recallChance, needScore, effLevel,
            kanaToRomaji, kataToHira, canonR, norm, fillMatch,
            conjugate, GODAN_ROWS, CONJ_FORMS, CONJ_BANK, CONJ_TYPES,
            applyRating, evidenceWeight, learningRate, seedLevelsFromDeck, seededShuffle, recommend, coverageAgainstDeck, INPUT_VERDICTS, INPUT_CATALOG, FEED_SOURCES,
            SEED, SEED_VERSION, FREQ_SEED, SCRIPT_SEED, KANA_GROUPS };
   ```
   (Check each name exists with `grep -n "^function NAME\|^const NAME\|^let NAME"` before adding; drop any that don't.) Named exports in an IIFE bundle are simply dropped by esbuild — no bundle change besides tree-shaking keeping them (they are referenced anyway).
5. **Prove it imports.** Add `tools/import-smoke.mjs`:
   ```js
   import { build } from "esbuild";
   const r = await build({ entryPoints: ["JpnFlashcards.jsx"], bundle: true, format: "esm", write: false, jsx: "automatic", platform: "node", external: ["react", "react-dom"] });
   const mod = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
   if (typeof mod.default !== "function" || typeof mod.conjugate !== "function") { console.error("import smoke failed"); process.exit(1); }
   console.log("ok  JpnFlashcards.jsx imports without a DOM");
   ```
   Add it to `npm test`. (`react` must be importable from Node — it is, via root `node_modules` from TODO-211.)
6. Rebuild; `npm run check` will fail until `index.html` is rebuilt (expected — the bundle changes because the mount moved); commit the new `index.html`.

## Data migration / compatibility
none at runtime. Side-effect order changes from "at import" to "before first render" — identical in practice because `main.jsx` calls `installBrowserSideEffects()` synchronously before `createRoot`.

## Testing & verification
- `npm test` → import smoke passes; `node --input-type=module -e 'import("./tools/import-smoke.mjs")'`.
- Browser manual smoke (local server + prod after deploy): sync banner behaviour on offline→online (listeners installed), TTS auto-voice still plays (voices picked), retention chips show the stored value on reload, Google email shown in Browse when signed in.
- `npm run build` sanity checks still pass (`createRoot(` present in bundle).
- Bundle size unchanged within ±1 KB.

## Acceptance criteria
- [ ] `JpnFlashcards.jsx` has no top-level `createRoot`; `main.jsx` is the esbuild entry.
- [ ] `import-smoke.mjs` passes in Node with no DOM globals.
- [ ] Sync listeners, TTS voice discovery and retention load run once via `installBrowserSideEffects()`.
- [ ] Named exports available for the test items; `index.html` rebuilt + committed.

## Pitfalls / notes
- Do not use `window.__BUILD__`-style globals for the tests; `typeof` guards are enough.
- `export { … }` must come *after* all declarations (function declarations hoist; `const`/`let` do not — put the export block at the very end of the file).
- StrictMode/ErrorBoundary wrapping belongs to TODO-224.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
