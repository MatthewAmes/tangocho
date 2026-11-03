/* ── a small PNG codec, and the two edits sprites need ──
   Node ships zlib, which is all PNG needs, so the sprite pipeline has no dependency to
   install. Handles 8-bit RGB, RGBA, grey, grey+alpha and palette images, non-interlaced —
   what image models return. Everything works on {width, height, data: RGBA Uint8Array}. */
import zlib from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export const isPng = (buf) => buf.length > 8 && buf.subarray(0, 8).equals(SIG);

export function decodePng(buf) {
  if (!isPng(buf)) throw new Error("not a PNG");
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error("unsupported PNG colour type " + type);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0, b = up ? up[i] : 0, c = up && i >= ch ? up[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4;
    if (type === 6) { data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = px[s + 3]; }
    else if (type === 2) { data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = 255; }
    else if (type === 0) { data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = 255; }
    else if (type === 4) { data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = px[s + 1]; }
    else { const k = px[s]; data[d] = palette[k * 3]; data[d + 1] = palette[k * 3 + 1]; data[d + 2] = palette[k * 3 + 2]; data[d + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { width: w, height: h, data };
}

export function encodePng({ width, height, data }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const chunk = (kind, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const kb = Buffer.from(kind, "latin1"), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([kb, body])));
    return Buffer.concat([len, kb, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* Remove a flat background. The colour is read from the image's border (the most common
   edge colour), then flood-filled inward from every edge pixel that matches — so a white
   belly inside a white-background sprite survives, because the outline walls it off.
   Pixels just past the threshold get partial alpha, which keeps the edge from looking cut. */
export function removeBackground(img, tol = 60, soft = 40) {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(data);
  const counts = new Map();
  const key = (i) => (data[i] >> 4) + "," + (data[i + 1] >> 4) + "," + (data[i + 2] >> 4);
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const k = key((y * w + x) * 4); counts.set(k, (counts.get(k) || 0) + 1); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const k = key((y * w + x) * 4); counts.set(k, (counts.get(k) || 0) + 1); }
  const bgc = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map((v) => +v * 16 + 8);
  const dist = (i) => Math.hypot(data[i] - bgc[0], data[i + 1] - bgc[1], data[i + 2] - bgc[2]);
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    const d = dist(p * 4);
    if (d > tol + soft) continue;
    seen[p] = 1;
    out[p * 4 + 3] = d <= tol ? 0 : Math.round(255 * (d - tol) / soft);
    if (d > tol) continue;                                   // a soft edge pixel: do not spread past it
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
  }
  return { width: w, height: h, data: out, background: bgc };
}

/* Crop to what is visible, then scale into a size×size square (aspect kept, centred) by
   averaging — premultiplied, so transparent pixels do not bleed a dark fringe. */
export function fitSquare(img, size, pad = 0.06) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error("nothing left after removing the background");
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const inner = Math.round(size * (1 - 2 * pad));
  const scale = inner / Math.max(cw, chh);
  const tw = Math.max(1, Math.round(cw * scale)), th = Math.max(1, Math.round(chh * scale));
  const ox = Math.floor((size - tw) / 2), oy = size - Math.round(size * pad) - th;   // standing on the bottom
  const out = new Uint8Array(size * size * 4);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const sx0 = x0 + tx / scale, sy0 = y0 + ty / scale, sx1 = x0 + (tx + 1) / scale, sy1 = y0 + (ty + 1) / scale;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4, al = data[i + 3] / 255;
      r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
    }
    const d = ((oy + ty) * size + ox + tx) * 4;
    if (a > 0) { out[d] = r / a; out[d + 1] = g / a; out[d + 2] = b / a; }
    out[d + 3] = n ? Math.round((a / n) * 255) : 0;
  }
  return { width: size, height: size, data: out };
}
