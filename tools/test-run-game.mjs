// Tests for Kotoba Quest: the rules of a run, and whole runs played by bots. The point of the
// bots: a player who understands the orders must do far better than one who doesn't, or the
// Japanese doesn't matter. Failing these means the game has stopped being what it is for.
//
//   node tools/test-run-game.mjs
import { W, H, WALL, QUADRANTS, newRun, step, startOrder, obeying, ordersAt, orderSeconds, applyUpgrade, upgradeChoices, worstWords, finalScore, kindOf } from "./run-game.mjs";
import { parseJa, rubyParts } from "./ja-markup.mjs";
import { ORDERS, PADS, UPGRADES, STAGES } from "../src/data/run-orders.js";
import { SPECIES } from "../src/data/quest-world.js";
import { SPRITES } from "../src/data/quest-sprites.js";
import { ARENAS, HERO } from "../src/data/quest-world-art.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

/* A small repeatable random generator, so a run plays the same every time. */
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const DT = 1 / 30;

t("furigana sits over the kanji, not the kana after it", () => {
  eq(rubyParts("寒い", "さむい"), [{ text: "寒", ruby: "さむ" }, { text: "い" }]);
  eq(parseJa("{赤|あか}へ！"), [{ word: "赤", reading: "あか" }, { text: "へ！" }]);
});
t("every order is complete: Japanese, a reading to speak, English, and every kanji has furigana", () => {
  const ids = new Set();
  for (const o of ORDERS) {
    ok(!ids.has(o.id), "duplicate " + o.id); ids.add(o.id);
    ok(o.j && o.say && o.en, o.id);
    for (const p of parseJa(o.j)) {
      if (p.text) ok(!/[一-鿿]/.test(p.text), `${o.id}: kanji with no reading`);
      if (p.word && /[一-鿿]/.test(p.word)) ok(p.reading, `${o.id}: no reading for ${p.word}`);
    }
    if (o.type === "pad") ok(PADS[o.group].some((p) => p.key === o.key), `${o.id}: no pad ${o.key}`);
  }
});
t("the art is all there", () => {
  for (const id of STAGES) ok(ARENAS[id], "arena " + id);
  for (const d of ["down", "up", "right"]) eq(HERO[d].length, 2, "hero " + d);
  for (const g of Object.values(PADS)) for (const p of g) if (p.species) ok(SPRITES[p.species], p.species);
  for (const id of Object.keys(SPECIES)) ok(SPRITES[id], id);
});
t("a run climbs: easy words first, harder ones only later", () => {
  const start = ordersAt(0).map((o) => o.id);
  ok(start.includes("red") && start.includes("right"));
  ok(!start.includes("dark") && !start.includes("cat"), "not at the start");
  ok(ordersAt(200).length === ORDERS.length, "everything by the end");
  for (const o of ORDERS) ok(o.from >= 0, o.id);
});
t("every pad can be reached in time, from anywhere", () => {
  const speed = newRun().hero.speed;
  const q = QUADRANTS;
  const worstPad = Math.max(...q.map((p) => Math.max(Math.hypot(p[0] - WALL, p[1] - WALL), Math.hypot(p[0] - (W - WALL), p[1] - (H - WALL)))));
  ok((worstPad - 26) / speed < orderSeconds(9999), `the furthest pad takes ${((worstPad - 26) / speed).toFixed(1)}s`);
});
t("obeying: being on the right pad counts, and the wrong one doesn't", () => {
  const rng = seeded(1), s = newRun();
  startOrder(s, ORDERS.find((o) => o.id === "red"), rng);
  const right = s.order.pads.find((p) => p.key === "red"), wrong = s.order.pads.find((p) => p.key !== "red");
  s.hero.x = right.x; s.hero.y = right.y; ok(obeying(s));
  s.hero.x = wrong.x; s.hero.y = wrong.y; ok(!obeying(s));
});
t("obeying: right/left, stop and run mean what they say", () => {
  const rng = seeded(2), s = newRun();
  startOrder(s, ORDERS.find((o) => o.id === "right"), rng);
  s.hero.x = W - 30; ok(obeying(s)); s.hero.x = 30; ok(!obeying(s));
  startOrder(s, ORDERS.find((o) => o.id === "stop"), rng);
  ok(obeying(s)); s.order.moved = 40; ok(!obeying(s));
  startOrder(s, ORDERS.find((o) => o.id === "run"), rng);
  ok(!obeying(s)); s.order.moved = 60; ok(obeying(s));
});
t("obeying blasts what's near you; missing costs real health and is remembered", () => {
  const rng = seeded(3);
  const a = newRun();
  a.t = 20; a.nextOrder = 999; a.nextSpawn = 999; a.nextBoss = 999;
  a.foes.push({ species: "samuneko", x: a.hero.x + 30, y: a.hero.y, hp: 50, maxHp: 50, speed: 0, touch: 1, r: 8, flash: 0, slowed: 0 });
  startOrder(a, ORDERS.find((o) => o.id === "right"), rng);
  a.hero.x = W - 40; a.foes[0].x = a.hero.x + 30; a.order.left = 0.01;
  step(a, { dx: 0, dy: 0 }, DT, rng);
  eq(a.foes.length, 0, "blasted"); eq(a.obeyed, 1);
  const b = newRun();
  b.t = 20; b.nextOrder = 999; b.nextSpawn = 999; b.nextBoss = 999;
  startOrder(b, ORDERS.find((o) => o.id === "right"), rng);
  b.hero.x = 30; b.order.left = 0.01;
  const before = b.hero.hp;
  step(b, { dx: 0, dy: 0 }, DT, rng);
  ok(b.hero.hp <= before - 15, "a big hit"); eq(b.missed.right, 1);
  eq(worstWords(b)[0].id, "right");
});
t("level-ups stop the clock until you choose, and every upgrade does something", () => {
  const s = newRun();
  s.pendingLevels = 1;
  const t0 = s.t; step(s, { dx: 0, dy: 0 }, 1); eq(s.t, t0, "paused");
  applyUpgrade(s, "shots"); eq(s.gun.shots, 2); eq(s.pendingLevels, 0);
  const u = upgradeChoices(seeded(4)); eq(u.length, 3); eq(new Set(u.map((x) => x.id)).size, 3);
  for (const up of UPGRADES) {
    const x = newRun(); x.hero.hp = 10;
    const before = JSON.stringify([x.gun, x.hero.speed, x.hero.hp]);
    applyUpgrade(x, up.id);
    ok(JSON.stringify([x.gun, x.hero.speed, x.hero.hp]) !== before, up.id);
  }
});
t("partners play differently", () => {
  eq(kindOf("kotodama"), "plain");
  const hot = newRun("atsuinu").gun, cold = newRun("samuneko").gun, bright = newRun("haredori").gun, plain = newRun("kotodama").gun;
  ok(hot.dmg > plain.dmg); ok(cold.slow); ok(bright.cooldown < plain.cooldown); ok(plain.pierce > 0);
});

/* ── whole runs ── */
function towards(h, x, y) { const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy); return d < 3 ? { dx: 0, dy: 0 } : { dx: dx / d, dy: dy / d }; }
function flee(s) {
  let dx = 0, dy = 0;
  for (const f of s.foes) { const d = Math.hypot(s.hero.x - f.x, s.hero.y - f.y) || 1; if (d < 60) { dx += (s.hero.x - f.x) / d / d; dy += (s.hero.y - f.y) / d / d; } }
  dx += (W / 2 - s.hero.x) * 0.0006; dy += (H / 2 - s.hero.y) * 0.0006;
  const m = Math.hypot(dx, dy);
  return m > 0.0001 ? { dx: dx / m, dy: dy / m } : { dx: 0, dy: 0 };
}
function understands(s) {
  const o = s.order, h = s.hero;
  if (!o) return flee(s);
  if (o.pads.length) { const p = o.pads.find((q) => q.key === o.key); return towards(h, p.x, p.y); }
  if (o.type === "half") return o.side === "right" ? towards(h, W - 50, h.y) : o.side === "left" ? towards(h, 50, h.y) : o.side === "up" ? towards(h, h.x, 50) : towards(h, h.x, H - 50);
  if (o.type === "still") return { dx: 0, dy: 0 };
  return towards(h, h.x < W / 2 ? W - 40 : 40, h.y);
}
function clueless(s) { return flee(s); }
function play(bot, seed, limit = 400) {
  const rng = seeded(seed), s = newRun();
  while (!s.over && s.t < limit) {
    step(s, bot(s), DT, rng);
    while (s.pendingLevels > 0) applyUpgrade(s, upgradeChoices(rng)[0].id);
    s.events.length = 0;
  }
  return s;
}
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
const good = seeds.map((n) => play(understands, n)), bad = seeds.map((n) => play(clueless, n));

t("understanding the Japanese is what keeps you alive", () => {
  const g = average(good.map((s) => s.t)), b = average(bad.map((s) => s.t));
  console.log(`        understands: ${g.toFixed(0)}s, score ${average(good.map(finalScore)).toFixed(0)}, obeyed ${average(good.map((s) => s.obeyed)).toFixed(0)}  |  clueless: ${b.toFixed(0)}s, score ${average(bad.map(finalScore)).toFixed(0)}`);
  ok(g > b * 1.8, `${g.toFixed(0)}s against ${b.toFixed(0)}s`);
  ok(average(good.map(finalScore)) > average(bad.map(finalScore)) * 3, "and it shows in the score");
});
t("a run is a few minutes at most: quick enough for one more", () => {
  const g = average(good.map((s) => s.t));
  ok(g > 60 && g < 330, g.toFixed(0) + "s");
});
t("not understanding kills you quickly, but not instantly", () => {
  const b = average(bad.map((s) => s.t));
  ok(b > 15 && b < 90, b.toFixed(0) + "s");
});
t("good runs meet bosses and new places; catching one unlocks a partner", () => {
  ok(good.some((s) => s.caught.length > 0), "someone beat a boss");
  ok(good.some((s) => s.stage >= 1), "someone reached the second place");
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
