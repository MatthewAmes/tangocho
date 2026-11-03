/* ── Kotoba Quest: the story ──
   Shared text and Chapter 1 live here; each later chapter has its own file (quest-ch2.js),
   joined up in CHAPTERS at the bottom. Flags, scenes and clues share one namespace, so a later
   chapter prefixes its own (c2_...).

   A mystery you solve by understanding people, played in Japanese (Matthew, 2026-11-03: "an
   earnest game thats purely japanese", "real dialogue and conversations in context").

   Written for someone finishing first-year Japanese, using Act 7's words on purpose — 変,
   どうして, 集まる, 迷惑をかける, 暖かくて気持ちがいい, 住めば都 — where they mean something.

   Markup: {寒い|さむい} is a word you can tap, with furigana. {寒く|さむく|寒い} is a form of
   寒い; {ふるえて||ふるえる} is the same with no kanji to read. @ is the player's name.
   Every line carries its English in `e`, shown only when asked for.

   A scene is a list of nodes run in order:
     { s, j, e }            someone says something (no s: the narrator)
     { name: true }         ask the player's name
     { choose: [{ j, e, then, right, retry }] }   then runs next; retry comes back and asks again
     { present: { right, wrong } }   show a clue from the notebook; wrong lines, then ask again
     { clue: id } { flag: id } { heal: true }
     { join: species, j, e }   a creature joins you, unless it already has
     { fight: { team, win, lose, flee } }   win/lose/flee name the scene that follows
   tools/test-quest-story.mjs checks all of it: every word glossed, every reference real, and
   the whole mystery solvable from the first step. */
import { CH2 } from "./quest-ch2.js";

const CH1_TITLE = { j: "{消えた|きえた|消える} {春|はる}", e: "The Vanished Spring" };
const CH1_NUMBER = { j: "{第一章|だいいっしょう}", e: "Chapter 1" };

/* Who speaks, and which picture goes with them. `sprite` looks in the creature art. */
const CH1_CAST = {
  kotodama: { name: "コトダマ", sprite: "kotodama" },
  samuneko: { name: "サムネコ", sprite: "samuneko" },
  hana: { name: "ハナ", portrait: "hana" },
  mika: { name: "ミカ", portrait: "mika" },
  ken: { name: "ケン", portrait: "ken" },
  aya: { name: "アヤ", portrait: "aya" },
  taro: { name: "タロウ", portrait: "taro" },
};

const CH1_CLUES = {
  c_rumor: { j: "ケンさんの {話|はなし}：{犯人|はんにん}は サムネコだ。", e: "What Ken says: the culprit is Samuneko." },
  c_cat: { j: "サムネコも {寒くて|さむくて|寒い} {ふるえて||ふるえる} いる。{犯人|はんにん}じゃ ないと {思う|おもう}。", e: "Samuneko is cold and shivering too. I don't think it's the culprit." },
  c_wind: { j: "{冷たい|つめたい} {風|かぜ}は {北|きた}の {方|ほう}から {来る|くる}。", e: "The cold wind comes from the north." },
  c_soup: { j: "{寒く|さむく|寒い} なってから、{売店|ばいてん}の コーヒーが よく {売れて|うれて|売れる} いる。{百円|ひゃくえん}から {五百円|ごひゃくえん}に なった。", e: "Since it turned cold, the kiosk's coffee has been selling well. It went from 100 yen to 500 yen." },
  c_night: { j: "{昨日|きのう}の {夜|よる} {九時半|くじはん}に、{売店|ばいてん}が {明るかった|あかるかった|明るい}。{売店|ばいてん}は {五時|ごじ}までだ。", e: "At 9:30 last night, the kiosk was lit up. The kiosk is only open until 5." },
  c_taro: { j: "タロウさんの {話|はなし}：{夜|よる}は ずっと {家|うち}に いた。", e: "What Taro says: he was at home all night." },
  c_machine: { j: "{売店|ばいてん}の {裏|うら}に {大きい|おおきい} {冷房|れいぼう}が ある。{冷たい|つめたい} {風|かぜ}が {出て|でて|出る} いる。", e: "Behind the kiosk there's a huge air conditioner. Cold wind is coming out of it." },
};
/* Kotodama's six lost words: one comes back at the end of each chapter. */
export const LOST_WORDS = [
  { flag: "word1", j: "{住めば都|すめばみやこ}", e: "Home is where you make it" },
  { flag: "word2", j: "{類は友を呼ぶ|るいはともをよぶ}", e: "Birds of a feather flock together" },
];
export const LOST_WORD_COUNT = 6;

const CH1_CASE_CLUES = ["c_wind", "c_soup", "c_night", "c_taro", "c_machine"];

/* What to do next, in the notebook and under the map: the first whose `until` isn't done. */
const CH1_GOALS = [
  { until: "ready", j: "みんなに {話|はなし}を {聞きましょう|ききましょう|聞く}。", e: "Let's ask everyone what they know." },
  { until: "solved", j: "ハナさんの {所|ところ}へ {行きましょう|いきましょう|行く}。みんなを {集めます|あつめます|集める}。", e: "Let's go to Hana. We'll gather everyone." },
  { until: "never", j: "{東|ひがし}の {道|みち}が {開きました|あきました|開く}。{町|まち}へ {行きましょう|いきましょう|行く}！", e: "The road east is open. Let's go to town!" },
];

/* Who stands where on Campus Meadows. `talk`: the first entry whose need/not fit is what they say. */
const CH1_PEOPLE = [
  { id: "ken", x: 4, y: 6, walker: "ken", talk: [
    { need: ["solved"], scene: "ken_end" },
    { need: ["c_cat", "c_rumor"], not: ["ken_sorry"], scene: "ken_sorry" },
    { need: ["c_rumor"], scene: "ken_again" },
    { scene: "ken_first" },
  ] },
  { id: "samuneko", x: 8, y: 7, sprite: "samuneko", talk: [
    { need: ["c_cat"], scene: "cat_again" },
    { scene: "cat_first" },
  ] },
  { id: "mika", x: 8, y: 4, walker: "mika", talk: [
    { need: ["solved"], scene: "mika_end" },
    { need: ["c_soup"], scene: "mika_again" },
    { scene: "mika_first" },
  ] },
  { id: "aya", x: 14, y: 3, walker: "aya", talk: [
    { need: ["solved"], scene: "aya_end" },
    { need: ["c_night"], scene: "aya_again" },
    { scene: "aya_first" },
  ] },
  { id: "hana_after", x: 14, y: 9, walker: "hana", show: ["solved"], talk: [{ scene: "hana_end" }] },
  { id: "machine", x: 13, y: 1, object: "machine", hide: ["solved"], talk: [
    { need: ["c_machine"], scene: "machine_again" },
    { scene: "machine_first" },
  ] },
];

/* The things on the map itself. */
const CH1_PLACES = {
  guardian: [
    { need: ["accused"], scene: "boss_again" },
    { need: ["ready"], scene: "finale" },
    { need: ["c_wind"], scene: "hana_again" },
    { scene: "hana_first" },
  ],
  sign: [{ scene: "sign" }],
  shrine: [{ scene: "shrine" }],
  locked: [{ scene: "gate_closed" }],
};
const CH1_BUILDINGS = [
  { x: 12, y: 2, w: 1, h: 1, talk: [
    { need: ["solved"], scene: "taro_end" },
    { need: ["c_taro"], scene: "taro_again" },
    { scene: "taro_first" },
  ] },
];
export const LOST_SCENE = "woke_up";

const K = "kotodama";

const CH1_SCENES = {
  ready: [
    { s: K, j: "@さん、{手がかり|てがかり}が {全部|ぜんぶ} {集まりました|あつまりました|集まる}！", e: "@, we've got all the clues!" },
    { s: K, j: "ハナさんの {所|ところ}へ {行きましょう|いきましょう|行く}！", e: "Let's go to Hana!" },
  ],
  intro: [
    { j: "{四月|しがつ}です。", e: "It's April." },
    { j: "ここは ことば{大学|だいがく}の {キャンパス}です。", e: "This is the campus of Kotoba University." },
    { j: "{四月|しがつ}なのに、{今日|きょう}は とても {寒い|さむい}です。", e: "It's April, and yet today it's really cold." },
    { s: K, j: "あっ、{新しい|あたらしい} {人|ひと}ですね！", e: "Oh, you're someone new!" },
    { s: K, j: "はじめまして！ ぼくは コトダマです。{言葉|ことば}の {精霊|せいれい}です。", e: "Nice to meet you! I'm Kotodama. I'm a spirit of words." },
    { s: K, j: "お{名前|なまえ}は {何|なん}ですか。", e: "What's your name?" },
    { name: true },
    { s: K, j: "@さんですね。どうぞ よろしく！", e: "So you're @. Pleased to meet you!" },
    { s: K, j: "@さんは {留学生|りゅうがくせい}ですか。", e: "Are you an exchange student?" },
    { choose: [
      { j: "はい、{留学生|りゅうがくせい}です。", e: "Yes, I'm an exchange student.", then: [
        { s: K, j: "やっぱり！ {日本語|にほんご}が {上手|じょうず}ですね。", e: "I knew it! Your Japanese is good." },
      ] },
      { j: "いいえ、{猫|ねこ}です。", e: "No, I'm a cat.", then: [
        { s: K, j: "ええっ？ {本当|ほんとう}ですか。……{変|へん}な {人|ひと}ですね。", e: "Whaaat? Really? ...You're a strange person." },
      ] },
    ] },
    { s: K, j: "ところで、@さん。{寒く|さむく|寒い} ないですか。", e: "By the way, @. Aren't you cold?" },
    { choose: [
      { j: "はい、{寒い|さむい}です。", e: "Yes, I'm cold.", then: [{ s: K, j: "ですよね。", e: "Right?" }] },
      { j: "いいえ、{暑い|あつい}です。", e: "No, I'm hot.", then: [{ s: K, j: "まさか！", e: "No way!" }] },
    ] },
    { s: K, j: "{先週|せんしゅう}は {暖かかった|あたたかかった|暖かい}です。でも、{今週|こんしゅう}は {急に|きゅうに} {寒く|さむく|寒い} なりました。", e: "Last week it was warm. But this week it suddenly got cold." },
    { s: K, j: "{変|へん}ですね。どうしてでしょう？", e: "That's strange, isn't it? I wonder why." },
    { s: K, j: "じつは、ぼくも {困って|こまって|困る} います。", e: "Actually, I'm in trouble too." },
    { s: K, j: "{大切|たいせつ}な {言葉|ことば}を {六つ|むっつ} {忘れました|わすれました|忘れる}。", e: "I've forgotten six important words." },
    { s: K, j: "{言葉|ことば}の {精霊|せいれい}なのに……。どうしてでしょう？", e: "And I'm a spirit of words... I wonder why." },
    { s: K, j: "@さん、{手伝って|てつだって|手伝う} くれますか。", e: "@, will you help me?" },
    { choose: [
      { j: "はい、いいですよ。", e: "Sure, okay.", then: [{ s: K, j: "ありがとう！ うれしいです！", e: "Thank you! I'm so happy!" }] },
      { j: "いやです。", e: "No way.", then: [{ s: K, j: "ええっ！ ……でも、ぼくは {一緒に|いっしょに} {行きます|いきます|行く}よ。", e: "What?! ...Well, I'm coming with you anyway." }] },
    ] },
    { s: K, j: "まず、この {寒さ|さむさ}です。みんな {困って|こまって|困る} います。{一緒に|いっしょに} {調べましょう|しらべましょう|調べる}！", e: "First, this cold. Everyone's having trouble. Let's investigate together!" },
    { s: K, j: "{人|ひと}に {話|はなし}を {聞きましょう|ききましょう|聞く}。わかった ことは ノートに {書きます|かきます|書く}。", e: "Let's ask people what they know. I'll write what we find out in the notebook." },
    { s: K, j: "{草|くさ}の {中|なか}には {生き物|いきもの}が います。{気をつけて|きをつけて|気をつける}！", e: "There are creatures in the grass. Be careful!" },
    { flag: "intro" },
  ],

  ken_first: [
    { s: "ken", j: "あ、こんにちは。ぼくは ケンです。{一年生|いちねんせい}です。", e: "Oh, hello. I'm Ken. I'm a first-year." },
    { s: "ken", j: "{今朝|けさ}、{試験|しけん}に {遅れました|おくれました|遅れる}……。", e: "This morning I was late for a test..." },
    { s: K, j: "どうして {遅れました|おくれました|遅れる}か。", e: "Why were you late?" },
    { s: "ken", j: "{道|みち}が {凍って|こおって|凍る} いて、{危なかった|あぶなかった|危ない}んです。{走れません|はしれません|走る}でした。", e: "The road was frozen, and it was dangerous. I couldn't run." },
    { s: "ken", j: "{先生|せんせい}は とても {厳しい|きびしい}です。つらいです……。", e: "The teacher is really strict. It's rough..." },
    { s: "ken", j: "でも、{犯人|はんにん}を {知って|しって|知る} いますよ。", e: "But I know who the culprit is." },
    { s: K, j: "えっ、{犯人|はんにん}？ だれですか。", e: "What, the culprit? Who is it?" },
    { s: "ken", j: "サムネコです！ {白い|しろい} {猫|ねこ}の {生き物|いきもの}です。", e: "Samuneko! It's a white cat creature." },
    { s: "ken", j: "{寒い|さむい}のは サムネコの せいだと {思います|おもいます|思う}！", e: "I think the cold is Samuneko's fault!" },
    { s: "ken", j: "{池|いけ}の {近く|ちかく}の {草|くさ}に いますよ。", e: "It's in the grass near the pond." },
    { clue: "c_rumor" },
  ],
  ken_again: [
    { s: "ken", j: "サムネコは {池|いけ}の {近く|ちかく}に います。{気をつけて|きをつけて|気をつける} くださいね！", e: "Samuneko is near the pond. Be careful!" },
  ],
  ken_sorry: [
    { s: K, j: "ケンさん、サムネコも {寒くて|さむくて|寒い} {ふるえて||ふるえる} いましたよ。", e: "Ken, Samuneko was cold and shivering too." },
    { s: "ken", j: "えっ、{本当|ほんとう}ですか。", e: "What, really?" },
    { s: "ken", j: "そうか……。サムネコに {悪い|わるい} ことを {言いました|いいました|言う}。", e: "I see... I said a bad thing about Samuneko." },
    { flag: "ken_sorry" },
  ],
  ken_end: [
    { s: "ken", j: "{来週|らいしゅう}、もう{一度|いちど} {試験|しけん}を {受けます|うけます|受ける}！", e: "Next week I'm taking the test again!" },
    { s: "ken", j: "もう {遅れません|おくれません|遅れる}よ！", e: "I won't be late this time!" },
  ],

  cat_first: [
    { j: "{白い|しろい} {猫|ねこ}が います。{ふるえて||ふるえる} います。", e: "There's a white cat. It's shivering." },
    { s: "samuneko", j: "ニャ……ニャ……！", e: "Nya... nya...!" },
    { s: K, j: "{怒って|おこって|怒る} いますね！ {危ない|あぶない}！", e: "It's angry! Look out!" },
    { fight: { team: [["samuneko", 3]], win: "cat_after", caught: "cat_after", flee: "cat_fled", lose: "woke_up" } },
  ],
  cat_fled: [
    { s: K, j: "{逃げました|にげました|逃げる}ね。でも、もう{一度|いちど} {話|はなし}を {聞きたい|ききたい|聞く}です。", e: "We got away. But I'd like to hear from it again." },
  ],
  cat_after: [
    { s: "samuneko", j: "さ……{寒い|さむい}……ニャ……。", e: "C... cold... nya..." },
    { s: K, j: "あれ？ {言葉|ことば}が わかります。", e: "Huh? I can understand it." },
    { s: K, j: "あなたも {寒い|さむい}んですか。", e: "You're cold too?" },
    { s: "samuneko", j: "うん……{毎朝|まいあさ} {寒い|さむい}……{悲しい|かなしい}……。", e: "Yeah... it's cold every morning... so sad..." },
    { s: K, j: "@さん、どう {思います|おもいます|思う}か。サムネコが {犯人|はんにん}ですか。", e: "@, what do you think? Is Samuneko the culprit?" },
    { choose: [
      { j: "いいえ、{違う|ちがう}と {思います|おもいます|思う}。", e: "No, I don't think so.", then: [
        { s: K, j: "ぼくも そう {思います|おもいます|思う}。{犯人|はんにん}なら、{自分|じぶん}も {寒い|さむい}のは おかしいです。", e: "I think so too. If it were the culprit, it'd be odd for it to be cold too." },
      ] },
      { j: "はい、{犯人|はんにん}です！", e: "Yes, it's the culprit!", then: [
        { s: "samuneko", j: "ニャ……？", e: "Nya...?" },
        { s: K, j: "でも、こんなに {ふるえて||ふるえる} いますよ。{犯人|はんにん}じゃ ないと {思います|おもいます|思う}。", e: "But look how hard it's shivering. I don't think it's the culprit." },
      ] },
    ] },
    { clue: "c_cat" },
  ],
  cat_again: [
    { s: "samuneko", j: "ニャ……{寒い|さむい}……。", e: "Nya... cold..." },
  ],

  mika_first: [
    { s: "mika", j: "いらっしゃい！ {食堂|しょくどう}の ミカです。", e: "Welcome! I'm Mika from the cafeteria." },
    { s: "mika", j: "{温かい|あたたかい|暖かい} スープは いかがですか。", e: "How about some hot soup?" },
    { choose: [
      { j: "はい、ください。", e: "Yes, please.", then: [
        { heal: true },
        { s: "mika", j: "はい、どうぞ。{元気|げんき}に なりますよ。", e: "Here you go. It'll perk you right up." },
        { j: "みんな {元気|げんき}に なりました！", e: "Everyone feels better!" },
      ] },
      { j: "いいえ、{結構|けっこう}です。", e: "No, thank you.", then: [
        { s: "mika", j: "そうですか……。", e: "I see..." },
      ] },
    ] },
    { s: "mika", j: "{最近|さいきん}、{食堂|しょくどう}に {人|ひと}が {来ません|きません|来る}。", e: "Lately people aren't coming to the cafeteria." },
    { s: K, j: "どうしてですか。{寒い|さむい}から、スープは {人気|にんき}でしょう？", e: "Why's that? It's cold, so soup must be popular, right?" },
    { s: "mika", j: "みんな {売店|ばいてん}で コーヒーを {買います|かいます|買う}。", e: "Everyone buys coffee at the kiosk." },
    { s: "mika", j: "{先週|せんしゅう}は {百円|ひゃくえん}でした。{今週|こんしゅう}は {五百円|ごひゃくえん}です！", e: "Last week it was 100 yen. This week it's 500 yen!" },
    { s: K, j: "{五百円|ごひゃくえん}？！ {高い|たかい}ですね！", e: "500 yen?! That's expensive!" },
    { s: "mika", j: "でも、{寒い|さむい}から {売れます|うれます|売れる}。おかしいですね。", e: "But since it's cold, it sells. It's strange, isn't it?" },
    { clue: "c_soup" },
  ],
  mika_again: [
    { s: "mika", j: "スープは いかがですか。", e: "How about some soup?" },
    { choose: [
      { j: "はい、ください。", e: "Yes, please.", then: [
        { heal: true },
        { j: "みんな {元気|げんき}に なりました！", e: "Everyone feels better!" },
      ] },
      { j: "いいえ、{結構|けっこう}です。", e: "No, thank you.", then: [{ s: "mika", j: "また {来て|きて|来る} くださいね。", e: "Come again, okay?" }] },
    ] },
  ],
  mika_end: [
    { s: "mika", j: "{食堂|しょくどう}に {人|ひと}が {戻りました|もどりました|戻る}！ うれしいです。", e: "People came back to the cafeteria! I'm so happy." },
    { heal: true },
    { s: "mika", j: "これは ありがとうの スープです。", e: "This soup is my thank-you." },
  ],

  aya_first: [
    { s: "aya", j: "……{静か|しずか}に して ください。{勉強|べんきょう}して います。", e: "...Please be quiet. I'm studying." },
    { s: "aya", j: "あ、ごめんなさい。{三年生|さんねんせい}の アヤです。", e: "Oh, sorry. I'm Aya, a third-year." },
    { s: K, j: "アヤ{先輩|せんぱい}ですね。ここで {勉強|べんきょう}するんですか。{寒い|さむい}のに。", e: "So you're my senior, Aya. You study here? Even though it's cold?" },
    { s: "aya", j: "{毎晩|まいばん} ここです。{静か|しずか}で {好き|すき}なんです。", e: "Here every night. It's quiet, and I like that." },
    { s: K, j: "{夜|よる}、{何|なに}か {変|へん}な ことは ありませんでしたか。", e: "Did anything strange happen at night?" },
    { s: "aya", j: "{変|へん}な こと……ああ、ありました。", e: "Something strange... Ah, yes, there was." },
    { s: "aya", j: "{昨日|きのう}の {夜|よる} {九時半|くじはん}に、{売店|ばいてん}が {明るかった|あかるかった|明るい}です。", e: "At 9:30 last night, the kiosk was lit up." },
    { s: "aya", j: "おかしいですね。{売店|ばいてん}は {五時|ごじ}までですよ。", e: "Odd, isn't it? The kiosk is only open until 5." },
    { clue: "c_night" },
  ],
  aya_again: [
    { s: "aya", j: "{九時半|くじはん}に {売店|ばいてん}が {明るかった|あかるかった|明るい}です。{本当|ほんとう}ですよ。", e: "The kiosk was lit up at 9:30. It's true." },
  ],
  aya_end: [
    { s: "aya", j: "{暖かくて|あたたかくて|暖かい}、{勉強|べんきょう}しやすいです。ありがとう、@さん。", e: "It's warm and easy to study now. Thanks, @." },
  ],

  taro_first: [
    { j: "ここは {売店|ばいてん}です。", e: "This is the kiosk." },
    { s: "taro", j: "いらっしゃいませ！ {売店|ばいてん}の タロウです！", e: "Welcome! I'm Taro, I run the kiosk!" },
    { s: "taro", j: "{寒い|さむい}ですね！ {温かい|あたたかい|暖かい} コーヒーは いかがですか。{五百円|ごひゃくえん}です！", e: "Cold, isn't it! How about a hot coffee? 500 yen!" },
    { choose: [
      { j: "{高い|たかい}です！", e: "That's expensive!", then: [
        { s: "taro", j: "{寒い|さむい}から、みんな {買います|かいます|買う}よ。ハハハ！", e: "It's cold, so everybody buys it. Ha ha ha!" },
      ] },
      { j: "いりません。", e: "I don't need any.", then: [
        { s: "taro", j: "そうですか。{残念|ざんねん}です。", e: "I see. What a shame." },
      ] },
    ] },
    { s: "taro", j: "{最近|さいきん}、よく {売れます|うれます|売れる}。とても うれしいです！", e: "It's been selling so well lately. I'm very happy!" },
    { s: K, j: "{夜|よる}も {売店|ばいてん}に いますか。", e: "Are you at the kiosk at night too?" },
    { s: "taro", j: "いいえ、{五時|ごじ}に {閉めます|しめます|閉める}。{夜|よる}は ずっと {家|うち}に いますよ。", e: "No, I close at 5. I'm at home all night." },
    { s: K, j: "{昨日|きのう}の {夜|よる}も？", e: "Last night too?" },
    { s: "taro", j: "はい、もちろん。", e: "Yes, of course." },
    { clue: "c_taro" },
    { s: K, j: "ところで、{売店|ばいてん}の {裏|うら}には {何|なに}が ありますか。", e: "By the way, what's behind the kiosk?" },
    { s: "taro", j: "えっ？！ な、{何|なに}も ありませんよ！ {裏|うら}に {行かないで|いかないで|行く} くださいね！", e: "Huh?! N-nothing's there! Please don't go around back!" },
  ],
  taro_again: [
    { s: "taro", j: "{裏|うら}に {行かないで|いかないで|行く} くださいね！ {危ない|あぶない}ですから！", e: "Don't go around back, okay? It's dangerous!" },
  ],
  taro_end: [
    { s: "taro", j: "コーヒーは {百円|ひゃくえん}です……。{本当|ほんとう}に すみませんでした。", e: "Coffee is 100 yen... I'm truly sorry." },
  ],

  machine_first: [
    { j: "{売店|ばいてん}の {裏|うら}です。{大きい|おおきい} {機械|きかい}が あります。", e: "This is behind the kiosk. There's a big machine." },
    { j: "ゴオオオ……！ {冷たい|つめたい} {風|かぜ}が {出て|でて|出る} います！", e: "Whoooosh...! Cold wind is blowing out of it!" },
    { s: K, j: "{寒い|さむい}！ これです！ これは {冷房|れいぼう}です！", e: "So cold! This is it! It's an air conditioner!" },
    { s: K, j: "こんなに {大きい|おおきい} {冷房|れいぼう}は {珍しい|めずらしい}です。", e: "An air conditioner this big is unusual." },
    { s: K, j: "だれの {冷房|れいぼう}でしょう？", e: "I wonder whose it is." },
    { clue: "c_machine" },
  ],
  machine_again: [
    { j: "ゴオオオ……。{冷たい|つめたい} {風|かぜ}が {出て|でて|出る} います。", e: "Whoooosh... Cold wind is blowing out." },
  ],

  hana_first: [
    { s: "hana", j: "こんにちは。ハナです。キャンパスの {木|き}や {花|はな}の {仕事|しごと}を して います。", e: "Hello. I'm Hana. I look after the campus's trees and flowers." },
    { s: "hana", j: "すみません。この {道|みち}は {今|いま} {通れません|とおれません|通る}。{凍って|こおって|凍る} いて {危ない|あぶない}です。", e: "Sorry. You can't get through on this road right now. It's frozen and dangerous." },
    { s: K, j: "ハナさん、いつ {寒い|さむい}ですか。", e: "Hana, when is it cold?" },
    { s: "hana", j: "{夜|よる}から {朝|あさ}までです。{昼|ひる}は {少し|すこし} {暖かい|あたたかい}です。", e: "From night until morning. In the daytime it's a little warm." },
    { s: "hana", j: "それに、{冷たい|つめたい} {風|かぜ}は いつも {北|きた}の {方|ほう}から {来ます|きます|来る}。", e: "What's more, the cold wind always comes from the north." },
    { s: "hana", j: "{花|はな}が かわいそうです。", e: "I feel so bad for the flowers." },
    { clue: "c_wind" },
    { s: K, j: "{北|きた}……。{北|きた}には {何|なに}が ありますか。", e: "The north... What's up north?" },
    { s: "hana", j: "{売店|ばいてん}が あります。{看板|かんばん}を {見て|みて|見る} ください。", e: "There's the kiosk. Take a look at the sign." },
  ],
  hana_again: [
    { s: "hana", j: "{何|なに}か わかりましたか。", e: "Have you found anything out?" },
    { s: K, j: "まだです。もっと {話|はなし}を {聞きましょう|ききましょう|聞く}。", e: "Not yet. Let's ask around some more." },
  ],

  finale: [
    { s: K, j: "@さん、もう {全部|ぜんぶ} わかったと {思います|おもいます|思う}！", e: "@, I think we've figured it all out!" },
    { s: K, j: "みんなを {集めましょう|あつめましょう|集める}！", e: "Let's gather everyone!" },
    { j: "ハナさんが みんなを {呼びました|よびました|呼ぶ}。", e: "Hana called everyone over." },
    { s: "hana", j: "みなさん、{集まりました|あつまりました|集まる}か。", e: "Is everyone here?" },
    { s: K, j: "@さんが {犯人|はんにん}を {見つけました|みつけました|見つける}。", e: "@ has found the culprit." },
    { s: K, j: "@さん、{犯人|はんにん}は だれですか。", e: "@, who is the culprit?" },
    { choose: [
      { j: "サムネコです。", e: "It's Samuneko.", retry: true, then: [
        { s: "ken", j: "それは ぼくも {思いました|おもいました|思う}。でも、サムネコも {寒くて|さむくて|寒い} {ふるえて||ふるえる} いましたよ。", e: "I thought so too. But Samuneko was cold and shivering as well." },
      ] },
      { j: "ミカさんです。", e: "It's Mika.", retry: true, then: [
        { s: "mika", j: "わたし？！ {食堂|しょくどう}に {人|ひと}が {来なくて|こなくて|来る} {困って|こまって|困る} いるんですよ！", e: "Me?! People aren't coming to the cafeteria, and it's a real problem for me!" },
      ] },
      { j: "アヤさんです。", e: "It's Aya.", retry: true, then: [
        { s: "aya", j: "わたしは ここで {勉強|べんきょう}して いただけです。", e: "All I did was study here." },
      ] },
      { j: "タロウさんです。", e: "It's Taro.", then: [
        { s: "taro", j: "ぼく？！ まさか！ ハハハ……。", e: "Me?! No way! Ha ha ha..." },
      ] },
    ] },
    { s: "taro", j: "{冷たい|つめたい} {風|かぜ}？ ぼくと {関係|かんけい}ありませんよ！ {風|かぜ}は どこから {来ます|きます|来る}か。", e: "Cold wind? That has nothing to do with me! Where's this wind coming from, anyway?" },
    { s: K, j: "@さん、ノートを {見せて|みせて|見せる} ください！", e: "@, show the notebook!" },
    { present: { right: "c_machine", wrong: [{ s: K, j: "うーん、{違う|ちがう}と {思います|おもいます|思う}。{風|かぜ}は どこから {来ます|きます|来る}か。", e: "Hmm, I don't think that's it. Where is the wind coming from?" }] } },
    { s: "hana", j: "{売店|ばいてん}の {裏|うら}に {冷房|れいぼう}が？！ {北|きた}の {風|かぜ}は それですね！", e: "An air conditioner behind the kiosk?! So that's the wind from the north!" },
    { s: "taro", j: "う……。でも、だれの {冷房|れいぼう}か わからないでしょう？", e: "Ugh... But you can't tell whose air conditioner it is, can you?" },
    { s: "taro", j: "ぼくは {夜|よる}、ずっと {家|うち}に いましたから！", e: "Because I was at home all night!" },
    { s: K, j: "それは {本当|ほんとう}ですか。@さん、どう {思います|おもいます|思う}か。", e: "Is that true? @, what do you think?" },
    { present: { right: "c_night", wrong: [{ s: K, j: "うーん、{違う|ちがう}と {思います|おもいます|思う}。{夜|よる}、タロウさんは どこに いましたか。", e: "Hmm, I don't think that's it. Where was Taro at night?" }] } },
    { s: "aya", j: "はい、{九時半|くじはん}に {売店|ばいてん}が {明るかった|あかるかった|明るい}です。{家|うち}に いませんでしたね。", e: "Yes, the kiosk was lit up at 9:30. You weren't at home, were you?" },
    { s: "taro", j: "そ、それは……！", e: "Th-that's..." },
    { s: "taro", j: "でも、どうして ぼくが キャンパスを {寒く|さむく|寒い} しますか！ {理由|りゆう}が ありません！", e: "But why would I make the campus cold? I have no reason!" },
    { present: { right: "c_soup", wrong: [{ s: K, j: "うーん、{違う|ちがう}と {思います|おもいます|思う}。{寒い|さむい}と、だれが うれしいですか。", e: "Hmm, I don't think that's it. Who's happy when it's cold?" }] } },
    { s: "mika", j: "{寒い|さむい}と コーヒーが {売れます|うれます|売れる}。{百円|ひゃくえん}から {五百円|ごひゃくえん}に しましたね！", e: "When it's cold, coffee sells. You went from 100 yen to 500 yen!" },
    { s: "taro", j: "……。", e: "..." },
    { s: "taro", j: "……そうです。ぼくです。", e: "...That's right. It was me." },
    { s: "taro", j: "でも、もう {止まりません|とまりません|止まる}！ {冷房|れいぼう}に {精霊|せいれい}が {生まれた|うまれた|生まれる}んです！", e: "But it won't stop now! A spirit was born inside the air conditioner!" },
    { flag: "accused" },
    { heal: true },
    { s: "mika", j: "@さん、{温かい|あたたかい|暖かい} スープです！ {元気|げんき}を {出して|だして|出す}！", e: "@, here's some hot soup! Hang in there!" },
    { j: "みんな {元気|げんき}に なりました！", e: "Everyone feels better!" },
    { s: K, j: "{冷たい|つめたい} {生き物|いきもの}には {熱い|あつい} {技|わざ}が よく {効きます|ききます|効く}！", e: "Hot moves work well on cold creatures!" },
    { fight: { team: [["reibouzu", 6]], boss: true, win: "solved", lose: "woke_up" } },
  ],
  boss_again: [
    { s: "taro", j: "{止まりません|とまりません|止まる}！ {助けて|たすけて|助ける} ください！", e: "It won't stop! Please help!" },
    { s: K, j: "{冷たい|つめたい} {生き物|いきもの}には {熱い|あつい} {技|わざ}です。{行きましょう|いきましょう|行く}！", e: "Cold creatures hate hot moves. Let's go!" },
    { fight: { team: [["reibouzu", 6]], boss: true, win: "solved", lose: "woke_up" } },
  ],
  solved: [
    { j: "{冷房|れいぼう}が {止まりました|とまりました|止まる}。", e: "The air conditioner stopped." },
    { s: "taro", j: "すみませんでした。みなさんに ご{迷惑|めいわく}を かけました。", e: "I'm sorry. I caused you all a lot of trouble." },
    { s: "taro", j: "{売店|ばいてん}に お{金|かね}が なかったんです。もうすぐ {閉まる|しまる}と {言われました|いわれました|言う}。", e: "The kiosk had no money. I was told it would close soon." },
    { s: "mika", j: "そうだったんですか……。", e: "So that's what it was..." },
    { s: "mika", j: "コーヒーは {百円|ひゃくえん}に {戻して|もどして|戻す} くださいね。{一緒に|いっしょに} がんばりましょう。", e: "Put the coffee back to 100 yen, okay? Let's work hard together." },
    { s: "taro", j: "はい……。ありがとうございます。", e: "Yes... Thank you." },
    { s: K, j: "タロウさん、あの {大きい|おおきい} {冷房|れいぼう}は どこで {買いました|かいました|買う}か。", e: "Taro, where did you buy that huge air conditioner?" },
    { s: "taro", j: "{買って|かって|買う} いません。{黒い|くろい} コートの {人|ひと}が くれました。", e: "I didn't buy it. A person in a black coat gave it to me." },
    { s: "taro", j: "「{寒く|さむく|寒い} すると、よく {売れます|うれます|売れる}よ」と {言いました|いいました|言う}。", e: "They said, \"If you make it cold, you'll sell a lot.\"" },
    { s: K, j: "{黒い|くろい} コートの {人|ひと}……？ だれですか。", e: "A person in a black coat...? Who was it?" },
    { s: "taro", j: "わかりません。{名前|なまえ}は {言いませんでした|いいませんでした|言う}。", e: "I don't know. They didn't give a name." },
    { j: "キャンパスが {暖かく|あたたかく|暖かい} なりました。", e: "The campus grew warm." },
    { s: "ken", j: "{暖かくて|あたたかくて|暖かい} {気持ち|きもち}が いい！", e: "It's warm and feels great!" },
    { s: "samuneko", j: "ニャー！", e: "Nyaa!" },
    { s: "hana", j: "@さん、ありがとう。{花|はな}も うれしいと {思います|おもいます|思う}。", e: "@, thank you. I think the flowers are happy too." },
    { s: "hana", j: "@さんは {新しい|あたらしい} {学校|がっこう}で {寂しく|さびしく|寂しい} ないですか。", e: "@, aren't you lonely at your new school?" },
    { choose: [
      { j: "{少し|すこし} {寂しい|さびしい}です。", e: "I'm a little lonely.", then: [
        { s: "hana", j: "そうですか。でも、もう {友達|ともだち}が たくさん いますよ。", e: "I see. But you have lots of friends now." },
      ] },
      { j: "いいえ、{楽しい|たのしい}です。", e: "No, it's fun.", then: [
        { s: "hana", j: "それは よかった！", e: "I'm so glad!" },
      ] },
    ] },
    { s: "hana", j: "「{住めば都|すめばみやこ}」と {言います|いいます|言う}。", e: "There's a saying: \"Sumeba miyako.\"" },
    { s: "hana", j: "どんな {所|ところ}でも、{住むと|すむと|住む} いい {所|ところ}に なります。", e: "Wherever it is, once you live there it becomes a good place." },
    { j: "そのとき、コトダマが {光りました|ひかりました|光る}！", e: "Just then, Kotodama lit up!" },
    { s: K, j: "あっ……！ {思い出しました|おもいだしました|思い出す}！", e: "Ah...! I remember!" },
    { s: K, j: "「{住めば都|すめばみやこ}」！ ぼくの {大切|たいせつ}な {言葉|ことば}です！", e: "\"Sumeba miyako\"! It's one of my important words!" },
    { flag: "word1" },
    { s: K, j: "{一つ|ひとつ} {戻りました|もどりました|戻る}！ あと {五つ|いつつ}です！", e: "One's back! Five to go!" },
    { s: K, j: "@さん、{一緒に|いっしょに} {調べて|しらべて|調べる}、{楽しかった|たのしかった|楽しい}です！", e: "@, investigating together was fun!" },
    { s: "samuneko", j: "ニャー！", e: "Nyaa!" },
    { join: "samuneko", j: "サムネコが なかまに なった！", e: "Samuneko joined your team!" },
    { join: "reibouzu", j: "レイボウズも {静か|しずか}に なって、なかまに なった！", e: "Reibouzu calmed down and joined your team too!" },
    { flag: "solved" },
    { j: "その {夜|よる}……。", e: "That night..." },
    { j: "{看板|かんばん}に {手紙|てがみ}が ありました。", e: "There was a letter on the sign." },
    { j: "「よく わかったね。{次|つぎ}は {時計台|とけいだい}の {町|まち}だ。」", e: "\"Well figured out. Next is the clock tower town.\"" },
    { j: "「——{黒い|くろい} コート」", e: "\"— Black Coat\"" },
    { s: K, j: "{次|つぎ}……？ {町|まち}で {何|なに}が あるんでしょう？", e: "Next...? What's going to happen in town?" },
    { s: K, j: "@さん、{行きましょう|いきましょう|行く}！", e: "@, let's go!" },
    { j: "{第一章|だいいっしょう}、おわり。{第二章|だいにしょう}に つづく。", e: "End of Chapter 1. To be continued in Chapter 2." },
  ],
  hana_end: [
    { s: "hana", j: "{花|はな}が {咲きました|さきました|咲く}よ。きれいでしょう？", e: "The flowers have bloomed. Pretty, aren't they?" },
    { s: "hana", j: "この {先|さき}は {町|まち}です。{気をつけて|きをつけて|気をつける} {行って|いって|行く} ください！", e: "Past here is the town. Take care on your way!" },
  ],

  sign: [
    { j: "ことば{大学|だいがく} キャンパス", e: "Kotoba University Campus" },
    { j: "{北|きた}：{売店|ばいてん}　{東|ひがし}：{町|まち}", e: "North: kiosk. East: town." },
  ],
  shrine: [
    { heal: true },
    { flag: "rested" },
    { j: "{神社|じんじゃ}です。{少し|すこし} {休みました|やすみました|休む}。", e: "It's a shrine. You rested a little." },
    { j: "みんな {元気|げんき}に なりました！", e: "Everyone feels better!" },
  ],
  gate_closed: [
    { j: "{道|みち}が {凍って|こおって|凍る} います。{通れません|とおれません|通る}。", e: "The road is frozen. You can't get through." },
  ],
  woke_up: [
    { j: "{目|め}が {覚めました|さめました|覚める}。{神社|じんじゃ}です。", e: "You woke up. You're at the shrine." },
    { s: K, j: "だいじょうぶですか。みんな {元気|げんき}に なりましたよ。", e: "Are you okay? Everyone's feeling better." },
  ],
};

/* Battle lines. {a} and {b} are creature names, {n} a number. */
export const BATTLE_TEXT = {
  appear: { j: "{a}が {現れた|あらわれた|現れる}！", e: "{a} appeared!" },
  boss: { j: "{冷房|れいぼう}の {精霊|せいれい}、{a}が {現れた|あらわれた|現れる}！", e: "{a}, the spirit of the air conditioner, appeared!" },
  coatBoss: { j: "{黒い|くろい} コートの {人|ひと}の {a}が {襲って|おそって|襲う} きた！", e: "Black Coat's {a} attacked!" },
  uses: { j: "{a}の {b}！", e: "{a} used {b}!" },
  hit: { j: "{a}に {n}の ダメージ！", e: "{n} damage to {a}!" },
  strong: { j: "よく {効いた|きいた|効く}！", e: "It really worked!" },
  weak: { j: "あまり {効かない|きかない|効く}……。", e: "It didn't work very well..." },
  down: { j: "{a}は {倒れた|たおれた|倒れる}。", e: "{a} went down." },
  next: { j: "{a}、{行け|いけ|行く}！", e: "Go, {a}!" },
  win: { j: "{勝った|かった|勝つ}！", e: "You won!" },
  xp: { j: "{経験値|けいけんち}を {n} もらった。", e: "Got {n} experience." },
  level: { j: "{a}は レベル{n}に なった！", e: "{a} reached level {n}!" },
  lost: { j: "みんな {倒れた|たおれた|倒れる}……。", e: "Everyone went down..." },
  fled: { j: "{逃げた|にげた|逃げる}！", e: "You got away!" },
  throw: { j: "{a}を つかまえる！", e: "Trying to catch {a}!" },
  caught: { j: "{a}を つかまえた！ なかまに なった！", e: "Caught {a}! It joined your team!" },
  caughtHome: { j: "{a}を つかまえた！ {今|いま}は {家|うち}に {帰る|かえる}。", e: "Caught {a}! It heads home for now." },
  broke: { j: "ああ、{逃げられた|にげられた|逃げる}！", e: "Oh no, it broke free!" },
  tooStrong: { j: "まだ {元気|げんき}だ。{弱く|よわく|弱い} しよう！", e: "It's still lively. Weaken it first!" },
  noFlee: { j: "{逃げられない|にげられない|逃げる}！", e: "You can't run from this!" },
};

/* Menus. English only on request, like everything else. */
export const MENU = {
  fight: { j: "たたかう", e: "Fight" },
  catch: { j: "つかまえる", e: "Catch" },
  team: { j: "なかま", e: "Team" },
  run: { j: "にげる", e: "Run" },
  back: { j: "もどる", e: "Back" },
  next: { j: "つぎ", e: "Next" },
  notebook: { j: "ノート", e: "Notebook" },
  clues: { j: "{手がかり|てがかり}", e: "Clues" },
  words: { j: "ことば", e: "Words" },
  map: { j: "{地図|ちず}", e: "Map" },
  lead: { j: "{先頭|せんとう}に する", e: "Put in front" },
  pickClue: { j: "どの {手がかり|てがかり}を {見せます|みせます|見せる}か。", e: "Which clue will you show?" },
  nameAsk: { j: "{名前|なまえ}を {入れて|いれて|入れる} ください。", e: "Enter your name, in rōmaji or kana." },
  nameOk: { j: "{決定|けってい}", e: "OK" },
  lostWords: { j: "{大切|たいせつ}な {言葉|ことば}", e: "Important words" },
  dex: { j: "{図鑑|ずかん}", e: "Creature book" },
  dexCaught: { j: "つかまえた", e: "Caught" },
  saved: { j: "{自動|じどう}で セーブします。", e: "The game saves itself as you play." },
  noWords: { j: "{言葉|ことば}を タップすると、ここに {入ります|はいります|入る}。", e: "Words you tap show up here." },
  found: { j: "{手がかり|てがかり}を {見つけた|みつけた|見つける}！", e: "You found a clue!" },
};

/* Every word you can tap. Keys are dictionary forms. */
const CH1_GLOSS = {
  "開く": "to open (by itself)",
  "消える": "to disappear", "春": "spring", "第一章": "Chapter 1", "第二章": "Chapter 2", "話": "talk, story", "犯人": "culprit",
  "寒い": "cold (weather)", "ふるえる": "to shiver", "思う": "to think", "冷たい": "cold (to the touch)", "風": "wind",
  "北": "north", "東": "east", "方": "direction", "来る": "to come", "売店": "kiosk, shop", "売れる": "to sell (well)",
  "百円": "100 yen", "五百円": "500 yen", "昨日": "yesterday", "夜": "night", "九時半": "9:30", "明るい": "bright, lit up",
  "五時": "5 o'clock", "家": "home", "裏": "the back, behind", "大きい": "big", "冷房": "air conditioner", "出る": "to come out",
  "聞く": "to ask, to listen", "所": "place", "行く": "to go", "集める": "to gather (people or things)", "草": "grass",
  "中": "inside", "探す": "to look for", "四月": "April", "大学": "university", "キャンパス": "campus", "今日": "today",
  "新しい": "new", "人": "person", "言葉": "word, language", "精霊": "spirit", "名前": "name", "何": "what",
  "留学生": "exchange student", "日本語": "Japanese", "上手": "skilled, good at", "猫": "cat", "本当": "true, real",
  "変": "strange", "暑い": "hot (weather)", "先週": "last week", "暖かい": "warm", "今週": "this week", "急に": "suddenly",
  "困る": "to be in trouble", "一緒に": "together", "調べる": "to investigate", "書く": "to write", "生き物": "creature",
  "気をつける": "to be careful", "一年生": "first-year student", "今朝": "this morning", "試験": "test", "遅れる": "to be late",
  "道": "road", "凍る": "to freeze", "危ない": "dangerous", "走る": "to run", "先生": "teacher", "厳しい": "strict",
  "知る": "to know", "白い": "white", "池": "pond", "近く": "near, nearby", "悪い": "bad", "言う": "to say", "来週": "next week",
  "一度": "once", "受ける": "to take (a test)", "怒る": "to get angry", "逃げる": "to run away", "毎朝": "every morning",
  "悲しい": "sad", "違う": "to be wrong, different", "自分": "oneself", "食堂": "cafeteria", "元気": "healthy, lively",
  "結構": "(no) thank you; fine", "最近": "lately", "人気": "popular", "買う": "to buy", "高い": "expensive, tall",
  "戻る": "to come back", "静か": "quiet", "勉強": "studying", "三年生": "third-year student", "先輩": "senior (at school)",
  "毎晩": "every night", "好き": "to like", "残念": "too bad", "閉める": "to close", "機械": "machine",
  "珍しい": "unusual, rare", "木": "tree", "花": "flower", "仕事": "work, job", "今": "now", "通る": "to pass through",
  "朝": "morning", "昼": "daytime", "少し": "a little", "看板": "sign", "見る": "to look", "全部": "all, everything",
  "呼ぶ": "to call", "集まる": "to gather (intransitive)", "見つける": "to find", "関係": "connection, relation",
  "見せる": "to show", "理由": "reason", "止まる": "to stop", "生まれる": "to be born", "熱い": "hot (to the touch)",
  "技": "technique, move", "効く": "to work, be effective", "助ける": "to help, save", "迷惑": "trouble, bother", "戻す": "to put back",
  "気持ち": "feeling", "学校": "school", "寂しい": "lonely", "友達": "friend", "住めば都": "Home is where you make it (proverb)",
  "住む": "to live (somewhere)", "楽しい": "fun", "咲く": "to bloom", "先": "ahead", "町": "town", "会う": "to meet",
  "神社": "shrine", "休む": "to rest", "目": "eye", "覚める": "to wake (目が覚める)", "現れる": "to appear", "倒れる": "to fall, go down",
  "勝つ": "to win", "経験値": "experience points", "帰る": "to go home", "弱い": "weak", "手がかり": "clue", "地図": "map",
  "先頭": "the front", "入れる": "to put in, enter", "決定": "decision", "入る": "to enter", "大切": "important, precious", "六つ": "six (things)", "忘れる": "to forget", "手伝う": "to help",
  "寒さ": "the cold", "金": "money", "閉まる": "to close (by itself)", "黒い": "black", "光る": "to shine", "思い出す": "to remember",
  "一つ": "one (thing)", "五つ": "five (things)", "手紙": "letter", "次": "next", "時計台": "clock tower", "図鑑": "illustrated guide",
  "自動": "automatic", "出す": "to bring out (元気を出す: cheer up)", "光": "light", "声": "voice",
  "息": "breath", "歌": "song", "晴れ": "sunny weather", "爪": "claw", "牙": "fang", "羽": "feather, wing", "雪": "snow", "氷": "ice",
};

export const CHAPTERS = [
  { region: 0, title: CH1_TITLE, number: CH1_NUMBER, start: "intro", introFlag: "intro", ready: "ready", readyScene: "ready", solved: "solved",
    clues: CH1_CLUES, caseClues: CH1_CASE_CLUES, goals: CH1_GOALS, people: CH1_PEOPLE, places: CH1_PLACES, buildings: CH1_BUILDINGS, scenes: CH1_SCENES },
  CH2,
];
export const chapterFor = (region) => CHAPTERS.find((c) => c.region === region) || CHAPTERS[0];
export const SCENES = Object.assign({}, ...CHAPTERS.map((c) => c.scenes));
export const CAST = { ...CH1_CAST, ...CH2.cast };
export const GLOSS = { ...CH1_GLOSS, ...CH2.gloss };
