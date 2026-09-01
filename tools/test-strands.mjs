// Tests for the unified strand layer (tools/strands.mjs).
//   node tools/test-strands.mjs
import {
  STRANDS, strandInVolume, unify, mixOf, describeMix,
  strandProgress, volumeComposite, allVolumes, byVolume, describeComposite,
} from "./strands.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const near = (a, b, tol = 0.001, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ""} expected ~${b}, got ${a}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const NOW = Date.UTC(2026, 8, 1);
const DAY = 86400000;
// A record in the shape every strand already writes. daysAgo + S drive how far it has decayed.
const stat = (o = {}) => ({ seen: 3, correct: 3, level: 3, streak: 1, last: NOW - (o.daysAgo ?? 1) * DAY,
  fsrs: { S: o.S ?? 10, D: 5, last: NOW - (o.daysAgo ?? 1) * DAY }, ...(o.over || {}) });
const item = (id, strand, o = {}) => ({ id, strand, act: o.act ?? null, stat: o.stat === null ? null : stat(o) });

console.log("=== the queue is one queue ===");
t("items from different strands compete on the same scale", () => {
  const q = unify([
    item("word1", "vocab", { daysAgo: 1, S: 60 }),      // barely decayed
    item("ka", "kana", { daysAgo: 90, S: 5 }),          // badly decayed
    item("kanji1", "kanji", { daysAgo: 10, S: 30 }),
  ], { now: NOW });
  eq(q[0].strand, "kana", "the most-decayed item leads regardless of which tab it lives on");
  eq(q.length, 3);
});
t("something never drilled goes straight to the front", () => {
  const q = unify([
    item("seen", "vocab", { daysAgo: 30, S: 5 }),
    { id: "fresh", strand: "conj", act: 7, stat: null },
  ], { now: NOW });
  eq(q[0].id, "fresh");
});
t("NO per-strand cap — a lopsided queue is allowed on purpose", () => {
  /* This is the explicitly chosen behaviour: sort by need alone. If every kana has rotted
     and the words are fresh, the session IS mostly kana. The test exists so that if a cap
     is ever added it has to be a deliberate decision that breaks this, not a silent drift. */
  const items = [
    ...Array.from({ length: 8 }, (_, i) => item("k" + i, "kana", { daysAgo: 120, S: 3 })),
    ...Array.from({ length: 8 }, (_, i) => item("w" + i, "vocab", { daysAgo: 1, S: 90 })),
  ];
  const q = unify(items, { now: NOW, limit: 8 });
  eq(q.filter((x) => x.strand === "kana").length, 8, "need alone decides; no quota rescues words");
});
t("the order is stable, so the queue does not reshuffle under the thumb", () => {
  const items = [item("b", "vocab", { daysAgo: 5, S: 10 }), item("a", "vocab", { daysAgo: 5, S: 10 })];
  eq(unify(items, { now: NOW }).map((x) => x.id).join(","), unify(items, { now: NOW }).map((x) => x.id).join(","));
  eq(unify(items, { now: NOW })[0].id, "a", "equal need breaks by id, not by input order");
});
t("a strand can be filtered out without changing the rest", () => {
  const q = unify([item("k", "kana", { daysAgo: 90, S: 3 }), item("w", "vocab", { daysAgo: 5 })],
    { now: NOW, strands: ["vocab"] });
  eq(q.length, 1); eq(q[0].strand, "vocab");
});
t("junk in the item list is skipped, not crashed on", () => {
  eq(unify([null, undefined, { strand: "vocab" }], { now: NOW }).length, 0);
  eq(unify(null).length, 0);
});

console.log("=== a lopsided session says why ===");
t("the mix is counted per strand", () => {
  const m = mixOf([item("a", "kana"), item("b", "kana"), item("c", "vocab")]);
  eq(m[0].strand, "kana"); eq(m[0].n, 2); eq(m[1].n, 1);
});
t("a dominated session explains itself rather than looking broken", () => {
  const s = describeMix([...Array.from({ length: 7 }, (_, i) => item("k" + i, "kana")), item("w", "vocab")]);
  ok(/faded most/.test(s), "got: " + s);
});
t("a balanced session just lists itself", () => {
  const s = describeMix([item("a", "kana"), item("b", "vocab")]);
  ok(!/faded most/.test(s), "got: " + s);
});
t("an empty queue is a sentence, not a crash", () => { eq(describeMix([]), "nothing due"); });

console.log("=== kana is Volume 1 only ===");
t("kana counts toward Volume 1 and cannot drag Volume 2 down", () => {
  ok(strandInVolume("kana", 1));
  ok(!strandInVolume("kana", 2), "hiragana is not part of what Volume 2 teaches");
});
t("act-scoped strands count toward every volume", () => {
  ok(strandInVolume("vocab", 1) && strandInVolume("vocab", 2));
  ok(strandInVolume("conj", 2) && strandInVolume("quiz", 2));
});
t("an unknown strand is not silently admitted", () => { ok(!strandInVolume("nonsense", 1)); });
t("items with no act still land in their strand's volumes", () => {
  const got = byVolume([item("h-a", "kana"), item("w", "vocab", { act: 9 })], 1);
  eq(got.length, 1); eq(got[0].id, "h-a", "kana has no act but belongs to Volume 1");
});
t("act-bearing items land in the volume their act belongs to", () => {
  const items = [item("w1", "vocab", { act: 2 }), item("w2", "vocab", { act: 9 })];
  eq(byVolume(items, 1).map((x) => x.id).join(), "w1");
  eq(byVolume(items, 2).map((x) => x.id).join(), "w2");
});

console.log("=== how much of a volume is known ===");
t("coverage is met-at-least-once; mastery is of what was met", () => {
  const p = strandProgress([
    item("a", "vocab", { over: { seen: 2, level: 5 } }),
    { id: "b", strand: "vocab", stat: null },
  ]);
  near(p.coverage, 0.5);
  near(p.mastered, 1, 0.001, "the one item met is fully known");
  near(p.done, 0.5, 0.001, "half met and fully known is half done");
});
t("nothing measured reports null, never 0%", () => {
  const p = strandProgress([{ id: "a", strand: "vocab", stat: null }]);
  eq(p.mastered, null, "0% would claim the learner knows none of it");
  eq(p.done, null);
});
t("an empty strand is safe", () => {
  eq(strandProgress([]).items, 0);
  eq(strandProgress(null).items, 0);
});
t("the composite is weighted by ITEM COUNT, not one vote per strand", () => {
  // 800 words half known and 40 conjugations fully known is not "75% of the volume".
  const v = volumeComposite({
    vocab: Array.from({ length: 800 }, (_, i) => item("w" + i, "vocab", { over: { seen: 1, level: 2.5 } })),
    conj: Array.from({ length: 40 }, (_, i) => item("c" + i, "conj", { over: { seen: 1, level: 5 } })),
  }, 2);
  ok(v.done < 0.6, "an equal-vote average would say ~0.75, got " + v.done);
  near(v.done, (0.5 * 800 + 1 * 40) / 840, 0.01);
});
t("the breakdown names every strand that has items here", () => {
  const v = volumeComposite({
    vocab: [item("w", "vocab", { over: { seen: 1, level: 5 } })],
    kanji: [item("k", "kanji", { over: { seen: 1, level: 0 } })],
    conj: [],
  }, 2);
  eq(v.strands.map((s) => s.strand).sort().join(","), "kanji,vocab", "an empty strand is not listed");
});
t("a volume nobody has touched is null, not zero", () => {
  const v = volumeComposite({ vocab: [{ id: "a", strand: "vocab", stat: null }] }, 2);
  eq(v.done, null);
  eq(v.items, 1);
});
t("kana is excluded from Volume 2's composite entirely", () => {
  const kana = Array.from({ length: 50 }, (_, i) => item("h" + i, "kana", { over: { seen: 1, level: 0 } }));
  const v2 = volumeComposite({ kana, vocab: [item("w", "vocab", { over: { seen: 1, level: 5 } })] }, 2);
  eq(v2.strands.length, 1, "only words count toward Volume 2");
  near(v2.done, 1, 0.001, "50 unknown kana must not drag Volume 2 to near zero");
});
t("every configured volume is reported, including untouched ones", () => {
  const vs = allVolumes({ vocab: [item("w", "vocab", { over: { seen: 1, level: 5 } })] });
  ok(vs.length >= 2);
  ok(vs.every((v) => typeof v.volume === "number"));
});

console.log("=== the sentence matches the numbers ===");
t("it names the weakest strand, which is the actionable half", () => {
  const v = volumeComposite({
    vocab: [item("w", "vocab", { over: { seen: 1, level: 5 } })],
    conj: [item("c", "conj", { over: { seen: 1, level: 0 } })],
  }, 2);
  ok(/weakest is conjugation/.test(describeComposite(v)), "got: " + describeComposite(v));
});
t("unmeasured and empty read differently, and neither says 0%", () => {
  ok(/none measured/.test(describeComposite({ volume: 2, items: 3, strands: [], done: null })));
  ok(/nothing from this volume/.test(describeComposite({ volume: 2, items: 0 })));
  ok(typeof describeComposite(null) === "string");
});

console.log("=== the registry itself ===");
t("every strand declares the fields the app reads", () => {
  for (const s of STRANDS) {
    ok(s.id && s.label && s.key && s.area, "incomplete strand: " + JSON.stringify(s));
    ok(s.volumes === null || Array.isArray(s.volumes), s.id + " volumes must be null or a list");
  }
});
t("storage keys are unique — two strands sharing one would overwrite each other", () => {
  eq(new Set(STRANDS.map((s) => s.key)).size, STRANDS.length);
  eq(new Set(STRANDS.map((s) => s.id)).size, STRANDS.length);
});

console.log(`\nall ${run} strand tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
