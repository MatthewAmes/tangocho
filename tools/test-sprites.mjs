// Tests for Kotoba Quest's pixel art: the roster, the frame, and the generated module.
//
//   node tools/test-sprites.mjs
import { SPECIES } from "../src/data/quest-world.js";
import { SPRITES } from "../src/data/quest-sprites.js";
import { DESIGNS, draw } from "./sprite-designs.mjs";
import { decodePng } from "./png.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const ids = Object.keys(SPECIES);

t("every creature has a design, and every design a creature", () => {
  eq(Object.keys(DESIGNS).sort(), [...ids].sort());
});

t("every sprite fills its frame without running off the edge", () => {
  for (const id of ids) {
    const { width: w, height: h, data } = draw(id);
    eq([w, h], [48, 48], id);
    let solid = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!data[(y * w + x) * 4 + 3]) continue;
      solid++;
      ok(x > 0 && y > 0 && x < w - 1 && y < h - 1, `${id} touches the frame at ${x},${y}`);
    }
    ok(solid > 400 && solid < 1500, `${id} has ${solid} solid pixels`);
  }
});

t("no half-transparent pixels: pixel art is on or off", () => {
  for (const id of ids) {
    const { data } = draw(id);
    for (let i = 3; i < data.length; i += 4) ok(data[i] === 0 || data[i] === 255, `${id} alpha ${data[i]}`);
  }
});

t("the module the game imports matches the designs (run tools/make-sprites.mjs)", () => {
  eq(Object.keys(SPRITES).sort(), [...ids].sort());
  for (const id of ids) {
    const m = SPRITES[id].match(/^data:image\/png;base64,(.+)$/);
    ok(m, id + " is not a PNG data URI");
    const shipped = decodePng(Buffer.from(m[1], "base64"));
    ok(Buffer.from(shipped.data).equals(Buffer.from(draw(id).data)), id + " is out of date");
  }
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
