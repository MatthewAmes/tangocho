/* Japanese speech. One audio element and one token shared by the whole app, so a slow request can never play over a newer one; the Web Speech API is the fallback when the server voice is unavailable. The mutable module state is deliberate — this is a singleton device, and splitting the audio element from the code that reuses it would make it two different elements. esbuild enforces that: an ESM import is an immutable binding, so a half-moved singleton fails the build instead of quietly becoming two. */

import { loadSession } from "./session.js";


/* ── Japanese text-to-speech ── */
// Primary: Google Cloud TTS (Neural2 voices) via our own Netlify Function —
// far more natural and pitch-accent-accurate than the browser's built-in
// voices. Falls back to browser speechSynthesis if the network call fails
// (offline, function not yet configured, etc).
export const TTS_ENDPOINT = "/.netlify/functions/tts";

export const TTS_OK = typeof window !== "undefined" && !!window.speechSynthesis;

let JP_VOICE = null;

export function pickJpVoice() {
  if (!TTS_OK) return null;
  const vs = window.speechSynthesis.getVoices() || [];
  JP_VOICE = vs.find((v) => /^ja([-_]|$)/i.test(v.lang)) || null;
  return JP_VOICE;
}

export function ttsUnlock() {           // iOS: first speak must happen inside a user tap
  if (!TTS_OK) return;
  try { const u = new SpeechSynthesisUtterance(""); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) {}
}

export function speakJaFallback(text, rate) {
  if (!TTS_OK || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (JP_VOICE) u.voice = JP_VOICE;
    u.rate = rate || 0.9;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

export function prefetchJa(text, rate, voice) {
  // Fire-and-forget: warms the browser's own HTTP cache for this exact URL (TTS responses
  // are served with a long immutable max-age) so that when speakJa() actually plays this
  // same card/line later, it's served instantly from disk — no network round-trip at all.
  // Plain unauthenticated GET on purpose: on a cache hit this is free and instant; on a
  // cache miss it just 401s harmlessly (never forces a real Google TTS generation call).
  if (typeof text !== "string" && typeof text !== "number") return;   // see speakJa
  if (!text) return;
  const url = TTS_ENDPOINT + "?text=" + encodeURIComponent(text) + "&rate=" + (rate || 0.9) + (voice === "m" ? "&voice=m" : "");
  try { fetch(url, { cache: "force-cache" }).catch(() => {}); } catch (e) {}
}

let _ttsAudioEl = null;

let _ttsObjectUrl = null;

let _ttsToken = 0;

export function speakJa(text, rate, voice) {
  // Anything that isn't a string or number is a caller that forgot to resolve a
  // prop-dependent line into text. encodeURIComponent below stringifies whatever it is
  // given, so a stray function reaches the TTS service as its own source and gets read
  // aloud — which is how the oral exam started reciting JavaScript. Refuse it instead.
  if (typeof text !== "string" && typeof text !== "number") return;
  if (!text) return;
  const myToken = ++_ttsToken;
  const url = TTS_ENDPOINT + "?text=" + encodeURIComponent(text) + "&rate=" + (rate || 0.9) + (voice === "m" ? "&voice=m" : "");
  let fallbackFired = false;   // onerror and play().catch() can BOTH fire for one call — only escalate once
  const escalate = () => {
    if (fallbackFired || myToken !== _ttsToken) return;
    fallbackFired = true;
    speakJaAuthed(url, text, rate, myToken);
  };
  try {
    if (!_ttsAudioEl) _ttsAudioEl = new Audio();
    // Cached clips play instantly and need no auth. A cache miss (brand-new
    // word) 401s here — retry it authenticated, since generating new audio
    // costs real Google API usage and is gated to a signed-in session.
    _ttsAudioEl.onerror = escalate;
    _ttsAudioEl.src = url;
    const p = _ttsAudioEl.play();
    if (p && p.catch) p.catch(escalate);
  } catch (e) {
    escalate();
  }
}

export async function speakJaAuthed(url, text, rate, myToken) {
  const stillCurrent = () => myToken === _ttsToken;
  const session = loadSession();
  if (!session) { if (stillCurrent()) speakJaFallback(text, rate); return; }
  try {
    const res = await fetch(url, { headers: { authorization: "Bearer " + session }, cache: "no-store" });
    if (!stillCurrent()) return;
    if (!res.ok) { speakJaFallback(text, rate); return; }
    const blob = await res.blob();
    if (!stillCurrent()) return;
    if (_ttsObjectUrl) URL.revokeObjectURL(_ttsObjectUrl);
    _ttsObjectUrl = URL.createObjectURL(blob);
    if (!_ttsAudioEl) _ttsAudioEl = new Audio();
    _ttsAudioEl.onerror = null;
    _ttsAudioEl.src = _ttsObjectUrl;
    _ttsAudioEl.play().catch(() => { if (stillCurrent()) speakJaFallback(text, rate); });
  } catch (e) {
    if (stillCurrent()) speakJaFallback(text, rate);
  }
}

export function stopJa() {
  _ttsToken++;   // invalidate any in-flight fallback chain from the call being stopped
  try { if (_ttsAudioEl) _ttsAudioEl.pause(); } catch (e) {}
  if (TTS_OK) { try { window.speechSynthesis.cancel(); } catch (e) {} }
}
