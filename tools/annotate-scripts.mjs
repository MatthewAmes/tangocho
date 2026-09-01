/* Fill in what the website does not publish.
     node tools/annotate-scripts.mjs data/private/scripts-web.json

   The site gives structure and Japanese: who speaks, in what order, exactly what they say.
   It gives no furigana, no romaji and no translation, and the Vol 1 scenes already in
   SCRIPT_SEED have all three — so a scene scraped from the site renders visibly poorer than
   one beside it. This closes that gap through the annotate task the Worker already has.

   ## Alignment is the whole problem

   The model is asked to annotate a scene and returns its own list of lines, which is not
   guaranteed to be the list it was given: it can merge two turns, split one, or quietly drop
   a line with no words in it. Trusting the order would attach one character's translation to
   another's line — worse than no translation, and invisible, because both halves look fine
   on their own.

   So position is a hint and never evidence. A returned line is accepted only when its tokens
   concatenate to exactly the Japanese we already hold; anything else is matched by content
   or dropped. A line that cannot be matched keeps its text and loses only the annotation.

   Results are cached per scene under tools/.annot-cache, so a re-run costs nothing and an
   interrupted run resumes. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools", ".annot-cache");
const API = process.env.TANGOCHO_API || "https://tangocho.deskbuddies.workers.dev/api/ai";

/** Comparison key for "is this the same Japanese line" — spacing and NFC differences are not
    differences. Never used for display, only for deciding whether a match is real. */
export const key = (s) => String(s || "").normalize("NFC").replace(/[\s　]/g, "");

export const textOf = (line) => (line.tokens || []).map((t) => t.t).join("");

/** Merge one annotated scene into the scraped one, keeping the scrape authoritative. */
export function mergeScene(scene, annotated) {
  const got = (annotated && annotated.lines) || [];
  const byText = new Map();
  for (const a of got) {
    const k = key(textOf(a));
    if (k && !byText.has(k)) byText.set(k, a);
  }
  let matched = 0;
  const lines = scene.lines.map((l, i) => {
    const mine = key(textOf(l));
    // Position first, content second — same test either way, so a reordered reply is fine.
    const at = got[i];
    const a = at && key(textOf(at)) === mine ? at : byText.get(mine);
    if (!a) return l;
    matched++;
    return {
      ...l,
      // The speaker is the site's, not the model's: the page prints the real name and the
      // model has been known to answer "A" and "B" when a label looks unfamiliar.
      tokens: key(textOf(a)) === mine ? a.tokens : l.tokens,
      romaji: a.romaji || "",
      en: a.en || "",
    };
  });
  return { scene: { ...scene, lines }, matched };
}

async function annotate(scene) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${scene.name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));

  const raw = scene.lines.map((l) => `${l.speaker}：${textOf(l)}`).join("\n");
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: "annotate", input: { raw } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const result = body.result || body;
  fs.writeFileSync(file, JSON.stringify(result));
  return result;
}

if (process.argv[1] && process.argv[1].endsWith("annotate-scripts.mjs")) {
  const src = process.argv[2] || path.join(ROOT, "data", "private", "scripts-web.json");
  const scenes = JSON.parse(fs.readFileSync(src, "utf8"));
  const out = [];
  let totalLines = 0, totalMatched = 0, failed = [];

  for (const scene of scenes) {
    totalLines += scene.lines.length;
    let annotated = null;
    for (let attempt = 0; attempt < 2 && !annotated; attempt++) {
      try { annotated = await annotate(scene); }
      catch (e) { if (attempt) { failed.push(`${scene.name} (${e.message})`); } }
    }
    const { scene: merged, matched } = mergeScene(scene, annotated);
    totalMatched += matched;
    out.push(merged);
    const flag = matched === scene.lines.length ? "" : `   <- ${matched}/${scene.lines.length}`;
    process.stderr.write(`  ${scene.name.padEnd(6)} ${String(matched).padStart(3)} annotated${flag}\n`);
  }

  const pct = totalLines ? Math.round((totalMatched / totalLines) * 100) : 0;
  process.stderr.write(`\n${totalMatched}/${totalLines} lines annotated (${pct}%)\n`);
  if (failed.length) process.stderr.write(`unreachable: ${failed.join(", ")}\n`);
  process.stdout.write(JSON.stringify(out));
}
