# TODO-123 — Particle-fill drills generated from SCRIPT_SEED (no LLM): blank は/が/を/に/で/と/へ/も/の, grade by exact match, schedule with `statReview`

**Priority:** P2   **Effort:** M   **Theme:** B — learning engine
**Source findings:** 05-expansion §4.4 (a) and §2.4 (cloze cards from SCRIPT_SEED); 02-pedagogy §4.3 ("particles/grammar-pattern cards" missing), §5 item 3 (Scripts are re-reading, not retrieval)
**Depends on:** TODO-115 (particle list `FUNCTION_WORDS` and deck longest-match)   **Blocks:** none

## Why
Particles are the JPN 101 error class; the deck has particle "cards" (`〜に`, `〜で`, 〜は…) but no task that exercises choosing the particle in context. SCRIPT_SEED already contains 227 tokenised, translated, course-level lines. A deterministic generator can blank one particle per line and grade by exact match — a retrieval task with spacing, no API needed. It also turns the Scripts material into graded, scheduled items (02 §5 item 3).

## Current behaviour (verified)
- `SCRIPT_SEED` L2947–3350: lines like `tokens: [{ t: "神田", r: "かんだ" }, { t: "さん、" }, { t: "会議", r: "かいぎ" }, { t: "は" }, { t: "何時", r: "なんじ" }, { t: "ですか？" }]` (L3047) — particles are sometimes their own token (`{ t: "は" }`) and sometimes embedded in a kana run (`{ t: "さんは" }`, L3053).
- `Furigana` (L2344–2352) renders tokens and a `＿＿＿` blank token.
- `ConjDrill` (L5002–5215) is the template for a tab-less drill: items with ids, `statReview`/`statNeed` scheduling on `jpn101:conj` (L4954, L5072), session bookkeeping.
- Scripts tab L3461–3706 has list/new/rehearse views.
- `localFill` (L2308–2326) is the dead "___ がすきです" generator — delete/replace.

## Intended behaviour
- Generator `particleItems(scripts)` → items `{ id: "pf:"+scriptId+":"+lineIdx+":"+pos, script, line, blankTokens, answer, options, en }` where exactly one particle occurrence in the line is replaced by a blank token; `answer` ∈ `PARTICLES = ["は","が","を","に","で","と","へ","も","の","か","ね","よ","から","まで"]`; `options` = 6 chips: the answer + 5 distractors drawn from the set (always include は/が/を/に/で when not the answer).
- Detection: walk `lineText(tokens)`; a particle candidate is a `PARTICLES` member at position `i` such that the character before is the end of a deck longest-match (TODO-115 `expandDeckTerms`) or a kanji/katakana, and the character after is not a kana continuation of a known word (i.e. `longest(i+len)` is 0 or it is punctuation/kanji). Use the first 1–2 candidates per line (cap items at ~250).
- Drill UI: a "Particles" mode inside the **Drill** tab (a segmented chip "Conjugation · Particles" at the top of ConjDrill's setup), reusing ConjDrill's session/summary code paths; card front = English line (`en`) + Japanese with the blank (`Furigana`), six option chips; tap = answer; correct if `=== answer`; reveal shows the full line with the particle highlighted and a SpeakBtn for the line (TTS cache).
- Scheduling: stats under `jpn101:particles` keyed by item id with `{seen, correct, level, streak, last, fsrs, ms, msN}`; `statReview`/`statNeed` as in ConjDrill; `logDay({kind:"conj"})` (TODO-111) — or a new `particles` kind.

## Implementation steps
1. Pure generator near `conjugate()`:
   ```js
   const PARTICLES = ["は","が","を","に","で","と","へ","も","の","か","ね","よ","から","まで"];
   function particleItems(scripts, termSet) {          // termSet from expandDeckTerms(cards) (TODO-115)
     const out = [];
     scripts.forEach((s) => s.lines.forEach((line, li) => {
       const text = lineText(line.tokens);
       let taken = 0;
       for (let i = 0; i < text.length && taken < 2; i++) {
         const p = PARTICLES.find((x) => text.startsWith(x, i) && (x.length === 2 || !PARTICLES.some((y) => y.length === 2 && text.startsWith(y, i))));
         if (!p) continue;
         const before = text[i - 1], after = text[i + p.length];
         if (!before || !/[぀-ヿ一-龯]/.test(before)) continue;
         if (after && /[぀-ゟ]/.test(after) && longestIn(termSet, text, i + p.length) === 0 && !PARTICLES.includes(after)) { /* particle glued to an unknown kana word — skip */ }
         if (!(i === text.length - p.length || /[、。？！\s一-龯ァ-ヺ]/.test(after) || longestIn(termSet, text, i + p.length) > 0 || PARTICLES.some((y) => text.startsWith(y, i + p.length)))) continue;
         const blanked = text.slice(0, i) + "＿＿＿" + text.slice(i + p.length);
         out.push({ id: `pf:${s.id}:${li}:${i}`, scriptName: s.name, en: line.en, full: text, blanked, answer: p, tokens: line.tokens });
         taken++; i += p.length - 1;
       }
     }));
     return out;
   }
   ```
   Render `blanked` as plain text (furigana is lost in the blanked version; acceptable — or rebuild tokens by splitting the token containing position `i`; optional).
   `options(answer)`: `[answer, ...shuffle(PARTICLES.filter(p => p !== answer)).slice(0, 5)]` shuffled with `seededShuffle(list, hash(id))`.
2. ConjDrill: add `const [mode, setMode] = useState("conj")` with a chip row at the top of setup (L5177); when `mode === "particles"`, `items = particleItems(SCRIPT_SEED + user scripts, termSet)` (scripts from `sGet("jpn101:scripts")` as Scripts does at L3490), stats key `"jpn101:particles"`, and the session card renders the particle layout instead of the conjugation card (branch inside the session view, L5098+). Grade via a `choose(p)` handler that calls the existing `grade(p === cur.answer)` after setting `thinkRef`.
3. Delete `localFill`/`NOUN_SET` usage? — they belong to `Sentences` (TODO-127 decides); leave.
4. Tests (`tools/test-particles.mjs`, slice `particleItems`, `PARTICLES`, `lineText`): line `神田さん、会議は何時ですか？` with deck containing 会議 → one item with answer `は`; `村田さんは今日、お休みですよ。` → `は` after さん (kanji before? `ん` before — kana; `before` test requires Japanese, passes), not `よ` at the end unless wanted (the regex allows sentence-final `よ`; assert it is produced only as a second candidate); no item where the "particle" is inside a known word (e.g. `に` in `日本語`, `の` in `もの` when `もの` is in the deck).

## Data migration / compatibility
New key `jpn101:particles` (stats map). It falls under the generic "newer snapshot wins" rule in `mergeSnapshots`; TODO-008 (Theme A per-record merge for `kana/conj/freq`) should include `particles` — add it to that item's key list. Backup blob: add `particles` next to `conj` if TODO-008 adds `conj` (today `conj` is not in the backup blob at L3843 either — flag).

## Testing & verification
- `node tools/test-particles.mjs`.
- Drill → Particles → a 10-item session works, reveals, schedules; stats persist across reloads.
- Build + deploy.

## Acceptance criteria
- [ ] ≥ 150 particle items generated from SCRIPT_SEED with no false blanks inside known words.
- [ ] Drill tab offers a Particles mode with option chips, reveal, TTS, and FSRS scheduling under `jpn101:particles`.
- [ ] Generator unit-tested.

## Pitfalls / notes
- `か/ね/よ` at sentence end are pragmatically particles but weak drill targets; keep them as distractors only unless nothing else is in the line (flag `soft: true` and draw them last).
- `から/まで` two-character particles must be matched before `か`.
- Rebuild `index.html` and deploy.
