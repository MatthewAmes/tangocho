// Tests for the unified session builder. Selection bugs are the quiet kind — the session
// still looks fine, it is just made of the wrong things — so the properties that actually
// matter for memory are asserted rather than eyeballed.
//
//   node tools/test-session.mjs
import {
  DEFAULTS, need, daysSince, isStale, pacePerItem, budgetFor,
  candidates, buildSession, describe, formatFor, withFormats, FORMATS, pacePerDeck,
  normaliseScope, scopeShiftFor, SCOPE_MODES, skillOf,
} from "./session.mjs";
import { provenanceOf } from "./curriculum.mjs";
import { abilityFrom, predictSuccess, CUE } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const gt = (a, b, m) => { if (!(a > b)) throw new Error(`${m || ""} expected ${a} > ${b}`); };
const lte = (a, b, m) => { if (!(a <= b)) throw new Error(`${m || ""} expected ${a} <= ${b}`); };
const gte = (a, b, m) => { if (!(a >= b)) throw new Error(`${m || ""} expected ${a} >= ${b}`); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const DAY = 86400000;
const NOW = 1_700_000_000_000;

// A studied item with a given stability, last seen `ago` days back.
const studied = (id, S, ago, extra = {}) => ({
  id, seen: 5, correct: 5, level: 3, streak: 2, last: NOW - ago * DAY,
  fsrs: { S, D: 5, last: NOW - ago * DAY, due: NOW, ivl: S }, ms: 4000 * 5, msN: 5, ...extra,
});
// Sources must now declare what their items can be ASKED. A deck that declares nothing is
// capable of nothing, which is the correct default — it is the caller's job to say.
const deck = (name, n, mk, weight) => ({
  deck: name, weight, caps: { type: true, listen: true },
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
    deck: "vocab", caps: { type: true, listen: true },
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
  deck: "vocab", caps: { type: true, listen: true },
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
    deck: "vocab", caps: { type: true, listen: true },
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
    deck: "vocab", caps: { type: true, listen: true },
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
    deck: "vocab", caps: { type: true, listen: true },
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
  deck: "vocab", caps: { type: true, listen: true },
  items: Array.from({ length: 60 }, (_, i) => ({ id: "v" + i, order: i })),
  stats: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [
    "v" + i,
    i < 40
      // streak 0 matters now: a leech is a word stuck RIGHT NOW, not one that was once
      // hard and is currently being answered correctly.
      ? { ...studied("v" + i, 0.4, 90), seen: 20, correct: 3, streak: 0 }
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
    deck: "vocab", caps: { type: true, listen: true },
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
t("listening never lands on a first showing, so it stays uncommon", () => {
  // Audio depends on where you are. A session full of it is unusable half the time.
  const mid = { seen: 10, correct: 9, fsrs: { S: 8, D: 4, last: NOW } };
  const strong = { seen: 20, correct: 19, fsrs: { S: 60, D: 3, last: NOW } };
  eq(formatFor(pick(mid, { step: 0, canListen: true })) === "listen", false);
  eq(formatFor(pick(strong, { step: 0, canListen: true, canType: true })) === "listen", false);
});
t("listening can be switched off entirely", () => {
  const mid = { seen: 10, correct: 9, fsrs: { S: 8, D: 4, last: NOW } };
  const strong = { seen: 20, correct: 19, fsrs: { S: 60, D: 3, last: NOW } };
  for (const st of [mid, strong]) {
    for (const step of [0, 1, 2]) {
      const f = formatFor(pick(st, { step, canListen: true, canType: true }), { allowListen: false });
      ok(f !== "listen", `got ${f} at step ${step} with audio disabled`);
    }
  }
});
t("a whole session contains no audio when it is switched off", () => {
  const src = [deck("v", 60, (i) => studied("v" + i, 8 + i, 6))];
  const picks = withFormats(
    buildSession(src, { now: NOW, size: 24 }).map((p) => ({ ...p, canType: true, canListen: true })),
    { allowListen: false },
  );
  ok(!picks.some((p) => p.format === "listen"), "no listening exercises should survive");
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
    deck: "vocab", caps: { type: true, listen: true },
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
  /* The complaint this answers: a session that is 28 flip cards is one exercise repeated,
     however well chosen the cards are. The fixture is a MIXED deck — some brand new, some
     failing, some solid, some with production history — because a fixture where every item
     has the same shape will correctly produce one or two formats and prove nothing. */
  const items = [], stats = {};
  for (let i = 0; i < 80; i++) {
    const id = "v" + i;
    items.push({ id, order: i, reading: "よみ", term: "語" });
    if (i % 5 === 0) continue;                         // some never studied
    const S = [0.5, 3, 9, 25, 70][i % 5], ago = [2, 6, 12, 20, 40][i % 5];
    stats[id] = {
      seen: 10, correct: i % 7 === 0 ? 4 : 9, level: 3, streak: i % 7 === 0 ? 0 : 3,
      last: NOW - ago * DAY, fsrs: { S, D: 5, last: NOW - ago * DAY, due: NOW - DAY },
      ms: 40000, msN: 10,
      ...(i % 3 === 0 ? { rseen: 6, rcorrect: 5, rfsrs: { S: 6, D: 5, last: NOW - 8 * DAY, due: NOW - DAY } } : {}),
    };
  }
  const src = [{ deck: "vocab", caps: { type: true, listen: true }, items, stats }];
  const picks = withFormats(buildSession(src, { now: NOW, size: 24 }), {})
    .map((p) => ({ ...p, format: formatFor({ ...p, canType: true, canListen: true }) }));
  const kinds = new Set(picks.map((p) => p.format));
  gt(kinds.size, 2, `expected an assorted session, got only: ${[...kinds].join(", ")}`);
});

console.log("\n=== decision quality (external review, P1) ===");
/* The previous tests proved things EXIST — that some strong item was picked, that more
   than two formats appeared. They could not tell a good choice from a bad one. These
   assert the relative decision instead. */

const skilled = (recS, recAcc, prodS, prodAcc, prodSeen = 10) => ({
  seen: 20, correct: Math.round(20 * recAcc), level: 4, streak: 3, last: NOW - DAY,
  fsrs: { S: recS, D: 4, last: NOW - DAY },
  rseen: prodSeen, rcorrect: Math.round(prodSeen * prodAcc),
  rfsrs: prodSeen ? { S: prodS, D: 4, last: NOW - DAY } : null,
  ms: 80000, msN: 20,
});

t("strong recognition + weak production asks for PRODUCTION, not recognition", () => {
  // The defect this locks down: the selector read recognition state to choose a
  // production exercise, so someone who reads a word perfectly and cannot produce it
  // kept being handed the ability they already had.
  const st = skilled(60, 0.95, 1.2, 0.4);
  const f = formatFor({ deck: "vocab", item: { id: "x" }, st, step: 0, caps: { type: true, listen: true } });
  eq(f, "type", "weak production should be practised, not skipped");
});
t("the weaker of two strong abilities is the one practised", () => {
  /* This test used to assert "strong everything → type", which encoded the OLD rule where
     format followed recognition stability. Under the intervention model the target is
     whichever ability is actually weaker, so the assertion is now about that. */
  const prodWeaker = skilled(60, 0.98, 40, 0.70);
  eq(formatFor({ deck: "vocab", item: { id: "x" }, st: prodWeaker, step: 0, caps: { type: true } }), "type",
    "weaker production should be practised");
  const recWeaker = skilled(60, 0.70, 40, 0.99);
  const f = formatFor({ deck: "vocab", item: { id: "x" }, st: recWeaker, step: 0, caps: { type: true } });
  ok(f === "recall" || f === "mc", "weaker recognition should be practised, got " + f);
});
t("weak recognition is never asked to produce, however strong the word once was", () => {
  const st = skilled(1.2, 0.35, 40, 0.95);
  for (const step of [0, 1, 2]) {
    const f = formatFor({ deck: "vocab", item: { id: "x" }, st, step, caps: { type: true, listen: true } });
    ok(["mc", "recall"].includes(f), `expected recognition support, got ${f}`);
  }
});
t("production is never asked of an item that cannot carry it", () => {
  const st = skilled(60, 0.95, 1.2, 0.4);
  for (const step of [0, 1, 2]) {
    const f = formatFor({ deck: "kanji", item: { id: "x" }, st, step, caps: { type: false, listen: false } });
    ok(f !== "type" && f !== "listen", `got ${f} for an item with no such capability`);
  }
});
t("the production reserve only picks items that can actually be typed", () => {
  /* The scheduler used to reserve production slots on stability alone and discover in the
     UI that the item had no reading — a slot spent on nothing. */
  const strong = () => ({ seen: 20, correct: 20, level: 4, streak: 3, last: NOW - DAY,
    fsrs: { S: 60, D: 3, last: NOW - DAY }, ms: 80000, msN: 20 });
  const src = [
    { deck: "kanji", caps: { type: false, listen: false },
      items: Array.from({ length: 40 }, (_, i) => ({ id: "k" + i })),
      stats: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["k" + i, strong()])) },
    { deck: "vocab", caps: { type: true, listen: true },
      items: Array.from({ length: 10 }, (_, i) => ({ id: "v" + i })),
      stats: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ["v" + i, strong()])) },
  ];
  const picks = withFormats(buildSession(src, { now: NOW, size: 20 }));
  for (const p of picks) {
    if (p.format === "type") ok(p.caps && p.caps.type, `typed a ${p.deck} item that cannot be typed`);
    if (p.format === "listen") ok(p.caps && p.caps.listen, `listened to an item with no audio`);
  }
});
t("a fading item outranks an annual diagnostic", () => {
  // Both were "stale" and got the same +4. They are different interventions: one is a
  // memory being lost, the other a spot-check on something the model says is fine.
  const fading = studied("f", 3, 60);
  const annual = studied("a", 3000, 400);
  const src = [{ deck: "vocab", items: [{ id: "f" }, { id: "a" }], stats: { f: fading, a: annual } }];
  const c = candidates(src, { now: NOW });
  const f = c.find((x) => x.item.id === "f"), a = c.find((x) => x.item.id === "a");
  eq(f.staleReason, "decay");
  eq(a.staleReason, "annual_check");
  gt(f.score, a.score, "a word being lost must beat a routine check");
});
t("a leech currently being answered right is no longer throttled", () => {
  // Lifetime accuracy alone kept punishing a word that had turned the corner.
  const recovering = { seen: 20, correct: 6, streak: 3, level: 2, last: NOW - DAY,
    fsrs: { S: 4, D: 7, last: NOW - DAY }, ms: 80000, msN: 20 };
  const stuck = { ...recovering, streak: 0 };
  const src = [{ deck: "vocab", items: [{ id: "r" }, { id: "s" }], stats: { r: recovering, s: stuck } }];
  const picks = buildSession(src, { now: NOW, size: 10 });
  ok(picks.some((p) => p.item.id === "r"), "a recovering word should not be treated as stuck");
});
t("memory urgency is reported separately from policy weighting", () => {
  /* These were one number, and a threshold named urgencyFloor was compared against it —
     so a deck priority could carry an item over a bar that is explicitly about how much
     the MEMORY needs attention. They are separate fields now, and the variety guarantee
     reads the urgency one. (Deck weight still influences ordinary fill, which is what a
     priority is for; it just cannot manufacture urgency.) */
  const st = studied("x", 4, 12);
  const plain = candidates([{ deck: "vocab", items: [{ id: "x" }], stats: { x: st } }], { now: NOW })[0];
  const heavy = candidates([{ deck: "vocab", weight: 5, items: [{ id: "x" }], stats: { x: st } }], { now: NOW })[0];
  eq(plain.need, heavy.need, "weight must not change memory urgency");
  gt(heavy.score, plain.score, "but it should change ranking");
});

console.log("\n=== deterministic jitter and per-deck pace (review Phase 1) ===");

t("the same day gives the same session; a different day does not", () => {
  /* Math.random() would have been the wrong fix: a session must be reproducible within a
     day so a reload does not reshuffle work in progress, and so a bug can be reproduced. */
  const src = () => [deck("v", 80, (i) => studied("v" + i, 6 + (i % 5), 10 + (i % 7)))];
  const a = buildSession(src(), { now: NOW, size: 20, seed: "2026-08-19" }).map((p) => p.item.id).join();
  const b = buildSession(src(), { now: NOW, size: 20, seed: "2026-08-19" }).map((p) => p.item.id).join();
  const c = buildSession(src(), { now: NOW, size: 20, seed: "2026-08-20" }).map((p) => p.item.id).join();
  eq(a, b, "same day must be identical");
  ok(a !== c, "a different day should vary the session");
});
t("jitter is a tie-break, not a reordering of real priorities", () => {
  // A badly decayed item must still outrank a healthy one on every seed.
  const urgent = studied("urgent", 1, 60), fine = studied("fine", 200, 1);
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const c = candidates([{ deck: "vocab", items: [{ id: "urgent" }, { id: "fine" }],
      stats: { urgent, fine } }], { now: NOW, seed });
    const u = c.find((x) => x.item.id === "urgent"), f = c.find((x) => x.item.id === "fine");
    gt(u.score, f.score, `seed ${seed}: jitter must not invert urgency`);
  }
});
t("one deck's timing data cannot speak for another", () => {
  /* Pooled timings let whichever deck had the most observations define the pace of
     everything, so a kanji-heavy session was estimated at vocabulary speed. */
  const fastBig = { deck: "vocab", caps: {}, items: Array.from({ length: 500 }, (_, i) => ({ id: "v" + i })),
    stats: Object.fromEntries(Array.from({ length: 500 }, (_, i) => ["v" + i, studied("v" + i, 8, 5, { ms: 2000 * 5 })])) };
  const slowSmall = { deck: "kanji", caps: {}, items: Array.from({ length: 10 }, (_, i) => ({ id: "k" + i })),
    stats: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ["k" + i, studied("k" + i, 8, 5, { ms: 11000 * 5 })])) };
  const per = pacePerDeck([fastBig, slowSmall]);
  gt(per.kanji, per.vocab, "the slow deck must keep its own rate");
  const mixed = pacePerItem([fastBig, slowSmall]);
  gt(mixed, per.vocab, "a mixed session must not be priced at the fast deck's speed");
});

t("context is only asked once the word itself is secure", () => {
  /* Knowing 取る means "take" says nothing about 写真を撮る — but asking for contextual
     use before the word is solid is just a harder way to fail. */
  const weak = { seen: 20, correct: 8, fsrs: { S: 1, D: 7, last: NOW } };
  const solid = { seen: 20, correct: 20, fsrs: { S: 60, D: 3, last: NOW },
    rseen: 10, rcorrect: 10, rfsrs: { S: 30, D: 3, last: NOW } };
  const caps = { type: true, listen: true, context: true };
  eq(formatFor({ deck: "vocab", item: { id: "x" }, st: weak, step: 0, caps }) === "cloze", false,
    "a shaky word must not be asked for contextual use");
  eq(formatFor({ deck: "vocab", item: { id: "x" }, st: solid, step: 0, caps }), "cloze");
});
t("no contextual material means no contextual exercise", () => {
  const solid = { seen: 20, correct: 20, fsrs: { S: 60, D: 3, last: NOW },
    rseen: 10, rcorrect: 10, rfsrs: { S: 30, D: 3, last: NOW } };
  const f = formatFor({ deck: "vocab", item: { id: "x" }, st: solid, step: 0,
    caps: { type: true, listen: true, context: false } });
  ok(f !== "cloze", `got ${f} with no context available`);
});

console.log("\n=== back-to-back sessions (reported bug) ===");
t("a word answered minutes ago is not pulled back to pad the next session", () => {
  /* Reported from real use: the same handful of cards in every lesson, eight lessons
     running. Cause was padding — review slots were filled from anything studied, due or
     not, so a small studied pool recycled endlessly. */
  const justNow = { seen: 4, correct: 4, level: 2, streak: 4, last: NOW - 5 * 60000,
    fsrs: { S: 2.4, D: 5, last: NOW - 5 * 60000, due: NOW + 2 * DAY }, ms: 12000, msN: 4 };
  const src = [{
    deck: "vocab", caps: { type: true, listen: true },
    items: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: "done" + i, order: i })),
      ...Array.from({ length: 40 }, (_, i) => ({ id: "new" + i, order: 100 + i })),
    ],
    stats: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ["done" + i, justNow])),
  }];
  const picks = buildSession(src, { now: NOW, size: 20 });
  const recycled = picks.filter((p) => String(p.item.id).startsWith("done"));
  const fresh = picks.filter((p) => p.fresh);
  eq(recycled.length, 0, "nothing answered five minutes ago should reappear");
  gt(fresh.length, 0, "the space should go to new material instead");
});
t("a genuinely overdue word is exempt from the cooldown", () => {
  // Cooling must never outrank actually needing review.
  const overdue = { seen: 10, correct: 5, level: 1, streak: 0, last: NOW - 30 * 60000,
    fsrs: { S: 0.05, D: 8, last: NOW - 30 * 60000, due: NOW - DAY }, ms: 30000, msN: 10 };
  const src = [{
    deck: "vocab", caps: {},
    items: [{ id: "urgent" }, ...Array.from({ length: 20 }, (_, i) => ({ id: "n" + i, order: i }))],
    stats: { urgent: overdue },
  }];
  const picks = buildSession(src, { now: NOW, size: 16 });
  ok(picks.some((p) => p.item.id === "urgent"), "a badly decayed word must still come back");
});
t("a repeat beats an empty session when there is nothing else", () => {
  const justNow = { seen: 3, correct: 3, level: 2, streak: 3, last: NOW - 10 * 60000,
    fsrs: { S: 3, D: 5, last: NOW - 10 * 60000, due: NOW + DAY }, ms: 9000, msN: 3 };
  const src = [{
    deck: "vocab", caps: {},
    items: Array.from({ length: 5 }, (_, i) => ({ id: "only" + i, order: i })),
    stats: Object.fromEntries(Array.from({ length: 5 }, (_, i) => ["only" + i, justNow])),
  }];
  const picks = buildSession(src, { now: NOW, size: 16 });
  gt(picks.length, 0, "a short session is fine; an empty one is not");
});

t("a missed card returns as soon as its relearning step is due", () => {
  /* A miss puts a card into a short step deliberately. Under the retrievability rule it
     comes back the moment that step is owed — no special case needed, which is the point
     of replacing the cooldown's exemption list. Within the SAME session it returns sooner
     still, via the miss requeue. */
  const missed = (dueOffsetMin) => ({
    seen: 5, correct: 2, level: 0, streak: 0, last: NOW - 12 * 60000,
    lastFailure: "meaning", recent: "10100",
    fsrs: { S: 0.4, D: 8, last: NOW - 12 * 60000, due: NOW + dueOffsetMin * 60000, relearning: true },
    ms: 15000, msN: 5,
  });
  const build = (st) => buildSession([{
    deck: "vocab", caps: {},
    items: [{ id: "missed" }, ...Array.from({ length: 30 }, (_, i) => ({ id: "n" + i, order: i }))],
    stats: { missed: st },
  }], { now: NOW, size: 20 });

  ok(build(missed(-2)).some((p) => p.item.id === "missed"), "past its step, it must return");
});
t("a correct answer minutes ago is not pulled forward to pad", () => {
  const fine = { seen: 5, correct: 5, level: 3, streak: 5, last: NOW - 4 * 60000, recent: "11111",
    fsrs: { S: 4, D: 4, last: NOW - 4 * 60000, due: NOW + 3 * DAY }, ms: 15000, msN: 5 };
  const picks = buildSession([{
    deck: "vocab", caps: {},
    items: [{ id: "fine" }, ...Array.from({ length: 30 }, (_, i) => ({ id: "n" + i, order: i }))],
    stats: { fine },
  }], { now: NOW, size: 20 });
  eq(picks.some((p) => p.item.id === "fine"), false, "still well above the retention target");
});
t("a card answered CORRECTLY four minutes ago does not", () => {
  const justRight = { seen: 5, correct: 5, level: 3, streak: 5, last: NOW - 4 * 60000,
    recent: "11111",
    fsrs: { S: 4, D: 4, last: NOW - 4 * 60000, due: NOW + 3 * DAY }, ms: 15000, msN: 5 };
  const src = [{
    deck: "vocab", caps: {},
    items: [{ id: "fine" }, ...Array.from({ length: 30 }, (_, i) => ({ id: "n" + i, order: i }))],
    stats: { fine: justRight },
  }];
  const picks = buildSession(src, { now: NOW, size: 20 });
  eq(picks.some((p) => p.item.id === "fine"), false, "a correct answer should not be re-asked immediately");
});

console.log("\n=== practice modes ===");
/* The fixture is built so the ONLY thing separating the two halves is the act. Sixteen
   current-act words and sixteen older ones, identical memory state down to the stability
   and the elapsed days, so any difference in what gets picked is the mode and nothing else
   — a fixture where the old material was also more decayed would let decay take the credit.
   On top of that: one genuinely fading old word (§15's due Act-3 item), one settled old word
   sitting comfortably below the weight's crossover, and unstudied material on both sides. */
const ACT_NOW = 9;
const modeDeck = () => {
  const items = [], stats = {};
  for (let i = 0; i < 16; i++) {
    items.push({ id: "cur" + i, term: "cur" + i, sec: "9-2", order: 900 + i });
    stats["cur" + i] = studied("cur" + i, 20, 8);          // need 0.34
    items.push({ id: "old" + i, term: "old" + i, sec: "3-4", order: 300 + i });
    stats["old" + i] = studied("old" + i, 20, 8);          // need 0.34 — the same memory
  }
  // r 0.60, need 3.20: faded past the recall floor, so Current Lesson must NOT bury it.
  items.push({ id: "oldFading", term: "oldFading", sec: "3-4", order: 398 });
  stats.oldFading = studied("oldFading", 5, 30);
  // r 0.82, need 1.45: due, but still comfortable — this one Current Lesson may displace.
  items.push({ id: "oldSettled", term: "oldSettled", sec: "3-4", order: 399 });
  stats.oldSettled = studied("oldSettled", 4, 8);
  for (let i = 0; i < 6; i++) {
    items.push({ id: "curNew" + i, term: "curNew" + i, sec: "9-3", order: 960 + i });
    items.push({ id: "oldNew" + i, term: "oldNew" + i, sec: "3-5", order: 360 + i });
  }
  return [{ deck: "vocab", caps: { type: true, listen: true }, items, stats }];
};
// Share of the session's distinct items that come from the act being studied now.
const actShare = (picks, act = ACT_NOW) => {
  const seen = new Set(), acts = [];
  for (const p of picks) {
    if (seen.has(p.deck + " " + p.item.id)) continue;
    seen.add(p.deck + " " + p.item.id);
    acts.push(provenanceOf(p.item).act);
  }
  return acts.length ? acts.filter((a) => a === act).length / acts.length : 0;
};
const inSession = (picks, id) => picks.some((p) => p.item.id === id);
const runMode = (mode, extra = {}) => buildSession(modeDeck(), {
  now: NOW, size: 22, ...extra,
  scope: mode === "mix" ? undefined : { mode, act: ACT_NOW },
});

t("Smart Mix is the session this file already built, byte for byte", () => {
  // The whole promise of the default: nothing changes for Matthew unless he chooses it.
  const base = JSON.stringify(buildSession(modeDeck(), { now: NOW, size: 22 }));
  for (const scope of [undefined, null, "mix", { mode: "mix" }, { mode: "mix", act: ACT_NOW }]) {
    eq(JSON.stringify(buildSession(modeDeck(), { now: NOW, size: 22, scope })), base,
       "scope " + JSON.stringify(scope) + " should change nothing");
  }
});
t("a scope that cannot be honoured falls back to Smart Mix rather than half-applying", () => {
  const base = JSON.stringify(buildSession(modeDeck(), { now: NOW, size: 22 }));
  // No act: a deck with no evidence yet has no current lesson, and guessing one is worse
  // than saying so. A mode nobody defined is the same situation.
  for (const scope of [{ mode: "current" }, { mode: "current", act: null }, { mode: "bogus", act: 9 }]) {
    eq(JSON.stringify(buildSession(modeDeck(), { now: NOW, size: 22, scope })), base,
       "scope " + JSON.stringify(scope) + " should fall back to mix");
  }
  eq(normaliseScope({ mode: "current", act: null }), null);
  eq(normaliseScope("mix"), null);
  eq(normaliseScope({ mode: "review", act: 4 }).act, 4);
  ok(SCOPE_MODES.includes("current") && SCOPE_MODES.includes("review") && SCOPE_MODES.includes("mix"));
});
t("same learner state, three modes, three measurably different mixes", () => {
  const cur = actShare(runMode("current"));
  const mix = actShare(runMode("mix"));
  const rev = actShare(runMode("review"));
  gt(cur, mix, "Current Lesson should draw more from the current act than Smart Mix");
  gt(mix, rev, "Cumulative Review should draw less from it than Smart Mix");
  console.log(`        current-act share — current ${cur.toFixed(2)} · mix ${mix.toFixed(2)} · review ${rev.toFixed(2)}`);
});
t("Current Lesson reaches a configurable share of the current act", () => {
  gte(actShare(runMode("current")), 0.6, "at the default weight");
  // Configurable, and in the direction the name promises: turning it off gives Smart Mix
  // back, turning it up cannot give less focus than the default.
  eq(actShare(runMode("current", { scopeWeight: 0 })), actShare(runMode("mix")));
  gte(actShare(runMode("current", { scopeWeight: 6 })), actShare(runMode("current")));
});
t("§15: a due older item still surfaces inside current-lesson practice", () => {
  // The reason this is a weight and not a filter. Under a filter the fading Act-3 word is
  // locked out of the only session that would have rescued it.
  ok(inSession(runMode("current"), "oldFading"), "the fading Act-3 word must still get in");
  ok(inSession(runMode("current", { scopeWeight: 20 }), "oldFading"),
     "and no amount of curriculum focus may buy its way past a decaying memory");
});
t("the crossover is where DEFAULTS says it is", () => {
  // Old material the model still considers comfortable yields to the current act; old
  // material that has actually faded does not. That boundary IS the weight's justification,
  // so it is asserted rather than left in a comment.
  const picks = runMode("current");
  eq(inSession(picks, "oldSettled"), false, "a comfortable old word yields (need 1.45 < 0.34 + 2.2)");
  eq(inSession(picks, "oldFading"), true, "a faded one does not (need 3.20, and stale on top)");
  // The weight is smaller than the +4 a decaying item already carries, which is what makes
  // that second assertion structural rather than lucky: at any current-act need N, a stale
  // item at the same need still scores N + 4 against N + 2.2.
  lte(DEFAULTS.scopeWeight, 4, "curriculum focus must stay below the decay bonus");
});
t("Cumulative Review leans away from the current act without banning it", () => {
  lte(actShare(runMode("review")), 0.2, "the current act should be well out of the way");
  // Downweighted, not excluded: on a deck where the current act is all there is, review
  // mode still has to build a session rather than hand back an empty one.
  const onlyCurrent = [{
    deck: "vocab", caps: { type: true, listen: true },
    items: Array.from({ length: 12 }, (_, i) => ({ id: "c" + i, term: "c" + i, sec: "9-2", order: i })),
    stats: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ["c" + i, studied("c" + i, 20, 8)])),
  }];
  const picks = buildSession(onlyCurrent, { now: NOW, size: 10, scope: { mode: "review", act: ACT_NOW } });
  gt(picks.length, 0, "a review session with only current-act material is still a session");
});
t("new intake follows the mode instead of always starting at the front of the book", () => {
  // `order` is the lesson number, so untouched material sorts oldest-first. Left alone,
  // every new slot in a Current Lesson session would go to the one act Matthew is not on.
  const news = (picks) => picks.filter((p) => p.fresh && p.step === 0).map((p) => p.item.id);
  ok(news(runMode("current")).every((id) => id.startsWith("curNew")),
     "Current Lesson introduces current-act words");
  ok(news(runMode("mix")).every((id) => id.startsWith("oldNew")),
     "Smart Mix still introduces in book order");
  ok(news(runMode("review")).every((id) => id.startsWith("oldNew")),
     "Cumulative Review does too");
});
t("material with no act in the book is neutral in both directions", () => {
  // 5.6% of the deck is class-day notes and manga pages, and kana/kanji/dates are not in
  // NihonGO NOW! at all. Guessing an act for them would put the mode's thumb on a guess.
  eq(scopeShiftFor({ id: "x", term: "x", sec: "DB 8–9" }, { mode: "current", act: 9 }), 0);
  eq(scopeShiftFor({ id: "x", term: "x", sec: "7/20" }, { mode: "current", act: 7 }), 0);
  eq(scopeShiftFor({ id: "x", term: "x" }, { mode: "review", act: 9 }), 0);
  // ...so a deck that is not in the textbook keeps exactly the share vocabShare gives it.
  const kana = {
    deck: "kana", caps: { listen: true },
    items: Array.from({ length: 12 }, (_, i) => ({ id: "k" + i, term: "k" + i })),
    stats: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ["k" + i, studied("k" + i, 20, 8)])),
  };
  const share = (scope) => {
    const picks = buildSession([...modeDeck(), kana], { now: NOW, size: 22, scope });
    return picks.filter((p) => p.deck === "kana").length / picks.length;
  };
  const plain = share(undefined);
  gt(plain, 0, "the fixture should actually be drawing on the kana deck");
  eq(share({ mode: "current", act: ACT_NOW }), plain, "Current Lesson leaves it alone");
  eq(share({ mode: "review", act: ACT_NOW }), plain, "so does Cumulative Review");
});
t("the shift is symmetric, and published on the candidate only when it applies", () => {
  const item = { id: "x", term: "x", sec: "9-2" };
  eq(scopeShiftFor(item, { mode: "current", act: 9 }), DEFAULTS.scopeWeight);
  eq(scopeShiftFor(item, { mode: "review", act: 9 }), -DEFAULTS.scopeWeight);
  eq(scopeShiftFor(item, { mode: "current", act: 3 }), 0, "a different act is not touched");
  eq(scopeShiftFor(item, null), 0);
  const plain = candidates(modeDeck(), { now: NOW });
  eq("scopeShift" in plain[0], false, "an unscoped candidate carries no scope field at all");
  const scoped = candidates(modeDeck(), { now: NOW, scope: { mode: "current", act: ACT_NOW } });
  eq(scoped.find((c) => c.item.id === "cur0").scopeShift, DEFAULTS.scopeWeight);
  eq(scoped.find((c) => c.item.id === "old0").scopeShift, 0);
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
    deck: "vocab", caps: { type: true, listen: true },
    items: Array.from({ length: 12 }, (_, i) => ({ id: "s" + i })),
    stats: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ["s" + i, studied("s" + i, 3, 60)])),
  }];
  const d = describe(buildSession(src, { now: NOW, size: 10 }));
  gt(d.stale, 0, "faded items should be surfaced in the summary");
});

t("skillOf carries the rolling windows the estimators read", () => {
  const st = { seen: 20, correct: 16, recent: "0000011111", fsrs: { S: 5, last: NOW },
               rseen: 20, rcorrect: 16, rrecent: "1111100000", rfsrs: { S: 5, last: NOW } };
  eq(skillOf(st, "fsrs").recent, "0000011111", "recognition projection keeps st.recent");
  eq(skillOf(st, "rfsrs").recent, "1111100000", "production projection keeps st.rrecent");
  // The property that was dead before: identical lifetime records whose last-five answers
  // disagree must predict differently through the live projection. (abilityFrom reads the
  // whole 10-window; predictSuccess weights the last five — that is where order matters.)
  const slump = { ...st, recent: "1111100000" };
  gt(predictSuccess(skillOf(st, "fsrs"), CUE.CHOOSE),
     predictSuccess(skillOf(slump, "fsrs"), CUE.CHOOSE),
     "a recent slump predicts lower than a recent streak at the same lifetime accuracy");
  // A record predating the windows still projects without the field, and still estimates.
  const legacy = { seen: 10, correct: 9, fsrs: { S: 4, last: NOW } };
  eq("recent" in skillOf(legacy, "fsrs"), false, "no window → no field, not an empty one");
  ok(abilityFrom(skillOf(legacy, "fsrs")).mean > 0, "legacy records still estimate");
});

console.log(fail ? `\n${fail}/${run} FAILED` : `\nall ${run} session tests passed`);
process.exit(fail ? 1 : 0);
