/* Which CSS classes are defined but never used, and which are used but never defined.
     node tools/check-css.mjs           report
     node tools/check-css.mjs --strict  exit 1 if anything is used-but-undefined

   Dead rules are not merely untidy here. This stylesheet has outlived several features, and
   a leftover rule keeps matching if a class name is ever reused — which is how the Input tab
   grew a stray box from an Oral-era .tc-input rule that nobody remembered writing. Knowing
   which names are live is what makes deleting the rest safe.

   Class names are collected from the JSX the way they are actually written: className="x y",
   template literals, and the "base" + (cond ? " mod" : "") idiom this file uses everywhere.
   Anything built from a variable cannot be seen statically, so DYNAMIC lists names that are
   assembled at runtime and therefore cannot be judged either way. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "src", "styles.js"), "utf8");
const JSX = fs.readFileSync(path.join(ROOT, "JpnFlashcards.jsx"), "utf8");

/** Every .tc-foo that a rule defines. */
const defined = new Set();
for (const m of CSS.matchAll(/\.(tc-[a-z0-9-]+)/gi)) defined.add(m[1]);

/* Every tc-foo mentioned anywhere in the JSX. Deliberately generous: a name inside a
   template literal or a conditional still counts as used, because it is. The cost of being
   generous is only that a genuinely dead rule may survive; the cost of being strict is
   deleting a rule that something needs, which is far worse. */
const used = new Set();
for (const m of JSX.matchAll(/\btc-[a-z0-9-]+/gi)) used.add(m[0]);

/* Names glued together at runtime — "tc-" + kind — cannot be resolved statically. */
const dynamic = [...JSX.matchAll(/["'`]tc-[a-z0-9-]*["'`]\s*\+|\+\s*["'`]-?[a-z0-9-]+["'`]/gi)].length;

/* Classes that exist to be READ, not to style: hooks for a selector elsewhere, or a marker
   on one half of a pair whose sibling carries the actual rule. Listed explicitly so that a
   genuinely missing rule still fails, which is the whole point of --strict. */
const MARKERS = new Set([
  "tc-front",      // pairs with .tc-back, which carries the 3D rotation
  "tc-kana",       // tab wrapper; children lay themselves out
  "tc-study",      // ditto
  "tc-planfoot",   // modifier on .tc-plansec, spacing hook only
]);

const unused = [...defined].filter((c) => !used.has(c)).sort();
/* "tc-term-" is not a class, it is the left half of "tc-term-" + card.term.length, and the
   real classes tc-term-1…5 are all defined. A used name that is a strict PREFIX of defined
   ones is a runtime-assembled family, not a missing rule. */
const undef = [...used]
  .filter((c) => !defined.has(c))
  .filter((c) => !MARKERS.has(c))
  .filter((c) => !(c.endsWith("-") && [...defined].some((d) => d.startsWith(c))))
  .sort();

console.log(`  ${defined.size} classes defined, ${used.size} referenced in the app`);

if (undef.length) {
  console.log(`\n  USED BUT NOT DEFINED (${undef.length}) — these style nothing:`);
  for (const c of undef) console.log("    ." + c);
} else {
  console.log("  every class the app uses has a rule");
}

if (unused.length) {
  console.log(`\n  DEFINED BUT NOT USED (${unused.length}) — dead unless built dynamically:`);
  for (const c of unused) console.log("    ." + c);
}

if (dynamic) {
  console.log(`\n  (${dynamic} class names are assembled at runtime; those cannot be judged here.)`);
}

/* Only the used-but-undefined direction is ever an error. An unused rule is dead weight; a
   used-but-undefined class is a style someone expected to exist and does not, which is a
   visible bug rather than a tidiness one. */
if (process.argv.includes("--strict") && undef.length) process.exitCode = 1;
