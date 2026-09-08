/* Tests for grammar nodes (tools/grammar.mjs).
 *
 * The properties worth pinning: that a form has its own mastery independent of the verbs
 * that carry it, that a sub-rule failing is reported without being scheduled separately,
 * and that a prerequisite which is failing blocks while one that is merely unmeasured
 * does not.
 *
 *   node tools/test-grammar.mjs
 */
import {
  GRAMMAR_NODES, NODE_BY_FORM, NODE_BY_ID, GODAN_GROUPS,
  parseConjId, subRuleFor, grammarProfiles, nodeStatus, weakestSubRule, nodesForAct,
} from "./grammar.mjs";
import { CONJ_BANK } from "../src/data/conj-bank.js";
import { CONJ_FORMS } from "../src/lib/conjugate.js";
import { STATE } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

const now = Date.now();
const verbsOfType = (type) => CONJ_BANK.filter((w) => w.type === type);
const godanEndingIn = (chars) => CONJ_BANK.filter((w) => w.type === "godan" && chars.includes((w.dict || "").slice(-1)));
const rows = (verbs, form, correct, n, at) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = verbs[i % verbs.length];
    out.push({ id: "conj:" + w.reading + "|" + form, ok: correct, at: at == null ? now - i * 60000 : at });
  }
  return out;
};

console.log("=== the node roster ===");

t("every drillable cell has a node, and every node points at a real cell", () => {
  for (const f of CONJ_FORMS) ok(NODE_BY_FORM[f.id], "no node for cell " + f.id);
  for (const n of GRAMMAR_NODES) ok(CONJ_FORMS.some((f) => f.id === n.form), n.id + " points at no cell");
});

t("prerequisites all name real nodes and nothing depends on itself", () => {
  for (const n of GRAMMAR_NODES) {
    for (const p of n.prereqs) {
      ok(NODE_BY_ID[p], n.id + " requires unknown node " + p);
      ok(p !== n.id, n.id + " requires itself");
    }
  }
});

t("the prereq graph has no cycles", () => {
  const seen = {};
  const walk = (id, stack) => {
    if (stack.includes(id)) throw new Error("cycle: " + stack.concat(id).join(" -> "));
    if (seen[id]) return;
    seen[id] = true;
    for (const p of NODE_BY_ID[id].prereqs) walk(p, stack.concat(id));
  };
  for (const n of GRAMMAR_NODES) walk(n.id, []);
});

t("て-form depends on plain past, because they share the same sound changes", () => {
  ok(NODE_BY_ID["g-te"].prereqs.includes("g-plain-past"),
    "a learner who cannot form 読んだ will not form 読んで");
});

console.log("\n=== id parsing ===");

t("a conjugation id decodes to a verb and a form", () => {
  const p = parseConjId("conj:たべる|p-te");
  eq(p.reading, "たべる");
  eq(p.form, "p-te");
});

t("the same id works without the deck prefix", () => {
  eq(parseConjId("たべる|p-te").form, "p-te");
});

t("anything that is not a conjugation row is ignored, not guessed at", () => {
  eq(parseConjId("2n9h7zes"), null, "a vocabulary card id");
  eq(parseConjId(null), null);
  eq(parseConjId("conj:|p-te"), null, "no verb");
  eq(parseConjId("conj:たべる|not-a-form"), null, "not a real cell");
});

console.log("\n=== sub-rules come from the data ===");

t("godan verbs are split by the sound change their ending triggers", () => {
  const mu = CONJ_BANK.find((w) => w.type === "godan" && (w.dict || "").endsWith("む"));
  const u = CONJ_BANK.find((w) => w.type === "godan" && (w.dict || "").endsWith("う"));
  if (mu) eq(subRuleFor(mu), "godan-nde");
  if (u) eq(subRuleFor(u), "godan-tte");
});

t("non-godan classes are their own sub-rule", () => {
  const ich = verbsOfType("ichidan")[0];
  if (ich) eq(subRuleFor(ich), "ichidan");
});

t("every godan group names a real sound change", () => {
  for (const g of GODAN_GROUPS) { ok(g.rule && g.ends.length, g.id + " is not described"); }
});

console.log("\n=== a form has its own mastery ===");

t("THE POINT: て-form is weak even though the verbs in it are known", () => {
  /* The same verbs answered well in one form and badly in another. Card-level SRS cannot
     express this: every one of these cards is a different item. */
  const verbs = verbsOfType("godan").slice(0, 6);
  const ev = [...rows(verbs, "f-pp", true, 20), ...rows(verbs, "p-te", false, 18), ...rows(verbs, "p-te", true, 2)];
  const p = grammarProfiles(ev);
  ok(p["g-polite"].measured && p["g-te"].measured, "both forms measured");
  ok(p["g-polite"].mean > 0.7, "polite present is holding: " + p["g-polite"].mean.toFixed(2));
  ok(p["g-te"].mean < 0.4, "て-form is not: " + p["g-te"].mean.toFixed(2));
});

t("a form nobody has drilled is unmeasured, not failing", () => {
  const p = grammarProfiles(rows(verbsOfType("godan").slice(0, 3), "f-pp", true, 12));
  eq(p["g-tai"].measured, false);
  eq(p["g-tai"].n, 0);
  eq(p["g-tai"].state, STATE.UNKNOWN);
});

t("every node gets a row, so a missing form is never read as fine", () => {
  const p = grammarProfiles([]);
  for (const n of GRAMMAR_NODES) ok(p[n.id], "missing row for " + n.id);
});

t("evidence older than the window does not count", () => {
  const old = now - 400 * 86400000;
  const p = grammarProfiles(rows(verbsOfType("godan").slice(0, 3), "p-te", true, 30, old));
  eq(p["g-te"].n, 0);
});

console.log("\n=== the sub-rule diagnosis ===");

t("THE POINT: it finds the rule that is misfiring, not just the form", () => {
  /* って fine, んで failing — the exact case the micro-lesson exists for. */
  const tte = godanEndingIn(["う", "つ", "る"]).slice(0, 4);
  const nde = godanEndingIn(["む", "ぶ", "ぬ"]).slice(0, 4);
  if (!tte.length || !nde.length) return;
  const ev = [...rows(tte, "p-te", true, 16), ...rows(nde, "p-te", false, 14), ...rows(nde, "p-te", true, 2)];
  const p = grammarProfiles(ev);
  const worst = weakestSubRule("g-te", p);
  ok(worst, "a failing sub-rule should be found");
  eq(worst.rule, "godan-nde");
  ok(/んで/.test(worst.explain || ""), "and it can say which change: " + worst.explain);
});

t("a sub-rule with too little evidence is not diagnosed", () => {
  const nde = godanEndingIn(["む", "ぶ", "ぬ"]).slice(0, 2);
  if (!nde.length) return;
  const p = grammarProfiles(rows(nde, "p-te", false, 2));
  eq(weakestSubRule("g-te", p), null, "two answers is not a diagnosis");
});

t("nothing failing means nothing to explain", () => {
  const p = grammarProfiles(rows(verbsOfType("godan").slice(0, 4), "p-te", true, 20));
  eq(weakestSubRule("g-te", p), null);
});

console.log("\n=== prerequisites gate honestly ===");

t("a failing prerequisite blocks, and says which one", () => {
  const verbs = verbsOfType("godan").slice(0, 5);
  const p = grammarProfiles([...rows(verbs, "p-ap", false, 18), ...rows(verbs, "p-ap", true, 2)]);
  const st = nodeStatus("g-te", p);
  eq(st.ready, false, "て-form should wait for plain past");
  ok(st.blockedBy.includes("g-plain-past"), "and name it: " + JSON.stringify(st.blockedBy));
});

t("an UNMEASURED prerequisite does not block", () => {
  /* Otherwise the evidence never arrives: refusing to ask about て-form until plain past is
     proven, when nobody has asked about plain past either, is a deadlock. */
  const st = nodeStatus("g-te", grammarProfiles([]));
  eq(st.ready, true, "unknown is not weak here either");
  eq(st.blockedBy.length, 0);
});

t("a holding prerequisite does not block", () => {
  const verbs = verbsOfType("godan").slice(0, 5);
  const p = grammarProfiles(rows(verbs, "p-ap", true, 20));
  eq(nodeStatus("g-te", p).ready, true);
});

t("an unknown node id yields null rather than a fake status", () => {
  eq(nodeStatus("g-nonsense", {}), null);
});

console.log("\n=== acts ===");

t("nodesForAct returns only what that act teaches", () => {
  const six = nodesForAct(6).map((n) => n.id);
  ok(six.includes("g-te"), "act 6 should teach て-form");
  ok(!six.includes("g-tai"), "and not たい, which is act 7");
  eq(nodesForAct(999).length, 0);
});

t("every node sits in a real act", () => {
  for (const n of GRAMMAR_NODES) ok(Number.isFinite(n.act) && n.act > 0, n.id + " has no act");
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} grammar tests passed`);
process.exitCode = fail ? 1 : 0;
