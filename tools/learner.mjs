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
export function makeEvidence({ id, deck, format, skill, cue, ok, ms, failure, predicted, at, confused }) {
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
    // Which wrong option was picked, when there was one. This is the raw material for
    // learner-specific distractors: what THIS person mixes up beats "same length".
    confused: !ok && confused ? confused : null,
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
/* How much an unmeasured ability is worth sampling, relative to a known-weak one. */
export const CURIOSITY = 0.35;

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
  const o = { target: TARGET_SUCCESS, curiosity: CURIOSITY, ...opts };
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
  /* Which ability is worth the next fifteen seconds. Ranked by practice value — room to
     improve, plus how little is actually known — rather than by raw weakness, so an
     unmeasured ability earns attention through its uncertainty instead of masquerading as
     a failing one. Weakness is an input, not the objective.

     Ties break toward the harder, less-practised direction: producing a word beats
     recognising it, and recognition is the fallback rather than the default. */
  const ORDER = ["production", "context", "listening", "recognition"];
  const ranked = ORDER.filter((s) => unlocked.includes(s));
  let skill = ranked[0] || unlocked[0];
  let best = -1;
  for (const s of ranked) {
    const v = practiceValue(abilityFrom(states[s] || {}), { curiosity: o.curiosity });
    if (v > best) { best = v; skill = s; }
  }

  /* A failure names a specific next step, not just "make it easier". A blank means nothing
     was retrieved and needs a real step back; a reading fumble means the word WAS retrieved
     and only the form slipped, which deserves the form drilled with support rather than a
     return to multiple choice. */
  const plan = planAfterFailure(pick.lastFailure);
  if (plan && unlocked.includes(plan.skill)) skill = plan.skill;

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
  /* The plan's cue wins when it asks for more support than the model would have chosen.
     It never makes the next attempt harder — a miss is not a reason to raise the demand. */
  if (plan && plan.skill === skill) cue = Math.min(cue, plan.cue);
  else if (pick.lastFailure && cue > CUE.CHOOSE) cue -= 1;

  return {
    skill,
    direction: directionFor(skill),
    cue,
    format: formatFromSkillCue(skill, cue),
    expected: predictSuccess(states[skill], cue),
  };
}

/* ── uncertainty-aware ability estimates ──
   The previous model reported a bare rate and gated any claim behind invented constants:
   eight observations, a twelve-point spread. Those numbers were not derived from anything,
   and they conflated two different situations — an ability that is genuinely weak, and one
   nobody has measured.

   A Beta posterior over the success rate handles both properly. Successes and failures
   update a distribution rather than a point, so "72% from 4 answers" and "72% from 90
   answers" stop looking identical, and "unknown" appears naturally as a wide interval
   rather than as a fake low score.

   The prior is Beta(2,2) — weakly optimistic, centred on 50%, worth about four observations.
   Strong enough to stop a single lucky answer reading as mastery, weak enough to get out of
   the way once real evidence arrives. */
export const PRIOR_A = 2, PRIOR_B = 2;

export function posterior(successes, failures, prior = {}) {
  const a = (prior.a ?? PRIOR_A) + Math.max(0, successes || 0);
  const b = (prior.b ?? PRIOR_B) + Math.max(0, failures || 0);
  const n = a + b;
  const mean = a / n;
  // Normal approximation to the Beta. At these sample sizes it is close enough, and the
  // point is the WIDTH — how much the estimate should be trusted — not a exact quantile.
  const sd = Math.sqrt((a * b) / (n * n * (n + 1)));
  const lo = Math.max(0, mean - 1.96 * sd);
  const hi = Math.min(1, mean + 1.96 * sd);
  return { mean, sd, lo, hi, width: hi - lo, observations: (successes || 0) + (failures || 0) };
}

/* ── unknown is not weak ──
   Five states, and the first is about EVIDENCE rather than ability. An ability nobody has
   tested is not failing; it is unmeasured, and the correct response is to go and measure
   it, not to declare a crisis. */
export const STATE = {
  UNKNOWN: "unknown",       // too little evidence to say anything
  EMERGING: "emerging",     // some evidence, still wide
  WEAK: "weak",
  STABLE: "stable",
  STRONG: "strong",
};

export const STATE_LABEL = {
  unknown: "not measured yet",
  emerging: "still learning",
  weak: "needs work",
  stable: "holding",
  strong: "solid",
};

export function stateOf(post, opts = {}) {
  const wideEnoughToDoubt = opts.wide ?? 0.35;
  if (!post || post.observations < 3 || post.width > 0.45) return STATE.UNKNOWN;
  if (post.width > wideEnoughToDoubt) return STATE.EMERGING;
  if (post.mean < 0.60) return STATE.WEAK;
  if (post.mean < 0.85) return STATE.STABLE;
  return STATE.STRONG;
}

/* What is worth practising. Weakness is ONE input, not the objective — a point the review
   was right to make. Two things make an ability worth spending a slot on:

     how much room there is to improve        (1 - mean)
     how little we actually know              (width)

   An unmeasured ability therefore earns attention through its uncertainty rather than by
   masquerading as a failing one, and a genuinely failing ability still outranks it because
   the improvement term is larger. This is a stand-in for expected learning gain, not the
   real thing — the real thing needs outcome data that does not exist yet. */
export function practiceValue(post, opts = {}) {
  const curiosity = opts.curiosity ?? CURIOSITY;
  if (!post) return 0.5;
  return (1 - post.mean) + curiosity * post.width;
}

/* Build a posterior for one ability from a stat record, preferring recent evidence.
   Recent results are counted twice: the question is whether you can do it NOW. */
export function abilityFrom(skill) {
  const s = skill || {};
  const seen = s.seen || 0;
  const ok = Math.round((s.acc ?? 0) * seen);
  const rec = recentAcc(s.recent, 10);
  let succ = ok, fail = Math.max(0, seen - ok);
  if (rec) {
    const rOk = Math.round(rec.rate * rec.n);
    succ += rOk;
    fail += rec.n - rOk;
  }
  const post = posterior(succ, fail);
  return { ...post, state: stateOf(post), tried: seen > 0 };
}

/* ── failure leads somewhere specific ──
   "Any miss hands back a level of support" was a real improvement and is still too coarse.
   What broke determines what should happen next, and the cue adjustment differs by kind:
   a blank means nothing was retrieved at all and needs a large step back, while a reading
   fumble means the word WAS retrieved and only the form slipped — that deserves the form
   drilled with support, not a return to multiple choice. */
export const FAILURE_PLAN = {
  meaning:     { skill: "recognition", cue: CUE.CHOOSE,  note: "back to picking it out" },
  blank:       { skill: "recognition", cue: CUE.CHOOSE,  note: "nothing came — start again from the meaning" },
  reading:     { skill: "production",  cue: CUE.STRONG,  note: "the word was there, the reading slipped" },
  production:  { skill: "production",  cue: CUE.STRONG,  note: "produce it with a hint first" },
  orthography: { skill: "production",  cue: CUE.PARTIAL, note: "the form needs work" },
  listening:   { skill: "listening",   cue: CUE.CHOOSE,  note: "hear it again with options" },
  context:     { skill: "production",  cue: CUE.FREE,    note: "secure the word before using it" },
};

export function planAfterFailure(failure) {
  return FAILURE_PLAN[failure] || null;
}

/* ── latency, relative to this learner and this kind of exercise ──
   Three universal thresholds cannot mean the same thing for picking one of four options and
   for typing out かようび. What matters is whether an answer was slow FOR THIS PERSON on
   THIS kind of question, so the norm is built per skill+format from their own history. */
export function latencyNorms(evidence = [], opts = {}) {
  const min = opts.minSamples || 8;
  const buckets = {};
  for (const e of evidence) {
    if (!e || !e.ok || !(e.ms > 0)) continue;          // correct answers only: a wrong answer's timing says little
    const k = (e.skill || "?") + "|" + (e.format || "?");
    (buckets[k] || (buckets[k] = [])).push(e.ms);
  }
  const out = {};
  for (const k of Object.keys(buckets)) {
    const xs = buckets[k].slice().sort((a, b) => a - b);
    if (xs.length < min) continue;                     // too few to be a norm
    const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
    out[k] = { n: xs.length, median: q(0.5), fast: q(0.25), slow: q(0.75) };
  }
  return out;
}

export function latencyVerdict(ms, skill, format, norms) {
  const n = norms && norms[(skill || "?") + "|" + (format || "?")];
  if (!n || !(ms > 0)) return null;                    // no norm yet: say nothing
  if (ms <= n.fast) return "fast";
  if (ms >= n.slow) return "slow";
  return "normal";
}

/* ── confusion ──
   Which words this learner actually mixes up, learned from the wrong options they pick.
   Far better distractors than "same length": a distractor should be plausible TO THIS
   LEARNER and wrong in this context. */
export function confusionFrom(evidence = []) {
  const map = new Map();
  for (const e of evidence) {
    if (!e || e.ok || !e.confused) continue;
    if (!map.has(e.id)) map.set(e.id, new Map());
    const inner = map.get(e.id);
    inner.set(e.confused, (inner.get(e.confused) || 0) + 1);
  }
  const out = new Map();
  for (const [id, inner] of map) {
    out.set(id, [...inner.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
  }
  return out;
}
