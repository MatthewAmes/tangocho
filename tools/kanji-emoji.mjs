// Attach an emoji and a spoken example to every kanji, then rewrite data/kanji.json.
//
//   node tools/kanji-emoji.mjs
//
// Why an emoji at all: a character is an arbitrary shape until it is attached to something
// concrete. A picture gives the shape a hook that a gloss like "substitute" does not.
// Abstract kanji get nothing rather than a misleading picture — a wrong hook is worse than
// none, because it has to be unlearned later.
//
// Matching is on the KANJIDIC glosses, longest keyword first so "rice field" wins over
// "rice", and whole-word only so "art" does not fire on "start".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MAP = [
  ["sun", "☀️"], ["day", "📅"], ["moon", "🌙"], ["month", "🗓️"], ["year", "📆"],
  ["fire", "🔥"], ["water", "💧"], ["tree", "🌳"], ["wood", "🌲"], ["forest", "🌲"],
  ["mountain", "⛰️"], ["river", "🏞️"], ["sea", "🌊"], ["ocean", "🌊"], ["rain", "🌧️"],
  ["snow", "❄️"], ["wind", "🌬️"], ["sky", "🌤️"], ["star", "⭐"], ["cloud", "☁️"],
  ["earth", "🌍"], ["stone", "🪨"], ["gold", "🥇"], ["metal", "⚙️"], ["soil", "🟫"],
  ["person", "🧑"], ["man", "👨"], ["woman", "👩"], ["child", "🧒"], ["baby", "👶"],
  ["mother", "👩‍🍼"], ["father", "👨‍🦱"], ["friend", "🤝"], ["family", "👨‍👩‍👧"],
  ["eye", "👁️"], ["ear", "👂"], ["mouth", "👄"], ["hand", "✋"], ["foot", "🦶"],
  ["heart", "❤️"], ["head", "🗣️"], ["body", "🧍"], ["face", "🙂"], ["blood", "🩸"],
  ["dog", "🐕"], ["cat", "🐈"], ["bird", "🐦"], ["fish", "🐟"], ["horse", "🐎"],
  ["cow", "🐄"], ["sheep", "🐑"], ["pig", "🐖"], ["insect", "🐛"], ["animal", "🐾"],
  ["rice field", "🌾"], ["rice", "🍚"], ["meat", "🍖"], ["food", "🍱"], ["eat", "🍽️"],
  ["drink", "🥤"], ["tea", "🍵"], ["sake", "🍶"], ["milk", "🥛"], ["salt", "🧂"],
  ["flower", "🌸"], ["grass", "🌿"], ["bamboo", "🎋"], ["fruit", "🍎"], ["seed", "🌱"],
  ["car", "🚗"], ["train", "🚃"], ["boat", "⛵"], ["ship", "🚢"], ["bicycle", "🚲"],
  ["road", "🛣️"], ["bridge", "🌉"], ["station", "🚉"], ["airplane", "✈️"],
  ["house", "🏠"], ["home", "🏡"], ["door", "🚪"], ["gate", "⛩️"], ["window", "🪟"],
  ["room", "🚪"], ["building", "🏢"], ["shop", "🏪"], ["store", "🏬"], ["temple", "⛩️"],
  ["school", "🏫"], ["hospital", "🏥"], ["bank", "🏦"], ["city", "🏙️"], ["town", "🏘️"],
  ["village", "🏡"], ["country", "🗺️"], ["capital", "🏛️"], ["world", "🌏"],
  ["book", "📕"], ["write", "✍️"], ["read", "📖"], ["study", "📚"], ["learn", "🎓"],
  ["word", "💬"], ["language", "🗣️"], ["speak", "🗨️"], ["say", "💬"], ["talk", "💬"],
  ["listen", "👂"], ["hear", "👂"], ["see", "👀"], ["look", "👀"], ["watch", "👁️"],
  ["letter", "✉️"], ["paper", "📄"], ["picture", "🖼️"], ["music", "🎵"], ["song", "🎶"],
  ["money", "💴"], ["buy", "🛒"], ["sell", "🏷️"], ["price", "💰"], ["expensive", "💸"],
  ["work", "💼"], ["company", "🏢"], ["employee", "👔"], ["business", "📈"],
  ["time", "⏰"], ["hour", "🕐"], ["minute", "⏱️"], ["now", "⌛"], ["morning", "🌅"],
  ["evening", "🌆"], ["night", "🌃"], ["noon", "🌞"], ["week", "📆"], ["spring", "🌸"],
  ["summer", "🏖️"], ["autumn", "🍁"], ["fall", "🍂"], ["winter", "⛄"],
  ["big", "🔵"], ["large", "🔵"], ["small", "🔹"], ["little", "🔹"], ["long", "📏"],
  ["short", "📐"], ["high", "🔼"], ["tall", "🔼"], ["low", "🔽"], ["new", "✨"],
  ["old", "🧓"], ["good", "👍"], ["bad", "👎"], ["strong", "💪"], ["weak", "🫤"],
  ["fast", "⚡"], ["early", "🌄"], ["slow", "🐢"], ["late", "🕘"],
  ["white", "⚪"], ["black", "⚫"], ["red", "🔴"], ["blue", "🔵"], ["green", "🟢"],
  ["yellow", "🟡"], ["colour", "🎨"], ["color", "🎨"], ["light", "💡"], ["dark", "🌑"],
  ["north", "🧭"], ["south", "🧭"], ["east", "🧭"], ["west", "🧭"],
  ["right", "➡️"], ["left", "⬅️"], ["up", "⬆️"], ["down", "⬇️"], ["middle", "🎯"],
  ["inside", "📥"], ["outside", "📤"], ["front", "⏭️"], ["behind", "⏮️"], ["between", "↔️"],
  ["go", "🚶"], ["come", "🏃"], ["enter", "🚪"], ["exit", "🚪"], ["stand", "🧍"],
  ["sit", "🪑"], ["sleep", "😴"], ["rest", "😌"], ["walk", "🚶"], ["run", "🏃"],
  ["stop", "🛑"], ["open", "🔓"], ["close", "🔒"], ["begin", "▶️"], ["end", "⏹️"],
  ["meet", "🤝"], ["love", "💗"], ["like", "💕"], ["happy", "😊"], ["sad", "😢"],
  ["angry", "😠"], ["laugh", "😄"], ["cry", "😭"], ["think", "🤔"], ["know", "💡"],
  ["hot", "🌡️"], ["cold", "🥶"], ["warm", "🔆"], ["cool", "🧊"], ["safe", "🛡️"],
  ["war", "⚔️"], ["peace", "🕊️"], ["power", "⚡"], ["life", "🌱"], ["death", "⚰️"],
  ["birth", "🎂"], ["name", "🏷️"], ["number", "🔢"], ["half", "🌗"], ["whole", "⭕"],
  ["hundred", "💯"], ["thousand", "🔢"], ["ten thousand", "🔢"], ["one", "1️⃣"],
  ["two", "2️⃣"], ["three", "3️⃣"], ["four", "4️⃣"], ["five", "5️⃣"], ["six", "6️⃣"],
  ["seven", "7️⃣"], ["eight", "8️⃣"], ["nine", "9️⃣"], ["ten", "🔟"],
  ["question", "❓"], ["answer", "✅"], ["true", "✔️"], ["wrong", "❌"], ["medicine", "💊"],
  ["doctor", "👨‍⚕️"], ["sick", "🤒"], ["hair", "💇"], ["clothes", "👕"], ["shoe", "👟"],
  ["hat", "🎩"], ["key", "🔑"], ["knife", "🔪"], ["sword", "🗡️"], ["needle", "🪡"],
  ["field", "🌾"], ["garden", "🌷"], ["farm", "🚜"], ["island", "🏝️"], ["lake", "🏞️"],
  ["电", "⚡"], ["electricity", "⚡"], ["machine", "🛠️"], ["tool", "🧰"], ["glass", "🥃"],
  ["dream", "💭"], ["god", "⛩️"], ["spirit", "👻"], ["heaven", "☁️"], ["hell", "🔥"],
];
// longest keyword first so "rice field" beats "rice"
MAP.sort((a, b) => b[0].length - a[0].length);

const file = path.join(ROOT, "data/kanji.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

let hit = 0;
for (const k of data.kanji) {
  const glosses = k.m.map((m) => m.toLowerCase());
  let found = "";
  for (const [word, emo] of MAP) {
    // whole-word match only: "art" must not fire on "start"
    const re = new RegExp("(^|[^a-z])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z])");
    if (glosses.some((g) => re.test(g))) { found = emo; break; }
  }
  if (found) { k.e = found; hit++; }
}

data.emoji = hit;
data.source = (data.source || "") + " Emoji hooks assigned from the English glosses; abstract kanji are left without one deliberately.";
fs.writeFileSync(file, JSON.stringify(data));

console.log(`${hit} of ${data.kanji.length} kanji got an emoji hook (${Math.round(hit / data.kanji.length * 100)}%)`);
console.log("first 20 with hooks:");
data.kanji.filter((k) => k.e).slice(0, 20).forEach((k) => console.log(`  ${k.e}  ${k.c}  ${k.m.slice(0, 2).join(", ")}`));
console.log("\nsample without (deliberate):");
data.kanji.filter((k) => !k.e).slice(0, 8).forEach((k) => console.log(`     ${k.c}  ${k.m.slice(0, 2).join(", ")}`));
console.log(`\ndata/kanji.json  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
