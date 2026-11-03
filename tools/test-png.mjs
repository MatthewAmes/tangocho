// Tests for tools/png.mjs — the sprite pipeline's PNG codec and edits.
//
//   node tools/test-png.mjs
import { encodePng, decodePng, removeBackground, fitSquare, isPng } from "./png.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

/* A 20x20 magenta field with a white square ringed in black: white inside, like a belly. */
function sprite() {
  const w = 20, h = 20, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ring = x >= 5 && x <= 14 && y >= 5 && y <= 14;
    const inside = x >= 6 && x <= 13 && y >= 6 && y <= 13;
    const c = inside ? [255, 255, 255] : ring ? [0, 0, 0] : [255, 0, 255];
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

t("encode then decode gives the same pixels", () => {
  const img = sprite();
  const buf = encodePng(img);
  ok(isPng(buf));
  const back = decodePng(buf);
  eq([back.width, back.height], [20, 20]);
  ok(Buffer.from(back.data).equals(Buffer.from(img.data)));
});

t("the background goes, what the outline walls in stays", () => {
  const cut = removeBackground(sprite());
  eq(cut.data[3], 0, "corner is transparent");
  eq(cut.data[(10 * 20 + 10) * 4 + 3], 255, "the white inside is kept");
  eq(cut.data[(5 * 20 + 5) * 4 + 3], 255, "the outline is kept");
  eq(cut.background, [248, 8, 248]);
});

t("fit: cropped, scaled into the square, standing on the bottom", () => {
  const out = fitSquare(removeBackground(sprite()), 40, 0.1);
  eq([out.width, out.height], [40, 40]);
  eq(out.data[3], 0, "top-left empty");
  ok(out.data[(35 * 40 + 20) * 4 + 3] > 200, "the sprite reaches the bottom margin");
  eq(out.data[(37 * 40 + 20) * 4 + 3], 0, "and no further");
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
