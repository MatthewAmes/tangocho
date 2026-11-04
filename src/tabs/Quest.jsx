import React, { useState, useEffect, useRef, useCallback } from "react";
import { sGet, sSet } from "../lib/storage.js";
import { setSessionBusy } from "../lib/session.js";
import { playFeedback } from "../lib/sfx.js";
import { ttsUnlock, speakJa } from "../lib/tts.js";
import { SPECIES } from "../data/quest-world.js";
import { SPRITES } from "../data/quest-sprites.js";
import { ARENAS, HERO } from "../data/quest-world-art.js";
import { LINES, STAGES } from "../data/run-orders.js";
import { W, H, newRun, step, applyUpgrade, upgradeChoices, worstWords, finalScore, kindOf } from "../../tools/run-game.mjs";
import { parseJa, rubyParts } from "../../tools/ja-markup.mjs";

/* ── Kotoba Quest ──
   Survive the swarm. You only move; your partner fires by itself. Kotodama shouts one short
   order in Japanese every few seconds, and understanding it is what keeps you alive. The rules
   are in tools/run-game.mjs; this file draws them and takes your input. */

const SAVE_KEY = "jpn101:run";
const BOLT = { plain: "#f4f0ff", cold: "#8fdcff", hot: "#ff9a3a", bright: "#ffe45a" };
const KIND_ICON = { plain: "⭐", cold: "❄️", hot: "🔥", bright: "☀️" };

const images = {};
const img = (src) => { if (!images[src]) { images[src] = new Image(); images[src].src = src; } return images[src]; };

function Ja({ src }) {
  return (
    <span lang="ja">
      {parseJa(src).map((t, i) => (t.word
        ? rubyParts(t.word, t.reading).map((p, k) => (p.ruby ? <ruby key={i + "-" + k}>{p.text}<rt>{p.ruby}</rt></ruby> : <React.Fragment key={i + "-" + k}>{p.text}</React.Fragment>))
        : <React.Fragment key={i}>{t.text}</React.Fragment>))}
    </span>
  );
}

function Partners({ owned, chosen, onPick }) {
  return (
    <div className="tc-qparty">
      {Object.keys(SPECIES).map((id) => {
        const have = owned.includes(id);
        return (
          <button key={id} type="button" disabled={!have} aria-pressed={chosen === id} aria-label={have ? SPECIES[id].name : "Locked creature"}
                  className={"tc-qpick" + (chosen === id ? " is-on" : "") + (have ? "" : " is-locked")} onClick={() => onPick(id)}>
            <img src={SPRITES[id]} alt="" draggable={false} />
            {have && <i>{KIND_ICON[kindOf(id)]}</i>}
          </button>
        );
      })}
    </div>
  );
}

export default function Quest() {
  const [screen, setScreen] = useState("title");       // title | play | level | over
  const [save, setSave] = useState({ best: 0, partners: ["kotodama"], partner: "kotodama", sound: true });
  const [shout, setShout] = useState(null);            // the order on screen, or how it went
  const [choices, setChoices] = useState([]);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);

  const rootRef = useRef(null), canvasRef = useRef(null), runRef = useRef(null), keys = useRef(new Set()), stick = useRef(null);
  const fx = useRef({ sparks: [], shake: 0, flash: 0 });
  const hpRef = useRef(null), xpRef = useRef(null), timeRef = useRef(null), scoreRef = useRef(null), timerRef = useRef(null);
  const saveRef = useRef(save), screenRef = useRef(screen), pausedRef = useRef(false);
  saveRef.current = save; screenRef.current = screen; pausedRef.current = paused;
  const calm = useRef(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    sGet(SAVE_KEY).then((raw) => {
      try { const s = raw ? JSON.parse(raw) : null; if (s) setSave((d) => ({ ...d, ...s, partners: s.partners && s.partners.length ? s.partners : d.partners })); } catch (e) {}
    }).catch(() => {});
  }, []);
  const store = useCallback((patch) => {
    const next = { ...saveRef.current, ...patch };
    saveRef.current = next; setSave(next); sSet(SAVE_KEY, JSON.stringify(next));
  }, []);
  useEffect(() => { setSessionBusy(screen === "play" || screen === "level"); return () => setSessionBusy(false); }, [screen]);

  const start = useCallback(() => {
    ttsUnlock();
    runRef.current = newRun(saveRef.current.partner);
    fx.current = { sparks: [], shake: 0, flash: 0 };
    setShout(null); setResult(null); setPaused(false); setScreen("play");
    if (rootRef.current) rootRef.current.scrollIntoView({ block: "start" });
  }, []);

  const pickUpgrade = useCallback((id) => {
    const s = runRef.current;
    applyUpgrade(s, id);
    if (s.pendingLevels > 0) setChoices(upgradeChoices(Math.random));
    else setScreen("play");
  }, []);

  /* What just happened in the rules becomes sound, sparks and the shout at the top. */
  const handleEvents = useCallback((s) => {
    const f = fx.current;
    const burst = (x, y, color, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 30 + Math.random() * 80; f.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color }); } };
    for (const e of s.events) {
      if (e.type === "order") {
        setShout({ j: e.order.j, state: "go" });
        if (saveRef.current.sound) { try { speakJa(e.order.say, 1); } catch (err) {} }
      } else if (e.type === "obeyed") {
        setShout({ j: e.order.j, state: "ok" });
        burst(e.x, e.y, "#ffe45a", 40); f.shake = 5; f.flash = 0.12;
        try { playFeedback(true); } catch (err) {}
      } else if (e.type === "missed") {
        setShout({ j: e.order.j, en: e.order.en, state: "miss" });
        f.shake = 9; f.flash = -0.3;
        try { playFeedback(false); } catch (err) {}
      } else if (e.type === "kill") burst(e.x, e.y, e.boss ? "#ff7a5a" : "#ffffff", e.boss ? 40 : 6);
      else if (e.type === "hit") { burst(e.x, e.y, "#ff5a5a", 6); f.shake = Math.max(f.shake, 3); }
      else if (e.type === "boss") setShout({ j: LINES.boss, state: "boss" });
      else if (e.type === "caught") {
        const owned = saveRef.current.partners;
        if (!owned.includes(e.species)) store({ partners: [...owned, e.species] });
      } else if (e.type === "level") { setChoices(upgradeChoices(Math.random)); setScreen("level"); }
      else if (e.type === "over") {
        const score = finalScore(s), isBest = score > (saveRef.current.best || 0);
        if (isBest) store({ best: score });
        setResult({ score, isBest, seconds: Math.floor(s.t), kills: s.kills, obeyed: s.obeyed, words: worstWords(s), caught: s.caught.slice(), stage: s.stage });
        setShout(null); setScreen("over");
      }
    }
    s.events.length = 0;
  }, [store]);

  /* ── the loop ── */
  useEffect(() => {
    let raf = 0, last = performance.now();
    const draw = (s, dt) => {
      const c = canvasRef.current; if (!c) return;
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
      const f = fx.current;
      const shake = calm.current ? 0 : f.shake;
      g.save();
      if (shake > 0.2) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      const bg = img(ARENAS[STAGES[s ? s.stage : 0]]);
      if (bg.complete) g.drawImage(bg, 0, 0, W, H); else { g.fillStyle = "#3f7d3f"; g.fillRect(0, 0, W, H); }
      if (s) {
        const o = s.order, h = s.hero;
        if (o && o.pads.length) for (const p of o.pads) {
          g.globalAlpha = 0.92; g.fillStyle = p.fill || "#ffffff33";
          if (!p.species) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.3); g.fill(); }
          g.globalAlpha = 1; g.strokeStyle = "#1c1430"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.3); g.stroke();
          if (p.icon) { g.font = "24px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#000"; g.fillText(p.icon, p.x, p.y + 1); }
          if (p.species) { const im = img(SPRITES[p.species]); if (im.complete) g.drawImage(im, p.x - 24, p.y - 24, 48, 48); }
        }
        for (const gem of s.gems) { g.fillStyle = "#7ae8ff"; g.fillRect(gem.x - 2, gem.y - 2, 4, 4); g.fillStyle = "#ffffff"; g.fillRect(gem.x - 2, gem.y - 2, 2, 2); }
        const sorted = s.foes.slice().sort((a, b) => a.y - b.y);
        for (const e of sorted) {
          const im = img(SPRITES[e.species]), size = e.boss ? 48 : 24;
          g.save(); g.translate(e.x, e.y);
          if (e.left) g.scale(-1, 1);
          if (im.complete) g.drawImage(im, -size / 2, -size / 2, size, size);
          if (e.flash > 0) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.7; if (im.complete) g.drawImage(im, -size / 2, -size / 2, size, size); }
          g.restore();
          if (e.boss) { g.fillStyle = "#000"; g.fillRect(e.x - 22, e.y - 30, 44, 4); g.fillStyle = "#ff5a5a"; g.fillRect(e.x - 21, e.y - 29, 42 * Math.max(0, e.hp / e.maxHp), 2); }
        }
        g.fillStyle = BOLT[s.kind] || "#fff";
        for (const b of s.bolts) { const r = s.gun.size; g.fillRect(b.x - r, b.y - r, r * 2, r * 2); }
        const blink = h.inv > 0 && Math.floor(h.inv * 16) % 2 === 0;
        if (!blink) {
          const frames = HERO[h.dir] || HERO.down, pic = img(frames[Math.floor(h.walk / 10) % 2]);
          g.save(); g.translate(h.x, h.y); if (h.left) g.scale(-1, 1);
          if (pic.complete) g.drawImage(pic, -8, -14, 16, 20);
          g.restore();
        }
        const pal = img(SPRITES[s.partner]), a = s.t * 2.2;
        if (pal.complete) g.drawImage(pal, h.x + Math.cos(a) * 16 - 8, h.y + Math.sin(a) * 12 - 16, 16, 16);
        for (const p of f.sparks) { g.fillStyle = p.color; g.globalAlpha = Math.max(0, p.life * 2); g.fillRect(p.x, p.y, 2, 2); }
        g.globalAlpha = 1;
      }
      g.restore();
      if (f.flash !== 0) { g.fillStyle = f.flash > 0 ? "rgba(255,255,200," + f.flash * 3 + ")" : "rgba(255,40,40," + -f.flash + ")"; g.fillRect(0, 0, W, H); }
      for (const p of f.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      f.sparks = f.sparks.filter((p) => p.life > 0);
      f.shake = Math.max(0, f.shake - dt * 30);
      f.flash = f.flash > 0 ? Math.max(0, f.flash - dt) : Math.min(0, f.flash + dt);
    };
    const hud = (s) => {
      if (!s) return;
      if (hpRef.current) hpRef.current.style.width = Math.max(0, (s.hero.hp / s.hero.maxHp) * 100) + "%";
      if (xpRef.current) xpRef.current.style.width = (s.xp / s.xpNext) * 100 + "%";
      if (timeRef.current) timeRef.current.textContent = Math.floor(s.t / 60) + ":" + String(Math.floor(s.t % 60)).padStart(2, "0");
      if (scoreRef.current) scoreRef.current.textContent = finalScore(s).toLocaleString();
      if (timerRef.current) timerRef.current.style.width = s.order ? Math.max(0, (s.order.left / s.order.dur) * 100) + "%" : "0%";
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = runRef.current;
      if (s && screenRef.current === "play" && !pausedRef.current) {
        let dx = 0, dy = 0;
        const k = keys.current;
        if (k.has("ArrowLeft") || k.has("a")) dx -= 1;
        if (k.has("ArrowRight") || k.has("d")) dx += 1;
        if (k.has("ArrowUp") || k.has("w")) dy -= 1;
        if (k.has("ArrowDown") || k.has("s")) dy += 1;
        if (stick.current && stick.current.active) { dx += stick.current.dx; dy += stick.current.dy; }
        step(s, { dx, dy }, dt);
        handleEvents(s);
      }
      draw(screenRef.current === "title" ? null : s, pausedRef.current ? 0 : dt);
      hud(s);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents]);

  /* ── input ── */
  useEffect(() => {
    const MOVE = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"]);
    const down = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const now = screenRef.current;
      if (now === "play") {
        if (MOVE.has(e.key)) { keys.current.add(e.key); e.preventDefault(); }
        if (e.key === "Escape" || e.key === "p") setPaused((p) => !p);
      } else if (now === "level" && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        const b = document.querySelectorAll(".tc-qlevel button")[+e.key - 1];
        if (b) b.click();
      }
    };
    const up = (e) => keys.current.delete(e.key);
    const hide = () => { keys.current.clear(); if (document.visibilityState === "hidden" && screenRef.current === "play") setPaused(true); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
      window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  /* Drag anywhere on the arena to move: the further you pull, the faster you go. */
  const onDown = (e) => { if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); stick.current = { active: true, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 }; };
  const onMove = (e) => {
    const st = stick.current; if (!st || !st.active) return;
    const dx = e.clientX - st.ox, dy = e.clientY - st.oy, d = Math.hypot(dx, dy);
    if (d < 6) { st.dx = 0; st.dy = 0; return; }
    const k = Math.min(1, d / 40) / d;
    st.dx = dx * k; st.dy = dy * k;
  };
  const onUp = () => { stick.current = null; };

  const playing = screen === "play" || screen === "level";
  return (
    <div className="tc-quest" ref={rootRef}>
      {playing && (
        <div className="tc-qhud">
          <span className="tc-qbar tc-qbar-hp" role="img" aria-label="Health"><i ref={hpRef} /></span>
          <b ref={timeRef} className="tc-qtime">0:00</b>
          <b ref={scoreRef} className="tc-qscore">0</b>
          <button type="button" className="tc-btn tc-btn-sm" aria-label={save.sound ? "Turn the voice off" : "Turn the voice on"} onClick={() => store({ sound: !save.sound })}>{save.sound ? "🔊" : "🔇"}</button>
          <button type="button" className="tc-btn tc-btn-sm" aria-label={paused ? "Resume" : "Pause"} onClick={() => setPaused(!paused)}>{paused ? "▶" : "⏸"}</button>
          <span className="tc-qbar tc-qbar-xp" role="img" aria-label="Experience"><i ref={xpRef} /></span>
        </div>
      )}
      {playing && (
        <div className={"tc-qshout" + (shout ? " is-" + shout.state : "")} aria-live="assertive">
          {shout ? <p><Ja src={shout.j} />{shout.en && <small> = {shout.en}</small>}</p> : <p className="tc-qquiet">　</p>}
          <span className="tc-qclock"><i ref={timerRef} /></span>
        </div>
      )}

      <div className="tc-qstage">
        <canvas ref={canvasRef} width={W} height={H} className="tc-qarena" aria-label="The arena. Use the arrow keys or drag to move."
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

        {screen === "title" && (
          <div className="tc-qover">
            <h2 className="tc-qtitle"><Ja src={LINES.title} /></h2>
            <p className="tc-qhow">Move with the arrow keys, or drag on a phone. Your partner fires by itself.<br />
              When Kotodama shouts an order, <b>obey it fast.</b></p>
            {save.best > 0 && <p className="tc-qbest">Best: {save.best.toLocaleString()}</p>}
            <Partners owned={save.partners} chosen={save.partner} onPick={(id) => store({ partner: id })} />
            <button type="button" className="tc-btn tc-btn-primary tc-qstart" autoFocus onClick={start}>Start ▶</button>
          </div>
        )}

        {screen === "level" && (
          <div className="tc-qover tc-qlevel">
            <h2 className="tc-qtitle">Lv UP!</h2>
            <div className="tc-qups">
              {choices.map((u, i) => (
                <button key={u.id} type="button" className="tc-btn" autoFocus={i === 0} onClick={() => pickUpgrade(u.id)}>
                  <em aria-hidden="true">{u.icon}</em><Ja src={u.j} />
                </button>
              ))}
            </div>
          </div>
        )}

        {paused && screen === "play" && (
          <div className="tc-qover">
            <h2 className="tc-qtitle">⏸</h2>
            <button type="button" className="tc-btn tc-btn-primary tc-qstart" autoFocus onClick={() => setPaused(false)}>Resume ▶</button>
          </div>
        )}

        {screen === "over" && result && (
          <div className="tc-qover">
            <h2 className="tc-qtitle"><Ja src={LINES.over} /></h2>
            <p className="tc-qbig">{result.score.toLocaleString()}{result.isBest && <small> <Ja src={LINES.newBest} /></small>}</p>
            <p className="tc-qstats">{Math.floor(result.seconds / 60)}:{String(result.seconds % 60).padStart(2, "0")} · {result.kills} defeated · orders obeyed: {result.obeyed}</p>
            {result.caught.length > 0 && (
              <div className="tc-qcaught">
                {result.caught.map((id) => <img key={id} src={SPRITES[id]} alt={SPECIES[id].name} draggable={false} />)}
                <span>New partner!</span>
              </div>
            )}
            {result.words.length > 0 && (
              <ul className="tc-qmissed">
                {result.words.map((w) => <li key={w.id}><b><Ja src={w.j} /></b> <span>{w.en}</span></li>)}
              </ul>
            )}
            <Partners owned={save.partners} chosen={save.partner} onPick={(id) => store({ partner: id })} />
            <button type="button" className="tc-btn tc-btn-primary tc-qstart" autoFocus onClick={start}><Ja src={LINES.again} /> ▶</button>
          </div>
        )}
      </div>
    </div>
  );
}
