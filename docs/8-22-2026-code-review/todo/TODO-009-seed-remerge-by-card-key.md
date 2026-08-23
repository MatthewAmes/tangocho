# TODO-009 — Seed re-merge keyed by `term|lesson|sec` (not `term`), repair decks corrupted by the old merge, de-collide 方

**Priority:** P1   **Effort:** M   **Theme:** A — security/sync/correctness
**Source findings:** 01-functionality-review § 1.1 (HIGH, with simulation), Appendix A; 06-architecture § 6.3, F-6; 02-pedagogy § 4.3 (duplicates); 05-expansion § 4.1 ("one trap to fix first")
**Depends on:** TODO-008 (imports `cardMergeKey` from `tools/merge.mjs`; can be done with the in-file function if 008 is not yet landed)   **Blocks:** TODO-124 (Theme B: per-pair content decisions for the 17 duplicates — it assumes this merge/repair exists), TODO-122 (new SEED fields reach existing decks only via `SEED_FIELDS` here)

## Why
`SEED` contains 17 duplicated terms (復習, 写真, 読み, 書き, あとで, うち, 何か, 外, では, なるほど, 前, 〜で, 〜に, 質問, 〜つ, 〜人, 方) that are deliberately distinct cards (different lesson/scene, sometimes different meaning). Sync merges cards by `term|lesson|sec`, but the `SEED_VERSION` bump merge keys by `term` alone and `Object.assign`s `reading, romaji, meaning, kind, emoji, pitch, lesson` (not `sec`). For any deck that existed before the Act 4-6 import (Matthew's does), the later SEED row overwrote the earlier card's meaning/lesson while keeping the old `sec`, and the second card was never created. Simulation: 805 cards vs 821 on a fresh install; うち "house" became "our company"; 前 "before" became "front" with `sec 3-2`; 写真 moved to lesson 43 with no `sec` (lands in "Class notes"). The same deterministic bug runs on every device so the corruption is invisible and permanent. Additionally 方 appears twice with the *same* `lesson:43, sec:"6-3"` (ほう vs かた), so even the sync key collapses them.

## Current behaviour (verified)
- `JpnFlashcards.jsx:1331-1342`:
  ```js
  } else if (ver < SEED_VERSION) {
    try { await sSet("jpn101:snapshot", …pre-merge backup…); } catch (e) {}
    const byTerm = new Map(list.map((c) => [c.term, c]));
    SEED.forEach((s) => {
      const ex = byTerm.get(s.term);
      if (ex) Object.assign(ex, { reading: s.reading, romaji: s.romaji, meaning: s.meaning, kind: s.kind, emoji: s.emoji, pitch: s.pitch, lesson: s.lesson });
      else { const nc = { id: uid(), seen: 0, correct: 0, ...s }; list.push(nc); byTerm.set(s.term, nc); }
    });
    await sSet(STORE_KEY, JSON.stringify(list)); await sSet(SEED_KEY, String(SEED_VERSION));
  }
  ```
- `:936` `cardMergeKey(c) = term|lesson|sec`. `:14` `SEED_VERSION = 30`.
- Duplicate rows (term: lesson|sec pairs): 復習 3|, 39|5-6 · 写真 3|, 43|6-3 · 読み 3|, 39|5-6 · 書き 3|, 39|5-6 · あとで 9|, 39|5-6 · うち 12|, 38|5-5 · 何か 12|, 45|6-5 · 外 14|, 42|6-2 · では 5|, 33|4-7R · なるほど 18|3-1, 20|3-3 · 前 19|3-2, 43|6-3 · 〜で 21|3-4, 37|5-4 · 〜に 21|3-4, 37|5-4 · 質問 22|Culture talk, 35|5-2 · 〜つ 23|3-5, 36|5-3 · 〜人 23|3-5, 42|6-2 · **方 43|6-3, 43|6-3** (`:713` ほう "way, alternative", `:722` かた "person (honorific)").
- Other places that key by `term` alone and therefore also collapse duplicates: `addCards` `:1364-1366` (`have = new Set(prev.map(c => c.term))`), pack apply `:3860-3862`, restore seed back-fill `:3905-3909`, Freq merge `:5421-5422` (fine — freq terms unique).
- `sectionOf` (`:2153-2155`) returns `c.sec` verbatim as the chip name; `sectionRank` parses `^(\d+)-(\d+)`.

## Intended behaviour
- Seed merge keys by `cardMergeKey`; refresh fields include `sec`; missing `(term,lesson,sec)` rows are added; duplicate-term rows are never merged into one card.
- A one-off repair step fixes decks damaged by the old merge: an existing card whose key matches no SEED row but whose term has multiple SEED rows is re-attached to the right row (by reading, else by sec, else by lesson), keeping its study history; the other row(s) are added fresh.
- The two 方 rows get distinct keys: the second gets `sec: "6-3#2"`, and `sectionOf` strips a trailing `#n` so both still show in the "6-3" chip.
- `addCards`, pack apply and restore back-fill use `cardMergeKey` too.
- Field refresh list is data-driven (`SEED_FIELDS`).

## Implementation steps
1. **De-collide 方** — edit `:722` to `sec: "6-3#2"`. Change `sectionOf`:
   ```js
   function sectionOf(c) {
     const sec = c.sec ? String(c.sec).replace(/#\d+$/, "") : "";   // "#n" only disambiguates same-scene duplicates
     return sec || SECTION_MAP[c.term] || ((c.lesson || 0) <= 6 ? "Act 1" : "Class notes");
   }
   ```
   Grep `\.sec\b` to confirm no other reader of raw `sec` on deck cards (only `:936` key, `:2154`, `:3865` pack copy).
2. **Pure seed-merge function** — add to `tools/merge.mjs` (TODO-008) or, if not yet moved, next to `cardMergeKey` in the JSX:
   ```js
   export const SEED_FIELDS = ["reading", "romaji", "meaning", "kind", "emoji", "pitch", "lesson", "sec"];
   /** Bring an existing deck up to the current SEED. Keys by term|lesson|sec; repairs cards that an
    *  older term-only merge mislabelled; never collapses two seed rows into one card. Pure. */
   export function applySeed(list, seed, mkId) {
     const out = list.map((c) => ({ ...c }));
     const byKey = new Map();
     out.forEach((c) => { const k = cardMergeKey(c); if (!byKey.has(k)) byKey.set(k, c); });
     const rowsByTerm = new Map();
     seed.forEach((s) => { if (!rowsByTerm.has(s.term)) rowsByTerm.set(s.term, []); rowsByTerm.get(s.term).push(s); });
     const claimed = new Set();                                   // seed keys already owned by a card
     seed.forEach((s) => { if (byKey.has(cardMergeKey(s))) claimed.add(cardMergeKey(s)); });
     // repair: cards whose key matches no seed row, but whose term has seed rows → re-attach
     out.forEach((c) => {
       const k = cardMergeKey(c);
       if (claimed.has(k)) return;
       const rows = (rowsByTerm.get(c.term) || []).filter((s) => !claimed.has(cardMergeKey(s)));
       if (!rows.length) return;                                  // user-added word or deleted seed row: leave alone
       const pick = rows.find((s) => s.reading === c.reading) || rows.find((s) => (s.sec || "") === (c.sec || ""))
                 || rows.find((s) => s.lesson === c.lesson) || (rows.length === 1 ? rows[0] : null);
       if (!pick) return;
       byKey.delete(k);
       SEED_FIELDS.forEach((f) => { if (pick[f] === undefined) delete c[f]; else c[f] = pick[f]; });
       byKey.set(cardMergeKey(c), c); claimed.add(cardMergeKey(c));
     });
     // refresh display fields of matched cards, add missing rows
     seed.forEach((s) => {
       const k = cardMergeKey(s), ex = byKey.get(k);
       if (ex) { SEED_FIELDS.forEach((f) => { if (s[f] === undefined) delete ex[f]; else ex[f] = s[f]; }); return; }
       const nc = { id: mkId(), seen: 0, correct: 0, ...s };
       out.push(nc); byKey.set(k, nc);
     });
     return out;
   }
   ```
   Note the repair only touches cards whose term has seed rows and whose key is unmatched — a user-added card with a novel term is untouched; a seed card the user deleted is re-added (existing behaviour, keep).
3. **Use it** in `loadCardsAndSync` (`:1331-1342`): keep the `jpn101:snapshot` safety copy, then `list = applySeed(list, SEED, uid);` and the two `sSet`s. Bump `SEED_VERSION` to 31 (`:14`) so every existing deck runs the repair exactly once.
4. **Key the other term-only sites by `cardMergeKey`**: `addCards` (`:1364-1366`) `const have = new Set(prev.map(cardMergeKey)); … .filter((c) => c.term && !have.has(cardMergeKey(c)))` (user-added words have no lesson until assigned at `:1369` — compute the key after assigning `lesson`, or treat `lesson == null` as `""`, which `cardMergeKey` already does); pack apply (`:3860-3862`); restore back-fill (`:3905-3909`).
5. **Invariant check at build time** — in `tools/check-feeds.mjs` (already imported by `build.mjs`) or a new `tools/check-seed.mjs` imported the same way: parse `SEED` (reuse the regex approach in 01 Appendix A or `grab()` from `test-input-engine.mjs`) and fail the build if any `term|lesson|sec` key repeats. With the 方 fix the count is 0.
6. **Tests** — `tools/test-merge.mjs` (TODO-008) add `applySeed` cases built from a mini seed: (a) fresh deck unchanged except field refresh; (b) the 01 § 1.1 scenario: deck has only the first rows (lesson ≤ 30) after the old term-only merge (simulate by applying the *old* algorithm to a subset, then `applySeed`) → result has the same count as a fresh install and 前 (lesson 19) keeps its `seen` with meaning "before (time)" while 前 (43|6-3) is added with `seen 0`; (c) 方: one existing card with reading かた, key 方|43|6-3 → re-attached to the かた row (now 6-3#2), ほう added; (d) user-added card with a non-seed term untouched; (e) idempotent: `applySeed(applySeed(x))` equals `applySeed(x)`.
7. Rebuild, commit `index.html`, deploy. After deploy, open the app on Matthew's main device and confirm card count 821 and that うち shows "house; home" in Browse; `jpn101:snapshot` holds the pre-repair deck if anything needs undoing.

## Data migration / compatibility
- Runs once per device via the `SEED_VERSION` bump; deterministic, so devices converge. Per-card sync merge then reconciles by key; the repaired cards keep their `id`, `seen`, `fsrs`.
- The pre-merge backup `jpn101:snapshot` is written as today (`:1333`). Tell the user in the commit body how to restore it (Browse → Restore → paste).
- Cross-device window: device A (new build) repairs and pushes; device B still on the old build pulls … B does not pull until reload, and on reload it gets the new build. Safe.

## Testing & verification
- `node tools/test-merge.mjs` (new cases) and the build's seed-key invariant pass.
- Simulation (repeat 01 Appendix A): take SEED rows with lesson ≤ 30 as the deck, run the OLD merge, then `applySeed` → 821 cards, 写真 lesson 3 no sec, うち "house; home", 前 (19|3-2) "before (time)" and (43|6-3) "front", 方 two cards.
- Manual: Study → Sections shows "6-3" once (not "6-3#2"); Browse search 方 shows two cards.

## Acceptance criteria
- [ ] Seed merge is keyed by `term|lesson|sec`, refreshes `sec`, adds missing rows, never collapses duplicates.
- [ ] Existing corrupted decks are repaired on the version bump without losing study history.
- [ ] 方 has two distinct cards; section chips unchanged.
- [ ] Build fails on duplicate seed keys; tests pass.

## Pitfalls / notes
- Division of labour with TODO-124 (Theme B): this item owns the *mechanism* (key, repair, `SEED_FIELDS`, `#n` disambiguator in `sectionOf`); TODO-124 owns the *content* decisions (which duplicate pairs are legitimate vs accidental) and may also add the duplicate-key build check — if TODO-124 already added `tools/check-seed.mjs`, skip step 5 here. Use the `sec: "6-3#2"` convention for 方 rather than a new `sense` field or a visible label like "6-3 (honorific)", so `sectionOf` and `sectionRank` need no further changes; if TODO-124 decides to *merge* some accidental pairs into one row, the repair rule here still re-attaches orphaned cards by reading/sec/lesson, and a removed SEED row's card is simply left alone (not deleted).
- Do not "fix" duplicates by editing SEED terms (e.g. "方（かた）") — the term is what the card shows.
- `Object.assign(ex, {pitch: undefined})` used to set an explicit `undefined`; the new code deletes absent fields so JSON stays clean.
- TODO-017 (unparsable deck guard) touches the same `loadCardsAndSync` block — land them in separate commits.
- Build/deploy reminder: `cd tools && npm install && node build.mjs` then `cd ../cf && npx wrangler deploy`; `index.html` is a committed build artifact and must be rebuilt and committed.
