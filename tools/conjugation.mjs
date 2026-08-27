/* ── Japanese verb/adjective morphology ──
   Pure form generation, extracted so the app, the drill tab and the failure classifier can
   all agree on what counts as a form of a word. Works in KANA (readings), because that is
   what a learner types and what the classifier compares.

   The point of having this at all: 食べる and 食べました are not two words. A learner who
   answers たべました when asked for たべる has retrieved the right lexical item and applied
   the wrong transformation, which is a different problem from not knowing the word — and
   deserves a different response. Edit distance cannot tell those apart; this can. */

export const GODAN_ROWS = {
  "う": ["い", "わ", "った"], "つ": ["ち", "た", "った"], "る": ["り", "ら", "った"],
  "む": ["み", "ま", "んだ"], "ぶ": ["び", "ば", "んだ"], "ぬ": ["に", "な", "んだ"],
  "く": ["き", "か", "いた"], "ぐ": ["ぎ", "が", "いだ"], "す": ["し", "さ", "した"],
};

const I_ROW = "いきしちにひみりぎじぢびぴ";
const E_ROW = "えけせてねへめれげぜでべぺ";

/* Verbs that END in -iru/-eru and are nonetheless GODAN. This list is the whole reason a
   pure heuristic cannot be trusted: 帰る (かえる) looks exactly like an ichidan verb and is
   not one, and getting it wrong produces 帰ない, which is the single most common beginner
   conjugation error. Readings, since that is what the rule actually keys on. */
export const GODAN_LOOKALIKES = new Set([
  "かえる", "はいる", "はしる", "しる", "きる", "いる", "へる", "あせる", "しゃべる",
  "すべる", "ける", "にぎる", "まいる", "かぎる", "しめる", "ちる", "ねる",
]);

/* LIMITATION, stated because the next caller will hit it: without part-of-speech data
   this cannot tell a verb from a noun that happens to end in the same kana. いぬ ends in ぬ
   and がっこう ends in う, so both are reported as godan and will happily generate いにます
   and がっこいます.

   That is safe for inflectionMatch(), the only current caller, because it fires only on an
   EXACT match against a generated form — a learner will never type いにます when asked for
   いぬ, so a false verb simply never matches and the classifier falls through as before.
   It is NOT safe for generation: do not use formsOf() to build drill prompts until cards
   carry a real POS field (TODO-122), or pass the authoritative type via `known`. */
/** Best guess at conjugation class from the dictionary-form READING.
 *  `known` optionally supplies an authoritative type (the Drill tab has one per verb). */
export function verbTypeOf(reading, known) {
  if (known) return known;
  const r = String(reading || "");
  if (!r) return null;
  if (r === "する" || r.endsWith("する")) return "irregular-suru";
  if (r === "くる" || r === "来る") return "irregular-kuru";
  if (r === "ある") return "irregular-aru";
  const last = r.slice(-1);
  if (last === "る") {
    const before = r.slice(-2, -1);
    if (GODAN_LOOKALIKES.has(r)) return "godan";
    if (I_ROW.includes(before) || E_ROW.includes(before)) return "ichidan";
    return "godan";
  }
  if (GODAN_ROWS[last]) return "godan";
  return null;                                  // not a verb we can inflect
}

/** The forms this app teaches, as { formId: reading }. Kana only.
 *  Returns null when the word is not an inflectable verb. */
export function formsOf(reading, known) {
  const r = String(reading || "");
  const type = verbTypeOf(r, known);
  if (!type) return null;
  const out = { dict: r };

  const set = (masuStem, naiStem, ta) => {
    out.masu       = masuStem + "ます";
    out.masen      = masuStem + "ません";
    out.mashita    = masuStem + "ました";
    out.masendeshita = masuStem + "ませんでした";
    out.nai        = naiStem + "ない";
    out.nakatta    = naiStem + "なかった";
    out.ta         = ta;
    out.te         = ta.replace(/た$/, "て").replace(/だ$/, "で");
    out.tai        = masuStem + "たい";
  };

  if (type === "irregular-suru") {
    const base = r.slice(0, -2);                 // 勉強する -> 勉強
    set(base + "し", base + "し", base + "した");
  } else if (type === "irregular-kuru") {
    out.masu = "きます"; out.masen = "きません"; out.mashita = "きました";
    out.masendeshita = "きませんでした";
    out.nai = "こない"; out.nakatta = "こなかった";
    out.ta = "きた"; out.te = "きて"; out.tai = "きたい";
  } else if (type === "irregular-aru") {
    out.masu = "あります"; out.masen = "ありません"; out.mashita = "ありました";
    out.masendeshita = "ありませんでした";
    out.nai = "ない"; out.nakatta = "なかった";
    out.ta = "あった"; out.te = "あって"; out.tai = "ありたい";
  } else if (type === "ichidan") {
    const s = r.slice(0, -1);
    set(s, s, s + "た");
  } else {
    const g = GODAN_ROWS[r.slice(-1)];
    if (!g) return null;
    const stem = r.slice(0, -1), [i, a, ta] = g;
    /* 行く is the standard exception: いった, not いいた. */
    set(stem + i, stem + a, r === "いく" ? "いった" : stem + ta);
  }
  return { type, forms: out };
}

export const FORM_LABEL = {
  dict: "dictionary form", masu: "polite present", masen: "polite negative",
  mashita: "polite past", masendeshita: "polite past negative",
  nai: "plain negative", nakatta: "plain past negative",
  ta: "plain past", te: "te-form", tai: "want to",
};

/** Is `got` a DIFFERENT form of the same word as `expected`?
 *  Returns { sameLemma, form, label } — the whole point being to separate "wrong word"
 *  from "right word, wrong shape". */
export function inflectionMatch(expected, got, known) {
  const e = String(expected || "").trim(), g = String(got || "").trim();
  if (!e || !g || e === g) return { sameLemma: false, form: null, label: null };
  const built = formsOf(e, known);
  if (!built) return { sameLemma: false, form: null, label: null };
  for (const [form, val] of Object.entries(built.forms)) {
    if (val === g && form !== "dict") {
      return { sameLemma: true, form, label: FORM_LABEL[form] || form };
    }
  }
  return { sameLemma: false, form: null, label: null };
}
