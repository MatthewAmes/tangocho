/* One-shot refactor helper: move top-level data constants out of JpnFlashcards.jsx into
   modules under src/data/. Kept in the repo because it is the only honest record of how
   the split was made, and because a line-range edit of a 260 KB literal is not something
   anyone should redo by hand.

   The block extent is found by scanning brackets with string awareness — the vocabulary
   literals are full of quotes containing parentheses ("to be grateful; (use に …)"), and a
   scanner that does not know it is inside a string will close the array in the wrong place.
   An earlier line-shape heuristic ("stop at a column-0 `];`") silently swallowed three
   whole components when one array happened to close on an indented line.

   usage: node tools/extract-data.mjs <outFile> <importPath> <header> <NAME...>            */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "JpnFlashcards.jsx");
const [, , outFile, importPath, header, ...names] = process.argv;

let text = fs.readFileSync(SRC, "utf8");

/** End index of the statement starting at `from`, scanning with string/comment awareness. */
function endOfStatement(text, from) {
  let depth = 0, i = from, opened = false;
  while (i < text.length) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") { i = text.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && text[i + 1] === "*") { i = text.indexOf("*/", i) + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") { depth++; opened = true; }
    else if (c === ")" || c === "]" || c === "}") { depth--; }
    else if (c === ";" && depth === 0) return i + 1;
    if (opened && depth === 0) {
      // closed the literal; the statement may continue (".map(...)") until the ;
      const semi = text.indexOf(";", i);
      const nl = text.indexOf("\n", i);
      if (semi >= 0 && (nl < 0 || semi < nl)) return semi + 1;
      if (text.slice(i + 1, nl < 0 ? undefined : nl).trim() === "") return i + 1;
    }
    i++;
  }
  throw new Error("unterminated statement at " + from);
}

const blocks = [];
for (const name of names) {
  const decl = "\nconst " + name + " =";
  const at = text.indexOf(decl);
  if (at === -1) throw new Error("not found: " + name);
  const start = at + 1;
  const end = endOfStatement(text, start);
  // carry the rationale comment directly above the declaration
  let s = start;
  const before = text.slice(0, start).split("\n");
  let take = 0;
  for (let i = before.length - 2; i >= 0 && /^\s*(\/\/|\*|\/\*)/.test(before[i]) && before[i].trim() !== ""; i--) take++;
  if (take) s = start - (before.slice(before.length - 1 - take, before.length - 1).join("\n").length + 1);
  blocks.push({ name, s, e: end });
}
blocks.sort((a, b) => a.s - b.s);
for (let i = 1; i < blocks.length; i++) if (blocks[i].s < blocks[i - 1].e) throw new Error("overlapping blocks: " + blocks[i - 1].name + " / " + blocks[i].name);

const body = blocks
  .map((b) => text.slice(b.s, b.e).replace("const " + b.name + " =", "export const " + b.name + " ="))
  .join("\n\n");
fs.writeFileSync(path.join(ROOT, outFile), (header ? "/* " + header + " */\n\n" : "") + body + "\n");

for (let i = blocks.length - 1; i >= 0; i--) text = text.slice(0, blocks[i].s) + text.slice(blocks[i].e);
const imp = "import { " + names.join(", ") + ' } from "' + importPath + '";';
const lines = text.split("\n");
let last = -1;
for (let i = 0; i < Math.min(lines.length, 400); i++) { const t = lines[i].trimEnd(); if ((t.startsWith("import ") || t.startsWith("} from ")) && t.endsWith('";')) last = i; }
lines.splice(last + 1, 0, imp);
fs.writeFileSync(SRC, lines.join("\n"));
console.log(outFile + "  <-  " + names.join(", ") + "  (" + (Buffer.byteLength(body, "utf8") / 1024).toFixed(1) + " KB)");
