# TODO-118 — Ship per-video top-unknown-words from the index pipeline (`tools/yt-index.mjs` → `yt-pack.mjs` → `data/videos.json` → `unpackVideos`)

**Priority:** P2   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 05-expansion §3.2-B (per-video unknown-word lists), executive summary item 3(b), roadmap "Next" item 7; 02-pedagogy §4.1 (description coverage signal)
**Depends on:** TODO-115 (shared segmenter gives honest unknowns)   **Blocks:** TODO-119 (watch-with-the-deck)

## Why
The index pipeline already computes per-video deck coverage from the Japanese description but throws the word lists away (`known()` returns only `{pct, tokens}`). Keeping the top unknown words per video (≈ 40–60 bytes/row, +~50 KB on `videos.json`) enables a "watch with the deck" mode: pre-teach the words you will meet, post-quiz "did you catch 天気?", and an add-to-deck shortcut — the feature that makes recommendations *teach* rather than *point*.

## Current behaviour (verified)
- `tools/yt-index.mjs`: `known(text)` L63–84 returns `total >= 8 ? { pct, tokens } : null`; `scoreDifficulty` L93–128 uses `k.pct`; rows pushed at L185–199 include `desc` (raw cache only, L198) but no word list; writes `data/videos.json` (raw rows).
- `tools/yt-pack.mjs`: reads `tools/.yt-raw.json` (the refresh runbook copies `data/videos.json` there: `tools/REFRESH-VIDEO-INDEX.md` L11), packs rows at L73–76 `[v.id, v.t, chIdx, v.sec, day, v.d, conf*100, v.cc, v.views]`, `fields` string L81.
- Client `unpackVideos` L4216–4239 destructures the 9 fields in order.
- `data/videos.json` header: `{"v":1,"builtAt":…,"fields":"id,title,ch,sec,day,difficulty,confidence,captions,views", …}`.

## Intended behaviour
- `yt-index.mjs` keeps `unk: [...top 8 unknown surface words by frequency]` per row (from the segmenter's `unknown` list, kanji words and kana words alike, excluding function words), computed from title + description.
- `yt-pack.mjs` appends a 10th field `unk` = space-joined string (`"天気 買い物 来週"`), `fields` → `"…,views,unk"`; `v: 2`.
- `unpackVideos` reads the 10th field into `unknown: string[]` (empty array for old caches/missing field); everything else unchanged.
- Pick card shows "words you'll meet: 天気・買い物・来週" when `it.unknown.length` (small, below meta).

## Implementation steps
1. `tools/yt-index.mjs`: after TODO-115, `known()` is `coverage(text, DECK_SET)` from `tools/segment.mjs` which returns `{pct, unknown:[{w,n}], tokens}`; in the row object (L185–199) add `unk: (k ? k.unknown : coverage(title, DECK_SET)?.unknown || []).slice(0, 8).map((u) => u.w)`. Guard: only words with ≥ 2 Japanese characters or a kanji, to drop stray single kana.
2. `tools/yt-pack.mjs` L73–76: add `(v.unk || []).join(" ")` as the last element; L81 `fields: "id,title,ch,sec,day,difficulty,confidence,captions,views,unk"`; `v: 2`. Print the added bytes in the summary (`data/videos.json  N KB`).
3. `JpnFlashcards.jsx` `unpackVideos` (L4218): destructure `[id, title, ci, sec, day, d, conf, cc, views, unk]` and add `unknown: (unk || "").split(" ").filter(Boolean)` to the returned object.
4. Pick card (after the meta `<p>` at L4837–4846): `{it.unknown && it.unknown.length > 0 && <p className="tc-inpicknote">words you'll meet: {it.unknown.slice(0, 5).join("・")}</p>}`.
5. Run the pipeline once (needs `YOUTUBE_API_KEY` in `.env.local`; ~400 quota units — see `tools/REFRESH-VIDEO-INDEX.md`): `node tools/yt-index.mjs && cp data/videos.json tools/.yt-raw.json && node tools/yt-pack.mjs && node tools/build.mjs`. If the key is unavailable, the pack step can run on the existing `tools/.yt-raw.json` only if it still contains `desc` — it does (L198 keeps 1,200 chars) — so **you can add `unk` at pack time from `desc` without re-downloading**: in `yt-pack.mjs` compute `unk` from `v.desc` via the segmenter when `v.unk` is missing. Prefer this path; it costs no quota.
6. Update `tools/REFRESH-VIDEO-INDEX.md` expected numbers (file size) and the `fields` string.

## Data migration / compatibility
`jpn101:videoIndex` localStorage cache is keyed on `builtAt` (L4187–4188 comment; `loadVideoIndex` replaces it on fetch) — old caches lack the field and `unpackVideos` must tolerate 9-element rows (it does with the `unk || ""` guard). Theme A's sync-skip item removes `jpn101:videoIndex` from the snapshot; unrelated but note the file grows ~50 KB.

## Testing & verification
- `node tools/yt-pack.mjs` prints the new size; `head -c 600 data/videos.json` shows `"fields":"…,unk"`; a row ends with a string.
- `node tools/build.mjs` (copies videos.json to `cf/public`).
- Input tab pick cards show "words you'll meet" for indexed videos.
- Unit: add to `tools/test-input-engine.mjs` a `unpackVideos` test (it is already in the sim's grab list) with a 9-field and a 10-field row.
- Build + deploy.

## Acceptance criteria
- [ ] `data/videos.json` v2 carries `unk` per row; `unpackVideos` exposes `unknown: []`.
- [ ] Old 9-field caches still unpack.
- [ ] Pick cards list up to 5 words you'll meet.
- [ ] Runbook updated.

## Pitfalls / notes
- Descriptions are marketing copy for kids channels (yt-index comment L101–104); unknown lists there will be noisy — cap at 8 and let TODO-119's UI show 3–5.
- The `desc`-at-pack-time path (step 5) is the zero-quota route; document it in the runbook.
- Rebuild `index.html` and deploy (the Worker serves `cf/public/videos.json`).
