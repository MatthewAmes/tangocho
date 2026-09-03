/* Verb conjugation for the Drill tab. Pure. */

// godan last kana -> [い-row stem, あ-row stem, plain-past ending (音便)]
export const GODAN_ROWS = {
  "う": ["い", "わ", "った"], "つ": ["ち", "た", "った"], "る": ["り", "ら", "った"],
  "む": ["み", "ま", "んだ"], "ぶ": ["び", "ば", "んだ"], "ぬ": ["に", "な", "んだ"],
  "く": ["き", "か", "いた"], "ぐ": ["ぎ", "が", "いだ"], "す": ["し", "さ", "した"],
};

export function conjugate(dict, type) {
  const F = (a, b, c, d, e, f, g, h) => ({ formal: { presPos: a, presNeg: b, pastPos: c, pastNeg: d },
                                           plain:  { presPos: e, presNeg: f, pastPos: g, pastNeg: h },
                                           te: null, tai: null });
  const teOf = (past) => past.replace(/た$/, "て").replace(/だ$/, "で");

  if (type === "iadj") {
    const s = dict === "いい" ? "よ" : dict.slice(0, -1);   // いい is the one irregular stem
    const R = F(dict + "です", s + "くないです", s + "かったです", s + "くなかったです",
                dict, s + "くない", s + "かった", s + "くなかった");
    R.te = s + "くて";
    R.tai = null;
    return R;
  }
  if (type === "na") {
    const R = F(dict + "です", dict + "じゃないです", dict + "でした", dict + "じゃなかったです",
                dict + "だ", dict + "じゃない", dict + "だった", dict + "じゃなかった");
    R.te = dict + "で";
    R.tai = null;
    return R;
  }
  if (type === "irregular") {
    if (dict === "する") {
      const R = F("します", "しません", "しました", "しませんでした", "する", "しない", "した", "しなかった");
      R.te = "して"; R.tai = "したい";
      return R;
    }
    if (dict === "くる") {
      const R = F("きます", "きません", "きました", "きませんでした", "くる", "こない", "きた", "こなかった");
      R.te = "きて"; R.tai = "きたい";
      return R;
    }
    if (dict === "ある") {
      const R = F("あります", "ありません", "ありました", "ありませんでした", "ある", "ない", "あった", "なかった");
      R.te = "あって"; R.tai = null;
      return R;
    }
    return null; // unknown irregular
  }
  if (type === "ichidan") {
    const s = dict.slice(0, -1);
    const R = F(s + "ます", s + "ません", s + "ました", s + "ませんでした", dict, s + "ない", s + "た", s + "なかった");
    R.te = s + "て";
    R.tai = s + "たい";
    return R;
  }
  const g = GODAN_ROWS[dict.slice(-1)];
  if (!g) return null;
  const stem = dict.slice(0, -1), [i, a, ta] = g;
  const past = dict === "いく" ? "った" : ta;      // 行く is the classic exception, not いいた
  const R = F(stem + i + "ます", stem + i + "ません", stem + i + "ました", stem + i + "ませんでした",
              dict, stem + a + "ない", stem + past, stem + a + "なかった");
  R.te = stem + teOf(past);
  R.tai = stem + i + "たい";
  return R;
}

// the 10 cells of the class's grid — each is one drillable prompt
export const CONJ_FORMS = [
  { id: "f-pp", pol: "formal", key: "presPos", chip: "polite", ask: "polite present" },
  { id: "f-pn", pol: "formal", key: "presNeg", chip: "polite", ask: "polite negative" },
  { id: "f-ap", pol: "formal", key: "pastPos", chip: "polite", ask: "polite past" },
  { id: "f-an", pol: "formal", key: "pastNeg", chip: "polite", ask: "polite past negative" },
  { id: "p-pp", pol: "plain",  key: "presPos", chip: "plain",  ask: "dictionary form" },
  { id: "p-pn", pol: "plain",  key: "presNeg", chip: "plain",  ask: "plain negative" },
  { id: "p-ap", pol: "plain",  key: "pastPos", chip: "plain",  ask: "plain past" },
  { id: "p-an", pol: "plain",  key: "pastNeg", chip: "plain",  ask: "plain past negative" },
  { id: "p-te", pol: "te",     key: null,      chip: "て",      ask: "て-form" },
  { id: "p-tai", pol: "tai",   key: null,      chip: "たい",    ask: "want to (〜たい)" },
];
