// Tests for Kotoba Quest's story: every word tappable, every reference real, and the mystery
// actually solvable by a player who walks the map and talks to everyone.
//
//   node tools/test-quest-story.mjs
import { parseJa, plainJa, rubyParts, pickEntry, goalNow, nameFromInput, afterChoice } from "./quest-story.mjs";
import { parseMap, tileAt, reachable, arrival, step, BLOCKING } from "./quest.mjs";
import { toKana } from "./romaji.mjs";
import { SPECIES, REGIONS } from "../src/data/quest-world.js";
import { SPRITES } from "../src/data/quest-sprites.js";
import { MAPS, WALKERS, PORTRAITS, OBJECTS, HERO } from "../src/data/quest-world-art.js";
import { CHAPTERS, CAST, LOST_WORDS, SCENES, LOST_SCENE, BATTLE_TEXT, MENU, GLOSS } from "../src/data/quest-story.js";

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
  for (const ch of CHAPTERS) {
    for (const [id, c] of Object.entries(ch.clues)) out.push({ where: id, ...c });
    for (const g of ch.goals) out.push({ where: "goal", ...g });
    out.push({ where: "chapter", ...ch.title }, { where: "chapter", ...ch.number });
  }
  for (const [id, m] of Object.entries(MENU)) out.push({ where: id, ...m });
  for (const [id, l] of Object.entries(BATTLE_TEXT)) out.push({ where: id, ...l });
  for (const w of LOST_WORDS) out.push({ where: w.flag, ...w });
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
const ALL_CLUES = Object.assign({}, ...CHAPTERS.map((c) => c.clues));
t("every reference is real: scenes, clues, people, art", () => {
  const scene = (id, where) => ok(SCENES[id], `${where}: no scene ${id}`);
  for (const ch of CHAPTERS) {
    scene(ch.start, "start"); scene(ch.readyScene, "ready");
    for (const p of ch.people) {
      for (const e of p.talk) scene(e.scene, p.id);
      if (p.walker) ok(WALKERS[p.walker], p.id + " walker");
      if (p.object) ok(OBJECTS[p.object], p.id + " object");
      if (p.sprite) ok(SPRITES[p.sprite], p.id + " sprite");
    }
    for (const [k, list] of Object.entries(ch.places)) for (const e of list) scene(e.scene, k);
    for (const b of ch.buildings) for (const e of b.talk) scene(e.scene, "building");
    const region = REGIONS[ch.region];
    ok(MAPS[region.theme], region.name + " map"); ok(WALKERS[region.guardian.look], region.name + " guardian");
    for (const c of ch.caseClues) ok(ch.clues[c], "case clue " + c);
  }
  scene(LOST_SCENE, "lost");
  for (const [id, nodes] of Object.entries(SCENES)) walk(nodes, (n) => {
    if (n.s) ok(CAST[n.s], `${id}: nobody called ${n.s}`);
    if (n.clue) ok(ALL_CLUES[n.clue], `${id}: no clue ${n.clue}`);
    if (n.present) ok(ALL_CLUES[n.present.right], `${id}: no clue ${n.present.right}`);
    if (n.join) ok(SPECIES[n.join] && SPRITES[n.join], `${id}: no creature ${n.join}`);
    if (n.fight) {
      for (const [s] of n.fight.team) ok(SPECIES[s], `${id}: no creature ${s}`);
      for (const k of ["win", "lose", "flee", "caught"]) if (n.fight[k]) scene(n.fight[k], `${id} ${k}`);
      if (n.fight.open) ok(BATTLE_TEXT[n.fight.open], `${id}: no line ${n.fight.open}`);
    }
  });
  for (const c of Object.values(CAST)) {
    if (c.portrait) ok(PORTRAITS[c.portrait], "portrait " + c.portrait);
    if (c.sprite) ok(SPRITES[c.sprite], "sprite " + c.sprite);
  }
  for (const k of ["down", "up", "right"]) eq(HERO[k].length, 2, "hero " + k);
});
for (const ch of CHAPTERS) {
  t(`${REGIONS[ch.region].name}: everyone stands somewhere you can reach, and every building is really there`, () => {
    const map = parseMap(REGIONS[ch.region].map);
    const from = ch.region === 0 ? map.start : arrival(map, "west");
    const spots = new Set(ch.people.filter((p) => !p.show).map((p) => p.x + "," + p.y));
    const seen = reachable(map, from, false, spots);
    const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + "," + (y + dy)));
    for (const p of ch.people) {
      ok(!BLOCKING.has(tileAt(map, p.x, p.y)), `${p.id} is inside something`);
      ok(near(p.x, p.y), `${p.id} can't be reached`);
    }
    for (const b of ch.buildings) {
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) eq(tileAt(map, b.x + i, b.y + j), "H", `building at ${b.x + i},${b.y + j}`);
      ok(near(b.x, b.y) || near(b.x + b.w - 1, b.y + b.h - 1), `building ${b.x},${b.y}`);
    }
    map.rows.forEach((row, y) => Array.from(row).forEach((c, x) => {
      if (c === "H") ok(ch.buildings.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h), `nothing says what the building at ${x},${y} is`);
    }));
    ok(near(map.guardian.x, map.guardian.y), "the guardian");
    ok(near(map.shrine.x, map.shrine.y), "the shrine");
  });
}

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
      for (const ch of CHAPTERS) if (ch.caseClues.every((c) => flags[c])) flags[ch.ready] = true;
    }
    if (n.j) heard.push(n.j);
    if (n.choose) { const o = n.choose.find((x) => !x.retry); q = afterChoice(q, n, o); }
    if (n.fight) { fought = n.fight; break; }
  }
  if (fought && fought.win) return { heard, then: talk(fought.win, flags) };
  if (fought && fought.caught) return { heard, then: talk(fought.caught, flags) };
  return { heard };
}
for (const ch of CHAPTERS) {
  t(`${REGIONS[ch.region].name}: the mystery can be solved from the first step`, () => {
    const flags = {};
    talk(ch.start, flags);
    ok(flags[ch.introFlag], "the intro finishes");
    eq(goalNow(ch.goals, flags).until, ch.ready, "the first goal is asking around");
    const visible = (p) => (p.show || []).every((f) => flags[f]) && !(p.hide || []).some((f) => flags[f]);
    for (let round = 0; round < 10 && !flags[ch.ready]; round++) {
      for (const p of ch.people.filter(visible)) { const e = pickEntry(p.talk, flags); if (e) talk(e.scene, flags); }
      for (const b of ch.buildings) { const e = pickEntry(b.talk, flags); if (e) talk(e.scene, flags); }
      if (flags[ch.ready]) break;
      talk(pickEntry(ch.places.guardian, flags).scene, flags);
    }
    ok(flags[ch.ready], "talking to everyone finds every clue");
    for (const c of ch.caseClues) ok(flags[c], c);
    eq(goalNow(ch.goals, flags).until, ch.solved, "then go to the guardian");
    const finale = pickEntry(ch.places.guardian, flags);
    talk(finale.scene, flags);
    ok(flags[ch.solved], "the showdown solves the case");
    eq(goalNow(ch.goals, flags).until, "never");
    const backOne = LOST_WORDS.find((w) => flags[w.flag]);
    ok(backOne, "and Kotodama gets a word back");
  });
  t(`${REGIONS[ch.region].name} finale: only the true culprit and the right clues move it forward`, () => {
    const scene = SCENES[pickEntry(ch.places.guardian, { [ch.ready]: true }).scene];
    const who = scene.find((n) => n.choose);
    eq(who.choose.filter((o) => !o.retry).length, 1, "one right answer");
    const wrong = who.choose.find((o) => o.retry);
    ok(afterChoice([{ j: "x" }], who, wrong).includes(who), "a wrong name asks again");
    const shows = scene.filter((x) => x.present);
    ok(shows.length >= 3, "at least three pieces of evidence");
    for (const n of shows) {
      ok(ch.caseClues.includes(n.present.right), n.present.right + " is one you must have found");
      ok(n.present.wrong.length, "a wrong clue gets an answer");
    }
  });
}
t("losing a boss doesn't lose the case: you go straight back to the fight", () => {
  eq(pickEntry(CHAPTERS[0].places.guardian, { accused: true, ready: true }).scene, "boss_again");
  eq(pickEntry(CHAPTERS[1].places.guardian, { c2_accused: true, c2_ready: true }).scene, "c2_boss_again");
});
t("beating a guardian opens the road only once the next chapter exists", () => {
  const m = parseMap(["###", "#G>", "#.#", "###"]);
  eq(step({ x: 1, y: 2 }, "up", m, { cleared: true }).event, null, "the guardian has stepped aside");
  eq(step({ x: 1, y: 1 }, "right", m, { cleared: true, open: false }).event, { type: "locked" });
  eq(step({ x: 1, y: 1 }, "right", m, { cleared: true, open: true }).event, { type: "region", to: 1 });
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
