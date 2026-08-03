// Build the video index: every upload from the curated channels, filtered and scored,
// written to data/videos.json.
//
//   node tools/yt-index.mjs            full rebuild
//   node tools/yt-index.mjs --since=90 only videos published in the last 90 days
//
// Quota: playlistItems and videos.list are 1 unit per 50 items, so ~2 units per 50
// videos. Indexing 5,000 videos costs about 200 of the 10,000 units allowed per day.
// No search.list here — discovery is a separate, expensive step (tools/yt-discover.mjs).
//
// On difficulty: the honest ceiling. Subtitle text is unreachable — YouTube gates caption
// content behind a proof-of-origin token, and the API only lets you download captions for
// videos you own. So difficulty is estimated from the Japanese that IS reachable (the
// description), the writing-system mix, the video's length, and the channel's anchor.
// Every row records which signals fired and a confidence, so the app can tell a measured
// score from a guess. Real ratings in the app move it from there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNELS, SILENT_TITLE, MAX_SECONDS } from "./yt-channels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const K = process.env.YOUTUBE_API_KEY;
if (!K) { console.error("no YOUTUBE_API_KEY in .env.local"); process.exit(1); }

const sinceArg = (process.argv.find((a) => a.startsWith("--since=")) || "").split("=")[1];
const SINCE = sinceArg ? Date.now() - Number(sinceArg) * 86400000 : 0;

let units = 0, calls = 0;
async function api(p, cost) {
  units += cost; calls++;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://www.googleapis.com/youtube/v3/" + p + "&key=" + K);
    const b = await r.json().catch(() => ({}));
    if (r.ok) return b;
    const msg = (b.error && b.error.message) || String(r.status);
    if (/quota/i.test(msg)) { console.error("\nQUOTA EXHAUSTED — stopping cleanly.\n" + msg); process.exit(2); }
    if (attempt === 3) throw new Error(msg.slice(0, 120));
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
}

/* ── the learner's own vocabulary, for scoring how much of a description they'd know ── */
const app = fs.readFileSync(path.join(ROOT, "JpnFlashcards.jsx"), "utf8");
const DECK = new Set();
for (const m of app.matchAll(/\bterm:\s*"([^"]+)"/g)) DECK.add(m[1]);
for (const m of app.matchAll(/\breading:\s*"([^"]+)"/g)) DECK.add(m[1]);
const addStem = (t) => {
  if (/する$/.test(t) && t.length >= 4) DECK.add(t.slice(0, -2));
  else if (/[いるうくぐすつぬぶむ]$/.test(t) && t.length >= 3) DECK.add(t.slice(0, -1));
};
[...DECK].forEach(addStem);

const isKanji = (c) => /[一-龯]/.test(c);
const isJa = (c) => /[぀-ヿ一-龯]/.test(c);

// Share of the Japanese words in a text that are already in the deck. Same longest-match
// approach the app uses on pasted text, so the two numbers mean the same thing.
function known(text) {
  let covered = 0, total = 0, afterMatch = false;
  const longest = (i) => {
    for (let L = Math.min(12, text.length - i); L >= 1; L--) if (DECK.has(text.slice(i, i + L))) return L;
    return 0;
  };
  for (let i = 0; i < text.length;) {
    if (!isJa(text[i])) { i++; continue; }
    const hit = longest(i);
    if (hit) { covered++; total++; i += hit; afterMatch = true; continue; }
    if (!isKanji(text[i])) {
      let j = i; while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;
      if (j === i) j = i + 1;
      total++; if (afterMatch) covered++;
      i = j; afterMatch = false; continue;
    }
    let j = i + 1;
    while (j < text.length && isKanji(text[j]) && !longest(j)) j++;
    while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;
    total++; i = j; afterMatch = false;
  }
  return total >= 8 ? { pct: covered / total, tokens: total } : null;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const iso = (d) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
};

function scoreDifficulty(ch, v, sec) {
  const signals = [];
  let score = ch.anchor, conf = 0.25;

  const jaText = (v.snippet.description || "").split(/\n/).filter((l) => /[぀-ヿ一-龯]/.test(l)).join(" ");
  const k = jaText.length >= 40 ? known(jaText) : null;
  if (k) {
    // 90% known ≈ comfortable, 55% ≈ well beyond, mapped onto the app's 0-100 scale.
    // Blended with the channel anchor rather than replacing it: a description samples the
    // blurb, not the dialogue. Children's shows get almost none of this weight — their
    // descriptions are marketing copy stuffed with words no course teaches, which scored
    // simple cartoons as harder than the news.
    const implied = clamp(100 - (k.pct - 0.5) * 160, 5, 95);
    const w = ch.audience === "kids" ? 0.12 : 0.3;
    score = score * (1 - w) + implied * w;
    conf = clamp(0.35 + Math.min(k.tokens, 120) / 300, 0.35, 0.7);
    signals.push("desc" + Math.round(k.pct * 100));
  }

  // Kanji density in the title: kana-only titles skew to children's and beginner content.
  const title = v.snippet.title || "";
  const jaChars = [...title].filter(isJa).length;
  if (jaChars >= 6) {
    const density = [...title].filter(isKanji).length / jaChars;
    score += (density - 0.3) * 22;
    signals.push("kanji" + Math.round(density * 100));
  }

  // Long videos are rarely graded beginner material.
  if (sec > 1800) { score += 4; signals.push("long"); }
  if (sec < 240) { score -= 2; signals.push("short"); }

  if (ch.audience === "kids") { score -= 3; signals.push("kids"); }

  return { difficulty: Math.round(clamp(score, 3, 97)), confidence: Math.round(conf * 100) / 100, signals };
}

/* ── pull every upload for a channel ── */
async function uploadsOf(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await api(`channels?part=contentDetails,statistics&id=${ids.slice(i, i + 50).join(",")}&maxResults=50`, 1);
    for (const c of r.items || []) out[c.id] = c.contentDetails.relatedPlaylists.uploads;
  }
  return out;
}

async function videoIds(playlistId, cap = 400) {
  const ids = [];
  let page = "";
  while (ids.length < cap) {
    const r = await api(`playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}${page ? "&pageToken=" + page : ""}`, 1);
    for (const it of r.items || []) {
      const at = Date.parse(it.contentDetails.videoPublishedAt || 0) || 0;
      if (SINCE && at && at < SINCE) return ids;          // uploads come newest-first
      if (it.contentDetails.videoId) ids.push(it.contentDetails.videoId);
    }
    page = r.nextPageToken || "";
    if (!page) break;
  }
  return ids;
}

/* ── main ── */
const rows = [];
const skipped = { short: 0, lang: 0, live: 0, noJa: 0, silent: 0, tooLong: 0 };
const uploads = await uploadsOf(CHANNELS.map((c) => c.id));

for (const ch of CHANNELS) {
  const pl = uploads[ch.id];
  if (!pl) { console.error("  !! no uploads playlist for " + ch.name); continue; }
  let ids;
  try { ids = await videoIds(pl); } catch (e) { console.error("  !! " + ch.name + ": " + e.message); continue; }
  let kept = 0;

  for (let i = 0; i < ids.length; i += 50) {
    const r = await api(`videos?part=snippet,contentDetails,statistics&id=${ids.slice(i, i + 50).join(",")}&maxResults=50`, 1);
    for (const v of r.items || []) {
      const sec = iso(v.contentDetails.duration);
      const title = v.snippet.title || "";

      if (sec < 60 || /#shorts?\b/i.test(title)) { skipped.short++; continue; }
      if (SILENT_TITLE.test(title)) { skipped.silent++; continue; }
      if (sec > MAX_SECONDS) { skipped.tooLong++; continue; }
      if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") { skipped.live++; continue; }
      const lang = v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage || "";
      if (lang && !/^ja/i.test(lang)) { skipped.lang++; continue; }
      // A title with no Japanese at all, on a channel that isn't explicitly a JP channel,
      // is usually an English-explanation video that slipped into an immersion channel.
      if (!/[぀-ヿ一-龯]/.test(title) && ch.audience !== "kids" && !(ch.tags || []).includes("ci")) { skipped.noJa++; continue; }

      const d = scoreDifficulty(ch, v, sec);
      rows.push({
        id: v.id,
        t: title.slice(0, 140),
        ch: ch.name,
        chId: ch.id,
        sec,
        at: Date.parse(v.snippet.publishedAt) || 0,
        d: d.difficulty,
        c: d.confidence,
        sig: d.signals.join(","),
        aud: ch.audience,
        tags: ch.tags,
        cc: v.contentDetails.caption === "true" ? 1 : 0,
        desc: (v.snippet.description || "").slice(0, 1200),   // raw cache only; dropped when packing
        views: Number(v.statistics.viewCount || 0),
      });
      kept++;
    }
  }
  console.error(`  ${String(kept).padStart(4)} kept  ${ch.name}`);
}

rows.sort((a, b) => a.d - b.d || b.views - a.views);
const out = {
  v: 1,
  builtAt: Date.now(),
  note: "Difficulty is estimated, not measured from subtitles — see tools/yt-index.mjs. c = confidence 0-1.",
  channels: CHANNELS.length,
  videos: rows,
};
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/videos.json"), JSON.stringify(out));

const band = (lo, hi) => rows.filter((r) => r.d >= lo && r.d < hi).length;
console.error(`\n${rows.length} videos indexed from ${CHANNELS.length} channels`);
console.error(`skipped: ${skipped.short} short/Shorts, ${skipped.lang} non-Japanese audio, ${skipped.silent} silent/BGM, ${skipped.tooLong} over 2h, ${skipped.live} live, ${skipped.noJa} no Japanese in title`);
console.error(`bands: <20 ${band(0, 20)} | 20-34 ${band(20, 35)} | 35-49 ${band(35, 50)} | 50-64 ${band(50, 65)} | 65+ ${band(65, 101)}`);
console.error(`kids ${rows.filter((r) => r.aud === "kids").length} · captions ${rows.filter((r) => r.cc).length} · measured-from-text ${rows.filter((r) => /desc/.test(r.sig)).length}`);
console.error(`quota used: ${units} units in ${calls} calls (10,000/day)`);
console.error(`written: data/videos.json (${(fs.statSync(path.join(ROOT, "data/videos.json")).size / 1024).toFixed(0)} KB)`);
