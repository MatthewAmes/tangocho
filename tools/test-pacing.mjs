// Tests for the pacing seam (tools/pacing.mjs) — presets, the stop OFFER, and the easing
// bias that a declined offer buys.
//
//   node tools/test-pacing.mjs
//
// fatigue.mjs has its own tests for the MODEL. What is checked here is the WIRING: that a
// live session's own evidence stream reaches shouldStop with the right shape, that the two
// reasons this file adds (the clock, the fading gain rate) fire when they should and stay
// quiet when they should not, and that the answer is always an offer rather than an end.
import { stopOffer, easedTarget, PACING, PACE_NOTE, PACES, paceMinutes } from "./pacing.mjs";
import { STOP } from "./fatigue.mjs";
import { budgetFor, DEFAULTS } from "./session.mjs";
import { TARGET_SUCCESS } from "./learner.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "") + " expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); };
const gt = (a, b, m) => { if (!(a > b)) throw new Error((m || "") + " expected " + a + " > " + b); };

const FAST = 1500;
const ev = (ok, ms) => ({ ok, ms, fastMs: FAST });
const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

/* A session that started honestly and then fell apart: twelve real retrievals at the
   scheduler's own success rate, followed by a tail of fast wrong answers — the shape of
   someone who has stopped retrieving and started tapping to clear the card. */
const rapidGuessTail = [...many(12, (i) => ev(i % 4 !== 0, 6500)), ...many(8, () => ev(false, 500))];
/* The confound, and the whole reason this is not a latency threshold: a genuinely hard
   stretch. Slow, often wrong, and exactly what desirable difficulty looks like working. */
const honestStretch = many(20, (i) => ev(i % 3 !== 0, 9000));

console.log("=== the acceptance case: a guessing tail stops, an honest stretch does not ===");
t("a rapid-guessing tail trips the offer, and names fatigue", () => {
  const r = stopOffer({ events: rapidGuessTail, planned: 40 });
  eq(r.offer, true, "the tail should have been noticed");
  eq(r.reason, "fatigue");
  gt(r.note.length, 12, "a reason with nothing to say is not a reason");
});
t("a hard-but-honest stretch is left alone", () => {
  const r = stopOffer({ events: honestStretch, planned: 40 });
  eq(r.offer, false, "effortful retrieval was read as fatigue: " + JSON.stringify(r.fatigue.reasons));
});
t("the fatigue estimate comes back either way — the caller logs it regardless", () => {
  gt(stopOffer({ events: rapidGuessTail, planned: 40 }).fatigue.level,
     stopOffer({ events: honestStretch, planned: 40 }).fatigue.level);
});

console.log("\n=== nothing is offered before there is a session to end ===");
t("a session shorter than STOP.minItems is never nudged, however bad it looks", () => {
  const r = stopOffer({ events: many(STOP.minItems - 1, () => ev(false, 300)), planned: 40,
                        elapsedMs: 60 * 60000, plannedMinutes: 5 });
  eq(r.offer, false);
});
t("...and the clock alone cannot get past that floor either", () => {
  eq(stopOffer({ events: many(3, () => ev(true, 2000)), plannedMinutes: 5,
                 elapsedMs: 60 * 60000 }).offer, false);
});

console.log("\n=== the clock ===");
t("time spent is offered once the pace has run past its overrun allowance", () => {
  const events = many(12, () => ev(true, 3000));
  const spent = 10 * 60000 * PACING.overrun + 1;
  eq(stopOffer({ events, planned: 40, plannedMinutes: 10, elapsedMs: spent }).reason, "time");
});
t("a session inside its allowance is not interrupted", () => {
  const events = many(12, () => ev(true, 3000));
  eq(stopOffer({ events, planned: 40, plannedMinutes: 10, elapsedMs: 10 * 60000 }).offer, false,
     "the requested minutes are a target, not a fence");
});
t("no planned length means no clock — a section drill is not paced", () => {
  eq(stopOffer({ events: many(12, () => ev(true, 3000)), planned: 40,
                 elapsedMs: 99 * 60000 }).offer, false);
});

console.log("\n=== learning value: the rate that fell off ===");
/* gain.mjs scores a row from the stability either side of the answer, in doublings. These
   rows are shaped for it directly rather than by running a session: the point under test
   is that a faded rate reaches the offer, not that FSRS computes what it computes. */
const gainRow = (i, s0, s1) => ({ at: 1000 + i * 20000, ms: 4000, s0, s1 });
t("a session whose gain per minute collapsed is offered the stop", () => {
  // three full buckets: two productive, then one that earned almost nothing
  const rows = [...many(10, (i) => gainRow(i, 1, 4)), ...many(5, (i) => gainRow(10 + i, 10, 10.02))];
  const r = stopOffer({ events: many(15, () => ev(true, 3500)), planned: 40, gainRows: rows });
  eq(r.reason, "fade");
});
t("a session still earning is not offered the stop", () => {
  const rows = many(15, (i) => gainRow(i, 1, 4));
  eq(stopOffer({ events: many(15, () => ev(true, 3500)), planned: 40, gainRows: rows }).offer, false);
});
t("too little of a session to say anything says nothing", () => {
  const rows = many(7, (i) => gainRow(i, 1, 4));
  eq(stopOffer({ events: many(7, () => ev(true, 3500)), planned: 40, gainRows: rows }).offer, false);
});

console.log("\n=== a declined offer goes quiet, it does not nag ===");
t("snoozing suppresses the nudge without suppressing the estimate", () => {
  const r = stopOffer({ events: rapidGuessTail, planned: 40,
                        snoozedUntil: rapidGuessTail.length + PACING.snooze });
  eq(r.offer, false, "the learner said keep going");
  gt(r.fatigue.level, 0, "...but the session still knows they are tired");
});
t("...and it comes back once the snooze is served", () => {
  const events = [...rapidGuessTail, ...many(PACING.snooze, () => ev(false, 400))];
  eq(stopOffer({ events, planned: 40, snoozedUntil: rapidGuessTail.length + PACING.snooze }).offer, true);
});

console.log("\n=== the queue running out is not a nudge ===");
t("reaching the planned count ends the session on its own rather than offering to", () => {
  // shouldStop calls this "done"; there is nothing to nudge someone towards.
  eq(stopOffer({ events: many(20, () => ev(true, 3000)), planned: 20 }).offer, false);
});
t("nothing left worth practising IS offered — that one is news", () => {
  eq(stopOffer({ events: many(12, () => ev(true, 3000)), planned: 40,
                 remainingValue: 0.05 }).reason, "nothing-left");
});

console.log("\n=== the easing bias (spec §38: simplify, shorten, provide a success) ===");
t("an unfatigued session aims at the ordinary target", () => {
  eq(easedTarget(0), TARGET_SUCCESS);
  eq(easedTarget({ level: 0.1 }), TARGET_SUCCESS);
});
t("a fatigued one aims higher, which buys a lower cue and a shorter question", () => {
  gt(easedTarget(PACING.easeAt), TARGET_SUCCESS);
  eq(easedTarget({ level: 0.9 }), PACING.easedTarget);
});
t("support arrives BEFORE the offer to stop, not after it", () => {
  // easing at the stop threshold would mean the only learner who gets an easier question
  // is one who has already been asked to quit.
  if (!(PACING.easeAt < STOP.fatigueStop)) throw new Error("easeAt must sit below fatigueStop");
});
t("the bias never makes a question HARDER than the caller asked for", () => {
  eq(easedTarget(0.9, 0.95), 0.95);
});

console.log("\n=== every reason has something true, and kind, to say ===");
t("copy exists for all of them and none of it scolds", () => {
  for (const reason of ["done", "fatigue", "nothing-left", "time", "fade"]) {
    const note = PACE_NOTE[reason];
    if (!note || note.length < 12) throw new Error("no copy for " + reason);
    if (/tired|lazy|failed|wrong|quit/i.test(note)) throw new Error("stop copy should not scold: " + note);
  }
});

console.log("\n=== the presets change the size of the session ===");
t("three paces, ascending, and an unknown one falls back to the default", () => {
  eq(PACES.length, 3);
  eq(paceMinutes("short") < paceMinutes("normal") && paceMinutes("normal") < paceMinutes("deep"), true);
  eq(paceMinutes(undefined), DEFAULTS.minutes, "an unset pace must build the session it always did");
  eq(paceMinutes("nonsense"), DEFAULTS.minutes);
});
t("each preset plans a strictly bigger session than the one below it", () => {
  // one deck, no latency history, so the only thing moving is the requested minutes
  const sources = [{ deck: "vocab", items: many(200, (i) => ({ id: "v" + i })), stats: {} }];
  const size = (pace) => budgetFor(sources, { minutes: paceMinutes(pace) });
  gt(size("normal"), size("short"));
  gt(size("deep"), size("normal"));
});
t("the preset is the only knob — new-item intake stays capped", () => {
  // encoding cost does not get cheaper because there is more time; see the note in pacing.mjs
  eq(DEFAULTS.maxNew, 6);
});

console.log(fail ? "\n" + fail + " of " + run + " FAILED" : "\nall " + run + " pacing tests passed");
process.exit(fail ? 1 : 0);
