/* ── daily micro-missions ──
   Two or three small goals a day, generated from the learner model and the curriculum
   rather than from a list of things an app would like you to do (spec §§34–35). The
   difference matters: "answer 20 cards" is grinding, and "get five different Act 6 words
   right" is a piece of the book.

   Everything here is data in, data out — no storage, no clock of its own (pass `dayKey`),
   no React. The app holds one day-keyed record and re-derives progress from the evidence
   log on every render, so a mission cannot drift out of step with what was actually
   answered: there is no second counter to go wrong.

   ## The rule this file exists to enforce

   A MISSION MUST BE COMPLETABLE FROM THE STATE THAT GENERATED IT. Handing someone
   "recover 2 mistakes" when they have never missed anything is not a goal, it is a chore
   with no door: they would have to fail on purpose to clear it. So every kind carries a
   `satisfiable` predicate over the same state the label is built from, generateMissions
   offers nothing that fails it, and the built mission is checked a second time before it
   is returned — the two can only agree if the reasoning is the same in both places.

   Satisfiability is judged from RECENT HISTORY, because that is the only evidence about
   today that exists before today happens. The window is deliberately short: the question
   is not "has this learner ever missed a word" but "is this the kind of study session
   they are having this fortnight".

   ## No new currency

   Completion pays out through the score the app already has (SCORE in learner.mjs). The
   roadmap rejected gems, a shop and anything else that has to be spent somewhere; a
   mission is a reason to open the app, not a second economy. MISSION_BONUS is the whole
   of it. */

import { CUE, MEMORY_CHECK_DAYS, latencyNorms, latencyVerdict } from "./learner.mjs";
import { provenanceOf } from "./curriculum.mjs";
import { localDayKey } from "./days.mjs";

/* How many missions a day. Three is the spec's upper bound and also about the most that
   can sit on a phone home screen without becoming a to-do list. Fewer is fine and normal:
   a learner two days into the app has almost nothing that is honestly satisfiable yet. */
export const MISSION_COUNT = 3;

/* How far back satisfiability looks. Two weeks is long enough to survive a couple of days
   off and short enough that a habit abandoned in March does not vouch for today. */
export const MISSION_WINDOW_DAYS = 14;

/* Points for clearing one, paid through the existing XP path. Sized against SCORE: a bit
   more than a good single answer (10 + cue bonus), well under a session. It is a nod,
   not a payday — the mission's value is that it gave the session a shape. */
export const MISSION_BONUS = 25;

/* Everything a predicate could want, computed once. `actOf` is the join to the textbook;
   `norms` is this learner's own per-skill-and-format latency distribution, which is what
   makes "fast" mean anything (see latencyNorms). */
export function missionContext(state = {}) {
  const cards = state.cards || [];
  const evidence = state.evidence || [];
  const actOfId = new Map();
  for (const card of cards) {
    if (!card || card.id == null) continue;
    const { act } = provenanceOf(card, state.provenanceOpts || {});
    if (act !== null) actOfId.set(card.id, act);
  }
  return {
    actOf: (id) => (actOfId.has(id) ? actOfId.get(id) : null),
    norms: state.norms || latencyNorms(evidence),
  };
}

/** The evidence rows that belong to one local calendar day. Local rather than UTC for the
 *  same reason the streak is (days.mjs): an evening review must not land on tomorrow. */
export function rowsForDay(evidence = [], dayKey) {
  const key = dayKey || localDayKey();
  return (evidence || []).filter((e) => e && e.at && localDayKey(new Date(e.at)) === key);
}

/* Rows inside the satisfiability window, ending at `now`. */
function recentRows(state) {
  const now = state.now || Date.now();
  const cutoff = now - MISSION_WINDOW_DAYS * 86400000;
  return (state.evidence || []).filter((e) => e && (e.at || 0) >= cutoff);
}

/* A completed rescue, read straight off the tag recovery.mjs writes: "production:2/3" is
   the second rung of a three-rung ladder, so the LAST rung is the one where stage meets
   total. That beat is the repair landing — the earlier rungs are the climb, and paying for
   them would pay for missing the question in the first place. */
const TAG = /^([a-z]+):(\d+)\/(\d+)$/;
export function isRecoveryLanded(row) {
  if (!row || !row.ok || typeof row.recovery !== "string") return false;
  const m = TAG.exec(row.recovery);
  return !!m && m[2] === m[3];
}

/* Distinct items among the rows that pass `pred`. Distinct rather than a raw count so no
   mission can be cleared by answering one easy card five times — which is precisely the
   grinding the whole game layer is supposed to stop rewarding. */
function distinct(rows, pred) {
  const ids = new Set();
  for (const row of rows || []) if (row && pred(row)) ids.add(row.id);
  return ids.size;
}

/* Clamp a mission size to what the state can actually support, and refuse below `floor` —
   a one-word mission is not a mission, it is the next card. */
function sizeFor(want, available, floor) {
  const n = Math.min(want, available);
  return n >= floor ? n : 0;
}

/* ── the catalogue ──
   Each kind states, in one place: when it may be offered, what it says, and what counts
   as doing it. Keeping the three together is the point — a predicate that drifts from its
   label is a mission that lies about what it wants.

   `count` always reads the evidence log, never a tally the UI kept. */
export const MISSION_KINDS = [
  {
    kind: "act-words",
    /* The curriculum quest, and the reason this file imports the curriculum at all. It is
       NOT called "master": mastery in this app means a posterior (mastery.mjs), and
       spending that word on five right answers would make the dashboard's careful
       distinction between reaching an act and being able to do it meaningless. */
    build(state) {
      const act = state.act;
      if (!Number.isFinite(act)) return null;
      const ctx = state.ctx;
      let inAct = 0;
      for (const card of state.cards || []) if (card && ctx.actOf(card.id) === act) inAct++;
      const need = sizeFor(5, inAct, 3);
      if (!need) return null;
      return {
        kind: "act-words", act, need,
        label: "Act " + act + " · " + need + " words right",
        note: need + " different Act " + act + " words, answered correctly.",
      };
    },
    count(rows, mission, ctx) {
      return distinct(rows, (r) => r.ok && ctx.actOf(r.id) === mission.act);
    },
  },
  {
    kind: "recover",
    /* The one the issue names as the satisfiability trap. A learner with a clean fortnight
       has nothing to recover and is offered something else instead. */
    build(state) {
      const missed = distinct(recentRows(state), (r) => !r.ok);
      const need = sizeFor(2, missed, 1);
      if (!need) return null;
      return {
        kind: "recover", need,
        label: "Recover " + need + " mistake" + (need === 1 ? "" : "s"),
        note: "Miss one, then land the last step of its rescue.",
      };
    },
    count(rows) { return distinct(rows, isRecoveryLanded); },
  },
  {
    kind: "cue-free",
    /* Retrieval with the scaffolding taken away — the signal the score already pays the
       most for per answer, surfaced as something to aim at. Offered only once the app has
       actually been ASKING at that rung: cueFor only reaches CUE.FREE on items that are
       already strong, so a learner it has never asked cannot go and do three of them. */
    build(state) {
      const asked = distinct(recentRows(state), (r) => (r.cue || 0) >= CUE.FREE);
      const need = sizeFor(3, asked, 2);
      if (!need) return null;
      return {
        kind: "cue-free", need,
        label: need + " recalls with no hints",
        note: "No letters given — the whole word, from memory.",
      };
    },
    count(rows) { return distinct(rows, (r) => r.ok && (r.cue || 0) >= CUE.FREE); },
  },
  {
    kind: "listening",
    /* Gated on listening evidence rather than on the deck, because whether audio reaches
       this learner is a fact about their device and their network, not about the cards.
       Two rows in the window, because the mission asks for two: one lucky answer in a
       fortnight is not evidence that a second is available today. */
    build(state) {
      const heard = recentRows(state).filter((r) => r.skill === "listening").length;
      if (heard < 2) return null;
      const need = Math.min(4, Math.max(2, Math.round(heard / 4)));
      return {
        kind: "listening", need,
        label: need + " listening questions",
        note: "Answer them from the sound, not the page.",
      };
    },
    count(rows) { return distinct(rows, (r) => r.ok && r.skill === "listening"); },
  },
  {
    kind: "speed",
    /* Beat your own clock, which needs a clock: latencyNorms refuses to publish a bucket
       under eight timed correct answers, so an empty norms table means the app has no
       opinion about how fast this person is and must not set a target off one. */
    build(state) {
      const buckets = Object.keys(state.ctx.norms || {}).length;
      if (buckets < 1) return null;
      return {
        kind: "speed", need: 2,
        label: "2 answers under your own time",
        note: "Faster than your usual for that kind of question.",
      };
    },
    count(rows, mission, ctx) {
      return distinct(rows, (r) => r.ok && latencyVerdict(r.ms, r.skill, r.format, ctx.norms) === "fast");
    },
  },
  {
    kind: "memory-check",
    /* The spacing payoff as a goal. Satisfiability here is unusually concrete and
       unusually important: the mission is only completable if a long-stability card is
       ACTUALLY DUE today. Offering it on a day when the scheduler has nothing old to
       serve would be asking the learner to do something the app will not let them do. */
    build(state) {
      const now = state.now || Date.now();
      const horizon = now + 86400000;
      const ready = (state.cards || []).filter((c) => {
        const f = c && c.fsrs;
        return f && (f.S || 0) >= MEMORY_CHECK_DAYS && (f.due || 0) <= horizon;
      }).length;
      if (ready < 1) return null;
      return {
        kind: "memory-check", need: 1,
        label: "Pass a memory check",
        note: "Something untouched for " + MEMORY_CHECK_DAYS + "+ days, still there.",
      };
    },
    count(rows) { return distinct(rows, (r) => r.ok && (r.s0 || 0) >= MEMORY_CHECK_DAYS); },
  },
];

const KIND = new Map(MISSION_KINDS.map((k) => [k.kind, k]));

/** Could this mission be finished from this state? The same question generateMissions asks
 *  before offering one, exported so a caller — or a test — can ask it of a mission that was
 *  stored yesterday and is being reconsidered today. */
export function isSatisfiable(mission, state) {
  if (!mission) return false;
  const spec = KIND.get(mission.kind);
  if (!spec) return false;
  const built = spec.build(withContext(state));
  /* Satisfiable at a SIZE: yesterday's "recover 3" is not satisfiable today just because
     "recover 1" would be. The stored mission keeps its own bar and has to clear it. */
  return !!built && built.need >= mission.need;
}

function withContext(state = {}) {
  return state.ctx ? state : { ...state, ctx: missionContext(state) };
}

/* Deterministic rotation seed. The day key IS the randomness: the same day always yields
   the same missions, so a reload does not reshuffle a half-finished board, and consecutive
   days do not. Nothing here randomises pedagogy — every candidate in the pool has already
   been judged satisfiable and worth doing; this only decides the order of the tie. */
function daySeed(dayKey) {
  let h = 0;
  for (const ch of String(dayKey || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Two or three missions for one day.
 *
 *  @param state { evidence, cards, act, dayKey, now }
 *  @param n     how many to aim for (fewer come back when little is satisfiable)
 *
 *  The curriculum mission is pinned when it is available, because an act to work on is the
 *  thing that makes these quests rather than chores; the rest rotate on the day.
 */
export function generateMissions(state = {}, n = MISSION_COUNT) {
  const ready = withContext(state);
  const built = [];
  for (const spec of MISSION_KINDS) {
    const mission = spec.build(ready);
    if (!mission) continue;
    /* The second gate. build() and isSatisfiable() reach the same conclusion by the same
       route, so this can only fire if a kind's two halves have been edited apart — which
       is exactly the bug worth crashing a test over rather than shipping. */
    if (!isSatisfiable(mission, ready)) continue;
    built.push({ ...mission, id: mission.kind + ":" + (mission.act == null ? "" : mission.act + ":") + mission.need });
  }
  if (built.length === 0) return [];

  const pinned = built.filter((m) => m.kind === "act-words");
  const rest = built.filter((m) => m.kind !== "act-words");
  const start = rest.length ? daySeed(ready.dayKey) % rest.length : 0;
  const rotated = rest.map((_, i) => rest[(start + i) % rest.length]);
  return [...pinned, ...rotated].slice(0, Math.max(1, n));
}

/** Where one mission stands, recomputed from the evidence log. Never stored: a counter
 *  that is written down can disagree with the rows it was counted from, and the rows are
 *  the thing that actually happened. */
export function missionProgress(mission, rows, ctx) {
  const spec = mission && KIND.get(mission.kind);
  if (!spec) return { done: 0, need: 0, complete: false, pct: 0 };
  const need = Math.max(1, mission.need || 1);
  const done = Math.min(need, spec.count(rows || [], mission, ctx));
  return { done, need, complete: done >= need, pct: done / need };
}

/** Every mission with its progress attached, for the chips. */
export function evaluateMissions(missions = [], rows = [], ctx) {
  return (missions || []).map((m) => ({ ...m, ...missionProgress(m, rows, ctx) }));
}

/** The daily roll.
 *
 *  Returns the record to persist: { day, missions, awarded }. Within a day this is a
 *  no-op, which is what makes the board stable while it is being worked on. On a new day
 *  it regenerates — and `awarded` resets with it, because yesterday's payout has been paid.
 *
 *  A stored board whose missions are no longer satisfiable is NOT rebuilt mid-day. That
 *  reads as a bug and is the opposite: finishing "recover 2 mistakes" makes the state that
 *  justified it go away, and rerolling on that would delete the mission at the exact moment
 *  it was completed.
 */
export function rollMissions(stored, state = {}, n = MISSION_COUNT) {
  const day = state.dayKey || localDayKey();
  if (stored && stored.day === day && Array.isArray(stored.missions)) {
    return { day, missions: stored.missions, awarded: stored.awarded || [], rerolled: false };
  }
  return { day, missions: generateMissions({ ...state, dayKey: day }, n), awarded: [], rerolled: true };
}
