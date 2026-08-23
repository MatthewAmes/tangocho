# TODO-226 — Modularization step 6: de-duplicate — `useSession()` hook, `<WritingPad/>`, `collectBackup()`, `loadJSON()`, `<SessionSummary/>`, think-timer hook

**Priority:** P2   **Effort:** L   **Theme:** C — presentation/platform/maintainability
**Source findings:** 06-architecture § 4.4 duplicated code table, § 9.3 step 6, F-11; 05-expansion § 2.9, § 7 ("Two identical canvas pads", "Four session state machines")
**Depends on:** TODO-225, TODO-229 (session tests exist first)   **Blocks:** none

## Why
The session bookkeeping (queue/pos/passed/firstTry/struggled/missRef/requeue) is implemented three to four times (Study, Kana, ConjDrill, Freq), the canvas writing pad twice (Kana, Write), the backup collector twice (root banner, Browse), the `try { const r = await sGet(K); if (r) X = JSON.parse(r); } catch (e) {}` pattern ~25 times, and the "Go again / Review the N you missed / Done" summary three times. Every scheduler or UX improvement currently has to be made 3–4 times (and the Kana grade-button order already drifted). Consolidating removes ~250 lines and makes the tabs behave identically.

## Current behaviour (verified)
- Session engine: Study `grade` L1735-1761 (`REQUEUE_GAP=3, REQUEUE_CAP=3` L1552) with `passed/firstTry/struggled` Sets, `missRef`, "drop later duplicates" filter, splice requeue; Kana `record` L2713-2742 (`KANA_REQUEUE_GAP=3, KANA_REQUEUE_CAP=2` L2572); ConjDrill `grade` ~L5060-5085; Freq `grade` ~L5484-5505 (`right/total` counters instead of Sets). Think-timer effect `shownRef/thinkRef` ×5 (L1535, L2639, L3763, L5052, L5401).
- Writing pad: Kana L2673-2710 and Write L3724-3760 — `setup()` (DPR, 9px round stroke `#2b2620`), touch-block effect, resize effect, `xy/down/move/up`; near-verbatim.
- Backup collector: `bannerBackup` L1275-1296 and `doBackup` L3834-3854 — 7× `sGet`+`JSON.parse`, blob, `<a download>`, clipboard, `{app:"tangocho", v:2, date, deck, kana, scripts, freq, days, hooks, quota, oral}`.
- `sGet`+`JSON.parse` sites: L1277-1283, L1513, L2601, L3835-3842, L3872, L3898, L4560, L5023, L5413-5426 …
- Summary block: Study L1919-1938, Kana L2792-2818, ConjDrill summary (~L5140-5160).

## Intended behaviour
```
src/hooks/useSession.js   useSession({ items, requeueGap, requeueCap, onGrade }) → { queue, pos, cur, done, poolSize, passed, firstTry, struggled, grade(got), start(pool), quit(), think: { shownRef, thinkRef, markReveal() } }
src/hooks/useStoredJSON.js load-once-from-storage + write-through ref (the `stRef` pattern from Input L4570-4580)
src/components/WritingPad.jsx  <WritingPad ref? clearSignal={pos} ghost={…} onDrawStart /> owning canvas setup/pointer handlers
src/components/SessionSummary.jsx  <SessionSummary pct firstTry missed poolSize unit="cards|kana|prompts" onReview onAgain onDone extra />
src/lib/backup.js         collectBackup(cards) → {blob, json}; downloadBackup(blob); restoreBackup(o, deps) (the latter from Browse.doRestore L3856-3904 — pure given deps)
src/lib/storage.js        loadJSON(key, fallback) (added in TODO-223 if not yet)
```
Behaviour identical per tab: same requeue gaps/caps, same first-try semantics, same "drop later duplicates" rule, same Freq counters derivable from the Sets (`right = passed.size`, `total = grades count` — keep a `grades` counter in the hook).

## Implementation steps
1. **Pin behaviour first**: `test/session.test.mjs` (TODO-229) must already cover: requeue position = `min(pos+1+gap, len)`, cap reached → no requeue, "got" drops later duplicates, firstTry excludes previously missed, done when `pos >= queue.length`.
2. Write `useSession` as a thin hook over a pure reducer in `src/lib/session.js` (`sessionReducer(state, action)`), so the tests exercise the reducer without React. Include the think-timer (`markReveal()` sets `thinkRef` once).
3. Replace Study's session state/grade/start with the hook, keeping Study-specific bits (combo, prodSet, hook/debrief) outside the hook. Run the app; compare a full session's behaviour to the previous build (same requeue positions — add a temporary `console.debug` if needed, remove after).
4. Repeat for Kana (`gap 3, cap 2`), ConjDrill, Freq (use the hook's `grades` counter for `total`).
5. `WritingPad`: move the canvas code; Kana passes `ghost` (kn-ghost) and Write passes `ghost` (tc-ghost); both call `pad.clear()` via a ref on `pos` change (today `setup()` runs on `[pos]`). Keep `touch-action:none` and the non-passive `touchmove` blocker.
6. `collectBackup`: one implementation used by the banner and Browse; the banner passes `cards`. Keep the format `{app:"tangocho", v:2, …}` byte-compatible (same key order) so existing backups restore unchanged. `oral` stays for old-backup compatibility (document in DATA-SCHEMA).
7. `SessionSummary`: Study passes `extra={debrief…}`; Kana passes `elapsed`; unify button order "Review the N you missed" (primary) · "Go again" · "Done".
8. `loadJSON`: sweep the `sGet`+`JSON.parse` sites.
9. Build, tests, full manual regression of the four session tabs + backup/restore.

10. **Reducer sketch** (`src/lib/session.js`) that the hook wraps — pure, tested in TODO-229:
    ```js
    export const initialSession = { queue: [], pos: 0, poolSize: 0, passed: new Set(), firstTry: new Set(), struggled: new Set(), misses: {}, grades: 0 };
    export function sessionReducer(s, a, { gap = 3, cap = 3 } = {}) {
      switch (a.type) {
        case "start": return { ...initialSession, queue: a.pool.slice(), poolSize: a.pool.length };
        case "grade": {
          const c = s.queue[s.pos]; if (!c) return s;
          const passed = new Set(s.passed), firstTry = new Set(s.firstTry), struggled = new Set(s.struggled), misses = { ...s.misses };
          let queue = s.queue;
          if (a.got) { if (!misses[c.id]) firstTry.add(c.id); passed.add(c.id); queue = queue.filter((x, i) => i <= s.pos || x.id !== c.id); }
          else { struggled.add(c.id); const m = (misses[c.id] || 0) + 1; misses[c.id] = m;
                 if (m <= cap) { queue = queue.slice(); queue.splice(Math.min(s.pos + 1 + gap, queue.length), 0, c); } }
          return { ...s, queue, pos: s.pos + 1, passed, firstTry, struggled, misses, grades: s.grades + 1 };
        }
        case "quit": return initialSession;
        default: return s;
      }
    }
    ```
    Study's `grade()` (L1735-1761) is exactly this with `gap=3,cap=3`; Kana's `record()` with `gap=3,cap=2`; Freq derives `right = passed.size`, `total = grades`.

## Data migration / compatibility
Backup JSON format unchanged (assert in `test/backup.test.mjs`: key order `app,v,date,deck,kana,scripts,freq,days,hooks,quota,oral`). Stat records unchanged.

## Testing & verification
- `npm test`: session reducer tests (≥ 8), backup format test, `loadJSON` tests.
- Manual: Study 16-card session with 3 misses → missed cards reappear 3 later, at most 3 times; done screen percentages equal the previous build for the same sequence (compare with a scripted sequence on the old build).
- Kana: miss → reappears 3 later, at most 2 times; Write/Kana pads draw, clear on next card, don't pan the page on iOS.
- Backup from banner and Browse produce identical JSON for the same state (`diff`).

## Acceptance criteria
- [ ] One session engine, one writing pad, one backup collector, one summary component; ≥ 200 lines removed.
- [ ] Session tests pass against the reducer; tab behaviour unchanged.
- [ ] `index.html` rebuilt + committed.

## Pitfalls / notes
- Study's `prodSet`/`isProd` and Freq's `wasNew` logic rely on queue object identity — keep `queue` items as the same card objects.
- `key={pos}` on the card remounts per step (intentional); the hook must expose `pos` unchanged.
- Do not change requeue constants or grade semantics here (Theme B owns scheduling behaviour).
