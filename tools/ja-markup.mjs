/* The furigana markup: {寒い|さむい} is a word with its reading. Pure, so it can be tested. */
const KANA = /[぀-ヿー]/;

/* "{寒い|さむい}です" -> [{ word: "寒い", reading: "さむい" }, { text: "です" }] */
export function parseJa(src) {
  const out = [], s = String(src || ""), re = /\{([^}|]+)(?:\|([^}|]*))?\}/g;
  let at = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > at) out.push({ text: s.slice(at, m.index) });
    out.push({ word: m[1], reading: m[2] || "" });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/* Furigana sits over the kanji only: 寒い/さむい becomes 寒 with さむ over it, then い. */
export function rubyParts(word, reading) {
  if (!reading || !/[一-鿿々]/.test(word)) return [{ text: word }];
  const w = Array.from(word), r = Array.from(reading);
  let tail = 0;
  while (tail < w.length - 1 && tail < r.length - 1 && KANA.test(w[w.length - 1 - tail]) && w[w.length - 1 - tail] === r[r.length - 1 - tail]) tail++;
  const parts = [{ text: w.slice(0, w.length - tail).join(""), ruby: r.slice(0, r.length - tail).join("") }];
  if (tail) parts.push({ text: w.slice(w.length - tail).join("") });
  return parts;
}
