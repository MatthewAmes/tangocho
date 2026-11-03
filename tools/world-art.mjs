/* ── Kotoba Quest's world, painted ──
   The six region maps, the walking hero, and the guardians. A map is painted once, whole,
   from its tile text in src/data/quest-world.js, so paths can curve at corners, rivers get
   banks, bridges appear where a road crosses water, and trees overlap into a real forest.
   Only what changes during play — you, a guardian, a locked gate — is laid on top.

   Overworld people are 16×20, placed by hand pixel by pixel from the rows below; portraits
   are 48×48 and drawn with the same painter as the creatures. */
import { Sprite, ramp, hexRgb, E, C, P, R, K } from "./pixel-art.mjs";

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
    building: { kind: "house", wall: ["#f3e6cc", "#d8c4a0"], roof: ["#3f6fb5", "#2d5290", "#6f9bd8"], door: "#7a4a2a", glass: "#8fd0f0" },
  },
  town: {
    ground: ["#a3c264", "#95b358", "#b1ce72"], floor: "#55803f", tall: ["#558f3c", "#3f742f", "#86b84a"],
    path: ["#cfc4ae", "#b3a78f", "#8f8570"], cobble: true, water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#7f7446",
    trees: [["round", "#4f9a48"], ["pine", "#2f7d4f"]], trunk: "#6e4c2c", flowers: ["#ff8fa8", "#ffffff"],
    building: { kind: "house", clock: true, wall: ["#f7eccf", "#dcc9a2"], roof: ["#d5613f", "#a8452f", "#ef8a62"], door: "#6a3f24", glass: "#ffe08a" },
  },
  river: {
    ground: ["#7cc68a", "#6db57c", "#8fd59a"], floor: "#2f7d5f", tall: ["#2f9a72", "#217a5a", "#58c08c"],
    path: ["#e6d5a6", "#d3bf8c", "#ad9a68"], water: ["#3fb8d0", "#2b98b4", "#b2f0f4"], bank: "#6f8050",
    trees: [["round", "#2f9f6a"], ["round", "#47b070"]], trunk: "#5e4a2e", flowers: ["#ffffff", "#9fd0ff"],
    building: { kind: "house", wall: ["#f3e6cc", "#d8c4a0"], roof: ["#3f8f8f", "#2d6d70", "#6fc0b8"], door: "#7a4a2a", glass: "#8fd0f0" },
  },
  stadium: {
    ground: ["#b2c868", "#a2b85c", "#c0d676"], floor: "#5f8a48", tall: ["#6a9f3f", "#4f8033", "#9ccb4e"],
    path: ["#efd5a4", "#dcbc88", "#b8966a"], water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#7f7446",
    trees: [["round", "#f09ec0"], ["round", "#f6b8d0"]], trunk: "#6a4436", flowers: ["#ffffff", "#ff8fa8"],
    building: { kind: "stadium", wall: ["#e8e4dc", "#c4bdb0"], roof: ["#d5413f", "#a82f30", "#f2f0e8"], door: "#3a3a4a", glass: "#3f9142" },
  },
  office: {
    ground: ["#c3c9d2", "#b2b8c3", "#d0d6dd"], paved: true, floor: "#6f8a70", tall: ["#4f9a58", "#3a7c48", "#7cc070"],
    path: ["#7c8496", "#6a7284", "#565d6d"], asphalt: true, water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#6f7686",
    trees: [["round", "#3f8f58"], ["pine", "#2f7a5a"]], trunk: "#5a4a3e", flowers: [],
    building: { kind: "tower", wall: ["#4f6488", "#3a4d6e"], roof: ["#8a96aa", "#6a768c", "#b4bece"], door: "#20283c", glass: "#ffe08a" },
  },
  forest: {
    ground: ["#a7a558", "#97954c", "#b6b466"], floor: "#5f5a30", tall: ["#7f8a30", "#626c26", "#b0b040"],
    path: ["#c49a68", "#ad8456", "#8a6844"], water: ["#4aa3e6", "#3687cc", "#a6def9"], bank: "#6a5a3a",
    trees: [["round", "#e0752f"], ["round", "#d5503a"], ["round", "#e8b03a"], ["pine", "#3f6f48"]], trunk: "#54382a", flowers: ["#ffd84a", "#ff8f5f"],
    building: { kind: "house", wall: ["#e8d4ae", "#ccb68c"], roof: ["#8a4f3a", "#6a3a2c", "#b0705a"], door: "#54382a", glass: "#ffe08a" },
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

/* ── buildings ── */
function house(w, h, b) {
  const c = new Canvas(w + 2, h + 2), x = 1, y = 1, roofH = Math.round(h * 0.47);
  c.rect(x + 1, y + roofH, w - 2, h - roofH, b.wall[0]);
  c.rect(x + w - 3, y + roofH, 2, h - roofH, b.wall[1]);
  c.rect(x + 1, y + roofH, w - 2, 2, b.wall[1]);
  for (let r = 0; r < roofH; r++) {
    const inset = Math.max(0, 2 - r);
    const tone = r === 0 ? b.roof[2] : r === roofH - 1 ? b.roof[1] : b.roof[0];
    c.rect(x + inset, y + r, w - inset * 2, 1, tone);
    if (r > 0 && r < roofH - 1 && r % 2 === 0) for (let i = x + inset + (r % 4 ? 1 : 3); i < x + w - inset; i += 4) c.set(i, y + r, b.roof[1]);
    c.set(x + w - inset - 1, y + r, b.roof[1]);
  }
  const doorX = x + Math.floor(w / 2) - 2, doorH = Math.min(6, h - roofH - 1);
  c.rect(doorX, y + h - doorH, 4, doorH, b.door);
  c.set(doorX + 3, y + h - Math.ceil(doorH / 2), "#ffd84a");
  for (let wx = x + 3; wx + 3 <= x + w - 3; wx += w > 20 ? 8 : 16) {
    if (wx + 3 > doorX - 1 && wx < doorX + 5) continue;
    window3(c, wx, y + roofH + 3, b.glass);
  }
  if (w <= 16) { window3(c, x + 2, y + roofH + 3, b.glass); window3(c, x + w - 5, y + roofH + 3, b.glass); }
  return c.outline("#2a2230");
}
function window3(c, x, y, glass) {
  c.rect(x, y, 3, 3, glass); c.set(x, y, "#ffffff");
}
/* The town's clock tower rises out of its biggest block. */
function clockTower(w, h, b) {
  const c = new Canvas(w + 2, h + 14), bx = 1, by = 13;
  c.blit(house(w, h, b), 0, 12);
  const tw = 14, tx = bx + Math.floor((w - tw) / 2);
  c.rect(tx, 5, tw, by + 10, b.wall[0]);
  c.rect(tx + tw - 2, 5, 2, by + 10, b.wall[1]);
  for (let r = 0; r < 5; r++) c.rect(tx + 5 - r, 1 + r, 4 + r * 2, 1, r ? b.roof[0] : b.roof[2]);
  c.set(tx + 6, 0, "#ffd84a"); c.set(tx + 7, 0, "#ffd84a");
  const cx = tx + 7, cy = 13;
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const d = Math.hypot(i, j);
    if (d <= 5.2) c.set(cx + i - 0, cy + j, d > 4.2 ? "#3a2a2a" : "#fffdf0");
  }
  for (let j = 1; j <= 3; j++) c.set(cx, cy - j, "#2a2230");
  c.set(cx + 1, cy, "#2a2230"); c.set(cx + 2, cy + 1, "#2a2230"); c.set(cx, cy, "#d5413f");
  return c.outline("#2a2230");
}
function tower(w, h, b) {
  const c = new Canvas(w + 2, h + 2), x = 1, y = 1;
  c.rect(x, y + 2, w, h - 2, b.wall[0]);
  c.rect(x + w - 3, y + 2, 3, h - 2, b.wall[1]);
  c.rect(x, y, w, 3, b.roof[0]); c.rect(x, y, w, 1, b.roof[2]);
  for (let j = y + 5; j < y + h - 8; j += 5) for (let i = x + 2; i + 3 <= x + w - 1; i += 5) {
    const lit = hash(i, j, w) < 0.45;
    c.rect(i, j, 3, 3, lit ? b.glass : "#7f9ac0");
    c.set(i, j, lit ? "#fff4c0" : "#b8cce4");
  }
  c.rect(x + 3, y + h - 7, w - 6, 7, "#8fa8c8");
  c.rect(x + Math.floor(w / 2) - 3, y + h - 6, 6, 6, b.door);
  c.rect(x + Math.floor(w / 2), y + h - 6, 1, 6, "#8fa8c8");
  return c.outline("#1c2230");
}
function stadium(w, h, b) {
  const c = new Canvas(w + 2, h + 8), x = 1, y = 7;
  for (const fx of [x + 6, x + w - 8]) { c.rect(fx, 0, 1, 8, "#5a5a68"); c.rect(fx + 1, 0, 5, 3, b.roof[0]); c.rect(fx + 1, 1, 5, 1, b.roof[2]); }
  c.rect(x, y, w, h, b.wall[0]);
  // the stands, ranks of seats in banner colours
  const stands = ["#d5413f", "#f2f0e8", "#3f7fd0", "#f2c14a"];
  for (let r = 0; r < 4; r++) for (let i = x + 1; i < x + w - 1; i++) c.set(i, y + 1 + r * 2, hash(i, r, 9) < 0.5 ? stands[r] : "#7a7a88"), c.set(i, y + 2 + r * 2, "#5a5a68");
  c.rect(x, y + 9, w, 2, b.roof[0]);
  for (let i = x; i < x + w; i += 4) c.rect(i, y + 9, 2, 2, b.roof[2]);
  for (let i = x + 3; i + 6 <= x + w - 2; i += 9) {
    c.rect(i, y + h - 12, 6, 12, b.door);
    c.rect(i + 1, y + h - 13, 4, 1, b.door);
  }
  c.rect(x + w - 3, y + 11, 3, h - 11, b.wall[1]);
  return c.outline("#2a2230");
}

function torii() {
  const c = new Canvas(18, 20), red = "#d8392f", dark = "#a42a28", ink = "#2a2230";
  c.rect(4, 7, 2, 12, red); c.rect(12, 7, 2, 12, dark);
  c.rect(2, 2, 14, 2, ink);
  c.rect(3, 4, 12, 2, red); c.rect(3, 5, 12, 1, dark);
  c.rect(4, 8, 10, 1, red);
  c.rect(8, 6, 2, 2, "#f2d04a");
  c.rect(3, 18, 4, 1, "#8a8a94"); c.rect(11, 18, 4, 1, "#8a8a94");
  return c.outline(ink);
}
function signpost() {
  const c = new Canvas(16, 16), wood = "#b98a4f", dark = "#7a5430";
  c.rect(7, 9, 2, 6, dark);
  c.rect(2, 3, 12, 7, wood); c.rect(2, 9, 12, 1, dark);
  c.rect(4, 5, 8, 1, dark); c.rect(4, 7, 6, 1, dark);
  return c.outline("#2a2230");
}
function arrow(left) {
  const c = new Canvas(16, 16);
  const rows = ["...w....", "...ww...", "wwwwww..", "wwwwwww.", "wwwwww..", "...ww...", "...w...."];
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => { if (ch === "w") c.set(left ? 11 - i : 4 + i, 5 + j, "#fffbe8"); }));
  return c.outline("#7a5430");
}
function barrier() {
  const c = new Canvas(16, 16), wood = "#b98a4f", dark = "#7a5430", ink = "#2a2230";
  c.rect(2, 3, 2, 12, dark); c.rect(12, 3, 2, 12, dark);
  c.rect(1, 5, 14, 2, wood); c.rect(1, 10, 14, 2, wood);
  c.rect(1, 6, 14, 1, dark); c.rect(1, 11, 14, 1, dark);
  c.rect(6, 7, 4, 4, "#f2c14a"); c.set(7, 9, ink); c.set(8, 9, ink);
  c.rect(6, 5, 1, 2, "#8a8a94"); c.rect(9, 5, 1, 2, "#8a8a94"); c.rect(7, 4, 2, 1, "#8a8a94");
  return c.outline(ink);
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

  /* standing things, back to front, so what is lower on the map overlaps what is higher */
  const blocks = buildingBlocks(rows);
  const treeCache = th.trees.map(([kind, col]) => treeSprite(kind, col, th.trunk));
  let clockDone = false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x], ox = x * TILE, oy = y * TILE;
      if (ch === "#") c.blit(treeCache[Math.floor(hash(x, y, 40) * treeCache.length)], ox - 2, oy - 8);
      else if (ch === "S") { c.rect(ox + 2, oy + 13, 12, 3, "#b8b8c0"); c.blit(torii(), ox - 1, oy - 4); }
      else if (ch === "n") c.blit(signpost(), ox, oy);
      else if (ch === "<") c.blit(arrow(true), ox, oy);
    }
    for (const b of blocks.filter((k) => k.y + k.h - 1 === y)) {
      const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE, st = th.building;
      c.rect(px, py + h, w, 2, th.ground[1]);
      if (st.kind === "stadium") c.blit(stadium(w, h, st), px - 1, py - 7);
      else if (st.kind === "tower") c.blit(tower(w, h, st), px - 1, py - 1);
      else if (st.clock && !clockDone && b.w >= 2 && b.h >= 2) { clockDone = true; c.blit(clockTower(w, h, st), px - 1, py - 13); }
      else c.blit(house(w, h, st), px - 1, py - 1);
    }
  }
  return c;
}

/* Connected H tiles become one building; maps only ever use rectangles. */
function buildingBlocks(rows) {
  const seen = new Set(), out = [], H = rows.length, W = rows[0].length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (rows[y][x] !== "H" || seen.has(x + "," + y)) continue;
    let w = 0, h = 0;
    while (x + w < W && rows[y][x + w] === "H") w++;
    while (y + h < H && rows[y + h][x] === "H") h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (rows[y + j][x + i] !== "H") throw new Error(`building at ${x},${y} is not a rectangle`);
      seen.add(x + i + "," + (y + j));
    }
    out.push({ x, y, w, h });
  }
  return out;
}

/* A machine humming behind the kiosk, wind coming off it. */
function coolingUnit() {
  const c = new Canvas(16, 20), ink = "#20283c";
  c.rect(1, 5, 14, 13, "#c4ccd8"); c.rect(1, 5, 14, 1, "#e8edf4"); c.rect(13, 6, 2, 12, "#98a2b4");
  for (let j = 7; j < 13; j += 2) c.rect(3, j, 10, 1, "#5f6c84");
  c.rect(3, 14, 3, 2, "#58c8f0"); c.rect(8, 14, 4, 1, "#5f6c84");
  c.outline(ink);
  c.set(5, 2, "#a8e0ff"); c.set(6, 1, "#a8e0ff"); c.set(9, 3, "#d8f0ff"); c.set(10, 2, "#a8e0ff");
  return c;
}
export const objects = () => ({ locked: barrier(), machine: coolingUnit() });

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

/* Guardians wait to be challenged, so each needs one pose: facing you. */
const GUARDIANS = {
  hana: {
    colors: { ...SKIN, o: "#241a34", h: "#7a4a2a", H: "#5a3620", t: "#4f9a48", T: "#3a7c38", l: "#4f9a48", L: "#3a7c38", b: "#6a4a2a", a: "#f2d78a", A: "#d8b868", c: "#3f7fd0", w: "#ffffff" },
    patch: {
      2: "....oooooooo....", 3: "....oaaaaAAo....", 4: "....oaaaaAAo....",
      5: "..oocccccccoo...", 6: ".oaaaaaaaaaAAo..", 7: "..ooooooooooo...",
      12: "...os.w...w.so..", 13: "...os.wwwww.so..",
    },
  },
  ren: {
    colors: { ...SKIN, o: "#241a34", h: "#55505f", H: "#3a3644", t: "#8a5a34", T: "#6a4428", l: "#3a3a4a", L: "#2a2a38", b: "#2a2230", a: "#f2c14a", w: "#ffffff", c: "#7fd0f0" },
    patch: {
      6: "...oaaaaaaaao...", 7: "...oaccaaccao...",
      12: "...owtttttTwo...", 13: "...owttaattwo...",
    },
  },
  mio: {
    colors: { ...SKIN, o: "#241a34", h: "#2a2a3a", H: "#1a1a28", t: "#4a6fd0", T: "#3a56a8", l: "#4a6fd0", L: "#3a56a8", b: "#d8d0c0", a: "#6fc0e8", A: "#4f9ac0", w: "#ffffff" },
    patch: {
      3: ".....oooooo.....", 4: "....oaaaaaAo....", 5: "...oaaaaaaaAo...", 6: "...oaaaaaaAAo...",
      8: "..hossessesSoh..", 9: "..hossessesSoh..", 10: "..o.osssssSo.o..",
      12: "...ostwtttwTso..", 13: "...osttwtwtTso..", 14: "...oottwtttoo...",
    },
  },
  mika: {
    colors: { ...SKIN, o: "#241a34", h: "#6a3a2a", H: "#4f2a20", t: "#f2f0e8", T: "#c8c4b8", l: "#d8604a", L: "#a84a3a", b: "#f2f0e8", a: "#ffffff", A: "#d8d8e0", c: "#d8604a" },
    patch: {
      4: "....oaaaaaAo....", 5: "...oaaaaaaaAo...", 6: "...oaaaaaaAAo...",
      12: "...ostcccccTso..", 13: "...ostcccccTso..", 14: "...ooccccccoo...",
    },
  },
  ken: {
    colors: { ...SKIN, o: "#241a34", h: "#2a2a3a", H: "#1a1a28", t: "#e8743a", T: "#c0582a", l: "#3a5a9a", L: "#2a4478", b: "#f2f0e8", w: "#ffffff" },
    patch: {
      3: "....o.oo.oo.....", 4: "....ohhhhhhho...",
      12: "...ostwwwttTso..",
    },
  },
  aya: {
    colors: { ...SKIN, o: "#241a34", h: "#5a2a5a", H: "#421f46", t: "#6a8ac8", T: "#5270a8", l: "#34304a", L: "#262238", b: "#6a4a2a", g: "#2a2a3a", w: "#f2ead0" },
    patch: {
      8: "..hosgegggeSoh..", 9: "..hossessesSoh..", 10: "..h.osssssSo.h..", 11: "..h.otttttTo.h..",
      13: "...oswwwwwwso...", 14: "...oowwwwwwoo...",
    },
  },
  taro: {
    colors: { ...SKIN, o: "#241a34", h: "#3a2a24", H: "#2a1e1a", t: "#3f7fd0", T: "#2f62a8", l: "#34304a", L: "#262238", b: "#2a2230", a: "#3f7fd0", A: "#2f62a8", w: "#ffffff" },
    patch: {
      4: "....oaaaaaAo....", 5: "...oaaaaaaaAoo..", 6: "...oaaaaaaAAaAo.",
      12: "...ostttwttTso..",
    },
  },
  sora: {
    colors: { ...SKIN, o: "#241a34", h: "#3a2a24", H: "#2a1e1a", t: "#2a3a6a", T: "#1f2c54", l: "#8a8a94", L: "#6a6a74", b: "#1c1c28", a: "#1c1c28", A: "#3a3a4a", g: "#8a8a94" },
    patch: {
      4: "....oaaaaaao....", 5: "...oaaaaaaaao...", 6: "...oaaaaaaaaAAo.", 7: "...ohshhhssHoo..",
      9: "...ohsehhesHo...", 10: "....ohhhhhHo....", 11: "....ohhhhhHo....",
      12: "...osggggggso...", 13: "...osggggggso...",
    },
  },
  kaede: {
    colors: { ...SKIN, o: "#241a34", h: "#f2d04a", H: "#d8a830", t: "#20305a", T: "#182446", l: "#20305a", L: "#182446", b: "#1c1c28", w: "#ffffff", r: "#d5413f", g: "#3a3a4a" },
    patch: {
      8: "...osgegggeSo...", 9: "...ossessesSo...",
      10: "...hosssssSoh...", 11: "...hotwrwtToh...", 12: "...ostwrwttTso..", 13: "...osttwttTso..",
    },
  },
  yuki: {
    colors: { ...SKIN, o: "#241a34", h: "#eeeef6", H: "#c4c4d4", t: "#8a5ab0", T: "#6a4490", l: "#8a5ab0", L: "#6a4490", b: "#d8d0c0", w: "#f2c14a", g: "#5a5a68" },
    patch: {
      1: "......oooo......", 2: ".....ohhHHo.....",
      8: "...osgegggeSo...", 9: "...ossessesSo...",
      11: "....otwwwtTo....", 15: "....olllllLo....", 16: "....olllllLo....", 17: "....olllllLo....",
    },
  },
};
export const GUARDIAN_IDS = Object.keys(GUARDIANS);
export const guardianWalker = (id) => person(FRONT, GUARDIANS[id].colors, GUARDIANS[id].patch);

/* ── guardian portraits: 48×48, head and shoulders ── */
const SKIN_R = ramp(["#b57a5a", "#e0a880", "#ffd2aa", "#ffe4c8", "#fff2e0"]);
const OLD_SKIN = ramp(["#a8785e", "#d8a688", "#f6cdaa", "#ffe0c4", "#fff0dc"]);

function bust(s, { top, hairBack, skin = SKIN_R, hair, neck = true }) {
  if (hairBack) hairBack();
  s.part(top, {}, E(24, 50, 19, 14));
  if (neck) s.part(skin, { bias: -1 }, R(20, 31, 8, 7));
  s.part(skin, {}, E(24, 22, 11, 12), E(13, 24, 2, 3), E(35, 24, 2, 3));
  if (hair) hair();
}
function face(s, { eye = "#1c1430", iris = null, y = 21, mouth = "smile", brow = null, blush = true, lashes = false }) {
  s.eye(17, y, { w: 3, h: 4, dark: eye, iris }).eye(28, y, { w: 3, h: 4, dark: eye, iris });
  if (brow) s.line(16, y - 2, 20, y - 2, brow).line(27, y - 2, 31, y - 2, brow);
  if (lashes) s.px(16, y, eye).px(31, y, eye);
  s.px(24, y + 5, "#d09070");
  if (mouth === "smile") s.pxs([[21, y + 8], [22, y + 9], [23, y + 9], [24, y + 9], [25, y + 9], [26, y + 8]], "#a04a3a");
  if (mouth === "grin") { s.rect(21, y + 8, 6, 2, "#8a2f2a"); s.rect(21, y + 8, 6, 1, "#ffffff"); }
  if (mouth === "flat") s.line(21, y + 9, 26, y + 9, "#a04a3a");
  if (blush) s.pxs([[15, y + 6], [16, y + 6], [31, y + 6], [32, y + 6]], "#ff9fb0");
}

const PORTRAITS = {
  hana(s) {   // straw hat, overalls, and a rake over the shoulder
    const HAT = ramp("#f2d78a"), HAIR = ramp("#7a4a2a"), GREEN = ramp("#4f9a48"), SHIRT = ramp("#f4f0e4");
    s.part(ramp("#b98a4f"), {}, K(43, 6, 37, 44, 1));
    s.part(ramp("#8a8a94"), {}, P([[38, 3], [46, 5], [45, 9], [38, 7]]));
    bust(s, { top: SHIRT, hairBack: () => s.part(HAIR, {}, E(24, 25, 13, 12)), hair: () => {
      s.part(HAIR, {}, P([[13, 22], [14, 15], [34, 15], [35, 22], [29, 18], [20, 18]]));
    } });
    s.part(GREEN, {}, R(12, 40, 24, 8), K(17, 37, 16, 42, 2), K(31, 37, 32, 42, 2));
    s.part(ramp("#f2c14a"), { round: 1 }, C(17, 41, 1.2), C(31, 41, 1.2));
    s.part(HAT, {}, E(24, 15, 19, 4.2));
    s.part(HAT, { shine: 1 }, E(24, 10, 11, 7));
    s.part(ramp("#3f7fd0"), { decal: true }, R(10, 12, 28, 3));
    face(s, { iris: "#7a4a2a", mouth: "grin" });
  },
  ren(s) {   // loupe on the forehead, leather apron, a pocket watch
    const HAIR = ramp("#55505f"), APRON = ramp("#8a5a34"), SHIRT = ramp("#d8d4c8"), BRASS = ramp("#f2c14a");
    bust(s, { top: SHIRT, hair: () => {
      s.part(HAIR, {}, P([[13, 21], [13, 12], [20, 8], [31, 8], [35, 13], [35, 21], [31, 15], [17, 15]]));
    } });
    s.part(APRON, {}, P([[14, 38], [34, 38], [38, 48], [10, 48]]));
    s.part(BRASS, { shine: 1 }, C(32, 43, 3));
    s.part(ramp("#3a2a24"), {}, K(13, 13, 35, 13, 1.2));
    s.part(BRASS, {}, C(24, 12, 4));
    s.part(ramp("#9fe0ff"), { decal: true, shine: 1 }, C(24, 12, 2.4));
    face(s, { iris: "#3a5a7a", mouth: "flat", brow: "#3a3644", blush: false });
    s.pxs([[32, 41], [32, 42], [33, 43]], "#3a2a24");
    s.pxs([[16, 28], [17, 29], [31, 28], [30, 29]], "#d8a888");
  },
  mio(s) {   // kerchief, pigtails, sleeves tied back for work
    const HAIR = ramp("#2a2a3a"), KERCH = ramp("#6fc0e8"), TOP = ramp("#4a6fd0");
    s.part(HAIR, {}, E(9, 30, 4, 7, 0.2), E(39, 30, 4, 7, -0.2));
    s.part(ramp("#ff8fa8"), {}, C(11, 25, 2), C(37, 25, 2));
    bust(s, { top: TOP, hair: () => {
      s.part(HAIR, {}, P([[13, 22], [14, 14], [34, 14], [35, 22], [28, 18], [24, 21], [20, 18]]));
    } });
    s.part(KERCH, {}, P([[13, 15], [15, 8], [24, 5], [33, 8], [35, 15], [24, 13]]));
    s.pxs([[19, 9], [24, 8], [29, 9], [22, 11], [27, 11]], "#ffffff");
    s.part(ramp("#fbf8f0"), { decal: true }, K(12, 38, 34, 47, 1.3), K(36, 38, 14, 47, 1.3));
    face(s, { iris: "#4a6fd0", lashes: true });
  },
  mika(s) {   // cafeteria cap, red apron, a big soup-ladle smile
    const HAIR = ramp("#6a3a2a"), CAP = ramp(["#9aa4c8", "#d8def0", "#f6f8ff", "#ffffff", "#ffffff"]), COAT = ramp("#f2f0e8");
    s.part(HAIR, {}, E(24, 26, 13.5, 12));
    bust(s, { top: COAT, hair: () => s.part(HAIR, {}, P([[13, 21], [15, 13], [33, 13], [35, 21], [30, 16], [18, 16]])) });
    s.part(ramp("#d8604a"), {}, P([[15, 40], [33, 40], [36, 48], [12, 48]]), K(17, 36, 17, 41, 1.2), K(31, 36, 31, 41, 1.2));
    s.part(CAP, { shine: 1 }, E(24, 10, 13, 5.5), R(12, 11, 24, 4));
    face(s, { iris: "#7a4a2a", mouth: "grin" });
  },
  ken(s) {   // spiky hair, orange hoodie, permanently a little worried
    const HAIR = ramp("#2a2a3a"), HOOD = ramp("#e8743a");
    s.part(HOOD, {}, E(24, 38, 14, 5));
    bust(s, { top: HOOD, hair: () => s.part(HAIR, {}, P([[13, 21], [13, 12], [16, 13], [17, 7], [21, 10], [24, 5], [27, 10], [31, 7], [32, 13], [35, 12], [35, 21], [30, 15], [24, 17], [18, 15]])) });
    s.part(ramp("#f2f0e8"), {}, K(21, 40, 21, 46, 0.8), K(27, 40, 27, 46, 0.8));
    face(s, { iris: "#3a4a6a", mouth: "flat", y: 22 });
    s.line(16, 19, 20, 18, "#1a1a28").line(27, 18, 31, 19, "#1a1a28");
    s.pxs([[36, 15], [36, 16], [37, 17], [36, 17]], "#8fd8ff");
  },
  aya(s) {   // long plum hair, round glasses, a book held close
    const HAIR = ramp("#5a2a5a"), TOP = ramp("#6a8ac8");
    s.part(HAIR, {}, E(24, 28, 15, 18));
    bust(s, { top: TOP, hair: () => s.part(HAIR, {}, P([[13, 22], [15, 11], [24, 8], [33, 11], [35, 22], [29, 14], [20, 15]])) });
    s.part(ramp("#f2ead0"), { round: 2 }, R(14, 40, 20, 8));
    s.line(24, 40, 24, 47, "#a89a78");
    face(s, { iris: "#5a2a8a", mouth: "flat", blush: false, lashes: true });
    for (const [x, y] of [[18, 23], [29, 23]]) {
      for (let a = 0; a < 16; a++) s.px(Math.round(x + Math.cos(a * Math.PI / 8) * 4), Math.round(y + Math.sin(a * Math.PI / 8) * 4), "#2a2a3a");
    }
    s.line(22, 23, 25, 23, "#2a2a3a");
  },
  taro(s) {   // shop cap, blue apron, a grin that is slightly too big
    const HAIR = ramp("#3a2a24"), CAP = ramp("#3f7fd0"), TOP = ramp("#f4f0e4");
    bust(s, { top: TOP, hair: () => s.part(HAIR, {}, P([[13, 23], [13, 15], [35, 15], [35, 23], [32, 18], [16, 18]])) });
    s.part(CAP, {}, P([[14, 39], [34, 39], [37, 48], [11, 48]]));
    s.part(CAP, { shine: 1 }, E(24, 11, 12, 6));
    s.part(CAP, { bias: -1 }, E(34, 16, 9, 1.8));
    s.pxs([[22, 10], [23, 10], [24, 10], [25, 10], [23, 12], [24, 12], [22, 11], [25, 11]], "#ffffff");
    face(s, { iris: "#6a4a2a", mouth: "grin", blush: false });
    s.line(16, 19, 20, 20, "#2a1e1a").line(31, 19, 27, 20, "#2a1e1a");
  },
  sora(s) {   // cap and beard, mask pushed up, chest protector
    const BEARD = ramp("#3a2a24"), NAVY = ramp("#2a3a6a"), CAP = ramp("#2a2a38"), STEEL = ramp("#8a8a94");
    bust(s, { top: NAVY, hair: () => {
      s.part(BEARD, {}, P([[13, 24], [16, 28], [20, 29], [28, 29], [32, 28], [35, 24], [35, 30], [30, 37], [18, 37], [13, 30]]));
    } });
    s.part(ramp("#f2efe6"), { decal: true }, E(24, 32.5, 3.2, 1.2));
    s.part(STEEL, {}, R(14, 40, 20, 8));
    for (const y of [42, 45]) s.line(14, y, 33, y, "#5a5a68");
    s.part(CAP, { shine: 1 }, E(24, 13, 12, 6.5));
    s.part(CAP, {}, E(24, 17, 14, 2));
    s.part(STEEL, {}, K(15, 6, 33, 6, 1), K(19, 5, 19, 10, 0.8), K(24, 4, 24, 9, 0.8), K(29, 5, 29, 10, 0.8));
    face(s, { iris: "#6a4a2a", mouth: "none", brow: "#2a1e1a", blush: false, y: 20 });
  },
  kaede(s) {   // a sharp bob, glasses, a navy suit that notices everything
    const HAIR = ramp("#f2d04a"), SUIT = ramp("#20305a");
    s.part(HAIR, {}, P([[11, 18], [15, 8], [33, 8], [37, 18], [37, 33], [31, 33], [31, 20], [17, 20], [17, 33], [11, 33]]));
    bust(s, { top: SUIT, hair: () => {
      s.part(HAIR, {}, P([[13, 21], [15, 11], [33, 11], [35, 21], [30, 15], [18, 17]]));
    } });
    s.part(ramp("#fbf8f0"), { decal: true }, P([[20, 37], [28, 37], [24, 47]]));
    s.part(ramp("#d5413f"), { decal: true }, P([[23, 38], [25, 38], [25.5, 44], [24, 47], [22.5, 44]]));
    face(s, { iris: "#3a7a5a", mouth: "flat", blush: false, lashes: true });
    for (const x of [15, 26]) { s.line(x, 20, x + 6, 20, "#2a2a38").line(x, 25, x + 6, 25, "#2a2a38").line(x, 20, x, 25, "#2a2a38").line(x + 6, 20, x + 6, 25, "#2a2a38"); }
    s.line(21, 22, 26, 22, "#2a2a38");
  },
  yuki(s) {   // white bun, round glasses, a warm cardigan, tea
    const HAIR = ramp(["#8a8aa4", "#c4c4d4", "#eeeef6", "#f8f8fc", "#ffffff"]), KNIT = ramp("#8a5ab0");
    s.part(HAIR, {}, C(24, 6, 4.5));
    bust(s, { top: KNIT, skin: OLD_SKIN, hairBack: () => s.part(HAIR, {}, E(24, 21, 13, 12)), hair: () => {
      s.part(HAIR, {}, P([[13, 21], [15, 12], [24, 10], [33, 12], [35, 21], [30, 15], [24, 18], [18, 15]]));
    } });
    s.part(ramp("#f2c14a"), { decal: true }, P([[21, 37], [27, 37], [24, 46]]));
    s.part(ramp("#f4f0e4"), {}, R(30, 40, 8, 7), K(38, 42, 39, 44, 1));
    s.part(ramp("#7fa84a"), { decal: true, flat: true }, R(30, 40, 8, 1));
    s.pxs([[32, 37], [33, 36], [33, 35], [35, 37], [36, 36]], "#e0e0ea");
    face(s, { iris: "#6a4a3a" });
    for (const [x, y] of [[18, 23], [29, 23]]) {
      for (let a = 0; a < 16; a++) s.px(Math.round(x + Math.cos(a * Math.PI / 8) * 4), Math.round(y + Math.sin(a * Math.PI / 8) * 4), "#5a5a68");
    }
    s.line(22, 23, 25, 23, "#5a5a68");
    s.pxs([[14, 27], [33, 27], [15, 29], [32, 29]], "#d8a888");
  },
};
export function portrait(id) {
  const s = new Sprite(48, 48);
  PORTRAITS[id](s);
  return s.render();
}
