// Draw the pixel-art nigiri mascot and encode one animated GIF per mood.
//
//   node tools/make-mascot.mjs
//
// Writes data/mascot.js — base64 data URIs the app imports directly, so the sprites are
// part of the bundle and cost no extra request.
//
// The sprite is rasterised from shapes rather than hand-placed pixel by pixel: it keeps
// the proportions consistent across moods, and means a change to the face doesn't require
// redrawing the body. Everything snaps to the pixel grid, so it still reads as pixel art.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeGif } from "./gifenc.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 32, H = 30;

// index 0 must be transparent — the encoder marks it so
const PAL = [
  [0, 0, 0],        // 0 transparent
  [253, 251, 245],  // 1 rice
  [226, 219, 203],  // 2 rice shadow
  [244, 128, 92],   // 3 salmon
  [255, 208, 189],  // 4 salmon stripe
  [214, 96, 64],    // 5 salmon shadow
  [51, 65, 58],     // 6 nori
  [70, 86, 77],     // 7 nori highlight
  [58, 44, 34],     // 8 ink (eyes, mouth)
  [244, 144, 155],  // 9 blush
  [127, 199, 234],  // 10 sweat
  [255, 215, 110],  // 11 sparkle
  [159, 176, 198],  // 12 zzz
];

const blank = () => new Array(W * H).fill(0);
const put = (g, x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c; };
const rect = (g, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(g, x, y, c); };

// The rice: a rounded slab. The corner cut is what makes it read as a rice bed rather
// than a box, and it has to be symmetrical or the whole sprite looks broken.
function rice(g, dy) {
  for (let y = 0; y < 12; y++) {
    const inset = y < 1 ? 3 : y < 2 ? 2 : y > 10 ? 3 : y > 9 ? 2 : 1;
    for (let x = inset; x < W - inset; x++) put(g, x, 16 + y + dy, y > 9 ? 2 : 1);
  }
}
// The salmon: a dome sitting over the rice, with two lighter marbling stripes.
function salmon(g, dy) {
  for (let y = 0; y < 9; y++) {
    const inset = 2 + Math.round(Math.pow((8 - y) / 8, 1.7) * 5);
    for (let x = inset; x < W - inset; x++) put(g, x, 7 + y + dy, y >= 7 ? 5 : 3);
  }
  for (let x = 8; x < 24; x++) { put(g, x, 10 + dy, 4); if (x > 6 && x < 26) put(g, x, 13 + dy, 4); }
}
// The nori sits as a belt across the BOTTOM of the rice, not a vertical band down the
// middle. The first attempt ran it down the centre, which is precisely where the mouth
// belongs — the mouth ended up drawn in white on top of black and read as noise.
function nori(g, dy) {
  rect(g, 2, 24 + dy, W - 4, 4, 6);
  rect(g, 2, 24 + dy, W - 4, 1, 7);
  put(g, 1, 25 + dy, 6); put(g, 1, 26 + dy, 6);
  put(g, W - 2, 25 + dy, 6); put(g, W - 2, 26 + dy, 6);
}

function face(g, mood, dy) {
  const L = 9, R = 22, EY = 19 + dy;
  const ink = 8;
  if (mood === "sleeping") {
    for (const cx of [L, R]) { put(g, cx - 1, EY, ink); put(g, cx, EY + 1, ink); put(g, cx + 1, EY, ink); }
  } else if (mood === "happy" || mood === "proud") {
    for (const cx of [L, R]) { put(g, cx - 1, EY + 1, ink); put(g, cx, EY, ink); put(g, cx + 1, EY + 1, ink); }
  } else if (mood === "worried") {
    for (const cx of [L, R]) {
      put(g, cx - 1, EY - 1, ink); put(g, cx, EY, ink); put(g, cx + 1, EY + 1, ink);
      put(g, cx + 1, EY - 1, ink); put(g, cx - 1, EY + 1, ink);
    }
  } else {
    for (const cx of [L, R]) { rect(g, cx - 1, EY, 2, 2, ink); }
  }
  if (mood === "happy" || mood === "proud") {
    rect(g, L - 4, EY + 2, 3, 2, 9);
    rect(g, R + 2, EY + 2, 3, 2, 9);
  }
  // mouth on clear rice, below the eyes and above the nori belt
  const MY = EY + 3;
  if (mood === "proud") { rect(g, 14, MY, 4, 3, ink); rect(g, 15, MY + 1, 2, 1, 9); }
  else if (mood === "happy") { put(g, 14, MY, ink); put(g, 17, MY, ink); put(g, 15, MY + 1, ink); put(g, 16, MY + 1, ink); }
  else if (mood === "worried") { put(g, 14, MY + 1, ink); put(g, 15, MY, ink); put(g, 16, MY + 1, ink); put(g, 17, MY, ink); }
  else { put(g, 15, MY, ink); put(g, 16, MY, ink); }
}

function frame(mood, i, n) {
  const g = blank();
  // per-mood idle motion, expressed as a whole-sprite vertical offset
  let dy = 0;
  if (mood === "happy") dy = i === 1 ? -1 : 0;
  if (mood === "proud") dy = [0, -3, -1, 0][i] ?? 0;
  if (mood === "sleeping") dy = i === 1 ? 1 : 0;
  if (mood === "worried") dy = 0;

  salmon(g, dy); rice(g, dy); nori(g, dy); face(g, mood, dy);

  if (mood === "worried") {                       // shift the whole body side to side
    const sx = i === 0 ? -1 : i === 2 ? 1 : 0;
    if (sx) {
      const src = g.slice();
      g.fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(g, x + sx, y, src[y * W + x]);
    }
    const drop = 6 + i;                            // sweat bead sliding down
    rect(g, 27, drop, 2, 3, 10);
  }
  if (mood === "sleeping") {
    const up = i;                                  // zzz drifting upward and fading out
    put(g, 26, 6 - up, 12); put(g, 27, 6 - up, 12); put(g, 26, 7 - up, 12); put(g, 28, 5 - up, 12);
  }
  if (mood === "proud" && (i === 1 || i === 2)) {  // sparkles on the up-beat only
    for (const [sx, sy] of [[3, 5], [27, 3]]) {
      put(g, sx, sy - 1, 11); put(g, sx, sy + 1, 11);
      put(g, sx - 1, sy, 11); put(g, sx + 1, sy, 11); put(g, sx, sy, 11);
    }
  }
  return g;
}

const MOODS = {
  sleeping: { frames: 2, delay: 700 },
  waiting:  { frames: 1, delay: 500 },
  happy:    { frames: 2, delay: 420 },
  proud:    { frames: 4, delay: 170 },
  worried:  { frames: 3, delay: 300 },
};

const out = {};
let total = 0;
for (const [mood, cfg] of Object.entries(MOODS)) {
  const frames = Array.from({ length: cfg.frames }, (_, i) => frame(mood, i, cfg.frames));
  const gif = encodeGif(W, H, PAL, frames, cfg.delay);
  total += gif.length;
  out[mood] = "data:image/gif;base64," + gif.toString("base64");
  console.log(`  ${mood.padEnd(9)} ${cfg.frames} frames  ${String(gif.length).padStart(5)} bytes`);
}

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/mascot.js"),
  "// GENERATED by tools/make-mascot.mjs — do not edit by hand.\n"
  + "// Pixel-art nigiri, one animated GIF per mood, inlined as data URIs.\n"
  + "export const MASCOT_GIFS = " + JSON.stringify(out, null, 1) + ";\n");
console.log(`\ntotal ${(total / 1024).toFixed(1)} KB across ${Object.keys(MOODS).length} moods -> data/mascot.js`);
