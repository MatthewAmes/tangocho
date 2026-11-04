/* ── Kotoba Quest: the creatures ──
   Everything here is our own: names are Japanese words glued together (寒い + 猫 = Samuneko), so
   even the roster teaches something. `kind` decides how a creature's shots behave when it is
   your partner (tools/run-game.mjs). */
export const SPECIES = {
  kotodama: { name: "Kotodama", ja: "コトダマ", kind: "plain", from: "言霊 — the spirit in words" },
  samuneko: { name: "Samuneko", ja: "サムネコ", kind: "cold", from: "寒い + 猫 (cold + cat)" },
  atsuinu: { name: "Atsuinu", ja: "アツイヌ", kind: "hot", from: "暑い + 犬 (hot + dog)" },
  haredori: { name: "Haredori", ja: "ハレドリ", kind: "bright", from: "晴れ + 鳥 (sunny + bird)" },
  reibouzu: { name: "Reibouzu", ja: "レイボウズ", kind: "cold", from: "冷房 + 坊主 (air conditioner + monk)", boss: true },
  mezamashi: { name: "Mezamashi", ja: "メザマシ", kind: "bright", from: "目覚まし (alarm clock)" },
  nebokuro: { name: "Nebokuro", ja: "ネボクロウ", kind: "cold", from: "寝坊 + ふくろう (oversleep + owl)" },
  keekin: { name: "Keekin", ja: "ケーキン", kind: "hot", from: "ケーキ + 金 (cake + gold)" },
  sentakuma: { name: "Sentakuma", ja: "センタクマ", kind: "cold", from: "洗濯 + 熊 (laundry + bear)" },
  gomitanu: { name: "Gomitanu", ja: "ゴミタヌ", kind: "plain", from: "ゴミ + 狸 (trash + raccoon dog)" },
  houkitsune: { name: "Houkitsune", ja: "ホウキツネ", kind: "hot", from: "ほうき + 狐 (broom + fox)" },
  tempuragon: { name: "Tempuragon", ja: "テンプラゴン", kind: "hot", from: "天ぷら + ドラゴン" },
  yakyusagi: { name: "Yakyusagi", ja: "ヤキュウサギ", kind: "plain", from: "野球 + うさぎ (baseball + rabbit)" },
  kabukiji: { name: "Kabukiji", ja: "カブキジ", kind: "bright", from: "歌舞伎 + きじ (kabuki + pheasant)" },
  suutsuru: { name: "Suutsuru", ja: "スーツル", kind: "cold", from: "スーツ + 鶴 (suit + crane)" },
  kaishachi: { name: "Kaishachi", ja: "カイシャチ", kind: "cold", from: "会社 + しゃち (company + orca)" },
  yubiwani: { name: "Yubiwani", ja: "ユビワニ", kind: "bright", from: "指輪 + わに (ring + crocodile)" },
  nattounagi: { name: "Nattounagi", ja: "ナットウナギ", kind: "plain", from: "納豆 + うなぎ (natto + eel)" },
  purezentori: { name: "Purezentori", ja: "プレゼントリ", kind: "bright", from: "プレゼント + 鳥 (present + bird)" },
  isukappa: { name: "Isukappa", ja: "イスカッパ", kind: "cold", from: "椅子 + かっぱ (chair + kappa)" },
};
