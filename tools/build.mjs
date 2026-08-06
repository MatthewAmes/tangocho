// tangocho build pipeline.
//
// index.html is the single deployed artifact: one self-contained file with the whole
// React app inlined in a <script> tag (Netlify runs no build step). This script is the
// only supported way to regenerate it — bundle JpnFlashcards.jsx with esbuild, then
// splice the result into index.html between the body's <script> ... </script>.
//
// This used to live in a Windows temp folder and kept getting wiped by disk cleanup,
// which is how a build once shipped without its ReactDOM mount call and produced a
// blank page. It lives in the repo now, and it hard-fails on the sanity checks below
// rather than writing an index.html that loads but renders nothing.
//
//   node build.mjs
//
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// fileURLToPath, not url.pathname — the project path contains a space ("Jpn App"),
// which pathname leaves percent-encoded and esbuild then can't resolve.
// This file lives in tools/, so the project root is one level up. The build tooling is
// deliberately NOT at the repo root: a root package.json would make Netlify start
// auto-detecting a build step, and this project ships a pre-built index.html with
// "No build steps found" on Netlify's side. Keep it that way.
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, "..");
const SRC = path.join(ROOT, "JpnFlashcards.jsx");
const HTML = path.join(ROOT, "index.html");

const result = await build({
  entryPoints: [SRC],
  bundle: true,
  minify: true,
  format: "iife",
  jsx: "automatic",
  loader: { ".jsx": "jsx" },
  // The source sits in the project root but node_modules lives here in tools/, and
  // esbuild resolves bare imports relative to the importing file. Point it at ours.
  nodePaths: [path.join(TOOLS, "node_modules")],
  write: false,
  logLevel: "warning",
});
const code = result.outputFiles[0].text;

// ── sanity checks on the bundle ────────────────────────────────────────────────
const must = [
  ["ReactDOM mount call", /createRoot\(/],
  ["#root target", /getElementById\("root"\)|getElementById\('root'\)/],
];
for (const [what, re] of must) {
  if (!re.test(code)) {
    console.error(`BUILD ABORTED — bundle is missing its ${what}.`);
    console.error("JpnFlashcards.jsx must end with the ReactDOM.createRoot(...).render(...) call.");
    process.exit(1);
  }
}

// The feed source list is split across the app and the Worker for good reasons (see
// check-feeds.mjs); a mismatch fails quietly at runtime, so catch it at build time.
await import("./check-feeds.mjs");

/* The counter and date readings are exam material. A wrong one would be drilled into him
   as confidently as a right one, so the tables are checked against a hand-written copy on
   every build rather than only when someone remembers to run the tests. */
for (const suite of ["test-counters.mjs", "test-romaji.mjs"]) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", suite)], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`\n${suite} FAILED — refusing to build\n${r.stdout || ""}${r.stderr || ""}`);
    process.exit(1);
  }
  console.log(`    ${suite.replace(/^test-|\.mjs$/g, "")} ${(r.stdout.match(/(\d+) passed/) || [])[1]} readings verified`);
}

// ── splice into index.html ────────────────────────────────────────────────────
// The <head> has an attributed <script src="…gsi/client" …> tag; matching the exact
// string "<script>" skips it, and lastIndexOf("</script>") lands on the body one.
const orig = fs.readFileSync(HTML, "utf8");
const open = orig.indexOf("<script>");
const close = orig.lastIndexOf("</script>");
if (open === -1 || close === -1 || close <= open) {
  console.error("BUILD ABORTED — could not find the inline <script> boundaries in index.html.");
  process.exit(1);
}
const head = orig.slice(0, open + "<script>".length);
const tail = orig.slice(close);
if (!/<div id="root"><\/div>\s*<script>$/.test(head)) {
  console.error("BUILD ABORTED — <script> boundary is not the one right after <div id=\"root\">.");
  console.error("head ends with: " + JSON.stringify(head.slice(-60)));
  process.exit(1);
}

const out = head + code + tail;
fs.writeFileSync(HTML, out, "utf8");

// Cloudflare Worker serves its static assets from cf/public, so mirror the same single
// artifact there. One build, both hosts — which is what makes the cutover reversible.
const CF_PUBLIC = path.join(ROOT, "cf", "public");
fs.mkdirSync(CF_PUBLIC, { recursive: true });
fs.writeFileSync(path.join(CF_PUBLIC, "index.html"), out, "utf8");

// The video index ships as a separate asset rather than inside the bundle: it's ~140KB of
// data that changes on a completely different schedule from the code, and keeping it out
// means the app still starts instantly if it fails to load.
// data assets that ship alongside the bundle
for (const asset of ["kanji.json"]) {
  const src = path.join(ROOT, "data", asset);
  if (fs.existsSync(src)) fs.writeFileSync(path.join(CF_PUBLIC, asset), fs.readFileSync(src, "utf8"), "utf8");
}
const VIDEOS = path.join(ROOT, "data", "videos.json");
let videoCount = 0;
if (fs.existsSync(VIDEOS)) {
  const json = fs.readFileSync(VIDEOS, "utf8");
  try { videoCount = (JSON.parse(json).videos || []).length; } catch (e) {
    console.error("BUILD ABORTED — data/videos.json is not valid JSON.");
    process.exit(1);
  }
  fs.writeFileSync(path.join(CF_PUBLIC, "videos.json"), json, "utf8");
}

const kb = (n) => (n / 1024).toFixed(1) + "kb";
console.log(`ok  bundle ${kb(code.length)}  ->  index.html ${kb(out.length)}  (+ cf/public`
  + (videoCount ? `, ${videoCount} videos` : ", NO video index") + ")");
