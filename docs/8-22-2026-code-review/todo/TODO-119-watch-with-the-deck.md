# TODO-119 — "Watch with the deck": pre-teach the words you'll meet, post-quiz "which did you catch?", add unknowns to the deck

**Priority:** P2   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 05-expansion §3.2-H, QW-10 (coverage → add unknown words), §6.2 (not the AI path — this is the local path); 02-pedagogy §5 item 8 (in-app comprehension probe makes the level signal less noisy), §7 item 9
**Depends on:** TODO-118 (unknown words), TODO-115 (coverage); optional TODO-126 (AI readings/meanings for unknown words) and the mounted `Add` form (Theme C TODO-218/220 or 05 QW-1)   **Blocks:** none

## Why
The Input tab points at material; it does not teach from it. With per-video unknown words (TODO-118) the card can pre-teach, the rating card can post-quiz, and catches can feed both the level model (objective evidence instead of pure self-report) and the deck (a recognition review logged for words retrieved in context — arguably better evidence than a flashcard). The Coverage panel already lists unknown words but offers nothing to do with them.

## Current behaviour (verified)
- Pick card L4822–4869: title/meta/Play/Not for me. `open()` L4666–4672 stores a `pending` entry `{itemId, at, medium, mode, minutes, title, source, url}`.
- Pending rating card L4773–4790: title + four verdict chips.
- `rate()` L4674–4699 updates level/items/history; no deck interaction.
- Coverage panel L4920–4943 lists `coverage.unknown` words as plain text (L4932).
- Deck additions: `addCards` (root, L1362–1374) exists but `Add` is unmounted (05 QW-1, Theme C); `Input` receives only `cards` (L1481).
- `recordResult` (L1392–1443) can log a recognition review for a card id.

## Intended behaviour
- **Pre-teach**: the pick card gets "Preview 5 words" → expands a list: for each of `it.unknown` (TODO-118) show the word; if it matches a deck card (by term/reading) show reading+meaning from the deck (a "you know this" chip); otherwise show just the word (reading/meaning via TODO-126's `callAI("explain")` if available; else blank) with "+ add" that calls `onAdd([{term, reading:"", romaji:"", meaning:""}])`.
- **Post-quiz**: the pending-rating card shows up to 4 chips "Did you catch … ?" for the words from the opened video (deck words first, then unknowns): tapping ✓/✗ per word. ✓ on a deck word → `onResult(card.id, true, undefined, undefined)` (a recognition review with no latency → GOOD); ✗ → `onResult(card.id, false, …)`? No — a miss while listening is not a flashcard lapse; record ✗ only as input evidence, not as a deck review. Unknown-word ✓ → offer "+ add to deck".
- **Evidence into the level**: catches are an objective comprehension signal; map the catch ratio to a verdict suggestion: ≥ 75 % → highlight "Just right"/"Too easy", ≤ 25 % → highlight "Hard". Do not auto-rate; the learner still taps a verdict (keeps the model simple and honest).
- Coverage panel: "+ add these" button for the unknown list (opens Add prefilled; without the Add form mounted, call `onAdd` with blank readings).

## Implementation steps
1. Props: `<Input cards={cards} onAdd={addCards} onResult={recordResult} />` (root L1481); thread `addCards`/`recordResult` (already `useCallback`s).
2. Helper in Input: `const byTerm = useMemo(() => { const m = new Map(); cards.forEach((c) => { m.set(c.term, c); if (c.reading) m.set(c.reading, c); }); return m; }, [cards]);`
3. Pick card: state `previewId`; button "Preview 5 words" toggles; list from `it.unknown.slice(0, 5)` plus deck words found in the title via `coverageAgainstDeck(it.title, cards)`-style matching (a cheap "words you know in this title" list: iterate deck terms with `it.title.includes(term)` — ≤ 821 `includes` calls, fine).
4. `open()` L4668: store `words: previewWords.map(w => w.term)` on the pending entry (≤ 8).
5. Pending card (L4776–4788): if `p.words?.length`, render a row of `tc-fchip` buttons per word with ✓/✗ toggles (`catch` state in component keyed by `p.itemId+p.at`); on ✓ for a deck word call `onResult(byTerm.get(w).id, true, undefined, undefined)` once per word (guard with a `Set` in a ref). Show the suggested verdict by adding `is-suggest` class to the chip (CSS one line).
6. `rate()` (L4694) history entry: add `caught: k, asked: n` to the row for the export (`exportWeek` L4745–4767 can print `3/4 caught`).
7. Coverage panel L4929–4933: after the unknown list add `<button className="tc-btn tc-btn-sm" onClick={() => onAdd(coverage.unknown.map(u => ({ term: u.w })))}>+ add these to the deck</button>` — `addCards` fills `kind`, `lesson` (L1367–1369) and skips terms already present (L1364–1366). Readings/meanings remain blank until edited (Browse has no edit UI today — note it; with TODO-126, call `callAI("explain", {terms})` to fill reading/meaning before adding).
8. Tests: the word matching helper is pure (`wordsInTitle(title, cards)`) — unit test with a 3-card deck.

## Data migration / compatibility
`pending`/`history` entries gain optional `words`, `caught`, `asked`; `mergeInput` dedupes by `itemId|at` — unchanged. No new keys.

## Testing & verification
- Open an indexed video with unknown words → Preview shows words; pending card shows catch chips; ✓ on a deck word increments that card's `seen` (check in Browse).
- Coverage → paste an NHK Easy paragraph → "+ add these" creates cards (blank meaning) that appear in Browse "Untouched".
- Build + deploy.

## Acceptance criteria
- [ ] Pick card can preview ≤ 5 words (deck words annotated, unknowns plain).
- [ ] Rating card asks "did you catch …?" and ✓ on deck words logs a recognition review; ✗ never logs a lapse.
- [ ] Catch ratio suggests (does not force) a verdict; export shows caught/asked.
- [ ] Coverage and preview offer "+ add to deck" via `addCards`.

## Pitfalls / notes
- `recordResult` calls `logDay(...)` — a caught word counts as a review for the streak; acceptable (it is a retrieval).
- Do not over-quiz: cap at 4 chips; skip the row entirely when the video had no words.
- Rebuild `index.html` and deploy.
