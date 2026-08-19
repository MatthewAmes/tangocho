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
