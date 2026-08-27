// What does each component in JpnFlashcards.jsx reach for outside itself?
//
// Moving a component to its own file is only mechanical once you know which module-scope
// names it uses; those become its imports, and anything still holding mutable state has to
// be dealt with before the move rather than discovered after it.
//
//   node tools/coupling.mjs            list every component with its outside references
//   node tools/coupling.mjs Kana       just one
import fs from "node:fs";

const src = fs.readFileSync("JpnFlashcards.jsx", "utf8");
const lines = src.split("\n");

// module-scope declarations
const declared = new Map();
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
  if (m) declared.set(m[1], i + 1);
}
const imported = new Set();
for (const m of src.matchAll(/^import\s+([\s\S]*?)from\s+"[^"]*";/gm))
  for (const n of (m[1].match(/[A-Za-z_$][\w$]*/g) || [])) imported.add(n);

// component extents: `function Name(` at column 0 with a capitalised name
const comps = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^function ([A-Z][\w$]*)\s*\(/);
  if (m) comps.push({ name: m[1], start: i });
}
for (let i = 0; i < comps.length; i++) {
  let end = lines.length;
  for (let j = comps[i].start + 1; j < lines.length; j++) if (lines[j] === "}") { end = j; break; }
  comps[i].end = end;
  comps[i].len = end - comps[i].start + 1;
}

const only = process.argv[2];
const MUTABLE = new Set();
for (const m of src.matchAll(/^let\s+([A-Za-z_$][\w$]*)/gm)) MUTABLE.add(m[1]);

for (const c of comps) {
  if (only && c.name !== only) continue;
  const body = lines.slice(c.start, c.end + 1).join("\n");
  const local = new Set([c.name]);
  for (const m of body.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
  const refs = new Set();
  for (const m of body.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)/g)) {
    const n = m[2];
    if (local.has(n)) continue;
    if (declared.has(n) || imported.has(n)) refs.add(n);
  }
  const mut = [...refs].filter((n) => MUTABLE.has(n));
  const other = [...refs].filter((n) => !MUTABLE.has(n) && !imported.has(n));
  const imp = [...refs].filter((n) => imported.has(n));
  console.log(
    c.name.padEnd(16) + String(c.len).padStart(5) + " lines   " +
    "module-scope:" + String(other.length).padStart(3) +
    "  already-imported:" + String(imp.length).padStart(3) +
    (mut.length ? "   MUTABLE: " + mut.join(", ") : ""));
  if (only) {
    console.log("\n  reaches for (module scope):\n    " + other.sort().join(", "));
    console.log("\n  already imported from modules:\n    " + imp.sort().join(", "));
  }
}
