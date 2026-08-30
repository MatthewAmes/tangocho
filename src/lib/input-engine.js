/* The 入力 level engine: how a rating moves the learner's level and an item's difficulty, and how the next thing to watch gets picked. Pure — tools/test-input-engine.mjs asserts the rules directly. */

import { INPUT_BANDS, INPUT_VERDICTS } from "../data/input-catalog.js";

/* Ratings and levels are percentages; every path that produces one clamps here rather
   than each caller remembering to. */
const clamp100 = (n) => Math.max(0, Math.min(100, n));


export function unpackVideos(data) {
  const chans = data.channels || [];
  return (data.videos || []).map(([id, title, ci, sec, day, d, conf, cc, views]) => {
    const c = chans[ci] || ["", "unknown", "adult", ""];
    return {
      id: "yt:" + id,
      title,
      channel: c[1],
      channelId: c[0],
      url: "https://www.youtube.com/watch?v=" + id,
      medium: "video",
      source: "youtube",
      difficulty: d,
      difficultyConfidence: (conf || 25) / 100,
      durationSec: sec,
      publishedAt: day * 86400000,
      audience: c[2],
      hasSubsJa: !!cc,
      views,
      tags: (c[3] || "").split(" ").filter(Boolean),
      indexed: true,
    };
  });
}

// weak evidence below ~4 min, full weight by ~20 min
export function evidenceWeight(minutes) { return Math.max(0.25, Math.min(1, (minutes || 0) / 20)); }

// Early ratings move a lot, later ones barely — keeps the level from oscillating forever.
// Floors at 0.25 rather than decaying to nothing (a learner's level is not stationary
// forever just because they've rated a lot of things), and re-opens toward 0.5 when the
// last few verdicts are one-sided — a real, sustained shift (not just one outlier) deserves
// to move the level faster than the fully-decayed rate would allow.
export function learningRate(ratingCount, recent) {
  const base = Math.max(0.25, 1 / (1 + (ratingCount || 0) / 12));
  if (recent && recent.length >= 5) {
    const r = recent.slice(0, 5);
    const easy = r.filter((v) => v === "too_easy").length;
    const hard = r.filter((v) => v === "too_hard" || v === "lost").length;
    if (easy >= 4 || hard >= 4) return Math.max(base, 0.5);
  }
  return base;
}

export function applyRating({ level, ratingCount, itemDifficulty, itemConfidence, verdict, minutes, recent }) {
  const v = INPUT_VERDICTS[verdict];
  if (!v) return { level, itemDifficulty, itemConfidence, ratingCount };
  const w = evidenceWeight(minutes) * learningRate(ratingCount, recent);
  const nextLevel = clamp100(level + v.user * w);
  // item difficulty moves less the more confident we already are about it
  const conf = itemConfidence == null ? 0.3 : itemConfidence;
  const damp = 1 - Math.min(0.9, conf);
  let nextDiff = itemDifficulty;
  if (v.item === null) nextDiff = itemDifficulty + (level - itemDifficulty) * 0.15 * damp;  // pull toward the user
  else nextDiff = itemDifficulty + v.item * damp * evidenceWeight(minutes);
  return {
    level: nextLevel,
    ratingCount: (ratingCount || 0) + 1,
    itemDifficulty: clamp100(nextDiff),
    itemConfidence: Math.min(1, conf + 0.12),
  };
}

// Seed the starting level from the deck rather than asking — the deck already knows.
// Listening lags reading for almost everyone, so it starts lower. Tuned so that a
// JPN 101 student mid-way through volume 1 (~375 solid words) lands on the true
// beginner CI channels as their core band, not on Teppei and Sayuri: guessing too high
// is the expensive mistake here, since the first thing that happens is an hour of not
// understanding anything. Ratings pull it up fast if it's wrong.
export function seedLevelsFromDeck(cards) {
  const known = cards.filter((c) => (c.seen || 0) > 0 && (c.correct || 0) / (c.seen || 1) >= 0.6).length;
  return { listening: clamp100(5 + known / 40), reading: clamp100(8 + known / 30), updatedAt: Date.now() };
}

// The deck is a rising floor: every word learned since the last rating still counts, even
// though any one rating only ever touches ONE of listening/reading. Without this, a learner
// who added 400 more words over a semester but rarely rates content stays recommended
// material for the learner they were on day one — the old code only re-seeded from the deck
// while ratingCount was still zero for BOTH mediums, so the very first rating permanently
// switched the level onto a track the deck could no longer influence.
// `levels.rated` is the pure rating walk (what applyRating actually moves); the floor sits
// 4 points below the deck estimate specifically so a sustained run of "too hard" ratings can
// still pull the effective level under it — a single too_easy afterward restores the floor.
export function fuseLevels(levels, cards) {
  const seed = seedLevelsFromDeck(cards);
  const rated = levels.rated || { listening: levels.listening, reading: levels.reading };
  return {
    ...levels, rated,
    listening: clamp100(Math.max(rated.listening, seed.listening - 4)),
    reading: clamp100(Math.max(rated.reading, seed.reading - 4)),
  };
}

// deterministic shuffle so the same open doesn't reshuffle on every render
export function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function recommend({ catalog, level, mode, medium, minutes, history, tagScores, seed, allowReplay, preferred }) {
  const now = Date.now();
  const recent = new Set((history || []).filter((h) => now - h.at < 14 * 86400000).map((h) => h.itemId));
  let pool = catalog.filter((it) => {
    if (medium === "reading" && it.medium !== "reading") return false;
    if (medium === "listening" && it.medium === "reading") return false;
    if (!allowReplay && recent.has(it.id)) return false;
    return true;
  });
  if (!pool.length) pool = catalog.filter((it) => (medium === "reading" ? it.medium === "reading" : it.medium !== "reading"));

  const pick = (from) => {
    const band = (lo, hi) => from.filter((it) => it.difficulty >= level + lo && it.difficulty <= level + hi);
    if (mode === "passive") {
      // passive wants length and things already known to sit well
      return from.filter((it) => it.difficulty >= level - 10 && it.difficulty <= level + 4)
        .sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
    }
    const core = band(-3, 6), stretch = band(6, 14), comfort = band(-12, -3);
    return [...seededShuffle(core, seed),
            ...seededShuffle(stretch, seed + 1).slice(0, Math.max(1, Math.round(core.length * 0.3))),
            ...seededShuffle(comfort, seed + 2).slice(0, 1)];
  };

  /* Sources that resolve to a specific episode get first refusal on all three slots.
     A source with no feed can only offer "here's a whole website, go dig" — which is the
     work this tab exists to remove. Doing this as a score bonus AFTER banding was not
     enough: banding had already spent the slots, so the bonus only reordered whatever
     survived. Feedless sources still fill in when the level genuinely has nothing else. */
  // An indexed video always counts as resolvable — it is already one specific thing.
  const canResolve = (it) => it.indexed || (preferred && preferred.has(it.id));
  const feedFirst = preferred ? pool.filter(canResolve) : pool;
  let ranked = pick(feedFirst);
  if (ranked.length < 3) {
    const rest = pick(pool.filter((it) => !feedFirst.includes(it)));
    ranked = [...ranked, ...rest.filter((it) => !ranked.includes(it))];
  }
  if (!ranked.length) ranked = seededShuffle(pool, seed);

  // nudge toward tags that have rated well
  const score = (it) => (it.tags || []).reduce((n, t) => n + ((tagScores || {})[t] || 0), 0);
  ranked = ranked.slice().sort((a, b) => score(b) - score(a));

  // Fit the time available. Indexed rows carry real durations from the YouTube API, so
  // this is now an actual constraint rather than a hint.
  if (minutes) {
    const fits = ranked.filter((it) => !it.durationSec || it.durationSec <= minutes * 60 * 1.25);
    if (fits.length >= 3) ranked = fits;
  }
  return ranked.slice(0, 3);
}

// Grammar, not vocabulary: a kana run made of only these doesn't count as a coverage gap.
// Deliberately NOT a broad particle stoplist matched greedily character-by-character —
// も, と, し, で, に and friends are ALSO the first character of ordinary content words
// (とても, もう, しかし…), so chaining single-character matches from the front of a run
// eats straight through a real word one "particle-sized bite" at a time (an earlier version
// of this list did exactly that: これはとても against a deck holding only これ scored とても
// away to nothing, split into unknown "て" plus silently-dropped grammar). The only single
// characters here are は/が/を/で — the four that open nearly every clause and are safe
// because MATCH_FRONT tries the full COVERAGE_SAFE_SUFFIXES list (longest first) before
// ever falling back to one of these four, and never loops: at most one bite is taken from
// the front of any run, so an ambiguous character deeper in a real word is never touched.
// "か" isn't in here at all — it's the question particle AND the first character of every
// い-adjective's past tense (面白い -> 面白かった); that conjugation is instead handled by
// addStem adding the -かった form directly to the term set, matched by longest() up front.
export const COVERAGE_LEADING_PARTICLES = new Set(["は", "が", "を", "で"]);

// Unambiguous multi-character grammar endings — safe to match anywhere (front OR trailing)
// because nothing in this beginner vocabulary starts or ends with one of these by accident.
// Ordered longest-first (by hand, not .sort() — this list is spliced verbatim into
// tools/test-input-engine.mjs's synthetic module, whose extractor can't follow a method
// chain past the array literal) so a whole matching span (います) wins over a shorter
// partial match that would wrongly leave a fragment (い) behind.
export const COVERAGE_SAFE_SUFFIXES = [
  "ませんでした",
  "しています",
  "じゃない", "している", "しました", "いました", "なかった",
  "でした", "います", "だった", "します", "ました", "ません",
  "です", "ます", "いる",
];

export const COVERAGE_SAFE_SET = new Set(COVERAGE_SAFE_SUFFIXES);

export function coverageAgainstDeck(text, cards) {
  if (!text) return null;
  const terms = new Set();
  // Deck terms are dictionary forms, but real text is inflected — 面白い appears as
  // 面白かったです. Index the stem (and, for い-adjectives, the common conjugated forms
  // directly — the past tense in particular can't be recovered by the grammar stoplist
  // below, since -かった shares its first character with the か question particle) so
  // knowing the word counts wherever it shows up. Guarded so short kana words (いい → い)
  // can't start matching stray characters.
  const addStem = (t) => {
    if (/する$/.test(t) && t.length >= 4) terms.add(t.slice(0, -2));
    else if (/い$/.test(t) && t.length >= 3) {
      const stem = t.slice(0, -1);
      terms.add(stem); terms.add(stem + "かった"); terms.add(stem + "くない"); terms.add(stem + "く");
    }
    else if (/[るうくぐすつぬぶむ]$/.test(t) && t.length >= 3) terms.add(t.slice(0, -1));
  };
  cards.forEach((c) => {
    if (c.term) { terms.add(c.term); addStem(c.term); }
    if (c.reading) { terms.add(c.reading); addStem(c.reading); }
  });
  const maxLen = 12;
  const isJa = (c) => /[぀-ヿ一-龯]/.test(c);
  const isKanji = (c) => /[一-龯]/.test(c);
  const longest = (i) => {
    for (let L = Math.min(maxLen, text.length - i); L >= 1; L--) if (terms.has(text.slice(i, i + L))) return L;
    return 0;
  };
  const longestIn = (set, s, i) => {
    for (let L = Math.min(8, s.length - i); L >= 1; L--) if (set.has(s.slice(i, i + L))) return L;
    return 0;
  };
  const stripTrailing = (w) => {
    for (let changed = true; changed;) {
      changed = false;
      for (const suf of COVERAGE_SAFE_SUFFIXES) if (w.endsWith(suf)) { w = w.slice(0, -suf.length); changed = true; break; }
    }
    return w;
  };

  // Counted in tokens, not characters, and with two rules that keep the number honest:
  //   1. an unmatched kana run is stripped of any leading/trailing grammar it carries
  //      (勉強 + しました -> nothing left, not a gap; ペン + です -> just ペン is the gap) —
  //      leading stripping only applies directly after a matched word (afterToken);
  //   2. a kanji word you don't know absorbs its own trailing kana, so 難しかったですが is
  //      one gap rather than two.
  // Without these, ordinary inflection alone drags a sentence he mostly understands down
  // into the 50s, which would push him toward material that's too easy — but counting
  // every trailing kana run as automatically "covered" (the old rule) went too far the
  // other way: これはペンです against a deck holding only これ scored 100%.
  let covered = 0, total = 0, afterToken = false;
  const unknown = new Map();
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (!isJa(ch)) { i++; afterToken = false; continue; }   // punctuation, latin, digits
    const hit = longest(i);
    // A one-character deck term can shadow the front of a longer grammar phrase it happens
    // to start — beginner decks often teach は/が/で/を as their own flashcard, and です
    // starts with で. Greedily taking that 1-char hit would strand the rest of the phrase
    // (す) as a fake "unknown word": です correctly recognised, then a stray す gap right
    // next to it. The longer grammar reading wins whenever it beats the deck hit; either
    // way it's not vocabulary, so — unlike a real hit — it never adds to `covered`.
    const gram = !isKanji(ch) ? longestIn(COVERAGE_SAFE_SET, text, i) : 0;
    if (gram > hit) { i += gram; afterToken = true; continue; }
    if (hit) { covered++; total++; i += hit; afterToken = true; continue; }

    if (!isKanji(ch)) {                                // unmatched kana run
      let j = i; while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;
      if (j === i) j = i + 1;
      let word = text.slice(i, j);
      if (afterToken) {                                  // single bite only — see COVERAGE_LEADING_PARTICLES above
        const f = longestIn(COVERAGE_SAFE_SET, word, 0);
        if (f) word = word.slice(f);
        else if (COVERAGE_LEADING_PARTICLES.has(word[0])) word = word.slice(1);
      }
      word = stripTrailing(word);
      if (word) { total++; unknown.set(word, (unknown.get(word) || 0) + 1); }
      i = j; afterToken = false; continue;
    }

    // unmatched kanji: extend while the next char is also kanji and starts no known word
    let j = i + 1;
    while (j < text.length && isKanji(text[j]) && !longest(j)) j++;
    const word = text.slice(i, j);
    while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;   // absorb okurigana
    unknown.set(word, (unknown.get(word) || 0) + 1);
    total++; i = j; afterToken = false;
  }
  return {
    pct: total ? Math.round((covered / total) * 100) : null,
    unknown: Array.from(unknown.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => ({ w, n })),
  };
}

export function band(level) { return INPUT_BANDS[Math.min(INPUT_BANDS.length - 1, Math.floor(level / 17))]; }

export function bandName(level) { return band(level)[0]; }

// difficulty shown only relative to where you are — never as a score
export function relDots(diff, level) {
  const d = diff - level;
  if (d <= -8) return { n: 1, label: "easy for you", ja: "らく" };
  if (d <= 4) return { n: 2, label: "right where you are", ja: "ちょうどいい" };
  if (d <= 12) return { n: 3, label: "a stretch", ja: "すこし上" };
  return { n: 4, label: "probably too hard", ja: "むずかしい" };
}

export function agoLabel(at) {
  const d = Math.floor((Date.now() - at) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return d + " days ago";
  if (d < 30) return Math.floor(d / 7) + "w ago";
  if (d < 365) return Math.floor(d / 30) + "mo ago";
  return Math.floor(d / 365) + "y ago";
}

export function blankInput(cards) {
  return { v: 1, levels: seedLevelsFromDeck(cards), counts: { listening: 0, reading: 0 },
           items: {}, history: [], pending: [], custom: [], tagScores: {}, hidden: [] };
}
