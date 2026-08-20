/* ── an honest checkpoint ──
   Every number elsewhere in this app is computed from answers the app itself chose to ask.
   That makes them useless for the question "am I actually getting better?", for two reasons
   that both push the same way:

   1. The scheduler asks about what you have been studying. Words you have quietly lost are
      not in the sample, so the average flatters you.
   2. It asks in whatever format it thinks you will pass. Picking the right option out of
      four is not the same skill as producing the word, and for a long time this app was
      serving multiple choice nine times out of ten.

   A benchmark fixes both by refusing to be part of the study loop:

   - The words are HELD OUT. Smart Review is forbidden to schedule them, so the score cannot
     be raised by studying to the test. They are released back into study when the cycle
     ends and a fresh set is reserved.
   - The sample is UNIFORM over the whole deck — studied, half-learned and untouched alike.
     That is what makes it an estimate of the deck rather than of your recent revision.
   - The format is COLD PRODUCTION. English in, Japanese out, no options, no hints, no
     feedback until the end so the test cannot double as a lesson.

   The output is deliberately one sentence with a real interval on it: "you can produce
   about 480 of your 1,632 course words from cold, give or take 60". A number that can move
   and that means something, instead of a percentage of whatever you happened to be asked. */

import { hashSeed } from "./session.mjs";
import { wilson } from "./calibration.mjs";
import { editDistance } from "./learner.mjs";
import { normalizeKana } from "./romaji.mjs";

/* How much of the deck is quarantined at a time. Every reserved word is one Smart Review
   cannot teach you, so this buys measurement with study time and the price should stay
   small. At 8% of ~1,600 words that is ~130 words set aside for a quarter. */
export const RESERVE_FRACTION = 0.08;
/* How long a reserve lasts before it is released and a new one drawn. Long enough that a
   benchmark is not measuring the same words month after month, short enough that no word is
   locked away for long. */
export const CYCLE_DAYS = 90;
/* How many of the reserved words a single run asks — about six minutes. Deliberately more
   than a lesson: this runs a few times a year, not daily, and a short test cannot separate
   improvement from luck. Even at thirty the range on a single run is wide, which is why
   comparisons pool everything that came before rather than trusting one run. */
export const RUN_SIZE = 30;

/* Which cycle we are in. Deterministic from the clock so no state is needed to agree
   across devices. */
export function cycleFor(now = Date.now(), epoch = Date.UTC(2026, 0, 1)) {
  return Math.max(0, Math.floor((now - epoch) / (CYCLE_DAYS * 86400000)));
}

/* The held-out set for a cycle. Derived by hashing rather than stored, so every device
   computes the same reserve from the same deck without syncing anything, and so a lost
   settings file cannot silently release the quarantine mid-cycle. */
export function reserveFor(items = [], cycle = 0, fraction = RESERVE_FRACTION) {
  const out = new Set();
  for (const it of items) {
    if (!it || !it.id) continue;
    if (hashSeed(`reserve:${cycle}:${it.id}`) < fraction) out.add(it.id);
  }
  return out;
}

/* What counts as the English side of a card. The decks disagree — the course vocabulary
   says `meaning`, imported decks say `en`, the frequency list says `gloss` — and a
   benchmark that only knew one of them silently found nothing to ask. */
export function glossOf(card) {
  const c = card || {};
  return c.en || c.gloss || c.meaning || "";
}

/* Is this card answerable in a cold-production test at all? */
export function askable(card) {
  return !!(card && card.id && card.term && glossOf(card));
}

/* The words this run will ask. Uniform over the reserve — NOT weighted toward anything,
   because the moment the sample prefers well-studied words it stops estimating the deck.
   Seeded by run so a reload resumes the same test rather than reshuffling it. */
export function sampleFor(items = [], reserved, n = RUN_SIZE, seed = 0) {
  const pool = items.filter((it) => askable(it) && reserved.has(it.id));
  return pool
    .map((it) => ({ it, k: hashSeed(`run:${seed}:${it.id}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.it);
}

/* Put an answer and a card into the same shape before comparing them. */
export function normalise(s) {
  /* Katakana folds to hiragana before comparing. Answers arrive as rōmaji converted to
     hiragana, so ミルク would never match みるく on a raw compare and every loanword in the
     deck — a large slice of it — would score wrong. The app's spelling check already treats
     the two scripts as one for grading; this is the same rule.

     Long marks and づ/ぢ fold too. Okurigana is deliberately NOT touched: that is part of
     the word being tested. */
  return normalizeKana(String(s == null ? "" : s).trim())
    .replace(/[\s　]+/g, "")
    .replace(/[。、．，!！?？]/g, "");
}

/* What a card will accept as its answer.

   The deck is a textbook glossary, not a clean word list: 38% of entries carry an
   annotation in brackets — 掛ける (RU; 掛けた), （お）祝い, 実験（する）, こる (-RU; こった) —
   and fifteen carry a pitch-accent arrow, 妻↓. Comparing raw strings against those marks a
   perfectly good answer wrong, and a benchmark that under-reports is worse than no
   benchmark for someone already unsure whether they are learning anything.

   So every card accepts a small set of forms: what is written, what is left when the
   brackets and their contents are removed (祝い, 実験, 掛ける), and what is left when only the
   brackets themselves are removed (お祝い, 実験する) — because for the optional-prefix and
   optional-する cases both readings are genuinely correct. Arrows are stripped throughout. */
export function acceptedForms(card) {
  const out = new Set();
  for (const raw of [card && card.term, card && card.reading]) {
    if (!raw) continue;
    const base = String(raw).replace(/[↓↑]/g, "");
    out.add(normalise(base));
    out.add(normalise(base.replace(/[（(][^）)]*[）)]/g, "")));   // drop bracket and contents
    out.add(normalise(base.replace(/[（()）]/g, "")));            // keep contents, drop brackets
  }
  out.delete("");
  return out;
}

/* Grading. Either the written form or the reading counts as knowing the word — this is a
   vocabulary test, not a handwriting test, and someone who types かようび for "Tuesday" has
   demonstrated the thing being measured.

   A near miss is recorded but NOT counted as correct. It is worth seeing separately, since
   a column of near misses means the words are largely there and the readings are slipping,
   which is a different problem from not knowing them — but a benchmark that awards partial
   credit stops being comparable to itself. */
export function gradeAnswer(card, got) {
  const g = normalise(String(got == null ? "" : got).replace(/[↓↑]/g, ""));
  if (!g) return { ok: false, near: false, blank: true };
  const forms = acceptedForms(card);
  if (forms.has(g)) return { ok: true, near: false, blank: false };
  let best = 99, target = 1;
  for (const f of forms) {
    const d = editDistance(g, f);
    if (d < best) { best = d; target = f.length; }
  }
  return { ok: false, near: best <= 1 && target >= 3, blank: false };
}

/* One finished run. `answers` is [{ id, got }] against the cards that were asked. */
export function scoreRun(cards = [], answers = [], at = Date.now()) {
  const byId = new Map(answers.map((a) => [a.id, a.got]));
  const detail = cards.map((c) => {
    const got = byId.has(c.id) ? byId.get(c.id) : "";
    const g = gradeAnswer(c, got);
    return { id: c.id, term: c.term, reading: c.reading || "", en: glossOf(c), got, ...g };
  });
  const ok = detail.filter((d) => d.ok).length;
  return {
    at,
    n: detail.length,
    ok,
    near: detail.filter((d) => d.near).length,
    blank: detail.filter((d) => d.blank).length,
    rate: detail.length ? Math.round((ok / detail.length) * 1000) / 1000 : null,
    detail,
  };
}

/* The headline: what the sample implies about the whole deck. The interval is the honest
   part — twenty words cannot pin down 1,632, and a benchmark that reported "480" flat would
   invite reading a swing of ±60 as progress. */
export function estimateKnown(run, deckSize) {
  if (!run || !run.n || !deckSize) return null;
  const w = wilson(run.ok, run.n);
  return {
    words: Math.round(w.rate * deckSize),
    lo: Math.round(w.lo * deckSize),
    hi: Math.round(w.hi * deckSize),
    deckSize,
    rate: w.rate,
    n: run.n,
  };
}

/* Comparing two runs. The whole point of the benchmark is to answer "am I improving", and
   the whole risk is answering it from noise — two twenty-word runs differing by three words
   say nothing at all. A change is only reported when the intervals actually separate. */
/* Every run is a fresh uniform sample of the SAME deck, so past runs can be added together
   into one much larger baseline. This is what makes the benchmark able to answer the
   question at all: thirty words against thirty words needs a thirty-point swing before the
   ranges separate, and almost no real improvement is that violent. Thirty against a pooled
   hundred and fifty can see a move less than half that size. */
export function poolRuns(history = []) {
  const list = Array.isArray(history) ? history : [];
  if (!list.length) return null;
  return {
    n: list.reduce((s, r) => s + (r.n || 0), 0),
    ok: list.reduce((s, r) => s + (r.ok || 0), 0),
    runs: list.length,
  };
}

export function compareRuns(prev, curr) {
  if (!prev || !curr || !prev.n || !curr.n) return { verdict: "first", delta: null };
  const a = wilson(prev.ok, prev.n);
  const b = wilson(curr.ok, curr.n);
  const delta = Math.round((b.rate - a.rate) * 1000) / 1000;
  if (b.lo > a.hi) return { verdict: "better", delta };
  if (a.lo > b.hi) return { verdict: "worse", delta };
  return { verdict: "unclear", delta };
}

/* Plain language for the result screen. No percentages as the headline: "about 480 of your
   1,632 words" is a fact about your Japanese, where "29%" is a fact about a test. */
export function describeRun(run, est, cmp) {
  if (!run || !run.n) return "Nothing scored yet.";
  const parts = [];
  if (est) {
    parts.push(`On this sample you can produce about ${est.words} of your ${est.deckSize} words from cold — somewhere between ${est.lo} and ${est.hi}.`);
  }
  if (cmp && cmp.verdict === "better") parts.push("That is a real improvement on your last check, not a wobble.");
  else if (cmp && cmp.verdict === "worse") parts.push("That is genuinely down on your last check.");
  else if (cmp && cmp.verdict === "unclear") parts.push("Too close to your last check to call either way — which is normal over a few weeks.");
  else if (cmp && cmp.verdict === "first") parts.push("This is your first check, so there is nothing to compare it to yet. The next one will mean more.");
  if (run.near >= 3) {
    parts.push(`${run.near} answers were one character off — the words are there and the readings are slipping, which is a different problem from not knowing them.`);
  }
  return parts.join(" ");
}

/* History, newest last, capped. Small enough to keep forever. */
export const HISTORY_CAP = 40;
export function pushRun(history = [], run) {
  const list = Array.isArray(history) ? history.slice() : [];
  list.push({ at: run.at, n: run.n, ok: run.ok, near: run.near, blank: run.blank, scope: run.scope || "vocab" });
  return list.slice(-HISTORY_CAP);
}
