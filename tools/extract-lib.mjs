/* Move top-level declarations (const OR function) out of JpnFlashcards.jsx into a module.
   The sibling of extract-data.mjs, which only handles data constants. Same string-aware
   scanner, plus: a function declaration's first "(" is its parameter list, not the body,
   so the params are closed before brace-matching begins — miss that and every extracted
   function is truncated at its own signature.

   usage: node tools/extract-lib.mjs <outFile> <importPath> <header> <NAME...>            */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "JpnFlashcards.jsx");
const [, , outFile, importPath, header, ...names] = process.argv;
let text = fs.readFileSync(SRC, "utf8");

/** Advance past a string/template/comment starting at i; returns the next index, or -1. */
function skip(t, i) {
  const c = t[i];
  if (c === "/" && t[i + 1] === "/") { const n = t.indexOf("\n", i); return n < 0 ? t.length : n; }
  if (c === "/" && t[i + 1] === "*") { const n = t.indexOf("*/", i); return n < 0 ? t.length : n + 2; }
  if (c === '"' || c === "'" || c === "`") {
    let j = i + 1;
    while (j < t.length) { if (t[j] === "\\") { j += 2; continue; } if (t[j] === c) return j + 1; j++; }
    return t.length;
  }
  return -1;
}
/** Index just past the balanced group that opens at or after `from`. */
function closeGroup(t, from, open, close) {
  let i = t.indexOf(open, from), d = 0;
  for (; i < t.length; i++) {
    const s = skip(t, i); if (s >= 0) { i = s - 1; continue; }
    if (t[i] === open) d++;
    else if (t[i] === close) { d--; if (!d) return i + 1; }
  }
  throw new Error("unbalanced " + open);
}
function extentOf(name) {
  let at = text.indexOf("\nfunction " + name + "(");
  if (at < 0) at = text.indexOf("\nasync function " + name + "(");
  let isFn = at >= 0;
  if (!isFn) {
    // A module-level `let` moves too. The TTS singletons are mutable, but only from inside
    // the functions that move with them, so the group is what has to stay together — split
    // them and the audio element the player reuses becomes two different variables.
    for (const kw of ["const", "let"]) { at = text.indexOf("\n" + kw + " " + name + " ="); if (at >= 0) break; }
    if (at < 0) throw new Error("not found: " + name);
  }
  const start = at + 1;
  if (isFn) return [start, closeGroup(text, closeGroup(text, start, "(", ")"), "{", "}")];
  // a const/let: balance whatever it opens, then run to the terminating semicolon
  let i = start, d = 0, opened = false;
  for (; i < text.length; i++) {
    const s = skip(text, i); if (s >= 0) { i = s - 1; continue; }
    const c = text[i];
    if ("([{".includes(c)) { d++; opened = true; }
    else if (")]}".includes(c)) d--;
    else if (c === ";" && d === 0) return [start, i + 1];
    if (opened && d === 0) { const semi = text.indexOf(";", i); return [start, semi + 1]; }
  }
  throw new Error("unterminated: " + name);
}

const blocks = names.map((n) => { const [s, e] = extentOf(n); return { n, s, e }; });
for (const b of blocks) {                       // carry the rationale comment above it
  const head = text.slice(0, b.s).split("\n"); let take = 0;
  for (let i = head.length - 2; i >= 0 && /^\s*(\/\/|\*|\/\*)/.test(head[i]); i--) take++;
  if (take) b.s -= head.slice(head.length - 1 - take, head.length - 1).join("\n").length + 1;
}
blocks.sort((a, b) => a.s - b.s);
for (let i = 1; i < blocks.length; i++) if (blocks[i].s < blocks[i - 1].e) throw new Error("overlap: " + blocks[i - 1].n + " / " + blocks[i].n);

const body = blocks.map((b) => {
  const t = text.slice(b.s, b.e);
  return t.replace("async function " + b.n, "export async function " + b.n)
           .replace(/^function /m, "export function ").replace("const " + b.n + " =", "export const " + b.n + " =");
}).join("\n\n");
fs.writeFileSync(path.join(ROOT, outFile), (header ? "/* " + header + " */\n\n" : "") + body + "\n");

for (let i = blocks.length - 1; i >= 0; i--) text = text.slice(0, blocks[i].s) + text.slice(blocks[i].e);
const lines = text.split("\n");
let last = -1;
for (let i = 0; i < Math.min(lines.length, 400); i++) { const t = lines[i].trimEnd(); if ((t.startsWith("import ") || t.startsWith("} from ")) && t.endsWith('";')) last = i; }
lines.splice(last + 1, 0, "import { " + names.join(", ") + ' } from "' + importPath + '";');
fs.writeFileSync(SRC, lines.join("\n"));
console.log(outFile + "  <-  " + names.join(", ") + "  (" + (Buffer.byteLength(body, "utf8") / 1024).toFixed(1) + " KB)");
