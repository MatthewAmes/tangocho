// Tests for tools/quest.mjs and the world in src/data/quest-world.js.
//
//   node tools/test-quest.mjs
import { parseMap, tileAt, step, reachable, arrival, statsOf, gainXp, xpToNext, damageFor, counterFor,
         catchChance, battleWords, hintFor, normaliseSave, freshSave, wakeAtShrine, wordPower, newMon,
         MAP_W, MAP_H, BLOCKING } from "./quest.mjs";
import { SPECIES, REGIONS } from "../src/data/quest-world.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const never = () => 0.99, always = () => 0;

/* ── the world is playable ── */
REGIONS.forEach((r, i) => {
  t(`region ${i + 1} (${r.name}): map is ${MAP_W}x${MAP_H} and walled`, () => {
    eq(r.map.length, MAP_H);
    r.map.forEach((row, y) => eq(Array.from(row).length, MAP_W, "row " + y));
    for (let x = 0; x < MAP_W; x++) ok("#<>".includes(r.map[0][x]) && "#<>".includes(r.map[MAP_H - 1][x]), "open edge at x " + x);
  });
  t(`region ${i + 1}: shrine, guardian, sign and grass are all reachable`, () => {
    const m = parseMap(r.map);
    const from = i === 0 ? m.start : arrival(m, "west");
    ok(from && !BLOCKING.has(tileAt(m, from.x, from.y)), "arrival is standable");
    const seen = reachable(m, from);
    const touches = (ch) => r.map.some((row, y) => Array.from(row).some((c, x) => c === ch
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + "," + (y + dy)))));
    ok(touches("S"), "shrine"); ok(touches("G"), "guardian"); ok(touches("n"), "sign");
    ok(r.map.some((row, y) => Array.from(row).some((c, x) => c === "," && seen.has(x + "," + y))), "tall grass");
    if (m.west) ok(touches("<"), "west gate");
    if (i < REGIONS.length - 1) {
      ok(m.east, "an east gate");
      ok(reachable(m, from, true).has((m.east.x - 1) + "," + m.east.y), "east gate once the guardian is beaten");
    }
  });
  t(`region ${i + 1}: wild and guardian creatures exist`, () => {
    for (const s of r.wild) ok(SPECIES[s], s);
    for (const [s] of r.guardian.team) ok(SPECIES[s], s);
  });
});

t("every region after the first has a way back west, the first has a start", () => {
  ok(parseMap(REGIONS[0].map).start);
  REGIONS.slice(1).forEach((r) => ok(parseMap(r.map).west, r.name));
});

/* ── walking ── */
const M = parseMap([
  "#####",
  "#.,G>",
  "#S.n#",
  "<...#",
  "#####",
]);
t("walls block, grass can start a fight, bumps are events", () => {
  eq(step({ x: 1, y: 1 }, "up", M), { x: 1, y: 1, event: null });
  eq(step({ x: 1, y: 1 }, "right", M, { rng: always }), { x: 2, y: 1, event: { type: "encounter" } });
  eq(step({ x: 1, y: 1 }, "right", M, { rng: never }), { x: 2, y: 1, event: null });
  eq(step({ x: 2, y: 1 }, "right", M).event, { type: "guardian" });
  eq(step({ x: 1, y: 1 }, "down", M).event, { type: "shrine" });
  eq(step({ x: 2, y: 2 }, "right", M).event, { type: "sign" });
  eq(step({ x: 1, y: 3 }, "left", M).event, { type: "region", to: -1 });
});
t("the east gate is locked until the guardian is beaten, then the guardian's tile is path", () => {
  eq(step({ x: 2, y: 1 }, "right", M, { cleared: true }), { x: 3, y: 1, event: null });
  eq(step({ x: 3, y: 1 }, "right", M).event, { type: "locked" });
  eq(step({ x: 3, y: 1 }, "right", M, { cleared: true }).event, { type: "region", to: 1 });
});

/* ── fighting ── */
t("stats grow with level; a level needs more experience each time", () => {
  ok(statsOf(4).maxHp > statsOf(3).maxHp && statsOf(4).atk > statsOf(3).atk);
  ok(xpToNext(5) > xpToNext(4));
  eq(statsOf(3, 2).atk, statsOf(3).atk + 2, "word power adds attack");
});
t("experience can carry several levels, and each level heals what it adds", () => {
  const { mon, levelled } = gainXp({ ...newMon("kotodama", 3), hp: 10 }, xpToNext(3) + xpToNext(4) + 1);
  eq([mon.level, mon.xp, levelled], [5, 1, 2]);
  eq(mon.hp, 10 + (statsOf(5).maxHp - statsOf(3).maxHp));
});
t("an unhinted answer hits harder than a hinted one; a fast one is a critical", () => {
  const mid = () => 0.5;
  const plain = damageFor({ atk: 20, rng: mid });
  ok(damageFor({ atk: 20, hinted: true, rng: mid }) < plain);
  ok(damageFor({ atk: 20, fast: true, rng: mid }) > plain);
  ok(counterFor({ level: 3 }, mid) > 0);
});
t("a battle against a same-level wild creature takes a few right answers, not one or ten", () => {
  const foe = statsOf(3).maxHp, hit = damageFor({ atk: statsOf(3).atk, rng: () => 0.5 });
  const n = Math.ceil(foe / hit);
  ok(n >= 2 && n <= 4, n + " answers");
  const misses = Math.ceil(statsOf(3).maxHp / counterFor({ level: 3 }, () => 0.5));
  ok(misses >= 3, "you survive at least two misses, took " + misses);
});
t("catching: impossible above half health, certain at a quarter", () => {
  eq(catchChance(30, 40), 0);
  eq(catchChance(10, 40), 1);
  ok(catchChance(15, 40) > 0 && catchChance(15, 40) < 1);
});

/* ── words ── */
const NOW = Date.UTC(2026, 10, 3);
const w = (id, sec, extra = {}) => ({ id, sec, term: id, reading: "よみ", meaning: "m", ...extra });
t("battle words: the region's act only, due production first, never-met last and at most three", () => {
  const cards = [
    w("new1", "7-1"), w("new2", "7-1"), w("new3", "7-2"), w("new4", "7-3"),
    w("read", "7-1", { seen: 3, correct: 3 }),
    w("due", "7-2", { seen: 3, rseen: 2, rcorrect: 1, rfsrs: { S: 2, due: NOW - 1 } }),
    w("other", "8-1", { seen: 3, rseen: 2, rfsrs: { S: 2, due: NOW - 1 } }),
    w("noread", "7-1", { reading: "" }),
  ];
  const got = battleWords(cards, 7, 8, { now: NOW }).map((c) => c.id);
  eq(got[0], "due"); eq(got[1], "read");
  ok(!got.includes("other") && !got.includes("noread"));
  eq(got.filter((id) => id.startsWith("new")).length, 3);
});
t("battle words: recently asked words are held back", () => {
  const cards = [w("a", "7-1", { seen: 1 }), w("b", "7-1", { seen: 1 })];
  eq(battleWords(cards, 7, 8, { now: NOW, recent: new Set(["a"]) }).map((c) => c.id), ["b"]);
});
t("hint: first kana, then a blank per kana", () => {
  eq(hintFor("かんしゃ"), "か＿＿＿");
  eq(hintFor(""), "");
});
t("word power: one attack for every five words he can say", () => {
  const can = { rfsrs: { S: 10 } };
  eq(wordPower([...Array(11)].map(() => ({ ...can }))), 2);
  eq(wordPower([{ fsrs: { S: 99 } }]), 0, "recognising is not saying");
});

/* ── saving ── */
t("a missing or broken save becomes a playable new game", () => {
  const s = normaliseSave(null, REGIONS);
  eq([s.region, s.team.length, s.team[0].species], [0, 1, "kotodama"]);
  const start = parseMap(REGIONS[0].map).start;
  eq([s.x, s.y], [start.x, start.y]);
  const odd = normaliseSave({ region: 99, team: [], lead: 7, x: 0, y: 0 }, REGIONS);
  eq([odd.region, odd.lead, odd.team.length], [0, 0, 1]);
  ok(!BLOCKING.has(tileAt(parseMap(REGIONS[0].map), odd.x, odd.y)), "not inside a wall");
});
t("losing wakes you beside the last shrine with everyone healed", () => {
  const save = { ...freshSave(), region: 2, rest: { region: 1 }, team: [{ ...newMon("kotodama", 4), hp: 0 }] };
  const woke = wakeAtShrine(save, REGIONS);
  eq(woke.region, 1);
  eq(woke.team[0].hp, statsOf(4).maxHp);
  const m = parseMap(REGIONS[1].map);
  ok(Math.abs(woke.x - m.shrine.x) + Math.abs(woke.y - m.shrine.y) === 1, "next to the shrine");
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
