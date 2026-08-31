/* ── the matching grid ──
   Pure (no DOM) — see tools/test-matchgrid.mjs.

   A board of Japanese words and English meanings to be paired up. The activity is only
   worth building if the board is ADVERSARIAL: a grid of four unrelated words is four
   independent recognition questions shown at once, which is easier than asking them one at
   a time, not harder. What makes it a real exercise is putting the words this learner
   actually confuses on the same board, so the answer cannot be reached by elimination and
   the near-miss has to be discriminated rather than guessed past.

   So the board is built in a deliberate order:
     1. the anchor — the card the scheduler chose
     2. whatever the anchor has historically been confused WITH
     3. other due cards, to fill

   and a board that cannot get a confusion partner is reported as such, so the caller can
   choose a different activity rather than show a weak one. */

export const GRID = { MIN_PAIRS: 3, MAX_PAIRS: 4 };

/* Deterministic shuffle: the same seed gives the same board, so a re-render mid-answer does
   not rearrange the tiles under the learner's finger. */
function shuffled(list, seed = 0) {
  const out = list.slice();
  let s = (seed | 0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const shortMeaning = (m) => String(m || "").split(/[;(（,]/)[0].trim();

/* The term as it should APPEAR on a tile. Deck entries carry grammar annotations in the
   term itself — やる（-U; やった） — which is useful on a flashcard and noise on a tile the
   learner is asked to pair. */
const tileTerm = (t) => String(t || "").split(/[（(]/)[0].trim() || String(t || "");

/* Particles and bare grammatical markers. A matching board asks "which meaning belongs to
   which word", and that question does not have an answer for か or こと — their glosses are
   either a transliteration or a grammar note, so the board becomes unanswerable in a way
   that looks like a bug rather than a hard question. This was live: a board offered
   か against "acceptable" and こと against "koto". */
const FUNCTION_WORDS = new Set([
  "は", "が", "を", "に", "で", "へ", "と", "も", "の", "や", "か", "ね", "よ", "な", "ぞ", "ぜ",
  "から", "まで", "より", "ので", "のに", "けど", "けれど", "こと", "もの", "ため", "まま", "ほう",
  "など", "だけ", "しか", "でも", "ても", "たり", "ながら", "そう", "よう", "らしい", "みたい",
]);

/* Is this card worth putting on a board at all? */
function boardWorthy(c) {
  if (!c || !c.term) return false;
  const term = tileTerm(c.term);
  const meaning = shortMeaning(c.meaning);
  if (!meaning) return false;
  if (FUNCTION_WORDS.has(term)) return false;
  // A "meaning" that is just the word's own romaji teaches nothing and pairs on sound.
  const romaji = String(c.romaji || "").toLowerCase().replace(/[^a-z]/g, "");
  const asAscii = meaning.toLowerCase().replace(/[^a-z]/g, "");
  if (romaji && asAscii && romaji === asAscii) return false;
  return true;
}

/** Can a worthwhile board be built around this card? Cheap enough to call from a gate. */
export function canMatch(anchor, pool, confusion, opts = {}) {
  const o = { ...GRID, ...opts };
  return pickPairs(anchor, pool, confusion, o).length >= o.MIN_PAIRS;
}

/* The pairs, best first. Exported for the tests — the ORDER is the design, so it is worth
   asserting directly rather than only through the shuffled board. */
export function pickPairs(anchor, pool, confusion, opts = {}) {
  const o = { ...GRID, ...opts };
  if (!boardWorthy(anchor)) return [];
  const byId = new Map((pool || []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const usable = (c) => boardWorthy(c) && c.id !== anchor.id;

  const out = [anchor];
  const takenMeanings = new Set([shortMeaning(anchor.meaning).toLowerCase()]);
  const add = (c) => {
    if (!usable(c) || out.some((x) => x.id === c.id)) return false;
    // Two tiles reading "to go" make the board unanswerable rather than hard.
    const m = shortMeaning(c.meaning).toLowerCase();
    if (takenMeanings.has(m)) return false;
    takenMeanings.add(m);
    out.push(c);
    return true;
  };

  // 1. what this word actually gets mistaken for — the whole point of the activity
  const confusedWith = (confusion && confusion.get && confusion.get(anchor.id)) || [];
  for (const id of confusedWith) {
    if (out.length >= o.MAX_PAIRS) break;
    add(byId.get(id));
  }
  // 2. and the reverse: words that get mistaken for THIS one are just as confusable
  if (confusion && confusion.forEach && out.length < o.MAX_PAIRS) {
    for (const [id, list] of confusion) {
      if (out.length >= o.MAX_PAIRS) break;
      if (Array.isArray(list) && list.includes(anchor.id)) add(byId.get(id));
    }
  }
  /* 3. Fill from the pool — SHUFFLED, and preferring the same writing system so the board
        cannot be solved by shape alone (猫 among three kana words needs no Japanese at all).

        The shuffle is the fix for the reported bug. This walked the pool in order, and the
        pool it was handed was the whole deck, so filler was always the first few usable
        cards in it: いただきます, ごちそうさま, おはよう, every single board, whatever the
        anchor was. Seeded so a re-render still cannot move the tiles. */
  const rest = shuffled((pool || []).filter(usable), (o.seed || 1) * 31 + 7);
  for (const c of rest.filter((c) => c.kind === anchor.kind)) {
    if (out.length >= o.MAX_PAIRS) break;
    add(c);
  }
  for (const c of rest) {
    if (out.length >= o.MAX_PAIRS) break;
    add(c);
  }
  return out;
}

/** The board. `tiles` is what gets rendered; `pairs` is what it was built from. */
export function matchBoard(anchor, pool, confusion, opts = {}) {
  const o = { ...GRID, ...opts };
  const pairs = pickPairs(anchor, pool, confusion, o);
  if (pairs.length < o.MIN_PAIRS) return null;

  const seed = o.seed || 1;
  const jp = pairs.map((c) => ({ key: "jp:" + c.id, side: "jp", id: c.id, text: tileTerm(c.term), sub: c.reading || "" }));
  const en = pairs.map((c) => ({ key: "en:" + c.id, side: "en", id: c.id, text: shortMeaning(c.meaning) }));
  return {
    anchorId: anchor.id,
    pairs: pairs.map((c) => ({ id: c.id, term: tileTerm(c.term), meaning: shortMeaning(c.meaning) })),
    // Two independently shuffled columns: shuffling them together would sometimes stack a
    // word directly above its own meaning, which is a free pair.
    jp: shuffled(jp, seed),
    en: shuffled(en, seed * 7 + 1),
    // Whether the board is doing its job, so the screen can be honest about the exercise.
    adversarial: hasConfusable(anchor, pairs, confusion),
  };
}

function hasConfusable(anchor, pairs, confusion) {
  const list = (confusion && confusion.get && confusion.get(anchor.id)) || [];
  if (pairs.some((c) => list.includes(c.id))) return true;
  if (confusion && confusion.forEach) {
    for (const [id, l] of confusion) {
      if (Array.isArray(l) && l.includes(anchor.id) && pairs.some((c) => c.id === id)) return true;
    }
  }
  return false;
}

/* Grading a tap. The board is stateful in the UI; this keeps the RULES here so they can be
   tested without one. `picked` is the currently selected tile (or null), `tile` is the one
   just tapped. */
export function tapResult(picked, tile) {
  if (!tile) return { action: "none" };
  if (!picked) return { action: "select", picked: tile };
  if (picked.key === tile.key) return { action: "deselect", picked: null };
  // Tapping two tiles on the same side moves the selection rather than failing — reaching
  // for a second English meaning is a change of mind, not a wrong answer.
  if (picked.side === tile.side) return { action: "select", picked: tile };
  return picked.id === tile.id
    ? { action: "pair", id: tile.id, picked: null }
    : { action: "miss", id: picked.side === "jp" ? picked.id : tile.id, picked: null };
}
