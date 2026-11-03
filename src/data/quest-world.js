/* ── Kotoba Quest: the world ──
   An original monster-battle adventure for the Volume 2 vocabulary (Matthew, 2026-11-03:
   "a pokemon type game turn based rpg built for learning japanese words", "bigger
   adventure with a map"). Everything here is our own — creature names are Japanese words
   glued together (寒い + 猫 = Samuneko), so even the roster teaches something.

   One region per textbook act, in book order. Maps are 16×11, one character per tile:

     #  tree        ~  water      H  building   (all block)
     .  ground      =  path       ,  tall grass (wild creatures)
     S  shrine — bump it to rest your team; you wake here after a lost battle
     G  the act's guardian — bump to battle; beaten, the gate behind opens
     n  a sign (📜)     @  where the adventure starts
     >  the way east (opens once the guardian is beaten)   <  back west

   tools/test-quest.mjs walks every map to check each one can actually be played. */

export const SPECIES = {
  kotodama:    { name: "Kotodama",    ja: "コトダマ",       emoji: "🔮", badge: "✨", from: "言霊 — the spirit in words", note: "Your partner. Grows stronger with every word you can say." },
  // Act 7 — weather, campus, feelings
  samuneko:    { name: "Samuneko",    ja: "サムネコ",       emoji: "🐱", badge: "❄️", from: "寒い + 猫 (cold + cat)" },
  atsuinu:     { name: "Atsuinu",     ja: "アツイヌ",       emoji: "🐶", badge: "🔥", from: "暑い + 犬 (hot + dog)" },
  haredori:    { name: "Haredori",    ja: "ハレドリ",       emoji: "🐦", badge: "☀️", from: "晴れ + 鳥 (sunny + bird)" },
  // Act 8 — routines, time, events
  mezamashi:   { name: "Mezamashi",   ja: "メザマシ",       emoji: "🐓", badge: "⏰", from: "目覚まし (alarm clock)" },
  nebokuro:    { name: "Nebokuro",    ja: "ネボクロウ",     emoji: "🦉", badge: "💤", from: "寝坊 + ふくろう (oversleep + owl)" },
  keekin:      { name: "Keekin",      ja: "ケーキン",       emoji: "🐹", badge: "🎂", from: "ケーキ + 金 (cake + gold)" },
  // Act 9 — chores, laundry, jobs
  sentakuma:   { name: "Sentakuma",   ja: "センタクマ",     emoji: "🐻", badge: "💧", from: "洗濯 + 熊 (laundry + bear)" },
  gomitanu:    { name: "Gomitanu",    ja: "ゴミタヌ",       emoji: "🦝", badge: "🗑️", from: "ゴミ + 狸 (trash + raccoon dog)" },
  houkitsune:  { name: "Houkitsune",  ja: "ホウキツネ",     emoji: "🦊", badge: "🧹", from: "ほうき + 狐 (broom + fox)" },
  // Act 10 — outings, sports, food
  tempuragon:  { name: "Tempuragon",  ja: "テンプラゴン",   emoji: "🐉", badge: "🍤", from: "天ぷら + ドラゴン" },
  yakyusagi:   { name: "Yakyusagi",   ja: "ヤキュウサギ",   emoji: "🐰", badge: "⚾", from: "野球 + うさぎ (baseball + rabbit)" },
  kabukiji:    { name: "Kabukiji",    ja: "カブキジ",       emoji: "🦚", badge: "🎭", from: "歌舞伎 + きじ (kabuki + pheasant)" },
  // Act 11 — office, clothing, interviews
  suutsuru:    { name: "Suutsuru",    ja: "スーツル",       emoji: "🕊️", badge: "👔", from: "スーツ + 鶴 (suit + crane)" },
  kaishachi:   { name: "Kaishachi",   ja: "カイシャチ",     emoji: "🐋", badge: "💼", from: "会社 + しゃち (company + orca)" },
  yubiwani:    { name: "Yubiwani",    ja: "ユビワニ",       emoji: "🐊", badge: "💍", from: "指輪 + わに (ring + crocodile)" },
  // Act 12 — gifts, pets, home
  nattounagi:  { name: "Nattounagi",  ja: "ナットウナギ",   emoji: "🐍", badge: "🥢", from: "納豆 + うなぎ (natto + eel)" },
  purezentori: { name: "Purezentori", ja: "プレゼントリ",   emoji: "🐤", badge: "🎁", from: "プレゼント + 鳥 (present + bird)" },
  isukappa:    { name: "Isukappa",    ja: "イスカッパ",     emoji: "🐢", badge: "💺", from: "椅子 + かっぱ (chair + kappa)" },
};

export const REGIONS = [
  {
    act: 7, name: "Campus Meadows", ja: "キャンパス草原",
    sign: "Campus Meadows. Cold winds, hot days — and a new school to get used to.",
    wild: ["samuneko", "atsuinu", "haredori"],
    guardian: { name: "Groundskeeper Hana", emoji: "👩", team: [["haredori", 2], ["atsuinu", 3]] },
    map: [
      "################",
      "#@..,,,,..#....#",
      "#.=====,,,#.H..#",
      "#.=,,,=,,,..=..#",
      "#.=,S,=.....=..#",
      "#n=,,,=====.=,,#",
      "#.....,,,,=.=,,#",
      "#~~~..,,,,=.=,,#",
      "#~~~~.....====G>",
      "#~~~~~,,,,,....#",
      "################",
    ],
  },
  {
    act: 8, name: "Bell Tower Town", ja: "時計台の町",
    sign: "Bell Tower Town. Everyone here is up every morning at seven. Every. Morning.",
    wild: ["mezamashi", "nebokuro", "keekin"],
    guardian: { name: "Clockmaker Ren", emoji: "👨", team: [["nebokuro", 2], ["mezamashi", 3]] },
    map: [
      "################",
      "<====..HH..,,,,#",
      "#...=..HH..,,,,#",
      "#.S.=......,,..#",
      "#...======.....#",
      "#,,,,.H..=..H..#",
      "#,,,,....=.....#",
      "#..n.....=,,,,,#",
      "#..HH....=,,,,,#",
      "#........=====G>",
      "################",
    ],
  },
  {
    act: 9, name: "Tidy River", ja: "きれい川",
    sign: "Tidy River. Sort your trash, wash your clothes, mind the bridges.",
    wild: ["sentakuma", "gomitanu", "houkitsune"],
    guardian: { name: "Laundress Mio", emoji: "👧", team: [["gomitanu", 2], ["sentakuma", 3]] },
    map: [
      "################",
      "#,,,,..#..,,,,,#",
      "<===...#..,,,,,#",
      "#..=...#.......#",
      "#..=~~~~~~~=~~~#",
      "#..=.......=...#",
      "#.S=..,,,,.=..n#",
      "#..=..,,,,.=...#",
      "#~~=~~~~~~~=~~~#",
      "#..=========..G>",
      "################",
    ],
  },
  {
    act: 10, name: "Festival Stadium", ja: "お祭りスタジアム",
    sign: "Festival Stadium. Baseball by day, kabuki by night, tempura always.",
    wild: ["tempuragon", "yakyusagi", "kabukiji"],
    guardian: { name: "Umpire Sora", emoji: "🧔", team: [["yakyusagi", 2], ["kabukiji", 2], ["tempuragon", 3]] },
    map: [
      "################",
      "#,,,,,,..HHHH..#",
      "#,,,,,,..HHHH..#",
      "#,,..=====..=..#",
      "<====..,,,,.=..#",
      "#..S...,,,,.=..#",
      "#......,,,,.=n.#",
      "#.##########=..#",
      "#..,,,,,,,,.=..#",
      "#..,,,,,,,,.==G>",
      "################",
    ],
  },
  {
    act: 11, name: "Office Heights", ja: "オフィス高台",
    sign: "Office Heights. Dress properly — the interviewers notice everything.",
    wild: ["suutsuru", "kaishachi", "yubiwani"],
    guardian: { name: "Director Kaede", emoji: "👱", team: [["suutsuru", 2], ["yubiwani", 3], ["kaishachi", 3]] },
    map: [
      "################",
      "#HH.HH.HH.HH..n#",
      "#HH.HH.HH.HH...#",
      "#..=========,,,#",
      "#..=..,,,,.=,,,#",
      "<===..,,,,.=...#",
      "#.S...,,,,.=...#",
      "#.....HH...=,,,#",
      "#,,,,.HH...=,,,#",
      "#,,,,......===G>",
      "################",
    ],
  },
  {
    act: 12, name: "Cozy Forest", ja: "ほっこりの森",
    sign: "Cozy Forest. Bring a gift. Pets welcome. Natto optional.",
    wild: ["nattounagi", "purezentori", "isukappa"],
    guardian: { name: "Grandma Yuki", emoji: "👵", team: [["purezentori", 3], ["isukappa", 3], ["nattounagi", 4]] },
    map: [
      "################",
      "#,,,,#,,,,#,,,,#",
      "#,,,,#,,,,#,,,,#",
      "#,,..=..,.=..,,#",
      "<====.....=....#",
      "#..S#,,,,.=.##.#",
      "#...#,,,,.=.##.#",
      "#.n.#.....=....#",
      "#####,,,,.=..,,#",
      "#,,,,,,,,.===.G#",
      "################",
    ],
  },
];
