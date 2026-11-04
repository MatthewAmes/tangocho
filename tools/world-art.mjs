/* ── Kotoba Quest's world, painted ──
   The six arenas a run passes through, and the hero. An arena is painted once, whole, from a
   tile text, so paths curve at corners and trees overlap into a real forest. The hero is
   16×20, placed by hand pixel by pixel from the rows below. */
import { Sprite, ramp, hexRgb, E, C, P, R } from "./pixel-art.mjs";

export const TILE = 16;
const rgb = (c) => (typeof c === "string" ? hexRgb(c) : c);
const hash = (x, y, k = 0) => {
  let h = (Math.imul(x + 11, 374761393) + Math.imul(y + 7, 668265263) + Math.imul(k + 3, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

class Canvas {
  constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8Array(width * height * 4); }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b] = rgb(c), i = (y * this.width + x) * 4;
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  solid(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height && this.data[(y * this.width + x) * 4 + 3] > 0; }
  blit(img, ox, oy) {
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3]) this.set(ox + x, oy + y, [img.data[i], img.data[i + 1], img.data[i + 2]]);
    }
    return this;
  }
  /* A dark line round everything painted so far. */
  outline(c) {
    const edge = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (!this.solid(x, y) && (this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y - 1) || this.solid(x, y + 1))) edge.push([x, y]);
    }
    for (const [x, y] of edge) this.set(x, y, c);
    return this;
  }
}

/* ── each region's look ── */
const THEMES = {
  campus: {
    ground: ["#86c25e", "#78b354", "#95cf6c"], floor: "#3f7d3f", tall: ["#3f9142", "#2d7236", "#67b84e"],
    path: ["#e6cf9a", "#d3ba84", "#b2966a"], water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#7f7446",
    trees: [["round", "#3f9f4c"], ["round", "#58b24f"]], trunk: "#6e4c2c", flowers: ["#ffffff", "#ffe066"],
  },
  town: {
    ground: ["#a3c264", "#95b358", "#b1ce72"], floor: "#55803f", tall: ["#558f3c", "#3f742f", "#86b84a"],
    path: ["#cfc4ae", "#b3a78f", "#8f8570"], cobble: true, water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#7f7446",
    trees: [["round", "#4f9a48"], ["pine", "#2f7d4f"]], trunk: "#6e4c2c", flowers: ["#ff8fa8", "#ffffff"],
  },
  river: {
    ground: ["#7cc68a", "#6db57c", "#8fd59a"], floor: "#2f7d5f", tall: ["#2f9a72", "#217a5a", "#58c08c"],
    path: ["#e6d5a6", "#d3bf8c", "#ad9a68"], water: ["#3fb8d0", "#2b98b4", "#b2f0f4"], bank: "#6f8050",
    trees: [["round", "#2f9f6a"], ["round", "#47b070"]], trunk: "#5e4a2e", flowers: ["#ffffff", "#9fd0ff"],
  },
  stadium: {
    ground: ["#b2c868", "#a2b85c", "#c0d676"], floor: "#5f8a48", tall: ["#6a9f3f", "#4f8033", "#9ccb4e"],
    path: ["#efd5a4", "#dcbc88", "#b8966a"], water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#7f7446",
    trees: [["round", "#f09ec0"], ["round", "#f6b8d0"]], trunk: "#6a4436", flowers: ["#ffffff", "#ff8fa8"],
  },
  office: {
    ground: ["#c3c9d2", "#b2b8c3", "#d0d6dd"], paved: true, floor: "#6f8a70", tall: ["#4f9a58", "#3a7c48", "#7cc070"],
    path: ["#7c8496", "#6a7284", "#565d6d"], asphalt: true, water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#6f7686",
    trees: [["round", "#3f8f58"], ["pine", "#2f7a5a"]], trunk: "#5a4a3e", flowers: [],
  },
  forest: {
    ground: ["#a7a558", "#97954c", "#b6b466"], floor: "#5f5a30", tall: ["#7f8a30", "#626c26", "#b0b040"],
    path: ["#c49a68", "#ad8456", "#8a6844"], water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#6a5a3a",
    trees: [["round", "#e0752f"], ["round", "#d5503a"], ["round", "#e8b03a"], ["pine", "#3f6f48"]], trunk: "#54382a", flowers: ["#ffd84a", "#ff8f5f"],
  },
};
export const THEME_IDS = Object.keys(THEMES);

function treeSprite(kind, color, trunk) {
  const s = new Sprite(20, 24), leaf = ramp(color, { spread: 0.09 }), wood = ramp(trunk);
  s.part(wood, {}, R(8, 16, 4, 7));
  if (kind === "pine") s.part(leaf, { round: 3 }, P([[10, 1], [15.5, 9], [4.5, 9]]), P([[10, 5], [17, 14], [3, 14]]), P([[10, 9], [18, 19], [2, 19]]));
  else s.part(leaf, { round: 7 }, C(10, 8, 7), C(5.5, 12, 4.5), C(14.5, 12, 4.5), E(10, 14, 7, 4.5));
  return s.render();
}

/* ── the map ── */
export function paintMap(region) {
  const th = THEMES[region.theme];
  if (!th) throw new Error("no theme for " + region.name);
  const rows = region.map, H = rows.length, W = rows[0].length;
  const c = new Canvas(W * TILE, H * TILE);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : rows[y][x]);
  const isPathCh = (ch) => ch === "=" || ch === "G" || ch === ">" || ch === "<";
  const pathy = (x, y) => { const ch = at(x, y); return ch === null ? isPathCh(at(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))) : isPathCh(ch); };
  const bridge = (x, y) => at(x, y) === "=" && (at(x - 1, y) === "~" || at(x + 1, y) === "~");
  const watery = (x, y) => at(x, y) === "~" || bridge(x, y);
  const tally = (x, y) => at(x, y) === ",";

  const tiles = (fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fn(x, y, rows[y][x]); };

  /* ground under everything */
  tiles((x, y, ch) => {
    const ox = x * TILE, oy = y * TILE, g = th.ground;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const wx = ox + i, wy = oy + j;
      if (ch === "#") { c.set(wx, wy, th.floor); continue; }
      if (th.paved) { c.set(wx, wy, i === 0 || j === 0 ? g[1] : hash(wx, wy) > 0.97 ? g[2] : g[0]); continue; }
      const v = hash(wx, wy);
      c.set(wx, wy, v < 0.05 ? g[1] : v > 0.96 ? g[2] : g[0]);
    }
    if (th.paved || ch === "#" || ch === "H") return;
    if (hash(x, y, 1) < 0.3) {   // a tuft
      const a = ox + 2 + Math.floor(hash(x, y, 2) * 10), b = oy + 3 + Math.floor(hash(x, y, 3) * 10);
      c.set(a, b, g[1]); c.set(a + 2, b, g[1]); c.set(a + 1, b + 1, g[1]);
    }
    if (ch === "." && th.flowers.length && hash(x, y, 4) < 0.16) {
      const a = ox + 3 + Math.floor(hash(x, y, 5) * 9), b = oy + 3 + Math.floor(hash(x, y, 6) * 9);
      const f = th.flowers[hash(x, y, 7) < 0.5 ? 0 : 1];
      c.set(a - 1, b, f); c.set(a + 1, b, f); c.set(a, b - 1, f); c.set(a, b + 1, f); c.set(a, b, "#f2a81a");
    }
  });

  /* tall grass: the part that matters, so it must read at a glance */
  tiles((x, y, ch) => {
    if (ch !== ",") return;
    const ox = x * TILE, oy = y * TILE, [base, dark, tip] = th.tall;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      if (j === 0 && !tally(x, y - 1) && hash(ox + i, oy, 8) < 0.45) continue;
      if (j === TILE - 1 && !tally(x, y + 1) && hash(ox + i, oy + j, 8) < 0.45) continue;
      if (i === 0 && !tally(x - 1, y) && hash(ox, oy + j, 8) < 0.45) continue;
      if (i === TILE - 1 && !tally(x + 1, y) && hash(ox + i, oy + j, 8) < 0.45) continue;
      c.set(ox + i, oy + j, base);
    }
    for (const [a, b] of [[1, 2], [9, 1], [5, 6], [12, 7], [1, 11], [8, 12]]) {
      const px = ox + a + (hash(x, y, a) < 0.5 ? 0 : 1), py = oy + b;
      c.set(px, py + 3, dark); c.set(px + 1, py + 3, dark); c.set(px + 2, py + 3, dark);
      c.set(px, py + 2, dark); c.set(px + 2, py + 2, dark); c.set(px + 1, py + 2, base);
      c.set(px, py + 1, tip); c.set(px + 2, py + 1, tip); c.set(px + 1, py, tip);
    }
  });

  /* paths: rounded at corners, roughened at the edge */
  tiles((x, y, ch) => {
    if (!isPathCh(ch) || bridge(x, y)) return;
    const N = !pathy(x, y - 1), S = !pathy(x, y + 1), Ww = !pathy(x - 1, y), Ee = !pathy(x + 1, y);
    const NW = !N && !Ww && !pathy(x - 1, y - 1), NE = !N && !Ee && !pathy(x + 1, y - 1);
    const SW = !S && !Ww && !pathy(x - 1, y + 1), SE = !S && !Ee && !pathy(x + 1, y + 1);
    const ox = x * TILE, oy = y * TILE, [p0, p1, p2] = th.path;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const wx = ox + i, wy = oy + j, r = TILE - 1 - i, b = TILE - 1 - j;
      if ((N && Ww && i + j < 3) || (N && Ee && r + j < 3) || (S && Ww && i + b < 3) || (S && Ee && r + b < 3)) continue;
      if ((NW && i + j < 2) || (NE && r + j < 2) || (SW && i + b < 2) || (SE && r + b < 2)) continue;
      const d = Math.min(Ww ? i : 9, Ee ? r : 9, N ? j : 9, S ? b : 9);
      const v = hash(wx, wy, 9);
      if (d === 0 && v < 0.3) continue;
      let col = p0;
      if (th.cobble) { const u = (wx + (Math.floor(wy / 4) % 2 ? 2 : 0)) % 4, w = wy % 4; col = u === 0 || w === 0 ? p1 : hash(Math.floor((wx + 1) / 4), Math.floor(wy / 4), 2) < 0.2 ? p1 : p0; }
      else if (v < 0.07) col = p1; else if (v > 0.97) col = p2;
      if (d === 0) col = p2; else if (d === 1 && v < 0.25) col = p1;
      c.set(wx, wy, col);
    }
    if (th.asphalt) {   // the dashes down the middle of the road
      if (N && S) for (let i = 2; i < 14; i += 8) c.rect(ox + i, oy + 7, 4, 1, "#e8e4d0");
      else if (Ww && Ee) for (let j = 2; j < 14; j += 8) c.rect(ox + 7, oy + j, 1, 4, "#e8e4d0");
    }
  });

  /* water, with a bank and a line of foam */
  tiles((x, y) => {
    if (!watery(x, y)) return;
    const N = !watery(x, y - 1), S = !watery(x, y + 1), Ww = !watery(x - 1, y), Ee = !watery(x + 1, y);
    const ox = x * TILE, oy = y * TILE, [w0, w1, foam] = th.water;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const r = TILE - 1 - i, b = TILE - 1 - j;
      if ((N && Ww && i + j < 3) || (N && Ee && r + j < 3) || (S && Ww && i + b < 3) || (S && Ee && r + b < 3)) continue;
      const d = Math.min(Ww ? i : 9, Ee ? r : 9, N ? j : 9, S ? b : 9);
      c.set(ox + i, oy + j, d === 0 ? th.bank : d === 1 ? foam : d === 2 ? w1 : w0);
    }
    for (const k of [0, 1, 2]) {
      const a = ox + 3 + Math.floor(hash(x, y, 20 + k) * 8), b = oy + 3 + Math.floor(hash(x, y, 30 + k) * 10);
      c.rect(a, b, 3, 1, k === 0 ? foam : w1);
    }
  });

  /* a road crossing water is a bridge */
  tiles((x, y) => {
    if (!bridge(x, y)) return;
    const ox = x * TILE, oy = y * TILE, wood = ["#c69a60", "#a87c48", "#7a5430"];
    c.rect(ox + 1, oy, 14, TILE, wood[2]);
    for (let j = 0; j < TILE; j++) c.rect(ox + 3, oy + j, 10, 1, j % 4 === 3 ? wood[2] : j % 4 === 0 ? wood[0] : wood[1]);
    c.rect(ox + 2, oy, 1, TILE, "#e2c48c"); c.rect(ox + 13, oy, 1, TILE, "#e2c48c");
  });

  /* trees, back to front, so what is lower overlaps what is higher */
  const treeCache = th.trees.map(([kind, col]) => treeSprite(kind, col, th.trunk));
  tiles((x, y, ch) => {
    if (ch === "#") c.blit(treeCache[Math.floor(hash(x, y, 40) * treeCache.length)], x * TILE - 2, y * TILE - 8);
  });
  return c;
}

/* ── people on the map: 16×20, feet on the bottom row ──
   o outline · h/H hair · s/S skin · e eye · t/T top · l/L legs · b boots · others are per-person */
const FRONT = [
  "................",
  "................",
  "................",
  ".....oooooo.....",
  "....ohhhhhho....",
  "...ohhhhhhhho...",
  "...ohhhhhhHHo...",
  "...ohshhhssHo...",
  "...ossessesSo...",
  "...ossessesSo...",
  "....osssssSo....",
  "....otttttTo....",
  "...ostttttTso...",
  "...ostttttTso...",
  "...ootttttToo...",
  "....olllllLo....",
  "....olllllLo....",
  "....olLoolLo....",
  "....obboobbo....",
  "....oooooooo....",
];
const FRONT_STEP = { 17: "....olLoolLo....", 18: "....obboolLo....", 19: "....oooooooo...." };
const BACK = FRONT.map((row, y) => (y >= 7 && y <= 9 ? "...ohhhhhhhHo..." : y === 10 ? "....ohhhhhHo...." : row));
const BACK_STEP = FRONT_STEP;
const SIDE = [
  "................",
  "................",
  "................",
  ".....oooooo.....",
  "....ohhhhhho....",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhssso...",
  "...ohhhhsseso...",
  "...ohhhhsseso...",
  "....oHhsssso....",
  ".....otttto.....",
  "....otttTTso....",
  "....otttTTso....",
  "....ootttToo....",
  ".....ollLo......",
  ".....ollLo......",
  ".....ollLo......",
  ".....obbbbo.....",
  ".....oooooo.....",
];
const SIDE_STEP = { 15: "....ollooLLo....", 16: "...ollo..oLLo...", 17: "...oLo....oLo...", 18: "...obbo...obbo..", 19: "...oooo...oooo.." };

function person(rows, palette, patch = {}) {
  const c = new Canvas(16, 20);
  const merged = rows.map((r, y) => {
    const p = patch[y]; if (!p) return r;
    return Array.from(r).map((ch, i) => (p[i] && p[i] !== "." ? (p[i] === "_" ? "." : p[i]) : ch)).join("");
  });
  merged.forEach((row, y) => {
    if (row.length !== 16) throw new Error(`row ${y} is ${row.length} wide: ${row}`);
    Array.from(row).forEach((ch, x) => {
      if (ch === ".") return;
      const col = palette[ch];
      if (!col) throw new Error("no colour for " + ch);
      c.set(x, y, col);
    });
  });
  return c;
}
const withSteps = (rows, step) => rows.map((r, y) => step[y] || r);

const SKIN = { s: "#ffd8b0", S: "#e8b488", e: "#1c1430" };
const HERO = { ...SKIN, o: "#241a34", h: "#3f3a8f", H: "#2d2a6e", t: "#2fa89a", T: "#20807a", l: "#3a4670", L: "#2a3454", b: "#e8e4dc", a: "#ff8a3a", A: "#d8662a" };
/* The hero: indigo hair, a teal jacket, an orange scarf. */
export function hero() {
  const f = { 11: "....oaaaaaAo....", 12: "........a......." };
  const s = { 11: ".....oaaaA......", 12: "...A............" };
  return {
    down: [person(FRONT, HERO, f), person(withSteps(FRONT, FRONT_STEP), HERO, f)],
    up: [person(BACK, HERO, { 11: "....oaaaaaAo....", 12: "......aa........" }), person(withSteps(BACK, BACK_STEP), HERO, { 11: "....oaaaaaAo....", 12: "......aa........" })],
    right: [person(SIDE, HERO, s), person(withSteps(SIDE, SIDE_STEP), HERO, s)],
  };
}


/* An arena: walled in by trees, a crossroads through the middle, tall grass in the corners. */
export function arena(theme) {
  const W = 16, H = 18, rows = [];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const cross = x === 7 || x === 8 || y === 8 || y === 9;
      const blob = Math.hypot(x - 3.5, y - 3.5) < 2.6 || Math.hypot(x - 12, y - 3.5) < 2.6 || Math.hypot(x - 3.5, y - 13.5) < 2.6 || Math.hypot(x - 12, y - 13.5) < 2.6;
      row += edge ? "#" : cross ? "=" : blob ? "," : ".";
    }
    rows.push(row);
  }
  return paintMap({ theme, name: theme, map: rows });
}
