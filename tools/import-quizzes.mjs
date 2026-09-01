/* Import the activity-book exercises as a gradable quiz bank.
     pdftotext -enc UTF-8 -layout ab.pdf ab.txt
     node tools/import-quizzes.mjs ab.txt

   The Quizzes tab needs questions the app can MARK, which means a prompt and a known
   answer. The course website has neither — its activity-book pages are audio players and
   nothing else — so the books are the only source, and they turn out to carry both:

     the body      exercise 7-3-1C, its title, its instruction, and numbered items
     Appendix D    the answer key, as "3. d, next week; 4. g, this one; …"

   Across the two activity books that is 175 exercises, 168 of them with usable text
   prompts, and the ids in the key match the ids in the body one for one.

   ## Two traps in the layout

   Every exercise id appears at least TWICE — once in the table of contents and once where
   the exercise actually is. The TOC copy has no items under it, so the occurrence with the
   most numbered items wins rather than the first, which is the TOC every time.

   Around a quarter of the exercises are listening tasks: the printed page holds only empty
   checkboxes and the question itself is in the audio. Those have answers and no answerable
   prompt, so they are kept with `audio: true` and no items rather than emitted as questions
   with nothing to ask. */

const ID = /^\s*(\d{1,2})-(\d{1,2})-(\d{1,2})([CR])\b\s*(.*)$/;
const ITEM = /^\s*(\d{1,2}(?:-\d{1,2})?)\.\s*(.+)$/;

/* pdftotext -layout keeps the page furniture: running heads, page numbers, the appendix
   name in the margin. None of it is exercise text and all of it sits on its own line. */
const FURNITURE = /^\s*(\d{1,3}|Appendix [A-Z]|Act \d{1,2})\s*$/;

/** Real content, or a checkbox row from a listening exercise with nothing written on it? */
export function hasText(s) {
  return String(s || "").replace(/[^\p{L}\p{N}]/gu, "").length > 2;
}

export function tidy(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/�+/g, "'")            // pdftotext renders curly quotes as replacement chars
    /* The book's checkboxes are a symbol-font glyph at U+F0A8, in the Private Use Area —
       a codepoint with no meaning outside the font that drew it, which arrived in 205
       places and rendered as ◆ scattered through the titles where spaces belong. Control
       characters come through the same way. Both become spaces; the run-collapse below
       then tidies up. Curly quotes and ellipses are left alone: those are real
       punctuation, and flattening them would be damage rather than cleanup. */
    .replace(/[\u{E000}-\u{F8FF}]/gu, " ")
    /* The book also separates the words of a heading with a black diamond, U+25C6. That one
       is a REAL character rather than a private-use glyph, so the strip above walked past it
       and every affected title rendered as "◆What's◆going◆on?". The whole Geometric Shapes
       block goes the same way: these are layout bullets, and none of them carries meaning in
       Japanese or in an English instruction. */
    .replace(/[\u{25A0}-\u{25FF}]/gu, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Numbered items directly under a heading, stopping at the next exercise. */
function itemsAfter(lines, at) {
  const out = [];
  for (let i = at + 1; i < Math.min(at + 60, lines.length); i++) {
    if (ID.test(lines[i])) break;
    if (FURNITURE.test(lines[i])) continue;
    const m = ITEM.exec(lines[i]);
    if (!m || !hasText(m[2])) continue;
    out.push({ n: m[1], prompt: tidy(m[2]) });
  }
  return out;
}

/** Every exercise in the body, each taken from the occurrence that actually has items. */
export function parseExercises(text, opts = {}) {
  const lines = String(text || "").split(/\r?\n/);
  const end = opts.keyAt == null ? lines.length : opts.keyAt;
  const best = new Map();

  for (let i = 0; i < end; i++) {
    const m = ID.exec(lines[i]);
    if (!m) continue;
    /* A contents line — dot leaders and a page number — is never the exercise. The
       "most items wins" rule below cannot separate them on its own when BOTH have zero,
       which is exactly the case for a listening exercise: its page is empty checkboxes, so
       the TOC copy tied and won, and with no instruction line under it the exercise came
       out unmarked as audio. */
    if (/\.{3,}\s*\d+\s*$/.test(lines[i])) continue;
    const [, act, scene, n, type, title] = m;
    const id = `${act}-${scene}-${n}${type}`;
    const items = itemsAfter(lines, i);
    const near = lines.slice(i, i + 5).join(" ");
    const prev = best.get(id);
    // The TOC copy has no items; the real one does. More items wins.
    if (prev && prev.items.length >= items.length) continue;
    best.set(id, {
      id,
      act: +act,
      scene: +scene,
      n: +n,
      type,
      title: tidy(title),
      audio: /\bListen\b/i.test(near),
      items,
    });
  }
  return [...best.values()].sort((a, b) => a.act - b.act || a.scene - b.scene || a.n - b.n);
}

/** Where Appendix D starts, or -1. The key repeats every exercise id, so it must be cut off
    from the body scan or the key's copy would be mistaken for a second exercise. */
export function answerKeyStart(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*Appendix\s+[A-Z]:?\s*Answer\s*keys?\s*$/i.test(lines[i])) return i;
  }
  return -1;
}

/** id -> { itemNumber: answer }, read out of Appendix D. */
export function parseAnswerKey(text, at) {
  const lines = String(text || "").split(/\r?\n/);
  const start = at == null ? answerKeyStart(text) : at;
  const out = new Map();
  if (start < 0) return out;

  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const m = ID.exec(lines[i]);
    if (m) {
      cur = `${m[1]}-${m[2]}-${m[3]}${m[4]}`;
      if (!out.has(cur)) out.set(cur, new Map());
      /* The id line often carries the first answers after the title, and skipping to the
         next line lost every answer for 20 of Volume 2's exercises — they parsed as ids
         with empty maps, so their items were silently dropped as unmarkable. The rest of
         the line is scanned below with the title stripped off. */
      lines[i] = m[5] || "";
      if (!lines[i].trim()) continue;
    }
    if (!cur || FURNITURE.test(lines[i])) continue;
    /* Answers run "3. d, next week; 4. g, this one" and wrap across lines, so the line is
       split on the separator and each piece is only taken when it starts with its own
       number — a wrapped continuation has none and would otherwise become item NaN. */
    for (const piece of lines[i].split(";")) {
      const a = ITEM.exec(piece);
      /* NOT hasText here. That test exists to reject a listening exercise's empty checkbox
         rows, where "3." is followed by nothing worth asking — but it demands more than two
         characters, and a multiple-choice answer is one letter. Applying it to the key threw
         away every matching and MC exercise in both books, which is most of them: 63 of 158
         exercises survived instead of 121. A prompt needs substance; an answer does not. */
      if (!a || !tidy(a[2])) continue;
      out.get(cur).set(a[1], tidy(a[2]));
    }
  }
  return out;
}

/** Exercises paired with their answers — the shape the app grades against. */
export function buildQuizzes(text, opts = {}) {
  const keyAt = answerKeyStart(text);
  const exercises = parseExercises(text, { keyAt: keyAt < 0 ? undefined : keyAt });
  const key = parseAnswerKey(text, keyAt);

  return exercises.map((ex) => {
    const answers = key.get(ex.id) || new Map();
    const items = ex.items
      .map((it) => ({ ...it, answer: answers.get(it.n) || "" }))
      // An item with no answer cannot be marked, and an unmarkable question in a quiz that
      // claims to check what you know is worse than a shorter quiz.
      .filter((it) => it.answer);
    return { ...ex, volume: opts.volume || null, items, answered: items.length };
  });
}

if (process.argv[1] && process.argv[1].endsWith("import-quizzes.mjs")) {
  const fs = await import("node:fs");
  const file = process.argv[2];
  if (!file) { console.error("usage: node tools/import-quizzes.mjs <activity-book.txt>"); process.exit(1); }
  const text = fs.readFileSync(file, "utf8");
  const qs = buildQuizzes(text);
  const withItems = qs.filter((q) => q.answered);
  process.stderr.write(`${qs.length} exercises, ${withItems.length} gradable, `
    + `${qs.reduce((n, q) => n + q.answered, 0)} items, ${qs.filter((q) => q.audio).length} audio-only\n`);
  process.stdout.write(JSON.stringify(qs));
}
