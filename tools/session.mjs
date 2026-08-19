/* ── the unified session builder ──
   Every deck in the app — vocabulary, kana, kanji, conjugation, dates, the 10k list —
   already carries the same stat record ({seen, correct, level, streak, last, fsrs}) and
   is already scheduled by the same FSRS model. What was missing was a selector that could
   see all of them at once: Smart Review read the vocabulary deck and nothing else, so a
   kana character you last touched in June was invisible to the one button you actually press.

   This module is that selector. It is deliberately pure — no React, no storage, no DOM —
   so the scheduling decisions can be tested directly, the way fsrs.mjs is.

   Three ideas drive it:

   1. LEARNING STEPS. A brand-new item used to get exactly one look, at the end of the
      session, and then FSRS put it a minimum of a day away. That is the weakest memory in
      the deck getting the least practice. New items now repeat inside the same session at
      expanding gaps, which is what the Kana tab already did (KANA_REQUEUE_GAP) and what
      Anki's learning steps are for.

   2. A STALENESS CEILING. FSRS is optimising for a retention target, and a well-known
      consequence is that a very stable card can be scheduled years out. That is correct
      for the model and wrong for a person who wants to still know the word. Anything
      unseen for longer than the ceiling is pulled back in regardless of what FSRS thinks.

   3. NEW-ITEM INTAKE IS THE REAL BUDGET. Reviews are cheap; encoding is expensive, and
      freshly-encoded items interfere with each other. So the session grows and shrinks
      with the review backlog, while the number of genuinely new things stays capped. */

import { retrievability, seedFromHistory } from "./fsrs.mjs";

const DAY = 86400000;

export const DEFAULTS = {
  minutes: 10,          // target session length, spent against measured latency
  maxNew: 6,            // absolute cap on genuinely new items — the expensive part
  newShare: 0.4,        // ...and no more than this fraction of the session, repeats included
  recallFloor: 0.80,    // resurface anything the model says has faded below this
  ceilingDays: 365,     // ...and a backstop for intervals long enough to distrust
  staleShare: 0.25,     // stale recalls get RESERVED slots, or the ceiling is only a wish
  strongShare: 0.3,     // ...and so does practising what you already half-know, see below
  vocabShare: 0.65,     // vocab-led: the rest of the decks share what's left
  maxLeeches: 3,        // stuck words that may appear at once, matching the vocab tab
  urgencyFloor: 0.75,   // a deck below this need does not get a guaranteed variety slot
  jitterBand: 0.3,      // tie-break spread only — never wide enough to reorder priorities
  typeAtStability: 14,  // recognition strong enough to UNLOCK production
  prodWeakStability: 4, // ...below this the production memory itself is still fragile
  listenAtStability: 5, // audio recall a little earlier — it is easier than producing
  minItems: 8,
  maxItems: 40,
  /* Two items a minute, which lands the normal pace on ~20. The first cut used four and
     produced a forty-item session for a ten-minute request — technically within budget at
     the measured answer speed, and far too long to actually sit through. Sessions you
     finish beat sessions that are theoretically optimal. */
  itemsPerMinute: 2,
  stepGaps: [3, 8],     // a new item comes back after ~3 cards, then ~8 more
  fallbackMs: 4200,     // assumed per-item cost before there's latency history
};

/* How badly an item needs to be seen. Higher = sooner.
   Mirrors statNeed in the app: driven by how far recall has decayed below target, so an
   item at 50% recall outranks one at 95% no matter how many times either has been seen. */
export function need(st, now = Date.now()) {
  const seen = (st && st.seen) || 0;
  if (!seen) return 6;                                  // never studied → front of the queue
  const f = (st && st.fsrs) || seedFromHistory(st);
  if (!f || !(f.S > 0)) return 5;
  const days = Math.max(0, (now - (f.last || 0)) / DAY);
  const r = retrievability(days, f.S);
  return (1 - r) * 8 + (st.streak ? 0 : 0.6);
}

/* ── one item, several memories ──
   A word is not a single memory. Reading 火曜日 and producing it from "Tuesday" are
   different abilities of different strength, and the deck already stores them separately
   (`fsrs` for recognition, `rfsrs` for production). Choosing a production exercise from
   the RECOGNITION state — which is what this file used to do — trains the ability the
   learner already has and ignores the one they do not.

   Deliberately only two dimensions for now. Listening, orthography and contextual use are
   genuinely separate abilities, but the app does not record them yet, and inventing state
   it cannot observe would be worse than naming the gap. */
export function skillOf(st, which = "fsrs") {
  const rec = which === "fsrs";
  const seen = (st && (rec ? st.seen : st.rseen)) || 0;
  const correct = (st && (rec ? st.correct : st.rcorrect)) || 0;
  const f = st && (rec ? (st.fsrs || seedFromHistory(st)) : st.rfsrs);
  return { seen, acc: seen > 0 ? correct / seen : 0, S: (f && f.S) || 0, tried: seen > 0 };
}

/* What an item can actually be ASKED. Reserving a slot for typing from stability alone
   and only discovering in the UI that the item has no reading spends the slot on nothing,
   so capability belongs in the candidate, not downstream of it. */
export function capsOf(source, item) {
  if (source && typeof source.capsFor === "function") return source.capsFor(item) || {};
  return { ...(source && source.caps), ...(item && item.caps) };
}

/* ── deterministic jitter ──
   Ordering was fully deterministic, so an unfinished session rebuilt identically and two
   sessions on the same day were the same session. The obvious fix is Math.random(), and
   it is the wrong one: a session should be reproducible for a given day, so a reload does
   not reshuffle what you were halfway through, and so a bug can be reproduced at all.

   So: a hash of the item and the local date. Stable within a day, different tomorrow. It
   is applied inside a narrow band, which matters — jitter wide enough to reorder genuine
   priorities is not variety, it is noise in the scheduler. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;                 // 0..1
}

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

/* Days since an item was last put in front of the learner, whatever the deck. */
export function daysSince(st, now = Date.now()) {
  const last = st && (st.last || (st.fsrs && st.fsrs.last));
  if (!last) return Infinity;
  return (now - last) / DAY;
}

/* ── what counts as stale ──
   This started as a flat "unseen for 45 days" rule, and that rule was wrong. Forcing a
   retrieval on an item the model puts at 99% recall produces almost no strengthening —
   retrieval only builds memory when it takes effort — so the review is spent on an item
   that did not need it, and taken from one that did. That is the desirable-difficulty
   argument, and it holds.

   What survives the argument is narrower, and there are two of it:

   1. RECALL FLOOR. Something the model itself says has faded well below its retention
      target. This is the real "you are about to lose this" signal, and it is what the
      user actually wanted when they asked to be protected from mastered words vanishing.

   2. A DISTRUST BACKSTOP. FSRS can schedule a very stable card years out, and that number
      is an extrapolation far beyond where the model has much evidence. If its stability
      estimate is wrong you find out in three years, by which point the memory is gone and
      nothing can be done. An annual check-in is cheap insurance against model error — a
      different claim from "reviewing feels safer", and the only one worth paying for.

   Never studied does not count as stale — that is "new".

   The two triggers are NOT the same intervention and are reported separately. "decay" is
   a memory about to be lost and deserves the urgency it gets. "annual_check" is a
   diagnostic sample on an item the model claims is fine — it should be measured, not
   drilled, and it should not compete with a genuinely fading word for the same priority. */
export function staleReasonFor(st, now = Date.now(), opts = DEFAULTS) {
  const o = typeof opts === "number"
    ? { ...DEFAULTS, ceilingDays: opts }               // legacy: a bare day count
    : { ...DEFAULTS, ...opts };
  if (!st || !(st.seen > 0)) return null;

  const f = st.fsrs || seedFromHistory(st);
  const d = daysSince(st, now);
  // Decay is checked first: an item that is BOTH old and fading is fading, not a sample.
  if (f && f.S > 0 && retrievability(d, f.S) < o.recallFloor) return "decay";
  if (d > o.ceilingDays) return "annual_check";
  return null;
}

export function isStale(st, now = Date.now(), opts = DEFAULTS) {
  return staleReasonFor(st, now, opts) !== null;
}

/* Typical time per item, from the learner's own history rather than a guess.

   Caveat worth stating plainly: each deck stores ms and msN as running TOTALS, so this is
   a mean, not a median, and a mean is exactly the statistic a walked-away-from card ruins.
   The individual timings needed for a real median are not retained anywhere, so the
   defence is the clamp below rather than a better estimator. If session length ever feels
   wrong, this is the first thing to suspect. */
export function pacePerDeck(sources, fallbackMs = DEFAULTS.fallbackMs) {
  const out = {};
  for (const s of sources) {
    let ms = 0, n = 0;
    for (const id of Object.keys(s.stats || {})) {
      const st = s.stats[id];
      if (st && st.ms > 0 && st.msN > 0) { ms += st.ms; n += st.msN; }
    }
    out[s.deck] = n ? Math.min(12000, Math.max(1800, (ms / n) * 1.45)) : fallbackMs;
  }
  return out;
}

export function pacePerItem(sources, fallbackMs = DEFAULTS.fallbackMs) {
  /* Averaged ACROSS decks rather than pooled within them. Pooling let whichever deck had
     the most timing observations define the speed of everything — with 100k vocabulary
     samples and 2k kanji samples, a kanji-heavy session was estimated at vocabulary
     speed. Averaging the per-deck rates stops the biggest deck speaking for the rest.
     (A per-candidate cost model would be better still, and needs the session composition
     before it can be computed, which is a chicken-and-egg this does not solve.) */
  const per = pacePerDeck(sources, fallbackMs);
  const rates = Object.keys(per).filter((k) => (sources.find((s) => s.deck === k) || {}).items?.length);
  if (rates.length > 1) {
    return rates.reduce((a, k) => a + per[k], 0) / rates.length;
  }
  let ms = 0, n = 0;
  for (const s of sources) {
    for (const id of Object.keys(s.stats || {})) {
      const st = s.stats[id];
      if (st && st.ms > 0 && st.msN > 0) { ms += st.ms; n += st.msN; }
    }
  }
  if (!n) return fallbackMs;
  // Answer time is not the whole cost — there is a beat of reading and self-check either
  // side of it. Measured latency undercounts wall-clock, so pad it.
  return Math.min(12000, Math.max(1800, (ms / n) * 1.45));
}

/* How many items fit the time budget, clamped so a session is never trivial or endless.

   The ceiling scales with the requested minutes. A fixed cap made the whole pace setting
   inert: at any realistic answer speed a five-minute and a twenty-minute session both
   computed well past the cap and came out the same length, so "I only have five minutes"
   silently bought you the same twenty-minute session. */
export function budgetFor(sources, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const per = pacePerItem(sources, o.fallbackMs);
  const raw = Math.round((o.minutes * 60000) / per);
  const ceiling = Math.max(o.minItems, Math.min(o.maxItems, Math.round(o.minutes * o.itemsPerMinute)));
  return Math.max(Math.min(o.minItems, ceiling), Math.min(ceiling, raw));
}

/* Flatten every deck into one scored list of candidates. */
export function candidates(sources, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = o.now || Date.now();
  const out = [];
  for (const s of sources) {
    const stats = s.stats || {};
    for (const item of s.items || []) {
      const st = stats[item.id] || null;
      const fresh = !st || !(st.seen > 0);
      const staleReason = staleReasonFor(st, now, o);
      /* `need` is pure memory urgency and `score` is need plus policy. Keeping them apart
         matters because a threshold named urgencyFloor was being compared against the
         composite — so a deck priority could carry an item over an "urgency" bar it had
         not met, which is not what the name promises anyone reading it. */
      const urgency = need(st, now);
      out.push({
        deck: s.deck,
        item,
        st,
        fresh,
        stale: staleReason !== null,
        staleReason,
        caps: capsOf(s, item),
        recognition: skillOf(st, "fsrs"),
        production: skillOf(st, "rfsrs"),
        need: urgency,
        /* A fading item jumps the queue. An annual diagnostic does not: it is a sample on
           something the model says is fine, and letting it outrank a word actually being
           lost is exactly the mistake the day-based ceiling used to make. */
        score: urgency + (staleReason === "decay" ? 4 : staleReason === "annual_check" ? 0.5 : 0) + (s.weight || 0)
          + (hashSeed(s.deck + ":" + item.id + ":" + (o.seed || dayKey(now))) - 0.5) * o.jitterBand,
      });
    }
  }
  return out;
}

/* Insert an element at a target index without letting it land past the end. */
function insertAt(list, at, el) { list.splice(Math.min(at, list.length), 0, el); }

const keyOf = (c) => c.deck + " " + c.item.id;

/* Learning-step gaps have to FIT. Blindly walking a cursor forward by [3, 8] on a short
   session overshoots the end of the array, every overshoot clamps to the last index, and
   the repeats land adjacent — the exact massed practice the steps exist to avoid. So drop
   later steps rather than emit fake ones: two well-spaced looks beat three bunched ones. */
function fitSteps(gaps, size) {
  const out = [];
  let span = 1;
  for (const g of gaps) {
    if (span + g > size - 1) break;
    span += g;
    out.push(g);
  }
  return out.length ? out : [Math.max(2, Math.floor(size / 3))];
}

/* Distribute `minor` through `major` proportionally. The naive version — walk a fixed gap
   and splice — silently degenerates into "append the block" when minor is the longer list,
   which is precisely the case that matters: caught up on vocabulary, behind on kanji.
   Consuming both lists at the rate of their own share holds the mix at any ratio. */
function weave(major, minor) {
  if (!minor.length) return [...major];
  if (!major.length) return [...minor];
  const out = [];
  let a = 0, b = 0;
  while (a < major.length || b < minor.length) {
    if (a >= major.length) { out.push(minor[b++]); continue; }
    if (b >= minor.length) { out.push(major[a++]); continue; }
    if (a / major.length <= b / minor.length) out.push(major[a++]);
    else out.push(minor[b++]);
  }
  return out;
}

/* ── the builder ──
   Returns an ordered array of picks. Each pick is {deck, item, st, fresh, stale, step}
   where `step` is 0 for a first showing and 1..n for a learning-step repeat. */
export function buildSession(sources, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = o.now || Date.now();
  const size = o.size || budgetFor(sources, o);

  const all = candidates(sources, { ...o, now });
  const fresh = all.filter((c) => c.fresh).sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0));

  /* Leech throttle. Drilling a stuck word harder does not unstick it, and a pool sorted
     purely by decay fills up with exactly those words — they are the most decayed things
     you own. The vocabulary tab already caps them at three; the unified session has to as
     well, or it becomes a session of nothing but your worst cards. */
  /* Lifetime accuracy alone is too slow to react. A word missed for months and now being
     answered correctly stays flagged, and a word that was solid and has just fallen apart
     stays unflagged until enough history accumulates to drag the average down. Requiring
     the current streak to be broken as well means throttling applies to words that are
     stuck NOW, not words that were once hard.

     Honest limit: the stat record keeps totals and a current streak, not a review log, so
     "recent" here means "the last answer was wrong". A rolling window of the last N
     results would be better and needs a schema change to store them. */
  const leechy = o.isLeech || ((st) => !!(
    st && st.seen >= 8 && (st.correct || 0) / st.seen < 0.5 && !(st.streak > 0)
  ));
  const knownAll = all.filter((c) => !c.fresh);
  const stuck = knownAll.filter((c) => leechy(c.st)).sort((a, b) => b.score - a.score);
  /* Kept leeches must be RANKED BACK IN, not appended. Concatenating them onto the end
     stripped the rank their score earned, and every later slice() cut from the front — so
     "at most three leeches" silently became "no leeches at all, ever, until the healthy
     backlog hits zero". Throttled and banned are not the same thing. */
  const known = knownAll.filter((c) => !leechy(c.st))
    .concat(stuck.slice(0, o.maxLeeches))
    .sort((a, b) => b.score - a.score);

  /* New intake is bounded by its TOTAL cost, not its headcount. Each new item is shown
     once and then repeated for each learning step, so at two steps a "new word" actually
     occupies three slots. Budgeting it as one was the bug that would have made a session
     advertised as ten minutes run closer to fifteen. */
  const stepGaps = fitSteps(o.stepGaps, size);
  const perNew = 1 + stepGaps.length;
  /* The share is a brake on competing with reviews, not a quota to leave empty. On a deck
     where nothing has been studied yet there ARE no reviews to protect, and reserving 60%
     of the session for them produced a three-card session on an 840-word deck. When the
     review supply cannot fill the session, new material may use what is left — still
     never more than maxNew, because interference is the real limit. */
  const knownAll0 = all.filter((c) => !c.fresh).length;
  const room = Math.max(Math.floor(size * o.newShare), size - knownAll0);
  const newCount = Math.min(fresh.length, o.maxNew, Math.floor(room / perNew));
  const chosenNew = fresh.slice(0, newCount);
  const reviewSlots = Math.max(0, size - chosenNew.length * perNew);

  /* The staleness ceiling gets RESERVED SLOTS. It used to be a +4 nudge on the score, and
     a nudge loses: a very stable item has a tiny need score, so +4 still left it below a
     genuinely decaying card, and under any real backlog exactly zero stale items made the
     cut. A ceiling that the backlog can outvote is not a ceiling. */
  /* Vocab-led first, and the stale reserve is taken WITHIN each side rather than off the
     top. Reserving stale slots globally quietly broke vocab-led: every stale item happened
     to be kanji, so the ceiling spent vocabulary's budget on another deck and the session
     stopped being vocab-led at all. Each side now funds its own recalls. */
  const vocabTarget = Math.round(reviewSlots * o.vocabShare);
  const otherTarget = Math.max(0, reviewSlots - vocabTarget);
  /* Two reserves, for two things pure need-ordering will never deliver.

     STALE, as before: a ceiling the backlog can outvote is not a ceiling.

     STRONG is the one that makes a session assorted. Need-ordering selects the most
     decayed items, decayed items are by definition weakly known, and a weakly known item
     can only fairly be asked as recognition — so a session chosen purely by need is a
     session of nothing but multiple choice and flip cards, however good the choosing was.
     The formats that actually test production, spelling and listening only apply to words
     you already half-know, and those are never the neediest. So some of the session is
     reserved for them: not because they are urgent, but because they are the only items
     that can carry the harder exercises. */
  const stabilityOf = (c) => {
    const f = (c.st && c.st.fsrs) || seedFromHistory(c.st);
    return (f && f.S) || 0;
  };
  const reserve = (pool, budget) => {
    const st = pool.filter((c) => c.stale).slice(0, Math.round(budget * o.staleShare));
    let got = new Set(st.map(keyOf));
    const rest = pool.filter((c) => !got.has(keyOf(c)));

    /* Split by what each item can actually be ASKED, then alternate. Taking the strong
       reserve as one need-sorted list quietly starved the hardest format: the very
       strongest words are the least decayed, so they sort last, and spelling — the whole
       point of having a production exercise — never appeared at all. */
    /* Capability is checked HERE, not downstream. Reserving a production slot for an item
       the interface cannot ask for production of — a kanji card with no reading, say —
       spent the slot on a recognition question and quietly defeated the reserve's whole
       purpose. An item also has to be capable of the exercise it is being reserved FOR. */
    const typeable = rest.filter((c) => c.caps && c.caps.type && stabilityOf(c) >= o.typeAtStability);
    const listenable = rest.filter((c) => {
      if (!(c.caps && c.caps.listen)) return false;
      const S = stabilityOf(c);
      return S >= o.listenAtStability && S < o.typeAtStability;
    });
    const want = Math.round(budget * o.strongShare);
    const strong = [];
    while (strong.length < want && (typeable.length || listenable.length)) {
      if (typeable.length && strong.length < want) strong.push(typeable.shift());
      if (listenable.length && strong.length < want) strong.push(listenable.shift());
    }

    got = new Set([...st, ...strong].map(keyOf));
    return {
      stale: [...st, ...strong],
      pool: pool.filter((c) => !got.has(keyOf(c))),
      left: budget - st.length - strong.length,
    };
  };

  const vocabAll = known.filter((c) => c.deck === "vocab");
  const vs = reserve(vocabAll, vocabTarget);
  /* Woven, not prepended. Putting the reserved items first meant every production and
     listening question landed in the opening stretch and the rest of the session was one
     long run of identical flip cards — assorted on paper, monotonous in the hand. */
  const vocab = weave(vs.pool.slice(0, Math.max(0, vs.left)), vs.stale);

  /* Variety first, then urgency. Pure round-robin gave a perfectly healthy deck the same
     share as a critically decayed one — dates at 99% recall took as many slots as kanji at
     30%, which is variety bought with the session's whole point. So: one guaranteed slot
     per deck that actually needs one, and everything after that goes to whoever is worst
     off, regardless of which deck they come from. */
  const os = reserve(known.filter((c) => c.deck !== "vocab"), otherTarget);
  const otherSlots = Math.max(0, os.left);
  const byDeck = new Map();
  for (const c of os.pool) {
    if (!byDeck.has(c.deck)) byDeck.set(c.deck, []);
    byDeck.get(c.deck).push(c);
  }
  for (const q of byDeck.values()) q.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const q of [...byDeck.values()].sort((a, b) => b[0].score - a[0].score)) {
    if (picked.length >= otherSlots) break;
    // Urgency, not the composite. A deck priority should not carry an item over a bar
    // that is explicitly about how much the memory needs attention.
    if (q[0].need >= o.urgencyFloor) picked.push(q.shift());
  }
  const pooled = [...byDeck.values()].flat().sort((a, b) => b.score - a.score);
  for (const c of pooled) {
    if (picked.length >= otherSlots) break;
    picked.push(c);
  }
  const others = weave(picked, os.stale);

  /* Backfill. Every cap above is an upper bound, so a session could finish well short of
     its budget — the leech bug showed up as a 20-item session quietly delivering 13. If
     slots remain, fill them with whatever is next-most-needed. */
  const chosenKeys = new Set([...vocab, ...others].map(keyOf));
  const shortfall = reviewSlots - (vocab.length + others.length);
  const filler = shortfall > 0
    ? known.filter((c) => !chosenKeys.has(keyOf(c))).slice(0, shortfall)
    : [];

  /* Interleave rather than concatenate. Blocks of one deck let you settle into a mode,
     and removing that predictability is the entire point of interleaving. Vocabulary is
     the major stream; the stale recalls and the other decks are woven through it. */
  const major = [...vocab, ...filler.filter((c) => c.deck === "vocab")];
  const minor = [...others, ...filler.filter((c) => c.deck !== "vocab")];
  const body = weave(major, minor);

  /* New items go INTO the session, not onto the end of it, and each one comes back at
     expanding gaps. This is the change that matters most: it turns a single glance at a
     tired moment into two or three spaced retrievals while the memory is still warm. */
  const out = body.map((c) => ({ ...c, step: 0 }));
  if (chosenNew.length) {
    /* Two passes, and the order matters. Placing each new item together with its repeats
       meant the first item was spaced against an almost-empty list, so on a deck with no
       reviews yet every repeat was skipped for lack of room and the session was just the
       first showings. Seat every new item first; the repeats then have the other new
       items to be spaced against, which is perfectly good spacing. */
    const gap = Math.max(1, Math.floor(out.length / (chosenNew.length + 1)));
    chosenNew.forEach((c, i) => insertAt(out, gap * (i + 1) + i, { ...c, step: 0 }));

    for (const c of chosenNew) {
      let cursor = out.findIndex((p) => p.item.id === c.item.id && p.deck === c.deck);
      if (cursor < 0) continue;
      for (let s = 0; s < stepGaps.length; s++) {
        const want = cursor + stepGaps[s];
        // Never let a clamped insertion land a repeat next to its own previous showing:
        // massed repetition is worse than one fewer step.
        if (want > out.length && out.length - cursor < 2) break;
        cursor = Math.min(want, out.length);
        insertAt(out, cursor, { ...c, step: s + 1 });
      }
    }
  }
  return out;
}

/* ── which exercise to ask ──
   A session of nothing but flip cards tests one thing — "do you recognise this?" — and a
   word can pass that forever while you still cannot produce it, spell it, or catch it in
   speech. Rotating the format is the borrowable idea from Duolingo's adaptive model: the
   difficulty belongs to the EXERCISE, not only the word, and four formats on one word are
   four different memories.

   The rotation is not random. It follows strength, because asking for production of a
   word met ninety seconds ago is not desirable difficulty, it is just failure:

     learn   first contact — shown, not tested; nothing to retrieve yet
     mc      recognise it among plausible neighbours; the first real retrieval
     recall  the flip card; free recall of the meaning
     listen  hear it, then say what it was — the only format that survives real speech
     type    produce it from the meaning, spelled out; the hardest, and last

   Learning-step repeats deliberately change format between showings. Seeing the identical
   card three times teaches the card; being asked three different ways teaches the word. */
export const FORMATS = ["learn", "mc", "recall", "listen", "type"];

export function formatFor(pick, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const st = pick.st;
  const seen = (st && st.seen) || 0;

  // Brand new: introduce, then test it two different ways within the session.
  if (!seen || pick.fresh) return ["learn", "mc", "recall"][Math.min(pick.step || 0, 2)];

  /* Read the ability the decision is ABOUT. Choosing a production exercise from the
     recognition state was the real defect here: someone who reads 火曜日 at 99% and
     produces it at 55% would keep being handed recognition, because recognition is what
     the selector was looking at — training the ability they already had. */
  const rec = pick.recognition || skillOf(st, "fsrs");
  const prod = pick.production || skillOf(st, "rfsrs");
  const caps = pick.caps || { type: pick.canType, listen: pick.canListen };
  const step = pick.step || 0;
  const canHear = !!caps.listen && o.allowListen !== false;

  /* Struggling at recognition: drop back rather than piling on production. A word you keep
     missing does not need a harder question, it needs a fair one. */
  if (rec.acc < 0.6 || rec.S < 2) return step % 2 === 1 ? "recall" : "mc";

  /* Production is UNLOCKED by recognition — you cannot produce what you cannot yet read —
     but once unlocked it is judged on its own record. */
  if (caps.type && rec.S >= o.typeAtStability) {
    /* Weak or untried production is exactly the case that needs producing, so it takes
       the primary slot and the repeat gives support. The old rule did the opposite. */
    if (!prod.tried || prod.acc < 0.6 || prod.S < o.prodWeakStability) {
      return step % 2 === 0 ? "type" : "recall";
    }
    // Production is solid too; spread the load across the other abilities.
    return step % 2 === 0 ? "type" : (canHear ? "listen" : "recall");
  }

  /* Listening is a REPEAT format, never a first showing, and it needs permission. Audio
     depends on where you are — headphones, a quiet room, not being in class — so a session
     full of it is unusable half the time. Confining it to repeats makes it naturally
     uncommon, since most picks are first showings. */
  if (rec.S >= o.listenAtStability) {
    return step % 2 === 1 ? (canHear ? "listen" : "mc") : "recall";
  }
  return step % 2 === 1 ? "mc" : "recall";
}

/* Attach a format to every pick. Kept separate from buildSession so the selection and the
   presentation can be reasoned about — and tested — independently. */
export function withFormats(picks, opts = {}) {
  return picks.map((p) => ({ ...p, format: formatFor(p, opts) }));
}

/* A short, honest description of why this session looks the way it does. The scheduler is
   more trustworthy when it can say what it is doing — "34 words are fading" is a better
   reason to start than "you have 392 due". */
export function describe(picks) {
  const firsts = picks.filter((p) => p.step === 0);
  const seen = new Set();
  let fresh = 0, stale = 0, decks = new Set();
  for (const p of firsts) {
    const k = p.deck + ":" + p.item.id;
    if (seen.has(k)) continue;
    seen.add(k);
    if (p.fresh) fresh++;
    if (p.stale) stale++;
    decks.add(p.deck);
  }
  return { total: picks.length, unique: seen.size, fresh, stale, decks: [...decks] };
}
