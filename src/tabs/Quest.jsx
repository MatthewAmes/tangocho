import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SpeakBtn from "../components/SpeakBtn.jsx";
import { sGet, sSet } from "../lib/storage.js";
import { setSessionBusy } from "../lib/session.js";
import { SPECIES, REGIONS } from "../data/quest-world.js";
import { SPRITES } from "../data/quest-sprites.js";
import { MAPS, HERO, WALKERS, PORTRAITS, OBJECTS } from "../data/quest-world-art.js";
import { CHAPTERS, chapterFor, CAST, LOST_WORDS, LOST_WORD_COUNT, SCENES, LOST_SCENE, BATTLE_TEXT, MENU, GLOSS } from "../data/quest-story.js";
import { parseMap, arrival, step, statsOf, newMon, wildLevel, gainXp, movesOf, hitFor, foeMove, catchChance, normaliseSave, wakeAtShrine, healAll } from "../../tools/quest.mjs";
import { parseJa, plainJa, rubyParts, pickEntry, goalNow, nameFromInput, afterChoice } from "../../tools/quest-story.mjs";
import { toKana } from "../../tools/romaji.mjs";

/* ── Kotoba Quest ──
   A mystery you solve by understanding people, in Japanese, with creatures to befriend on
   the way. Nothing here is a quiz: the Japanese IS the game. Tap any word for its meaning;
   ？ shows a line's English. The story and every line are in src/data/quest-story.js. */

const SAVE_KEY = "jpn101:quest2";
const MAX_TEAM = 6;
const W = 256, H = 176;             // the map in its own pixels
const POSITION_SAVE_MS = 15000;     // walking saves gently: each write also goes to the cloud
const DEFAULT_NAME = "トモ";

const sp = (id) => SPECIES[id] || SPECIES.kotodama;

/* Lay a picture on the map by tile, feet on the tile's bottom edge. */
const onMap = (x, y, pw, ph) => ({
  left: ((x * 16 + 8 - pw / 2) / W) * 100 + "%", top: ((y * 16 + 16 - ph) / H) * 100 + "%",
  width: (pw / W) * 100 + "%", height: (ph / H) * 100 + "%",
});

/* A line of Japanese. Words are buttons that open their meaning, unless `plain` (it is
   already inside something you press). */
function Ja({ src, name, onWord, plain }) {
  return (
    <span lang="ja">
      {parseJa(src, name).map((t, i) => {
        if (!t.word) return <React.Fragment key={i}>{t.text}</React.Fragment>;
        const inner = rubyParts(t.word, t.reading).map((p, k) => (p.ruby ? <ruby key={k}>{p.text}<rt>{p.ruby}</rt></ruby> : <React.Fragment key={k}>{p.text}</React.Fragment>));
        if (plain || !onWord) return <React.Fragment key={i}>{inner}</React.Fragment>;
        return <button key={i} type="button" className="tc-qw" onClick={(e) => { e.stopPropagation(); onWord(t); }}>{inner}</button>;
      })}
    </span>
  );
}

/* ？ shows the English under whatever it sits beside. */
function HelpLine({ e, name }) {
  const [open, setOpen] = useState(false);
  const text = String(e || "").replace(/@/g, name || "");
  return (
    <>
      <button type="button" className={"tc-qhelp" + (open ? " is-on" : "")} aria-label="Show the English" aria-expanded={open} onClick={(ev) => { ev.stopPropagation(); setOpen(!open); }}>？</button>
      {open && <p className="tc-qen">{text}</p>}
    </>
  );
}

function Face({ who }) {
  const c = CAST[who];
  if (!c) return null;
  const art = c.portrait ? PORTRAITS[c.portrait] : SPRITES[c.sprite];
  return art ? <img className="tc-qface" src={art} alt="" draggable={false} /> : null;
}

function Sprite({ species, big, flip }) {
  const s = sp(species);
  const art = SPRITES[species];
  return (
    <span className={"tc-qsprite" + (big ? " is-big" : "") + (art ? " is-art" : "") + (art && flip ? " is-flip" : "")} aria-hidden="true">
      {art ? <img src={art} alt="" draggable={false} /> : <>{s.emoji}<i>{s.badge}</i></>}
    </span>
  );
}

function HpBar({ hp, max }) {
  const f = Math.max(0, Math.min(1, max ? hp / max : 0));
  return (
    <span className="tc-qhp" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.max(0, hp)}>
      <i className={f <= 0.25 ? "is-low" : f <= 0.5 ? "is-mid" : ""} style={{ width: Math.round(f * 100) + "%" }} />
    </span>
  );
}

/* The button you press to go on. It takes the keyboard's focus each time, so Enter or Space
   reads through a conversation without reaching for the mouse. */
function NextBtn({ onClick, label = MENU.next }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, [onClick]);
  return <button ref={ref} type="button" className="tc-btn tc-btn-primary tc-qgo" onClick={onClick}><Ja src={label.j} plain /> ▼</button>;
}

function fill(line, vars) {
  const put = (s, k) => s.replace(/\{([abn])\}/g, (m, v) => { const x = vars[v]; return x == null ? "" : typeof x === "object" ? x[k] : x; });
  return { j: put(line.j, "j"), e: put(line.e, "e") };
}
const say = (key, vars = {}) => fill(BATTLE_TEXT[key], vars);
const nameOf = (id) => ({ j: sp(id).ja, e: sp(id).name });

export default function Quest() {
  const [save, setSave] = useState(null);
  const [view, setView] = useState("map");              // map | note
  const [noteTab, setNoteTab] = useState("clues");
  const [scene, setScene] = useState(null);             // { node, queue }
  const [battle, setBattle] = useState(null);
  const [menu, setMenu] = useState("main");             // main | moves | team, inside a battle
  const [word, setWord] = useState(null);
  const [facing, setFacing] = useState({ dir: "down", step: 0 });
  const [nameDraft, setNameDraft] = useState("");
  const [resetArmed, setResetArmed] = useState(false);

  /* Anything that matters saves at once. Plain steps wait a little and save when you stop or
     leave, because every write also goes up to the cloud, and that has a daily limit. */
  const pendingWalk = useRef(null), walkTimer = useRef(null);
  const persist = useCallback((s) => {
    pendingWalk.current = null; clearTimeout(walkTimer.current);
    setSave(s); sSet(SAVE_KEY, JSON.stringify(s));
  }, []);
  const flushWalk = useCallback(() => {
    clearTimeout(walkTimer.current);
    if (pendingWalk.current) { sSet(SAVE_KEY, JSON.stringify(pendingWalk.current)); pendingWalk.current = null; }
  }, []);
  const walked = useCallback((s) => {
    setSave(s); pendingWalk.current = s;
    clearTimeout(walkTimer.current); walkTimer.current = setTimeout(flushWalk, POSITION_SAVE_MS);
  }, [flushWalk]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushWalk(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushWalk);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flushWalk); flushWalk(); };
  }, [flushWalk]);
  const region = save ? REGIONS[save.region] : REGIONS[0];
  const chapter = chapterFor(save ? save.region : 0);
  const map = useMemo(() => parseMap(region.map), [region]);
  const playerName = (save && save.name) || DEFAULT_NAME;
  const flags = (save && save.flags) || {};
  const cleared = !!flags[chapter.solved];
  const roadOpen = cleared && CHAPTERS.some((c) => c.region === save.region + 1);

  useEffect(() => { setSessionBusy(!!battle || !!scene); return () => setSessionBusy(false); }, [battle, scene]);

  /* ── the story runner ──
     Nodes that show nothing (a flag, a clue, a heal) happen straight away; the first one
     that needs the player stops the run and waits. */
  const run = useCallback((queue, from) => {
    let q = queue.slice(), s = from, changed = false, node = null, fight = null;
    while (q.length) {
      const n = q.shift();
      if (n.flag) { s = { ...s, flags: { ...s.flags, [n.flag]: true } }; if (n.flag === "rested") s = { ...s, rest: { region: s.region } }; changed = true; continue; }
      if (n.heal) { s = { ...s, team: healAll(s.team) }; changed = true; continue; }
      if (n.clue) {
        if (s.flags[n.clue]) continue;
        s = { ...s, flags: { ...s.flags, [n.clue]: true } }; changed = true;
        const ch = CHAPTERS.find((c) => c.caseClues.includes(n.clue));
        const ready = !!ch && ch.caseClues.every((c) => s.flags[c]) && !s.flags[ch.ready];
        if (ready) s = { ...s, flags: { ...s.flags, [ch.ready]: true } };
        q = [{ found: n.clue }, ...(ready ? SCENES[ch.readyScene] : []), ...q];
        continue;
      }
      if (n.join) {
        if (s.team.some((m) => m.species === n.join) || s.team.length >= MAX_TEAM) continue;
        s = { ...s, team: [...s.team, newMon(n.join, Math.max(4, s.team[s.lead].level - 2))], caught: s.caught.includes(n.join) ? s.caught : [...s.caught, n.join], seen: s.seen.includes(n.join) ? s.seen : [...s.seen, n.join] };
        changed = true;
      }
      if (n.fight) { fight = n.fight; break; }
      node = n; break;
    }
    if (changed) persist(s);
    if (fight) { setScene(null); startFight(fight, s); return; }
    setScene(node ? { node, queue: q } : null);
  }, [persist]);   // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback((id, from) => run(SCENES[id] || [], from), [run]);

  useEffect(() => {
    sGet(SAVE_KEY).then((raw) => {
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) {}
      const s = normaliseSave(parsed, REGIONS);
      setSave(s);
      const ch = chapterFor(s.region);
      if (!s.flags[ch.introFlag]) play(ch.start, s);
    }).catch(() => { const s = normaliseSave(null, REGIONS); setSave(s); play(CHAPTERS[0].start, s); });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const nextLine = () => run(scene.queue, save);
  const choose = (option) => run(afterChoice(scene.queue, scene.node, option), save);
  const submitName = (e) => {
    e.preventDefault();
    const name = nameFromInput(nameDraft, toKana) || DEFAULT_NAME;
    const s = { ...save, name };
    persist(s);
    setNameDraft("");
    run(scene.queue, s);
  };
  const present = (clue) => {
    const { right, wrong } = scene.node.present;
    if (clue === right) run(scene.queue, save);
    else run([...wrong, scene.node, ...scene.queue], save);
  };
  const openWord = (t) => {
    setWord(t);
    const key = t.lemma;
    if (save && GLOSS[key]) persist({ ...save, met: { ...save.met, [key]: (save.met[key] || 0) + 1 } });
  };

  /* ── walking ── */
  const people = useMemo(() => chapter.people.filter((p) => (p.show || []).every((f) => flags[f]) && !(p.hide || []).some((f) => flags[f])), [chapter, flags]);
  const move = useCallback((dir) => {
    if (!save || view !== "map" || scene || battle) return;
    setFacing((f) => ({ dir, step: f.step + 1 }));
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const person = people.find((p) => p.x === save.x + dx && p.y === save.y + dy);
    if (person) { const e = pickEntry(person.talk, flags); if (e) play(e.scene, save); return; }
    const r = step({ x: save.x, y: save.y }, dir, map, { cleared, open: roadOpen });
    const s = { ...save, x: r.x, y: r.y };
    const ev = r.event;
    if (!ev) { walked(s); return; }
    if (ev.type === "encounter") {
      setSave(s);
      const pool = region.wild;
      startFight({ team: [[pool[Math.floor(Math.random() * pool.length)], wildLevel(save.region)]], wild: true }, s);
      return;
    }
    if (ev.type === "region") {
      const to = save.region + ev.to;
      const ch = chapterFor(to);
      if (ch.region !== to) return;
      const p = arrival(parseMap(REGIONS[to].map), ev.to > 0 ? "west" : "east");
      const moved = { ...s, region: to, x: p.x, y: p.y, rest: ev.to > 0 ? { region: to } : s.rest };
      persist(moved);
      if (!moved.flags[ch.introFlag]) play(ch.start, moved);
      return;
    }
    const tx = save.x + dx, ty = save.y + dy;
    const list = ev.type === "building"
      ? (chapter.buildings.find((b) => tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) || {}).talk
      : chapter.places[ev.type];
    const e = list && pickEntry(list, flags);
    if (e) play(e.scene, s);
  }, [save, view, scene, battle, map, people, flags, region, chapter, cleared, roadOpen, persist, walked, play]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== "map" || scene || battle) return undefined;
    const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const dir = KEYS[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, scene, battle, move]);

  /* ── battle ──
     A turn is worked out at once and told as a list of lines; each line remembers the health
     to show while it is on screen, so the bars move with the story, not ahead of it. */
  function startFight(def, s) {
    const foes = def.team.map(([id, lvl]) => newMon(id, lvl));
    const lead = s.team[s.lead] && s.team[s.lead].hp > 0 ? s.lead : s.team.findIndex((m) => m.hp > 0);
    const first = lead < 0 ? 0 : lead;
    const team = lead < 0 ? healAll(s.team) : s.team;
    const met = foes.map((f) => f.species).filter((id) => !s.seen.includes(id));
    const next = { ...s, lead: first, team, seen: met.length ? [...s.seen, ...met] : s.seen };
    persist(next);
    const opening = say(def.open || (def.boss ? "boss" : "appear"), { a: nameOf(foes[0].species) });
    setMenu("main");
    setBattle({ def, foes, fi: 0, uses: {}, log: [{ ...opening, fh: foes[0].hp, lh: team[first].hp, li: first, fi: 0 }], i: 0, end: null });
  }

  const tellTurn = (b, s, log, end) => {
    persist(s);
    setMenu("main");
    setBattle({ ...b, log, i: 0, end });
  };

  /* The foe's half of a turn, after the player's. Returns [save, end]. */
  const foeTurn = (b, foes, s, log) => {
    const foe = foes[b.fi];
    const move1 = foeMove(foe.species);
    const me = s.team[s.lead];
    const { dmg, mult } = hitFor({ level: foe.level, move: move1, foeSpecies: me.species });
    const team = s.team.slice();
    const hp = Math.max(0, me.hp - dmg);
    team[s.lead] = { ...me, hp };
    const mark = (lh, li = s.lead) => ({ fh: foe.hp, lh, li, fi: b.fi });
    log.push({ ...say("uses", { a: nameOf(foe.species), b: { j: move1.j, e: move1.e } }), ...mark(me.hp) });
    if (mult > 1) log.push({ ...say("strong"), ...mark(me.hp) });
    if (mult < 1) log.push({ ...say("weak"), ...mark(me.hp) });
    log.push({ ...say("hit", { a: nameOf(me.species), n: dmg }), ...mark(hp) });
    let next = { ...s, team };
    if (hp > 0) return [next, null];
    log.push({ ...say("down", { a: nameOf(me.species) }), ...mark(0) });
    const nextLead = team.findIndex((m) => m.hp > 0);
    if (nextLead < 0) { log.push({ ...say("lost"), ...mark(0) }); return [next, "lost"]; }
    next = { ...next, lead: nextLead };
    log.push({ ...say("next", { a: nameOf(team[nextLead].species) }), ...mark(team[nextLead].hp, nextLead) });
    return [next, null];
  };

  const useMove = (move1, index) => {
    const b = battle, foes = b.foes.slice(), s0 = save, me = s0.team[s0.lead];
    const uses = { ...b.uses };
    if (move1.uses) uses[s0.lead + ":" + index] = (uses[s0.lead + ":" + index] || 0) + 1;
    const foe = foes[b.fi];
    const { dmg, mult } = hitFor({ level: me.level, move: move1, foeSpecies: foe.species });
    const hp = Math.max(0, foe.hp - dmg);
    foes[b.fi] = { ...foe, hp };
    const mark = (fh, fi = b.fi) => ({ fh, lh: me.hp, li: s0.lead, fi });
    const log = [{ ...say("uses", { a: nameOf(me.species), b: { j: move1.j, e: move1.e } }), ...mark(foe.hp) }];
    if (mult > 1) log.push({ ...say("strong"), ...mark(foe.hp) });
    if (mult < 1) log.push({ ...say("weak"), ...mark(foe.hp) });
    log.push({ ...say("hit", { a: nameOf(foe.species), n: dmg }), ...mark(hp) });
    const bb = { ...b, foes, uses };
    if (hp > 0) {
      const [s, end] = foeTurn(bb, foes, s0, log);
      tellTurn(bb, s, log, end);
      return;
    }
    log.push({ ...say("down", { a: nameOf(foe.species) }), ...mark(0) });
    if (b.fi + 1 < foes.length) {
      const fi = b.fi + 1;
      log.push({ ...say("appear", { a: nameOf(foes[fi].species) }), ...mark(foes[fi].hp, fi) });
      tellTurn({ ...bb, fi }, s0, log, null);
      return;
    }
    const xp = foes.reduce((n, f) => n + f.level * 8, 0);
    const { mon, levelled } = gainXp(me, xp);
    const team = s0.team.slice(); team[s0.lead] = mon;
    log.push({ ...say("win"), ...mark(0) }, { ...say("xp", { n: xp }), ...mark(0) });
    if (levelled) log.push({ ...say("level", { a: nameOf(me.species), n: mon.level }), ...mark(0) });
    tellTurn(bb, { ...s0, team }, log, "won");
  };

  const tryCatch = () => {
    const b = battle, foe = b.foes[b.fi], s0 = save, me = s0.team[s0.lead];
    const max = statsOf(foe.level).maxHp, chance = catchChance(foe.hp, max);
    const mark = { fh: foe.hp, lh: me.hp, li: s0.lead, fi: b.fi };
    if (chance <= 0) { tellTurn(b, s0, [{ ...say("tooStrong"), ...mark }], null); return; }
    const log = [{ ...say("throw", { a: nameOf(foe.species) }), ...mark }];
    if (Math.random() < chance) {
      const joins = s0.team.length < MAX_TEAM;
      const s = { ...s0, team: joins ? [...s0.team, { ...foe, xp: 0 }] : s0.team, caught: s0.caught.includes(foe.species) ? s0.caught : [...s0.caught, foe.species] };
      log.push({ ...say(joins ? "caught" : "caughtHome", { a: nameOf(foe.species) }), ...mark });
      tellTurn(b, s, log, "caught");
      return;
    }
    log.push({ ...say("broke"), ...mark });
    const [s, end] = foeTurn(b, b.foes, s0, log);
    tellTurn(b, s, log, end);
  };

  const tryRun = () => {
    const b = battle, foe = b.foes[b.fi], me = save.team[save.lead];
    const mark = { fh: foe.hp, lh: me.hp, li: save.lead, fi: b.fi };
    if (b.def.boss) { tellTurn(b, save, [{ ...say("noFlee"), ...mark }], null); return; }
    tellTurn(b, save, [{ ...say("fled"), ...mark }], "fled");
  };

  const swapTo = (i) => {
    const b = battle, s0 = { ...save, lead: i }, foe = b.foes[b.fi];
    const log = [{ ...say("next", { a: nameOf(s0.team[i].species) }), fh: foe.hp, lh: s0.team[i].hp, li: i, fi: b.fi }];
    const [s, end] = foeTurn(b, b.foes, s0, log);
    tellTurn(b, s, log, end);
  };

  const nextBattleLine = () => {
    const b = battle;
    if (b.i + 1 < b.log.length) { setBattle({ ...b, i: b.i + 1 }); return; }
    if (!b.end) { setBattle({ ...b, log: [], i: 0 }); return; }
    const { def, end } = b;
    setBattle(null);
    if (end === "lost") { const s = wakeAtShrine(save, REGIONS); persist(s); play(def.lose || LOST_SCENE, s); return; }
    const after = end === "won" ? def.win : end === "caught" ? def.caught : def.flee;
    if (after) play(after, save);
  };

  if (!save) return <div className="tc-empty">読み込み中…</div>;

  const wordCard = word && (
    <div className="tc-qgloss" role="dialog" aria-label="Word meaning" onClick={() => setWord(null)}>
      <div className="tc-qgloss-in" onClick={(e) => e.stopPropagation()}>
        <p className="tc-qgw" lang="ja">{word.lemma} <SpeakBtn text={word.lemma} /></p>
        {word.reading && <p className="tc-qgr" lang="ja">{word.reading}</p>}
        <p className="tc-qgm">{GLOSS[word.lemma] || ""}</p>
        <button type="button" className="tc-btn tc-btn-sm" onClick={() => setWord(null)}>OK</button>
      </div>
    </div>
  );

  /* ── the notebook ── */
  if (view === "note") {
    const clues = Object.keys(chapter.clues).filter((c) => flags[c]);
    const met = Object.keys(save.met).sort();
    const lost = LOST_WORDS.filter((w) => flags[w.flag]);
    const dex = Object.keys(SPECIES);
    const tab = (id, label) => (
      <button type="button" className={"tc-btn tc-btn-sm" + (noteTab === id ? " tc-btn-primary" : "")} aria-pressed={noteTab === id} onClick={() => setNoteTab(id)}><Ja src={label.j} plain /></button>
    );
    return (
      <div className="tc-quest">
        <div className="tc-qhead">
          <b><Ja src={MENU.notebook.j} plain /></b>
          <button type="button" className="tc-btn tc-btn-sm" onClick={() => setView("map")}><Ja src={MENU.map.j} plain /></button>
        </div>
        <div className="tc-qtabs">{tab("clues", MENU.clues)}{tab("words", MENU.words)}{tab("team", MENU.team)}{tab("dex", MENU.dex)}</div>
        {noteTab === "clues" && (
          <div className="tc-qclue tc-qlost">
            <p className="tc-qsay"><Ja src={MENU.lostWords.j} onWord={openWord} /> {lost.length} / {LOST_WORD_COUNT}</p>
            {lost.map((w) => <div key={w.flag} className="tc-qlostword"><p className="tc-qsay"><Ja src={w.j} onWord={openWord} /></p><HelpLine e={w.e} /></div>)}
          </div>
        )}
        {noteTab === "clues" && clues.map((c) => (
          <div key={c} className="tc-qclue"><p className="tc-qsay"><Ja src={chapter.clues[c].j} onWord={openWord} /></p><HelpLine e={chapter.clues[c].e} /></div>
        ))}
        {noteTab === "words" && (met.length
          ? <ul className="tc-qwords">{met.map((w) => <li key={w}><b lang="ja">{w}</b> <span>{GLOSS[w]}</span></li>)}</ul>
          : <div className="tc-qclue"><p className="tc-qsay"><Ja src={MENU.noWords.j} onWord={openWord} /></p><HelpLine e={MENU.noWords.e} /></div>)}
        {noteTab === "team" && save.team.map((m, i) => (
          <div key={i} className={"tc-qmon" + (i === save.lead ? " is-lead" : "")}>
            <Sprite species={m.species} />
            <div className="tc-qmoninfo">
              <p><b lang="ja">{sp(m.species).ja}</b> Lv {m.level}</p>
              <HpBar hp={m.hp} max={statsOf(m.level).maxHp} />
              <p className="tc-qfrom" lang="ja">{sp(m.species).from}</p>
            </div>
            {i !== save.lead && m.hp > 0 && <button type="button" className="tc-btn tc-btn-sm" onClick={() => persist({ ...save, lead: i })}><Ja src={MENU.lead.j} plain /></button>}
          </div>
        ))}
        {noteTab === "dex" && (
          <>
            <p className="tc-qnote"><Ja src={MENU.dexCaught.j} plain /> {save.caught.length} / {dex.length}</p>
            <div className="tc-qdex">
              {dex.map((id) => {
                const seen = save.seen.includes(id), caught = save.caught.includes(id);
                return (
                  <div key={id} className={"tc-qdexcell" + (seen ? "" : " is-unknown")}>
                    <img src={SPRITES[id]} alt="" draggable={false} />
                    <span lang="ja">{seen ? sp(id).ja : "？？？"}{caught ? " ★" : ""}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="tc-qclue tc-qsaved"><p className="tc-qsay"><Ja src={MENU.saved.j} onWord={openWord} /></p><HelpLine e={MENU.saved.e} /></div>
        <button type="button" className="tc-qrestart" onClick={() => {
          if (!resetArmed) { setResetArmed(true); return; }
          const s = normaliseSave(null, REGIONS);
          persist(s); setResetArmed(false); setView("map"); play(CHAPTERS[0].start, s);
        }}>{resetArmed ? "Press again to erase this adventure and start over" : "Start over"}</button>
        {wordCard}
      </div>
    );
  }

  /* ── battle ── */
  if (battle) {
    const line = battle.log[battle.i];
    const fi = line ? line.fi : battle.fi;
    const foe = battle.foes[fi];
    const li = line ? line.li : save.lead;
    const me = save.team[li];
    const foeHp = line ? line.fh : foe.hp;
    const myHp = line ? line.lh : me.hp;
    const moves = movesOf(me.species);
    const left = (m, i) => (m.uses ? m.uses - (battle.uses[save.lead + ":" + i] || 0) : null);
    return (
      <div className="tc-quest">
        <div className="tc-qfoe">
          <Sprite species={foe.species} big />
          <div>
            <p><b lang="ja">{sp(foe.species).ja}</b> Lv {foe.level}</p>
            <HpBar hp={foeHp} max={statsOf(foe.level).maxHp} />
          </div>
        </div>
        <div className="tc-qlead">
          <Sprite species={me.species} flip />
          <div>
            <p><b lang="ja">{sp(me.species).ja}</b> Lv {me.level}</p>
            <HpBar hp={myHp} max={statsOf(me.level).maxHp} />
          </div>
        </div>
        {line ? (
          <div className="tc-qbox">
            <p className="tc-qsay" aria-live="polite"><Ja key={battle.i} src={line.j} onWord={openWord} /></p>
            <HelpLine key={"h" + battle.i} e={line.e} />
            <NextBtn onClick={nextBattleLine} />
          </div>
        ) : menu === "moves" ? (
          <div className="tc-qbox tc-qmenu">
            {moves.map((m, i) => {
              const n = left(m, i);
              return (
                <button key={i} type="button" className="tc-btn" disabled={n === 0} title={m.e} onClick={() => useMove(m, i)}>
                  <Ja src={m.j} plain />{n != null && <small> ×{n}</small>}
                </button>
              );
            })}
            <button type="button" className="tc-btn" onClick={() => setMenu("main")}><Ja src={MENU.back.j} plain /></button>
            <div className="tc-qmenuhelp"><HelpLine e={moves.map((m) => m.e).join(" · ")} /></div>
          </div>
        ) : menu === "team" ? (
          <div className="tc-qbox tc-qmenu">
            {save.team.map((m, i) => (
              <button key={i} type="button" className="tc-btn" disabled={i === save.lead || m.hp <= 0} onClick={() => swapTo(i)}>
                <span lang="ja">{sp(m.species).ja}</span> <small>{m.hp}/{statsOf(m.level).maxHp}</small>
              </button>
            ))}
            <button type="button" className="tc-btn" onClick={() => setMenu("main")}><Ja src={MENU.back.j} plain /></button>
          </div>
        ) : (
          <div className="tc-qbox tc-qmenu">
            <button type="button" className="tc-btn tc-btn-primary" onClick={() => setMenu("moves")}><Ja src={MENU.fight.j} plain /></button>
            {!battle.def.boss && <button type="button" className="tc-btn" onClick={tryCatch}><Ja src={MENU.catch.j} plain /></button>}
            <button type="button" className="tc-btn" disabled={save.team.length < 2} onClick={() => setMenu("team")}><Ja src={MENU.team.j} plain /></button>
            <button type="button" className="tc-btn" onClick={tryRun}><Ja src={MENU.run.j} plain /></button>
            <div className="tc-qmenuhelp"><HelpLine e={[MENU.fight.e, ...(battle.def.boss ? [] : [MENU.catch.e]), MENU.team.e, MENU.run.e].join(" · ")} /></div>
          </div>
        )}
        {wordCard}
      </div>
    );
  }

  /* ── the map, and whatever is being said on it ── */
  const node = scene && scene.node;
  const goal = goalNow(chapter.goals, flags);
  const heroPic = HERO[facing.dir === "left" ? "right" : facing.dir][facing.step % 2];
  const onGrass = map.rows[save.y] && map.rows[save.y][save.x] === ",";
  const speaker = node && node.s;
  return (
    <div className="tc-quest">
      <div className="tc-qhead">
        <div>
          <b><Ja src={chapter.number.j} plain /> <Ja src={chapter.title.j} plain /></b>
          {!scene && <div className="tc-qgoal"><p className="tc-qsay"><Ja src={goal.j} onWord={openWord} /></p><HelpLine key={goal.until} e={goal.e} /></div>}
        </div>
        {!scene && <button type="button" className="tc-btn tc-btn-sm" onClick={() => setView("note")}><Ja src={MENU.notebook.j} plain /></button>}
      </div>

      <div className="tc-qmap" role="img" aria-label={`Map of ${region.name}. You are at column ${save.x + 1}, row ${save.y + 1}.`}>
        <img className="tc-qmapbg" src={MAPS[region.theme]} alt="" draggable={false} />
        {map.east && <img className="tc-qactor" src={roadOpen ? OBJECTS.open : OBJECTS.locked} style={onMap(map.east.x, map.east.y, 16, 16)} alt="" draggable={false} />}
        {!cleared && <img className="tc-qactor" src={WALKERS[region.guardian.look]} style={onMap(map.guardian.x, map.guardian.y, 16, 20)} alt="" draggable={false} />}
        {people.map((p) => (
          p.sprite ? <img key={p.id} className="tc-qactor" src={SPRITES[p.sprite]} style={onMap(p.x, p.y, 24, 24)} alt="" draggable={false} />
          : p.object ? <img key={p.id} className="tc-qactor" src={OBJECTS[p.object]} style={onMap(p.x, p.y, 16, 20)} alt="" draggable={false} />
          : <img key={p.id} className="tc-qactor" src={WALKERS[p.walker]} style={onMap(p.x, p.y, 16, 20)} alt="" draggable={false} />
        ))}
        <img key={save.region} className={"tc-qactor tc-qhero" + (facing.dir === "left" ? " is-left" : "") + (onGrass ? " is-grass" : "")} src={heroPic}
             style={onMap(save.x, save.y, 16, 20)} alt="" draggable={false} />
      </div>

      {node && (
        <div className="tc-qbox">
          {node.name ? (
            <form className="tc-qname" onSubmit={submitName}>
              <p className="tc-qsay"><Ja src={MENU.nameAsk.j} onWord={openWord} /></p><HelpLine e={MENU.nameAsk.e} />
              <input className="tc-input" autoFocus value={nameDraft} maxLength={16} onChange={(e) => setNameDraft(e.target.value)}
                     placeholder="Matthew" aria-label="Your name" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} />
              <p className="tc-qkana" lang="ja" aria-hidden="true">{nameFromInput(nameDraft, toKana) || "　"}</p>
              <button type="submit" className="tc-btn tc-btn-primary tc-qgo"><Ja src={MENU.nameOk.j} plain /></button>
            </form>
          ) : node.choose ? (
            <div className="tc-qchoices">
              {node.choose.map((o, i) => (
                <div key={i} className="tc-qchoice">
                  <button type="button" className="tc-btn" onClick={() => choose(o)}><Ja src={o.j} name={playerName} plain /></button>
                  <HelpLine e={o.e} name={playerName} />
                </div>
              ))}
            </div>
          ) : node.present ? (
            <div className="tc-qchoices">
              <p className="tc-qsay"><Ja src={MENU.pickClue.j} onWord={openWord} /></p><HelpLine e={MENU.pickClue.e} />
              {Object.keys(chapter.clues).filter((c) => flags[c]).map((c) => (
                <div key={c} className="tc-qchoice">
                  <button type="button" className="tc-btn tc-qcluebtn" onClick={() => present(c)}><Ja src={chapter.clues[c].j} plain /></button>
                  <HelpLine e={chapter.clues[c].e} />
                </div>
              ))}
            </div>
          ) : node.found ? (
            <>
              <p className="tc-qeyebrow"><Ja src={MENU.found.j} plain /></p>
              <p className="tc-qsay"><Ja src={chapter.clues[node.found].j} onWord={openWord} /></p>
              <HelpLine key={node.found} e={chapter.clues[node.found].e} />
              <NextBtn onClick={nextLine} />
            </>
          ) : (
            <>
              <div className="tc-qline2">
                {speaker && <Face who={speaker} />}
                <div className="tc-qtalk">
                  {speaker && CAST[speaker] && <p className="tc-qwho"><Ja src={CAST[speaker].name} plain /></p>}
                  <p className="tc-qsay"><Ja key={node.j} src={node.j} name={playerName} onWord={openWord} /></p>
                </div>
              </div>
              <div className="tc-qtools">
                <SpeakBtn text={plainJa(node.j, playerName)} />
                <HelpLine key={node.j} e={node.e} name={playerName} />
              </div>
              <NextBtn onClick={nextLine} />
            </>
          )}
        </div>
      )}

      {!scene && (
        <div className="tc-qpad" role="group" aria-label="Move">
          <button type="button" className="tc-btn tc-qup" aria-label="Move up" onClick={() => move("up")}>▲</button>
          <button type="button" className="tc-btn tc-qleft" aria-label="Move left" onClick={() => move("left")}>◀</button>
          <button type="button" className="tc-btn tc-qright" aria-label="Move right" onClick={() => move("right")}>▶</button>
          <button type="button" className="tc-btn tc-qdown" aria-label="Move down" onClick={() => move("down")}>▼</button>
        </div>
      )}
      {!flags[CHAPTERS[0].introFlag] && <p className="tc-qnote tc-qkeys">Tap any word for its meaning. ？ shows the English. 🔊 reads it aloud.</p>}
      {wordCard}
    </div>
  );
}
