# TODO-218 — Loading skeleton, empty-deck CTA that goes somewhere, first-run sign-in nudge, backup nag on the home screen

**Priority:** P2   **Effort:** M   **Theme:** C — presentation/platform/maintainability
**Source findings:** 03-presentation-ui-ux-review.md § 3 I-5 (Medium), I-6 (Medium), I-7 (Low), I-8 (Low)
**Depends on:** none (coordinate with Theme B's `Add` mount/delete decision and Theme A's sign-out/401 item)   **Blocks:** none

## Why
First paint of a 549 KB HTML on 3G is 1–3 s of blank indigo, then a bare "Loading your deck…" box with no brand. The empty-deck CTA "Add your first words" routes to Browse, which has no add UI (the `Add` component is never mounted). A student on a new phone can study for days without ever seeing the Google sign-in (it only exists in Browse), and the backup nag ("Last backup was 30 days ago") lives only behind Browse › More — a student who never taps More never sees it.

## Current behaviour (verified)
- Loading: L1472-1473 `{!ready ? (<div className="tc-empty">Loading your deck…</div>) : …}` — rendered *inside* the header/shell (brand + tabs already render before `ready`, L1455-1468), so the "skeleton" gap is only the hero area. The true blank-page time is the script download; `index.html` head inline style L10 only sets `background:#1a1a2e`.
- Empty deck: Study L1776-1781 `<button className="tc-btn tc-btn-primary" onClick={goAdd}>Add your first words</button>`; `goAdd={() => setTab("browse")}` L1475; `Add` (L4067) has 0 render sites; Browse › More has Restore (L4011-4024).
- Sign-in: Google button mounts only in Browse L3982 (`<div ref={googleBtnRef} …/>`); `initGoogleAuth`/`renderGoogleButton` L1070-1091 render into a ref; `loadSession()` L1033.
- Backup nag: Browse › More L3993-3996 `lastBk !== null && Date.now() - lastBk > 7*86400000 && (<p className="tc-conjnote">💾 …</p>)`; `jpn101:lastBackup` read L3831.

## Intended behaviour
- Before `ready`: a 3-line skeleton in the hero area (buddy card outline, big-number block, a button-shaped bar) instead of the text box; plus `index.html` head gets a tiny inline "loading" mark (the seal + 単語帳 in plain HTML inside `#root`) so the very first paint isn't empty — React replaces it on mount.
- Empty deck: CTA reads "Restore a backup" and opens Browse › More › Restore (`showMore` + `showRestore` true), unless Theme B mounts `<Add>` in Browse, in which case the CTA is "Add your first words" and opens Browse with the Add panel open. Implement via a `browseIntent` prop/state.
- Study home shows, once per device until dismissed: a one-line card under the buddy "Sync to your Google account so this progress survives a new phone → Sign in" when `!loadSession() && cards.some(c => c.seen)`; the Google button renders right there (reuse `renderGoogleButton`).
- Study home shows the backup nag when `lastBackup` > 14 days **and** not signed in (signed-in users have the cloud copy).

## Implementation steps
1. **Pre-React first paint**: in `index.html` replace `<div id="root"></div>` with
   `<div id="root"><div style="font:600 30px -apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;color:#fff;padding:28px 16px;letter-spacing:.06em">単語帳</div></div>`.
   **Caution:** `tools/build.mjs` L72-76 asserts the template head ends with `<div id="root"></div>\s*<script>`; update that regex to `/<div id="root">[\s\S]*?<\/div>\s*<script>$/` at the same time, and keep the placeholder on one line.
2. **Skeleton**: add `function Skeleton() { return (<div className="tc-skel" aria-busy="true" aria-label="Loading your deck"><div className="tc-skel-buddy"/><div className="tc-skel-num"/><div className="tc-skel-btn"/></div>); }` and use it at L1473. CSS: `.tc-skel{display:flex;flex-direction:column;gap:14px;align-items:center;padding:6px 2px;} .tc-skel>div{background:rgba(255,255,255,.06);border-radius:14px;} .tc-skel-buddy{width:100%;height:84px;} .tc-skel-num{width:140px;height:96px;border-radius:20px;} .tc-skel-btn{width:100%;height:46px;border-radius:12px;} @media (prefers-reduced-motion:no-preference){.tc-skel>div{animation:tc-shimmer 1.2s ease-in-out infinite alternate;} @keyframes tc-shimmer{to{opacity:.45}}}`.
3. **Empty-deck CTA**: root state `const [browseIntent, setBrowseIntent] = useState(null);` passed to Browse as `intent`; in Browse `useEffect(() => { if (intent === "restore") { setShowMore(true); setShowRestore(true); } }, [intent]);`. Study prop `goAdd={() => { setBrowseIntent("restore"); setTab("browse"); }}` and button text "Restore a backup" + a secondary line "or sign in to pull your progress from the cloud". If Theme B mounts `<Add>`: `intent === "add"` opens that panel and the label stays "Add your first words".
4. **Sign-in nudge** on Study setup (after the buddy card, ~L1802): 
   ```jsx
   {!signedIn && ranked.length > 0 && !nudgeOff && (
     <div className="tc-nudge"><span>Sync to your Google account so this progress survives a new phone.</span>
       <div ref={nudgeBtnRef} /> <button className="tc-linkbtn" onClick={() => { sSet("jpn101:nudgeOff", "1"); setNudgeOff(true); }}>Not now</button></div>)}
   ```
   with `useEffect(() => { if (!signedIn && nudgeBtnRef.current) renderGoogleButton(nudgeBtnRef.current); }, [signedIn])` — read `renderGoogleButton`'s exact signature at L1086-1091 (it takes the container element; check whether it also needs a callback). `signedIn = !!loadSession()` computed per render; `nudgeOff` loaded from `jpn101:nudgeOff` (add it to `SYNC_SKIP_KEYS`, L908, so it is per device). CSS `.tc-nudge{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:rgba(124,92,255,.12);border:1px solid rgba(124,92,255,.35);border-radius:14px;padding:10px 14px;font-size:13.5px;}`.
5. **Backup nag** on Study setup: `{!signedIn && lastBk !== null && Date.now() - lastBk > 14*86400000 && <p className="tc-bkpnudge">💾 {lastBk ? `Last backup ${Math.floor((Date.now()-lastBk)/86400000)} days ago` : "No backup yet on this device"} — <button className="tc-linkbtn" onClick={() => { setBrowseIntent("backup"); setTab("browse"); }}>back up now</button></p>}` — `.tc-bkpnudge` already exists in CSS (L5879, currently unused). Study needs `lastBk`: read `jpn101:lastBackup` once in an effect (same as Browse L3831). `intent === "backup"` → Browse opens More.
6. `.tc-linkbtn{appearance:none;background:none;border:0;color:var(--shu-soft);font:inherit;text-decoration:underline;cursor:pointer;padding:0;min-height:44px;}`.
7. Rebuild.

## Data migration / compatibility
New per-device key `jpn101:nudgeOff` (not synced — add to `SYNC_SKIP_KEYS`; list it in DATA-SCHEMA, TODO-235).

## Testing & verification
- DevTools → Network "Slow 3G" → reload → `単語帳` visible immediately, then skeleton, then the app. `npm run build` still passes its template assertion.
- Clear site data → Study home shows no nudge (no studied cards) → study 1 card → nudge with a real Google button (prod origin only; locally the button may not render — the text and "Not now" still show) → "Not now" → gone after reload.
- Browse → Clear all → Study shows "Restore a backup" → tap → Browse opens with Restore panel open.
- Set `localStorage['jpn101:lastBackup']='1'` while signed out → home shows the backup nag → "back up now" → Browse More opens.

## Acceptance criteria
- [ ] First paint shows the wordmark before JS; skeleton replaces the text box.
- [ ] Empty-deck CTA lands on a screen that can actually add/restore words.
- [ ] Sign-in nudge and backup nag appear on Study home under the stated conditions and are dismissible.
- [ ] `tools/build.mjs` template check updated; `index.html` rebuilt + committed.

## Pitfalls / notes
- `renderGoogleButton` is gated on `loadSession()` (L1088 — returns early when a token exists); the nudge must only mount when signed out.
- The GSI button needs the prod origin; local testing shows the nudge text only.
- Sign-out button and 401 recovery are Theme A's item (uses `signOutGoogle` L1041) — don't duplicate; the nudge only covers the signed-out state.
- Rebuild + commit `index.html`; `cd cf && npx wrangler deploy`.
