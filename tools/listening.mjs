/* ── listening, built out of the textbook dialogues ──

   Spec §8. Everything else in the app puts Japanese on the screen and asks about it. This
   file asks about Japanese the learner has only HEARD: the line plays, the text stays
   hidden, and the answer has to come out of the sound. That is the one channel the deck
   cannot practise on its own — a word you can read on sight and cannot catch at speed is
   a word you do not have in a conversation — and the learner model has said so for a while
   (`listening` is a skill with almost no evidence behind it).

   The exercises are not new material. They are the MP-15 generators with the presentation
   inverted, which is why this file is so much smaller than tools/scriptplay.mjs:

     MEANING   the line, and the choice of what it meant — its English against other
               dialogues' English. Same pool discipline as responseSelect: every line of
               THIS script is barred, because a neighbouring turn can mean nearly the same
               thing and a distractor that might also be right is a broken question.
     MISSING   one content word blanked out of the line, delegated whole to lineCloze (and
               so, through it, to cloze.mjs and the curriculum-aware distractors of MP-07).
     SPEAKER   who said it, delegated whole to speakerQuiz. Multi-speaker scripts only —
               the generator already refuses the rest.

   ── what makes it a LISTENING exercise rather than a reading one ──

   Only the presentation. The component plays `audio` and renders `prompt` and `choices`;
   `reveal` is what it may show once an answer is in, and nothing in it may be shown before.
   Keeping the hidden half in its own object is deliberate — a field the UI must not render
   yet is safer as a nested object it has to reach into than as six loose siblings of the
   fields it renders every time.

   ── honest labelling (§29) ──

   The spec asks that textbook audio and generated audio be distinguished. We have no
   textbook audio, so every exercise carries `voice: "generated"` and the UI says so. The
   LINES are authentic; the voice is not, and pretending otherwise would misrepresent what
   the learner is training against.

   Pure: no clock, no storage, no DOM, no randomness that is not seeded. */

import { lineText } from "./cloze.mjs";
import { shuffled } from "./production.mjs";
import { modesForFormat } from "./learner.mjs";
import { actSceneOf, provenanceFor, speakerQuiz, lineCloze } from "./scriptplay.mjs";
import { provenanceOfScript, provenanceOf, coordsOf } from "./curriculum.mjs";

/* Format strings, kept distinct from both the session engine's six and MP-15's four. A
   listening meaning-choice and a read meaning-choice are the same question through
   different senses, and folding them together would make "is my listening actually
   improving" unanswerable. Their cognitive modes live in learner.mjs FORMAT_MODES. */
export const LISTEN_FORMATS = {
  MEANING: "listen_meaning",
  MISSING: "listen_missing",
  SPEAKER: "listen_speaker",
};

/* What each task is called on screen and on the done summary. Kept next to the formats for
   the same reason SKILL_LABEL sits next to SKILLS: a label that lives in the component is a
   label the tests cannot check against the list it is supposed to cover. */
export const LISTEN_LABEL = {
  listen_meaning: "What it meant",
  listen_missing: "Word inside it",
  listen_speaker: "Who said it",
};

/* Every exercise here files under one skill. That is the point of the mode: the channel is
   what is being tested, whatever the question happens to be about. */
export const LISTEN_SKILL = "listening";

/* The deck name these rows carry, so the evidence log can be split by where an answer came
   from. "scripts" is the value the app's own areaForDeck already knows. */
export const LISTEN_DECK = "scripts";

/* Is this line usable as material at all? Same rule and same name as scriptplay's. */
function usable(line) {
  return !!(line && lineText(line).trim());
}

/* Deterministic index into a list of n — scriptplay's `pick`, repeated rather than exported
   from there because it is three lines and a shared private helper across two modules is a
   coupling that buys nothing. */
function pick(n, seed) {
  if (n <= 0) return -1;
  return (Math.abs(Math.floor(seed || 0)) * 37) % n;
}

/* A stable hash of a string under a seed. Used to order scripts: a modular stride over a
   list walks a contiguous window, so consecutive seeds would draw overlapping sessions,
   which is exactly the "ten questions on one script" complaint this is here to avoid. */
function hashOf(s, seed) {
  const str = String(s == null ? "" : s);
  let h = ((seed >>> 0) + 2166136261) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/* ── the provenance chip ──
   "Act 2-3 · script", from the curriculum module rather than from a second parse of the id.
   A script the taxonomy cannot place keeps its own name instead of being filed under a
   made-up act — the same refusal curriculum.mjs makes everywhere else. */
export function provenanceLabel(script) {
  const p = provenanceOfScript(script);
  if (!Number.isFinite(p.act)) return p.section || (script && script.name) || "script";
  const where = Number.isFinite(p.scene) ? "Act " + p.act + "-" + p.scene : "Act " + p.act;
  return where + " · script";
}

/* ── what did it mean ──
   The line's English against other dialogues' English.

   Distractors are tiered the way responseSelect tiers Japanese ones, and for the same
   reason: a wrong meaning from the same act is made of situations the learner has met, so
   choosing needs comprehension rather than elimination. Within a tier the closest lengths
   come first, because a four-word gloss among three one-word ones is answerable without
   hearing anything. */
export function meaningChoice(script, lineIdx, seed = 0, scripts = [], n = 3) {
  const lines = (script && script.lines) || [];
  const line = lines[lineIdx];
  if (!usable(line) || !line.en) return null;
  const answer = String(line.en).trim();
  if (!answer) return null;

  /* Every English in THIS dialogue is barred, not only the answer's. Two turns of one
     conversation routinely gloss almost identically ("Yes." / "Yes, that's right."), and a
     distractor that could also be a fair reading of what was said is not a distractor. */
  const own = new Set(lines.map((l) => String((l && l.en) || "").trim()).filter(Boolean));
  const here = actSceneOf(script && script.id).act;

  const seen = new Set();
  const pool = [];
  for (const other of scripts || []) {
    if (!other || other.id === (script && script.id)) continue;
    const act = actSceneOf(other.id).act;
    /* 0 = same act, 1 = next door, 2 = elsewhere or unplaceable. */
    const tier = act == null || here == null ? 2 : act === here ? 0 : Math.abs(act - here) === 1 ? 1 : 2;
    for (const l of (other.lines || [])) {
      if (!usable(l) || !l.en) continue;
      const en = String(l.en).trim();
      if (!en || en === answer || own.has(en) || seen.has(en)) continue;
      seen.add(en);
      pool.push({ en, tier, gap: Math.abs(en.length - answer.length) });
    }
  }
  if (!pool.length) return null;

  // Sorted to a TOTAL order, so the same seed genuinely returns the same question.
  pool.sort((a, b) => a.tier - b.tier || a.gap - b.gap || (a.en < b.en ? -1 : a.en > b.en ? 1 : 0));
  const head = pool.slice(0, Math.max(n, Math.min(pool.length, n * 6)));
  const wrong = [];
  for (let i = 0; i < head.length && wrong.length < n; i++) {
    const c = head[(pick(head.length, seed + lineIdx) + i) % head.length];
    if (wrong.includes(c.en)) continue;
    wrong.push(c.en);
  }
  if (!wrong.length) return null;

  /* Refuse a question the learner could win with a ruler. Two of the 34 dialogues carry a
     self-introduction several hundred characters long, and no other line in the book comes
     near it — so its meaning question puts one paragraph against three one-liners and is
     answerable without hearing a syllable. The line is not wasted: listeningExercise falls
     through to the missing-word or speaker question for it instead.

     Both halves of the test matter. The ratio alone would refuse "Yes." against "Is that
     so.", which is a perfectly good question that happens to be 2.75x; the absolute gap
     alone would refuse ordinary long sentences that have ordinary long neighbours. */
  const closest = Math.min(...wrong.map((w) => Math.abs(w.length - answer.length)));
  const longest = Math.max(answer.length, ...wrong.map((w) => w.length));
  const shortest = Math.min(answer.length, ...wrong.map((w) => w.length));
  if (closest > 40 && shortest > 0 && longest / shortest > 2.5) return null;

  return dress(script, lineIdx, {
    format: LISTEN_FORMATS.MEANING,
    prompt: "What did you hear?",
    answer,
    choices: shuffled([answer, ...wrong], seed + lineIdx),
    /* No card behind this one, so the line itself is the item the evidence names. */
    evidenceId: lineKey(script, lineIdx),
  });
}

/* ── which word was missing ──
   Delegated whole to lineCloze, which delegates in turn to cloze.mjs and MP-07's
   distractors. Nothing about picking the blank or its options changes because the line is
   heard rather than read; what changes is that the SENTENCE is not on screen while the
   question is live, so `before`/`after` ride in `reveal` and only the options are shown.

   Two additions. `choiceIds` maps each option back to a card, because lineCloze returns
   option TERMS and the confusion graph is keyed by card id at both ends — without it every
   wrong pick here would be invisible to the distractor sourcing that could use it most.

   And `opts.confusion` — the whole confusionFrom() map rather than one card's list, because
   which card gets blanked is lineCloze's decision and not knowable beforehand. So the
   generator is run once to find out which word it chose, and again with that word's own
   confusion history in hand. The seed is unchanged, so the second run picks the same line
   and the same word; only the wrong options move, which is the point. */
export function missingWord(script, lineIdx, cards = [], opts = {}) {
  let ex = lineCloze(script, lineIdx, cards, opts);
  if (!ex) return null;
  const confusion = opts.confusion;
  const pairs = confusion && confusion.get ? confusion.get(ex.id) : null;
  if (pairs && pairs.length && !(opts.confusedWith || []).length) {
    ex = lineCloze(script, lineIdx, cards, { ...opts, confusedWith: pairs }) || ex;
  }
  /* A one-option question is not a question. lineCloze can produce one when the deck it was
     handed is too thin for pickDistractors to fill the list — a fixture, a filtered deck, or
     (the case that actually happened) cards that carry no id, which the distractor pool
     silently excludes. Refusing here is the same idiom every generator above uses. */
  if (!ex.choices || ex.choices.length < 2) return null;
  const byTerm = new Map();
  for (const c of cards || []) if (c && c.term && !byTerm.has(c.term)) byTerm.set(c.term, c.id);
  const choiceIds = {};
  for (const term of ex.choices) if (byTerm.has(term)) choiceIds[term] = byTerm.get(term);

  return dress(script, lineIdx, {
    format: LISTEN_FORMATS.MISSING,
    prompt: "Which word was in it?",
    answer: ex.answer,
    choices: ex.choices,
    choiceIds,
    /* The CARD, not the line. This answer is evidence about a knowledge entity the rest of
       the app already tracks (spec §26), and keying it anywhere else would strand it: the
       confusion graph, the distractor sourcing and the per-word history all look items up
       by card id. The line is still on the exercise, in `provenance`. */
    evidenceId: ex.id,
    blank: { before: ex.before, after: ex.after, blank: ex.blank, sentence: ex.sentence },
    answerReading: ex.reading || "",
  });
}

/* ── who said it ──
   speakerQuiz unchanged, with the text moved out of the prompt and into the reveal. The
   generator already refuses one-speaker scripts and lines both speakers say, so there is
   nothing left to decide here. */
export function speakerCall(script, lineIdx, seed = 0) {
  const q = speakerQuiz(script, lineIdx, seed);
  if (!q) return null;
  return dress(script, lineIdx, {
    format: LISTEN_FORMATS.SPEAKER,
    prompt: "Who said it?",
    answer: q.answer,
    choices: q.choices,
    evidenceId: lineKey(script, lineIdx),
  });
}

/* The identifier for a line as an evidence item: "seed-2-3#4". Parseable back to an act by
   curriculum.mjs's coordsOf, which is what lets a listening session count toward "acts this
   learner has met" on the next run. */
export function lineKey(script, lineIdx) {
  return String((script && script.id) || "") + "#" + lineIdx;
}

/* Everything the three generators share, filled in once. Splitting the hidden half into
   `reveal` is the load-bearing part: an exercise is audio-first only for as long as no
   caller can accidentally render the Japanese, and one nested object is a boundary a code
   review can actually check. */
function dress(script, lineIdx, ex) {
  const line = ((script && script.lines) || [])[lineIdx] || {};
  return {
    ...ex,
    skill: LISTEN_SKILL,
    deck: LISTEN_DECK,
    modes: modesForFormat(ex.format),
    /* Authentic line, synthesised voice — stated on the exercise so the UI cannot forget
       to say it and the log can tell the two apart if textbook audio ever arrives (§29). */
    voice: "generated",
    // What to speak. Plain text, ruby stripped: the TTS endpoint reads a string.
    audio: lineText(line),
    provenance: { ...provenanceFor(script, lineIdx), label: provenanceLabel(script) },
    reveal: {
      // Tokens rather than text, so the component can put furigana over the kanji with the
      // same <Furigana> it already uses everywhere else.
      tokens: (line.tokens || []).slice(),
      text: lineText(line),
      romaji: line.romaji || "",
      en: line.en || "",
      speaker: line.speaker || "",
    },
  };
}

/* ── one line, whichever question it can carry ──
   `prefer` is an order to try, not a filter: a line that cannot support the preferred task
   falls through to the next rather than being skipped, because a script with one speaker
   still has meanings worth hearing. Returns null only when the line supports nothing. */
export const LISTEN_ORDER = [LISTEN_FORMATS.MEANING, LISTEN_FORMATS.MISSING, LISTEN_FORMATS.SPEAKER];

export function listeningExercise(script, lineIdx, opts = {}) {
  const seed = opts.seed || 0;
  const order = (opts.prefer && opts.prefer.length ? opts.prefer : LISTEN_ORDER);
  for (const format of order) {
    let ex = null;
    if (format === LISTEN_FORMATS.MEANING) ex = meaningChoice(script, lineIdx, seed, opts.scripts || [], opts.choices || 3);
    else if (format === LISTEN_FORMATS.MISSING) ex = missingWord(script, lineIdx, opts.cards || [], { seed, choices: opts.choices || 3, confusion: opts.confusion, confusedWith: opts.confusedWith || [] });
    else if (format === LISTEN_FORMATS.SPEAKER) ex = speakerCall(script, lineIdx, seed);
    if (ex) return ex;
  }
  return null;
}

/* ── which acts has this learner actually met ──
   Read off the evidence log rather than off a "current lesson" setting, because the log is
   the only record of what was practised and a setting is a claim. Two id shapes are
   understood, which is exactly the two the log contains: a card id, placed through the
   deck by curriculum.mjs, and a "scriptId#lineIdx" written by this file on a previous run.

   An empty log returns an empty map, and every caller below treats that as "no preference"
   rather than "nothing is eligible" — a first listening session must not be empty. */
export function actsMet(evidence = [], cards = [], opts = {}) {
  const byId = new Map();
  for (const c of cards || []) if (c && c.id != null && !byId.has(c.id)) byId.set(c.id, c);
  const since = opts.since || 0;
  const out = new Map();
  for (const e of evidence || []) {
    if (!e || (e.at || 0) < since) continue;
    let act = null;
    const card = byId.get(e.id);
    if (card) act = provenanceOf(card).act;
    else if (typeof e.id === "string" && e.id.indexOf("#") > 0) act = coordsOf(e.id.slice(0, e.id.indexOf("#"))).act;
    if (!Number.isFinite(act)) continue;
    out.set(act, (out.get(act) || 0) + 1);
  }
  return out;
}

/* Scripts in the order a session should draw from them: acts the learner has met first,
   then everything else, each group in a seeded order.

   Deliberately only TWO tiers. Ranking met acts by how much evidence they carry would put
   the most-practised act first, which is the opposite of useful — and with no evidence at
   all every script lands in the second tier, so the ordering degrades to a seeded shuffle
   of all 34 rather than to nothing. */
export function rankScripts(scripts = [], met = new Map(), seed = 0) {
  return (scripts || [])
    .filter((s) => s && ((s.lines || []).some(usable)))
    .map((s) => {
      const act = provenanceOfScript(s).act;
      const seen = Number.isFinite(act) && met.get(act) > 0;
      return { s, tier: seen ? 0 : 1, k: hashOf(s.id || s.name, seed) };
    })
    .sort((a, b) => a.tier - b.tier || a.k - b.k)
    .map((x) => x.s);
}

/* Rotating task preference. A session that asked one question type ten times would be a
   listening drill for one skill, and the three tasks test genuinely different things —
   whole-utterance meaning, one word inside it, and register. Rotating rather than randomly
   choosing keeps the mix even at any session length. */
function preferenceAt(i) {
  const r = ((i % LISTEN_ORDER.length) + LISTEN_ORDER.length) % LISTEN_ORDER.length;
  return LISTEN_ORDER.slice(r).concat(LISTEN_ORDER.slice(0, r));
}

/* ── a session ──
   Round-robin across the ranked scripts, one exercise per script per pass, until `count` is
   reached or the material runs out. The round robin is the whole trick: taking the best
   script's lines until it is exhausted would produce a session that is ten questions on one
   dialogue, which is what the issue asks this not to be.

   Within a script the starting line is seeded and the walk goes all the way round, the same
   idiom as activitiesFor's sweep, so one unusable line does not cost the script its turn. */
export function listeningSet(opts = {}) {
  const scripts = opts.scripts || [];
  const cards = opts.cards || [];
  const seed = opts.seed || 0;
  const count = Math.max(1, Math.floor(opts.count || 8));
  const met = opts.met || actsMet(opts.evidence || [], cards, opts);
  const ranked = rankScripts(scripts, met, seed);
  if (!ranked.length) return [];

  const out = [];
  const usedLines = new Set();
  /* One pass per script per round; capped so a deck that can produce nothing terminates.
     The bound is the total number of lines available, which is the most passes that could
     ever produce a new exercise. */
  const maxPasses = ranked.reduce((n, s) => n + ((s.lines || []).length), 0) || 1;
  for (let pass = 0; pass < maxPasses && out.length < count; pass++) {
    let tookThisPass = 0;
    for (const script of ranked) {
      if (out.length >= count) break;
      const lines = (script.lines || []);
      if (!lines.length) continue;
      const from = pick(lines.length, seed + pass * 7);
      for (let step = 0; step < lines.length; step++) {
        const lineIdx = (from + step) % lines.length;
        const key = lineKey(script, lineIdx);
        if (usedLines.has(key)) continue;
        const ex = listeningExercise(script, lineIdx, {
          /* Advanced per EXERCISE, not only per pass. The distractor rankings are stable
             functions of the seed, so a session that handed every question the same one
             produced questions with the same option set twice — two different missing-word
             answers, offered against each other. `out.length` is as deterministic as the
             walk that produced it, so this costs nothing in reproducibility. */
          seed: seed + pass * 13 + out.length * 3,
          scripts,
          cards,
          choices: opts.choices || 3,
          confusion: opts.confusion,
          confusedWith: opts.confusedWith || [],
          prefer: preferenceAt(out.length + seed),
        });
        if (!ex) continue;
        usedLines.add(key);
        out.push(ex);
        tookThisPass++;
        break;
      }
    }
    if (!tookThisPass) break;      // nothing left anywhere; stop rather than spin
  }
  return out;
}

/* ── grading ──
   Trivial arithmetic, in a module rather than in the component, because the two things that
   hang off it are not trivial: which failure gets recorded, and which id the wrong pick is
   filed against. */
export function gradeListening(ex, choice) {
  if (!ex) return null;
  const chose = choice == null ? "" : String(choice);
  const ok = chose === ex.answer;
  return {
    ok,
    chose,
    answer: ex.answer,
    /* All three failures are "listening", including the missing-word one. It is tempting to
       call that one "context" the way the read cloze does, but the two are not the same
       claim: a learner who reads the sentence and picks the wrong word has a usage gap,
       while one who never saw the sentence may simply not have caught the word. Nothing
       here can tell those apart, so the honest attribution is the channel. */
    failure: ok ? null : "listening",
    /* Which wrong option, as a card id where there is one. The confusion graph is keyed by
       card id at both ends, so a term here would be a row it silently never matches. */
    confused: ok ? null : ((ex.choiceIds && ex.choiceIds[chose]) || null),
  };
}

/* The arguments for makeEvidence, so the one place evidence is constructed stays the one
   place. `mode` is deliberately absent: makeEvidence derives it from the format, which is
   what keeps FORMAT_MODES honest — an untagged format shows up as a gap in the analytics
   rather than borrowing modes this file made up. */
export function listeningEvidence(ex, grade, ms) {
  if (!ex || !grade) return null;
  return {
    id: ex.evidenceId,
    deck: ex.deck || LISTEN_DECK,
    format: ex.format,
    skill: LISTEN_SKILL,
    ok: grade.ok,
    ms: ms > 0 ? ms : 0,
    failure: grade.failure,
    confused: grade.confused,
  };
}

/* What the session did, for the done screen. Counts by task rather than by skill: the
   profile already reports the skill, and "which of the three did I actually get" is the
   question a listening session can answer that nothing else can. */
export function listeningSummary(rows = []) {
  const byFormat = {};
  let ok = 0, n = 0;
  for (const r of rows || []) {
    if (!r) continue;
    n += 1;
    if (r.ok) ok += 1;
    const f = r.format || "unknown";
    byFormat[f] = byFormat[f] || { n: 0, ok: 0 };
    byFormat[f].n += 1;
    if (r.ok) byFormat[f].ok += 1;
  }
  return { answered: n, correct: ok, byFormat };
}
