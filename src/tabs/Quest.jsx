import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SpeakBtn from "../components/SpeakBtn.jsx";
import { sGet, sSet } from "../lib/storage.js";
import { setSessionBusy } from "../lib/session.js";
import { playFeedback } from "../lib/sfx.js";
import { SPECIES, REGIONS } from "../data/quest-world.js";
import { SPRITES } from "../data/quest-sprites.js";
import { parseMap, tileAt, step, arrival, statsOf, newMon, wildLevel, gainXp, wordPower, damageFor,
         counterFor, catchChance, CATCH_AT, FAST_MS, battleWords, isNewWord, hintFor, normaliseSave,
         wakeAtShrine, healAll } from "../../tools/quest.mjs";
import { gradeAnswer, glossOf } from "../../tools/benchmark.mjs";
import { toKana } from "../../tools/romaji.mjs";
import { cleanWord } from "../../tools/wordform.mjs";
import { actOf } from "../../tools/intake.mjs";

/* ── Kotoba Quest ──
   An original monster-battle adventure across the Volume 2 acts. Walk the map; tall grass
   hides wild creatures; every attack is a word — English shown, Japanese typed. A right
   answer hits, a quick unhinted one is a critical, a miss lets the creature hit back.
   Weaken one and a right answer can catch it. Beat an act's guardian to open the road on.

   Answers go to onAnswer, which records them exactly as Study's typed answers are recorded
   — once per word per visit, so a battle cannot drill one word into a false memory. */

const SAVE_KEY = "jpn101:quest";
const MAX_TEAM = 6;

const TILE = {
  "#": ["tree", "🌲"], "~": ["water", ""], "H": ["house", "🏠"], ",": ["grass", ""], ".": ["ground", ""],
  "=": ["path", ""], "S": ["shrine", "⛩️"], "n": ["sign", "📜"], "@": ["ground", ""], "<": ["gate", "⬅️"],
};

const kanaOf = (v) => { try { return toKana(String(v || "").trim()); } catch (e) { return String(v || "").trim(); } };
const sp = (id) => SPECIES[id] || SPECIES.kotodama;
const shown = (t) => cleanWord(t).replace(/[↓↑]/g, "");   // no glossary notes or pitch arrows on screen

/* The drawn sprite when there is one (tools/make-sprites.mjs), the emoji pair when not.
   Drawn creatures face right; `flip` turns your own side around to face its opponent. */
function Sprite({ species, big, flip }) {
  const s = sp(species);
  const art = SPRITES[species] || (SPECIES[species] ? null : SPRITES.kotodama);
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

export default function Quest({ cards = [], onAnswer }) {
  const [save, setSave] = useState(null);
  const [view, setView] = useState("map");                 // map | battle | team
  const [note, setNote] = useState(null);                  // a line under the map
  const [battle, setBattle] = useState(null);
  const [typed, setTyped] = useState("");
  const recentRef = useRef(new Set());                      // words asked this visit
  const recordedRef = useRef(new Set());                    // words already sent to memory this visit
  const inputRef = useRef(null);

  useEffect(() => {
    sGet(SAVE_KEY).then((raw) => {
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) {}
      setSave(normaliseSave(parsed, REGIONS));
    }).catch(() => setSave(normaliseSave(null, REGIONS)));
  }, []);
  const persist = useCallback((s) => { setSave(s); sSet(SAVE_KEY, JSON.stringify(s)); }, []);

  const region = save ? REGIONS[save.region] : REGIONS[0];
  const map = useMemo(() => parseMap(region.map), [region]);
  const cleared = !!save && save.cleared.includes(save.region);
  const power = useMemo(() => wordPower(cards), [cards]);
  const deckById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const proverb = useMemo(() => cards.find((c) => String(c.sec || "") === region.act + "-0") || null, [cards, region]);
  const actWords = useMemo(() => cards.filter((c) => actOf(c) === region.act && c.reading).length, [cards, region]);

  useEffect(() => { setSessionBusy(view === "battle"); return () => setSessionBusy(false); }, [view]);

  /* ── the map ── */
  const startBattle = useCallback((kind, s) => {
    const r = REGIONS[s.region];
    const foes = kind === "guardian"
      ? r.guardian.team.map(([id, plus]) => newMon(id, 2 + s.region * 3 + plus))
      : [newMon(r.wild[Math.floor(Math.random() * r.wild.length)], wildLevel(s.region))];
    let words = battleWords(cards, r.act, undefined, { recent: recentRef.current, seed: Date.now() % 97 });
    if (words.length < 3) { recentRef.current.clear(); words = battleWords(cards, r.act, undefined, { seed: Date.now() % 97 }); }
    if (!words.length) { setNote("No words for this act yet — they arrive with the deck."); return; }
    const lead = s.team[s.lead] && s.team[s.lead].hp > 0 ? s.lead : s.team.findIndex((m) => m.hp > 0);
    if (lead < 0) { persist(wakeAtShrine(s, REGIONS)); setNote("Your team was worn out, so you rested at the shrine."); return; }
    const first = words[0];
    setBattle({ kind, foes, fi: 0, words, wi: 0, phase: isNewWord(first) ? "learn" : "ask", catching: false,
                hinted: false, result: null, askedAt: Date.now(), xp: 0,
                line: kind === "guardian" ? `${r.guardian.name} steps forward.` : `A wild ${sp(foes[0].species).name} appeared!` });
    setTyped("");
    persist({ ...s, lead });
    setView("battle");
  }, [cards, persist]);

  const move = useCallback((dir) => {
    if (!save || view !== "map") return;
    const r = step({ x: save.x, y: save.y }, dir, map, { cleared });
    const s = { ...save, x: r.x, y: r.y };
    const ev = r.event;
    if (!ev) { setSave(s); setNote(null); return; }
    if (ev.type === "encounter") { startBattle("wild", s); return; }
    if (ev.type === "guardian") { startBattle("guardian", s); return; }
    if (ev.type === "shrine") {
      persist({ ...s, team: healAll(s.team), rest: { region: s.region } });
      setNote("You rest at the shrine. Your team is healed, and you'll wake here if you fall.");
      return;
    }
    if (ev.type === "sign") { setNote(region.sign); return; }
    if (ev.type === "locked") { setNote(`The road is closed. Beat ${region.guardian.name} to open it.`); return; }
    if (ev.type === "region") {
      const to = s.region + ev.to;
      if (to < 0 || to >= REGIONS.length) return;
      const p = arrival(parseMap(REGIONS[to].map), ev.to > 0 ? "west" : "east");
      persist({ ...s, region: to, x: p.x, y: p.y });
      setNote(`Act ${REGIONS[to].act} · ${REGIONS[to].name}`);
    }
  }, [save, view, map, cleared, region, persist, startBattle]);

  useEffect(() => {
    if (view !== "map") return undefined;
    const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const dir = KEYS[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, move]);

  /* ── the battle ── */
  const word = battle ? battle.words[battle.wi % battle.words.length] : null;
  const live = word ? (deckById.get(word.id) || word) : null;
  const foe = battle ? battle.foes[battle.fi] : null;
  const lead = save ? save.team[save.lead] : null;
  const leadStats = lead ? statsOf(lead.level, power) : null;

  useEffect(() => { if (battle && battle.phase === "ask" && inputRef.current) inputRef.current.focus(); }, [battle && battle.phase, battle && battle.wi]);

  const answer = () => {
    if (!battle || battle.phase !== "ask" || !live) return;
    const got = typed.trim();
    const ok = !!got && (gradeAnswer(live, got).ok || gradeAnswer(live, kanaOf(got)).ok);
    const ms = Date.now() - battle.askedAt;
    const hinted = battle.hinted || recentRef.current.has("new:" + live.id);
    recentRef.current.add(live.id);
    if (!recordedRef.current.has(live.id)) {
      recordedRef.current.add(live.id);
      if (onAnswer) onAnswer(live, ok, ms, { hinted, kana: kanaOf(got) });
    }
    try { playFeedback(ok); } catch (e) {}

    const team = save.team.slice();
    const foes = battle.foes.slice();
    let f = { ...foes[battle.fi] };
    const fMax = statsOf(f.level).maxHp;
    let line, phase = "result", fi = battle.fi, xp = battle.xp, leadIdx = save.lead;
    if (ok && battle.catching) {
      if (Math.random() < catchChance(f.hp, fMax)) {
        const s = { ...save, caught: save.caught.includes(f.species) ? save.caught : [...save.caught, f.species] };
        const joins = team.length < MAX_TEAM;
        if (joins) team.push({ ...f, xp: 0 });
        persist({ ...s, team });
        setBattle({ ...battle, phase: "caught", result: { ok, ms }, line: joins
          ? `Caught ${sp(f.species).name}! It joins your team.` : `Caught ${sp(f.species).name}! Your team is full, so it heads home.` });
        return;
      }
      line = `So close — ${sp(f.species).name} broke free!`;
    } else if (ok) {
      const fast = !hinted && ms < FAST_MS;
      const dmg = damageFor({ atk: leadStats.atk, hinted, fast });
      f.hp = Math.max(0, f.hp - dmg);
      line = `${fast ? "Critical! " : ""}${sp(lead.species).name} hits for ${dmg}.`;
      foes[battle.fi] = f;
      if (f.hp <= 0) {
        xp += f.level * 8;
        if (battle.fi + 1 < foes.length) {
          fi = battle.fi + 1;
          line += ` ${sp(f.species).name} is out! ${REGIONS[save.region].guardian.name} sends ${sp(foes[fi].species).name}.`;
        } else {
          phase = "won";
          line += ` ${sp(f.species).name} is out!`;
        }
      }
    } else {
      const hit = counterFor(f);
      const l = { ...team[save.lead], hp: Math.max(0, team[save.lead].hp - hit) };
      team[save.lead] = l;
      line = `${sp(f.species).name} hits back for ${hit}.`;
      if (l.hp <= 0) {
        const next = team.findIndex((m) => m.hp > 0);
        if (next < 0) { phase = "lost"; line += ` ${sp(l.species).name} is worn out.`; }
        else { line += ` ${sp(l.species).name} is worn out — ${sp(team[next].species).name}, you're up!`; leadIdx = next; }
      }
    }
    persist({ ...save, team, lead: leadIdx });
    setBattle({ ...battle, foes, fi, xp, phase, catching: false, line, result: { ok, ms } });
  };

  const nextTurn = () => {
    if (!battle) return;
    const wi = battle.wi + 1;
    const w = battle.words[wi % battle.words.length];
    setTyped("");
    setBattle({ ...battle, wi, phase: isNewWord(deckById.get(w.id) || w) && !recentRef.current.has(w.id) ? "learn" : "ask",
                hinted: false, result: null, askedAt: Date.now(), line: battle.line });
  };

  const finish = () => {
    if (!battle) return;
    let s = save;
    if (battle.phase === "won") {
      const { mon, levelled } = gainXp(s.team[s.lead], battle.xp);
      const team = s.team.slice(); team[s.lead] = mon;
      s = { ...s, team, wins: (s.wins || 0) + 1 };
      if (battle.kind === "guardian" && !s.cleared.includes(s.region)) s = { ...s, cleared: [...s.cleared, s.region] };
      setNote(battle.kind === "guardian"
        ? (s.region + 1 < REGIONS.length ? `The road east is open! ${levelled ? sp(mon.species).name + " grew to level " + mon.level + "." : ""}`
                                          : `You've cleared every act. 全部できた！`)
        : `+${battle.xp} experience.${levelled ? " " + sp(mon.species).name + " grew to level " + mon.level + "!" : ""}`);
    } else if (battle.phase === "lost") {
      s = wakeAtShrine(s, REGIONS);
      setNote("You woke up at the shrine, team rested. The words you missed will come back around.");
    } else if (battle.phase === "fled") {
      setNote("You got away safely.");
    } else if (battle.phase === "caught") {
      setNote(null);
    }
    persist(s);
    setBattle(null);
    setView("map");
  };

  if (!save) return <div className="tc-empty">Loading your adventure…</div>;

  /* ── team ── */
  if (view === "team") {
    return (
      <div className="tc-quest">
        <div className="tc-qhead"><b>Your team</b><button type="button" className="tc-btn tc-btn-sm" onClick={() => setView("map")}>Back to the map</button></div>
        <p className="tc-qnote">Word power +{power}: every five words you can say adds one to every attack.</p>
        {save.team.map((m, i) => {
          const st = statsOf(m.level, power);
          return (
            <div key={i} className={"tc-qmon" + (i === save.lead ? " is-lead" : "")}>
              <Sprite species={m.species} />
              <div className="tc-qmoninfo">
                <p><b>{sp(m.species).name}</b> <span lang="ja">{sp(m.species).ja}</span> · Lv {m.level}</p>
                <HpBar hp={m.hp} max={st.maxHp} />
                <p className="tc-qfrom" lang="ja">{sp(m.species).from}</p>
              </div>
              {i !== save.lead && m.hp > 0 && (
                <button type="button" className="tc-btn tc-btn-sm" onClick={() => persist({ ...save, lead: i })}>Lead</button>
              )}
            </div>
          );
        })}
        <p className="tc-qnote">Creatures found: {save.caught.length} of {Object.keys(SPECIES).length}</p>
      </div>
    );
  }

  /* ── battle ── */
  if (view === "battle" && battle && foe) {
    const fMax = statsOf(foe.level).maxHp;
    const canCatch = battle.kind === "wild" && foe.hp > 0 && foe.hp / fMax <= CATCH_AT;
    const over = ["won", "lost", "fled", "caught"].includes(battle.phase);
    const want = live ? shown(live.term) : "";
    const reading = live ? shown(live.reading) : "";
    return (
      <div className="tc-quest">
        <div className="tc-qfoe">
          <Sprite species={foe.species} big />
          <div>
            <p><b>{sp(foe.species).name}</b> <span lang="ja">{sp(foe.species).ja}</span> · Lv {foe.level}</p>
            <HpBar hp={foe.hp} max={fMax} />
            {battle.kind === "guardian" && <p className="tc-qnote">{REGIONS[save.region].guardian.emoji} {REGIONS[save.region].guardian.name} · {battle.fi + 1} of {battle.foes.length}</p>}
          </div>
        </div>
        <div className="tc-qlead">
          <Sprite species={lead.species} flip />
          <div>
            <p><b>{sp(lead.species).name}</b> · Lv {lead.level}</p>
            <HpBar hp={lead.hp} max={leadStats.maxHp} />
          </div>
        </div>
        <p className="tc-qline" aria-live="polite">{battle.line}</p>

        {battle.phase === "learn" && live && (
          <div className="tc-qcard">
            <p className="tc-qeyebrow">New word — learn it, then use it</p>
            <p className="tc-qword" lang="ja">{want} <SpeakBtn text={reading || want} /></p>
            {reading && reading !== want && <p className="tc-qread" lang="ja">{reading}</p>}
            <p className="tc-qmean">{glossOf(live)}</p>
            <button type="button" className="tc-btn tc-btn-primary" autoFocus
                    onClick={() => { recentRef.current.add("new:" + live.id); setBattle({ ...battle, phase: "ask", hinted: true, askedAt: Date.now() }); }}>
              Got it — attack!
            </button>
          </div>
        )}

        {battle.phase === "ask" && live && (
          <form className="tc-qcard" onSubmit={(e) => { e.preventDefault(); answer(); }}>
            <p className="tc-qeyebrow">{battle.catching ? "Catch it — say this in Japanese" : "Attack — say this in Japanese"}</p>
            <p className="tc-qmean">{live.emoji ? live.emoji + " " : ""}{glossOf(live)}</p>
            {battle.hinted && <p className="tc-qhint" lang="ja">{hintFor(reading)}</p>}
            <input ref={inputRef} className="tc-input" value={typed} onChange={(e) => setTyped(e.target.value)}
                   placeholder="type in rōmaji or kana" aria-label="Your answer in Japanese"
                   autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} />
            <p className="tc-qkana" lang="ja" aria-hidden="true">{typed.trim() ? kanaOf(typed) : "　"}</p>
            <div className="tc-qbtns">
              <button type="submit" className="tc-btn tc-btn-primary">{battle.catching ? "Throw" : "Attack"}</button>
              {!battle.hinted && <button type="button" className="tc-btn" onClick={() => setBattle({ ...battle, hinted: true })}>Hint (weaker hit)</button>}
              {canCatch && !battle.catching && <button type="button" className="tc-btn" onClick={() => setBattle({ ...battle, catching: true })}>Catch</button>}
              {battle.kind === "wild" && <button type="button" className="tc-btn" onClick={() => setBattle({ ...battle, phase: "fled", line: "You slipped away." })}>Run</button>}
            </div>
          </form>
        )}

        {(battle.phase === "result" || over) && battle.phase !== "fled" && live && battle.result && (
          <div className={"tc-qcard " + (battle.result.ok ? "is-ok" : "is-miss")}>
            <p className="tc-qeyebrow">{battle.result.ok ? "Right!" : "Not quite — it's:"}</p>
            <p className="tc-qword" lang="ja">{want} <SpeakBtn text={reading || want} /></p>
            {reading && reading !== want && <p className="tc-qread" lang="ja">{reading}</p>}
            <p className="tc-qmean">{glossOf(live)}</p>
          </div>
        )}

        {battle.phase === "won" && battle.kind === "guardian" && proverb && (
          <p className="tc-qnote">{REGIONS[save.region].guardian.name}: <span lang="ja">「{shown(proverb.term)}」</span> — {glossOf(proverb)}. You've earned the road ahead.</p>
        )}

        {battle.phase === "result" && <button type="button" className="tc-btn tc-btn-primary tc-qnext" autoFocus onClick={nextTurn}>Next →</button>}
        {over && <button type="button" className="tc-btn tc-btn-primary tc-qnext" autoFocus onClick={finish}>Back to the map</button>}
      </div>
    );
  }

  /* ── map ── */
  const guardianEmoji = REGIONS[save.region].guardian.emoji;
  const intro = (save.wins || 0) === 0 && save.region === 0 && !cleared;
  return (
    <div className="tc-quest">
      <div className="tc-qhead">
        <div>
          <b>Act {region.act} · {region.name}</b> <span lang="ja" className="tc-qja">{region.ja}</span>
          <p className="tc-qnote">{actWords} words live here{cleared ? " · guardian beaten" : ""}</p>
        </div>
        <button type="button" className="tc-btn tc-btn-sm" onClick={() => setView("team")}>
          {sp(lead.species).emoji} Team
        </button>
      </div>
      {intro && (
        <p className="tc-qnote tc-qintro">
          Welcome to Kotoba Quest. Your partner <b>Kotodama</b> fights with words: you'll see the English and type the
          Japanese. Walk into tall grass to meet wild creatures, catch them when they're weak, and beat {region.guardian.name}
          {" "}to open the road east.
        </p>
      )}
      <div className="tc-qmap" role="img" aria-label={`Map of ${region.name}. You are at column ${save.x + 1}, row ${save.y + 1}.`}>
        {region.map.map((row, y) => Array.from(row).map((ch, x) => {
          let [kind, glyph] = TILE[ch] || ["ground", ""];
          if (ch === "G") { kind = cleared ? "path" : "guardian"; glyph = cleared ? "" : guardianEmoji; }
          if (ch === ">") { kind = "gate"; glyph = cleared ? "➡️" : "🔒"; }
          const here = x === save.x && y === save.y;
          return (
            <div key={x + "," + y} className={"tc-qt tc-qt-" + kind}>
              {here ? <span className="tc-qme">🚶</span> : glyph}
            </div>
          );
        }))}
      </div>
      {note && <p className="tc-qline" aria-live="polite">{note}</p>}
      <div className="tc-qpad" role="group" aria-label="Move">
        <button type="button" className="tc-btn tc-qup" aria-label="Move up" onClick={() => move("up")}>▲</button>
        <button type="button" className="tc-btn tc-qleft" aria-label="Move left" onClick={() => move("left")}>◀</button>
        <button type="button" className="tc-btn tc-qright" aria-label="Move right" onClick={() => move("right")}>▶</button>
        <button type="button" className="tc-btn tc-qdown" aria-label="Move down" onClick={() => move("down")}>▼</button>
      </div>
      <p className="tc-qnote tc-qkeys">Arrow keys or WASD work too. ⛩️ heals your team · 📜 read the sign · {guardianEmoji} the act's guardian</p>
    </div>
  );
}
