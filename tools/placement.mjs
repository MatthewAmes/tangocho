/* ── adaptive placement ──
   Pure (no DOM, no storage, no clock beyond what is passed in) — see tools/test-placement.mjs.

   The problem it solves: every map in this app reads "not measured yet" until enough
   evidence accumulates, and the only way to accumulate it is to study — starting from Act 1
   greetings a learner already knows. That is the wrong first hour for someone twelve acts
   in, and it is why the knowledge map, the planner and the tutor brief all open empty.

   So: find the frontier by SEARCH rather than by grinding. Probe an act, and let the result
   move the next probe up or down. Twenty-five questions is enough to bound where "solid"
   ends and "new" begins across twelve acts, because each probe eliminates a range rather
   than one item.

   ── what it does NOT do ──

   It does not decide the learner "knows Act 6". Five questions cannot support that claim and
   nothing here pretends otherwise: it writes ordinary evidence rows, the same shape a
   flashcard answer writes, and lets the existing models draw their own conclusions. The
   Beta posteriors then say "emerging" or "unknown" where five answers is all there is, which
   is the honest reading. The placement's own output is a RANGE — the highest act that looks
   solid and the lowest that looks new — not a score.

   That distinction is the whole design. A placement test that stamped a level onto the
   learner model would be a second, weaker opinion sitting next to the real one. */

const VOL1_ACTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* Five per probe. Fewer cannot separate "knew three of five" from noise; more spends the
   budget on an act the search is about to leave. */
export const PROBE_SIZE = 5;
/* The ceiling on the whole run. A placement that outstays this stops being a shortcut. */
export const MAX_QUESTIONS = 25;
/* Where a cold start opens: the midpoint, so the first probe halves the range either way. */
export const START_ACT = 6;

/* What a probe result means. Deliberately coarse — the point is which way to move, and a
   finer rule would be inventing precision five answers cannot carry. */
export const SOLID = 0.8;      // 4+ of 5: this act is behind them
export const SHAKY = 0.4;      // 2 or fewer: this act is ahead of them

export function verdictFor(correct, asked) {
  if (!asked) return "none";
  const rate = correct / asked;
  if (rate >= SOLID) return "solid";
  if (rate <= SHAKY) return "new";
  return "mixed";
}

/* The search state. `low` is the highest act that has looked solid, `high` the lowest that
   has looked new; the frontier is between them and the search narrows the gap. */
export function startPlacement(opts = {}) {
  const acts = (opts.acts && opts.acts.length ? opts.acts : VOL1_ACTS).slice().sort((a, b) => a - b);
  return {
    acts,
    low: null,            // highest act judged solid
    high: null,           // lowest act judged new
    asked: 0,
    probes: [],           // [{ act, correct, asked, verdict }]
    next: opts.startAct && acts.includes(opts.startAct) ? opts.startAct : (acts.includes(START_ACT) ? START_ACT : acts[Math.floor(acts.length / 2)]),
    done: false,
  };
}

/* Which act to probe next, or null when the search has nothing left to learn. Chooses the
   midpoint of the remaining range, which is what makes this a search and not a sweep. */
export function nextAct(state) {
  const { acts, low, high } = state;
  const candidates = acts.filter((a) => (low == null || a > low) && (high == null || a < high)
    && !state.probes.some((p) => p.act === a));
  if (!candidates.length) return null;
  return candidates[Math.floor(candidates.length / 2)];
}

/* Fold one probe's result in and pick the next act. */
export function recordProbe(state, act, correct, asked) {
  const verdict = verdictFor(correct, asked);
  const probes = [...state.probes, { act, correct, asked, verdict }];
  let low = state.low, high = state.high;

  if (verdict === "solid") low = low == null ? act : Math.max(low, act);
  else if (verdict === "new") high = high == null ? act : Math.min(high, act);
  else {
    /* Mixed is the frontier itself: this act is neither behind nor ahead. Bound the search
       from BOTH sides so it stops here rather than oscillating around a real answer. */
    low = low == null ? act - 1 : Math.max(low, act - 1);
    high = high == null ? act + 1 : Math.min(high, act + 1);
  }

  const asked_total = state.asked + asked;
  const next = { ...state, low, high, probes, asked: asked_total };
  const upcoming = nextAct(next);
  next.next = upcoming;
  next.done = upcoming == null || asked_total >= (state.maxQuestions || MAX_QUESTIONS);
  return next;
}

/* The result, as a range and a list — never as a level.

   `solidThrough` is the highest act that probed solid, `newFrom` the lowest that probed new,
   and `frontier` the act to actually start from: the first one that is not behind them. When
   a mixed probe pinned the frontier exactly, that act IS the frontier — it is the one with
   gaps in it, which is where the work is. */
export function placementResult(state) {
  const probes = state.probes || [];
  const solid = probes.filter((p) => p.verdict === "solid").map((p) => p.act);
  const fresh = probes.filter((p) => p.verdict === "new").map((p) => p.act);
  const mixed = probes.filter((p) => p.verdict === "mixed").map((p) => p.act);

  const solidThrough = solid.length ? Math.max(...solid) : null;
  const newFrom = fresh.length ? Math.min(...fresh) : null;
  const frontier = mixed.length ? Math.min(...mixed)
    : solidThrough != null ? solidThrough + 1
    : newFrom != null ? newFrom
    : null;

  return {
    solidThrough, newFrom, frontier,
    mixed: mixed.sort((a, b) => a - b),
    asked: state.asked || 0,
    probes,
    /* Said plainly, because a placement that cannot explain itself is a number the learner
       has no reason to trust. */
    summary: solidThrough == null && newFrom == null
      ? "Not enough answers to place you yet."
      : solidThrough != null && newFrom != null
        ? `Acts ${state.acts[0]}–${solidThrough} look solid; Act ${newFrom} and beyond look new.`
        : solidThrough != null
          ? `Acts ${state.acts[0]}–${solidThrough} look solid.`
          : `Act ${newFrom} and beyond look new.`,
  };
}

/* ── choosing the actual questions ──
   Cards come from the caller (the live deck), because placement must ask about the words
   THIS learner's deck contains. Seeded so a retry of the same probe is the same five
   questions — a placement that reshuffles under you is one you cannot compare against. */
function seededPick(list, n, seed) {
  const out = [], pool = list.slice();
  let s = seed >>> 0;
  while (out.length < n && pool.length) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out.push(pool.splice(s % pool.length, 1)[0]);
  }
  return out;
}

/* Build one probe: n cards from the act, each with three distractors drawn from OTHER acts
   so a wrong answer means the word, not the neighbourhood. Returns [] when the act has too
   little material, which the caller must treat as "skip this act" rather than as a failure. */
export function buildProbe(act, cardsByAct, opts = {}) {
  const n = opts.size || PROBE_SIZE;
  const seed = opts.seed || 1;
  const mine = (cardsByAct[act] || []).filter((c) => c && c.term && c.meaning);
  if (mine.length < 2) return [];

  const others = [];
  for (const a of Object.keys(cardsByAct)) {
    if (Number(a) === act) continue;
    for (const c of cardsByAct[a]) if (c && c.meaning) others.push(c);
  }

  const picked = seededPick(mine, Math.min(n, mine.length), seed);
  return picked.map((card, i) => {
    const wrong = seededPick(others.filter((o) => o.meaning !== card.meaning), 3, seed + i + 1);
    const choices = seededPick([card, ...wrong], 4, seed + i + 100).map((c) => c.meaning);
    return { id: card.id, act, term: card.term, reading: card.reading, answer: card.meaning, choices };
  }).filter((q) => q.choices.length === 4);
}
