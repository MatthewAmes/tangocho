# TODO-007 — Delta (partial) pushes: tiny per-card patches for the page-unload flush, merged server-side

**Priority:** P2   **Effort:** M   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 3.4 (fix: "send only keys dirtied since last push … a small delta"), § 3.2 fix (1); 06-architecture § R4 ("send a delta (changed keys only) with the server merging per key")
**Depends on:** TODO-005 (validation + server `updatedAt`), TODO-006 (dirty tracking + size guard), TODO-008 (shared `cardMergeKey` semantics; ideally `tools/merge.mjs`)   **Blocks:** none

## Why
After TODO-006 the unload flush is skipped whenever the body is > 60 KiB — which is always, because the dirty key after a grade is the whole 284 KB deck. A delta body with just the changed cards (a few hundred bytes each) fits comfortably under the keepalive limit, so the last grade before closing the tab reaches the cloud. This also opens the door to cheaper routine pushes later, but the scope here is only the unload flush.

## Current behaviour (verified)
- Worker `cf/src/index.js:138-143` (after TODO-005: validated full-replace only). The stored record is `{v, updatedAt, snapshot:{ "jpn101:deck": "<JSON string of card array>", … }}`.
- Client `recordResult` (`JpnFlashcards.jsx:1392-1443`) updates exactly one card per call inside `setCards(prev => …)` and writes the whole deck with `sSet(STORE_KEY, JSON.stringify(next))` (`:1440`); `setMnemonic` (`:1384-1390`) likewise; `logDay` (`:1210-1217`) rewrites `jpn101:days` (small, a few KB); Kana/Conj (`:2725`, `:5075`) rewrite their stat maps; Freq `persist` (`:5433`) rewrites the 148-card 10k deck (~50 KB).
- `cardMergeKey(c)` (`:936`) = `term|lesson|sec`; `mergeDeck` (`:937-953`) keeps the card with higher `(seen*1e6 + last)`.
- TODO-006 added `_dirtyKeys` and a size guard that currently just marks pending.

## Intended behaviour
- The client keeps `_dirtyCards: Map<cardMergeKey, card>` of deck cards changed since the last successful full push (populated in `recordResult`/`setMnemonic`, cleared on full-push success).
- On unload (and only then), if the full body is too big, the client sends
  ```json
  { "v": 1, "partial": true, "keys": { "jpn101:days": "<json>", "jpn101:kana": "<json>", … small dirty non-deck keys ≤ 40 KiB total }, "deckPatch": [ {card}, … ] }
  ```
  with `keepalive: true`, as long as the encoded body is ≤ 60 KiB (otherwise fall back to mark-pending).
- The Worker, on `partial:true`, loads the stored record, replaces each `keys[k]` value wholesale (same semantics as a full push for that key), and for `deckPatch` parses the stored `jpn101:deck` string, replaces/appends cards by `cardMergeKey` using the same winner rule as the client (`seen*1e6+last`, ties → patch wins), re-stringifies, stamps `updatedAt`, writes back. Non-deck keys whose stored value is an object-map (kana/conj) are *not* patched per-record in this item — they are replaced wholesale (they are small) — so the client must send the full value for those keys.
- The next normal full push from that device supersedes everything anyway; the delta only narrows the loss window.

## Implementation steps
1. **Client — card-level dirty tracking.** Near `_dirtyKeys` (TODO-006):
   ```js
   const _dirtyCards = new Map();                        // cardMergeKey -> latest card object
   function markDirtyCard(card) { _dirtyCards.set(cardMergeKey(card), card); }
   ```
   In `recordResult` (`:1396-1439`), inside the `prev.map` after computing the returned object for the matching card, capture it: assign to a local `let changed = null;` then `changed = {...}` and `return changed;` and after the map `if (changed) markDirtyCard(changed);`. Same in `setMnemonic` (`:1386`). `addCards` (`:1362`) and `removeCard` are rare and full-push only — ignore (removal cannot be patched; a full push handles it).
   On full-push success (TODO-006 step 2) also `_dirtyCards.clear()` (only the cards captured before the request — snapshot the map the same way as `_dirtyKeys`).
2. **Client — build the delta** in `pushCloudOnce` where TODO-006 returned early:
   ```js
   if (keepalive && bytes(body) > KEEPALIVE_MAX) {
     const delta = buildDeltaBody();
     if (!delta || bytes(delta) > KEEPALIVE_MAX) { markSyncPending(); setSyncState("pending"); return false; }
     body = delta;                                        // fall through to the same fetch
   }
   ```
   with
   ```js
   function buildDeltaBody() {
     const keys = {};
     let any = false;
     _dirtyKeys.forEach((k) => {
       if (k === STORE_KEY) return;                       // deck goes as a patch
       const v = (() => { try { return window.localStorage.getItem(k); } catch (e) { return null; } })();
       if (typeof v === "string" && v.length < 40 * 1024) { keys[k] = v; any = true; }
     });
     const deckPatch = Array.from(_dirtyCards.values());
     if (deckPatch.length) any = true;
     return any ? JSON.stringify({ v: 1, partial: true, keys, deckPatch }) : null;
   }
   ```
   `STORE_KEY` (`"jpn101:deck"`, `:12`) is declared above — fine. A delta that was sent with keepalive cannot be confirmed, so do **not** clear `_dirtyKeys/_dirtyCards` after it and do leave `markSyncPending()` set only if the fetch rejects synchronously; simplest: after issuing the keepalive delta, also `markSyncPending()` so the next visit does a full push regardless (idempotent, safe).
3. **Worker — accept partial bodies.** Extend `validateSnapshotBody` (TODO-005) to allow `{partial:true, keys:{…strings, prefix jpn101:}, deckPatch:[objects with string term]}` (cap: ≤ 32 keys, ≤ 200 patch cards, each card object ≤ 4 KB when stringified). In the POST branch:
   ```js
   if (body.partial) {
     const cur = (await env.SYNC.get(storageKey, { type: "json" })) || { v: 1, snapshot: {} };
     const snap = { ...(cur.snapshot || {}) };
     for (const k of Object.keys(body.keys || {})) snap[k] = body.keys[k];
     if (Array.isArray(body.deckPatch) && body.deckPatch.length) {
       let deck = [];
       try { deck = JSON.parse(snap["jpn101:deck"] || "[]"); } catch (e) { deck = []; }
       if (!Array.isArray(deck)) deck = [];
       const byKey = new Map(deck.map((c) => [cardKey(c), c]));
       for (const p of body.deckPatch) {
         const k = cardKey(p), ex = byKey.get(k);
         const score = (c) => (c.seen || 0) * 1e6 + (c.last || 0);
         if (!ex || score(p) >= score(ex)) byKey.set(k, p);
       }
       snap["jpn101:deck"] = JSON.stringify(Array.from(byKey.values()));
     }
     const record = { v: 1, updatedAt: Date.now(), snapshot: snap };
     await env.SYNC.put(storageKey, JSON.stringify(record));
     return json({ ok: true, updatedAt: record.updatedAt, partial: true });
   }
   ```
   with `const cardKey = (c) => c.term + "|" + (c.lesson || "") + "|" + (c.sec || "");` — must stay byte-for-byte equivalent to the client's `cardMergeKey` (if TODO-008 moves it into `tools/merge.mjs`, the Worker can `import { cardMergeKey } from "../../tools/merge.mjs"` — wrangler bundles relative imports; verify the path resolves from `cf/src/`).
   Note: if `snap["jpn101:deck"]` is absent (brand-new user whose first-ever push is a delta) the patch creates a deck containing only the patched cards; the device's next full push replaces it. Acceptable.
4. **KV write cost**: a partial push is one `get` + one `put`, same as before. It only happens on unload when the full body would not fit.
5. Rebuild client, deploy Worker, commit `index.html`.

## Data migration / compatibility
None; records keep the same shape. Old clients never send `partial`.

## Testing & verification
- `tools/test-worker.mjs`: extract the patch-merge into an exported pure function `applyDeckPatch(deckJsonString, patchArray) -> string` and assert: appends unknown keys; replaces when patch `seen` higher; keeps stored when stored `seen` higher; identical keys with equal score → patch wins; malformed stored JSON → treated as empty.
- curl to `wrangler dev`: POST `{"partial":true,"keys":{"jpn101:days":"{}"},"deckPatch":[{"term":"犬","lesson":1,"seen":3,"last":2}]}` with a valid Bearer → 200; GET shows the deck containing 犬.
- Manual: grade a card and close the tab within 2 s; on another device reload → the card's `seen` increased. Check `wrangler tail` shows the partial POST (log a `console.log("partial", deckPatch.length)` — keep it, it is cheap and useful).
- Size check in devtools: the delta body for one grade is < 2 KB.

## Acceptance criteria
- [ ] A grade followed by immediate tab close reaches the cloud (verified cross-device).
- [ ] Partial bodies are validated and capped; full-push semantics are unchanged.
- [ ] Unit tests for `applyDeckPatch` pass.

## Pitfalls / notes
- Never clear dirty state after a keepalive request — you cannot observe its result. Let the next visit do a full push.
- Deleted cards cannot be expressed as a patch; a full push handles deletions (and they resurrect from other devices anyway — known limitation, 01 § 1.5).
- Keep the Worker merge rule identical to the client's `mergeDeck` winner rule so a later pull does not flip the result.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
