// Tests for the sync merge rules (tools/merge.mjs) — the highest data-loss-risk code in the
// app. Plain Node asserts, same style as tools/test-fsrs.mjs.
//
//   node tools/test-merge.mjs
import {
  cardMergeKey, mergeDeck, applySeed, mergeDays, mergeScripts, mergeInput,
  mergeStats, mergeHooks, mergeEvidence, mergeSnapshots,
} from "./merge.mjs";
// The real writer, so the round-trip is tested against the shape the app actually stores
// rather than against a hand-typed object that could drift away from it.
import { makeEvidence } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

console.log("=== cardMergeKey ===");
t("separates same-term cards in different lessons/scenes", () => {
  const a = cardMergeKey({ term: "なるほど", lesson: 18, sec: "3-1" });
  const b = cardMergeKey({ term: "なるほど", lesson: 20, sec: "3-3" });
  ok(a !== b);
});

console.log("=== mergeDeck ===");
t("cloud wins on higher seen", () => {
  const local = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 1, last: 1 }]);
  const cloud = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 5, last: 2 }]);
  const out = JSON.parse(mergeDeck(local, cloud));
  eq(out[0].seen, 5);
});
t("equal seen, newer last wins", () => {
  const local = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 3, last: 10 }]);
  const cloud = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 3, last: 20 }]);
  const out = JSON.parse(mergeDeck(local, cloud));
  eq(out[0].last, 20);
});
t("card only on one side is kept", () => {
  const local = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 1 }]);
  const cloud = JSON.stringify([{ term: "b", lesson: 1, sec: "", seen: 1 }]);
  const out = JSON.parse(mergeDeck(local, cloud));
  eq(out.length, 2);
});
t("なるほど 3-1 and 3-3 stay distinct cards", () => {
  const local = JSON.stringify([{ term: "なるほど", lesson: 18, sec: "3-1", seen: 2 }]);
  const cloud = JSON.stringify([{ term: "なるほど", lesson: 20, sec: "3-3", seen: 1 }]);
  const out = JSON.parse(mergeDeck(local, cloud));
  eq(out.length, 2);
});
t("empty cloud returns local raw unchanged", () => {
  const local = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 1 }]);
  eq(mergeDeck(local, "[]"), local);
});
t("a corrupt local deck loses to a healthy cloud deck instead of poisoning the merge", () => {
  const cloud = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 9 }]);
  eq(mergeDeck("{tru ncated", cloud), cloud, "unparsable local");
  eq(mergeDeck(JSON.stringify({ not: "an array" }), cloud), cloud, "parses but wrong shape");
  eq(mergeDeck(JSON.stringify([{ noTermField: 1 }]), cloud), cloud, "array of non-cards");
});
t("a corrupt cloud deck loses to a healthy local deck", () => {
  const local = JSON.stringify([{ term: "a", lesson: 1, sec: "", seen: 3 }]);
  eq(mergeDeck(local, JSON.stringify([{ noTermField: 1 }])), local);
});

console.log("=== applySeed ===");
const MINI_SEED = [
  { term: "前", reading: "まえ", romaji: "mae", meaning: "before (time)", kind: "n", lesson: 19, sec: "3-2" },
  { term: "前", reading: "まえ", romaji: "mae", meaning: "front", kind: "n", lesson: 43, sec: "6-3" },
  { term: "方", reading: "ほう", romaji: "hō", meaning: "way, alternative", kind: "n", lesson: 43, sec: "6-3" },
  { term: "方", reading: "かた", romaji: "kata", meaning: "person (honorific)", kind: "n", lesson: 43, sec: "6-3#2" },
  { term: "うち", reading: "うち", romaji: "uchi", meaning: "house; home", kind: "n", lesson: 12, sec: "" },
];
let uidN = 0;
const uid = () => "u" + (uidN++);

t("fresh deck: applying seed to itself only refreshes fields, no duplication", () => {
  const fresh = applySeed([], MINI_SEED, uid);
  eq(fresh.length, MINI_SEED.length);
  const again = applySeed(fresh, MINI_SEED, uid);
  eq(again.length, MINI_SEED.length);
});

t("repairs a deck corrupted by the old term-only merge (01 §1.1 scenario)", () => {
  // simulate the OLD merge: one card per term, Object.assign'd repeatedly by the last seed row
  // sharing that term — this is exactly what the pre-fix loadCardsAndSync did.
  const byTerm = new Map();
  MINI_SEED.forEach((s) => { if (!byTerm.has(s.term)) byTerm.set(s.term, { id: "old" + s.term, seen: 5, correct: 4, ...s }); });
  let corrupted = Array.from(byTerm.values());
  {
    const bt = new Map(corrupted.map((c) => [c.term, c]));
    MINI_SEED.forEach((s) => {
      const ex = bt.get(s.term);
      if (ex) Object.assign(ex, { reading: s.reading, romaji: s.romaji, meaning: s.meaning, kind: s.kind, lesson: s.lesson }, s.sec ? { sec: s.sec } : {});
    });
  }
  eq(corrupted.length, 3);   // 前, 方, うち — each collapsed to one card

  const repaired = applySeed(corrupted, MINI_SEED, uid);
  eq(repaired.length, MINI_SEED.length);   // 5 rows: both 前, both 方, うち

  // Whichever duplicate the buggy merge last overwrote onto the single collapsed card keeps
  // that card's id/seen (no history lost); the other duplicate is added fresh with seen 0 —
  // the point is neither is silently dropped, and the two are never re-collapsed into one.
  const mae = repaired.filter((c) => c.term === "前");
  eq(mae.length, 2);
  ok(mae.some((c) => c.seen === 5), "one 前 card must keep the corrupted card's study history");
  ok(mae.some((c) => c.seen === 0), "the sibling 前 card must be added fresh");
  ok(mae.some((c) => c.lesson === 19) && mae.some((c) => c.lesson === 43), "both lessons represented");

  const hou = repaired.filter((c) => c.term === "方");
  eq(hou.length, 2);
  ok(hou.some((c) => c.reading === "ほう") && hou.some((c) => c.reading === "かた"));
});

t("user-added card with a non-seed term is left untouched", () => {
  const custom = [{ id: "c1", term: "オリジナル", reading: "おりじなる", lesson: 99, sec: "", seen: 7 }];
  const out = applySeed(custom, MINI_SEED, uid);
  const kept = out.find((c) => c.id === "c1");
  ok(kept);
  eq(kept.seen, 7);
  eq(out.length, custom.length + MINI_SEED.length);
});

t("idempotent: applying twice gives the same result", () => {
  const once = applySeed([], MINI_SEED, uid);
  const twice = applySeed(once, MINI_SEED, uid);
  eq(once.length, twice.length);
});

console.log("=== mergeStatMap-equivalent (mergeStats), used for kana/conj too ===");
t("two-device kana scenario: higher-seen record wins per id, union otherwise", () => {
  const local = JSON.stringify({ "あ": { seen: 3, last: 2 } });
  const cloud = JSON.stringify({ "あ": { seen: 2, last: 9 }, "い": { seen: 1, last: 1 } });
  const out = JSON.parse(mergeStats(local, cloud));
  eq(out["あ"].seen, 3, "local あ has more reps, must not be overwritten by cloud's newer-but-thinner record");
  ok(out["い"], "cloud-only い must be added");
});
t("unparsable cloud falls back to empty object, local wins", () => {
  const out = JSON.parse(mergeStats(JSON.stringify({ a: { seen: 1 } }), "not json"));
  eq(out.a.seen, 1);
});
t("__proto__ key from cloud is ignored", () => {
  const poisoned = '{"__proto__":{"seen":99}}';
  mergeStats("{}", poisoned);
  eq({}.polluted, undefined);
});

console.log("=== mergeHooks ===");
t("union, local wins on conflict", () => {
  const local = JSON.stringify({ a: "local-a", c: "local-c" });
  const cloud = JSON.stringify({ a: "cloud-a", b: "cloud-b" });
  const out = JSON.parse(mergeHooks(local, cloud));
  eq(out.a, "local-a");
  eq(out.b, "cloud-b");
  eq(out.c, "local-c");
});

console.log("=== mergeDays ===");
t("per-day, higher rev count wins", () => {
  const local = JSON.stringify({ "2026-08-20": { rev: 3 } });
  const cloud = JSON.stringify({ "2026-08-20": { rev: 5 }, "2026-08-21": { rev: 1 } });
  const out = JSON.parse(mergeDays(local, cloud));
  eq(out["2026-08-20"].rev, 5);
  eq(out["2026-08-21"].rev, 1);
});

console.log("=== mergeInput ===");
t("history union by itemId|at, capped 400, pending dedupe", () => {
  const local = JSON.stringify({ history: [{ itemId: "x", at: 1 }], items: {}, pending: [{ itemId: "p1", at: 1 }] });
  const cloud = JSON.stringify({ history: [{ itemId: "x", at: 1 }, { itemId: "y", at: 2 }], items: {}, pending: [{ itemId: "p1", at: 1 }] });
  const out = JSON.parse(mergeInput(local, cloud));
  eq(out.history.length, 2);
  eq(out.pending.length, 1);
});

console.log("=== mergeSnapshots ===");
t("kana uses per-record rule even when cloudUpdatedAt > lastPulled", () => {
  const localSnap = { "jpn101:kana": JSON.stringify({ "あ": { seen: 3 } }) };
  const cloudSnap = { "jpn101:kana": JSON.stringify({ "あ": { seen: 1 }, "い": { seen: 1 } }) };
  const out = mergeSnapshots(localSnap, cloudSnap, Date.now(), 0);
  const kana = JSON.parse(out["jpn101:kana"]);
  eq(kana["あ"].seen, 3, "per-record merge must beat the whole-snapshot newer-wins fallback");
  ok(kana["い"]);
});
t("scalar keys (retention) follow newer-snapshot-wins", () => {
  const localSnap = { "jpn101:retention": "0.85" };
  const cloudSnap = { "jpn101:retention": "0.9" };
  const out = mergeSnapshots(localSnap, cloudSnap, Date.now(), 0);
  eq(out["jpn101:retention"], "0.9");
});
t("skipped keys never appear in output", () => {
  const skip = new Set(["jpn101:session"]);
  const localSnap = { "jpn101:session": "tok" };
  const cloudSnap = { "jpn101:session": "othertok" };
  const out = mergeSnapshots(localSnap, cloudSnap, Date.now(), 0, skip);
  eq(out["jpn101:session"], undefined);
});
t("deckVersion/freqVersion take the max", () => {
  const out = mergeSnapshots({ "jpn101:freqVersion": "3" }, { "jpn101:freqVersion": "7" }, Date.now(), 0);
  eq(out["jpn101:freqVersion"], "7");
});
t("freq merges per record like the deck", () => {
  const localSnap = { "jpn101:freq": JSON.stringify([{ term: "a", seen: 1, last: 1 }]) };
  const cloudSnap = { "jpn101:freq": JSON.stringify([{ term: "a", seen: 5, last: 2 }, { term: "b", seen: 1, last: 1 }]) };
  const out = mergeSnapshots(localSnap, cloudSnap, Date.now(), 0);
  const freq = JSON.parse(out["jpn101:freq"]);
  eq(freq.length, 2);
  eq(freq.find((c) => c.term === "a").seen, 5);
});

console.log("=== evidence survives the round trip with its newer fields intact (MP-09) ===");
/* The acceptance criterion for the structured error record. mergeEvidence unions WHOLE
   rows, so nothing here should need changing when a field is added — which is exactly the
   claim worth pinning down, because the day it stops being true is the day a sync silently
   strips the diagnosis off every mistake and nothing in the app looks broken. */
const errorRow = makeEvidence({
  id: 41, deck: "vocab", format: "type", ok: false, ms: 4200, cue: 4,
  failure: "production", got: "かようび", want: "きんようび", confused: "c9",
  predicted: 0.61, pRecall: 0.44, s0: 3.5, s1: 1.2, recovery: "production:1/3",
  at: 1756500000000,
});
t("a failure keeps got/want/recovery through a merge", () => {
  const out = JSON.parse(mergeEvidence("[]", JSON.stringify([errorRow])));
  eq(out.length, 1);
  eq(out[0], errorRow, "the row must come back byte-identical, not merely recognisable");
});
t("the union does not drop the side that has the newer fields", () => {
  const oldRow = { id: 7, deck: "vocab", format: "mc", ok: false, failure: "meaning", at: 1756400000000 };
  const merged = JSON.parse(mergeEvidence(JSON.stringify([oldRow]), JSON.stringify([errorRow])));
  eq(merged.length, 2, "one old row and one new one, both kept");
  eq(merged[0].id, 7, "sorted oldest first");
  eq(merged[1].got, "かようび");
});
t("a duplicated row is deduped without losing its strings", () => {
  const merged = JSON.parse(mergeEvidence(JSON.stringify([errorRow]), JSON.stringify([errorRow])));
  eq(merged.length, 1);
  eq(merged[0].want, "きんようび");
});
t("the whole snapshot path carries them too", () => {
  const out = mergeSnapshots(
    { "jpn101:evidence": JSON.stringify([errorRow]) },
    { "jpn101:evidence": "[]" },
    Date.now(), 0,
  );
  eq(JSON.parse(out["jpn101:evidence"])[0].got, "かようび");
});
t("the added text stays inside the cap that the size estimate assumes", () => {
  const wild = makeEvidence({ id: 1, format: "type", ok: false, got: "あ".repeat(400), want: "い".repeat(400) });
  const bytes = Buffer.byteLength(JSON.stringify({ got: wild.got, want: wild.want }), "utf8");
  ok(bytes <= 160, "a failed row's two strings must stay ~140 bytes, measured " + bytes);
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} merge tests passed`);
process.exit(fail ? 1 : 0);
