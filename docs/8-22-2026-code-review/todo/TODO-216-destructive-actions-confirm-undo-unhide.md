# TODO-216 — Destructive actions: two-tap / undo for card and script deletes, un-hide for "Not for me"

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 3 I-4 (Medium), § Prioritised fix list #11; 05-expansion § QW-13 (unhide part only)
**Depends on:** TODO-207 (toast slot for Undo)   **Blocks:** none

## Why
Deleting a card (Browse ✕) or a script (Scripts ✕) is one tap and permanent; "Not for me" in Input hides a source forever with no UI to bring it back. Only "Clear all" has a confirm. On a phone the ✕ sits 10px from the word; a mis-tap loses a card's entire review history (and, because there are no tombstones in sync, the card may resurrect from another device later — confusing either way). Soft-delete with a 5-second Undo toast is the lowest-friction fix.

## Current behaviour (verified)
- Browse row ✕ L4046: `<button className="tc-del" aria-label={"Delete " + c.term} onClick={() => onRemove(c.id)}>✕</button>` → `removeCard` L1370-1372 filters and persists immediately.
- Scripts list ✕ L3699: `<button className="tc-del" aria-label={"Delete " + s.name} onClick={() => persist(scripts.filter((x) => x.id !== s.id))}>✕</button>` → `persist` writes `jpn101:scripts` + mirror (L3509-3514).
- Input "Not for me" L4865: `onClick={() => save((s0) => ({ ...s0, hidden: [...s0.hidden, it.id] }))}`; `hidden` is filtered in `catalog` L4593 and merged as a union across devices (`mergeInput` L1002) — so un-hiding must *remove* from `hidden` and will still union back in from a device that hasn't pulled (acceptable; document).
- Clear-all two-tap L4001-4009 (keep; focus fix is TODO-206).

## Intended behaviour
- Browse ✕ and Scripts ✕: first tap removes the item optimistically **and** shows a toast "Deleted 感謝します — Undo" for 5 s; Undo restores the exact object (with stats) at its former index. After the toast expires the delete is final.
- Input: a "Hidden sources (N) — show" link under the tools row opens a list with "Unhide" buttons; "Not for me" itself gets the same Undo toast.

## Implementation steps
1. **Toast action support** — extend `flash(text, {action:{label, run}})` from TODO-207: render `<button className="tc-toastbtn" onClick={() => { t.action.run(); setT(null); }}>{t.action.label}</button>` inside `.tc-toast`; CSS `.tc-toastbtn{margin-left:12px;background:transparent;border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer;min-height:32px;}`.
2. **Cards** — in the root add `const restoreCard = useCallback((card, index) => setCards((prev) => { if (prev.some((c) => c.id === card.id)) return prev; const next = prev.slice(); next.splice(Math.min(index, next.length), 0, card); sSet(STORE_KEY, JSON.stringify(next)); return next; }), []);` and pass `onRestore={restoreCard}`… careful: `Browse` already has an `onRestore` prop meaning "restore a backup" (L1489) — name the new one `onUndoRemove`. In Browse (L4046): `onClick={() => { const idx = cards.findIndex((x) => x.id === c.id); onRemove(c.id); flash(`Deleted ${c.term}`, { ms: 5000, action: { label: "Undo", run: () => onUndoRemove(c, idx) } }); }}`.
3. **Scripts** (L3699): `onClick={() => { const idx = scripts.indexOf(s); persist(scripts.filter((x) => x.id !== s.id)); flash(`Deleted ${s.name}`, { ms: 5000, action: { label: "Undo", run: () => persist([...scripts.slice(0, idx), s, ...scripts.slice(idx)]) } }); }}` — note `scripts` in the closure is the pre-delete array, which is exactly what Undo needs.
4. **Input hidden list** — under the tools row (after L4885) add:
   ```jsx
   {st.hidden.length > 0 && (
     <details className="tc-hiddenlist"><summary>Hidden sources ({st.hidden.length})</summary>
       <ul>{st.hidden.map((id) => { const it = [...INPUT_CATALOG, ...videos, ...st.custom].find((x) => x.id === id); return (
         <li key={id}><span>{it ? it.title : id}</span><button className="tc-btn tc-btn-sm" onClick={() => save((s0) => ({ ...s0, hidden: s0.hidden.filter((h) => h !== id) }))}>Unhide</button></li>); })}</ul>
     </details>)}
   ```
   CSS `.tc-hiddenlist summary{cursor:pointer;font-size:12.5px;color:var(--mut-2);} .tc-hiddenlist ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;} .tc-hiddenlist li{display:flex;align-items:center;gap:8px;font-size:13px;} .tc-hiddenlist li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`.
   "Not for me" (L4865): after `save(...)`, `flash("Hidden — it won't be suggested again", { ms: 5000, action: { label: "Undo", run: () => save((s0) => ({ ...s0, hidden: s0.hidden.filter((h) => h !== it.id) })) } })`.
5. Rebuild.

6. **Root wiring summary** (names to add in `JpnFlashcards`/`App`):
   ```jsx
   const undoRemoveCard = useCallback((card, index) => setCards((prev) => {
     if (prev.some((c) => c.id === card.id)) return prev;
     const next = prev.slice(); next.splice(Math.min(index, next.length), 0, card);
     sSet(STORE_KEY, JSON.stringify(next)); return next;
   }), []);
   …
   <Browse cards={cards} onRemove={removeCard} onUndoRemove={undoRemoveCard} onClear={clearAll} onRestore={restoreDeck} />
   ```
   and in `Browse({ cards, onRemove, onUndoRemove, onClear, onRestore })`.
7. Optional (cheap, recommended): make the ✕ two-stage on *touch* devices only — first tap turns the button into "Delete?" (`aria-label="Confirm delete"`) for 3 s, second tap deletes + toast — `@media (hover:hover)` keeps desktop one-tap + undo. Implement with a `confirmId` state in Browse/Scripts and a `setTimeout` reset.

## Data migration / compatibility
No key changes. Cross-device note for DATA-SCHEMA (TODO-235): `input.hidden` merges as a union, so an unhide can be re-hidden by a stale device's next push until that device pulls; deck deletes have no tombstones (an older device can resurrect a deleted card). Document both as known limitations; true tombstones are a Theme A sync-model decision.

## Testing & verification
- Local, 375×812: Browse → ✕ on a studied card → toast with Undo → tap Undo within 5 s → card back in the same position with its stats (check `seen`). Repeat and let the toast expire → card gone after reload.
- Scripts → ✕ → Undo → script back with furigana intact.
- Input → "Show me 3 things" → "Not for me" → Undo; then hide one and expire → "Hidden sources (1)" → Unhide → it can be recommended again.
- Keyboard: the Undo button is focusable; toast has `role="status"`.

## Acceptance criteria
- [ ] Card/script deletes are undoable for ≥ 5 s.
- [ ] Hidden Input sources are listable and un-hideable.
- [ ] Behaviour documented in DATA-SCHEMA (merge caveats).
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Undo must restore the *same object* (id, stats, fsrs) — do not re-create from SEED.
- Don't add `window.confirm`. Keep Clear-all as is (two-tap).
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
