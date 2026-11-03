/* ── Kotoba Quest: the rules ──
   The pure half of the adventure (src/tabs/Quest.jsx draws it; src/data/quest-world.js holds
   the maps and creatures, src/data/quest-story.js the story). Nothing here touches storage,
   React or the clock except through its arguments, so every rule is testable —
   tools/test-quest.mjs. */
import { SPECIES } from "../src/data/quest-world.js";

export const MAP_W = 16, MAP_H = 11;
export const BLOCKING = new Set(["#", "~", "H", "S", "G", "n"]);
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const ENCOUNTER_RATE = 0.16;

/* ── the map ── */
export function parseMap(rows) {
  const find = (ch) => {
    for (let y = 0; y < rows.length; y++) { const x = rows[y].indexOf(ch); if (x >= 0) return { x, y }; }
    return null;
  };
  return { rows, start: find("@"), east: find(">"), west: find("<"), guardian: find("G"), shrine: find("S") };
}

export function tileAt(map, x, y) {
  const row = map.rows[y];
  return row && x >= 0 && x < row.length ? row[x] : "#";
}

/* Where you stand on arriving in a region: from the west you step out of the west gate,
   coming back from the east you stand where the guardian used to be. */
export function arrival(map, from) {
  if (from === "east" && map.east) return { x: map.east.x - 1, y: map.east.y };
  if (map.west) return { x: map.west.x + 1, y: map.west.y };
  return map.start || { x: 1, y: 1 };
}

/* One step. Returns the new position and what happened, if anything:
     encounter — tall grass, and the dice said so
     guardian / building / shrine / sign — you bumped into it
     region — you walked through a gate
   A beaten guardian is gone: its tile is path, and the gate behind it opens. */
export function step(state, dir, map, opts = {}) {
  const rng = opts.rng || Math.random;
  const [dx, dy] = DIRS[dir] || [0, 0];
  const x = state.x + dx, y = state.y + dy;
  const cleared = !!opts.cleared;
  let t = tileAt(map, x, y);
  if (t === "G" && cleared) t = "=";
  if (t === ">") return cleared ? { x: state.x, y: state.y, event: { type: "region", to: +1 } }
                                : { x: state.x, y: state.y, event: { type: "locked" } };
  if (t === "<") return { x: state.x, y: state.y, event: { type: "region", to: -1 } };
  if (t === "G") return { x: state.x, y: state.y, event: { type: "guardian" } };
  if (t === "H") return { x: state.x, y: state.y, event: { type: "building" } };
  if (t === "S") return { x: state.x, y: state.y, event: { type: "shrine" } };
  if (t === "n") return { x: state.x, y: state.y, event: { type: "sign" } };
  if (BLOCKING.has(t)) return { x: state.x, y: state.y, event: null };
  const event = t === "," && rng() < (opts.rate ?? ENCOUNTER_RATE) ? { type: "encounter" } : null;
  return { x, y, event };
}

/* Every walkable tile reachable from a start, for the playability tests. `blocked` holds
   "x,y" spots people are standing on. */
export function reachable(map, from, cleared = false, blocked = new Set()) {
  const seen = new Set([from.x + "," + from.y]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift();
    for (const [dx, dy] of Object.values(DIRS)) {
      const x = p.x + dx, y = p.y + dy, k = x + "," + y;
      let t = tileAt(map, x, y);
      if (t === "G" && cleared) t = "=";
      if (seen.has(k) || blocked.has(k) || BLOCKING.has(t) || t === "<" || t === ">") continue;
      seen.add(k); queue.push({ x, y });
    }
  }
  return seen;
}

/* ── creatures ── */
export function statsOf(level) {
  return { maxHp: 18 + level * 4, atk: 6 + level * 2 };
}
export const xpToNext = (level) => level * 15;

export function newMon(species, level) {
  return { species, level, xp: 0, hp: statsOf(level).maxHp };
}

export function wildLevel(regionIndex, rng = Math.random) {
  return 3 + regionIndex * 3 + Math.floor(rng() * 3);
}

/* Experience after a win. Several levels at once if earned; each level heals what it adds. */
export function gainXp(mon, xp) {
  let m = { ...mon, xp: (mon.xp || 0) + xp };
  let levelled = 0;
  while (m.xp >= xpToNext(m.level)) {
    m.xp -= xpToNext(m.level);
    const before = statsOf(m.level).maxHp;
    m.level += 1;
    m.hp = Math.min(statsOf(m.level).maxHp, m.hp + (statsOf(m.level).maxHp - before));
    levelled++;
  }
  return { mon: m, levelled };
}

/* ── moves ──
   Knowing the words is the strategy: 熱い beats what is 寒い, 冷たい beats 明るい, 明るい beats
   熱い. A strong move has a few uses per battle (`uses`); an ordinary one never runs out. */
const BEATS = { hot: "cold", cold: "bright", bright: "hot" };
const PLAIN_MOVES = [{ j: "ぶつかる", e: "Slam", kind: "plain", power: 1 }];
export const movesOf = (species) => (SPECIES[species] && SPECIES[species].moves) || PLAIN_MOVES;
export const kindOf = (species) => (SPECIES[species] && SPECIES[species].kind) || "plain";

export function matchup(moveKind, foeKind) {
  if (BEATS[moveKind] === foeKind) return 1.5;
  if (BEATS[foeKind] === moveKind) return 0.7;
  return 1;
}

export function hitFor({ level, move, foeSpecies, rng = Math.random }) {
  const mult = matchup(move.kind, kindOf(foeSpecies));
  const dmg = Math.max(1, Math.round(statsOf(level).atk * 0.7 * move.power * mult * (0.9 + rng() * 0.2)));
  return { dmg, mult };
}

export const foeMove = (species, rng = Math.random) => {
  const ms = movesOf(species);
  return ms[Math.floor(rng() * ms.length) % ms.length];
};

/* Catching is likelier the weaker the creature: certain at a quarter health or below, a coin
   flip at about 40%, impossible above half. */
export const CATCH_AT = 0.5;
export function catchChance(hp, maxHp) {
  const f = maxHp > 0 ? hp / maxHp : 1;
  if (f > CATCH_AT) return 0;
  return f <= 0.25 ? 1 : 1 - (f - 0.25) * 2;
}

/* ── the save ──
   Whatever was stored, a playable game comes back: unknown regions clamp, a missing team
   gets the partner, positions that landed in a wall return to the region's arrival. */
export function freshSave() {
  return { region: 0, x: null, y: null, name: "", team: [newMon("kotodama", 5)], lead: 0, caught: ["kotodama"], seen: ["kotodama"],
           rest: { region: 0 }, flags: {}, met: {} };
}

export function normaliseSave(raw, regions) {
  const base = freshSave();
  if (!raw || typeof raw !== "object") raw = {};
  const s = { ...base, ...raw };
  s.region = Number.isInteger(s.region) && s.region >= 0 && s.region < regions.length ? s.region : 0;
  s.team = Array.isArray(s.team) && s.team.length ? s.team.filter((m) => m && m.species && m.level > 0).slice(0, 6) : base.team;
  if (!s.team.length) s.team = base.team;
  s.lead = Number.isInteger(s.lead) && s.lead >= 0 && s.lead < s.team.length ? s.lead : 0;
  s.caught = Array.isArray(s.caught) ? s.caught : ["kotodama"];
  s.seen = Array.isArray(raw.seen) ? raw.seen : s.caught.slice();
  s.flags = s.flags && typeof s.flags === "object" ? s.flags : {};
  s.met = s.met && typeof s.met === "object" ? s.met : {};
  s.name = typeof s.name === "string" ? s.name : "";
  s.rest = s.rest && Number.isInteger(s.rest.region) && s.rest.region < regions.length ? s.rest : { region: 0 };
  const map = parseMap(regions[s.region].map);
  const t = tileAt(map, s.x, s.y);
  if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || BLOCKING.has(t) || t === "<" || t === ">") {
    const p = s.region === 0 ? map.start : arrival(map, "west");
    s.x = p.x; s.y = p.y;
  }
  return s;
}

/* Where you wake after a lost battle: beside the last shrine you rested at, team healed. */
export function wakeAtShrine(save, regions) {
  const r = save.rest && Number.isInteger(save.rest.region) ? save.rest.region : 0;
  const map = parseMap(regions[r].map);
  const s = map.shrine;
  const spot = s ? [[s.x + 1, s.y], [s.x - 1, s.y], [s.x, s.y + 1], [s.x, s.y - 1]]
    .map(([x, y]) => ({ x, y })).find((p) => !BLOCKING.has(tileAt(map, p.x, p.y))) : null;
  const p = spot || arrival(map, "west");
  return { ...save, region: r, x: p.x, y: p.y, team: healAll(save.team) };
}

export const healAll = (team) => team.map((m) => ({ ...m, hp: statsOf(m.level).maxHp }));
