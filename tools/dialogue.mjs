/* ── dialogue mode: play one side of a real textbook conversation ──

   MP-16, spec §9 and §23. Every other script activity asks a question ABOUT a dialogue.
   This one puts the learner INSIDE it: they take a speaker's part, the other side plays
   through the speaker, and on every one of their turns they choose the line they actually
   say from among lines somebody else in the book actually said. At the end they have had
   the conversation, which is the thing the lesson was for — "I can use what I learned",
   not "you completed 15 cards".

   ── deterministic, on purpose ──

   The AI backend is unresolved (HANDOFF: no key set), so nothing here grades free text.
   The learner's line is CHOSEN, and every option is a real line from the corpus. That is
   not a placeholder for the AI version — it is the version that can never be wrong about
   Japanese, and the free-response variant slots in beside it rather than replacing it.
   The seam is marked at gradeTurn: a turn carries `answer` and `choices`, and a free
   turn would carry `answer` and no `choices`, with the Worker asked to judge the typed
   line. Everything else on this file — sequencing, the downshift, the evidence row, the
   summary — is already indifferent to which of the two produced the verdict.

   ── the shape of a run ──

   BEATS, not lines. A beat is "everything the other side says, then your turn". Grouping
   the NPC lines into the turn they set up is what keeps the conversation from becoming a
   slideshow the learner taps through: one tap per turn of THEIRS, none for anybody else's.
   The last beat usually has no turn at all — somebody has to say goodbye.

   ── never a dead end ──

   A miss does not end the conversation and cannot. The turn downshifts: the wrong option
   is removed and the rōmaji of the real line appears, then it is asked again; a second
   miss reveals it and the conversation carries on. `nextStep` is the whole ladder and it
   terminates in DONE from every state, which is a property a test can hold this file to.
   Only the FIRST attempt is evidence — see turnEvidence.

   Pure: no clock, no storage, no DOM, no randomness that is not seeded. */

import { lineText } from "./cloze.mjs";
import { responseSelect, provenanceFor, speakersOf, actSceneOf } from "./scriptplay.mjs";
import { provenanceLabel } from "./listening.mjs";
import { modesForFormat, CUE, scoreAnswer } from "./learner.mjs";

/* One format, distinct from MP-15's script_response even though the question on screen
   looks like it. Two reasons, and only one of them is bookkeeping. The bookkeeping one:
   "what did dialogue mode actually buy me" has to stay answerable, and a shared format
   string buries it — the same argument listening.mjs makes for its own three. The real
   one: a script_response is asked cold about an arbitrary line, while a dialogue turn is
   asked after hearing everything said so far, by someone holding one speaker's role for
   the whole conversation. Same options, different amount of context to bring to them.

   Its cognitive modes are DELIBERATELY identical to script_response's (learner.mjs
   FORMAT_MODES). The context above changes how hard the question is, not what the
   learner's head has to do, and claiming a third mode for it would be exactly the
   overcounting that table exists to prevent. */
export const DIALOGUE_FORMAT = "dialogue_turn";

/* Choosing the line that fits this moment is using the language in context. Not
   production — nothing was generated; not listening — the line is on screen. `context` is
   the one of the five SKILLS that means what happened here. */
export const DIALOGUE_SKILL = "context";

/* The deck these rows carry, matching listening.mjs and the app's own areaForDeck. */
export const DIALOGUE_DECK = "scripts";

/* What a beat's turn can be. A SAY turn is a learner line no honest question can be built
   for — the opening line of a conversation has no cue, and a speaker continuing their own
   turn is not responding to anything. It is played the way the rehearse ladder plays it:
   the English, then say it out loud, then reveal. It is not graded and writes no evidence,
   because inventing a question there would mean inventing Japanese, and the rule this
   whole family of modules follows is GENERATE, DON'T AUTHOR. */
export const TURN = { CHOICE: "choice", SAY: "say" };

/* The downshift ladder. ASK is the real question; CUE is the same question with the
   rōmaji showing and the wrong pick removed; REVEAL is the answer, taken. */
export const STEP = { ASK: "ask", CUE: "cue", REVEAL: "reveal", DONE: "done" };

/** Where a turn goes next. Correct always finishes; wrong walks one rung down and stops
 *  at REVEAL, which the learner acknowledges rather than answers. There is no path back
 *  to ASK and no path that repeats, so a turn cannot fail to complete. */
export function nextStep(step, ok) {
  if (ok) return STEP.DONE;
  if (step === STEP.ASK) return STEP.CUE;
  return STEP.REVEAL;
}

/* How many wrong options a turn offers. Three plus the answer fills a phone screen
   without scrolling and leaves room to drop one on the downshift and still have a
   question rather than a coin flip. */
export const CHOICES = 3;

/* Asked of responseSelect, so there is slack for the two filters below to throw options
   away without leaving the turn short. */
const OVERDRAW = 4;

/* ── the ruler test ──
   An option the learner can eliminate by its shape rather than by its meaning. Two of the
   34 dialogues carry a self-introduction several hundred characters long, and responseSelect
   ranks its pool by tier before length — so inside a small act, that paragraph is a
   candidate against a four-character いえいえ。 and the question is answerable without
   reading a word of it. The listening module refuses the whole question when this happens;
   here the option is simply dropped, which is strictly better because the turn survives.

   Both halves matter, and they are the same two the listening module settled on. The ratio
   alone would throw away はい。 against そうですか。, which is a perfectly good pair that
   happens to be 3x; the absolute gap alone would throw away ordinary long lines that have
   ordinary long neighbours. */
export function outOfScale(answer, text) {
  const a = String(answer || "").length, b = String(text || "").length;
  if (!a || !b) return false;
  if (Math.abs(a - b) <= 20) return false;
  return Math.max(a, b) / Math.min(a, b) > 2.5;
}

/* Is this line usable as material at all? Same rule and same name as scriptplay's and
   listening's — three lines, and a shared private helper across three modules is a
   coupling that buys nothing. */
function usable(line) {
  return !!(line && lineText(line).trim());
}

/* English, flattened far enough that two glosses of the same utterance compare equal.
   Case, punctuation and spacing only: nothing here tries to decide that "Sure" and "OK"
   mean the same thing, because a filter that guesses would start throwing away good
   distractors and nobody would see it happen. */
function normEn(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* ── the false-negative guard ──

   responseSelect already bars every line of the SOURCE dialogue from the distractor pool,
   which is the big one: a neighbouring turn of this same conversation is often a perfectly
   reasonable thing to say here. Playing a whole conversation adds a second way to be
   wrong about wrongness, and it is worse because it is invisible.

   A distractor is drawn from another script, preferring the same act. Same act means the
   same grammar and often the same situation — so はい。 pulled from the next scene is not
   a wrong answer to a yes/no question, it is a right answer that the grader will mark
   wrong. Marking a learner wrong for a correct reply is the one failure mode this mode
   cannot afford: it teaches distrust, and distrust of a study tool ends the study.

   So two deterministic bars, both computed from the corpus rather than from a hand-written
   list of "generic" replies:

   1. GLOSS EQUALITY. An option whose English is the same sentence as the answer's is
      interchangeable with it by construction — the book itself says so.
   2. THE REPLY INDEX. Somewhere else in the 34 dialogues, a line was actually said in
      answer to this same cue. Keyed on the cue's Japanese AND on the cue's English, so a
      cue that recurs in translation but not verbatim is still caught.

   Neither can be complete — plenty of replies are appropriate without being attested. But
   both are checkable, and both remove the cases a learner would actually be angry about.

   Measured over the 34 dialogues, both parts, four seeds: 2 options removed out of 3,440,
   and no turn left short enough to be refused. That is the expected size. It is a guard,
   not a filter — responseSelect's own bar on the source dialogue's lines is what does the
   bulk of the work, and this catches the residue that bar cannot see because it sits in
   another script. Two false accusations a session is still two too many. */
export function replyIndex(scripts = []) {
  const byJa = new Map(), byEn = new Map();
  const add = (map, key, text) => {
    if (!key || !text) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(text);
  };
  for (const s of scripts || []) {
    const lines = (s && s.lines) || [];
    for (let i = 0; i + 1 < lines.length; i++) {
      const cue = lines[i], reply = lines[i + 1];
      if (!usable(cue) || !usable(reply)) continue;
      // Same rule responseSelect uses: a speaker continuing is not replying to themselves.
      if (cue.speaker && reply.speaker && cue.speaker === reply.speaker) continue;
      add(byJa, lineText(cue), lineText(reply));
      add(byEn, normEn(cue.en), lineText(reply));
    }
  }
  return { byJa, byEn };
}

/** Could `text` also be a right answer to this cue? Used to drop options, never to add
 *  them, so a false positive costs one distractor and a false negative costs trust. */
export function interchangeable(index, cue, answerEn, text, textEn) {
  if (!text) return false;
  if (normEn(textEn) && normEn(textEn) === normEn(answerEn)) return true;
  if (!index) return false;
  const ja = index.byJa && index.byJa.get(cue && cue.text);
  if (ja && ja.has(text)) return true;
  const en = index.byEn && index.byEn.get(normEn(cue && cue.en));
  if (en && en.has(text)) return true;
  return false;
}

/* ── who the learner can be ──
   Every speaker in the script, with a count of how many of their lines a question can be
   built for. A one-speaker script (Kuno's monologue, the culture talk) has no other side
   to play against and comes back unplayable with the reason stated — the same refusal
   idiom activitiesFor uses, and the reason is what makes "this script produced nothing"
   readable instead of mysterious. */
export function castFor(script, opts = {}) {
  const lines = (script && script.lines) || [];
  const speakers = speakersOf(script);
  if (speakers.length < 2) {
    return { playable: false, reason: "only one speaker — there is nobody to have the conversation with", parts: [] };
  }
  const parts = speakers.map((speaker) => {
    let mine = 0, graded = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!usable(line) || line.speaker !== speaker) continue;
      mine += 1;
      const prev = lines[i - 1];
      if (i > 0 && usable(prev) && prev.speaker && prev.speaker !== speaker) graded += 1;
    }
    return { speaker, lines: mine, graded };
  }).filter((p) => p.lines > 0);
  /* Most askable turns wins. Ties go to the side with the fewest turns that CANNOT be
     asked — both sides offer the same number of questions, so the better part to play is
     the one where nothing is a freebie — and after that to whoever speaks first, which is
     stable rather than arbitrary. */
  const best = parts.slice().sort((a, b) => b.graded - a.graded
    || (a.lines - a.graded) - (b.lines - b.graded)
    || speakers.indexOf(a.speaker) - speakers.indexOf(b.speaker))[0];
  return { playable: true, reason: "", parts, suggested: (best && best.speaker) || speakers[0] };
}

/** The side worth playing by default: whichever speaker has the most turns that can
 *  actually be asked. Falls back to the first speaker so a script always names a part. */
export function suggestPart(script) {
  const cast = castFor(script);
  return cast.playable ? cast.suggested : null;
}

/* ── the boss ──
   Roadmap Slice 5 calls the culminating dialogue of a lesson the "boss". Which script that
   is does not need authoring: the ids carry act and scene, so the boss of an act is simply
   its last scene. Scripts the taxonomy cannot place (the culture talk, anything Matthew
   pasted in himself) are not bosses rather than being filed under a made-up act — the same
   refusal actSceneOf makes.

   No hearts, no lives, no losing condition. The roadmap rejects those explicitly, and this
   is the mode where the temptation is strongest: the framing is the reward, plus the XP
   and combo the session engine already pays. */
export function bossScripts(scripts = []) {
  const bestScene = new Map();
  for (const s of scripts || []) {
    if (!s || !((s.lines || []).some(usable))) continue;
    /* Only among the scripts this mode can actually run. Act 3 ends on Kuno's monologue,
       and crowning a dialogue nobody can play as the act's boss would put a locked door at
       the end of the act. */
    if (speakersOf(s).length < 2) continue;
    const { act, scene } = actSceneOf(s.id);
    if (!Number.isFinite(act) || !Number.isFinite(scene)) continue;
    const cur = bestScene.get(act);
    if (!cur || scene > cur.scene) bestScene.set(act, { scene, id: s.id });
  }
  return new Set([...bestScene.values()].map((x) => x.id));
}

/* One NPC line, as the transcript renders it. `tokens` rather than text so the component
   can put furigana over the kanji with the same <Furigana> it uses everywhere else. */
function npcLine(line, lineIdx) {
  return {
    lineIdx,
    speaker: (line && line.speaker) || "",
    tokens: ((line && line.tokens) || []).slice(),
    text: lineText(line),
    romaji: (line && line.romaji) || "",
    en: (line && line.en) || "",
  };
}

/* ── one learner turn ──
   Built on responseSelect, which already owns the hard parts: the answer is the real next
   line, the distractors are tiered same-act-first, every line of this dialogue is barred,
   and the whole thing is a stable function of the seed. What is added here is the
   interchangeability filter above and the rōmaji the downshift needs.

   Returns null when responseSelect refuses or when too few options survive the filter. The
   caller turns that into a SAY turn rather than dropping the line: the learner still says
   it, it just is not scored. */
function choiceTurn(script, lineIdx, seed, scripts, index) {
  const lines = (script && script.lines) || [];
  const line = lines[lineIdx];
  const cueLine = lines[lineIdx - 1];
  if (!usable(line) || !usable(cueLine)) return null;

  const q = responseSelect(script, lineIdx - 1, seed, scripts, CHOICES + OVERDRAW);
  if (!q) return null;

  const answerEn = (line.en || "").trim();
  const kept = [];
  for (const text of q.choices) {
    if (text === q.answer) { kept.push(text); continue; }
    if (outOfScale(q.answer, text)) continue;
    if (interchangeable(index, { text: lineText(cueLine), en: cueLine.en }, answerEn, text, q.glosses[text])) continue;
    if (kept.filter((t) => t !== q.answer).length >= CHOICES) continue;
    kept.push(text);
  }
  /* Two options is a coin flip dressed as practice — the same floor ORDER_MIN states for
     the ordering puzzle. Three is the minimum that asks anything. */
  if (kept.length < 3) return null;

  return {
    kind: TURN.CHOICE,
    lineIdx,
    speaker: line.speaker || "",
    format: DIALOGUE_FORMAT,
    modes: modesForFormat(DIALOGUE_FORMAT),
    skill: DIALOGUE_SKILL,
    deck: DIALOGUE_DECK,
    /* CUE.CHOOSE: the answer is on screen and has to be picked out. Recorded rather than
       assumed so scoreAnswer and the evidence row agree about how much help there was. */
    cue: CUE.CHOOSE,
    prompt: "Your line. What do you say?",
    cueLine: npcLine(cueLine, lineIdx - 1),
    answer: q.answer,
    choices: kept,
    glosses: q.glosses,
    /* The downshift. Not shown at ASK; shown at CUE and after. Rōmaji rather than the
       English because the English is the reveal — a gloss would hand over the meaning as
       well as the sound, and the point of the rung is to make the same question winnable,
       not to answer it. */
    romaji: line.romaji || "",
    reveal: {
      tokens: (line.tokens || []).slice(),
      text: lineText(line),
      romaji: line.romaji || "",
      en: line.en || "",
      speaker: line.speaker || "",
    },
    provenance: { ...provenanceFor(script, lineIdx), label: provenanceLabel(script) },
    /* The identifier this turn's evidence is filed under: "seed-2-3#4", parseable back to
       an act by curriculum.mjs's coordsOf. Same key listening.mjs writes, so a dialogue and
       a listening session both count towards "acts this learner has met". */
    evidenceId: String((script && script.id) || "") + "#" + lineIdx,
  };
}

/* A learner line that carries no question. Kept in the run rather than skipped: it is
   still their line, and a conversation missing its own opening greeting is not the
   conversation. The reason rides along so the summary can say why it was not scored. */
function sayTurn(script, lineIdx, reason) {
  const line = ((script && script.lines) || [])[lineIdx] || {};
  return {
    kind: TURN.SAY,
    lineIdx,
    speaker: line.speaker || "",
    reason,
    prompt: "Your line — say it out loud, then check.",
    reveal: {
      tokens: (line.tokens || []).slice(),
      text: lineText(line),
      romaji: line.romaji || "",
      en: line.en || "",
      speaker: line.speaker || "",
    },
    provenance: { ...provenanceFor(script, lineIdx), label: provenanceLabel(script) },
  };
}

/* ── the run ──
   Walks the script once, collecting the other side's lines until one of the learner's
   arrives, and closing a beat on it. A trailing run of NPC lines becomes a final beat with
   no turn, so the conversation ends on whatever the other person says rather than stopping
   dead on the learner's last word.

   The seed advances per TURN rather than per script. The distractor rankings are stable
   functions of the seed, so a dialogue that handed every turn the same one produced turns
   with the same option set — the bug listening.mjs already hit and documented. */
export function buildDialogue(script, opts = {}) {
  const scripts = opts.scripts || [];
  const seed = opts.seed || 0;
  const cast = castFor(script);
  if (!cast.playable) return { playable: false, reason: cast.reason, beats: [], part: null };

  const part = opts.part && cast.parts.some((p) => p.speaker === opts.part) ? opts.part : cast.suggested;
  const npc = cast.parts.map((p) => p.speaker).filter((s) => s !== part);
  const lines = (script && script.lines) || [];
  const index = opts.index || replyIndex(scripts);

  const beats = [];
  let pending = [];
  let turns = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!usable(line)) continue;
    if (line.speaker !== part) { pending.push(npcLine(line, i)); continue; }
    const prev = lines[i - 1];
    let turn = null;
    if (i > 0 && usable(prev) && prev.speaker && prev.speaker !== part) {
      turn = choiceTurn(script, i, seed + turns * 11, scripts, index);
      /* Both filters can empty the pool, and which one did it is worth saying: the
         self-introduction in 6-1 is refused on length, while a line whose every candidate
         is a fair reply is refused on meaning. */
      if (!turn) turn = sayTurn(script, i, "nothing could be offered against this line that was not either a fair reply too, or nothing like it in length");
    } else {
      turn = sayTurn(script, i, i === 0
        ? "the opening line — there is nothing said before it to reply to"
        : "a continuation of your own turn, not a reply to anybody");
    }
    turns += 1;
    beats.push({ i: beats.length, npc: pending, turn });
    pending = [];
  }
  if (pending.length) beats.push({ i: beats.length, npc: pending, turn: null });

  const graded = beats.filter((b) => b.turn && b.turn.kind === TURN.CHOICE).length;
  return {
    playable: beats.some((b) => b.turn),
    reason: beats.some((b) => b.turn) ? "" : "no line in the script belongs to that speaker",
    scriptId: (script && script.id) || null,
    name: (script && script.name) || "",
    label: provenanceLabel(script),
    act: actSceneOf(script && script.id).act,
    part,
    npc,
    beats,
    graded,
    /* Every learner turn, graded or not. The end screen quotes both, because "8 of 9" is
       a different claim from "8 of 9, and you also said two lines nobody scored". */
    turnsTotal: beats.filter((b) => b.turn).length,
  };
}

/* ── grading ──
   Trivial comparison, in the module rather than in the component for the reason
   gradeListening states: what hangs off it is not trivial. This is also the seam the
   free-response version arrives at — a turn with no `choices` would be judged by the
   Worker and come back through this same shape, so nothing downstream changes. */
export function gradeTurn(turn, choice) {
  if (!turn || turn.kind !== TURN.CHOICE) return null;
  const chose = choice == null ? "" : String(choice);
  const ok = chose === turn.answer;
  return {
    ok,
    chose,
    answer: turn.answer,
    /* "context" — the word was not the problem, the fit was. That is the failure type the
       recovery ladder routes to a contextual cloze rather than to re-teaching a term the
       learner may well know. */
    failure: ok ? null : "context",
    /* What the wrong reply actually meant, so the correction can say more than "no". */
    choseEn: (turn.glosses && turn.glosses[chose]) || "",
  };
}

/** The options still on offer one rung down: the wrong picks are taken away, in the order
 *  the turn already had them. The answer can never be removed, which is what makes the
 *  ladder end in success rather than in an empty screen. */
export function downshift(turn, wrongPicks = []) {
  if (!turn || turn.kind !== TURN.CHOICE) return [];
  const gone = new Set((wrongPicks || []).filter((p) => p !== turn.answer));
  const left = turn.choices.filter((c) => !gone.has(c));
  return left.length >= 2 ? left : turn.choices.slice();
}

/* ── evidence ──
   One row per graded learner turn, keyed on the LINE. `ok` is the first attempt and only
   the first attempt: a turn won after the rōmaji appeared is a different event, and
   folding it in would report a comprehension figure the learner did not earn. What the
   downshift cost is reported separately, by the summary, as cue usage.

   `mode` is deliberately absent: makeEvidence derives it from the format, which is what
   keeps FORMAT_MODES honest. */
export function turnEvidence(turn, grade, ms) {
  if (!turn || turn.kind !== TURN.CHOICE || !grade) return null;
  return {
    id: turn.evidenceId,
    deck: DIALOGUE_DECK,
    format: DIALOGUE_FORMAT,
    skill: DIALOGUE_SKILL,
    cue: turn.cue,
    ok: grade.ok,
    ms: ms > 0 ? ms : 0,
    failure: grade.failure,
  };
}

/** Points for one turn, from the session engine's own scorer so a conversation and a study
 *  card are paid in the same currency. Scored ONCE, on the first attempt, for the same
 *  reason the evidence row is written once — and nothing is ever subtracted, so a turn that
 *  needed the cue still earns the attempt. */
export function scoreTurn(grade, verdict) {
  if (!grade) return { points: 0, reasons: [] };
  return scoreAnswer({ ok: grade.ok, cue: CUE.CHOOSE, verdict });
}

/* ── what happened ──
   Rows are what the component collected, one per learner turn:
   { kind, ok, cued, revealed, act }.

   Comprehension is unaided first-attempt hits over graded turns, and it is named that
   rather than "accuracy" because it is not the same number: every turn ends correct
   eventually, so accuracy in this mode is always 100% and would be a lie told with true
   arithmetic. Cue usage is the honest other half — how much help the 100% took. */
export function dialogueSummary(rows = [], dialogue = null) {
  let graded = 0, unaided = 0, cued = 0, revealed = 0, said = 0;
  const acts = new Map();
  for (const r of rows || []) {
    if (!r) continue;
    if (r.kind === TURN.SAY) { said += 1; continue; }
    graded += 1;
    if (r.ok) unaided += 1;
    else if (r.revealed) revealed += 1;
    else if (r.cued) cued += 1;
    if (Number.isFinite(r.act)) acts.set(r.act, (acts.get(r.act) || 0) + 1);
  }
  return {
    graded,
    unaided,
    cued,
    revealed,
    said,
    /* Null rather than zero when nothing was graded. A script whose every learner line is
       a SAY turn produced no comprehension measurement, and 0% is a claim about the
       learner while null is a claim about the material. */
    comprehension: graded ? unaided / graded : null,
    acts: [...acts.keys()].filter(Number.isFinite).sort((a, b) => a - b),
    label: (dialogue && dialogue.label) || "",
    part: (dialogue && dialogue.part) || "",
    name: (dialogue && dialogue.name) || "",
    /* The line the end screen is for. Not decoration: the whole point of the mode is that
       the learner finished a real conversation, and a summary that only reported a
       percentage would be reporting the least interesting true thing about it. */
    completed: !!(dialogue && dialogue.turnsTotal) && (graded + said) >= dialogue.turnsTotal,
  };
}

/* ── which of the 34 can be played at all ──
   Ranked for the picker: playable first, then by act and scene so the list reads in book
   order. A script that cannot be played keeps its reason, because a greyed-out row with no
   explanation is the kind of thing that gets reported as a bug for years. */
export function playableScripts(scripts = []) {
  const bosses = bossScripts(scripts);
  return (scripts || []).filter(Boolean).map((s) => {
    const cast = castFor(s);
    const { act, scene } = actSceneOf(s.id);
    return {
      script: s,
      id: s.id,
      name: s.name || "",
      label: provenanceLabel(s),
      act, scene,
      playable: cast.playable,
      reason: cast.reason,
      parts: cast.parts,
      suggested: cast.suggested || null,
      boss: bosses.has(s.id),
    };
  }).sort((a, b) => (a.playable === b.playable ? 0 : a.playable ? -1 : 1)
    || (a.act == null) - (b.act == null)
    || (a.act || 0) - (b.act || 0)
    || (a.scene || 0) - (b.scene || 0)
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
