/* Import NihonGO NOW! scene scripts from the textbook PDFs.
     pdftotext -enc UTF-8 book.pdf book.txt
     node tools/import-scripts.mjs book.txt > /tmp/scripts.js

   The Scripts tab and the cloze engine both run on SCRIPT_SEED, which held 34 hand-entered
   Vol 1 scenes. The public site does not publish script text — it has audio and grammar
   notes only — so the books are the only source, and they turn out to be a very good one.

   ## What the layout gives us

   pdftotext emits ruby as its own line ABOVE the line it annotates, in reading order, and
   one line per ruby group:

       き ゃ ん ぱ す          <- キャンパス
       ひろ                    <- 広
       たいへん                <- 大変
       キャンパスが広いから大変でしょう？

   which is exactly the {t, r} token structure the app already renders — the furigana it
   would otherwise have to be told. Ruby is sometimes spaced per character, so spaces come
   out before anything else.

   ## Telling a speaker from a line

   A speaker's ruby sits IMMEDIATELY above it with no blank between; dialogue ruby is
   blank-separated from its line. That alone is not quite enough — some dialogue also runs
   on directly under its ruby — so it is combined with two cheap tests: a speaker is short
   and carries no sentence punctuation. Names are also collected across the whole book
   first, so a name seen in one scene is recognised in the next. */
import fs from "node:fs";

const KANA = /^[぀-ゟ゠-ヿー\s]+$/;
const SENTENCE_PUNCT = /[。、？！?!]/;
const KANJI_KATA = /[一-龯゠-ヿ]/;
const clean = (s) => String(s || "").replace(/[\s　]/g, "");

/* ── ruby alignment ──
   Walk the line; each kanji or katakana RUN takes the next ruby in order. Kana between runs
   is its own token with no reading. When the counts disagree the line is emitted without
   readings rather than with wrong ones — a furigana pointing at the wrong word teaches the
   wrong word, and no furigana teaches nothing, which is the better failure. */
export function tokenize(line, rubies) {
  const runs = [];
  let buf = "", isRun = null;
  for (const ch of line) {
    const r = KANJI_KATA.test(ch);
    if (isRun === null || r === isRun) { buf += ch; isRun = r; continue; }
    runs.push({ t: buf, run: isRun });
    buf = ch; isRun = r;
  }
  if (buf) runs.push({ t: buf, run: isRun });

  const needed = runs.filter((x) => x.run).length;
  if (rubies.length !== needed) return runs.map(({ t }) => ({ t }));
  let i = 0;
  return runs.map(({ t, run }) => (run ? { t, r: rubies[i++] } : { t }));
}

/** Blocks of consecutive non-blank lines, so "was there a blank between these" survives. */
function groups(lines) {
  const out = [];
  let cur = [];
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, "");
    if (!l.trim()) { if (cur.length) out.push(cur); cur = []; continue; }
    cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Names that behave like speakers, gathered across the whole book. */
export function speakerNames(text) {
  const counts = new Map();
  for (const g of groups(text.split("\n"))) {
    // ruby directly above a short unpunctuated word, alone in its group
    if (g.length !== 2) continue;
    const [ruby, name] = g.map((x) => x.trim());
    if (!KANA.test(ruby)) continue;
    const n = clean(name);
    if (!n || n.length > 6 || SENTENCE_PUNCT.test(n)) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, c]) => c >= 1).map(([n]) => n));
}

export function parseScenes(text, opts = {}) {
  const speakers = opts.speakers || speakerNames(text);
  /* Split on CRLF as well as LF. These PDFs extract with \r line endings, and in a JS regex
     "." excludes \r as a line terminator — so /^Scene (\d+)-(\d+) (.+)$/ matched nothing at
     all against a file where every line ended in one. Zero scenes, and no error to say why. */
  const lines = text.split(/\r?\n/);
  const scenes = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Scene\s+(\d+)-(\d+)\s+(.+)$/);
    if (!m) continue;
    const [, act, scene, jaTitle] = m;
    // A scene heading also appears in the table of contents; the real one is followed by
    // "The script" within a short distance.
    let scriptAt = -1;
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      if (/^The script\s*$/.test(lines[j])) { scriptAt = j; break; }
      if (/^Scene\s+\d+-\d+/.test(lines[j])) break;
    }
    if (scriptAt < 0) continue;

    // The Japanese script runs until the vocabulary section or the next scene.
    let end = lines.length;
    for (let j = scriptAt + 1; j < lines.length; j++) {
      if (/単語と表現|^Scene\s+\d+-\d+/.test(lines[j])) { end = j; break; }
    }

    const turns = [], english = [];
    let speaker = null, rubies = [], done = false;
    for (const g of groups(lines.slice(scriptAt + 1, end))) {
      if (done) break;
      for (let k = 0; k < g.length; k++) {
        const l = g[k].trim();
        if (!l) continue;
        const bare = clean(l);
        if (KANA.test(l)) {
          /* Ruby directly above a known speaker name is a name reading, not furigana:
             たかし / 孝. Consume both and start a turn. */
          const next = g[k + 1] && clean(g[k + 1]);
          if (next && speakers.has(next) && next.length <= 6) {
            speaker = next; rubies = []; k++;
            continue;
          }
          rubies.push(...l.trim().split(/\s+/).filter(Boolean).join("").split("｜").filter(Boolean));
          continue;
        }
        if (speakers.has(bare) && bare.length <= 6 && !SENTENCE_PUNCT.test(bare)) {
          speaker = bare; rubies = [];
          continue;
        }
        /* The English translation follows the Japanese script directly, before the
           vocabulary section that bounds this loop — so a substantial Latin line, once any
           Japanese has been read, IS the end of the script. Without this the translation was
           concatenated onto the last speaker's turn, which read as that character suddenly
           delivering the English. */
        if (turns.length && /[A-Za-z]/.test(l) && l.replace(/[^A-Za-z]/g, "").length > 12) {
          english.push(l);
          done = true;
          break;
        }
        /* Running page headers repeat the act title and the scene number — "びっくりしました。
           7-1" — in the middle of the text flow. They are Japanese, so nothing else here
           rejects them, and they were being appended to whoever spoke last. */
        if (/\d+-\d+\s*$/.test(l) || bare === clean(jaTitle)) { rubies = []; continue; }
        if (/^\d+$/.test(bare) || /^[A-Za-z0-9 ,.'’\-–—:;()]+$/.test(l)) { rubies = []; continue; }
        /* Justified text puts spaces INSIDE words — 大 丈 夫, 暖 かくて. A space between two
           Japanese characters is always typographic, never lexical, so it goes. Latin runs
           keep theirs. */
        const tidy = l.replace(/(?<=[぀-ヿ一-龯、。？！])\s+(?=[぀-ヿ一-龯、。？！])/g, "");
        turns.push({ speaker, tokens: tokenize(tidy, rubies), text: tidy });
        rubies = [];
      }
    }
    /* The PDF wraps mid-word — "…それから鈴木さ" / "ん、あと…" — so a visual line is not a
       sentence and certainly not a turn. Consecutive lines from the same speaker are one
       turn, joined with no separator because the break was purely typographic. */
    const merged = [];
    for (const t of turns) {
      const last = merged[merged.length - 1];
      if (last && last.speaker === t.speaker) {
        last.tokens = last.tokens.concat(t.tokens);
        last.text += t.text;
      } else {
        merged.push({ ...t });
      }
    }
    if (merged.length) scenes.push({ act: +act, scene: +scene, name: `${act}-${scene}`, jaTitle: jaTitle.trim(), turns: merged });
  }
  return scenes;
}

if (process.argv[1] && process.argv[1].endsWith("import-scripts.mjs")) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node tools/import-scripts.mjs <book.txt>"); process.exit(1); }
  const text = fs.readFileSync(file, "utf8");
  const scenes = parseScenes(text);
  process.stderr.write(`${scenes.length} scenes, ${scenes.reduce((n, s) => n + s.turns.length, 0)} lines\n`);
  for (const s of scenes.slice(0, 2)) {
    process.stderr.write(`\n${s.name} ${s.jaTitle}\n`);
    for (const t of s.turns.slice(0, 4)) {
      process.stderr.write(`  ${(t.speaker || "?").padEnd(6)} ${t.tokens.map((x) => x.r ? `${x.t}(${x.r})` : x.t).join("")}\n`);
    }
  }
  process.stdout.write(JSON.stringify(scenes, null, 1));
}
