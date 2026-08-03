# Refreshing the video index

The Input tab recommends from `data/videos.json` — about 950 individual YouTube videos
across 35 channels, each with an estimated difficulty. It was built on 2026-08-03. It goes
stale in two ways: channels stop uploading or get deleted, and new material never appears.

Refresh it every 6–12 months, or whenever the Input tab starts feeling repetitive.

## Just do it yourself

```bash
node tools/yt-index.mjs && cp data/videos.json tools/.yt-raw.json && node tools/yt-pack.mjs && node tools/build.mjs
```

Then deploy: `cd cf && npx wrangler deploy`

That re-pulls every channel's uploads, re-scores, re-packs and rebuilds. Takes a few
minutes and costs about 400 of the 10,000 daily API quota units. It needs
`.env.local` to contain a working `YOUTUBE_API_KEY` — if the key has been revoked, make a
new one at https://console.cloud.google.com/apis/credentials (restrict it to *YouTube Data
API v3*, nothing else).

## Or paste this to Claude

> Refresh the tangocho video index. It was last built on 2026-08-03 and is now stale.
>
> 1. Check `.env.local` has a working `YOUTUBE_API_KEY` — call
>    `https://www.googleapis.com/youtube/v3/videos?part=id&id=8FhnCK0q-3k&key=…` and
>    confirm HTTP 200. If it fails, tell me exactly what to click; don't guess at fixes.
> 2. Run `node tools/yt-index.mjs`. Watch the per-channel "kept" counts against the
>    previous run recorded below. **A channel that drops to 0 has died, been renamed, or
>    gone private — investigate before assuming the script broke, and tell me which.**
> 3. Run `node tools/yt-discover.mjs` to look for channels that have appeared since. It
>    costs ~1,500 quota units. Review the output *by hand* against
>    `tools/yt-channels.mjs` — both the `CHANNELS` list and the `REJECTED` list, which
>    records why each excluded channel was excluded so we don't re-add it by accident.
>    Discovery reliably surfaces Japanese-language channels that teach Korean, Chinese,
>    Spanish or English, and channels that train Japanese teachers. None of those are
>    Japanese practice. Also drop anything whose explanation is not in Japanese —
>    immersion only, that was a deliberate choice.
> 4. Add any genuinely good new channels to `CHANNELS` with an `anchor` difficulty, an
>    `audience` of adult/kids/all, and tags. Re-run the index.
> 5. `cp data/videos.json tools/.yt-raw.json && node tools/yt-pack.mjs`
> 6. Spot-check the packed output across difficulty bands before shipping. Print a dozen
>    rows from each band with their channel and length and actually read them. Past runs
>    caught silent "lofi study timer" videos scored as beginner Japanese, and children's
>    cartoons scored harder than the news because their descriptions are marketing copy.
>    If something looks wrong, fix the scoring in `yt-index.mjs` — do not ship it.
> 7. `node tools/build.mjs`, then `cd cf && npx wrangler deploy`.
> 8. Update the "last built" date and the channel counts in this file.
>
> Do not add the API key to any file that git tracks. `.env.local` is gitignored; keep it
> that way.

## What the numbers looked like on 2026-08-03

- 38 channels queried, 5,789 videos indexed, 955 kept after packing (142 KB)
- Dropped: 1,273 Shorts/under-60s, 1,434 non-Japanese audio, 505 no Japanese in the
  title, 364 silent or over two hours
- Difficulty bands: 116 under 20 · 277 at 20–34 · 290 at 35–49 · 194 at 50–64 · 78 at 65+
- 124 flagged as children's content, 507 with human-written captions
- Quota used: ~390 units indexing, ~1,500 for discovery

If a rebuild returns dramatically fewer videos than this, something is broken. Find out
what before deploying over a working index.

## The known weakness

Difficulty is **estimated, not measured**. The honest version of this would score each
video's actual Japanese subtitles against the deck, and that is not possible: YouTube
gates caption text behind a proof-of-origin token, and the Data API only lets you download
captions for videos you own. Three routes were tried and all are closed.

So the score blends the channel's anchor, how much of the video's Japanese *description*
is already in the deck, the kanji density of its title, and its length. Each row carries a
`confidence` from 0–100 — anything under 40 is close to a guess, and the app's rating
engine treats it that way, moving low-confidence estimates fast once they're rated.

If YouTube ever opens up caption access, rewrite `scoreDifficulty` in `tools/yt-index.mjs`
to use real transcripts. That single change would improve this more than anything else
listed here.
