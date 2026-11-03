/* ── Kotoba Quest: the rules ──
   The pure half of the adventure (src/tabs/Quest.jsx draws it; src/data/quest-world.js
   holds the maps and creatures). Nothing here touches storage, React or the clock except
   through its arguments, so every rule is testable — tools/test-quest.mjs.

   The one idea: an attack IS a word. You see the English, you type the Japanese, and a
   right answer is a hit. Every answer goes through the same memory as Study, so playing
   moves the same "words you can say" count the home screen shows. */
import { actOf } from "./intake.mjs";
import { canSay } from "./bookorder.mjs";

export const MAP_W = 16, MAP_H = 11;
export const BLOCKING = new Set(["#", "~", "H", "S", "G", "n"]);
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const ENCOUNTER_RATE = 0.16;
export const WORDS_PER_BATTLE = 8;

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
     guardian / shrine / sign — you bumped into it
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
  if (t === "S") return { x: state.x, y: state.y, event: { type: "shrine" } };
  if (t === "n") return { x: state.x, y: state.y, event: { type: "sign" } };
  if (BLOCKING.has(t)) return { x: state.x, y: state.y, event: null };
  const event = t === "," && rng() < (opts.rate ?? ENCOUNTER_RATE) ? { type: "encounter" } : null;
  return { x, y, event };
}

/* Every walkable tile reachable from a start, for the playability tests. */
export function reachable(map, from, cleared = false) {
  const seen = new Set([from.x + "," + from.y]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift();
    for (const [dx, dy] of Object.values(DIRS)) {
      const x = p.x + dx, y = p.y + dy, k = x + "," + y;
      let t = tileAt(map, x, y);
      if (t === "G" && cleared) t = "=";
      if (seen.has(k) || BLOCKING.has(t) || t === "<" || t === ">") continue;
      seen.add(k); queue.push({ x, y });
    }
  }
  return seen;
}

/* ── creatures ── */
export function statsOf(level, bonus = 0) {
  return { maxHp: 18 + level * 4, atk: 6 + level * 2 + bonus };
}
export const xpToNext = (level) => level * 15;

export function newMon(species, level) {
  return { species, level, xp: 0, hp: statsOf(level).maxHp };
}

export function wildLevel(regionIndex, rng = Math.random) {
  return 2 + regionIndex * 3 + Math.floor(rng() * 3) - 1;
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

/* Your words are your power: +1 attack for every five words you can say (production that
   is expected to hold for a week — the same count Study's home screen shows). */
export function wordPower(cards = []) {
  return Math.floor(cards.filter((c) => !c.parked && canSay(c)).length / 5);
}

/* A hit. Typing it without the hint is a full blow; a quick answer is a critical. */
export function damageFor({ atk, hinted = false, fast = false, rng = Math.random }) {
  const roll = 0.9 + rng() * 0.2;
  return Math.max(1, Math.round(atk * (hinted ? 0.6 : 1) * (fast ? 1.5 : 1) * roll));
}
export const FAST_MS = 6000;

/* A miss lets the foe hit back, a little softer than you would hit it. */
export function counterFor(foe, rng = Math.random) {
  return Math.max(1, Math.round(statsOf(foe.level).atk * 0.75 * (0.9 + rng() * 0.2)));
}

/* Catching takes a right answer, and it is likelier the weaker the creature: certain at a
   quarter health or below, a coin flip at half. Only offered at half health or below. */
export const CATCH_AT = 0.5;
export function catchChance(hp, maxHp) {
  const f = maxHp > 0 ? hp / maxHp : 1;
  if (f > CATCH_AT) return 0;
  return f <= 0.25 ? 1 : 1 - (f - 0.25) * 2;
}

/* ── which words a battle asks ──
   The region's act only. Words he is already producing and are due come first (that is a
   real review), then started-but-weak, then words he can read but has never produced,
   then words never met — those are shown before they are asked. Recently asked words are
   held back so a battle is not the same three words again. */
export function battleWords(cards = [], act, n = WORDS_PER_BATTLE, opts = {}) {
  const now = opts.now || Date.now();
  const recent = opts.recent || new Set();
  const pool = cards.filter((c) => c && !c.parked && c.reading && actOf(c) === act && !recent.has(c.id));
  const rank = (c) => {
    const started = (c.rseen || 0) > 0;
    if (started && c.rfsrs && c.rfsrs.due <= now) return 0;
    if (started && !canSay(c)) return 1;
    if ((c.seen || 0) > 0 && !started) return 2;
    if (!started) return 3;
    return 4;                                   // solid and not due: least useful to ask
  };
  const tie = (c) => ((opts.seed || 0) * 31 + String(c.id).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 97;
  const sorted = pool.slice().sort((a, b) => (rank(a) - rank(b)) || (tie(a) - tie(b)));
  /* At most three never-met words a battle: a fight is not the place to meet ten. */
  const out = [];
  let fresh = 0;
  for (const c of sorted) {
    if (out.length >= n) break;
    const isNew = !((c.seen || 0) > 0) && !((c.rseen || 0) > 0);
    if (isNew && fresh >= 3) continue;
    if (isNew) fresh++;
    out.push(c);
  }
  return out;
}

export const isNewWord = (c) => !!c && !((c.seen || 0) > 0) && !((c.rseen || 0) > 0);

/* The か＿＿び hint: the first kana, then a blank per remaining kana. */
export function hintFor(reading) {
  const r = Array.from(String(reading || "").replace(/[\s（）()]/g, ""));
  return r.length ? r[0] + "＿".repeat(r.length - 1) : "";
}

/* ── the save ──
   Whatever was stored, a playable game comes back: unknown regions clamp, a missing team
   gets the partner, positions that landed in a wall return to the region's arrival. */
export function freshSave() {
  return { region: 0, x: null, y: null, team: [newMon("kotodama", 3)], lead: 0, cleared: [], caught: ["kotodama"],
           rest: { region: 0 }, wins: 0 };
}

export function normaliseSave(raw, regions) {
  const base = freshSave();
  if (!raw || typeof raw !== "object") raw = {};
  const s = { ...base, ...raw };
  s.region = Number.isInteger(s.region) && s.region >= 0 && s.region < regions.length ? s.region : 0;
  s.team = Array.isArray(s.team) && s.team.length ? s.team.filter((m) => m && m.species && m.level > 0).slice(0, 6) : base.team;
  if (!s.team.length) s.team = base.team;
  s.lead = Number.isInteger(s.lead) && s.lead >= 0 && s.lead < s.team.length ? s.lead : 0;
  s.cleared = Array.isArray(s.cleared) ? s.cleared.filter(Number.isInteger) : [];
  s.caught = Array.isArray(s.caught) ? s.caught : ["kotodama"];
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
