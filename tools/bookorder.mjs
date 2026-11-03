/* ── book order: one act at a time, producing the Japanese ──
   Matthew, 2026-11-03: "my app sucks i dont learn anything and its not fun". His record
   said why. Since September he opened it about once a week; 3 answers in 4 were "pick the
   meaning from four options"; 415 of 682 studied words were overdue; and of the 1,346
   textbook words he could PRODUCE fifteen. His goal is to ace JPN 102 (NihonGO NOW!
   Volume 2, Acts 7–12) starting January, so this mode is built for that and nothing else:

     - New words come from ONE act, in book order, starting at `from` (Act 7 by default —
       the start of Volume 2). The act moves on once every word in it has been tried.
     - Every card asks for the Japanese (learner.mjs productionFirstIntervention). A word
       never met is shown once first.
     - Reviews are production reviews of book words already started. The recognition
       backlog, the 10,000-word list and the other decks are left alone, not deleted —
       switching back to Smart Mix brings them back exactly as they were.
     - The session is small on purpose: about ten new words and fifteen reviews.

   "Can say it" is production stability of a week or more: he produced it, and the memory
   model expects it to still be there in seven days. Pure — see tools/test-bookorder.mjs. */
import { actOf, sceneOf } from "./intake.mjs";
import { VOLUME_ACTS } from "./curriculum.mjs";

// The newest volume in the table — Volume 2, what JPN 102 teaches — is where new words start
// unless he says otherwise.
const LATEST = VOLUME_ACTS[VOLUME_ACTS.length - 1];

export const SAY_DAYS = 7;
export const BOOK_DEFAULTS = { from: LATEST.from, newBudget: 10, maxReviews: 15, gaps: [4, 9] };

export const isBookWord = (c) => !!c && actOf(c) != null && !c.parked;
export const started = (c) => ((c && c.rseen) || 0) > 0;
export const canSay = (c) => !!(c && c.rfsrs && c.rfsrs.S >= SAY_DAYS);

const bookCmp = (a, b) => (actOf(a) - actOf(b)) || (sceneOf(a) - sceneOf(b));

/* Per-act counts, in book order: how many words, how many tried, how many he can say. */
export function actProgress(cards = []) {
  const by = new Map();
  for (const c of cards) {
    if (!isBookWord(c)) continue;
    const a = actOf(c);
    const x = by.get(a) || { act: a, total: 0, started: 0, say: 0 };
    x.total++;
    if (started(c)) x.started++;
    if (canSay(c)) x.say++;
    by.set(a, x);
  }
  return [...by.values()].sort((p, q) => p.act - q.act);
}

/* The act new words come from: the first one at or after `from` with a word not yet
   tried. null when every act from there on has been started — then it is reviews only. */
export function focusAct(cards = [], from = BOOK_DEFAULTS.from) {
  const left = actProgress(cards).find((x) => x.act >= from && x.started < x.total);
  return left ? left.act : null;
}

/* The session, as buildSession-shaped picks ({deck, item, st, fresh, step, caps}) so the
   existing card screens, grading and requeue work on it unchanged. */
export function bookSession(cards = [], opts = {}) {
  const o = { ...BOOK_DEFAULTS, ...opts };
  const now = o.now || Date.now();
  const exclude = o.exclude || new Set();
  const capsFor = o.capsFor || ((c) => ({ type: !!c.reading }));
  const pick = (c, step) => ({
    deck: "vocab", item: c, st: c, fresh: !((c.seen || 0) > 0), stale: false, step,
    caps: capsFor(c), score: 0, productionFirst: true,
  });
  const book = cards.filter((c) => isBookWord(c) && !exclude.has(c.id) && capsFor(c).type);

  /* Reviews: production memories that are due, the most overdue (for their strength)
     first. Any act — a Volume 1 word he has started producing still deserves keeping. */
  const due = book
    .filter((c) => started(c) && c.rfsrs && c.rfsrs.due <= now)
    .sort((a, b) => ((b.rfsrs && (now - b.rfsrs.due) / Math.max(0.5, b.rfsrs.S)) || 0)
                  - ((a.rfsrs && (now - a.rfsrs.due) / Math.max(0.5, a.rfsrs.S)) || 0));
  const reviews = due.slice(0, o.maxReviews);

  /* New: the focus act first, then the next, in book order, until the budget is spent.
     A word he already recognises costs half — producing it is a short step from reading
     it — so an act he half-knows moves twice as fast. A review pile over twice the cap halves intake. */
  let budget = o.newBudget * (due.length > 2 * o.maxReviews ? 0.5 : 1);
  const fresh = [];
  const act = focusAct(cards, o.from);
  if (act != null) {
    const queue = book.filter((c) => !started(c) && actOf(c) >= act).sort(bookCmp);
    for (const c of queue) {
      const cost = (c.seen || 0) > 0 ? 0.5 : 1;
      if (cost > budget) break;
      budget -= cost;
      fresh.push(c);
    }
  }

  /* Reviews are the body; each new word is seated into it, then comes back after a gap so
     it is retrieved again while still warm. A word never met gets one more showing than a
     word he already reads, because its first showing is only that — a showing. */
  const out = reviews.map((c) => pick(c, 0));
  const seat = Math.max(1, Math.floor(out.length / (fresh.length + 1)));
  fresh.forEach((c, i) => out.splice(Math.min(out.length, seat * (i + 1) + i), 0, pick(c, 0)));
  for (const c of fresh) {
    const steps = (c.seen || 0) > 0 ? 1 : 2;
    let at = out.findIndex((p) => p.item.id === c.id);
    for (let s = 0; s < steps; s++) {
      at = Math.min(out.length, at + o.gaps[Math.min(s, o.gaps.length - 1)]);
      out.splice(at, 0, pick(c, s + 1));
    }
  }
  return out;
}
