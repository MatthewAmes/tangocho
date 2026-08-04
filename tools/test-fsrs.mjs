// Tests for the FSRS implementation. Scheduling errors are invisible — a card just quietly
// comes back at the wrong time — so the properties are asserted rather than eyeballed.
//
//   node tools/test-fsrs.mjs
import {
  FSRS_W, AGAIN, HARD, GOOD, EASY,
  retrievability, intervalFor, initialStability, initialDifficulty,
  nextDifficulty, stabilityAfterRecall, stabilityAfterLapse, review,
  seedFromHistory, gradeFromLatency,
} from "./fsrs.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lt = (a, b, m) => { if (!(a < b)) throw new Error(`${m || ""} expected ${a} < ${b}`); };

console.log("=== the forgetting curve ===");
t("a card is ~90% recallable exactly one stability-period out", () => {
  near(retrievability(10, 10), 0.9, 0.001);
  near(retrievability(100, 100), 0.9, 0.001);
});
t("retrievability is 1 at zero elapsed time and decays monotonically", () => {
  near(retrievability(0, 10), 1, 1e-9);
  gt(retrievability(5, 10), retrievability(20, 10));
  gt(retrievability(20, 10), retrievability(200, 10));
});
t("higher stability means slower forgetting", () => {
  gt(retrievability(30, 100), retrievability(30, 10));
});
t("the scheduled interval hits the retention target", () => {
  for (const target of [0.7, 0.8, 0.9, 0.95]) {
    near(retrievability(intervalFor(50, target), 50), target, 1e-6, `target ${target}`);
  }
});
t("a lower retention target means longer gaps", () => {
  gt(intervalFor(50, 0.8), intervalFor(50, 0.9));
  gt(intervalFor(50, 0.9), intervalFor(50, 0.95));
});

console.log("\n=== first review ===");
t("a better first grade gives more initial stability", () => {
  gt(initialStability(EASY), initialStability(GOOD));
  gt(initialStability(GOOD), initialStability(HARD));
  gt(initialStability(HARD), initialStability(AGAIN));
});
t("a worse first grade gives higher difficulty", () => {
  gt(initialDifficulty(AGAIN), initialDifficulty(GOOD));
  gt(initialDifficulty(GOOD), initialDifficulty(EASY));
});
t("initial difficulty stays inside 1..10", () => {
  for (const g of [AGAIN, HARD, GOOD, EASY]) {
    const d = initialDifficulty(g);
    if (d < 1 || d > 10) throw new Error(`grade ${g} -> ${d}`);
  }
});

console.log("\n=== difficulty updates ===");
t("Again pushes difficulty up, Easy pulls it down", () => {
  gt(nextDifficulty(5, AGAIN), 5);
  lt(nextDifficulty(5, EASY), 5);
});
t("difficulty is clamped at both ends under repeated pressure", () => {
  let d = 5; for (let i = 0; i < 200; i++) d = nextDifficulty(d, AGAIN);
  if (d > 10.0001) throw new Error("ran past 10: " + d);
  let e = 5; for (let i = 0; i < 200; i++) e = nextDifficulty(e, EASY);
  if (e < 0.9999) throw new Error("ran below 1: " + e);
});
t("mean reversion pulls a hard card back toward baseline on Good reviews", () => {
  let d = 9.5;
  for (let i = 0; i < 10; i++) d = nextDifficulty(d, GOOD);
  lt(d, 9.5, "should drift down toward the Good baseline");
});

console.log("\n=== stability growth ===");
t("recall always increases stability", () => {
  gt(stabilityAfterRecall(5, 10, 0.9, GOOD), 10);
});
t("Easy grows stability more than Good, which beats Hard", () => {
  const e = stabilityAfterRecall(5, 10, 0.9, EASY);
  const g = stabilityAfterRecall(5, 10, 0.9, GOOD);
  const h = stabilityAfterRecall(5, 10, 0.9, HARD);
  gt(e, g); gt(g, h);
});
t("an easier item (low D) gains more stability than a hard one", () => {
  gt(stabilityAfterRecall(2, 10, 0.9, GOOD), stabilityAfterRecall(9, 10, 0.9, GOOD));
});
t("recalling something you'd nearly forgotten is worth more", () => {
  // the quantitative form of desirable difficulty: low R at review => bigger stability gain
  gt(stabilityAfterRecall(5, 10, 0.6, GOOD), stabilityAfterRecall(5, 10, 0.95, GOOD));
});
t("stability gains shrink as stability grows", () => {
  const lowGain = stabilityAfterRecall(5, 5, 0.9, GOOD) / 5;
  const highGain = stabilityAfterRecall(5, 500, 0.9, GOOD) / 500;
  gt(lowGain, highGain);
});

console.log("\n=== lapses ===");
t("forgetting reduces stability but doesn't wipe it out", () => {
  const after = stabilityAfterLapse(5, 100, 0.9);
  lt(after, 100, "should drop");
  gt(after, 0, "but a forgotten card is not a brand-new card");
});
t("a harder card recovers less from a lapse", () => {
  lt(stabilityAfterLapse(9, 100, 0.9), stabilityAfterLapse(2, 100, 0.9));
});

console.log("\n=== the review loop ===");
t("a brand-new card gets a real schedule", () => {
  const s = review(null, GOOD, 0);
  gt(s.S, 0); gt(s.D, 0); gt(s.ivl, 0); gt(s.due, 0);
});
t("Again schedules a same-day retry, not days later", () => {
  const s = review({ S: 20, D: 5, last: 0 }, AGAIN, 20 * 86400000);
  lt(s.ivl, 1, "should come back within the day");
});
t("repeated Good reviews produce expanding intervals", () => {
  let st = review(null, GOOD, 0), prev = 0, now = 0;
  const seen = [];
  for (let i = 0; i < 6; i++) {
    now += st.ivl * 86400000;
    st = review(st, GOOD, now);
    seen.push(Math.round(st.ivl * 10) / 10);
    gt(st.ivl, prev, "interval " + i + " should expand");
    prev = st.ivl;
  }
  console.log("        intervals (days): " + seen.join(" -> "));
});
t("a lapse shortens the next interval sharply", () => {
  let st = review(null, GOOD, 0);
  let now = 0;
  for (let i = 0; i < 5; i++) { now += st.ivl * 86400000; st = review(st, GOOD, now); }
  const before = st.ivl;
  now += st.ivl * 86400000;
  const after = review(st, AGAIN, now);
  lt(after.ivl, before / 2, "a forgotten card must not stay on a long interval");
});
t("a card answered Easy every time outpaces one answered Hard every time", () => {
  const runOut = (grade) => {
    let st = review(null, grade, 0), now = 0;
    for (let i = 0; i < 5; i++) { now += st.ivl * 86400000; st = review(st, grade, now); }
    return st.S;
  };
  gt(runOut(EASY), runOut(HARD));
});
t("intervals stay finite and sane over a long horizon", () => {
  let st = review(null, EASY, 0), now = 0;
  for (let i = 0; i < 40; i++) { now += st.ivl * 86400000; st = review(st, EASY, now); }
  if (!isFinite(st.S) || !isFinite(st.ivl)) throw new Error("non-finite state");
  if (st.ivl > 3650) throw new Error("interval ran past the 10-year cap: " + st.ivl);
});

console.log("\n=== seeding from the existing deck ===");
t("an unseen card seeds to null rather than a fake memory", () => {
  if (seedFromHistory({ seen: 0 }) !== null) throw new Error("should be null");
});
t("a well-known card seeds stronger than a shaky one", () => {
  const strong = seedFromHistory({ seen: 6, correct: 6, level: 4, last: 0 });
  const shaky = seedFromHistory({ seen: 8, correct: 1, level: 1, last: 0 });
  gt(strong.S, shaky.S, "stability");
  lt(strong.D, shaky.D, "difficulty");
});
t("seeded difficulty stays in range across the whole accuracy span", () => {
  for (const acc of [0, 0.25, 0.5, 0.75, 1]) {
    const s = seedFromHistory({ seen: 8, correct: 8 * acc, level: 2, last: 0 });
    if (s.D < 1 || s.D > 10) throw new Error(`acc ${acc} -> D ${s.D}`);
  }
});
t("Matt's real leeches seed as hard and unstable", () => {
  const walked = seedFromHistory({ seen: 8, correct: 0, level: 1, last: 0 });   // 歩いて, 0% after 8
  gt(walked.D, 8, "should be near the hard end");
  lt(walked.S, 3, "and due again quickly");
});

console.log("\n=== latency -> grade ===");
t("wrong is always Again, however fast", () => {
  if (gradeFromLatency(false, 500) !== AGAIN) throw new Error("fast wrong should be Again");
  if (gradeFromLatency(false, 60000) !== AGAIN) throw new Error("slow wrong should be Again");
});
t("the 3s and 6s thresholds match this deck's own accuracy split", () => {
  if (gradeFromLatency(true, 1500) !== EASY) throw new Error("1.5s should be Easy");
  if (gradeFromLatency(true, 4500) !== GOOD) throw new Error("4.5s should be Good");
  if (gradeFromLatency(true, 9000) !== HARD) throw new Error("9s should be Hard");
});
t("a missing timing falls back to Good rather than punishing the card", () => {
  if (gradeFromLatency(true, 0) !== GOOD) throw new Error("no timing should be Good");
});
t("faster answers schedule further out than slow ones", () => {
  const fast = review(null, gradeFromLatency(true, 1200), 0);
  const slow = review(null, gradeFromLatency(true, 9000), 0);
  gt(fast.ivl, slow.ivl);
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} FSRS tests passed`);
process.exit(fail ? 1 : 0);
