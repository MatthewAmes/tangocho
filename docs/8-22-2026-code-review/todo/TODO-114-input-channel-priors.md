# TODO-114 — Propagate per-video ratings to channel priors (hierarchical shrinkage) and let channel ratings inform their indexed videos

**Priority:** P1   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §4.1 ("Per-video ratings teach nothing reusable"), §7 item 2; 01-functionality §5.2 (feed-source vs per-video ratings never inform each other)
**Depends on:** TODO-112 (same `rate()` path)   **Blocks:** TODO-116 (channel-level "Not for me" reuses the channel map)

## Why
`rate()` stores `difficulty/confidence` per `entry.itemId`. For indexed videos that id is `yt:<videoId>`; a video is excluded for 14 days after opening and rarely rewatched, so each of 955 items is rated at most once and nothing propagates to its channel or siblings. The item-learning half of the engine was built for ~22 channel-level sources (fb70c60) and became inert when 110a16f replaced them with 955 videos. Rating three NIJ videos "too hard" should move the other ~70 NIJ rows; conversely a channel-level rating (feed source `ci-natural`) should inform its indexed videos.

## Current behaviour (verified)
- `unpackVideos` L4216–4239 gives each video `channelId` (`c[0]`), `channel`, `difficulty: d`, `difficultyConfidence`, `indexed: true`.
- `catalog` L4588–4596: `[...INPUT_CATALOG, ...videos, ...st.custom]` overlaid with `st.items[it.id]` (`difficulty`, `confidence`).
- `rate()` L4674–4699: `applyRating` on `s0.items[entry.itemId]`; writes `items[itemId] = {difficulty, confidence, ratings}`.
- `INPUT_CATALOG` channel entries (L4248+) carry `channelId` for the YouTube ones (e.g. `ci-natural` → `UCXo8kuCtqLjL1EH6m4FJJNA`, L4251).
- `mergeInput` L991–995 merges `items` per id by higher `ratings`.

## Intended behaviour
- New state map `st.channels[channelId] = { offset, n }` — a learned **difficulty offset** for the channel (start 0, n 0).
- Effective difficulty of an indexed video = `clamp100(baseDifficulty + channelOffset)` unless the video has its own `items` entry (then use that, as today — per-video knowledge beats the prior).
- On a rating of an indexed video (or of a channel-level catalog entry that has `channelId`): compute the item update as today, **and** move the channel offset by a shrunk share of the item's movement: `offset += (newDiff − oldDiff) * shrink(n)` with `shrink(n) = 0.5 / (1 + n/6)` (first rating moves the channel half as much as the video, tenth ≈ 0.19×); `n += 1`. For a "lost"/"too_hard" rating this raises the whole channel's videos; for "too_easy" lowers them.
- The same map works the other way: rating the channel-level catalog entry (feed source) updates `channels[channelId]` and thus all its videos.
- `recommend()` needs no change — it reads `it.difficulty` from the catalog overlay.

## Implementation steps
1. `blankInput` (L4539–4542): add `channels: {}`; load effect (L4563–4565): `o.channels = o.channels || {};`.
2. `catalog` memo (L4588–4596): after the `items` overlay, apply the channel offset for indexed videos without their own entry:
   ```js
   .map((it) => {
     const o = st.items[it.id];
     if (o) return { ...it, difficulty: o.difficulty, difficultyConfidence: o.confidence };
     const ch = it.channelId && st.channels[it.channelId];
     return ch && ch.n ? { ...it, difficulty: clamp100(it.difficulty + ch.offset), channelAdjusted: true } : it;
   })
   ```
3. `rate()` (L4677–4698): after computing `r`, add
   ```js
   const chId = it && it.channelId;
   const channels = { ...s0.channels };
   if (chId) {
     const ch = channels[chId] || { offset: 0, n: 0 };
     const shrink = 0.5 / (1 + ch.n / 6);
     channels[chId] = { offset: Math.max(-25, Math.min(25, ch.offset + (r.itemDifficulty - cur.difficulty) * shrink)), n: ch.n + 1 };
   }
   return { ...s0, …, channels };
   ```
   (`cur.difficulty` is the pre-rating item difficulty already in scope at L4678.)
4. `mergeInput` (L997–1006): add `channels: mergeChannels(local.channels, cloud.channels)` where per id the side with higher `n` wins (same rule as `items`).
5. Extract the pure part `applyChannelRating(ch, delta)` next to `applyRating` so it can be sliced into tests; add to the `grab` list in `tools/test-input-engine.mjs`:
   - first rating moves the channel by 0.5·delta; after 6 ratings by 0.25·delta; offset clamped to ±25.
   - `catalog` overlay order: own item entry > channel offset > base (test via a small pure helper `effectiveDifficulty(it, items, channels)` if you factor it out; recommended).
6. UI: on the pick card meta (L4837–4846) append ` · channel adjusted` when `it.channelAdjusted` (small, honest); not required.

## Data migration / compatibility
`jpn101:input.channels` new optional field (merged by higher `n`); old states get `{}`. `v` bump optional (TODO-112 bumps to 2; share it).

## Testing & verification
- `node tools/test-input-engine.mjs`.
- Manual: rate one とんとん video "Lost me" → other とんとん picks show higher relative dots next reroll; rate a channel-level entry (e.g. Tanaka san via feed) "Too easy" → its indexed videos' dots drop.
- Sim: adapt `docs/8-22-2026-code-review/scripts/sim-input.mjs` to rate 3 NIJ videos "too_hard" and show the NIJ band shifting up ~4–6 points.
- Build + deploy.

## Acceptance criteria
- [ ] Rating an indexed video moves its channel offset (shrunk), affecting sibling videos without their own entry.
- [ ] Rating a channel-level catalog entry affects its indexed videos.
- [ ] Offsets sync (`mergeInput`) and are clamped to ±25.
- [ ] Pure helpers unit-tested.

## Pitfalls / notes
- 01 §5.2 also notes `recent` exclusion is by `itemId`: opening one episode of a *feed* source hides the channel for 14 days. Reduce the feed-source exclusion window to 3 days (`recommend` L4389: make the window depend on `it.indexed ? 14 : 3` days) while here — small and related.
- Keep `applyRating` untouched except via TODO-112/113.
- Rebuild `index.html` and deploy.
