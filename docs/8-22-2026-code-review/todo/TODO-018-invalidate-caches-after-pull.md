# TODO-018 — Invalidate module-level caches (`_days`, `retentionTarget`) after a cloud pull

**Priority:** P2   **Effort:** XS   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 1.4 (LOW but causes real overwrite), § 3.7; 06-architecture § 3.4 (`_days` two write paths, `retentionTarget` read at import), F-17
**Depends on:** none   **Blocks:** none

## Why
`pullAndMergeCloud` writes merged values straight into `localStorage`, but two module-level caches were read once and are never refreshed: `_days` (the day log, cached forever by `loadDays`) and `retentionTarget` (read at import). After the post-sign-in pull merges days from the cloud, the next `logDay()` on this device serialises the **stale** in-memory `_days` (+1) back over `jpn101:days`, discarding the days that were just merged in — and then pushes that to the cloud. Other devices' `mergeDays` usually restores them on their next push, but until then the local streak is wrong and the cloud copy is missing days. Likewise a retention target changed on another device is ignored until reload.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1168-1183` `pullAndMergeCloud`: `Object.keys(merged).forEach((k) => { try { window.localStorage.setItem(k, merged[k]); } catch (e) {} });` — no cache invalidation, no event.
- `:1204-1217`:
  ```js
  let _days = null;
  async function loadDays() { if (_days === null) { … _days = JSON.parse(r) … } return _days; }
  async function logDay(…) { await loadDays(); const k = …; const d = _days[k] || (_days[k] = {…}); …; sSet(DAYS_KEY, JSON.stringify(_days)); }
  ```
- `:1193-1202` `retentionTarget` read once from `localStorage` at module load; `setRetention` updates the variable + storage.
- `:3901` Browse restore assigns `_days = cur;` directly (second write path).
- `Study` reads days via `loadDays().then(setDays)` on `[running]` (`:1617`); `Freq` reads once on mount (`:5427`).
- Kana/Conj/Freq/Input components keep their own `useState/useRef` copies but are unmounted while Browse (where sign-in happens) is shown, so they re-read on mount — not affected. Root `cards` is re-read by `loadCardsAndSync` after the pull — not affected.

## Intended behaviour
- After a successful pull, `_days` is dropped (`null`) so the next `loadDays()` re-reads the merged value, and `retentionTarget` is re-read from storage. Any mounted component that cached days gets a chance to refresh (Study re-reads on `running` change; add a lightweight "storage changed" notification so Study's buddy stats update without a session toggle).

## Implementation steps
1. Add a tiny post-pull hook list above `pullAndMergeCloud` (~`:1167`):
   ```js
   const _afterPull = new Set();                       // fns to run after cloud data replaced local keys
   function onAfterPull(fn) { _afterPull.add(fn); return () => _afterPull.delete(fn); }
   ```
   At the end of the successful path in `pullAndMergeCloud` (after `syncLastPulled` is written, before `return true`): `_afterPull.forEach((fn) => { try { fn(Object.keys(merged)); } catch (e) {} });`.
2. Register the cache resets right after the caches are declared:
   - after `loadDays`/`logDay` (`:1217`): `onAfterPull(() => { _days = null; });`
   - after `setRetention` (`:1202`): `onAfterPull(() => { try { const r = Number(window.localStorage.getItem(RETENTION_KEY)); if (r >= 0.7 && r <= 0.97) retentionTarget = r; } catch (e) {} });`
   (Both `onAfterPull` and the caches are module-level; make sure `onAfterPull` is declared *above* these registrations in file order — move the helper up next to the sync mini-store at `:1112-1119`.)
3. Study (`:1617`): `useEffect(() => { const load = () => loadDays().then((d) => setDays({ ...d })); load(); return onAfterPull(load); }, [running]);` and for retention `:1622` `const [retention, setRetentionState] = useState(retentionTarget);` add `useEffect(() => onAfterPull(() => setRetentionState(retentionTarget)), []);` (the module var was updated in step 2 before Study's callback runs — `Set` iteration is insertion order, and step 2's registrations happen at module load, before any component mounts).
4. Browse restore (`:3901`): keep `_days = cur;` (it is the freshly written value) — fine.
5. Rebuild, commit `index.html`, deploy.

## Data migration / compatibility
None.

## Testing & verification
- Console repro of the bug before the fix (to be sure the fix is observable): with the app loaded and signed out, run `localStorage.setItem("jpn101:days", JSON.stringify({"2020-01-01":{rev:5,ok:5,ms:0,frev:0,fnew:0}}))`, then grade a card → `JSON.parse(localStorage["jpn101:days"])` no longer contains `2020-01-01` (the stale `_days` overwrote it). After the fix, the same sequence *still* loses it (no pull happened) — that is expected; the fix is about the pull path, so test via sign-in below, or call the internal hook if exposed.
- Manual: device A has days `{2026-08-20:…}`; device B signed out with `{2026-08-21:…}`; sign in on B (Browse) → wait for the pull → switch to Study → streak reflects both days; grade one card → `localStorage["jpn101:days"]` contains both keys (before the fix it would contain only B's + today).
- Manual: set retention to 95% on A; on B sign in → Study shows 95% without reload.
- No unit test (DOM-bound); if the days helpers move to a module in Theme C, test `loadDays` cache reset there.

## Acceptance criteria
- [ ] After a pull, `logDay` writes the merged day log (no stale overwrite).
- [ ] Retention target follows the pulled value without reload.

## Pitfalls / notes
- Do not replace `_days` with a per-call `sGet` — `logDay` is called on every grade and relies on the cached object; resetting to `null` is enough.
- Interacts with TODO-006 (`markDirty` on pulled keys) — both hook the same spot in `pullAndMergeCloud`; keep the order: write keys → mark dirty → set lastPulled → notify.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
