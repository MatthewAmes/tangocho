/* Turn the parsed activity-book exercises into the runtime asset the Quizzes tab loads.
     pdftotext -enc UTF-8 -layout "Vol 1 Activity Book.pdf" ab1.txt
     pdftotext -enc UTF-8 -layout "Vol 2 Activity Book.pdf" ab2.txt
     node tools/build-quiz-asset.mjs ab1.txt ab2.txt

   Writes data/private/quizzes.json, which is GITIGNORED on purpose — same reasoning as the
   scripts asset: Matthew owns the books, the repo is public, and committing the content
   would publish it. The build mirrors data/*.json into cf/public/ (also gitignored) and
   Cloudflare serves it, so the app gets the exercises and git never does.

   Volume is taken from the file order rather than guessed from the acts inside, because
   both books contain cross-references to the other one. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuizzes } from "./import-quizzes.mjs";
import { volumeOfAct } from "./curriculum.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "private");
const OUT = path.join(OUT_DIR, "quizzes.json");

/* "b", "3", "c)" — an answer that only points at something printed on the page. */
const BARE_LABEL = /^[a-z][.)]?$|^\d{1,2}[.)]?$/i;

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node tools/build-quiz-asset.mjs <activity-book.txt> [more.txt]");
  console.error("  pdftotext -enc UTF-8 -layout 'Activity Book.pdf' ab.txt");
  process.exit(1);
}

const out = [];
for (const f of files) {
  if (!fs.existsSync(f)) { console.error(`missing: ${f}`); process.exit(1); }
  for (const ex of buildQuizzes(fs.readFileSync(f, "utf8"))) {
    /* Audio exercises are dropped rather than shipped: the printed page is empty
       checkboxes and the question is in a recording the app does not have, so there is
       nothing to ask. They are counted below so the omission is visible, not silent. */
    if (!ex.answered) continue;
    if (out.some((x) => x.id === ex.id)) continue;      // an exercise reprinted in both books
    /* An answer that is a bare letter refers to options PRINTED IN THE BOOK — "3. b" means
       nothing without the page in front of you, and the app does not have it. Shipping
       those produced questions that could not be answered, only guessed: 201 of 558 items
       and 40 whole exercises. They are dropped rather than shown, because a quiz that asks
       what it cannot answer is worse than a shorter quiz. */
    const answerable = ex.items.filter((it) => !BARE_LABEL.test(String(it.answer).trim()));
    if (!answerable.length) continue;
    out.push({
      id: ex.id,
      act: ex.act,
      scene: ex.scene,
      n: ex.n,
      type: ex.type,
      // The act places the quiz in a volume, which is what lets its results count toward
      // the volume bars the same way a word's act does.
      volume: volumeOfAct(ex.act) || null,
      title: ex.title,
      items: answerable.map((it) => ({ id: `${ex.id}:${it.n}`, n: it.n, prompt: it.prompt, answer: it.answer })),
    });
  }
}
out.sort((a, b) => a.act - b.act || a.scene - b.scene || a.n - b.n);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const items = out.reduce((n, q) => n + q.items.length, 0);
const byVol = (v) => out.filter((q) => q.volume === v).length;
console.log(`${out.length} exercises, ${items} items -> data/private/quizzes.json (${kb(fs.statSync(OUT).size)})`);
console.log(`  Volume 1: ${byVol(1)}   Volume 2: ${byVol(2)}   unplaced: ${out.filter((q) => !q.volume).length}`);
console.log("gitignored; the build mirrors it into cf/public/ for Cloudflare to serve.");
