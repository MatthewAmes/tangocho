/* Storage layer. Handles localStorage with Claude.ai artifact sandbox fallback and memory fallback. */
const mem = {};
let _onWrite = null;

export function onStorageWrite(fn) {
  _onWrite = fn;
}

export async function sGet(key) {
  try {
    if (typeof window !== "undefined" && window.storage?.get) {
      const r = await window.storage.get(key);
      if (r) return r.value;
    }
  } catch (e) { /* key missing or unavailable */ }
  try {
    if (typeof window !== "undefined") {
      const v = window.localStorage.getItem(key);
      if (v !== null) return v;
    }
  } catch (e) { /* localStorage blocked (private mode, disabled, etc.) */ }
  return key in mem ? mem[key] : null;
}

export async function sSet(key, value) {
  let ok = false;
  for (let i = 0; i < 2 && !ok; i++) {
    if (typeof window === "undefined" || !window.storage?.set) break;
    try { await window.storage.set(key, value); mem[key] = value; ok = true; }
    catch (e) { await new Promise((res) => setTimeout(res, 600)); /* retry once */ }
  }
  if (!ok) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, value);
        mem[key] = value;
        ok = true;
      }
    } catch (e) { /* quota exceeded or storage blocked */ }
  }
  if (!ok) mem[key] = value;
  if (ok && _onWrite) {
    try { _onWrite(key); } catch (e) {}
  }
  return ok;
}
