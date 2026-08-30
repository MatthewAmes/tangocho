/* ── give imported words a real emoji ──
   The Volume 2 import stamped every entry with 📗 as a placeholder, which made every new
   section chip identical — the chips show the most-used emoji in the section, so 792
   copies of one book icon erased the visual difference between sixty sections.

     node tools/assign-emoji.mjs            # patches JpnFlashcards.jsx in place

   Emoji are matched against the English gloss, the same approach the kanji data already
   uses. Where nothing matches confidently the emoji is REMOVED rather than guessed: a
   card with no icon is honest, a card with a wrong one is noise, and the section chip
   picks the most common icon among the words that do have one.

   Order matters — the first match wins, so specific terms sit above general ones. */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "JpnFlashcards.jsx");

const RULES = [
  // people & family
  [/\b(grandmother|grandma)\b/, "👵"], [/\b(grandfather|grandpa)\b/, "👴"],
  [/\b(mother|mom)\b/, "👩"], [/\b(father|dad)\b/, "👨"],
  [/\b(older sister|younger sister|sister)\b/, "👧"], [/\b(older brother|younger brother|brother)\b/, "👦"],
  [/\b(baby|infant)\b/, "👶"], [/\b(child|kids?)\b/, "🧒"],
  [/\b(family|relatives?)\b/, "👨‍👩‍👧"], [/\b(friend)\b/, "🧑‍🤝‍🧑"],
  [/\b(wife|husband|married|marriage)\b/, "💍"], [/\b(teacher|professor)\b/, "🧑‍🏫"],
  [/\b(student|pupil)\b/, "🧑‍🎓"], [/\b(doctor|nurse|patient)\b/, "🧑‍⚕️"],
  [/\b(police|officer)\b/, "👮"], [/\b(neighbou?r)\b/, "🏘️"],
  [/\b(people|person|human)\b/, "🧍"],

  // food & drink
  [/\b(rice|meal|breakfast|lunch|dinner)\b/, "🍚"], [/\b(bread|toast)\b/, "🍞"],
  [/\b(meat|beef|pork|chicken)\b/, "🍖"], [/\b(fish|seafood)\b/, "🐟"],
  [/\b(vegetable|salad)\b/, "🥗"], [/\b(fruit|apple|orange)\b/, "🍎"],
  [/\b(egg)\b/, "🥚"], [/\b(noodle|ramen|soba|udon)\b/, "🍜"],
  [/\b(tea|green tea)\b/, "🍵"], [/\b(coffee)\b/, "☕"],
  [/\b(water|drink|beverage)\b/, "💧"], [/\b(alcohol|beer|sake|wine)\b/, "🍶"],
  [/\b(sweets?|candy|cake|dessert|sugar)\b/, "🍰"], [/\b(cook|cooking|recipe)\b/, "🍳"],
  [/\b(restaurant|cafe|café)\b/, "🍽️"], [/\b(eat|ate|eating)\b/, "🍴"],
  [/\b(delicious|tasty)\b/, "😋"],

  // places
  [/\b(school|classroom)\b/, "🏫"], [/\b(university|college)\b/, "🎓"],
  [/\b(hospital|clinic)\b/, "🏥"], [/\b(station)\b/, "🚉"],
  [/\b(airport)\b/, "✈️"], [/\b(hotel|inn)\b/, "🏨"],
  [/\b(bank)\b/, "🏦"], [/\b(post office|mail)\b/, "📮"],
  [/\b(library)\b/, "📚"], [/\b(museum)\b/, "🏛️"],
  [/\b(shop|store|supermarket|market)\b/, "🏬"], [/\b(park|garden)\b/, "🌳"],
  [/\b(temple|shrine)\b/, "⛩️"], [/\b(church)\b/, "⛪"],
  [/\b(house|home|apartment|room|住)\b/, "🏠"], [/\b(city|town|street|road)\b/, "🏙️"],
  [/\b(country|nation|abroad|foreign)\b/, "🌏"], [/\b(mountain)\b/, "⛰️"],
  [/\b(sea|ocean|beach|river|lake)\b/, "🌊"], [/\b(office|company|corporation)\b/, "🏢"],
  [/\b(bathroom|toilet|bath)\b/, "🛁"], [/\b(kitchen)\b/, "🍳"],
  [/\b(bedroom|bed|sleep)\b/, "🛏️"], [/\b(campus)\b/, "🏫"],

  // transport
  [/\b(train|subway)\b/, "🚆"], [/\b(bus)\b/, "🚌"], [/\b(car|drive|driving)\b/, "🚗"],
  [/\b(bicycle|bike)\b/, "🚲"], [/\b(airplane|plane|flight)\b/, "✈️"],
  [/\b(walk|walking|on foot)\b/, "🚶"], [/\b(travel|trip|journey|tour)\b/, "🧳"],
  [/\b(commut|transfer)\w*\b/, "🚉"], [/\b(ticket)\b/, "🎫"],

  // time
  [/\b(morning)\b/, "🌅"], [/\b(noon|midday)\b/, "🌞"],
  [/\b(evening|night|tonight)\b/, "🌙"], [/\b(today|now)\b/, "📍"],
  [/\b(tomorrow|yesterday|day after|day before)\b/, "📆"],
  [/\b(week|month|year|season)\b/, "🗓️"], [/\b(hour|minute|second|o'clock|time)\b/, "🕐"],
  [/\b(spring)\b/, "🌸"], [/\b(summer)\b/, "🌻"], [/\b(autumn|fall)\b/, "🍁"], [/\b(winter)\b/, "❄️"],
  [/\b(birthday)\b/, "🎂"], [/\b(holiday|vacation|day off)\b/, "🏖️"],
  [/\b(early|late|hurry)\b/, "⏱️"],

  // weather & nature
  [/\b(rain|rainy)\b/, "🌧️"], [/\b(snow)\b/, "❄️"], [/\b(wind|windy|typhoon)\b/, "🌬️"],
  [/\b(sun|sunny|fine weather)\b/, "☀️"], [/\b(cloud|cloudy)\b/, "☁️"],
  [/\b(hot|heat|warm)\b/, "🔥"], [/\b(cold|cool|chilly)\b/, "🥶"],
  [/\b(weather|temperature|climate)\b/, "🌡️"], [/\b(flower|blossom|plant|tree)\b/, "🌸"],
  [/\b(animal|dog|cat|bird)\b/, "🐾"],

  // body & health
  [/\b(head|face|eye|ear|nose|mouth|hand|foot|leg|body)\b/, "🫀"],
  [/\b(sick|illness|disease|fever|cold \(illness\)|pain|hurt)\b/, "🤒"],
  [/\b(medicine|drug|pill)\b/, "💊"], [/\b(tired|exhausted|sleepy)\b/, "😴"],
  [/\b(healthy|health|fine|well)\b/, "💪"],

  // feelings
  [/\b(happy|glad|joy|fun|enjoy)\b/, "😊"], [/\b(sad|lonely|cry)\b/, "😢"],
  [/\b(angry|anger|mad)\b/, "😠"], [/\b(surprise|surprised|shock)\b/, "😲"],
  [/\b(afraid|scary|fear|frighten)\w*\b/, "😨"], [/\b(worried|worry|anxious|nervous)\b/, "😟"],
  [/\b(like|love|favou?rite)\b/, "❤️"], [/\b(dislike|hate)\b/, "💢"],
  [/\b(embarrass|shy)\w*\b/, "😳"], [/\b(interesting|interest)\b/, "🤔"],

  // school & work
  [/\b(study|studying|learn|homework|lesson|class)\b/, "📖"],
  [/\b(test|exam|quiz|grade)\b/, "📝"], [/\b(book|textbook|novel|read|reading)\b/, "📕"],
  [/\b(write|writing|pen|pencil|paper|letter)\b/, "✍️"],
  [/\b(work|job|employ|career|business)\w*\b/, "💼"], [/\b(meeting|conference)\b/, "🗣️"],
  [/\b(money|price|cost|pay|yen|cheap|expensive)\b/, "💴"],
  [/\b(computer|internet|phone|telephone|email)\b/, "💻"],
  [/\b(question|ask|answer)\b/, "❓"], [/\b(dictionary|word|vocabulary|language)\b/, "🈁"],
  [/\b(kanji|hiragana|katakana|character)\b/, "🈶"],

  // activities
  [/\b(sport|exercise|swim|run|running|baseball|soccer|tennis)\b/, "🏃"],
  [/\b(music|sing|song|listen|instrument|piano|guitar)\b/, "🎵"],
  [/\b(movie|film|television|tv|watch)\b/, "🎬"], [/\b(game|play|playing)\b/, "🎮"],
  [/\b(photo|picture|camera|draw|paint)\b/, "📷"], [/\b(shopping|buy|sell|purchase)\b/, "🛒"],
  [/\b(clean|wash|laundry|tidy)\b/, "🧹"], [/\b(party|festival|celebrat)\w*\b/, "🎉"],
  [/\b(present|gift)\b/, "🎁"], [/\b(rest|relax|break)\b/, "😌"],
  [/\b(wear|clothes|clothing|shirt|shoes|hat)\b/, "👕"],

  // qualities
  [/\b(big|large|huge)\b/, "🔷"], [/\b(small|little|tiny)\b/, "🔹"],
  [/\b(new|fresh)\b/, "🆕"], [/\b(old|ancient)\b/, "🏺"],
  [/\b(good|nice|great|wonderful)\b/, "👍"], [/\b(bad|terrible|awful)\b/, "👎"],
  [/\b(easy|simple|convenient|comfortable)\b/, "✅"], [/\b(difficult|hard|inconvenient|troublesome)\b/, "😣"],
  [/\b(fast|quick|speed)\b/, "⚡"], [/\b(slow|quiet|calm)\b/, "🤫"],
  [/\b(beautiful|pretty|clean|lovely)\b/, "✨"], [/\b(dirty|messy)\b/, "🧼"],
  [/\b(busy)\b/, "🌀"], [/\b(free|freedom)\b/, "🕊️"],
  [/\b(safe|safety|dangerous|danger)\b/, "⚠️"],
  [/\b(strong|weak)\b/, "💪"], [/\b(long|short|tall|near|far|distant)\b/, "📏"],
  [/\b(many|much|few|little|number|count)\b/, "🔢"],
  [/\b(same|different|similar)\b/, "🔀"],
  [/\b(first|second|third|next|last|order)\b/, "🔟"],

  // communication & misc
  [/\b(say|speak|talk|tell|conversation|語)\b/, "💬"],
  [/\b(think|thought|opinion|idea|remember|forget)\b/, "💭"],
  [/\b(know|understand|knowledge)\b/, "💡"],
  [/\b(go|come|return|arrive|leave|enter|exit)\b/, "🚪"],
  [/\b(make|build|create|produce)\b/, "🔨"], [/\b(give|receive|send)\b/, "📦"],
  [/\b(use|using|useful)\b/, "🧰"], [/\b(help|assist|kind)\b/, "🤝"],
  [/\b(wait|waiting)\b/, "⏳"], [/\b(open|close|start|begin|finish|end|stop)\b/, "🔘"],
  [/\b(reason|because|therefore|meaning)\b/, "🧩"],
];

function emojiFor(meaning) {
  const m = " " + meaning.toLowerCase() + " ";
  for (const [re, e] of RULES) if (re.test(m)) return e;
  return null;
}

const src = await readFile(FILE, "utf8");
const lines = src.split("\n");
let changed = 0, cleared = 0;
const used = new Map();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!/emoji: "📗"/.test(line)) continue;
  const meaning = (/meaning: "([^"]*)"/.exec(line) || [])[1] || "";
  const e = emojiFor(meaning);
  if (e) {
    lines[i] = line.replace(/emoji: "📗"/, `emoji: "${e}"`);
    used.set(e, (used.get(e) || 0) + 1);
    changed++;
  } else {
    // No confident match: drop the field rather than leave a meaningless icon.
    lines[i] = line.replace(/ emoji: "📗",/, "");
    cleared++;
  }
}

await writeFile(FILE, lines.join("\n"));
const top = [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e, n]) => e + n).join(" ");
process.stderr.write(`assigned ${changed}, cleared ${cleared}, distinct emoji ${used.size}\n`);
process.stderr.write(`most used: ${top}\n`);
