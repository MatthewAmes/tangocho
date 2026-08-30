import { inflectionMatch } from "./conjugation.mjs";
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
    /* The script listening mode (listening.mjs). All three of its questions are answered
       from sound, so all three are evidence about the same ability whatever they ask
       about — which is why the mode exists at all. */
    case "listen_meaning":
    case "listen_missing":
    case "listen_speaker": return "listening";
    /* Dialogue mode (dialogue.mjs). Choosing the line that fits this moment of a real
       conversation is using the language in context — not production, because nothing was
       generated, and not listening, because the options are on screen. */
    case "dialogue_turn": return "context";
    case "cloze": return "context";
    default: return null;                  // "learn" is exposure, not evidence
  }
}

/* ── format is not the same thing as cognitive mode ──
   The skill above says WHICH ability an exercise measures. It does not say what the
   learner's head actually had to do, and those are different questions: a listening
   multiple choice and a listening sentence-reassembly both file under `listening`, and one
   of them is picking the right answer off a list while the other is building a sentence.

   Without the distinction written down, an app can add five new screens, report a lovely
   spread of formats, and have asked the learner to do exactly one thing five times.
   Visual variety gets counted as cognitive variety, which is the specific mistake this
   taxonomy exists to make impossible to make quietly.

   A format maps to one or MORE modes, because most real exercises demand more than one
   thing: typing a word from its English is a retrieval and then a spelling-out, and both
   can fail independently. */
export const COGNITIVE_MODES = [
  "exposure",         // first contact — shown, nothing retrieved
  "recognition",      // the answer is in front of you; find it
  "discrimination",   // two plausible answers are in front of you; tell them apart
  "recall",           // nothing is in front of you; retrieve it
  "reconstruction",   // the pieces are given; assemble them
  "production",       // generate the Japanese yourself, character by character
  "listening",        // decode it from sound rather than from the page
  "comprehension",    // understand a whole utterance, not a word
  "transfer",         // apply it to a situation the exercise did not rehearse
];

export const MODE_LABEL = {
  exposure: "Meeting it",
  recognition: "Recognising",
  discrimination: "Telling apart",
  recall: "Recalling",
  reconstruction: "Reassembling",
  production: "Producing",
  listening: "Listening",
  comprehension: "Understanding",
  transfer: "Using it",
};

/* Two of these names also appear elsewhere: `recognition` and `listening` are SKILLS as
   well. That overlap is deliberate rather than sloppy — the channel an item arrives
   through is part of the cognitive demand, and calling it something else here would only
   invent a synonym. The pairs still separate properly: format `listen` is
   listening+recognition, and a future listening reassembly would be listening+
   reconstruction. Same skill, different modes, which is the whole point. */
export const FORMAT_MODES = {
  /* The six formats the session engine emits (session.mjs FORMATS). */
  learn:  ["exposure"],
  mc:     ["recognition"],
  recall: ["recall"],
  type:   ["recall", "production"],
  listen: ["listening", "recognition"],
  /* Cloze renders as a blank in a real sentence with the English alongside and options
     underneath: the sentence has to be understood before the options mean anything. */
  cloze:  ["comprehension", "recognition"],

  /* The production drills (production.mjs DRILL). They do not write evidence today — the
     drill panel grades locally — but they are activity formats, and leaving them out
     would let the one screen that is pure reassembly go uncounted the moment it is wired
     up. A word bank is explicitly NOT production: the pieces are handed over. */
  order:  ["reconstruction"],
  build:  ["comprehension", "reconstruction"],
  fill:   ["comprehension", "discrimination"],

  /* Matching pairs. Recognition, plus the discrimination that a grid of near-neighbours
     forces and a single four-option question does not. */
  match:  ["recognition", "discrimination"],

  /* Script-derived activities (scriptplay.mjs). Kept as their own formats rather than
     folded into the ones above so that "what did the textbook dialogues actually buy me"
     stays an answerable question. */
  script_speaker:  ["comprehension", "discrimination"],
  /* Deterministic dialogue: the real next line among plausible wrong ones. Transfer,
     because choosing a reply is a use of the language and not a recall of it. Production
     is deliberately absent until the free-response version exists — claiming it here
     would be exactly the overcounting this table is for. */
  script_response: ["comprehension", "transfer"],
  script_order:    ["comprehension", "reconstruction"],
  script_cloze:    ["comprehension", "recognition"],

  /* Script LISTENING (listening.mjs). The same three questions as some of the above, asked
     of a line the learner has only heard — so every one of them carries `listening` on top
     of whatever the read version demanded. Kept as separate formats rather than as a flag
     on the script_* ones because "can I do this by ear" is the question the whole mode
     exists to answer, and a shared format string would bury it. */
  listen_meaning: ["listening", "comprehension"],
  /* Recognition as well as comprehension: the options are on screen, so the word is
     identified rather than retrieved — the same distinction the read cloze draws. */
  listen_missing: ["listening", "comprehension", "recognition"],
  /* Register, told apart by ear. Comprehension is absent on purpose: who said 頑張ります can
     be answered from how it was said without understanding all of it, and claiming
     comprehension here would be exactly the overcounting this table exists to prevent. */
  listen_speaker: ["listening", "discrimination"],

  /* Dialogue mode (dialogue.mjs, MP-16): one turn of a conversation the learner is playing
     a side of. Its modes are DELIBERATELY the same two as script_response, because the
     same two things happen in the learner's head — understand what was just said, choose a
     use of the language rather than recall of it. What differs is the amount of context
     brought to the choice (the whole conversation so far, and a role held throughout), and
     context makes a question harder without making it a different cognitive act. Claiming
     a third mode for it would be exactly the overcounting this table exists to prevent.
     The format is separate anyway, so "what did playing the dialogues buy me" stays a
     question the gain metric can answer on its own. */
  dialogue_turn: ["comprehension", "transfer"],
};

/** What this format actually asks of the learner. Always an array, never null: a format
 *  nobody has classified returns [] rather than a guess, so an unmapped format shows up
 *  as a gap in the analytics instead of quietly borrowing another format's modes. */
export function modesForFormat(format) {
  const m = FORMAT_MODES[format];
  return m ? [...m] : [];
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
export const FAILURES = ["meaning", "reading", "listening", "production", "orthography", "context", "blank", "conjugation"];

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
    /* Right word, wrong shape. たべました for たべる is not a vocabulary failure — the
       lexical item was retrieved and the transformation was wrong, which needs the
       conjugation drilled, not the word re-taught. Edit distance cannot see this: the
       two strings are far apart, so it used to land on "production" and demote a word
       the learner actually knows. Checked before the distance rules for that reason. */
    if (inflectionMatch(e, g).sameLemma) return "conjugation";
    const d = editDistance(e, g);
    // Close enough that the word was clearly retrieved and the reading fumbled.
    if (e.length && d <= Math.max(1, Math.floor(e.length / 3))) return "reading";
    return "production";
  }
  return "meaning";
}

/* ── what was actually given, and what was actually wanted ──
   `failure` says which KIND of thing went wrong. It does not say what happened, and the two
   are different questions: "production" is a category, かようび for きんようび is the
   mistake. Without the strings, "you consistently confuse 会社 and 学校" is a sentence the
   app can never say about a typed answer, and a recovery ladder can only re-ask the
   question rather than address what the learner actually produced.

   Kept ONLY on failures. A correct answer's text is the expected answer, which the deck
   already holds — storing it would double the log to say nothing.

   ## The cap, and the arithmetic behind it

   ERROR_TEXT_CAP is 20 CHARACTERS, and it is a storage decision before it is a display one.
   Evidence is a ring buffer of 4000 rows (EVIDENCE_CAP in the app, and mergeEvidence keeps
   the same 4000 after a sync) which travels to KV as ONE blob on every sync, so anything
   added here is paid for four thousand times over.

   Japanese is three bytes per character in UTF-8, so a capped pair costs at most
   20 x 3 x 2 = 120 bytes of text, plus 19 bytes for the two JSON keys with their quotes,
   colons and commas — about 140 bytes on a FAILED row and exactly zero on a correct one.
   A log that was nothing but misses would therefore add 4000 x 140 = ~550 KB to the synced
   snapshot; at a realistic quarter-of-the-log miss rate it is ~140 KB. Both sit far inside
   a 25 MB KV value, and the worst case is the one worth stating because it is the one that
   arrives without warning.

   Twenty is also not an arbitrary round number: the longest reading in the whole seed deck
   is 17 characters, so the cap keeps every real answer intact and only ever truncates
   something that was not a reading in the first place. */
export const ERROR_TEXT_CAP = 20;

/** Trim one answer string for storage. Splits by CODE POINT rather than by UTF-16 unit —
 *  slicing a string in half can land between a surrogate pair and produce a lone half that
 *  no longer renders, and the deck carries emoji. The ellipsis counts toward the cap so the
 *  byte arithmetic above stays true. */
export function clipText(s) {
  if (s == null) return null;
  const str = String(s).trim();
  if (!str) return null;
  const chars = Array.from(str);
  if (chars.length <= ERROR_TEXT_CAP) return str;
  return chars.slice(0, ERROR_TEXT_CAP - 1).join("") + "…";
}

/* ── the recovery tag ──
   "production:2/3" — the failure that started a rescue, and how far up its ladder this beat
   sits. Written on every evidence row that belongs to a rescue (recovery.mjs stamps it onto
   the rung), so a repair reads back out of the log instead of being reconstructed from a
   bonus and a timestamp.

   Built and parsed HERE rather than beside the sequencer because recovery.mjs already
   imports this file; putting the format in the other direction would make the two modules
   import each other to agree on one string. */
export function recoveryTag(failure, stage, of) {
  return String(failure) + ":" + stage + "/" + of;
}

/** The tag read back. Returns null for anything that is not one, so a caller can treat
 *  "no rescue" and "an unparseable rescue" the same way instead of guessing. */
export function parseRecovery(tag) {
  const m = /^([a-z]+):(\d+)\/(\d+)$/.exec(String(tag || ""));
  if (!m) return null;
  const stage = parseInt(m[2], 10), of = parseInt(m[3], 10);
  if (!(of > 0) || !(stage > 0) || stage > of) return null;
  return { from: m[1], stage, of, last: stage === of };
}

/* ── evidence ──
   One record per answered exercise. Deliberately small and flat: this is the log the
   reviews want the eventual calibration and expected-gain work to learn from, and a log
   nobody can afford to keep is a log that does not exist. */
export function makeEvidence({ id, deck, format, skill, mode, cue, ok, ms, failure, predicted, pRecall, at, confused, s0, s1, recovery, fatigue, got, want }) {
  return {
    id, deck, format,
    skill: skill || skillForFormat(format),
    /* DERIVED from the format rather than demanded from the caller, so tagging every
       answer with what it actually asked for costs no change at the one place evidence is
       written. Passing `mode` explicitly is still allowed — a screen that knows it is
       doing something the format name does not capture should say so.

       Stored as an array because most formats are more than one thing. Rows written
       before this existed simply have no `mode`, and every reader below treats absent as
       "not classified" rather than as an empty answer. */
    mode: Array.isArray(mode) && mode.length ? [...mode] : modesForFormat(format),
    cue: cue == null ? null : cue,
    ok: !!ok,
    ms: ms > 0 ? Math.round(ms) : 0,
    failure: ok ? null : (failure || null),
    // What the model expected. Kept so calibration can later be measured rather than
    // assumed — "predicted 80%, actually 52%" is the only way to learn the model is wrong.
    predicted: typeof predicted === "number" ? Math.round(predicted * 100) / 100 : null,
    /* FSRS's card-level retrievability, recorded next to the intervention's prediction rather
       than instead of it. Its presence is also what marks a record as belonging to the era
       where `predicted` means the intervention model — older records have neither. */
    pRecall: typeof pRecall === "number" ? Math.round(pRecall * 100) / 100 : null,
    // Which wrong option was picked, when there was one. This is the raw material for
    // learner-specific distractors: what THIS person mixes up beats "same length".
    confused: !ok && confused ? confused : null,
    /* FSRS stability either side of this answer, in days. The learning-gain metric is a
       change in stability, so without these a row cannot be scored at all — and rows
       written before this existed are skipped rather than counted as zero gain
       (tools/gain.mjs). Recorded rather than recomputed: a metric derived from its own
       parallel copy of the scheduler is a metric that can quietly stop matching it. */
    s0: typeof s0 === "number" && isFinite(s0) ? Math.round(s0 * 1000) / 1000 : null,
    s1: typeof s1 === "number" && isFinite(s1) ? Math.round(s1 * 1000) / 1000 : null,
    /* Which rung of a rescue this answer was, when it was one: "production:2/3" — the
       failure that started the chain, and how far up it this beat sits. A flat string for
       the same reason `recent` is one. Without it a repair is invisible in the log: a
       comeback bonus shows in the score and the CHAIN that earned it — what broke, what
       was asked instead, in what order — could only be guessed at from timestamps. */
    recovery: typeof recovery === "string" && recovery ? recovery : null,
    /* How tired the session looked when this answer was given, 0..1 from fatigue.mjs, or
       null when there was not yet enough of a session to say. Recorded for the same reason
       `predicted` is: fatigue is a MODEL, and it is only calibratable if the level it
       claimed at the time survives next to what actually happened (spec §40). Nothing
       reads it yet — that is the point of writing it now rather than later. */
    fatigue: typeof fatigue === "number" && isFinite(fatigue)
      ? Math.round(fatigue * 100) / 100 : null,
    /* What was given and what was wanted, truncated, and only when something went wrong —
       see ERROR_TEXT_CAP for why they are capped and what the cap costs. Both are ADDITIVE:
       a row written before they existed simply has neither, and every reader below treats
       absent as "not recorded" rather than as an empty answer. */
    got: ok ? null : clipText(got),
    want: ok ? null : clipText(want),
    at: at || Date.now(),
  };
}

/* ── the profile ──
   Per-skill estimates, and — the part most apps get wrong — an honest confidence. A
   number computed from four answers is not a measurement, and presenting it as one is
   how learners end up told they are "72% fluent". */
export const CONFIDENCE = { NONE: "no evidence", LOW: "still evaluating", OK: "likely", GOOD: "strong evidence" };

/* Kept for callers that only have a count. Prefer confidenceFromPosterior: how much is
   known is a property of the ESTIMATE, and thresholds on a raw count are the invented
   numbers the posterior was introduced to remove. */
export function confidenceFor(n) {
  if (n <= 0) return CONFIDENCE.NONE;
  if (n < 8) return CONFIDENCE.LOW;
  if (n < 25) return CONFIDENCE.OK;
  return CONFIDENCE.GOOD;
}

export function confidenceFromPosterior(post) {
  if (!post || !post.observations) return CONFIDENCE.NONE;
  if (post.width > 0.40) return CONFIDENCE.LOW;
  if (post.width > 0.20) return CONFIDENCE.OK;
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
  const byMode = {};
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
    /* One answer counts toward EVERY mode it demanded, so the columns deliberately sum to
       more than `answered`. The question this table answers is "did the session ask me to
       do more than one kind of thinking", and splitting a typed answer into half a recall
       and half a production would answer a different and less useful one.

       Rows from before mode tagging have no `mode` at all and are skipped rather than
       bucketed as unknown — the same treatment the gain metric gives rows written before
       stability was recorded, and for the same reason. */
    const modes = Array.isArray(e.mode) ? e.mode : [];
    for (const m of modes) {
      byMode[m] = byMode[m] || { n: 0, ok: 0 };
      byMode[m].n += 1;
      if (e.ok) byMode[m].ok += 1;
    }
    if (e.cue === CUE.SHOWN) fresh += 1;
    if (!e.ok && e.failure) failures[e.failure] = (failures[e.failure] || 0) + 1;
  }
  const worked = Object.keys(bySkill)
    .filter((s) => bySkill[s].n > 0)
    .sort((a, b) => bySkill[b].n - bySkill[a].n);
  const modesWorked = Object.keys(byMode)
    .filter((m) => byMode[m].n > 0)
    .sort((a, b) => byMode[b].n - byMode[a].n);
  return {
    answered: n,
    correct: ok,
    items: items.size,
    introduced: fresh,
    bySkill,
    skillsWorked: worked,
    /* Empty on a log that predates mode tagging, which is the honest reading: the session
       was not classified, not "the session demanded nothing". */
    byMode,
    modesWorked,
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
  /* The base comes from the POSTERIOR, not from raw accuracy. Reading s.acc directly let
     one missed answer produce acc = 0, which clamps to a 5% prediction at every rung — the
     same overclaiming-from-nothing that abilityFrom was rewritten to stop, reintroduced by
     a second estimator that quietly disagreed with the first. Through the posterior a
     single miss reads as about 40%, which is what one miss actually justifies.

     Recency still gets the larger share on top, because how the last few answers went says
     more about right now than a lifetime average does. */
  const post = abilityFrom(s);
  const life = post.mean;
  /* Recency earns its weight rather than being handed it. A flat 0.65 on the recent
     window gave a SINGLE recent answer two-thirds of the vote, so one miss on a new word
     dragged the prediction to 14% — recency correcting a stale estimate is the point, but
     one answer is not a trend. The weight now grows with the size of the window and only
     reaches its full share once there are five answers in it. */
  const rec = recentAcc(s.recent, 5);
  const w = rec ? 0.65 * Math.min(1, rec.n / 5) : 0;
  const base = rec ? (rec.rate * w + life * (1 - w)) : life;

  /* On the log-odds scale, not by subtraction. Taking a flat amount off a probability
     assumes a cue level costs the same whether the learner is at 95% or 50%, and it runs
     off the end of the scale near the boundaries — subtracting 0.13 four times from 0.4
     lands below zero and has to be clamped, which is the model hitting a wall rather than
     describing anything. A logistic shift is the standard item-response form and stays a
     probability by construction. */
  const b = Math.min(0.99, Math.max(0.01, base));
  const logit = Math.log(b / (1 - b));
  const strength = Math.min(1, (s.S || 0) / 30);
  const perCue = 0.75 * (1 - strength * 0.55);   // a strong memory pays less per step

  /* The penalty is a DIFFERENCE from the rung the evidence came from, not a charge from
     zero. Accuracy is never measured in the abstract — it is measured at whatever cue the
     learner was actually given, and almost all of it comes from the ladder floor. Charging
     the full cue cost on top of a number that already includes it predicted that someone
     scoring 70% on multiple choice would get 49% on multiple choice: the model disagreeing
     with the very observation it was built from.

     The consequence was worse than a wrong number. The ladder search takes the hardest rung
     still predicted above target and stops at the first one that fails, so a floor
     prediction below target meant it broke on its first iteration EVERY time and returned
     the floor. Across a simulated fourteen sessions, 89% of exercises came out at the
     bottom rung whatever the learner did — the cue continuum, the centrepiece of this
     design, was inert.

     REFERENCE_CUE is an assumption, not a measurement: it says the accuracy on file was
     earned at the floor rung. That is true of most of the log today and will drift as the
     ladder starts working. It is exactly the kind of claim calibration.mjs exists to check,
     and the cue-calibration table is where it will show up as wrong. */
  const z = logit - perCue * (cue - REFERENCE_CUE);
  return Math.max(0.05, Math.min(0.98, 1 / (1 + Math.exp(-z))));
}

/* ── the intervention ──
   Replaces "pick a format, then decorate it with a cue". The decision is now:
   which ability is weakest and available → how much help does it need to be effortful but
   still successful → which renderer shows that. Format is a CONSEQUENCE of skill and cue,
   not the thing being chosen. */
export const TARGET_SUCCESS = 0.72;
/* The rung the recorded accuracy is assumed to have been earned at. See predictSuccess. */
export const REFERENCE_CUE = CUE.CHOOSE;
/* Where an ability with no evidence sits when choosing what to work on. */
/* How much an unmeasured ability is worth sampling, relative to a known-weak one. */
export const CURIOSITY = 0.35;
/* Beyond this width the estimate says nothing more than "unknown"; extra uncertainty
   should not keep buying attention. */
export const WIDTH_CAP = 0.40;

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

  /* Eligibility comes from what the learner has DEMONSTRATED, not from a memory-model
     quantity. FSRS stability answers "how long until you forget this", which is a
     different question from "have you shown you can read this well enough to be asked to
     produce it" — and gating on S was the last place the old card-centric design leaked
     into the learner model. Production opens once recognition is measured and holding. */
  const recAbility = abilityFrom(states.recognition);
  /* "Has shown they can read it" — measured at all, and holding up. Requiring the full
     STABLE state made this far too strict: twenty answers at 95% still reads as EMERGING
     once older evidence is discounted, and refusing to ever ask for production of a word
     answered correctly twenty times is not caution, it is a broken gate. */
  const recDemonstrated = recAbility.state !== STATE.UNKNOWN
    && recAbility.mean >= (o.produceAtAccuracy ?? 0.75);
  if (caps.type && recDemonstrated) unlocked.push("production");
  /* Listening is a REPEAT-only format. Audio depends on where you are, so a session full
     of it is unusable half the time — and because an unmeasured ability ranks as weak, an
     unconstrained listening dimension won nearly every slot in practice. */
  if (caps.listen && o.allowListen !== false && (pick.step || 0) > 0
      && recAbility.state !== STATE.UNKNOWN && recAbility.mean >= (o.listenAtAccuracy ?? 0.6)) {
    unlocked.push("listening");
  }
  if (caps.context && (states.production.tried || recDemonstrated)) unlocked.push("context");

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
    if (skill === "context" && c < CUE.CONTEXT) continue;   // context has one rung
    if (predictSuccess(states[skill], c) >= o.target) cue = c; else break;
  }
  /* The context ladder starts at CUE.CONTEXT rather than being forced to it. Assigning
     it unconditionally threw away the target-success search that had just run, so a
     contextual exercise was the one case where the model stopped checking whether the
     learner could actually succeed. */
  /* The plan's cue wins when it asks for more support than the model would have chosen.
     It never makes the next attempt harder — a miss is not a reason to raise the demand. */
  if (plan && plan.skill === skill) cue = Math.min(cue, plan.cue);
  else if (pick.lastFailure && cue > CUE.CHOOSE) cue -= 1;
  /* A successful repeat within the same session asks for a little more. Successive
     retrieval with progressively less support is the point of the learning steps; showing
     the identical question twice teaches the question. */
  else if ((pick.step || 0) > 0) cue = Math.min(ladder[ladder.length - 1], cue + 1);

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
/* How much an older observation counts toward CURRENT ability. Below 1 by design: it
   is what stops a long history from certifying an estimate the recent evidence does
   not support. A stated assumption about nonstationarity, not a measurement. */
export const STALE_WEIGHT = 0.45;

export function posterior(successes, failures, prior = {}) {
  /* Fractional counts are expected: discounted older evidence contributes a partial
     observation, which is the whole mechanism by which stale data widens the interval
     instead of narrowing it. */
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
  const cap = opts.widthCap ?? WIDTH_CAP;
  if (!post) return 0.5;
  /* The uncertainty term is CAPPED. Uncapped, a completely unmeasured ability (width
     ~0.88) outscored an ability measured at 40% over fifteen trials — so the model would
     keep sampling the unknown while something was actively failing, which is precisely
     the requirement this is supposed to satisfy. Past a certain width the estimate is
     simply "we do not know", and being even less sure than that buys no extra
     information. */
  return (1 - post.mean) + curiosity * Math.min(post.width, cap);
}

/* Build a posterior for one ability from a stat record, preferring recent evidence.
   Recent results are counted twice: the question is whether you can do it NOW. */
export function abilityFrom(skill, opts = {}) {
  const s = skill || {};
  const seen = s.seen || 0;
  if (!seen) {
    const post = posterior(0, 0);
    return { ...post, state: stateOf(post), tried: !!s.tried, effective: 0 };
  }

  /* Evidence is DISCOUNTED by age, not re-weighted into pseudo-counts.

     The previous version blended lifetime and recent accuracy into one rate and then
     multiplied it back out over the full trial count. That produced a posterior with a
     hundred observations behind a claim the data did not support: ninety correct out of a
     hundred, then five recent failures, came out as "confidently ~32%" — narrow, because
     the arithmetic still had a hundred trials in it, when the honest reading is "you used
     to be reliable, something changed, and five answers is not much to go on".

     So older evidence contributes FRACTIONAL counts. Recent answers count fully, older
     ones are discounted, and the effective sample size is therefore smaller than the raw
     one — which widens the interval rather than narrowing it. The discount is a stated
     belief about how quickly ability moves, not a measured quantity, and it is the knob
     to revisit once calibration data exists. */
  const staleWeight = opts.staleWeight ?? STALE_WEIGHT;
  /* Without a recorded window there is no basis for calling anything stale — the record
     simply predates the rolling history. Treat the most recent RECENT_CAP trials as
     current at the lifetime rate rather than discounting the entire history, which made
     ten correct answers read as "unknown". */
  const rec = recentAcc(s.recent, RECENT_CAP);
  const recN = rec ? Math.min(rec.n, seen) : Math.min(seen, RECENT_CAP);
  const recOk = rec ? rec.rate * recN : Math.min(1, Math.max(0, s.acc ?? 0)) * recN;

  const oldN = Math.max(0, seen - recN);
  const lifeRate = Math.min(1, Math.max(0, s.acc ?? 0));
  const oldOk = oldN * lifeRate;

  const succ = recOk + staleWeight * oldOk;
  const fail = (recN - recOk) + staleWeight * (oldN - oldOk);

  const post = posterior(succ, fail);
  return {
    ...post,
    state: stateOf(post),
    tried: true,
    /* Raw trials versus how many the model is actually leaning on. When these diverge the
       estimate is being carried by older evidence and should be trusted less. */
    observations: seen,
    effective: Math.round((succ + fail) * 10) / 10,
  };
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
  conjugation: { skill: "production",  cue: CUE.PARTIAL, note: "the word is there — the form slipped" },
};

/* ── scoring what actually predicts retention ──
   The obvious scheme is +10 for correct. It is also the wrong one: it pays the same for
   picking a word out of four options as for producing it cold, and it pays nothing for the
   two things that most reliably signal a memory is consolidating — retrieving with less
   support than last time, and retrieving something that has been left alone for weeks.

   So the score is built from the evidence already logged per answer. Every term below is a
   quantity the app records anyway; nothing here needs new instrumentation.

   Two deliberate refusals:
     - A miss is never worth zero. Attempting a hard item IS the behaviour spaced repetition
       is trying to produce, and zeroing it teaches avoidance of exactly the material that
       needs the work.
     - Nothing is subtracted, ever. A score that can go down turns a study tool into
       something with a losing condition, and the only winning move becomes not studying
       the hard cards. */
export const SCORE = {
  attempt: 2,          // showing up to a hard one
  correct: 10,
  perCueRung: 4,       // less scaffolding = more credit
  fast: 6,             // beat your own median for this skill+format
  comeback: 12,        // completed a rescue ladder
  memoryCapDays: 140,  // beyond ~5 months the bonus stops growing
  memoryMax: 20,
};

/** Points for one answer, with the reasons attached so the UI can show WHY.
 *  All inputs are already in the evidence record. `verdict` is latencyVerdict()'s output. */
export function scoreAnswer({ ok, cue, verdict, comeback = false, stabilityDays = 0 } = {}) {
  const reasons = [];
  let points = SCORE.attempt;
  reasons.push({ label: "attempt", points: SCORE.attempt });

  if (ok) {
    points += SCORE.correct;
    reasons.push({ label: "correct", points: SCORE.correct });

    /* Credit for the ABSENCE of help. CUE.CHOOSE is the floor of real retrieval (pick from
       options); every rung above it removed some scaffolding, so it earns another step. */
    const rungs = Math.max(0, (typeof cue === "number" ? cue : CUE.CHOOSE) - CUE.CHOOSE);
    if (rungs > 0) {
      const p = rungs * SCORE.perCueRung;
      points += p;
      reasons.push({ label: "unaided", points: p });
    }
    if (verdict === "fast") {
      points += SCORE.fast;
      reasons.push({ label: "fast", points: SCORE.fast });
    }
    /* Recalling something the scheduler had let lie for weeks is the strongest evidence of
       a durable memory that a single answer can give, so it is the largest single bonus. */
    if (stabilityDays >= 21) {
      const p = Math.min(SCORE.memoryMax, Math.round((Math.min(stabilityDays, SCORE.memoryCapDays) / SCORE.memoryCapDays) * SCORE.memoryMax));
      if (p > 0) { points += p; reasons.push({ label: "held", points: p }); }
    }
  }
  if (comeback) {
    points += SCORE.comeback;
    reasons.push({ label: "comeback", points: SCORE.comeback });
  }
  return { points, reasons };
}

/* A card the scheduler had left alone for weeks, answered right, is worth calling out —
   it is the moment spacing visibly paid off, and it is invisible in the current UI. */
export const MEMORY_CHECK_DAYS = 21;
export function isMemoryCheck(stabilityDays, ok) {
  return !!ok && (stabilityDays || 0) >= MEMORY_CHECK_DAYS;
}

/* ── recovery: turn a miss into a sequence that ends in success ──
   A failure used to do one thing: lower the cue by a rung and show the same card again
   later. That is a correction, not a rescue — the learner still meets the item at roughly
   the demand that just beat them, and the session's emotional shape is "you got it wrong,
   here it is again".

   A recovery is a short staged ladder instead. It starts BELOW the level that failed —
   low enough to be a near-certain success — and climbs back to the demand that was
   originally being asked, over two or three beats. The learner ends on a success they
   actually produced, which is both the better memory outcome (successful retrieval is what
   builds stability; a failed one builds very little) and the better game beat.

   Which ladder depends on WHAT broke, which the app already diagnoses into seven kinds.
   A reading fumble means the word WAS retrieved and only the form slipped, so it routes
   through hearing it rather than back to meaning; a blank means nothing came at all and
   has to restart from recognition. Each ladder ends at or just below the demand that
   failed, never above it.

   Pure and data-only: it returns descriptors, and the caller renders them. */
export const RECOVERY_LADDERS = {
  meaning:     [{ skill: "recognition", cue: CUE.CHOOSE }, { skill: "recognition", cue: CUE.FREE }],
  blank:       [{ skill: "recognition", cue: CUE.CHOOSE }, { skill: "recognition", cue: CUE.STRONG }, { skill: "recognition", cue: CUE.FREE }],
  reading:     [{ skill: "listening",   cue: CUE.CHOOSE }, { skill: "production",  cue: CUE.PARTIAL }, { skill: "production", cue: CUE.FREE }],
  production:  [{ skill: "recognition", cue: CUE.CHOOSE }, { skill: "production",  cue: CUE.PARTIAL }, { skill: "production", cue: CUE.FREE }],
  orthography: [{ skill: "production",  cue: CUE.PARTIAL }, { skill: "production", cue: CUE.FREE }],
  listening:   [{ skill: "listening",   cue: CUE.CHOOSE }, { skill: "listening",   cue: CUE.FREE }],
  context:     [{ skill: "recognition", cue: CUE.CHOOSE }, { skill: "context",     cue: CUE.CONTEXT }],
  /* No trip back to meaning: the learner demonstrably had the word. Give the form back
     with support, then ask for it clean. */
  conjugation: [{ skill: "production",  cue: CUE.PARTIAL }, { skill: "production", cue: CUE.FREE }],
};
/* Shown above each rescue step. Deliberately not "wrong" or "try again": the framing is
   that the system is helping you crack this one, because that is what it is doing. */
export const RECOVERY_NOTE = {
  meaning:     "Let's find it again.",
  blank:       "Nothing came. Start from the meaning.",
  reading:     "You had the word — the reading slipped. Hear it first.",
  production:  "Let's build back up to producing it.",
  orthography: "Close. Let's nail the form.",
  listening:   "Listen again, with options this time.",
  context:     "Secure the word, then use it.",
  conjugation: "You had the word — it was the form. Let's rebuild it.",
};

/** Stages for rescuing one miss. `caps` drops rungs the item cannot support (no audio, no
 *  typeable reading), and the ladder is trimmed so it never asks for MORE than the demand
 *  that just failed — a miss is not a reason to raise the bar. Returns [] when there is
 *  nothing sensible to do, and the caller falls back to a plain requeue. */
export function buildRecovery(failure, opts = {}) {
  const caps = opts.caps || {};
  const failedAt = typeof opts.failedCue === "number" ? opts.failedCue : null;
  const ladder = RECOVERY_LADDERS[failure];
  if (!ladder) return [];
  const usable = ladder.filter((s) => {
    if (s.skill === "listening" && caps.listen === false) return false;
    if (s.skill === "production" && caps.type === false) return false;
    if (s.skill === "context" && caps.context === false) return false;
    return true;
  });
  const capped = failedAt === null ? usable : usable.filter((s) => s.cue <= failedAt);
  /* Nothing in this ladder is gentle enough — e.g. an orthography miss at CUE.CHOOSE, when
     that ladder only offers PARTIAL and FREE. Falling back to the ladder's own lowest rung
     would hand back a HARDER question than the one just failed, so drop out of the skill
     entirely and go back to picking it out, which is the universal floor. */
  const stages = capped.length
    ? capped
    : [{ skill: "recognition", cue: Math.min(CUE.CHOOSE, failedAt === null ? CUE.CHOOSE : failedAt) }];
  return stages.map((s, i) => ({
    ...s,
    stage: i,
    last: i === stages.length - 1,
    format: formatFromSkillCue(s.skill, s.cue),
    direction: directionFor(s.skill),
    note: i === 0 ? (RECOVERY_NOTE[failure] || "Let's crack this one.") : null,
  }));
}

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

/* ── mistakes that are still mistakes ──
   The evidence log holds every miss the learner has ever made, which is not the same thing
   as a list of what they still get wrong. Most misses get fixed — that is what the app is
   for — and a feed that keeps handing back a word repaired three weeks ago is a feed nobody
   can act on. So this selector answers the narrower and much more useful question: which
   items broke and have NOT since been shown to be repaired.

   Two things retire an error, and they are deliberately the only two:

     1. A CUE-FREE SUCCESS on that item. Getting it right with options on screen is not
        evidence that the underlying knowledge was repaired — the answer was in front of
        them. Nothing below CUE.FREE clears anything, which is the whole point: the bar for
        "fixed" has to be higher than the bar that was failed, or the list empties itself.
     2. A COMPLETED RECOVERY CHAIN — the last rung of a rescue, answered right. That rung IS
        a cue-free retrieval by construction (the ladders end at FREE or CONTEXT), so this
        is mostly rule 1 restated; it is written down separately because a rescue that ends
        in a context exercise should count, and because the tag is what makes "recovered"
        legible in the log rather than inferred.

   One error per item, newest kept: the feed drives a mistake-recovery SLOT and quest
   progress (MP-19), and both want "this item is broken, here is the freshest evidence of
   how", not a transcript. `misses` carries the count so a word that has broken five times
   since it was last repaired can be told from one that slipped once.

   Pure: rows in, rows out, no clock of its own (pass `now`). Tested in
   tools/test-learner.mjs. */

/** The identity an evidence row belongs to, and what a mistake is deduped by. DECK-qualified,
 *  because ids are only unique within a deck — the same numeric id in `vocab` and in a mined
 *  deck are different words, and collapsing them would retire an error with a success on
 *  something else entirely. `summarise` builds the same key inline; this is the named version
 *  the selectors share. */
export function itemKey(row) {
  return (row && row.deck ? row.deck : "vocab") + ":" + (row ? row.id : "");
}

/** True when this row is a retrieval clean enough to retire an outstanding error. */
function clearsError(e, clearAt) {
  if (!e || !e.ok) return false;
  const rec = parseRecovery(e.recovery);
  if (rec && rec.last) return true;
  return typeof e.cue === "number" && e.cue >= clearAt;
}

/** Unrecovered errors, newest first, one per item.
 *
 *  @param evidence  makeEvidence rows
 *  @param opts      { now, days = 90, limit = 20, clearAt = CUE.FREE }
 *  @returns [{ key, id, deck, format, skill, failure, cue, got, want, confused, ms, at, misses }]
 */
export function recentErrors(evidence = [], opts = {}) {
  const now = opts.now || Date.now();
  const windowMs = (opts.days || 90) * 86400000;
  const clearAt = opts.clearAt ?? CUE.FREE;
  const limit = opts.limit ?? 20;

  /* Chronological, because the rule is a sequence rule: whether an error still stands
     depends on what happened AFTER it. The log is normally already in order — both the
     local ring buffer and mergeEvidence append — so this sort is nearly free, and doing it
     anyway is cheaper than a bug that only appears on a device that synced out of order. */
  const rows = (evidence || [])
    .filter((e) => e && e.at && e.id != null)
    .slice()
    .sort((a, b) => a.at - b.at);

  const open = new Map();
  for (const e of rows) {
    const key = itemKey(e);
    if (!e.ok) {
      const prev = open.get(key);
      open.set(key, { row: e, misses: (prev ? prev.misses : 0) + 1 });
      continue;
    }
    if (clearsError(e, clearAt)) open.delete(key);
  }

  /* The age filter lands HERE rather than on the way in. A success from outside the window
     still repairs an error inside it — dropping old rows first would resurrect mistakes the
     learner has demonstrably fixed, which is the exact failure this selector exists to
     avoid. Only the surviving ERRORS are aged out. */
  const out = [];
  for (const { row, misses } of open.values()) {
    if (now - row.at > windowMs) continue;
    out.push({
      key: itemKey(row),
      id: row.id,
      deck: row.deck || "vocab",
      format: row.format || null,
      skill: row.skill || null,
      failure: row.failure || null,
      cue: typeof row.cue === "number" ? row.cue : null,
      /* Absent on rows written before the strings were recorded. Null rather than "" so a
         consumer can tell "we did not keep it" from "they answered with nothing" — which is
         a real and separately diagnosed failure (`blank`). */
      got: row.got || null,
      want: row.want || null,
      confused: row.confused || null,
      ms: row.ms || 0,
      at: row.at,
      misses,
    });
  }
  out.sort((a, b) => b.at - a.at);
  return limit > 0 ? out.slice(0, limit) : out;
}
