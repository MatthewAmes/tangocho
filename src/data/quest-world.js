/* ── Kotoba Quest: the world ──
   An original monster adventure across the Volume 2 acts, played as a mystery in Japanese;
   the story is in src/data/quest-story.js. Everything here is our own — creature names are Japanese words
   glued together (寒い + 猫 = Samuneko), so even the roster teaches something.

   One region per textbook act, in book order. Maps are 16×11, one character per tile:

     #  tree        ~  water      H  building   (all block)
     .  ground      =  path       ,  tall grass (wild creatures)
     S  shrine — bump it to rest your team; you wake here after a lost battle
     G  the act's guardian, who holds the road east
     n  a sign          @  where the adventure starts
     >  the way east (opens once the guardian is beaten)   <  back west

   tools/test-quest.mjs walks every map to check each one can actually be played. Each
   region's `theme` and guardian's `look` name its art in tools/world-art.mjs.

   A creature's `kind` and `moves` decide its battles (tools/quest.mjs): 熱い beats cold,
   冷たい beats bright, 明るい beats hot. One with no moves listed just slams. */

export const SPECIES = {
  kotodama:    { name: "Kotodama",    ja: "コトダマ",       emoji: "🔮", badge: "✨", from: "言霊 — the spirit in words", kind: "plain", moves: [
    { j: "{言葉|ことば}の {光|ひかり}", e: "Light of Words", kind: "bright", power: 1 },
    { j: "{大きい|おおきい} {声|こえ}", e: "Big Voice", kind: "plain", power: 1.4, uses: 4 },
  ] },
  // Act 7 — weather, campus, feelings
  samuneko:    { name: "Samuneko",    ja: "サムネコ",       emoji: "🐱", badge: "❄️", from: "寒い + 猫 (cold + cat)", kind: "cold", moves: [
    { j: "{冷たい|つめたい} {風|かぜ}", e: "Cold Wind", kind: "cold", power: 1 },
    { j: "{雪|ゆき}", e: "Snow", kind: "cold", power: 1.4, uses: 3 },
  ] },
  atsuinu:     { name: "Atsuinu",     ja: "アツイヌ",       emoji: "🐶", badge: "🔥", from: "暑い + 犬 (hot + dog)", kind: "hot", moves: [
    { j: "{熱い|あつい} {息|いき}", e: "Hot Breath", kind: "hot", power: 1 },
    { j: "{牙|きば}", e: "Fang", kind: "plain", power: 1.3, uses: 4 },
  ] },
  haredori:    { name: "Haredori",    ja: "ハレドリ",       emoji: "🐦", badge: "☀️", from: "晴れ + 鳥 (sunny + bird)", kind: "bright", moves: [
    { j: "{明るい|あかるい} {歌|うた}", e: "Bright Song", kind: "bright", power: 1 },
    { j: "{羽|はね}", e: "Feather", kind: "plain", power: 1.3, uses: 4 },
  ] },
  reibouzu:    { name: "Reibouzu",    ja: "レイボウズ",     emoji: "👻", badge: "❄️", from: "冷房 + 坊主 (air conditioner + monk)", kind: "cold", boss: true, moves: [
    { j: "{冷たい|つめたい} {風|かぜ}", e: "Cold Wind", kind: "cold", power: 1 },
    { j: "{氷|こおり}", e: "Ice", kind: "cold", power: 1.2 },
  ] },
  // Act 8 — routines, time, events
  mezamashi:   { name: "Mezamashi",   ja: "メザマシ",       emoji: "🐓", badge: "⏰", from: "目覚まし (alarm clock)", kind: "bright", moves: [
    { j: "{大きい|おおきい} {音|おと}", e: "Big Sound", kind: "bright", power: 1 },
    { j: "{羽|はね}", e: "Feather", kind: "plain", power: 1.2 },
  ] },
  nebokuro:    { name: "Nebokuro",    ja: "ネボクロウ",     emoji: "🦉", badge: "💤", from: "寝坊 + ふくろう (oversleep + owl)", kind: "cold", moves: [
    { j: "{眠い|ねむい} {声|こえ}", e: "Sleepy Voice", kind: "cold", power: 1 },
    { j: "{羽|はね}", e: "Feather", kind: "plain", power: 1.3, uses: 4 },
  ] },
  keekin:      { name: "Keekin",      ja: "ケーキン",       emoji: "🐹", badge: "🎂", from: "ケーキ + 金 (cake + gold)", kind: "hot", moves: [
    { j: "{熱い|あつい} クリーム", e: "Hot Cream", kind: "hot", power: 1 },
    { j: "{甘い|あまい} ケーキ", e: "Sweet Cake", kind: "plain", power: 1.3, uses: 4 },
  ] },
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
    act: 7, name: "Campus Meadows", theme: "campus", ja: "キャンパス草原",
    sign: "Campus Meadows. Cold winds, hot days — and a new school to get used to.",
    wild: ["samuneko", "atsuinu", "haredori"],
    guardian: { name: "Groundskeeper Hana", look: "hana", team: [["haredori", 2], ["atsuinu", 3]] },
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
    act: 8, name: "Bell Tower Town", theme: "town", ja: "時計台の町",
    sign: "Bell Tower Town. Everyone here is up every morning at seven. Every. Morning.",
    wild: ["mezamashi", "nebokuro", "keekin"],
    guardian: { name: "Clockmaker Ren", look: "ren", team: [["nebokuro", 2], ["mezamashi", 3]] },
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
    act: 9, name: "Tidy River", theme: "river", ja: "きれい川",
    sign: "Tidy River. Sort your trash, wash your clothes, mind the bridges.",
    wild: ["sentakuma", "gomitanu", "houkitsune"],
    guardian: { name: "Laundress Mio", look: "mio", team: [["gomitanu", 2], ["sentakuma", 3]] },
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
    act: 10, name: "Festival Stadium", theme: "stadium", ja: "お祭りスタジアム",
    sign: "Festival Stadium. Baseball by day, kabuki by night, tempura always.",
    wild: ["tempuragon", "yakyusagi", "kabukiji"],
    guardian: { name: "Umpire Sora", look: "sora", team: [["yakyusagi", 2], ["kabukiji", 2], ["tempuragon", 3]] },
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
    act: 11, name: "Office Heights", theme: "office", ja: "オフィス高台",
    sign: "Office Heights. Dress properly — the interviewers notice everything.",
    wild: ["suutsuru", "kaishachi", "yubiwani"],
    guardian: { name: "Director Kaede", look: "kaede", team: [["suutsuru", 2], ["yubiwani", 3], ["kaishachi", 3]] },
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
    act: 12, name: "Cozy Forest", theme: "forest", ja: "ほっこりの森",
    sign: "Cozy Forest. Bring a gift. Pets welcome. Natto optional.",
    wild: ["nattounagi", "purezentori", "isukappa"],
    guardian: { name: "Grandma Yuki", look: "yuki", team: [["purezentori", 3], ["isukappa", 3], ["nattounagi", 4]] },
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
