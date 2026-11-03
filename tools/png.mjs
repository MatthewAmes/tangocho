/* ── a small PNG codec ──
   Node ships zlib, which is all PNG needs, so the sprite pipeline has no dependency to
   install. Handles 8-bit RGB, RGBA, grey, grey+alpha and palette images, non-interlaced.
   Everything works on {width, height, data: RGBA Uint8Array}. */
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

/* Pixel art has few colours, so it is written with a palette whenever it fits in one: a
   fraction of the size, which matters because every image ships inside the page. */
export function encodePng({ width, height, data }) {
  const chunk = (kind, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const kb = Buffer.from(kind, "latin1"), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([kb, body])));
    return Buffer.concat([len, kb, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8;
  const seen = new Map(), N = width * height;
  for (let i = 0; i < N && seen.size <= 256; i++) {
    const p = i * 4, a = data[p + 3], k = a === 0 ? 0 : ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | a) >>> 0;
    if (!seen.has(k)) seen.set(k, seen.size);
  }
  if (seen.size <= 256) {
    ihdr[9] = 3;
    const raw = Buffer.alloc(height * (width + 1));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4, a = data[p + 3], k = a === 0 ? 0 : ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | a) >>> 0;
      raw[y * (width + 1) + 1 + x] = seen.get(k);
    }
    const plte = Buffer.alloc(seen.size * 3), trns = Buffer.alloc(seen.size);
    for (const [k, i] of seen) { plte[i * 3] = k >>> 24; plte[i * 3 + 1] = (k >>> 16) & 255; plte[i * 3 + 2] = (k >>> 8) & 255; trns[i] = k & 255; }
    return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("tRNS", trns), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  }
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
