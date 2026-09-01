/* Turn the scraped scene scripts into the runtime asset the app loads.
     node tools/scrape-scripts.mjs > data/private/scripts-web.json
     node tools/build-scripts-asset.mjs

   Writes data/private/scripts-books.json, which is GITIGNORED on purpose.

   Matthew owns the books and is building this for himself, which settles the use — but the
   repo is public, and anything committed is published regardless of who uses the app. So
   the content takes the route the app already has for large assets: the build mirrors
   data/*.json into cf/public/, which is itself gitignored, and Cloudflare serves it as a
   static file. The scripts reach the deployed app and never reach git.

   The consequence to know about: this asset lives on Cloudflare and on his machines, not in
   version control. Losing it means re-running two commands, which is why the tools are
   committed and their output is not.

   ## Why the source is the website and not the PDFs

   This read the textbook PDFs first (tools/import-scripts.mjs, still used for the furigana
   dictionary). The book sets each speaker's lines in a column, so a scene came out grouped
   by speaker instead of interleaved: 9-2 is eight alternating turns on the page and arrived
   as two long blocks. The site publishes the same scenes already split into labelled turns,
   which is the structure the app needs, so it wins on the one thing that was wrong. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCRIPT_SEED } from "../src/data/scripts-seed.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2] || path.join(ROOT, "data", "private", "scripts-web.json");
const OUT_DIR = path.join(ROOT, "data", "private");
const OUT = path.join(OUT_DIR, "scripts-books.json");

if (!fs.existsSync(SRC)) {
  console.error(`no ${path.relative(ROOT, SRC)} — run tools/scrape-scripts.mjs first:`);
  console.error("  node tools/scrape-scripts.mjs > data/private/scripts-web.json");
  process.exit(1);
}

const scenes = JSON.parse(fs.readFileSync(SRC, "utf8"));
const textOf = (l) => (l.tokens || []).map((t) => t.t).join("");

/* The 34 hand-entered Vol 1 scenes already carry furigana, romaji and a translation, which
   is strictly more than the site gives. The app merges by name and keeps what it has, so a
   scraped duplicate would only sit in storage unused — drop it here instead. */
const seeded = new Set(SCRIPT_SEED.map((s) => s.name));

const out = [];
for (const s of scenes) {
  if (seeded.has(s.name)) continue;
  const lines = s.lines.map((l) => ({
    speaker: l.speaker || "",
    tokens: l.tokens,
    romaji: l.romaji || "",
    en: l.en || "",
  }));
  const annotated = lines.some((l) => l.romaji);
  out.push({
    id: `web-${s.name}`,
    name: s.name,
    act: s.act,
    scene: s.scene,
    title: s.title || "",
    lines,
    /* raw and plain are what the Scripts tab's existing "＋ふりがな" path runs on: plain marks
       a scene as missing furigana/romaji/English, raw is what gets sent to the annotate task
       to fill them in. The site publishes none of the three, so every scraped scene starts
       plain and is completed in the app, where a signed-in session exists — rather than
       here, where reaching the AI endpoint would mean handling a session secret. */
    raw: lines.map((l) => `${l.speaker}：${textOf(l)}`).join("\n"),
    plain: !annotated,
  });
}
out.sort((a, b) => a.act - b.act || a.scene - b.scene);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const lines = out.reduce((n, s) => n + s.lines.length, 0);
console.log(`${out.length} scenes, ${lines} lines -> data/private/scripts-books.json (${kb(fs.statSync(OUT).size)})`);
console.log(`${scenes.length - out.length} skipped — already hand-entered in SCRIPT_SEED with romaji and translations.`);
console.log(`${out.filter((s) => s.plain).length} start plain; the Scripts tab annotates them via /api/ai.`);
console.log("gitignored; the build mirrors it into cf/public/ for Cloudflare to serve.");
