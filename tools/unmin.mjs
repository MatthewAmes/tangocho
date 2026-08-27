/* Build the bundle WITHOUT minification, for proving a refactor changed nothing.

   The deployed bundle is minified, so comparing two minified builds is useless: moving a
   declaration into a module shifts esbuild's name-mangling and the bytes differ even
   though the program is identical. Build both sides unminified instead and compare the
   SORTED set of lines — module boundaries move code around in the output, so a plain diff
   reports thousands of relocated lines, while the sorted multiset is unchanged if and only
   if the code is.

     node tools/unmin.mjs ../JpnFlashcards.jsx > after.js
     git show HEAD:JpnFlashcards.jsx > ../_ref.jsx && node tools/unmin.mjs ../_ref.jsx > before.js
     for f in before after; do grep -v '^\s*// \.\./' $f.js | sed 's/^[[:space:]]*//' \
       | grep -v '^$' | sort > $f.sorted; done
     diff before.sorted after.sorted | wc -l     # 0 == provably no behaviour change
*/
import { build } from "esbuild";
import path from "node:path";

const [, , entry] = process.argv;
if (!entry) { console.error("usage: node tools/unmin.mjs <entry.jsx>"); process.exit(1); }
const r = await build({
  entryPoints: [entry], bundle: true, minify: false, format: "iife", jsx: "automatic",
  loader: { ".jsx": "jsx" }, nodePaths: [path.resolve("node_modules")],
  write: false, logLevel: "error",
});
process.stdout.write(r.outputFiles[0].text);
