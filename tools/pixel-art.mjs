/* ── a tiny pixel-art painter ──
   Kotoba Quest's creatures are drawn in code (Matthew, 2026-11-03: "just do the pixel
   sprites yourself but make them beautiful"). A design is a list of shapes in back-to-front
   order; the painter turns that into finished pixel art the way a sprite artist would:

     1. each part gets a height field from its own silhouette, so it reads as a soft volume
     2. light from the upper left picks one of five hue-shifted tones (shadows lean blue,
        highlights lean warm) — banded, never blended, so it stays crisp pixel art
     3. a part tucked behind another gets one tone darker where the front part shades it
     4. where a part overlaps one behind it, its edge gets a darker contour line
     5. a tinted outline (darker than the colour it borders, not flat black) goes round it all
     6. hand-placed details — eyes, shines, stitches — are stamped on last, pixel-exact

   Shapes: E ellipse, C circle, P polygon, R rect, K tapered stroke (limbs, tails, necks).
   Everything is plain data on {width, height, data: RGBA}, encoded by tools/png.mjs. */

/* ── colour ── */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const hexRgb = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
function rgbHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
const towards = (h, target, amt) => { let d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };

/* Five tones, darkest first: deep, shade, base, light, highlight. Pass a hex for a
   generated hue-shifted ramp, or an array of five hexes to hand-pick one. */
export function ramp(base, { spread = 0.1, shift = 1 } = {}) {
  if (Array.isArray(base)) return base.map(hexRgb);
  let [h, s, l] = rgbHsl(hexRgb(base));
  l = clamp(l, 0.06 + 2 * spread, 0.97 - 2 * spread);
  return [-2, -1, 0, 1, 2].map((k) => {
    const hh = k < 0 ? towards(h, 250, -k * 9 * shift) : towards(h, 55, k * 6 * shift);
    const ss = clamp(k < 0 ? s + 0.07 * -k : s - 0.05 * k);
    return hslRgb([hh, ss, clamp(l + k * spread)]);
  });
}
const darken = ([r, g, b], f) => [r * f, g * f, b * f].map(Math.round);
const toRgb = (c) => (typeof c === "string" ? hexRgb(c) : c);

/* ── shapes: each is a test for a pixel centre ── */
export const E = (cx, cy, rx, ry, rot = 0) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (x, y) => { const dx = x - cx, dy = y - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry; return u * u + v * v <= 1; };
};
export const C = (cx, cy, r) => E(cx, cy, r, r);
export const R = (x, y, w, h) => (px, py) => px >= x && px < x + w && py >= y && py < y + h;
export const P = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/* A stroke from (x0,y0) radius r0 to (x1,y1) radius r1 — limbs, tails, necks, feathers. */
export const K = (x0, y0, x1, y1, r0, r1 = r0) => {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  return (x, y) => {
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2);
    const qx = x0 + dx * t, qy = y0 + dy * t, r = r0 + (r1 - r0) * t;
    return (x - qx) ** 2 + (y - qy) ** 2 <= r * r;
  };
};
/* A stroke along a list of points, radius easing from r0 to r1 — curling tails, eels. */
export const path = (pts, r0, r1 = r0) => {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = r0 + ((r1 - r0) * i) / (pts.length - 1), b = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
    segs.push(K(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], a, b));
  }
  return (x, y) => segs.some((f) => f(x, y));
};

/* ── the light: from the upper left and a little in front ── */
const LIGHT = (() => { const v = [-1, -1.3, 1.6], n = Math.hypot(...v); return v.map((c) => c / n); })();
const toneFor = (d) => (d > 0.95 ? 4 : d > 0.83 ? 3 : d > 0.5 ? 2 : d > 0.2 ? 1 : 0);

export class Sprite {
  constructor(w = 48, h = 48) { this.w = w; this.h = h; this.parts = []; this.marks = []; }

  /* Add a part made of the union of shapes. Options:
       decal  — paint only over what is already there, and take its lighting (patches,
                bellies, stripes): it bends with the body it sits on
       flat   — no shading, one fixed tone (tone: 0-4, default 2)
       round  — how far in from the edge the surface keeps curving (default: by size)
       edge   — draw the contour where it overlaps parts behind it (default on, off for decals)
       bias   — nudge every tone up (+) or down (−)
       shine  — a pure-white specular pixel or two where the light hits straight on */
  part(mat, opts, ...shapes) {
    const { w, h } = this, mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (shapes.some((f) => f(x + 0.5, y + 0.5))) mask[y * w + x] = 1;
    this.parts.push({ mat, mask, ...opts });
    return this;
  }
  erase(...shapes) { return this.part(null, { erase: true }, ...shapes); }

  /* Details, stamped after shading and outline. c is a hex or [r,g,b]. */
  px(x, y, c) { this.marks.push([x, y, c]); return this; }
  pxs(list, c) { for (const [x, y] of list) this.px(x, y, c); return this; }
  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); return this; }
  /* A friendly eye: a dark rounded block, a white catchlight top-left, a hint of colour low. */
  eye(x, y, { w = 2, h = 3, dark = "#1c1430", iris = null, white = "#ffffff" } = {}) {
    const round = w >= 4 && h >= 4;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (round && (i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue;
      this.px(x + i, y + j, dark);
    }
    if (round) {
      if (iris) { this.px(x + w - 2, y + h - 2, iris); this.px(x + w - 3, y + h - 2, iris); }
      this.px(x + 1, y + 1, white); this.px(x + 1, y + 2, white); this.px(x + 2, y + 1, white);
    } else {
      if (iris && h >= 3) this.px(x + w - 1, y + h - 1, iris);
      this.px(x, y, white);
      if (w >= 3 && h >= 4) this.px(x + 1, y + 1, white);
    }
    return this;
  }
  /* A 4-point twinkle. */
  sparkle(x, y, c = "#ffffff", r = 2) {
    this.px(x, y, c);
    for (let i = 1; i <= r; i++) { this.px(x + i, y, c); this.px(x - i, y, c); this.px(x, y + i, c); this.px(x, y - i, c); }
    return this;
  }

  render() {
    const { w, h, parts } = this, N = w * h;
    const id = new Int16Array(N).fill(-1);
    const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N).fill(1);

    parts.forEach((pt, i) => {
      if (pt.erase) { for (let p = 0; p < N; p++) if (pt.mask[p]) id[p] = -1; return; }
      const field = pt.decal || pt.flat ? null : normals(pt.mask, w, h, pt.round);
      for (let p = 0; p < N; p++) {
        if (!pt.mask[p]) continue;
        if (pt.decal && id[p] < 0) continue;
        id[p] = i;
        if (field) { nx[p] = field[0][p]; ny[p] = field[1][p]; nz[p] = field[2][p]; }
      }
    });

    const tone = new Int8Array(N);
    for (let p = 0; p < N; p++) {
      const i = id[p]; if (i < 0) continue;
      const pt = parts[i];
      let t = pt.flat ? (pt.tone ?? 2) : toneFor(nx[p] * LIGHT[0] + ny[p] * LIGHT[1] + nz[p] * LIGHT[2]);
      t += pt.bias || 0;
      tone[p] = clamp(t, 0, 4);
    }
    /* cast shade: one tone darker just below / right of a part in front */
    const front = (p, q) => id[q] > id[p] && !parts[id[q]].decal && !parts[id[q]].noshadow;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (id[p] < 0 || parts[id[p]].decal || parts[id[p]].flat) continue;
      if ((y > 0 && front(p, p - w)) || (x > 0 && front(p, p - 1)) || (y > 1 && front(p, p - 2 * w))) tone[p] = Math.max(0, tone[p] - 1);
    }

    const out = new Uint8Array(N * 4);
    const set = (p, c, a = 255) => { out[p * 4] = c[0]; out[p * 4 + 1] = c[1]; out[p * 4 + 2] = c[2]; out[p * 4 + 3] = a; };
    for (let p = 0; p < N; p++) { const i = id[p]; if (i >= 0) set(p, parts[i].mat[tone[p]]); }

    /* contour where a part sits over one behind it */
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, i = id[p]; if (i < 0) continue;
      const pt = parts[i]; if (pt.decal ? !pt.edge : pt.edge === false) continue;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      if (nb.some((q) => q >= 0 && id[q] >= 0 && id[q] < i && parts[id[q]].mat !== pt.mat && !(pt.decal && id[q] !== i && parts[id[q]].decal))) {
        set(p, darken(pt.mat[0], 0.82));
      }
    }
    /* specular */
    parts.forEach((pt, i) => {
      if (!pt.shine) return;
      let best = -1, bp = -1;
      for (let p = 0; p < N; p++) if (id[p] === i) { const d = nx[p] * LIGHT[0] + ny[p] * LIGHT[1] + nz[p] * LIGHT[2]; if (d > best) { best = d; bp = p; } }
      if (bp >= 0) { set(bp, [255, 255, 255]); if (pt.shine > 1 && bp + 1 < N && id[bp + 1] === i) set(bp + 1, [255, 255, 255]); }
    });

    /* outer outline, tinted by what it wraps */
    const solid = new Uint8Array(N); for (let p = 0; p < N; p++) solid[p] = id[p] >= 0 ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (solid[p]) continue;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1].filter((q) => q >= 0 && solid[q]);
      if (!nb.length) continue;
      const deep = parts[id[nb[0]]].mat[0];
      set(p, darken(deep, parts[id[nb[0]]].outline ?? 0.55));
    }

    for (const [x, y, c] of this.marks) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y * w + x;
      if (c === null) { const i = id[p]; if (i >= 0) set(p, parts[i].mat[tone[p]]); continue; }
      set(p, toRgb(c));
    }
    return { width: w, height: h, data: out };
  }
}

/* Height from the silhouette: a dome that rises over `round` pixels from the edge, then
   surface normals from its slope. */
function normals(mask, w, h, round) {
  const N = w * h, d = new Float32Array(N), edge = [];
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const inside = x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    if (inside) continue;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const a = x + dx, b = y + dy; return a >= 0 && b >= 0 && a < w && b < h && mask[b * w + a]; });
    if (touches) edge.push(x, y);
  }
  let maxd = 0;
  for (let p = 0; p < N; p++) {
    if (!mask[p]) continue;
    const x = p % w, y = (p / w) | 0;
    let m = 1e9;
    for (let k = 0; k < edge.length; k += 2) { const dd = (x - edge[k]) ** 2 + (y - edge[k + 1]) ** 2; if (dd < m) m = dd; }
    d[p] = Math.sqrt(m) - 0.5;
    if (d[p] > maxd) maxd = d[p];
  }
  const Rr = round ?? Math.max(1.5, Math.min(maxd * 0.9, 9));
  const H = new Float32Array(N);
  for (let p = 0; p < N; p++) if (mask[p]) { const t = clamp(d[p] / Rr); H[p] = Rr * Math.sqrt(1 - (1 - t) ** 2); }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : H[y * w + x]);
  const fx = new Float32Array(N), fy = new Float32Array(N), fz = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    if (!mask[p]) continue;
    const x = p % w, y = (p / w) | 0;
    const gx = (at(x + 1, y) - at(x - 1, y)) / 2, gy = (at(x, y + 1) - at(x, y - 1)) / 2;
    const n = Math.hypot(gx, gy, 1);
    fx[p] = -gx / n; fy[p] = -gy / n; fz[p] = 1 / n;
  }
  return [fx, fy, fz];
}

/* Nearest-neighbour upscale and a grid of sprites — for looking at the work. */
export function sheet(imgs, { scale = 4, cols = 5, gap = 4, bg = [236, 240, 232] } = {}) {
  const cw = imgs[0].width * scale, ch = imgs[0].height * scale, rows = Math.ceil(imgs.length / cols);
  const W = cols * (cw + gap) + gap, H = rows * (ch + gap) + gap, data = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) { data[p * 4] = bg[0]; data[p * 4 + 1] = bg[1]; data[p * 4 + 2] = bg[2]; data[p * 4 + 3] = 255; }
  imgs.forEach((img, k) => {
    const ox = gap + (k % cols) * (cw + gap), oy = gap + Math.floor(k / cols) * (ch + gap);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const s = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4, a = img.data[s + 3] / 255;
      const d = ((oy + y) * W + ox + x) * 4;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(img.data[s + c] * a + data[d + c] * (1 - a));
    }
  });
  return { width: W, height: H, data };
}
