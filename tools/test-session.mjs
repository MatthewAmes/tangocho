// Tests for the unified session builder. Selection bugs are the quiet kind — the session
// still looks fine, it is just made of the wrong things — so the properties that actually
// matter for memory are asserted rather than eyeballed.
//
//   node tools/test-session.mjs
import {
  DEFAULTS, need, daysSince, isStale, pacePerItem, budgetFor,
  candidates, buildSession, describe, formatFor, withFormats, FORMATS,
} from "./session.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lte = (a, b, m) => { if (!(a <= b)) throw new Error(`${m || ""} expected ${a} <= ${b}`); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const DAY = 86400000;
const NOW = 1_700_000_000_000;

// A studied item with a given stability, last seen `ago` days back.
const studied = (id, S, ago, extra = {}) => ({
  id, seen: 5, correct: 5, level: 3, streak: 2, last: NOW - ago * DAY,
  fsrs: { S, D: 5, last: NOW - ago * DAY, due: NOW, ivl: S }, ms: 4000 * 5, msN: 5, ...extra,
});
const deck = (name, n, mk, weight) => ({
  deck: name, weight,
  items: Array.from({ length: n }, (_, i) => ({ id: `${name}${i}`, order: i })),
  stats: Object.fromEntries(Array.from({ length: n }, (_, i) => [`${name}${i}`, mk(i)]).filter(([, v]) => v)),
});

console.log("=== need scoring ===");
t("a never-studied item outranks anything still well-retained", () => {
  // Deliberately not "outranks everything": a badly decayed item SHOULD beat a new one.
  // Rescuing a word you are about to lose matters more than meeting a word you never had.
  gt(need(null, NOW), need(studied("a", 100, 5), NOW));
  gt(need(undefined, NOW), need(studied("a", 60, 3), NOW));
  gt(need(studied("c", 1, 60), NOW), need(null, NOW), "a nearly-lost item outranks a new one");
});
t("a more-decayed memory outranks a fresher one", () => {
  gt(need(studied("a", 10, 30), NOW), need(studied("b", 10, 2), NOW));
});
t("higher stability means less need at the same elapsed time", () => {
  gt(need(studied("a", 5, 20), NOW), need(studied("b", 200, 20), NOW));
});

console.log("\n=== the staleness ceiling ===");
t("a genuinely faded item is stale, whatever the elapsed time", () => {
  // Trigger 1, the recall floor: the model itself says this has dropped below 80%.
  ok(isStale(studied("a", 3, 60), NOW), "a faded item should be stale");
  ok(isStale(studied("a", 10, 200), NOW), "badly faded should be stale");
});
t("a solid item is NOT stale merely because it has been a while", () => {
  // This is the change the review argued for: forcing retrieval on an item at ~99% recall
  // produces almost no strengthening and spends a slot a decaying card needed.
  eq(isStale(studied("a", 3000, 200), NOW), false, "200 days at high stability is fine");
  eq(isStale(studied("a", 3000, 300), NOW), false, "300 days at high stability is fine");
});
t("the distrust backstop still fires on very long intervals", () => {
  // Trigger 2: FSRS scheduling something years out is an extrapolation well past its
  // evidence. If the stability estimate is wrong you find out far too late to fix it.
  ok(isStale(studied("a", 3000, 400), NOW), "past a year, check in regardless");
  ok(isStale(studied("a", 99999, 900), NOW), "however stable the model thinks it is");
});
t("the legacy bare-number ceiling still works", () => {
  ok(isStale(studied("a", 3000, 200), NOW, 45), "a numeric third arg means ceilingDays");
});
t("the recall floor is configurable", () => {
  const st = studied("a", 30, 20);
  const strict = isStale(st, NOW, { recallFloor: 0.99, ceilingDays: 365 });
  const loose = isStale(st, NOW, { recallFloor: 0.10, ceilingDays: 365 });
  eq(loose, false, "a permissive floor should let it pass");
  ok(strict, "a strict floor should catch it");
});
t("a never-studied item is new, not stale", () => {
  eq(isStale(null, NOW, 45), false);
  eq(isStale({ seen: 0 }, NOW, 45), false);
});
t("an item inside the ceiling is not stale", () => {
  eq(isStale(studied("a", 3000, 10), NOW, 45), false);
});
t("staleness lifts an item above equally-decayed peers", () => {
  const src = [{
    deck: "vocab",
    items: [{ id: "stale" }, { id: "fine" }],
    stats: { stale: studied("stale", 3000, 300), fine: studied("fine", 3000, 1) },
  }];
  const c = candidates(src, { now: NOW, ceilingDays: 45 });
  const s = c.find((x) => x.item.id === "stale"), f = c.find((x) => x.item.id === "fine");
  gt(s.score, f.score, "stale should outscore fresh-but-identical");
});
t("daysSince falls back to the fsrs timestamp when last is missing", () => {
  eq(daysSince({ seen: 1, fsrs: { S: 1, last: NOW - 5 * DAY } }, NOW), 5);
  eq(daysSince(null, NOW), Infinity);
});

console.log("\n=== the time budget ===");
t("pace comes from real latency when there is history", () => {
  const src = [deck("v", 10, () => studied("x", 10, 1))];
  gt(pacePerItem(src), 4000);            // 4000ms measured, padded
  lte(pacePerItem(src), 12000);
});
t("pace falls back cleanly with no history at all", () => {
  eq(pacePerItem([{ deck: "v", items: [], stats: {} }]), DEFAULTS.fallbackMs);
});
t("the chosen pace, not answer speed, is what sets session length", () => {
  /* This replaces a test that asserted a slower learner gets a shorter session. That
     property is gone, deliberately. Measured answer latency is capped at 12s per item,
     and the minutes-scaled ceiling sits below what that produces at every realistic
     speed — so the ceiling binds and the pace control is the real lever. Keeping the old
     test would have meant weakening the ceiling, which is the thing that actually made
     "I only have five minutes" mean anything. Latency still trims a session when someone
     is answering slowly enough to fall under the ceiling. */
  const fast = [deck("v", 200, () => studied("x", 10, 5, { ms: 2000 * 5 }))];
  const slow = [deck("v", 200, () => studied("x", 10, 5, { ms: 9000 * 5 }))];
  eq(budgetFor(fast, { minutes: 10 }), budgetFor(slow, { minutes: 10 }),
    "at a normal pace the ceiling governs both");
  gt(budgetFor(fast, { minutes: 20 }), budgetFor(fast, { minutes: 5 }),
    "and the pace itself must still matter");
});
t("the requested minutes actually change the session length", () => {
  /* This was inert: the ceiling was a fixed 28, every pace computed well past it at any
     realistic answer speed, and "I only have five minutes" bought the same session as
     "I have twenty". A pace setting that changes nothing is worse than none. */
  const src = [deck("v", 200, () => studied("x", 10, 5))];
  const short = budgetFor(src, { minutes: 5 });
  const normal = budgetFor(src, { minutes: 10 });
  const deep = budgetFor(src, { minutes: 20 });
  gt(normal, short, "ten minutes should beat five");
  gt(deep, normal, "twenty minutes should beat ten");
  // And the default has to be a sitting the learner will actually finish.
  eq(normal, 20, "the normal pace should be about twenty items");
  lte(short, 10, "a five-minute session should be genuinely short");
});
t("session size stays within its clamps however extreme the pace", () => {
  const crawl = [deck("v", 99, () => studied("x", 10, 5, { ms: 60000 * 5 }))];
  const blitz = [deck("v", 99, () => studied("x", 10, 5, { ms: 200 * 5 }))];
  lte(budgetFor(crawl), DEFAULTS.maxItems);
  gt(budgetFor(crawl), DEFAULTS.minItems - 1);
  lte(budgetFor(blitz), DEFAULTS.maxItems);
});

console.log("\n=== learning steps ===");
const withNew = () => [{
  deck: "vocab",
  items: [
    ...Array.from({ length: 20 }, (_, i) => ({ id: "old" + i, order: i })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: "new" + i, order: 100 + i })),
  ],
  stats: Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["old" + i, studied("old" + i, 8, 12)])),
}];

t("every new item is shown more than once in the same session", () => {
  const picks = buildSession(withNew(), { now: NOW, size: 24 });
  const news = picks.filter((p) => p.fresh);
  const byId = {};
  for (const p of news) byId[p.item.id] = (byId[p.item.id] || 0) + 1;
  const ids = Object.keys(byId);
  ok(ids.length > 0, "expected some new items");
  for (const id of ids) gt(byId[id], 1, `new item ${id} should repeat`);
});
t("the repeats are spaced apart, not adjacent", () => {
  const picks = buildSession(withNew(), { now: NOW, size: 24 });
  const id = picks.find((p) => p.fresh).item.id;
  const at = picks.map((p, i) => (p.item.id === id ? i : -1)).filter((i) => i >= 0);
  gt(at.length, 1);
  for (let i = 1; i < at.length; i++) gt(at[i] - at[i - 1], 1, "repeats must not be adjacent");
});
t("the gaps expand rather than staying flat — for every new item, not just the first", () => {
  const picks = buildSession(withNew(), { now: NOW, size: 26 });
  const ids = [...new Set(picks.filter((p) => p.fresh).map((p) => p.item.id))];
  ok(ids.length > 0, "expected new items");
  for (const id of ids) {
    const at = picks.map((p, i) => (p.item.id === id ? i : -1)).filter((i) => i >= 0);
    if (at.length >= 3) gt(at[2] - at[1], at[1] - at[0], `item ${id}`);
  }
});
t("the session honours its size budget once step repeats are counted", () => {
  // A new item costs one slot per learning step plus its first showing. Budgeting it as a
  // single slot is what would quietly turn a 10-minute session into a 15-minute one.
  for (const size of [10, 16, 20, 28]) {
    const picks = buildSession(withNew(), { now: NOW, size });
    lte(picks.length, size, `size ${size}`);
  }
});
t("new material never swallows the whole session", () => {
  const src = [{
    deck: "vocab",
    items: Array.from({ length: 200 }, (_, i) => ({ id: "n" + i, order: i })),
    stats: {},
  }];
  const picks = buildSession(src, { now: NOW, size: 20 });
  lte(picks.length, 20);
});
t("new items are not all stranded at the end of the session", () => {
  const picks = buildSession(withNew(), { now: NOW, size: 24 });
  const firstNew = picks.findIndex((p) => p.fresh);
  lte(firstNew, Math.floor(picks.length * 0.6), "first new item should not be near the end");
});
t("step numbering marks a first showing apart from its repeats", () => {
  const picks = buildSession(withNew(), { now: NOW, size: 24 });
  const id = picks.find((p) => p.fresh).item.id;
  const steps = picks.filter((p) => p.item.id === id).map((p) => p.step);
  eq(steps[0], 0);
  gt(steps[steps.length - 1], 0);
});

console.log("\n=== new-item intake ===");
t("intake is capped no matter how many new items are waiting", () => {
  const src = [{
    deck: "vocab",
    items: Array.from({ length: 500 }, (_, i) => ({ id: "n" + i, order: i })),
    stats: {},
  }];
  const picks = buildSession(src, { now: NOW, size: 28 });
  const unique = new Set(picks.filter((p) => p.fresh).map((p) => p.item.id));
  lte(unique.size, DEFAULTS.maxNew);
});
t("a big review backlog does not raise new intake", () => {
  const small = buildSession(withNew(), { now: NOW, size: 12 });
  const big = [{
    deck: "vocab",
    items: [
      ...Array.from({ length: 300 }, (_, i) => ({ id: "old" + i, order: i })),
      ...Array.from({ length: 50 }, (_, i) => ({ id: "new" + i, order: 900 + i })),
    ],
    stats: Object.fromEntries(Array.from({ length: 300 }, (_, i) => ["old" + i, studied("old" + i, 4, 40)])),
  }];
  const many = buildSession(big, { now: NOW, size: 28 });
  const u = (p) => new Set(p.filter((x) => x.fresh).map((x) => x.item.id)).size;
  lte(u(many), DEFAULTS.maxNew, "backlog must not inflate new intake");
  lte(u(small), DEFAULTS.maxNew);
});

console.log("\n=== vocab-led mixing ===");
const multi = () => [
  deck("vocab", 40, (i) => studied("vocab" + i, 6, 15)),
  deck("kana", 40, (i) => studied("kana" + i, 6, 60)),
  deck("kanji", 40, (i) => studied("kanji" + i, 6, 60)),
];

t("vocabulary keeps the majority of the review slots", () => {
  const picks = buildSession(multi(), { now: NOW, size: 20 });
  const v = picks.filter((p) => p.deck === "vocab").length;
  gt(v, picks.length / 2, "vocab should lead the session");
});
t("the other decks still get in, even when more decayed", () => {
  const picks = buildSession(multi(), { now: NOW, size: 20 });
  ok(picks.some((p) => p.deck === "kana"), "kana should appear");
  ok(picks.some((p) => p.deck === "kanji"), "kanji should appear");
});
t("a long-neglected deck cannot flood the session", () => {
  const src = [
    deck("vocab", 40, (i) => studied("vocab" + i, 6, 2)),
    deck("kanji", 200, (i) => studied("kanji" + i, 2, 400)),   // months untouched
  ];
  const picks = buildSession(src, { now: NOW, size: 20 });
  const k = picks.filter((p) => p.deck === "kanji").length;
  lte(k, Math.ceil(picks.length * 0.5), "kanji must not take over");
});
t("non-vocab items are interleaved, not appended as a block", () => {
  const picks = buildSession(multi(), { now: NOW, size: 20 });
  const idx = picks.map((p, i) => (p.deck !== "vocab" ? i : -1)).filter((i) => i >= 0);
  if (idx.length > 1) {
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    ok(!contiguous, "other decks should be spread through the session");
  }
});
t("an empty deck in the list is harmless", () => {
  const picks = buildSession([...multi(), { deck: "dates", items: [], stats: {} }], { now: NOW, size: 16 });
  gt(picks.length, 0);
});

console.log("\n=== leech throttle ===");
// Stuck words are the most decayed things you own, so a pool sorted by decay fills with
// them. Drilling them harder is exactly what does not work.
const stuckDeck = () => [{
  deck: "vocab",
  items: Array.from({ length: 60 }, (_, i) => ({ id: "v" + i, order: i })),
  stats: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [
    "v" + i,
    i < 40
      ? { ...studied("v" + i, 0.4, 90), seen: 20, correct: 3 }   // hopelessly stuck
      : studied("v" + i, 8, 20),                                  // ordinary review
  ])),
}];

t("stuck words cannot take over the session", () => {
  const picks = buildSession(stuckDeck(), { now: NOW, size: 20 });
  const stuckShown = new Set(
    picks.filter((p) => p.st && p.st.seen >= 8 && p.st.correct / p.st.seen < 0.5).map((p) => p.item.id)
  );
  lte(stuckShown.size, 3, "at most three leeches, matching the vocab tab");
});
t("throttling leeches does not empty the session", () => {
  const picks = buildSession(stuckDeck(), { now: NOW, size: 20 });
  gt(picks.length, 10, "healthy cards should fill the space the leeches lost");
});
t("a custom leech test can be supplied by the app", () => {
  const never = () => false;
  const picks = buildSession(stuckDeck(), { now: NOW, size: 20, isLeech: never });
  const stuckShown = picks.filter((p) => p.st && p.st.correct === 3).length;
  gt(stuckShown, 3, "with no leech rule the stuck cards should dominate again");
});

console.log("\n=== regressions (found by external review; every one of these once passed while broken) ===");

t("small sessions never put a new item's repeats next to each other", () => {
  // The original walked a cursor forward by [3, 8]; on a short session both overshot the
  // array, both clamped to the end, and the repeats landed adjacent — massed practice,
  // which is the exact thing learning steps exist to prevent. Only tested at size 24+,
  // so it passed.
  for (const size of [8, 9, 10, 11, 12, 13, 14, 16, 20, 28]) {
    const picks = buildSession(withNew(), { now: NOW, size });
    const ids = [...new Set(picks.filter((p) => p.fresh).map((p) => p.item.id))];
    for (const id of ids) {
      const at = picks.map((p, i) => (p.item.id === id ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < at.length; i++) {
        gt(at[i] - at[i - 1], 1, `size ${size}, item ${id}: repeats adjacent at ${at}`);
      }
    }
  }
});

t("throttled leeches actually appear — throttled is not the same as banned", () => {
  // Leeches were concat'd onto the END of the ranked list, losing the rank their score
  // earned; every later slice() cut from the front, so zero leeches ever appeared. The
  // old test asserted "at most 3" and passed happily on 0.
  const picks = buildSession(stuckDeck(), { now: NOW, size: 20 });
  const shown = new Set(
    picks.filter((p) => p.st && p.st.seen >= 8 && p.st.correct / p.st.seen < 0.5).map((p) => p.item.id)
  );
  eq(shown.size, 3, "expected exactly maxLeeches when plenty are available");
});

t("a session delivers the size it promised, not silently fewer", () => {
  // The leech bug surfaced as a 20-item session quietly handing back 13. Every cap is an
  // upper bound, so without a backfill the session just comes up short.
  for (const size of [10, 16, 20, 28]) {
    eq(buildSession(multi(), { now: NOW, size }).length, size, `multi, size ${size}`);
  }
  // stuckDeck holds 20 healthy items and 40 leeches, so after throttling only 23 are
  // eligible. A short session there is the pool running out, not the accounting leaking —
  // the distinction the original bug hid behind.
  for (const size of [10, 16, 20]) {
    eq(buildSession(stuckDeck(), { now: NOW, size }).length, size, `stuck, size ${size}`);
  }
  eq(buildSession(stuckDeck(), { now: NOW, size: 28 }).length, 23, "capped by what is eligible");
});

t("the staleness ceiling survives a deep backlog of decayed cards", () => {
  // A flat +4 score bonus loses to genuine decay: a stable-but-stale item scored 4.09
  // against 4.21 for a decaying one, so under any real backlog exactly zero stale items
  // made the session. A ceiling the backlog can outvote is not a ceiling.
  const src = [{
    deck: "vocab",
    items: [
      ...Array.from({ length: 100 }, (_, i) => ({ id: "decayed" + i, order: i })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: "stale" + i, order: 500 + i })),
    ],
    stats: {
      ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["decayed" + i, studied("d" + i, 2, 20)])),
      ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => ["stale" + i, studied("s" + i, 3000, 300)])),
    },
  }];
  const picks = buildSession(src, { now: NOW, size: 20 });
  gt(picks.filter((p) => p.stale).length, 0, "stale items must survive a backlog");
});

t("a healthy deck does not take slots from a critically decayed one", () => {
  // Pure round-robin gave a deck at 99% recall the same share as a deck at 30%, buying
  // variety with the session's entire purpose.
  const src = [
    deck("vocab", 40, () => studied("v", 8, 5)),
    deck("kanji", 50, () => studied("k", 1, 60)),     // critical
    deck("dates", 20, () => studied("d", 200, 2)),    // perfectly healthy
  ];
  const picks = buildSession(src, { now: NOW, size: 20 });
  const dates = picks.filter((p) => p.deck === "dates").length;
  const kanji = picks.filter((p) => p.deck === "kanji").length;
  gt(kanji, dates, "the urgent deck must beat the healthy one");
  /* Not "barely features" any more, and the change is deliberate. Well-retained items are
     the only ones that can carry production, spelling and listening, so a few slots are
     reserved for them — otherwise every session is recognition-only. The urgent deck must
     still clearly dominate, which is what the ratio below pins down. */
  gt(kanji, dates * 2, "the urgent deck should still dominate by a wide margin");
  lte(dates, Math.ceil(picks.length * 0.2), "variety must stay a minority of the session");
});

t("a deck with nothing studied yet still produces a real session", () => {
  // Found by running the app, not by the tests: on a deck where everything is new there
  // are no reviews to space repeats against, so every repeat was skipped, and the new
  // share reserved most of the session for reviews that did not exist. An 840-word deck
  // produced a three-card session.
  const src = [{ deck: "vocab", items: Array.from({ length: 840 }, (_, i) => ({ id: "n" + i, order: i })), stats: {} }];
  const picks = buildSession(src, { now: NOW });
  const d = describe(picks);
  gt(d.unique, 3, "should introduce a proper batch, not a token few");
  gt(picks.length, d.unique, "and every one of them must repeat");
  for (const id of new Set(picks.map((p) => p.item.id))) {
    const at = picks.map((p, i) => (p.item.id === id ? i : -1)).filter((i) => i >= 0);
    gt(at.length, 1, `${id} should repeat`);
    for (let i = 1; i < at.length; i++) gt(at[i] - at[i - 1], 1, `${id} repeats adjacent at ${at}`);
  }
});

t("the mix holds when the minor stream is larger than the major one", () => {
  // Caught up on vocabulary, badly behind on kanji: the old fixed-gap splice degenerated
  // into appending one solid block of kanji.
  const src = [
    { deck: "vocab", items: [{ id: "v0" }, { id: "v1" }], stats: { v0: studied("v0", 8, 12), v1: studied("v1", 8, 12) } },
    deck("kanji", 30, () => studied("k", 2, 40)),
  ];
  const picks = buildSession(src, { now: NOW, size: 16 });
  const at = picks.map((p, i) => (p.deck === "vocab" ? i : -1)).filter((i) => i >= 0);
  if (at.length === 2) gt(at[1] - at[0], 2, `vocab should be spread, got ${at}`);
});

console.log("\n=== exercise formats ===");
const pick = (st, extra = {}) => ({ deck: "vocab", item: { id: "x" }, st, fresh: !st, step: 0, ...extra });

t("a brand-new item is shown before it is tested", () => {
  eq(formatFor(pick(null)), "learn");
});
t("a new item is then tested two different ways in the same session", () => {
  const a = formatFor(pick(null, { step: 1 })), b = formatFor(pick(null, { step: 2 }));
  ok(a !== "learn" && b !== "learn", "steps must test, not re-show");
  ok(a !== b, `steps should differ, got ${a} and ${b}`);
});
t("a struggling word gets an easier question, not a harder one", () => {
  const weak = { seen: 12, correct: 4, fsrs: { S: 1, D: 8, last: NOW } };
  ok(["mc", "recall"].includes(formatFor(pick(weak))), "expected recognition, not production");
  ok(formatFor(pick(weak, { canType: true })) !== "type", "must not demand production of a word being missed");
});
t("a solid word is asked for production and spelling", () => {
  const solid = { seen: 20, correct: 19, fsrs: { S: 60, D: 3, last: NOW } };
  eq(formatFor(pick(solid, { canType: true })), "type");
});
t("production is not demanded of a word that cannot be typed", () => {
  const solid = { seen: 20, correct: 19, fsrs: { S: 60, D: 3, last: NOW } };
  ok(formatFor(pick(solid, { canType: false })) !== "type");
});
t("repeats of the same item change format between showings", () => {
  const mid = { seen: 10, correct: 9, fsrs: { S: 8, D: 4, last: NOW } };
  const a = formatFor(pick(mid, { step: 0, canListen: true }));
  const b = formatFor(pick(mid, { step: 1, canListen: true }));
  ok(a !== b, `format should alternate, got ${a} twice`);
});
t("every format produced is one the app knows how to render", () => {
  const states = [null, { seen: 1, correct: 1, fsrs: { S: 0.5, D: 7, last: NOW } },
    { seen: 12, correct: 4, fsrs: { S: 1, D: 8, last: NOW } },
    { seen: 20, correct: 19, fsrs: { S: 8, D: 4, last: NOW } },
    { seen: 30, correct: 29, fsrs: { S: 90, D: 2, last: NOW } }];
  for (const st of states) {
    for (const step of [0, 1, 2]) {
      for (const canType of [true, false]) {
        for (const canListen of [true, false]) {
          const f = formatFor(pick(st, { step, canType, canListen }));
          ok(FORMATS.includes(f), `unknown format ${f}`);
        }
      }
    }
  }
});
t("withFormats tags every pick in a real session", () => {
  const picks = withFormats(buildSession(multi(), { now: NOW, size: 20 }));
  ok(picks.length > 0);
  for (const p of picks) ok(FORMATS.includes(p.format), `bad format ${p.format}`);
});
t("a session reserves room for words strong enough to carry harder formats", () => {
  /* The bug this locks down was invisible in the unit tests and obvious in the app: need
     ordering picks the most decayed items, decayed items can only fairly be asked as
     recognition, so every single card in a 28-card session came out as multiple choice.
     Variety has to be reserved, not hoped for. */
  const DAYm = 86400000;
  const mk = (S, ago) => ({
    seen: 10, correct: 10, level: 4, streak: 3, last: NOW - ago * DAYm,
    fsrs: { S, D: 4, last: NOW - ago * DAYm }, ms: 40000, msN: 10,
  });
  const src = [{
    deck: "vocab",
    items: [
      ...Array.from({ length: 60 }, (_, i) => ({ id: "weak" + i, order: i })),
      ...Array.from({ length: 30 }, (_, i) => ({ id: "strong" + i, order: 500 + i })),
    ],
    stats: {
      ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => ["weak" + i, mk(0.4, 30)])),
      ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => ["strong" + i, mk(60, 3)])),
    },
  }];
  const picks = withFormats(buildSession(src, { now: NOW, size: 24 })
    .map((p) => ({ ...p, canType: true, canListen: true })));
  const strong = picks.filter((p) => String(p.item.id).startsWith("strong"));
  gt(strong.length, 0, "strong words must get slots even though they are not the neediest");
  const kinds = new Set(picks.map((p) => p.format));
  ok(kinds.has("type") || kinds.has("listen"), `expected a production or listening format, got: ${[...kinds].join(", ")}`);
});

t("a real session uses more than one kind of exercise", () => {
  // The whole complaint this answers: a session that is 28 flip cards is one exercise
  // repeated, however well chosen the cards are.
  const src = [{
    deck: "vocab",
    items: Array.from({ length: 60 }, (_, i) => ({ id: "v" + i, order: i })),
    stats: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [
      "v" + i,
      { seen: 10 + i, correct: 9 + i, level: 4, streak: 3, last: NOW - (i + 1) * DAY,
        fsrs: { S: 1 + i * 3, D: 4, last: NOW - (i + 1) * DAY }, ms: 40000, msN: 10 },
    ])),
  }];
  const picks = withFormats(buildSession(src, { now: NOW, size: 24 }), {})
    .map((p) => ({ ...p, format: formatFor({ ...p, canType: true, canListen: true }) }));
  const kinds = new Set(picks.map((p) => p.format));
  gt(kinds.size, 2, `expected an assorted session, got only: ${[...kinds].join(", ")}`);
});

console.log("\n=== describe ===");
t("the summary counts unique items, not repeats", () => {
  const picks = buildSession(withNew(), { now: NOW, size: 24 });
  const d = describe(picks);
  lte(d.unique, d.total);
  gt(d.total, 0);
  ok(d.decks.includes("vocab"));
});
t("stale items are reported so the ceiling is visible", () => {
  // Genuinely faded: low stability, long gap. A merely long-scheduled item is no longer
  // "stale" — see the two-trigger tests above.
  const src = [{
    deck: "vocab",
    items: Array.from({ length: 12 }, (_, i) => ({ id: "s" + i })),
    stats: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ["s" + i, studied("s" + i, 3, 60)])),
  }];
  const d = describe(buildSession(src, { now: NOW, size: 10 }));
  gt(d.stale, 0, "faded items should be surfaced in the summary");
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} session tests passed`);
process.exit(fail ? 1 : 0);
