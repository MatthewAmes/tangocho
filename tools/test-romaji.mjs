// node tools/test-romaji.mjs
import { toKana, normalizeKana, kanaEqual } from "./romaji.mjs";

let pass = 0, fail = 0;
const eq = (got, want, what) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`  FAIL ${what}\n       got  ${got}\n       want ${want}`);
};

/* the readings this app actually has to accept */
const CASES = [
  ["shigatsu", "しがつ"], ["youka", "ようか"], ["tsuitachi", "ついたち"], ["hatsuka", "はつか"],
  ["mokuyoubi", "もくようび"], ["nichiyoubi", "にちようび"], ["suiyoubi", "すいようび"],
  ["gogo", "ごご"], ["gozen", "ごぜん"], ["shichiji", "しちじ"], ["yoji", "よじ"], ["kuji", "くじ"],
  ["ippun", "いっぷん"], ["sanpun", "さんぷん"], ["roppun", "ろっぷん"], ["happun", "はっぷん"],
  ["juppun", "じゅっぷん"], ["yonpun", "よんぷん"], ["gofun", "ごふん"],
  ["hitotsu", "ひとつ"], ["futatsu", "ふたつ"], ["mittsu", "みっつ"], ["yottsu", "よっつ"],
  ["itsutsu", "いつつ"], ["muttsu", "むっつ"], ["yattsu", "やっつ"], ["kokonotsu", "ここのつ"],
  ["hitori", "ひとり"], ["futari", "ふたり"], ["yonin", "よにん"], ["sanbiki", "さんびき"],
  ["ippiki", "いっぴき"], ["ippai", "いっぱい"], ["sanbai", "さんばい"], ["hassatsu", "はっさつ"],
  ["rokkagetsu", "ろっかげつ"], ["isshuukan", "いっしゅうかん"], ["yonenkan", "よねんかん"],
];
for (const [r, k] of CASES) eq(toKana(r), k, `toKana("${r}")`);

/* alternative spellings all land in the same place */
eq(toKana("si"), toKana("shi"), "si == shi");
eq(toKana("tu"), toKana("tsu"), "tu == tsu");
eq(toKana("hu"), toKana("fu"), "hu == fu");
eq(toKana("zi"), toKana("ji"), "zi == ji");
eq(toKana("jyuppun"), "じゅっぷん", "jyuppun");
eq(toKana("zyuppun"), "じゅっぷん", "zyuppun");
eq(toKana("syougatsu"), "しょうがつ", "syougatsu");

/* ん handling */
eq(toKana("nihon"), "にほん", "n at the end");
eq(toKana("sanbiki"), "さんびき", "n before a consonant");
eq(toKana("nn"), "ん", "nn");
eq(toKana("hon'ya".replace("'", "")), "ほにゃ", "n + ya greedily makes にゃ");
eq(toKana("konnichiwa"), "こんにちは".replace("は", "わ"), "konnichiwa");
eq(toKana("na"), "な", "n before a vowel is not ん");

/* partial input stays visible while typing */
eq(toKana("shig"), "しg", "partial syllable is kept");
eq(toKana("s"), "s", "single consonant is kept");
eq(toKana(""), "", "empty");

/* kana typed directly (a real IME, or pasted) passes through */
eq(toKana("しがつ"), "しがつ", "kana passthrough");

/* normalisation for grading */
eq(normalizeKana("シガツ"), "しがつ", "katakana folds to hiragana");
eq(normalizeKana("しがつ ようか"), "しがつようか", "spaces dropped");
eq(kanaEqual("じゅっぷん", "ジュップン"), true, "script-insensitive compare");
eq(kanaEqual("しがつ", "しがつ"), true, "identical");
eq(kanaEqual("しがつ", "よんがつ"), false, "genuinely different readings still differ");
eq(kanaEqual("ようか", "よっか"), false, "8th and 4th are not confused");

/* Hepburn m before a labial. Not a nicety: the checkpoint asks for production with no IME,
   so what gets typed is whatever romanisation the textbook printed — and "tempura" came out
   てmぷら, a right answer marked wrong on the very first question of the very first run. */
eq(toKana("tempura"), "てんぷら", "m before p is ん");
eq(toKana("sempai"), "せんぱい", "m before p is ん");
eq(toKana("kombu"), "こんぶ", "m before b is ん");
eq(toKana("sammai"), "さんまい", "m before m is ん");
eq(toKana("tenpura"), "てんぷら", "the n spelling still works");
/* And the guard, which is the part that could quietly break every ま-row word: an m before
   a vowel is just ま行. */
eq(toKana("mama"), "まま", "mama is not んま");
eq(toKana("mimi"), "みみ");
eq(toKana("umi"), "うみ");
eq(toKana("samui"), "さむい");
eq(toKana("yomimasu"), "よみます");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
