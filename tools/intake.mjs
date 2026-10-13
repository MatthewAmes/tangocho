/* ── which NEW words a session introduces ──
   Matthew's priorities, stated plainly: the NihonGO NOW! Volume 2 vocabulary first, and
   the 10,000 most common Japanese words alongside it — "is that so hard to ask?"

   It was, the way intake worked. New items were sorted by `order`, which for the deck is
   the lesson number, so every unstarted Volume 1 word came before any Volume 2 word; and
   the frequency list sat behind the whole textbook, so its words almost never won a slot.
   Neither priority was ever expressed anywhere — they fell out of a sort key.

   This states them. The session's new slots are shared out by target:

     Volume 2 textbook words   55%   in book order (act, then scene)
     the 10,000-word list      30%   most common first
     other strands             15%   grammar notes, kanji, verb forms, dates
     the rest of the deck       —    only when Volume 2 has nothing new left to give

   A group with nothing to offer gives its share to the others, so a session is never left
   short because one source ran dry. Pure — see tools/test-intake.mjs. */

export const INTAKE_SHARES = { vol2: 0.55, freq: 0.3, strand: 0.15 };
export const PRIORITY_ACTS = [7, 12];

/* A textbook scene is "7-1" or "12-9R". The supplemental lists that share an act number —
   class notes, dates ("7/20"), dry runs — are not Volume 2 textbook vocabulary. */
const actOf = (item) => {
  const m = String((item && item.sec) || "").match(/^(\d+)-/);
  return m ? +m[1] : null;
};
const sceneOf = (item) => {
  const m = String((item && item.sec) || "").match(/^\d+-(\d+)/);
  return m ? +m[1] : 0;
};

export function intakeGroup(c, acts = PRIORITY_ACTS) {
  if (!c) return "other";
  if (c.deck === "freq") return "freq";
  if (c.deck === "vocab") {
    const a = actOf(c.item);
    return a != null && a >= acts[0] && a <= acts[1] ? "vol2" : "other";
  }
  return "strand";
}

/* Reorder the fresh candidates so that the first N — whatever N the session can afford —
   follow the shares above. Within a group the incoming order is kept, except Volume 2,
   which is put in book order explicitly. */
export function orderIntake(fresh = [], opts = {}) {
  const shares = { ...INTAKE_SHARES, ...(opts.shares || {}) };
  const acts = opts.acts || PRIORITY_ACTS;
  const groups = { vol2: [], freq: [], strand: [], other: [] };
  for (const c of fresh) groups[intakeGroup(c, acts)].push(c);
  groups.vol2.sort((a, b) => (actOf(a.item) - actOf(b.item)) || (sceneOf(a.item) - sceneOf(b.item))
    || ((a.item.order ?? 0) - (b.item.order ?? 0)));
  groups.freq.sort((a, b) => ((a.item.rank ?? 1e9) - (b.item.rank ?? 1e9)));

  /* Volume 1 leftovers stand in for Volume 2 once it is exhausted — it is the same deck. */
  const live = () => {
    const out = [];
    for (const g of ["vol2", "freq", "strand"]) if (groups[g].length) out.push([g, shares[g]]);
    if (!groups.vol2.length && groups.other.length) out.push(["other", shares.vol2]);
    return out;
  };
  const taken = { vol2: 0, freq: 0, strand: 0, other: 0 };
  const result = [];
  while (true) {
    const cands = live();
    if (!cands.length) break;
    const total = cands.reduce((s, [, w]) => s + w, 0);
    const n = result.length + 1;
    // the group furthest behind its share of the next n picks
    let best = null, gap = -Infinity;
    for (const [g, w] of cands) {
      const d = (w / total) * n - taken[g];
      if (d > gap) { gap = d; best = g; }
    }
    result.push(groups[best].shift());
    taken[best]++;
  }
  return result.concat(groups.other);
}
