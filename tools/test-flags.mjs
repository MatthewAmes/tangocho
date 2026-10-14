// Tests for tools/flags.mjs — flagging a card that is wrong.
//
//   node tools/test-flags.mjs
import { addFlag, setReason, mergeFlags, FLAG_CAP } from "./flags.mjs";
import { mergeSnapshots } from "./merge.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

t("a flag records the card and starts with no reason", () => {
  const l = addFlag([], { id: "v1", term: "の", meaning: "field", at: 10 });
  eq(l.length, 1); eq(l[0].reason, null); eq(l[0].term, "の");
});
t("a reason can be added afterwards to that flag only", () => {
  let l = addFlag([], { id: "v1", at: 10 });
  l = addFlag(l, { id: "v2", at: 20 });
  l = setReason(l, 20, "wrong meaning");
  eq(l.map((f) => f.reason), [null, "wrong meaning"]);
});
t("flags without a card id are ignored, and the list is capped", () => {
  eq(addFlag([], { term: "x" }).length, 0);
  let l = [];
  for (let i = 0; i < FLAG_CAP + 20; i++) l = addFlag(l, { id: "c" + i, at: i + 1 });
  eq(l.length, FLAG_CAP); eq(l[0].id, "c20", "oldest dropped first");
});
t("two devices' flags are united, not overwritten", () => {
  const phone = JSON.stringify([{ id: "a", at: 1, reason: "wrong reading" }, { id: "b", at: 2, reason: null }]);
  const laptop = JSON.stringify([{ id: "b", at: 2, reason: "makes no sense" }, { id: "c", at: 3, reason: null }]);
  const m = JSON.parse(mergeFlags(phone, laptop));
  eq(m.map((f) => f.id), ["a", "b", "c"]);
  eq(m.find((f) => f.id === "b").reason, "makes no sense", "a reason on either side survives");
});
t("the snapshot merge uses the union for flags", () => {
  const local = { "jpn101:flags": JSON.stringify([{ id: "a", at: 1 }]) };
  const cloud = { "jpn101:flags": JSON.stringify([{ id: "z", at: 9 }]) };
  const out = mergeSnapshots(local, cloud, Date.now(), 0);
  eq(JSON.parse(out["jpn101:flags"]).map((f) => f.id), ["a", "z"]);
});
t("junk on either side is survivable", () => {
  eq(JSON.parse(mergeFlags("not json", null)), []);
  eq(JSON.parse(mergeFlags(JSON.stringify([{ id: "a", at: 1 }]), "{}")).length, 1);
});

console.log(fail ? `${fail} of ${run} flag tests FAILED` : `all ${run} flag tests passed`);
process.exit(fail ? 1 : 0);
