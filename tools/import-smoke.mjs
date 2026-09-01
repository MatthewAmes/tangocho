/* Prove JpnFlashcards.jsx can be imported in Node with no DOM at all.
     node tools/import-smoke.mjs

   This is the test that keeps TODO-212 from quietly regressing. The file used to mount
   React on its last line and read localStorage while merely being loaded, so importing it
   outside a browser threw — and because it could not be imported, its tests could not
   import it either. tools/test-input-engine.mjs used to cut functions out of the source
   text with a regex and eval them, which is a way of testing a string rather than a program.

   The guarantee is narrow and worth stating exactly: importing the module must not touch
   the DOM, must not register listeners, and must not read storage. Anything that needs a
   browser belongs in installBrowserSideEffects(), which main.jsx calls before the first
   render. If someone puts a side effect back at module scope, this fails — there is no
   `window` here to catch it. */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, "..");

/* No jsdom, no globals: a bare Node module scope. `window`, `document` and `localStorage`
   are genuinely absent, which is the condition being tested. */
for (const name of ["window", "document", "localStorage", "navigator"]) {
  if (name in globalThis && name !== "navigator") {
    console.error(`import-smoke is meaningless with a global ${name} — refusing to pretend`);
    process.exit(1);
  }
}

const result = await build({
  entryPoints: [path.join(ROOT, "JpnFlashcards.jsx")],
  bundle: true,
  format: "esm",
  jsx: "automatic",
  platform: "node",
  nodePaths: [path.join(TOOLS, "node_modules")],
  write: false,
  logLevel: "warning",
});

const code = result.outputFiles[0].text;
const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const checks = [
  ["default export is the app component", typeof mod.default === "function"],
  ["installBrowserSideEffects is exported", typeof mod.installBrowserSideEffects === "function"],
  ["Boundary is exported for the mount entry", typeof mod.Boundary === "function"],
  ["no createRoot at module scope", !/createRoot\(/.test(code.split("\n").slice(-40).join("\n"))],
];

let bad = 0;
for (const [what, ok] of checks) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) bad++;
}

/* Calling it with no window must be a no-op rather than a throw. main.jsx never does this,
   but a test or a future server-render would, and "returns quietly" is the contract. */
try {
  mod.installBrowserSideEffects();
  console.log("  PASS  installBrowserSideEffects() is a no-op without a window");
} catch (e) {
  console.log("  FAIL  installBrowserSideEffects() threw without a window: " + e.message);
  bad++;
}

console.log(bad ? `\nimport smoke FAILED (${bad})` : "\nok  JpnFlashcards.jsx imports without a DOM");
process.exitCode = bad ? 1 : 0;
