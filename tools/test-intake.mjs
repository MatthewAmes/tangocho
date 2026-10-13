// Tests for tools/intake.mjs — which new words a session introduces.
//
//   node tools/test-intake.mjs
import { orderIntake, intakeGroup, INTAKE_SHARES } from "./intake.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const vocab = (sec, i, order = 0) => ({ deck: "vocab", item: { id: "v" + sec + i, sec, order } });
const freq = (rank) => ({ deck: "freq", item: { id: "f" + rank, rank } });
const strand = (deck, i) => ({ deck, item: { id: deck + i } });

const V1 = Array.from({ length: 10 }, (_, i) => vocab("3-" + (1 + (i % 5)), i, 20));
const V2 = Array.from({ length: 10 }, (_, i) => vocab((7 + (i % 6)) + "-" + (1 + (i % 4)), i, 60));
const F = Array.from({ length: 10 }, (_, i) => freq(i + 1));
const S = [strand("grammar", 1), strand("kanji", 2), strand("conj", 3)];

t("groups: Volume 2 by act, the 10k list, strands, the rest", () => {
  eq(intakeGroup(vocab("7/20", 0)), "other", "a supplemental list sharing act 7 is not textbook vocabulary");
  eq(intakeGroup(vocab("7-1", 0)), "vol2");
  eq(intakeGroup(vocab("12-9R", 0)), "vol2");
  eq(intakeGroup(vocab("3-2", 0)), "other");
  eq(intakeGroup(freq(5)), "freq");
  eq(intakeGroup(strand("grammar", 0)), "strand");
});
t("Volume 1 leftovers no longer come before Volume 2", () => {
  const out = orderIntake([...V1, ...V2, ...F]);
  const firstV1 = out.findIndex((c) => intakeGroup(c) === "other");
  const lastV2 = out.map((c) => intakeGroup(c)).lastIndexOf("vol2");
  ok(firstV1 > lastV2, "every Volume 2 word is offered before any Volume 1 leftover");
});
t("the first new words follow the shares", () => {
  const out = orderIntake([...V1, ...V2, ...F, ...S]).slice(0, 10);
  const n = (g) => out.filter((c) => intakeGroup(c) === g).length;
  ok(n("vol2") >= 5 && n("vol2") <= 6, `vol2 ${n("vol2")}`);
  ok(n("freq") >= 3 && n("freq") <= 3, `freq ${n("freq")}`);
  ok(n("strand") >= 1 && n("strand") <= 2, `strand ${n("strand")}`);
  eq(n("other"), 0);
});
t("even a small session gets a common word", () => {
  const out = orderIntake([...V2, ...F]).slice(0, 3);
  ok(out.some((c) => intakeGroup(c) === "freq"));
  eq(intakeGroup(out[0]), "vol2", "Volume 2 leads");
});
t("Volume 2 comes in book order; the 10k list most common first", () => {
  const out = orderIntake([vocab("9-2", 0), vocab("7-3", 1), vocab("7-1", 2), freq(40), freq(2)]);
  eq(out.filter((c) => intakeGroup(c) === "vol2").map((c) => c.item.sec), ["7-1", "7-3", "9-2"]);
  eq(out.filter((c) => intakeGroup(c) === "freq").map((c) => c.item.rank), [2, 40]);
});
t("an empty source gives its share away; Volume 1 stands in once Volume 2 is done", () => {
  const out = orderIntake([...V1, ...F]).slice(0, 10);
  const n = (g) => out.filter((c) => intakeGroup(c) === g).length;
  ok(n("other") >= 6, `Volume 1 takes Volume 2's share: ${n("other")}`);
  eq(orderIntake([...F]).length, 10, "nothing is dropped");
});
t("nothing is dropped or duplicated", () => {
  const all = [...V1, ...V2, ...F, ...S];
  const out = orderIntake(all);
  eq(out.length, all.length);
  eq(new Set(out.map((c) => c.item.id)).size, all.length);
  ok(Math.abs(INTAKE_SHARES.vol2 + INTAKE_SHARES.freq + INTAKE_SHARES.strand - 1) < 1e-9);
});

console.log(fail ? `${fail} of ${run} intake tests FAILED` : `all ${run} intake tests passed`);
process.exit(fail ? 1 : 0);
