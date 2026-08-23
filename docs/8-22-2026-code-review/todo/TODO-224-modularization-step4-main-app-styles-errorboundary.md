# TODO-224 — Modularization step 4: `src/main.jsx` + `src/app/App.jsx` + `src/styles.css`, wrapped in an `ErrorBoundary` (+ StrictMode in dev)

**Priority:** P1   **Effort:** S   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 9.3 step 4, § 5 R1 (no error boundary), R2 (StrictMode), § 11 "No client error reporting" (boundary part), F-10
**Depends on:** TODO-223   **Blocks:** TODO-225

## Why
A render exception anywhere currently blanks the page (the history already has one blank-page incident). The root component, the 480-line CSS string and the mount still live in the one file. Extracting `App.jsx`, a real `styles.css` (imported as text so the `<style>{CSS}</style>` behaviour is byte-equivalent), and an `ErrorBoundary` that says "Something broke — your data is safe — Backup / Reload" is cheap insurance and the last step before tabs move to files.

## Current behaviour (verified)
- Root component `export default function JpnFlashcards()` (L1269-1496): state `cards/ready/tab/storageOk`, `bannerBackup`, storage self-test effect, `loadCardsAndSync`, `persist/addCards/removeCard/clearAll/restoreDeck/setMnemonic/recordResult`, render with `<style>{CSS}</style>` (L1446) and the tab switch.
- `CSS` template string L5601-6080 (`const CSS = \`…\``), injected into the React tree (so first paint is blank until React mounts — see TODO-218).
- Mount: after TODO-212, `/main.jsx` at the root; no `React.StrictMode`, no error boundary, no `window.onerror`.
- `tools/build.mjs` loader map `{ ".jsx": "jsx" }` (L37); no `.css` loader.

## Intended behaviour
```
src/main.jsx        installs + createRoot(...).render(<ErrorBoundary><App/></ErrorBoundary>)  (StrictMode when `import.meta.env?.DEV` / a `__DEV__` define)
src/app/App.jsx     the former JpnFlashcards(): tabs, load chain, recordResult (until TODO-227 extracts applyReview)
src/styles.css      the CSS string verbatim; imported with esbuild `loader: {".css": "text"}` and rendered as `<style>{CSS}</style>` exactly as today (byte-equivalent output)
src/components/ErrorBoundary.jsx
```
Later (optional, separate commit): move the CSS into `<head>` at build time instead of the React tree so styles paint before JS — a visible improvement, not part of this step.

## Implementation steps
1. `mkdir -p src/app src/components`; `git mv main.jsx src/main.jsx` (update `tools/build.mjs` `SRC` to `src/main.jsx` and relative imports).
2. Cut L5601-6080 into `src/styles.css` **without** the `const CSS = \`` / `\`;` wrapper; in `App.jsx`: `import CSS from "../styles.css";` and keep `<style>{CSS}</style>`. In `tools/build.mjs` set `loader: { ".jsx": "jsx", ".css": "text" }`. Note: a template literal can contain `\`` escapes or `${`; the current CSS has none (verified by building), but if `\\` sequences exist they will now be literal — diff the unminified output to confirm.
3. Move the root component into `src/app/App.jsx` as `export default function App()` with the imports it needs (`react`, `../lib/*`, `../data/*`, the tab components — still exported from `JpnFlashcards.jsx` until TODO-225: `import { Study, Freq, ConjDrill, Input, Write, Kana, Scripts, Browse, Mascot } from "../../JpnFlashcards.jsx";` — add those named exports now).
4. `src/components/ErrorBoundary.jsx`:
   ```jsx
   import React from "react";
   export default class ErrorBoundary extends React.Component {
     constructor(p) { super(p); this.state = { err: null }; }
     static getDerivedStateFromError(err) { return { err }; }
     componentDidCatch(err, info) { try { (window.__tcReport || (() => {}))(err, info); } catch (e) {} }
     render() {
       if (!this.state.err) return this.props.children;
       return (
         <div className="tc-root"><div className="tc-shell"><div className="tc-empty" role="alert">
           <p><b>Something broke.</b> Your words and progress are safe on this device.</p>
           <p style={{ fontSize: 12, opacity: .7, wordBreak: "break-word" }}>{String(this.state.err && this.state.err.message)}</p>
           <div className="tc-donebtns">
             <button className="tc-btn tc-btn-primary" onClick={() => location.reload()}>Reload</button>
             <button className="tc-btn" onClick={() => this.props.onBackup?.()}>Download backup</button>
           </div>
         </div></div></div>);
     }
   }
   ```
   `onBackup` = a `collectBackup()` from `lib/backup.js` once TODO-226 extracts it; until then pass the root's `bannerBackup` via a module-level hook or omit the button. The boundary must render its own `<style>` too (it is outside `App`): `import CSS from "../styles.css"` and include `<style>{CSS}</style>` in the fallback.
5. `src/main.jsx`:
   ```jsx
   const DEV = typeof __DEV__ !== "undefined" && __DEV__;   // define in build.mjs: __DEV__: JSON.stringify(process.argv.includes("--dev"))
   const tree = <ErrorBoundary><App /></ErrorBoundary>;
   ReactDOM.createRoot(document.getElementById("root")).render(DEV ? <React.StrictMode>{tree}</React.StrictMode> : tree);
   ```
   StrictMode double-invokes effects in dev only; with `--dev` builds, verify `loadCardsAndSync` and `initGoogleAuth` tolerate it (the latter now returns an unsubscribe; the former is idempotent because `pullAndMergeCloud` merges).
6. Optional global hooks in `main.jsx`: `window.addEventListener("error"/"unhandledrejection", …)` → `window.__tcReport` → beacon to `/api/log` (TODO-238 owns the Worker route; until then just `console.error`).
7. Build, `npm run check` (bundle differs by the boundary — expected; verify with `minify:false` diff that the CSS text is byte-identical), `npm test`, manual smoke.

## Data migration / compatibility
none

## Testing & verification
- Temporarily throw inside `Study` render (`if (Math.random() < 2) throw new Error("boom")`) → build → the fallback shows with Reload; remove the throw.
- `diff <(node -e 'console.log(require("fs").readFileSync("src/styles.css","utf8"))') <(git show HEAD~1:JpnFlashcards.jsx | sed -n '/^const CSS = `/,/^`;/p' | sed '1d;$d')` → empty (CSS moved verbatim).
- `npm run build -- --dev` (add passthrough in the npm script) → StrictMode on; app loads; no duplicate listeners (check `_syncWatchers.size` stays 1 per mounted Browse).
- Prod smoke after deploy.

## Acceptance criteria
- [ ] `src/main.jsx`, `src/app/App.jsx`, `src/styles.css`, `src/components/ErrorBoundary.jsx` exist; `JpnFlashcards.jsx` now contains only the tab components (temporarily exported).
- [ ] A thrown render error shows the fallback instead of a blank page.
- [ ] CSS text byte-identical to the old template string; `index.html` rebuilt + committed.

## Pitfalls / notes
- `loader: {".css": "text"}` is essential — esbuild's default CSS loader would emit a separate CSS bundle and break the single-file splice.
- Keep `<style>` injection inside the tree for now (parity); moving it to `<head>` is a follow-up that must also update the `build.mjs` splice.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
