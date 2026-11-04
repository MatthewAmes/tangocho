/* ── Kotoba Quest: the rules of a run ──
   (Matthew, 2026-11-04, on the story version: "boring ah game", "the reading is boring".)
   Monsters swarm you and your partner fires by itself; you only move. Every few seconds
   Kotodama shouts one short order in Japanese, and you have seconds to obey. Understanding is
   what keeps you alive, which is why nothing here is typed or quizzed.

   Pure and driven by step(), with randomness passed in, so whole runs can be played in tests
   (tools/test-run-game.mjs). src/tabs/Quest.jsx only draws what this says and reads s.events. */
import { ORDERS, PADS, UPGRADES, STAGES } from "../src/data/run-orders.js";
import { SPECIES } from "../src/data/quest-world.js";

export const W = 256, H = 288, WALL = 18;
export const QUADRANTS = [[70, 82], [186, 82], [70, 206], [186, 206]];
const PAD_R = 26;
export const STAGE_SECONDS = 60;
const FIRST_ORDER = 5, FIRST_BOSS = 45, BOSS_EVERY = 60;

export const orderSeconds = (t) => Math.max(2.8, 3.8 - t * 0.004);
export const orderGap = (t) => Math.max(5, 9 - t * 0.02);
export const spawnEvery = (t) => Math.max(0.2, 1 - t * 0.006);
export const foeHp = (t) => 5 + t * 0.1;
export const foeSpeed = (t) => Math.min(58, 24 + t * 0.12);
export const missDamage = (maxHp) => Math.round(maxHp * 0.3);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const shuffled = (list, rng) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
const COMMON = Object.keys(SPECIES).filter((id) => id !== "kotodama" && !SPECIES[id].boss);

/* What your partner's kind changes about your shots. */
const PERKS = {
  plain: { pierce: 1 },
  cold: { slow: true },
  hot: { dmg: 8, cooldown: 0.66 },
  bright: { cooldown: 0.42 },
};
export const kindOf = (species) => (SPECIES[species] && SPECIES[species].kind) || "plain";

export function newRun(partner = "kotodama") {
  const kind = kindOf(partner), p = PERKS[kind] || {};
  return {
    t: 0, over: false, partner, kind,
    hero: { x: W / 2, y: H / 2, hp: 60, maxHp: 60, speed: 82, inv: 0, dir: "down", walk: 0, left: false },
    gun: { dmg: p.dmg || 6, cooldown: p.cooldown || 0.55, shots: 1, size: 2, pierce: p.pierce || 0, slow: !!p.slow, pull: 22 },
    fire: 0.3, foes: [], bolts: [], gems: [], order: null, nextOrder: FIRST_ORDER, lastOrder: null,
    nextSpawn: 0.5, nextBoss: FIRST_BOSS, level: 1, xp: 0, xpNext: 4, pendingLevels: 0,
    score: 0, streak: 0, kills: 0, obeyed: 0, missed: {}, caught: [], stage: 0, events: [],
  };
}

/* ── orders ── */
export function ordersAt(t) { return ORDERS.filter((o) => o.from <= t); }

export function startOrder(s, order, rng) {
  const o = { ...order, left: 0, dur: orderSeconds(s.t), pads: [], moved: 0 };
  if (order.type === "pad") {
    const others = shuffled(PADS[order.group].filter((p) => p.key !== order.key), rng).slice(0, 3);
    const answer = PADS[order.group].find((p) => p.key === order.key);
    const spots = shuffled(QUADRANTS, rng);
    o.pads = shuffled([answer, ...others], rng).map((p, i) => ({ ...p, x: spots[i][0], y: spots[i][1], r: PAD_R }));
  } else if (order.type === "size") {
    const spots = shuffled(QUADRANTS, rng);
    o.pads = [{ key: "big", fill: "#7fb0d8", x: spots[0][0], y: spots[0][1], r: 34 }, { key: "small", fill: "#7fb0d8", x: spots[1][0], y: spots[1][1], r: 13 }];
  } else if (order.type === "still" || order.type === "move") {
    o.dur = 2.4;
  }
  o.left = o.dur;
  s.order = o;
  s.lastOrder = order.id;
  s.events.push({ type: "order", order: o });
}

export function obeying(s) {
  const o = s.order, { x, y } = s.hero;
  if (!o) return false;
  if (o.pads.length) { const p = o.pads.find((q) => q.key === o.key); return Math.hypot(x - p.x, y - p.y) <= p.r + 4; }
  if (o.type === "half") return o.side === "right" ? x > W / 2 : o.side === "left" ? x < W / 2 : o.side === "up" ? y < H / 2 : y > H / 2;
  if (o.type === "still") return o.moved <= 10;
  if (o.type === "move") return o.moved >= 45;
  return false;
}

function resolveOrder(s) {
  const o = s.order, ok = obeying(s);
  s.order = null;
  s.nextOrder = s.t + orderGap(s.t);
  if (ok) {
    s.obeyed++; s.streak++;
    s.score += 100 * s.streak;
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 4);
    for (const f of s.foes) if (Math.hypot(f.x - s.hero.x, f.y - s.hero.y) <= 95) hurt(s, f, f.boss ? 30 : 9999);
    s.events.push({ type: "obeyed", order: o, x: s.hero.x, y: s.hero.y });
  } else {
    s.streak = 0;
    s.missed[o.id] = (s.missed[o.id] || 0) + 1;
    s.hero.hp -= missDamage(s.hero.maxHp);
    s.events.push({ type: "missed", order: o });
  }
}

/* ── fighting ── */
function hurt(s, f, dmg) {
  if (f.dead) return;
  f.hp -= dmg; f.flash = 0.08;
  if (s.gun.slow) f.slowed = 1.2;
  if (f.hp > 0) return;
  f.dead = true; s.kills++;
  s.score += f.boss ? 500 : 10;
  const gems = f.boss ? 10 : 1;
  for (let i = 0; i < gems; i++) s.gems.push({ x: f.x + (i ? (i % 5 - 2) * 8 : 0), y: f.y + (i ? (i % 3 - 1) * 8 : 0) });
  s.events.push({ type: "kill", x: f.x, y: f.y, boss: !!f.boss });
  if (f.boss && !s.caught.includes(f.species)) { s.caught.push(f.species); s.events.push({ type: "caught", species: f.species }); }
}

function spawn(s, rng, boss) {
  const side = Math.floor(rng() * 4), along = rng();
  const [x, y] = side === 0 ? [WALL + along * (W - 2 * WALL), WALL] : side === 1 ? [WALL + along * (W - 2 * WALL), H - WALL]
    : side === 2 ? [WALL, WALL + along * (H - 2 * WALL)] : [W - WALL, WALL + along * (H - 2 * WALL)];
  const species = pick(COMMON, rng);
  if (boss) {
    s.foes.push({ species, x, y, hp: 90 + s.t * 1.2, maxHp: 90 + s.t * 1.2, speed: 32, touch: 12, r: 16, boss: true, flash: 0, slowed: 0 });
    s.events.push({ type: "boss", species });
  } else {
    s.foes.push({ species, x, y, hp: foeHp(s.t), maxHp: foeHp(s.t), speed: foeSpeed(s.t) * (0.8 + rng() * 0.4), touch: 6, r: 8, flash: 0, slowed: 0 });
  }
}

export function applyUpgrade(s, id) {
  const g = s.gun, h = s.hero;
  if (id === "speed") h.speed *= 1.14;
  else if (id === "power") g.dmg *= 1.3;
  else if (id === "rapid") g.cooldown = Math.max(0.12, g.cooldown * 0.82);
  else if (id === "shots") g.shots += 1;
  else if (id === "big") { g.size += 1; g.pierce += 1; }
  else if (id === "pull") g.pull *= 1.6;
  else if (id === "heal") h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.5);
  s.pendingLevels = Math.max(0, s.pendingLevels - 1);
}
export const upgradeChoices = (rng) => shuffled(UPGRADES, rng).slice(0, 3);

/* ── one moment ── input is {dx, dy}, each -1 to 1. */
export function step(s, input, dt, rng = Math.random) {
  if (s.over || s.pendingLevels > 0) return s;
  s.t += dt;
  const h = s.hero;
  const mag = Math.hypot(input.dx, input.dy);
  if (mag > 0.01) {
    const k = Math.min(1, mag) / mag, nx = clamp(h.x + input.dx * k * h.speed * dt, WALL, W - WALL), ny = clamp(h.y + input.dy * k * h.speed * dt, WALL, H - WALL);
    const moved = Math.hypot(nx - h.x, ny - h.y);
    h.walk += moved;
    if (s.order) s.order.moved += moved;
    h.x = nx; h.y = ny;
    if (Math.abs(input.dx) >= Math.abs(input.dy)) { h.dir = "right"; h.left = input.dx < 0; } else { h.dir = input.dy < 0 ? "up" : "down"; h.left = false; }
  }
  h.inv = Math.max(0, h.inv - dt);

  /* the place changes every minute */
  const stage = Math.min(STAGES.length - 1, Math.floor(s.t / STAGE_SECONDS));
  if (stage !== s.stage) { s.stage = stage; s.events.push({ type: "stage", stage }); }

  /* foes arrive */
  s.nextSpawn -= dt;
  while (s.nextSpawn <= 0) { spawn(s, rng); s.nextSpawn += spawnEvery(s.t); }
  if (s.t >= s.nextBoss) { spawn(s, rng, true); s.nextBoss += BOSS_EVERY; }

  /* orders */
  if (s.order) { s.order.left -= dt; if (s.order.left <= 0) resolveOrder(s); }
  else if (s.t >= s.nextOrder) {
    const pool = ordersAt(s.t).filter((o) => o.id !== s.lastOrder);
    startOrder(s, pick(pool, rng), rng);
  }

  /* foes chase and bite */
  for (const f of s.foes) {
    f.flash = Math.max(0, f.flash - dt); f.slowed = Math.max(0, f.slowed - dt);
    const dx = h.x - f.x, dy = h.y - f.y, d = Math.hypot(dx, dy) || 1, v = f.speed * (f.slowed > 0 ? 0.5 : 1);
    f.x += (dx / d) * v * dt; f.y += (dy / d) * v * dt; f.left = dx < 0;
    if (d < f.r + 6 && h.inv <= 0) {
      h.hp -= f.touch; h.inv = 0.55;
      s.events.push({ type: "hit", x: h.x, y: h.y });
    }
  }

  /* your partner fires at whoever is closest */
  s.fire -= dt;
  if (s.fire <= 0 && s.foes.length) {
    const near = s.foes.reduce((a, f) => (Math.hypot(f.x - h.x, f.y - h.y) < Math.hypot(a.x - h.x, a.y - h.y) ? f : a));
    const base = Math.atan2(near.y - h.y, near.x - h.x);
    for (let i = 0; i < s.gun.shots; i++) {
      const a = base + (i - (s.gun.shots - 1) / 2) * 0.28;
      s.bolts.push({ x: h.x, y: h.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 1.1, pierce: s.gun.pierce, hits: [] });
    }
    s.fire = s.gun.cooldown;
  }
  for (const b of s.bolts) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const f of s.foes) {
      if (f.dead || b.life <= 0 || b.hits.includes(f)) continue;
      if (Math.hypot(f.x - b.x, f.y - b.y) <= f.r + s.gun.size) {
        hurt(s, f, s.gun.dmg); b.hits.push(f);
        if (b.pierce-- <= 0) b.life = 0;
      }
    }
  }
  s.bolts = s.bolts.filter((b) => b.life > 0);
  s.foes = s.foes.filter((f) => !f.dead);

  /* gems fly to you */
  for (const g of s.gems) {
    const d = Math.hypot(g.x - h.x, g.y - h.y) || 1;
    if (d < s.gun.pull) { g.x += ((h.x - g.x) / d) * 160 * dt; g.y += ((h.y - g.y) / d) * 160 * dt; }
    if (d < 8) {
      g.got = true; s.xp++;
      if (s.xp >= s.xpNext) { s.xp -= s.xpNext; s.level++; s.xpNext = 3 + s.level * 2; s.pendingLevels++; s.events.push({ type: "level", level: s.level }); }
    }
  }
  s.gems = s.gems.filter((g) => !g.got);

  if (h.hp <= 0) { h.hp = 0; s.over = true; s.events.push({ type: "over" }); }
  return s;
}

/* The words that got you, worst first. */
export function worstWords(s, n = 3) {
  return Object.entries(s.missed).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([id, times]) => ({ ...ORDERS.find((o) => o.id === id), times }));
}
export const finalScore = (s) => Math.floor(s.score + s.t * 5);
