/* ── Kotoba Quest: reading the story ──
   Pure helpers for src/data/quest-story.js: turning its markup into pieces to draw, and
   deciding what someone says next. Tested in tools/test-quest-story.mjs. */

const KANA = /[぀-ヿー]/;

/* "{寒く|さむく|寒い}です" -> [{ word: "寒く", reading: "さむく", lemma: "寒い" }, { text: "です" }] */
export function parseJa(src, name = "") {
  const out = [];
  const s = String(src || "").replace(/@/g, name);
  const re = /\{([^}|]+)(?:\|([^}|]*))?(?:\|([^}|]*))?\}/g;
  let at = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > at) out.push({ text: s.slice(at, m.index) });
    out.push({ word: m[1], reading: m[2] || "", lemma: m[3] || m[1] });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/* The line as plain Japanese, for the voice. Spaces are for beginners' eyes, not for speech. */
export function plainJa(src, name = "") {
  return parseJa(src, name).map((t) => t.word || t.text).join("").replace(/[ 　]/g, "");
}

/* Furigana sits over the kanji only: 寒く/さむく becomes 寒 with さむ over it, then く. */
export function rubyParts(word, reading) {
  if (!reading || !/[一-鿿々]/.test(word)) return [{ text: word }];
  const w = Array.from(word), r = Array.from(reading);
  let tail = 0;
  while (tail < w.length - 1 && tail < r.length - 1 && KANA.test(w[w.length - 1 - tail]) && w[w.length - 1 - tail] === r[r.length - 1 - tail]) tail++;
  let head = 0;
  while (head < w.length - tail - 1 && head < r.length - tail - 1 && KANA.test(w[head]) && w[head] === r[head]) head++;
  const parts = [];
  if (head) parts.push({ text: w.slice(0, head).join("") });
  parts.push({ text: w.slice(head, w.length - tail).join(""), ruby: r.slice(head, r.length - tail).join("") });
  if (tail) parts.push({ text: w.slice(w.length - tail).join("") });
  return parts;
}

/* Which entry applies: the first whose `need` flags are all set and `not` flags all unset. */
export function pickEntry(entries = [], flags = {}) {
  return entries.find((e) => (e.need || []).every((f) => flags[f]) && !(e.not || []).some((f) => flags[f])) || null;
}

export const goalNow = (goals, flags = {}) => goals.find((g) => !flags[g.until]) || goals[goals.length - 1];

/* Kana or clean rōmaji becomes a katakana name, as Japanese writes a foreign name. A name
   that doesn't spell out as syllables (Matthew, Sam) stays as typed rather than being
   mangled: half-converted, Matthew came out マッヘ. */
export function nameFromInput(text, toKana) {
  const typed = String(text || "").trim();
  if (!typed) return "";
  const kana = toKana(typed);
  if (/[a-z]/i.test(kana) || !kana) return (typed[0].toUpperCase() + typed.slice(1)).slice(0, 12);
  return Array.from(kana).map((c) => (c >= "ぁ" && c <= "ゖ" ? String.fromCharCode(c.charCodeAt(0) + 0x60) : c)).join("").slice(0, 8);
}

/* Run a scene as a queue: take the next node, and a choice puts its lines at the front. */
export function afterChoice(queue, node, option) {
  const rest = queue.slice();
  return option.retry ? [...(option.then || []), node, ...rest] : [...(option.then || []), ...rest];
}
