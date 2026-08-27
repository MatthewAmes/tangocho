/* Conjugation drill bank for the Drill tab. */

// Rules describe how the STEM is formed, not one specific ending — the drill asks for
// all 8 cells now, so a negative-only rule ("drop る, add ない") was wrong on 7 of them.
export const CONJ_TYPES = {
  ichidan:   { chip: "① ichidan", rule: "iru/eru verb → drop る, then add the ending (ます・ない・た・なかった)" },
  godan:     { chip: "⑤ godan", rule: "shift the last sound across the あいうえお rows: ～い+ます, ～あ+ない, past is 音便" },
  irregular: { chip: "irregular", rule: "no pattern — する and くる have to be memorised" },
  iadj:      { chip: "い-adj", rule: "drop the final い → ～く for negatives, ～かった for past" },
  na:        { chip: "noun / な-adj", rule: "だ・です, じゃない for negatives, だった・でした for past" },
};

export const CONJ_BANK = [
  // ① ichidan — drop る + ない
  { dict: "食べる", reading: "たべる", meaning: "eat", type: "ichidan", neg: "食べない", negR: "たべない", polite: "食べません / 食べないです", how: "食べ〼 + ない" },
  { dict: "始める", reading: "はじめる", meaning: "begin", type: "ichidan", neg: "始めない", negR: "はじめない", polite: "始めません / 始めないです", how: "始め〼 + ない" },
  { dict: "いる", reading: "いる", meaning: "exist; be (people/animals)", type: "ichidan", neg: "いない", negR: "いない", polite: "いません / いないです", how: "い〼 + ない" },
  { dict: "できる", reading: "できる", meaning: "can do", type: "ichidan", neg: "できない", negR: "できない", polite: "できません / できないです", how: "でき〼 + ない" },
  // ⑤ godan — last sound shifts to the あ row + ない
  { dict: "帰る", reading: "かえる", meaning: "return home", type: "godan", neg: "帰らない", negR: "かえらない", polite: "帰りません / 帰らないです", how: "る → ら + ない", note: "Trap! Ends in -eru but it's GODAN, not ichidan. 帰らない, never 帰ない." },
  { dict: "待つ", reading: "まつ", meaning: "wait", type: "godan", neg: "待たない", negR: "またない", polite: "待ちません / 待たないです", how: "つ → た + ない" },
  { dict: "飲む", reading: "のむ", meaning: "drink", type: "godan", neg: "飲まない", negR: "のまない", polite: "飲みません / 飲まないです", how: "む → ま + ない" },
  { dict: "読む", reading: "よむ", meaning: "read", type: "godan", neg: "読まない", negR: "よまない", polite: "読みません / 読まないです", how: "む → ま + ない" },
  { dict: "行く", reading: "いく", meaning: "go", type: "godan", neg: "行かない", negR: "いかない", polite: "行きません / 行かないです", how: "く → か + ない" },
  { dict: "書く", reading: "かく", meaning: "write", type: "godan", neg: "書かない", negR: "かかない", polite: "書きません / 書かないです", how: "く → か + ない" },
  { dict: "わかる", reading: "わかる", meaning: "understand", type: "godan", neg: "わからない", negR: "わからない", polite: "わかりません / わからないです", how: "る → ら + ない" },
  { dict: "終わる", reading: "おわる", meaning: "end; finish", type: "godan", neg: "終わらない", negR: "おわらない", polite: "終わりません / 終わらないです", how: "る → ら + ない" },
  { dict: "頑張る", reading: "がんばる", meaning: "do one's best", type: "godan", neg: "頑張らない", negR: "がんばらない", polite: "頑張りません / 頑張らないです", how: "る → ら + ない" },
  // irregular
  { dict: "する", reading: "する", meaning: "do", type: "irregular", neg: "しない", negR: "しない", polite: "しません / しないです", how: "する → しない" },
  { dict: "来る", reading: "くる", meaning: "come", type: "irregular", neg: "来ない", negR: "こない", polite: "来ません(きません) / 来ないです(こないです)", how: "くる → こない", note: "The reading changes: くる → こない. Kanji stays 来." },
  { dict: "ある", reading: "ある", meaning: "exist; have (things)", type: "irregular", neg: "ない", negR: "ない", polite: "ありません / ないです", how: "ある → ない", note: "Trap! NOT あらない. The negative of ある is just ない." },
  // い-adjectives — drop い + くない
  { dict: "高い", reading: "たかい", meaning: "expensive; tall", type: "iadj", neg: "高くない", negR: "たかくない", polite: "高くないです", how: "高〜 + くない" },
  { dict: "安い", reading: "やすい", meaning: "cheap", type: "iadj", neg: "安くない", negR: "やすくない", polite: "安くないです", how: "安〜 + くない" },
  { dict: "大きい", reading: "おおきい", meaning: "big", type: "iadj", neg: "大きくない", negR: "おおきくない", polite: "大きくないです", how: "大き〜 + くない" },
  { dict: "小さい", reading: "ちいさい", meaning: "small", type: "iadj", neg: "小さくない", negR: "ちいさくない", polite: "小さくないです", how: "小さ〜 + くない" },
  { dict: "遠い", reading: "とおい", meaning: "far", type: "iadj", neg: "遠くない", negR: "とおくない", polite: "遠くないです", how: "遠〜 + くない" },
  { dict: "近い", reading: "ちかい", meaning: "close; near", type: "iadj", neg: "近くない", negR: "ちかくない", polite: "近くないです", how: "近〜 + くない" },
  { dict: "難しい", reading: "むずかしい", meaning: "difficult", type: "iadj", neg: "難しくない", negR: "むずかしくない", polite: "難しくないです", how: "難し〜 + くない" },
  { dict: "忙しい", reading: "いそがしい", meaning: "busy", type: "iadj", neg: "忙しくない", negR: "いそがしくない", polite: "忙しくないです", how: "忙し〜 + くない" },
  { dict: "おいしい", reading: "おいしい", meaning: "delicious", type: "iadj", neg: "おいしくない", negR: "おいしくない", polite: "おいしくないです", how: "おいし〜 + くない" },
  { dict: "おもしろい", reading: "おもしろい", meaning: "interesting", type: "iadj", neg: "おもしろくない", negR: "おもしろくない", polite: "おもしろくないです", how: "おもしろ〜 + くない" },
  { dict: "いい", reading: "いい", meaning: "good", type: "iadj", neg: "よくない", negR: "よくない", polite: "よくないです", how: "いい → よくない", note: "Trap! いい conjugates from its old form よい, so the negative is よくない, never いくない." },
  // nouns / な-adjectives — + じゃない
  { dict: "好き", reading: "すき", meaning: "liked; likable", type: "na", neg: "好きじゃない", negR: "すきじゃない", polite: "好きじゃないです", how: "好き + じゃない" },
  { dict: "大丈夫", reading: "だいじょうぶ", meaning: "okay; fine", type: "na", neg: "大丈夫じゃない", negR: "だいじょうぶじゃない", polite: "大丈夫じゃないです", how: "大丈夫 + じゃない" },
  { dict: "きれい", reading: "きれい", meaning: "pretty; clean", type: "na", neg: "きれいじゃない", negR: "きれいじゃない", polite: "きれいじゃないです", how: "きれい + じゃない", note: "Trap! Ends in い but it's a な-adjective. きれいじゃない, never きれくない." },
  { dict: "病気", reading: "びょうき", meaning: "sick (noun)", type: "na", neg: "病気じゃない", negR: "びょうきじゃない", polite: "病気じゃないです", how: "病気 + じゃない" },
  { dict: "先生", reading: "せんせい", meaning: "teacher (noun)", type: "na", neg: "先生じゃない", negR: "せんせいじゃない", polite: "先生じゃないです", how: "先生 + じゃない" },
  { dict: "休み", reading: "やすみ", meaning: "day off (noun)", type: "na", neg: "休みじゃない", negR: "やすみじゃない", polite: "休みじゃないです", how: "休み + じゃない" },
];

export const CONJ_FILTERS = [["all", "All"], ["ichidan", "① る"], ["godan", "⑤ う"], ["irregular", "Irreg"], ["iadj", "い-adj"], ["na", "Noun/な"]];
