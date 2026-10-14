/* ── "something's wrong with this card" ──
   One tap during a session saves the card as it was shown — what it said, what was
   answered, what the app expected — and the session carries on. The flags sync like any
   other study data and are read back in a Claude Code session, where the card gets fixed.

   It exists because the fastest way to find the remaining bad cards (a wrong gloss, a
   reading that cannot be typed, a prompt that makes no sense) is the person studying them,
   at the moment they hit one — not an audit afterwards.

   Merged across devices by union, not last-writer-wins: a flag raised on the phone must not
   be erased by the laptop's older copy. Pure — see tools/test-flags.mjs. */

export const FLAGS_KEY = "jpn101:flags";
export const FLAG_CAP = 300;
export const FLAG_REASONS = ["wrong meaning", "wrong reading", "makes no sense", "other"];

const keyOf = (f) => `${f.id}@${f.at}`;

export function addFlag(list = [], rec) {
  if (!rec || !rec.id) return list;
  const f = { ...rec, at: rec.at || Date.now(), reason: rec.reason || null };
  return [...(Array.isArray(list) ? list : []), f].slice(-FLAG_CAP);
}

export function setReason(list = [], at, reason) {
  return (Array.isArray(list) ? list : []).map((f) => (f.at === at ? { ...f, reason } : f));
}

export function mergeFlags(localRaw, cloudRaw) {
  const parse = (r) => { try { const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const by = new Map();
  for (const f of [...parse(cloudRaw), ...parse(localRaw)]) {
    if (!f || !f.id) continue;
    const k = keyOf(f), had = by.get(k);
    by.set(k, had ? { ...had, ...f, reason: f.reason || had.reason || null } : f);
  }
  return JSON.stringify([...by.values()].sort((a, b) => a.at - b.at).slice(-FLAG_CAP));
}
