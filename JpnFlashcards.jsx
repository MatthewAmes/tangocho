import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* Injected by tools/build.mjs (esbuild `define`): "b<commit count>", "+" if the tree was
   dirty at build time. "dev" only when running unbundled, where no stamp exists to show. */
const BUILD = typeof __BUILD__ === "undefined" ? "dev" : __BUILD__;

/* ──────────────────────────────────────────────────────────────────────────
   単語帳 — JPN 101 flashcards
   Persistent vocab study tool. Cards are saved with window.storage so they
   survive across sessions. Add words anytime; study with self-graded flips.
   ────────────────────────────────────────────────────────────────────────── */

import { MASCOT_GIFS } from "./data/mascot.js";
import { SITUATIONS, makeProps, TALK, CHECKLIST } from "./tools/oral-data.mjs";
import { review as fsrsReview, retrievability, seedFromHistory, gradeFromLatency, intervalFor, AGAIN, HARD, GOOD, EASY } from "./tools/fsrs.mjs";
import { cardMergeKey, applySeed, mergeSnapshots } from "./tools/merge.mjs";
import { localDayKey, streakFrom } from "./tools/days.mjs";
import { buildSession, interventionFor, skillOf, describe as describeSession } from "./tools/session.mjs";
import { calibrationReport } from "./tools/calibration.mjs";
import { mine, cardFor, displacementPlan, describePlan, makeLexicon } from "./tools/mining.mjs";
import { inContext, splitAround, contextCoverage } from "./tools/kanjicontext.mjs";
import { drillSet, gradeDrill } from "./tools/production.mjs";
import { describeBand, bandFor, rankMaterial } from "./tools/comprehensible.mjs";
import { reserveFor, cycleFor, sampleFor, scoreRun, estimateKnown, compareRuns,
         describeRun, pushRun, poolRuns, glossOf, askable, RUN_SIZE } from "./tools/benchmark.mjs";
import { buildClozeIndex, hasContext, clozeFor, clozeChoices, addMinedSources } from "./tools/cloze.mjs";
import { contrastSet } from "./tools/contrast.mjs";
import { posOf, shortGloss } from "./tools/pos.mjs";
import { fatigueFrom, shouldStop, STOP_NOTE } from "./tools/fatigue.mjs";
import { gainPerMinute, gainBy, fadePoint, bestUse, answerGain, MIN_ROWS } from "./tools/gain.mjs";
import { freqStatsFrom, freqPool, FREQ_DEFAULT_QUOTA } from "./src/lib/freq.js";
import {
  SKILLS, SKILL_LABEL, skillForFormat, CUE, cueHint, classifyFailure,
  makeEvidence, profileFrom, biggestGap, explainPick, summarise, CONFIDENCE,
  pushRecent, confusionFrom, buildRecovery, scoreAnswer, isMemoryCheck, latencyNorms, latencyVerdict,
  posterior, stateOf, STATE, STATE_LABEL, abilityFrom,
} from "./tools/learner.mjs";
import {
  buildItems as buildDateItems, sequenceForm, dateForm, timeForm, weekdayForm,
  acceptedReadings, COUNTERS, DAY_READING, MONTH_READING, MONTH_KANJI, HOUR_READING,
  WEEKDAYS, WEEKDAY_EN, counterForm, ordinal,
} from "./tools/counters-data.mjs";
import { toKana, kanaEqual } from "./tools/romaji.mjs";
import { SEED_VERSION, SEED } from "./src/data/seed.js";
import { SCRIPT_SEED } from "./src/data/scripts-seed.js";
import { FEED_SOURCES, INPUT_CATALOG, INPUT_VERDICTS, INPUT_PLANS, INPUT_TIMES, INPUT_BANDS } from "./src/data/input-catalog.js";
import { CONJ_TYPES, CONJ_BANK, CONJ_FILTERS } from "./src/data/conj-bank.js";
import { KANA_BASE_ROWS, KANA_DAKU_ROWS, KANA_YOON_ROWS, KANA_MARK_ROWS, KANA_EXT_ROWS, KANA_GROUPS, KANA_LENGTHS } from "./src/data/kana-tables.js";
import { SECTION_MAP, SECTION_HUES, KIND_LABEL } from "./src/data/sections.js";
import { CSS } from "./src/styles.js";
import { KANA_MAP, YOON_MAP, kataToHira, kanaToRomaji, canonR, fillMatch } from "./src/lib/kana.js";
import { GODAN_ROWS, conjugate, CONJ_FORMS } from "./src/lib/conjugate.js";
import { unpackVideos, evidenceWeight, learningRate, applyRating, seedLevelsFromDeck, fuseLevels, seededShuffle, recommend, COVERAGE_LEADING_PARTICLES, COVERAGE_SAFE_SUFFIXES, COVERAGE_SAFE_SET, coverageAgainstDeck, band, bandName, relDots, agoLabel, blankInput } from "./src/lib/input-engine.js";
import { SESSION_KEY, USER_EMAIL_KEY, loadSession, saveSession } from "./src/lib/session.js";
import { TTS_OK, pickJpVoice, ttsUnlock, prefetchJa, speakJa, stopJa } from "./src/lib/tts.js";
import { retention, isWeak, masteryScore, DAY, REVIEW_INTERVALS, recallUnlocked, effLevel, isLeech, dueness, statReview, boundMs, reviewOutcome, latencyNormsRef, refreshLatencyNorms, gradeAgainstNorm, statNeed, prodDue, MASTERY_CEIL, MASTERY_STOPS, masteryWarmth, masteryColor, masteryStyle, recallChance, needScore } from "./src/lib/schedule.js";

const STORE_KEY = "jpn101:deck";
const SEED_KEY = "jpn101:deckVersion";
 // bump this each time I add/update words



const uid = () => Math.random().toString(36).slice(2, 10);

// ── storage helpers ──
// window.storage is a Claude.ai artifact-sandbox API — it does NOT exist on the
// deployed site. localStorage is the real persistence layer there; window.storage
// (if present) is preferred only when running inside the Claude artifact preview.
// Memory-only `mem` is the last-resort fallback (e.g. storage blocked entirely).
const mem = {};
async function sGet(key) {
  try {
    if (window.storage?.get) {
      const r = await window.storage.get(key);
      if (r) return r.value;
    }
  } catch (e) { /* key missing or unavailable */ }
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) { /* localStorage blocked (private mode, disabled, etc.) */ }
  return key in mem ? mem[key] : null;
}
async function sSet(key, value) {
  let ok = false;
  for (let i = 0; i < 2 && !ok; i++) {
    if (!window.storage?.set) break;
    try { await window.storage.set(key, value); mem[key] = value; ok = true; }
    catch (e) { await new Promise((res) => setTimeout(res, 600)); /* retry once */ }
  }
  if (!ok) {
    try { window.localStorage.setItem(key, value); mem[key] = value; ok = true; }
    catch (e) { /* quota exceeded or storage blocked */ }
  }
  if (!ok) mem[key] = value;   // memory-only fallback: survives this session, NOT a reload
  if (ok && key.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(key)) scheduleCloudPush();
  return ok;
}

// ── cross-device sync (Cloudflare Worker KV via /api/sync, Google-session only) ──
// Sync requires a signed-in Google session (see below); signed-out devices stay local-only —
// no anonymous sync-code fallback (that path used to accept any guessable code as a free,
// unauthenticated KV write bucket; removed). Merging is per-record (not whole-file
// last-write-wins) so studying on two devices before either has synced never loses progress.
const SYNC_ENDPOINT = "/.netlify/functions/sync";
const SYNC_PREFIX = "jpn101:";
/* Caches of files the app already ships are excluded: kanjiData and freqData are ~1.1MB of
   static content that would otherwise be uploaded to the cloud on every save and counted
   against the sync payload for no benefit at all. */
// Keys that live on THIS device only. Anything else under jpn101: is study data and syncs.
// A key listed here must never be written to the cloud and must be ignored if an old cloud
// record still carries it (e.g. jpn101:session — syncing a bearer token across devices via
// an unauthenticated snapshot merge would let one device silently sign another one in).
const SYNC_SKIP_KEYS = new Set(["jpn101:ping", "jpn101:syncLastPulled", "jpn101:snapshot",
  "jpn101:kanjiData", "jpn101:freqData", "jpn101:deck.corrupt",
  "jpn101:session", "jpn101:userEmail", "jpn101:syncPending", "jpn101:lastBackup", "jpn101:videoIndex"]);

/* Set when this device's stored deck failed to parse (see loadCardsAndSync). While true no
   push may run: the in-memory deck is empty/unknown, and uploading it would replace a good
   cloud copy — the one remaining source of truth — with nothing. */
let _deckCorrupt = false;

/* ── after-pull notification ──
   A pull writes merged values straight into localStorage, but anything already cached in a
   module variable keeps serving the pre-merge copy. That is not just staleness: `_days` is
   read once and then written back wholesale on every logDay(), so the first grade after a
   pull serialises the STALE day log over the freshly merged one and pushes that to the
   cloud — silently discarding the days the pull just brought down. Callers register here to
   drop or re-read their cache once the merged values have landed. */
const _afterPull = new Set();
function onAfterPull(fn) { _afterPull.add(fn); return () => _afterPull.delete(fn); }

function collectLocalSnapshot() {
  const snap = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(k)) snap[k] = window.localStorage.getItem(k);
    }
  } catch (e) {}
  return snap;
}
// Merge rules live in tools/merge.mjs (pure, testable — see tools/test-merge.mjs).
// ── Google Sign-In with a real persistent session ──
// One explicit click exchanges a Google ID token for OUR OWN long-lived signed
// session token (~2 years), stored in localStorage. Every later visit just reads
// that token straight from storage — no re-running Google's sign-in flow, no
// dependency on browser silent-reauth (which is unreliable and was causing
// "asks me to log in again every time"). Signed-out devices stay local-only —
// there is no anonymous fallback (see SYNC_ENDPOINT comment above).
const GOOGLE_CLIENT_ID = "249268364314-fkmn7ol1jtkv12sme6fjp70fj2cpr6l3.apps.googleusercontent.com";




function clearSessionStorage() {
  try { window.localStorage.removeItem(SESSION_KEY); window.localStorage.removeItem(USER_EMAIL_KEY); } catch (e) {}
  _googleEmail = null;
}
function signOutGoogle() {
  clearSessionStorage();
  setSyncState("idle");           // stop showing "Saving…"/"Not saved yet" once there's nowhere to save to
  setAuthState("signed-out");
}
let _googleEmail = (() => { try { return window.localStorage.getItem(USER_EMAIL_KEY); } catch (e) { return null; } })();

// auth mini-store: lets any component (Browse, the root loader) react to sign-in,
// sign-out, and — the case nothing used to handle — a session going bad mid-session.
let _authState = loadSession() ? "signed-in" : "signed-out";   // signed-in | signed-out | expired
const _authWatchers = new Set();
function setAuthState(s) { _authState = s; _authWatchers.forEach((fn) => { try { fn(s); } catch (e) {} }); }
function watchAuthState(fn) { _authWatchers.add(fn); return () => _authWatchers.delete(fn); }
function authStateNow() { return _authState; }
function handleAuthFailure() {     // a 401 from /api/sync: the token is dead (expired or SESSION_SECRET rotated)
  const had = !!loadSession();
  clearSessionStorage();
  setSyncState("idle");
  setAuthState(had ? "expired" : "signed-out");
}

let _gisReadyPromise = null;
function gisReady() {
  if (_gisReadyPromise) return _gisReadyPromise;
  _gisReadyPromise = new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google?.accounts?.id) resolve();
      else if (Date.now() - t0 > 20000) { _gisReadyPromise = null; reject(new Error("gsi not loaded")); }   // offline/blocked — stop polling forever
      else setTimeout(check, 150);
    })();
  });
  return _gisReadyPromise;
}
async function exchangeForSession(idToken) {
  try {
    const res = await fetch(SYNC_ENDPOINT + "?exchange=1", {
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return false;
    const { session, email } = await res.json();
    if (!session) return false;
    saveSession(session, email);
    _googleEmail = email;
    setAuthState("signed-in");
    return true;
  } catch (e) { return false; /* offline — try again next click */ }
}
let _googleInitDone = false;
let _googleTokenListeners = [];   // every caller's callback fires — initialize() itself only ever runs once
function initGoogleAuth(onToken) {
  if (onToken) _googleTokenListeners.push(onToken);
  const unsubscribe = () => { _googleTokenListeners = _googleTokenListeners.filter((fn) => fn !== onToken); };
  if (loadSession()) return unsubscribe;   // already have a persistent session — no need to touch Google's flow at all
  gisReady().then(() => {
    if (!_googleInitDone) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          const ok = await exchangeForSession(resp.credential);
          if (ok) _googleTokenListeners.forEach((fn) => { try { fn(); } catch (e) {} });
        },
      });
      _googleInitDone = true;
    }
  }).catch(() => {});
  return unsubscribe;
}
function renderGoogleButton(el) {
  if (!el || loadSession()) return;
  gisReady().then(() => {
    try { window.google.accounts.id.renderButton(el, { theme: "outline", size: "medium", text: "signin_with" }); } catch (e) {}
  }).catch(() => {});
}
function syncRequestOptions(extra) {
  const session = loadSession();
  if (!session) return null;   // signed out: local-only, no network
  const opts = { ...extra, cache: "no-store", headers: { ...((extra && extra.headers) || {}), authorization: "Bearer " + session } };
  return { url: SYNC_ENDPOINT, opts };
}

// ── saving progress to the cloud ──
// Progress is the one thing in here that can't be regenerated, so a failed save must
// never be silent. Three things this guards against, all of which were live bugs:
//   1. fetch() resolves for a 401/500 too — an unchecked response counted a rejected
//      write as a success, so the app believed it had saved when it hadn't.
//   2. A failure had no retry: the data sat local-only forever with no indication.
//   3. The 2.5s debounce meant answering a card and closing the tab within 2.5s
//      dropped that save entirely.
const SYNC_PENDING_KEY = "jpn101:syncPending";
let _syncState = "idle";            // idle | saving | saved | pending
const _syncWatchers = new Set();
function setSyncState(s) {
  _syncState = s;
  _syncWatchers.forEach((fn) => { try { fn(s); } catch (e) {} });
}
function watchSyncState(fn) { _syncWatchers.add(fn); return () => _syncWatchers.delete(fn); }
function syncStateNow() { return _syncState; }
function markSyncPending() { try { window.localStorage.setItem(SYNC_PENDING_KEY, String(Date.now())); } catch (e) {} }
function clearSyncPending() { try { window.localStorage.removeItem(SYNC_PENDING_KEY); } catch (e) {} }
function hasSyncPending() { try { return !!window.localStorage.getItem(SYNC_PENDING_KEY); } catch (e) { return false; } }

let _retryTimer = null;
/* The server blind-overwrites on POST, so two overlapping pushes can land out of order and
   the older snapshot wins. Coalesce instead of racing: a call made while one is in flight
   sets a flag and re-runs once, after, with a freshly collected snapshot. */
let _pushInFlight = false, _pushAgain = false;
async function pushCloudNow(opts = {}) {
  if (_pushInFlight) { _pushAgain = true; return false; }
  _pushInFlight = true;
  try { return await pushCloudOnce(opts); }
  finally {
    _pushInFlight = false;
    if (_pushAgain) { _pushAgain = false; pushCloudNow(); }
  }
}
// Browsers reject a keepalive fetch whose body exceeds 64 KiB — and they reject it BEFORE
// sending, by throwing. The real deck is ~284 KB, so the pagehide flush never once left the
// device: it threw, the catch marked pending, and the last few seconds of grading before a
// tab close reached the cloud only on that same device's next visit.
const KEEPALIVE_MAX = 60 * 1024;
async function pushCloudOnce({ attempt = 0, keepalive = false } = {}) {
  if (_cloudPushTimer) { clearTimeout(_cloudPushTimer); _cloudPushTimer = null; }
  if (_deckCorrupt) { setSyncState("idle"); return false; }   // damaged local deck: never overwrite the cloud copy with it
  const body = JSON.stringify({ updatedAt: Date.now(), snapshot: collectLocalSnapshot() });
  if (keepalive) {
    // UTF-8 bytes, not UTF-16 units — Japanese text is 3 bytes per character, so
    // body.length would understate the real size by roughly a third.
    const bytes = new TextEncoder().encode(body).length;
    if (bytes > KEEPALIVE_MAX) {
      // Doomed before it starts. Flag it durably and let the next visit retry rather than
      // throwing a TypeError into the console and calling that a failed save.
      markSyncPending(); setSyncState("pending");
      return false;
    }
  }
  const req = syncRequestOptions({
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive,                        // lets the request outlive the page on pagehide
  });
  if (!req) { setSyncState("idle"); return false; }   // signed out: nothing to push anywhere
  setSyncState("saving");
  try {
    const res = await fetch(req.url, req.opts);
    if (res.status === 401) { handleAuthFailure(); markSyncPending(); setSyncState("pending"); return false; }   // keep the flag; do NOT retry an auth failure
    if (!res.ok) throw new Error("save rejected: HTTP " + res.status);
    clearSyncPending();
    setSyncState("saved");
    return true;
  } catch (e) {
    // keep a durable flag so a failure survives a reload and gets retried later
    markSyncPending();
    setSyncState("pending");
    if (attempt < 5) {
      const wait = Math.min(30000, 1000 * Math.pow(2, attempt));   // 1s,2s,4s,8s,16s
      clearTimeout(_retryTimer);
      // via the wrapper, not pushCloudOnce: the timer can fire while a user-triggered push
      // is already running, and two overlapping POSTs can land out of order
      _retryTimer = setTimeout(() => pushCloudNow({ attempt: attempt + 1 }), wait);
    }
    return false;
  }
}
let _cloudPushTimer = null;
function scheduleCloudPush() {
  if (_cloudPushTimer) clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(() => pushCloudNow(), 2500);
}
if (typeof window !== "undefined") {
  // retry the moment there's any reason to think it might work now
  window.addEventListener("online", () => { if (hasSyncPending()) pushCloudNow(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // The real last-chance signal on mobile — switching apps fires this, and often no
      // pagehide follows. A normal (non-keepalive) fetch started from a hidden tab is
      // usually allowed to finish, and unlike keepalive it has no size limit, so this is
      // the path that actually gets a full snapshot out.
      if (_cloudPushTimer) pushCloudNow();
    } else if (hasSyncPending()) pushCloudNow();
  });
  // Last resort. Anything larger than the keepalive cap is refused by the size guard in
  // pushCloudOnce and left as pending for the next visit instead.
  window.addEventListener("pagehide", () => {
    if (_cloudPushTimer || hasSyncPending()) pushCloudNow({ keepalive: true });
  });
}
async function pullAndMergeCloud() {
  try {
    const req = syncRequestOptions({});
    if (!req) return false;   // signed out: nothing to pull
    const res = await fetch(req.url, req.opts);
    if (res.status === 401) { handleAuthFailure(); return false; }
    if (!res.ok) return false;
    const { data } = await res.json();
    if (!data || !data.snapshot) return false;
    const localSnap = collectLocalSnapshot();
    let lastPulled = 0;
    try { lastPulled = Number(window.localStorage.getItem("jpn101:syncLastPulled") || 0); } catch (e) {}
    const merged = mergeSnapshots(localSnap, data.snapshot, data.updatedAt, lastPulled, SYNC_SKIP_KEYS);
    Object.keys(merged).forEach((k) => { try { window.localStorage.setItem(k, merged[k]); } catch (e) {} });
    try { window.localStorage.setItem("jpn101:syncLastPulled", String(Date.now())); } catch (e) {}
    // Only now that every merged key is on disk: let cached readers drop/refresh, so the
    // next write serialises the merged value rather than the pre-pull one.
    _afterPull.forEach((fn) => { try { fn(Object.keys(merged)); } catch (e) {} });
    return true;
  } catch (e) { return false; /* offline — keep using local data */ }
}



/* ── daily study log: reviews, hits, think-time, new-word intake, per day ── */
/* Desired retention — the single knob FSRS exposes, and the only one worth exposing.
   0.90 means "schedule each card for the day it has a 90% chance of being recalled".
   Lower it and you review less but forget more; raise it and you review far more for a
   little extra recall. 0.90 is the researched default and where the review-count curve
   starts climbing steeply. */
const RETENTION_KEY = "jpn101:retention";
try {
  const r = Number(window.localStorage.getItem(RETENTION_KEY));
  if (r >= 0.7 && r <= 0.97) retention.target = r;
} catch (e) {}
function setRetention(r) {
  retention.target = Math.min(0.97, Math.max(0.7, r));
  sSet(RETENTION_KEY, String(retention.target));   // async, fire-and-forget; schedules a push like any other setting
}
// read once at module load, so a target changed on another device needs this to take effect
onAfterPull(() => {
  try {
    const r = Number(window.localStorage.getItem(RETENTION_KEY));
    if (r >= 0.7 && r <= 0.97) retention.target = r;
  } catch (e) {}
});

const DAYS_KEY = "jpn101:days";
let _days = null;
async function loadDays() {
  if (_days === null) { try { const r = await sGet(DAYS_KEY); _days = r ? JSON.parse(r) : {}; } catch (e) { _days = {}; } }
  return _days;
}
// Dropping the cache is enough — the next loadDays() re-reads the merged log. Do NOT switch
// logDay to a per-call read: it runs on every grade and relies on the cached object.
onAfterPull(() => { _days = null; });
async function logDay({ ok, ms, deck, fnew, area }) {
  await loadDays();
  const k = localDayKey();
  const d = _days[k] || (_days[k] = { rev: 0, ok: 0, ms: 0, frev: 0, fnew: 0 });
  d.rev += 1; if (ok) d.ok += 1; if (ms) d.ms += ms;
  if (deck === "freq") { d.frev += 1; if (fnew) d.fnew += 1; }
  /* Per-deck counts, so the study plan can report which SKILL AREAS actually got worked
     rather than only how many reviews happened. Without this the plan is a wish list: it
     can state that listening matters and never notice that listening never happens. */
  const a = area || (deck ? areaForDeck(deck) : null);
  if (a) { (d.by || (d.by = {}))[a] = (d.by[a] || 0) + 1; }
  sSet(DAYS_KEY, JSON.stringify(_days));
}

/* ── the mascot ──
   Pixel-art nigiri, one animated GIF per mood, generated by tools/make-mascot.mjs and
   inlined as data URIs — about 2.5KB for all five, so no extra request and nothing to
   load. GIF rather than SVG because pixel art is what was asked for, and a hand-rolled
   encoder (tools/gifenc.mjs) turned out to be ~90 lines; the earlier claim that a GIF
   wasn't practical here was wrong.
   States are earned rather than decorative: asleep when you haven't studied, worried when
   reviews pile up, delighted on a streak. A mascot that always looks happy carries no
   information. */
function mascotState({ studiedToday, dueCount, streak }) {
  if (!studiedToday) return dueCount > 30 ? "worried" : "sleeping";
  if (streak >= 7) return "proud";
  if (dueCount > 40) return "worried";
  return "happy";
}
function Mascot({ state, size = 84 }) {
  const src = MASCOT_GIFS[state] || MASCOT_GIFS.waiting;
  return <img className={"tc-mascot is-" + state} src={src} width={size} height={size * 30 / 32}
              alt={"Study buddy, looking " + state} draggable="false" />;
}

function detectKind(term) {
  if (/[\u4E00-\u9FFF]/.test(term)) return "kanji";
  if (/[\u30A0-\u30FF]/.test(term)) return "katakana";
  if (/[\u3040-\u309F]/.test(term)) return "hiragana";
  return "mixed";
}

function isEmoji(s) {
  const t = (s || "").trim();
  if (!t || t.length > 5) return false;
  try { return /\p{Extended_Pictographic}/u.test(t); } catch (e) { return /[\u2190-\u2BFF\u2700-\u27BF]/.test(t); }
}

export default function JpnFlashcards() {
  const [cards, setCards] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("study");
  const [storageOk, setStorageOk] = useState(true);
  const [deckCorrupt, setDeckCorrupt] = useState(false);

  const bannerBackup = async () => {   // one-tap backup from the storage-dead banner; sGet's mem fallback still holds this session's data
    let kana = null, scripts = null, freq = null, days = null, hooks = null, quota = null, oral = null;
    try { const k = await sGet("jpn101:kana"); if (k) kana = JSON.parse(k); } catch (e) {}
    try { const sc = await sGet("jpn101:scripts"); if (sc) scripts = JSON.parse(sc); } catch (e) {}
    try { const f = await sGet("jpn101:freq"); if (f) freq = JSON.parse(f); } catch (e) {}
    try { const d = await sGet("jpn101:days"); if (d) days = JSON.parse(d); } catch (e) {}
    try { const h = await sGet("jpn101:hooks"); if (h) hooks = JSON.parse(h); } catch (e) {}
    try { quota = await sGet("jpn101:freqQuota"); } catch (e) {}
    try { const or = await sGet("jpn101:oralAttempts"); if (or) oral = JSON.parse(or); } catch (e) {}
    const blob = JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), deck: cards, kana, scripts, freq, days, hooks, quota, oral });
    try {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-backup-" + localDayKey() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { await navigator.clipboard.writeText(blob); } catch (e) {}
  };

  useEffect(() => {   // storage self-test: write a ping, read it straight back from real storage (not the mem fallback)
    (async () => {
      const stamp = "ping-" + Date.now();
      try {
        if (window.storage?.set && window.storage?.get) {
          await window.storage.set("jpn101:ping", stamp);
          const back = await window.storage.get("jpn101:ping");
          if (back?.value === stamp) { setStorageOk(true); return; }
        }
      } catch (e) { /* fall through to localStorage check */ }
      try {
        window.localStorage.setItem("jpn101:ping", stamp);
        setStorageOk(window.localStorage.getItem("jpn101:ping") === stamp);
      } catch (e) { setStorageOk(false); }
    })();
  }, []);

  // ── load, cloud-merge, seed-merge, THEN push — strictly in that order ──
  // Two separate effects used to do this uncoordinated (one pushed local state to the
  // cloud while the other was still pulling), so a device with stale local data could
  // race ahead and blindly overwrite genuinely newer cloud progress before ever pulling
  // it down (the server just overwrites on POST — all merging is client-side, so pull
  // MUST complete and be written to local storage before any push happens). Now it's one
  // serial chain: pull+merge cloud -> seed-merge -> push the final result once.
  const loadCardsAndSync = useCallback(async () => {
    try { window.localStorage.removeItem("jpn101:syncCode"); } catch (e) {}   // one-time cleanup: the anonymous sync-code path is gone
    try { await pullAndMergeCloud(); } catch (e) { /* offline — proceed with whatever's local */ }
    const rawCards = await sGet(STORE_KEY);
    const rawVer = await sGet(SEED_KEY);
    const ver = rawVer ? Number(rawVer) : 0;

    /* "Corrupt" and "absent" used to collapse into the same `null`, so a truncated or
       half-written jpn101:deck (storage quota hit mid-write, a browser bug, a partial
       restore) looked exactly like a first run: the app reseeded every card at seen:0,
       wrote that over the damaged value, and then pushed a zero-progress deck to the
       cloud. On a second device mergeDeck's higher-seen rule usually rescues it, but a
       single-device user loses everything and is never told why. Reseed now happens ONLY
       when the key is genuinely missing. */
    let list = null, corrupt = false;
    if (rawCards != null) {
      try { list = JSON.parse(rawCards); } catch (e) { list = null; }
      if (!Array.isArray(list) || !list.every((c) => c && typeof c.term === "string")) { list = null; corrupt = true; }
    }
    if (corrupt) {
      try { window.localStorage.setItem("jpn101:deck.corrupt", rawCards); } catch (e) {}
      _deckCorrupt = true;                 // blocks pushCloudNow from overwriting the cloud copy
      setDeckCorrupt(true);
      setCards([]); setReady(true);
      return;                              // no reseed, no push — wait for a cloud pull or a manual restore
    }
    _deckCorrupt = false; setDeckCorrupt(false);

    if (!list) {
      list = SEED.map((c) => ({ id: uid(), seen: 0, correct: 0, ...c }));
      await sSet(STORE_KEY, JSON.stringify(list));
      await sSet(SEED_KEY, String(SEED_VERSION));
    } else if (ver < SEED_VERSION) {
      // safety net: snapshot the pre-merge deck in backup format before touching anything
      try { await sSet("jpn101:snapshot", JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), note: "auto-snapshot before v" + SEED_VERSION + " merge", deck: list })); } catch (e) {}
      list = applySeed(list, SEED, uid);
      await sSet(STORE_KEY, JSON.stringify(list));
      await sSet(SEED_KEY, String(SEED_VERSION));
    }
    setCards(list);
    setReady(true);
    await pushCloudNow();   // push the final merged+seeded result once, now that it's genuinely up to date
  }, []);

  useEffect(() => { loadCardsAndSync(); }, [loadCardsAndSync]);

  // Not signed in yet on this device? Re-run the exact same pull->merge->push chain
  // once sign-in completes, so a fresh device pulls real cloud progress before anything
  // could push a blank/local-only deck over it.
  useEffect(() => initGoogleAuth(loadCardsAndSync), [loadCardsAndSync]);

  /* The tab strip scrolls sideways rather than wrapping (13 tabs would otherwise take two
     rows). Scrolling is only usable if you can SEE that there is more — the scrollbar is
     hidden, so without an edge fade the strip just looks cut off, which is exactly how it
     read. These flags drive a mask on whichever side still has content. */
  const tabsRef = useRef(null);
  const [tabEdges, setTabEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    /* Measured immediately AND again after a beat. The re-measure exists because a strip
       can finish laying out after the first read (a webfont landing re-widths every tab).
       It is a timer rather than requestAnimationFrame on purpose: rAF does not fire at all
       in a hidden tab, so a deferred-only measure left the fade permanently uncomputed for
       anyone who opened the app in a background tab — and made it untestable in a headless
       pane, which is how this was found. */
    let settle = 0;
    const measure = () => {
      const more = el.scrollWidth - el.clientWidth;
      setTabEdges((prev) => {
        const next = { left: more > 4 && el.scrollLeft > 4, right: more > 4 && el.scrollLeft < more - 4 };
        return prev.left === next.left && prev.right === next.right ? prev : next;
      });
    };
    const sync = () => { measure(); clearTimeout(settle); settle = setTimeout(measure, 150); };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    /* ResizeObserver rather than a window resize listener: the strip can stop or start
       overflowing without the window changing size at all — a webfont landing and renaming
       every tab by a few pixels does it, as does the tab set itself changing. */
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(el);
      /* ...and a child. ResizeObserver watches the BORDER BOX, and this strip overflows
         WITHOUT its own box ever changing: at 375px the nav stays 351px wide while its
         content grows to 921px. Observing only the nav meant the fade never appeared on a
         phone, because nothing RO can see had changed. A tab does change size when the
         layout settles, so watching one catches the reflow the container hides. */
      const child = el.querySelector("button");
      if (child) ro.observe(child);
    }
    window.addEventListener("resize", sync);   // cheap, and covers paths RO can miss
    /* A webfont swapping in re-widths every tab after the first measure. */
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(sync).catch(() => {});
    }
    return () => {
      clearTimeout(settle);
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      if (ro) ro.disconnect();
    };
  }, []);
  /* Keep the active tab reachable: selecting one off-screen (or landing on a stored tab)
     should bring it into view rather than leaving the strip parked at the start. */
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const on = el.querySelector('[aria-selected="true"]');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  const persist = useCallback((next) => {
    setCards(next);
    sSet(STORE_KEY, JSON.stringify(next));
  }, []);

  const addCards = useCallback((newOnes) => {
    setCards((prev) => {
      const have = new Set(prev.map(cardMergeKey));
      const nextLesson = prev.reduce((m, c) => Math.max(m, c.lesson || 1), 0) + 1;
      const fresh = newOnes
        .filter((c) => c.term)
        .map((c) => ({ id: uid(), seen: 0, correct: 0, sample: false, kind: c.kind || detectKind(c.term), lesson: nextLesson, ...c }))
        .filter((c) => !have.has(cardMergeKey(c)));
      const next = [...prev, ...fresh];
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /* Parking, not deleting. A displaced word keeps every field it had — only untouched
     words are ever eligible — and comes back when the active set has room. Reversible by
     design: permanently retiring someone's vocabulary to make space for a manga chapter
     would be a bad trade to make silently. */
  const parkCards = useCallback((ids) => {
    if (!ids || !ids.length) return;
    const set = new Set(ids);
    setCards((prev) => {
      const next = prev.map((c) => (set.has(c.id) ? { ...c, parked: true } : c));
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCard = useCallback((id) => {
    setCards((prev) => { const next = prev.filter((c) => c.id !== id); sSet(STORE_KEY, JSON.stringify(next)); return next; });
  }, []);

  const clearAll = useCallback(() => { persist([]); }, [persist]);
  // A restore is the documented way out of the damaged-deck state, so it clears the flag
  // (and re-enables pushing) once a real deck is back in place.
  const restoreDeck = useCallback(async (deck) => {
    _deckCorrupt = false; setDeckCorrupt(false);
    persist(deck);
  }, [persist]);


  const setMnemonic = useCallback((id, text) => {
    setCards((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, mn: text.slice(0, 120) } : c));
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const recordResult = useCallback((id, got, dir, ms, area, outcome) => {
    const t = ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0;  // sanity bounds: ignore misfires & walked-away cards
    logDay({ ok: got, ms: t, deck: "class", area });
    setCards((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const firstProdTry = dir === "prod" && (c.rseen || 0) === 0;   // first attempt at producing = learning, not a lapse
        /* Hesitation predicts failure. In this deck, answers given in under 3 seconds
            are 87% correct and answers taking over 6 seconds are 71% correct — so a slow
            "got it" is much weaker evidence than a fast one, and treating them the same
            is why 503 studied cards produced only ten at level 4.
            Fast+right now advances two levels, slow+right advances one, and a right answer
            that took more than 10 seconds holds level instead of advancing. */
        const fast = got && t > 0 && t < 3000;
        const crawl = got && t >= 10000;
        const delta = got ? (fast ? 0.08 : crawl ? 0 : 0.05) : firstProdTry ? 0 : -0.15;
        /* FSRS runs alongside the old counters rather than replacing them: seen/correct/
           level still drive the existing UI, and keeping them means nothing already
           recorded is lost if this needs rolling back. The schedule, though, now comes
           from the memory model. */
        const { next: nextState, isProd } = reviewOutcome(c, { got, ms: t, dir, area });
        const fsrs = isProd ? c.fsrs : nextState;
        const rfsrs = isProd ? nextState : c.rfsrs;
        const ease = Math.max(0.55, Math.min(1.8, (c.ease || 1) + delta)); // adaptive: misses tighten the leash
        /* The rolling history and the failure kind ride along with the card update.
           A separate writer racing this one is how a record lost half of itself. */
        const base = applyOutcome(
          { ...c, ease, fsrs, rfsrs, streak: got ? (c.streak || 0) + 1 : 0, last: Date.now() },
          { ok: got, failure: outcome && outcome.failure, skill: outcome && outcome.skill });
        if (dir === "prod") {                       // EN→JP recall (production)
          return {
            ...base,
            rseen: (c.rseen || 0) + 1,
            rcorrect: (c.rcorrect || 0) + (got ? 1 : 0),
            rms: (c.rms || 0) + t, rmsN: (c.rmsN || 0) + (t ? 1 : 0),
            rlevel: got ? Math.min(5, (c.rlevel || 0) + (fast ? 2 : crawl ? 0 : 1)) : Math.max(0, (c.rlevel || 0) - 2),
          };
        }
        return {                                    // JP→EN recognition
          ...base,
          seen: (c.seen || 0) + 1,
          correct: (c.correct || 0) + (got ? 1 : 0),
          ms: (c.ms || 0) + t, msN: (c.msN || 0) + (t ? 1 : 0),
          level: got ? Math.min(5, (c.level || 0) + (fast ? 2 : crawl ? 0 : 1)) : Math.max(0, (c.level || 0) - 2),
        };
      });
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <div className="tc-root">
      <style>{CSS}</style>
      <div className="tc-shell">
        {!storageOk && (
          <div className="tc-senterr" style={{ margin: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span>⚠️ Storage isn't working in this session — anything you add or review lives only until you close the app. Tap Backup before closing (it downloads a file + copies to clipboard), then Restore it next session.</span>
            <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={bannerBackup} style={{ alignSelf: "flex-start" }}>💾 Backup now</button>
          </div>
        )}
        {deckCorrupt && (
          <div className="tc-senterr" style={{ margin: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span>⚠️ The saved deck on this device is damaged, and was <b>not</b> replaced — your progress has not been overwritten. If you're signed in, the cloud copy loads on the next successful sync. Otherwise open Browse → More → Restore and paste a backup. (The damaged data is kept under <code>jpn101:deck.corrupt</code>.)</span>
            <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={() => loadCardsAndSync()} style={{ alignSelf: "flex-start" }}>Try again</button>
          </div>
        )}
        <header className="tc-head">
          <div className="tc-brandblock">
            <span className="tc-seal" aria-hidden="true">朱</span>
            <div>
              <h1 className="tc-wordmark">単語帳 <span className="tc-build">{BUILD}</span></h1>
              <p className="tc-sub">JPN 101 · flashcards · <span className="tc-count">{cards.length} words</span></p>
            </div>
          </div>
          <nav ref={tabsRef}
               className={"tc-tabs" + (tabEdges.left ? " has-left" : "") + (tabEdges.right ? " has-right" : "")}
               role="tablist" aria-label="Sections">
            {[["study", "Study"], ["sentences", "Sentences"], ["write", "Write"], ["drill", "Drill"], ["input", "Input"], ["kanji", "Kanji"], ["dates", "Dates"], ["kana", "Kana"], ["spell", "Spelling"], ["scripts", "Scripts"], ["browse", "Browse"], ["plan", "Plan"]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id}
                className={"tc-tab" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>

        </header>

        {!ready ? (
          <div className="tc-empty">Loading your deck…</div>
        ) : tab === "study" ? (
          <Study cards={cards} onResult={recordResult} goAdd={() => setTab("browse")} onMnemonic={setMnemonic} />
        ) : tab === "drill" ? (
          <ConjDrill />
        ) : tab === "input" ? (
          <Input cards={cards} onAdd={addCards} onPark={parkCards} />
        ) : tab === "oral" ? (
          /* Oral keeps its render branch and its components, same as Write. The chip is
             gone for now, not the feature — the mock final and Culture Talk rehearsals are
             the only speaking practice here, and the exam they were built for comes back. */
          <OralHome />
        ) : tab === "kanji" ? (
          <Kanji cards={cards} />
        ) : tab === "dates" ? (
          <Dates />
        ) : tab === "sentences" ? (
          /* Fill-in-the-blank and translation, the only exercises that put a word in a
             SENTENCE rather than in isolation. Fully built and previously unreachable. */
          <Sentences cards={cards} onResult={recordResult} />
        ) : tab === "write" ? (
          /* Write keeps its render branch and its component. The tab chip is gone for now,
             not the feature — it is the only production-recall practice in the app and
             deleting it to make room would be throwing away the harder retrieval. */
          <Write cards={cards} onResult={recordResult} />
        ) : tab === "plan" ? (
          <Plan cards={cards} />
        ) : tab === "spell" ? (
          <Contrast cards={cards} onResult={recordResult} />
        ) : tab === "kana" ? (
          <Kana />
        ) : tab === "scripts" ? (
          <Scripts />
        ) : (
          <Browse cards={cards} onRemove={removeCard} onClear={clearAll} onRestore={restoreDeck} />
        )}
      </div>
      {/* Version at the foot of every tab, so "am I on the latest deploy?" is answerable
          from any phone by scrolling down — the number increments with every commit. */}
      <footer className="tc-verfoot">単語帳 {BUILD}</footer>
    </div>
  );
}

/* ───────────────────────────── STUDY ───────────────────────────── */
function Study({ cards, onResult, goAdd, onMnemonic }) {
  const [showRomaji, setShowRomaji] = useState(false); // front rōmaji on/off
  const [showPitch, setShowPitch] = useState(true);    // back pitch ⸢ ⸣ marks on/off
  const [queue, setQueue] = useState([]);              // working order; missed cards get re-inserted
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);         // unique cards this session
  const [passed, setPassed] = useState(() => new Set());     // cleared (eventually correct)
  const [firstTry, setFirstTry] = useState(() => new Set()); // correct with no prior miss
  const [struggled, setStruggled] = useState(() => new Set()); // missed at least once
  const missRef = useRef({});                          // id -> miss count this session
  const sessionLog = useRef([]);                       // evidence gathered this session, for the debrief
  /* The learning rate BEFORE this session, captured when it starts. A rate on its own is
     an uninterpretable number; the only thing that makes it mean anything on a results
     screen is the same learner's own recent rate to compare it against. Snapshotted at
     the start so the session being summarised is not also inside its own baseline. */
  const baselineRef = useRef(null);
  // Bumped when a generated sentence lands, so the exercise picks it up without a reload.
  const [contextTick, setContextTick] = useState(0);
  const hooksRef = useRef(null);                       // term -> memory hook (cached forever)
  const [hook, setHook] = useState(null);              // {term, text|"...", err}
  const [debrief, setDebrief] = useState(null);        // {text} | {err} | {busy:true}
  const getHook = useCallback(async (card) => {
    if (hooksRef.current === null) {
      hooksRef.current = {};
      try { const r = await sGet("jpn101:hooks"); if (r) hooksRef.current = JSON.parse(r) || {}; } catch (e) {}
    }
    const cached = hooksRef.current[card.term];
    if (cached) { setHook({ term: card.term, text: cached }); return; }
    setHook({ term: card.term, text: "", busy: true });
    try {
      const { result } = await callAI("hook", { term: card.term, reading: card.reading, romaji: card.romaji, meaning: card.meaning });
      const text = (result.hook || "").trim();
      if (!text) throw new AIError(502, aiMessage(502));
      hooksRef.current[card.term] = text;
      sSet("jpn101:hooks", JSON.stringify(hooksRef.current));
      setHook({ term: card.term, text });
    } catch (e) { setHook({ term: card.term, err: e.message || aiMessage(0) }); }
  }, []);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");        // rōmaji the learner types on a production card
  const [verdict, setVerdict] = useState(null);  // {ok, got, want} once that answer is checked
  const [showWhy, setShowWhy] = useState(false);  // per-card "why am I seeing this?"
  const [running, setRunning] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const liveRef = useRef(null);
  const [prodSet, setProdSet] = useState(() => new Set());
  /* One mark per QUEUE POSITION, not per card: an item can legitimately appear several
     times in a session as learning steps, and each showing is its own beat of progress. */
  const fatigueLog = useRef([]);
  const startStateRef = useRef(null);
  const [xp, setXp] = useState(0);
  const [stopped, setStopped] = useState(null);   // {reason} once the session ends early
  const [award, setAward] = useState(null);      // {points, reasons, memory} for the flyup
  const [marks, setMarks] = useState([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [flash, setFlash] = useState(0);
  const shownRef = useRef(0);          // when the current card appeared
  const thinkRef = useRef(null);       // ms from shown → first reveal (think time)
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, running]);
  useEffect(() => {                    // auto-speak the term as soon as each card appears
    if (!running || !voiceOn) return;
    const c = queue[pos];
    if (!c) return;
    speakJa(c.reading || c.term, 0.88);   // match SpeakBtn's rate so this hits the same cache entry
    const next = queue[pos + 1];          // warm the cache for the next card while this one's up
    if (next) prefetchJa(next.reading || next.term, 0.88);
    return stopJa;
  }, [running, voiceOn, pos, queue]);
  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
      return !f;
    });
  }, []);
  const REQUEUE_GAP = 3, REQUEUE_CAP = 3;

  const weak = useMemo(() => cards.filter(isWeak), [cards]);

  const ranked = useMemo(() => cards.filter((c) => (c.seen || 0) > 0)
    .slice().sort((a, b) => masteryScore(a) - masteryScore(b)), [cards]);
  const weakest = useMemo(() => ranked.slice(0, 3), [ranked]);
  const focusPool = useMemo(() => ranked.slice(0, 12), [ranked]);  // weakest STUDIED words only — matches the Weakest list
  const newCount = useMemo(() => cards.filter((c) => !((c.seen || 0) > 0)).length, [cards]);
  const coverage = newCount > 12;                            // coverage phase: plenty of untouched words left
  /* Session mix.
     The old rule was `newCount > 12` → half the session is brand-new words. With 332
     untouched cards that condition is permanently true, so every session was 8 new words
     against 8 reviews no matter how much overdue work had piled up. Accuracy fell from
     98% to 36% over two weeks while effort went up, because most of what came round was
     material never seen before.
     New words are never capped to zero — there are class deadlines — but review debt now
     earns slots: the more overdue cards there are, the fewer new words share the session.
     Leeches are excluded here entirely and get their own mode; drilling a word sitting at
     0% after eight tries inside a normal session just taxes the whole session. */
  /* Session selection now comes from tools/session.mjs, which is pure and separately
     tested — the old inline version could only be checked by playing the app, and it had
     the new words stapled to the very end of the session with exactly one showing each.
     A card record IS a stat record here (seen/correct/fsrs/last/ms/msN all live on it),
     so the deck can be handed over as both items and stats without any translation. */
  /* The other decks load once and join the pool. Until they arrive the session is simply
     vocabulary-only, which is also the correct behaviour on a machine that has never
     opened the Kana or Kanji tabs. */
  /* Contextual material, mined from the scripted dialogue this app already ships. Real
     Japanese, already levelled to the course, already carrying English — and free, which
     a language model writing sentences on demand is not. Coverage is whatever the scripts
     happen to contain, and a word they never use simply gets no context exercise. */
  const clozeIndex = useMemo(
    () => addMinedSources(buildClozeIndex(SCRIPT_SEED, cards), cards),
    [cards],
  );
  /* The evidence log, read here for the two things it now feeds back into the session:
     which words this learner confuses, and how fast they normally answer each KIND of
     question. Both are learner-specific and neither can be guessed. */
  const [evidence, setEvidence] = useState([]);
  useEffect(() => { loadEvidence().then((e) => setEvidence(e.slice())).catch(() => {}); return subscribeEvidence(setEvidence); }, []);
  /* Generated sentences have to be in memory before the first session is built: capsFor
     reads them synchronously to decide whether a word can reach the context rung, and an
     unloaded store answers "no" for every word — the sentences would be sitting in storage,
     paid for, and never used. */
  const [contextReady, setContextReady] = useState(false);
  useEffect(() => { loadContext().then(() => setContextReady(true)).catch(() => setContextReady(true)); }, []);
  const confusion = useMemo(() => confusionFrom(evidence), [evidence]);
  const norms = useMemo(() => latencyNorms(evidence), [evidence]);
  const [foreign, setForeign] = useState([]);
  /* Reloaded whenever a session ends, not once per page load. This snapshot IS the
     other decks' progress; keeping a stale copy meant a kanji answered in lesson one
     still looked untouched in lesson eight and was introduced as new every time. */
  const [foreignEpoch, setForeignEpoch] = useState(0);
  useEffect(() => { loadForeignDecks(cards).then(setForeign).catch(() => {}); }, [cards.length, foreignEpoch]);

  /* The study plan reaches the scheduler here: pace decides how long a session runs, and
     the area priorities weight which decks it draws from. */
  const [plan, setPlan] = useState(PLAN_DEFAULT);
  useEffect(() => {
    loadPlan().then(setPlan).catch(() => {});
    return subscribePlan(setPlan);
  }, []);

  /* The words quarantined for the checkpoint this quarter. Derived from the deck and the
     calendar rather than stored, so every device agrees without syncing and a wiped setting
     cannot quietly let the test words back into study. */
  const heldOut = useMemo(() => reserveFor(cards, cycleFor()), [cards]);

  const smartPicks = useMemo(() => {
    /* Parked words are out of circulation, not deleted. Every mined word displaced one, so
       the number of things competing for attention stays fixed — which is the only reason
       mining makes this deck better rather than longer. */
    const items = cards
      .filter((c) => !c.parked)
      .map((c) => (c.order === undefined ? { ...c, order: c.lesson || 0 } : c));
    /* Sources declare what their items can be ASKED. This has to reach the scheduler, not
       just the renderer: reserving a production slot and only discovering downstream that
       the item has no reading spends the slot on a recognition question. */
    const source = [
      { deck: "vocab", items, stats: Object.fromEntries(cards.map((c) => [c.id, c])),
        weight: deckWeight(plan, "class"),
        /* context is claimed only when a sentence is already in hand — a textbook one or a
           generated one already fetched. Promising the rung and then having to go and get the
           sentence is how a card renders blank mid-session. */
        capsFor: (it) => ({ type: !!it.reading, listen: !!(it.reading || it.term),
                            context: hasContext(clozeIndex, it.id) || !!contextFor(it.id) }) },
      ...foreign.map((s) => ({
        ...s,
        weight: deckWeight(plan, s.deck),
        /* Kanji is deliberately not typeable. Producing a word from its meaning is a
           different ability from writing a character, and the app has no handwriting
           input — asking for one while measuring the other would be dishonest. */
        /* A kanji asked through a word CAN be typed — there is a word reading to produce.
           An isolated kanji card still cannot: the app has no handwriting input, and asking
           someone to type a character from its meaning measures something else entirely. */
        capsFor: (it) => ({
          type: (s.deck !== "kanji" || it.inContext) && !!it.reading,
          listen: !!(it.reading || it.term),
        }),
      })),
    ];
    /* The benchmark hold-out is invisible here. Without this the checkpoint would measure
       how well you revised the test rather than how much Japanese you have, and the whole
       point of having a number you can trust would be gone. */
    return buildSession(source, { now: Date.now(), isLeech, minutes: paceMinutes(plan.pace),
                                  exclude: heldOut });
    // retention.target: not a dep in the usual sense (it's a module `let`, not props/state) but
    // isLeech/dueness read it live, and the retention chip's onClick bumps `retentionPref`
    // right alongside it — so this recomputes on the same render that value changes.
  }, [cards, foreign, plan, clozeIndex, heldOut, retention.target, contextReady]);

  /* The queue still wants plain cards. Learning-step repeats are the same card appearing
     again later in the session, which is exactly what they should be. */
  /* Each queue entry carries the exercise it should be asked as. Repeats of the same item
     are separate objects with different formats, which is the point — three showings of
     one card teaches the card, three different questions teach the word. */
  /* Audio is off when the plan deprioritises listening, or when you've said this session
     you can't play sound. Same idea as the Kanji tab's no-audio path: being somewhere you
     can't make noise shouldn't cost you the session. */
  const [prodOpen, setProdOpen] = useState(false);
  /* Built from sentences this learner has actually met: the scripted dialogue, and the
     sentences that arrived attached to mined words. Nothing invented. */
  const prodDrills = useMemo(() => {
    const known = cards.filter((c) => (c.seen || 0) > 0).map((c) => c.term);
    const sources = [];
    for (const c of cards) if (c.mined && c.source) sources.push({ text: c.source, en: c.meaning || "" });
    for (const sc of SCRIPT_SEED) {
      for (const line of (sc.lines || [])) {
        /* The tokens ARE the word boundaries — the scripts store them so readings can sit
           above individual words — so the drill uses them rather than guessing from the
           joined string. */
        const parts = (line.tokens || []).map((t) => t.t || "").filter(Boolean);
        const text = parts.join("");
        if (text && line.en) sources.push({ text, en: line.en, chunks: parts });
      }
    }
    return drillSet(sources, 5, { known, seed: Math.floor(Date.now() / 86400000) });
  }, [cards]);

  const [noAudio, setNoAudio] = useState(false);
  const allowListen = !noAudio && (plan.priorities.listening || 1) >= 2;

  // Capabilities now travel with the candidate from the source, so nothing is re-derived
  // here and the scheduler and the renderer cannot disagree about what an item can carry.
  /* Only the ORDER is decided up front. The intervention for each card is chosen when the
     card is actually SERVED, because a repeat later in the same session has to be able to
     react to how the earlier showing went — baking the whole queue at the start froze the
     adaptive loop shut. */
  const smartPool = useMemo(
    () => smartPicks.map((p) => ({ ...p.item, _step: p.step, _pick: p })),
    [smartPicks],
  );
  const smartInfo = useMemo(() => describeSession(smartPicks), [smartPicks]);
  /* Cards whose repeats are deliberate. A correct answer normally drops a card's later
     copies from the queue — that rule exists for the miss-requeue, and it would silently
     delete every learning step the moment you got the first showing right, which is
     exactly when the steps matter most. */
  const stepIds = useMemo(
    () => new Set(smartPicks.filter((p) => p.step > 0).map((p) => p.item.id)),
    [smartPicks],
  );
  const leeches = useMemo(() => cards.filter(isLeech), [cards]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => (c.seen || 0) > 0 && dueness(c, now) >= 1).length;
  }, [cards, retention.target]);
  const masteredPct = useMemo(() => {
    if (!cards.length) return 0;
    return Math.round(cards.filter((c) => (c.level || 0) >= 4).length / cards.length * 100);
  }, [cards]);

  /* ── buddy state ── */
  const [days, setDays] = useState(null);
  // Re-read after a pull too, not only when a session starts/ends — otherwise the streak and
  // "N today" keep showing this device's pre-sync numbers until the next session toggle.
  useEffect(() => {
    const load = () => loadDays().then((d) => setDays({ ...d }));
    load();
    return onAfterPull(load);
  }, [running]);
  const streak = useMemo(() => streakFrom(days), [days]);
  const todayKey = localDayKey();
  const todayRev = (days && days[todayKey] && days[todayKey].rev) || 0;
  const knownCount = useMemo(() => cards.filter((c) => (c.level || 0) >= 4).length, [cards]);
  const [retentionPref, setRetentionState] = useState(retention.target);
  // module-level retention.target is refreshed by its own onAfterPull above, which is
  // registered first (at module load) and so has already run when this callback fires
  useEffect(() => onAfterPull(() => setRetentionState(retention.target)), []);
  /* What the memory model actually predicts. Shown because a scheduler you can't inspect
     is a scheduler you don't trust — and because "34 words are fading" is a far better
     reason to open the app than "you have 392 due". */
  const forecast = useMemo(() => {
    const now = Date.now();
    let fading = 0, solid = 0, week = 0;
    for (const c of cards) {
      if (!((c.seen || 0) > 0)) continue;
      const r = recallChance(c, now);
      if (r == null) continue;
      if (r < retention.target) fading++;
      if (r >= retention.target) solid++;
      const st = c.fsrs || seedFromHistory(c);
      if (st && st.due && st.due - now < 7 * 86400000) week++;
    }
    return { fading, solid, week };
  }, [cards, retention.target]);
  const buddy = useMemo(() => {
    const state = mascotState({ studiedToday: todayRev > 0, dueCount, streak });
    // One honest sentence, matched to the state. No fake enthusiasm when the numbers
    // don't support it — the whole reason the old "57% never missed" felt hollow.
    const line =
      state === "sleeping" ? (streak > 0 ? `${streak}-day streak — keep it alive?` : "Ready when you are.")
      : state === "worried" ? `${dueCount} reviews have piled up. Little and often beats a big catch-up.`
      : state === "proud" ? `${streak} days straight. This is the part that actually works.`
      : knownCount > 0 ? `${knownCount} words are properly solid now.`
      : "Nice — that's a start.";
    return { state, line };
  }, [todayRev, dueCount, streak, knownCount]);
  const batches = useMemo(() => {
    const map = new Map();
    cards.forEach((c) => { const sec = sectionOf(c); if (!map.has(sec)) map.set(sec, []); map.get(sec).push(c); });
    const scored = (group) => {
      let seen = 0, correct = 0;
      group.forEach((c) => { seen += c.seen || 0; correct += c.correct || 0; });
      return seen ? correct / seen : null;
    };
    const base = Array.from(map.keys()).map((sec) => ({ name: sec, cards: map.get(sec), rate: scored(map.get(sec)) }));

    // synthetic per-Act "Dry Run" — a cumulative review across every scene of an act, so you
    // can drill a whole act at once instead of one scene chip at a time.
    const actGroups = new Map();
    cards.forEach((c) => {
      const m = /^(\d+)-/.exec(sectionOf(c));
      if (!m) return;
      const act = m[1];
      if (!actGroups.has(act)) actGroups.set(act, []);
      actGroups.get(act).push(c);
    });
    const dryRuns = [];
    actGroups.forEach((group, act) => {
      if (group.length < 8) return; // not worth a separate cumulative review for a tiny act
      dryRuns.push({ name: `Act ${act} Dry Run`, cards: group, rate: scored(group) });
    });

    return base.concat(dryRuns).sort((a, b) => sectionRank(a.name) - sectionRank(b.name));
  }, [cards]);

  const smartBatch = useMemo(() => {
    if (!batches.length) return null;
    const fresh = batches.filter((b) => b.rate === null);
    if (fresh.length) return fresh[0];
    return batches.slice().sort((a, b) => a.rate - b.rate)[0];
  }, [batches]);

  const lastPool = useRef(null);
  const start = useCallback((subset, preordered, opts) => {
    const pool0 = (subset && subset.length) ? subset : cards;
    lastPool.current = { subset: (subset && subset.length) ? subset : null, preordered, opts };
    /* Leech throttle: drilling stuck words harder doesn't work, so a normal session gets
       at most three. It must NOT apply when the session IS the stuck words — that turned
       "Trouble words · 62 stuck" into the same three cards forever. */
    const stuck = pool0.filter(isLeech);
    const pool = (opts && opts.leechSession) || stuck.length <= 3
      ? pool0
      : pool0.filter((c) => !isLeech(c)).concat(stuck.slice(0, 3));
    const ordered = (preordered ? [...pool] : pool
      .map((c) => ({ c, k: masteryScore(c) + Math.random() * 0.3 }))  // weakest (lowest) first; small stable jitter
      .sort((a, b) => a.k - b.k)
      .map((x) => x.c));
    setQueue(ordered);
    setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    setCombo(0); setBestCombo(0);
    setMarks([]);
    setXp(0); setAward(null);
    fatigueLog.current = [];
    setStopped(null);
    /* Snapshot the memory state the session STARTS from, so the summary can report what
       actually moved. Accuracy answers "how did I do at answering"; this answers "what
       changed in my memory", which is the only thing a review session is for. */
    startStateRef.current = new Map(cards.map((c) => {
      const st = c.fsrs || seedFromHistory(c);
      return [c.id, { S: (st && st.S) || 0, warmth: masteryWarmth(c), leech: isLeech(c) }];
    }));
    /* Interleave production into the session rather than leaving it on a separate tab you
       have to remember to visit. Roughly a third of the cards that have earned it get
       asked backwards — enough that the direction is genuinely unpredictable, which is
       the point: a block of ten recognition cards lets you settle into one mode, and
       mixing retrieval types is what makes each retrieval effortful. Capped so a session
       never becomes mostly production, which is demoralising at this stage. */
    const nowP = Date.now();
    const owed = ordered.filter((c) => prodDue(c, nowP));
    setProdSet(new Set(owed.slice(0, 6).map((c) => c.id)));
    missRef.current = {};
    setHook(null); setDebrief(null);
    setFlipped(false); setTyped(""); setVerdict(null); setShowWhy(false); setRunning(true);
    sessionLog.current = [];
    baselineRef.current = null;
    loadEvidence().then((list) => {
      const g = gainPerMinute((list || []).filter((r) => r && r.at > Date.now() - 30 * 86400000));
      baselineRef.current = g.rate != null && g.n >= MIN_ROWS ? g : null;
    }).catch(() => {});
    warmContext(ordered);
  }, [cards, coverage]);

  /* Fetch sentences for words that are ABOUT to need one, not the ones in front of you.
     A word becomes context-capable only once its sentence has landed, so this runs a session
     ahead: the words strong enough to reach the top rung soon get their sentence written now,
     and the rung is simply there when they arrive. A few per session, because the point is to
     accumulate quietly rather than to spend a minute of study time on API calls.

     Silent on failure by design — not signed in, offline, out of quota and "the model was
     busy" all mean the same thing here, which is that this word keeps its old exercises for
     now and nothing is worse than it was. */
  const warmContext = useCallback(async (pool) => {
    if (!AI_ENABLED || !loadSession()) return;
    try { await loadContext(); } catch (e) { return; }
    const need = (pool || [])
      .filter((c) => c && c.term && c.reading
        && !hasContext(clozeIndex, c.id) && !contextFor(c.id)
        && recallUnlocked(c))                        // has earned production; the rung is in reach
      .slice(0, 3);
    for (const c of need) {
      try {
        const { result } = await callAI("context_sentence", {
          term: c.term, reading: c.reading, meaning: c.meaning,
        });
        if (result && result.sentence) {
          saveContext(c.id, result);
          setContextTick((n) => n + 1);
        }
      } catch (e) { return; }                        // one failure means stop, not retry 3x
    }
  }, [clozeIndex]);

  const card = queue[pos];
  /* The scheduler picks the exercise; prodSet is the older mechanism and still stands in
     when a card arrived from somewhere other than Smart Review (a section drill, Trouble
     words) and so carries no format of its own. */
  /* Converting here rather than only in the builder means "I can't play audio" takes
     effect on the card in front of you and every one after it, without rebuilding the
     queue mid-session and losing your place. */
  /* Decided HERE, for this card, right now — against the card's current state rather than
     the snapshot taken when the session was built. A card failed two minutes ago arrives
     at its repeat carrying that failure, so the plan and the cue reflect it. */
  const live = card ? (cards.find((c) => c.id === card.id) || card) : null;
  const intervention = useMemo(() => {
    if (!card) return null;
    /* A rescue stage IS the decision — it was derived from what actually broke, so the
       policy does not get to re-derive a format here and undo the ladder. */
    if (card._rescue) {
      const s = card._rescue;
      return { skill: s.skill, direction: s.direction, cue: s.cue, format: s.format,
               expected: null, rescue: s };
    }
    const base = card._pick;
    if (!base) return null;                       // came from a section drill, not Smart Review
    return interventionFor(
      { ...base, st: live, step: card._step || 0,
        recognition: skillOf(live, "fsrs"), production: skillOf(live, "rfsrs"),
        lastFailure: (live && live.lastFailure) || null },
      { allowListen },
    );
  }, [card, live, allowListen]);

  const rawFmt = card
    ? ((intervention && intervention.format) || (prodSet.has(card.id) ? "type" : "recall"))
    : "recall";
  const fmt = rawFmt === "listen" && noAudio ? "mc" : rawFmt;
  const cueLevel = intervention ? intervention.cue : null;
  const whyThis = intervention ? explainPick({ ...card._pick, ...intervention, st: live }) : null;
  const isProd = fmt === "type";
  const done = running && (pos >= queue.length || !!stopped);

  /* A finished session is the moment the other decks' snapshot is certainly stale.
     This has to live with the other hooks: there are early returns further down, and a
     hook placed after them runs on some renders and not others, which React counts as
     the hook order changing. */
  useEffect(() => { if (done) setForeignEpoch((n) => n + 1); }, [done]);

  /* Multiple choice needs wrong answers that are actually tempting. Same kind and similar
     length beats random: picking "Tuesday" out of {Tuesday, to swim, expensive, library}
     tests nothing, because three options are obviously not days. */
  /* A textbook sentence first — it is real material the learner has met — and a generated
     one only where there is none. */
  const clozeEx = useMemo(
    () => (card && fmt === "cloze"
      ? (clozeFor(clozeIndex, card) || clozeFromSentence(card, contextFor(card.id)))
      : null),
    [card, fmt, clozeIndex, contextTick],
  );
  const choices = useMemo(() => {
    if (!card || (fmt !== "mc" && fmt !== "listen")) return [];
    const pool = cards.filter((c) => c.id !== card.id && c.meaning);
    /* Distractors this learner has ACTUALLY mixed up with this word come first. A good
       distractor is plausible to this person and wrong in this context; "same length" is
       only a stand-in for that, used when there is no confusion history yet. */
    const known = (confusion.get(card.id) || [])
      .map((id) => pool.find((c) => c.id === id)).filter(Boolean);
    /* Group by PART OF SPEECH. This line used to filter on `kind`, which is the writing
       system (hiragana/katakana/kanji) — so "same kind" matched orthography and did nothing
       for plausibility. Asking for 急ぎます against {to hurry, Who is it that cleaned up?,
       Vietnamese (language), break} is not a vocabulary question: one option is a verb and
       the prompt visibly ends in ます, so it is answerable from grammar alone.
       Falls back to the whole pool when a category is too thin to fill four slots. */
    const myPos = posOf(card);
    const samePos = pool.filter((c) => posOf(c) === myPos);
    const near = samePos.length >= 12 ? samePos : pool.filter((c) => c.kind === card.kind);
    const bag = (near.length >= 12 ? near : pool);
    const seed = String(card.id).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + (card._step || 0);
    const picked = [];
    const used = new Set();
    for (let i = 0; i < bag.length && picked.length < 3; i++) {
      const c = bag[(seed * 7 + i * 13) % bag.length];
      if (!c || used.has(c.id) || c.meaning === card.meaning) continue;
      used.add(c.id); picked.push(c);
    }
    const all = [...known.slice(0, 2), ...picked, card].slice(0, 4);
    if (!all.includes(card)) all[all.length - 1] = card;
    // Deterministic shuffle: the answer must not always land in the same slot.
    return all.map((c, i) => ({ c, k: (seed + i * 31) % all.length })).sort((a, b) => a.k - b.k).map((x) => x.c);
  }, [card, fmt, cards, confusion]);

  const answerChoice = useCallback((choice) => {
    if (verdict) return;
    const c = queue[pos];
    if (!c) return;
    /* Choice formats have no reveal step, so nothing was setting thinkRef and every
       multiple-choice, listening and cloze answer was recorded as ms: 0 — i.e. untimed.
       That silently disabled four things at once: the latency norm for those formats
       could never form (needs timed correct answers), gradeAgainstNorm fell back to a
       flat GOOD for all of them, the speed bonus could not fire, and fatigue could not
       see rapid guessing. Choosing IS the answer here, so the think time is simply how
       long the card was on screen. */
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    const ok = choice.id === c.id;
    setVerdict({ ok, mc: true, chose: choice.meaning, chosenId: choice.id, want: c.meaning });
    setFlipped(true);
  }, [queue, pos, verdict]);

  useEffect(() => {                                   // auto-debrief when a session ends with misses
    if (!AI_ENABLED || !loadSession()) return;         // not signed in: skip silently, keep the "Missed: …" fallback line
    if (!running || queue.length === 0 || pos < queue.length || debrief !== null) return;
    const missed = queue.filter((c, i) => queue.findIndex((x) => x.id === c.id) === i && missRef.current[c.id]);
    if (missed.length === 0) return;
    setDebrief({ busy: true });
    callAI("debrief", { missed: missed.slice(0, 5).map((c) => ({ term: c.term, romaji: c.romaji, meaning: c.meaning })) })
      .then(({ result }) => setDebrief({ text: (result.text || "").trim() }))
      .catch(() => setDebrief({ err: true }));
  }, [running, pos, queue, debrief]);

  const grade = useCallback((got) => {
    const c = queue[pos];
    if (!c) return;
    setHook(null);
    const think = thinkRef.current || 0;
    // The combo counts instant recall, not merely correct answers — it rewards the thing
    // that actually correlates with remembering the word tomorrow.
    /* Completing the LAST rung of a rescue is the moment the item flipped from lost to
       recovered — the most earned success in the session, so it gets its own mark and its
       own flash rather than being scored as an ordinary correct answer. */
    const comeback = got && card && card._rescue && card._rescue.last;
    setMarks((m) => { const n = m.slice(); n[pos] = got ? (comeback ? "back" : think > 0 && think < 3000 ? "fast" : "ok") : "miss"; return n; });
    if (comeback) setFlash(Date.now());
    if (got && think > 0 && think < 3000) {
      setCombo((n) => { const v = n + 1; setBestCombo((b) => Math.max(b, v)); return v; });
      setFlash(Date.now());
    } else if (!got) {
      /* A miss DEGRADES the combo, it does not wipe it. Zeroing a long run on one slip is
         the mechanic that teaches people to avoid the cards they are worst at — which is
         precisely the material spaced repetition exists to put in front of them. Dropping
         two keeps the stake real without making a hard card feel like a punishment. */
      setCombo((n) => Math.max(0, n - 2));
    }
    /* Credit the area the exercise actually worked, not the deck it came from. A typed
       answer is writing practice and a listening question is listening practice even
       when the word is ordinary vocabulary — otherwise the coverage report says you
       never listen while you have been listening all week. */
    const workedArea = fmt === "listen" ? "listening" : fmt === "type" ? "writing" : areaForDeck(c.src || "class");
    // Kana, kanji and 10k cards belong to their own decks and go home to their own keys.
    const outcome = { failure: got ? null : classifyFailure({ format: fmt,
      expected: c.reading || c.term, got: verdict && verdict.got ? verdict.got : "" }),
      skill: skillForFormat(fmt) };
    if (c.src) recordForeign(c, got, thinkRef.current || 0, workedArea, outcome);
    else onResult(c.id, got, prodSet.has(c.id) ? "prod" : undefined, thinkRef.current || undefined, workedArea, outcome);

    /* Evidence about the ABILITY, recorded alongside the card update. "Wrong" on its own
       is nearly useless: someone who reads 火曜日, knows it means Tuesday, and mistypes
       かようび has a reading fumble, not a vocabulary gap, and the next intervention
       should differ. The predicted-recall figure is kept so the model's confidence can
       later be checked against what actually happened. */
    const evSkill = skillForFormat(fmt);
    /* Stability either side of this answer, from the same function that just scheduled
       the card. This is what makes the answer measurable at all: learning gain is a
       change in stability, and a row without it is skipped by the metric rather than
       counted as a zero (tools/gain.mjs). */
    const stab = reviewOutcome(live || c, {
      got, ms: think, dir: prodSet.has(c.id) ? "prod" : undefined,
      area: workedArea, foreign: !!c.src,
    });
    /* Score the ANSWER, not the outcome. Every input here is already in the evidence
       record — cue level, latency against this learner's own median for this skill+format,
       and how long the scheduler had left the item alone. */
    {
      const stabDays = (live && live.fsrs && live.fsrs.S) || 0;
      const lv = latencyVerdict(think, evSkill, fmt, latencyNormsRef.current);
      const sc = scoreAnswer({ ok: got, cue: cueLevel, verdict: lv, comeback, stabilityDays: stabDays });
      setXp((n) => n + sc.points);
      setAward({ ...sc, memory: isMemoryCheck(stabDays, got), at: Date.now() });
    }
    if (evSkill) {
      const rec = makeEvidence({
        id: c.id, deck: c.src || "vocab", format: fmt, skill: evSkill,
        /* The cue the learner actually saw. This read c._cue, a field the just-in-time
           intervention rewrite renamed out of existence — so every record written since
           then carries cue: null and no cue calibration was possible. */
        cue: typeof cueLevel === "number" ? cueLevel : null,
        ok: got, ms: think,
        failure: got ? null : classifyFailure({
          format: fmt,
          expected: c.reading || c.term,
          got: verdict && verdict.got ? verdict.got : "",
        }),
        // The specific wrong word picked — the raw material for learner-aware distractors.
        confused: !got && verdict && verdict.chosenId ? verdict.chosenId : null,
        /* Two different predictions, kept apart because they answer different questions.
           `predicted` is what the intervention model believed about THIS exercise —
           this ability, at this cue — and it is the number that chose the exercise, so it
           is the one whose calibration decides whether the scheduler is trustworthy.
           `pRecall` is FSRS asking only "would the card come back today", which knows
           nothing about being asked to produce rather than recognise.

           Records written before this split have `predicted` holding the FSRS figure and
           no `pRecall` at all; the calibration report keys off that absence rather than
           averaging two different quantities together. */
        predicted: intervention && typeof intervention.expected === "number"
          ? intervention.expected : recallChance(c, Date.now()),
        pRecall: recallChance(c, Date.now()),
        s0: stab.s0, s1: stab.s1,
      });
      logEvidence(rec);
      sessionLog.current.push(rec);
      /* Fatigue needs the learner's OWN fast threshold, not a constant: a quick thinker
         answering in 800ms is not guessing, and a deliberate one at 4s is not tired. The
         norm is per skill+format and already maintained. */
      {
        /* Falls back to a floor when there is no norm yet. A norm needs eight correct
           answers of that skill+format, so a new learner (or a new exercise type) has
           none — and without a threshold the rapid-guess signal can never fire, which
           made fatigue undetectable for exactly the people most likely to bail. The floor
           is deliberately conservative: reading four options and choosing takes longer
           than 1.2s for anyone, so a WRONG answer inside it was not a considered one. */
        const n = latencyNormsRef.current && latencyNormsRef.current[evSkill + "|" + fmt];
        fatigueLog.current.push({ ok: got, ms: think, fastMs: n ? n.fast : 1200 });
      }

    }
    if (got) {
      if (!missRef.current[c.id]) setFirstTry((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      setPassed((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      // Planned learning steps survive; only miss-requeue duplicates are dropped.
      if (!stepIds.has(c.id)) setQueue((prev) => prev.filter((x, idx) => idx <= pos || x.id !== c.id));
    } else {
      setStruggled((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      const m = (missRef.current[c.id] || 0) + 1;
      missRef.current[c.id] = m;
      if (m <= REQUEUE_CAP) {
        /* A miss now schedules a RECOVERY: a short ladder starting below what just beat you
           and climbing back, so the item is last met as a SUCCESS. Successful retrieval is
           what builds stability — a failed one builds very little — so ending on the win is
           the better memory outcome as well as the better beat. Stages go in back-to-back
           immediately; a rescue only works while the miss is still live in mind. Falls back
           to the old spaced requeue when there is no sensible ladder. */
        const stages = buildRecovery(outcome && outcome.failure, {
          failedCue: intervention ? intervention.cue : null,
          caps: (c._pick && c._pick.caps) || {},
        });
        setQueue((prev) => {
          const next = prev.slice();
          if (stages.length) {
            next.splice(Math.min(pos + 1, next.length), 0,
                        ...stages.map((s) => ({ ...c, _rescue: s, _step: 0 })));
          } else {
            next.splice(Math.min(pos + 1 + REQUEUE_GAP, next.length), 0, c);
          }
          return next;
        });
      }
    }
    setFlipped(false);
    setTyped(""); setVerdict(null); setShowWhy(false);
    /* Ask whether this is a good place to stop, rather than marching to a fixed count.
       More questions is not more learning, and the honest end of a session is when the
       learner stops retrieving and starts tapping. */
    {
      const fat = fatigueFrom(fatigueLog.current);
      const verdictStop = shouldStop({
        done: fatigueLog.current.length,
        planned: queue.length,
        fatigue: fat.level,
        remainingValue: 1,     // TODO: fold in the real remaining practice value
      });
      if (verdictStop.stop && verdictStop.reason !== "done") {
        setStopped({ reason: verdictStop.reason, note: STOP_NOTE[verdictStop.reason], fatigue: fat });
      }
    }
    setPos((p) => p + 1);
  }, [queue, pos, onResult]);

  /* ── spelling ──
     A production card used to be self-graded: see the English, think of the Japanese,
     flip, decide whether you were right. That grades recognition of your own answer, not
     production of it, and it is generous in exactly the way that keeps a word feeling
     learned while it isn't. Typing the reading settles it objectively — the same argument
     the Kanji tab already makes for its own exercises.

     Rōmaji in, kana out, via the converter the Dates tab already uses: no IME needed, and
     "si"/"shi", "tu"/"tsu", "zyuppun"/"jyuppun" all land on the same kana. */
  const checkSpelling = useCallback(() => {
    const c = queue[pos];
    if (!c || !typed.trim()) return;
    const want = c.reading || c.term;
    const ok = kanaEqual(toKana(typed.trim()), want);
    setVerdict({ ok, got: toKana(typed.trim()), want });
    setFlipped(true);
  }, [queue, pos, typed]);

  // keyboard: space/enter flips; when flipped → →/Enter = got it, ←/Backspace = review
  useEffect(() => {
    if (!running || done) return;
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.code === "Space" || (e.code === "Enter" && !flipped)) { e.preventDefault(); flip(); }
      else if (flipped && (e.code === "ArrowRight" || e.code === "Enter")) { e.preventDefault(); grade(true); }
      else if (flipped && (e.code === "ArrowLeft" || e.code === "Backspace")) { e.preventDefault(); grade(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, done, flipped, grade, flip]);

  if (cards.length === 0) {
    return (
      <div className="tc-empty">
        <p>No words yet. Your deck is empty.</p>
        <button className="tc-btn tc-btn-primary" onClick={goAdd}>Add your first words</button>
      </div>
    );
  }

  if (!running) {
    return (
      <div className="tc-study-setup">
        <div className="tc-buddy">
          <Mascot state={buddy.state} />
          <div className="tc-buddytext">
            <p className="tc-buddyline">{buddy.line}</p>
            <div className="tc-buddystats">
              <span className={"tc-stat" + (streak > 0 ? " is-on" : "")}>
                <b>{streak}</b> day{streak === 1 ? "" : "s"} in a row
              </span>
              {/* Deliberately counts only level 4+. "Never missed" was flattering and
                  meaningless — most of those had been seen once. This number is small and
                  moves slowly, which is the point: it can be trusted. */}
              <span className="tc-stat"><b>{knownCount}</b> words solid</span>
              {todayRev > 0 && <span className="tc-stat"><b>{todayRev}</b> today</span>}
              {forecast.fading > 0 && <span className="tc-stat"><b>{forecast.fading}</b> fading</span>}
            </div>
          </div>
        </div>
        <div className="tc-hero">
          {dueCount > 0 ? (
            <>
              <div className="tc-heronum">{dueCount}</div>
              <p className="tc-herolabel">due for review</p>
              <p className="tc-herosub">{cards.length} words · {newCount} untouched</p>
            </>
          ) : newCount > 0 ? (
            <>
              <div className="tc-heronum">{newCount}</div>
              <p className="tc-herolabel">new words ready to learn</p>
              <p className="tc-herosub">{cards.length} words · {ranked.length} studied so far</p>
            </>
          ) : (
            <>
              <div className="tc-heronum">✓</div>
              <p className="tc-herolabel">all caught up</p>
              <p className="tc-herosub">{cards.length} words · check back later for reviews</p>
            </>
          )}
        </div>
        {smartPool.length > 0 && (
          <button className="tc-btn tc-start tc-smart-btn" onClick={() => start(smartPool, true)}>
            {/* Say what is actually in the session. "16 cards" was true and told you
                nothing; "3 new · 2 fading" is the reason to press the button. */}
            🧠 Smart Review · {smartPool.length} cards{smartInfo.fresh > 0 ? ` · ${smartInfo.fresh} new` : ""}{smartInfo.stale > 0 ? ` · ${smartInfo.stale} fading` : ""}
          </button>
        )}
        {/* Stuck words get their own session instead of being sprinkled through every
            other one. 歩いて sitting at 0% after eight attempts doesn't need more of the
            same drill — it needs to be looked at deliberately, and it shouldn't be taxing
            sessions that are otherwise going fine. */}
        {leeches.length > 0 && (
          <button className="tc-btn tc-start tc-troublebtn" onClick={() => start(leeches.slice(0, 12), false, { leechSession: true })}>
            🩹 Trouble words · {leeches.length} stuck
          </button>
        )}
        {smartPool.length > 0 && (
          <p className="tc-smarthint">{
            dueCount >= 15
              ? `Mostly catch-up while ${dueCount} are due, plus a few new ones.`
              : `Your weakest and most overdue, plus new words${newCount > 0 ? ` (${newCount} left)` : ""}.`
          }</p>
        )}

        {ranked.length > 0 && (
          <div className="tc-retention">
            <span className="tc-retlabel">Aim to remember</span>
            <div className="tc-kanaseg">
              {[[0.85, "85%"], [0.9, "90%"], [0.95, "95%"]].map(([v, label]) => (
                <button key={v} className={"tc-fchip" + (Math.abs(retentionPref - v) < 0.001 ? " is-on" : "")}
                  onClick={() => { setRetention(v); setRetentionState(v); }}>{label}</button>
              ))}
            </div>
            <p className="tc-smarthint">
              {retentionPref <= 0.85 ? "Fewer reviews, more forgetting. Good when you're buried."
                : retentionPref >= 0.95 ? "Many more reviews for a little more recall. Use before an exam."
                : "The researched default — reviews land just as a word starts to slip."}
            </p>
          </div>
        )}
        {ranked.length > 0 && (
          <div className="tc-insights">
            <div className="tc-masterystrip">
              <span>Mastery</span>
              <div className="tc-mbar"><div className="tc-mfill" style={{ width: `${masteredPct}%` }} /></div>
              <span className="tc-mpct">{masteredPct}%</span>
            </div>
            <div className="tc-wscols tc-wscols-solo">
              <div>
                <p className="tc-wslabel tc-rate-low">Weakest</p>
                {weakest.map((c) => (
                  <span key={c.id} className="tc-wsword">
                    {c.term}{c.reading && c.reading !== c.term ? ` ${c.reading}` : ""}
                    <em className="tc-wsromaji"> {c.romaji} — {c.meaning}</em>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="tc-batchhead"><span>Sections</span></div>
        <div className="tc-batchgrid">
          {batches.map((b) => {
            const art = sectionArt(b.cards);
            return (
              <button key={b.name} className="tc-batchchip" onClick={() => start(b.cards)}
                style={{ background: `radial-gradient(140% 160% at 30% -15%, hsla(${hueFor(b.name)},75%,62%,.5) 0%, hsla(${hueFor(b.name)},55%,42%,.16) 55%, rgba(255,255,255,.02) 85%)` }}>
                <div className="tc-batchglass">
                  {art[0] && <span className="tc-batchicon" aria-hidden="true">{art[0]}</span>}
                  <span className="tc-batchnum">{b.name}</span>
                  <span className={"tc-batchmeta" + (b.rate === null ? " tc-rate-new" : b.rate < 0.6 ? " tc-rate-low" : "")}>
                    {b.cards.length} words · {b.rate === null ? "new" : Math.round(b.rate * 100) + "%"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="tc-setupfoot">
          <button className="tc-btn tc-btn-sm" onClick={() => start()}>All · {cards.length}</button>
          {weak.length > 0 && (
            <button className="tc-btn tc-btn-sm" onClick={() => start(weak)}>Weak · {weak.length}</button>
          )}
        </div>
        <p className="tc-hintline">Tip: Space flips · → got it · ← missed</p>
      </div>
    );
  }


  if (done) {
    /* Scored over what was actually ANSWERED, not over what was planned. poolSize is the
       size of the queue at the start, and a session can legitimately end before reaching
       all of it — the adaptive stop does exactly that, and a correct answer drops that
       card's later copies. Dividing by the plan meant a session where every single answer
       was right still reported 80%, with no misses listed to explain the missing 20%. */
    const answered = new Set([...passed, ...struggled]);
    const asked = answered.size || poolSize;
    const pct = asked ? Math.round((firstTry.size / asked) * 100) : 0;
    const missedCards = cards.filter((c) => struggled.has(c.id));
    return (
      <div className="tc-done">
        <p className="tc-eyebrow">{stopped ? "Good place to stop" : "Session complete"}</p>
        {/* An early finish has to read as the system respecting your time, not as the
            session being cut short or as a telling-off for getting tired. */}
        {stopped && <p className="tc-stopnote">{stopped.note}</p>}
        <div className="tc-bignum">{pct}<span>%</span></div>
        <p className="tc-donesub">{firstTry.size} nailed first try{missedCards.length > 0 ? ` · ${missedCards.length} to review` : ""} · {asked} card{asked === 1 ? "" : "s"}{asked < poolSize ? ` of ${poolSize}` : ""}</p>
        {/* What MOVED. A percentage says how the answering went; these say what happened to
            the memory, which is the thing the session was actually for. */}
        {(() => {
          const before = startStateRef.current;
          if (!before || !before.size) return null;
          const GOLD = 0.75;                       // the amber -> gold stop in MASTERY_STOPS
          let gold = 0, freed = 0, days = 0;
          for (const c of cards) {
            const b = before.get(c.id);
            if (!b) continue;
            const st = c.fsrs || seedFromHistory(c);
            const S = (st && st.S) || 0;
            if (S > b.S) days += S - b.S;
            if (masteryWarmth(c) >= GOLD && b.warmth < GOLD) gold++;
            if (b.leech && !isLeech(c)) freed++;
          }
          const bits = [];
          if (gold) bits.push(gold + (gold === 1 ? " word moved into gold" : " words moved into gold"));
          if (freed) bits.push(freed + (freed === 1 ? " leech broken" : " leeches broken"));
          if (days >= 1) { const d = Math.round(days); bits.push("+" + d + (d === 1 ? " day" : " days") + " of staying power"); }
          if (!bits.length) return null;
          return <p className="tc-donemove">{bits.join(" · ")}</p>;
        })()}
        {/* The north-star metric, closed at the moment it was earned. Shown only against
            the learner's own recent rate — "0.42 per minute" is not a fact anyone can act
            on, and inventing a target to compare it against would be worse than silence. */}
        {(() => {
          const g = gainPerMinute(sessionLog.current);
          const base = baselineRef.current;
          /* Silent when the session bought no durable memory. The line above counts every
             upward flicker of stability including sub-day ones, so a session of pure
             misses can read "+5 days of staying power" — and "0% of your usual rate"
             next to it looks like one of the two is broken. Neither is: they answer
             different questions. But a results screen is the wrong place to litigate
             that, and the screen already says which words to review. */
          if (g.rate == null || !(g.gain > 0) || !base || !(base.rate > 0)) return null;
          const x = g.rate / base.rate;
          const pace = x >= 1.25 ? "faster learning than usual"
            : x <= 0.75 ? "slower going than usual" : "about your usual pace";
          return (
            <p className="tc-donerate">
              <b>{Math.round(x * 100)}%</b> of your usual learning rate — {pace}
            </p>
          );
        })()}
        {xp > 0 && <p className="tc-donexp">{xp} <span>xp earned</span></p>}
        {bestCombo >= 2 && (
          <p className="tc-donecombo">best run: <b>{bestCombo}</b> instant recalls back to back</p>
        )}

        {/* The second block of the session. Reviewing is recognition; this is the part that
            asks you to put a sentence together, which is the ability the numbers say is
            missing. Offered rather than forced — a five-minute day should still be able to
            end after the reviews. */}
        {prodDrills.length > 0 && (
          prodOpen
            ? <ProductionBlock drills={prodDrills} onDone={() => setProdOpen(false)} />
            : (
              <button className="tc-btn tc-btn-sm tc-btn-primary" style={{ marginTop: 12 }}
                onClick={() => setProdOpen(true)}>
                Build {prodDrills.length} sentences · ~5 min
              </button>
            )
        )}
        {debrief && debrief.busy && <p className="tc-debrief tc-debrief-busy">✨ Coach is looking at what you missed…</p>}
        {debrief && debrief.text && <p className="tc-debrief">✨ {debrief.text}</p>}
        {(!AI_ENABLED || (debrief && debrief.err)) && missedCards.length > 0 && (
          <p className="tc-debrief tc-debrief-busy">Missed: {missedCards.slice(0, 6).map((c) => c.term).join("、")} — hit "Review" below and they'll come right back.</p>
        )}
        {/* What actually happened, per ability. Deliberately phrased as counts the app
            can defend — "12 answered on production" is measurable, "you mastered 12
            words" is a claim the model has no standing to make. */}
        {(() => {
          const s = summarise(sessionLog.current);
          if (!s.answered) return null;
          const FAIL_LABEL = {
            reading: "recalling readings", meaning: "meanings", listening: "catching it by ear",
            production: "producing it", orthography: "spelling", context: "using it in context",
            conjugation: "conjugating it",
            blank: "drawing a blank",
          };
          return (
            <div className="tc-sessum">
              <p className="tc-sessumh">What this worked on</p>
              <ul className="tc-sessumlist">
                {s.skillsWorked.map((k) => (
                  <li key={k}>
                    <span>{SKILL_LABEL[k] || k}</span>
                    <b>{s.bySkill[k].ok}/{s.bySkill[k].n}</b>
                  </li>
                ))}
                {s.introduced > 0 && <li><span>New words met</span><b>{s.introduced}</b></li>}
              </ul>
              {s.commonestFailure && (
                <p className="tc-sessumnote">
                  Most misses were about <b>{FAIL_LABEL[s.commonestFailure] || s.commonestFailure}</b>.
                </p>
              )}
            </div>
          );
        })()}
        <div className="tc-donebtns">
          {missedCards.length > 0 && (
            <button className="tc-btn tc-btn-primary" onClick={() => start(missedCards)}>Review the {missedCards.length} you missed</button>
          )}
          <button className="tc-btn" onClick={() => {
            const L = lastPool.current;
            start(L && L.subset ? L.subset : smartPool, L ? L.preordered : true, L ? L.opts : undefined);
          }}>Go again</button>
          <button className="tc-btn" onClick={() => setRunning(false)}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-study">
      <div className="tc-progress">
        {/* One segment per beat of the session. Duolingo’s single most load-bearing UI
            element: it turns "this continues" into "this ends, and soon". */}
        <div className="tc-segrail" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length}
             aria-valuenow={pos} aria-label="Session progress">
          {queue.map((_, i) => (
            <span key={i} className={"tc-seg2" + (i === pos ? " is-now" : marks[i] ? " is-" + marks[i] : "")} />
          ))}
        </div>
        <span className="tc-progtext">{passed.size} / {poolSize}</span>
        {xp > 0 && <span className="tc-xp" key={"xp" + xp}>{xp}<i>xp</i></span>}
        {combo >= 2 && (
          <span key={flash} className={"tc-combo" + (combo >= 10 ? " is-hot" : combo >= 5 ? " is-warm" : "")}>
            {combo}<i>×</i>
          </span>
        )}
        <button className={"tc-rpill" + (showRomaji ? " is-on" : "")}
          aria-pressed={showRomaji} onClick={() => setShowRomaji((v) => !v)}>
          Rōmaji {showRomaji ? "on" : "off"}
        </button>
        <button className={"tc-rpill" + (showPitch ? " is-on" : "")}
          aria-pressed={showPitch} onClick={() => setShowPitch((v) => !v)}>
          Pitch {showPitch ? "on" : "off"}
        </button>
        <button className={"tc-rpill" + (voiceOn ? " is-on" : "")}
          aria-pressed={voiceOn} onClick={() => { ttsUnlock(); setVoiceOn((v) => !v); if (voiceOn) stopJa(); }}>
          🔊 Voice {voiceOn ? "on" : "off"}
        </button>
      </div>

      {/* The moment spacing visibly paid off. The scheduler had left this item alone for
          weeks precisely because it predicted the memory would hold — this is that
          prediction coming true, and it was previously invisible. */}
      {award && award.memory && (
        <div className="tc-memcheck" key={"mc" + award.at} role="status">
          <span aria-hidden="true">🧠</span>
          <span>Memory check — you still had it.</span>
        </div>
      )}

      {/* What the last answer earned, and why. Showing the reasons is the whole point: the
          number is only motivating if it is legible, and "unaided +8" teaches what the
          system values in a way a bare total never does. */}
      {award && award.points > 0 && (
        <div className="tc-award" key={"aw" + award.at} aria-hidden="true">
          <b>+{award.points}</b>
          {award.reasons.filter((r) => r.label !== "attempt").map((r) => (
            <span key={r.label}>{r.label}</span>
          ))}
        </div>
      )}

      {/* A rescue reads as help, never as a scolding. It appears only on the first stage;
          the later rungs just get on with it, because by then the framing is established
          and repeating it would turn a two-beat recovery into nagging. */}
      {intervention && intervention.rescue && intervention.rescue.note && (
        <div className="tc-rescue" role="status">
          <span className="tc-rescueicon" aria-hidden="true">◆</span>
          <span>{intervention.rescue.note}</span>
        </div>
      )}

      {/* ── first contact ──
          A word you have never met cannot be retrieved, and asking anyway just teaches it
          as a failure. The introduction shows everything at once — character, reading,
          meaning, picture, sound — and the testing starts on its next appearance, a few
          cards later, while it is still warm. */}
      {fmt === "learn" && (
        /* An introduction has nothing to reveal and only one way forward, so the whole
           card is the control. Tapping anywhere continues, and the audio button stops
           the click from bubbling so hearing it does not skip past it. */
        <div className="tc-learn tc-learn-tap" style={masteryStyle(live || card)} role="button" tabIndex={0}
             aria-label="Continue"
             onClick={() => grade(true)}
             onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); grade(true); } }}>
          <span className="tc-kindchip tc-learnchip">new word</span>
          {card.emoji && <div className="tc-emoji tc-emoji-lg">{card.emoji}</div>}
          <div className={"tc-term" + (card.term.length <= 5 ? " tc-term-" + card.term.length : "")}>{card.term}</div>
          <div className="tc-reading-front">{card.reading} <SpeakBtn text={card.reading || card.term} /></div>
          <div className="tc-romaji">{card.romaji}</div>
          <div className="tc-meaning tc-meaning-lg">{card.meaning}</div>
          <p className="tc-learnnote">Look it over, then tap anywhere — you'll be asked in a moment.</p>
        </div>
      )}

      {/* ── multiple choice / listening ──
          The first real retrieval, and the only format that works before free recall does.
          Listening hides the writing entirely: a word you only ever meet on a card is a
          word you will not catch in speech. */}
      {/* ── context ──
          A blank in a real sentence the learner has already studied, with the English
          alongside so the task is "which word belongs here" rather than "guess the
          sentence". This is the only exercise that tests usage rather than translation. */}
      {fmt === "cloze" && clozeEx && (
        <div className="tc-mcwrap" style={masteryStyle(live || card)}>
          <span className="tc-kindchip tc-clozechip">in context</span>
          <p className="tc-clozeen">{clozeEx.en}</p>
          <div className="tc-clozesent">
            {clozeEx.before}
            <span className={"tc-clozeblank" + (verdict ? (verdict.ok ? " is-right" : " is-wrong") : "")}>
              {verdict ? clozeEx.term : clozeEx.blank}
            </span>
            {clozeEx.after}
          </div>
          <div className="tc-mcopts">
            {clozeChoices(card, cards, 3, (card._step || 0) + String(card.id).length,
                          confusion.get(card.id) || []).map((c) => {
              const chosen = verdict && verdict.chose === c.term;
              const isAnswer = c.id === card.id;
              const cls = !verdict ? "" : isAnswer ? " is-answer" : chosen ? " is-wrongpick" : "";
              return (
                <button key={c.id} type="button" className={"tc-mcopt" + cls} disabled={!!verdict}
                        onClick={() => { if (!verdict) { setVerdict({ ok: c.id === card.id, chose: c.term }); setFlipped(true); } }}>
                  {c.term}{c.reading && c.reading !== c.term ? ` · ${c.reading}` : ""}
                </button>
              );
            })}
          </div>
          {verdict && (
            <p className="tc-clozesrc">
              {clozeEx.source === "generated"
                ? "written for this word"
                : "from your " + clozeEx.source + " script"}
            </p>
          )}
        </div>
      )}

      {/* A cloze with no sentence renders nothing at all — an empty card with buttons under
          it. The capability gate is meant to make that impossible, but the gate reads a
          store that could be mid-load or hold an entry whose word no longer appears in its
          sentence, and "impossible" is not a good enough reason to leave a blank screen as
          the failure mode. Falls through to multiple choice, which every word can do. */}
      {((fmt === "mc" || fmt === "listen") || (fmt === "cloze" && !clozeEx)) && (
        <div className="tc-mcwrap" style={masteryStyle(live || card)}>
          <span className={"tc-kindchip " + (fmt === "listen" ? "tc-listenchip" : "tc-mcchip")}>
            {fmt === "listen" ? "listen" : "which one?"}
          </span>
          {fmt === "listen" ? (
            <div className="tc-listenprompt">
              <SpeakBtn text={card.reading || card.term} />
              <p className="tc-learnnote">Tap to hear it again</p>
              {!verdict && (
                <button type="button" className="tc-noaudio" onClick={() => setNoAudio(true)}>
                  Can't play audio — show it instead
                </button>
              )}
            </div>
          ) : (
            <div className="tc-mcprompt">
              {/* The reading sits above the word, furigana-style. This is a MEANING
                  question, and a kanji compound you cannot pronounce is unanswerable —
                  you end up guessing from the options rather than retrieving anything.
                  Reading practice belongs to the formats that ask for it. */}
              {card.reading && card.reading !== card.term && (
                <div className="tc-mcfurigana">{card.reading}</div>
              )}
              <div className={"tc-mcterm" + (card.term.length <= 5 ? " tc-term-" + card.term.length : "")}>{card.term}</div>
              <SpeakBtn text={card.reading || card.term} />
            </div>
          )}
          <div className="tc-mcopts">
            {choices.map((c) => {
              const chosen = verdict && verdict.chose === c.meaning;
              const isAnswer = c.id === card.id;
              const cls = !verdict ? "" : isAnswer ? " is-answer" : chosen ? " is-wrongpick" : "";
              return (
                <button key={c.id} type="button" className={"tc-mcopt" + cls}
                        disabled={!!verdict} onClick={() => answerChoice(c)}>
                  {/* Trimmed of grammar annotations while the question is live. A gloss like
                      "to hurry (u-verb; past: 急いだ)" among three bare nouns is the longest
                      and most decorated option on screen, which is a second way to pick the
                      answer without knowing the word. The full gloss returns once answered. */}
                  {verdict ? c.meaning : shortGloss(c.meaning)}
                </button>
              );
            })}
          </div>
          {verdict && fmt === "listen" && (
            <div className="tc-listenreveal">
              {card.term} · {card.reading}
            </div>
          )}
        </div>
      )}

      {(fmt === "recall" || fmt === "type") && (
      <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={flip}
           style={masteryStyle(live || card)}
           role="button" tabIndex={0} aria-label="Flashcard, click or press space to flip">
        <div className="tc-card-inner">
          {/* FRONT — normally the Japanese; on a production card, the English, and you
              have to come up with the Japanese yourself. No reading, no rōmaji and no
              audio button here: every one of those would hand you the answer. */}
          <div className="tc-face tc-front">
            {isProd ? (
              <>
                <span className="tc-kindchip tc-prodchip">→ 日本語</span>
                {card.emoji && <div className="tc-emoji">{card.emoji}</div>}
                <div className="tc-prodprompt">{card.meaning}</div>
                {/* Type the reading in rōmaji. Clicks and keys are kept off the card so
                    typing an "s" doesn't trigger the space-to-flip shortcut and hand you
                    the answer mid-word. */}
                <div className="tc-spellbox" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="tc-spellinput" type="text" value={typed} autoFocus
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                    placeholder="type the reading in rōmaji"
                    aria-label="Type the reading in rōmaji"
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") checkSpelling(); }}
                  />
                  {/* The cue. A first attempt at producing a word gets か＿＿び; once
                      production is developing it drops to かよう＿＿; solid production gets
                      nothing at all. Support is handed back after a miss — the aim is
                      retrieval that is effortful and still succeeds. */}
                  {cueLevel != null && cueLevel < CUE.FREE && card.reading && (
                    <div className="tc-cuehint" aria-label="hint">{cueHint(card.reading, cueLevel)}</div>
                  )}
                  <div className="tc-spellkana">{typed.trim() ? toKana(typed.trim()) : " "}</div>
                  <button type="button" className="tc-btn tc-btn-wide" onClick={checkSpelling} disabled={!typed.trim()}>Check</button>
                </div>
                <span className="tc-flipcue">or tap to just say it aloud</span>
              </>
            ) : (
              <>
                <span className="tc-kindchip">{KIND_LABEL[card.kind] || ""}</span>
                <div className={"tc-term" + (card.term.length <= 5 ? " tc-term-" + card.term.length : "")}>{card.term}</div>
                {/* Support is a property of every exercise, not only of typing. At a high
                    cue level the reading is simply shown; lower down it is masked, so the
                    same card can be made harder without changing what it is. */}
                {/* The character being tested, pointed at inside the word, plus what it means
                    on its own — so the card teaches the connection rather than leaving it
                    to be inferred. */}
                {card.inContext && (
                  <div className="tc-kctx">
                    <span className="tc-kctxk">{card.kanji}</span>
                    <span className="tc-kctxm">{card.kanjiMeaning}</span>
                  </div>
                )}
                                {cueLevel != null && cueLevel >= CUE.PARTIAL && card.reading !== card.term
                  ? <div className="tc-reading-front tc-reading-masked">{cueHint(card.reading, cueLevel)} <SpeakBtn text={card.reading || card.term} /></div>
                  : <div className="tc-reading-front">{card.reading} <SpeakBtn text={card.reading || card.term} /></div>}
                {showRomaji && <div className="tc-frontromaji">{card.romaji}</div>}
                <span className="tc-flipcue">tap to flip</span>
              </>
            )}
          </div>
          {/* BACK — meaning + picture + pronunciation (rōmaji always shown) */}
          <div className="tc-face tc-back">
            {isProd ? (
              <>
                {/* What you actually wrote, against what it should have been. Seeing the
                    two side by side is where a spelling slip becomes learnable. */}
                {verdict && (
                  <div className={"tc-spellverdict" + (verdict.ok ? " is-right" : " is-wrong")}>
                    {verdict.ok ? "✓ spelled it" : <>✗ you wrote <b>{verdict.got}</b></>}
                  </div>
                )}
                <div className="tc-term tc-prodanswer">{card.term}</div>
              </>
            ) : (
              card.emoji && <div className="tc-emoji">{card.emoji}</div>
            )}
            {!isProd && <div className="tc-meaning tc-meaning-lg">{card.meaning}</div>}
            {isProd && <div className="tc-reading-front">{card.reading}</div>}
            <div className="tc-romaji">{showPitch && card.pitch ? card.pitch : card.romaji} <SpeakBtn text={card.reading || card.term} /></div>
            {(card.msN || 0) > 0 && <span className="tc-timetag">⏱ avg think {(card.ms / card.msN / 1000).toFixed(1)}s · seen {card.seen || 0}× · {card.seen ? Math.round(((card.correct || 0) / card.seen) * 100) : 0}%</span>}
            {isLeech(card) && (
              /* The keyword mnemonic: link the Japanese sound to an English word you
                 already know, plus a vivid image. Pairing it with retrieval practice
                 beats either alone for foreign-language vocabulary, and it is the one
                 technique aimed squarely at words that repetition alone has failed to
                 shift — which is what a leech is. Typed once, shown on every review. */
              <div className="tc-mnbox" onClick={(e) => e.stopPropagation()}>
                <span className="tc-leechtag">🩹 stuck — give it a hook</span>
                <input className="tc-mnin" value={card.mn || ""} placeholder="sounds like… / picture…"
                  onChange={(e) => onMnemonic(card.id, e.target.value)} />
              </div>
            )}
            {!isLeech(card) && card.mn ? <p className="tc-mnshow">🔗 {card.mn}</p> : null}
            {/* The AI hook button used to sit on every card and went unused for months,
                while adding a row of clutter to the one screen that should be quiet. It
                still exists for stuck words, where a keyword mnemonic genuinely is the
                technique that shifts them — but it is not on the face of every review. */}
            {AI_ENABLED && isLeech(card) && (hook && hook.term === card.term ? (
              <p className="tc-hooktext" onClick={(e) => e.stopPropagation()}>
                {hook.busy ? "✨ thinking…" : hook.err ? hook.err : "✨ " + hook.text}
              </p>
            ) : (
              <button className="tc-hookbtn" onClick={(e) => { e.stopPropagation(); getHook(card); }}>✨ hook</button>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className="tc-grade">
        {fmt === "learn" ? (
          <button type="button" className="tc-btn tc-btn-wide tc-btn-got"
                  onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it — next →</button>
        ) : verdict && (fmt === "mc" || fmt === "listen") ? (
          <button type="button" className={"tc-btn tc-btn-wide " + (verdict.ok ? "tc-btn-got" : "tc-btn-miss")}
                  onClick={(e) => { e.stopPropagation(); grade(verdict.ok); }}>
            {verdict.ok ? "Next →" : "Noted — next →"}
          </button>
        ) : (fmt === "mc" || fmt === "listen") ? (
          <p className="tc-mchint">{fmt === "listen" ? "What did you hear?" : "Pick the meaning"}</p>
        ) : !flipped ? (
          <button type="button" className="tc-btn tc-btn-wide" onClick={(e) => { e.stopPropagation(); flip(); }}>Reveal answer</button>
        ) : verdict ? (
          /* The typed answer already settled this one. Offering "Got it" here would just
             invite overruling the check, which is the self-grading this replaces. */
          <button type="button" className={"tc-btn tc-btn-wide " + (verdict.ok ? "tc-btn-got" : "tc-btn-miss")}
                  onClick={(e) => { e.stopPropagation(); grade(verdict.ok); }}>
            {verdict.ok ? "Next →" : "Noted — next →"}
          </button>
        ) : (
          <>
            <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
            <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
          </>
        )}
      </div>
      {/* "Why am I seeing this?" — plain language, no scheduler vocabulary. It earns
          trust, and it makes the algorithm inspectable by the person using it rather
          than only by whoever wrote it. */}
      {whyThis && (
        <div className="tc-whywrap">
          {showWhy ? (
            <p className="tc-whytext">{whyThis}</p>
          ) : (
            <button type="button" className="tc-whybtn" onClick={() => setShowWhy(true)}>
              Why this one?
            </button>
          )}
        </div>
      )}
      <div ref={liveRef} aria-live="polite" className="tc-sr" />
    </div>
  );
}

/* ── the study plan tab ──
   Everything here is editable and everything here has an effect. The vision and goals are
   the motivational half — the professor's point that knowing WHY keeps you going on the
   days you do not feel like it. The priorities, the pace and the coverage report are the
   mechanical half: they change what the Smart Review button gives you, and they say
   plainly which areas you have been neglecting. */
/* ── Checkpoint ──
   A test the app is not allowed to grade itself on. The words come from the quarantined
   reserve that Smart Review cannot schedule, they are asked cold — English in, Japanese
   out, no options and no hints — and nothing is marked until the end, so the test cannot
   quietly turn into a lesson.

   The design constraint that matters: it must be able to say "no change" and mean it.
   Anyone can build a progress screen that always goes up. */
/* Rōmaji in, kana out. Left as its own function so the input preview and the grader can
   never disagree about what an answer became. */
const kanaOf = (v) => { try { return toKana(String(v || "").trim()); } catch (e) { return String(v || "").trim(); } };

function Checkpoint({ cards = [], heldOut }) {
  const [runs, setRuns] = useState(null);
  const [phase, setPhase] = useState("idle");     // idle | running | done
  const [seed, setSeed] = useState(0);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { loadRuns().then(setRuns); }, []);

  const questions = useMemo(
    () => (phase === "running" ? sampleFor(cards, heldOut, RUN_SIZE, seed) : []),
    [phase, cards, heldOut, seed],
  );

  useEffect(() => { if (phase === "running" && inputRef.current) inputRef.current.focus(); }, [phase, at]);

  const pooled = useMemo(() => poolRuns(runs || []), [runs]);
  const last = runs && runs.length ? runs[runs.length - 1] : null;

  const start = () => {
    setSeed(Date.now());
    setAnswers([]); setAt(0); setTyped(""); setResult(null);
    setPhase("running");
  };

  const submit = () => {
    const q = questions[at];
    if (!q) return;
    /* Graded as kana, not as keystrokes. There is no Japanese keyboard on this machine, and
       requiring one would put cold production — the whole point of the checkpoint — behind
       an OS setting. Rōmaji goes in, the same converter the Dates and spelling screens
       already use turns it into kana, and that is what gets marked. What was typed is kept
       alongside so the review list can show it back. */
    const next = [...answers, { id: q.id, got: kanaOf(typed), typed }];
    setAnswers(next);
    setTyped("");
    if (at + 1 >= questions.length) {
      const r = scoreRun(questions, next);
      /* Compared against everything that came before, pooled. A single run against a single
         run cannot see any improvement short of a violent one. */
      const cmp = compareRuns(pooled, r);
      const est = estimateKnown(r, cards.length);
      setResult({ run: r, est, cmp, text: describeRun(r, est, cmp) });
      const saved = pushRun(runs || [], r);
      setRuns(saved); saveRuns(saved);
      setPhase("done");
    } else setAt(at + 1);
  };

  if (runs === null) return null;

  if (phase === "running") {
    const q = questions[at];
    if (!q) return <p className="tc-planhint">No held-out words available yet.</p>;
    return (
      <section className="tc-plansec">
        <h2 className="tc-planh">Checkpoint <span className="tc-planh-sub">{at + 1} of {questions.length}</span></h2>
        <p className="tc-planhint" style={{ marginTop: 0 }}>
          Type it in rōmaji and it becomes kana as you go — no Japanese keyboard needed.
          No hints, and nothing is marked until the end, so answer even when you are unsure.
        </p>
        <div className="tc-checkq">{glossOf(q)}</div>
        <input
          ref={inputRef}
          className="tc-checkin"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          /* Enter submits — unless the IME is still composing. Typing Japanese means the
             first Enter COMMITS the candidate (たべもの out of ta-be-mo-no) and a handler that
             cannot tell the two apart submits a half-finished answer on the keypress that
             was meant to finish the word. keyCode 229 is the long-standing signal for "this
             key belongs to the IME"; isComposing is the modern one. Both, because Safari. */
          onKeyDown={(e) => {
            if (e.nativeEvent && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return;
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          placeholder="type in rōmaji — tempura, yasumi, kyuuka"
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        {/* What the app is actually going to mark. Without it you are typing blind into a
            converter and cannot tell a wrong answer from a mistyped one. */}
        <div className="tc-checkkana">{typed.trim() ? kanaOf(typed) : "　"}</div>
        <div className="tc-checkrow">
          <button className="tc-btn" onClick={submit}>{at + 1 >= questions.length ? "Finish" : "Next"}</button>
          <button className="tc-btn tc-btn-quiet" onClick={() => { setTyped(""); submit(); }}>Skip</button>
        </div>
      </section>
    );
  }

  if (phase === "done" && result) {
    const missed = result.run.detail.filter((d) => !d.ok);
    return (
      <section className="tc-plansec">
        <h2 className="tc-planh">Checkpoint <span className="tc-planh-sub">{result.run.ok} of {result.run.n} cold</span></h2>
        <p className="tc-planhint" style={{ marginTop: 0 }}>{result.text}</p>
        {missed.length > 0 && (
          <>
            <p className="tc-planhint">These are the ones you did not have. They go back into normal study now:</p>
            <div className="tc-checkmiss">
              {missed.map((d) => (
                <div key={d.id} className="tc-checkmissrow">
                  <span className="tc-checkterm">{d.term}</span>
                  {/* Kana-only words have the reading equal to the word; printing both just
                      says the same thing twice. */}
                  {d.reading && d.reading !== d.term && <span className="tc-checkread">{d.reading}</span>}
                  <span className="tc-checken">{d.en}</span>
                  {d.got ? <span className={"tc-checkgot" + (d.near ? " is-near" : "")}>you wrote {d.got}</span> : <span className="tc-checkgot">blank</span>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="tc-checkrow"><button className="tc-btn" onClick={() => setPhase("idle")}>Done</button></div>
      </section>
    );
  }

  const available = cards.filter((c) => heldOut && heldOut.has(c.id) && askable(c)).length;
  return (
    <section className="tc-plansec">
      <h2 className="tc-planh">Where you actually are <span className="tc-planh-sub">a test this app cannot flatter</span></h2>
      <p className="tc-planhint" style={{ marginTop: 0 }}>
        Every other number here comes from questions the app chose to ask you, in a format it
        thought you would pass. This one does not. {available} words are held back from Smart
        Review entirely, and {RUN_SIZE} of them are asked cold — English in, Japanese out, no
        options, no hints. It takes about six minutes and it can tell you that nothing has
        changed.
      </p>
      {last ? (
        <p className="tc-planhint">
          Last check: <b>{last.ok} of {last.n}</b> on {new Date(last.at).toLocaleDateString()}.
          {pooled && pooled.runs > 1 ? ` Across ${pooled.runs} checks: ${pooled.ok} of ${pooled.n}.` : ""}
        </p>
      ) : (
        <p className="tc-planhint">You have not taken one yet, so there is no honest number for how much Japanese you have. This is how you get one.</p>
      )}
      <div className="tc-checkrow">
        <button className="tc-btn" onClick={start} disabled={available < 5}>
          {last ? "Take another checkpoint" : "Take the first checkpoint"}
        </button>
      </div>
      {available < 5 && <p className="tc-planhint">Not enough words in the deck yet for a meaningful sample.</p>}
    </section>
  );
}

/* ── building sentences, not recognising them ──
   Of 588 words studied, 76 have ever been produced once, and typed answers run 26 points
   below recognition. The app has been a recognition trainer.

   The real fix is a conversation partner, which needs a paid API key. This is the honest
   free version: assembly rather than recognition, using sentences the learner has actually
   met — the scripted dialogue and the sentences mined words arrived with — rather than
   sentences invented by a model that might be wrong.

   It cannot judge whether a different sentence is also correct, so it does not pretend to:
   it accepts the sentence that was written and shows the difference when they diverge. */
function ProductionBlock({ drills, onDone }) {
  const [at, setAt] = useState(0);
  const [built, setBuilt] = useState([]);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);

  const d = drills[at];
  if (!d) return null;

  const check = () => {
    /* built holds KEYED tiles (text + NUL + index) so two identical pieces stay distinct
       while placing them. The grader compares against the raw chunk list, so the key has
       to come off first — passing the keyed strings made every build/order drill grade as
       wrong no matter what was assembled, while the display (which does strip the key)
       showed a perfectly correct sentence. */
    const given = d.type === "fill" ? typed : built.map((b) => b.split(String.fromCharCode(0))[0]);
    setResult(gradeDrill(d, given));
  };
  const next = () => {
    setResult(null); setBuilt([]); setTyped("");
    if (at + 1 >= drills.length) onDone(); else setAt(at + 1);
  };

  const remaining = d.tiles ? d.tiles.filter((tile, i) => !built.includes(tile + "\u0000" + i)) : [];

  return (
    <div className="tc-prod">
      <p className="tc-eyebrow">build it yourself · {at + 1} of {drills.length}</p>
      {d.prompt ? <p className="tc-prodprompt">{d.prompt}</p> : null}

      {d.type === "fill" ? (
        <>
          <div className="tc-prodsent">{d.before}<span className="tc-prodblank">＿</span>{d.after}</div>
          <div className="tc-prodtiles">
            {d.choices.map((c) => (
              <button key={c} className={"tc-fchip" + (typed === c ? " is-on" : "")}
                onClick={() => setTyped(c)} disabled={!!result}>{c}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="tc-prodsent">
            {built.length
              ? built.map((b) => b.split("\u0000")[0]).join("")
              : <span className="tc-prodblank">tap the pieces in order</span>}
          </div>
          <div className="tc-prodtiles">
            {d.tiles.map((tile, i) => {
              const key = tile + "\u0000" + i;
              const used = built.includes(key);
              return (
                <button key={key} className={"tc-fchip" + (used ? " is-used" : "")} disabled={used || !!result}
                  onClick={() => setBuilt([...built, key])}>{tile}</button>
              );
            })}
          </div>
          {built.length > 0 && !result && (
            <button className="tc-btn tc-btn-sm" onClick={() => setBuilt(built.slice(0, -1))}>undo</button>
          )}
          {d.hasDistractors ? <p className="tc-smarthint">Not every piece belongs.</p> : null}
        </>
      )}

      {result ? (
        <div className="tc-prodresult">
          <p className={result.ok ? "tc-prodok" : "tc-prodbad"}>
            {result.ok ? "That is it." : "Not quite."}
          </p>
          {!result.ok && <p className="tc-prodsent">{result.expected}</p>}
          <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={next}>
            {at + 1 >= drills.length ? "Done" : "Next"}
          </button>
        </div>
      ) : (
        <div className="tc-rehnav">
          <button className="tc-btn tc-btn-sm tc-btn-primary"
            disabled={d.type === "fill" ? !typed : !built.length} onClick={check}>Check</button>
          <button className="tc-btn tc-btn-sm" onClick={next}>Skip</button>
        </div>
      )}
    </div>
  );
}

/* Exercise formats, in learner words rather than internal ones. */
const FORMAT_LABEL = {
  mc: "Multiple choice", choice: "Multiple choice", recall: "Flip and rate",
  type: "Typing", fill: "Fill the blank", build: "Build the sentence",
  order: "Word order", listen: "Listening", write: "Writing", unknown: "Other",
};
const fmtLabel = (k) => FORMAT_LABEL[k] || (k ? k[0].toUpperCase() + k.slice(1) : "Other");

function Plan({ cards = [] }) {
  const [plan, setPlan] = useState(PLAN_DEFAULT);
  const [days, setDays] = useState(null);
  const [draft, setDraft] = useState("");
  useEffect(() => { loadPlan().then(setPlan); loadDays().then((d) => setDays({ ...d })); }, []);

  const update = (patch) => { const next = { ...plan, ...patch }; setPlan(next); savePlan(next); };
  const cover = useMemo(() => coverageFrom(days, 14), [days]);
  const [evidence, setEvidence] = useState([]);
  useEffect(() => { loadEvidence().then((e) => setEvidence(e.slice())); return subscribeEvidence(setEvidence); }, []);
  const profile = useMemo(() => profileFrom(evidence, { days: 60 }), [evidence]);
  const gap = useMemo(() => biggestGap(profile), [profile]);
  /* Is the app right about you? Everything above reports what the model BELIEVES; this is
     the only part that checks those beliefs against what actually happened. A year is the
     window because calibration moves slowly and there is no point asking the question of
     three sessions. */
  const cal = useMemo(() => calibrationReport(evidence, { days: 365 }), [evidence]);
  /* The north star: how much durable memory a minute of study bought. 30 days, because a
     rate is only useful if it reflects how you are studying NOW. */
  const gainWindow = useMemo(
    () => evidence.filter((r) => r && r.at > Date.now() - 30 * 86400000),
    [evidence]);
  const gain = useMemo(() => gainPerMinute(gainWindow), [gainWindow]);
  const gainFmt = useMemo(() => gainBy(gainWindow, "format"), [gainWindow]);
  const gainBest = useMemo(() => bestUse(gainWindow, "format"), [gainWindow]);
  const gainFade = useMemo(() => fadePoint(gainWindow, 5), [gainWindow]);
  /* The two reference points that give the number a scale. Computed from the same
     function the metric uses, so the explanation cannot drift from the measure. */
  const gainRef = useMemo(() => ({
    fresh: Math.round(answerGain(0, 3) * 10) / 10,
    easy: Math.round(answerGain(200, 240) * 100) / 100,
  }), []);
  /* The identical reserve the scheduler is excluding. Computed the same way from the same
     deck, so the test cannot drift out of step with what study is avoiding. */
  const heldOut = useMemo(() => reserveFor(cards, cycleFor()), [cards]);
  const busiest = Math.max(1, ...Object.values(cover));
  const totalReviews = Object.values(cover).reduce((a, b) => a + b, 0);

  const addGoal = () => {
    const text = draft.trim();
    if (!text || plan.goals.length >= 5) return;
    update({ goals: [...plan.goals, { id: Date.now(), text, area: "vocabulary", done: false }] });
    setDraft("");
  };
  const setGoal = (id, patch) =>
    update({ goals: plan.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const dropGoal = (id) => update({ goals: plan.goals.filter((g) => g.id !== id) });

  /* Neglect is the whole reason to show coverage: an area you called important and have
     not touched in a fortnight is the single most useful thing this page can tell you. */
  const neglected = AREAS.filter(([k]) => (plan.priorities[k] || 1) >= 2 && (cover[k] || 0) === 0);

  return (
    <div className="tc-plan">
      <section className="tc-plansec">
        <h2 className="tc-planh">Why you're doing this</h2>
        <p className="tc-planhint">
          Knowing the answer is what gets you studying on the days you don't feel like it.
          Write these once, roughly — they're for you, not for marking.
        </p>
        {[["fiveYear", "In five years, I want to…"], ["oneYear", "In a year, I want to…"], ["term", "By the end of this term…"]].map(([k, label]) => (
          <label key={k} className="tc-planfield">
            <span>{label}</span>
            <textarea rows={2} value={plan.vision[k]} placeholder="…"
              onChange={(e) => update({ vision: { ...plan.vision, [k]: e.target.value } })} />
          </label>
        ))}
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">Goals <span className="tc-planh-sub">{plan.goals.length}/5</span></h2>
        <p className="tc-planhint">Three to five things that move you toward that vision.</p>
        <div className="tc-goals">
          {plan.goals.map((g) => (
            <div key={g.id} className={"tc-goal" + (g.done ? " is-done" : "")}>
              <button className="tc-goalcheck" aria-pressed={g.done} title="Mark done"
                onClick={() => setGoal(g.id, { done: !g.done })}>{g.done ? "✓" : ""}</button>
              <span className="tc-goaltext">{g.text}</span>
              <select className="tc-goalarea" value={g.area} onChange={(e) => setGoal(g.id, { area: e.target.value })}>
                {AREAS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button className="tc-goaldrop" onClick={() => dropGoal(g.id)} title="Remove">×</button>
            </div>
          ))}
        </div>
        {plan.goals.length < 5 && (
          <div className="tc-goaladd">
            <input value={draft} placeholder="e.g. Watch an episode without subtitles"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addGoal(); }} />
            <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={addGoal}>Add</button>
          </div>
        )}
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">What matters most right now</h2>
        <p className="tc-planhint">
          Eight areas is a lot to carry at once, so it's fine to prioritise. This changes
          what Smart Review actually serves you — it nudges the order, it won't let
          something you've nearly forgotten slide.
        </p>
        <div className="tc-prios">
          {AREAS.map(([k, label, icon]) => {
            const v = plan.priorities[k] || 1;
            return (
              <div key={k} className="tc-prio">
                <span className="tc-prioname">{icon} {label}</span>
                <div className="tc-priobtns">
                  {[[1, "Later"], [2, "Yes"], [3, "Focus"]].map(([n, t]) => (
                    <button key={n} className={"tc-priobtn" + (v === n ? " is-on" : "")}
                      onClick={() => update({ priorities: { ...plan.priorities, [k]: n } })}>{t}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">How long today?</h2>
        <p className="tc-planhint">
          Five focused minutes three times a day beats one long session you won't repeat.
          Change this whenever — it sets the length of your next Smart Review.
        </p>
        <div className="tc-paces">
          {PACES.map(([k, label, mins, note]) => (
            <button key={k} className={"tc-pace" + (plan.pace === k ? " is-on" : "")}
              onClick={() => update({ pace: k })}>
              <span className="tc-pacelabel">{label}</span>
              <span className="tc-pacemins">≈{mins} min</span>
              <span className="tc-pacenote">{note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── the learner profile ──
          Model outputs, not XP bars. Each row is an ability with its own evidence, and a
          row without enough evidence says so rather than inventing a percentage — being
          told you are "72% fluent" off nine answers is how learning apps lose the plot. */}
      <section className="tc-plansec">
        <h2 className="tc-planh">What you can actually do <span className="tc-planh-sub">last 60 days</span></h2>
        <p className="tc-planhint">
          These come from how you've answered, split by ability — not from how many cards
          you've seen. A word you can read but can't say counts as one, not both.
        </p>
        <div className="tc-cover">
          {SKILLS.map((k) => {
            const row = profile[k] || { n: 0, ok: 0 };
            /* A Beta posterior rather than a bare rate, so "72% from four answers" and
               "72% from ninety" stop looking like the same claim. The pale band shows how
               much the estimate should be trusted, and an ability nobody has measured reads
               as "not measured yet" rather than as a low score. */
            const post = posterior(row.ok || 0, (row.n || 0) - (row.ok || 0));
            const st = stateOf(post);
            const pct = Math.round(post.mean * 100);
            const lo = Math.round(post.lo * 100), hi = Math.round(post.hi * 100);
            const tip = row.n ? row.ok + "/" + row.n + " — likely between " + lo + "% and " + hi + "%" : "no answers yet";
            return (
              <div key={k} className="tc-coverrow">
                <span className="tc-covername">{SKILL_LABEL[k]}</span>
                <div className="tc-coverbar" title={tip}>
                  <div className="tc-coverband" style={{ left: lo + "%", width: Math.max(2, hi - lo) + "%" }} />
                  {st !== STATE.UNKNOWN && (
                    <div className={"tc-coverfill" + (st === STATE.WEAK ? " is-gap" : "")} style={{ width: pct + "%" }} />
                  )}
                </div>
                <span className="tc-covernum">{st === STATE.UNKNOWN ? "—" : pct + "%"}</span>
              </div>
            );
          })}
        </div>
        <p className="tc-planhint" style={{ marginTop: 10 }}>
          {SKILLS.filter((k) => (profile[k] || {}).n > 0).length === 0
            ? "Nothing measured yet — do a session and this fills in."
            : gap
              ? <>Biggest opportunity: <b>{SKILL_LABEL[gap.skill]}</b>. Your {SKILL_LABEL[gap.ahead].toLowerCase()} is about {Math.round(gap.spread * 100)} points ahead.</>
              : "No clear weak spot yet — the abilities measured so far are close together."}
        </p>
        <p className="tc-planhint">
          {SKILLS.map((k) => {
            const row = profile[k] || { n: 0, ok: 0 };
            return SKILL_LABEL[k] + ": " + STATE_LABEL[stateOf(posterior(row.ok || 0, (row.n || 0) - (row.ok || 0)))];
          }).join(" · ")}
        </p>
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">What a minute of study buys <span className="tc-planh-sub">last 30 days</span></h2>
        {/* The north-star metric. Gain is measured in DOUBLINGS of memory stability, not
            in days of it: one easy review of a mature card adds ~140 days of stability
            while learning a new word adds ~3, so a days-based score would rank grinding
            what you already know forty times above learning anything. See tools/gain.mjs. */}
        {gain.rate == null ? (
          <p className="tc-planhint">
            Nothing measurable yet. This fills in as you study — answers recorded before
            this existed can't be scored, so it starts from your next session.
          </p>
        ) : (
          <>
            <div className="tc-gainhead">
              <span className="tc-gainnum">{gain.rate}</span>
              <span className="tc-gainunit">memory doublings<br />per minute</span>
            </div>
            <p className="tc-planhint">
              One point is a memory becoming twice as durable. Learning a word you didn't
              know is worth about <b>{gainRef.fresh}</b>; one easy review of a word you
              already know well, about <b>{gainRef.easy}</b> — which is why this can't be
              raised by grinding easy cards. <b>{gain.gain}</b> doublings over{" "}
              <b>{Math.round(gain.minutes)} min</b> of actual study, from {gain.n} answers
              {gain.skipped > 0 ? " (" + gain.skipped + " older answers can't be scored)" : ""}.
            </p>
            {gainBest && (
              <p className="tc-planhint">
                <b>{fmtLabel(gainBest.top)}</b> is buying you {gainBest.times}× more per
                minute than <b>{fmtLabel(gainBest.bottom).toLowerCase()}</b>.
              </p>
            )}
            <div className="tc-cover" style={{ marginTop: 10 }}>
              {gainFmt.slice(0, 6).map((row) => {
                const top = gainFmt.find((x) => x.rate != null);
                const w = row.rate != null && top && top.rate > 0 ? Math.max(3, (row.rate / top.rate) * 100) : 0;
                return (
                  <div key={row.key} className="tc-coverrow">
                    <span className="tc-covername">{fmtLabel(row.key)}</span>
                    <div className="tc-coverbar" title={row.n + " answers"}>
                      {row.rate != null && <div className="tc-coverfill" style={{ width: w + "%" }} />}
                    </div>
                    <span className="tc-covernum">{row.rate != null ? row.rate : row.n + "/" + MIN_ROWS}</span>
                  </div>
                );
              })}
            </div>
            <p className="tc-planhint" style={{ marginTop: 10 }}>
              {/* A rate from a handful of answers is noise; those rows show progress
                  towards being measurable instead of a number worth acting on. */}
              {gainFmt.some((r) => r.rate == null)
                ? "A count instead of a rate means too few answers of that kind to say anything yet."
                : "Every format above has enough answers behind it to compare."}
            </p>
            {gainFade && (
              <p className="tc-planhint">
                {gainFade.faded
                  ? <>Your sessions stop paying off around <b>answer {gainFade.from}</b> — the last stretch
                    earns {Math.round(gainFade.ratio * 100)}% of what your best stretch does. Stopping there
                    is not quitting early; it is the point where the minutes stop buying memory.</>
                  : <>Your rate holds up across a session — the last stretch still earns{" "}
                    {Math.round(gainFade.ratio * 100)}% of your best. No reason to cut sessions shorter.</>}
              </p>
            )}
          </>
        )}
      </section>

      <Checkpoint cards={cards} heldOut={heldOut} />

      <section className="tc-plansec">
        <h2 className="tc-planh">Is the app right about you? <span className="tc-planh-sub">its predictions vs what happened</span></h2>
        {/* Everything else on this page reports what the model believes. This is the one
            place that checks those beliefs. It says "not enough yet" far more often than it
            says anything else, on purpose: a verdict drawn from thirty answers would be
            noise dressed as a finding, and tuning the app against noise is worse than
            leaving it alone. */}
        <p className="tc-planhint" style={{ marginTop: 0 }}>{cal.headline}</p>

        {cal.prediction.bins.length > 0 && (
          <>
            <div className="tc-cover" style={{ marginTop: 10 }}>
              {cal.prediction.bins.map((b) => (
                <div key={b.lo} className="tc-coverrow">
                  <span className="tc-covername">said {Math.round(b.predicted * 100)}%</span>
                  <div className="tc-coverbar">
                    <div className={"tc-coverfill" + (b.verdict === "overconfident" ? " is-gap" : "")}
                      style={{ width: Math.round(b.observed * 100) + "%" }} />
                  </div>
                  <span className="tc-covernum">{Math.round(b.observed * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="tc-planhint">
              Each row: how often you actually got those right. The range around every figure
              is wide until there are a few hundred answers behind it, so only a bar far from
              its label means anything yet.
            </p>
          </>
        )}

        {cal.cue.rows.some((r) => r.verdict !== "insufficient") && (
          <p className="tc-planhint">
            Help levels: {cal.cue.rows.filter((r) => r.verdict !== "insufficient").map((r) =>
              `${CUE_NAME[r.cue] || ("level " + r.cue)} ${Math.round(r.observed * 100)}% (${r.verdict === "on_target" ? "about right" : r.verdict === "too_hard" ? "too hard" : "too easy"})`).join(" · ")}
            {cal.cue.monotonic === false && " — and they are not actually getting harder in order, which means the levels need reworking."}
          </p>
        )}

        {cal.efficacy.rows.filter((r) => r.confident).length > 0 && (
          <p className="tc-planhint">
            After a miss, you get it right next time: {cal.efficacy.rows.filter((r) => r.confident)
              .map((r) => `${FAILURE_NAME[r.failure] || r.failure} ${Math.round(r.recovered * 100)}%`).join(" · ")}
          </p>
        )}

        {cal.n > 0 && (
          <p className="tc-planhint" style={{ opacity: 0.7 }}>
            {cal.n} answers on file{cal.modelEra < cal.n ? `, ${cal.modelEra} of them from the current version of the model` : ""}.
          </p>
        )}
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">What you've actually practised <span className="tc-planh-sub">last 14 days</span></h2>
        {totalReviews === 0 ? (
          <p className="tc-planhint">Nothing logged yet — do a session and this fills in.</p>
        ) : (
          <>
            <div className="tc-cover">
              {AREAS.map(([k, label, icon]) => {
                const n = cover[k] || 0;
                const pri = plan.priorities[k] || 1;
                return (
                  <div key={k} className="tc-coverrow">
                    <span className="tc-covername">{icon} {label}</span>
                    <div className="tc-coverbar">
                      <div className={"tc-coverfill" + (n === 0 && pri >= 2 ? " is-gap" : "")}
                        style={{ width: Math.round((n / busiest) * 100) + "%" }} />
                    </div>
                    <span className="tc-covernum">{n}</span>
                  </div>
                );
              })}
            </div>
            {neglected.length > 0 && (
              <p className="tc-covergap">
                You said {neglected.map(([, l]) => l.toLowerCase()).join(" and ")} matter
                {neglected.length === 1 ? "s" : ""}, but {neglected.length === 1 ? "it hasn't" : "they haven't"} come
                up in two weeks. The Input tab covers listening and reading; speaking and
                culture need practice outside this app.
              </p>
            )}
          </>
        )}
      </section>

      <section className="tc-plansec tc-planfoot">
        <h2 className="tc-planh">A few things worth remembering</h2>
        <ul className="tc-planlist">
          <li><b>Use more than one method.</b> Students who mix flashcards, shows, mnemonics and reading do better than those who only ever do one.</li>
          <li><b>Study what you actually like.</b> Anime, card games, music, cooking — vocabulary you care about sticks, and you'll keep going once nobody's grading you.</li>
          <li><b>Media only counts when you're paying attention.</b> Look words up, notice grammar you've studied, sing along. Passive listening slides past.</li>
          <li><b>Some days are five-minute days.</b> That's the plan working, not you failing.</li>
        </ul>
      </section>
    </div>
  );
}

function weakness(c) {
  const seen = c.seen || 0;
  if (seen === 0) return 1.0;                 // unseen first
  return 1 - (c.correct || 0) / seen;          // lower accuracy = weaker
}




 // per mastery level (L0…L5)
/* Production (EN→JP) unlocks once recognition is solid — stability of a week or more.
   Asking you to produce a word you can't yet recognise is just failure with extra steps;
   asking only ever to recognise leaves you able to read Japanese and unable to speak it.
   Recognition reliably precedes production in L2 acquisition, so this gates on the
   recognition state and then starts building the harder direction on top. */
    // days




/* >= 1 means due. Under FSRS this is "has recall probability fallen to the target yet",
   which is a real question about your memory rather than a position on a fixed ladder.
   Contract: due is the scheduler's truth — dueness(c, now) >= 1 iff now >= c.fsrs.due. review()
   already writes a due that honours the retention target and the 10-minute relearning step;
   this used to ignore it and recompute from S with a hard-coded 0.9 target, so a lapsed card
   (due in 10 minutes) wasn't offered again for days, and the retention chip didn't actually
   change when anything was due. Seeded/legacy states with no stored due fall back to
   recomputing from S with the CURRENT target. */

/* ── shared FSRS plumbing for the mini-decks ──
   Kana, the conjugation drill and the 10k deck each grew their own scheduler: a hand-tuned
   priority score over level, accuracy, streak and days-since. They work, but there is no
   reason kana or verb forms should be scheduled worse than vocabulary, and three
   near-identical scorers is three places to fix anything. These two functions put every
   deck in the app on the same memory model. The stat records keep their existing shape —
   an `fsrs` field is simply added alongside. */

/* Latency bounds shared by every writer: under 250ms is a misfire, over three minutes is
   a card someone walked away from. Both are noise, and both used to be re-spelled at each
   call site. */

/* What this answer does to the card memory, in one place.

   The learning-gain metric is a change in stability, so it needs the stability either
   side of an answer -- and the one thing it must never do is compute that from its own
   copy of the scheduling rules. A metric with a parallel implementation drifts silently
   the first time the real path changes, and then reports confidently about a scheduler
   that no longer exists. So the writer and the metric call this, and only this.

   Recognition and production carry separate stability (fsrs vs rfsrs): being able to
   read 火曜日 says very little about producing it from "Tuesday". */



/* Production is scheduled on its own clock. This matters more than it looks: a card only
   unlocks production once recognition is STABLE, and a stable card is by definition not due
   for recognition. Selecting the session purely on recognition due-ness therefore surfaces
   production almost never — the feature would have looked wired up and quietly done nothing.
   A card is production-due if it has earned the direction and either has never been asked
   backwards, or its production memory has decayed to the target. */


/* ── the study plan ──
   Straight out of the notes Matthew's JPN 101 professor left for continued study: start
   from a vision, set three to five goals pointing at it, cover the eight areas of the
   language while accepting that some matter more right now, favour short frequent
   sessions over rare long ones, use several different strategies rather than one, and
   leave room for the days when you are tired or short of time.

   The part that makes this more than a notes page: the plan drives the scheduler. The
   priorities weight what Smart Review serves, and the pace sets how long a session runs.
   A plan the app ignores is a wish list. */
/* ── evidence ──
   One record per answered exercise: which item, which ability it tested, how much help it
   came with, what went wrong, and what the model had predicted. The reviews are right
   that this is the unlock — a learner profile, failure targeting, and eventually
   measuring whether the model's confidence is justified all need outcomes recorded per
   SKILL rather than per card.

   Capped as a ring buffer. A log nobody can afford to keep is a log that stops existing
   the first time it fills localStorage, and 4,000 answers is already months of study. */
/* Names for the report. The cue ladder and the failure taxonomy are internal vocabulary —
   "CUE.PARTIAL" and "orthography" mean nothing to someone trying to learn Japanese — and
   the rule that no scheduler jargon reaches the learner applies to this page too. */
const CUE_NAME = {
  0: "shown to you", 1: "multiple choice", 2: "with a big hint",
  3: "with a small hint", 4: "from memory", 5: "in a sentence",
};
const FAILURE_NAME = {
  meaning: "forgot the meaning", reading: "fumbled the reading",
  listening: "missed it by ear", production: "could not write it",
  orthography: "wrong characters", context: "wrong in context",
  blank: "drew a blank", unclassified: "unclassified",
};

/* ── the checkpoint ──
   Runs are tiny and they are the only record of whether the app is working, so they are
   kept forever rather than capped at a working-set size. */
const BENCH_KEY = "jpn101:benchmark";
async function loadRuns() {
  try { const r = await sGet(BENCH_KEY); const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
async function saveRuns(list) { await sSet(BENCH_KEY, JSON.stringify(list)); }

/* ── generated context sentences ──

   The cue ladder's top rung asks a word to be USED, not translated, and the sentences come
   from the textbook scripts — which cover 265 of 1,632 cards. For the other 84% a word could
   climb the whole ladder and find nothing at the top, so the hardest and most useful rung
   was unreachable for most of the deck. That is also why sentence practice ended up as its
   own tab: the capability existed, it just could not reach most words.

   A generated sentence fills the gap and is written once per word, ever. Cached locally and
   synced like any other progress, so the cost is one call per word across all devices and
   all time — and the Worker caches it again server-side.

   The capability is claimed ONLY when the sentence is already in hand. The scheduler asking
   for a cloze that then has to be fetched is how you get a blank card in the middle of a
   session; instead, sentences are fetched ahead of time for words approaching the rung, and
   a word becomes context-capable the moment its sentence lands. */
const CONTEXT_KEY = "jpn101:context";
let _context = null;
async function loadContext() {
  if (_context) return _context;
  try { const r = await sGet(CONTEXT_KEY); _context = r ? JSON.parse(r) : {}; }
  catch (e) { _context = {}; }
  if (!_context || typeof _context !== "object" || Array.isArray(_context)) _context = {};
  return _context;
}
function contextFor(id) { return (_context && _context[id]) || null; }
function saveContext(id, entry) {
  if (!_context) _context = {};
  _context[id] = { sentence: entry.sentence, en: entry.en, at: Date.now() };
  sSet(CONTEXT_KEY, JSON.stringify(_context));
}
/* Same shape clozeFor returns, so the renderer cannot tell the two apart — a generated
   sentence is a cloze or it is nothing. Returns null when the word is not in the sentence
   verbatim, which the Worker already refuses to cache, but a stale local entry could still
   hold: without the word present there is no blank to make. */
function clozeFromSentence(card, entry) {
  const s = entry && entry.sentence;
  if (!s || !card || !card.term) return null;
  const at = s.indexOf(card.term);
  if (at < 0) return null;
  const blank = "＿".repeat(Math.max(2, card.term.length));
  return {
    id: card.id, term: card.term, reading: card.reading || "",
    before: s.slice(0, at), after: s.slice(at + card.term.length),
    blank, sentence: s.slice(0, at) + blank + s.slice(at + card.term.length),
    en: entry.en || "", source: "generated",
  };
}

const EVIDENCE_KEY = "jpn101:evidence";
const EVIDENCE_CAP = 4000;

/* The current latency norms, kept at module level because the card writer lives outside
   the component that reads the evidence log. Recomputed whenever the log changes; an
   empty object simply means "no norm yet", and the grader falls back. */


let _evidence = null;
async function loadEvidence() {
  if (_evidence) return _evidence;
  try { const r = await sGet(EVIDENCE_KEY); _evidence = r ? JSON.parse(r) : []; }
  catch (e) { _evidence = []; }
  if (!Array.isArray(_evidence)) _evidence = [];
  refreshLatencyNorms(_evidence);
  return _evidence;
}
const _evidenceWatchers = new Set();
function subscribeEvidence(fn) { _evidenceWatchers.add(fn); return () => _evidenceWatchers.delete(fn); }

async function logEvidence(rec) {
  const list = await loadEvidence();
  list.push(rec);
  if (list.length > EVIDENCE_CAP) list.splice(0, list.length - EVIDENCE_CAP);
  sSet(EVIDENCE_KEY, JSON.stringify(list));
  refreshLatencyNorms(list);
  for (const fn of _evidenceWatchers) { try { fn(list.slice()); } catch (e) {} }
}

/* ── grading against this learner, not against a constant ──
   gradeFromLatency() uses universal thresholds (fast+streaked is Easy, slow is Hard).
   Those cannot mean the same thing for picking one of four options and for typing out
   かようび — the second is slower for everyone, so a fixed cutoff quietly marks every
   typed answer as difficult and drags its schedule in.

   Once there are enough correct answers of a given skill+format to form a norm, the
   grade comes from where this answer sits in THIS learner's own distribution for THAT
   kind of question. Below that, the old thresholds still apply — a norm built from three
   samples would be worse than the constant it replaced. */

/* ── outcome feedback ──
   The last review's sharpest point: failure classification existed and changed nothing.
   These write the two signals the next intervention actually reads — a rolling recent
   history, and which ability broke — back onto the item, in whichever store owns it.

   `recent` is a short string of 1s and 0s, newest last. Lifetime accuracy reacts far too
   slowly: a word answered wrong for months and right all week still looks broken, and one
   that was solid and has just fallen apart still looks fine. */
function applyOutcome(st, { ok, failure, skill }) {
  const base = st || {};
  const out = { ...base, recent: pushRecent(base.recent, ok) };
  if (skill === "production") out.rrecent = pushRecent(base.rrecent, ok);
  out.lastFailure = ok ? null : (failure || null);
  return out;
}


const PLAN_KEY = "jpn101:plan";

export const AREAS = [
  ["vocabulary", "Vocabulary", "📖"],
  ["kanji", "Kanji", "🈷️"],
  ["listening", "Listening", "👂"],
  ["reading", "Reading", "📕"],
  ["writing", "Writing", "✍️"],
  ["speaking", "Speaking", "💬"],
  ["grammar", "Grammar", "🔧"],
  ["culture", "Culture", "🏮"],
];

/* Which area a piece of practice counted towards. Kept explicit rather than guessed, so
   the coverage report cannot quietly flatter itself. */
function areaForDeck(deck) {
  if (deck === "kanji") return "kanji";
  if (deck === "kana" || deck === "scripts") return "reading";
  if (deck === "conj" || deck === "dates") return "grammar";
  if (deck === "input") return "listening";
  if (deck === "oral") return "speaking";
  return "vocabulary";
}

/* Three honest paces, because some days are not study days. The professor's point about
   "small and simple things" is the default: five focused minutes, three times a day,
   beats one heroic session you will not repeat. */
const PACES = [
  ["short", "Short", 5, "Tired, busy, or between things. Five minutes still counts."],
  ["normal", "Normal", 10, "The daily default — enough to make real progress."],
  ["deep", "Deep", 20, "Motivated and have the time. Bigger backlog, more new words."],
];

const PLAN_DEFAULT = {
  vision: { fiveYear: "", oneYear: "", term: "" },
  goals: [],
  priorities: { vocabulary: 2, kanji: 2, listening: 1, reading: 1, writing: 1, speaking: 1, grammar: 1, culture: 1 },
  pace: "normal",
};

async function loadPlan() {
  try {
    const raw = await sGet(PLAN_KEY);
    if (!raw) return { ...PLAN_DEFAULT };
    const p = JSON.parse(raw);
    return {
      ...PLAN_DEFAULT, ...p,
      vision: { ...PLAN_DEFAULT.vision, ...(p.vision || {}) },
      priorities: { ...PLAN_DEFAULT.priorities, ...(p.priorities || {}) },
      goals: Array.isArray(p.goals) ? p.goals : [],
    };
  } catch (e) { return { ...PLAN_DEFAULT }; }
}
/* The plan is edited on its own tab but consumed on the Study tab, so changes have to
   reach a component that is not mounted alongside the editor. */
const _planWatchers = new Set();
function subscribePlan(fn) { _planWatchers.add(fn); return () => _planWatchers.delete(fn); }
function savePlan(plan) {
  sSet(PLAN_KEY, JSON.stringify(plan));
  for (const fn of _planWatchers) { try { fn(plan); } catch (e) {} }
}

function paceMinutes(pace) {
  const row = PACES.find(([k]) => k === pace);
  return row ? row[2] : 10;
}

/* Priorities become deck weights, so a stated priority actually changes the session.
   Deliberately gentle: a priority nudges the ordering, it does not override how badly
   something has decayed. Saying listening matters should not mean forgetting kanji. */
function deckWeight(plan, deck) {
  const area = areaForDeck(deck);
  const p = (plan && plan.priorities && plan.priorities[area]) || 1;
  return (p - 1) * 0.6;                       // 1 → 0, 2 → 0.6, 3 → 1.2
}

/* What actually got practised, per area, over the last N days. Read from the day log
   rather than from intentions. */
function coverageFrom(days, span = 14) {
  const out = {};
  for (const [k] of AREAS) out[k] = 0;
  if (!days) return out;
  const cut = Date.now() - span * 86400000;
  for (const key of Object.keys(days)) {
    if (new Date(key + "T12:00:00").getTime() < cut) continue;
    const by = days[key] && days[key].by;
    if (!by) continue;
    for (const area of Object.keys(by)) if (area in out) out[area] += by[area];
  }
  return out;
}

/* ── kanji ordering, shared by the Kanji tab and Smart Review ──
   Both need the same answer to "which characters am I working on?", and two copies of
   that rule would drift the moment either changed — the Kanji page would show one
   frontier while Smart Review introduced from another. One function, both callers.

   The order is the learner's own vocabulary first: a character that appears in words you
   have actually studied outranks one that is merely frequent in newspapers. */
function kanjiOrdered(list, deckMap) {
  if (!deckMap || !deckMap.size) return list || [];
  const rank = (k, i) => {
    const d = deckMap.get(k.c);
    if (!d) return 2000000 + i;
    return (d.studied ? 0 : 1000000) + i - Math.min(d.n, 40) * 40;
  };
  return (list || []).map((k, i) => ({ k, r: rank(k, i) })).sort((a, b) => a.r - b.r).map((x) => x.k);
}

/* The unlocked set grows only as characters go solid, so the frontier cannot run away
   from you. Smart Review introduces from exactly this set, which is why a character met
   there shows up on the Kanji page as met — they are the same list and the same store. */
function kanjiUnlocked(all, stats) {
  const mastered = (all || []).filter((k) => (((stats || {})[k.c] || {}).level || 0) >= 4).length;
  const frontier = Math.min((all || []).length, KANJI_BATCH * (Math.floor(mastered / KANJI_BATCH) + 2));
  return (all || []).slice(0, frontier);
}

/* ── the other decks, as cards ──
   Kana, kanji and the 10k list already carry the same stat record as the vocabulary deck
   and are already scheduled by the same model, but each one only ever appeared on its own
   tab. Something learned in June was invisible to the one button that actually gets
   pressed. These adapters put them in the same session.

   Only recognition is borrowed. The bespoke exercises on each tab — stroke order, the
   kanji matching grid, the conjugation drill — stay where they are, because they are the
   whole point of those tabs. What Smart Review adds is the thing none of them can do:
   noticing that a kana you have not seen since June has quietly faded. */
const DECK_SRC = ["kana", "kanji", "freq"];

function foreignKey(src) {
  return src === "kana" ? KANA_KEY : src === "kanji" ? KANJI_KEY : "jpn101:freq";
}

/* Each deck keys its stats differently — kana by "h-あ", kanji by the bare character, the
   10k list by card id. The card id carries the source so a result can find its way home. */
function foreignCard(src, raw) {
  if (src === "kana") {
    return { id: "kana:" + raw.id, src, srcId: raw.id, term: raw.ch, reading: raw.r,
             romaji: raw.r, meaning: raw.r, kind: "kana", emoji: "🔤" };
  }
  if (src === "kanji") {
    const on = (raw.on || []).slice(0, 2).join("・");
    const kun = (raw.kun || []).slice(0, 2).join("・");
    return { id: "kanji:" + raw.c, src, srcId: raw.c, term: raw.c,
             reading: [on, kun].filter(Boolean).join(" / "), romaji: "",
             meaning: (raw.m || []).slice(0, 3).join(", "), kind: "kanji", emoji: raw.e || "🈷️" };
  }
  return { ...raw, id: "freq:" + raw.id, src, srcId: raw.id };
}

/* Write a result back to the deck it came from. Each deck owns its own storage key and
   its own copy of the record, so this reads, updates and writes that key rather than
   touching the vocabulary deck. Same stat shape, same memory model, same everything —
   only the key differs. */
async function recordForeign(card, ok, ms, area, outcome) {
  const key = foreignKey(card.src);
  try {
    const raw = await sGet(key);
    /* Every deck stores the same thing: a map from item id to its stats. freq used to be a
       special case here that rebuilt an ARRAY — a shape its own writer had abandoned — so
       a graded frequency word wrote `[]` over the whole map and took every studied word
       with it. It could not fire only because the pooling above never yielded a freq card;
       one bug was hiding the other. freqStatsFrom converts a legacy array rather than
       discarding it, and the branch is gone: freq is now scheduled exactly like kanji. */
    const store = card.src === "freq"
      ? freqStatsFrom(raw ? JSON.parse(raw) : null)
      : (raw ? JSON.parse(raw) : {});
    const now = Date.now();
    /* First sighting of a frequency word. The daily new-word budget is counted from this,
       and the counting used to happen inside the 10k tab — with the tab gone, the only
       place that can still see "this word had never been seen" is here. Without it the
       quota reads zero used, forever, and the frontier never closes. */
    const isNewFreq = card.src === "freq" && !((store[card.srcId] || {}).seen > 0);
    {
      const st = store[card.srcId] || { seen: 0, correct: 0, level: 0, streak: 0 };
      store[card.srcId] = applyOutcome({
        ...st, last: now, fsrs: statReview(st, ok, ms, now),
        seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
        streak: ok ? (st.streak || 0) + 1 : 0,
        level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
        ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
      }, { ok, ...(outcome || {}) });
      await sSet(key, JSON.stringify(store));
    }
    logDay({ ok, ms: ms || 0, deck: card.src, area, fnew: isNewFreq });
  } catch (e) { /* a lost result is better than a broken session */ }
}

/* Load every other deck's items and stats, ready to hand to the session builder. */
async function loadForeignDecks(cards) {
  const out = [];
  /* Kana is deliberately NOT pooled. Hiragana and katakana are memorised, so drilling a
     character in Smart Review spends a slot that a word or a kanji needed. The Kana tab
     is still there for when a chart needs refreshing; it just does not dilute the one
     button that is supposed to be the highest-value thing to press. */
  try {
    const [d, raw] = await Promise.all([loadKanji(), sGet(KANJI_KEY)]);
    const stats = raw ? JSON.parse(raw) : {};
    /* The SAME unlocked set the Kanji tab works from, in the same order — including
       characters not yet met, so Smart Review can introduce them too. Because both read
       and write jpn101:kanji keyed by the bare character, a kanji first met here shows up
       on the Kanji page as met, counts toward its mastered total, and moves its frontier.
       The two tabs are one progress record seen from two places. */
    const index = deckKanjiIndex(cards || []);
    const all = kanjiOrdered((d && d.kanji) || [], index);
    /* Asked through a word from the deck wherever one exists. 68 kanji answers came back
       99% correct, which is not mastery — it is a question that asks nothing. Recognising
       "eat" beside 食 is not the skill; reading 食べる as たべる is, and the reading a kanji
       takes depends on the word it sits in. Identity is unchanged, so every stored answer
       stays attached to its character. */
    const items = inContext(
      kanjiUnlocked(all, stats).map((k, i) => ({ ...foreignCard("kanji", k), order: i })),
      index,
    );
    out.push({ deck: "kanji", items, stats: remapStats(stats, "kanji") });
  } catch (e) {}
  /* The frequency list. This used to pool only words already STARTED — and since the only
     way to start one was the 10k tab, retiring that tab would have made all ten thousand
     permanently unreachable. It also read the store as an array long after the writer had
     changed it to a map keyed by term, so in practice it pooled nothing at all.

     Now it works the way the kanji branch above does: everything in progress, plus a
     frontier of the next unstarted ranks, so Smart Review can introduce frequency words
     itself. New ones are capped by the day's remaining quota — the list is 10,000 long and
     a session that offered all of it would be a vocabulary firehose, not a study plan. */
  try {
    const [raw, d, days, qRaw] = await Promise.all([
      sGet("jpn101:freq"), loadFreqWords(), loadDays(), sGet("jpn101:freqQuota"),
    ]);
    const stats = freqStatsFrom(raw ? JSON.parse(raw) : null);
    const words = (d && d.words) || [];
    const quota = Number(qRaw) || FREQ_DEFAULT_QUOTA;
    const today = days[localDayKey()];
    const room = Math.max(0, quota - ((today && today.fnew) || 0));
    const { started, fresh } = freqPool(words, stats, { room });
    const items = [...started, ...fresh].map((x) => foreignCard("freq", x));
    out.push({ deck: "freq", items, stats: Object.fromEntries(items.map((i) => [i.id, i])) });
  } catch (e) {}
  return out.filter((s) => s.items.length);
}

/* The builder looks stats up by the card id it is given, which is prefixed. */
function remapStats(stats, src) {
  const out = {};
  for (const k of Object.keys(stats || {})) out[src + ":" + k] = stats[k];
  return out;
}

/** Probability you'd recall this card right now — used for the UI, not the schedule. */
/* ── mastery as colour ──
   FSRS stability IS the mastery number — how many days this memory survives — so the card
   shows it directly rather than through a separate progress bar. Cool muted slate for a
   memory that will not last the night, warming to gold as it starts holding for months.

   Stability is logarithmic in practice (a card goes 2d -> 8d -> 30d -> 120d), so a linear
   ramp would leave everything past the first week looking identical. The log curve spends
   its resolution where the learning actually happens: 1d reads clearly different from 14d,
   while 200d and 300d both just read "solid". */
                 // matches session.mjs ceilingDays
/* Interpolated in RGB, not HSL: a hue sweep from slate-blue to gold runs through green on
   the short arc and through violet/red on the long one. Straight RGB gives a desaturated
   middle, which reads honestly as "in progress" and stays out of the way of the text. */



/* Everything the card needs, as custom properties. Returned as a style object so the value
   rides on the element and CSS does the rest — no extra class permutations. */






function sectionOf(c) {
  const sec = c.sec ? String(c.sec).replace(/#\d+$/, "") : "";   // "#n" only disambiguates same-scene duplicate seed rows (see cardMergeKey/applySeed)
  return sec || SECTION_MAP[c.term] || ((c.lesson || 0) <= 6 ? "Act 1" : "Class notes");
}

const DB_SECTION = /^DB (\d+)(?:[–-]\d+)?$/;   // "DB 8–9" — manga pages, en dash or hyphen
function hueFor(name) {
  if (name === "Act 1") return 214;
  if (name === "Class notes") return 42;
  // Every manga section shares one hue. They accumulate a page at a time, and hashing each
  // range separately would make the top of the study list a different colour every two pages.
  if (DB_SECTION.test(name)) return 22;
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SECTION_HUES[h % SECTION_HUES.length];
}
function sectionArt(cardsInSec) {   // single most-used emoji in this section — genuinely representative, no external images needed
  const counts = new Map();
  cardsInSec.forEach((c) => { if (c.emoji) counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 1).map((e) => e[0]);
}
function sectionRank(s) {
  // Manga sections sit above the coursework: this is the thing being read every day, and
  // burying it under a year of lessons is how it stops getting opened. Ranked by first page
  // so the list stays in reading order, and offset far enough below Act 1 that no page
  // number can ever climb back into the lessons.
  const db = DB_SECTION.exec(s);
  if (db) return -1e6 + parseInt(db[1], 10);
  if (s === "Act 1") return 100;
  const dm = /^Act (\d+) Dry Run$/.exec(s);
  if (dm) return 1000 + parseInt(dm[1], 10) * 100 + 99; // after every scene of that act
  const m = /^(\d+)-(\d+)/.exec(s);
  if (m) return 1000 + parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
  if (s === "Class notes") return 90000;
  return 50000;
}


/* ───────────────────────────── SENTENCES (AI) ───────────────────────────── */
/* Transport for every AI feature (hook, debrief, script annotation, sentences). The browser
   must never call api.anthropic.com directly: there is no safe place for a key in a client
   bundle, and this repo already had one key-in-source incident. A session-gated Worker route
   (/api/ai, key held as a Worker secret) is the only allowed path. */
const AI_ENABLED = true;
const AI_ENDPOINT = "/api/ai";
/* callAI: the live transport, used by hook/debrief/Scripts annotation. Sends a fixed TASK
   name plus structured data only — never a free-form prompt string. The Worker owns every
   prompt (cf/src/ai.js); this is the whole abuse guard, so no call site here should ever
   build prompt TEXT and hand it to the network. */
class AIError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function aiMessage(status) {
  return status === 401 ? "Sign in (Browse tab) to use the AI helpers."
    : status === 429 ? "Daily AI limit reached — try again tomorrow."
    : status === 503 ? "The AI helper isn't set up on this server yet."
    : status === 504 ? "The AI took too long — try again."
    // Name the provider. "The AI" was ambiguous enough that a Gemini capacity message read
    // as the app still calling Anthropic — it never did; only the Worker talks to Google.
    : "Couldn't reach Gemini — try again later.";
}
async function callAI(task, input) {
  const session = loadSession();
  if (!session) throw new AIError(401, aiMessage(401));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST", cache: "no-store", signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + session },
      body: JSON.stringify({ task, input, v: 1 }),
    });
    if (!res.ok) {
      /* Carry the server's explanation through. Without it every failure collapsed into
         "Couldn't reach the AI", which is true of a dead key, a bad schema and a network
         blip alike — three problems with nothing in common except the message. */
      let detail = "";
      try { detail = ((await res.json()) || {}).detail || ""; } catch (e) {}
      /* Congestion is not a fault and should not read like one. The Worker already waited
         and retried across every configured model before giving up, so by the time this
         reaches the learner the only useful thing to say is "later, not now". */
      if (/high demand|overloaded|unavailable|try again later/i.test(detail)) {
        throw new AIError(res.status, "Gemini is busy right now — the exercise below is built from your own deck instead.");
      }
      throw new AIError(res.status, aiMessage(res.status) + (detail ? " (" + detail + ")" : ""));
    }
    const data = await res.json();
    if (!data || !data.result) throw new AIError(502, aiMessage(502));
    return data;   // { result, cached }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e.name === "AbortError") throw new AIError(504, aiMessage(504));
    throw new AIError(0, aiMessage(0));
  } finally { clearTimeout(timer); }
}
/* The vocabulary the sentence tasks build from.

   Sampled, not sent whole: the deck is 1,632 words and the old client-side prompt pasted
   every one of them into the request. A sample also means each call hashes to a different
   cache key, which is what you want here — a cached sentence exercise would hand back the
   same sentence every time you pressed Generate.

   Weighted toward words that are actually in play: anything seen at least once, so the
   sentence is built from HIS vocabulary rather than whatever sorts first. */
function vocabSample(cards, n = 40) {
  /* Studied words ONLY — never padded out with unseen ones to reach n. A sentence built
     from words you have not met is unanswerable however natural it reads, so a short
     vocabulary of known words beats a full one that smuggles in strangers. */
  const seen = cards.filter((c) => (c.seen || 0) > 0);
  const pool = seen.length ? seen : cards;
  const picked = pool.slice();
  for (let i = picked.length - 1; i > 0; i--) {          // Fisher-Yates, fresh each press
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.slice(0, n).map((c) => ({ term: c.term, reading: c.reading, meaning: c.meaning }));
}

const NOUN_SET = new Set(["猫", "犬", "学校", "食べ物", "仕事", "写真", "子供", "睡眠", "健康"]);
function shortMeaning(m) { return (m || "").split(/[;(（,]/)[0].trim(); }
/* Pick a word to be asked to PRODUCE.

   Only from words actually studied. This sorted the entire deck weakest-first and took from
   the weakest half — and since an unseen card scores lower than any seen one, "weakest" meant
   "never shown to you". With 1,590 unstudied words in the deck the tab was, essentially
   always, asking for a word it had never taught. That is not a hard question, it is an
   unanswerable one, and the honest complaint was "how would I know that".

   Weak-first is still right, but only WITHIN what has been met at least once. */
function pickTarget(cards) {
  const studied = cards.filter((c) => (c.seen || 0) > 0);
  if (!studied.length) return null;                    // caller shows the nudge instead
  const sorted = studied.sort((a, b) => masteryScore(a) - masteryScore(b));
  const pool = sorted.slice(0, Math.max(5, Math.ceil(sorted.length / 2)));
  return pool[Math.floor(Math.random() * pool.length)];
}
function localFill(cards) {
  const c = pickTarget(cards);
  if (!c) throw new Error("no studied words yet");
  if (NOUN_SET.has(c.term)) {
    return {
      tokens: [{ t: "＿＿＿" }, { t: "がすきです。" }],
      fullTokens: [{ t: c.term, r: c.reading }, { t: "がすきです。" }],
      answer: c.term, reading: c.reading, romaji: c.romaji,
      translation: "I like " + shortMeaning(c.meaning) + ".",
      hint: c.romaji ? "starts with “" + c.romaji[0] + "”" : "", _local: true,
    };
  }
  return {
    tokens: [{ t: "＿＿＿" }],
    fullTokens: [{ t: c.term, r: c.reading }],
    answer: c.term, reading: c.reading, romaji: c.romaji,
    translation: "Say in Japanese: " + shortMeaning(c.meaning),
    hint: c.romaji ? "starts with “" + c.romaji[0] + "”" : "", _local: true,
  };
}
function localTrans(cards) {
  const c = pickTarget(cards);
  if (!c) throw new Error("no studied words yet");
  if (NOUN_SET.has(c.term)) {
    return {
      english: "I like " + shortMeaning(c.meaning) + ".",
      model: c.term + "がすきです。",
      modelTokens: [{ t: c.term, r: c.reading }, { t: "がすきです。" }],
      reading: c.reading + "がすきです", romaji: (c.romaji || "") + " ga suki desu", notes: "", _local: true,
    };
  }
  return {
    english: "Say in Japanese: " + shortMeaning(c.meaning),
    model: c.term, modelTokens: [{ t: c.term, r: c.reading }],
    reading: c.reading, romaji: c.romaji, notes: "", _local: true,
  };
}

function Furigana({ tokens }) {
  if (!Array.isArray(tokens)) return <>{tokens}</>;   // string fallback (no furigana)
  return tokens.map((tk, i) => {
    if (!tk || tk.t == null) return null;
    if (tk.t === "___" || tk.t === "＿＿＿") return <span key={i} className="tc-blank">＿＿＿</span>;
    if (tk.r) return <ruby key={i}>{tk.t}<rt>{tk.r}</rt></ruby>;
    return <span key={i}>{tk.t}</span>;
  });
}

function Sentences({ cards, onResult }) {
  const [mode, setMode] = useState("fill");
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [ex, setEx] = useState(null);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  /* One exercise of lookahead. A live generation costs seconds even on a good day, and the
     student spends far longer answering than the model spends writing — so the next
     exercise is requested the moment the current one is on screen, and "Next sentence"
     usually finds it already waiting. One deep, per mode. A failed prefetch resolves to
     null and simply means the button pays the old price; it never surfaces an error of its
     own. Prefetching only follows a LIVE success, so a signed-out or offline session never
     spawns a background call it knows will fail. */
  const nextRef = useRef({});
  const fetchExercise = useCallback(
    (m) => callAI(m === "fill" ? "sentence_fill" : "sentence_trans", { vocab: vocabSample(cards) }),
    [cards]);
  const prefetch = useCallback((m) => {
    if (!nextRef.current[m]) nextRef.current[m] = fetchExercise(m).catch(() => null);
  }, [fetchExercise]);

  const generate = useCallback(async () => {
    setLoading(true); setError(""); setOffline(false); setEx(null); setChecked(false);
    setAnswer(""); setResult(null); setShowHint(false);
    const pending = nextRef.current[mode];
    nextRef.current[mode] = null;
    try {
      const got = pending ? await pending : null;   // null when there was no prefetch, or it failed
      const { result } = got || await fetchExercise(mode);
      setEx(result);
      prefetch(mode);                               // start writing the one after, while this one is answered
    } catch (e) {
      try {                                  // live generator unreachable → build one locally from the deck
        setEx(mode === "fill" ? localFill(cards) : localTrans(cards));
        /* Say WHY, not just that it fell back. "Isn't reachable right now" reads as a server
           problem, so a signed-out session looked identical to an outage — and that ambiguity
           hid a genuinely broken endpoint for as long as it took someone to notice the tab
           had never once produced a live sentence. */
        setOffline(e && e.message ? e.message : "");
      } catch (e2) {
        setError("Couldn't generate (" + (e.message || "error") + "). Tap “Generate” to retry.");
      }
    } finally { setLoading(false); }
  }, [mode, cards, fetchExercise, prefetch]);

  const switchMode = (m) => { setMode(m); setEx(null); setChecked(false); setAnswer(""); setResult(null); setError(""); setOffline(false); };

  const checkFill = () => {
    const ok = fillMatch(ex, answer);
    setResult({ correct: ok });
    setChecked(true);
    const card = cards.find((c) => c.term === ex.answer);
    if (card) onResult(card.id, ok);
  };

  const skipFill = () => {
    setResult({ correct: false, idk: true });
    setChecked(true);
    const card = cards.find((c) => c.term === ex.answer);
    if (card) onResult(card.id, false);   // "Idk" counts as a miss → flags the word as weak
  };

  const checkTranslate = async () => {
    if (ex._local) { setResult({}); setChecked(true); return; }   // offline item: just reveal the model answer
    setGrading(true); setError("");
    try {
      const { result } = await callAI("sentence_grade", { english: ex.english, model: ex.model, answer });
      setResult(result);
    } catch (e) {
      setResult({ feedback: "(Couldn't reach the grader — compare with the model answer below.)" });
    } finally { setGrading(false); setChecked(true); }
  };

  if (cards.length < 3) {
    return <div className="tc-empty"><p>Add a few more words first — sentence practice needs some vocabulary to work with.</p></div>;
  }
  /* Sentence practice asks you to PRODUCE Japanese, which only works for words you have
     actually met. Saying so beats generating an exercise from words the app has never
     shown you and letting you conclude you should have known them. */
  if (cards.filter((c) => (c.seen || 0) > 0).length < 5) {
    return (
      <div className="tc-empty">
        <p>Study a few words first — sentence practice only uses vocabulary you've already seen,
        so it needs a handful under your belt before it can ask you to write anything.</p>
      </div>
    );
  }

  return (
    <div className="tc-sent">
      <div className="tc-sentmodes">
        <button className={"tc-segbtn" + (mode === "fill" ? " is-on" : "")} onClick={() => switchMode("fill")}>Fill in the blank</button>
        <button className={"tc-segbtn" + (mode === "translate" ? " is-on" : "")} onClick={() => switchMode("translate")}>Translate</button>
      </div>

      {error && <div className="tc-senterr">{error}</div>}
      {offline && ex && (
        <p className="tc-offnote">
          Offline practice — built from your deck.{typeof offline === "string" && offline ? " " + offline : ""}
        </p>
      )}

      {!ex && !loading && (
        <div className="tc-sentempty">
          <p>Claude builds a sentence from your own vocabulary, then quizzes you on it.</p>
          <button className="tc-btn tc-btn-primary" onClick={generate}>Generate a sentence</button>
        </div>
      )}

      {loading && <div className="tc-sentloading">✦ Claude is writing a sentence from your words…</div>}

      {ex && mode === "fill" && (
        <div className="tc-card2">
          <p className="tc-sentgoal">{ex.translation}</p>
          <p className="tc-sentjp"><Furigana tokens={ex.tokens || ex.sentence} /></p>
          {!checked ? (
            <>
              <input className="tc-sentinput" value={answer} autoFocus
                placeholder="the missing word — kana, kanji, or rōmaji"
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && answer.trim()) checkFill(); }} />
              <div className="tc-sentbtns">
                {ex.hint && <button className="tc-btn tc-btn-sm" onClick={() => setShowHint(true)}>Hint</button>}
                <button className="tc-btn tc-btn-sm tc-idk" onClick={skipFill}>I don't know</button>
                <button className="tc-btn tc-btn-primary" onClick={checkFill} disabled={!answer.trim()}>Check</button>
              </div>
              {showHint && <p className="tc-senthint">💡 {ex.hint}</p>}
            </>
          ) : (
            <>
              <p className={"tc-sentresult " + (result.correct ? "ok" : result.idk ? "mid" : "no")}>
                {result.correct ? "✓ Correct!" : result.idk ? "○ Marked for review" : "✕ Not quite"}
              </p>
              <p className="tc-sentjp tc-sentfull"><Furigana tokens={ex.fullTokens || ex.full} /></p>
              <p className="tc-sentans">{ex.answer}（{ex.reading}）· {ex.romaji}</p>
              <button className="tc-btn tc-btn-primary" onClick={generate}>Next sentence</button>
            </>
          )}
        </div>
      )}

      {ex && mode === "translate" && (
        <div className="tc-card2">
          <p className="tc-eyebrow">Translate into Japanese</p>
          <p className="tc-sentgoal tc-sentbig">{ex.english}</p>
          {!checked ? (
            <>
              <textarea className="tc-sentinput" rows={2} value={answer} autoFocus
                placeholder="write it in Japanese…" onChange={(e) => setAnswer(e.target.value)} />
              <div className="tc-sentbtns">
                <button className="tc-btn tc-btn-sm" onClick={() => { setResult({}); setChecked(true); }}>Show answer</button>
                <button className="tc-btn tc-btn-primary" onClick={checkTranslate} disabled={!answer.trim() || grading}>{grading ? "Checking…" : "Check"}</button>
              </div>
            </>
          ) : (
            <>
              {result && result.rating && (
                <p className={"tc-sentresult " + (result.rating === "correct" ? "ok" : result.rating === "close" ? "mid" : "no")}>
                  {result.rating === "correct" ? "✓ Correct" : result.rating === "close" ? "≈ Close" : "✕ Off"}
                </p>
              )}
              {result && result.feedback && <p className="tc-sentfeedback">{result.feedback}</p>}
              <p className="tc-sentans">Model: <Furigana tokens={ex.modelTokens || ex.model} />（{ex.reading}）</p>
              {ex.notes && <p className="tc-senthint">💡 {ex.notes}</p>}
              <button className="tc-btn tc-btn-primary" onClick={generate}>Next sentence</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}



/* ───────────────────────────── KANA ───────────────────────────── */
const KANA_KEY = "jpn101:kana";







const KANA_REQUEUE_GAP = 3, KANA_REQUEUE_CAP = 2;
const fmtSecs = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
};

/* ── spelling contrast ──
   The one drill in the app that tests orthography directly. A learner can know 学校 as
   meaning-plus-sound and still write がこう every time, and nothing else here would ever
   notice: recognition cards keep coming back correct. Options differ from the right answer
   by exactly one feature, so the contrast itself is the question. */
function Contrast({ cards, onResult }) {
  const [round, setRound] = useState(0);
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const [right, setRight] = useState(0);
  const shownRef = useRef(0);

  /* Weakest first, same ordering rule the rest of the app uses, filtered to cards that
     actually have something to contrast (about 86% of the deck).

     Built ONCE per round, not as a memo over `cards`. Answering calls recordResult, which
     replaces the deck array, which would recompute the memo and reshuffle the list under
     the learner mid-answer — the result panel ended up rendering against a different word
     than the one just answered. */
  const buildDrills = useCallback(() => {
    const pool = cards
      .filter((c) => (c.seen || 0) > 0 || (c.level || 0) > 0)
      .slice()
      .sort((a, b) => masteryScore(a) - masteryScore(b));
    const src = pool.length >= 8 ? pool : cards.slice();
    return contrastSet(src, 12, { seed: round * 31 });
  }, [cards, round]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [drills, setDrills] = useState(buildDrills);
  const nextRound = () => {
    const r = round + 1;
    setRound(r);
    const pool = cards.filter((c) => (c.seen || 0) > 0 || (c.level || 0) > 0)
      .slice().sort((a, b) => masteryScore(a) - masteryScore(b));
    setDrills(contrastSet(pool.length >= 8 ? pool : cards.slice(), 12, { seed: r * 31 }));
    setPos(0); setRight(0);
  };

  const d = pos < drills.length ? drills[pos] : null;
  useEffect(() => { shownRef.current = Date.now(); setPicked(null); }, [pos, round]);

  const choose = (opt) => {
    if (picked || !d) return;
    const ok = opt === d.answer;
    setPicked(opt);
    if (ok) setRight((n) => n + 1);
    const ms = Date.now() - shownRef.current;
    onResult(d.id, ok, undefined, ms, "writing",
             { failure: ok ? null : "orthography", skill: "production" });
  };

  if (!drills.length) {
    return <div className="tc-empty"><p>Nothing to contrast yet — study a few words first and they will show up here.</p></div>;
  }
  if (!d) {
    const pct = drills.length ? Math.round((right / drills.length) * 100) : 0;
    return (
      <div className="tc-done">
        <p className="tc-eyebrow">Spelling round complete</p>
        <div className="tc-bignum">{pct}<span>%</span></div>
        <p className="tc-donesub">{right}/{drills.length} spelled right</p>
        <div className="tc-donebtns">
          <button className="tc-btn tc-btn-primary" onClick={nextRound}>Another round</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-study">
      <div className="tc-progress">
        <div className="tc-segrail" role="progressbar" aria-valuemin={0} aria-valuemax={drills.length} aria-valuenow={pos}>
          {drills.map((_, i) => (
            <span key={i} className={"tc-seg2" + (i === pos ? " is-now" : i < pos ? " is-ok" : "")} />
          ))}
        </div>
        <span className="tc-progtext">{pos + 1} / {drills.length}</span>
      </div>

      <div className="tc-mcwrap" style={masteryStyle(d)}>
        <span className="tc-kindchip tc-clozechip">{d.label}</span>
        {d.emoji && <div className="tc-emoji tc-emoji-lg">{d.emoji}</div>}
        <div className={"tc-term" + (d.term.length <= 5 ? " tc-term-" + d.term.length : "")}>{d.term}</div>
        {d.meaning && <p className="tc-clozeen">{d.meaning}</p>}
        <p className="tc-conjnote" style={{ marginTop: 0 }}>Which spelling is right?</p>
        <div className="tc-mcopts">
          {d.options.map((o) => {
            const isAnswer = o === d.answer;
            const cls = !picked ? "" : isAnswer ? " is-answer" : o === picked ? " is-wrongpick" : "";
            return (
              <button key={o} type="button" className={"tc-mcopt tc-mcopt-kana" + cls}
                      disabled={!!picked} onClick={() => choose(o)}>{o}</button>
            );
          })}
        </div>
        {picked && (
          <>
            {/* The rule, not a scolding. With a minimal pair the contrast IS the lesson, so
                the note is shown whether they got it right or wrong. */}
            <p className="tc-conjnote">{d.note}</p>
            <button className="tc-btn tc-btn-primary tc-btn-sm" onClick={() => setPos((p) => p + 1)}>Next →</button>
          </>
        )}
      </div>
    </div>
  );
}

function Kana() {
  const [script, setScript] = useState("hira");     // hira | kata
  const [sets, setSets] = useState(() => new Set(["base"]));   // any mix of KANA_GROUPS keys
  const [view, setView] = useState("setup");        // setup | session | summary | chart
  const [sessionLen, setSessionLen] = useState(20);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [revealed, setRevealed] = useState(false);
  const [guide, setGuide] = useState(false);
  // session state — mirrors Study so both tabs behave the same way
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [passed, setPassed] = useState(() => new Set());
  const [firstTry, setFirstTry] = useState(() => new Set());
  const [struggled, setStruggled] = useState(() => new Set());
  const missRef = useRef({});
  const shownRef = useRef(0);        // when the current kana appeared
  const thinkRef = useRef(null);     // ms from shown → Check (think time)
  const sessionStartRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { (async () => {
    try { const r = await sGet(KANA_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  // Rows for whichever groups are switched on, dropping katakana-only entries (ー, ファ …)
  // when hiragana is selected, and any row those leave empty.
  const rows = useMemo(() => {
    const keep = (e) => !(e[4] && script !== "kata");
    return KANA_GROUPS
      .filter(([key]) => sets.has(key))
      .flatMap(([, , groupRows]) => groupRows.map((row) => row.filter(keep)))
      .filter((row) => row.length);
  }, [sets, script]);
  const list = useMemo(() => rows.flat().map(([h, k, r, note]) => ({
    id: (script === "hira" ? "h-" : "k-") + h,       // char-keyed: stable & collision-free
    ch: script === "hira" ? h : k, r, note,
  })), [rows, script]);
  const toggleSet = (key) => setSets((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next.size ? next : new Set(["base"]);      // never leave nothing to drill
  });
  const allOn = KANA_GROUPS.every(([key]) => sets.has(key));

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  // Pick whichever kana needs work MOST (highest score wins). The old version only looked
  // at level + times-seen, so a kana you kept getting wrong was treated the same as one you
  // nailed every time. Now accuracy, a broken streak, and how long it's been all count.
  // Same memory model as the vocabulary deck — see statNeed.
  const needK = (st, now) => statNeed(st, now) + (st.seen ? 0 : Math.random());
  // neediest first, with jitter so repeat sessions aren't an identical loop
  const byNeed = useCallback((pool) => {
    const now = Date.now();
    return pool
      .map((x) => ({ x, k: needK(getS(statsRef.current, x.id), now) + Math.random() * 1.2 }))
      .sort((a, b) => b.k - a.k)
      .map((o) => o.x);
  }, []);

  const startSession = useCallback((subset) => {
    const ordered = byNeed(subset && subset.length ? subset : list);
    const pool = sessionLen === "all" ? ordered : ordered.slice(0, sessionLen);
    if (!pool.length) return;
    setQueue(pool); setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {};
    sessionStartRef.current = Date.now();
    setElapsed(0);
    setRevealed(false); setGuide(false);
    setView("session");
  }, [list, sessionLen, byNeed]);

  const cur = queue[pos] || null;
  const sessionDone = view === "session" && pos >= queue.length && queue.length > 0;

  // start the clock on each new kana, and freeze total elapsed when the session ends
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, view]);
  useEffect(() => {
    if (sessionDone) { setElapsed(Date.now() - sessionStartRef.current); setView("summary"); }
  }, [sessionDone]);

  // weakest kana in the current selection — drives the setup preview and the "drill weakest" button
  const weakest = useMemo(() => {
    const now = Date.now();
    return list
      .filter((x) => (getS(stats, x.id).seen || 0) > 0)
      .map((x) => ({ x, st: getS(stats, x.id), k: needK(getS(stats, x.id), now) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, 6);
  }, [list, stats]);
  const untouched = useMemo(() => list.filter((x) => !(getS(stats, x.id).seen || 0)).length, [list, stats]);

  /* drawing pad */
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const setup = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2620";
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);
  useEffect(() => { if (view === "session") setup(); }, [pos, view, setup]);
  useEffect(() => {                                   // iOS: stop the page panning while drawing
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, [view]);
  useEffect(() => {
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);
  const xy = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const down = (e) => { e.preventDefault(); drawingRef.current = true; lastRef.current = xy(e); try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const pnt = xy(e), l = lastRef.current;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(pnt.x, pnt.y); ctx.stroke();
    lastRef.current = pnt;
  };
  const up = () => { drawingRef.current = false; lastRef.current = null; };
  const clearPad = () => setup();

  const record = (got) => {
    if (!cur) return;
    const m = statsRef.current;
    const s0 = getS(m, cur.id);
    const think = thinkRef.current;
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (got ? 1 : 0),
      level: got ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: got ? (s0.streak || 0) + 1 : 0, last: Date.now(),
      // same memory model as the vocabulary deck; the old counters stay for the UI
      fsrs: statReview(s0, got, think, Date.now()),
      ms: (s0.ms || 0) + (think || 0), msN: (s0.msN || 0) + (think ? 1 : 0) };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(KANA_KEY, JSON.stringify(nx));

    // session bookkeeping: passed once, and missed ones come back later in the same session
    if (got) {
      if (!missRef.current[cur.id]) setFirstTry((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      setPassed((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      setQueue((prev) => prev.filter((x, idx) => idx <= pos || x.id !== cur.id));   // drop later duplicates
    } else {
      setStruggled((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      const n = (missRef.current[cur.id] || 0) + 1;
      missRef.current[cur.id] = n;
      if (n <= KANA_REQUEUE_CAP) {
        setQueue((prev) => { const next = prev.slice(); next.splice(Math.min(pos + 1 + KANA_REQUEUE_GAP, next.length), 0, cur); return next; });
      }
    }
    setRevealed(false); setGuide(false);
    setPos((p) => p + 1);
  };
  const avgSecs = (st) => (st.msN ? (st.ms / st.msN / 1000).toFixed(1) + "s" : "—");

  const mastered = list.filter((x) => getS(stats, x.id).level >= 4).length;
  const cellClass = (id) => {
    const st = getS(stats, id);
    if (!st.seen) return " kn-untouched";
    if (st.level >= 4) return " kn-good";
    if (st.correct / st.seen < 0.5 || st.level < 2) return " kn-weak";
    return " kn-mid";
  };

  // ── mid-session: just the progress bar and the pad, no set chips to fiddle with ──
  if (view === "session" && cur) {
    return (
      <div className="tc-kana">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
          <span className="tc-progtext">{passed.size} / {poolSize}</span>
          <button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>
        </div>
        <div className="tc-card2 tc-kanadrill">
          <p className="tc-eyebrow">write this kana</p>
          <p className="tc-kanaprompt">{cur.r}{cur.note ? <span className="tc-kananote"> {cur.note}</span> : null}</p>
          <div className="tc-canvaswrap">
            {(guide || revealed) && <div className={"kn-ghost" + (revealed ? " kn-ghost-strong" : "")}>{cur.ch}</div>}
            <canvas ref={canvasRef} className="tc-canvas"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
          </div>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-sm" onClick={clearPad}>Clear</button>
            {!revealed && <button className="tc-btn tc-btn-sm" onClick={() => setGuide((v) => !v)}>{guide ? "Hide hint" : "Hint"}</button>}
            {!revealed
              ? <button className="tc-btn tc-btn-primary" onClick={() => { thinkRef.current = Date.now() - shownRef.current; setRevealed(true); }}>Check</button>
              : (
                <>
                  <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => record(false)}>Missed ✗</button>
                  <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => record(true)}>Got it ✓</button>
                </>
              )}
          </div>
        </div>
      </div>
    );
  }

  // ── session summary ──
  if (view === "summary") {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missed = list.filter((x) => struggled.has(x.id));
    const graded = passed.size || 1;
    return (
      <div className="tc-kana">
        <div className="tc-done">
          <p className="tc-eyebrow">Session complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">
            {firstTry.size} nailed first try{missed.length > 0 ? ` · ${missed.length} missed` : ""} · {poolSize} kana
          </p>
          <p className="tc-donesub">{fmtSecs(elapsed)} total · {(elapsed / graded / 1000).toFixed(1)}s per kana</p>
          {missed.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {missed.slice(0, 6).map((x) => {
                const st = getS(stats, x.id);
                return (
                  <div key={x.id} className="tc-kanaweakrow">
                    <span className="tc-kanaweakch">{x.ch}</span>
                    <span className="tc-kanaweakr">{x.r}</span>
                    <span className="tc-kanaweakmeta">{st.seen ? Math.round((st.correct / st.seen) * 100) + "%" : "—"} · {avgSecs(st)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tc-donebtns">
            {missed.length > 0 && (
              <button className="tc-btn tc-btn-primary" onClick={() => startSession(missed)}>Review the {missed.length} you missed</button>
            )}
            <button className="tc-btn" onClick={() => startSession()}>Go again</button>
            <button className="tc-btn" onClick={() => setView("setup")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-kana">
      <div className="tc-kanabar">
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (script === "hira" ? " is-on" : "")} onClick={() => setScript("hira")}>ひらがな</button>
          <button className={"tc-fchip" + (script === "kata" ? " is-on" : "")} onClick={() => setScript("kata")}>カタカナ</button>
        </div>
        <div className="tc-kanaseg">
          {KANA_GROUPS.map(([key, label]) => (
            <button key={key} className={"tc-fchip" + (sets.has(key) ? " is-on" : "")}
              aria-pressed={sets.has(key)} onClick={() => toggleSet(key)}
              title={key === "ext" ? "katakana-only loanword sounds" : undefined}>{label}</button>
          ))}
          <button className={"tc-fchip" + (allOn ? " is-on" : "")}
            title={allOn ? "back to base 46 only" : "select every set"}
            onClick={() => setSets(allOn ? new Set(["base"]) : new Set(KANA_GROUPS.map(([k]) => k)))}>
            {allOn ? "only 46" : "all"}
          </button>
        </div>
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (view === "setup" ? " is-on" : "")} onClick={() => setView("setup")}>Practice</button>
          <button className={"tc-fchip" + (view === "chart" ? " is-on" : "")} onClick={() => setView("chart")}>Chart</button>
        </div>
      </div>
      <p className="tc-kanaprog">
        {mastered}/{list.length} mastered · {script === "hira" ? "hiragana" : "katakana"} · {allOn ? "all sets" : KANA_GROUPS.filter(([k]) => sets.has(k)).map(([, l]) => l).join(" + ")}
        {sets.has("ext") && script !== "kata" ? " · extended = katakana only" : ""}
      </p>

      {!list.length ? (
        // only reachable with extended-only selected in hiragana mode — those sounds have
        // no hiragana spelling, so there's genuinely nothing to draw. Offer a way out.
        <div className="tc-card2 tc-kanadrill">
          <p className="tc-eyebrow">nothing to drill</p>
          <p className="tc-kanaempty">The extended loanword sounds (ファ, ヴィ, ティ…) only exist in katakana.</p>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-primary" onClick={() => setScript("kata")}>Switch to カタカナ</button>
            <button className="tc-btn tc-btn-sm" onClick={() => setSets(new Set(["base"]))}>Back to base 46</button>
          </div>
        </div>
      ) : view === "chart" ? (
        <div className="tc-kanagrid">
          {rows.map((row, ri) => (
            <div key={ri} className="tc-kanarow">
              {row.map(([h, k, r]) => {
                const id = (script === "hira" ? "h-" : "k-") + h;
                const one = list.find((x) => x.id === id);
                return (
                  <button key={id} className={"tc-kanacell" + cellClass(id)}
                    title={`${r} · ${getS(stats, id).seen ? Math.round((getS(stats, id).correct / getS(stats, id).seen) * 100) + "% · " + avgSecs(getS(stats, id)) : "not drilled yet"}`}
                    onClick={() => one && startSession([one])}>
                    <span className="tc-kanach">{script === "hira" ? h : k}</span>
                    <span className="tc-kanar">{r}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="tc-study-setup">
          <div className="tc-hero">
            <div className="tc-heronum">{mastered}</div>
            <p className="tc-herolabel">of {list.length} mastered</p>
            <p className="tc-herosub">{untouched > 0 ? `${untouched} never drilled` : "every kana in this set has been drilled"}</p>
          </div>

          <div className="tc-kanaseg tc-kanalen">
            <span className="tc-kanalenlabel">session</span>
            {KANA_LENGTHS.map((n) => (
              <button key={n} className={"tc-fchip" + (sessionLen === n ? " is-on" : "")} onClick={() => setSessionLen(n)}>
                {n === "all" ? `all ${list.length}` : n}
              </button>
            ))}
          </div>

          <button className="tc-btn tc-btn-primary tc-start" onClick={() => startSession()}>
            Start · {sessionLen === "all" ? list.length : Math.min(sessionLen, list.length)} kana
          </button>
          <p className="tc-smarthint">
            {untouched > 0
              ? `New kana first, then whichever you've been missing most.`
              : `Ordered by what you get wrong, how long you take, and how long since you last saw it.`}
          </p>

          {weakest.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {weakest.map(({ x, st }) => (
                <div key={x.id} className="tc-kanaweakrow">
                  <span className="tc-kanaweakch">{x.ch}</span>
                  <span className="tc-kanaweakr">{x.r}</span>
                  <span className="tc-kanaweakmeta">{Math.round((st.correct / st.seen) * 100)}% · {avgSecs(st)} · seen {st.seen}×</span>
                </div>
              ))}
              <button className="tc-btn tc-btn-sm" onClick={() => startSession(weakest.map((w) => w.x))}>
                Drill these {weakest.length}
              </button>
            </div>
          )}
          <p className="tc-hintline">Tap a cell in Chart to drill just that one kana.</p>
        </div>
      )}
    </div>
  );
}







if (TTS_OK) {
  pickJpVoice();
  try { window.speechSynthesis.onvoiceschanged = pickJpVoice; } catch (e) {}
}





   // invalidates stale/superseded calls so a slow fallback can't play over a newer request




function SpeakBtn({ text, slow }) {
  if (!text) return null;
  return (
    <button type="button" className="tc-speakbtn" aria-label="Hear pronunciation"
      onClick={(e) => { e.stopPropagation(); ttsUnlock(); speakJa(text, slow ? 0.68 : 0.88); }}>🔊</button>
  );
}
function lineText(tokens) { return (tokens || []).map((t) => t.t || "").join(""); }

/* ── active AI helpers ── */
// hookPrompt/debriefPrompt lived here; those prompts now live in cf/src/ai.js (Worker-owned).
function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("list");
  const [active, setActive] = useState(null);
  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [saveWarn, setSaveWarn] = useState("");
  const [part, setPart] = useState("A");
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {                 // auto-speak whenever a Japanese line becomes visible
    if (view !== "rehearse" || !voiceOn || !active) return;
    const line = active.lines && active.lines[idx];
    if (!line) return;
    const mine = part !== "read" && (part === "both" || line.speaker === part);
    if (!mine || revealed) speakJa(lineText(line.tokens), slow ? 0.68 : 0.9);
    const nextLine = active.lines && active.lines[idx + 1];   // warm the cache for the next line
    if (nextLine) prefetchJa(lineText(nextLine.tokens), slow ? 0.68 : 0.9);
    return stopJa;
  }, [view, active, idx, revealed, part, voiceOn, slow]);

  useEffect(() => {
    (async () => {
      const [r, r2] = await Promise.all([sGet("jpn101:scripts"), sGet("jpn101:scripts:mirror")]);
      const parse = (x) => { try { return x ? JSON.parse(x) : []; } catch (e) { return []; } };
      let list = parse(r);
      // recover any user-added scripts from the mirror key if the main key lost them
      const ids = new Set(list.map((s) => s.id));
      let recovered = false;
      parse(r2).forEach((s) => { if (!String(s.id).startsWith("seed-") && !ids.has(s.id)) { list.push(s); ids.add(s.id); recovered = true; } });
      // retire outdated seed drills (renamed in b43) — user-added scripts are untouched
      const before = list.length;
      list = list.filter((s) => !(s.id === "seed-3-2" || (s.id === "seed-3-3" && s.name === "3-3")));
      let changed = recovered || list.length !== before;
      const names = new Set(list.map((s) => s.name));
      SCRIPT_SEED.forEach((s) => { if (!names.has(s.name)) { list = [...list, s]; changed = true; } });
      if (changed && (r || r2)) { const json = JSON.stringify(list); sSet("jpn101:scripts", json); sSet("jpn101:scripts:mirror", json); }   // never overwrite storage after failed/empty reads
      setScripts(list); setReady(true);
    })();
  }, []);

  const persist = async (list) => {
    setScripts(list);
    const json = JSON.stringify(list);
    const ok1 = await sSet("jpn101:scripts", json);
    const ok2 = await sSet("jpn101:scripts:mirror", json);
    setSaveWarn(ok1 || ok2 ? "" : "⚠️ Storage write failed — this change is only in memory and will be lost if you close the app. Keep it open, hit Backup in Stats, then add the script again.");
  };

  const localBuild = (rawText) => {
    // No-API fallback: parse "Speaker: line" format directly. No furigana/romaji,
    // but the script saves and rehearses (TTS reads the raw line).
    const out = [];
    let lastSpeaker = "A";
    rawText.split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const m = l.match(/^([^：:]{1,14})[：:]\s*(.*)$/);
      const speaker = m ? m[1].trim() : lastSpeaker;
      const text = m ? m[2].trim() : l;
      if (!text) return;
      lastSpeaker = speaker;
      out.push({ speaker, tokens: [{ t: text }], romaji: "", en: "" });
    });
    return out;
  };

  const annotateRaw = async (rawText) => {   // one call for the whole dialogue — the Worker's annotate task allows 4000 tokens, enough for a 30-line dialogue
    const { result } = await callAI("annotate", { raw: rawText });
    if (!result.lines || !result.lines.length) throw new Error("no lines in reply");
    return result.lines;
  };

  const build = async () => {
    if (!raw.trim()) return;
    setBuilding(true); setError("");
    let lines = null, annotated = false, why = "";
    if (AI_ENABLED) {
      try { lines = await annotateRaw(raw); annotated = true; }
      catch (e) { why = e.message || ""; }   // API failed → build it locally instead
    }
    if (!lines) lines = localBuild(raw);
    if (lines && lines.length) {
      const script = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || `Script ${scripts.length + 1}`, lines, raw, plain: !annotated };
      persist([...scripts, script]);
      setName(""); setRaw(""); setView("list");
      if (!annotated) setSaveWarn(AI_ENABLED
        ? "⚠️ Saved without furigana — annotation failed (" + why + "). Tap ＋ふりがな to retry."
        : "Saved as plain lines — furigana/rōmaji annotation isn't available in this build. You can still rehearse with voice.");
    } else {
      setError("Couldn't read any lines — try one line per speaker, like 「孝：スマホ。」");
    }
    setBuilding(false);
  };

  const reannotate = async (s) => {   // add furigana/romaji/translation to a script that saved without them
    if (!AI_ENABLED || !s.raw || building) return;
    setBuilding(true); setSaveWarn("");
    try {
      const lines = await annotateRaw(s.raw);
      persist(scripts.map((x) => (x.id === s.id ? { ...x, lines, plain: false } : x)));
    } catch (e) {
      setSaveWarn("⚠️ Annotation failed (" + (e.message || "unknown") + ") — the script is safe, just plain.");
    }
    setBuilding(false);
  };

  const startRehearse = (s) => { ttsUnlock(); setActive(s); setIdx(0); setRevealed(false); setPart("read"); setView("rehearse"); };
  const next = () => { setRevealed(false); setIdx((i) => i + 1); };
  const back = () => { setIdx((i) => Math.max(0, i - 1)); setRevealed(true); };

  if (!ready) return <div className="tc-empty">Loading your scripts…</div>;

  // ── NEW SCRIPT ──
  if (view === "new") {
    return (
      <div className="tc-sent">
        <div className="tc-rehhead">
          <button className="tc-btn tc-btn-sm" onClick={() => { setView("list"); setError(""); }}>← Scripts</button>
          <span className="tc-rehname">New script</span>
        </div>
        <input className="tc-sentinput" value={name} placeholder="name it — e.g. 1-14" onChange={(e) => setName(e.target.value)} />
        <textarea className="tc-sentinput" rows={8} value={raw}
          placeholder={"Paste your dialogue. Label speakers if you can:\n\nA: おはようございます。\nB: おはよう。おげんきですか。\nA: はい、げんきです。"}
          onChange={(e) => setRaw(e.target.value)} />
        {error && <div className="tc-senterr">{error}</div>}
        <div className="tc-sentbtns">
          <button className="tc-btn tc-btn-primary" onClick={build} disabled={!raw.trim() || building}>{building ? "Building…" : "Build rehearsal"}</button>
        </div>
        <p className="tc-addnote">{AI_ENABLED
          ? "Claude adds furigana, rōmaji, and a translation to each line so you can read and check yourself. Your scripts are saved here for next time."
          : "Lines are saved as plain text and rehearsed with voice — furigana/rōmaji annotation isn't available in this build. Your scripts are saved here for next time."}</p>
      </div>
    );
  }

  // ── REHEARSE ──
  if (view === "rehearse" && active) {
    const speakers = active.lines.reduce((acc, l) => (acc.includes(l.speaker) ? acc : [...acc, l.speaker]), []);
    const line = active.lines[idx];
    const mine = line && part !== "read" && (part === "both" || line.speaker === part);
    const last = idx + 1 >= active.lines.length;
    const setMode = (m) => { setPart(m); setIdx(0); setRevealed(false); };
    return (
      <div className="tc-sent">
        <div className="tc-rehhead">
          <button className="tc-btn tc-btn-sm" onClick={() => { stopJa(); setView("list"); }}>← Scripts</button>
          <span className="tc-rehname">{active.name}</span>
        </div>
        <p className="tc-ladder">Memorize ladder: ① Read it through → ② drill your part → ③ both sides from memory.</p>
        <div className="tc-sentmodes">
          <button className={"tc-segbtn" + (part === "read" ? " is-on" : "")} onClick={() => setMode("read")}>① Read</button>
          {speakers.map((sp) => (
            <button key={sp} className={"tc-segbtn" + (part === sp ? " is-on" : "")} onClick={() => setMode(sp)}>② My part: {sp}</button>
          ))}
          <button className={"tc-segbtn" + (part === "both" ? " is-on" : "")} onClick={() => setMode("both")}>③ Both sides</button>
        </div>
        {TTS_OK ? (
          <div className="tc-voicerow">
            <button className={"tc-fchip" + (voiceOn ? " is-on" : "")} onClick={() => { ttsUnlock(); setVoiceOn((v) => !v); if (voiceOn) stopJa(); }}>🔊 Voice {voiceOn ? "on" : "off"}</button>
            <button className={"tc-fchip" + (slow ? " is-on" : "")} onClick={() => setSlow((v) => !v)}>🐢 Slow</button>
          </div>
        ) : (
          <p className="tc-voicenote">This device has no speech voices available — voice playback disabled.</p>
        )}

        {idx < active.lines.length ? (
          <div className="tc-card2">
            <p className="tc-eyebrow">{line.speaker}{part === "read" ? "" : mine ? " · your line" : " · cue"} · {idx + 1}/{active.lines.length}</p>
            <p className="tc-sentgoal">{line.en}</p>
            {(!mine || revealed) ? (
              <>
                <p className="tc-sentjp"><Furigana tokens={line.tokens} /></p>
                {line.romaji && <p className="tc-sentans">{line.romaji}</p>}
              </>
            ) : (
              <p className="tc-cue">Your line — say it out loud, then check.</p>
            )}
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-sm tc-backbtn" onClick={back} disabled={idx === 0}>← Back</button>
              {TTS_OK && (!mine || revealed) && (
                <button className="tc-btn tc-btn-sm" onClick={() => { ttsUnlock(); speakJa(lineText(line.tokens), slow ? 0.68 : 0.9); }}>🔊</button>
              )}
              {(!mine || revealed) ? (
                <button className="tc-btn tc-btn-primary" onClick={next}>{last ? "Finish" : "Next line →"}</button>
              ) : (
                <button className="tc-btn tc-btn-primary" onClick={() => setRevealed(true)}>Reveal</button>
              )}
            </div>
          </div>
        ) : (
          <div className="tc-done">
            <p className="tc-eyebrow">Script complete 🎉</p>
            <div className="tc-donebtns">
              <button className="tc-btn tc-btn-primary" onClick={() => { setIdx(0); setRevealed(false); }}>Run it again</button>
              <button className="tc-btn" onClick={() => setView("list")}>Back to scripts</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LIST ──
  return (
    <div className="tc-sent">
      <div className="tc-rehhead">
        <span className="tc-rehname">Your scripts</span>
        <button className="tc-btn tc-btn-primary tc-btn-sm" onClick={() => { setView("new"); setError(""); }}>+ New script</button>
      </div>
      {saveWarn && <div className="tc-senterr">{saveWarn}</div>}
      {scripts.length === 0 ? (
        <div className="tc-sentempty">
          <p>Paste a dialogue you're rehearsing and it becomes a line-by-line, both-sides drill — with furigana over every kanji.</p>
          <button className="tc-btn tc-btn-primary" onClick={() => setView("new")}>Add your first script</button>
        </div>
      ) : (
        <ul className="tc-scriptlist">
          {scripts.map((s) => (
            <li key={s.id} className="tc-scriptrow">
              <button className="tc-scriptopen" onClick={() => startRehearse(s)}>
                <span className="tc-scriptname">{s.name}</span>
                <span className="tc-scriptmeta">{s.lines.length} lines{s.plain ? " · no furigana yet" : ""}</span>
              </button>
              {AI_ENABLED && s.plain && s.raw && (
                <button className="tc-btn tc-btn-sm" disabled={building} onClick={() => reannotate(s)}>{building ? "…" : "＋ふりがな"}</button>
              )}
              <button className="tc-del" aria-label={"Delete " + s.name} onClick={() => persist(scripts.filter((x) => x.id !== s.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Handwriting is slower than recognising or even typing a word — a correct 12s handwrite
// is roughly as confident as a correct 4.8s flip. Scaling think time before grading keeps
// Write from landing HARD on nearly everything just because forming characters takes time.
const WRITE_LATENCY_SCALE = 2.5;
function Write({ cards, onResult }) {
  /* Order by production need, not raw weakness: cards owed a production review (prodDue)
     first, then recognition-unlocked-but-weak cards, then everything else. Without this
     Write asked for production of words never even recognised, and reused the same
     weakest-first list every visit regardless of what had just been produced.
     `cards` is replaced by a new array on every grade (recordResult maps the deck), so this
     is built once per pass (mount / "Go again") rather than as a useMemo on [cards] — otherwise
     the list would reshuffle under the learner's feet mid-pass. */
  const buildOrder = useCallback(() => {
    const now = Date.now();
    const owed = cards.filter((c) => prodDue(c, now)).sort((a, b) => (a.rfsrs?.due || 0) - (b.rfsrs?.due || 0));
    const unlocked = cards.filter((c) => !prodDue(c, now) && recallUnlocked(c))
      .sort((a, b) => (a.rlevel || 0) - (b.rlevel || 0));
    const rest = cards.filter((c) => !recallUnlocked(c)).sort((a, b) => masteryScore(a) - masteryScore(b));
    return [...owed, ...unlocked, ...rest].slice(0, 20);
  }, [cards]);
  const [order, setOrder] = useState(buildOrder);
  const [pos, setPos] = useState(0);
  const goAgain = () => { setOrder(buildOrder()); setPos(0); };
  /* Writing was feeding the scheduler without ever timing the answer, so every card here
     landed as a middling grade no matter how long it took. Production recall is the
     harder direction and the more valuable signal — it deserves the same fast/slow
     distinction the flip cards get. Timed from the card appearing to the reveal. */
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
  const [guide, setGuide] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);

  const card = pos < order.length ? order[pos] : null;

  const setup = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2620";
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => { setup(); }, [pos, setup]);
  useEffect(() => {                                   // iOS: stop the page panning while drawing
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, []);
  useEffect(() => {
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  const xy = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const down = (e) => { e.preventDefault(); drawingRef.current = true; lastRef.current = xy(e); try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = xy(e), l = lastRef.current;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p;
  };
  const up = () => { drawingRef.current = false; lastRef.current = null; };

  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos]);
  const next = (got) => {
    // dir "prod": this is EN->JP production, and must land in rfsrs/rseen/rlevel, not the
    // recognition fsrs/seen/level — those track being able to READ the word, which writing
    // it from its meaning never tested. area "writing" buckets its latency norm together with
    // Study's typed-production answers (both are "produce this word", just different input).
    // Scale think time for the slower handwriting motion.
    if (card) onResult(card.id, got, "prod", thinkRef.current ? thinkRef.current / WRITE_LATENCY_SCALE : undefined, "writing");
    setRevealed(false); setGuide(false); setPos((p) => p + 1);
  };

  if (!order.length) return <div className="tc-empty"><p>Add some words first, then come here to practice writing them by hand.</p></div>;
  if (!card) return (
    <div className="tc-done">
      <p className="tc-eyebrow">Writing set complete ✍️</p>
      <div className="tc-donebtns"><button className="tc-btn tc-btn-primary" onClick={goAgain}>Go again</button></div>
    </div>
  );

  const ghostSize = Math.max(26, Math.min(120, Math.floor(360 / Math.max(1, card.term.length))));

  return (
    <div className="tc-write">
      <p className="tc-eyebrow">Write it from memory · production · {pos + 1}/{order.length}</p>
      <div className="tc-card2">
        <p className="tc-sentgoal">{card.meaning}</p>
        <div className="tc-canvaswrap">
          {guide && <div className="tc-ghost" style={{ fontSize: ghostSize + "px" }}>{card.term}</div>}
          <canvas ref={canvasRef} className="tc-canvas"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
        </div>
        <div className="tc-sentbtns tc-writetools">
          <button className="tc-btn tc-btn-sm" onClick={() => setGuide((g) => !g)}>{guide ? "Hide guide" : "Show guide"}</button>
          <button className="tc-btn tc-btn-sm" onClick={setup}>Clear</button>
          {!revealed && <button className="tc-btn tc-btn-primary" onClick={() => {
            if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
            setRevealed(true);
          }}>Reveal</button>}
        </div>
        {revealed && (
          <div className="tc-writereveal">
            <p className="tc-writeanswer">{card.term}</p>
            <p className="tc-sentans">{card.reading}{card.romaji ? " · " + card.romaji : ""}</p>
            <div className="tc-gradebtns">
              <button className="tc-btn" onClick={() => next(false)}>Missed it</button>
              <button className="tc-btn tc-btn-got" onClick={() => next(true)}>Got it</button>
            </div>
          </div>
        )}
      </div>
      <p className="tc-hintline">Write the Japanese for the meaning above — finger or stylus. Stuck? Show the guide to trace, then reveal to check.</p>
    </div>
  );
}

// how each save state reads to the user — never leave a failure looking like success
const SYNC_UI = {
  idle:    { dot: "#3ddc84", label: "Synced automatically." },
  saving:  { dot: "#ffd166", label: "Saving…" },
  saved:   { dot: "#3ddc84", label: "All changes saved to your account." },
  pending: { dot: "#ff8a7a", label: "⚠ Not saved yet — your progress is safe on this device and will upload automatically." },
};

function Browse({ cards, onRemove, onClear, onRestore }) {
  const [syncState, setSyncState] = useState(syncStateNow);
  useEffect(() => watchSyncState(setSyncState), []);
  const [showMore, setShowMore] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [backupDone, setBackupDone] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [lastBk, setLastBk] = useState(null);
  useEffect(() => { (async () => { try { const r = await sGet("jpn101:lastBackup"); setLastBk(r ? Number(r) : 0); } catch (e) { setLastBk(0); } })(); }, []);

  const doBackup = async () => {
    let kana = null, scripts = null, freq = null, days = null, hooks = null, quota = null;
    try { const k = await sGet("jpn101:kana"); if (k) kana = JSON.parse(k); } catch (e) {}
    try { const sc = await sGet("jpn101:scripts"); if (sc) scripts = JSON.parse(sc); } catch (e) {}
    try { const f = await sGet("jpn101:freq"); if (f) freq = JSON.parse(f); } catch (e) {}
    try { const d = await sGet("jpn101:days"); if (d) days = JSON.parse(d); } catch (e) {}
    try { const h = await sGet("jpn101:hooks"); if (h) hooks = JSON.parse(h); } catch (e) {}
    try { quota = await sGet("jpn101:freqQuota"); } catch (e) {}
    let oral = null;
    try { const or = await sGet("jpn101:oralAttempts"); if (or) oral = JSON.parse(or); } catch (e) {}
    const blob = JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), deck: cards, kana, scripts, freq, days, hooks, quota, oral });
    // save a real file too — clipboard is convenient, a file is permanent
    try {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-backup-" + localDayKey() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { await navigator.clipboard.writeText(blob); } catch (e) { setRestoreMsg("Clipboard blocked — but your backup FILE downloaded fine. You can also long-press and copy:"); setShowRestore(true); setRestoreText(blob); }
    sSet("jpn101:lastBackup", String(Date.now())); setLastBk(Date.now());
    setBackupDone(true); setTimeout(() => setBackupDone(false), 2200);
  };
  const doRestore = async () => {
    try {
      const o = JSON.parse(restoreText.trim());
      if (o && o.app === "tangocho-pack") {          // update pack: ADD content, keep all progress
        const have = new Set(cards.map((c) => c.term));
        const maxLesson = cards.reduce((m, c) => Math.max(m, c.lesson || 0), 0);
        const fresh = (o.words || []).filter((w) => w && w.term && !have.has(w.term)).map((w, i) => ({
          id: "p" + Date.now() + "-" + i,
          term: w.term, reading: w.reading || w.term, romaji: w.romaji || "", meaning: w.meaning || "",
          kind: w.kind || "mixed", emoji: w.emoji || "", lesson: w.lesson || maxLesson + 1, sec: w.sec,
          seen: 0, correct: 0, level: 0, streak: 0,
        }));
        if (fresh.length) await onRestore([...cards, ...fresh]);
        let addedScripts = 0;
        if (Array.isArray(o.scripts) && o.scripts.length) {
          let list = [];
          try { const r = await sGet("jpn101:scripts"); if (r) list = JSON.parse(r) || []; } catch (e) {}
          const names = new Set(list.map((x) => x.name));
          o.scripts.forEach((sc) => { if (sc && sc.name && !names.has(sc.name)) { list.push(sc); addedScripts++; } });
          if (addedScripts) await sSet("jpn101:scripts", JSON.stringify(list));
        }
        setRestoreMsg("Pack applied ✓ — added " + fresh.length + " words" + (addedScripts ? " and " + addedScripts + " script" + (addedScripts > 1 ? "s" : "") : "") + ". Your progress is untouched.");
        setRestoreText("");
        return;
      }
      if (!o || o.app !== "tangocho" || !Array.isArray(o.deck)) { setRestoreMsg("That doesn't look like a 単語帳 backup or update pack."); return; }
      if (o.kana) await sSet("jpn101:kana", JSON.stringify(o.kana));
      if (o.scripts) await sSet("jpn101:scripts", JSON.stringify(o.scripts));
      if (o.hooks) await sSet("jpn101:hooks", JSON.stringify(o.hooks));
      if (o.quota) await sSet("jpn101:freqQuota", String(o.quota));
      if (o.oral) await sSet("jpn101:oralAttempts", JSON.stringify(o.oral));
      /* Frequency-list progress. A backup taken before the 10k tab was retired holds an
         ARRAY of full records; one taken since holds a map keyed by term. Both are
         accepted, because refusing the old shape would silently drop every frequency word
         the learner had studied. The words themselves are not restored from the backup —
         freq.json ships all ten thousand, so a backup only needs to carry the progress. */
      if (o.freq) {
        const merged = { ...freqStatsFrom(o.freq) };
        try { Object.assign(merged, freqStatsFrom(JSON.parse((await sGet("jpn101:freq")) || "null"))); } catch (e) {}
        await sSet("jpn101:freq", JSON.stringify(merged));
      }
      if (o.days) {
        // merge day-by-day; keep whichever record shows more reviews for that date
        let cur = {};
        try { const r = await sGet("jpn101:days"); if (r) cur = JSON.parse(r) || {}; } catch (e) {}
        Object.entries(o.days).forEach(([k, v]) => { if (!cur[k] || (v.rev || 0) > (cur[k].rev || 0)) cur[k] = v; });
        await sSet("jpn101:days", JSON.stringify(cur));
        _days = cur;
      }
      // keep any seed words the backup predates (e.g. scenes added after the backup was taken)
      const merged = [...o.deck];
      const haveKeys = new Set(merged.map(cardMergeKey));
      let addedFromSeed = 0;
      SEED.forEach((s) => {
        const k = cardMergeKey(s);
        if (!haveKeys.has(k)) { merged.push({ id: uid(), seen: 0, correct: 0, ...s }); haveKeys.add(k); addedFromSeed++; }
      });
      await onRestore(merged);
      setRestoreMsg("Restored ✓ — " + o.deck.length + " words with their stats" + (o.kana ? ", kana progress" : "") + (o.scripts ? ", scripts" : "") + (addedFromSeed ? ", plus " + addedFromSeed + " newer course words kept" : "") + ". (Backup from " + (o.date || "?").slice(0, 10) + ")");
      setRestoreText("");
    } catch (e) { setRestoreMsg("Couldn't read that backup: " + e.message); }
  };

  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");   // all | review | new | mastered
  const [sortWeak, setSortWeak] = useState(true);

  const [googleEmail, setGoogleEmail] = useState(() => _googleEmail);
  const [authState, setAuthStateUi] = useState(authStateNow);
  useEffect(() => watchAuthState((s) => { setAuthStateUi(s); setGoogleEmail(_googleEmail); }), []);
  const googleBtnRef = useRef(null);
  useEffect(() => {
    if (!googleEmail) renderGoogleButton(googleBtnRef.current);
    return initGoogleAuth(() => setGoogleEmail(_googleEmail));   // returns unsubscribe — effect cleanup
  }, [googleEmail]);

  const summary = useMemo(() => {
    let mastered = 0, need = 0, fresh = 0;
    cards.forEach((c) => {
      if (!(c.seen > 0)) fresh++;
      else if ((c.level || 0) >= 4) mastered++;
      else need++;
    });
    return { mastered, need, fresh, total: cards.length };
  }, [cards]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = cards;
    if (t) list = list.filter((c) => [c.term, c.reading, c.romaji, c.meaning].some((f) => (f || "").toLowerCase().includes(t)));
    if (filter === "new") list = list.filter((c) => !(c.seen > 0));
    else if (filter === "mastered") list = list.filter((c) => c.seen > 0 && (c.level || 0) >= 4);
    else if (filter === "review") list = list.filter((c) => c.seen > 0 && (c.level || 0) < 4);
    if (sortWeak) list = list.slice().sort((a, b) => (a.seen > 0 ? masteryScore(a) : 99) - (b.seen > 0 ? masteryScore(b) : 99));
    return list;
  }, [cards, q, filter, sortWeak]);

  const exportText = useCallback(() => {
    const tsv = cards.map((c) => [c.term, c.reading, c.romaji, c.meaning, c.emoji || ""].join("\t")).join("\n");
    navigator.clipboard?.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  }, [cards]);

  return (
    <div className="tc-browse">
      <div className="tc-summary">
        <div className="tc-sumitem"><b>{summary.total}</b><span>words</span></div>
        <div className="tc-sumitem tc-sum-good"><b>{summary.mastered}</b><span>mastered</span></div>
        <div className="tc-sumitem tc-sum-need"><b>{summary.need}</b><span>need work</span></div>
        <div className="tc-sumitem tc-sum-new"><b>{summary.fresh}</b><span>untouched</span></div>
      </div>

      <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <p style={{ margin: "0 0 6px", fontWeight: 600 }}>🔄 Sync across your devices</p>
        {googleEmail ? (
          <>
            <p style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SYNC_UI[syncState].dot, display: "inline-block", boxShadow: "0 0 6px " + SYNC_UI[syncState].dot }} />
              Signed in as <b>{googleEmail}</b>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: SYNC_UI[syncState].dot }}>
              {SYNC_UI[syncState].label}
            </p>
            {syncState === "pending" && (
              <button className="tc-btn tc-btn-sm" style={{ marginTop: 8 }} onClick={() => pushCloudNow()}>Retry now</button>
            )}
            <button className="tc-btn tc-btn-sm" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => { signOutGoogle(); }}>Sign out</button>
          </>
        ) : (
          <>
            {authState === "expired" && (
              <p className="tc-conjnote" style={{ marginTop: 0 }}>
                ⚠ Your sign-in expired — sign in again to keep syncing. Nothing on this device is lost{hasSyncPending() ? ", and unsaved progress will upload as soon as you do" : ""}.
              </p>
            )}
            <p style={{ margin: "0 0 8px", fontSize: 12.5, opacity: .7 }}>Sign in once per device to keep your progress synced everywhere.</p>
            <div ref={googleBtnRef} style={{ marginBottom: 4 }} />
          </>
        )}
      </div>

      <div className="tc-browsebar">
        <input className="tc-search" placeholder="Search words…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="tc-btn tc-btn-sm" onClick={() => setShowMore((v) => !v)}>{showMore ? "Less ⌃" : "More ⌄"}</button>
      </div>

      {showMore && (
        <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          {lastBk !== null && Date.now() - lastBk > 7 * 86400000 && (
            <p className="tc-conjnote" style={{ marginTop: 0 }}>💾 {lastBk ? "Last backup was " + Math.floor((Date.now() - lastBk) / 86400000) + " days ago" : "No backup yet on this device"} — a backup file has everything: both decks, all stats, think-times, scripts, and exam history.</p>
          )}
          <div className="tc-browsebar" style={{ marginBottom: 0 }}>
            <button className="tc-btn tc-btn-sm" onClick={exportText} disabled={!cards.length}>{copied ? "Copied!" : "Export"}</button>
            <button className="tc-btn tc-btn-sm" onClick={doBackup} disabled={!cards.length}>{backupDone ? "Backed up ✓" : "💾 Backup"}</button>
            <button className="tc-btn tc-btn-sm" onClick={() => { setShowRestore((v) => !v); setRestoreMsg(""); }}>Restore</button>
            {!confirm ? (
              <button className="tc-btn tc-btn-sm tc-btn-danger" onClick={() => setConfirm(true)} disabled={!cards.length}>Clear all</button>
            ) : (
              <span className="tc-confirm">
                Delete everything?
                <button className="tc-btn tc-btn-sm tc-btn-danger" onClick={() => { onClear(); setConfirm(false); }}>Yes</button>
                <button className="tc-btn tc-btn-sm" onClick={() => setConfirm(false)}>No</button>
              </span>
            )}
          </div>

          {showRestore && (
            <div className="tc-restore">
              <p className="tc-restorehint">Paste a 💾 backup (replaces everything) or an update pack from Claude (adds new words & scripts — progress untouched), then Apply.</p>
              <textarea className="tc-restorebox" value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder='{"app":"tangocho", ...}' />
              <div className="tc-restorebtns">
                <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={doRestore} disabled={!restoreText.trim()}>Apply backup</button>
                <button className="tc-btn tc-btn-sm" onClick={() => { setShowRestore(false); setRestoreMsg(""); }}>Close</button>
              </div>
              {restoreMsg && <p className="tc-restoremsg">{restoreMsg}</p>}
            </div>
          )}
          {!showRestore && restoreMsg && <p className="tc-restoremsg">{restoreMsg}</p>}
        </div>
      )}
      <div className="tc-filters">
        {[["all", "All"], ["review", "Needs work"], ["new", "Untouched"], ["mastered", "Mastered"]].map(([id, label]) => (
          <button key={id} className={"tc-fchip" + (filter === id ? " is-on" : "")} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <button className={"tc-fchip tc-fchip-sort" + (sortWeak ? " is-on" : "")} onClick={() => setSortWeak((v) => !v)}>{sortWeak ? "Weakest first ↓" : "By lesson"}</button>
      </div>

      {shown.length === 0 ? (
        <div className="tc-empty">{cards.length === 0 ? "No words yet." : "No matches."}</div>
      ) : (
        <ul className="tc-list">
          {shown.map((c) => {
            const seen = c.seen || 0, correct = c.correct || 0, lvl = Math.min(5, c.level || 0);
            const pct = seen ? Math.round((correct / seen) * 100) : 0;
            const needs = seen > 0 && (lvl < 2 || correct / seen < 0.5);
            return (
              <li key={c.id} className="tc-prow">
                <div className="tc-prow-top">
                  <span className="tc-rowterm">{c.emoji ? c.emoji + " " : ""}{c.term}</span>
                  <span className="tc-rowread">{c.reading}<em>{c.romaji}</em></span>
                  <button className="tc-del" aria-label={"Delete " + c.term} onClick={() => onRemove(c.id)}>✕</button>
                </div>
                <div className="tc-prow-mean">{c.meaning}</div>
                <div className="tc-prow-stats">
                  <div className="tc-meter" title={"Mastery " + lvl + "/5"} aria-label={"Mastery " + lvl + " of 5"}>
                    {[0, 1, 2, 3, 4].map((i) => <span key={i} className={"tc-seg" + (i < lvl ? " on" : "")} />)}
                  </div>
                  <span className="tc-prow-num">{seen ? `seen ${seen} · ✓ ${correct} (${pct}%)` : "not studied yet"}</span>
                  {isLeech(c) ? <span className="tc-leechpill">🩹 stuck</span> : needs ? <span className="tc-needpill">needs review</span> : null}
                  {!isLeech(c) && seen > 0 && lvl >= 4 && correct / seen >= 0.5 && <span className="tc-donepill">solid</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────── ADD ───────────────────────────── */
function Add({ onAdd, count }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const parse = useCallback(() => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const parts = (line.includes("\t") ? line.split("\t") : line.split(",")).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const term = parts[0], reading = parts[1] || parts[0], romaji = parts[2] || "";
      const rest = parts.slice(3);
      let emoji = "";
      if (rest.length && isEmoji(rest[rest.length - 1])) emoji = rest.pop();
      const meaning = rest.join(", ");
      out.push({ term, reading, romaji, meaning, emoji, kind: detectKind(term) });
    }
    if (out.length === 0) { setMsg("Couldn't read any rows — check the format below."); return; }
    onAdd(out);
    setMsg(`Added ${out.length} word${out.length > 1 ? "s" : ""}. Deck now has ${count + out.length}.`);
    setText("");
  }, [text, onAdd, count]);

  return (
    <div className="tc-add">
      <p className="tc-eyebrow">Add words</p>
      <p className="tc-addhelp">
        One word per line, fields split by comma or tab:
        <code>term, reading, rōmaji, meaning, 📷</code>
        The picture emoji at the end is optional.
      </p>
      <textarea className="tc-textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"先生, せんせい, sensei, teacher, 👩‍🏫\n犬, いぬ, inu, dog, 🐶"} />
      <div className="tc-addrow">
        <button className="tc-btn tc-btn-primary" onClick={parse} disabled={!text.trim()}>Add to deck</button>
        {msg && <span className="tc-addmsg">{msg}</span>}
      </div>
      <p className="tc-addnote">Easiest path: paste your class notes to Claude and I'll clean them up and load them for you. This box is here for quick one-offs.</p>
    </div>
  );
}

/* ───────────────────────────── STYLES ───────────────────────────── */
/* ─────────────────────────── CONJ DRILL ───────────────────────────
   Negative-form drill: ichidan (①), godan (⑤), irregular verbs,
   い-adjectives, and nouns/な-adjectives. Rules per sensei's board:
   ① drop る + ない · ⑤ shift to "a" row + ない · Adj: 〜い → くない ·
   Noun/なAdj: + じゃない · Polite: ます→ません OR ない+です      */




/* ═══════════════════ 入力 / INPUT — comprehensible input finder ═══════════════════
   The job here is volume: remove every second of friction between "I have time" and
   "I am consuming Japanese". Two taps to something at roughly 85-90% comprehension.

   Difficulty is 0-100: 0-15 absolute-beginner CI (slow, gestures, pictures) · 15-30 N5 ·
   30-45 N4 · 45-60 N3 · 60-75 N2 · 75-100 native unmodified.

   Every source below was checked live before being baked in. Casualties, for the record:
   "Bitesize Japanese" turned out to be a channel about 1971 Johnson outboard motors,
   Wasabi and Teppei&Noriko are gone, the 4989 feed 404s, and the naive way of scraping a
   YouTube channel id off its page silently returns the id of a *recommended* channel —
   which is how Onomappu first resolved to a Polish travel vlog. Ids below come from each
   page's own RSS autodiscovery link and were confirmed against the feed's author name. */
const INPUT_KEY = "jpn101:input";
// Same shape as the sync/TTS endpoints so one build runs on either host.
const FEED_ENDPOINT = "/.netlify/functions/feed";

/* ── the indexed video library ──
   ~950 individual videos across 35 channels, built by tools/yt-index.mjs and shipped as a
   separate asset. Each becomes an ordinary catalog entry, so the recommender and the
   rating engine need no special case: a video is just a source that happens to already be
   one specific thing. Cached in localStorage keyed on the index's build time, so a
   refreshed index replaces the old one and an unchanged one costs no network at all.

   Difficulty on these rows is ESTIMATED, not measured — YouTube does not expose subtitle
   text (see tools/yt-index.mjs). Every row carries its own confidence, which feeds the
   same damping the rest of the engine uses, so low-confidence guesses move fast once
   they're rated and high-confidence ones hold their ground. */
const VIDEOS_URL = "/videos.json";
const VIDEOS_CACHE = "jpn101:videoIndex";
let _videoPromise = null;
function loadVideoIndex() {
  if (_videoPromise) return _videoPromise;
  _videoPromise = (async () => {
    let cached = null;
    try { cached = JSON.parse(window.localStorage.getItem(VIDEOS_CACHE) || "null"); } catch (e) {}
    try {
      const r = await fetch(VIDEOS_URL, { cache: "no-cache" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const data = await r.json();
        if (data && data.videos) {
          try { window.localStorage.setItem(VIDEOS_CACHE, JSON.stringify(data)); } catch (e) { /* quota */ }
          return unpackVideos(data);
        }
      }
    } catch (e) { /* offline — the cached copy below is the point */ }
    return cached ? unpackVideos(cached) : [];
  })();
  return _videoPromise;
}




/* Level engine. Ratings move the user's level and the item's difficulty in opposite
   directions, scaled by how much was actually consumed (bailing after 90s is weak
   evidence; 40 minutes is strong), with a decaying learning rate so the level settles
   instead of oscillating. Listening and reading never share updates. */














/* Vocab coverage. Deliberately NOT kuromoji: it needs ~15MB of dictionary files fetched
   at runtime, which would break the "works with zero network calls" requirement and the
   single-file build. Longest-match against the actual deck is also a closer match to the
   question being asked — "how many of these words do I already have" — than morphological
   tokenisation would be. */






/* ───────────────────────────── 入力 / INPUT ─────────────────────────────
   Comprehensible input: the tab answers "what should I watch or read right now"
   and then learns from the answer. Deliberately shows no raw difficulty numbers —
   a number invites arguing with it, dots just say "harder than you / about right". */
/* Every control is labelled in English first with the Japanese underneath. The tab is
   about Japanese, not written in it — a button you can't read is a button you don't press. */
const Bi = ({ en, ja }) => <span className="tc-bi">{en}<small>{ja}</small></span>;






const MEDIUM_CHIP = { video: "📺", audio: "🎧", reading: "📖" };



function Input({ cards, onAdd, onPark }) {
  const [st, setSt] = useState(null);
  const [plan, setPlan] = useState("listen");
  const [minutes, setMinutes] = useState(15);
  const [seed, setSeed] = useState(1);
  const [picks, setPicks] = useState(null);
  const [panel, setPanel] = useState("");        // "" | log | link | cover
  const [logText, setLogText] = useState("");
  const [logMin, setLogMin] = useState(15);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [coverText, setCoverText] = useState("");
  const [lexicon, setLexicon] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [mineMsg, setMineMsg] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  /* The frequency list doubles as the dictionary. It already ships with the app, so mining
     costs no network call and no API key — the whole feature works offline. */
  useEffect(() => { loadFreqLexicon().then(setLexicon).catch(() => setLexicon(new Map())); }, []);
  const [note, setNote] = useState("");

  useEffect(() => { (async () => {
    let o = null;
    try { const r = await sGet(INPUT_KEY); if (r) o = JSON.parse(r); } catch (e) {}
    if (!o || !o.levels) o = blankInput(cards);
    else o.levels = fuseLevels(o.levels, cards);
    o.pending = o.pending || []; o.history = o.history || []; o.custom = o.custom || [];
    o.items = o.items || {}; o.tagScores = o.tagScores || {}; o.hidden = o.hidden || [];
    o.counts = o.counts || { listening: 0, reading: 0 };
    stRef.current = o;
    setSt(o);
  })(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Writes go through the ref, not through `st`. Two taps in the same tick both close
     over the same render's state, so the second silently discards the first — which for a
     pending rating means the thing you just opened never gets rated. Accepts an updater
     so every call site sees the newest state. */
  const stRef = useRef(null);
  const save = useCallback((next) => {
    const value = typeof next === "function" ? next(stRef.current) : next;
    stRef.current = value;
    setSt(value);
    sSet(INPUT_KEY, JSON.stringify(value));
  }, []);
  // Catches deck growth that happens WHILE this tab is open (cards can still be arriving
  // from a cloud pull on first load) — the load effect above only fuses once, at mount.
  // Guarded to only write when a level actually moved, so this can't loop against itself.
  useEffect(() => {
    if (!stRef.current || !cards.length) return;
    const fused = fuseLevels(stRef.current.levels, cards);
    if (Math.abs(fused.listening - stRef.current.levels.listening) >= 0.05
     || Math.abs(fused.reading - stRef.current.levels.reading) >= 0.05) {
      save((s0) => ({ ...s0, levels: fused }));
    }
  }, [cards.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const flash = (m) => { setNote(m); setTimeout(() => setNote((v) => (v === m ? "" : v)), 2600); };

  const cfg = INPUT_PLANS.find((p) => p.id === plan);
  const [videos, setVideos] = useState([]);
  useEffect(() => { loadVideoIndex().then(setVideos); }, []);

  // catalog with whatever we've learned about each item layered on top of the seed
  const catalog = useMemo(() => {
    if (!st) return [];
    return [...INPUT_CATALOG, ...videos, ...st.custom]
      .filter((it) => !st.hidden.includes(it.id))
      .map((it) => {
        const o = st.items[it.id];
        return o ? { ...it, difficulty: o.difficulty, difficultyConfidence: o.confidence } : it;
      });
  }, [st, videos]);

  const level = st ? st.levels[cfg.medium] : 0;

  /* Resolve each recommended source down to one actual episode or article. A link to a
     channel just hands the searching back to you, which was the whole thing this tab was
     supposed to take off your plate. Feeds come through our own Worker because none of
     these sites send CORS headers. If a feed is down the source still opens as before,
     so a dead feed degrades to the old behaviour rather than an error. */
  const [loading, setLoading] = useState(false);
  const seenUrls = useMemo(() => new Set((st?.history || []).map((h) => h.url).filter(Boolean)), [st]);

  const suggest = useCallback(async () => {
    const sources = recommend({
      catalog, level, mode: cfg.mode, medium: cfg.medium, minutes,
      history: st.history, tagScores: st.tagScores, seed, preferred: FEED_SOURCES,
    });
    // An indexed video already IS one specific thing — there's nothing to look up, so it
    // resolves immediately and never shows the "finding an episode…" state.
    const resolved = (s) => (s.indexed
      ? { source: s, item: { title: s.title, url: s.url, at: s.publishedAt, sec: s.durationSec } }
      : { source: s, item: null });

    setLoading(true);
    setPicks(sources.map(resolved));
    if (sources.every((s) => s.indexed)) { setLoading(false); return; }

    let feeds = {};
    try {
      const ids = sources.map((s) => s.id).filter((id) => FEED_SOURCES.has(id));
      if (ids.length) {
        const r = await fetch(FEED_ENDPOINT + "?src=" + ids.join(",") + "&n=20&dur=1", { cache: "no-store" });
        // Check the type: a cache or proxy serving the app's own HTML under this URL would
        // otherwise throw inside r.json() and look identical to "every feed is down".
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) feeds = (await r.json()).feeds || {};
      }
    } catch (e) { /* offline or feed down — fall through to the source link */ }
    const budget = minutes * 60 * 1.25;      // a little over is fine; double is not
    setPicks(sources.map((s, i) => {
      if (s.indexed) return resolved(s);
      const list = (feeds[s.id] || []).filter((x) => !seenUrls.has(x.url));
      // Prefer episodes whose real length fits the time asked for. Unknown lengths are
      // allowed through rather than discarded — better an unlabelled 12-minute video than
      // nothing — but anything known to blow the budget is dropped.
      // Shorts fit any budget and teach nothing. Length is the reliable test, but it isn't
      // always available (see ytDurations in the Worker), so fall back to the tag creators
      // put in the title themselves.
      const isShort = (x) => /#shorts?/i.test(x.title) || (x.sec && x.sec < 60);
      const fits = list.filter((x) => !isShort(x) && (!x.sec || x.sec <= budget));
      const pool = fits.length ? fits : list;
      // vary by seed so a reroll moves through the feed instead of re-offering episode 1
      const item = pool.length ? pool[(seed * 3 + i * 7) % pool.length] : null;
      return { source: s, item };
    }));
    setLoading(false);
  }, [catalog, level, cfg, minutes, st, seed, seenUrls]);

  const reroll = () => setSeed((s) => s + 7);
  useEffect(() => { setPicks(null); }, [plan, minutes]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (st) suggest();
  }, [seed]);   // eslint-disable-line react-hooks/exhaustive-deps

  // opening something creates a pending rating that survives a reload — the rating is
  // the only thing that teaches the engine, so it must not evaporate when the tab closes
  // The rating still teaches the SOURCE (itemId), because that's what has a difficulty
  // worth learning; the episode title and url ride along so the rating row and the log
  // name the thing you actually watched.
  const open = (pick) => {
    const s = pick.source, ep = pick.item;
    const entry = { itemId: s.id, at: Date.now(), medium: cfg.medium, mode: cfg.mode, minutes,
                    title: ep ? ep.title : s.title, source: s.title, url: ep ? ep.url : s.url };
    save((s0) => ({ ...s0, pending: [entry, ...s0.pending.filter((p) => p.url !== entry.url)].slice(0, 6) }));
    try { window.open(entry.url, "_blank", "noopener,noreferrer"); } catch (e) {}
  };

  const rate = (entry, verdict) => {
    const med = entry.medium;
    const it = catalog.find((x) => x.id === entry.itemId);
    let before = 0, after = 0;
    save((s0) => {
      before = s0.levels[med];
      const cur = s0.items[entry.itemId] || { difficulty: it ? it.difficulty : s0.levels[med], confidence: it ? (it.difficultyConfidence || 0.3) : 0.2, ratings: 0 };
      // `rated` is the pure rating walk (see fuseLevels); ratings move it directly, never
      // the fused/floored level, or a rising deck floor would double-count on top of itself.
      const rated0 = s0.levels.rated || { listening: s0.levels.listening, reading: s0.levels.reading };
      const recent = s0.history.filter((h) => h.medium === med).map((h) => h.verdict);
      const r = applyRating({
        level: rated0[med], ratingCount: s0.counts[med] || 0,
        itemDifficulty: cur.difficulty, itemConfidence: cur.confidence,
        verdict, minutes: entry.minutes, recent,
      });
      const tagScores = { ...s0.tagScores };
      if (it && verdict !== "lost") {
        const bump = verdict === "just_right" ? 1 : verdict === "too_easy" ? 0.2 : -0.3;
        (it.tags || []).forEach((t) => { tagScores[t] = Math.round(((tagScores[t] || 0) + bump) * 10) / 10; });
      }
      const levels = fuseLevels({ ...s0.levels, rated: { ...rated0, [med]: r.level }, updatedAt: Date.now() }, cards);
      after = levels[med];
      return {
        ...s0,
        levels,
        counts: { ...s0.counts, [med]: r.ratingCount },
        items: { ...s0.items, [entry.itemId]: { difficulty: r.itemDifficulty, confidence: r.itemConfidence, ratings: (cur.ratings || 0) + 1 } },
        history: [{ ...entry, verdict, ratedAt: Date.now() }, ...s0.history].slice(0, 400),
        pending: s0.pending.filter((p) => !(p.itemId === entry.itemId && p.at === entry.at)),
        tagScores,
      };
    });
    flash(`${med === "reading" ? "Reading" : "Listening"} ${Math.round(before)} → ${Math.round(after)}`);
  };
  const dismiss = (entry) => save((s0) => ({ ...s0, pending: s0.pending.filter((p) => !(p.itemId === entry.itemId && p.at === entry.at)) }));

  const logOffline = (verdict) => {
    const title = logText.trim();
    if (!title) return;
    const entry = { itemId: "offline:" + title.slice(0, 40), at: Date.now(), medium: cfg.medium,
                    mode: cfg.mode, minutes: logMin, title, offline: true };
    save((s0) => {
      const rated0 = s0.levels.rated || { listening: s0.levels.listening, reading: s0.levels.reading };
      const recent = s0.history.filter((h) => h.medium === cfg.medium).map((h) => h.verdict);
      const r = applyRating({ level: rated0[cfg.medium], ratingCount: s0.counts[cfg.medium] || 0,
                              itemDifficulty: rated0[cfg.medium], itemConfidence: 0, verdict, minutes: logMin, recent });
      const levels = fuseLevels({ ...s0.levels, rated: { ...rated0, [cfg.medium]: r.level }, updatedAt: Date.now() }, cards);
      return { ...s0,
        levels,
        counts: { ...s0.counts, [cfg.medium]: r.ratingCount },
        history: [{ ...entry, verdict, ratedAt: Date.now() }, ...s0.history].slice(0, 400),
      };
    });
    setLogText(""); setPanel(""); flash("Logged " + logMin + " min");
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//.test(url)) { flash("Needs to start with http:// or https://"); return; }
    const it = {
      id: "user-" + Math.abs(Array.from(url).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36),
      title: linkTitle.trim() || url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48),
      medium: cfg.medium === "reading" ? "reading" : "video", source: "web", url,
      difficulty: level, difficultyConfidence: 0.15, tags: ["mine"], addedBy: "user", addedAt: Date.now(),
    };
    save((s0) => ({ ...s0, custom: [it, ...s0.custom.filter((c) => c.url !== url)] }));
    setLinkUrl(""); setLinkTitle(""); setPanel(""); setPicks(null);
    flash("Added to your sources");
  };

  const coverage = useMemo(() => (coverText.trim() ? coverageAgainstDeck(coverText, cards) : null), [coverText, cards]);

  /* What is worth keeping out of this text. Runs the app's own coverage scanner sentence by
     sentence, so every candidate arrives with the sentence it appeared in. */
  const mined = useMemo(() => {
    if (!coverText.trim() || !lexicon) return null;
    const known = new Set(cards.map((c) => c.term));
    return mine(coverText, {
      lexicon,
      known,
      unknownOf: (sentence) => coverageAgainstDeck(sentence, cards).unknown.map((u) => u.w),
    });
  }, [coverText, cards, lexicon]);

  /* Named for what it is, because Input already has a "plan" — the study plan. */
  const parkPlan = useMemo(() => displacementPlan(cards, picked.size), [cards, picked.size]);

  const keepPicked = useCallback(() => {
    if (!mined || !picked.size) return;
    const chosen = mined.candidates.filter((c) => picked.has(c.term));
    onAdd(chosen.map((c) => cardFor(c, { label: sourceLabel.trim() })));
    onPark(parkPlan.park);
    setMineMsg(describePlan(chosen.length, parkPlan));
    setPicked(new Set());
  }, [mined, picked, parkPlan, onAdd, onPark, sourceLabel]);

  const week = useMemo(() => {
    if (!st) return { mins: 0, byDay: [], items: [] };
    const cut = Date.now() - 7 * 86400000;
    const rows = st.history.filter((h) => h.at >= cut);
    const byDay = {};
    rows.forEach((h) => { const d = localDayKey(h.at); byDay[d] = (byDay[d] || 0) + (h.minutes || 0); });
    return { mins: rows.reduce((n, h) => n + (h.minutes || 0), 0), rows,
             byDay: Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
  }, [st]);

  const exportWeek = () => {
    const lines = [
      "TANGOCHO — 入力ログ / immersion log",
      localDayKey(Date.now() - 7 * 86400000) + " → " + localDayKey(),
      "",
      `total: ${week.mins} min over ${week.rows.length} session(s)`,
      `listening: ${bandName(st.levels.listening)} · reading: ${bandName(st.levels.reading)}`,
      "",
      ...week.byDay.map(([d, m]) => `  ${d}   ${m} min`),
      "",
      "detail:",
      ...week.rows.map((h) => `  ${localDayKey(h.at)}  ${String(h.minutes).padStart(3)}m  ${h.medium === "reading" ? "読" : "聞"}  ${INPUT_VERDICTS[h.verdict] ? INPUT_VERDICTS[h.verdict].en : "-"}  ${h.title}`),
    ].join("\n");
    try {
      const url = URL.createObjectURL(new Blob([lines], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-input-" + localDayKey() + ".txt";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { navigator.clipboard.writeText(lines); } catch (e) {}
    flash("Downloaded and copied to the clipboard");
  };

  if (!st) return <div className="tc-empty">Loading…</div>;

  return (
    <div className="tc-input">
      {st.pending.length > 0 && (
        <div className="tc-inrate">
          <p className="tc-eyebrow">How was it? · どうだった？</p>
          {st.pending.map((p) => (
            <div key={p.itemId + p.at} className="tc-inrateitem">
              <div className="tc-inraterow1">
                <span className="tc-inratetitle">{p.title}</span>
                <button className="tc-inx" onClick={() => dismiss(p)} aria-label="dismiss">×</button>
              </div>
              <div className="tc-inverdicts">
                {Object.entries(INPUT_VERDICTS).map(([k, v]) => (
                  <button key={k} className="tc-fchip" onClick={() => rate(p, k)}><Bi en={v.en} ja={v.ja} /></button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="tc-inlevels">
        {[["listening", "Listening", "聞く"], ["reading", "Reading", "読む"]].map(([m, en, ja]) => (
          <div key={m} className="tc-inlevel">
            <span className="tc-inlevlabel">{en} <i>{ja}</i></span>
            <div className="tc-inbar"><div className="tc-inbarfill" style={{ width: `${st.levels[m]}%` }} /></div>
            <span className="tc-inband">{band(st.levels[m])[0]} <i>{band(st.levels[m])[1]}</i></span>
          </div>
        ))}
      </div>

      <div className="tc-kanaseg">
        {INPUT_PLANS.map((p) => (
          <button key={p.id} className={"tc-fchip" + (plan === p.id ? " is-on" : "")} onClick={() => setPlan(p.id)}><Bi en={p.label} ja={p.ja} /></button>
        ))}
      </div>
      <div className="tc-kanaseg tc-kanalen">
        <span className="tc-kanalenlabel">Time</span>
        {INPUT_TIMES.map((n) => (
          <button key={n} className={"tc-fchip" + (minutes === n ? " is-on" : "")} onClick={() => setMinutes(n)}>{n === 60 ? "60+" : n} min</button>
        ))}
      </div>

      {!picks ? (
        <button className="tc-btn tc-btn-primary tc-start" onClick={suggest}>
          {cfg.mode === "passive" ? "Find something to have on" : "Show me 3 things"} · {minutes} min
        </button>
      ) : (
        <>
          <div className="tc-inpicks">
            {picks.length === 0 && <p className="tc-smarthint">Nothing left at this level that you haven't opened in the last two weeks. Reroll or add a link of your own.</p>}
            {picks.map(({ source: it, item }, idx) => {
              const d = relDots(it.difficulty, level);
              const mins = it.durationSec ? Math.round(it.durationSec / 60) : null;
              return (
                <div key={it.id} className="tc-card2 tc-inpick">
                  <div className="tc-inpicktop">
                    <span className="tc-kindchip">{MEDIUM_CHIP[it.medium] || "📖"}</span>
                    <span className="tc-indots" title={d.label}>
                      {[1, 2, 3, 4].map((i) => <i key={i} className={"tc-indot" + (i <= d.n ? " is-on" : "")} />)}
                    </span>
                    <span className="tc-indotlabel">{d.label}</span>
                  </div>
                  {item ? (
                    <>
                      <p className="tc-inpicktitle">{item.title}</p>
                      <p className="tc-inpickmeta">
                        {/* for an indexed video the source IS the item, so name the
                            channel here instead of repeating the title back */}
                        {it.indexed ? it.channel : it.title}
                        {item.at ? " · " + agoLabel(item.at) : ""}
                        {/* only claim a length when it's this episode's, not the channel's average */}
                        {item.sec ? ` · ${Math.max(1, Math.round(item.sec / 60))} min` : ""}
                        {it.hasFurigana ? " · furigana" : ""}
                        {it.hasSubsJa ? " · JP subtitles" : ""}
                      </p>
                    </>
                  ) : loading && FEED_SOURCES.has(it.id) ? (
                    <p className="tc-inpicktitle tc-inloading">finding {it.medium === "reading" ? "an article" : "an episode"}…</p>
                  ) : (
                    <>
                      <p className="tc-inpicktitle">{it.title}{it.titleJa && it.titleJa !== it.title ? <i className="tc-inpickja">{it.titleJa}</i> : null}</p>
                      <p className="tc-inpickmeta">
                        {it.channel || it.source}
                        {mins ? ` · ~${mins} min` : ""}
                        {it.hasFurigana ? " · furigana" : ""}
                        {it.hasSubsJa ? " · JP subtitles" : ""}
                      </p>
                      {it.note && <p className="tc-inpicknote">{it.note}</p>}
                    </>
                  )}
                  <div className="tc-rehnav">
                    <button className="tc-btn tc-btn-sm tc-btn-primary" disabled={loading && !item}
                      onClick={() => open(picks[idx])}>{item ? "Play this" : "Open"}</button>
                    <button className="tc-btn tc-btn-sm" onClick={() => save((s0) => ({ ...s0, hidden: [...s0.hidden, it.id] }))}>Not for me</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-sm" onClick={reroll}>Show me others</button>
            <button className="tc-btn tc-btn-sm" onClick={() => setPicks(null)}>Back</button>
          </div>
        </>
      )}

      <p className="tc-smarthint">
        {week.mins > 0
          ? `This week · ${week.mins} min of input over ${week.rows.length} session${week.rows.length === 1 ? "" : "s"}.`
          : "Nothing logged this week yet. Even 10 minutes of something you mostly understand beats 60 minutes of something you don't."}
      </p>

      <div className="tc-kanaseg tc-intools">
        {[["log", "Log", "記録"], ["link", "Add link", "リンク追加"], ["cover", "Coverage", "カバー率"]].map(([k, en, ja]) => (
          <button key={k} className={"tc-fchip" + (panel === k ? " is-on" : "")} onClick={() => setPanel(panel === k ? "" : k)}><Bi en={en} ja={ja} /></button>
        ))}
        <button className="tc-fchip" onClick={exportWeek} disabled={!week.rows.length}><Bi en="Export" ja="書き出し" /></button>
      </div>
      {note && <p className="tc-innote">{note}</p>}

      {panel === "log" && (
        <div className="tc-card2 tc-inpanel">
          <p className="tc-eyebrow">input you did somewhere else</p>
          <input className="tc-sentinput" value={logText} onChange={(e) => setLogText(e.target.value)}
            placeholder="anime, a podcast, a conversation…" />
          <div className="tc-kanaseg">
            {INPUT_TIMES.map((n) => (
              <button key={n} className={"tc-fchip" + (logMin === n ? " is-on" : "")} onClick={() => setLogMin(n)}>{n} min</button>
            ))}
          </div>
          <div className="tc-inverdicts">
            {Object.entries(INPUT_VERDICTS).map(([k, v]) => (
              <button key={k} className="tc-fchip" disabled={!logText.trim()} onClick={() => logOffline(k)}><Bi en={v.en} ja={v.ja} /></button>
            ))}
          </div>
        </div>
      )}

      {panel === "link" && (
        <div className="tc-card2 tc-inpanel">
          <p className="tc-eyebrow">add a source of your own</p>
          <input className="tc-sentinput" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
          <input className="tc-sentinput" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="what is it? (optional)" />
          <p className="tc-smarthint">It starts at your current level and moves as you rate it, same as everything else.</p>
          <div className="tc-rehnav"><button className="tc-btn tc-btn-sm tc-btn-primary" onClick={addLink}>Add</button></div>
        </div>
      )}

      {panel === "cover" && (
        <div className="tc-card2 tc-inpanel">
          <p className="tc-eyebrow">paste Japanese — how much of it do you already have?</p>
          <textarea className="tc-sentinput tc-inarea" value={coverText} onChange={(e) => setCoverText(e.target.value)}
            placeholder="Paste a paragraph, a subtitle line, an article…" />
          {coverage && (
            <>
              <div className="tc-bignum">{coverage.pct}<span>%</span></div>
              <p className="tc-donesub">of the words in that text are already in your deck</p>
              {coverage.unknown.length > 0 && (
                <>
                  <p className="tc-eyebrow">not in your deck</p>
                  <p className="tc-incover">{coverage.unknown.map((u) => u.w).join("　")}</p>
                </>
              )}
              {/* One definition of "is this worth reading", shared with anything else that
                  needs to ask. The thresholds are a stated position rather than a
                  measurement, and they live in comprehensible.mjs where they can be argued
                  with. */}
              <p className="tc-smarthint">{describeBand(coverage.pct)}</p>

              {/* Keeping what you read. Words arrive with the sentence they appeared in,
                  which is the difference between learning 持ってくる as a gloss and learning
                  it as something someone actually said. */}
              {mined && mined.candidates.length > 0 && (
                <div className="tc-mine">
                  <p className="tc-eyebrow">keep the words you did not have</p>
                  <p className="tc-smarthint" style={{ marginTop: 0 }}>
                    Each one arrives with the sentence you met it in, so it can be practised in
                    context instead of as a dictionary entry.
                  </p>
                  <input className="tc-sentinput" value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    placeholder="where is this from? (optional)" />
                  <div className="tc-minelist">
                    {mined.candidates.slice(0, 20).map((c) => (
                      <label key={c.term} className={"tc-minerow" + (picked.has(c.term) ? " is-on" : "")}>
                        <input type="checkbox" checked={picked.has(c.term)}
                          onChange={() => setPicked((prev) => {
                            const n = new Set(prev);
                            if (n.has(c.term)) n.delete(c.term); else n.add(c.term);
                            return n;
                          })} />
                        <span className="tc-mineterm">{c.term}</span>
                        <span className="tc-mineread">{c.reading !== c.term ? c.reading : ""}</span>
                        <span className="tc-minemean">{c.meaning}</span>
                        <span className="tc-minecount">{c.count > 1 ? "×" + c.count : ""}</span>
                        <span className="tc-minesent">{c.sentence}</span>
                      </label>
                    ))}
                  </div>
                  <p className="tc-smarthint">{describePlan(picked.size, parkPlan)}</p>
                  <div className="tc-rehnav">
                    <button className="tc-btn tc-btn-sm tc-btn-primary" disabled={!picked.size} onClick={keepPicked}>
                      Keep {picked.size || ""} {picked.size === 1 ? "word" : "words"}
                    </button>
                    <button className="tc-btn tc-btn-sm" onClick={() => setPicked(new Set(mined.candidates.slice(0, 10).map((c) => c.term)))}>
                      Select top 10
                    </button>
                  </div>
                  {mineMsg ? <p className="tc-smarthint">{mineMsg}</p> : null}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── ORAL EXAM ─────────────────────────────
   A mock of the 6-7 minute oral final: three situations, an examiner who speaks, and
   props you answer from.

   The props are regenerated every run — date, weekday, room, copy count, price, budget,
   headcount, and which of you orders the pizza. The study guide states outright that the
   flier, receipt and budget may be different on the day, so drilling one fixed set would
   train recall of specific answers instead of the ability to read a prop and answer from
   it. Randomising is the whole point of the exercise.

   Each question is spoken aloud rather than only written, because the exam is spoken and
   parsing a question by ear is half the difficulty. You answer out loud, then reveal the
   model answer, which is generated from the props actually on screen. */
const ORAL_KEY = "jpn101:oral";

function OralProp({ kind, props }) {
  if (kind === "flyer") {
    return (
      <div className="tc-prop tc-flyer">
        <p className="tc-propttl">Party Time for J-kaiwa!</p>
        <p className="tc-propbig">{props.flyer.dateEn}</p>
        <p className="tc-propbig">{props.flyer.timeEn}</p>
        <p className="tc-propline">{props.flyer.room.en}</p>
        <p className="tc-propsmall">Enjoy the night with pizza, drinks and refreshments!</p>
      </div>
    );
  }
  if (kind === "receipt") {
    return (
      <>
        <div className="tc-prop tc-receipt">
          <p className="tc-propttl">レシート · Cougar Print</p>
          <p className="tc-propline">Color print × {props.receipt.copies}</p>
          <p className="tc-propbig">${props.receipt.price}</p>
        </div>
        <div className="tc-prop tc-budget">
          <p className="tc-propttl">Budget · J-kaiwa party</p>
          <p className="tc-propline">Total: ${props.budget.total}</p>
          <p className="tc-propline">People expected: {props.budget.people}</p>
          <p className="tc-propline">Pizza from: {props.budget.place}</p>
          <p className="tc-propline">
            Ordering pizza: <b>{props.budget.youOrderPizza ? "YOU" : "TA"}</b>
            {"  ·  "}Drinks: <b>{props.budget.youOrderPizza ? "TA" : "YOU"}</b>
          </p>
        </div>
      </>
    );
  }
  return null;
}

/* ── Culture Talk rehearsal ──
   A prepared presentation needs the opposite of the interview drill: the goal is to stop
   needing the script at all. Three stages take it away a piece at a time —

     read     full Japanese, romaji and English
     romaji   the Japanese is gone; the sound is still there to lean on
     cue      three words on a card and nothing else

   The line is spoken at every stage, because the midterm note was about pitch accent and
   that cannot be learned from a romaji spelling. Section-opening lines are marked: if the
   talk falls apart mid-way, jumping to the next 〜ばんめ puts it back on rails. */
function Talk() {
  const [stage, setStage] = useState("read");   // read | romaji | cue
  const [i, setI] = useState(0);
  const [done, setDone] = useState(() => new Set());
  const L = TALK.lines[i];
  const card = L && L.sec ? TALK.cards[L.sec - 1] : null;
  const sectionCard = useMemo(() => {
    let c = null;
    for (let x = 0; x <= i; x++) if (TALK.lines[x].sec) c = TALK.cards[TALK.lines[x].sec - 1];
    return c;
  }, [i]);
  const pitchFor = (line) => TALK.pitch.filter((w) => line.ja.includes(w.w));

  const say = () => { try { speakJa(L.ja, 0.95); } catch (e) {} };
  useEffect(() => { if (L) say(); }, [i, stage]);   // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (ok) => {
    if (ok) setDone((d) => { const x = new Set(d); x.add(L.n); return x; });
    if (i + 1 < TALK.lines.length) setI(i + 1);
  };

  return (
    <div className="tc-oral">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: ((i + 1) / TALK.lines.length) * 100 + "%" }} /></div>
        <span className="tc-progtext">{i + 1} / {TALK.lines.length}</span>
      </div>

      <div className="tc-kanaseg">
        {[["read", "Read it"], ["romaji", "Rōmaji only"], ["cue", "Cue card only"]].map(([k, label]) => (
          <button key={k} className={"tc-fchip" + (stage === k ? " is-on" : "")} onClick={() => setStage(k)}>{label}</button>
        ))}
      </div>

      <div className="tc-card2 tc-oralcard">
        <p className="tc-oralwho">{L.tag}{L.sec ? " · section reset" : ""}</p>

        {stage === "read" && <p className="tc-talkja">{L.ja}</p>}
        {stage !== "cue" && <p className="tc-talkrom">{L.rom}</p>}
        {stage === "cue" && (
          sectionCard ? (
            <div className="tc-talkcue">
              <p className="tc-talkcuename">{sectionCard.name}</p>
              {sectionCard.words.map((w) => <span key={w} className="tc-talkcueword">{w}</span>)}
            </div>
          ) : <p className="tc-oralcue">No cue card — this line opens or closes the talk.</p>
        )}

        <div className="tc-rehnav">
          <button className="tc-btn tc-btn-sm" onClick={say}>🔊 Hear it</button>
          {stage !== "read" && <button className="tc-btn tc-btn-sm" onClick={() => setStage("read")}>Show the line</button>}
        </div>

        {stage === "read" && <p className="tc-oralen">{L.en}</p>}
        {L.g && <p className="tc-oralg">{L.g}</p>}
        {L.note && <p className="tc-talknote">{L.note}</p>}
        {pitchFor(L).map((w) => (
          <p key={w.w} className="tc-talkpitch">
            <b>{w.w}</b> — say <b>{w.say}</b>, not {w.bad}
          </p>
        ))}

        <div className="tc-rehnav">
          <button className="tc-btn tc-btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => advance(false)}>Fumbled</button>
          <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => advance(true)}>Said it ✓</button>
        </div>
      </div>

      <p className="tc-smarthint">
        {done.size} of {TALK.lines.length} lines said cleanly.
        {" "}Section resets are lines 4, 8 and 11 — if you blank, jump to the next 〜ばんめ.
      </p>
    </div>
  );
}

/* The tab holds two different things: a mock interview, and a prepared talk. They need
   different practice, so they get different screens rather than one compromised one. */
function OralHome() {
  const [which, setWhich] = useState("interview");
  return (
    <div className="tc-oral">
      <div className="tc-kanaseg">
        <button className={"tc-fchip" + (which === "interview" ? " is-on" : "")} onClick={() => setWhich("interview")}>Oral final</button>
        <button className={"tc-fchip" + (which === "talk" ? " is-on" : "")} onClick={() => setWhich("talk")}>Culture talk</button>
      </div>
      {which === "interview" ? <Oral /> : <Talk />}
    </div>
  );
}

function Oral() {
  const [props_, setProps] = useState(() => makeProps());
  const [sit, setSit] = useState(0);
  const [qi, setQi] = useState(0);
  const [shown, setShown] = useState(false);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [running, setRunning] = useState(false);
  const shownRef = useRef(0);
  const thinkRef = useRef(null);

  useEffect(() => { (async () => {
    try { const r = await sGet(ORAL_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [qi, sit, running]);

  const S = SITUATIONS[sit];
  const q = S.questions[qi];
  const key = S.id + ":" + qi;
  const st = statsRef.current[key] || { seen: 0, correct: 0, level: 0, streak: 0 };

  // Speak the examiner's line the moment it appears — the exam is heard, not read.
  // q.r is a function wherever the line quotes a randomised prop (a date, a name), exactly
  // like q.q and q.a, so it has to be called with the props on screen. Passing the function
  // straight to speakJa read its own source code aloud from the second prompt onwards.
  // The INITIATE turns are silent by design — nobody prompts you — so they are skipped here
  // rather than relying on those entries happening to have no r.
  useEffect(() => {
    if (!running || !q || q.initiate) return;
    const line = typeof q.r === "function" ? q.r(props_) : q.r;
    if (line) { try { speakJa(line, 0.95); } catch (e) {} }
  }, [running, sit, qi, props_]);   // eslint-disable-line react-hooks/exhaustive-deps

  const record = (ok) => {
    const think = thinkRef.current;
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, think, Date.now()),
    };
    const nx = { ...statsRef.current, [key]: ns };
    statsRef.current = nx; setStats(nx); sSet(ORAL_KEY, JSON.stringify(nx));
    logDay({ ok, ms: think || 0, deck: "oral" });
    setShown(false);
    if (qi + 1 < S.questions.length) setQi(qi + 1);
    else if (sit + 1 < SITUATIONS.length) { setSit(sit + 1); setQi(0); }
    else setRunning(false);
  };

  const total = SITUATIONS.reduce((a, x) => a + x.questions.length, 0);
  const answered = Object.keys(stats).length;
  const solid = Object.values(stats).filter((x) => (x.level || 0) >= 4).length;

  if (!running) {
    return (
      <div className="tc-oral">
        <div className="tc-kanjihero">
          <img className="tc-mascot" src={MASCOT_GIFS[solid > 0 ? "proud" : "waiting"]} width={64} height={60} alt="" draggable="false" />
          <div className="tc-kanjiheroright">
            <p className="tc-kanjicount"><b>{solid}</b> <span>/ {total} prompts solid</span></p>
            <div className="tc-kanjibar"><div className="tc-kanjibarfill" style={{ width: `${(solid / total) * 100}%` }} /></div>
            <p className="tc-kanjisub">{answered} of {total} attempted · 6–7 minute interview</p>
          </div>
        </div>
        {SITUATIONS.map((x, i) => (
          <button key={x.id} className="tc-btn tc-start tc-oralsit" onClick={() => { setSit(i); setQi(0); setShown(false); setProps(makeProps()); setRunning(true); }}>
            <b>{x.title}</b>
            <i>{x.mins} · {x.questions.length} prompts</i>
          </button>
        ))}
        <button className="tc-btn tc-btn-primary tc-start" onClick={() => { setSit(0); setQi(0); setShown(false); setProps(makeProps()); setRunning(true); }}>
          Full mock interview · all {total} prompts
        </button>
        <p className="tc-smarthint">
          The date, time, copy count, price and pizza order change every run, exactly as the
          study guide warns they may on the day. Answer out loud before revealing anything.
        </p>
        {/* What the marks are actually for. The three sections are only the excuse to use
            these, so they sit on the way in rather than buried in a menu. */}
        <details className="tc-oralcheck">
          <summary>What they are marking · quick checklist</summary>
          <dl className="tc-oralchecklist">
            {CHECKLIST.map((c) => (
              <div key={c.k}><dt>{c.k}</dt><dd>{c.v}</dd></div>
            ))}
          </dl>
        </details>
      </div>
    );
  }

  return (
    <div className="tc-oral">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${((qi + 1) / S.questions.length) * 100}%` }} /></div>
        <span className="tc-progtext">{qi + 1} / {S.questions.length}</span>
        <button className="tc-fchip" onClick={() => setRunning(false)}>Quit</button>
      </div>
      <p className="tc-eyebrow">{S.title}</p>

      {S.prop !== "none" && <OralProp kind={S.prop} props={props_} />}

      {/* Two turns in the rundown are marked INITIATE: nobody prompts you, you have to
          open your mouth first. Those are the ones that get failed, so they do not get an
          examiner line to react to — just the instruction and silence. */}
      <div className={"tc-card2 tc-oralcard" + (q.initiate ? " tc-oralinit" : "")}>
        {q.initiate ? (
          <>
            <p className="tc-oralwho tc-oralwhoyou">▶ you start · nobody asks you this</p>
            <p className="tc-oralq tc-oralqinit">{q.en.replace(/^NOW YOU START — /, "")}</p>
          </>
        ) : (
          <>
            <p className="tc-oralwho">examiner{q.star ? " · watch this one" : ""}</p>
            <p className="tc-oralq">
              {typeof q.q === "function" ? q.q(props_) : q.q}{" "}
              <SpeakBtn text={typeof q.r === "function" ? q.r(props_) : q.r} />
            </p>
          </>
        )}
        {!shown ? (
          <>
            <p className="tc-oralcue">
              {q.initiate ? "Say it out loud from scratch, then check." : "Say your answer out loud, then check."}
            </p>
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-primary" onClick={() => {
                if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
                setShown(true);
              }}>Check my answer</button>
            </div>
          </>
        ) : (
          <>
            {!q.initiate && <p className="tc-oralen">{q.en}</p>}
            <p className="tc-orala">{q.a(props_)} <SpeakBtn text={q.a(props_)} /></p>
            <p className="tc-oralg">{q.g}</p>
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => record(false)}>Struggled</button>
              <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => record(true)}>Said it ✓</button>
            </div>
          </>
        )}
      </div>
      <p className="tc-smarthint">{S.intro}</p>
    </div>
  );
}

/* ───────────────────────────── KANJI ─────────────────────────────
   The 2,140 jōyō kanji, ordered by newspaper frequency rather than school grade.
   Grade order is how Japanese children learn them, spread over six years and organised
   around what a seven-year-old can discuss. Frequency order is what an adult learner
   wants: 日 is rank 1, and the first 500 by frequency cover far more real text than the
   first 500 by grade.

   Data: KANJIDIC2 (EDRDG), CC BY-SA 4.0, via kanjiapi.dev. JLPT levels: Jonathan Waller.

   Scheduling reuses statReview/statNeed, so kanji sit on the same FSRS memory model as
   everything else rather than getting a fourth hand-rolled scorer. */
/* ── Dates, times and counters ──
   The part of the course that is pure recall with no way to reason it out mid-sentence:
   四月 is しがつ and never よんがつ, 二十日 is はつか and never にじゅうにち, 一分 is
   いっぷん. There is nothing to understand, only to know, and reading it off a chart is a
   completely different skill from producing it under exam pressure.

   So the tab has three stages rather than one drill: a chart to read, learn cards for
   anything not yet met, and then drilling that is typed rather than multiple choice
   wherever an item is solid enough — picking ようか out of four options can be done by
   elimination, typing it cannot. Sequence questions ("Thursday, April 8 at 7:00 PM") come
   last because they are the shape the midterm asks for and they only work once the pieces
   are individually known.

   Every fact is its own scheduled item, so missing 二十日 drills 二十日 and does not drag
   十五日 back with it. */
const DATES_KEY = "jpn101:dates";

const DATE_GROUPS = [
  { id: "weekday", label: "Days of the week", hint: "七曜", match: (i) => i.kind === "weekday" },
  { id: "month", label: "Months", hint: "月", match: (i) => i.kind === "month" },
  { id: "day", label: "Days of the month", hint: "日", match: (i) => i.kind === "day" },
  { id: "time", label: "Hours & minutes", hint: "時・分", match: (i) => i.id.startsWith("ctr:ji:") || i.id.startsWith("ctr:fun:") },
  { id: "counter", label: "Counters", hint: "助数詞", match: (i) => i.kind === "counter" && !i.id.startsWith("ctr:ji:") && !i.id.startsWith("ctr:fun:") },
];

const DATE_ITEMS = buildDateItems();
const dateGroupOf = (i) => (DATE_GROUPS.find((g) => g.match(i)) || DATE_GROUPS[4]).id;

const pickN = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
const randOf = (a) => a[Math.floor(Math.random() * a.length)];

/* Distractors come from the same group, so a 〜日 question is answered against other 〜日
   readings. Anything else makes the question answerable by shape alone. */
function dateDistractors(item, n) {
  const g = dateGroupOf(item);
  const sameCounter = item.id.startsWith("ctr:") ? item.id.split(":")[1] : null;
  const pool = DATE_ITEMS.filter((x) => {
    if (x.id === item.id || x.reading === item.reading) return false;
    if (sameCounter) return x.id.startsWith("ctr:" + sameCounter + ":");
    return dateGroupOf(x) === g;
  });
  const near = pool.filter((x) => Math.abs(num(x.id) - num(item.id)) <= 6);
  const chosen = pickN(near.length >= n ? near : pool, n);
  return chosen.length >= n ? chosen : pickN(pool, n);
}
const num = (id) => Number(id.split(":").pop()) || 0;

/* A full exam-shaped prompt, assembled from pieces he has already met. */
function makeSequence() {
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const dow = Math.floor(Math.random() * 7);
  const hour = 1 + Math.floor(Math.random() * 23);
  const minute = randOf([0, 0, 15, 30, 30, 45, 10, 20]);
  return sequenceForm(month, day, dow, hour, minute);
}

function Dates() {
  const [stats, setStats] = useState({});
  const [view, setView] = useState("home");
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState(null);
  const [judged, setJudged] = useState(null);     // {ok, want} once an answer is committed
  const [lastAnswer, setLastAnswer] = useState(""); // what he actually gave, shown back on a miss
  const judgedAtRef = useRef(0);                  // guards Enter auto-repeat from skipping the answer
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const [chart, setChart] = useState(null);       // which group's reference chart is open
  const statsRef = useRef({});
  const shownRef = useRef(Date.now());
  const thinkRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let live = true;
    sGet(DATES_KEY).then((raw) => {
      if (!live) return;
      let v = {};
      try { v = JSON.parse(raw || "{}") || {}; } catch (e) {}
      statsRef.current = v; setStats(v);
    });
    return () => { live = false; };
  }, []);

  const getS = useCallback((id) => statsRef.current[id] || {}, []);

  const save = (item, ok, ms) => {
    const st = getS(item.id);
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, ms, Date.now()),
      ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
    };
    const nx = { ...statsRef.current, [item.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(DATES_KEY, JSON.stringify(nx));
    logDay({ ok, ms: ms || 0, deck: "dates" });
  };

  const speak = useCallback((text) => {
    try { speakJa(String(text), 0.95); } catch (e) {}
  }, []);

  const solid = useCallback((id) => ((stats[id] || {}).level || 0) >= 4, [stats]);
  const met = useCallback((id) => ((stats[id] || {}).seen || 0) > 0, [stats]);

  const groupProgress = useMemo(() => DATE_GROUPS.map((g) => {
    const items = DATE_ITEMS.filter(g.match);
    return {
      ...g, items,
      solid: items.filter((i) => solid(i.id)).length,
      met: items.filter((i) => met(i.id)).length,
    };
  }), [solid, met]);

  const overall = useMemo(() => {
    const done = DATE_ITEMS.filter((i) => solid(i.id)).length;
    return { done, total: DATE_ITEMS.length, pct: Math.round((done / DATE_ITEMS.length) * 100) };
  }, [solid]);

  const dueNow = useMemo(() => {
    const now = Date.now();
    return DATE_ITEMS.filter((i) => {
      const f = (stats[i.id] || {}).fsrs;
      return f && f.due && f.due <= now;
    }).length;
  }, [stats]);

  /* A question's form follows how well the item is known: meet it, then recognise it, then
     produce it. Typing is the goal state — it is the only one that proves recall rather
     than recognition. */
  const formFor = (item) => {
    const st = getS(item.id);
    if (!(st.seen > 0)) return "learn";
    if ((st.level || 0) >= 3) return "type";
    if ((st.level || 0) >= 1) return Math.random() < 0.5 ? "type" : "mc";
    return "mc";
  };

  const startSession = useCallback((groupId) => {
    const now = Date.now();
    const pool = groupId ? DATE_ITEMS.filter((i) => dateGroupOf(i) === groupId) : DATE_ITEMS;
    /* Review and new material are picked separately.

       Scoring everything together does not work here: on a fresh install all 210 items tie
       at the same need, the trap bonus then sorts every one of the ~70 traps ahead of every
       regular, and the first sessions are nothing but ついたち…ここのか and 四月・七月・九月
       with 五月 nowhere in sight. Traps are what cost marks, but they are irregularities in
       a pattern, and the pattern has to exist first.

       So: due items come back by need, with traps bumped among them, and new items are
       introduced in chart order — 日曜日 through 土曜日, 一月 through 十二月, the 1st through
       the 31st. That is the order the material is learnable in. */
    const isSeen = (i) => ((statsRef.current[i.id] || {}).seen || 0) > 0;
    /* Difficulty is graded, not a flag. Every irregular used to get the same +0.6, so a
       drill of the days of the month spent as much of itself on 十七日 — regular once you
       know 七 is しち there — as on 二十日, which cannot be derived from anything. Items
       carry their own weight now; anything without one keeps the old flat bonus. */
    const review = pool.filter(isSeen)
      .map((i) => ({ i, need: statNeed(statsRef.current[i.id], now) + (i.weight ?? (i.trap ? 0.6 : 0)) }))
      .sort((a, b) => b.need - a.need)
      .slice(0, 8).map((x) => x.i);
    const fresh = pool.filter((i) => !isSeen(i)).slice(0, Math.max(4, 12 - review.length));
    const chosen = [...review, ...fresh].slice(0, 12);
    const steps = [];
    for (const item of chosen) {
      const form = formFor(item);
      if (form === "learn") steps.push({ kind: "learn", item }, { kind: "mc", item });
      else steps.push({ kind: form, item });
    }
    // Interleave rather than run each item's steps back to back.
    const waves = [];
    let depth = 0;
    while (steps.some((s) => s.wave === undefined)) {
      for (const item of chosen) {
        const next = steps.find((s) => s.item.id === item.id && s.wave === undefined);
        if (next) { next.wave = depth; waves.push(next); }
      }
      depth++;
    }
    /* Sequences last: they assemble the pieces, so they are only fair once the pieces have
       been seen this session. Skipped entirely for a single-group drill, where there is
       nothing to assemble. */
    if (!groupId) for (let i = 0; i < 3; i++) waves.push({ kind: "seq", seq: makeSequence() });

    setQueue(waves);
    setPos(0); setHits(0); setTotal(0);
    setTyped(""); setPicked(null); setJudged(null);
    shownRef.current = Date.now(); thinkRef.current = null;
    setView("session");
  }, []);

  const step = queue[pos] || null;
  const item = step ? step.item : null;

  /* Options for a multiple-choice step, stable for the life of the step. */
  const choices = useMemo(() => {
    if (!step || step.kind !== "mc" || !item) return [];
    return [item, ...dateDistractors(item, 3)].sort(() => Math.random() - 0.5);
  }, [step, item]);

  useEffect(() => {
    shownRef.current = Date.now(); thinkRef.current = null;
    setTyped(""); setPicked(null); setJudged(null); setLastAnswer("");
    if (step && (step.kind === "type" || step.kind === "seq")) {
      setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 30);
    }
    if (step && step.kind === "learn" && step.item) setTimeout(() => speak(step.item.reading), 250);
    /* Keyed on position only. Requeueing a missed item replaces the queue array, and
       keying this on the queue made the effect re-run and clear "judged" the instant an
       answer was marked wrong — so a wrong answer showed no feedback at all and simply
       asked itself again, forever. */
  }, [pos, speak]);

  useEffect(() => {
    if (view === "session" && queue.length && pos >= queue.length) setView("summary");
  }, [pos, queue.length, view]);

  const advance = () => setPos((x) => x + 1);

  /* Enter continues from the correction, but only as a fresh press. The input is disabled
     once an answer is judged, which drops focus, so this has to listen on the window
     rather than on the field. `e.repeat` filters auto-repeat from a held key and the time
     guard covers a fast double tap — between them, Enter cannot carry through from
     submitting the answer to dismissing the correction before it has been read. */
  useEffect(() => {
    if (!judged) return;
    const onKey = (e) => {
      if (e.key !== "Enter") return;
      if (e.repeat || Date.now() - judgedAtRef.current < 600) return;
      e.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [judged]);

  const commit = (ok, want) => {
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    setJudged({ ok, want });
    judgedAtRef.current = Date.now();
    setTotal((t) => t + 1);
    if (ok) setHits((h) => h + 1);
    if (item) save(item, ok, thinkRef.current);
    speak(want);
    if (!ok && item) {
      /* A miss comes back later in the same session, as multiple choice so the correct
         form is seen again before it is asked for cold. */
      setQueue((q) => {
        const nq = q.slice();
        nq.splice(Math.min(nq.length, pos + 4), 0, { kind: "mc", item });
        return nq;
      });
    }
  };

  const answerMC = (opt) => {
    if (judged || !item) return;
    setPicked(opt);
    setLastAnswer(opt.reading);
    commit(opt.id === item.id, item.reading);
  };

  const submitTyped = () => {
    if (judged) return;
    const kana = toKana(typed);
    if (!kana) return;
    setLastAnswer(kana);
    if (step.kind === "seq") {
      const ok = acceptedReadings(step.seq.reading).some((r) => kanaEqual(kana, r));
      if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
      setJudged({ ok, want: step.seq.reading });
      judgedAtRef.current = Date.now();
      setTotal((t) => t + 1);
      if (ok) setHits((h) => h + 1);
      /* A sequence is scored against its three components, so getting it wrong schedules
         the pieces rather than a composite that will never be asked again. */
      for (const part of ["date", "weekday", "time"]) {
        const piece = step.seq.parts[part];
        const sub = DATE_ITEMS.find((x) => x.reading === piece.reading);
        if (sub) save(sub, ok, thinkRef.current);
      }
      logDay({ ok, ms: thinkRef.current || 0, deck: "dates" });
      speak(step.seq.reading);
      return;
    }
    const strictSeven = item.kind === "month" || item.kind === "day";
    const ok = acceptedReadings(item.reading, { strictSeven }).some((r) => kanaEqual(kana, r));
    commit(ok, item.reading);
  };

  /* ── reference chart ── */
  if (chart) {
    const g = groupProgress.find((x) => x.id === chart);
    return (
      <div className="tc-dates">
        <div className="tc-dhead">
          <button className="tc-fchip" onClick={() => setChart(null)}>← Back</button>
          <h2 className="tc-dtitle">{g.label}</h2>
        </div>
        <p className="tc-smarthint">Tap any row to hear it. Red rows are the ones that break the pattern.</p>
        <div className="tc-dchart">
          {g.items.map((i) => (
            <button key={i.id} className={"tc-drow" + (i.trap ? " is-trap" : "") + (solid(i.id) ? " is-solid" : "")}
              onClick={() => speak(i.reading)}>
              <span className="tc-drowk">{i.kanji}</span>
              <span className="tc-drowr">{i.reading}</span>
              <span className="tc-drowe">{i.en}</span>
            </button>
          ))}
        </div>
        <button className="tc-btn tc-btn-primary tc-dwide" onClick={() => { setChart(null); startSession(g.id); }}>
          Drill {g.label.toLowerCase()}
        </button>
      </div>
    );
  }

  /* ── session ── */
  if (view === "session" && step) {
    const pct = queue.length ? (pos / queue.length) * 100 : 0;
    const isSeq = step.kind === "seq";
    const kana = toKana(typed);
    return (
      <div className="tc-dates">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: pct + "%" }} /></div>
          <span className="tc-progtext">{pos} / {queue.length}</span>
          <button className="tc-fchip" onClick={() => setView("home")}>Quit</button>
        </div>

        {step.kind === "learn" ? (
          <div className="tc-dcard">
            <p className="tc-eyebrow">new</p>
            <div className="tc-dbig">{item.kanji}</div>
            <div className="tc-dread">{item.reading}</div>
            <div className="tc-den">{item.en}</div>
            <button className="tc-btn tc-btn-sm" onClick={() => speak(item.reading)}>🔊 Hear it</button>
            {item.trap && <p className="tc-dnote">⚠ {item.note || "This one breaks the pattern — learn it as its own word."}</p>}
            <button className="tc-btn tc-btn-primary tc-dwide" onClick={advance}>Got it</button>
          </div>
        ) : (
          <div className="tc-dq">
            <p className="tc-kprompt">
              {isSeq ? "Write this out in Japanese"
                : step.kind === "type" ? "Type the reading"
                : "Which reading is this?"}
            </p>
            <div className="tc-dstem">
              {isSeq ? <span className="tc-dseqen">{step.seq.en}</span> : (
                <>
                  <span className="tc-dbig">{item.kanji}</span>
                  <span className="tc-den">{item.en}</span>
                </>
              )}
            </div>

            {step.kind === "mc" ? (
              <div className="tc-kopts">
                {choices.map((o) => {
                  const state = !judged ? ""
                    : o.id === item.id ? " is-right"
                    : picked && o.id === picked.id ? " is-wrong" : " is-dim";
                  return (
                    <button key={o.id} className={"tc-kopt" + state} disabled={!!judged}
                      onClick={() => answerMC(o)}>{o.reading}</button>
                  );
                })}
              </div>
            ) : (
              <div className="tc-dtype">
                <input ref={inputRef} className="tc-dinput" value={typed} disabled={!!judged}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    /* Enter submits, and only advances once the answer has been on screen
                       long enough to read. Without the gap a held key or a double tap of
                       Enter answers and skips straight past the correction. */
                    if (!judged) { submitTyped(); return; }
                    if (Date.now() - judgedAtRef.current > 600) advance();
                  }}
                  placeholder="type in romaji — shigatsu youka"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                <div className="tc-dkana">{kana || "　"}</div>
                {!judged && (
                  <button className="tc-btn tc-btn-primary tc-dwide" onClick={submitTyped} disabled={!kana}>
                    Check
                  </button>
                )}
              </div>
            )}

            {/* Pinned to the bottom of the viewport rather than placed after the options.
                In the flow it sat at y=698–825 on a 375x812 phone, so the correct answer
                and the Continue button were both below the fold: answering appeared to do
                nothing at all. It is also the one thing on screen that has to be read, so
                it gets the fixed spot and the question scrolls behind it.

                No autoFocus here. Enter submits the typed answer, and focusing a button
                under the cursor's own keystroke means one auto-repeat — or the very normal
                habit of pressing Enter twice — activates Continue and skips the answer. */}
            {judged && (
              <div className={"tc-dfeedwrap" + (judged.ok ? " is-ok" : "")}>
                <div className="tc-dfeed">
                  <div className="tc-dfeedhead">
                    <span className="tc-dfeedmark">{judged.ok ? "✓" : "✗"}</span>
                    <span className="tc-dfeedverdict">{judged.ok ? "Correct" : "Not quite"}</span>
                  </div>
                  {!judged.ok && lastAnswer && (
                    <p className="tc-dfeedyours">you wrote <b>{lastAnswer}</b></p>
                  )}
                  <p className="tc-dfeedans">
                    <b>{isSeq ? step.seq.kanji : item.kanji}</b>
                    <span className="tc-dfeedread">{judged.want}</span>
                  </p>
                  {isSeq && <p className="tc-dfeedsub">{step.seq.en}</p>}
                  {!isSeq && item.note && <p className="tc-dfeedsub">{item.note}</p>}
                  <button className="tc-btn tc-btn-primary tc-dwide" onClick={advance}>Continue</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── summary ── */
  if (view === "summary") {
    const pct = total ? Math.round((hits / total) * 100) : 0;
    return (
      <div className="tc-dates">
        <div className="tc-done">
          <p className="tc-eyebrow">Drill complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{hits} right of {total}</p>
          <div className="tc-donebtns">
            <button className="tc-btn tc-btn-primary" onClick={() => startSession(null)}>Another round</button>
            <button className="tc-btn" onClick={() => setView("home")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── home ── */
  return (
    <div className="tc-dates">
      <div className="tc-dhero">
        <p className="tc-eyebrow">dates · times · counters</p>
        <div className="tc-bignum">{overall.done}<span>/{overall.total}</span></div>
        <p className="tc-donesub">{overall.pct}% solid{dueNow > 0 ? ` · ${dueNow} due for review` : ""}</p>
      </div>

      <button className="tc-btn tc-btn-primary tc-dwide" onClick={() => startSession(null)}>
        Start mixed drill
      </button>
      <p className="tc-smarthint">
        Mixed drills end with full exam-shaped prompts — “Thursday, April 8 at 7:00 PM” —
        written out from scratch. Everything is typed in romaji and converted as you go, so
        no Japanese keyboard is needed.
      </p>

      <div className="tc-dgroups">
        {groupProgress.map((g) => (
          <div key={g.id} className="tc-dgroup">
            <div className="tc-dgroupinfo">
              <b>{g.label}</b>
              <span className="tc-dgrouphint">{g.hint} · {g.solid}/{g.items.length} solid</span>
              <div className="tc-dbar"><div className="tc-dbarfill" style={{ width: (g.solid / g.items.length) * 100 + "%" }} /></div>
            </div>
            <div className="tc-dgroupbtns">
              <button className="tc-btn tc-btn-sm" onClick={() => setChart(g.id)}>Chart</button>
              <button className="tc-btn tc-btn-sm" onClick={() => startSession(g.id)}>Drill</button>
            </div>
          </div>
        ))}
      </div>

      <p className="tc-smarthint">
        Every reading is stored and scheduled on its own, so missing 二十日 brings back
        二十日 and not the whole list. Traps — the readings that break the pattern — are
        drilled sooner than the regular ones.
      </p>
    </div>
  );
}

const KANJI_KEY = "jpn101:kanji";

const KANJI_URL = "/kanji.json";
/* The shipped frequency list, read once and turned into a term -> reading/meaning lookup.
   This is what lets a mined word arrive with a reading and a gloss without a dictionary
   API, and it is what keeps the whole feature free. */
let _lexicon = null;
async function loadFreqLexicon() {
  if (_lexicon) return _lexicon;
  const r = await fetch("freq.json");
  const d = await r.json();
  _lexicon = makeLexicon((d && d.words) || []);
  return _lexicon;
}

const KANJI_CACHE = "jpn101:kanjiData";
const KANJI_BATCH = 12;              // how many new characters unlock at a time

let _kanjiPromise = null;
function loadKanji() {
  if (_kanjiPromise) return _kanjiPromise;
  _kanjiPromise = (async () => {
    let cached = null;
    try { cached = JSON.parse(window.localStorage.getItem(KANJI_CACHE) || "null"); } catch (e) {}
    try {
      const r = await fetch(KANJI_URL, { cache: "no-cache" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const d = await r.json();
        if (d && d.kanji) {
          try { window.localStorage.setItem(KANJI_CACHE, JSON.stringify(d)); } catch (e) {}
          return d;
        }
      }
    } catch (e) { /* offline — the cached copy is the point */ }
    return cached;
  })();
  return _kanjiPromise;
}


/* ── objective exercises ──
   The flip card ends in "did you know it?", answered AFTER seeing the answer. That is
   hindsight bias with a button, and it hands the scheduler a grade you invented. These
   exercises have a right answer the app checks, so correctness and latency are both
   measured rather than self-reported.

   Distractors are the whole game. Three random kanji make a question you can pass while
   knowing nothing; three plausible ones force a real discrimination. Candidates come from
   a nearby frequency band (characters you might plausibly confuse) and are ranked by
   closeness in stroke count, which stands in for visual similarity. */
/* On-readings look like katakana because that IS the convention: 音読み are the
   Chinese-derived readings and dictionaries write them in katakana so you can tell them
   from 訓読み, the native Japanese readings, written in hiragana. Nothing here is a
   loanword. Unlabelled it just looks like the app is drilling katakana at random, so every
   reading is shown with its marker.

   A standalone kun reading (人 → ひと) is what a beginner meets first, so it wins when the
   character has one — 218 of the first 500 do. Where the kun reading is a verb stem the
   dictionary writes it with a dot, い.きる meaning the kanji is い and きる is okurigana;
   truncating that to い leaves a single kana that collides with every other stem, so those
   fall through to the on-reading and are only rendered as い(きる) when there is no other
   choice. */
/* KANJIDIC writes okurigana with a dot and affix position with a hyphen: おお.きい means
   the kanji reads おお and きい is the trailing kana; -おお.いに attaches to something
   before it. That notation is unreadable unless you already know it, so the okurigana is
   parenthesised and the affix hyphens dropped. */
function readingText(r) {
  const [stem, oku] = r.replace(/^-|-$/g, "").split(".");
  return oku ? stem + "(" + oku + ")" : stem;
}
const readingList = (arr) => arr.map(readingText).join("・");

function readingLabel(k) {
  const plain = (k.kun || []).find((r) => !/[.-]/.test(r));
  if (plain) return { mark: "訓", text: plain };
  if (k.on && k.on.length) return { mark: "音", text: k.on[0] };
  const dotted = (k.kun || [])[0];
  if (dotted) return { mark: "訓", text: readingText(dotted) };
  return { mark: "", text: "" };
}

function kanjiDistractors(all, target, n, field) {
  const idx = all.indexOf(target);
  const band = all.slice(Math.max(0, idx - 90), Math.min(all.length, idx + 90))
    .filter((k) => k !== target && (field === "reading" ? (k.on.length || k.kun.length) : k.m.length));
  // Must match what the option actually renders, or two tiles can show the same kun
  // reading while deduping on different on-readings.
  const val = (k) => (field === "reading" ? readingLabel(k).text : k.m[0]);
  /* Rejecting only exact duplicates is not enough. 中 (inside) drew a distractor whose
     gloss was "in" — a different string, the same answer, and a question with no correct
     option. Anything that overlaps ANY of the target meanings, in either direction, is out. */
  const norm = (t) => t.toLowerCase().replace(/[^a-z ]/g, "").trim();
  // A gloss like "10**16" normalises to the empty string, and every candidate contains
  // the empty string — ten kanji were rejecting their entire distractor pool this way.
  const targetWords = target.m.map(norm).filter(Boolean);
  /* Only meaningful for English glosses. Applying it to readings normalised every
     katakana option to an empty string and rejected the entire distractor pool, leaving
     reading questions with exactly one option to choose from. */
  const clashes = (v) => {
    if (field !== "meaning") return false;
    const n = norm(v);
    if (!n) return true;
    return targetWords.some((t) => t === n || t.includes(n) || n.includes(t));
  };
  // Seeded with the target's own value: 回 drew a distractor that also reads カイ, which
  // renders as two identical tiles and no way to be right.
  const seen = new Set([val(target)]);
  const pool = [];
  for (const k of band) {
    const v = val(k);
    if (!v || seen.has(v) || clashes(v)) continue;
    seen.add(v);
    pool.push(k);
  }
  // Carrying every sense of the target into the clash test is stricter than carrying three,
  // and for a character with many glosses it can starve the local band. Widen rather than
  // ship a question with two options.
  if (pool.length < n) {
    for (const k of all) {
      if (pool.length >= n * 2) break;
      if (k === target || pool.includes(k)) continue;
      const v = val(k);
      if (!v || seen.has(v) || clashes(v)) continue;
      seen.add(v);
      pool.push(k);
    }
  }
  pool.sort((a, b) => Math.abs(a.s - target.s) - Math.abs(b.s - target.s));
  return pool.slice(0, Math.max(n * 3, 9)).sort(() => Math.random() - 0.5).slice(0, n);
}

/* Which exercise a character gets, by how well it is already known. Recognition before
   production, the same order the vocabulary deck uses: a character you cannot yet pick out
   of four is not ready to be produced from its meaning alone. */
/* A lesson, not a pile of cards.
   The previous version asked each character exactly one question and moved on, so a
   session was: show three, quiz three, repeat. Duolingo's lessons work because every item
   is hit several times from different angles inside one sitting — recognise it, hear it,
   pick it out of a line-up, produce it — and because a fast matching round breaks up the
   rhythm before attention drifts.

   Each new character gets four touches; a character already known gets two. A matching
   round of five drops in every eight or so questions, drawn from what the session has
   already covered, so it is revision rather than a cold quiz. */
/* Cloze is the format worth having above the others: kanji never appear alone in real
   Japanese, they appear inside words. Blanking the character out of a word already in the
   deck drills the character and revises the vocabulary in the same question. It is only
   offered where the deck actually supplies a word — inventing one would defeat the point. */
function buildLesson(pool, statsOf, hasWord) {
  const items = [];
  for (const k of pool) {
    const st = statsOf(k.c);
    const w = hasWord ? hasWord(k.c) : false;
    const seq = (st.seen || 0) === 0
        ? (w ? ["learn", "meaning", "cloze", "audio"] : ["learn", "meaning", "audio", "reading"])
      : (st.level || 0) <= 2
        ? (w ? ["cloze", "meaning", "build"] : ["meaning", "audio", "build"])
        : (w ? ["cloze", "reading"] : ["reading", "build"]);
    seq.forEach((mode, i) => items.push({ k, mode, wave: i }));
  }
  // Interleave by wave: every character's first touch, then every second touch, and so on.
  // Blocking a character's four questions together would let you answer from short-term
  // memory, which is the opposite of what spacing inside a session is for.
  items.sort((a, b) => a.wave - b.wave || Math.random() - 0.5);

  // slot in matching rounds over characters already introduced
  const out = [];
  let sinceMatch = 0;
  for (const it of items) {
    out.push(it);
    sinceMatch++;
    const seenSoFar = [...new Set(out.filter((x) => x.wave >= 1).map((x) => x.k))];
    if (sinceMatch >= 8 && seenSoFar.length >= 5) {
      out.push({ mode: "match", pool: seenSoFar.slice(-5) });
      sinceMatch = 0;
    }
  }
  return out;
}

function kanjiExercise(st) {
  const lvl = st.level || 0;
  if ((st.seen || 0) === 0) return "learn";           // first meeting: show everything
  if (lvl <= 1) return "meaning";                     // kanji -> meaning
  if (lvl <= 2) return "reading";                     // kanji -> reading
  return Math.random() < 0.5 ? "build" : "reading";   // meaning -> kanji, from tiles
}

/* Which kanji actually appear in the deck, and in which words.
   Frequency order is right for a general learner and wrong for this one: 412 jōyō kanji
   appear across these 835 cards, but their median position in the frequency list is 436
   and the tail runs past 2000. Learning 国 and 年 before 学 (20 of the deck's words), 語
   (17) and 何 (16) means weeks of practice that never touches the coursework.
   So: characters carried by the deck come first, the ones inside already-studied words
   ahead of the rest, and general frequency breaks ties and orders everything after. */
function deckKanjiIndex(cards) {
  const map = new Map();
  for (const c of cards || []) {
    const studied = (c.seen || 0) > 0;
    for (const ch of c.term || "") {
      if (!/[一-龯]/.test(ch)) continue;
      let e = map.get(ch);
      if (!e) { e = { words: [], n: 0, studied: false }; map.set(ch, e); }
      // n counts every word; words[] keeps only a few to show. Ranking must use n — using
      // the capped list gave 日 (42 of the deck's words) the same boost as one in six.
      e.n++;
      if (e.words.length < 6) e.words.push(c);
      if (studied) e.studied = true;
    }
  }
  return map;
}

function Kanji({ cards }) {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [view, setView] = useState("home");     // home | session | summary
  const [queue, setQueue] = useState([]);       // array of steps
  const [pos, setPos] = useState(0);
  const [choices, setChoices] = useState([]);
  const [picked, setPicked] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [pairs, setPairs] = useState({ sel: null, side: null, done: {} });
  /* Sometimes you are somewhere you cannot play sound. Rather than forcing a skip or a
     guess, the hear-it question converts to the same character asked visually, and no
     further audio questions appear for the rest of the lesson. */
  const [noAudio, setNoAudio] = useState(false);
  const [inspect, setInspect] = useState(null);   // character opened from the collection grid
  const [cloze, setCloze] = useState(null);      // the deck word a cloze question blanks
  const [right, setRight] = useState([]);
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const missRef = useRef({});
  const shownRef = useRef(0);
  const thinkRef = useRef(null);

  useEffect(() => { loadKanji().then(setData); }, []);
  useEffect(() => { (async () => {
    try { const r = await sGet(KANJI_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (err) {}
  })(); }, []);

  const getS = useCallback(
    (c) => statsRef.current[c] || { seen: 0, correct: 0, level: 0, streak: 0 }, []);
  const deckMap = useMemo(() => deckKanjiIndex(cards), [cards]);

  const all = useMemo(() => kanjiOrdered(data ? data.kanji : [], deckMap), [data, deckMap]);

  /* Everything is already persisted per character in jpn101:kanji — seen, correct, level,
     think time and the full FSRS memory state — and that key syncs to the cloud with the
     rest of the app. This only surfaces it: data you cannot see is data you cannot trust. */
  const reviewInfo = useMemo(() => {
    const vals = Object.values(stats);
    const now = Date.now();
    let reps = 0, dueNow = 0, soonest = Infinity;
    for (const v of vals) {
      reps += v.seen || 0;
      const f = v.fsrs;
      if (!f || !f.due) continue;
      if (f.due <= now) dueNow++;
      else soonest = Math.min(soonest, f.due);
    }
    let nextDue = null;
    if (isFinite(soonest)) {
      const d = Math.round((soonest - now) / 86400000);
      nextDue = d <= 0 ? "today" : d === 1 ? "tomorrow" : "in " + d + " days";
    }
    return { tracked: vals.length, reps, dueNow, nextDue };
  }, [stats]);

  // every character actually met, in the order the lesson introduced them
  const collected = useMemo(
    () => all.filter((k) => ((stats[k.c] || {}).seen || 0) > 0), [all, stats]);

  const mastered = useMemo(() => all.filter((k) => ((stats[k.c] || {}).level || 0) >= 4).length, [all, stats]);
  const started = useMemo(() => all.filter((k) => ((stats[k.c] || {}).seen || 0) > 0).length, [all, stats]);
  const unlocked = useMemo(() => kanjiUnlocked(all, stats), [all, stats]);

  /* Speak the character. A kanji alone has no single pronunciation, so this says a word
     from the deck that contains it when there is one — 学生 rather than a bare reading. */
  const speak = useCallback((k) => {
    if (!k) return;
    const w = (deckMap.get(k.c) || {}).words;
    const say = w && w.length ? (w[0].reading || w[0].term) : (k.kun[0] || k.on[0] || k.c);
    try { speakJa(String(say).replace(/[-.]/g, ""), 0.95); } catch (err) {}
  }, [deckMap]);

  const startSession = useCallback(() => {
    if (!unlocked.length) return;
    const now = Date.now();
    const chosen = unlocked
      .map((k) => ({ k, s: statNeed(getS(k.c), now) + Math.random() * 0.4 }))
      .sort((a, b) => b.s - a.s).map((x) => x.k).slice(0, 6);
    const lesson = buildLesson(chosen, getS, (c) => !!(deckMap.get(c) || {}).words);
    setQueue(lesson); setPos(0); setHits(0); setTotal(0);
    missRef.current = {}; setView("session");
  }, [unlocked, getS, deckMap]);

  const step = queue[pos] || null;
  const cur = step && step.k ? step.k : null;
  // what the step actually renders as, once "can't listen" is taken into account
  // NB step.mode, not mode: a blanket rename caught this line and made the initialiser
  // reference the variable it was defining, which crashed the whole tab.
  const mode = step ? (step.mode === "audio" && noAudio ? "meaning" : step.mode) : null;

  // lay out whatever the current step needs
  useEffect(() => {
    if (view !== "session" || !step) return;
    shownRef.current = Date.now(); thinkRef.current = null;
    setPicked(null); setFlipped(false); setPairs({ sel: null, side: null, done: {} });
    if (mode === "match") {
      setChoices([]);
      setRight(step.pool.slice().sort(() => Math.random() - 0.5));
      return;
    }
    setRight([]);
    if (mode === "learn") { setChoices([]); if (!noAudio) speak(step.k); return; }
    if (mode === "cloze") {
      // shortest word wins: fewer unknown characters around the blank means the question
      // is about the target and not about everything else in the compound
      const words = ((deckMap.get(step.k.c) || {}).words || [])
        .slice().sort((a, b) => (a.term || "").length - (b.term || "").length);
      setCloze(words[0] || null);
      const wrong = kanjiDistractors(all, step.k, 3, "meaning");
      setChoices([step.k, ...wrong].sort(() => Math.random() - 0.5));
      return;
    }
    if (mode === "audio" && !noAudio) speak(step.k);
    const field = mode === "reading" ? "reading" : "meaning";
    const wrong = kanjiDistractors(all, step.k, 3, field);
    setChoices([step.k, ...wrong].sort(() => Math.random() - 0.5));
  }, [pos, view]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === "session" && queue.length && pos >= queue.length) setView("summary");
  }, [pos, queue.length, view]);

  const save = (k, ok, ms) => {
    const st = getS(k.c);
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, ms, Date.now()),
      ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
    };
    const nx = { ...statsRef.current, [k.c]: ns };
    statsRef.current = nx; setStats(nx); sSet(KANJI_KEY, JSON.stringify(nx));
    logDay({ ok, ms: ms || 0, deck: "kanji" });
  };

  const advance = () => setPos((x) => x + 1);

  const answer = (k) => {
    if (picked || !cur) return;
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    setPicked(k);
    const ok = k.c === cur.c;
    save(cur, ok, thinkRef.current);
    setTotal((t) => t + 1);
    if (ok) setHits((h) => h + 1);
    else {
      /* A missed character comes back later in the same lesson as the same kind of
         question. Requeued as a proper step — inserting a bare kanji here is what broke
         the previous version's queue. */
      const m = (missRef.current[cur.c] || 0) + 1;
      missRef.current[cur.c] = m;
      if (m <= 2) setQueue((q) => {
        const n = q.slice();
        n.splice(Math.min(pos + 4, n.length), 0, { k: cur, mode, wave: 9 });
        return n;
      });
    }
    // no auto-advance — the reveal below is the teaching, and it is read at the user's pace
  };

  const learnDone = () => {
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    save(cur, true, thinkRef.current);
    advance();
  };

  const tapPair = (k, side) => {
    if (pairs.done[k.c]) return;
    // Either column may go first. The first tap arms a side; the second resolves against
    // it. Tapping the same side again just moves the selection.
    if (!pairs.sel || pairs.side === side) {
      setPairs((s2) => ({ ...s2, sel: k.c, side }));
      return;
    }
    const ok = pairs.sel === k.c;
    if (ok) {
      const done = { ...pairs.done, [k.c]: true };
      setPairs({ sel: null, side: null, done });
      setHits((h) => h + 1); setTotal((t) => t + 1);
      save(k, true, 0);
      if (Object.keys(done).length >= step.pool.length) setTimeout(advance, 500);
    } else {
      setTotal((t) => t + 1);
      save(k, false, 0);
      setPairs((s2) => ({ ...s2, sel: null, side: null }));
    }
  };

  if (!data) return <div className="tc-empty">Loading kanji…</div>;

  /* ── session ── */
  if (view === "session" && step) {
    const pct = queue.length ? (pos / queue.length) * 100 : 0;
    return (
      <div className="tc-kanji">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: pct + "%" }} /></div>
          <span className="tc-progtext">{pos} / {queue.length}</span>
          <button className="tc-fchip" onClick={() => setView("home")}>Quit</button>
        </div>

        {mode === "match" ? (
          <div className="tc-kmatch">
            <p className="tc-kprompt">Tap the matching pairs</p>
            <div className="tc-kmatchgrid">
              <div className="tc-kmatchcol">
                {step.pool.map((k) => (
                  <button key={k.c} disabled={!!pairs.done[k.c]}
                    className={"tc-kmatchbtn" + (pairs.done[k.c] ? " is-done" : "") + (pairs.sel === k.c && pairs.side === "left" ? " is-sel" : "")}
                    onClick={() => tapPair(k, "left")}>
                    <span className="tc-kmatchkanji">{k.c}</span>
                  </button>
                ))}
              </div>
              <div className="tc-kmatchcol">
                {right.map((k) => (
                  <button key={k.c} disabled={!!pairs.done[k.c]}
                    className={"tc-kmatchbtn" + (pairs.done[k.c] ? " is-done" : "") + (pairs.sel === k.c && pairs.side === "right" ? " is-sel" : "")}
                    onClick={() => tapPair(k, "right")}>
                    {k.m[0]}
                  </button>
                ))}
              </div>
            </div>
            {/* A matching round only clears when all five are paired, so without this a
                learner who cannot place one of them is stuck with nothing but Quit. */}
            <button className="tc-btn tc-btn-sm" onClick={advance}>Skip this round</button>
          </div>
        ) : mode === "learn" ? (
          <>
            <div className={"tc-card" + (flipped ? " is-flipped" : "")}
              onClick={() => { if (!flipped && thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current; setFlipped((f) => !f); }}
              role="button" tabIndex={0} aria-label="Kanji card, tap to flip">
              <div className="tc-card-inner">
                <div className="tc-face tc-front">
                  <span className="tc-kindchip">{cur.f ? "#" + cur.f + " most used" : "new"}</span>
                  {cur.e && <div className="tc-kemoji">{cur.e}</div>}
                  <div className="tc-kanjibig">{cur.c}</div>
                  <span className="tc-flipcue">meaning? reading? then tap</span>
                </div>
                <div className="tc-face tc-back">
                  <div className="tc-kanjimid">{cur.e ? cur.e + " " : ""}{cur.c}</div>
                  <div className="tc-meaning tc-meaning-lg">{cur.m.join(", ")}</div>
                  {cur.on.length > 0 && <div className="tc-kanjiread"><b>音</b> {readingList(cur.on)}</div>}
                  {cur.kun.length > 0 && <div className="tc-kanjiread"><b>訓</b> {readingList(cur.kun)}</div>}
                  {(deckMap.get(cur.c) || {}).words && (
                    <p className="tc-kwords">
                      {deckMap.get(cur.c).words.slice(0, 3).map((w) => (
                        <span key={w.id} className="tc-kword"><b>{w.term}</b> {shortMeaning(w.meaning)}</span>
                      ))}
                    </p>
                  )}
                  <span className="tc-timetag">{cur.s} strokes{cur.g && cur.g <= 6 ? " · grade " + cur.g : ""}{cur.j ? " · N" + cur.j : ""}</span>
                </div>
              </div>
            </div>
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-sm" onClick={() => speak(cur)}>🔊 Say it</button>
              {!flipped
                ? <button className="tc-btn tc-btn-primary" onClick={() => { if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current; setFlipped(true); }}>Show</button>
                : <button className="tc-btn tc-btn-primary" onClick={learnDone}>Got it — next</button>}
            </div>
          </>
        ) : (
          <div className="tc-kquiz">
            <p className="tc-kprompt">
              {/* was step.mode: an audio step converted by "can't listen now" has mode
                  "meaning" but step.mode "audio", so this branch never fired and the
                  question showed the wrong prompt over English options. */}
              {mode === "cloze" ? "Which kanji completes the word?"
                : mode === "meaning" ? "What does this mean?"
                : mode === "reading" ? "How is this read?"
                : mode === "audio" ? "Which character did you hear?"
                : "Which character is this?"}
            </p>
            <div className="tc-kstem">
              {mode === "cloze" ? (
                <div className="tc-kcloze">
                  <span className="tc-kclozeword">
                    {cloze
                      ? Array.from(cloze.term).map((ch, ix) =>
                          ch === cur.c
                            ? <b key={ix} className="tc-kblank">〇</b>
                            : <span key={ix}>{ch}</span>)
                      : cur.m[0]}
                  </span>
                  {cloze && <span className="tc-kclozeen">{shortMeaning(cloze.meaning)}</span>}
                </div>
              ) : mode === "build" ? <span className="tc-kstemword">{cur.m.join(", ")}</span>
                : mode === "audio" ? (
                  <div className="tc-kaudiowrap">
                    <button className="tc-kaudio" onClick={() => speak(cur)} aria-label="Play again">🔊</button>
                    <button className="tc-btn tc-btn-sm" onClick={() => setNoAudio(true)}>Can't listen now</button>
                  </div>
                ) : (
                  <>
                    <span className="tc-kanjimid">{cur.c}</span>
                    <button className="tc-kaudiosm" onClick={() => speak(cur)} aria-label="Play">🔊</button>
                  </>
                )}
            </div>
            <div className={"tc-kopts" + (mode === "build" || mode === "audio" || mode === "cloze" ? " is-tiles" : "")}>
              {choices.map((k) => {
                const state = !picked ? ""
                  : k.c === cur.c ? " is-right"
                  : k.c === picked.c ? " is-wrong" : " is-dim";
                return (
                  <button key={k.c} className={"tc-kopt" + state} disabled={!!picked} onClick={() => answer(k)}>
                    {/* mode, not step.mode — an audio step converted by "can't listen now"
                        keeps step.mode "audio" and would render tiles over an English question */}
                    {mode === "meaning" ? k.m[0]
                      : mode === "reading"
                        ? (() => { const r = readingLabel(k); return <><b className="tc-kmark">{r.mark}</b>{r.text}</>; })()
                      : <span className="tc-kopttile">{k.c}</span>}
                  </button>
                );
              })}
            </div>
            {picked && mode === "cloze" && cloze && (
              <p className={"tc-kcorrect" + (picked.c === cur.c ? " is-ok" : "")}>
                <b>{cloze.term}</b> {cloze.reading ? "· " + cloze.reading + " " : ""}
                {shortMeaning(cloze.meaning)}
              </p>
            )}
            {picked && (
              <p className={"tc-kcorrect" + (picked.c === cur.c ? " is-ok" : "")}>
                <b>{cur.c}</b> {cur.m.join(", ")}
                {cur.kun.length ? " · 訓 " + readingList(cur.kun) : ""}
                {cur.on.length ? " · 音 " + readingList(cur.on) : ""}
                {(deckMap.get(cur.c) || {}).words ? " — " + deckMap.get(cur.c).words.slice(0, 2).map((w) => w.term).join("、") : ""}
              </p>
            )}
            {picked && (
              <button className="tc-btn tc-btn-primary tc-kcontinue" onClick={advance} autoFocus>
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── summary ── */
  if (view === "summary") {
    const pct = total ? Math.round((hits / total) * 100) : 0;
    return (
      <div className="tc-kanji">
        <div className="tc-done">
          <p className="tc-eyebrow">Lesson complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{hits} right of {total} questions</p>
          <div className="tc-donebtns">
            <button className="tc-btn tc-btn-primary" onClick={startSession}>Another lesson</button>
            <button className="tc-btn" onClick={() => setView("home")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── home ── */
  const pctAll = all.length ? (mastered / all.length) * 100 : 0;
  const nextUp = unlocked.filter((k) => !(((stats[k.c] || {}).seen || 0) > 0)).slice(0, 8);
  return (
    <div className="tc-kanji">
      <div className="tc-kanjihero">
        <img className="tc-mascot" src={MASCOT_GIFS[mastered > 0 ? "proud" : "waiting"]} width={64} height={60} alt="" draggable="false" />
        <div className="tc-kanjiheroright">
          <p className="tc-kanjicount"><b>{mastered}</b> <span>/ {all.length} jōyō kanji</span></p>
          <div className="tc-kanjibar"><div className="tc-kanjibarfill" style={{ width: Math.max(pctAll, mastered ? 0.4 : 0) + "%" }} /></div>
          <p className="tc-kanjisub">
            {mastered === 0 ? "Every kanji in the language, your own vocabulary first."
              : pctAll.toFixed(1) + "% mastered · " + started + " started"}
          </p>
        </div>
      </div>
      <button className="tc-btn tc-btn-primary tc-start" onClick={startSession}>Start lesson · 6 kanji</button>
      <p className="tc-smarthint">
        Practising {Math.min(6, unlocked.length)} characters a lesson, drawn from {unlocked.length} unlocked.
        {" "}The set only grows as characters go solid — {KANJI_BATCH - (mastered % KANJI_BATCH)} more
        mastered opens the next {KANJI_BATCH}.
      </p>
      {reviewInfo.tracked > 0 && (
        <p className="tc-smarthint">
          Tracked: {reviewInfo.tracked} characters, {reviewInfo.reps} reviews saved.
          {reviewInfo.dueNow > 0
            ? " " + reviewInfo.dueNow + " due now."
            : reviewInfo.nextDue ? " Next due " + reviewInfo.nextDue + "." : ""}
        </p>
      )}
      <p className="tc-smarthint">
        {unlocked.length} unlocked. {deckMap.size > 0
          ? "Ordered by your own vocabulary first — " + deckMap.size + " of these appear in words in your deck."
          : "Ordered by how often each character appears in real Japanese."}
      </p>
      {/* The collection. Every character met, newest last, tinted by how solid it is —
          the point is watching it fill up, which a counter alone does not give you.
          Tapping one opens what it means, how it sounds, and the words you already have
          that use it. */}
      {collected.length > 0 && (
        <div className="tc-kanjinext">
          <p className="tc-eyebrow">your kanji · {collected.length}</p>
          <div className="tc-kgrid">
            {collected.map((k) => {
              const st = stats[k.c] || {};
              const lv = st.level || 0;
              const tier = lv >= 4 ? " is-solid" : lv >= 2 ? " is-ok" : " is-new";
              return (
                <button key={k.c} className={"tc-kcell" + tier} onClick={() => setInspect(k)}
                  title={k.m.slice(0, 2).join(", ")}>
                  {k.c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inspect && (
        <div className="tc-kmodal" onClick={() => setInspect(null)}>
          <div className="tc-kmodalcard" onClick={(ev) => ev.stopPropagation()}>
            <button className="tc-inx" onClick={() => setInspect(null)} aria-label="close">×</button>
            {inspect.e && <div className="tc-kemoji">{inspect.e}</div>}
            <div className="tc-kanjibig">{inspect.c}</div>
            <button className="tc-btn tc-btn-sm" onClick={() => speak(inspect)}>🔊 How it sounds</button>
            <div className="tc-meaning tc-meaning-lg">{inspect.m.join(", ")}</div>
            {inspect.on.length > 0 && <div className="tc-kanjiread"><b>音</b> {readingList(inspect.on)}</div>}
            {inspect.kun.length > 0 && <div className="tc-kanjiread"><b>訓</b> {readingList(inspect.kun)}</div>}
            {(deckMap.get(inspect.c) || {}).words && (
              <p className="tc-kwords">
                {deckMap.get(inspect.c).words.slice(0, 5).map((w) => (
                  <span key={w.id} className="tc-kword"><b>{w.term}</b> {shortMeaning(w.meaning)}</span>
                ))}
              </p>
            )}
            <span className="tc-timetag">
              {inspect.s} strokes{inspect.g && inspect.g <= 6 ? " · grade " + inspect.g : ""}{inspect.j ? " · N" + inspect.j : ""}
              {inspect.f ? " · #" + inspect.f + " most used" : ""}
            </span>
            {(() => {
              const st = stats[inspect.c] || {};
              if (!st.seen) return null;
              const due = st.fsrs && st.fsrs.due;
              const d = due ? Math.round((due - Date.now()) / 86400000) : null;
              return (
                <p className="tc-kstat">
                  seen {st.seen}× · {Math.round(((st.correct || 0) / st.seen) * 100)}% right
                  {d != null ? " · next review " + (d <= 0 ? "now" : d === 1 ? "tomorrow" : "in " + d + " days") : ""}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {nextUp.length > 0 && (
        <div className="tc-kanjinext">
          <p className="tc-eyebrow">next up</p>
          <div className="tc-kanjirow">
            {nextUp.map((k) => <span key={k.c} className="tc-kanjichip" title={k.m.join(", ")}>{k.c}</span>)}
          </div>
        </div>
      )}
      <p className="tc-kanjicredit">
        Kanji data: KANJIDIC2 · Electronic Dictionary Research and Development Group · CC BY-SA 4.0
      </p>
    </div>
  );
}

/* ── conjugation engine ──
   Class teaches this as rules, not memorised tables (FACT 4-3): godan stems shift across
   the あいうえお rows, ichidan drops る, する/くる are the two irregulars. So the forms are
   computed rather than hand-written 8× per word — which also means adding a verb to
   CONJ_BANK gives you all 8 cells for free.
   Validated against the 33 hand-authored negatives already in CONJ_BANK: all 33 match. */
const CONJ_KEY = "jpn101:conj";



const CONJ_LENGTHS = [10, 20, 40, "all"];

function ConjDrill() {
  const [filter, setFilter] = useState("all");
  const [forms, setForms] = useState(() => new Set(CONJ_FORMS.map((f) => f.id)));   // whole grid by default
  const [len, setLen] = useState(20);
  const [view, setView] = useState("setup");     // setup | session | summary
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [passed, setPassed] = useState(() => new Set());
  const [firstTry, setFirstTry] = useState(() => new Set());
  const [struggled, setStruggled] = useState(() => new Set());
  const missRef = useRef({});
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
  const startedRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { (async () => {
    try { const r = await sGet(CONJ_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  const words = useMemo(
    () => (filter === "all" ? CONJ_BANK : CONJ_BANK.filter((w) => w.type === filter)),
    [filter]
  );
  // every (word × selected form) pair is its own drillable item with its own history
  const items = useMemo(() => {
    const out = [];
    words.forEach((w) => {
      const c = conjugate(w.reading, w.type);
      if (!c) return;
      CONJ_FORMS.forEach((f) => {
        if (!forms.has(f.id)) return;
        out.push({ id: w.reading + "|" + f.id, w, f, answer: c[f.pol][f.key] });
      });
    });
    return out;
  }, [words, forms]);

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  const needC = (st, now) => statNeed(st, now) + (st.seen ? 0 : Math.random());

  const startSession = useCallback((subset) => {
    const now = Date.now();
    const pool0 = subset && subset.length ? subset : items;
    if (!pool0.length) return;
    const ordered = pool0
      .map((x) => ({ x, k: needC(getS(statsRef.current, x.id), now) + Math.random() * 1.2 }))
      .sort((a, b) => b.k - a.k).map((o) => o.x);
    const pool = len === "all" ? ordered : ordered.slice(0, len);
    setQueue(pool); setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {}; startedRef.current = Date.now(); setElapsed(0);
    setFlipped(false); setView("session");
  }, [items, len]);

  const cur = queue[pos] || null;
  const done = view === "session" && queue.length > 0 && pos >= queue.length;
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, view]);
  useEffect(() => { if (done) { setElapsed(Date.now() - startedRef.current); setView("summary"); } }, [done]);

  const grade = (ok) => {
    if (!cur) return;
    const m = statsRef.current, s0 = getS(m, cur.id), think = thinkRef.current;
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (ok ? 1 : 0),
      level: ok ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: ok ? (s0.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(s0, ok, think, Date.now()),
      ms: (s0.ms || 0) + (think || 0), msN: (s0.msN || 0) + (think ? 1 : 0) };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(CONJ_KEY, JSON.stringify(nx));
    if (ok) {
      if (!missRef.current[cur.id]) setFirstTry((p) => { const n = new Set(p); n.add(cur.id); return n; });
      setPassed((p) => { const n = new Set(p); n.add(cur.id); return n; });
      setQueue((q) => q.filter((x, i) => i <= pos || x.id !== cur.id));
    } else {
      setStruggled((p) => { const n = new Set(p); n.add(cur.id); return n; });
      const c = (missRef.current[cur.id] || 0) + 1;
      missRef.current[cur.id] = c;
      if (c <= 2) setQueue((q) => { const n = q.slice(); n.splice(Math.min(pos + 4, n.length), 0, cur); return n; });
    }
    setFlipped(false); setPos((p) => p + 1);
  };

  const toggleForm = (id) => setForms((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n.size ? n : new Set(["p-pn"]);        // never leave nothing to ask
  });
  const mastered = items.filter((x) => getS(stats, x.id).level >= 4).length;
  const avgSecs = (st) => (st.msN ? (st.ms / st.msN / 1000).toFixed(1) + "s" : "—");

  // ── session ──
  if (view === "session" && cur) {
    const meta = CONJ_TYPES[cur.w.type];
    return (
      <div className="tc-conj">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
          <span className="tc-progtext">{passed.size} / {poolSize}</span>
          <button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>
        </div>
        <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={() => setFlipped((f) => !f)}
             role="button" tabIndex={0} aria-label="Conjugation card, click to flip">
          <div className="tc-card-inner">
            <div className="tc-face tc-front">
              <span className="tc-kindchip">{meta.chip}</span>
              <div className="tc-term">{cur.w.dict}</div>
              <div className="tc-reading-front">{cur.w.reading} · {cur.w.meaning}</div>
              <div className="tc-conjask">→ {cur.f.ask}?</div>
              <span className="tc-flipcue">tap to flip</span>
            </div>
            <div className="tc-face tc-back">
              <div className="tc-conjanswer">{cur.answer} <SpeakBtn text={cur.answer} /></div>
              <div className="tc-conjhow">{cur.f.ask}</div>
              <div className="tc-conjrule">{meta.rule}</div>
              {cur.w.note && <p className="tc-conjnote">⚠️ {cur.w.note}</p>}
            </div>
          </div>
        </div>
        <div className="tc-grade">
          {!flipped ? (
            <button type="button" className="tc-btn tc-btn-wide"
              onClick={(e) => { e.stopPropagation(); thinkRef.current = Date.now() - shownRef.current; setFlipped(true); }}>Reveal answer</button>
          ) : (
            <>
              <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
              <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── summary ──
  if (view === "summary") {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missed = items.filter((x) => struggled.has(x.id));
    return (
      <div className="tc-conj">
        <div className="tc-done">
          <p className="tc-eyebrow">Session complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{firstTry.size} nailed first try{missed.length ? ` · ${missed.length} missed` : ""} · {poolSize} prompts</p>
          <p className="tc-donesub">{fmtSecs(elapsed)} total · {(elapsed / (passed.size || 1) / 1000).toFixed(1)}s each</p>
          {missed.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {missed.slice(0, 6).map((x) => {
                const st = getS(stats, x.id);
                return (
                  <div key={x.id} className="tc-kanaweakrow">
                    <span className="tc-kanaweakch" style={{ fontSize: 18 }}>{x.w.dict}</span>
                    <span className="tc-kanaweakr">{x.f.ask}</span>
                    <span className="tc-kanaweakmeta">{st.seen ? Math.round((st.correct / st.seen) * 100) + "%" : "—"} · {avgSecs(st)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tc-donebtns">
            {missed.length > 0 && <button className="tc-btn tc-btn-primary" onClick={() => startSession(missed)}>Review the {missed.length} you missed</button>}
            <button className="tc-btn" onClick={() => startSession()}>Go again</button>
            <button className="tc-btn" onClick={() => setView("setup")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // ── setup ──
  return (
    <div className="tc-conj">
      <div className="tc-conjintro">
        <h2 className="tc-conjtitle">Conjugation</h2>
        <p className="tc-conjsub">The full grid from class — present/past × positive/negative, polite and plain.
          ① ichidan: drop る · ⑤ godan: shift across the あいうえお rows ·
          い-adj: 〜く〜 · noun/な-adj: 〜じゃ〜</p>
        <div className="tc-conjchips" role="group" aria-label="Word type">
          {CONJ_FILTERS.map(([id, label]) => (
            <button key={id} className={"tc-conjchip" + (filter === id ? " is-on" : "")}
              onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="tc-conjchips" role="group" aria-label="Which forms to drill">
          {CONJ_FORMS.map((f) => (
            <button key={f.id} className={"tc-conjchip" + (forms.has(f.id) ? " is-on" : "")}
              aria-pressed={forms.has(f.id)} onClick={() => toggleForm(f.id)}>{f.ask}</button>
          ))}
          <button className="tc-conjchip"
            onClick={() => setForms(forms.size === CONJ_FORMS.length ? new Set(["p-pn"]) : new Set(CONJ_FORMS.map((f) => f.id)))}>
            {forms.size === CONJ_FORMS.length ? "just one" : "all 8"}
          </button>
        </div>
        <div className="tc-kanaseg tc-kanalen">
          <span className="tc-kanalenlabel">session</span>
          {CONJ_LENGTHS.map((n) => (
            <button key={n} className={"tc-fchip" + (len === n ? " is-on" : "")} onClick={() => setLen(n)}>
              {n === "all" ? `all ${items.length}` : n}
            </button>
          ))}
        </div>
        <button className="tc-btn tc-btn-wide" onClick={() => startSession()}>
          Start · {len === "all" ? items.length : Math.min(len, items.length)} prompts
        </button>
        <p className="tc-conjsub">{mastered}/{items.length} mastered · {words.length} words × {forms.size} form{forms.size === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── FREQ 10K ───────────────────────────
   Long-game deck: high-frequency everyday words, drilled with a daily
   new-word quota + SRS, separate from the class deck. Tier 1 below;
   later tiers get appended with FREQ_VERSION bumped. Every review
   stores seen/correct/level/ease AND think-time (ms before reveal). */
/* ── the 10k word list ──
   Fetched rather than bundled, and its PROGRESS is stored separately from its CONTENT.
   Ten thousand full card records in localStorage is well over a megabyte that would then
   be re-uploaded on every cloud sync; the words are static data and belong in a file,
   while only the handful you have actually studied needs saving. This is the same split
   the Kanji tab already uses. */
let _freqPromise = null;
function loadFreqWords() {
  if (_freqPromise) return _freqPromise;
  _freqPromise = (async () => {
    let cached = null;
    try { cached = JSON.parse(window.localStorage.getItem("jpn101:freqData") || "null"); } catch (e) {}
    try {
      const r = await fetch("/freq.json", { cache: "no-cache" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const d = await r.json();
        if (d && d.words) {
          try { window.localStorage.setItem("jpn101:freqData", JSON.stringify(d)); } catch (e) {}
          return d;
        }
      }
    } catch (e) { /* offline — the cached copy is the point */ }
    return cached;
  })();
  return _freqPromise;
}

/* Progress used to live inline on each card. Anything already recorded is folded into the
   new keyed-by-term shape so no study history is lost. */
function migrateFreqStats(raw) {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  const out = {};
  for (const c of raw) {
    if (!c || !c.term || !((c.seen || 0) > 0)) continue;
    out[c.term] = {
      seen: c.seen || 0, correct: c.correct || 0, level: c.level || 0, streak: c.streak || 0,
      last: c.last || 0, ease: c.ease || 1, fsrs: c.fsrs || null, ms: c.ms || 0, msN: c.msN || 0,
    };
  }
  return out;
}

const FREQ_KEY = "jpn101:freq", FREQ_VER_KEY = "jpn101:freqVersion", FREQ_QUOTA_KEY = "jpn101:freqQuota";



function fmtIn(ms) {
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60000);
  if (m < 60) return "in ~" + Math.max(1, m) + "m";
  const h = Math.round(m / 60);
  if (h < 48) return "in ~" + h + "h";
  return "in ~" + Math.round(h / 24) + "d";
}



/* ── mount ── */
import ReactDOM from "react-dom/client";
ReactDOM.createRoot(document.getElementById("root")).render(<JpnFlashcards />);
