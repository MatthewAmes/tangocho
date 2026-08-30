// ── the adaptive loop, end to end ───────────────────────────────────────────────────────
//
//   node tools/test-adaptive-loop.mjs
//
// Every module in this engine has its own unit tests. None of them proves the thing the
// design doc actually asks for (docs/duolingo-megaprompt.md, spec §43):
//
//     "The loop must be real: the next activity must actually be capable of changing
//      because of what happened in the previous one."
//
// That is a claim about the SEAMS, not about any one module. classifyFailure can be
// perfect, buildRecovery can be perfect, chooseIntervention can be perfect, and the loop
// can still be decorative — which is exactly what an earlier review found: failure
// classification existed and changed nothing downstream. A unit test cannot catch that.
// This file can, because it drives the real modules together and asserts that the OUTPUT
// of one stage visibly moves the output of the next.
//
// The loop, as the code actually implements it today:
//
//   1. SELECT      session.buildSession        which item is worth the next slot
//      + ASK       session.withFormats         ...and how to ask it
//                    -> learner.chooseIntervention: which ability × how much help
//                    -> format is a CONSEQUENCE of (skill, cue), never chosen directly
//
//   2. ANSWER      the learner gets it wrong
//
//   3. DIAGNOSE    learner.classifyFailure     WHAT broke — 8 kinds, not "wrong"
//
//   4. REPAIR      learner.planAfterFailure    the one-step correction
//                  learner.buildRecovery       ...and the staged rescue ladder
//
//   5. RECORD      learner.makeEvidence        one row per answer (the calibration log)
//                  learner.pushRecent          rolling history, onto the stat record
//                  fsrs.gradeFromLatency
//                  fsrs.review                 the memory state moves
//                  st.lastFailure              the diagnosis, onto the stat record
//
//   6. RE-ESTIMATE learner.profileFrom         per-skill rates from the evidence log
//                  learner.abilityFrom         Bayesian posterior from the stat record
//
//   7. RE-SELECT   session.buildSession        ...and the next pick is DIFFERENT
//      + RE-ASK    session.withFormats
//
// Stage 7 is the whole point. Every assertion below that compares a "failure run" against
// a "control run" is asserting that a wire between two stages is still connected. If
// someone later disconnects the diagnosis from the selection — drops `lastFailure` out of
// interventionFor's pass-through, say — the control and failure runs become identical and
// this file fails loudly rather than the app quietly going back to asking the same
// question again.
//
// Deterministic: `now` is a fixed timestamp and every buildSession call passes an explicit
// `seed`, so the jitter band in session.candidates cannot vary by machine or by local date.
//
// ── WHAT IS AND IS NOT PROVED HERE ──────────────────────────────────────────────────────
//
// PROVED, today, in these modules:
//   - a diagnosis changes the next intervention's CUE (support is handed back)
//   - a diagnosis changes the next intervention's SKILL and FORMAT when the plan names an
//     ability that is unlocked for the item
//   - two different failure types on the same item route to two different next activities
//   - a failure changes the item's need score enough to reorder the session queue
//   - recovery ladders differ in format from the activity that failed, and never ask for
//     more than the demand that just beat the learner
//
// NOT proved here, deliberately — see the notes at stages 4 and 5:
//   - that buildRecovery's stages reach the live queue. session.mjs does not consume
//     buildRecovery at all; today only the React layer splices the ladder in. Wiring the
//     recovery sequencer into the queue proper is MP-08 (#98), and when it lands, the
//     stage-4 block below should grow an assertion that the rebuilt queue CONTAINS the
//     rescue stages rather than merely that the next ask changed.
//   - that listening is reachable from a review pick. chooseIntervention gates listening
//     behind step > 0 (it is a repeat-only format), and buildSession only ever assigns
//     step > 0 to brand-new items, whose intervention returns early at recognition. So a
//     listening plan is currently dropped on a review item. Stage 5 asserts what is true
//     today — that the two failure types still route apart — and separately proves that
//     the listening route works at step >= 1, so the gate is the only thing in the way.

import {
  classifyFailure, planAfterFailure, buildRecovery, makeEvidence, pushRecent,
  profileFrom, abilityFrom, skillForFormat, CUE, FAILURE_PLAN, RECOVERY_LADDERS,
} from "./learner.mjs";
import { buildSession, withFormats, interventionFor, skillOf, need } from "./session.mjs";
import { review, gradeFromLatency, AGAIN } from "./fsrs.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ": " : "") + "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); };
const ne = (a, b, m) => { if (a === b) throw new Error((m ? m + ": " : "") + "expected NOT " + JSON.stringify(b) + " — this stage of the loop is a no-op"); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error((m ? m + ": " : "") + "expected " + a + " > " + b); };
const lte = (a, b, m) => { if (!(a <= b)) throw new Error((m ? m + ": " : "") + "expected " + a + " <= " + b); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

const DAY = 86400000;
// Fixed clock and fixed jitter seed. Nothing in this file may depend on the wall clock or
// on the local timezone: session.candidates seeds its tie-break jitter from dayKey(now)
// unless a seed is supplied, and a test that reshuffles at midnight is not a test.
const NOW = 1_700_000_000_000;
const SEED = "mp-22-adaptive-loop";

// ════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — seed a learner and a deck
// ════════════════════════════════════════════════════════════════════════════════════════
//
// The target item is 火曜日 / かようび. It is deliberately WELL KNOWN: strong recognition
// and strong production history. That matters. A weak item has nowhere to fall — it is
// already being asked at the easiest rung — so the loop cannot be seen to move it. The
// interesting case is the word the learner has earned the hard version of, and then misses.
//
// The other four words are healthy filler, so the target has real competition for its slot
// and "the queue reordered" means something.

const TARGET = "kayoubi";

// A stat record in the shape every deck in the app already stores: recognition history in
// {seen, correct, recent, fsrs}, production history in {rseen, rcorrect, rrecent, rfsrs}.
//
// Recognition is flawless and very stable; production is nearly as good but one notch
// behind. That gap is deliberate and load-bearing: chooseIntervention spends the slot on
// the ability with the most practice value, so production has to be the weaker of the two
// to be chosen at all, while still being strong enough that the cue ladder climbs to the
// top rung. A word the learner has only half-learned would already be asked at the bottom
// rung, with no support left to hand back, and the loop's movement would be invisible.
const strong = (over = {}) => ({
  seen: 30, correct: 30, level: 5, streak: 5, last: NOW - 12 * DAY,
  recent: "1111111111",
  fsrs: { S: 60, D: 5, last: NOW - 12 * DAY, due: NOW - DAY, ivl: 60 },
  rseen: 30, rcorrect: 29, rrecent: "1111111111",
  rfsrs: { S: 35, D: 6, last: NOW - 10 * DAY, due: NOW - DAY, ivl: 35 },
  ms: 4000 * 30, msN: 30,
  ...over,
});

const ITEMS = [
  { id: TARGET,   order: 0, term: "火曜日", reading: "かようび", en: "Tuesday" },
  { id: "suiyou", order: 1, term: "水曜日", reading: "すいようび", en: "Wednesday" },
  { id: "gakkou", order: 2, term: "学校",   reading: "がっこう",   en: "school" },
  { id: "kaisha", order: 3, term: "会社",   reading: "かいしゃ",   en: "company" },
  { id: "sensei", order: 4, term: "先生",   reading: "せんせい",   en: "teacher" },
];

// Mirrors the app's own capsFor (JpnFlashcards.jsx): typeable when there is a reading,
// listenable when there is anything to speak, and contextual ONLY when a sentence is
// already in hand. None of these five has one, so the context rung is honestly unavailable
// — promising a cloze and then having no sentence is how a card renders blank mid-session.
const CAPS_FOR = (it) => ({ type: !!it.reading, listen: !!(it.reading || it.term), context: !!it.example });

const deckOf = (stats) => [{ deck: "vocab", items: ITEMS, stats, capsFor: CAPS_FOR }];
const baseStats = () => Object.fromEntries(ITEMS.map((it, i) => [
  it.id,
  // Stagger only WHEN each was last seen, so the queue has a genuine, stable ordering to
  // disturb without any of the five being weaker than another.
  strong({ last: NOW - (12 + i) * DAY, fsrs: { S: 60, D: 5, last: NOW - (12 + i) * DAY, due: NOW - DAY, ivl: 60 } }),
]));

const askFor = (stats, id, opts = {}) => {
  const st = stats[id];
  const item = ITEMS.find((x) => x.id === id);
  return interventionFor({
    st, caps: CAPS_FOR(item), step: opts.step || 0,
    recognition: skillOf(st, "fsrs"), production: skillOf(st, "rfsrs"),
    lastFailure: opts.lastFailure !== undefined ? opts.lastFailure : (st && st.lastFailure) || null,
  });
};
const shape = (x) => x.skill + "/" + x.cue + "/" + x.format;

console.log("=== STAGE 1: the seeded state ===");

let CONTROL_STATS, CONTROL_ASK;
t("the seeded learner has earned the hard version of the target word", () => {
  CONTROL_STATS = baseStats();
  CONTROL_ASK = askFor(CONTROL_STATS, TARGET);
  // Not asserted as literals for their own sake: the rest of the file only means anything
  // if the control ask is genuinely the top of the ladder. A word already being asked at
  // CUE.CHOOSE has no support left to hand back, and stage 4 would prove nothing.
  eq(CONTROL_ASK.skill, "production", "the weakest unlocked ability should be production");
  eq(CONTROL_ASK.cue, CUE.FREE, "a strong production memory should be asked cold");
  eq(CONTROL_ASK.format, "type", "production at a sub-contextual cue renders as typing");
});

t("the control session is stable across rebuilds (deterministic, seeded)", () => {
  const a = withFormats(buildSession(deckOf(baseStats()), { now: NOW, size: 5, seed: SEED }), { now: NOW });
  const b = withFormats(buildSession(deckOf(baseStats()), { now: NOW, size: 5, seed: SEED }), { now: NOW });
  eq(a.map((p) => p.item.id + shape(p)).join("|"), b.map((p) => p.item.id + shape(p)).join("|"),
    "same inputs must give the same session, or nothing below is reproducible");
});

// ════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — a production failure, diagnosed, and routed to a repair
// ════════════════════════════════════════════════════════════════════════════════════════
//
// The learner is asked to type かようび and produces かようひ. One character off, and the
// distinction is the whole reason failure classification exists: the word WAS retrieved
// and only the reading slipped. That is not a vocabulary gap and must not be treated as
// one — re-teaching the meaning of a word the learner just demonstrably retrieved is the
// single most annoying thing a study app can do.

console.log("\n=== STAGE 2: failure -> diagnosis -> recovery ===");

const TYPED = "かようひ";                 // び -> ひ: the dakuten dropped
let DIAGNOSIS, PLAN, LADDER;

t("classifyFailure sees a reading fumble, not a vocabulary gap", () => {
  DIAGNOSIS = classifyFailure({
    format: CONTROL_ASK.format,
    expected: ITEMS[0].reading,
    got: TYPED,
  });
  eq(DIAGNOSIS, "reading", "one character off a retrieved word is a reading failure");
  // The contrast that makes the diagnosis load-bearing rather than cosmetic.
  ne(classifyFailure({ format: "type", expected: "かようび", got: "すいようび" }), DIAGNOSIS,
    "a different word entirely must not diagnose the same way");
  eq(classifyFailure({ format: "type", expected: "かようび", got: "" }), "blank",
    "nothing typed is a blank, not a production failure");
});

t("planAfterFailure turns the diagnosis into a concrete next demand", () => {
  PLAN = planAfterFailure(DIAGNOSIS);
  ok(PLAN, "a diagnosed failure must yield a plan");
  eq(PLAN.skill, "production", "the word was there; drill the form, not the meaning");
  lte(PLAN.cue, CONTROL_ASK.cue, "a miss is never a reason to raise the demand");
  gt(CONTROL_ASK.cue, PLAN.cue, "the plan must actually hand support BACK, not sit still");
  // Every diagnosis the classifier can emit has to lead somewhere, or the loop has a hole.
  for (const f of Object.keys(RECOVERY_LADDERS)) {
    ok(FAILURE_PLAN[f], "no plan for diagnosis '" + f + "'");
    ok(buildRecovery(f, { caps: { type: true, listen: true, context: true } }).length > 0,
      "no recovery ladder for diagnosis '" + f + "'");
  }
});

t("buildRecovery yields a ladder that does NOT repeat the activity that failed", () => {
  LADDER = buildRecovery(DIAGNOSIS, {
    failedCue: CONTROL_ASK.cue,
    caps: CAPS_FOR(ITEMS[0]),
  });
  gt(LADDER.length, 1, "a rescue is a staged climb, not a single retry");
  // THE assertion of this stage. The learner just failed `type` at CUE.FREE; meeting the
  // same demand again is a correction, not a rescue.
  ne(LADDER[0].format, CONTROL_ASK.format,
    "the first rescue step must differ in format from the activity that failed");
  eq(LADDER[0].format, "listen",
    "a reading fumble routes through HEARING it — the word was retrieved, the form slipped");
  ok(LADDER[0].note, "the first step must carry a framing note, not just a format");
  // The ladder climbs back to the demand that failed, and never past it.
  for (const s of LADDER) lte(s.cue, CONTROL_ASK.cue, "no rescue step may be harder than the miss");
  eq(LADDER[LADDER.length - 1].cue, CONTROL_ASK.cue, "the last step returns to the original demand");
  eq(LADDER[LADDER.length - 1].last, true, "the ladder must mark its own end");
  for (let i = 1; i < LADDER.length; i++) {
    gt(LADDER[i].cue, LADDER[i - 1].cue, "support must come off monotonically as the ladder climbs");
  }
});

t("the ladder is trimmed by what the item can actually be asked", () => {
  // Same diagnosis, an item with no audio: the listening rung has to go rather than be
  // reserved and then rendered as something else.
  const noAudio = buildRecovery(DIAGNOSIS, { failedCue: CUE.FREE, caps: { type: true, listen: false, context: false } });
  eq(noAudio.some((s) => s.skill === "listening"), false, "a silent item cannot be asked to listen");
  gt(noAudio.length, 0, "trimming must not empty the ladder");
});

// ════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — the evidence, and the estimate moving
// ════════════════════════════════════════════════════════════════════════════════════════
//
// Two separate estimators update off this answer, and they answer different questions.
// profileFrom reads the EVIDENCE LOG (what has this learner been observed doing lately);
// abilityFrom reads the STAT RECORD and returns a Bayesian posterior (how sure are we).
// Both have to move, and both have to move DOWN.

console.log("\n=== STAGE 3: evidence -> posterior / ability ===");

// One answered exercise, recorded exactly as the app records it, then applied to the stat
// record the way JpnFlashcards.applyOutcome does: rolling history, running totals, the
// diagnosis parked on the record, and FSRS advanced for the ability that was tested.
function answer(stats, id, { format, cue, got, ok: correct, ms, now = NOW }) {
  const st = stats[id];
  const item = ITEMS.find((x) => x.id === id);
  const failure = correct ? null : classifyFailure({ format, expected: item.reading, got });
  const skill = skillForFormat(format);
  const prod = skill === "production";
  const key = prod ? "rfsrs" : "fsrs";
  const s0 = (st[key] && st[key].S) || 0;
  const grade = gradeFromLatency(correct, ms, { streak: st.streak || 0 });
  const next = review(st[key] || null, grade, now, 0.9);

  const out = { ...st, [key]: next, last: now, lastFailure: failure };
  if (prod) {
    out.rseen = (st.rseen || 0) + 1;
    out.rcorrect = (st.rcorrect || 0) + (correct ? 1 : 0);
    out.rrecent = pushRecent(st.rrecent, correct);
  } else {
    out.seen = (st.seen || 0) + 1;
    out.correct = (st.correct || 0) + (correct ? 1 : 0);
    out.recent = pushRecent(st.recent, correct);
    out.streak = correct ? (st.streak || 0) + 1 : 0;
  }
  const evidence = makeEvidence({
    id, deck: "vocab", format, skill, cue, ok: correct, ms, failure,
    s0, s1: next.S, at: now,
  });
  return { stats: { ...stats, [id]: out }, evidence, failure, grade };
}

let FAILED_STATS, FAILED_EVIDENCE;
t("the answer is recorded as evidence carrying the diagnosis", () => {
  const r = answer(CONTROL_STATS, TARGET, {
    format: CONTROL_ASK.format, cue: CONTROL_ASK.cue, got: TYPED, ok: false, ms: 7400,
  });
  FAILED_STATS = r.stats;
  FAILED_EVIDENCE = r.evidence;
  eq(r.failure, DIAGNOSIS, "the recorded failure must be the diagnosed one");
  eq(FAILED_EVIDENCE.skill, "production", "a typed answer is evidence about production");
  eq(FAILED_EVIDENCE.cue, CUE.FREE, "the cue the learner actually saw has to survive onto the row");
  eq(FAILED_EVIDENCE.ok, false);
  eq(r.grade, AGAIN, "a wrong answer grades AGAIN whatever the latency");
  ok(FAILED_EVIDENCE.s0 !== null && FAILED_EVIDENCE.s1 !== null,
    "stability either side must be recorded or the row is unscoreable by tools/gain.mjs");
  // FSRS moved, and moved the right way: a lapse loses stability but is not reset to zero.
  gt(FAILED_EVIDENCE.s0, FAILED_EVIDENCE.s1, "a lapse must lose stability");
  gt(FAILED_EVIDENCE.s1, 0, "a forgotten card is not a new card");
});

t("the diagnosis is parked on the stat record, where the next selection can read it", () => {
  // This single field is the wire between diagnosis and re-selection. If it stops being
  // written, stage 4 goes silent — so it is asserted on its own rather than only implied.
  eq(FAILED_STATS[TARGET].lastFailure, "reading");
  eq(CONTROL_STATS[TARGET].lastFailure, undefined, "the control run must carry no failure");
  eq(FAILED_STATS[TARGET].rrecent, "1111111110", "the rolling production history takes the miss");
  ne(FAILED_STATS[TARGET].rrecent, CONTROL_STATS[TARGET].rrecent);
  /* Observation, not a complaint, and deliberately not asserted as a property: session.skillOf
     projects a stat record down to {seen, acc, S, tried} and drops `recent`/`rrecent` on the
     floor. Both predictSuccess and abilityFrom look for `.recent` and treat its absence as
     "no rolling history", so through the buildSession -> chooseIntervention path the recency
     weighting those two were written for never actually engages — the estimate falls only
     because the lifetime totals moved. Everything asserted in this file holds either way;
     it is written down because the next person to wonder why recency seems inert should
     find the answer here rather than rediscover it. */
});

t("profileFrom moves the observed production rate DOWN", () => {
  // A short evidence log of the same exercise going well, then the miss.
  const before = Array.from({ length: 8 }, (_, i) => makeEvidence({
    id: TARGET, deck: "vocab", format: "type", cue: CUE.FREE, ok: true, ms: 5000, at: NOW - (i + 1) * DAY,
  }));
  const after = before.concat([FAILED_EVIDENCE]);
  const p0 = profileFrom(before, { now: NOW }).production;
  const p1 = profileFrom(after, { now: NOW }).production;
  gt(p1.n, p0.n, "the log must actually grow");
  gt(p0.rate, p1.rate, "an observed miss must lower the observed rate");
  // ...and it must not touch an ability this answer says nothing about.
  eq(profileFrom(after, { now: NOW }).listening.n, 0,
    "a typed answer is not evidence about listening");
});

t("abilityFrom moves the production posterior DOWN and widens it", () => {
  const p0 = abilityFrom(skillOf(CONTROL_STATS[TARGET], "rfsrs"));
  const p1 = abilityFrom(skillOf(FAILED_STATS[TARGET], "rfsrs"));
  gt(p0.mean, p1.mean, "the posterior mean must fall after a miss");
  gt(p0.lo, p1.lo, "so must the lower bound of the credible interval");
  gt(p1.width, p0.width, "and a contradicted estimate should be LESS certain, not more");
  // The recognition posterior is untouched: this answer measured production.
  eq(abilityFrom(skillOf(FAILED_STATS[TARGET], "fsrs")).mean,
     abilityFrom(skillOf(CONTROL_STATS[TARGET], "fsrs")).mean,
     "a production miss must not quietly demote recognition");
});

// ════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — the next intervention is provably different
// ════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THE ENGINE ACTUALLY VARIES, today, and therefore what is asserted here. Measured
// against this fixture, the control ask is production / CUE.FREE / "type":
//
//   a) THE CUE. A reading fumble keeps the skill — production is still the right ability
//      to work on — and hands two rungs of support back: CUE.FREE -> CUE.STRONG. This is
//      the central mechanic of the cue ladder and what changes in the commonest case, so
//      it is asserted first.
//   b) THE SKILL AND THE FORMAT. When the diagnosis names a DIFFERENT unlocked ability —
//      a meaning failure, or a blank, routes to recognition — the next ask changes shape
//      entirely: production/CUE.FREE/type becomes recognition/CUE.CHOOSE/mc.
//   c) THE ITEM ORDER. A recognition failure lapses the item's FSRS state (S 60 -> ~6),
//      which raises its `need` score, which moves it to the front of the rebuilt queue.
//
// HONEST LIMIT, worth knowing before trusting (a): for THIS diagnosis, the cue would have
// dropped to CUE.STRONG anyway, because the posterior fell and FSRS lapsed and the ladder
// search re-runs over both. So (a) alone does not prove the diagnosis was read — only
// that something moved. That is why the next test isolates the diagnosis by varying
// nothing else, and does it with a diagnosis that routes to a different SKILL, which the
// posterior can never do on its own.
//
// NOT asserted: that the rebuilt queue contains buildRecovery's stages. session.mjs does
// not consume buildRecovery — only the React layer splices the ladder in today. That is
// MP-08 (#98). When it lands, add an assertion here that the queue rebuilt after a miss
// contains the rescue stages in order, which is a strictly stronger claim than (a)-(c).

console.log("\n=== STAGE 4: the next pick differs from the control run ===");

let FAILED_ASK;
t("(a) the same ability is re-asked with support handed BACK", () => {
  FAILED_ASK = askFor(FAILED_STATS, TARGET);
  ne(shape(FAILED_ASK), shape(CONTROL_ASK),
    "the intervention after a miss is identical to the control — the loop is disconnected");
  eq(FAILED_ASK.skill, "production", "the plan named production and production is unlocked");
  gt(CONTROL_ASK.cue, FAILED_ASK.cue, "the miss must lower the cue, not raise or hold it");
  lte(FAILED_ASK.cue, PLAN.cue, "the next ask must be no harder than the plan asked for");
});

t("the diagnosis, not merely the fact of a miss, is what moves it", () => {
  /* The sharpest test in the file, and the one that catches the exact regression an
     earlier review found by hand: failure classification existing and changing nothing.

     One stat record. One lowered posterior. One rolling history. One lapsed FSRS state.
     The ONLY thing varied is which of the eight diagnoses is attached — and the same
     wrong answer really can be diagnosed two ways, because "かようひ" is a reading fumble
     while an empty box on the identical question is a blank.

     `blind` is the control that makes this bite: the same degraded record with NO
     diagnosis attached. It comes out identical to the reading route, which is exactly why
     stage 4(a) is not sufficient on its own — a lowered posterior moves the cue by itself.
     What a posterior can never do is send the learner to a different ABILITY, so that is
     the difference asserted here. If these three agree, `lastFailure` has stopped being
     read and the eight failure types are decoration. */
  const blind = askFor(FAILED_STATS, TARGET, { lastFailure: null });
  const asBlank = askFor(FAILED_STATS, TARGET, { lastFailure: "blank" });

  ne(shape(asBlank), shape(blind),
    "attaching a diagnosis changed nothing — classifyFailure is decorative");
  ne(shape(asBlank), shape(FAILED_ASK),
    "two different diagnoses of the same miss led to the same next activity");
  // ...and each goes where its own plan says, which is the point of diagnosing at all.
  eq(FAILED_ASK.skill, "production", "the word was retrieved: drill the form");
  eq(asBlank.skill, "recognition", "nothing was retrieved: go back to the meaning");
  ne(asBlank.format, FAILED_ASK.format, "and the learner sees a different exercise");
});

t("(b) a failure naming a different ability changes the SKILL and the FORMAT", () => {
  const missedMeaning = answer(CONTROL_STATS, TARGET, {
    format: "mc", cue: CUE.CHOOSE, got: "", ok: false, ms: 6000,
  });
  eq(missedMeaning.failure, "meaning", "a missed multiple-choice is a meaning failure");
  const ask = askFor(missedMeaning.stats, TARGET);
  eq(ask.skill, "recognition", "nothing to build on until the meaning is back");
  eq(ask.format, "mc", "recognition at the lowest rung renders as multiple choice");
  ne(ask.skill, CONTROL_ASK.skill, "the ability being worked must have changed");
  ne(ask.format, CONTROL_ASK.format, "and so must the exercise the learner sees");
});

t("(c) a lapsed item is more urgent, and the rebuilt queue reorders around it", () => {
  const missedMeaning = answer(CONTROL_STATS, TARGET, {
    format: "mc", cue: CUE.CHOOSE, got: "", ok: false, ms: 6000,
  });
  gt(need(missedMeaning.stats[TARGET], NOW + DAY), need(CONTROL_STATS[TARGET], NOW + DAY),
    "a lapse must raise the item's need score");

  // Rebuild a day later, so the relearning interval has elapsed for both runs alike.
  const at = NOW + DAY;
  const control = withFormats(buildSession(deckOf(CONTROL_STATS), { now: at, size: 5, seed: SEED }), { now: at });
  const after = withFormats(buildSession(deckOf(missedMeaning.stats), { now: at, size: 5, seed: SEED }), { now: at });
  const rank = (s) => s.findIndex((p) => p.item.id === TARGET);
  gt(rank(control), rank(after), "the missed item must rise in the rebuilt queue");
  eq(rank(after), 0, "and a word just lost should lead the next session");
  ne(control.map((p) => p.item.id).join(","), after.map((p) => p.item.id).join(","),
    "the whole session ordering is unchanged — selection is not reading the update");
  // ...and the ask attached to it by the session builder changed too, not just its position.
  const c = control.find((p) => p.item.id === TARGET), a = after.find((p) => p.item.id === TARGET);
  ne(shape(a), shape(c), "buildSession + withFormats must carry the diagnosis through");
});

// ════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — a listening failure routes somewhere else entirely
// ════════════════════════════════════════════════════════════════════════════════════════
//
// The point of eight failure types is that they are not eight labels for the same
// response. Running the identical item through a listening miss must produce a different
// repair from the reading miss above, at every layer that has an opinion.
//
// KNOWN GAP, stated rather than asserted around: chooseIntervention treats listening as a
// REPEAT-only format (`step > 0`), because audio depends on where the learner is and an
// unconstrained listening dimension won nearly every slot in practice. buildSession only
// assigns step > 0 to brand-new items, and a brand-new item returns early at recognition.
// So on a REVIEW pick the listening plan is currently DROPPED, and the engine falls back
// to the generic "a miss hands one rung back":
//
//     control            production / CUE.FREE   / type
//     reading  @ step 0  production / CUE.STRONG / type    (plan honoured)
//     listening@ step 0  production / CUE.PARTIAL/ type    (plan dropped; generic -1 rung)
//     listening@ step 1  listening  / CUE.CHOOSE/ listen   (plan honoured)
//
// The two failure types therefore still route apart at step 0 — which is what is asserted
// there, and it stays true however the gate is later relaxed — while the step >= 1 case
// proves the listening route itself works end to end. The gate is the only thing standing
// between today and a listening rescue on a review item.

console.log("\n=== STAGE 5: a listening failure routes differently ===");

let LISTEN_STATS;
t("a missed listening exercise is diagnosed as listening, whatever was typed", () => {
  const r = answer(CONTROL_STATS, TARGET, {
    format: "listen", cue: CUE.FREE, got: TYPED, ok: false, ms: 8100,
  });
  LISTEN_STATS = r.stats;
  eq(r.failure, "listening", "the format settles it — a missed audio prompt is a listening miss");
  ne(r.failure, DIAGNOSIS, "the same input text must not diagnose the same way in another format");
  eq(r.evidence.skill, "listening", "and the evidence is filed against listening, not production");
});

t("the plan and the rescue ladder both differ from the reading failure's", () => {
  const plan = planAfterFailure("listening");
  ne(plan.skill, PLAN.skill, "a listening miss must not be repaired as a production miss");
  eq(plan.skill, "listening", "hear it again, with options");

  const ladder = buildRecovery("listening", { failedCue: CUE.FREE, caps: CAPS_FOR(ITEMS[0]) });
  ne(ladder.map((s) => s.skill + ":" + s.cue).join(">"),
     LADDER.map((s) => s.skill + ":" + s.cue).join(">"),
     "two failure types produced the same rescue ladder — routing is a no-op");
  eq(ladder.every((s) => s.skill === "listening"), true,
    "a listening problem is repaired by listening, not by a detour through typing");
  // The format matches the failed activity here BY DESIGN — you fix hearing by hearing —
  // so what must differ is the demand, and it does: options first, then cold.
  lte(ladder[0].cue, CUE.CHOOSE, "the rescue starts below what just beat the learner");
  gt(CUE.FREE, ladder[0].cue, "support is handed back even when the format stays put");
});

t("the two failure types produce different next activities on a review pick", () => {
  const fromListening = askFor(LISTEN_STATS, TARGET);
  ne(shape(fromListening), shape(FAILED_ASK),
    "a listening miss and a reading miss led to the same next activity — the engine is not routing by failure type");
  ne(shape(fromListening), shape(CONTROL_ASK), "and neither may match the no-failure control");
});

t("the listening route itself works once the item is eligible for it", () => {
  // step >= 1 is the gate described above. With it satisfied, the listening plan is
  // honoured end to end: skill, direction and rendered format all follow the diagnosis.
  const ask = askFor(LISTEN_STATS, TARGET, { step: 1 });
  eq(ask.skill, "listening", "the listening plan must be honoured when listening is unlocked");
  eq(ask.format, "listen");
  eq(ask.direction, "audio_to_meaning");
  ne(ask.skill, askFor(FAILED_STATS, TARGET, { step: 1 }).skill,
    "and it must still differ from where the reading failure routes at the same step");
});

// ════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — the loop, once around, as one run
// ════════════════════════════════════════════════════════════════════════════════════════
//
// Everything above tests one seam at a time. This drives all of them in sequence, the way
// a real session does, and asserts only the design doc's own requirement: after the loop
// has turned, the next activity is not the one that was already being asked.

console.log("\n=== STAGE 6: one full turn of the loop ===");

t("select -> ask -> fail -> diagnose -> record -> re-estimate -> re-select changes the ask", () => {
  let stats = baseStats();
  const at = NOW;

  // 1. SELECT + ASK
  const first = withFormats(buildSession(deckOf(stats), { now: at, size: 5, seed: SEED }), { now: at })
    .find((p) => p.item.id === TARGET);
  ok(first, "the target must be in the seeded session at all");
  const asked = shape(first);

  // 2-5. ANSWER wrong, DIAGNOSE, RECORD (evidence + stat record + FSRS)
  const r = answer(stats, TARGET, {
    format: first.format, cue: first.cue, got: TYPED, ok: false, ms: 7000,
  });
  stats = r.stats;
  ok(r.failure, "the miss must be diagnosed into one of the eight kinds");

  // 6. RE-ESTIMATE — asserted as a real move, not just a recomputation
  const post = abilityFrom(skillOf(stats[TARGET], r.evidence.skill === "production" ? "rfsrs" : "fsrs"));
  const post0 = abilityFrom(skillOf(baseStats()[TARGET], r.evidence.skill === "production" ? "rfsrs" : "fsrs"));
  gt(post0.mean, post.mean, "the learner model must have moved");

  // 7. RE-SELECT + RE-ASK
  const second = withFormats(buildSession(deckOf(stats), { now: at, size: 5, seed: SEED }), { now: at })
    .find((p) => p.item.id === TARGET);
  ok(second, "the missed item must still be in the rebuilt session");
  ne(shape(second), asked,
    "the next activity is identical to the one that just failed — spec §43 is not satisfied");

  // And the repair is available to whoever renders it (MP-08 will splice these in).
  const rescue = buildRecovery(r.failure, { failedCue: first.cue, caps: CAPS_FOR(ITEMS[0]) });
  gt(rescue.length, 0, "a diagnosed miss must always offer a way back");
  lte(rescue[0].cue, first.cue, "which starts no harder than the demand that failed");
});

console.log(fail ? "\n" + fail + "/" + run + " FAILED" : "\nall " + run + " adaptive-loop tests passed");
process.exit(fail ? 1 : 0);
