// Sync merge rules: how a local snapshot and the cloud snapshot combine after a pull.
// This is the highest data-loss-risk code in the app (a wrong rule here silently drops a
// study session), so it lives in its own pure, testable module rather than inline in the
// 10k-line JSX — see tools/test-merge.mjs.

export function cardMergeKey(c) { return c.term + "|" + (c.lesson || "") + "|" + (c.sec || ""); }   // term alone collapses legit duplicate words that appear in two different lessons (e.g. なるほど in both 3-1 and 3-3)
export const SAFE_KEY = (k) => k !== "__proto__" && k !== "constructor" && k !== "prototype";   // merge loops copy keys straight from the cloud payload onto plain objects; without this a poisoned key clobbers Object.prototype

// A deck that parses but isn't an array of real cards (a truncated write, a half-restored
// backup, JSON that happens to be a string or object) must not be merged as if it were
// data — treating it as empty lets the healthy side win outright instead of contributing
// garbage keys to the result.
const validDeck = (a) => Array.isArray(a) && a.every((c) => c && typeof c.term === "string");

export function mergeDeck(localRaw, cloudRaw) {   // per-card: keep whichever side studied that card more/most recently
  let local = [], cloud = [];
  try { local = localRaw ? JSON.parse(localRaw) : []; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : []; } catch (e) {}
  if (!validDeck(local)) local = [];
  if (!validDeck(cloud)) cloud = [];
  if (!cloud.length) return localRaw;
  if (!local.length) return cloudRaw;
  const byKey = new Map(local.map((c) => [cardMergeKey(c), c]));
  cloud.forEach((c) => {
    const key = cardMergeKey(c);
    const ex = byKey.get(key);
    if (!ex) { byKey.set(key, c); return; }
    const exScore = (ex.seen || 0) * 1e6 + (ex.last || 0);
    const cScore = (c.seen || 0) * 1e6 + (c.last || 0);
    if (cScore > exScore) byKey.set(key, c);
  });
  return JSON.stringify(Array.from(byKey.values()));
}

export const SEED_FIELDS = ["reading", "romaji", "meaning", "kind", "emoji", "pitch", "lesson", "sec"];
/** Bring an existing deck up to the current SEED. Keys by term|lesson|sec (cardMergeKey), so two
 *  seed rows that share a term but belong to different lessons/scenes (e.g. なるほど in 3-1 and
 *  3-3) are never collapsed into one card — the old term-only merge did exactly that, silently
 *  overwriting one card's reading/meaning/lesson with the other's and dropping the second card.
 *  Also repairs decks already corrupted by that old merge: a card whose key matches no current
 *  seed row, but whose term has seed rows, is re-attached to the right one (by reading, else by
 *  sec, else by lesson) so its study history survives; the sibling seed row is then added fresh. */
export function applySeed(list, seed, mkId) {
  const out = list.map((c) => ({ ...c }));
  const byKey = new Map();
  out.forEach((c) => { const k = cardMergeKey(c); if (!byKey.has(k)) byKey.set(k, c); });
  const rowsByTerm = new Map();
  seed.forEach((s) => { if (!rowsByTerm.has(s.term)) rowsByTerm.set(s.term, []); rowsByTerm.get(s.term).push(s); });
  const claimed = new Set();
  seed.forEach((s) => { if (byKey.has(cardMergeKey(s))) claimed.add(cardMergeKey(s)); });
  out.forEach((c) => {
    const k = cardMergeKey(c);
    if (claimed.has(k)) return;
    const rows = (rowsByTerm.get(c.term) || []).filter((s) => !claimed.has(cardMergeKey(s)));
    if (!rows.length) return;   // user-added word or a seed row that was removed: leave alone
    const pick = rows.find((s) => s.reading === c.reading) || rows.find((s) => (s.sec || "") === (c.sec || ""))
              || rows.find((s) => s.lesson === c.lesson) || (rows.length === 1 ? rows[0] : null);
    if (!pick) return;
    byKey.delete(k);
    SEED_FIELDS.forEach((f) => { if (pick[f] === undefined) delete c[f]; else c[f] = pick[f]; });
    byKey.set(cardMergeKey(c), c); claimed.add(cardMergeKey(c));
  });
  seed.forEach((s) => {
    const k = cardMergeKey(s), ex = byKey.get(k);
    if (ex) {
      // blank seed field must not wipe a value the card already has (e.g. a manually re-sectioned card)
      SEED_FIELDS.forEach((f) => { if (s[f] !== undefined) ex[f] = s[f]; });
      return;
    }
    const nc = { id: mkId(), seen: 0, correct: 0, ...s };
    out.push(nc); byKey.set(k, nc);
  });
  return out;
}

export function mergeDays(localRaw, cloudRaw) {   // per-day: keep whichever side logged more reviews that day
  let local = {}, cloud = {};
  try { local = localRaw ? JSON.parse(localRaw) : {}; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : {}; } catch (e) {}
  const out = { ...local };
  Object.keys(cloud).filter(SAFE_KEY).forEach((day) => {
    const c = cloud[day], l = out[day];
    if (!l || (c.rev || 0) > (l.rev || 0)) out[day] = c;
  });
  return JSON.stringify(out);
}

export function mergeScripts(localRaw, cloudRaw) {   // union by id, preferring the fully-annotated copy
  let local = [], cloud = [];
  try { local = localRaw ? JSON.parse(localRaw) : []; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : []; } catch (e) {}
  if (!cloud.length) return localRaw;
  const byId = new Map(local.map((s) => [s.id, s]));
  cloud.forEach((s) => {
    const ex = byId.get(s.id);
    if (!ex || (ex.plain && !s.plain)) byId.set(s.id, s);
  });
  return JSON.stringify(Array.from(byId.values()));
}

// 入力 state: the immersion history is an append-only log, so the generic
// "newest whole snapshot wins" rule would silently drop a session rated on the other
// device. Union the log instead and keep the higher rating count per side.
export function mergeInput(localRaw, cloudRaw) {
  let local = null, cloud = null;
  try { local = localRaw ? JSON.parse(localRaw) : null; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : null; } catch (e) {}
  if (!cloud) return localRaw;
  if (!local) return cloudRaw;
  const seen = new Set();
  const history = [...(local.history || []), ...(cloud.history || [])]
    .filter((h) => { const k = h.itemId + "|" + h.at; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.at - a.at).slice(0, 400);
  const newer = (cloud.levels?.updatedAt || 0) > (local.levels?.updatedAt || 0) ? cloud : local;
  const items = { ...(local.items || {}) };
  Object.entries(cloud.items || {}).filter(([id]) => SAFE_KEY(id)).forEach(([id, v]) => {
    const ex = items[id];
    if (!ex || (v.ratings || 0) > (ex.ratings || 0)) items[id] = v;   // more ratings = better informed
  });
  const byUrl = new Map([...(local.custom || []), ...(cloud.custom || [])].map((c) => [c.url, c]));
  return JSON.stringify({
    ...local, ...newer, levels: newer.levels, history, items,
    counts: { listening: Math.max(local.counts?.listening || 0, cloud.counts?.listening || 0),
              reading: Math.max(local.counts?.reading || 0, cloud.counts?.reading || 0) },
    custom: Array.from(byUrl.values()),
    hidden: Array.from(new Set([...(local.hidden || []), ...(cloud.hidden || [])])),
    pending: (local.pending || []).concat(cloud.pending || []).filter((p) => {
      const k = "p" + p.itemId + p.at; if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 6),
  });
}

/* Two per-item stat blobs keyed by item id. Whichever side has drilled an item more times
   knows more about it, so that record wins; items only one side has are kept outright.
   Losing a study session because the other device synced later is the exact failure this
   avoids. Used for jpn101:kanji, jpn101:dates, jpn101:kana, jpn101:conj. */
export function mergeStats(localRaw, cloudRaw) {
  let a = {}, b = {};
  try { a = JSON.parse(localRaw || "{}") || {}; } catch (e) {}
  try { b = JSON.parse(cloudRaw || "{}") || {}; } catch (e) {}
  const out = { ...a };
  for (const [id, v] of Object.entries(b)) {
    if (!SAFE_KEY(id)) continue;
    const ex = out[id];
    if (!ex || (v.seen || 0) > (ex.seen || 0)) out[id] = v;
  }
  return JSON.stringify(out);
}

// jpn101:hooks: { term: text } — deterministic mnemonic text, so on conflict either side is
// fine; union so a hook typed on one device isn't lost when the other device's snapshot wins.
export function mergeHooks(localRaw, cloudRaw) {
  let local = {}, cloud = {};
  try { local = localRaw ? JSON.parse(localRaw) : {}; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : {}; } catch (e) {}
  const out = { ...(cloud && typeof cloud === "object" ? cloud : {}) };
  Object.keys(local && typeof local === "object" ? local : {}).filter(SAFE_KEY).forEach((k) => { out[k] = local[k]; });
  return JSON.stringify(out);
}

/* ── evidence across devices ──
   Evidence was already being synced, but under the default rule — whichever whole snapshot
   is newer wins — which meant studying on a second machine silently discarded the first
   machine's log. The learner profile is supposed to describe the LEARNER, not the learner
   on this browser, so the two logs are unioned instead.

   Records are identified by timestamp + item + format. Two answers to the same card in the
   same millisecond do not happen, and if they somehow did, losing one is harmless. */
export function mergeEvidence(localRaw, cloudRaw) {
  let a = [], b = [];
  try { a = JSON.parse(localRaw || "[]"); } catch (e) {}
  try { b = JSON.parse(cloudRaw || "[]"); } catch (e) {}
  if (!Array.isArray(a)) a = [];
  if (!Array.isArray(b)) b = [];
  const seen = new Set();
  const all = [];
  for (const e of [...a, ...b]) {
    if (!e || !e.at) continue;
    const k = e.at + "|" + e.id + "|" + e.format;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  all.sort((x, y) => (x.at || 0) - (y.at || 0));
  return JSON.stringify(all.slice(-4000));            // same ring-buffer cap as local
}

export function mergeSnapshots(localSnap, cloudSnap, cloudUpdatedAt, localLastPulled, skipKeys) {
  const out = { ...localSnap };
  const keys = new Set([...Object.keys(localSnap), ...Object.keys(cloudSnap)]);
  keys.forEach((k) => {
    if (skipKeys && skipKeys.has(k)) { delete out[k]; return; }   // device-local keys never come from the cloud
    if (k === "jpn101:deck") { out[k] = mergeDeck(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:days") { out[k] = mergeDays(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:scripts" || k === "jpn101:scripts:mirror") { out[k] = mergeScripts(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:input") { out[k] = mergeInput(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:kanji" || k === "jpn101:dates" || k === "jpn101:kana" || k === "jpn101:conj") { out[k] = mergeStats(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:evidence") { out[k] = mergeEvidence(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:freq") { out[k] = mergeDeck(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:hooks") { out[k] = mergeHooks(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:deckVersion" || k === "jpn101:freqVersion") { out[k] = String(Math.max(Number(localSnap[k] || 0), Number(cloudSnap[k] || 0))); return; }
    if (!(k in localSnap)) { out[k] = cloudSnap[k]; return; }   // new key we don't have locally yet
    if (k in cloudSnap && cloudUpdatedAt && cloudUpdatedAt > (localLastPulled || 0)) out[k] = cloudSnap[k];   // secondary keys: newer whole snapshot wins
  });
  return out;
}
