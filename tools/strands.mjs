/* ── one model over every activity ──
   Pure (no DOM, no storage) — see tools/test-strands.mjs.

   The app grew a practice surface at a time, and each one kept its own store: words in the
   deck, characters in jpn101:kanji, kana in jpn101:kana, conjugation in jpn101:conj, dates
   in jpn101:dates. Six places recording "how well is this known", none of them talking.
   The cost was not duplication, it was blindness — Smart Review could not know that the
   conjugation you keep failing is the reason a Volume 2 scene will not stick, and the
   volume bars could not answer "how much of this book do I know" without meaning "of its
   words".

   ## Why this is a registry and not a migration

   The strands turn out to already agree. Every one of them stores {seen, correct, level,
   streak, last, fsrs} and schedules through statReview/statNeed in src/lib/schedule.js.
   They were never different models — only different keys. So nothing here moves any data:
   each strand keeps its own store, and this reads across them. Progress already earned
   cannot be lost by a layer that only ever reads.

   ## Ordering is by need alone

   No caps, no per-strand quotas: whatever the memory model says has decayed most goes
   first, whether that is a word, a character or a verb form. That is a deliberate choice
   with a known consequence — a session genuinely can come out mostly kana on a day when
   kana is what has rotted — and it is the honest reading of "one queue, sorted by what I
   need". describeMix exists so that when it happens the session can say why rather than
   looking broken. */

import { statNeed } from "../src/lib/schedule.js";
import { volumeOfAct, VOLUME_ACTS } from "./curriculum.mjs";

/* Every practice surface that produces evidence. `volumes` is which volumes the strand
   counts toward: kana is foundational and taught in Volume 1 only, so it cannot sensibly
   drag Volume 2's number down; everything else is act-scoped and lands wherever its items
   land. `area` matches the skill areas the day log already records, so the two agree. */
export const STRANDS = [
  { id: "vocab", label: "Words", key: "jpn101:deck", area: "vocab", volumes: null },
  { id: "kanji", label: "Kanji", key: "jpn101:kanji", area: "kanji", volumes: null },
  { id: "kana", label: "Kana", key: "jpn101:kana", area: "kana", volumes: [1] },
  { id: "conj", label: "Conjugation", key: "jpn101:conj", area: "grammar", volumes: null },
  { id: "dates", label: "Dates", key: "jpn101:dates", area: "numbers", volumes: null },
  { id: "quiz", label: "Quizzes", key: "jpn101:quiz", area: "quiz", volumes: null },
];

/* Scripts is deliberately NOT a strand, though it is very much an activity that produces
   evidence. Its Listen and Dialogue modes already write to the shared evidence log, and
   mastery.mjs rolls those rows up per scene — so script practice reaches the volume numbers
   through a path that already exists. Giving it a store of its own here would create a
   SECOND record of the same answers, and the two would drift the moment one of them missed
   a write. The evidence log is the record; this registry covers the surfaces that keep
   per-item stats instead. */
export const EVIDENCE_BACKED = ["script"];

const BY_ID = new Map(STRANDS.map((s) => [s.id, s]));
export const strandById = (id) => BY_ID.get(id) || null;

/** Does this strand count toward this volume at all? */
export function strandInVolume(id, volume) {
  const s = BY_ID.get(id);
  if (!s) return false;
  return !s.volumes || s.volumes.includes(volume);
}

/* ── the one queue ──
   Items arrive as {id, strand, stat, act}. stat is that strand's own record, straight out
   of its own store, in the shape every strand already writes. */

/** Need score for one item, comparable across strands because the model is the same one. */
export function needOf(item, now = Date.now()) {
  return statNeed(item && item.stat, now);
}

/* Sorted by need, highest first. Ties break by strand order and then id so the result is
   stable — an unstable sort here means the queue reshuffles on every render and the
   learner watches cards swap places under their thumb. */
export function unify(items, opts = {}) {
  const now = opts.now || Date.now();
  const order = new Map(STRANDS.map((s, i) => [s.id, i]));
  const scored = (items || [])
    .filter((x) => x && x.id != null && (!opts.strands || opts.strands.includes(x.strand)))
    .map((x) => ({ ...x, need: needOf(x, now) }));
  scored.sort((a, b) =>
    b.need - a.need
    || (order.get(a.strand) ?? 99) - (order.get(b.strand) ?? 99)
    || String(a.id).localeCompare(String(b.id)));
  return typeof opts.limit === "number" ? scored.slice(0, opts.limit) : scored;
}

/** What a built session actually turned out to be, per strand. */
export function mixOf(queue) {
  const by = new Map();
  for (const x of queue || []) by.set(x.strand, (by.get(x.strand) || 0) + 1);
  return [...by.entries()]
    .map(([id, n]) => ({ strand: id, label: (BY_ID.get(id) || {}).label || id, n }))
    .sort((a, b) => b.n - a.n);
}

/* Sorting by need alone means a session can be lopsided, and a lopsided session looks
   broken unless it says why. "14 kana, 6 words" plus the reason is a different experience
   from a review that silently stops being about words. */
export function describeMix(queue) {
  const mix = mixOf(queue);
  if (!mix.length) return "nothing due";
  const total = mix.reduce((n, m) => n + m.n, 0);
  const parts = mix.map((m) => `${m.n} ${m.label.toLowerCase()}`).join(", ");
  const top = mix[0];
  if (mix.length > 1 && top.n / total >= 0.6) {
    return `${parts} — ${top.label.toLowerCase()} came out on top because that is what has faded most`;
  }
  return parts;
}

/* ── how much of a volume is known ──
   One number, and the strands that make it up. The composite is weighted by how many ITEMS
   each strand contributes, not by giving each strand an equal vote: a volume is mostly
   words, and letting a 40-item conjugation set swing the figure as hard as 800 words would
   say something false about how much of the book is known.

   Coverage and mastery stay apart for the same reason they do in progress.mjs: met-once
   and actually-known are different claims, and `done` is the only one that reaches 100%
   by knowing the material rather than by having scrolled past it. */
export function strandProgress(items) {
  let total = 0, seen = 0, weight = 0;
  for (const it of items || []) {
    if (!it) continue;
    total++;
    const st = it.stat;
    if (!st || !st.seen) continue;
    seen++;
    // level is 0-5 across every strand; mastery is how far up that ladder the item sits.
    weight += Math.max(0, Math.min(5, st.level || 0)) / 5;
  }
  const coverage = total ? seen / total : 0;
  const mastered = seen ? weight / seen : null;
  return {
    items: total,
    seen,
    coverage,
    mastered,
    done: mastered == null ? null : coverage * mastered,
  };
}

/** Composite for one volume, plus the per-strand breakdown that explains it. */
export function volumeComposite(itemsByStrand, volume) {
  const strands = [];
  let doneWeight = 0, itemWeight = 0, anyMeasured = false, seenTotal = 0, itemTotal = 0;
  for (const s of STRANDS) {
    if (!strandInVolume(s.id, volume)) continue;
    /* Scoped HERE rather than trusting the caller to have done it. Passing a strand's whole
       item list is the obvious thing to do from the app, and it would silently count every
       act toward every volume — the same inflation byVolume exists to prevent, arriving
       through the front door instead. Filtering twice is harmless; forgetting once is not. */
    const items = byVolume((itemsByStrand && itemsByStrand[s.id]) || [], volume);
    const p = strandProgress(items);
    if (!p.items) continue;                       // a strand with nothing in this volume
    strands.push({ strand: s.id, label: s.label, ...p });
    seenTotal += p.seen;
    itemTotal += p.items;
    if (p.done == null) continue;
    anyMeasured = true;
    doneWeight += p.done * p.items;
    itemWeight += p.items;
  }
  return {
    volume,
    strands,
    items: itemTotal,
    seen: seenTotal,
    // Everything met at least once, across every strand — the pale bar behind `done`. It
    // needs no measured mastery to exist, so it is a number even when done is still null.
    coverage: itemTotal ? seenTotal / itemTotal : 0,
    // Null rather than 0 when nothing has been measured: "not measured" and "none of it"
    // are very different claims and a bar cannot tell them apart on its own.
    done: anyMeasured && itemWeight ? doneWeight / itemWeight : null,
  };
}

/** Every volume the curriculum defines, in book order. */
export function allVolumes(itemsByStrand, opts = {}) {
  return (opts.volumes || VOLUME_ACTS).map((v) => volumeComposite(itemsByStrand, v.volume));
}

/* Split a strand's items into volumes by the act each one belongs to.

   An item with no act is the awkward case, and the two kinds of it are not the same. Kana
   has no act because it is not act-scoped material, but its strand IS scoped — Volume 1 —
   so it places fine. Conjugation and dates have no act because the curriculum tag simply
   is not in the data, and their strands are scoped to every volume: counting them wherever
   they land would put the identical 264 verb forms into Volume 1 AND Volume 2 in full, and
   inflate both. Unplaceable is unplaceable, so they are excluded here and reported by
   unplaced() rather than being quietly filed under a volume nobody taught them in. They
   still schedule and still reach Smart Review; it is only "how much of Volume 2" that
   cannot honestly count them. */
export function byVolume(items, volume) {
  return (items || []).filter((it) => {
    if (!it) return false;
    if (!strandInVolume(it.strand, volume)) return false;
    if (it.act != null) return volumeOfAct(it.act) === volume;
    // No act: only an explicitly scoped strand can place it.
    const s = BY_ID.get(it.strand);
    return !!(s && s.volumes);
  });
}

/** Items that belong to no volume, so a bar can say what it is not counting. */
export function unplaced(items) {
  const by = new Map();
  for (const it of items || []) {
    if (!it || it.act != null) continue;
    const s = BY_ID.get(it.strand);
    if (s && s.volumes) continue;                 // scoped, so it placed
    by.set(it.strand, (by.get(it.strand) || 0) + 1);
  }
  return [...by.entries()]
    .map(([id, n]) => ({ strand: id, label: (BY_ID.get(id) || {}).label || id, n }))
    .sort((a, b) => b.n - a.n);
}

/** One honest sentence about a volume, so the wording cannot drift from the numbers. */
export function describeComposite(v) {
  if (!v || !v.items) return "nothing from this volume yet";
  if (v.done == null) return `${v.items} items, none measured yet`;
  const pct = Math.round(v.done * 100);
  /* "Weakest" needs at least two MEASURED strands to mean anything. Counting strands
     instead let a volume where only kana had been touched announce "weakest is kana" —
     technically the minimum of a one-element set, and read as a finding about kana when it
     was really a statement that nothing else had been tried. */
  const measured = v.strands.filter((s) => s.done != null);
  const worst = [...measured].sort((a, b) => a.done - b.done)[0];
  const tail = measured.length > 1 ? ` — weakest is ${worst.label.toLowerCase()}` : "";
  return `${pct}% of Volume ${v.volume}${tail}`;
}
