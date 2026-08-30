/* ── give the remaining imported words a real icon ──
   node tools/assign-emoji2.mjs [--write]

   The first pass matched 374 of the 792 NihonGO Volume 2 words and deliberately left the
   other 418 blank rather than guessing. That was too cautious: 富士山 is 🗻, ATM is 🏧 and
   カラオケ is 🎤, and a card with no icon is worse than a card with an approximate one —
   the icon is a retrieval cue, and an empty slot cues nothing.

   The rule that still holds: match on MEANING, and never invent a connection that is not
   there. Where nothing fits, the word falls through to an icon for its grammatical class,
   which at least distinguishes a verb card from an adjective card at a glance. Nothing is
   given the textbook 📗 again, because 792 identical books was the original complaint. */

import fs from "fs";

const FILE = new URL("../JpnFlashcards.jsx", import.meta.url).pathname.replace(/^\//, "");

/* Ordered: the first pattern that matches wins, so specific entries precede general ones. */
const RULES = [
  /* Discourse and abstractions come FIRST. それより means "more importantly", which the
     generic /important/ rule below was matching into ❗ — first-match-wins only works if
     the specific phrases are actually first. */
  [/aside|apart from that|more importantly|by the way|what.s more|besides|in addition/i, "↪️"],
  [/^why\b|^why$/i, "❓"], [/quite|considerably|a fair amount|rather\b/i, "📊"],
  [/without fail|always|without exception/i, "💯"], [/usually|as a rule/i, "📊"],
  [/sometimes/i, "🔁"], [/once in a while/i, "🕐"], [/rapidly|steadily/i, "⚡"],
  [/exactly|precisely|just$/i, "🎯"], [/properly|reliably|satisfactorily/i, "👌"],
  [/actually|in fact/i, "💡"], [/specially/i, "⭐"], [/not at all/i, "🙅"],
  [/thanks to you|take care/i, "🙏"], [/to that extent|so\/such/i, "📏"],
  [/unusual|rare\b/i, "💎"], [/classifier|times, degrees|times, instances/i, "🔢"],
  [/^half\b|half \(/i, "🌗"], [/point\(s\)|score/i, "🎯"], [/^straight$/i, "⬆️"],

  // trouble, condition, feeling toward
  [/trouble|bother|nuisance|obstacle|troublesome|bothersome|tiresome/i, "😖"],
  [/condition|personal condition/i, "🩺"], [/restraint|reservation/i, "🙅"],
  [/disagreeable|unpleasant/i, "😖"], [/\blie\b(?!.*down)/i, "🤥"], [/joke/i, "🤣"],
  [/laugh/i, "😂"], [/apologi[sz]e/i, "🙇"], [/filial piety|dedication to par/i, "🙇"],
  [/diligent|serious/i, "🤓"], [/sure, certain|^certain/i, "✔️"], [/^want\b/i, "🙋"],
  [/get thirsty/i, "🥤"], [/get hungry/i, "🍽️"], [/throat/i, "👅"], [/abdomen|stomach/i, "🍽️"],

  // doing things
  [/climb/i, "🧗"], [/get together|assemble/i, "👥"], [/graduation|graduate/i, "🎓"],
  [/wake up|rise\b/i, "⏰"], [/alarm/i, "⏰"], [/hit on target|right \(on target|you got it/i, "🎯"],
  [/cleaning|clean up/i, "🧹"], [/throw away|discard/i, "🗑️"], [/put, place|position/i, "📦"],
  [/reside/i, "🏠"], [/change x|^change\b/i, "🔄"], [/forgotten thing/i, "🧳"],
  [/have gone|experience of having/i, "🚶"],

  // places, roles, fields
  [/intersection/i, "🚦"], [/^corner|, corner/i, "📐"], [/pharmacy/i, "💊"],
  [/area, vicinity|vicinity/i, "📍"], [/interval|space between|between x/i, "🔗"],
  [/research institute/i, "🔬"], [/lawyer|attorney|^law$/i, "⚖️"],
  [/architecture/i, "🏛️"], [/education/i, "🎓"], [/^it$/i, "💻"], [/analysis/i, "🔬"],
  [/relationship/i, "🔗"], [/birthplace/i, "🌏"], [/parents|^parent$/i, "👪"],
  [/academic term|semester/i, "📅"], [/^voice$/i, "🗣️"], [/^sound$/i, "🔊"],
  [/cheers!/i, "🥂"], [/birds of a feather|flock together/i, "🐦"],
  [/the fact is/i, "💬"],

  // the last handful, done by hand
  [/beard/i, "🧔"], [/twins/i, "👯"], [/single; unmarried/i, "👤"],
  [/^young$/i, "👶"], [/splendid|elegant/i, "✨"],
  [/lack of practice|insufficiency/i, "📉"], [/i.m very sorry/i, "🙇"],
  [/as it is|without change/i, "🔓"], [/show around|showing you around/i, "🗺️"],
  [/completely/i, "💯"], [/somehow or other/i, "🤷"],
  [/romanization|romanisation/i, "🔤"], [/^and…$/u, "➕"],

  // body — specific where an icon exists, one shared figure where it does not
  [/^tooth|teeth/i, "🦷"], [/^tongue/i, "👅"], [/^arm$/i, "💪"], [/^finger/i, "👆"],
  [/buttocks|behind$/i, "🍑"], [/^hair$/i, "💇"], [/^fur$/i, "🐾"],
  [/^neck|shoulder|lower\) back|^back$|^chest|^waist/i, "🧍"],
  [/brown eyes|^eye/i, "👁️"], [/throbbing|tender \(as a rash\)/i, "🤕"],
  [/^dry$/i, "🌵"], [/dizzy/i, "😵"], [/itchy/i, "😖"], [/lie down/i, "🛌"],

  // family
  [/uncle/i, "👨"], [/^aunt/i, "👩"], [/cousin/i, "🧑"],

  // orientation and abstract qualities
  [/side, horizontal/i, "↔️"], [/^vertical/i, "↕️"], [/diagonal/i, "↗️"],
  [/active, positive|optimistic/i, "😃"], [/passive, unmotivated|pessimistic/i, "😔"],
  [/^social$/i, "👥"], [/historical/i, "🏛️"], [/literary/i, "📖"],
  [/sudden/i, "⚡"], [/a while, a moment/i, "⏳"], [/^length$/i, "📏"],
  [/clever|smart\b|intelligent/i, "🧠"], [/stubborn/i, "😤"],
  [/surely|undoubtedly/i, "💯"], [/^result$/i, "📊"], [/then, following that/i, "➡️"],
  [/benevolence|favor \(|favour \(/i, "🎁"], [/obligation/i, "⚖️"],

  // objects and actions
  [/attach, apply/i, "📎"], [/what do you mean|what does that mean/i, "❓"],
  [/back-channel|nods/i, "💬"], [/your kindness/i, "🙏"], [/stationery/i, "✏️"],
  [/comics|manga/i, "📚"], [/^desk$|^chair$/i, "🪑"], [/^shelf/i, "🗄️"],
  [/lend, rent/i, "🤝"], [/put away/i, "📦"], [/^take, get$/i, "🤲"],
  [/natto|fermented soy/i, "🫘"], [/hit, insert/i, "👊"],
  [/when i have said/i, "💬"],

  /* Proper nouns. A place name genuinely has no icon of its own, but "somewhere on a map"
     is still a better cue than a generic one, and it groups them sensibly on a section
     chip. Same for personal names. */
  [/^(shikoku|honshu|kyushu|hokkaido|okinawa|sapporo|sendai|kanazawa|fukuoka|osaka|kyoto|naha|england)$/i, "🗾"],
  [/place name|prefectures/i, "🗾"], [/given name\]|\[female|\[male/i, "🧑"],
  [/author, \d|^natsume/i, "✍️"], [/honorific title/i, "🎩"],

  // culture, study, work
  [/hobby/i, "🎨"], [/kendo/i, "🥋"], [/enka|ballad style/i, "🎤"],
  [/kabuki|noh \(|traditional theater/i, "🎭"], [/thesis/i, "📄"],
  [/^research/i, "🔬"], [/experiment/i, "🧪"], [/investigation|survey|investigate|inquire/i, "🔍"],
  [/interpretation|translation/i, "🌐"], [/specialized|specialised/i, "🎓"],
  [/^content$/i, "📄"], [/preparation/i, "🧰"], [/training/i, "🏋️"],
  [/pronunciation/i, "🗣️"], [/planning division|development division|operations division/i, "🏢"],
  [/^problem$/i, "❗"], [/^average$/i, "📊"], [/thesis|dissertation/i, "📄"],

  // qualities and quantities
  [/impossible|unreasonable/i, "🚫"], [/entry way|entrance/i, "🚪"], [/oneself/i, "🙋"],
  [/take \(a shower\)|bathe in|covered in/i, "🚿"], [/or \(else\)|^or\b/i, "🔀"],
  [/really, truly|really, really|all out|for all one is worth/i, "💯"],
  [/double, -fold|multiple, -fold/i, "✖️"], [/speedy/i, "⚡"],
  [/excellent|distinguished|admirable/i, "🌟"], [/absolutely/i, "💯"],
  [/^spicy$/i, "🌶️"], [/^salty$/i, "🧂"], [/^sour$/i, "🍋"], [/tempura/i, "🍤"],
  [/^seat|seated\) occasion/i, "💺"], [/^ring$/i, "💍"], [/gloves/i, "🧤"],
  [/stylish/i, "✨"], [/practical/i, "🛠️"], [/put on top/i, "📚"],
  [/over- \(overeat|overdo/i, "🔺"], [/rude|impolite/i, "😤"], [/^polite$/i, "🙇"],
  [/frequent, often/i, "🔁"], [/lately|these days/i, "📅"],
  [/frustrating|annoying/i, "😤"], [/no energy/i, "😩"],
  [/nothing to be done/i, "🤷"], [/there may be|i wonder/i, "🤔"],
  [/necessary|if .*needed/i, "❗"], [/acceptance|consent|understood/i, "👍"],
  [/convey a message/i, "📨"], [/keep on|continue/i, "▶️"], [/way of doing/i, "🛠️"],
  [/^below|below x/i, "⬇️"], [/^above|above x/i, "⬆️"], [/^low$/i, "⬇️"],
  [/more and more|less and less/i, "📈"], [/^later$/i, "⏭️"],
  [/to this extent|how would it be|if you did that/i, "📏"], [/\(doing\) how/i, "❓"],
  [/after verb|while x-ing|in the middle of/i, "⏳"],
  [/young man/i, "👨"], [/young woman/i, "👩"], [/^name$/i, "🏷️"], [/^portion$/i, "📊"],
  [/point, dot/i, "🔸"], [/related to x|^y related/i, "🔗"], [/among x|among three/i, "🔢"],
  [/u-m-m|isn.t it\?|being this|have you decided|it.s \[noun\]/i, "💬"],
  [/who is it that/i, "❓"],

  // places and buildings
  [/mount fuji/i, "🗻"], [/\batm\b/i, "🏧"], [/cafeteria|dining hall/i, "🍽️"],
  [/karaoke/i, "🎤"], [/\bpool\b/i, "🏊"], [/marathon/i, "🏃"],
  [/library/i, "📚"], [/hospital|clinic/i, "🏥"], [/station\b/i, "🚉"],
  [/airport/i, "✈️"], [/hotel|inn\b/i, "🏨"], [/temple|shrine/i, "⛩️"],
  [/bank\b/i, "🏦"], [/post office/i, "📮"], [/supermarket|grocery/i, "🛒"],
  [/restaurant/i, "🍴"], [/school|campus|university|college/i, "🏫"],
  [/office|company/i, "🏢"], [/park\b/i, "🌳"], [/museum/i, "🏛️"],
  [/store|shop\b/i, "🏪"], [/room\b/i, "🚪"], [/house|home\b/i, "🏠"],
  [/city|town/i, "🏙️"], [/country|nation/i, "🌏"], [/mountain/i, "⛰️"],
  [/\bsea\b|ocean|beach/i, "🌊"], [/river/i, "🏞️"], [/road|street/i, "🛣️"],

  // people
  [/daughter/i, "👧"], [/\bson\b/i, "👦"], [/\bboy\b/i, "👦"], [/\bgirl\b/i, "👧"],
  [/brother|sibling/i, "👬"], [/sister/i, "👭"], [/mother|mom\b/i, "👩"],
  [/father|dad\b/i, "👨"], [/grandmother|grandma/i, "👵"], [/grandfather|grandpa/i, "👴"],
  [/\bwife\b/i, "👩"], [/husband/i, "👨"], [/\bbaby\b|infant/i, "👶"],
  [/adult\b/i, "🧑"], [/child(ren)?\b/i, "🧒"], [/friend/i, "🧑‍🤝‍🧑"],
  [/senior\b|junior\b/i, "🎓"], [/acquaintance/i, "🤝"], [/teacher|professor/i, "🧑‍🏫"],
  [/student|pupil/i, "🧑‍🎓"], [/doctor\b/i, "🧑‍⚕️"], [/family/i, "👨‍👩‍👧"],
  [/neighbou?r/i, "🏘️"], [/guest|visitor|customer/i, "🙇"], [/\bperson\b|people/i, "🧑"],

  // feelings and states
  [/feeling|sensation|mood/i, "💭"], [/grateful|thankful/i, "🙏"],
  [/happy|glad|delight|pleasure|enjoy/i, "😊"], [/sad\b|sorrow|lonely/i, "😢"],
  [/angry|anger|mad\b/i, "😠"], [/tough|painful|bitter|severe|intense|hard\b/i, "😣"],
  [/tired|exhaust|sleepy/i, "😴"], [/worried|anxious|nervous/i, "😰"],
  [/surprise/i, "😲"], [/embarrass|shy\b/i, "😳"], [/scary|afraid|fear/i, "😨"],
  [/\bfun\b|interesting|amusing/i, "😄"], [/boring|dull/i, "😑"],
  [/healthy|energetic|well\b|fine\b/i, "💪"], [/\bsick\b|ill\b|illness/i, "🤒"],
  [/\bbusy\b/i, "🏃"], [/free time|leisure/i, "🛋️"],

  // properties
  [/spacious|wide\b|broad/i, "↔️"], [/narrow|confined|cramped/i, "🤏"],
  [/\bdark\b/i, "🌑"], [/bright|light\b/i, "💡"],
  [/\bhot\b|warm\b/i, "🔥"], [/cold\b|chilly/i, "🥶"], [/cool\b/i, "❄️"],
  [/\bbig\b|large\b|huge/i, "🔵"], [/\bsmall\b|tiny|little\b/i, "🔹"],
  [/\bnew\b/i, "✨"], [/\bold\b/i, "🕰️"], [/\bfast\b|quick|early/i, "⚡"],
  [/\bslow\b|late\b/i, "🐢"], [/expensive|costly/i, "💸"], [/cheap|inexpensive/i, "🪙"],
  [/heavy\b/i, "🏋️"], [/\blight\b.*weight|lightweight/i, "🪶"],
  [/quiet|silent/i, "🤫"], [/noisy|loud/i, "📢"],
  [/clean\b|tidy/i, "🧼"], [/dirty|messy/i, "🧹"],
  [/beautiful|pretty|lovely/i, "🌸"], [/ugly/i, "🫤"],
  [/delicious|tasty/i, "😋"], [/convenient/i, "✅"], [/inconvenient/i, "🚫"],
  [/difficult|complicated/i, "🧩"], [/easy|simple|comfortable/i, "✅"],
  [/dangerous|risky/i, "⚠️"], [/safe\b/i, "🛡️"], [/important/i, "❗"],
  [/strange|weird|odd\b/i, "🤨"], [/famous|well-known/i, "🌟"],
  [/strong\b/i, "💪"], [/weak\b/i, "🫙"], [/similar|same\b/i, "🟰"],
  [/different|various/i, "🔀"], [/\bfull\b/i, "🈵"], [/empty/i, "🈳"],

  // food and drink
  [/rice\b/i, "🍚"], [/bread/i, "🍞"], [/meat\b|beef|pork/i, "🥩"],
  [/chicken/i, "🍗"], [/fish\b/i, "🐟"], [/vegetable/i, "🥬"], [/fruit/i, "🍎"],
  [/\begg\b/i, "🥚"], [/milk\b/i, "🥛"], [/coffee/i, "☕"], [/\btea\b/i, "🍵"],
  [/water\b/i, "💧"], [/\bbeer\b|alcohol|sake/i, "🍺"], [/juice/i, "🧃"],
  [/noodle|ramen|udon|soba/i, "🍜"], [/sweets|dessert|cake|candy/i, "🍰"],
  [/soup/i, "🍲"], [/\bmeal\b|food|cooking|cuisine/i, "🍱"],
  [/breakfast/i, "🌅"], [/lunch/i, "🍱"], [/dinner|supper/i, "🍽️"],

  // time
  [/spring\b/i, "🌸"], [/summer/i, "☀️"], [/autumn|\bfall\b/i, "🍁"], [/winter/i, "❄️"],
  [/morning/i, "🌅"], [/afternoon/i, "🌤️"], [/evening|night/i, "🌙"],
  [/yesterday|tomorrow|today|week|month|year|day\b|time\b|hour|minute/i, "📅"],
  [/weekend|holiday|vacation|break\b/i, "🏖️"],

  // things and actions
  [/\bcar\b|automobile/i, "🚗"], [/train\b/i, "🚆"], [/\bbus\b/i, "🚌"],
  [/bicycle|\bbike\b/i, "🚲"], [/\bplane\b|airplane/i, "✈️"],
  [/\bphone\b|telephone/i, "📱"], [/computer|\bpc\b/i, "💻"], [/television|\btv\b/i, "📺"],
  [/camera|photo|picture/i, "📷"], [/\bbook\b|novel|magazine/i, "📖"],
  [/newspaper/i, "📰"], [/\bletter\b|mail\b|email/i, "✉️"], [/\bmoney\b|\byen\b|price|cost/i, "💴"],
  [/\bmusic\b|\bsong\b|sing\b/i, "🎵"], [/movie|film\b/i, "🎬"], [/\bgame\b/i, "🎮"],
  [/sport|exercise/i, "⚽"], [/\bwork\b|\bjob\b/i, "💼"], [/study|learn/i, "📝"],
  [/clothes|shirt|wear\b/i, "👕"], [/\bshoe/i, "👟"], [/\bbag\b/i, "👜"],
  [/weather|rain\b/i, "🌧️"], [/\bsnow\b/i, "🌨️"], [/\bwind\b/i, "💨"],
  [/\bsky\b|cloud/i, "☁️"], [/\bsun\b/i, "☀️"], [/\bflower\b/i, "🌷"],
  [/\btree\b|plant\b/i, "🌳"], [/\bdog\b/i, "🐕"], [/\bcat\b/i, "🐈"], [/animal/i, "🐾"],
  [/\btalk\b|speak|conversation|say\b|tell\b/i, "💬"], [/listen|hear\b/i, "👂"],
  [/\bsee\b|look\b|watch\b/i, "👀"], [/\bread\b/i, "📖"], [/\bwrite\b/i, "✍️"],
  [/\bgo\b|come\b|travel|trip\b/i, "🚶"], [/\beat\b/i, "🍴"], [/\bdrink\b/i, "🥤"],
  [/\bsleep\b/i, "😴"], [/\bbuy\b|shopping|sell\b/i, "🛍️"], [/\bmake\b|build|create/i, "🔨"],
  [/\bgive\b|receive|present\b|gift/i, "🎁"], [/\bhelp\b|assist/i, "🤝"],
  [/\bmeet\b|meeting/i, "🤝"], [/\bwait\b/i, "⏳"], [/\bthink\b|opinion/i, "🤔"],
  [/remember|forget/i, "🧠"], [/\buse\b/i, "🛠️"], [/\bopen\b|close\b/i, "🚪"],
  [/\bstart\b|begin/i, "▶️"], [/\bend\b|finish/i, "🏁"],
  [/language|grammar|word\b|vocabulary/i, "🗣️"], [/question|ask\b/i, "❓"],
  [/answer|reply/i, "💡"], [/\btest\b|exam/i, "📝"], [/homework|assignment/i, "📓"],

  // discourse
  [/^yes\b|informal.*yes/i, "⭕"], [/^no\b|informal.*no/i, "❌"],
  [/aside|apart from that|more importantly|by the way/i, "↪️"],
  [/probably|maybe|perhaps/i, "🤷"], [/of course|certainly|definitely/i, "💯"],
  [/because|therefore|so that/i, "➡️"], [/but\b|however/i, "↩️"],
];

/* Last resort by grammatical class. Never a book. */
const BY_KIND = { katakana: "🔤", kana: "🔤", kanji: "🈁", mixed: "🈁" };

export function emojiFor(meaning, kind) {
  const m = String(meaning || "");
  for (const [re, e] of RULES) if (re.test(m)) return e;
  return BY_KIND[kind] || "🈁";
}

function main() {
  const write = process.argv.includes("--write");
  let src = fs.readFileSync(FILE, "utf8");
  const i = src.indexOf("const SEED = [");
  const j = src.indexOf("\n];", i);
  const head = src.slice(0, i), body = src.slice(i, j), tail = src.slice(j);

  let matched = 0, fallback = 0, untouched = 0;
  const samples = [];
  const out = body.split("\n").map((line) => {
    if (!/\{ term:/.test(line)) return line;
    if (/emoji: "[^"]+"/.test(line)) { untouched++; return line; }
    const meaning = (line.match(/meaning: "([^"]*)"/) || [])[1] || "";
    const kind = (line.match(/kind: "([^"]*)"/) || [])[1] || "";
    const term = (line.match(/term: "([^"]*)"/) || [])[1] || "";
    const e = emojiFor(meaning, kind);
    const isFallback = Object.values(BY_KIND).includes(e) && !RULES.some(([re]) => re.test(meaning));
    if (isFallback) fallback++; else matched++;
    if (samples.length < 24 && !isFallback) samples.push(`  ${term.padEnd(12)} ${e}  ${meaning.slice(0, 40)}`);
    /* Insert the field where the others sit, so the file stays uniform. */
    if (/emoji: ""/.test(line)) return line.replace(/emoji: ""/, `emoji: "${e}"`);
    return line.replace(/, lesson:/, `, emoji: "${e}", lesson:`);
  }).join("\n");

  console.log(`already had one : ${untouched}`);
  console.log(`matched by meaning: ${matched}`);
  console.log(`fell back to class: ${fallback}`);
  console.log("\nsamples:");
  console.log(samples.join("\n"));

  if (write) {
    fs.writeFileSync(FILE, head + out + tail);
    console.log("\nwritten.");
  } else {
    console.log("\n(dry run — pass --write to apply)");
  }
}

if (process.argv[1] && process.argv[1].endsWith("assign-emoji2.mjs")) main();
