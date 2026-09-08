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

  /* ── grown from the deck, not authored by hand ──
     The bank was 33 verbs with only two in the む・ぶ・ぬ group, which is the 音便 row
     learners actually get wrong -- so the sub-rule diagnosis in tools/grammar.mjs had
     almost no evidence to work from.

     These come from NihonGO NOW!'s own glossary, which tags every verb ("to make
     (u-verb; past: 作った)"), so the class is STATED rather than guessed -- かえる alone
     (帰る godan, 変える ichidan) is enough to show why guessing is a bad idea. Each entry
     was derived by tools/conj-candidates.mjs and kept only where conjugate()'s past
     matched the past the glossary prints. Anything that disagreed was dropped, not
     reconciled. Regenerate with: node tools/conj-candidates.mjs --emit */
  { dict: "作る", reading: "つくる", meaning: "to make", type: "godan", neg: "作らない", negR: "つくらない", polite: "つくりません / つくらないです", how: "つくり〼 + ない" },
  { dict: "買う", reading: "かう", meaning: "to buy", type: "godan", neg: "買わない", negR: "かわない", polite: "かいません / かわないです", how: "かい〼 + ない" },
  { dict: "使う", reading: "つかう", meaning: "to use", type: "godan", neg: "使わない", negR: "つかわない", polite: "つかいません / つかわないです", how: "つかい〼 + ない" },
  { dict: "取る", reading: "とる", meaning: "to take", type: "godan", neg: "取らない", negR: "とらない", polite: "とりません / とらないです", how: "とり〼 + ない" },
  { dict: "考える", reading: "かんがえる", meaning: "to think about, consider", type: "ichidan", neg: "考えない", negR: "かんがえない", polite: "かんがえません / かんがえないです", how: "かんがえ〼 + ない" },
  { dict: "手伝う", reading: "てつだう", meaning: "to help", type: "godan", neg: "手伝わない", negR: "てつだわない", polite: "てつだいません / てつだわないです", how: "てつだい〼 + ない" },
  { dict: "聞く", reading: "きく", meaning: "to hear, listen", type: "godan", neg: "聞かない", negR: "きかない", polite: "ききません / きかないです", how: "きき〼 + ない" },
  { dict: "かかる", reading: "かかる", meaning: "to take", type: "godan", neg: "かからない", negR: "かからない", polite: "かかりません / かからないです", how: "かかり〼 + ない" },
  { dict: "決める", reading: "きめる", meaning: "to decide", type: "ichidan", neg: "決めない", negR: "きめない", polite: "きめません / きめないです", how: "きめ〼 + ない" },
  { dict: "急ぐ", reading: "いそぐ", meaning: "to hurry", type: "godan", neg: "急がない", negR: "いそがない", polite: "いそぎません / いそがないです", how: "いそぎ〼 + ない" },
  { dict: "構う", reading: "かまう", meaning: "to mind, care, be concerned about", type: "godan", neg: "構わない", negR: "かまわない", polite: "かまいません / かまわないです", how: "かまい〼 + ない" },
  { dict: "やる", reading: "やる", meaning: "to do", type: "godan", neg: "やらない", negR: "やらない", polite: "やりません / やらないです", how: "やり〼 + ない" },
  { dict: "出す", reading: "だす", meaning: "to submit, take out , send out", type: "godan", neg: "出さない", negR: "ださない", polite: "だしません / ださないです", how: "だし〼 + ない" },
  { dict: "持つ", reading: "もつ", meaning: "to hold, have, carry", type: "godan", neg: "持たない", negR: "もたない", polite: "もちません / もたないです", how: "もち〼 + ない" },
  { dict: "借りる", reading: "かりる", meaning: "to borrow", type: "ichidan", neg: "借りない", negR: "かりない", polite: "かりません / かりないです", how: "かり〼 + ない" },
  { dict: "任せる", reading: "まかせる", meaning: "to leave it to someone else, let someone else do it", type: "ichidan", neg: "任せない", negR: "まかせない", polite: "まかせません / まかせないです", how: "まかせ〼 + ない" },
  { dict: "出る", reading: "でる", meaning: "to go out, leave, attend , appear, answer", type: "ichidan", neg: "出ない", negR: "でない", polite: "でません / でないです", how: "で〼 + ない" },
  { dict: "助かる", reading: "たすかる", meaning: "to be helped, be saved, be rescued", type: "godan", neg: "助からない", negR: "たすからない", polite: "たすかりません / たすからないです", how: "たすかり〼 + ない" },
  { dict: "歩く", reading: "あるく", meaning: "to walk", type: "godan", neg: "歩かない", negR: "あるかない", polite: "あるきません / あるかないです", how: "あるき〼 + ない" },
  { dict: "乗る", reading: "のる", meaning: "to ride, get onboard", type: "godan", neg: "乗らない", negR: "のらない", polite: "のりません / のらないです", how: "のり〼 + ない" },
  { dict: "呼ぶ", reading: "よぶ", meaning: "to call, invite", type: "godan", neg: "呼ばない", negR: "よばない", polite: "よびません / よばないです", how: "よび〼 + ない" },
  { dict: "伺う", reading: "うかがう", meaning: "to visit", type: "godan", neg: "伺わない", negR: "うかがわない", polite: "うかがいません / うかがわないです", how: "うかがい〼 + ない" },
  { dict: "喜ぶ", reading: "よろこぶ", meaning: "to be delighted, be pleased", type: "godan", neg: "喜ばない", negR: "よろこばない", polite: "よろこびません / よろこばないです", how: "よろこび〼 + ない" },
  { dict: "教える", reading: "おしえる", meaning: "to tell, teach", type: "ichidan", neg: "教えない", negR: "おしえない", polite: "おしえません / おしえないです", how: "おしえ〼 + ない" },
  { dict: "見せる", reading: "みせる", meaning: "to show", type: "ichidan", neg: "見せない", negR: "みせない", polite: "みせません / みせないです", how: "みせ〼 + ない" },
  { dict: "参る", reading: "まいる", meaning: "to go, come", type: "godan", neg: "参らない", negR: "まいらない", polite: "まいりません / まいらないです", how: "まいり〼 + ない" },
  { dict: "なる", reading: "なる", meaning: "to become", type: "godan", neg: "ならない", negR: "ならない", polite: "なりません / ならないです", how: "なり〼 + ない" },
  { dict: "見える", reading: "みえる", meaning: "to appear, be visible", type: "ichidan", neg: "見えない", negR: "みえない", polite: "みえません / みえないです", how: "みえ〼 + ない" },
  { dict: "立つ", reading: "たつ", meaning: "to stand; to stand, be built", type: "godan", neg: "立たない", negR: "たたない", polite: "たちません / たたないです", how: "たち〼 + ない" },
  { dict: "座る", reading: "すわる", meaning: "to sit", type: "godan", neg: "座らない", negR: "すわらない", polite: "すわりません / すわらないです", how: "すわり〼 + ない" },
  { dict: "寄る", reading: "よる", meaning: "to get close to, drop by, lean on", type: "godan", neg: "寄らない", negR: "よらない", polite: "よりません / よらないです", how: "より〼 + ない" },
  { dict: "空く", reading: "あく", meaning: "to become free, become empty", type: "godan", neg: "空かない", negR: "あかない", polite: "あきません / あかないです", how: "あき〼 + ない" },
  { dict: "休む", reading: "やすむ", meaning: "to take a break, rest, go on vacation/holiday", type: "godan", neg: "休まない", negR: "やすまない", polite: "やすみません / やすまないです", how: "やすみ〼 + ない" },
  { dict: "頼む", reading: "たのむ", meaning: "to order , request", type: "godan", neg: "頼まない", negR: "たのまない", polite: "たのみません / たのまないです", how: "たのみ〼 + ない" },
  { dict: "迷う", reading: "まよう", meaning: "to become confused, get lost, hesitate", type: "godan", neg: "迷わない", negR: "まよわない", polite: "まよいません / まよわないです", how: "まよい〼 + ない" },
  { dict: "困る", reading: "こまる", meaning: "to be troubled, be bothered, be embarrassed", type: "godan", neg: "困らない", negR: "こまらない", polite: "こまりません / こまらないです", how: "こまり〼 + ない" },
  { dict: "知る", reading: "しる", meaning: "to find out, come to know", type: "godan", neg: "知らない", negR: "しらない", polite: "しりません / しらないです", how: "しり〼 + ない" },
  { dict: "勧める", reading: "すすめる", meaning: "to recommend to , advise, encourage", type: "ichidan", neg: "勧めない", negR: "すすめない", polite: "すすめません / すすめないです", how: "すすめ〼 + ない" },
];

export const CONJ_FILTERS = [["all", "All"], ["ichidan", "① る"], ["godan", "⑤ う"], ["irregular", "Irreg"], ["iadj", "い-adj"], ["na", "Noun/な"]];
