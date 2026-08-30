/* ── distractors, sourced from the curriculum ──
   A multiple-choice question is only as good as its wrong answers. Asking for 火曜日
   against {Tuesday, to swim, expensive, library} tests nothing: three options are
   obviously not days, so the question is answerable without knowing the word.

   The tiers below are a priority order, best material first:

     1. confusion   words THIS learner has actually mixed up with this one
     2. scene       the same NihonGO NOW! act-scene — two confusable words from one
                    chapter are the most valuable distractors there are
     3. nearby      neighbouring scenes, then neighbouring acts
     4. similar     sounds or looks alike — shared kana, same length, small edit distance
     5. kind        at least the same writing system
     6. random      seeded fill, so a thin deck still produces a question

   Every returned distractor carries the tier it came from. That is for debugging and
   analytics — "are MC questions actually drawing from the current lesson?" is a question
   worth being able to answer — and is never shown to the learner.

   Kept deterministic: the same card, deck and seed always yield the same options, so a
   re-render mid-answer cannot reshuffle the question under the learner. */
import { editDistance } from "./learner.mjs";
import { SECTION_MAP } from "../src/data/sections.js";

export const TIER = {
  CONFUSION: "confusion",
  SCENE: "scene",
  NEARBY: "nearby",
  SIMILAR: "similar",
  KIND: "kind",
  RANDOM: "random",
};

/* Where a card sits in the textbook, as "act-scene" ("2-3"). This is the ONE place that
   knows how curriculum position is stored, so the proper curriculum module can replace
   its body without anything else moving. It reads the same two fields the app's own
   sectionOf does: the seed's `sec` (86% of the deck), then SECTION_MAP by term.

   An unplaced card returns "" and simply skips the two curriculum tiers rather than being
   grouped into a fictional one. */
export function sceneOf(item) {
  if (!item) return "";
  // "#n" only disambiguates duplicate seed rows within one scene — not part of the id.
  const sec = item.sec ? String(item.sec).replace(/#\d+$/, "") : "";
  return sec || SECTION_MAP[item.term] || "";
}

/* Act and scene as numbers. Scene ids are not always numeric — "10-7R" is a review
   section, "12-BTS 1" a behind-the-scenes page — so the act is taken from the leading
   digits and the scene is left null when it has none. */
function scenePos(name) {
  const m = /^(\d+)\s*-\s*(\d+)?/.exec(String(name || ""));
  if (!m) return null;
  return { act: Number(m[1]), scene: m[2] == null ? null : Number(m[2]) };
}

/* How far apart two places in the textbook are. Acts dominate deliberately: any scene
   inside the current act is nearer than the closest scene of the next one. */
function sceneGap(a, b) {
  if (!a || !b) return Infinity;
  if (a.act !== b.act) return Math.abs(a.act - b.act) * 100;
  if (a.scene == null || b.scene == null) return 10;
  return Math.abs(a.scene - b.scene);
}

const SIMILAR_FLOOR = 0.45;

function sharesCharacter(a, b) {
  const x = String(a || ""), y = String(b || "");
  for (let i = 0; i < x.length; i++) if (y.indexOf(x[i]) >= 0) return true;
  return false;
}

/* Phonological and orthographic closeness in one number, 0 = nothing in common.
   The reading leads, because sound is what the learner actually reaches for: 会社 and
   学校 look alike on the page, but かいしゃ and がっこう are what get confused in speech.
   Orthography still contributes — same script plus a shared character is a real source
   of mix-ups (会社 / 会話). */
function similarTo(item, other) {
  const x = item.reading || item.term || "";
  const y = other.reading || other.term || "";
  if (!x || !y) return 0;
  const span = Math.max(x.length, y.length);
  let s = 1 - editDistance(x, y) / span;
  if (x[0] === y[0]) s += 0.15;                          // shared opening mora
  if (x[x.length - 1] === y[y.length - 1]) s += 0.10;    // shared ending — ます / ました
  if (x.length === y.length) s += 0.10;
  if (item.kind === other.kind && sharesCharacter(item.term, other.term)) s += 0.10;
  return s;
}

/* A stable per-candidate key, so ties inside a tier break the same way for a given seed
   but differently for another card or another step. A modular stride (the idiom used
   elsewhere in this codebase) cannot do this job here: a stride of 13 over a list of 13
   returns the same entry forever, which silently starves a tier. */
function tieKey(id, seed) {
  const s = String(id);
  let h = ((seed >>> 0) + 2166136261) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/* Order a tier's candidates by its own notion of "best" and then by the tie key, and
   return the cards. `rank` is optional — a tier whose members are all equally good
   (same scene, same kind) sorts on the tie key alone.

   Named `rankTier` rather than the obvious `ordered` because module scope is shared in
   the bundled IIFE: several components already use `ordered` as a local, and taking the
   name here makes esbuild rename all of them to `ordered2`. */
function rankTier(list, seed, rank) {
  return list
    .map((c) => ({ c, r: rank ? rank(c) : 0, k: tieKey(c.id, seed) }))
    .sort((a, b) => (a.r - b.r) || (a.k - b.k))
    .map((x) => x.c);
}

/* Wrong answers for `card`, best material first.

   `cards` is the whole candidate deck; the caller is responsible for removing options
   that would also be CORRECT (a synonym, an identical gloss), because only the caller
   knows what the question asks.

   opts.confusedWith  ids from confusionFrom(), most-confused first
   opts.seed          any number; fixes the choice
   opts.restrict      optional plausibility filter (the meaning-choice site uses part of
                      speech). It applies to tiers 2-5 but NOT to the confusion tier — a
                      word the learner has demonstrably mixed up with this one is the best
                      distractor available whether or not it is the same part of speech —
                      and the random tier widens past it rather than return short. */
export function pickDistractors(card, cards, n = 3, opts = {}) {
  const want = Math.max(0, Math.floor(n) || 0);
  if (!card || !want) return [];
  const seed = Number(opts.seed) || 0;
  const restrict = typeof opts.restrict === "function" ? opts.restrict : null;

  const pool = (cards || []).filter((c) => c && c.id !== card.id && c.term && c.term !== card.term);
  const out = [];
  const used = new Set();
  const take = (list, tier, cap) => {
    const room = cap == null ? want : Math.min(want, out.length + cap);
    for (const c of list) {
      if (out.length >= room) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      out.push({ card: c, tier });
    }
  };

  /* 1. What this learner actually confuses. Already ordered by how often, so it is taken
        as given rather than re-sorted. Capped one short of a full set: filling every slot
        from confusion history would ask the same three wrong words every time, and a
        question the learner has already been burned by twice teaches less than one that
        also carries something new. */
  const byId = new Map(pool.map((c) => [c.id, c]));
  const confused = (opts.confusedWith || []).map((id) => byId.get(id)).filter(Boolean);
  take(confused, TIER.CONFUSION, Math.max(1, want - 1));
  if (out.length >= want) return out;

  const plausible = restrict ? pool.filter(restrict) : pool;

  /* 2 & 3. Curriculum locality. An unplaced card has no scene, so both tiers are simply
        empty for it and the phonological ones do the work instead. */
  const here = sceneOf(card);
  if (here) {
    const herePos = scenePos(here);
    const placed = plausible.map((c) => ({ c, gap: sceneGap(herePos, scenePos(sceneOf(c))), same: sceneOf(c) === here }));
    take(rankTier(placed.filter((p) => p.same).map((p) => p.c), seed), TIER.SCENE);
    if (out.length >= want) return out;
    const near = placed.filter((p) => !p.same && p.gap !== Infinity);
    const gapOf = new Map(near.map((p) => [p.c.id, p.gap]));
    take(rankTier(near.map((p) => p.c), seed, (c) => gapOf.get(c.id)), TIER.NEARBY);
    if (out.length >= want) return out;
  }

  /* 4. Sounds or looks alike. Negated because `rankTier` sorts ascending and a higher
        similarity is a better distractor. */
  const scored = plausible
    .map((c) => ({ c, s: similarTo(card, c) }))
    .filter((x) => x.s >= SIMILAR_FLOOR);
  const scoreOf = new Map(scored.map((x) => [x.c.id, x.s]));
  take(rankTier(scored.map((x) => x.c), seed, (c) => -scoreOf.get(c.id)), TIER.SIMILAR);
  if (out.length >= want) return out;

  /* 5. Same writing system — weak, but it keeps a kanji question from offering three
        katakana loanwords, which is answerable on shape alone. */
  take(rankTier(plausible.filter((c) => c.kind === card.kind), seed), TIER.KIND);
  if (out.length >= want) return out;

  /* 6. Seeded fill. Widens past `restrict` only here: a question with two options is
        worse than one whose third option is the wrong part of speech. */
  take(rankTier(plausible, seed), TIER.RANDOM);
  if (out.length < want && restrict) take(rankTier(pool, seed), TIER.RANDOM);
  return out;
}
