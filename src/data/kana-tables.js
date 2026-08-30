/* Kana chart rows, grouped as they are taught. */

export const KANA_BASE_ROWS = [
  [["あ","ア","a"],["い","イ","i"],["う","ウ","u"],["え","エ","e"],["お","オ","o"]],
  [["か","カ","ka"],["き","キ","ki"],["く","ク","ku"],["け","ケ","ke"],["こ","コ","ko"]],
  [["さ","サ","sa"],["し","シ","shi"],["す","ス","su"],["せ","セ","se"],["そ","ソ","so"]],
  [["た","タ","ta"],["ち","チ","chi"],["つ","ツ","tsu"],["て","テ","te"],["と","ト","to"]],
  [["な","ナ","na"],["に","ニ","ni"],["ぬ","ヌ","nu"],["ね","ネ","ne"],["の","ノ","no"]],
  [["は","ハ","ha"],["ひ","ヒ","hi"],["ふ","フ","fu"],["へ","ヘ","he"],["ほ","ホ","ho"]],
  [["ま","マ","ma"],["み","ミ","mi"],["む","ム","mu"],["め","メ","me"],["も","モ","mo"]],
  [["や","ヤ","ya"],["ゆ","ユ","yu"],["よ","ヨ","yo"]],
  [["ら","ラ","ra"],["り","リ","ri"],["る","ル","ru"],["れ","レ","re"],["ろ","ロ","ro"]],
  [["わ","ワ","wa"],["を","ヲ","wo"],["ん","ン","n"]],
];

export const KANA_DAKU_ROWS = [
  [["が","ガ","ga"],["ぎ","ギ","gi"],["ぐ","グ","gu"],["げ","ゲ","ge"],["ご","ゴ","go"]],
  [["ざ","ザ","za"],["じ","ジ","ji"],["ず","ズ","zu"],["ぜ","ゼ","ze"],["ぞ","ゾ","zo"]],
  [["だ","ダ","da"],["ぢ","ヂ","ji","(だ row)"],["づ","ヅ","zu","(だ row)"],["で","デ","de"],["ど","ド","do"]],
  [["ば","バ","ba"],["び","ビ","bi"],["ぶ","ブ","bu"],["べ","ベ","be"],["ぼ","ボ","bo"]],
  [["ぱ","パ","pa"],["ぴ","ピ","pi"],["ぷ","プ","pu"],["ぺ","ペ","pe"],["ぽ","ポ","po"]],
];

// 拗音 yōon — the "modified"/contracted kana: a full-size consonant kana + a SMALL ゃゅょ.
// These are what trip people up (byu / pyo / hya …) and they never appear in the base 46
// or dakuten charts, so they need their own drillable set.
export const KANA_YOON_ROWS = [
  [["きゃ","キャ","kya"],["きゅ","キュ","kyu"],["きょ","キョ","kyo"]],
  [["しゃ","シャ","sha"],["しゅ","シュ","shu"],["しょ","ショ","sho"]],
  [["ちゃ","チャ","cha"],["ちゅ","チュ","chu"],["ちょ","チョ","cho"]],
  [["にゃ","ニャ","nya"],["にゅ","ニュ","nyu"],["にょ","ニョ","nyo"]],
  [["ひゃ","ヒャ","hya"],["ひゅ","ヒュ","hyu"],["ひょ","ヒョ","hyo"]],
  [["みゃ","ミャ","mya"],["みゅ","ミュ","myu"],["みょ","ミョ","myo"]],
  [["りゃ","リャ","rya"],["りゅ","リュ","ryu"],["りょ","リョ","ryo"]],
  [["ぎゃ","ギャ","gya"],["ぎゅ","ギュ","gyu"],["ぎょ","ギョ","gyo"]],
  [["じゃ","ジャ","ja"],["じゅ","ジュ","ju"],["じょ","ジョ","jo"]],
  [["びゃ","ビャ","bya"],["びゅ","ビュ","byu"],["びょ","ビョ","byo"]],
  [["ぴゃ","ピャ","pya"],["ぴゅ","ピュ","pyu"],["ぴょ","ピョ","pyo"]],
];

// The modifier marks themselves. Not syllables — but you can't read or write real words
// without them (きって, コーヒー, きょう), and they appear in no standard kana chart.
// Row entries are [hiragana, katakana, romaji, note, kataOnly].
export const KANA_MARK_ROWS = [
  [["っ","ッ","small tsu","— doubles the next consonant: きって kitte"],
   ["ー","ー","long mark","— lengthens the vowel: コーヒー kōhī", 1],
   ["ゃ","ャ","small ya","— builds combos: きゃ kya"],
   ["ゅ","ュ","small yu","— builds combos: きゅ kyu"],
   ["ょ","ョ","small yo","— builds combos: きょ kyo"]],
  [["ぁ","ァ","small a","— builds ファ fa"],
   ["ぃ","ィ","small i","— builds ティ ti"],
   ["ぅ","ゥ","small u","— builds トゥ tu"],
   ["ぇ","ェ","small e","— builds フェ fe"],
   ["ぉ","ォ","small o","— builds フォ fo"]],
];

// Katakana-only extended sounds for loanwords. These are all over this app's own vocab
// (カフェ, オフィス, フォント, マーケティング, ジェ…) and exist in no gojūon/dakuten chart.
// hiragana slot just mirrors the katakana — it's only the stable stats id; kataOnly=1
// keeps these out of hiragana mode entirely, since they have no hiragana spelling.
export const KANA_EXT_ROWS = [
  [["ファ","ファ","fa",null,1],["フィ","フィ","fi",null,1],["フェ","フェ","fe",null,1],["フォ","フォ","fo",null,1],["フュ","フュ","fyu",null,1]],
  [["ヴァ","ヴァ","va",null,1],["ヴィ","ヴィ","vi",null,1],["ヴ","ヴ","vu",null,1],["ヴェ","ヴェ","ve",null,1],["ヴォ","ヴォ","vo",null,1]],
  [["ティ","ティ","ti",null,1],["トゥ","トゥ","tu",null,1],["ディ","ディ","di",null,1],["ドゥ","ドゥ","du",null,1]],
  [["シェ","シェ","she",null,1],["ジェ","ジェ","je",null,1],["チェ","チェ","che",null,1]],
  [["ツァ","ツァ","tsa",null,1],["ツィ","ツィ","tsi",null,1],["ツェ","ツェ","tse",null,1],["ツォ","ツォ","tso",null,1]],
  [["ウィ","ウィ","wi",null,1],["ウェ","ウェ","we",null,1],["ウォ","ウォ","wo",null,1]],
  [["クァ","クァ","kwa",null,1],["クィ","クィ","kwi",null,1],["クェ","クェ","kwe",null,1],["クォ","クォ","kwo",null,1],["グァ","グァ","gwa",null,1]],
];

// Independently toggleable so you can drill everything at once or isolate one weak set.
// labels stay short on purpose — six of these plus script/mode chips have to fit a phone
export const KANA_GROUPS = [
  ["base", "46",       KANA_BASE_ROWS],
  ["daku", "dakuten",  KANA_DAKU_ROWS],
  ["yoon", "combos",   KANA_YOON_ROWS],
  ["mark", "marks",    KANA_MARK_ROWS],
  ["ext",  "extended", KANA_EXT_ROWS],
];

export const KANA_LENGTHS = [10, 20, 40, "all"];
