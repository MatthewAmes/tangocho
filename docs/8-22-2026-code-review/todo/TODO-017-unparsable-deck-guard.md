# TODO-017 — Do not reseed (and then push) when the local deck fails to parse

**Priority:** P2   **Effort:** S   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 1.2 (MEDIUM); 06-architecture § 6.4 (restore validation), R1 (no error boundary — related, Theme C)
**Depends on:** TODO-009 (same code block; land after it)   **Blocks:** none

## Why
`loadCardsAndSync` does `list = JSON.parse(rawCards)` in a try/catch that turns a parse failure into `null`, which is the same state as "first run" — so a truncated or corrupted `jpn101:deck` (storage quota hit mid-write, a browser bug, a partial restore) silently reseeds a fresh deck with every card at `seen:0`, writes it over the corrupt value, and — if the device is offline so the pull found nothing — the `online` handler later pushes a zero-progress deck. `mergeDeck` on other devices keeps the higher `seen`, so recovery is usually possible from another device, but a single-device user loses everything and never learns why.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1321-1330`:
  ```js
  const rawCards = await sGet(STORE_KEY);
  const rawVer = await sGet(SEED_KEY);
  let list = null;
  try { list = rawCards ? JSON.parse(rawCards) : null; } catch (e) { list = null; }
  const ver = rawVer ? Number(rawVer) : 0;
  if (!list) {
    list = SEED.map((c) => ({ id: uid(), seen: 0, correct: 0, ...c }));
    await sSet(STORE_KEY, JSON.stringify(list));
    await sSet(SEED_KEY, String(SEED_VERSION));
  } else if (ver < SEED_VERSION) { … }
  setCards(list); setReady(true);
  await pushCloudNow();
  ```
- `:1449-1454` the root already renders a storage-failure banner (`!storageOk`) with a one-tap Backup button — a good pattern to reuse.
- `mergeDeck` (`:941`) returns `localRaw` when the cloud deck is empty, and `pullAndMergeCloud` writes `localStorage` directly; nothing validates that `jpn101:deck` parses to an array of objects with `term`.

## Intended behaviour
- If `jpn101:deck` exists but does not parse (or parses to a non-array), the app does **not** reseed. It preserves the raw value under `jpn101:deck.corrupt` (outside sync — add to `SYNC_SKIP_KEYS`), shows a banner ("Your local deck file is damaged. Nothing was overwritten. Sign in / wait for the cloud copy, or Restore a backup."), loads the deck from the cloud if a pull succeeded, and refuses to push until a successful pull has replaced the deck.
- Reseed happens only when the key is genuinely absent (`rawCards === null`).
- `mergeDeck`/restore validate minimal card shape (`Array.isArray` and every item has a string `term`).

## Implementation steps
1. In `loadCardsAndSync` (`:1321-1330`) split "missing" from "corrupt":
   ```js
   const rawCards = await sGet(STORE_KEY);
   let list = null, corrupt = false;
   if (rawCards != null) {
     try { list = JSON.parse(rawCards); } catch (e) { list = null; }
     if (!Array.isArray(list) || !list.every((c) => c && typeof c.term === "string")) { list = null; corrupt = true; }
   }
   if (corrupt) {
     try { window.localStorage.setItem("jpn101:deck.corrupt", rawCards); } catch (e) {}
     setDeckCorrupt(true);                                    // new root state → banner
     // do not reseed, do not push: wait for a cloud copy or a manual restore
     setCards([]); setReady(true);
     return;
   }
   if (!list) { …existing fresh-seed branch… }
   ```
   Note the pull at the top of the chain (`:1320`) runs first; if it succeeded, `mergeDeck(localRaw=corrupt string, cloudRaw)` → `local` parses to `[]` in its try/catch → returns `cloudRaw` (`:942`), and `pullAndMergeCloud` writes the cloud deck to localStorage, so `rawCards` read at `:1321` is already the healthy cloud copy and the corrupt branch is not reached. The guard therefore matters exactly when there is no cloud copy (offline / signed out / empty cloud) — which is the dangerous case.
2. Add `"jpn101:deck.corrupt"` to `SYNC_SKIP_KEYS` (`:908`).
3. Root state + banner: `const [deckCorrupt, setDeckCorrupt] = useState(false);` and next to the `!storageOk` banner (`:1449`):
   ```jsx
   {deckCorrupt && (
     <div className="tc-senterr" style={{ margin: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
       <span>⚠️ The saved deck on this device is damaged and was NOT replaced. If you're signed in, the cloud copy will load on the next successful sync; otherwise open Browse → More → Restore and paste a backup. (Raw data kept under jpn101:deck.corrupt.)</span>
       <button className="tc-btn tc-btn-sm" onClick={() => loadCardsAndSync()}>Try again</button>
     </div>
   )}
   ```
   Clear `deckCorrupt` when a later `loadCardsAndSync` succeeds (set false at the top of a successful path) and when `restoreDeck` is called.
4. Block pushes while corrupt: in `pushCloudNow` (module level) check a module flag `let _deckCorrupt = false;` set by the root alongside the state; `if (_deckCorrupt) return false;` before building the body. Clear it when the deck is restored/pulled.
5. Validate in `mergeDeck` (in `tools/merge.mjs` after TODO-008): treat a side that parses but is not an array of `{term}` objects as empty (so the other side wins) — add `const valid = (a) => Array.isArray(a) && a.every((c) => c && typeof c.term === "string");` and `if (!valid(local)) local = []; if (!valid(cloud)) cloud = [];`.
6. Rebuild, commit `index.html`, deploy.

## Data migration / compatibility
None. `jpn101:deck.corrupt` is only written in the failure case; clean it up when a healthy deck is saved (`removeItem`) so it does not linger.

## Testing & verification
- Devtools: `localStorage["jpn101:deck"] = "[{\"term\":\"x\""` (truncated) → reload while signed out → banner shown, `jpn101:deck.corrupt` holds the string, `jpn101:deck` unchanged, no POST in Network, Study shows empty state. Restore a backup → banner clears, push happens.
- Same while signed in with a healthy cloud copy → app loads the cloud deck, no banner (pull replaced it).
- Unit (`tools/test-merge.mjs`): `mergeDeck('not json', cloudRaw) === cloudRaw`; `mergeDeck('[1,2]', cloudRaw) === cloudRaw`.

## Acceptance criteria
- [ ] A corrupt local deck never triggers a reseed or a push.
- [ ] The raw value is preserved and a banner explains the recovery options.
- [ ] Healthy cloud copy still wins automatically.

## Pitfalls / notes
- Do not reuse the `!storageOk` banner state — that one means "storage is unwritable"; this one means "storage has a bad deck". Both can be true.
- Keep `setReady(true)` so the tab bar renders and Browse → Restore is reachable.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
