// The Worker owns the feed URLs (so the client can't turn it into an open proxy) but the
// app owns the list of which sources HAVE feeds. Those two lists have to agree: if the
// app thinks a source has a feed and the Worker doesn't, the source silently degrades to
// a channel link — the exact failure this whole change was meant to remove, and one that
// looks like nothing is wrong. Run from tools/build.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(ROOT, "JpnFlashcards.jsx"), "utf8");
const worker = fs.readFileSync(path.join(ROOT, "cf/src/index.js"), "utf8");

const block = (src, start, open, close) => {
  const a = src.indexOf(start);
  if (a === -1) throw new Error("could not find " + start);
  let d = 0, i = src.indexOf(open, a);
  for (; i < src.length; i++) {
    if (src[i] === open) d++;
    else if (src[i] === close) { d--; if (!d) { i++; break; } }
  }
  return src.slice(a, i);
};

const appIds = new Set(Array.from(block(app, "const FEED_SOURCES = new Set(", "[", "]").matchAll(/"([\w-]+)"/g)).map((m) => m[1]));
const workerIds = new Set(Array.from(block(worker, "const FEEDS = {", "{", "}").matchAll(/"([\w-]+)":\s*"http/g)).map((m) => m[1]));
// every source the app offers at all, so a feed can't point at an id that no longer exists
const catalogIds = new Set(Array.from(app.matchAll(/\{\s*id:\s*"([\w-]+)",\s*title:/g)).map((m) => m[1]));

const problems = [];
for (const id of appIds) if (!workerIds.has(id)) problems.push(`app expects a feed for "${id}" but the Worker has none`);
for (const id of workerIds) if (!appIds.has(id)) problems.push(`Worker has a feed for "${id}" the app never asks for`);
for (const id of workerIds) if (!catalogIds.has(id)) problems.push(`feed "${id}" matches no catalog entry`);

if (problems.length) {
  console.error("FEED LIST MISMATCH");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
console.log(`    feeds ${appIds.size} sources, app and Worker agree`);
