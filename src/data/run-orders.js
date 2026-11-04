/* ── Kotoba Quest: Kotodama's orders ──
   One short shout at a time, and you have seconds to obey. `from` is how many seconds into a
   run an order can start appearing, so a run climbs from words he knows into Act 7's.
   `j` uses the furigana markup of tools/ja-markup.mjs; `en` appears only after a miss, and on
   the results screen. Tested in tools/test-run-game.mjs. */

/* Pads you run to. A pad shows a colour, a picture, or a creature; never the word. */
export const PADS = {
  color: [
    { key: "red", fill: "#e8413f" }, { key: "blue", fill: "#3f7fe0" },
    { key: "yellow", fill: "#f2d03a" }, { key: "green", fill: "#3fb85a" },
    { key: "white", fill: "#f4f4f8" }, { key: "black", fill: "#26262e" },
  ],
  temp: [
    { key: "cold", icon: "❄️", fill: "#a8def8" }, { key: "hot", icon: "🔥", fill: "#f8a058" },
    { key: "bright", icon: "☀️", fill: "#fff0a0" }, { key: "dark", icon: "🌙", fill: "#34346a" },
  ],
  animal: [
    { key: "cat", species: "samuneko" }, { key: "dog", species: "atsuinu" }, { key: "bird", species: "haredori" },
    { key: "bear", species: "sentakuma" }, { key: "fox", species: "houkitsune" }, { key: "rabbit", species: "yakyusagi" },
  ],
};

const pad = (id, group, key, j, say, en, from) => ({ id, type: "pad", group, key, j, say, en, from });

export const ORDERS = [
  pad("red", "color", "red", "{赤|あか}へ！", "あかへ", "red", 0),
  pad("blue", "color", "blue", "{青|あお}へ！", "あおへ", "blue", 0),
  pad("yellow", "color", "yellow", "{黄色|きいろ}へ！", "きいろへ", "yellow", 0),
  pad("green", "color", "green", "{緑|みどり}へ！", "みどりへ", "green", 0),
  pad("white", "color", "white", "{白|しろ}へ！", "しろへ", "white", 30),
  pad("black", "color", "black", "{黒|くろ}へ！", "くろへ", "black", 30),

  { id: "right", type: "half", side: "right", j: "{右|みぎ}へ！", say: "みぎへ", en: "right", from: 0 },
  { id: "left", type: "half", side: "left", j: "{左|ひだり}へ！", say: "ひだりへ", en: "left", from: 0 },
  { id: "up", type: "half", side: "up", j: "{上|うえ}へ！", say: "うえへ", en: "up", from: 15 },
  { id: "down", type: "half", side: "down", j: "{下|した}へ！", say: "したへ", en: "down", from: 15 },

  pad("cat", "animal", "cat", "{猫|ねこ}へ！", "ねこへ", "cat", 40),
  pad("dog", "animal", "dog", "{犬|いぬ}へ！", "いぬへ", "dog", 40),
  pad("bird", "animal", "bird", "{鳥|とり}へ！", "とりへ", "bird", 40),
  pad("bear", "animal", "bear", "{熊|くま}へ！", "くまへ", "bear", 70),
  pad("fox", "animal", "fox", "{狐|きつね}へ！", "きつねへ", "fox", 70),
  pad("rabbit", "animal", "rabbit", "{兎|うさぎ}へ！", "うさぎへ", "rabbit", 70),

  { id: "stop", type: "still", j: "{止まって|とまって}！", say: "とまって", en: "stop!", from: 50 },
  { id: "run", type: "move", j: "{走って|はしって}！", say: "はしって", en: "run!", from: 50 },

  pad("cold", "temp", "cold", "{寒い|さむい} {所|ところ}へ！", "さむいところへ", "a cold place", 90),
  pad("hot", "temp", "hot", "{暑い|あつい} {所|ところ}へ！", "あついところへ", "a hot place", 90),
  pad("bright", "temp", "bright", "{明るい|あかるい} {所|ところ}へ！", "あかるいところへ", "a bright place", 90),
  pad("dark", "temp", "dark", "{暗い|くらい} {所|ところ}へ！", "くらいところへ", "a dark place", 90),
  { id: "wide", type: "size", key: "big", j: "{広い|ひろい} {所|ところ}へ！", say: "ひろいところへ", en: "a wide place", from: 110 },
  { id: "narrow", type: "size", key: "small", j: "{狭い|せまい} {所|ところ}へ！", say: "せまいところへ", en: "a narrow place", from: 110 },

  { id: "north", type: "half", side: "up", j: "{北|きた}へ！", say: "きたへ", en: "north (up the screen)", from: 130 },
  { id: "south", type: "half", side: "down", j: "{南|みなみ}へ！", say: "みなみへ", en: "south (down the screen)", from: 130 },
  { id: "east", type: "half", side: "right", j: "{東|ひがし}へ！", say: "ひがしへ", en: "east (right on the screen)", from: 130 },
  { id: "west", type: "half", side: "left", j: "{西|にし}へ！", say: "にしへ", en: "west (left on the screen)", from: 130 },
];

/* What a level-up offers: a picture and one word. */
export const UPGRADES = [
  { id: "speed", icon: "🏃", j: "{速い|はやい}" },
  { id: "power", icon: "💪", j: "{強い|つよい}" },
  { id: "rapid", icon: "⚡", j: "もっと" },
  { id: "shots", icon: "✌️", j: "{二つ|ふたつ}" },
  { id: "big", icon: "🌟", j: "{大きい|おおきい}" },
  { id: "pull", icon: "🧲", j: "{近く|ちかく}へ" },
  { id: "heal", icon: "❤️", j: "{元気|げんき}" },
];

/* Lines the game itself says. */
export const LINES = {
  title: "{言葉|ことば}クエスト",
  win: "やった！",
  miss: "ちがう！",
  boss: "ボスだ！",
  again: "もう{一回|いっかい}！",
  over: "ゲームオーバー",
  newBest: "{新記録|しんきろく}！",
};

/* The six places a run passes through, one a minute. */
export const STAGES = ["campus", "town", "river", "stadium", "office", "forest"];
