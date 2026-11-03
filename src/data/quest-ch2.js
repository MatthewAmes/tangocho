/* ── Kotoba Quest, Chapter 2: 鳴らない鐘 ──
   Bell Tower Town. The bell that wakes everyone has been silent since Monday, and tomorrow is
   a wedding. Same markup as src/data/quest-story.js (its header explains it).

   Built on Act 8's words: 音, 声, 起きる, 寝る, 必ず, 切符, 嘘, 冗談, うるさい, 聞こえる, 優しい,
   the 親切 of visiting someone's home (ようこそ / お邪魔します / お構いなく / ご遠慮なく),
   and the act's proverb, 類は友を呼ぶ. */

const K = "kotodama";

export const CH2 = {
  region: 1,
  title: { j: "{鳴らない|ならない|鳴る} {鐘|かね}", e: "The Silent Bell" },
  number: { j: "{第二章|だいにしょう}", e: "Chapter 2" },
  start: "c2_intro",
  introFlag: "c2_intro",
  ready: "c2_ready",
  readyScene: "c2_ready_note",
  solved: "c2_solved",

  cast: {
    ren: { name: "レン", portrait: "ren" },
    yui: { name: "ユイ", portrait: "yui" },
    sota: { name: "ソウタ", portrait: "sota" },
    fumi: { name: "フミ", portrait: "fumi" },
    haru: { name: "ハル", portrait: "haru" },
    coat: { name: "{黒い|くろい} コート", portrait: "coat" },
    nebokuro: { name: "ネボクロウ", sprite: "nebokuro" },
    keekin: { name: "ケーキン", sprite: "keekin" },
  },

  clues: {
    c2_rod: { j: "{鐘|かね}の {中|なか}の {棒|ぼう}が なくなった。{棒|ぼう}が ないと {音|おと}が {出ない|でない|出る}。", e: "The rod inside the bell is gone. Without it, there's no sound." },
    c2_key: { j: "{時計台|とけいだい}の {鍵|かぎ}は {二つ|ふたつ}。{一つ|ひとつ}は レンさん、もう{一つ|ひとつ}は {前|まえ}の {鐘|かね}の {人|ひと}の もの。", e: "There are two keys to the clock tower. One is Ren's. The other belonged to the previous bell ringer." },
    c2_husband: { j: "{前|まえ}の {鐘|かね}の {人|ひと}は フミさんの ご{主人|しゅじん}。{去年|きょねん} {亡くなった|なくなった|亡くなる}。", e: "The previous bell ringer was Fumi's husband. He passed away last year." },
    c2_ticket: { j: "ソウタさんは {鐘|かね}が {嫌い|きらい}。でも {日曜日|にちようび}から {昨日|きのう}まで {大阪|おおさか}に いた。{切符|きっぷ}が ある。", e: "Sota hates the bell. But he was in Osaka from Sunday until yesterday. He has the ticket." },
    c2_coat: { j: "{今朝|けさ} {五時|ごじ}、フミさんの {家|うち}の {前|まえ}に {黒い|くろい} コートの {人|ひと}が いた。", e: "At 5 this morning, a person in a black coat was in front of Fumi's house." },
    c2_bird: { j: "フミさんは {毎朝|まいあさ} {窓|まど}を {開けて|あけて|開ける}、{鳥|とり}の {声|こえ}を {聞いて|きいて|聞く} いる。", e: "Every morning Fumi opens her window and listens to the birds." },
    c2_fumi: { j: "フミさんの {話|はなし}：{耳|みみ}が {悪くて|わるくて|悪い}、{何|なに}も {聞こえない|きこえない|聞こえる}。", e: "What Fumi says: her ears are bad and she can't hear anything." },
    c2_found: { j: "{棒|ぼう}は フミさんの {庭|にわ}に あった。ネボクロウが {持って|もって|持つ} いた。", e: "The rod was in Fumi's garden. Nebokuro had it." },
  },
  caseClues: ["c2_rod", "c2_key", "c2_husband", "c2_ticket", "c2_coat", "c2_bird", "c2_fumi", "c2_found"],

  goals: [
    { until: "c2_ready", j: "{町|まち}の {人|ひと}に {話|はなし}を {聞きましょう|ききましょう|聞く}。", e: "Let's ask the people in town what they know." },
    { until: "c2_solved", j: "レンさんの {所|ところ}へ {行きましょう|いきましょう|行く}。", e: "Let's go to Ren." },
    { until: "never", j: "{第三章|だいさんしょう}は もうすぐ！ {黒い|くろい} コートの {人|ひと}は だれでしょう？", e: "Chapter 3 is coming soon! Who is the person in the black coat?" },
  ],

  people: [
    { id: "sota", x: 7, y: 6, walker: "sota", talk: [
      { need: ["c2_solved"], scene: "c2_sota_end" },
      { need: ["c2_ticket"], scene: "c2_sota_again" },
      { scene: "c2_sota_first" },
    ] },
    { id: "yui", x: 5, y: 8, walker: "yui", talk: [
      { need: ["c2_solved"], scene: "c2_yui_end" },
      { need: ["cake_done"], not: ["cake_thanks"], scene: "c2_yui_cake" },
      { need: ["c2_husband"], scene: "c2_yui_again" },
      { scene: "c2_yui_first" },
    ] },
    { id: "haru", x: 11, y: 4, walker: "haru", talk: [
      { need: ["c2_solved"], scene: "c2_haru_end" },
      { need: ["c2_bird"], scene: "c2_haru_again" },
      { scene: "c2_haru_first" },
    ] },
    { id: "nebokuro", x: 14, y: 5, sprite: "nebokuro", hide: ["c2_found"], talk: [{ scene: "c2_owl_first" }] },
    { id: "keekin", x: 13, y: 2, sprite: "keekin", show: ["cake_asked"], hide: ["cake_done"], talk: [{ scene: "c2_cake_first" }] },
    { id: "ren_after", x: 14, y: 8, walker: "ren", show: ["c2_solved"], talk: [{ scene: "c2_ren_end" }] },
  ],

  places: {
    guardian: [
      { need: ["c2_accused"], scene: "c2_boss_again" },
      { need: ["c2_ready"], scene: "c2_finale" },
      { need: ["c2_rod"], scene: "c2_ren_again" },
      { scene: "c2_ren_first" },
    ],
    sign: [{ scene: "c2_sign" }],
    shrine: [{ scene: "shrine" }],
    locked: [
      { need: ["c2_solved"], scene: "c2_gate_open" },
      { scene: "c2_gate_closed" },
    ],
  },

  buildings: [
    { x: 7, y: 1, w: 2, h: 2, talk: [
      { need: ["c2_solved"], scene: "c2_tower_end" },
      { scene: "c2_tower" },
    ] },
    { x: 6, y: 5, w: 1, h: 1, talk: [{ scene: "c2_sota_house" }] },
    { x: 12, y: 5, w: 1, h: 1, talk: [
      { need: ["c2_solved"], scene: "c2_fumi_end" },
      { need: ["c2_fumi"], scene: "c2_fumi_again" },
      { scene: "c2_fumi_first" },
    ] },
    { x: 3, y: 8, w: 2, h: 1, talk: [{ scene: "c2_bakery" }] },
  ],

  scenes: {
    c2_intro: [
      { flag: "c2_intro" },
      { j: "{時計台|とけいだい}の {町|まち}に {着きました|つきました|着く}。", e: "You arrived at the clock tower town." },
      { s: K, j: "{大きい|おおきい} {時計|とけい}ですね！", e: "What a big clock!" },
      { j: "{今|いま}は {朝|あさ} {九時|くじ}です。でも、{町|まち}は とても {静か|しずか}です。", e: "It's 9 in the morning. But the town is very quiet." },
      { s: K, j: "おかしいですね。みんな まだ {寝て|ねて|寝る} いますか。", e: "That's odd. Is everyone still asleep?" },
      { s: K, j: "{黒い|くろい} コートの {人|ひと}は どこでしょう？ {町|まち}の {人|ひと}に {聞きましょう|ききましょう|聞く}。", e: "Where's the person in the black coat? Let's ask the people in town." },
    ],
    c2_ready_note: [
      { s: K, j: "@さん、{手がかり|てがかり}が {全部|ぜんぶ} {集まりました|あつまりました|集まる}！", e: "@, we've got all the clues!" },
      { s: K, j: "{悲しい|かなしい} {話|はなし}かも しれません……。レンさんの {所|ところ}へ {行きましょう|いきましょう|行く}。", e: "It may be a sad story... Let's go to Ren." },
    ],

    c2_ren_first: [
      { s: "ren", j: "ああ……。{時計屋|とけいや}の レンです。", e: "Ah... I'm Ren, the clockmaker." },
      { s: "ren", j: "この {町|まち}には {鐘|かね}が あります。{毎朝|まいあさ} {七時|しちじ}に {必ず|かならず} {鳴ります|なります|鳴る}。", e: "This town has a bell. It rings at 7 every morning without fail." },
      { s: "ren", j: "みんな その {音|おと}で {起きます|おきます|起きる}。", e: "Everyone wakes up to that sound." },
      { s: "ren", j: "でも、{月曜日|げつようび}から {鳴りません|なりません|鳴る}。みんな {寝坊|ねぼう}しています。", e: "But it hasn't rung since Monday. Everyone's oversleeping." },
      { s: K, j: "どうしてですか。", e: "Why is that?" },
      { s: "ren", j: "{鐘|かね}の {中|なか}の {棒|ぼう}が なくなりました。{棒|ぼう}が ないと、{音|おと}が {出ません|でません|出る}。", e: "The rod inside the bell disappeared. Without the rod, there's no sound." },
      { clue: "c2_rod" },
      { s: "ren", j: "みんな、{私|わたし}が {悪い|わるい}と {言います|いいます|言う}。でも、{私|わたし}じゃ ありません。", e: "Everyone says it's my fault. But it wasn't me." },
      { s: "ren", j: "{明日|あした}は ユイさんの {結婚式|けっこんしき}です。{鐘|かね}が {必要|ひつよう}なんです……。", e: "Tomorrow is Yui's wedding. The bell is needed..." },
      { s: K, j: "{一緒に|いっしょに} {探しましょう|さがしましょう|探す}！ {時計台|とけいだい}には だれが {入れます|はいれます|入る}か。", e: "Let's look for it together! Who can get into the clock tower?" },
      { s: "ren", j: "{鍵|かぎ}は {二つ|ふたつ} あります。{一つ|ひとつ}は {私|わたし}の です。", e: "There are two keys. One is mine." },
      { s: K, j: "もう{一つ|ひとつ}は？", e: "And the other?" },
      { s: "ren", j: "……{前|まえ}の {鐘|かね}の {人|ひと}の です。もう いません。", e: "...It belonged to the previous bell ringer. He's no longer with us." },
      { clue: "c2_key" },
    ],
    c2_ren_again: [
      { s: "ren", j: "{何|なに}か わかりましたか。{結婚式|けっこんしき}は {明日|あした}です……。", e: "Have you found anything out? The wedding is tomorrow..." },
    ],
    c2_ren_end: [
      { s: "ren", j: "{毎朝|まいあさ}、フミさんと {一緒に|いっしょに} {鐘|かね}を {鳴らして|ならして|鳴らす} います。", e: "Every morning now, I ring the bell together with Fumi." },
      { s: "ren", j: "{次|つぎ}は {川|かわ}ですね。{気をつけて|きをつけて|気をつける}！", e: "The river's next, isn't it? Be careful!" },
    ],

    c2_yui_first: [
      { s: "yui", j: "いらっしゃい！ パン{屋|や}の ユイです。", e: "Welcome! I'm Yui from the bakery." },
      { s: K, j: "{明日|あした}、{結婚式|けっこんしき}ですね。おめでとうございます！", e: "Your wedding is tomorrow, isn't it? Congratulations!" },
      { s: "yui", j: "ありがとうございます！ でも、{鐘|かね}が {鳴らないと|ならないと|鳴る}、お{客様|きゃくさま}が {起きません|おきません|起きる}。", e: "Thank you! But if the bell doesn't ring, the guests won't wake up." },
      { s: K, j: "{前|まえ}の {鐘|かね}の {人|ひと}は だれですか。", e: "Who was the previous bell ringer?" },
      { s: "yui", j: "フミさんの ご{主人|しゅじん}です。{四十年|よんじゅうねん}、{毎朝|まいあさ} {鐘|かね}を {鳴らしました|ならしました|鳴らす}。", e: "Fumi's husband. For forty years he rang the bell every morning." },
      { s: "yui", j: "でも、{去年|きょねん} {亡くなりました|なくなりました|亡くなる}。", e: "But he passed away last year." },
      { s: K, j: "そうですか……。", e: "I see..." },
      { clue: "c2_husband" },
      { s: "yui", j: "あ、それから！ {結婚式|けっこんしき}の ケーキが なくなりました！", e: "Oh, and another thing! The wedding cake has disappeared!" },
      { s: "yui", j: "{金色|きんいろ}の {小さい|ちいさい} {生き物|いきもの}を {見ました|みました|見る}。{北|きた}の {草|くさ}に {行きました|いきました|行く}。", e: "I saw a small golden creature. It went to the grass in the north." },
      { flag: "cake_asked" },
    ],
    c2_yui_again: [
      { s: "yui", j: "{明日|あした}、{鐘|かね}が {鳴ると|なると|鳴る} いいですね……。", e: "I hope the bell rings tomorrow..." },
    ],
    c2_yui_cake: [
      { s: K, j: "ユイさん、ケーキの {犯人|はんにん}が わかりました。この {生き物|いきもの}です。", e: "Yui, we found the cake culprit. It's this creature." },
      { s: "keekin", j: "キュー……。ごめんなさい……。", e: "Kyuu... I'm sorry..." },
      { s: "yui", j: "ええっ！ {全部|ぜんぶ} {食べました|たべました|食べる}か？！", e: "What?! You ate it all?!" },
      { s: "keekin", j: "お{腹|なか}が {空いて|すいて|空く} いました……。", e: "I was hungry..." },
      { s: "yui", j: "……ふふ。{冗談|じょうだん}みたいですね。いいですよ。{新しい|あたらしい} ケーキを {作ります|つくります|作る}。", e: "...Heh. It's like a joke. It's okay. I'll make a new cake." },
      { heal: true },
      { s: "yui", j: "これは お{礼|れい}の パンです。みんなで どうぞ。", e: "This bread is my thanks. Share it with everyone." },
      { j: "みんな {元気|げんき}に なりました！", e: "Everyone feels better!" },
      { flag: "cake_thanks" },
      { join: "keekin", j: "ケーキンが なかまに なった！", e: "Keekin joined your team!" },
    ],
    c2_yui_end: [
      { s: "yui", j: "{結婚式|けっこんしき}、とても よかったです。ありがとう、@さん！", e: "The wedding was wonderful. Thank you, @!" },
      { heal: true },
      { s: "yui", j: "パンを どうぞ。{遠慮|えんりょ}しないで ください。", e: "Have some bread. Don't be shy." },
    ],

    c2_sota_first: [
      { s: "sota", j: "……{何|なん}ですか。{今|いま}、{寝て|ねて|寝る} いました。", e: "...What is it? I was sleeping." },
      { s: "sota", j: "ぼくは {大学生|だいがくせい}の ソウタです。あの {鐘|かね}は {嫌い|きらい}です。うるさいです。", e: "I'm Sota, a university student. I hate that bell. It's noisy." },
      { s: K, j: "{鐘|かね}が {嫌い|きらい}？ では、ソウタさんが {止めました|とめました|止める}か。", e: "You hate the bell? So did you stop it?" },
      { s: "sota", j: "えっ？ {冗談|じょうだん}でしょう？ ぼくじゃ ありませんよ！", e: "What? You're joking, right? It wasn't me!" },
      { s: "sota", j: "{日曜日|にちようび}から {昨日|きのう}まで、{一人で|ひとりで} {大阪|おおさか}に いました。ほら、{切符|きっぷ}です。", e: "From Sunday until yesterday I was in Osaka by myself. See, here's the ticket." },
      { clue: "c2_ticket" },
      { s: "sota", j: "それより、{変|へん}な ことが ありました。", e: "More to the point, something strange happened." },
      { s: "sota", j: "{今朝|けさ} {五時|ごじ}に {黒い|くろい} コートの {人|ひと}を {見ました|みました|見る}。フミさんの {家|うち}の {前|まえ}です。", e: "At 5 this morning I saw a person in a black coat. In front of Fumi's house." },
      { s: K, j: "{黒い|くろい} コート！ それです！", e: "A black coat! That's who we're after!" },
      { clue: "c2_coat" },
    ],
    c2_sota_again: [
      { s: "sota", j: "{眠い|ねむい}です……。{嘘|うそ}じゃ ありませんよ。{本当|ほんとう}に {黒い|くろい} コートでした。", e: "I'm sleepy... I'm not lying. It really was a black coat." },
    ],
    c2_sota_end: [
      { s: "sota", j: "{鐘|かね}は やっぱり うるさいです。", e: "The bell is still noisy, as expected." },
      { s: "sota", j: "でも……{今日|きょう}は {少し|すこし} きれいな {音|おと}だと {思いました|おもいました|思う}。", e: "But... today I thought it sounded a little pretty." },
    ],
    c2_sota_house: [
      { j: "ソウタさんの {家|うち}です。{大きい|おおきい} {目覚まし時計|めざましどけい}が {三つ|みっつ} あります。", e: "This is Sota's house. There are three big alarm clocks." },
      { s: K, j: "{起きない|おきない|起きる} {人|ひと}ですね……。", e: "This is someone who just doesn't wake up..." },
    ],

    c2_haru_first: [
      { s: "haru", j: "ねえねえ！ ぼく、ハル！ {七歳|ななさい}！", e: "Hey hey! I'm Haru! I'm seven!" },
      { s: "haru", j: "{毎日|まいにち} フミおばあちゃんの {家|うち}に {行くよ|いくよ|行く}。お{菓子|かし}を くれるの！", e: "I go to Grandma Fumi's house every day. She gives me sweets!" },
      { s: "haru", j: "おばあちゃんは とても {優しい|やさしい}よ。", e: "Grandma is really kind." },
      { s: "haru", j: "{鳥|とり}が {好き|すき}なんだ。{毎朝|まいあさ} {窓|まど}を {開けて|あけて|開ける}、{鳥|とり}の {声|こえ}を {聞いて|きいて|聞く} いるよ。", e: "She loves birds. Every morning she opens the window and listens to their voices." },
      { clue: "c2_bird" },
      { s: "haru", j: "あとね、{庭|にわ}に ネボクロウが いるよ！ {光る|ひかる} ものを {持って|もって|持つ} いるの！", e: "And there's a Nebokuro in the garden! It's holding something shiny!" },
      { s: K, j: "{光る|ひかる} もの……？", e: "Something shiny...?" },
    ],
    c2_haru_again: [
      { s: "haru", j: "ネボクロウは {東|ひがし}の {庭|にわ}だよ！ いつも {寝て|ねて|寝る} いるの！", e: "Nebokuro's in the garden to the east! It's always asleep!" },
    ],
    c2_haru_end: [
      { s: "haru", j: "おばあちゃん、{笑って|わらって|笑う} いるよ！ よかった！", e: "Grandma is smiling! I'm so glad!" },
    ],

    c2_fumi_first: [
      { j: "フミさんの {家|うち}です。", e: "This is Fumi's house." },
      { s: "fumi", j: "あら、ようこそ。どうぞ {上がって|あがって|上がる} ください。", e: "Oh, welcome. Please come in." },
      { choose: [
        { j: "お{邪魔|じゃま}します。", e: "Excuse me for intruding. (What you say entering someone's home)", then: [
          { s: "fumi", j: "まあ、ちゃんとした {人|ひと}ですね。", e: "My, what a well-mannered person." },
        ] },
        { j: "ただいま！", e: "I'm home!", then: [
          { s: "fumi", j: "ふふ、おもしろい {人|ひと}ですね。ここは あなたの {家|うち}じゃ ありませんよ。", e: "Heh, you're funny. This isn't your house, you know." },
        ] },
      ] },
      { s: "fumi", j: "{喉|のど}が {渇いた|かわいた|渇く}でしょう？ お{茶|ちゃ}を {淹れましょう|いれましょう|淹れる}。", e: "You must be thirsty. Let me make some tea." },
      { choose: [
        { j: "ありがとうございます。", e: "Thank you.", then: [] },
        { j: "どうぞ、お{構いなく|かまいなく}。", e: "Please don't go to any trouble.", then: [
          { s: "fumi", j: "ご{遠慮|えんりょ}なく。{一人|ひとり}ですから、お{客様|きゃくさま}が うれしいんです。", e: "Don't hold back. I'm on my own, so guests make me happy." },
        ] },
      ] },
      { heal: true },
      { j: "{温かい|あたたかい|暖かい} お{茶|ちゃ}です。みんな {元気|げんき}に なりました。", e: "It's warm tea. Everyone feels better." },
      { s: K, j: "フミさん、{鐘|かね}が {鳴りません|なりません|鳴る}。{困って|こまって|困る} いませんか。", e: "Fumi, the bell isn't ringing. Isn't that a problem for you?" },
      { s: "fumi", j: "{鐘|かね}？ わたしは {耳|みみ}が {悪い|わるい}んです。もう {何|なに}も {聞こえません|きこえません|聞こえる}。", e: "The bell? My ears are bad. I can't hear anything anymore." },
      { clue: "c2_fumi" },
      { s: "fumi", j: "だから、{鐘|かね}の ことは わかりません。ごめんなさいね。", e: "So I don't know anything about the bell. I'm sorry." },
      { j: "{窓|まど}の {外|そと}で、{小さい|ちいさい} {鳥|とり}が {鳴きました|なきました|鳴く}。", e: "Outside the window, a small bird sang." },
      { s: "fumi", j: "あら、かわいい {声|こえ}。", e: "Oh, what a lovely voice." },
      { s: K, j: "……。", e: "..." },
    ],
    c2_fumi_again: [
      { s: "fumi", j: "お{茶|ちゃ}を もう{一杯|いっぱい} いかがですか。", e: "Would you like another cup of tea?" },
      { heal: true },
      { j: "みんな {元気|げんき}に なりました。", e: "Everyone feels better." },
    ],
    c2_fumi_end: [
      { s: "fumi", j: "{主人|しゅじん}の {写真|しゃしん}です。{優しそう|やさしそう}でしょう？", e: "This is a photo of my husband. He looks kind, doesn't he?" },
      { s: "fumi", j: "{毎朝|まいあさ} {鐘|かね}を {鳴らして|ならして|鳴らす}、{話|はなし}を して います。", e: "Every morning I ring the bell, and talk to him." },
    ],

    c2_owl_first: [
      { j: "{庭|にわ}に ネボクロウが います。{寝て|ねて|寝る} います。", e: "There's a Nebokuro in the garden. It's asleep." },
      { j: "{何|なに}か {光って|ひかって|光る} います！", e: "Something is shining!" },
      { s: K, j: "{棒|ぼう}です！ {鐘|かね}の {棒|ぼう}です！", e: "It's the rod! The bell's rod!" },
      { s: "nebokuro", j: "ホー……。ホー！", e: "Hoo... Hoo!" },
      { s: K, j: "{起きました|おきました|起きる}！ {危ない|あぶない}！", e: "It woke up! Look out!" },
      { fight: { team: [["nebokuro", 6]], win: "c2_owl_after", caught: "c2_owl_after", flee: "c2_owl_fled", lose: "woke_up" } },
    ],
    c2_owl_fled: [
      { s: K, j: "{棒|ぼう}が {必要|ひつよう}です。もう{一度|いちど} {行きましょう|いきましょう|行く}。", e: "We need the rod. Let's go back." },
    ],
    c2_owl_after: [
      { j: "{棒|ぼう}を {見つけました|みつけました|見つける}！", e: "You found the rod!" },
      { s: K, j: "どうして フミさんの {庭|にわ}に あるんでしょう？", e: "Why would it be in Fumi's garden?" },
      { clue: "c2_found" },
    ],

    c2_cake_first: [
      { j: "{金色|きんいろ}の {小さい|ちいさい} {生き物|いきもの}が います。ケーキを {食べて|たべて|食べる} います！", e: "There's a small golden creature. It's eating cake!" },
      { s: "keekin", j: "キュー！ おいしい！", e: "Kyuu! Yummy!" },
      { s: K, j: "それは ユイさんの ケーキです！ {返して|かえして|返す} ください！", e: "That's Yui's cake! Give it back!" },
      { s: "keekin", j: "いやだ！", e: "No way!" },
      { fight: { team: [["keekin", 6]], win: "c2_cake_after", caught: "c2_cake_after", flee: "c2_cake_fled", lose: "woke_up" } },
    ],
    c2_cake_fled: [
      { s: K, j: "ケーキ、{食べられて|たべられて|食べる} しまいますよ！", e: "It's going to eat the whole cake!" },
    ],
    c2_cake_after: [
      { s: "keekin", j: "キュー……。ごめんなさい……。", e: "Kyuu... I'm sorry..." },
      { s: K, j: "ケーキは？", e: "Where's the cake?" },
      { s: "keekin", j: "……もう ない。", e: "...It's gone." },
      { s: K, j: "{一緒に|いっしょに} ユイさんの {所|ところ}へ {行きましょう|いきましょう|行く}。ちゃんと {言って|いって|言う} くださいね。", e: "Let's go to Yui together. You have to tell her properly." },
      { flag: "cake_done" },
    ],

    c2_finale: [
      { s: "ren", j: "{棒|ぼう}が {見つかりました|みつかりました|見つかる}か！ よかった！", e: "You found the rod! Thank goodness!" },
      { s: K, j: "でも、だれかが {取りました|とりました|取る}。みんなを {集めましょう|あつめましょう|集める}。", e: "But someone took it. Let's gather everyone." },
      { j: "レンさんが みんなを {呼びました|よびました|呼ぶ}。", e: "Ren called everyone over." },
      { s: K, j: "@さん、{犯人|はんにん}は だれですか。", e: "@, who is the culprit?" },
      { choose: [
        { j: "ソウタさんです。", e: "It's Sota.", retry: true, then: [
          { s: "sota", j: "{切符|きっぷ}を {見ましたよね|みましたよね|見る}？ {月曜日|げつようび}は {大阪|おおさか}に いましたよ。", e: "You saw the ticket, right? On Monday I was in Osaka." },
        ] },
        { j: "ネボクロウです。", e: "It's Nebokuro.", retry: true, then: [
          { s: "haru", j: "ネボクロウは {寝て|ねて|寝る} いただけだよ！ {鍵|かぎ}を {持って|もって|持つ} いないよ！", e: "Nebokuro was only sleeping! It doesn't have a key!" },
        ] },
        { j: "レンさんです。", e: "It's Ren.", retry: true, then: [
          { s: "ren", j: "{私|わたし}が？ あの {鐘|かね}は {私|わたし}の {仕事|しごと}です。{止めません|とめません|止める}よ。", e: "Me? That bell is my job. I wouldn't stop it." },
        ] },
        { j: "フミさんです。", e: "It's Fumi.", then: [
          { s: "haru", j: "ええっ？ おばあちゃんは {優しい|やさしい}よ！", e: "What? Grandma is kind!" },
        ] },
      ] },
      { s: "fumi", j: "……わたしが？ わたしは {耳|みみ}が {悪い|わるい}んですよ。{鐘|かね}は {聞こえません|きこえません|聞こえる}。{関係|かんけい}ありません。", e: "...Me? My ears are bad, you know. I can't hear the bell. It has nothing to do with me." },
      { s: K, j: "{本当|ほんとう}ですか。@さん、ノートを {見せて|みせて|見せる} ください！", e: "Is that true? @, show the notebook!" },
      { present: { right: "c2_bird", wrong: [{ s: K, j: "うーん、{違う|ちがう}と {思います|おもいます|思う}。フミさんは {本当|ほんとう}に {聞こえません|きこえません|聞こえる}か。", e: "Hmm, I don't think that's it. Can Fumi really not hear?" }] } },
      { s: "haru", j: "うん！ おばあちゃん、{毎朝|まいあさ} {鳥|とり}の {声|こえ}を {聞いて|きいて|聞く} いるよ！", e: "Yeah! Grandma listens to the birds every morning!" },
      { s: "fumi", j: "ハルちゃん……。", e: "Haru..." },
      { s: "fumi", j: "でも、{時計台|とけいだい}には {入れません|はいれません|入る}よ。{鍵|かぎ}が ありません。", e: "But I couldn't get into the clock tower. I don't have a key." },
      { present: { right: "c2_key", wrong: [{ s: K, j: "うーん、{違う|ちがう}と {思います|おもいます|思う}。{鍵|かぎ}は {いくつ} ありますか。", e: "Hmm, I don't think that's it. How many keys are there?" }] } },
      { s: "ren", j: "もう{一つ|ひとつ}の {鍵|かぎ}……。ご{主人|しゅじん}の {鍵|かぎ}は、フミさんが {持って|もって|持つ} いますね。", e: "The other key... Fumi, you have your husband's key, don't you?" },
      { s: "fumi", j: "……。", e: "..." },
      { s: "ren", j: "でも、どうしてですか。どうして {鐘|かね}を {止めました|とめました|止める}か。", e: "But why? Why did you stop the bell?" },
      { present: { right: "c2_husband", wrong: [{ s: K, j: "うーん、{違う|ちがう}と {思います|おもいます|思う}。その {鐘|かね}は、だれの {仕事|しごと}でしたか。", e: "Hmm, I don't think that's it. Whose job was that bell?" }] } },
      { s: "fumi", j: "……そうです。わたしです。", e: "...That's right. It was me." },
      { s: "fumi", j: "{毎朝|まいあさ} {七時|しちじ}に {鐘|かね}が {鳴ると|なると|鳴る}、{主人|しゅじん}を {思い出します|おもいだします|思い出す}。", e: "When the bell rings at 7 each morning, I remember my husband." },
      { s: "fumi", j: "{悲しくて|かなしくて|悲しい}、もう {聞きたくなかった|ききたくなかった|聞く}んです。", e: "It made me so sad, I didn't want to hear it anymore." },
      { s: "fumi", j: "{黒い|くろい} コートの {人|ひと}が {言いました|いいました|言う}。「{鐘|かね}を {止めると|とめると|止める}、{悲しく|かなしく|悲しい} なくなりますよ」と。", e: "A person in a black coat told me: \"If you stop the bell, you won't be sad anymore.\"" },
      { s: "fumi", j: "でも、{今|いま}も {悲しい|かなしい}です。{音|おと}が ないと、もっと {悲しい|かなしい}です。", e: "But I'm still sad. Without the sound, I'm even sadder." },
      { s: "fumi", j: "みなさん、すみませんでした。", e: "Everyone, I'm sorry." },
      { s: "yui", j: "フミさん……。{一人|ひとり}じゃ ありませんよ。", e: "Fumi... You're not alone." },
      { s: "ren", j: "{今夜|こんや}、{棒|ぼう}を {直します|なおします|直す}。@さん、{一緒に|いっしょに} {来て|きて|来る} ください。", e: "I'll put the rod back tonight. @, please come with me." },
      { flag: "c2_accused" },
      { j: "その {夜|よる}。{時計台|とけいだい}の {上|うえ}。", e: "That night. At the top of the clock tower." },
      { j: "だれかが {待って|まって|待つ} いました。", e: "Someone was waiting." },
      { s: "coat", j: "よく {来た|きた|来る}ね。", e: "So you came." },
      { s: K, j: "{黒い|くろい} コートの {人|ひと}！ どうして こんな ことを するんですか！", e: "The person in the black coat! Why are you doing this?!" },
      { s: "coat", j: "{悲しい|かなしい} {言葉|ことば}は いらない。{音|おと}も {声|こえ}も、ない {方|ほう}が いい。{静か|しずか}で いいだろう？", e: "No one needs sad words. It's better with no sound and no voices. Nice and quiet, don't you think?" },
      { s: K, j: "そんなの {嫌|いや}です！", e: "I hate that idea!" },
      { s: "coat", j: "では、{見せて|みせて|見せる} もらおう。", e: "Then show me what you've got." },
      { heal: true },
      { j: "フミさんの お{茶|ちゃ}で、みんな {元気|げんき}です。", e: "Thanks to Fumi's tea, everyone's in good shape." },
      { s: K, j: "{明るい|あかるい} {生き物|いきもの}には {冷たい|つめたい} {技|わざ}が よく {効きます|ききます|効く}！", e: "Cold moves work well on bright creatures!" },
      { fight: { team: [["mezamashi", 9]], boss: true, open: "coatBoss", win: "c2_won", lose: "woke_up" } },
    ],
    c2_boss_again: [
      { s: "ren", j: "{棒|ぼう}は {持って|もって|持つ} います。もう{一度|いちど} {時計台|とけいだい}へ！", e: "I have the rod. Back to the clock tower!" },
      { s: "coat", j: "また {来た|きた|来る}のか。", e: "Back again?" },
      { s: K, j: "{明るい|あかるい} {生き物|いきもの}には {冷たい|つめたい} {技|わざ}です！", e: "Cold moves against bright creatures!" },
      { fight: { team: [["mezamashi", 9]], boss: true, open: "coatBoss", win: "c2_won", lose: "woke_up" } },
    ],
    c2_won: [
      { s: "coat", j: "なかなか やるね。", e: "Not bad at all." },
      { s: K, j: "あなたは だれですか！ ぼくの {言葉|ことば}を {知って|しって|知る} いますか！", e: "Who are you?! Do you know about my words?!" },
      { s: "coat", j: "{忘れた|わすれた|忘れる}のか、コトダマ。", e: "So you've forgotten, Kotodama." },
      { s: K, j: "えっ……？", e: "What...?" },
      { j: "{黒い|くろい} コートの {人|ひと}は {消えました|きえました|消える}。", e: "The person in the black coat vanished." },
      { s: K, j: "ぼくの {名前|なまえ}を {知って|しって|知る} いました……。", e: "They knew my name..." },
      { s: K, j: "あの {声|こえ}……どこかで {聞きました|ききました|聞く}。", e: "That voice... I've heard it somewhere." },
      { j: "{次|つぎ}の {朝|あさ}。{七時|しちじ}。", e: "The next morning. 7 o'clock." },
      { j: "カーン……カーン……カーン……。", e: "Clang... clang... clang..." },
      { j: "{鐘|かね}が {鳴りました|なりました|鳴る}！", e: "The bell rang!" },
      { s: "ren", j: "フミさんが {鳴らしました|ならしました|鳴らす}。{私|わたし}じゃ ありませんよ。", e: "Fumi rang it. Not me." },
      { s: "fumi", j: "{主人|しゅじん}の {音|おと}です。{悲しい|かなしい}です。でも、{嫌|いや}じゃ ありません。", e: "It's my husband's sound. It's sad. But I don't mind it." },
      { s: "haru", j: "おばあちゃん、{泣いて|ないて|泣く} いるの？", e: "Grandma, are you crying?" },
      { s: "fumi", j: "ううん。{笑って|わらって|笑う} いるのよ。", e: "No. I'm smiling." },
      { s: "sota", j: "{起きました|おきました|起きる}……。うるさいです。でも、まあ、{今日|きょう}は いいです。", e: "I'm up... It's noisy. But, well, today it's fine." },
      { s: "yui", j: "みなさん、{来て|きて|来る} ください！ {結婚式|けっこんしき}です！ フミさんも {一緒に|いっしょに}！", e: "Everyone, come on! It's the wedding! You too, Fumi!" },
      { j: "{町|まち}の {人|ひと}が みんな {集まりました|あつまりました|集まる}。", e: "Everyone in town gathered together." },
      { s: "ren", j: "「{類は友を呼ぶ|るいはともをよぶ}」と {言います|いいます|言う}。", e: "There's a saying: \"Rui wa tomo wo yobu.\"" },
      { s: "ren", j: "{優しい|やさしい} {人|ひと}の {周り|まわり}には、{優しい|やさしい} {人|ひと}が {集まります|あつまります|集まる}。", e: "Around kind people, kind people gather." },
      { j: "そのとき、コトダマが {光りました|ひかりました|光る}！", e: "Just then, Kotodama lit up!" },
      { s: K, j: "{思い出しました|おもいだしました|思い出す}！「{類は友を呼ぶ|るいはともをよぶ}」！", e: "I remember! \"Rui wa tomo wo yobu\"!" },
      { flag: "word2" },
      { s: K, j: "{二つ|ふたつ} {戻りました|もどりました|戻る}！ あと {四つ|よっつ}です！", e: "That's two back! Four to go!" },
      { join: "mezamashi", j: "メザマシが {目|め}を {覚まして|さまして|覚ます}、なかまに なった！", e: "Mezamashi came to its senses and joined your team!" },
      { join: "nebokuro", j: "ネボクロウも {起きて|おきて|起きる}、なかまに なった！", e: "Nebokuro woke up and joined your team too!" },
      { flag: "c2_solved" },
      { s: "haru", j: "ねえ、これ {落ちて|おちて|落ちる} いたよ！ {手紙|てがみ}！", e: "Hey, this was on the ground! A letter!" },
      { j: "「{次|つぎ}は {川|かわ}だ。{忘れた|わすれた|忘れる} {言葉|ことば}を {思い出す|おもいだす}のは、{本当|ほんとう}に いい ことか？」", e: "\"Next is the river. Is remembering forgotten words really a good thing?\"" },
      { j: "「——{黒い|くろい} コート」", e: "\"— Black Coat\"" },
      { s: K, j: "@さん……。ぼくは {何|なに}を {忘れた|わすれた|忘れる}んでしょう。", e: "@... I wonder what it is I've forgotten." },
      { j: "{第二章|だいにしょう}、おわり。{第三章|だいさんしょう}に つづく。", e: "End of Chapter 2. To be continued in Chapter 3." },
    ],

    c2_tower: [
      { j: "{時計台|とけいだい}です。{鍵|かぎ}が かかって います。", e: "It's the clock tower. It's locked." },
      { j: "{時計|とけい}は {動いて|うごいて|動く} います。でも、{鐘|かね}は {鳴りません|なりません|鳴る}。", e: "The clock is running. But the bell doesn't ring." },
    ],
    c2_tower_end: [
      { j: "{時計台|とけいだい}です。{大きい|おおきい} {鐘|かね}が {見えます|みえます|見える}。", e: "It's the clock tower. You can see the big bell." },
    ],
    c2_bakery: [
      { j: "パン{屋|や}です。{今日|きょう}は {結婚式|けっこんしき}の {準備|じゅんび}で お{休み|やすみ}です。", e: "It's the bakery. It's closed today to get ready for the wedding." },
    ],
    c2_sign: [
      { j: "{時計台|とけいだい}の {町|まち}", e: "The Clock Tower Town" },
      { j: "{毎朝|まいあさ} {七時|しちじ}に {起きましょう|おきましょう|起きる}！", e: "Let's all get up at 7 every morning!" },
    ],
    c2_gate_closed: [
      { j: "{道|みち}は {閉まって|しまって|閉まる} います。レンさんが {鍵|かぎ}を {持って|もって|持つ} います。", e: "The road is closed. Ren has the key." },
    ],
    c2_gate_open: [
      { j: "{川|かわ}への {道|みち}です。{第三章|だいさんしょう}は もうすぐ！", e: "The road to the river. Chapter 3 is coming soon!" },
    ],
  },

  gloss: {
    "鳴る": "to ring, to sound", "鐘": "bell", "第三章": "Chapter 3", "棒": "rod, stick", "音": "sound", "鍵": "key", "二つ": "two (things)",
    "前": "before; in front", "主人": "husband", "去年": "last year", "亡くなる": "to pass away", "嫌い": "to dislike, hate",
    "日曜日": "Sunday", "大阪": "Osaka", "切符": "ticket", "窓": "window", "開ける": "to open", "鳥": "bird", "耳": "ear",
    "聞こえる": "to be able to hear", "庭": "garden, yard", "持つ": "to hold, have", "時計": "clock", "九時": "9 o'clock", "寝る": "to sleep",
    "時計屋": "clockmaker", "毎朝": "every morning", "七時": "7 o'clock", "必ず": "without fail", "起きる": "to wake up", "月曜日": "Monday",
    "寝坊": "oversleeping", "私": "I, me", "明日": "tomorrow", "結婚式": "wedding", "必要": "necessary", "川": "river", "鳴らす": "to ring (something)",
    "屋": "shop", "客様": "guest, customer", "四十年": "forty years", "金色": "gold (color)", "小さい": "small", "遠慮": "holding back, reserve",
    "腹": "belly (お腹が空く: to be hungry)", "空く": "to become empty", "食べる": "to eat", "冗談": "joke", "作る": "to make", "礼": "thanks",
    "大学生": "university student", "止める": "to stop (something)", "一人で": "by oneself", "眠い": "sleepy", "嘘": "lie", "目覚まし時計": "alarm clock",
    "三つ": "three (things)", "七歳": "seven years old", "毎日": "every day", "菓子": "sweets", "優しい": "kind, gentle", "笑う": "to laugh, smile",
    "上がる": "to come in, go up", "邪魔": "a bother (お邪魔します: excuse me for intruding)", "喉": "throat (喉が渇く: to be thirsty)", "渇く": "to be dry",
    "茶": "tea", "淹れる": "to brew", "構いなく": "(お構いなく) don't go to any trouble", "一人": "one person, alone", "外": "outside", "鳴く": "to sing, chirp",
    "一杯": "one cup", "写真": "photo", "優しそう": "kind-looking", "返す": "to give back", "見つかる": "to be found", "取る": "to take",
    "今夜": "tonight", "直す": "to fix, put back", "上": "on top, above", "待つ": "to wait", "嫌": "unpleasant, hateful", "類は友を呼ぶ": "Birds of a feather flock together (proverb)",
    "周り": "around, surroundings", "覚ます": "to wake (目を覚ます: to come to)", "四つ": "four (things)", "落ちる": "to fall, be dropped", "泣く": "to cry",
    "動く": "to move, run", "見える": "to be visible", "準備": "preparation", "襲う": "to attack", "甘い": "sweet", "いくつ": "how many", "着く": "to arrive", "休み": "day off, closed",
  },
};
