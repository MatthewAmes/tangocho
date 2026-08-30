/* ── learning gain per minute ──
   The north-star metric: how much durable memory a minute of study actually bought.
   Pure (no storage, no clock of its own) so it can be tested — see tools/test-gain.mjs.

   ## Why stability, and why in doublings

   The only quantity in the app that means "how well is this remembered" is FSRS stability
   S, in days. It cannot be farmed by grinding easy content, because it *is* memory
   strength. So gain is a change in S.

   But summing raw ΔS gives exactly the perverse metric the roadmap warns about. One easy
   review of a mature card moves S from 200 to 340 days — +140. Learning a brand new word
   moves it from nothing to 3 — +3. Raw ΔS therefore says reviewing things you already
   know is forty times more productive than learning something new, and the "north star"
   would point straight at the least useful possible session.

   Stability compounds multiplicatively — FSRS intervals are ratios, not increments — so
   the honest unit is the DOUBLING. log2(S1/S0) says "this memory got twice as durable"
   whether it went 1→2 days or 200→400, which is the comparison a learner actually cares
   about. On that scale learning a new word is the single biggest thing you can do in a
   minute, which is correct.

   ## Two judgement calls, stated rather than buried

   1. A new card has S0 = 0, and log2(0) is not a number. It gets a floor: NEW_FLOOR days,
      roughly "you would have lost this by tomorrow". The floor sets how much credit new
      material earns, so it is a real parameter, not an implementation detail.

   2. A lapse LOWERS S, which would make gain negative. It is floored at zero instead. A
      failed review did not destroy the memory — the memory had already decayed, and the
      review is what revealed it. Counting it as a loss would score a session of hard due
      cards below a session of easy ones, which is the same inversion as (1) by another
      route. Zero says "that minute bought nothing durable yet", which is true and is as
      far as the data supports.
*/

/** Days of stability credited to a card that had none. Sets the value of new material. */
export const NEW_FLOOR = 0.5;
/** A single answer never counts for more than this. Above it, the learner walked away. */
export const MAX_ANSWER_MS = 60000;
/** A gap longer than this between answers is a break, not study time. */
export const IDLE_GAP_MS = 120000;
/** Below this many answers a per-bucket rate is noise and is reported as unknown. */
export const MIN_ROWS = 20;

/** Gain from one answer, in doublings of stability. Never negative — see the header. */
export function answerGain(s0, s1) {
  const a = Math.max(Number(s0) > 0 ? Number(s0) : 0, NEW_FLOOR);
  const b = Math.max(Number(s1) > 0 ? Number(s1) : 0, NEW_FLOOR);
  if (!isFinite(a) || !isFinite(b)) return 0;
  return Math.max(0, Math.log2(b / a));
}

/** Rows that can be scored at all. Everything written before stability was recorded is
 *  simply absent from the metric rather than being counted as a zero — a zero would drag
 *  the rate down and make the app look like it had stopped working. */
export function scorable(rows) {
  return (rows || []).filter(
    (r) => r && typeof r.s0 === "number" && typeof r.s1 === "number" && r.at > 0
  );
}

/** Time genuinely spent, in ms. The gap between two answers is study time — it holds
 *  reading the answer, the flip, the next prompt. A gap past IDLE_GAP_MS is a break, and
 *  collapses to just the thinking time of the answer that ended it. */
export function activeMs(rows) {
  const xs = scorable(rows).slice().sort((a, b) => a.at - b.at);
  if (!xs.length) return 0;
  const own = (r) => Math.min(Math.max(0, r.ms || 0), MAX_ANSWER_MS);
  let total = own(xs[0]);
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i].at - xs[i - 1].at;
    total += gap > IDLE_GAP_MS || gap < 0 ? own(xs[i]) : gap;
  }
  return total;
}

/** The headline. `rate` is doublings per minute; null when there is nothing to measure. */
export function gainPerMinute(rows) {
  const xs = scorable(rows);
  const gain = xs.reduce((s, r) => s + answerGain(r.s0, r.s1), 0);
  const ms = activeMs(xs);
  const minutes = ms / 60000;
  return {
    gain: round(gain),
    minutes: round(minutes),
    rate: minutes > 0 ? round(gain / minutes) : null,
    n: xs.length,
    covered: xs.length,
    skipped: (rows || []).length - xs.length,
  };
}

/** Rate broken down by a field — "which of these actually buys me memory per minute".
 *  Buckets under MIN_ROWS report rate: null rather than a number nobody should act on.
 *
 *  A field holding an ARRAY fans out: `mode` is a list, because one answer can demand
 *  recall and production at once, and a row counts toward every bucket it belongs to. The
 *  buckets therefore overlap and their counts sum past the number of rows. That is the
 *  correct reading — "minutes spent recalling" and "minutes spent producing" are the same
 *  minutes when you typed the answer — and the alternative, one bucket per combination,
 *  splits the evidence so finely that nothing ever reaches MIN_ROWS. */
export function gainBy(rows, field) {
  const groups = new Map();
  for (const r of scorable(rows)) {
    const v = r[field];
    /* An empty array is "classified, and it demanded nothing we track" — not the same as
       an unclassified row, but there is no bucket either way, so both land in unknown. */
    const keys = Array.isArray(v)
      ? (v.length ? v.map(String) : ["unknown"])
      : [v == null ? "unknown" : String(v)];
    for (const k of keys) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
  }
  const out = [];
  for (const [key, xs] of groups) {
    const g = gainPerMinute(xs);
    out.push({ key, n: xs.length, gain: g.gain, minutes: g.minutes, rate: xs.length >= MIN_ROWS ? g.rate : null });
  }
  // Ranked, but only among buckets that earned a number; the rest trail in count order.
  return out.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.n - a.n);
}

/** Gain by position within the session — the evidence behind "stop here". Bucketed
 *  because per-answer rates are far too noisy to read a trend off. */
export function gainByPosition(rows, size = 5) {
  const xs = scorable(rows).slice().sort((a, b) => a.at - b.at);
  const out = [];
  for (let i = 0; i < xs.length; i += size) {
    const chunk = xs.slice(i, i + size);
    const g = gainPerMinute(chunk);
    out.push({ from: i + 1, to: i + chunk.length, n: chunk.length, rate: g.rate, gain: g.gain });
  }
  return out;
}

/** Did the rate fall off a cliff in this session? Compares the last bucket against the
 *  best one so far. Returns null unless there is enough of a session to say anything. */
export function fadePoint(rows, size = 5) {
  const b = gainByPosition(rows, size).filter((x) => x.rate != null && x.n === size);
  if (b.length < 3) return null;
  const best = Math.max(...b.map((x) => x.rate));
  const last = b[b.length - 1];
  if (!(best > 0)) return null;
  const ratio = last.rate / best;
  return { best: round(best), last: round(last.rate), ratio: round(ratio), from: last.from, faded: ratio < 0.5 };
}

/** One comparison worth showing: the best-earning activity against the worst, but only
 *  when both are measured on enough answers to mean it. */
export function bestUse(rows, field = "format") {
  const ranked = gainBy(rows, field).filter((x) => x.rate != null && x.rate > 0);
  if (ranked.length < 2) return null;
  const top = ranked[0], bottom = ranked[ranked.length - 1];
  return { top: top.key, topRate: top.rate, bottom: bottom.key, bottomRate: bottom.rate, times: round(top.rate / bottom.rate) };
}

function round(n) { return Math.round(n * 100) / 100; }
