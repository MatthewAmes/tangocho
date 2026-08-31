/* Turn the parsed textbook scripts into the runtime asset the app loads.
     node tools/build-scripts-asset.mjs <dir-with-book*.txt>

   Writes data/private/scripts-books.json, which is GITIGNORED on purpose.

   Matthew owns the books and is building this for himself, which settles the use — but the
   repo is public, and anything committed is published regardless of who uses the app. So
   the content takes the route the app already has for large assets: the build mirrors
   data/*.json into cf/public/, which is itself gitignored, and Cloudflare serves it as a
   static file. The scripts reach the deployed app and never reach git.

   The consequence to know about: this asset lives on Cloudflare and on his machines, not in
   version control. Losing it means re-running two commands against the PDFs, which is why
   the parser is committed and its output is not. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenes } from "./import-scripts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "private");
const OUT = path.join(OUT_DIR, "scripts-books.json");

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("usage: node tools/build-scripts-asset.mjs <dir with pdftotext output>");
  console.error("  pdftotext -enc UTF-8 'NihonGO NOW Vol 2.pdf' book.txt");
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
const scenes = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  for (const s of parseScenes(text)) {
    // A scene can appear in more than one book (a Vol 1 scene reprinted in Vol 2's review);
    // first parse wins, and richer parses do not silently replace poorer ones.
    if (scenes.some((x) => x.name === s.name)) continue;
    scenes.push(s);
  }
}
scenes.sort((a, b) => a.act - b.act || a.scene - b.scene);

/* Emitted in SCRIPT_SEED's shape so the Scripts tab, the cloze index and the session
   composer all take it without knowing where it came from. */
const out = scenes.map((s) => ({
  id: `book-${s.name}`,
  name: s.name,
  act: s.act,
  scene: s.scene,
  title: s.jaTitle,
  lines: s.turns.map((t) => ({
    speaker: t.speaker || "",
    tokens: t.tokens,
    // romaji and en are left out rather than guessed; the Scripts tab can annotate on
    // demand through /api/ai, and a wrong translation is worse than a missing one.
    en: "",
  })),
}));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`${out.length} scenes, ${out.reduce((n, s) => n + s.lines.length, 0)} lines -> data/private/scripts-books.json (${kb(fs.statSync(OUT).size)})`);
console.log("gitignored; the build mirrors it into cf/public/ for Cloudflare to serve.");
