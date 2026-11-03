// Draw Kotoba Quest's creatures with Gemini's image model.
//
//   node tools/make-sprites.mjs --list          which image models this key can use
//   node tools/make-sprites.mjs                 every creature that has no sprite yet
//   node tools/make-sprites.mjs samuneko atsuinu --force   redo just these
//   node tools/make-sprites.mjs --model <name>  use a particular model
//
// The key is read from GEMINI_API_KEY, or from .env.local (git-ignored) — never pass it on
// the command line, where it lands in shell history.
//
// Each creature is asked for on a flat magenta background; tools/png.mjs takes the
// background off, crops, and scales to 128×128. Raw answers are kept in art/sprites-raw/
// (git-ignored) so a reprocess does not cost another request; finished sprites go to
// art/sprites/ for review and into src/data/quest-sprites.js, which the game imports.
//
// The designs must stay ORIGINAL — every prompt says so, and names no franchise style.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPECIES } from "../src/data/quest-world.js";
import { decodePng, encodePng, isPng, removeBackground, fitSquare } from "./png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "art", "sprites-raw");
const OUT = path.join(ROOT, "art", "sprites");
const MODULE = path.join(ROOT, "src", "data", "quest-sprites.js");
const API = "https://generativelanguage.googleapis.com/v1beta";
const SIZE = 128;

/* The art direction, written once so all nineteen come out as one family. */
const STYLE = [
  "A single original creature for a cozy adventure game about learning Japanese.",
  "Style: polished 2D game sprite, chunky rounded shapes, thick clean dark outline, flat cel shading with one soft highlight,",
  "warm saturated colours, big friendly eyes, cute and slightly funny.",
  "Full body, centred, three-quarter view facing right, filling most of the frame.",
  "Background: one solid flat pure magenta colour (#FF00FF) edge to edge — no gradient, no floor, no shadow, no scenery.",
  "No text, no letters, no numbers, no border, no watermark.",
  "It must be an entirely original design that does not resemble any character from an existing game, anime or brand.",
].join(" ");

const LOOK = {
  kotodama:    "A floating spirit made of glowing violet ink: a round wisp body like a drop of calligraphy ink, a little brush-stroke tail, tiny sparkles orbiting it, wise kind eyes.",
  samuneko:    "A small round white cat that is always cold: wrapped in a knitted blue scarf, frosty ice-crystal ear tips, a snowflake mark on its forehead, shivering happily.",
  atsuinu:     "A chubby orange puppy that is always too hot: tongue out, a little flame-shaped tuft on its head, sweat drop, holding a paper fan.",
  haredori:    "A plump little yellow songbird with a sun-ray crest of feathers, cheerful, wings spread like it's announcing good weather.",
  mezamashi:   "A proud rooster whose round body is an old twin-bell alarm clock: clock face on its chest, bells on top of its head, loud open beak.",
  nebokuro:    "A sleepy grey-blue owl in a droopy striped nightcap, half-closed eyes, a little drool bubble, hugging a pillow.",
  keekin:      "A tiny hamster made of strawberry shortcake: cream frosting fur, a strawberry on its head, one birthday candle, golden sparkle cheeks.",
  sentakuma:   "A friendly brown bear covered in soap foam and bubbles, a laundry basket on its back, a clothes peg clipped to one ear.",
  gomitanu:    "A mischievous raccoon dog (tanuki) wearing a small trash-can lid like a hat, holding a neatly sorted recycling bag, leaf on its head.",
  houkitsune:  "A tidy red fox whose bushy tail is shaped like a straw broom, wearing a little headscarf, sweeping proudly.",
  tempuragon:  "A small round dragon made of golden crispy tempura batter, a shrimp-tail crest, little steam puffs from its nose, chopsticks stuck in its back like spines.",
  yakyusagi:   "A sporty white rabbit in a baseball cap, a baseball pattern on its round tummy, holding a tiny bat, ears sticking through the cap.",
  kabukiji:    "A pheasant with dramatic kabuki stage make-up: bold red-and-white face lines, a flowing lion-mane wig, striking a theatrical pose.",
  suutsuru:    "An elegant white crane wearing a sharp navy business suit and red necktie, holding a tiny briefcase, very serious.",
  kaishachi:   "A cute black-and-white orca standing upright with an office ID badge on a lanyard, a white collar and tie marking, holding a coffee mug.",
  yubiwani:    "A small green crocodile wearing a giant sparkling diamond ring on its tail, showing it off, sunglasses pushed up on its head.",
  nattounagi:  "A long smiling eel made of sticky fermented soybeans, little stringy threads trailing from it, a small wooden bowl on its head.",
  purezentori: "A round little chick that is a wrapped gift box: ribbon bow on its head, wrapping-paper pattern on its body, holding a gift tag.",
  isukappa:    "A kappa (Japanese river creature) with a little wooden chair on its back instead of a shell, a water dish on its head, sitting politely.",
};

function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^GEMINI_API_KEY=(\S+)/m);
    if (m) return m[1];
  } catch (e) {}
  throw new Error("No GEMINI_API_KEY in the environment or in .env.local");
}

async function call(url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "x-goog-api-key": key(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function imageModels() {
  const all = [];
  let token = "";
  do {
    const r = await call(`${API}/models?pageSize=1000${token ? "&pageToken=" + token : ""}`);
    all.push(...(r.models || []));
    token = r.nextPageToken || "";
  } while (token);
  return all
    .filter((m) => /image|imagen/i.test(m.name))
    .map((m) => ({ name: m.name.replace(/^models\//, ""), methods: m.supportedGenerationMethods || [] }));
}

/* Gemini image models answer generateContent with inline image parts; Imagen answers
   predict. Whichever the chosen model speaks, the result is image bytes. */
async function draw(model, prompt) {
  if (/imagen/i.test(model)) {
    const r = await call(`${API}/models/${model}:predict`, {
      instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1", outputOptions: { mimeType: "image/png" } },
    });
    const b = r.predictions && r.predictions[0] && r.predictions[0].bytesBase64Encoded;
    if (!b) throw new Error("no image in the answer: " + JSON.stringify(r).slice(0, 300));
    return Buffer.from(b, "base64");
  }
  const r = await call(`${API}/models/${model}:generateContent`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });
  const parts = (r.candidates && r.candidates[0] && r.candidates[0].content && r.candidates[0].content.parts) || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error("no image in the answer: " + JSON.stringify(parts.map((p) => p.text || "?")).slice(0, 300));
  return Buffer.from((img.inlineData || img.inline_data).data, "base64");
}

function finish(id, raw) {
  if (!isPng(raw)) throw new Error(`${id}: the model sent a non-PNG image; ask for PNG or add a decoder`);
  const sprite = fitSquare(removeBackground(decodePng(raw)), SIZE);
  const png = encodePng(sprite);
  fs.writeFileSync(path.join(OUT, id + ".png"), png);
  return png;
}

function writeModule() {
  const entries = Object.keys(SPECIES)
    .filter((id) => fs.existsSync(path.join(OUT, id + ".png")))
    .map((id) => `  ${id}: "data:image/png;base64,${fs.readFileSync(path.join(OUT, id + ".png")).toString("base64")}",`);
  fs.writeFileSync(MODULE, `/* Generated by tools/make-sprites.mjs from art/sprites/*.png — do not edit by hand.
   Kotoba Quest's creature sprites, ${SIZE}×${SIZE}, drawn with Gemini's image model from
   original prompts. A creature missing here falls back to its emoji. */
export const SPRITES = {
${entries.join("\n")}
};
`);
  return entries.length;
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  if (args.includes("--list")) {
    for (const m of await imageModels()) console.log(m.name.padEnd(48), m.methods.join(", "));
    return;
  }
  if (args.includes("--reprocess")) {
    for (const id of Object.keys(SPECIES)) {
      const f = path.join(RAW, id + ".png");
      if (fs.existsSync(f)) { finish(id, fs.readFileSync(f)); console.log("reprocessed", id); }
    }
    console.log(writeModule(), "sprites in", path.relative(ROOT, MODULE));
    return;
  }
  const mi = args.indexOf("--model");
  let model = mi >= 0 ? args[mi + 1] : null;
  if (!model) {
    const ms = await imageModels();
    const pick = ms.find((m) => /gemini/i.test(m.name) && m.methods.includes("generateContent") && !/preview/i.test(m.name))
      || ms.find((m) => /gemini/i.test(m.name) && m.methods.includes("generateContent"))
      || ms.find((m) => m.methods.includes("predict"));
    if (!pick) throw new Error("this key has no image model available — run with --list");
    model = pick.name;
  }
  const force = args.includes("--force");
  const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--model");
  const ids = (only.length ? only : Object.keys(SPECIES)).filter((id) => SPECIES[id]);
  console.log("model:", model);
  let made = 0, failed = 0;
  for (const id of ids) {
    const rawFile = path.join(RAW, id + ".png");
    if (!force && fs.existsSync(path.join(OUT, id + ".png"))) { console.log("  have   ", id); continue; }
    try {
      const raw = await draw(model, `${STYLE} The creature: ${LOOK[id]}`);
      fs.writeFileSync(rawFile, raw);
      finish(id, raw);
      made++;
      console.log("  drew   ", id);
    } catch (e) {
      failed++;
      console.log("  FAILED ", id, "—", e.message);
      if (/^(401|403|429)/.test(e.message)) break;   // the key or the quota, not this creature
    }
  }
  console.log(`${made} drawn, ${failed} failed; ${writeModule()} sprites in ${path.relative(ROOT, MODULE)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
