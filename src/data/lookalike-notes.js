/* Kanji pairs that are built from the same pieces and told apart by one stroke — a line's
   length, a dot, whether a stroke pokes through. A breakdown into parts cannot separate
   them (KRADFILE lists 未 and 末 with the same elements), so the difference is written out
   here by hand. Each note says only what is visible on the page: no etymology. */
export const CURATED = [
  { pair: "未末", note: "未 (not yet): the top line is shorter than the one below. 末 (end): the top line is longer." },
  { pair: "土士", note: "土 (earth): the bottom line is longer. 士 (samurai): the top line is longer." },
  { pair: "千干", note: "千 (thousand): the top stroke slants down to the left. 干 (dry): it is flat." },
  { pair: "午牛", note: "牛 (cow): the centre line pokes up through the top. 午 (noon): it stops at the top line." },
  { pair: "人入", note: "人 (person): the left stroke is the long one. 入 (enter): the right stroke is the long one and the left leans on it." },
  { pair: "大犬", note: "犬 (dog) is 大 (big) with a dot at the top right." },
  { pair: "大太", note: "太 (fat) is 大 (big) with a dot underneath." },
  { pair: "犬太", note: "犬 (dog): the dot is at the top right. 太 (fat): the dot is underneath." },
  { pair: "天夫", note: "夫 (husband): the centre line pokes up through the top line. 天 (heaven): it does not." },
  { pair: "右石", note: "右 (right): the slanting stroke crosses the top line. 石 (stone): it starts underneath it." },
  { pair: "王玉", note: "玉 (jewel) is 王 (king) with a dot." },
  { pair: "見貝", note: "見 (see) stands on legs (儿). 貝 (shell) ends in two short strokes (ハ)." },
  { pair: "力刀", note: "力 (power): the slanting stroke pokes up through the top line. 刀 (sword): it starts at the top line." },
  { pair: "日目", note: "目 (eye) has two lines inside. 日 (sun) has one." },
  { pair: "白百", note: "百 (hundred) is 白 (white) with a line on top." },
  { pair: "休体", note: "休 (rest) is 亻 + 木 (tree). 体 (body) is 亻 + 本 (origin) — the extra short line at the bottom." },
  { pair: "鳥島", note: "島 (island) has 山 (mountain) at the bottom, where 鳥 (bird) has four dots." },
  { pair: "木本", note: "本 (book, origin) is 木 (tree) with a short line across the bottom." },
];
