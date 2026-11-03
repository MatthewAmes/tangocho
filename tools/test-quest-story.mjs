// Tests for Kotoba Quest's story: every word tappable, every reference real, and the mystery
// actually solvable by a player who walks the map and talks to everyone.
//
//   node tools/test-quest-story.mjs
import { parseJa, plainJa, rubyParts, pickEntry, goalNow, nameFromInput, afterChoice } from "./quest-story.mjs";
import { parseMap, tileAt, reachable, BLOCKING } from "./quest.mjs";
import { toKana } from "./romaji.mjs";
import { SPECIES, REGIONS } from "../src/data/quest-world.js";
import { SPRITES } from "../src/data/quest-sprites.js";
import { MAPS, WALKERS, PORTRAITS, OBJECTS, HERO } from "../src/data/quest-world-art.js";
import { CHAPTER, CAST, CLUES, CASE_CLUES, GOALS, PEOPLE, PLACES, SCENES, START_SCENE, LOST_SCENE, BATTLE_TEXT, MENU, GLOSS } from "../src/data/quest-story.js";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

/* Every node in a scene, including those inside choices. */
function walk(nodes, fn) {
  for (const n of nodes) {
    fn(n);
    if (n.choose) for (const o of n.choose) { fn(o); walk(o.then || [], fn); }
    if (n.present) walk(n.present.wrong || [], fn);
  }
}
const allLines = () => {
  const out = [];
  for (const [id, nodes] of Object.entries(SCENES)) walk(nodes, (n) => { if (n.j) out.push({ where: id, ...n }); });
  for (const [id, c] of Object.entries(CLUES)) out.push({ where: id, ...c });
  for (const g of GOALS) out.push({ where: "goal", ...g });
  for (const [id, m] of Object.entries(MENU)) out.push({ where: id, ...m });
  for (const [id, l] of Object.entries(BATTLE_TEXT)) out.push({ where: id, ...l });
  out.push({ where: "chapter", ...CHAPTER }, { where: "chapter", ...CHAPTER.number });
  for (const s of Object.values(SPECIES)) for (const m of s.moves || []) out.push({ where: s.name, ...m });
  return out;
};

t("markup: words, forms and readings come apart correctly", () => {
  eq(parseJa("{寒く|さむく|寒い}です"), [{ word: "寒く", reading: "さむく", lemma: "寒い" }, { text: "です" }]);
  eq(parseJa("{ふるえて||ふるえる}"), [{ word: "ふるえて", reading: "", lemma: "ふるえる" }]);
  eq(parseJa("{キャンパス}"), [{ word: "キャンパス", reading: "", lemma: "キャンパス" }]);
  eq(plainJa("@さん、{今日|きょう}は {寒い|さむい}です。", "トモ"), "トモさん、今日は寒いです。");
});
t("furigana sits over the kanji, not the kana after it", () => {
  eq(rubyParts("寒く", "さむく"), [{ text: "寒", ruby: "さむ" }, { text: "く" }]);
  eq(rubyParts("お茶", "おちゃ"), [{ text: "お" }, { text: "茶", ruby: "ちゃ" }]);
  eq(rubyParts("ふるえて", ""), [{ text: "ふるえて" }]);
  eq(rubyParts("天気", "てんき"), [{ text: "天気", ruby: "てんき" }]);
});
t("every line has its English, and every kanji has a reading", () => {
  for (const l of allLines()) {
    ok(l.e && l.e.trim(), `${l.where}: no English for ${l.j}`);
    for (const tok of parseJa(l.j)) {
      if (tok.text) ok(!/[一-鿿]/.test(tok.text), `${l.where}: kanji with no furigana in "${tok.text}" of ${l.j}`);
      if (tok.word && /[一-鿿]/.test(tok.word)) ok(tok.reading, `${l.where}: no reading for ${tok.word}`);
    }
    ok(!/[{}]/.test(parseJa(l.j).map((x) => x.text || "").join("")), `${l.where}: stray brace in ${l.j}`);
  }
});
t("every tappable word has a meaning", () => {
  const missing = new Set();
  for (const l of allLines()) for (const tok of parseJa(l.j)) if (tok.word && !GLOSS[tok.lemma] && !/^\{?[abn]\}?$/.test(tok.word)) missing.add(tok.lemma);
  eq([...missing], []);
});
t("every reference is real: scenes, clues, people, art", () => {
  const scene = (id, where) => ok(SCENES[id], `${where}: no scene ${id}`);
  for (const p of PEOPLE) {
    for (const e of p.talk) scene(e.scene, p.id);
    if (p.walker) ok(WALKERS[p.walker], p.id + " walker");
    if (p.object) ok(OBJECTS[p.object], p.id + " object");
    if (p.sprite) ok(SPRITES[p.sprite], p.id + " sprite");
  }
  for (const [k, list] of Object.entries(PLACES)) for (const e of list) scene(e.scene, k);
  scene(START_SCENE, "start"); scene(LOST_SCENE, "lost");
  for (const [id, nodes] of Object.entries(SCENES)) walk(nodes, (n) => {
    if (n.s) ok(CAST[n.s], `${id}: nobody called ${n.s}`);
    if (n.clue) ok(CLUES[n.clue], `${id}: no clue ${n.clue}`);
    if (n.present) ok(CLUES[n.present.right], `${id}: no clue ${n.present.right}`);
    if (n.fight) {
      for (const [s] of n.fight.team) ok(SPECIES[s], `${id}: no creature ${s}`);
      for (const k of ["win", "lose", "flee", "caught"]) if (n.fight[k]) scene(n.fight[k], `${id} ${k}`);
    }
  });
  for (const c of Object.values(CAST)) {
    if (c.portrait) ok(PORTRAITS[c.portrait], "portrait " + c.portrait);
    if (c.sprite) ok(SPRITES[c.sprite], "sprite " + c.sprite);
  }
  ok(MAPS[REGIONS[0].theme], "the map"); ok(WALKERS[REGIONS[0].guardian.look], "the guardian");
  for (const k of ["down", "up", "right"]) eq(HERO[k].length, 2, "hero " + k);
});
t("everyone stands somewhere you can reach, and nobody blocks the way", () => {
  const map = parseMap(REGIONS[0].map);
  const spots = new Set(PEOPLE.map((p) => p.x + "," + p.y));
  const seen = reachable(map, map.start, false, spots);
  const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + "," + (y + dy)));
  for (const p of PEOPLE) {
    ok(!BLOCKING.has(tileAt(map, p.x, p.y)), `${p.id} is inside something`);
    ok(near(p.x, p.y), `${p.id} can't be reached`);
  }
  const b = map.rows.findIndex((r) => r.includes("H"));
  ok(near(map.rows[b].indexOf("H"), b), "the kiosk");
  ok(near(map.guardian.x, map.guardian.y), "Hana");
  ok(near(map.shrine.x, map.shrine.y), "the shrine");
});

/* ── play it ──
   A player who keeps talking to whoever has something new, and picks the right answers. */
function talk(id, flags) {
  let q = SCENES[id].slice(), guard = 0, fought = null;
  const heard = [];
  while (q.length && guard++ < 500) {
    const n = q.shift();
    if (n.flag) flags[n.flag] = true;
    if (n.clue) {
      flags[n.clue] = true;
      if (CASE_CLUES.every((c) => flags[c])) flags.ready = true;
    }
    if (n.j) heard.push(n.j);
    if (n.choose) { const o = n.choose.find((x) => !x.retry); q = afterChoice(q, n, o); }
    if (n.fight) { fought = n.fight; break; }
  }
  if (fought && fought.win) return { heard, then: talk(fought.win, flags) };
  if (fought && fought.caught) return { heard, then: talk(fought.caught, flags) };
  return { heard };
}
t("the mystery can be solved from the first step, and ends with the campus warm", () => {
  const flags = {};
  talk(START_SCENE, flags);
  ok(flags.intro, "the intro finishes");
  eq(goalNow(GOALS, flags).until, "ready", "the first goal is asking around");
  for (let round = 0; round < 8 && !flags.ready; round++) {
    for (const p of PEOPLE) { const e = pickEntry(p.talk, flags); if (e) talk(e.scene, flags); }
    talk(pickEntry(PLACES.building, flags).scene, flags);
    talk(pickEntry(PLACES.guardian, flags).scene, flags);
    if (flags.ready) break;
  }
  ok(flags.ready, "talking to everyone finds every clue");
  for (const c of CASE_CLUES) ok(flags[c], c);
  eq(goalNow(GOALS, flags).until, "solved", "then go to Hana");
  const finale = pickEntry(PLACES.guardian, flags);
  eq(finale.scene, "finale");
  talk("finale", flags);
  ok(flags.solved, "beating the spirit solves the case");
  eq(pickEntry(PLACES.guardian, flags).scene, "hana_end");
  eq(goalNow(GOALS, flags).until, "never");
});
t("finale: only the true culprit and the right clues move it forward", () => {
  const who = SCENES.finale.find((n) => n.choose);
  eq(who.choose.filter((o) => !o.retry).length, 1, "one right answer");
  const wrong = who.choose.find((o) => o.retry);
  const q = afterChoice([{ j: "x" }], who, wrong);
  ok(q.includes(who), "a wrong name asks again");
  for (const n of SCENES.finale.filter((x) => x.present)) {
    ok(CASE_CLUES.includes(n.present.right), n.present.right + " is one you must have found");
    ok(n.present.wrong.length, "a wrong clue gets an answer");
  }
});
t("losing the boss doesn't lose the case: you go straight back to the fight", () => {
  eq(pickEntry(PLACES.guardian, { accused: true, ready: true }).scene, "boss_again");
});
t("your name: clean rōmaji or kana becomes katakana, anything else stays as you typed it", () => {
  eq(nameFromInput("matthew", toKana), "Matthew");
  eq(nameFromInput("Sam", toKana), "Sam");
  eq(nameFromInput("kevin", toKana), "ケヴィン");
  eq(nameFromInput("tomo", toKana), "トモ");
  eq(nameFromInput("まさと", toKana), "マサト");
  eq(nameFromInput("マサト", toKana), "マサト");
  eq(nameFromInput("   ", toKana), "");
  ok(nameFromInput("averyveryverylongnameindeed", toKana).length <= 12, "fits the box");
});

console.log(`\n${run - fail}/${run} passed`);
if (fail) process.exit(1);
