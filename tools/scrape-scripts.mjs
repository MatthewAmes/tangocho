/* Pull the scene scripts from the course website.
     node tools/scrape-scripts.mjs            all acts/scenes
     node tools/scrape-scripts.mjs 9 2        just one

   The PDF parser (tools/import-scripts.mjs) reads the books, and reads them badly for this
   purpose: the textbook sets each speaker's lines in a column, so turns come out grouped by
   speaker instead of interleaved. Scene 9-2 is eight alternating lines in the book and came
   out as two blocks. The site publishes the same script as eight labelled lines, which is
   the structure the app wants, so the site is the better source and this replaces it.

   Pages live at /audio-video-act-<act>-<scene>/ and the script is a run of paragraphs of
   the form "SPEAKER： line". Missing scenes 404 or simply carry no dialogue; both are
   normal and neither is an error.

   The page gives structure and Japanese. It does NOT give furigana, romaji or a translation
   — those the app fills in on demand through /api/ai, which is why the emitted lines carry
   the text and leave the rest empty rather than guessing. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://nihongonow.byu.edu";
const CACHE = path.join(ROOT, "tools", ".site-cache");

/* Full-width colon is the separator the site uses; ASCII appears occasionally. */
const SPLIT = /^([^：:]{1,12})[：:]\s*(.+)$/;

/** Text of every paragraph-ish element, tags and entities gone. */
export function paragraphs(html) {
  const body = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  return [...body.matchAll(/<(p|td|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#?\w+;/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
}

/* The site inserts spaces around certain kana — "あと ど の ぐ らい で すか。" — an artifact of
   how the page is typeset. A space between two Japanese characters is never lexical.

   NFC first, because some pages spell ブ as フ + a combining dakuten (U+3099) instead of the
   precomposed character. The two render identically and compare unequal, which showed up as
   Brian being two different speakers with 84 lines and 6. Normalising here fixes speaker
   names, and also the dialogue itself, where the same split would defeat any lookup by
   text — a vocabulary match, a cloze index, a dedupe against the seed. */
export function tidy(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/(?<=[぀-ヿ一-龯、。？！「」…])\s+(?=[぀-ヿ一-龯、。？！「」…])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* One name, one spelling. エィミー for エイミー is the site's own typo (small ィ), and left
   alone it splits a character across two names in the cast list and the speaker colouring. */
const NAME_FIXES = new Map([["エィミー", "エイミー"]]);

/* Practice drills are laid out exactly like dialogue — "ACT 5： 〜て forms (type in
   Romanization)" — and parse as a speaker named ACT 5 saying an English instruction. */
const NOT_A_SPEAKER = /^(ACT|BTS|Act)\s*\d|^(Vocabulary|Grammar|Note|Culture)\b/i;

/* Two passes, because not every turn contains Japanese. Scene 9-2's seventh line is
   "ブライアン：…" — a beat, no words, and the site prints it because the silence is the joke.
   Requiring Japanese per line drops it and the scene comes out one line short of the page.
   So: pass one learns who speaks in this scene from the lines that ARE Japanese, pass two
   accepts anything one of them says. A label still has to earn its way in on its own. */
export function linesFrom(html) {
  const rows = [];
  for (const p of paragraphs(html)) {
    const m = SPLIT.exec(p);
    if (!m) continue;
    const raw = tidy(m[1]);
    const speaker = NAME_FIXES.get(raw) || raw;
    const text = tidy(m[2]);
    if (NOT_A_SPEAKER.test(speaker) || !text || speaker.length > 8) continue;
    rows.push({ speaker, text, ja: /[ぁ-んァ-ン一-龯]/.test(text) });
  }
  const cast = new Set(rows.filter((r) => r.ja && /[ぁ-んァ-ンA-Za-z一-龯]/.test(r.speaker)).map((r) => r.speaker));
  return rows.filter((r) => cast.has(r.speaker)).map(({ speaker, text }) => ({ speaker, text }));
}

/** The scene's English title and setup line, when the page carries them. */
export function headerFrom(html, act, scene) {
  for (const p of paragraphs(html)) {
    const m = new RegExp(`^ACT\\s*${act}-${scene}\\s+(.+)$`, "i").exec(p);
    if (m) return tidy(m[1]);
  }
  return "";
}

async function page(act, scene) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `act-${act}-${scene}.html`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const res = await fetch(`${BASE}/audio-video-act-${act}-${scene}/`);
  if (!res.ok) return null;
  const html = await res.text();
  fs.writeFileSync(file, html);
  return html;
}

if (process.argv[1] && process.argv[1].endsWith("scrape-scripts.mjs")) {
  const [oneAct, oneScene] = process.argv.slice(2).map(Number);
  const scenes = [];
  const acts = Number.isFinite(oneAct) ? [oneAct] : Array.from({ length: 12 }, (_, i) => i + 1);
  const nums = Number.isFinite(oneScene) ? [oneScene] : Array.from({ length: 12 }, (_, i) => i + 1);

  for (const act of acts) {
    for (const scene of nums) {
      let html;
      try { html = await page(act, scene); } catch (e) { html = null; }
      if (!html) continue;
      const lines = linesFrom(html);
      if (lines.length < 2) continue;
      scenes.push({
        id: `web-${act}-${scene}`,
        name: `${act}-${scene}`,
        act, scene,
        title: headerFrom(html, act, scene),
        lines: lines.map((l) => ({ speaker: l.speaker, tokens: [{ t: l.text }], romaji: "", en: "" })),
      });
      process.stderr.write(`  ${act}-${scene}  ${lines.length} lines\n`);
    }
  }
  process.stderr.write(`\n${scenes.length} scenes, ${scenes.reduce((n, s) => n + s.lines.length, 0)} lines\n`);
  process.stdout.write(JSON.stringify(scenes));
}
