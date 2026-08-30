/* ── the 34 textbook dialogues, turned into exercises ──

   The app ships with 34 scripts from NihonGO NOW! — real dialogue, already segmented into
   tokens, already carrying readings, romaji and an English line, already levelled to the
   course Matthew is actually taking. Until now exactly one thing was made out of them:
   contextual cloze (tools/cloze.mjs). Everything else the dialogues could teach — who
   speaks how, what a reply to this looks like, how the turns hang together — was sitting
   in the data unused.

   The rule this file follows is the one the design doc states twice: GENERATE, DON'T
   AUTHOR. Nothing here writes a Japanese sentence. Every prompt, every answer and every
   distractor is a line somebody actually wrote in the textbook, moved around. An invented
   sentence can be wrong in ways nobody notices; a real one cannot.

   ── what comes out ──

   SPEAKER   a line, and the question of who said it. Two speakers is a coin flip on its
             face and is not one in practice: Kanda and Sasha differ by REGISTER, and
             telling 頑張ります from よろしく by who would say it is the actual skill.
   RESPONSE  a line, and the real next line among plausible wrong ones drawn from other
             dialogues. The deterministic half of the dialogue mode — no API key needed.
   ORDER     three or four consecutive turns, shuffled, to be put back in sequence.
   CLOZE     a word blanked out of one line, delegated whole to tools/cloze.mjs.

   ── what does NOT come out ──

   A generator returns `null` when the material cannot support it — the same idiom as
   orderDrill and clozeFor, and a normal outcome rather than an error. `activitiesFor`
   collects those refusals WITH a reason attached, because "this script produced two
   activity types" is only useful next to why it did not produce more.

   Pure: no clock, no storage, no randomness that is not seeded. */

import { lineText, buildClozeIndex, clozeFor, clozeChoices } from "./cloze.mjs";
import { shuffled, DRILL } from "./production.mjs";
import { modesForFormat } from "./learner.mjs";

/* Format strings, kept distinct from the six the session engine emits so that "what did
   the textbook dialogues actually buy me" stays a question the gain metric can answer.
   Their cognitive modes live in learner.mjs FORMAT_MODES with everything else's. */
export const SCRIPT_FORMATS = {
  SPEAKER: "script_speaker",
  RESPONSE: "script_response",
  ORDER: "script_order",
  CLOZE: "script_cloze",
};

/* How many turns an ORDER puzzle asks for. Three is the floor — two tiles is a coin flip
   dressed as practice, which is the same reason orderDrill refuses short sentences. */
export const ORDER_MIN = 3, ORDER_MAX = 4;

/* ── provenance ──
   Script ids encode where in the book the dialogue sits: "seed-2-3" is Act 2, Scene 3.
   Two of the 34 do not fit the pattern ("seed-culture-talk"), and two carry a suffix
   ("seed-3-2b", "seed-3-5-drill") that must not be read as part of the scene number.
   Returns nulls rather than guessing, so a script outside the act structure simply loses
   act-based distractor tiering instead of being filed under a made-up act. */
export function actSceneOf(scriptId) {
  const m = /^seed-(\d+)-(\d+)/.exec(String(scriptId || ""));
  if (!m) return { act: null, scene: null };
  return { act: Number(m[1]), scene: Number(m[2]) };
}

/** Everything an activity has to be able to say about where it came from. `scriptId` and
 *  `lineIdx` are the required pair; act and scene ride along because they are free here
 *  and the alternative is every caller re-parsing the id. */
export function provenanceFor(script, lineIdx) {
  const { act, scene } = actSceneOf(script && script.id);
  return {
    scriptId: (script && script.id) || null,
    scriptName: (script && script.name) || null,
    lineIdx,
    act,
    scene,
  };
}

/* Distinct speakers, in the order they first talk. Order matters: it is what makes the
   choice list stable for a given seed. */
export function speakersOf(script) {
  const out = [];
  for (const line of (script && script.lines) || []) {
    const s = line && line.speaker;
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/* Deterministic index into a list of n. Multiplied by a large stride rather than used
   directly, for the reason drillSet already documents: adding one per call walks a
   contiguous window, so consecutive seeds draw overlapping material. */
function pick(n, seed) {
  if (n <= 0) return -1;
  return (Math.abs(Math.floor(seed || 0)) * 37) % n;
}

/* Is this line usable as material at all? An empty line, or one with no English, cannot
   be turned into a question a learner could answer. */
function usable(line) {
  return !!(line && lineText(line).trim());
}

/* ── who said it ──
   The line, and a choice between the people in the dialogue.

   Refuses two cases. A one-speaker script (the culture talk, and Kuno's monologue) has no
   question to ask. And a line whose exact text is also spoken by somebody ELSE in the same
   dialogue has two correct answers — はい。 gets said by both of them — so it is not a
   question either, however good it looks. */
export function speakerQuiz(script, lineIdx, seed = 0) {
  const lines = (script && script.lines) || [];
  const line = lines[lineIdx];
  if (!usable(line) || !line.speaker) return null;
  const speakers = speakersOf(script);
  if (speakers.length < 2) return null;

  const text = lineText(line);
  for (let i = 0; i < lines.length; i++) {
    if (i === lineIdx) continue;
    if (lines[i] && lines[i].speaker !== line.speaker && lineText(lines[i]) === text) return null;
  }

  return {
    format: SCRIPT_FORMATS.SPEAKER,
    modes: modesForFormat(SCRIPT_FORMATS.SPEAKER),
    provenance: provenanceFor(script, lineIdx),
    prompt: text,
    romaji: line.romaji || "",
    en: line.en || "",
    answer: line.speaker,
    choices: shuffled(speakers, seed + lineIdx),
  };
}

/* ── what comes next ──
   Given a line, the real reply among wrong ones.

   The answer is the next line only when a DIFFERENT person says it. A speaker continuing
   their own turn is not a response, and asking "what does she say back" about her own
   second sentence teaches the wrong shape of conversation.

   Distractors come from other dialogues, tiered the way MP-07 asks for: same act first,
   then adjacent acts, then anywhere. A wrong answer from the same chapter is worth far
   more than one from a chapter the learner has not reached — it is made of words they
   know, so choosing needs comprehension rather than elimination. Within a tier, lines of
   a similar length come first, because a two-character reply against a twenty-character
   answer is answerable without reading either. */
export function responseSelect(script, lineIdx, seed = 0, scripts = [], n = 3) {
  const lines = (script && script.lines) || [];
  const cue = lines[lineIdx];
  const next = lines[lineIdx + 1];
  if (!usable(cue) || !usable(next)) return null;
  if (cue.speaker && next.speaker && cue.speaker === next.speaker) return null;

  const answer = lineText(next);
  /* Every line of THIS dialogue is barred from the distractor pool, not just the answer.
     A different line of the same conversation can be a perfectly reasonable thing to say
     at this point, and a distractor that might also be right is a broken question. */
  const own = new Set(lines.map(lineText));
  const here = actSceneOf(script && script.id).act;

  const seen = new Set();
  const pool = [];
  for (const other of scripts || []) {
    if (!other || other.id === (script && script.id)) continue;
    const act = actSceneOf(other.id).act;
    /* 0 = same act, 1 = next door, 2 = elsewhere or unplaceable. */
    const tier = act == null || here == null ? 2 : act === here ? 0 : Math.abs(act - here) === 1 ? 1 : 2;
    for (let i = 0; i < ((other.lines || []).length); i++) {
      const l = other.lines[i];
      if (!usable(l)) continue;
      const text = lineText(l);
      if (text === answer || own.has(text) || seen.has(text)) continue;
      seen.add(text);
      pool.push({ text, tier, gap: Math.abs(text.length - answer.length), en: l.en || "", scriptId: other.id });
    }
  }
  if (pool.length < 1) return null;

  /* Sorted to a total order — tier, then length distance, then the text itself — so the
     same seed genuinely returns the same question. A sort with ties left unbroken is not
     deterministic across engines, and "deterministic under seed" is the acceptance
     criterion this generator would fail most quietly. */
  pool.sort((a, b) => a.tier - b.tier || a.gap - b.gap || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  /* Draw from the plausible head of the pool rather than the single best few, so two
     seeds on the same line do not produce the same three wrong answers. */
  const head = pool.slice(0, Math.max(n, Math.min(pool.length, n * 6)));
  const wrong = [];
  for (let i = 0; i < head.length && wrong.length < n; i++) {
    const c = head[(pick(head.length, seed + lineIdx) + i) % head.length];
    if (wrong.some((w) => w.text === c.text)) continue;
    wrong.push(c);
  }

  const options = [{ text: answer, en: next.en || "", scriptId: script.id }, ...wrong];
  return {
    format: SCRIPT_FORMATS.RESPONSE,
    modes: modesForFormat(SCRIPT_FORMATS.RESPONSE),
    provenance: provenanceFor(script, lineIdx),
    prompt: lineText(cue),
    promptSpeaker: cue.speaker || "",
    promptEn: cue.en || "",
    answer,
    answerSpeaker: next.speaker || "",
    en: next.en || "",
    choices: shuffled(options.map((o) => o.text), seed + lineIdx + 1),
    /* The English behind each option, so a correction can say what the wrong reply
       actually meant rather than only that it was wrong. */
    glosses: options.reduce((acc, o) => { acc[o.text] = o.en; return acc; }, {}),
  };
}

/* ── put the exchange back together ──
   Not a sentence reassembly — production.mjs already does that, and the script tokens are
   the wrong grain for it (they split where a reading annotation was needed, so most lines
   are one or two tiles). The unit here is the TURN, and the skill is conversational shape:
   a question comes before its answer, an offer before its acceptance.

   Shares production.mjs's shape and shuffle deliberately: the object carries
   `type: DRILL.ORDER` with `answer` and `tiles` as parallel string arrays, so gradeDrill
   grades it unchanged. */
export function lineOrder(script, seed = 0) {
  /* Filtered, but the ORIGINAL index rides along: provenance has to point at the line as
     it sits in the script, and re-indexing a filtered copy would quietly renumber every
     line after a dropped one. */
  const lines = ((script && script.lines) || [])
    .map((line, idx) => ({ line, idx }))
    .filter((x) => usable(x.line));
  if (lines.length < ORDER_MIN) return null;
  const size = Math.min(ORDER_MAX, lines.length);

  const starts = lines.length - size + 1;
  const from = pick(starts, seed);
  for (let step = 0; step < starts; step++) {
    const at = (from + step) % starts;
    const window = lines.slice(at, at + size).map((x) => x.line);
    const texts = window.map(lineText);
    /* A window with a repeated line has more than one correct ordering, and the grader
       accepts exactly one. Slide along rather than shrinking the window: a three-turn
       exchange elsewhere in the script is better material than a two-turn one here. */
    if (new Set(texts).size !== texts.length) continue;
    return {
      type: DRILL.ORDER,
      format: SCRIPT_FORMATS.ORDER,
      modes: modesForFormat(SCRIPT_FORMATS.ORDER),
      provenance: provenanceFor(script, lines[at].idx),
      prompt: "Put the exchange back in order.",
      answer: texts,
      tiles: shuffled(texts, seed + at),
      /* Aligned with `answer`, for the correction screen. Deliberately NOT on the tiles:
        speakers alternate, so labelling the pieces would give most of the puzzle away. */
      speakers: window.map((l) => l.speaker || ""),
      en: window.map((l) => l.en || ""),
    };
  }
  return null;
}

/* ── a blank in a real line ──
   Delegated whole to tools/cloze.mjs rather than reimplemented. That module already knows
   the things worth knowing here — longer terms win over shorter ones inside them, a line
   that IS the word teaches nothing about the word, the choices prefer what this learner
   has actually confused — and a second copy of that judgement would drift from the first.

   The delegation is a one-line index: buildClozeIndex takes scripts, so it is handed a
   script containing only the line in question, and comes back with exactly the cards that
   occur in it. */
export function lineCloze(script, lineIdx, cards = [], opts = {}) {
  const lines = (script && script.lines) || [];
  const line = lines[lineIdx];
  if (!usable(line) || !line.en) return null;

  const one = { id: (script && script.id) || "", name: (script && script.name) || "", lines: [line] };
  const index = buildClozeIndex([one], cards);
  if (!index.size) return null;

  /* The longest term makes the most contentful blank — blanking 大丈夫 asks more than
     blanking です. Tie-broken on term then id so the choice is stable. */
  const hits = [...index.keys()]
    .map((id) => cards.find((c) => c && c.id === id))
    .filter(Boolean)
    .sort((a, b) => b.term.length - a.term.length
      || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0)
      || (String(a.id) < String(b.id) ? -1 : 1));
  const card = hits[0];
  if (!card) return null;

  const seed = opts.seed == null ? lineIdx : opts.seed;
  const ex = clozeFor(index, card, { seed });
  if (!ex) return null;

  const choices = clozeChoices(card, cards, opts.choices || 3, seed, opts.confusedWith || []);
  return {
    format: SCRIPT_FORMATS.CLOZE,
    modes: modesForFormat(SCRIPT_FORMATS.CLOZE),
    provenance: provenanceFor(script, lineIdx),
    id: card.id,
    answer: card.term,
    reading: card.reading || "",
    before: ex.before,
    after: ex.after,
    blank: ex.blank,
    sentence: ex.sentence,
    en: ex.en,
    romaji: line.romaji || "",
    choices: choices.map((c) => c.term),
  };
}

/* ── everything one script can make ──
   Walks the four generators across the script's lines and returns what came out, plus a
   stated reason for each type that produced nothing. The reasons are the point: a script
   yielding two activity types is fine when the third refusal is "only two turns", and is
   a bug when it is silence. */
export function activitiesFor(script, opts = {}) {
  const seed = opts.seed || 0;
  const scripts = opts.scripts || [];
  const cards = opts.cards || [];
  const lines = (script && script.lines) || [];
  const activities = [];
  const skipped = [];

  /* Each generator is tried from a seeded starting line and walked all the way round, so
     one unusable line does not cost the whole activity type. */
  const sweep = (format, make, why) => {
    if (!lines.length) { skipped.push({ format, reason: "the script has no lines" }); return; }
    const from = pick(lines.length, seed);
    for (let step = 0; step < lines.length; step++) {
      const i = (from + step) % lines.length;
      const a = make(i);
      if (a) { activities.push(a); return; }
    }
    skipped.push({ format, reason: why });
  };

  sweep(SCRIPT_FORMATS.SPEAKER, (i) => speakerQuiz(script, i, seed),
    speakersOf(script).length < 2
      ? "only one speaker — there is nobody to confuse them with"
      : "every line is said by both speakers, so who said it has no single answer");

  sweep(SCRIPT_FORMATS.RESPONSE, (i) => responseSelect(script, i, seed, scripts, opts.choices || 3),
    scripts.length < 2
      ? "no other scripts to draw wrong replies from"
      : "no line is followed by another speaker's reply");

  const order = lineOrder(script, seed);
  if (order) activities.push(order);
  else {
    skipped.push({
      format: SCRIPT_FORMATS.ORDER,
      reason: lines.filter(usable).length < ORDER_MIN
        ? "fewer than " + ORDER_MIN + " turns — too short to reassemble"
        : "every window of turns repeats a line, so more than one order would be correct",
    });
  }

  sweep(SCRIPT_FORMATS.CLOZE, (i) => lineCloze(script, i, cards, { seed }),
    cards.length
      ? "no line contains a word from the deck that could be blanked"
      : "no deck was supplied to blank a word from");

  return { activities, skipped };
}
