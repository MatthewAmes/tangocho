// Find candidate channels for the immersion index.
//
// search.list costs 100 quota units a call against a 10,000/day budget, so this runs a
// fixed set of queries rather than anything open-ended, and prints a table for a human to
// approve. Nothing here writes to the index — picking channels is a judgement call, and
// the last time channel ids were resolved automatically the result was a Polish travel
// vlog filed under Japanese comprehensible input.
//
//   node tools/yt-discover.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const K = process.env.YOUTUBE_API_KEY;
if (!K) { console.error("no YOUTUBE_API_KEY in .env.local"); process.exit(1); }

let units = 0;
const api = async (p, cost) => {
  units += cost;
  const r = await fetch("https://www.googleapis.com/youtube/v3/" + p + "&key=" + K);
  const b = await r.json();
  if (b.error) throw new Error(b.error.message);
  return b;
};

// Japanese-language queries find Japanese-language channels; English ones find channels
// that explain in English, which is explicitly not wanted here.
const QUERIES = [
  "日本語 聞き流し 初級", "やさしい日本語 会話", "日本語 リスニング 初心者",
  "comprehensible japanese", "japanese listening practice slow",
  "日本語 vlog 簡単", "日本語 podcast 初級", "簡単な日本語 ストーリー",
  "japanese immersion beginner", "日本語 で 話す ゆっくり",
  "japanese comprehensible input intermediate", "子供 アニメ 日本語",
  "日本語 で 説明 文化", "japanese shadowing practice", "日本語 昔話 朗読",
];

const seen = new Map();
for (const q of QUERIES) {
  try {
    const r = await api(`search?part=snippet&type=channel&maxResults=10&relevanceLanguage=ja&q=${encodeURIComponent(q)}`, 100);
    for (const it of r.items || []) {
      const id = it.snippet.channelId || (it.id && it.id.channelId);
      if (id && !seen.has(id)) seen.set(id, { id, q });
    }
  } catch (e) { console.error("query failed:", q, e.message.slice(0, 60)); }
}
console.error(`${seen.size} candidate channels from ${QUERIES.length} queries (${units} units)`);

// one batched channels.list for the stats that decide whether a channel is worth indexing
const ids = [...seen.keys()];
const rows = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await api(`channels?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(",")}&maxResults=50`, 1);
  for (const c of r.items || []) {
    rows.push({
      id: c.id,
      title: c.snippet.title,
      country: c.snippet.country || "",
      subs: Number(c.statistics.subscriberCount || 0),
      videos: Number(c.statistics.videoCount || 0),
      uploads: c.contentDetails.relatedPlaylists.uploads,
      desc: (c.snippet.description || "").replace(/\s+/g, " ").slice(0, 90),
      found: seen.get(c.id).q,
    });
  }
}
rows.sort((a, b) => b.subs - a.subs);
fs.writeFileSync(path.join(ROOT, "tools/.yt-candidates.json"), JSON.stringify(rows, null, 1));
console.error(`\ntotal quota used: ${units} units\n`);
for (const r of rows) {
  if (r.videos < 20 || r.subs < 3000) continue;          // too thin to be worth indexing
  console.log(
    r.id + "  " +
    String(r.subs).padStart(9) + " subs  " +
    String(r.videos).padStart(5) + " vids  " +
    (r.country || "--").padEnd(3) + " " +
    r.title.slice(0, 34)
  );
}
