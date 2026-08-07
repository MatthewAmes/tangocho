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
/* The venue is not a variable. The rundown asks "What is FLAC? and where is it?" as its own
   turn and expects the whole phrase spoken out, so the room is always the FLAC in the JFSB
   and the long katakana name is something to rehearse rather than something to pick. */
const FLAC = {
  en: "JFSB FLAC (basement)",
  ja: "JFSBのFLAC",
  read: "ジェイエフエスビーのフラック",
  full: "フォーリン・ランゲージ・アクティビティー・センター",
  fullRead: "フォーリンランゲージアクティビティーセンター",
  where: "JFSBのちかにあります。",
  whereRead: "ジェイエフエスビーのちかにあります。",
};

// the classmate the examiner will wrongly credit with the flier, and who you hand the
// drinks job to
const CLASSMATE = ["田中", "山田", "スミス", "ジョンソン", "ブラウン"];
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
  const room = FLAC;
  /* The examiner deliberately names the wrong weekday and waits to be corrected, so the
     wrong one has to be generated too — and it has to differ from the real one, or the
     turn quietly becomes a normal confirmation with nothing to correct. */
  const wrongDow = (dow + between(1, 6)) % 7;

  const copies = pick([80, 100, 120, 150, 200]);
  const price = (copies * pick([0.28, 0.32, 0.35])).toFixed(2);

  const budget = pick([150, 200, 250]);
  const people = pick([60, 80, 100, 120]);
  /* Fixed, not random. The rundown settles it: "Who is ordering? — I am", and then you
     hand the drinks and refreshments to someone else with ください. */
  const youOrderPizza = true;
  const classmate = pick(CLASSMATE);

  // a sensible number of pizzas: roughly one large per six or seven people
  const pizzas = Math.max(4, Math.round(people / pick([6, 7, 8])));

  return {
    classmate,
    flyer: {
      month, day, dow, startHour, startHalf, endHour, room, wrongDow,
      wrongDowJa: WEEKDAYS[wrongDow][1],
      dowJa: WEEKDAYS[dow][1],
      monthDayJa: MONTH_READING[month] + DAY_READING[day],
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
    title: "Section 1 — the party details",
    mins: "1–2 min",
    prop: "flyer",
    intro: "The examiner asks about the party and gets the day of the week wrong on purpose. Correct them politely, then give the time, the place, and what FLAC actually stands for.",
    questions: [
      { q: "パーティーはいつですか。", r: "パーティーはいつですか。", en: "When is the party?",
        a: (p) => `${p.flyer.monthDayJa}です。`, g: "month + day — 月 and 日 readings" },
      { q: (p) => `${p.flyer.wrongDowJa}ですね。`, r: (p) => `${p.flyer.wrongDowJa}ですね。`,
        en: "“It's on [wrong weekday], right?” — CORRECT THEM POLITELY",
        a: (p) => `あれ、${p.flyer.dowJa}じゃなかったですか。`,
        g: "polite correction with the negative — じゃなかったですか", initiate: false, star: true },
      { q: "何時から何時までですか。", r: "なんじからなんじまでですか。", en: "From what time to what time?",
        a: (p) => `${p.flyer.timeJa}です。`, g: "〜から〜まで" },
      { q: "どこでしますか。", r: "どこでしますか。", en: "Where is it?",
        a: (p) => `${p.flyer.room.read}でします。`, g: "location + で" },
      { q: "FLACは何ですか。", r: "フラックはなんですか。", en: "What is FLAC? — SAY THE WHOLE PHRASE",
        a: (p) => `${p.flyer.room.full}です。`, g: "the full katakana name, said cleanly", star: true },
      { q: "FLACはどこにありますか。", r: "フラックはどこにありますか。", en: "Where is FLAC?",
        a: (p) => p.flyer.room.whereRead, g: "〜にあります + location" },
    ],
  },
  {
    id: "s2",
    title: "Section 2 — the flier, then the food",
    mins: "2–3 min",
    prop: "receipt",
    intro: "They credit someone else with the flier — put them right with が. Then you have to START two turns yourself: proposing the pizza, and asking someone to buy the drinks.",
    questions: [
      { q: (p) => `${p.classmate}さんがちらしを作りましたね。`, r: (p) => `${p.classmate}さんがちらしをつくりましたね。`,
        en: "“[Name] made the flier, right?” — NO, YOU DID",
        a: () => "いいえ、私が作りました。", g: "が marks who did it — the point of the turn", star: true },
      { q: "いつ作りましたか。", r: "いつつくりましたか。", en: "When did you make it?",
        a: (p) => `${p.made.day}に作りました。`, g: "past 〜ました + time word" },
      { q: "どのくらいかかりましたか。大変でしたか。", r: "どのくらいかかりましたか。たいへんでしたか。",
        en: "How long did it take? Was it tough?",
        a: (p) => `${minutesReading(p.made.mins)}ぐらいかかりました。ちょっと大変でした。`,
        g: "ぐらい for approximate + 大変でした" },
      { q: "何枚コピーしましたか。", r: "なんまいコピーしましたか。", en: "How many copies did you make?",
        a: (p) => `${p.receipt.copiesJa}コピーしました。`, g: "〜枚 counter — read it off the receipt" },
      { q: "高くなかったですか。", r: "たかくなかったですか。", en: "Wasn't it expensive?",
        a: (p) => `そうですね、${p.receipt.priceJa}でしたから、ちょっと高かったです。`,
        g: "DON'T say はい here — to 高くなかったですか, はい means “right, it wasn't”. そうですね dodges it." },
      { q: null, r: null,
        en: "NOW YOU START — propose the pizza place with 〜でもいいですか",
        a: (p) => `食べ物ですが、${p.budget.place}のピザでもいいですか。`,
        g: "YOU INITIATE · noun + でもいいですか (permission)", initiate: true, star: true },
      { q: "ピザは何枚買いますか。", r: "ピザはなんまいかいますか。", en: "How many pizzas are you buying?",
        a: (p) => `${p.budget.pizzasJa}買います。`, g: "〜枚 for pizzas" },
      { q: "だれが買いますか。", r: "だれがかいますか。", en: "Who is ordering?",
        a: () => "私が買います。", g: "が again — I'm the one who does it" },
      { q: null, r: null,
        en: "NOW YOU START — ask them to buy the drinks and refreshments",
        a: (p) => `${p.classmate}さん、飲み物と食べ物を買ってください。`,
        g: "YOU INITIATE · 〜てください + を", initiate: true, star: true },
    ],
  },
  {
    id: "s3",
    title: "Section 3 — free conversation",
    mins: "2–3 min",
    prop: "none",
    intro: "No props and no script. Four topics they are likely to reach for. Answer in full sentences and add one extra detail each time — a one-word answer ends the conversation and costs you the section.",
    questions: [
      { q: "専攻は何ですか。", r: "せんこうはなんですか。", en: "What's your major?",
        a: () => "専攻はビジネスです。", g: "専攻 — swap in your real major" },
      { q: "今日は何をしましたか。", r: "きょうはなにをしましたか。", en: "What did you do today?",
        a: () => "朝ご飯を食べて、授業に行って、勉強しました。", g: "〜て to chain actions, then past" },
      { q: "明日は何をしますか。", r: "あしたはなにをしますか。", en: "What are you doing tomorrow?",
        a: () => "明日は日本語を勉強して、友達に会います。", g: "same chain, non-past" },
      { q: "どちらから来ましたか。", r: "どちらからきましたか。", en: "Where are you from?",
        a: () => "ユタのプロボから来ました。", g: "どちら (polite どこ) + 〜から来ました" },
      { q: "今学期は何の授業を取っていますか。", r: "こんがっきはなんのじゅぎょうをとっていますか。",
        en: "What classes are you taking this semester?",
        a: () => "日本語と数学の授業を取っています。", g: "何の + 授業 — 何の, not 何が / 何を" },
      { q: "授業は難しいですか。", r: "じゅぎょうはむずかしいですか。", en: "Are your classes hard?",
        a: () => "日本語の授業はちょっと難しいです。でも、おもしろいです。",
        g: "い-adjective, then でも to add the other half" },
      { q: "先学期はどうでしたか。", r: "せんがっきはどうでしたか。", en: "How was last semester?",
        a: () => "先学期の授業は易しかったです。でも、今学期はちょっと大変です。",
        g: "past adjective 易しかった — last semester vs this one" },
    ],
  },
];

/* The grammar checklist from the study guide, kept where it can be read a minute before
   walking in. These are what the marks are actually for; the situations above are just the
   excuse to use them. */
export const CHECKLIST = [
  { k: "Time words", v: "days, months, years, today, tomorrow, this/last/next week, semester" },
  { k: "Polite correction", v: "じゃなかったですか — used the moment they get the weekday wrong" },
  { k: "Particles", v: "が・は・を・に・も — が for who did it, は for the topic" },
  { k: "Classifiers", v: "〜枚 copies and pizzas, 〜時間, 〜ヶ月, 〜年" },
  { k: "ぐらい", v: "approximately — for how long it took and how much it cost" },
  { k: "て forms", v: "大きくて / 教室で / 歩いて — adjectives, nouns and verbs each differ" },
  { k: "Past vs present", v: "ます→ました, です→でした, 高い→高かった" },
  { k: "Question words", v: "どの・何・どこ／どちら・いつ — and 何の vs 何が / 何を / 何に" },
  { k: "English words", v: "JFSB, FLAC — say them as Japanese katakana, not English" },
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
