/* ── production without an API key ──

   Across 588 words studied, only 76 have ever been produced even once, and typed answers
   come back at 64% against 90% for recognition. The app has been almost entirely a
   recognition trainer, which is exactly the complaint: fine inside the app, useless in
   front of real Japanese.

   The obvious fix is an AI conversation partner. That needs a paid API key, and the
   instruction here has been explicit that this must not cost money. So this is the
   honest, smaller thing that can be done for free — and it is genuinely smaller. It
   cannot hold a conversation, follow a topic, or judge whether a sentence sounds natural.
   What it can do is force assembly rather than recognition, which is the part that is
   missing.

   The material is the app's own scripted dialogue and the sentences carried by mined
   words: real Japanese the learner has met, rather than sentences invented by a model
   that might be wrong. That constraint is a feature — every prompt here is something a
   person actually wrote.

   ── what these drills are ──

   ORDER    the words of a known sentence, shuffled, to be put back in order. Tests word
            order and particles, which is where English speakers actually fail, and it is
            checkable exactly.
   FILL     the sentence with a grammatical piece removed — a particle, an ending — to be
            supplied from memory.
   BUILD    an English prompt and a small bank of words, to be assembled into the Japanese.

   None of them accepts "close enough", because none of them can judge it. They accept the
   sentence that was actually written, and say so when the answer differs. */

export const DRILL = { ORDER: "order", FILL: "fill", BUILD: "build" };

/* Particles and endings worth removing for a FILL drill. Restricted on purpose: blanking a
   content word turns the exercise into vocabulary recall, which the rest of the app already
   does, and blanking something ambiguous produces a question with several right answers and
   only one accepted. */
export const PARTICLES = ["は", "が", "を", "に", "で", "へ", "と", "も", "から", "まで", "より", "の"];

/* Split a sentence into chunks a learner can reorder. Real tokenisation needs a dictionary
   the size of the app; this splits on the boundary between kanji runs and kana runs, which
   for textbook sentences lands close enough to word boundaries to be a fair puzzle.

   Punctuation stays attached to the chunk before it so the final mark does not become a
   draggable tile of its own. */
export function chunk(sentence, known = []) {
  const s = String(sentence || "");
  if (!s) return [];
  /* Longest known words first, so 日本語 is one tile rather than 日本 plus 語. */
  const vocab = [...known].filter((w) => w && w.length >= 2).sort((a, b) => b.length - a.length);
  const out = [];
  let buf = "", bufKind = null;
  const flush = () => { if (buf) out.push(buf); buf = ""; bufKind = null; };
  const kindOf = (ch) => (/[一-龯]/.test(ch) ? "kanji" : /[ぁ-ん]/.test(ch) ? "hira" : /[ァ-ヶー]/.test(ch) ? "kata" : "other");

  for (let i = 0; i < s.length;) {
    const hit = vocab.find((w) => s.startsWith(w, i));
    if (hit) { flush(); out.push(hit); i += hit.length; continue; }
    const ch = s[i];
    if (/[。、！？!?]/.test(ch)) {
      /* Flush FIRST. Attaching to out[last] while characters are still sitting in the
         buffer put the full stop on the chunk before the one it followed — 元気です。 came
         out as 元気。 + です, which reassembles into a different sentence. */
      flush();
      if (out.length) out[out.length - 1] += ch; else buf += ch;
      i++; continue;
    }
    const k = kindOf(ch);
    if (bufKind && k !== bufKind) flush();
    buf += ch; bufKind = k; i++;
  }
  flush();
  return out.filter(Boolean);
}

/* Where the pieces come from.

   The scripted dialogue is already word-segmented — the app stores tokens so it can show
   readings above individual words — and those boundaries are far better than anything that
   can be derived from the joined string. `chunk` is the fallback for text that arrives
   without them, which is everything mined from what the learner reads. */
export function usableChunks(sentence, opts = {}) {
  const given = opts.chunks;
  if (Array.isArray(given) && given.length) {
    return mergeOkurigana(given.filter(Boolean).map(String), opts.known || []);
  }
  return chunk(sentence, opts.known || []);
}

/* The script tokens split a kanji from its okurigana, because the token carries a reading
   for the kanji part alone: 頑張 + ります, 食 + べませんか？, 好 + きですか？. As tiles those ask
   the learner to reassemble the inside of a verb, which is not word-order practice.

   The deck settles which is which. 大丈夫 is a word on its own, so 大丈夫 + です is two real
   pieces and stays split. 頑張 is not a word on its own, so it belongs with what follows.
   No part-of-speech tagging needed — just "is this a thing you have a card for". */
export function mergeOkurigana(tokens, known = []) {
  const vocab = new Set(known);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const next = tokens[i + 1];
    const endsInKanji = /[一-龯]$/.test(cur);
    const nextIsKana = next && /^[ぁ-ん]/.test(next);
    /* A lone kanji followed by kana is one word essentially always — 食べません, 好きです —
       even when the kanji also exists as a deck entry in its own right. 食 is in the deck,
       so the vocabulary test alone left 食 + べませんか？ split, asking the learner to
       reassemble the inside of a verb.

       The cost is a coarser puzzle where the split was real: 何 + ですか？ becomes one tile.
       Coarser is the safe direction — a tile that is a genuine phrase is a weaker exercise,
       a tile that is half a verb is a wrong one. */
    const loneKanji = /^[一-龯]$/.test(cur);
    if (endsInKanji && nextIsKana && (loneKanji || !vocab.has(cur))) {
      out.push(cur + next);
      i++;
      continue;
    }
    out.push(cur);
  }
  return out;
}

/* Deterministic shuffle that is guaranteed not to return the original order — a "reorder
   these" puzzle that arrives already solved is not a puzzle. */
export function shuffled(list, seed = 0) {
  if (list.length < 2) return [...list];
  const out = list.map((v, i) => ({ v, k: Math.abs(Math.sin((seed + 1) * (i + 7)) * 10000) % 1 }))
    .sort((a, b) => a.k - b.k).map((x) => x.v);
  if (out.join("") === list.join("") ) return [out[out.length - 1], ...out.slice(0, -1)];
  return out;
}

/* Build an ORDER drill from a sentence. Returns null when the sentence is too short to be
   worth reordering — two tiles is a coin flip, not practice. */
export function orderDrill(sentence, opts = {}) {
  const chunks = usableChunks(sentence, opts);
  if (chunks.length < 3 || chunks.length > 9) return null;
  return {
    type: DRILL.ORDER,
    prompt: opts.en || "",
    answer: chunks,
    tiles: shuffled(chunks, opts.seed || 0),
    sentence: String(sentence),
  };
}

/* How deep inside an unbroken hiragana run a position sits. Used to tell a particle
   between words from a syllable inside an inflected verb. */
export function runDepth(s, at) {
  const kana = (ch) => /[ぁ-ん]/.test(ch || "");
  if (!kana(s[at])) return 0;
  let from = at; while (from > 0 && kana(s[from - 1])) from--;
  let to = at; while (to < s.length - 1 && kana(s[to + 1])) to++;
  return to - from + 1;
}

/* Build a FILL drill by removing one particle. Returns null when the sentence contains no
   unambiguous candidate. */
export function fillDrill(sentence, opts = {}) {
  const s = String(sentence || "");
  const seed = opts.seed || 0;
  /* Only positions where the particle is between two other characters — a leading or
     trailing particle is usually part of a word rather than doing grammatical work. */
  /* Positions covered by a word, so a particle sitting INSIDE one is never blanked.

     Without this the drill removed で from です and と from あとで — producing
     "すごい ___ すね！" and "あ ___ で", which are not particle questions at all. They look
     like grammar practice and are actually asking the learner to reconstruct the middle of
     a word they know perfectly well. です and ます are always excluded; everything else is
     found by matching the vocabulary that was passed in. */
  const covered = new Array(s.length).fill(false);
  const words = [...(opts.known || []), "です", "ます", "でした", "ました", "ですか", "ますか"]
    .filter((w) => w && w.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = s.indexOf(w, from);
      if (at < 0) break;
      for (let k = at; k < at + w.length; k++) covered[k] = true;
      from = at + 1;
    }
  }

  const spots = [];
  for (let i = 1; i < s.length - 1; i++) {
    for (const p of PARTICLES) {
      if (!s.startsWith(p, i)) continue;
      if (covered[i]) continue;                 // inside a word, not doing grammatical work
      /* A structural backstop for words the vocabulary list happens to miss: nothing
         following a small kana or a long mark is a particle. ちょっと and やっと are one word,
         and blanking their final と asks the learner to rebuild the middle of a word. */
      if (/[っゃゅょァィゥェォっー]/.test(s[i - 1] || "")) continue;
      /* And a guard for inflected verbs the vocabulary list does not contain as written.
         わからない is a single unbroken run of hiragana, and から sits in the middle of it —
         blanking that produced "わ ___ ないですねえ", which is not a particle question.
         A particle doing grammatical work sits at the edge of a run, not buried four
         characters deep inside one. */
      if (runDepth(s, i) > 4) continue;
      /* A particle that appears more than once would make "which one is missing" ambiguous
         to explain, though the answer stays the same; keep it simple and skip. */
      if (s.split(p).length - 1 !== 1) continue;
      spots.push({ at: i, p });
    }
  }
  if (!spots.length) return null;
  const hit = spots[seed % spots.length];
  return {
    type: DRILL.FILL,
    prompt: opts.en || "",
    before: s.slice(0, hit.at),
    after: s.slice(hit.at + hit.p.length),
    answer: hit.p,
    /* The choices are the other particles, so this is recognition-with-effort rather than
       free recall — the free-recall version is the typed answer, and both are accepted. */
    choices: [hit.p, ...PARTICLES.filter((p) => p !== hit.p).slice(0, 5)],
    sentence: s,
  };
}

/* Build a BUILD drill: English in, Japanese assembled from a bank. The bank is the real
   words plus a few plausible extras, so picking is not simply "use everything given". */
export function buildDrill(sentence, opts = {}) {
  const chunks = usableChunks(sentence, opts);
  /* Three pieces minimum. A two-tile "puzzle" is a coin flip dressed as practice, and
     deriving chunks from a kana-heavy sentence produces exactly that — わかりますか？ is one
     unbroken run of hiragana, so それ、わかりますか？ came out as two tiles. */
  if (!opts.en || chunks.length < 3 || chunks.length > 8) return null;
  const extras = (opts.distractors || []).filter((d) => d && !chunks.includes(d)).slice(0, 3);
  return {
    type: DRILL.BUILD,
    prompt: opts.en,
    answer: chunks,
    tiles: shuffled([...chunks, ...extras], opts.seed || 0),
    sentence: String(sentence),
    /* Stated so the screen can say it: not every tile belongs in the answer. */
    hasDistractors: extras.length > 0,
  };
}

/* Grading. Exact against the sentence that was actually written, because nothing here can
   judge whether a different sentence is also correct — and quietly accepting a wrong one
   would be worse than rejecting a right one, which at least gets looked at. */
export function gradeDrill(drill, given) {
  if (!drill) return { ok: false };
  if (drill.type === DRILL.FILL) {
    const g = String(given || "").trim();
    return { ok: g === drill.answer, expected: drill.answer, got: g };
  }
  const got = Array.isArray(given) ? given : String(given || "").split("");
  const ok = got.length === drill.answer.length && got.every((v, i) => v === drill.answer[i]);
  return {
    ok,
    expected: drill.answer.join(""),
    got: got.join(""),
    /* Where it first went wrong, so the correction can point rather than just re-show the
       sentence. */
    firstWrong: ok ? -1 : got.findIndex((v, i) => v !== drill.answer[i]),
  };
}

/* Pick the drill that fits a sentence, preferring the one that demands most.

   ORDER and BUILD both require assembling a whole sentence; FILL is the fallback for
   sentences too short or too long to reorder. Returns null when nothing fits, which is a
   normal outcome and must not be dressed up. */
export function drillFor(sentence, opts = {}) {
  return buildDrill(sentence, opts) || orderDrill(sentence, opts) || fillDrill(sentence, opts) || null;
}

/* Assemble a session's worth from whatever sentences are available. Deduplicated by
   sentence so one heavily-mined chapter cannot fill the whole set. */
export function drillSet(sources = [], n = 5, opts = {}) {
  const seen = new Set();
  const out = [];
  /* Start somewhere different each day. Walking the sources from index 0 every time made
     the seed affect only how the tiles were shuffled, so the same four sentences came back
     session after session — the identical failure the learner already reported once about
     the review queue, rebuilt here from scratch. */
  /* Strided, not incremented. Adding one per day walks a contiguous window, so consecutive
     days drew overlapping sets and seven days produced six distinct sentences out of a pool
     of a hundred and twenty. A large stride lands somewhere unrelated each time. */
  const offset = sources.length
    ? (Math.abs(Math.floor(opts.seed || 0)) * 37) % sources.length
    : 0;
  for (let step = 0; step < sources.length && out.length < n; step++) {
    const i = (offset + step) % sources.length;
    const src = sources[i];
    const text = typeof src === "string" ? src : src.text;
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const d = drillFor(text, {
      ...opts,
      en: typeof src === "string" ? "" : src.en || "",
      chunks: typeof src === "string" ? null : src.chunks,
      seed: (opts.seed || 0) + i,
    });
    if (d) out.push(d);
  }
  return out;
}
