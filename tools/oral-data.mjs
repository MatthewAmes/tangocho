// Content for the mock oral final. Kept in its own file because it is exam material that
// wants proof-reading as Japanese, not as code.
//
// Everything the interviewer can vary — date, time, room, copy count, price, budget,
// headcount, who orders what — is generated per run. The study guide says the flier,
// receipt and budget "may be changed" on the day, so drilling one fixed set would train
// recall of specific answers rather than the ability to read a prop and answer from it.

/* ── Japanese number and date readings ──
   Written out rather than computed from digits because the irregulars are exactly where
   an oral exam catches people: ついたち, ふつか, はつか, よじ, ななじ, じゅうよっか. */
export const DAY_READING = {
  1: "ついたち", 2: "ふつか", 3: "みっか", 4: "よっか", 5: "いつか", 6: "むいか",
  7: "なのか", 8: "ようか", 9: "ここのか", 10: "とおか", 11: "じゅういちにち",
  12: "じゅうににち", 13: "じゅうさんにち", 14: "じゅうよっか", 15: "じゅうごにち",
  16: "じゅうろくにち", 17: "じゅうしちにち", 18: "じゅうはちにち", 19: "じゅうくにち",
  20: "はつか", 21: "にじゅういちにち", 22: "にじゅうににち", 23: "にじゅうさんにち",
  24: "にじゅうよっか", 25: "にじゅうごにち", 26: "にじゅうろくにち",
  27: "にじゅうしちにち", 28: "にじゅうはちにち", 29: "にじゅうくにち", 30: "さんじゅうにち",
};
export const MONTH_READING = {
  1: "いちがつ", 2: "にがつ", 3: "さんがつ", 4: "しがつ", 5: "ごがつ", 6: "ろくがつ",
  7: "しちがつ", 8: "はちがつ", 9: "くがつ", 10: "じゅうがつ", 11: "じゅういちがつ", 12: "じゅうにがつ",
};
export const HOUR_READING = {
  1: "いちじ", 2: "にじ", 3: "さんじ", 4: "よじ", 5: "ごじ", 6: "ろくじ",
  7: "しちじ", 8: "はちじ", 9: "くじ", 10: "じゅうじ", 11: "じゅういちじ", 12: "じゅうにじ",
};
export const WEEKDAYS = [
  ["日", "にちようび"], ["月", "げつようび"], ["火", "かようび"], ["水", "すいようび"],
  ["木", "もくようび"], ["金", "きんようび"], ["土", "どようび"],
];

// plain numbers 1-100, enough for counters, prices and headcounts
const ONES = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
const TENS = ["", "じゅう", "にじゅう", "さんじゅう", "よんじゅう", "ごじゅう",
              "ろくじゅう", "ななじゅう", "はちじゅう", "きゅうじゅう"];
export function numReading(n) {
  n = Math.round(n);
  if (n === 0) return "ゼロ";
  if (n >= 1000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    return (th === 1 ? "せん" : ONES[th] + "せん") + (rest ? numReading(rest) : "");
  }
  if (n >= 100) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const hs = h === 1 ? "ひゃく" : h === 3 ? "さんびゃく" : h === 6 ? "ろっぴゃく" : h === 8 ? "はっぴゃく" : ONES[h] + "ひゃく";
    return hs + (rest ? numReading(rest) : "");
  }
  return TENS[Math.floor(n / 10)] + ONES[n % 10];
}
// 〜枚 for flat things: 1枚 いちまい, 3枚 さんまい … no sound changes in this range
export const sheetsReading = (n) => numReading(n) + "まい";
// 〜人 has two irregulars that always come up
export function peopleReading(n) {
  if (n === 1) return "ひとり";
  if (n === 2) return "ふたり";
  if (n === 4) return "よにん";
  return numReading(n) + "にん";
}
/* 〜分 is full of sound changes and is exactly the sort of thing an examiner notices:
   いっぷん・さんぷん・よんぷん・ろっぷん・はっぷん・じゅっぷん. Past an hour, say 時間. */
const MIN_SPECIAL = { 1: "いっぷん", 3: "さんぷん", 4: "よんぷん", 6: "ろっぷん", 8: "はっぷん", 10: "じゅっぷん" };
export function minutesReading(n) {
  if (n === 60) return "いちじかん";
  if (n === 90) return "いちじかんはん";
  if (n === 120) return "にじかん";
  if (MIN_SPECIAL[n]) return MIN_SPECIAL[n];
  const tens = Math.floor(n / 10), ones = n % 10;
  // multiples of ten drop the final う before っぷん: さんじゅう -> さんじゅっぷん
  if (!ones) return numReading(tens * 10).replace(/う$/, "") + "っぷん";
  return numReading(tens * 10) + (MIN_SPECIAL[ones] || numReading(ones) + "ふん");
}

// Prices on the receipt carry cents, so the spoken answer should too.
export function dollarsReading(n) {
  const v = Number(n);
  const d = Math.floor(v), c = Math.round((v - d) * 100);
  return numReading(d) + "ドル" + (c ? numReading(c) + "セント" : "");
}

/* ── the randomised props ── */
const PIZZA_PLACES = ["リトルシーザーズ", "ドミノピザ", "コストコ", "パパジョンズ"];
const ROOMS = [
  { en: "JFSB FLAC (basement)", ja: "JFSBのちかのFLAC", read: "ジェイエフエスビーのちかのフラック" },
  { en: "JFSB B037", ja: "JFSBのB037", read: "ジェイエフエスビーのビーゼロさんななごうしつ" },
  { en: "Wilkinson Center 3220", ja: "ウィルキンソンセンターの3220", read: "ウィルキンソンセンターのさんにーにーまる" },
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

export function makeProps() {
  const month = between(3, 4);
  const day = between(1, 28);
  const dow = between(0, 6);
  const startHour = pick([5, 6, 7]);
  const startHalf = Math.random() < 0.5;
  const hours = pick([2, 3]);
  const endHour = startHour + hours;
  const room = pick(ROOMS);

  const copies = pick([80, 100, 120, 150, 200]);
  const price = (copies * pick([0.28, 0.32, 0.35])).toFixed(2);

  const budget = pick([150, 200, 250]);
  const people = pick([60, 80, 100, 120]);
  const youOrderPizza = Math.random() < 0.5;

  // a sensible number of pizzas: roughly one large per six or seven people
  const pizzas = Math.max(4, Math.round(people / pick([6, 7, 8])));

  return {
    flyer: {
      month, day, dow, startHour, startHalf, endHour, room,
      dateEn: `${month}/${day} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]})`,
      timeEn: `${startHour}:${startHalf ? "30" : "00"} pm – ${endHour}:${startHalf ? "30" : "00"} pm`,
      dateJa: `${MONTH_READING[month]}${DAY_READING[day]}の${WEEKDAYS[dow][1]}`,
      timeJa: `${HOUR_READING[startHour]}${startHalf ? "はん" : ""}から${HOUR_READING[endHour > 12 ? endHour - 12 : endHour]}${startHalf ? "はん" : ""}まで`,
      hours,
    },
    receipt: { copies, price, copiesJa: sheetsReading(copies), priceJa: dollarsReading(price) },
    budget: {
      total: budget, people, pizzas, place: pick(PIZZA_PLACES), youOrderPizza,
      totalJa: dollarsReading(budget), peopleJa: peopleReading(people), pizzasJa: numReading(pizzas) + "まい",
    },
    // how long the flier took, and when — these are the learner's own invention on the day,
    // so a plausible default is offered rather than a "correct" answer
    made: { day: pick(["きのう", "せんしゅうのどようび", "せんしゅうのきんようび"]), mins: pick([30, 45, 60, 90]) },
  };
}

/* ── the interview itself ──
   q  what the examiner says, in Japanese
   r  its reading, for the voice
   en what it means, revealed only after you have tried
   a  a model answer built from the props actually on screen
   g  the grammar point being tested, so a miss is diagnosable

   Situation 1 includes a deliberate misunderstanding to correct, because the guide asks
   for that specifically and it is the one turn people freeze on: the examiner states
   something false and waits. */
export const SITUATIONS = [
  {
    id: "s1",
    title: "Situation 1 — a member asks about the party",
    mins: "1–2 min",
    prop: "flyer",
    intro: "You are on the J-kaiwa committee. Another member asks about the end-of-semester party. Answer from the flier.",
    questions: [
      { q: "パーティーはいつですか。", r: "パーティーはいつですか。", en: "When is the party?",
        a: (p) => `${p.flyer.dateJa}です。`, g: "date + weekday" },
      { q: "何時から何時までですか。", r: "なんじからなんじまでですか。", en: "From what time to what time?",
        a: (p) => `${p.flyer.timeJa}です。`, g: "〜から〜まで" },
      { q: "どこでしますか。", r: "どこでしますか。", en: "Where is it being held?",
        a: (p) => `${p.flyer.room.read}でします。`, g: "location で" },
      { q: "何を食べますか。", r: "なにをたべますか。", en: "What will you eat?",
        a: () => "ピザを食べます。飲み物もあります。", g: "を + verb" },
      { q: "パーティーは土曜日ですね。", r: "パーティーはどようびですね。", en: "The party is on Saturday, right? — CORRECT THE MISTAKE",
        a: (p) => `いいえ、${WEEKDAYS[p.flyer.dow][1]}です。`, g: "correcting a misunderstanding (ACT 4 BTS 21)" },
      { q: "パーティーは何時間ぐらいですか。", r: "パーティーはなんじかんぐらいですか。", en: "About how many hours is the party?",
        a: (p) => `${numReading(p.flyer.hours)}じかんぐらいです。`, g: "〜時間 duration" },
    ],
  },
  {
    id: "s2",
    title: "Situation 2 — your TA asks about the flier and budget",
    mins: "1–2 min",
    prop: "receipt",
    intro: "You made the flier. Your TA asks about it, and you need to settle the pizza plan. Use the receipt and the budget.",
    questions: [
      { q: "ちらしはいつ作りましたか。", r: "ちらしはいつつくりましたか。", en: "When did you make the flier?",
        a: (p) => `${p.made.day}に作りました。`, g: "past tense 〜ました" },
      { q: "どのくらいかかりましたか。", r: "どのくらいかかりましたか。", en: "How long did it take?",
        a: (p) => `${minutesReading(p.made.mins)}ぐらいかかりました。`, g: "duration + かかりました" },
      { q: "何枚コピーしましたか。", r: "なんまいコピーしましたか。", en: "How many copies did you make?",
        a: (p) => `${p.receipt.copiesJa}コピーしました。`, g: "〜枚 counter" },
      { q: "いくらでしたか。", r: "いくらでしたか。", en: "How much was it?",
        a: (p) => `${p.receipt.priceJa}ぐらいでした。`, g: "price, past copula" },
      { q: "ピザはどこで買いますか。", r: "ピザはどこでかいますか。", en: "Where will you buy the pizza? — ASK PERMISSION",
        a: (p) => `${p.budget.place}で買ってもいいですか。`, g: "〜てもいいですか (ACT 5)" },
      { q: "ピザは何枚買いましょうか。", r: "ピザはなんまいかいましょうか。", en: "How many pizzas should we buy? — PROPOSE A NUMBER",
        a: (p) => `${p.budget.peopleJa}ですから、${p.budget.pizzasJa}ぐらい買いましょう。`, g: "〜ましょう, ですから" },
      { q: "だれが何をしますか。", r: "だれがなにをしますか。", en: "Who does what? — MAKE A REQUEST with を",
        a: (p) => p.budget.youOrderPizza
          ? "私がピザを注文します。飲み物を買ってください。"
          : "私が飲み物を買います。ピザを注文してください。",
        g: "〜てください + を (ACT 5)" },
    ],
  },
  {
    id: "s3",
    title: "Situation 3 — meeting a new Japanese student",
    mins: "3–4 min",
    prop: "none",
    intro: "Someone new has come to J-kaiwa. Ask to sit down, introduce yourself, and keep the conversation going. The longest section — most of your marks are here.",
    questions: [
      { q: "（席のとなりに立っています）", r: "せきのとなりにたっています。", en: "You are standing beside their seat — ASK PERMISSION TO SIT",
        a: () => "すみません、ここに座ってもいいですか。", g: "座って + もいいですか (5-2)" },
      { q: "はじめまして。お名前は？", r: "はじめまして。おなまえは。", en: "Nice to meet you. Your name?",
        a: () => "はじめまして。マットです。どうぞよろしくお願いします。", g: "self-introduction" },
      { q: "日本のどこから来ましたか。", r: "にほんのどこからきましたか。", en: "Where in Japan are you from? — YOU ASK THIS",
        a: () => "日本のどこから来ましたか。", g: "〜から来ました" },
      { q: "いつユタに来ましたか。", r: "いつユタにきましたか。", en: "When did you come to Utah? — YOU ASK THIS",
        a: () => "いつユタに来ましたか。", g: "past tense question" },
      { q: "今日は何をしましたか。", r: "きょうはなにをしましたか。", en: "What did you do today? — USE 〜て FOR SEQUENCE",
        a: () => "朝ご飯を食べて、クラスに行って、勉強しました。", g: "〜て sequence (ACT 5 BTS 4) + past" },
      { q: "専攻は何ですか。", r: "せんこうはなんですか。", en: "What is your major?",
        a: () => "専攻はビジネスです。", g: "専攻 (4-2)" },
      { q: "今学期どんなクラスを取りましたか。", r: "こんがっきどんなクラスをとりましたか。", en: "What kind of classes did you take this semester?",
        a: () => "日本語とビジネスと数学のクラスを取りました。", g: "どんな + 取りました (4-2)" },
      { q: "クラスは難しかったですか。", r: "クラスはむずかしかったですか。", en: "Were your classes difficult?",
        a: () => "はい、日本語のクラスはちょっと難しかったです。でも、おもしろかったです。", g: "い-adjective past (難しかった)" },
      { q: "どのクラスがいちばんおもしろかったですか。", r: "どのクラスがいちばんおもしろかったですか。", en: "Which class was the most interesting?",
        a: () => "日本語のクラスがいちばんおもしろかったです。", g: "いちばん + past adjective" },
    ],
  },
];

/* ── Culture Talk ──
   A prepared presentation, so rehearsal works differently from the interview: the goal is
   to stop needing the script. Three stages — read it, romaji only, cue card only — and the
   line is spoken each time so the pitch accent is heard rather than guessed.

   Line 1 was missing from the notes; the greeting below uses only phrases already in the
   deck (こんにちは, よろしくおねがいします) so nothing new has to be learned to open.

   pitch: the words flagged in the midterm feedback — Japanese starts low and rises on the
   second mora, and the English habit is to stress the first syllable instead. */
export const TALK = {
  title: "Culture Talk — Pokémon and Japanese culture",
  cards: [
    { name: "コイキング", words: ["とうりゅうもん", "たき", "がんばって"] },
    { name: "キュウコン", words: ["きつね", "まほう", "きゅうほん"] },
    { name: "だるま", words: ["おまもり", "あかくてまるい", "おぼうさん"] },
  ],
  pitch: [
    { w: "きつね", say: "ki-TSU-NE", bad: "KI-tsu-ne" },
    { w: "たのしい", say: "ta-NO-SHI-i", bad: "TA-no-shi-i" },
  ],
  lines: [
    { n: 1, tag: "Greeting", ja: "みなさん、こんにちは。マシューです。よろしくおねがいします。",
      rom: "minasan, konnichiwa. Mashū desu. yoroshiku onegai shimasu.",
      en: "Hello everyone. I'm Matthew. Pleased to meet you.", note: "supplied — line 1 was missing" },
    { n: 2, tag: "Intro", ja: "きょうはポケモンとにほんのぶんかについてはなします。",
      rom: "kyō wa Pokemon to Nihon no bunka ni tsuite hanashimasu.",
      en: "Today I will talk about Pokémon and Japanese culture." },
    { n: 3, tag: "Why", ja: "ポケモンがだいすきです。ポケモンのなかに、にほんのぶんかがたくさんあります。",
      rom: "Pokemon ga daisuki desu. Pokemon no naka ni, Nihon no bunka ga takusan arimasu.",
      en: "I love Pokémon. There is a lot of Japanese culture inside Pokémon." },
    { n: 4, tag: "① Magikarp", sec: 1, ja: "いちばんめはコイキングとギャラドスです。",
      rom: "ichi-ban-me wa Koikingu to Gyaradosu desu.",
      en: "The first is Magikarp and Gyarados.", note: "section reset — jump here if you blank" },
    { n: 5, tag: "Weak to strong", ja: "コイキングはよわいですが、ギャラドスになります。ギャラドスはとてもつよいです。",
      rom: "Koikingu wa yowai desu ga, Gyaradosu ni narimasu. Gyaradosu wa totemo tsuyoi desu.",
      en: "Magikarp is weak, but it becomes Gyarados. Gyarados is very strong.", g: "が as \"but\"" },
    { n: 6, tag: "The legend", ja: "これは「とうりゅうもん」のはなしです。こいはたきをのぼって、りゅうになります。",
      rom: "kore wa \"tōryūmon\" no hanashi desu. koi wa taki o nobotte, ryū ni narimasu.",
      en: "This is the story of the Dragon Gate. A carp climbs the waterfall and becomes a dragon.", g: "て-form link: のぼって" },
    { n: 7, tag: "Meaning", ja: "いみは「がんばってください」です。",
      rom: "imi wa \"ganbatte kudasai\" desu.", en: "The meaning is \"do your best.\"" },
    { n: 8, tag: "② Vulpix", sec: 2, ja: "にばんめはロコンとキュウコンです。キュウコンはきつねです。",
      rom: "ni-ban-me wa Rokon to Kyūkon desu. Kyūkon wa kitsune desu.",
      en: "The second is Vulpix and Ninetales. Ninetales is a fox.", note: "section reset" },
    { n: 9, tag: "Fox lore", ja: "にほんのはなしのなかで、きつねはあたまがよくて、まほうもつかいます。",
      rom: "Nihon no hanashi no naka de, kitsune wa atama ga yokute, mahō mo tsukaimasu.",
      en: "In Japanese stories, foxes are smart and also use magic.", g: "て-form: よくて · も for \"also\"" },
    { n: 10, tag: "Nine tails", ja: "しっぽがきゅうほんあります。しっぽがおおいきつねは、とてもつよいです。",
      rom: "shippo ga kyū-hon arimasu. shippo ga ōi kitsune wa, totemo tsuyoi desu.",
      en: "It has nine tails. A fox with many tails is very strong.", g: "counter きゅうほん — ほん, not ぼん or ぽん, after きゅう" },
    { n: 11, tag: "③ Darumaka", sec: 3, ja: "さんばんめはダルマッカとヒヒダルマです。",
      rom: "san-ban-me wa Darumakka to Hihidaruma desu.",
      en: "The third is Darumaka and Darmanitan.", note: "section reset" },
    { n: 12, tag: "What it is", ja: "だるまはにほんのおまもりです。あかくてまるいです。",
      rom: "daruma wa Nihon no o-mamori desu. akakute marui desu.",
      en: "The daruma is a Japanese good-luck charm. It is red and round.", g: "て-form: あかくて" },
    { n: 13, tag: "Origin", ja: "だるまはむかしのおぼうさんです。",
      rom: "daruma wa mukashi no o-bō-san desu.", en: "The daruma is a monk from long ago." },
    { n: 14, tag: "Callback", ja: "だるまのいみも「がんばってください」です。",
      rom: "daruma no imi mo \"ganbatte kudasai\" desu.",
      en: "The daruma's meaning is ALSO \"do your best.\"",
      g: "も — the one emphasis. This ties daruma back to Magikarp and turns three facts into one thesis." },
    { n: 15, tag: "Close", ja: "ポケモンはたのしくて、にほんのぶんかのせんせいです。",
      rom: "Pokemon wa tanoshikute, Nihon no bunka no sensei desu.",
      en: "Pokémon is fun, and it is a teacher of Japanese culture.", g: "て-form: たのしくて" },
    { n: 16, tag: "End", ja: "ありがとうございました。しつもんがありますか。",
      rom: "arigatō gozaimashita. shitsumon ga arimasu ka.",
      en: "Thank you very much. Are there any questions?" },
  ],
};
