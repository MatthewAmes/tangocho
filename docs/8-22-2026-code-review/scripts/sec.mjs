import path from "node:path"; import { fileURLToPath } from "node:url";
import fs from "node:fs";
const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../JpnFlashcards.jsx"), "utf8");
const SEED=[]; for (const m of src.slice(0, src.indexOf("const uid =")).matchAll(/\{ term: "([^"]+)", reading: "([^"]+)", romaji: "([^"]*)", meaning: "((?:[^"\\]|\\.)*)", kind: "(\w+)"[^}]*?lesson: (\d+)(?:, sec: "([^"]+)")?/g)) SEED.push({ term: m[1], reading:m[2], meaning:m[4], lesson:+m[6], sec:m[7] });
const mapSrc = src.slice(src.indexOf("const SECTION_MAP = {"), src.indexOf("function sectionOf"));
const SECTION_MAP = eval("(" + mapSrc.slice(mapSrc.indexOf("{"), mapSrc.lastIndexOf("}")+1) + ")");
const sectionOf = (c) => c.sec || SECTION_MAP[c.term] || ((c.lesson || 0) <= 6 ? "Act 1" : "Class notes");
const cnt = {}; for (const c of SEED) { const s = sectionOf(c); cnt[s] = (cnt[s]||0)+1; }
const acts = {}; for (const [s,n] of Object.entries(cnt)) { const m=/^(\d)-/.exec(s); const k = m ? "Act "+m[1] : s; acts[k]=(acts[k]||0)+n; }
console.log(acts);
console.log("Act 1 bucket sample:", SEED.filter(c=>sectionOf(c)==="Act 1").slice(0,12).map(c=>c.term).join(" "));
console.log("Class notes sample:", SEED.filter(c=>sectionOf(c)==="Class notes").slice(0,12).map(c=>c.term).join(" "));
console.log("multiword/phrase cards (len>=6):", SEED.filter(c=>c.term.length>=6).length, " examples:", SEED.filter(c=>c.term.length>=6).slice(0,6).map(c=>c.term).join(" | "));
console.log("terms with 〜:", SEED.filter(c=>c.term.includes("〜")).length);
console.log("meanings containing a part-of-speech hint (noun/verb/adj):", SEED.filter(c=>/\b(noun|verb|adj|adjective|particle|counter)\b/i.test(c.meaning)).length);
