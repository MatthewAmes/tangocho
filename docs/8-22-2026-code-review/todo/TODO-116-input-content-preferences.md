# TODO-116 — Input content preferences: "no kids content" toggle, channel-level "Not for me", un-hide list, prefer JP captions, dedupe channel entries against indexed videos

**Priority:** P1   **Effort:** S   **Theme:** B — learning engine
**Source findings:** 02-pedagogy §4.1 ("Kids content dominates the learner's band", "Channel-level catalog entries coexist with their indexed videos", "No use of subtitle availability"), §6, §7 item 4; 05-expansion QW-13 (un-hide), §3.3, §7 table (INPUT_CATALOG duplicates)
**Depends on:** TODO-114 (channel map) — soft; TODO-216 (Theme C) builds the generic un-hide list for items — this item adds channel-level hiding and prefs to it (coordinate so there is one "Hidden" panel)   **Blocks:** none

## Why
From `data/videos.json`: in the < 20 band 56/116 rows are kids channels; at level 14.4 the core band holds 140 videos of which 62 are kids; across 129 simulated "Listen 15" picks at that level **33 % were children's cartoons** (Peppa Pig, Bing, Cry Babies, とんとん). "Not for me" hides one video id at a time (each kids channel contributes up to 45), is permanent, and has no un-hide UI. A channel-level entry ("Peppa Pig (Japanese)", d18) and its indexed episodes compete for the same three slots. 44/116 videos in the < 20 band have JP captions — disproportionately useful to a beginner — and are not preferred.

## Current behaviour (verified)
- `catalog` L4588–4596: `[...INPUT_CATALOG, ...videos, ...st.custom].filter((it) => !st.hidden.includes(it.id))`.
- "Not for me" L4865: `save((s0) => ({ ...s0, hidden: [...s0.hidden, it.id] }))` — per item id, forever; no un-hide UI.
- `unpackVideos` L4216–4239 sets `audience: c[2]` (`"kids" | "adult" | "all"`), `channelId`, `hasSubsJa`, `tags` (includes `"kids"` for kids channels — `tools/yt-channels.mjs` CHANNELS).
- `INPUT_CATALOG` channel entries carry `channelId` (e.g. `ci-natural`, `ci-tanaka`, `ci-peppa`, `ci-shun`) and the same channels are indexed.
- `recommend()` L4387–4437: bands, feed-first, tag-score sort (L4426–4428), duration filter.
- `tagScores` L4684–4688 can slowly demote `kids` but only as a stable sort within the band.
- `mergeInput` L1002: `hidden` is a union of both sides.

## Intended behaviour
- `st.prefs = { kids: "allow" | "avoid" | "never" (default "avoid"), preferCaptions: true }`.
  - `never`: kids rows excluded from the catalog; `avoid`: kids rows are allowed only when the band would otherwise have < 6 candidates (so an empty-deck learner at level 5 still gets something); `allow`: as today.
  - `preferCaptions`: within the banded list, stable-sort `hasSubsJa` first when the user's level < 30.
- "Not for me" offers two choices on indexed videos: "this video" (as today) and "this channel" → `st.hiddenChannels.push(channelId)`.
- Un-hide: Input tools row gains "Hidden (n)" panel listing hidden items/channels with "show again".
- Dedupe: a channel-level catalog entry whose `channelId` has ≥ 5 indexed videos is dropped from the pool (its videos represent it), unless it is a feed source and the indexed videos are all in `recent`.

## Implementation steps
1. State: `blankInput` → add `prefs: { kids: "avoid", preferCaptions: true }, hiddenChannels: []`; load effect defaults (L4563–4565) likewise; `mergeInput`: `prefs` from the newer side (like `levels`), `hiddenChannels` union (like `hidden`).
2. `catalog` memo (L4588–4596):
   ```js
   const indexedByChannel = new Map(); videos.forEach((v) => indexedByChannel.set(v.channelId, (indexedByChannel.get(v.channelId) || 0) + 1));
   return [...INPUT_CATALOG.filter((it) => !(it.channelId && (indexedByChannel.get(it.channelId) || 0) >= 5)), ...videos, ...st.custom]
     .filter((it) => !st.hidden.includes(it.id) && !(it.channelId && st.hiddenChannels.includes(it.channelId)))
     .filter((it) => st.prefs.kids !== "never" || it.audience !== "kids")
     .map(/* overlays as today / TODO-114 */);
   ```
3. `recommend()` — add params `avoidKids` and `preferCaptions` (pure, testable):
   - after `pool` is built (L4396): `if (avoidKids) { const nonKids = pool.filter((it) => it.audience !== "kids"); if (nonKids.filter((it) => it.difficulty >= level - 3 && it.difficulty <= level + 6).length >= 6) pool = nonKids; }`
   - after the tag-score sort (L4428): `if (preferCaptions && level < 30) ranked = ranked.slice().sort((a, b) => (b.hasSubsJa ? 1 : 0) - (a.hasSubsJa ? 1 : 0));` (stable sort keeps band order within each group).
   - `suggest()` (L4609–4612) passes `avoidKids: st.prefs.kids === "avoid", preferCaptions: st.prefs.preferCaptions`.
4. UI: in the plan/time chip area (after L4812) add a chip row "Kids shows: allow · avoid · never" (`tc-fchip`, `Bi` labels e.g. 子ども向け) and a "JP subtitles first" toggle. "Not for me" (L4865): for `it.indexed` render two small buttons "Not this" / "Not this channel"; for others keep one. Tools row (L4884–4889) add `["hidden", "Hidden", "非表示"]` panel listing `st.hidden` (resolve titles from `INPUT_CATALOG`/videos) and `st.hiddenChannels` (names via `videos`), each with "Show again" → remove from the array.
5. Tests (`tools/test-input-engine.mjs`, `recommend` via `recommendWrap`): with a catalog of 6 kids + 6 adult in band and `avoidKids`, no kids are returned; with 6 kids + 2 adult, kids are allowed; `preferCaptions` puts captioned first at level 20 and does nothing at level 40.

## Data migration / compatibility
`jpn101:input` gains `prefs` and `hiddenChannels` (optional; defaults on load); merge rules added in `mergeInput`. No new keys.

## Testing & verification
- `node tools/test-input-engine.mjs`.
- Re-run `docs/8-22-2026-code-review/scripts/sim-input.mjs` kids-share block with `avoidKids: true` at level 14.4: kids share drops from 33 % to ≈ 0 (band has 78 non-kids rows).
- Manual: hide a channel → reroll never shows it; "Hidden (1)" panel restores it.
- Build + deploy.

## Acceptance criteria
- [ ] Kids preference chip (allow/avoid/never), default avoid; picks at the default are kids-free when ≥ 6 non-kids candidates exist.
- [ ] Channel-level "Not for me" and an un-hide panel for items and channels.
- [ ] Captioned videos preferred below level 30 when the toggle is on.
- [ ] Channel entries duplicated by ≥ 5 indexed videos are not offered alongside them.
- [ ] Prefs/hiddenChannels sync via `mergeInput`.

## Pitfalls / notes
- Keep `recommend()`'s signature additive (the existing tests call it with a fixed object).
- `tools/yt-channels.mjs` L13–14 frames kids content as "can be filtered or sought out" — this is the filter.
- Rebuild `index.html` and deploy.
