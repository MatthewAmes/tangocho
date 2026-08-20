// Romaji to hiragana, so answers can be typed on a keyboard with no IME installed.
//
// Typing the reading is a far better test than picking it off a list — recognition can
// coast on elimination, production cannot — but requiring an IME would put that behind a
// system setting on every device he studies on. Converting as he types gets production
// practice with nothing to install.
//
// Longest match wins, so "shi" is read before "sh"+"i" and "kyo" before "ki"+"yo".

const MAP = {
  kya: "きゃ", kyu: "きゅ", kyo: "きょ", kye: "きぇ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  sha: "しゃ", shu: "しゅ", sho: "しょ", she: "しぇ",
  sya: "しゃ", syu: "しゅ", syo: "しょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", je: "じぇ",
  jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  zya: "じゃ", zyu: "じゅ", zyo: "じょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ", che: "ちぇ",
  tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",

  shi: "し", chi: "ち", tsu: "つ",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", ti: "ち", tu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", wi: "うぃ", we: "うぇ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
  va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",

  a: "あ", i: "い", u: "う", e: "え", o: "お",
  "-": "ー",
};

const KEYS_BY_LEN = Object.keys(MAP).sort((a, b) => b.length - a.length);
const VOWEL = /[aiueo]/;

export function toKana(input) {
  let s = String(input || "").toLowerCase().replace(/[^a-z぀-ゟ゠-ヿー-]/g, "");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    // already kana — pass straight through
    if (ch > "　") { out += ch; i++; continue; }

    /* "nn" is an explicit ん — but when a vowel follows, the second n belongs to the next
       syllable, not to the ん: "sannin" is さんにん and "konnichiwa" is こんにちわ, so only
       one n is consumed there. An n not followed by a vowel or y is ん on its own. */
    if (ch === "n") {
      if (s[i + 1] === "n") {
        const after = s[i + 2];
        out += "ん";
        i += after && (VOWEL.test(after) || after === "y") ? 1 : 2;
        continue;
      }
      const next = s[i + 1];
      if (!next || (!VOWEL.test(next) && next !== "y")) { out += "ん"; i++; continue; }
    }

    /* Hepburn writes ん as "m" before b, p and m — tempura, sempai, kombu — which is how
       the romanisation appears on menus and in most textbooks, so it is what gets typed.
       Without this "tempura" came out てmぷら and a right answer was marked wrong.

       Guarded on the following letter: "mama" and "mimi" must stay ま and み. Only an m
       standing immediately before another labial is the syllabic n. */
    if (ch === "m" && /[bpm]/.test(s[i + 1] || "")) { out += "ん"; i++; continue; }

    // a doubled consonant is the small っ: "ippun" -> いっぷん
    if (ch === s[i + 1] && !VOWEL.test(ch) && ch !== "n") { out += "っ"; i++; continue; }

    let hit = null;
    for (const k of KEYS_BY_LEN) {
      if (k.length <= s.length - i && s.startsWith(k, i)) { hit = k; break; }
    }
    if (hit) { out += MAP[hit]; i += hit.length; continue; }

    // an unconsumed letter is a partial syllable mid-typing — keep it visible
    out += ch;
    i++;
  }
  return out;
}

/* Grading is on kana, so anything that is only a spelling difference has to be flattened
   first: katakana to hiragana, ー dropped, and づ/ぢ folded onto ず/じ. */
export function normalizeKana(s) {
  return String(s || "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[ー\s・、。]/g, "")
    .replace(/づ/g, "ず")
    .replace(/ぢ/g, "じ");
}

export const kanaEqual = (a, b) => normalizeKana(a) === normalizeKana(b);
