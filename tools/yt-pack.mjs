// Select the best videos from the raw index and pack them small enough to ship.
//
//   node tools/yt-pack.mjs
//
// Reads tools/.yt-raw.json (whatever yt-index.mjs last downloaded) and writes
// data/videos.json. Separate from indexing so the selection rules can be re-tuned
// without spending another unit of API quota.
//
// Two things drive the shape of the output:
//   - A per-channel cap. Four channels alone had 400 videos each; without a cap the
//     index becomes "whatever uploads most often", and every recommendation would come
//     from the same handful of shows.
//   - Arrays instead of objects, with channel data pulled out into its own table. Field
//     names repeated across thousands of rows were most of the 1.9MB.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNELS, SILENT_TITLE, MAX_SECONDS } from "./yt-channels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/.yt-raw.json"), "utf8"));

const PER_CHANNEL = 45;
const PER_BAND_PER_CHANNEL = 14;      // keeps one channel from owning a difficulty band
const BANDS = [[0, 20], [20, 35], [35, 50], [50, 65], [65, 101]];

// Worth-watching score. Views are log-scaled: the difference between 300 and 3,000 views
// says something, the difference between 300k and 3M says very little about whether this
// is a good ten minutes of Japanese.
const worth = (v) =>
  Math.log10(Math.max(v.views, 10)) * 1.0 +
  v.c * 2.0 +                                   // confidence in the difficulty estimate
  (v.cc ? 0.6 : 0) +                            // human-written captions
  (v.sec >= 240 && v.sec <= 2400 ? 0.5 : 0);    // long enough to sink into, short enough to finish

// Applied here too, so a re-tune can drop these without re-downloading anything.
const usable = raw.videos.filter((v) => !SILENT_TITLE.test(v.t) && v.sec <= MAX_SECONDS);
console.log((raw.videos.length - usable.length) + " dropped as silent/BGM or over 2h");
const byChannel = new Map();
for (const v of usable) {
  if (!byChannel.has(v.chId)) byChannel.set(v.chId, []);
  byChannel.get(v.chId).push(v);
}

const picked = [];
for (const [, list] of byChannel) {
  const takenInBand = new Map();
  const ranked = list.slice().sort((a, b) => worth(b) - worth(a));
  let taken = 0;
  for (const v of ranked) {
    if (taken >= PER_CHANNEL) break;
    const band = BANDS.findIndex(([lo, hi]) => v.d >= lo && v.d < hi);
    const n = takenInBand.get(band) || 0;
    if (n >= PER_BAND_PER_CHANNEL) continue;
    takenInBand.set(band, n + 1);
    picked.push(v);
    taken++;
  }
}

picked.sort((a, b) => a.d - b.d || b.views - a.views);

// channel table, referenced by index from each row
const used = [...new Set(picked.map((v) => v.chId))];
const chIdx = new Map(used.map((id, i) => [id, i]));
const chTable = used.map((id) => {
  const c = CHANNELS.find((x) => x.id === id);
  return [id, c.name, c.audience, c.tags.join(" ")];
});

// row: [videoId, title, channelIndex, seconds, publishedAt(days since epoch), difficulty,
//       confidence*100, hasCaptions, views]
const rows = picked.map((v) => [
  v.id, v.t, chIdx.get(v.chId), v.sec, Math.round(v.at / 86400000),
  v.d, Math.round(v.c * 100), v.cc, v.views,
]);

const out = {
  v: 1,
  builtAt: Date.now(),
  fields: "id,title,ch,sec,day,difficulty,confidence,captions,views",
  note: "Difficulty is ESTIMATED from the video's Japanese description, writing-system mix, "
      + "length and channel — not measured from subtitles, which YouTube does not expose. "
      + "confidence is 0-100; treat anything under 40 as a rough guess.",
  channels: chTable,
  videos: rows,
};
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
const file = path.join(ROOT, "data/videos.json");
fs.writeFileSync(file, JSON.stringify(out));

const band = (lo, hi) => picked.filter((r) => r.d >= lo && r.d < hi).length;
console.log(`${picked.length} videos kept from ${raw.videos.length} indexed, ${used.length} channels`);
console.log(`bands  <20 ${band(0, 20)} | 20-34 ${band(20, 35)} | 35-49 ${band(35, 50)} | 50-64 ${band(50, 65)} | 65+ ${band(65, 101)}`);
console.log(`kids ${picked.filter((r) => r.aud === "kids").length} · captions ${picked.filter((r) => r.cc).length}`
          + ` · median length ${Math.round(picked.map((r) => r.sec).sort((a, b) => a - b)[Math.floor(picked.length / 2)] / 60)} min`);
console.log(`data/videos.json  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
