/* ── "Explain my mistake" / "Explain my answer" ──
   The feedback sheet's teaching half. Every explanation here is built from things the app
   already knows for certain — the card, what was typed or picked, the rest of the deck, and
   the kanji dictionary — so it works offline, costs nothing, and cannot be wrong about
   Japanese the way a generated explanation can.

   What each case is for:

   - A typed slip (small っ, long vowel, ゛, small ゃゅょ) names the slip and marks the
     sounds, because "one character off" is a measurement and "the small っ" is a fix.
   - Right word, wrong form says WHICH form was produced. たべました for たべる is not a
     vocabulary gap and should not be explained as one.
   - A pick or an answer that is another deck word explains BOTH words and what makes them
     easy to mix up — a shared kanji, or readings that sound alike — because a confusion is
     fixed by the difference, not by more of either word.
   - A correct answer gets the word taken apart: each kanji's own meaning. Knowing that
     火曜日 is fire-weekday-day is what keeps the seven days from blurring together. */

import { slipOf, slipMarks, confusedWith } from "./nearmiss.mjs";
import { editDistance } from "./learner.mjs";
import { inflectionMatch } from "./conjugation.mjs";
import { normalise, glossOf } from "./benchmark.mjs";

const KANJI_RE = /[一-鿿々]/;

/* The kanji dictionary as a lookup. Accepts the shipped kanji.json shape ({ kanji: [...] })
   or an already-built Map, so callers can hold whichever they have. */
export function kanjiIndex(data) {
  if (data instanceof Map) return data;
  const out = new Map();
  for (const k of (data && data.kanji) || []) if (k && k.c) out.set(k.c, k);
  return out;
}

/* Each kanji in the word with its first two meanings. Characters the dictionary does not
   know are skipped rather than guessed at. */
export function kanjiParts(term, index) {
  const idx = index instanceof Map ? index : kanjiIndex(index);
  const out = [];
  for (const ch of String(term || "")) {
    if (!KANJI_RE.test(ch)) continue;
    const k = idx.get(ch);
    if (k && Array.isArray(k.m) && k.m.length) out.push({ c: ch, m: k.m.slice(0, 2).join(", ") });
  }
  return out;
}

/* Why two words are easy to confuse, when there is a reason that can be stated. */
export function whyConfusable(a, b) {
  if (!a || !b) return null;
  const shared = [...new Set([...String(a.term)].filter((ch) => KANJI_RE.test(ch) && String(b.term).includes(ch)))];
  if (shared.length) return `Both are written with ${shared.join("")} — look at the part that differs.`;
  const ra = normalise(a.reading || a.term), rb = normalise(b.reading || b.term);
  if (ra && rb && ra !== rb && editDistance(ra, rb) <= Math.max(1, Math.floor(Math.min(ra.length, rb.length) / 2))) {
    return `They sound alike — ${ra} and ${rb}. Say both out loud and hear the difference.`;
  }
  return null;
}

const describe = (c) => `${c.term}${c.reading && c.reading !== c.term ? ` (${c.reading})` : ""} means “${glossOf(c)}”`;
const flat = (v) => (Array.isArray(v) ? v.join("") : String(v == null ? "" : v));

/* The explanation for one answered card. Returns lines of plain text plus the optional
   structured pieces the sheet renders specially (a marked answer, a word pair, parts). */
export function explainAnswer({ card, verdict, activity = "", cards = [], kanji = null, drill = null } = {}) {
  if (!card || !verdict) return null;
  const idx = kanji ? kanjiIndex(kanji) : new Map();
  const parts = kanjiParts(card.term, idx);
  const byId = (id) => (id ? cards.find((c) => c && c.id === id) : null);
  const out = { ok: !!verdict.ok, lines: [], marks: null, pair: null, parts };

  if (verdict.ok) {
    out.lines.push(describe(card) + ".");
    if (parts.length > 1) out.lines.push("Built from " + parts.map((p) => `${p.c} (${p.m})`).join(" + ") + ".");
    else if (parts.length === 1 && parts[0].c !== card.term) out.lines.push(`${parts[0].c} on its own means “${parts[0].m}”.`);
    if (card.mn) out.lines.push("Your hook: " + card.mn);
    return out;
  }

  /* ── wrong ── */
  // A sentence exercise: say what the sentence was, and what it means.
  /* Only when a sentence drill was actually on screen. An assembled activity whose drill
     could not be built falls back to multiple choice, and that miss is a word pick. */
  if (drill) {
    const want = flat(verdict.want), got = flat(verdict.got);
    if (got) out.lines.push(`You made: ${got}`);
    if (want) out.lines.push(`The sentence is: ${want}`);
    if (drill && drill.en) out.lines.push(`It means “${drill.en}”` + (/[.?!。？！]$/.test(drill.en) ? "" : "."));
    if (activity === "tapfill") out.lines.push("The particle is decided by the job the word before it does in the sentence — who does it, what it's done to, where, or when.");
    return out;
  }
  // Minimal-pair spelling: the drill already knows the rule it was testing.
  if (activity === "spell") {
    out.lines.push(`It's spelled ${flat(verdict.want)}${verdict.chose ? `, not ${verdict.chose}` : ""}.`);
    if (verdict.note) out.lines.push(verdict.note);
    return out;
  }

  const other = byId(verdict.chosenId)
    || (verdict.got && !verdict.mc ? confusedWith(verdict.got, card, cards) : null);

  // A typed (or spoken) answer.
  if (!verdict.mc && typeof verdict.got === "string" && activity !== "cloze") {
    const want = card.reading || card.term;
    if (!verdict.got.trim()) {
      out.lines.push(`It's ${want}${card.term !== want ? ` — ${card.term}` : ""}. Nothing came to mind, which is normal for a newer word; it comes back again in a few minutes.`);
    } else if (other) {
      out.lines.push(`You ${verdict.spoken ? "said" : "wrote"} ${verdict.got} — that's a real word, but a different one: ${describe(other)}.`);
      out.lines.push(`This one is ${describe(card)}.`);
      const why = whyConfusable(card, other);
      if (why) out.lines.push(why);
      out.pair = other;
    } else {
      const inf = inflectionMatch(want, verdict.got);
      if (inf.sameLemma) {
        out.lines.push(`Right word, wrong form — ${verdict.got} is the ${inf.label}. The card asks for the dictionary form, ${want}.`);
      } else {
        const s = slipOf(verdict.got, want, null);
        out.marks = slipMarks(verdict.got, want);
        out.lines.push(`It's ${want}. You ${verdict.spoken ? "said" : "wrote"} ${verdict.got}.`);
        if (s.note) out.lines.push(s.note);
      }
    }
  } else if (other) {
    // A pick among options: meaning choice, listening, picture, or a cloze.
    if (activity === "cloze") out.lines.push(`This sentence needs ${describe(card)}.`);
    else if (activity === "listen") out.lines.push(`What you heard was ${card.reading || card.term}: ${describe(card)}.`);
    else out.lines.push(describe(card) + ".");
    out.lines.push(`What you picked belongs to ${describe(other)}.`);
    const why = whyConfusable(card, other);
    if (why) out.lines.push(why);
    out.pair = other;
  } else {
    out.lines.push(describe(card) + ".");
  }

  if (parts.length > 1) out.lines.push("Taken apart: " + parts.map((p) => `${p.c} (${p.m})`).join(" + ") + ".");
  if (card.mn) out.lines.push("Your hook: " + card.mn);
  return out;
}
