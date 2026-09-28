/* ── answer sounds ──
   Two short tones made on the fly with Web Audio: a rising pair for right, one low note for
   wrong. No audio files to ship, cache or fail to load, and nothing that needs the network.

   Deliberately quiet and short (under a quarter of a second). The sound confirms what the
   colour already says; it must never compete with the spoken Japanese that follows it.

   Guarded like listen.js: tools/test-modules.mjs imports every module in Node, where there
   is no window and no AudioContext. */

const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext || null) : null;
let ctx = null;

function tone(freq, start, dur, type = "sine", peak = 0.08) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playFeedback(ok) {
  if (!AC) return;
  try {
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    if (ok) { tone(660, 0, 0.11); tone(990, 0.08, 0.14); }
    else tone(196, 0, 0.22, "triangle", 0.1);
  } catch (e) { /* sound is a nicety; a browser that refuses it loses nothing */ }
}
