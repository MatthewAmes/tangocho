// Tests for tools/png.mjs — the PNG codec behind the sprite pipeline.
//
//   node tools/test-png.mjs
import { encodePng, decodePng, isPng } from "./png.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

t("encode then decode gives the same pixels", () => {
  const w = 20, h = 20, data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37) & 255;
  const buf = encodePng({ width: w, height: h, data });
  ok(isPng(buf));
  const back = decodePng(buf);
  eq([back.width, back.height], [20, 20]);
  ok(Buffer.from(back.data).equals(Buffer.from(data)));
});

t("something that is not a PNG is refused", () => {
  ok(!isPng(Buffer.from("not a png at all")));
  let threw = false;
  try { decodePng(Buffer.from("not a png at all")); } catch (e) { threw = true; }
  ok(threw);
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
