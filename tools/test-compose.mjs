// Tests for the session composer (tools/compose.mjs).
//   node tools/test-compose.mjs
import { ACTIVITY, SUPPORT, activityFor, arrange, composeSession, describeComposition } from "./compose.mjs";
import { CUE } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

// material a card might have
const withSentence = {
  sentenceFor: (id) => (id === "bare" ? null : { sentence: "わたしは がくせい です。", en: "I am a student." }),
  chunkCount: (s) => (s ? 4 : 0),
  hasParticleGap: () => false,
};
const noMaterial = { sentenceFor: () => null, chunkCount: () => 0, hasParticleGap: () => false };
const pick = (o) => ({ id: "x", format: "mc", cue: CUE.CHOOSE, ...o });

console.log("=== activity follows the material, not just the intention ===");
t("a context ask with a sentence is a cloze", () => {
  eq(activityFor(pick({ format: "cloze", cue: CUE.CONTEXT }), withSentence), ACTIVITY.CLOZE);
});
t("a context ask with NO sentence degrades instead of rendering nothing", () => {
  // The bug this replaces: fmt "cloze" with no sentence rendered an empty card.
  eq(activityFor(pick({ id: "bare", format: "cloze", cue: CUE.CONTEXT }), withSentence), ACTIVITY.MC);
  eq(activityFor(pick({ format: "cloze" }), noMaterial), ACTIVITY.MC);
});
t("a sentence with a gradeable particle gap becomes a particle tap", () => {
  const m = { ...withSentence, hasParticleGap: () => true };
  eq(activityFor(pick({ format: "cloze", cue: CUE.CONTEXT }), m), ACTIVITY.TAPFILL);
});

console.log("=== production is laddered by how much support is still needed ===");
t("low cue -> arrange the pieces (all tiles correct)", () => {
  eq(activityFor(pick({ format: "type", cue: CUE.STRONG }), withSentence), ACTIVITY.ORDER);
});
t("mid cue -> word bank (tiles include extras)", () => {
  eq(activityFor(pick({ format: "type", cue: CUE.PARTIAL }), withSentence), ACTIVITY.BUILD);
});
t("high cue -> type it, no support at all", () => {
  eq(activityFor(pick({ format: "type", cue: CUE.FREE }), withSentence), ACTIVITY.TYPE);
});
t("the ladder is ordered by support, not by name", () => {
  ok(SUPPORT[ACTIVITY.ORDER] < SUPPORT[ACTIVITY.BUILD], "order gives more help than build");
  ok(SUPPORT[ACTIVITY.BUILD] < SUPPORT[ACTIVITY.TYPE], "build gives more help than typing");
});
t("no sentence, or too few pieces, falls back to typing", () => {
  eq(activityFor(pick({ format: "type", cue: CUE.STRONG }), noMaterial), ACTIVITY.TYPE);
  const thin = { ...withSentence, chunkCount: () => 2 };
  eq(activityFor(pick({ format: "type", cue: CUE.STRONG }), thin), ACTIVITY.TYPE);
});
t("an English gloss is required for a word bank — it IS the prompt", () => {
  const noEn = { ...withSentence, sentenceFor: () => ({ sentence: "わたしは がくせい です。" }) };
  eq(activityFor(pick({ format: "type", cue: CUE.PARTIAL }), noEn), ACTIVITY.TYPE);
});
t("formats the composer does not specialise pass straight through", () => {
  for (const f of ["learn", "mc", "recall", "listen"]) {
    eq(activityFor(pick({ format: f }), withSentence), f);
  }
});
t("an unknown format never escapes as an unrenderable activity", () => {
  eq(activityFor(pick({ format: "nonsense" }), withSentence), ACTIVITY.MC);
});

console.log("=== the arc ===");
const item = (activity, extra = {}) => ({ id: activity + Math.random(), activity, ...extra });
t("opens on something winnable, not on free production", () => {
  const out = arrange([item(ACTIVITY.TYPE), item(ACTIVITY.TYPE), item(ACTIVITY.MC), item(ACTIVITY.BUILD)]);
  eq(out[0].activity, ACTIVITY.MC, "the supported activity should lead");
});
t("ends on the least-supported item — the boss question", () => {
  const out = arrange([item(ACTIVITY.MC), item(ACTIVITY.CLOZE), item(ACTIVITY.MC), item(ACTIVITY.TYPE)]);
  eq(out[out.length - 1].activity, ACTIVITY.TYPE);
});
t("no item is lost or duplicated, whatever the arrangement", () => {
  const items = [item(ACTIVITY.MC), item(ACTIVITY.TYPE), item(ACTIVITY.CLOZE), item(ACTIVITY.BUILD),
                 item(ACTIVITY.LISTEN), item(ACTIVITY.MC, { wasMissed: true }), item(ACTIVITY.ORDER)];
  const out = arrange(items);
  eq(out.length, items.length);
  eq(new Set(out.map((x) => x.id)).size, items.length, "ids must survive intact");
});
t("consecutive repeats are avoided where the material allows", () => {
  const items = [item(ACTIVITY.MC), item(ACTIVITY.MC), item(ACTIVITY.CLOZE), item(ACTIVITY.CLOZE),
                 item(ACTIVITY.LISTEN), item(ACTIVITY.TYPE)];
  const out = arrange(items);
  let runs = 0;
  for (let i = 1; i < out.length; i++) if (out[i].activity === out[i - 1].activity) runs++;
  ok(runs <= 1, "expected at most one unavoidable repeat, got " + runs);
});
t("variety never costs an item — an all-identical session still returns everything", () => {
  const items = [item(ACTIVITY.MC), item(ACTIVITY.MC), item(ACTIVITY.MC), item(ACTIVITY.MC), item(ACTIVITY.MC)];
  eq(arrange(items).length, 5);
});
t("a recent failure lands in the middle, not first and not last", () => {
  const items = [item(ACTIVITY.MC), item(ACTIVITY.CLOZE), item(ACTIVITY.LISTEN),
                 item(ACTIVITY.RECALL, { wasMissed: true }), item(ACTIVITY.BUILD), item(ACTIVITY.TYPE)];
  const out = arrange(items);
  const at = out.findIndex((x) => x.wasMissed);
  ok(at > 0 && at < out.length - 1, "cold-opening on a word you just failed is the thing to avoid; at " + at);
});
t("a session too short to have an arc is left alone", () => {
  const items = [item(ACTIVITY.TYPE), item(ACTIVITY.MC), item(ACTIVITY.TYPE)];
  eq(arrange(items).map((x) => x.activity).join(","), items.map((x) => x.activity).join(","));
});
t("an all-easy session does not invent a finale harder than it has", () => {
  const items = [item(ACTIVITY.MC), item(ACTIVITY.MC), item(ACTIVITY.LEARN), item(ACTIVITY.MC)];
  const out = arrange(items);
  eq(out.length, 4);
});
t("empty and junk input are safe", () => {
  eq(arrange([]).length, 0);
  eq(arrange(null).length, 0);
  eq(arrange([null, undefined]).length, 0);
});

console.log("=== composeSession end to end ===");
t("a realistic session comes back varied, ordered, and complete", () => {
  const picks = [
    pick({ id: "a", format: "mc", cue: CUE.CHOOSE }),
    pick({ id: "b", format: "type", cue: CUE.STRONG }),
    pick({ id: "c", format: "cloze", cue: CUE.CONTEXT }),
    pick({ id: "d", format: "listen", cue: CUE.CHOOSE }),
    pick({ id: "e", format: "type", cue: CUE.PARTIAL }),
    pick({ id: "f", format: "type", cue: CUE.FREE }),
    pick({ id: "g", format: "recall", cue: CUE.FREE }),
  ];
  const out = composeSession(picks, withSentence);
  eq(out.length, picks.length);
  const d = describeComposition(out);
  ok(d.kinds >= 4, "a composed session should feel varied, got " + d.kinds + " kinds");
  eq(SUPPORT[d.endsWith] >= SUPPORT[d.opensWith], true, "it should get harder, not easier");
  // and the whole point: activities the old FORMATS list could not produce
  const extras = out.filter((x) => [ACTIVITY.ORDER, ACTIVITY.BUILD, ACTIVITY.TAPFILL].includes(x.activity));
  ok(extras.length > 0, "the composer exists to reach the activities formats alone could not");
});
t("describeComposition counts kinds, and survives an empty session", () => {
  eq(describeComposition([]).n, 0);
  eq(describeComposition(null).kinds, 0);
  const d = describeComposition([item(ACTIVITY.MC), item(ACTIVITY.MC), item(ACTIVITY.TYPE)]);
  eq(d.n, 3); eq(d.kinds, 2); eq(d.counts.mc, 2);
});

console.log(`\nall ${run} compose tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
