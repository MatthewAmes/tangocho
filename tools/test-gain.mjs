// Tests for learning gain per minute (tools/gain.mjs).
//   node tools/test-gain.mjs
import {
  answerGain, scorable, activeMs, gainPerMinute, gainBy, gainByPosition, fadePoint, bestUse,
  NEW_FLOOR, MAX_ANSWER_MS, IDLE_GAP_MS, MIN_ROWS,
} from "./gain.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > (tol ?? 0.01)) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };

const T0 = Date.UTC(2026, 7, 27, 18, 0, 0);
// one answer: seconds after T0, think ms, stability before -> after
const row = (sec, ms, s0, s1, extra = {}) => ({ at: T0 + sec * 1000, ms, s0, s1, ...extra });

console.log("=== answerGain: the unit is a doubling ===");
t("a doubling of stability is 1.0, wherever it happens", () => {
  near(answerGain(2, 4), 1);
  near(answerGain(100, 200), 1);
});
t("the mature-card farm does NOT out-earn learning a new word", () => {
  // The case the metric exists to get right. Raw ΔS would say 140 vs 3.
  const easyMature = answerGain(200, 340);
  const brandNew = answerGain(0, 3);
  eq(brandNew > easyMature, true, `new ${brandNew.toFixed(2)} should beat mature ${easyMature.toFixed(2)};`);
});
t("a new card is measured from the floor, not from zero", () => {
  near(answerGain(0, 3), Math.log2(3 / NEW_FLOOR));
  eq(isFinite(answerGain(0, 3)), true);
});
t("a lapse is zero, never negative", () => {
  eq(answerGain(200, 20), 0);
  eq(answerGain(5, 0), 0);
});
t("no movement is no gain", () => { eq(answerGain(10, 10), 0); });
t("garbage in does not produce NaN", () => {
  eq(answerGain(undefined, undefined), 0);
  eq(answerGain(NaN, 5), Math.max(0, Math.log2(5 / NEW_FLOOR)));
  eq(answerGain(Infinity, 5), 0);
});

console.log("=== scorable: rows from before stability was recorded ===");
t("rows without s0/s1 are skipped, not counted as zero", () => {
  const rows = [row(0, 2000, 1, 4), { at: T0, ms: 2000 }, { at: T0, ms: 2000, s0: 1 }];
  eq(scorable(rows).length, 1);
  eq(gainPerMinute(rows).skipped, 2);
});
t("a skipped row does not drag the rate down", () => {
  const good = [row(0, 2000, 1, 4), row(20, 2000, 1, 4)];
  const mixed = good.concat([{ at: T0 + 40000, ms: 2000 }]);
  eq(gainPerMinute(good).rate, gainPerMinute(mixed).rate);
});
t("empty input is safe", () => {
  eq(gainPerMinute([]).rate, null);
  eq(activeMs([]), 0);
  eq(gainPerMinute(undefined).n, 0);
});

console.log("=== activeMs: walking away is not studying ===");
t("normal gaps between answers count as study time", () => {
  // first answer's own 3s, then two 10s gaps
  eq(activeMs([row(0, 3000, 1, 2), row(10, 3000, 1, 2), row(20, 3000, 1, 2)]), 3000 + 10000 + 10000);
});
t("a lunch break does not count", () => {
  const rows = [row(0, 3000, 1, 2), row(3600, 4000, 1, 2)];   // an hour apart
  eq(activeMs(rows), 3000 + 4000, "only the two think times");
});
t("a single very slow answer is capped", () => {
  eq(activeMs([{ at: T0, ms: 10 * 60000, s0: 1, s1: 2 }]), MAX_ANSWER_MS);
});
t("out-of-order rows are sorted before differencing", () => {
  const a = activeMs([row(0, 3000, 1, 2), row(10, 3000, 1, 2)]);
  const b = activeMs([row(10, 3000, 1, 2), row(0, 3000, 1, 2)]);
  eq(a, b);
});
t("the boundary is IDLE_GAP_MS", () => {
  const under = activeMs([row(0, 1000, 1, 2), { at: T0 + IDLE_GAP_MS, ms: 1000, s0: 1, s1: 2 }]);
  const over = activeMs([row(0, 1000, 1, 2), { at: T0 + IDLE_GAP_MS + 1, ms: 1000, s0: 1, s1: 2 }]);
  eq(under, 1000 + IDLE_GAP_MS);
  eq(over, 2000);
});

console.log("=== gainPerMinute ===");
t("two doublings in one minute is a rate of 2", () => {
  // answers at 0s and 60s; first contributes its own 1s, then a 59s gap => 60s total
  const rows = [{ at: T0, ms: 1000, s0: 1, s1: 2 }, { at: T0 + 59000, ms: 1000, s0: 1, s1: 2 }];
  const g = gainPerMinute(rows);
  near(g.gain, 2);
  near(g.minutes, 1);
  near(g.rate, 2);
});
t("the same learning in half the time is twice the rate", () => {
  const slow = [{ at: T0, ms: 1000, s0: 1, s1: 2 }, { at: T0 + 59000, ms: 1000, s0: 1, s1: 2 }];
  const fast = [{ at: T0, ms: 1000, s0: 1, s1: 2 }, { at: T0 + 29000, ms: 1000, s0: 1, s1: 2 }];
  eq(gainPerMinute(fast).rate > gainPerMinute(slow).rate, true);
});
t("a session of pure lapses reports zero, not a negative rate", () => {
  const rows = [row(0, 3000, 100, 10), row(10, 3000, 80, 8)];
  eq(gainPerMinute(rows).gain, 0);
  eq(gainPerMinute(rows).rate, 0);
});

console.log("=== gainBy: which activity earns its minutes ===");
const many = (n, fmt, s0, s1, startSec) =>
  Array.from({ length: n }, (_, i) => row(startSec + i * 10, 3000, s0, s1, { format: fmt }));
t("a bucket under MIN_ROWS reports no rate rather than a noisy one", () => {
  const rows = many(3, "choice", 1, 4, 0);
  const b = gainBy(rows, "format").find((x) => x.key === "choice");
  eq(b.n, 3);
  eq(b.rate, null);
});
t("buckets at MIN_ROWS get a number", () => {
  const rows = many(MIN_ROWS, "choice", 1, 4, 0);
  eq(gainBy(rows, "format")[0].rate != null, true);
});
t("the better-earning format ranks first", () => {
  const rows = many(MIN_ROWS, "type", 1, 8, 0).concat(many(MIN_ROWS, "choice", 1, 2, 10000));
  const ranked = gainBy(rows, "format");
  eq(ranked[0].key, "type");
});
t("a missing field lands in 'unknown' rather than throwing", () => {
  const rows = [row(0, 1000, 1, 2)];
  eq(gainBy(rows, "format")[0].key, "unknown");
});
t("a list-valued field fans out instead of becoming one silly bucket", () => {
  // `mode` is a list — a typed answer demanded recall and production at once. Joining the
  // list into "recall,production" would make a bucket that answers nothing, and splitting
  // one row's gain in half would claim the minutes were shared. They were not: they are
  // the same minutes, counted under both headings.
  const rows = Array.from({ length: MIN_ROWS }, (_, i) =>
    row(i * 10, 3000, 1, 4, { mode: ["recall", "production"] }));
  const by = gainBy(rows, "mode");
  eq(by.length, 2);
  eq(by.find((x) => x.key === "recall").n, MIN_ROWS);
  eq(by.find((x) => x.key === "production").n, MIN_ROWS);
  eq(by.find((x) => x.key === "recall").rate, by.find((x) => x.key === "production").rate);
});
t("rows from before mode tagging group as unknown rather than throwing", () => {
  const rows = [row(0, 1000, 1, 2), row(10, 1000, 1, 2, { mode: [] })];
  const by = gainBy(rows, "mode");
  eq(by.length, 1);
  eq(by[0].key, "unknown");
  eq(by[0].n, 2);
});

console.log("=== bestUse ===");
t("needs two measured buckets before it will compare", () => {
  eq(bestUse(many(MIN_ROWS, "choice", 1, 4, 0), "format"), null);
});
t("reports how many times better the best is", () => {
  const rows = many(MIN_ROWS, "type", 1, 8, 0).concat(many(MIN_ROWS, "choice", 1, 2, 10000));
  const b = bestUse(rows, "format");
  eq(b.top, "type"); eq(b.bottom, "choice");
  near(b.times, 3, 0.2, "3 doublings vs 1 over equal time;");
});

console.log("=== position and fade — the evidence behind stopping ===");
t("a steady session does not report a fade", () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(i * 10, 3000, 1, 4));
  const f = fadePoint(rows, 5);
  eq(f.faded, false);
});
t("a session that stops paying off is detected", () => {
  const strong = Array.from({ length: 10 }, (_, i) => row(i * 10, 3000, 1, 4));
  const spent = Array.from({ length: 10 }, (_, i) => row(100 + i * 10, 3000, 50, 52));
  const f = fadePoint(strong.concat(spent), 5);
  eq(f.faded, true, `ratio ${f && f.ratio};`);
  eq(f.from, 16);
});
t("too short a session says nothing rather than guessing", () => {
  eq(fadePoint(Array.from({ length: 6 }, (_, i) => row(i * 10, 3000, 1, 4)), 5), null);
});
t("position buckets cover every answer exactly once", () => {
  const rows = Array.from({ length: 13 }, (_, i) => row(i * 10, 3000, 1, 4));
  const b = gainByPosition(rows, 5);
  eq(b.length, 3);
  eq(b.reduce((s, x) => s + x.n, 0), 13);
  eq(b[2].from, 11); eq(b[2].to, 13);
});

console.log(`\nall ${run} gain tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exit(fail ? 1 : 0);
