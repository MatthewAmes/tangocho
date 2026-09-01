/* Accessibility invariants that are cheap to check and easy to lose.
     node tools/check-a11y.mjs

   Two rules, both of which the app had broken everywhere before TODO-205:

   1. Every form control has an accessible name. A placeholder is not one — it disappears
      the moment you type, and assistive tech does not treat it as a label. The app had 22
      controls and not one accessible name.
   2. The document language is the UI's language. index.html shipped lang="ja" for an
      interface that is almost entirely English, which makes a screen reader read "Reveal
      answer" in a Japanese voice. The Japanese is marked per element instead.

   A control counts as named if it carries aria-label / aria-labelledby / title, or if it is
   wrapped in a <label> — the pattern the Plan fields and the mining checkboxes already use.
   The wrapper test is a look-back over the preceding few lines rather than a parse, which is
   approximate in principle and exact for how this file is written. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "JpnFlashcards.jsx");
const HTML = path.join(ROOT, "index.html");

const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);
const CONTROL = /<(input|textarea|select)\b/;
const NAMED = /aria-label=|aria-labelledby=|\btitle=/;
const LOOKBACK = 4;

const unnamed = [];
for (let i = 0; i < lines.length; i++) {
  if (!CONTROL.test(lines[i])) continue;
  // The tag can wrap across lines, so the attributes may be below the tag name.
  const tag = lines.slice(i, i + 6).join(" ").split(">")[0];
  if (NAMED.test(tag)) continue;
  // A <label> wrapper a line or two above is an accessible name too.
  const before = lines.slice(Math.max(0, i - LOOKBACK), i).join(" ");
  if (/<label\b/.test(before)) continue;
  unnamed.push(`${i + 1}: ${lines[i].trim().slice(0, 90)}`);
}

let bad = 0;

if (unnamed.length) {
  bad++;
  console.error(`  FAIL  ${unnamed.length} form control(s) with no accessible name:`);
  for (const u of unnamed) console.error("          " + u);
  console.error("        Add aria-label=\"…\", or wrap the control in a <label>.");
} else {
  console.log("  ok    every form control has an accessible name");
}

/* index.html is a build output and tools/build.mjs sets this attribute, so a failure here
   means the build did not run rather than that someone typed the wrong thing. */
const html = fs.readFileSync(HTML, "utf8").slice(0, 400);
const lang = /<html\b[^>]*\blang="([^"]*)"/i.exec(html);
if (!lang || lang[1] !== "en") {
  bad++;
  console.error(`  FAIL  <html lang> is ${lang ? `"${lang[1]}"` : "missing"}, expected "en" — rebuild.`);
} else {
  console.log("  ok    <html lang=\"en\"> — the UI's language, not the content's");
}

const jaMarks = (fs.readFileSync(SRC, "utf8").match(/lang="ja"/g) || []).length;
if (jaMarks < 10) {
  bad++;
  console.error(`  FAIL  only ${jaMarks} element(s) marked lang="ja" — Japanese content should be marked.`);
} else {
  console.log(`  ok    ${jaMarks} elements marked lang="ja"`);
}

if (bad) process.exitCode = 1;
