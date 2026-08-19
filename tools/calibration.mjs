/* ── measuring whether the model is right ──
   Every review so far has been an argument about whether a modelling choice is sound.
   None of them could be settled, because nothing was ever compared against what actually
   happened. The evidence log has been recording predictions for months; this reads them
   back.

   The one rule here is the rule the profile already follows: REFUSE TO REPORT WHAT IS NOT
   MEASURED. A calibration report is only useful if it can say "the model is overconfident"
   with justification — which means it must far more often say "not enough answers to
   tell". Eleven answers in a bin swing ±30 percentage points from noise alone, and a
   report presenting that as a finding is worse than no report, because it invites tuning
   the model against nothing.

   So every rate here carries a Wilson interval, and every verdict is withheld unless the
   interval actually excludes the claim being tested. */

import { TARGET_SUCCESS } from "./learner.mjs";

/* Wilson score interval. The textbook normal approximation is wrong exactly where this
   report lives — small samples, rates near 0 or 1 — where it happily produces bounds below
   zero. Wilson stays inside [0,1] and is well behaved down to a handful of trials. */
export function wilson(ok, n, z = 1.96) {
  if (!n) return { rate: null, lo: 0, hi: 1, n: 0 };
  const p = ok / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    rate: Math.round(p * 1000) / 1000,
    lo: Math.max(0, Math.round((centre - half) * 1000) / 1000),
    hi: Math.min(1, Math.round((centre + half) * 1000) / 1000),
    n,
  };
}

/* Below this a bin reports its numbers but never a verdict. Chosen so the widest interval
   a verdict can rest on is roughly ±20 points — coarse, but no longer a coin flip. */
export const MIN_BIN = 25;
/* And below this the bin is not worth printing at all. */
export const MIN_SHOW = 8;

/* Does the observed rate actually disagree with what was predicted? Only claim so when the
   prediction sits outside the interval — otherwise the honest answer is that the data
   cannot tell the two apart, which is the usual answer. */
export function verdictFor(predicted, obs, min = MIN_BIN) {
  if (!obs || obs.n < min) return "insufficient";
  if (predicted > obs.hi) return "overconfident";
  if (predicted < obs.lo) return "underconfident";
  return "calibrated";
}

/* Records written before the intervention model's own prediction was logged carry FSRS
   retrievability in the same field. Averaging the two would produce a curve describing
   neither, so the era is detected rather than assumed. */
export function isModelEra(e) {
  return !!e && typeof e.predicted === "number" && typeof e.pRecall === "number";
}

/* ── 1. prediction calibration ──
   The headline question: when the model says 70%, does the learner succeed 70% of the
   time? Bins are deciles of predicted probability. */
export function predictionCalibration(evidence = [], opts = {}) {
  const field = opts.field === "pRecall" ? "pRecall" : "predicted";
  const rows = evidence.filter((e) => {
    if (!e || typeof e[field] !== "number") return false;
    if (field === "pRecall" || opts.anyEra) return true;
    return isModelEra(e);
  });

  const width = opts.width || 0.1;
  const bins = new Map();
  for (const e of rows) {
    const p = Math.min(0.999, Math.max(0, e[field]));
    const k = Math.floor(p / width);
    if (!bins.has(k)) bins.set(k, { ok: 0, n: 0, sum: 0 });
    const b = bins.get(k);
    b.n++; b.sum += p; if (e.ok) b.ok++;
  }

  const out = [];
  let brier = 0, ece = 0;
  for (const e of rows) brier += Math.pow((e.ok ? 1 : 0) - e[field], 2);
  for (const [k, b] of [...bins.entries()].sort((a, c) => a[0] - c[0])) {
    const obs = wilson(b.ok, b.n);
    const predicted = Math.round((b.sum / b.n) * 1000) / 1000;
    ece += (b.n / rows.length) * Math.abs(predicted - obs.rate);
    if (b.n < MIN_SHOW) continue;
    out.push({
      lo: Math.round(k * width * 100) / 100,
      hi: Math.round((k + 1) * width * 100) / 100,
      predicted, observed: obs.rate, ci: [obs.lo, obs.hi], n: b.n,
      verdict: verdictFor(predicted, obs),
    });
  }

  return {
    field,
    n: rows.length,
    /* Brier is the mean squared error of the probabilities. Reported as a number to watch
       move, not a threshold to pass — its absolute value depends on how hard the questions
       are, so only its trend over time means anything. */
    brier: rows.length ? Math.round((brier / rows.length) * 1000) / 1000 : null,
    /* Expected calibration error: the average gap between promise and delivery, weighted
       by how often each promise is made. */
    ece: rows.length ? Math.round(ece * 1000) / 1000 : null,
    bins: out,
    verdict: overallVerdict(out),
  };
}

function overallVerdict(bins) {
  const decided = bins.filter((b) => b.verdict !== "insufficient");
  if (!decided.length) return "insufficient";
  const over = decided.filter((b) => b.verdict === "overconfident").length;
  const under = decided.filter((b) => b.verdict === "underconfident").length;
  if (over > under && over >= decided.length / 2) return "overconfident";
  if (under > over && under >= decided.length / 2) return "underconfident";
  return "calibrated";
}

/* ── 2. cue calibration ──
   The cue ladder exists to hold retrieval success near TARGET_SUCCESS: hard enough to be
   effortful, easy enough to succeed. If CUE.FREE comes back at 40% the ladder is being
   climbed too fast and the per-cue cost inside predictSuccess is wrong. */
export function cueCalibration(evidence = [], opts = {}) {
  const target = opts.target ?? TARGET_SUCCESS;
  const by = new Map();
  for (const e of evidence) {
    if (!e || typeof e.cue !== "number") continue;
    const key = opts.perSkill ? `${e.skill}:${e.cue}` : String(e.cue);
    if (!by.has(key)) by.set(key, { cue: e.cue, skill: e.skill, ok: 0, n: 0 });
    const b = by.get(key);
    b.n++; if (e.ok) b.ok++;
  }
  const rows = [...by.values()]
    .filter((b) => b.n >= MIN_SHOW)
    .sort((a, b) => a.cue - b.cue)
    .map((b) => {
      const obs = wilson(b.ok, b.n);
      return {
        cue: b.cue, skill: opts.perSkill ? b.skill : null,
        observed: obs.rate, ci: [obs.lo, obs.hi], n: b.n,
        /* "Too hard" means the rung asks for more than the learner can give — the whole
           interval sits below target. Withheld until it can actually be said. */
        verdict: b.n < MIN_BIN ? "insufficient"
          : obs.hi < target ? "too_hard"
            : obs.lo > target ? "too_easy" : "on_target",
      };
    });
  /* The ladder is only coherent if success FALLS as the rung rises. If it does not, the
     rungs are not ordered by difficulty and the continuum is decorative. */
  const decided = rows.filter((r) => r.n >= MIN_BIN);
  let monotonic = null;
  if (decided.length >= 3) {
    monotonic = decided.every((r, i) => i === 0 || r.observed <= decided[i - 1].observed + 0.05);
  }
  return { target, rows, monotonic, n: rows.reduce((s, r) => s + r.n, 0) };
}

/* ── 3. intervention efficacy ──
   After a failure the model picks a next step. Did it work? For each failure, find the next
   answer on the SAME item and record whether it succeeded, grouped by the failure type that
   chose the plan.

   Observational, not experimental: the model chose the intervention, so a plan that looks
   bad may simply be the one reserved for the worst failures. This measures whether the loop
   closes at all — worth knowing — and cannot say a plan beats an alternative never tried. */
export function interventionEfficacy(evidence = [], opts = {}) {
  const byItem = new Map();
  for (const e of evidence) {
    if (!e || !e.id) continue;
    if (!byItem.has(e.id)) byItem.set(e.id, []);
    byItem.get(e.id).push(e);
  }
  const by = new Map();
  const window = opts.withinMs ?? 7 * 86400000;
  for (const list of byItem.values()) {
    list.sort((a, b) => (a.at || 0) - (b.at || 0));
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      if (cur.ok) continue;
      const nxt = list[i + 1];
      if ((nxt.at || 0) - (cur.at || 0) > window) continue;
      const key = cur.failure || "unclassified";
      if (!by.has(key)) by.set(key, { failure: key, ok: 0, n: 0, formats: new Map() });
      const b = by.get(key);
      b.n++; if (nxt.ok) b.ok++;
      const f = nxt.format || "?";
      b.formats.set(f, (b.formats.get(f) || 0) + 1);
    }
  }
  return {
    rows: [...by.values()]
      .filter((b) => b.n >= MIN_SHOW)
      .sort((a, b) => b.n - a.n)
      .map((b) => {
        const obs = wilson(b.ok, b.n);
        return {
          failure: b.failure, recovered: obs.rate, ci: [obs.lo, obs.hi], n: b.n,
          /* What the model actually did next, so a bad recovery rate can be traced to a
             plan rather than left as an unexplained number. */
          next: [...b.formats.entries()].sort((x, y) => y[1] - x[1]).map(([f, c]) => `${f}×${c}`),
          confident: b.n >= MIN_BIN,
        };
      }),
  };
}

/* ── 4. durability ──
   Does succeeding at a harder cue buy longer retention? The desirable-difficulty claim
   behind the whole ladder predicts yes. Measured as: after a success at cue C, was the NEXT
   answer on that item also correct, and how long was the gap?

   A confound worth stating plainly: harder cues are GIVEN to stronger memories, so a
   positive result here is partly the model succeeding at choosing who to stretch. The mean
   gap is reported alongside so the two are at least visible separately. */
export function durability(evidence = [], opts = {}) {
  const byItem = new Map();
  for (const e of evidence) {
    if (!e || !e.id || typeof e.cue !== "number") continue;
    if (!byItem.has(e.id)) byItem.set(e.id, []);
    byItem.get(e.id).push(e);
  }
  const by = new Map();
  for (const list of byItem.values()) {
    list.sort((a, b) => (a.at || 0) - (b.at || 0));
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      if (!cur.ok) continue;
      const nxt = list[i + 1];
      const gapDays = ((nxt.at || 0) - (cur.at || 0)) / 86400000;
      if (gapDays < (opts.minGapDays ?? 0.5)) continue;   // same-session repeats prove nothing
      if (!by.has(cur.cue)) by.set(cur.cue, { cue: cur.cue, ok: 0, n: 0, gap: 0 });
      const b = by.get(cur.cue);
      b.n++; b.gap += gapDays; if (nxt.ok) b.ok++;
    }
  }
  return {
    rows: [...by.values()]
      .filter((b) => b.n >= MIN_SHOW)
      .sort((a, b) => a.cue - b.cue)
      .map((b) => {
        const obs = wilson(b.ok, b.n);
        return {
          cue: b.cue, held: obs.rate, ci: [obs.lo, obs.hi], n: b.n,
          gapDays: Math.round((b.gap / b.n) * 10) / 10,
          confident: b.n >= MIN_BIN,
        };
      }),
  };
}

/* ── 5. transfer ──
   Does practising one ability move another? The interesting case is recognition →
   production, because the gating design assumes reading practice prepares you to write.
   Measured per item: production accuracy on items with a lot of prior recognition practice,
   against items with little.

   The weakest of the five, and labelled as such. The split is not random — items get more
   recognition practice because they were harder — so the comparison carries the OPPOSITE
   bias to the hypothesis. A positive result would mean something; a null one is not
   evidence of no transfer. */
export function transfer(evidence = [], opts = {}) {
  const split = opts.split ?? 6;
  const seen = new Map();          // id -> recognition trials before this point
  const groups = { high: { ok: 0, n: 0 }, low: { ok: 0, n: 0 } };
  const sorted = evidence.filter((e) => e && e.id).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const e of sorted) {
    const prior = seen.get(e.id) || 0;
    if (e.skill === "production") {
      const g = prior >= split ? groups.high : groups.low;
      g.n++; if (e.ok) g.ok++;
    }
    if (e.skill === "recognition") seen.set(e.id, prior + 1);
  }
  const hi = wilson(groups.high.ok, groups.high.n);
  const lo = wilson(groups.low.ok, groups.low.n);
  const decided = groups.high.n >= MIN_BIN && groups.low.n >= MIN_BIN;
  return {
    split,
    wellPractised: hi,
    littlePractice: lo,
    /* Only claim a difference when the intervals do not overlap. Two point estimates ten
       points apart on thirty trials each is noise. */
    verdict: !decided ? "insufficient"
      : hi.lo > lo.hi ? "transfers"
        : lo.lo > hi.hi ? "inverted"
          : "indistinguishable",
    caveat: "observational — items receive more recognition practice because they are harder",
  };
}

/* Everything, plus a plain-language read of where the model stands. */
export function calibrationReport(evidence = [], opts = {}) {
  const list = Array.isArray(evidence) ? evidence : [];
  const days = opts.days || 0;
  const rows = days ? list.filter((e) => e && (Date.now() - (e.at || 0)) <= days * 86400000) : list;
  const prediction = predictionCalibration(rows, opts);
  const cue = cueCalibration(rows, opts);
  return {
    n: rows.length,
    modelEra: rows.filter(isModelEra).length,
    prediction,
    recall: predictionCalibration(rows, { ...opts, field: "pRecall" }),
    cue,
    efficacy: interventionEfficacy(rows, opts),
    durability: durability(rows, opts),
    transfer: transfer(rows, opts),
    headline: headlineFor(prediction, cue),
  };
}

/* The learner reads this, so it says what it means in ordinary words and never claims a
   finding the numbers have not earned. */
export function headlineFor(prediction, cue) {
  const noCue = !cue.rows.length || cue.rows.every((r) => r.verdict === "insufficient");
  if (prediction.verdict === "insufficient" && noCue) {
    return "Not enough answers yet to check the app against reality. Keep studying — this fills in on its own.";
  }
  if (prediction.verdict === "overconfident") {
    return "The app expects more of you than you deliver — questions are arriving harder than intended.";
  }
  if (prediction.verdict === "underconfident") {
    return "You do better than the app expects, so it is holding back. Sessions could push harder.";
  }
  const off = cue.rows.filter((r) => r.verdict === "too_hard" || r.verdict === "too_easy");
  if (off.length) {
    return `The app's guesses are about right overall, but ${off.length === 1 ? "one help level is" : `${off.length} help levels are`} mistuned.`;
  }
  return "The app's predictions match what actually happens. Its difficulty choices are landing where intended.";
}
