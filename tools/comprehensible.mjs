/* ── i+1: choosing material by what you actually know ──

   Krashen's claim is that acquisition happens when you understand input slightly beyond
   your current level. The useful part is "slightly" — the same text is useless at 40%
   known (you are decoding, not reading) and nearly useless at 100% (nothing new to
   acquire). Everything in between is not equal either.

   The app has been picking material from a self-rated level: you say reading feels
   "starter", it offers starter things. That is a guess about you filtered through a mood.
   `coverageAgainstDeck` already measures the real quantity — what fraction of a text is
   made of words you have — and it is careful about inflection, so 勉強しました counts as one
   known word rather than a gap.

   This turns that number into a decision. The bands below are a stated position, not a
   measurement: the literature clusters around 95-98% for comfortable extensive reading and
   somewhat lower for intensive study with support. They are set where they are because the
   goal here is learning rather than pleasure reading, and because a learner with 588 words
   will almost never find 95% material and should not be told everything is too hard. */

export const BANDS = {
  /* Nothing to hold onto. At this density you are looking words up more often than reading
     them, and almost nothing sticks because there is no context to hang it on. */
  TOO_HARD: "too_hard",
  /* The learning zone. Enough support to guess from context, enough novelty to be worth
     the time. This is i+1. */
  STRETCH: "stretch",
  /* Comfortable. Good for speed, fluency and enjoyment; weak for acquiring anything new. */
  EASY: "easy",
};

export const STRETCH_LOW = 0.75;
export const STRETCH_HIGH = 0.95;

export function bandFor(pct) {
  if (pct == null) return null;
  const p = pct > 1 ? pct / 100 : pct;
  if (p < STRETCH_LOW) return BANDS.TOO_HARD;
  if (p > STRETCH_HIGH) return BANDS.EASY;
  return BANDS.STRETCH;
}

/* Said in words, without the theory. The learner does not need to hear "i+1" to use it. */
export function describeBand(pct) {
  const b = bandFor(pct);
  if (!b) return "";
  const p = Math.round((pct > 1 ? pct : pct * 100));
  if (b === BANDS.TOO_HARD) {
    return `You have ${p}% of the words. Too many gaps to learn much from — fine to skim, but you would be decoding rather than reading.`;
  }
  if (b === BANDS.EASY) {
    return `You have ${p}% of the words. Comfortable — good for reading at speed, though there is little new here to pick up.`;
  }
  return `You have ${p}% of the words. This is the useful range: enough support to guess the rest, enough new to be worth the time.`;
}

/* Rank a set of texts by how well they fit right now.

   `score` is distance from the middle of the stretch band, so the best material is the
   text that is challenging without being opaque. Texts outside the band are still ranked,
   just after everything inside it — the answer to "nothing is in my range" should be the
   closest thing, not an empty list. */
export function rankMaterial(items = [], coverageOf) {
  const mid = (STRETCH_LOW + STRETCH_HIGH) / 2;
  const scored = items.map((it) => {
    const cov = coverageOf(it);
    const pct = cov && cov.pct != null ? cov.pct / 100 : null;
    const band = bandFor(pct);
    return {
      item: it,
      pct: pct == null ? null : Math.round(pct * 100),
      band,
      unknown: (cov && cov.unknown) || [],
      /* Lower is better. Anything outside the band is pushed behind everything inside it,
         so a near-miss never outranks a genuine fit. */
      score: pct == null ? 99 : Math.abs(pct - mid) + (band === BANDS.STRETCH ? 0 : 1),
    };
  });
  return scored.sort((a, b) => a.score - b.score);
}

/* The single best next thing to read, or null when nothing can be measured. Deliberately
   returns null rather than a shrug — an empty recommendation is more honest than a
   confident pick from texts that were never scored. */
export function nextBest(items = [], coverageOf) {
  const ranked = rankMaterial(items, coverageOf);
  const first = ranked.find((r) => r.pct != null);
  return first || null;
}
