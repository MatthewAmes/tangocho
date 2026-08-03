// Minimal animated GIF89a encoder — palette-indexed frames, LZW compressed.
//
// Written by hand because the app has no dependency install step and shouldn't grow one
// for this. Pixel art is the ideal case for GIF: a handful of flat colours, tiny palette,
// and LZW compresses runs of identical pixels extremely well.
//
// Frames are 2D arrays of palette indices. Index 0 is treated as transparent.

function lzwEncode(minCodeSize, pixels) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map();
  let next = eoi + 1;
  const reset = () => { dict = new Map(); next = eoi + 1; codeSize = minCodeSize + 1; };

  const bytes = [];
  let acc = 0, bits = 0;
  const emit = (code) => {
    acc |= code << bits; bits += codeSize;
    while (bits >= 8) { bytes.push(acc & 0xff); acc >>= 8; bits -= 8; }
  };

  emit(clear); reset();
  let prefixCode = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = prefixCode * 4096 + k;
    if (dict.has(key)) { prefixCode = dict.get(key); continue; }
    emit(prefixCode);
    dict.set(key, next++);
    if (next - 1 >= (1 << codeSize) && codeSize < 12) codeSize++;
    else if (next >= 4096) { emit(clear); reset(); }
    prefixCode = k;
  }
  emit(prefixCode);
  emit(eoi);
  if (bits > 0) bytes.push(acc & 0xff);
  return bytes;
}

function blocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

/**
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number,number]>} palette  index 0 is transparent
 * @param {number[][]} frames  each frame: w*h palette indices
 * @param {number} delayMs
 */
export function encodeGif(w, h, palette, frames, delayMs = 200) {
  let bits = 1;
  while ((1 << bits) < palette.length) bits++;
  bits = Math.max(2, bits);
  const size = 1 << bits;

  const b = [];
  const push = (...xs) => b.push(...xs);
  const short = (n) => push(n & 0xff, (n >> 8) & 0xff);

  push(...[..."GIF89a"].map((c) => c.charCodeAt(0)));
  short(w); short(h);
  push(0xf0 | (bits - 1), 0, 0);                       // global colour table, sorted flag off
  for (let i = 0; i < size; i++) {
    const c = palette[i] || [0, 0, 0];
    push(c[0], c[1], c[2]);
  }
  // NETSCAPE loop-forever extension
  push(0x21, 0xff, 0x0b, ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);

  const delay = Math.round(delayMs / 10);
  for (const frame of frames) {
    push(0x21, 0xf9, 0x04, 0x09);                      // graphic control: restore-to-bg, transparency on
    short(delay);
    push(0, 0);                                        // transparent index 0, block terminator
    push(0x2c); short(0); short(0); short(w); short(h); push(0);
    const min = Math.max(2, bits);
    push(min, ...blocks(lzwEncode(min, frame)));
  }
  push(0x3b);
  return Buffer.from(b);
}
