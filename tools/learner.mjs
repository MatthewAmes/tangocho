/* ── the learner model ──
   The engine below this file answers "which item, and when". This file answers the
   question the reviews kept pointing at: *what can this person actually do with the word*,
   and therefore what is worth doing in the next fifteen seconds.

   A word is not one memory. 火曜日 can be recognised on sight, read aloud, understood in
   speech, produced from English, spelled correctly, and used in a sentence — and those
   sit at different strengths in the same person on the same day. Recording only
   "right/wrong on a card" throws that distinction away, which is why an app can insist
   you have mastered a word you cannot say.

   Nothing here replaces FSRS. FSRS stays responsible for *memory scheduling*; it is
   simply no longer asked to define what the learner knows across modalities. */

export const SKILLS = ["recognition", "production", "listening", "orthography", "context"];

export const SKILL_LABEL = {
  recognition: "Recognition",
  production: "Production",
  listening: "Listening",
  orthography: "Writing",
  context: "Context",
};

/* Which ability an exercise actually produces evidence about. This is the join between
   the presentation layer and the model: get it wrong and the profile confidently reports
   a skill the learner has never been tested on. */
export function skillForFormat(format) {
  switch (format) {
    case "mc":
    case "recall": return "recognition";
    case "type": return "production";
    case "listen": return "listening";
    case "cloze": return "context";
    default: return null;                  // "learn" is exposure, not evidence
  }
}

/* ── cue strength ──
   The reviews both argued the same thing: multiple-choice / recall / typing is not three
   exercise types, it is one retrieval with three amounts of help, and the help should
   move continuously rather than jumping between named formats.

     0  shown              Tuesday → 火曜日            (no retrieval; first contact)
     1  choose             pick it from four
     2  strong cue         Tuesday → か＿＿び
     3  partial cue        Tuesday → かよう＿＿
     4  free               Tuesday → ＿＿＿＿
     5  contextual         "What day is tomorrow?" → produce it in a sentence

   Support goes DOWN as the ability strengthens and back UP after a failure. That is the
   whole mechanic: keep retrieval effortful but successful. */
export const CUE = { SHOWN: 0, CHOOSE: 1, STRONG: 2, PARTIAL: 3, FREE: 4, CONTEXT: 5 };

export function cueFor(skill, opts = {}) {
  const { tried = false, acc = 0, S = 0, lastFailed = false } = skill || {};
  if (!tried) return CUE.STRONG;                     // first production attempt gets help
  if (lastFailed) return CUE.STRONG;                 // a miss earns support back
  if (acc < 0.5 || S < 2) return CUE.STRONG;
  if (acc < 0.75 || S < 8) return CUE.PARTIAL;
  if (S < (opts.contextAt || 40)) return CUE.FREE;
  return opts.allowContext ? CUE.CONTEXT : CUE.FREE;
}

/* Reveal the first `keep` characters and mask the rest. Masking by CHARACTER rather than
   by mora is deliberate: the learner is being asked to produce kana, and the number of
   blanks is itself part of the cue. */
export function maskReading(reading, keep) {
  const s = String(reading || "");
  if (keep >= s.length) return s;
  return s.slice(0, Math.max(0, keep)) + "＿".repeat(s.length - Math.max(0, keep));
}

export function cueHint(reading, cue) {
  const s = String(reading || "");
  if (!s) return "";
  switch (cue) {
    case CUE.SHOWN: return s;
    case CUE.STRONG: return maskReading(s, 1);
    case CUE.PARTIAL: return maskReading(s, Math.max(1, Math.ceil(s.length / 2)));
    default: return maskReading(s, 0);
  }
}

/* ── failure classification ──
   "Wrong" is the least useful thing an app can record. Someone who reads 火曜日, knows it
   means Tuesday, and cannot dredge up かようび has a reading-retrieval problem, not a
   vocabulary problem, and the next intervention should differ. */
export const FAILURES = ["meaning", "reading", "listening", "production", "orthography", "context", "blank"];

export function editDistance(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

export function classifyFailure({ format, expected = "", got = "" } = {}) {
  const e = String(expected), g = String(got);
  if (format === "listen") return "listening";
  if (format === "mc" || format === "recall") return "meaning";
  if (format === "cloze") return "context";
  if (format === "type") {
    if (!g.trim()) return "blank";                   // nothing retrieved at all
    const d = editDistance(e, g);
    // Close enough that the word was clearly retrieved and the reading fumbled.
    if (e.length && d <= Math.max(1, Math.floor(e.length / 3))) return "reading";
    return "production";
  }
  return "meaning";
}

/* ── evidence ──
   One record per answered exercise. Deliberately small and flat: this is the log the
   reviews want the eventual calibration and expected-gain work to learn from, and a log
   nobody can afford to keep is a log that does not exist. */
export function makeEvidence({ id, deck, format, skill, cue, ok, ms, failure, predicted, at }) {
  return {
    id, deck, format,
    skill: skill || skillForFormat(format),
    cue: cue == null ? null : cue,
    ok: !!ok,
    ms: ms > 0 ? Math.round(ms) : 0,
    failure: ok ? null : (failure || null),
    // What the model expected. Kept so calibration can later be measured rather than
    // assumed — "predicted 80%, actually 52%" is the only way to learn the model is wrong.
    predicted: typeof predicted === "number" ? Math.round(predicted * 100) / 100 : null,
    at: at || Date.now(),
  };
}

/* ── the profile ──
   Per-skill estimates, and — the part most apps get wrong — an honest confidence. A
   number computed from four answers is not a measurement, and presenting it as one is
   how learners end up told they are "72% fluent". */
export const CONFIDENCE = { NONE: "no evidence", LOW: "still evaluating", OK: "likely", GOOD: "strong evidence" };

export function confidenceFor(n) {
  if (n <= 0) return CONFIDENCE.NONE;
  if (n < 8) return CONFIDENCE.LOW;
  if (n < 25) return CONFIDENCE.OK;
  return CONFIDENCE.GOOD;
}

export function profileFrom(evidence = [], opts = {}) {
  const windowMs = (opts.days || 60) * 86400000;
  const now = opts.now || Date.now();
  const out = {};
  for (const s of SKILLS) out[s] = { n: 0, ok: 0, rate: null, confidence: CONFIDENCE.NONE };
  for (const e of evidence) {
    if (!e || !e.skill || !(e.skill in out)) continue;
    if (now - (e.at || 0) > windowMs) continue;
    const row = out[e.skill];
    row.n += 1;
    if (e.ok) row.ok += 1;
  }
  for (const s of SKILLS) {
    const row = out[s];
    row.rate = row.n ? row.ok / row.n : null;
    row.confidence = confidenceFor(row.n);
  }
  return out;
}

/* The single most useful sentence the app can say: which ability is furthest behind, and
   only when there is enough evidence to say it without lying. */
export function biggestGap(profile, opts = {}) {
  const min = opts.minEvidence || 8;
  const scored = SKILLS
    .map((s) => ({ skill: s, ...profile[s] }))
    .filter((r) => r.n >= min && r.rate != null);
  if (scored.length < 2) return null;
  scored.sort((a, b) => a.rate - b.rate);
  const worst = scored[0], best = scored[scored.length - 1];
  if (best.rate - worst.rate < 0.12) return null;      // no meaningful spread; say nothing
  return { skill: worst.skill, rate: worst.rate, ahead: best.skill, spread: best.rate - worst.rate };
}

/* ── why am I seeing this ──
   Plain language, no scheduler vocabulary. The reviews are right that this builds trust,
   and right that it makes the algorithm debuggable — but the real test is that it must
   never be able to say something the model does not actually know. */
export function explainPick(pick, opts = {}) {
  if (!pick) return "";
  const fmt = pick.format || opts.format;
  const rec = pick.recognition || {};
  const prod = pick.production || {};

  if (pick.fresh) return "This is new — you're meeting it for the first time today.";
  if (pick.staleReason === "annual_check") {
    return "You haven't seen this in a long time. It should still be solid, so this is a quick check rather than a full review.";
  }
  if (pick.staleReason === "decay") {
    return "This one is fading — it's slipped below where it should be, so it's worth rescuing now.";
  }
  if (fmt === "type" && rec.S >= (opts.typeAtStability || 14) && (!prod.tried || prod.acc < 0.6)) {
    return "You recognise this reliably but haven't shown you can produce it. This is testing active recall.";
  }
  if (fmt === "listen") return "You know this in writing. This checks whether you catch it by ear.";
  if (fmt === "mc") return "This one has been shaky, so it comes with options rather than cold recall.";
  if (fmt === "cloze") return "You know the word on its own. This checks whether you can use it.";
  return "This is due for review — it's around the point where it starts to fade.";
}

/* ── end of session ──
   What actually improved, phrased so it cannot overclaim. "14 items strengthened" is a
   count the app can defend; "you mastered 14 words" is not. */
export function summarise(evidence = []) {
  const bySkill = {};
  let ok = 0, n = 0, fresh = 0;
  const failures = {};
  const items = new Set();
  for (const e of evidence) {
    if (!e) continue;
    n += 1;
    if (e.ok) ok += 1;
    items.add(e.deck + ":" + e.id);
    if (e.skill) {
      bySkill[e.skill] = bySkill[e.skill] || { n: 0, ok: 0 };
      bySkill[e.skill].n += 1;
      if (e.ok) bySkill[e.skill].ok += 1;
    }
    if (e.cue === CUE.SHOWN) fresh += 1;
    if (!e.ok && e.failure) failures[e.failure] = (failures[e.failure] || 0) + 1;
  }
  const worked = Object.keys(bySkill)
    .filter((s) => bySkill[s].n > 0)
    .sort((a, b) => bySkill[b].n - bySkill[a].n);
  return {
    answered: n,
    correct: ok,
    items: items.size,
    introduced: fresh,
    bySkill,
    skillsWorked: worked,
    failures,
    /* Named as the biggest FAILURE type rather than a diagnosis. The model can count what
       went wrong; claiming to know why is a different and much stronger claim. */
    commonestFailure: Object.keys(failures).sort((a, b) => failures[b] - failures[a])[0] || null,
  };
}

/* ── retrieval direction ──
   The review's point: mc ("which of these four means 火曜日?") and recall ("what does
   火曜日 mean?") are not the same cognitive demand, and calling both "recognition" throws
   that away. They are the same SKILL in the same DIRECTION at different CUE levels — which
   is exactly what the cue scale already expresses, so the taxonomy is
   skill × direction × cue rather than a flat list of format names. */
export const DIRECTIONS = {
  JP_EN: "jp_to_en",          // see the word, retrieve the meaning
  EN_JP: "en_to_jp",          // see the meaning, retrieve the word
  AUDIO_EN: "audio_to_meaning",
  IN_CONTEXT: "en_to_jp_in_context",
};

/* ── rolling recent history ──
   Lifetime accuracy reacts far too slowly: a word answered wrong for months and right all
   week still looks broken, and one that was solid and just fell apart still looks fine.
   The previous fix used "was the last answer wrong", which is a proxy and cannot tell
   78% lifetime / recently terrible from 78% lifetime / recently excellent.

   Stored as a short string of 1s and 0s, newest last. Compact enough to sit on every stat
   record and sync without bloating anything. */
export const RECENT_CAP = 10;

export function pushRecent(recent, ok) {
  const s = (typeof recent === "string" ? recent : "").replace(/[^01]/g, "");
  return (s + (ok ? "1" : "0")).slice(-RECENT_CAP);
}

export function recentAcc(recent, n = 5) {
  const s = (typeof recent === "string" ? recent : "").replace(/[^01]/g, "");
  if (!s.length) return null;                        // no history is not the same as zero
  const window = s.slice(-n);
  let ok = 0;
  for (const ch of window) if (ch === "1") ok += 1;
  return { rate: ok / window.length, n: window.length };
}

/* ── predicted success ──
   How likely this learner is to get this exercise right, given the ability and how much
   help the exercise offers. Deliberately simple and deliberately explicit: it is a
   stated model that can be checked against logged outcomes later, which is the whole
   point of recording `predicted` on every evidence record.

   Recent performance outranks lifetime when the two disagree, because the question is
   "can you do it now", not "have you historically". */
export function predictSuccess(skill, cue) {
  const s = skill || {};
  if (!s.tried) return cue <= CUE.CHOOSE ? 0.55 : 0.3;
  const life = s.acc != null ? s.acc : 0.5;
  const rec = recentAcc(s.recent, 5);
  const base = rec ? (rec.rate * 0.65 + life * 0.35) : life;
  // Each step up the demand ladder costs something; a strong memory pays less for it.
  const strength = Math.min(1, (s.S || 0) / 30);
  const cost = 0.13 * (1 - strength * 0.6);
  return Math.max(0.05, Math.min(0.98, base - cost * cue));
}

/* ── the intervention ──
   Replaces "pick a format, then decorate it with a cue". The decision is now:
   which ability is weakest and available → how much help does it need to be effortful but
   still successful → which renderer shows that. Format is a CONSEQUENCE of skill and cue,
   not the thing being chosen. */
export const TARGET_SUCCESS = 0.72;
/* Where an ability with no evidence sits when choosing what to work on. */
export const UNTRIED_SCORE = 0.45;

function formatFromSkillCue(skill, cue) {
  if (cue === CUE.SHOWN) return "learn";
  switch (skill) {
    case "listening": return "listen";
    case "context": return "cloze";
    case "production": return cue >= CUE.CONTEXT ? "cloze" : "type";
    default: return cue <= CUE.CHOOSE ? "mc" : "recall";
  }
}

function directionFor(skill) {
  if (skill === "listening") return DIRECTIONS.AUDIO_EN;
  if (skill === "context") return DIRECTIONS.IN_CONTEXT;
  if (skill === "production") return DIRECTIONS.EN_JP;
  return DIRECTIONS.JP_EN;
}

/* A failure tells you which ability actually broke, so the next exercise should address
   THAT rather than simply repeating the same question. This is the loop the last review
   called decorative — classification existed but changed nothing. */
export function skillAfterFailure(failure, fallback) {
  switch (failure) {
    case "reading": return "production";   // knew the word, fumbled the reading — drill the form
    case "listening": return "listening";
    case "context": return "context";
    case "orthography": return "orthography";
    case "meaning": return "recognition";
    case "blank": return "recognition";        // nothing retrieved: go back to the meaning
    default: return fallback;
  }
}

export function chooseIntervention(pick, opts = {}) {
  const o = { target: TARGET_SUCCESS, ...opts };
  const caps = (pick && pick.caps) || {};
  const states = {
    recognition: pick.recognition || {},
    production: pick.production || {},
    listening: pick.listening || {},
    context: pick.context || {},
  };

  // Never met: show it. There is nothing to retrieve yet.
  if (pick.fresh || !(states.recognition.tried)) {
    // Shown, then recognised among options, then recalled cold. Three showings of one card
    // teaches the card; three different demands teach the word.
    const cue = [CUE.SHOWN, CUE.CHOOSE, CUE.STRONG][Math.min(pick.step || 0, 2)];
    const skill = "recognition";
    return { skill, direction: directionFor(skill), cue, format: formatFromSkillCue(skill, cue), expected: predictSuccess(states.recognition, cue) };
  }

  /* Which abilities are even askable. Production stays locked until the word can be read
     at all — asking someone to produce what they cannot recognise is not difficulty, it
     is just failure. */
  const unlocked = ["recognition"];
  if (caps.type && (states.recognition.S || 0) >= (o.typeAtStability || 14)) unlocked.push("production");
  /* Listening is a REPEAT-only format. Audio depends on where you are, so a session full
     of it is unusable half the time — and because an unmeasured ability ranks as weak, an
     unconstrained listening dimension won nearly every slot in practice. */
  if (caps.listen && o.allowListen !== false && (pick.step || 0) > 0
      && (states.recognition.S || 0) >= (o.listenAtStability || 5)) unlocked.push("listening");
  if (caps.context && (states.production.tried || (states.recognition.S || 0) >= (o.typeAtStability || 14))) unlocked.push("context");

  /* Target the WEAKEST unlocked ability — the whole point of modelling them separately.
     An untried ability counts as weak: it is the one with no evidence at all. */
  /* Preference order breaks ties. When two abilities are equally strong the one that is
     harder and less practised should win — producing a word beats recognising it, and
     recognition is the fallback rather than the default. */
  const ORDER = ["production", "context", "listening", "recognition"];
  const ranked = ORDER.filter((s) => unlocked.includes(s));
  let skill = ranked[0] || unlocked[0];
  let worst = 2;
  for (const s of ranked) {
    const st = states[s] || {};
    /* An untried ability ranks BELOW average but not automatically last. Scoring it worst
       meant any dimension the app does not yet populate — listening, context — won every
       session forever and starved an ability that is genuinely failing at 20%. Unmeasured
       is a reason to sample, not a reason to monopolise. */
    const score = !st.tried ? UNTRIED_SCORE : (recentAcc(st.recent, 5)?.rate ?? st.acc ?? 0.5);
    if (score < worst) { worst = score; skill = s; }
  }

  // A recent failure redirects to the ability that actually broke, when it is available.
  if (pick.lastFailure) {
    const want = skillAfterFailure(pick.lastFailure, skill);
    if (unlocked.includes(want)) skill = want;
  }

  /* Pick the HARDEST cue this ability can still succeed at. Effortful and successful is
     the target; effortful and failing teaches nothing, and easy teaches nothing either. */
  /* The top rung is contextual use, and it only exists when the item actually HAS
     contextual material. Without this, a strong production memory climbed to CUE.CONTEXT
     and rendered as a cloze for a word with no sentence to put it in. */
  const ladder = (skill === "recognition" || !caps.context)
    ? [CUE.CHOOSE, CUE.STRONG, CUE.PARTIAL, CUE.FREE]
    : [CUE.CHOOSE, CUE.STRONG, CUE.PARTIAL, CUE.FREE, CUE.CONTEXT];
  let cue = ladder[0];
  for (const c of ladder) {
    if (skill === "context" && c < CUE.CONTEXT) continue;
    if (predictSuccess(states[skill], c) >= o.target) cue = c; else break;
  }
  if (skill === "context") cue = CUE.CONTEXT;
  // A miss last time hands support back regardless of what the model predicts.
  if (pick.lastFailure && cue > CUE.CHOOSE) cue -= 1;

  return {
    skill,
    direction: directionFor(skill),
    cue,
    format: formatFromSkillCue(skill, cue),
    expected: predictSuccess(states[skill], cue),
  };
}
