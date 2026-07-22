import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   単語帳 — JPN 101 flashcards
   Persistent vocab study tool. Cards are saved with window.storage so they
   survive across sessions. Add words anytime; study with self-graded flips.
   ────────────────────────────────────────────────────────────────────────── */

const STORE_KEY = "jpn101:deck";
const SEED_KEY = "jpn101:deckVersion";
const SEED_VERSION = 29; // bump this each time I add/update words

// Matthew's JPN 101 vocabulary. New batches get appended here with the version bumped.
const SEED = [
  { term: "感謝します", reading: "かんしゃします", romaji: "kansha shimasu", meaning: "to be grateful; I am grateful (use に to mark what for)", kind: "kanji", emoji: "🙇", lesson: 1 },
  { term: "もう一度お願いします", reading: "もういちどおねがいします", romaji: "mō ichido onegai shimasu", meaning: "One more time, please / Could you say that again?", kind: "kanji", emoji: "🔁", lesson: 1 },
  { term: "愛する天のお父様", reading: "あいするてんのおとうさま", romaji: "ai suru ten no otōsama", meaning: "Beloved Heavenly Father (addressing God in prayer)", kind: "kanji", emoji: "🙏", lesson: 1 },
  { term: "食べ物", reading: "たべもの", romaji: "tabemono", meaning: "food", kind: "kanji", emoji: "🍱", lesson: 1 },
  { term: "猫", reading: "ねこ", romaji: "neko", meaning: "cat", kind: "kanji", emoji: "🐱", pitch: "⸢ne⸣ko", lesson: 1 },
  { term: "恵み", reading: "めぐみ", romaji: "megumi", meaning: "grace; blessing", kind: "kanji", emoji: "✨", lesson: 1 },
  { term: "仕事", reading: "しごと", romaji: "shigoto", meaning: "work; job", kind: "kanji", emoji: "💼", lesson: 1 },
  { term: "犬", reading: "いぬ", romaji: "inu", meaning: "dog", kind: "kanji", emoji: "🐶", pitch: "⸢i⸣nu", lesson: 1 },
  { term: "学校", reading: "がっこう", romaji: "gakkō", meaning: "school", kind: "kanji", emoji: "🏫", pitch: "ga⸢kkō", lesson: 1 },
  { term: "この日", reading: "このひ", romaji: "kono hi", meaning: "this day", kind: "kanji", emoji: "📅", lesson: 1 },
  { term: "預言者", reading: "よげんしゃ", romaji: "yogensha", meaning: "prophet", kind: "kanji", emoji: "📜", lesson: 1 },
  { term: "愛", reading: "あい", romaji: "ai", meaning: "love", kind: "kanji", emoji: "❤️", pitch: "⸢a⸣i", lesson: 1 },
  { term: "祝福", reading: "しゅくふく", romaji: "shukufuku", meaning: "blessing", kind: "kanji", emoji: "🙌", lesson: 1 },
  { term: "素晴らしい", reading: "すばらしい", romaji: "subarashii", meaning: "wonderful; great; well done", kind: "kanji", emoji: "🌟", lesson: 1 },
  { term: "健康", reading: "けんこう", romaji: "kenkō", meaning: "health", kind: "kanji", emoji: "💪", lesson: 1 },
  { term: "睡眠", reading: "すいみん", romaji: "suimin", meaning: "sleep", kind: "kanji", emoji: "😴", lesson: 1 },
  { term: "どうぞよろしくお願いします", reading: "どうぞよろしくおねがいします", romaji: "dōzo yoroshiku onegai shimasu", meaning: "Pleased to meet you; I look forward to working with you (polite set phrase)", kind: "kanji", emoji: "🤝", lesson: 1 },
  { term: "〜は日本語で何と言いますか", reading: "〜はにほんごでなんといいますか", romaji: "~ wa nihongo de nan to iimasu ka", meaning: "How do you say ~ in Japanese?", kind: "kanji", emoji: "💬", lesson: 1 },
  { term: "〜の意味は何ですか", reading: "〜のいみはなんですか", romaji: "~ no imi wa nan desu ka", meaning: "What does ~ mean?", kind: "kanji", emoji: "❓", lesson: 1 },
  { term: "おはよう", reading: "おはよう", romaji: "ohayō", meaning: "Good morning (informal)", kind: "hiragana", emoji: "🌅", lesson: 2 },
  { term: "いただきます", reading: "いただきます", romaji: "itadakimasu", meaning: "I humbly receive (said before eating)", kind: "hiragana", emoji: "🍚", lesson: 2 },
  { term: "ごちそうさま", reading: "ごちそうさま", romaji: "gochisōsama", meaning: "Thank you for the meal (lit. 'it was a feast')", kind: "hiragana", emoji: "😋", lesson: 2 },
  { term: "ごちそうさまでした", reading: "ごちそうさまでした", romaji: "gochisōsama deshita", meaning: "Thank you for the meal — formal", kind: "hiragana", emoji: "🍽️", lesson: 2 },
  { term: "僕", reading: "ぼく", romaji: "boku", meaning: "I / me (masculine, casual)", kind: "kanji", emoji: "🙋‍♂️", lesson: 2 },
  { term: "私", reading: "わたし", romaji: "watashi", meaning: "I / me (polite, neutral)", kind: "kanji", emoji: "🙋", lesson: 2 },
  { term: "あなた", reading: "あなた", romaji: "anata", meaning: "you", kind: "hiragana", emoji: "👉", lesson: 2 },
  { term: "行ってらっしゃい", reading: "いってらっしゃい", romaji: "itte(i)rasshai", meaning: "See you later (said to someone leaving; lit. 'go and come back')", kind: "kanji", emoji: "👋", lesson: 2 },
  { term: "行ってきます", reading: "いってきます", romaji: "ittekimasu", meaning: "See you later (said by the one leaving; lit. \'I\'ll go and come back\')", kind: "kanji", emoji: "🚶", lesson: 2 },
  { term: "じゃあね", reading: "じゃあね", romaji: "jā ne", meaning: "See you later (informal)", kind: "hiragana", emoji: "👋", lesson: 2 },
  { term: "じゃあ", reading: "じゃあ", romaji: "jā", meaning: "Well then / so (informal)", kind: "hiragana", emoji: "✌️", lesson: 2 },
  { term: "バイバイ", reading: "バイバイ", romaji: "baibai", meaning: "Bye-bye (informal)", kind: "katakana", emoji: "👋", lesson: 2 },
  { term: "バイ", reading: "バイ", romaji: "bai", meaning: "Bye (informal)", kind: "katakana", emoji: "✋", lesson: 2 },
  { term: "じゃまた", reading: "じゃまた", romaji: "ja mata", meaning: "See you again (informal)", kind: "hiragana", emoji: "🔁", lesson: 2 },
  { term: "じゃまたね", reading: "じゃまたね", romaji: "ja mata ne", meaning: "See you again (informal)", kind: "hiragana", emoji: "🔁", lesson: 2 },
  { term: "また", reading: "また", romaji: "mata", meaning: "(See you) again — informal parting", kind: "hiragana", emoji: "🔁", lesson: 2 },
  { term: "神", reading: "かみ", romaji: "kami", meaning: "God; deity", kind: "kanji", emoji: "✨", lesson: 3 },
  { term: "祈り", reading: "いのり", romaji: "inori", meaning: "prayer (noun)", kind: "kanji", emoji: "🙏", lesson: 3 },
  { term: "お父様", reading: "おとうさま", romaji: "otōsama", meaning: "father (honorific); Heavenly Father in prayer", kind: "kanji", emoji: "👨", lesson: 3 },
  { term: "聞いて", reading: "きいて", romaji: "kiite", meaning: "listen (te-form of 聞く; e.g. 聞いてください = please listen)", kind: "kanji", emoji: "👂", lesson: 3 },
  { term: "天", reading: "てん", romaji: "ten", meaning: "heaven; the heavens", kind: "kanji", emoji: "☁️", lesson: 3 },
  { term: "遠い", reading: "とおい", romaji: "tōi", meaning: "far; distant", kind: "kanji", emoji: "🔭", lesson: 3 },
  { term: "祈ります", reading: "いのります", romaji: "inorimasu", meaning: "to pray (polite form)", kind: "kanji", emoji: "🛐", lesson: 3 },
  { term: "もと", reading: "もと", romaji: "moto", meaning: "presence; at the side of (someone)", kind: "hiragana", emoji: "📍", lesson: 3 },
  { term: "子供", reading: "こども", romaji: "kodomo", meaning: "child; children", kind: "kanji", emoji: "🧒", lesson: 3 },
  { term: "復習", reading: "ふくしゅう", romaji: "fukushū", meaning: "review (of what you have learned)", kind: "kanji", emoji: "📚", lesson: 3 },
  { term: "イエス・キリスト", reading: "イエス・キリスト", romaji: "Iesu Kirisuto", meaning: "Jesus Christ", kind: "katakana", emoji: "✝️", lesson: 3 },
  { term: "写真", reading: "しゃしん", romaji: "shashin", meaning: "photograph; photo", kind: "kanji", emoji: "📷", lesson: 3 },
  { term: "読み", reading: "よみ", romaji: "yomi", meaning: "reading (e.g. the reading of a kanji)", kind: "kanji", emoji: "📖", lesson: 3 },
  { term: "書き", reading: "かき", romaji: "kaki", meaning: "writing", kind: "kanji", emoji: "✍️", lesson: 3 },
  { term: "おやすみなさい", reading: "おやすみなさい", romaji: "oyasumi nasai", meaning: "Good night", kind: "hiragana", emoji: "🌙", lesson: 4 },
  { term: "こちらこそ", reading: "こちらこそ", romaji: "kochira koso", meaning: "Likewise; (the pleasure/fault) is mine — said in reply", kind: "hiragana", emoji: "🤝", lesson: 4 },
  { term: "ただいま", reading: "ただいま", romaji: "tadaima", meaning: "I'm home; I'm back (said on returning)", kind: "hiragana", emoji: "🏠", lesson: 4 },
  { term: "お帰りなさい", reading: "おかえりなさい", romaji: "okaeri nasai", meaning: "Welcome back / welcome home (reply to ただいま)", kind: "kanji", emoji: "👋", lesson: 4 },
  { term: "お疲れ様です", reading: "おつかれさまです", romaji: "otsukaresama desu", meaning: "Good work; thanks for your hard work (polite; also a greeting)", kind: "kanji", emoji: "💪", lesson: 4 },
  { term: "お疲れ様", reading: "おつかれさま", romaji: "otsukaresama", meaning: "Good work; thanks for your hard work (informal)", kind: "kanji", emoji: "🙌", lesson: 4 },
  { term: "ありがとう", reading: "ありがとう", romaji: "arigatō", meaning: "Thank you (casual)", kind: "hiragana", emoji: "🙏", lesson: 5 },
  { term: "ありがとうございます", reading: "ありがとうございます", romaji: "arigatō gozaimasu", meaning: "Thank you (polite)", kind: "hiragana", emoji: "🙏", lesson: 5 },
  { term: "どうぞ", reading: "どうぞ", romaji: "dōzo", meaning: "Here you go; please — when offering or handing something over", kind: "hiragana", emoji: "🤲", lesson: 5 },
  { term: "こんにちは", reading: "こんにちは", romaji: "konnichiwa", meaning: "Hello; good afternoon", kind: "hiragana", emoji: "☀️", lesson: 5 },
  { term: "こんばんは", reading: "こんばんは", romaji: "konbanwa", meaning: "Good evening", kind: "hiragana", emoji: "🌆", lesson: 5 },
  { term: "お願いします", reading: "おねがいします", romaji: "onegai shimasu", meaning: "Please; yes please — when making a request", kind: "kanji", emoji: "🙇", lesson: 5 },
  { term: "はじめまして", reading: "はじめまして", romaji: "hajimemashite", meaning: "Nice to meet you (said at a first meeting)", kind: "hiragana", emoji: "🤝", lesson: 5 },
  { term: "お先に失礼します", reading: "おさきにしつれいします", romaji: "osaki ni shitsurei shimasu", meaning: "Excuse me for leaving first (said when you leave before others, e.g. at work)", kind: "kanji", emoji: "👋", lesson: 5 },
  { term: "すみません", reading: "すみません", romaji: "sumimasen", meaning: "Excuse me; sorry; (also used to get attention or to thank)", kind: "hiragana", emoji: "🙇", lesson: 6 },
  { term: "さようなら", reading: "さようなら", romaji: "sayōnara", meaning: "Goodbye", kind: "hiragana", emoji: "👋", lesson: 6 },
  { term: "失礼します", reading: "しつれいします", romaji: "shitsurei shimasu", meaning: "Excuse me; pardon me — when ENTERING or leaving a room (not 'leaving first')", kind: "kanji", emoji: "🚪", lesson: 6 },
  { term: "ありがとうございました", reading: "ありがとうございました", romaji: "arigatō gozaimashita", meaning: "Thank you (polite, past tense — for something already done)", kind: "hiragana", emoji: "🙏", lesson: 6 },
  { term: "わかりますか", reading: "わかりますか", romaji: "wakarimasu ka", meaning: "Do you understand? / Got it?", kind: "hiragana", emoji: "❓", lesson: 7 },
  { term: "それ", reading: "それ", romaji: "sore", meaning: "that (thing near the listener)", kind: "hiragana", emoji: "👉", lesson: 7 },
  { term: "大丈夫です", reading: "だいじょうぶです", romaji: "daijōbu desu", meaning: "It is fine / I am okay / no problem", kind: "kanji", emoji: "👌", lesson: 7 },
  { term: "すごいですね", reading: "すごいですね", romaji: "sugoi desu ne", meaning: "That is amazing / impressive, isn't it!", kind: "hiragana", emoji: "🤩", lesson: 7 },
  { term: "いえいえ", reading: "いえいえ", romaji: "ie ie", meaning: "No no (modest brush-off of praise)", kind: "hiragana", emoji: "🙅", lesson: 7 },
  { term: "よろしく", reading: "よろしく", romaji: "yoroshiku", meaning: "thanks / I'm counting on you (casual; here: please handle it)", kind: "hiragana", emoji: "🙏", lesson: 7 },
  { term: "頑張ります", reading: "がんばります", romaji: "ganbarimasu", meaning: "I'll do my best / I'll work hard", kind: "kanji", emoji: "💪", lesson: 7 },
  { term: "これ", reading: "これ", romaji: "kore", meaning: "this (thing near me)", kind: "hiragana", emoji: "👈", lesson: 8 },
  { term: "あれ", reading: "あれ", romaji: "are", meaning: "that (thing over there)", kind: "hiragana", emoji: "👆", lesson: 8 },
  { term: "どれ", reading: "どれ", romaji: "dore", meaning: "which (thing)", kind: "hiragana", emoji: "❔", lesson: 8 },
  { term: "平気", reading: "へいき", romaji: "heiki", meaning: "calm; unbothered; fine", kind: "kanji", emoji: "😌", lesson: 8 },
  { term: "わかります", reading: "わかります", romaji: "wakarimasu", meaning: "to understand", kind: "hiragana", emoji: "💡", lesson: 8 },
  { term: "できます", reading: "できます", romaji: "dekimasu", meaning: "can do; be able to", kind: "hiragana", emoji: "✅", lesson: 8 },
  { term: "します", reading: "します", romaji: "shimasu", meaning: "to do; play (a sport/game)", kind: "hiragana", emoji: "🏃", lesson: 8 },
  { term: "来ます", reading: "きます", romaji: "kimasu", meaning: "to come", kind: "kanji", emoji: "🚶", lesson: 8 },
  { term: "いい", reading: "いい", romaji: "ii", meaning: "good", kind: "hiragana", emoji: "👍", lesson: 8 },
  { term: "よろしい", reading: "よろしい", romaji: "yoroshii", meaning: "good (polite)", kind: "hiragana", emoji: "🙆", lesson: 8 },
  { term: "今", reading: "いま", romaji: "ima", meaning: "now", kind: "kanji", emoji: "⏰", lesson: 9 },
  { term: "今日", reading: "きょう", romaji: "kyō", meaning: "today", kind: "kanji", emoji: "📅", lesson: 9 },
  { term: "明日", reading: "あした", romaji: "ashita", meaning: "tomorrow", kind: "kanji", emoji: "🌅", lesson: 9 },
  { term: "これから", reading: "これから", romaji: "kore kara", meaning: "from now on", kind: "hiragana", emoji: "➡️", lesson: 9 },
  { term: "電話", reading: "でんわ", romaji: "denwa", meaning: "telephone; phone call", kind: "kanji", emoji: "📞", lesson: 9 },
  { term: "ケータイ", reading: "ケータイ", romaji: "kētai", meaning: "cell phone", kind: "katakana", emoji: "📱", lesson: 9 },
  { term: "勉強", reading: "べんきょう", romaji: "benkyō", meaning: "study", kind: "kanji", emoji: "📖", lesson: 9 },
  { term: "お仕事", reading: "おしごと", romaji: "oshigoto", meaning: "work; job (polite)", kind: "kanji", emoji: "💼", lesson: 9 },
  { term: "宿題", reading: "しゅくだい", romaji: "shukudai", meaning: "homework", kind: "kanji", emoji: "📝", lesson: 9 },
  { term: "テスト", reading: "テスト", romaji: "tesuto", meaning: "test", kind: "katakana", emoji: "🧪", lesson: 9 },
  { term: "レポート", reading: "レポート", romaji: "repōto", meaning: "report; paper", kind: "katakana", emoji: "📄", lesson: 9 },
  { term: "教科書", reading: "きょうかしょ", romaji: "kyōkasho", meaning: "textbook", kind: "kanji", emoji: "📚", lesson: 9 },
  { term: "行きます", reading: "いきます", romaji: "ikimasu", meaning: "to go", kind: "kanji", emoji: "🚶", lesson: 9 },
  { term: "います", reading: "います", romaji: "imasu", meaning: "to be / exist (living things)", kind: "hiragana", emoji: "🧍", lesson: 9 },
  { term: "書きます", reading: "かきます", romaji: "kakimasu", meaning: "to write", kind: "kanji", emoji: "✍️", lesson: 9 },
  { term: "始めます", reading: "はじめます", romaji: "hajimemasu", meaning: "to begin (something)", kind: "kanji", emoji: "▶️", lesson: 9 },
  { term: "終わります", reading: "おわります", romaji: "owarimasu", meaning: "to end; finish", kind: "kanji", emoji: "⏹️", lesson: 9 },
  { term: "ちょっと", reading: "ちょっと", romaji: "chotto", meaning: "a little; (softener / polite refusal)", kind: "hiragana", emoji: "🤏", lesson: 9 },
  { term: "あとで", reading: "あとで", romaji: "ato de", meaning: "later", kind: "hiragana", emoji: "⏳", lesson: 9 },
  { term: "あのう", reading: "あのう", romaji: "anō", meaning: "um… (hesitation)", kind: "hiragana", emoji: "😶", lesson: 9 },
  { term: "ええと", reading: "ええと", romaji: "ēto", meaning: "uh… (hesitation, searching for words)", kind: "hiragana", emoji: "🤔", lesson: 9 },
  { term: "好き", reading: "すき", romaji: "suki", meaning: "liking; fondness", kind: "kanji", emoji: "💗", lesson: 10 },
  { term: "大好き", reading: "だいすき", romaji: "daisuki", meaning: "really like; love", kind: "kanji", emoji: "😍", lesson: 10 },
  { term: "何", reading: "なに", romaji: "nani", meaning: "what", kind: "kanji", emoji: "❓", lesson: 10 },
  { term: "クッキー", reading: "クッキー", romaji: "kukkii", meaning: "cookie", kind: "katakana", emoji: "🍪", lesson: 10 },
  { term: "ご飯", reading: "ごはん", romaji: "gohan", meaning: "cooked rice; a meal", kind: "kanji", emoji: "🍚", lesson: 10 },
  { term: "お弁当", reading: "おべんとう", romaji: "obentō", meaning: "boxed lunch", kind: "kanji", emoji: "🍱", lesson: 10 },
  { term: "お茶", reading: "おちゃ", romaji: "ocha", meaning: "tea", kind: "kanji", emoji: "🍵", lesson: 10 },
  { term: "お水", reading: "おみず", romaji: "omizu", meaning: "water", kind: "kanji", emoji: "💧", lesson: 10 },
  { term: "コーヒー", reading: "コーヒー", romaji: "kōhii", meaning: "coffee", kind: "katakana", emoji: "☕", lesson: 10 },
  { term: "飲み物", reading: "のみもの", romaji: "nomimono", meaning: "drink; beverage", kind: "kanji", emoji: "🥤", lesson: 10 },
  { term: "食べます", reading: "たべます", romaji: "tabemasu", meaning: "to eat", kind: "kanji", emoji: "🍽️", lesson: 10 },
  { term: "飲みます", reading: "のみます", romaji: "nomimasu", meaning: "to drink", kind: "kanji", emoji: "🥛", lesson: 10 },
  { term: "読みます", reading: "よみます", romaji: "yomimasu", meaning: "to read", kind: "kanji", emoji: "📖", lesson: 10 },
  { term: "おいしい", reading: "おいしい", romaji: "oishii", meaning: "delicious", kind: "hiragana", emoji: "😋", lesson: 10 },
  { term: "おいしそう", reading: "おいしそう", romaji: "oishisō", meaning: "looks delicious", kind: "hiragana", emoji: "🤤", lesson: 10 },
  { term: "おもしろい", reading: "おもしろい", romaji: "omoshiroi", meaning: "interesting", kind: "hiragana", emoji: "🙂", lesson: 10 },
  { term: "きれい", reading: "きれい", romaji: "kirei", meaning: "pretty; clean", kind: "hiragana", emoji: "✨", lesson: 10 },
  { term: "よかったら", reading: "よかったら", romaji: "yokattara", meaning: "if you like", kind: "hiragana", emoji: "🤝", lesson: 10 },
  { term: "こちら", reading: "こちら", romaji: "kochira", meaning: "this way / this one (polite)", kind: "hiragana", emoji: "👉", lesson: 11 },
  { term: "そちら", reading: "そちら", romaji: "sochira", meaning: "that way (near you, polite)", kind: "hiragana", emoji: "👉", lesson: 11 },
  { term: "あちら", reading: "あちら", romaji: "achira", meaning: "that way over there (polite)", kind: "hiragana", emoji: "👉", lesson: 11 },
  { term: "どちら", reading: "どちら", romaji: "dochira", meaning: "which way / where (polite)", kind: "hiragana", emoji: "❔", lesson: 11 },
  { term: "ここ", reading: "ここ", romaji: "koko", meaning: "here", kind: "hiragana", emoji: "📍", lesson: 11 },
  { term: "そこ", reading: "そこ", romaji: "soko", meaning: "there (near you)", kind: "hiragana", emoji: "📍", lesson: 11 },
  { term: "あそこ", reading: "あそこ", romaji: "asoko", meaning: "over there", kind: "hiragana", emoji: "📍", lesson: 11 },
  { term: "どこ", reading: "どこ", romaji: "doko", meaning: "where", kind: "hiragana", emoji: "❔", lesson: 11 },
  { term: "こっち", reading: "こっち", romaji: "kotchi", meaning: "this way (casual)", kind: "hiragana", emoji: "👉", lesson: 11 },
  { term: "そっち", reading: "そっち", romaji: "sotchi", meaning: "that way (casual)", kind: "hiragana", emoji: "👉", lesson: 11 },
  { term: "あっち", reading: "あっち", romaji: "atchi", meaning: "over there (casual)", kind: "hiragana", emoji: "👉", lesson: 11 },
  { term: "どっち", reading: "どっち", romaji: "dotchi", meaning: "which way (casual)", kind: "hiragana", emoji: "❔", lesson: 11 },
  { term: "そう", reading: "そう", romaji: "sō", meaning: "that way; so; right", kind: "hiragana", emoji: "✔️", lesson: 11 },
  { term: "どう", reading: "どう", romaji: "dō", meaning: "how; how about", kind: "hiragana", emoji: "❔", lesson: 11 },
  { term: "どなた", reading: "どなた", romaji: "donata", meaning: "who (polite)", kind: "hiragana", emoji: "🧑", lesson: 11 },
  { term: "だれ", reading: "だれ", romaji: "dare", meaning: "who", kind: "hiragana", emoji: "🧑", lesson: 11 },
  { term: "会社", reading: "かいしゃ", romaji: "kaisha", meaning: "office; company", kind: "kanji", emoji: "🏢", lesson: 12 },
  { term: "うち", reading: "うち", romaji: "uchi", meaning: "house; home; one’s in-group", kind: "hiragana", emoji: "🏠", lesson: 12 },
  { term: "家", reading: "いえ", romaji: "ie", meaning: "house; home", kind: "kanji", emoji: "🏠", lesson: 12 },
  { term: "お宅", reading: "おたく", romaji: "otaku", meaning: "home (polite); your place", kind: "kanji", emoji: "🏡", lesson: 12 },
  { term: "寮", reading: "りょう", romaji: "ryō", meaning: "dormitory", kind: "kanji", emoji: "🏨", lesson: 12 },
  { term: "アパート", reading: "アパート", romaji: "apāto", meaning: "apartment", kind: "katakana", emoji: "🏬", lesson: 12 },
  { term: "コンビニ", reading: "コンビニ", romaji: "konbini", meaning: "convenience store", kind: "katakana", emoji: "🏪", lesson: 12 },
  { term: "駅", reading: "えき", romaji: "eki", meaning: "train station", kind: "kanji", emoji: "🚉", lesson: 12 },
  { term: "トイレ", reading: "トイレ", romaji: "toire", meaning: "toilet; restroom", kind: "katakana", emoji: "🚻", lesson: 12 },
  { term: "すること", reading: "すること", romaji: "suru koto", meaning: "something to do", kind: "hiragana", emoji: "📋", lesson: 12 },
  { term: "あります", reading: "あります", romaji: "arimasu", meaning: "to exist / there is (non-living)", kind: "hiragana", emoji: "📦", lesson: 12 },
  { term: "何か", reading: "なにか", romaji: "nani ka", meaning: "something", kind: "kanji", emoji: "❓", lesson: 12 },
  { term: "別に", reading: "べつに", romaji: "betsu ni", meaning: "(not) particularly", kind: "kanji", emoji: "🤷", lesson: 12 },
  { term: "忙しい", reading: "いそがしい", romaji: "isogashii", meaning: "busy", kind: "kanji", emoji: "🏃", lesson: 13 },
  { term: "けど", reading: "けど", romaji: "kedo", meaning: "but; though", kind: "hiragana", emoji: "↔️", lesson: 13 },
  { term: "いや", reading: "いや", romaji: "iya", meaning: "no (informal); uhh (hesitation)", kind: "hiragana", emoji: "🙅", lesson: 13 },
  { term: "わかりました", reading: "わかりました", romaji: "wakarimashita", meaning: "understood; got it", kind: "hiragana", emoji: "✅", lesson: 13 },
  { term: "高い", reading: "たかい", romaji: "takai", meaning: "expensive; high; tall", kind: "kanji", emoji: "💸", lesson: 13 },
  { term: "安い", reading: "やすい", romaji: "yasui", meaning: "cheap; inexpensive", kind: "kanji", emoji: "🏷️", lesson: 13 },
  { term: "大きい", reading: "おおきい", romaji: "ōkii", meaning: "big", kind: "kanji", emoji: "🔼", lesson: 13 },
  { term: "小さい", reading: "ちいさい", romaji: "chiisai", meaning: "small", kind: "kanji", emoji: "🔽", lesson: 13 },
  { term: "近い", reading: "ちかい", romaji: "chikai", meaning: "close; near", kind: "kanji", emoji: "📍", lesson: 13 },
  { term: "難しい", reading: "むずかしい", romaji: "muzukashii", meaning: "hard; difficult", kind: "kanji", emoji: "🧩", lesson: 13 },
  { term: "易しい", reading: "やさしい", romaji: "yasashii", meaning: "easy", kind: "kanji", emoji: "😺", lesson: 13 },
  { term: "つまらない", reading: "つまらない", romaji: "tsumaranai", meaning: "boring", kind: "hiragana", emoji: "😐", lesson: 13 },
  { term: "とても", reading: "とても", romaji: "totemo", meaning: "very", kind: "hiragana", emoji: "‼️", lesson: 13 },
  { term: "よくない", reading: "よくない", romaji: "yokunai", meaning: "not good (negative of いい)", kind: "hiragana", emoji: "👎", lesson: 14 },
  { term: "か", reading: "か", romaji: "ka", meaning: "question particle (makes a sentence a question)", kind: "hiragana", emoji: "❓", lesson: 14 },
  { term: "ね", reading: "ね", romaji: "ne", meaning: "particle seeking agreement — “right?”", kind: "hiragana", emoji: "🤝", lesson: 14 },
  { term: "よ", reading: "よ", romaji: "yo", meaning: "particle for emphasis / new info — “you know”", kind: "hiragana", emoji: "❗", lesson: 14 },
  { term: "外", reading: "そと", romaji: "soto", meaning: "outside; the out-group", kind: "kanji", emoji: "🌳", lesson: 14 },
  { term: "ような", reading: "ような", romaji: "yōna", meaning: "like; similar to", kind: "hiragana", emoji: "🔁", lesson: 14 },
  { term: "お母さん", reading: "おかあさん", romaji: "okāsan", meaning: "mother", kind: "kanji", emoji: "👩", lesson: 14 },
  { term: "けれど", reading: "けれど", romaji: "keredo", meaning: "but; however (more formal than けど)", kind: "hiragana", emoji: "↔️", lesson: 14 },
  { term: "遊んだ", reading: "あそんだ", romaji: "asonda", meaning: "played (plain past of 遊ぶ)", kind: "kanji", emoji: "🎮", lesson: 14 },
  { term: "入れる", reading: "いれる", romaji: "ireru", meaning: "to put in; insert", kind: "kanji", emoji: "📥", lesson: 14 },
  { term: "わたくし", reading: "わたくし", romaji: "watakushi", meaning: "I (very formal)", kind: "hiragana", emoji: "🎩", lesson: 14 },
  { term: "あたし", reading: "あたし", romaji: "atashi", meaning: "I (casual, feminine)", kind: "hiragana", emoji: "🙋", lesson: 14 },
  { term: "俺", reading: "おれ", romaji: "ore", meaning: "I (masculine, rough/casual)", kind: "kanji", emoji: "😎", lesson: 14 },
  { term: "君", reading: "きみ", romaji: "kimi", meaning: "you (casual; to someone close or junior)", kind: "kanji", emoji: "👈", lesson: 14 },
  { term: "お前", reading: "おまえ", romaji: "omae", meaning: "you (rough, very casual)", kind: "kanji", emoji: "👉", lesson: 14 },
  { term: "ケーキ", reading: "ケーキ", romaji: "kēki", meaning: "cake", kind: "katakana", emoji: "🍰", lesson: 15 },
  { term: "朝ご飯", reading: "あさごはん", romaji: "asagohan", meaning: "breakfast", kind: "kanji", emoji: "🍳", lesson: 15 },
  { term: "昼ご飯", reading: "ひるごはん", romaji: "hirugohan", meaning: "lunch", kind: "kanji", emoji: "🍱", lesson: 15 },
  { term: "晩ご飯", reading: "ばんごはん", romaji: "bangohan", meaning: "dinner", kind: "kanji", emoji: "🍛", lesson: 15 },
  { term: "お寿司", reading: "おすし", romaji: "osushi", meaning: "sushi", kind: "kanji", emoji: "🍣", lesson: 15 },
  { term: "焼き鳥", reading: "やきとり", romaji: "yakitori", meaning: "grilled chicken skewers", kind: "kanji", emoji: "🍢", lesson: 15 },
  { term: "うどん", reading: "うどん", romaji: "udon", meaning: "udon (wheat noodles)", kind: "hiragana", emoji: "🍜", lesson: 15 },
  { term: "そば", reading: "そば", romaji: "soba", meaning: "soba (buckwheat noodles)", kind: "hiragana", emoji: "🍜", lesson: 15 },
  { term: "カレーライス", reading: "カレーライス", romaji: "karē raisu", meaning: "curry rice", kind: "katakana", emoji: "🍛", lesson: 15 },
  { term: "ラーメン", reading: "ラーメン", romaji: "rāmen", meaning: "ramen", kind: "katakana", emoji: "🍜", lesson: 15 },
  { term: "ビール", reading: "ビール", romaji: "bīru", meaning: "beer", kind: "katakana", emoji: "🍺", lesson: 15 },
  { term: "ウーロン茶", reading: "ウーロンちゃ", romaji: "ūroncha", meaning: "oolong tea", kind: "mixed", emoji: "🍵", lesson: 15 },
  { term: "紅茶", reading: "こうちゃ", romaji: "kōcha", meaning: "black tea", kind: "kanji", emoji: "🍵", lesson: 15 },
  { term: "ミルク", reading: "ミルク", romaji: "miruku", meaning: "milk", kind: "katakana", emoji: "🥛", lesson: 15 },
  { term: "ジュース", reading: "ジュース", romaji: "jūsu", meaning: "juice", kind: "katakana", emoji: "🧃", lesson: 15 },
  { term: "薬", reading: "くすり", romaji: "kusuri", meaning: "medicine", kind: "kanji", emoji: "💊", lesson: 15 },
  { term: "ねえ", reading: "ねえ", romaji: "nee", meaning: "particle: shared feeling — “isn’t it!”", kind: "hiragana", emoji: "💬", lesson: 15 },
  { term: "わあ", reading: "わあ", romaji: "waa", meaning: "wow", kind: "hiragana", emoji: "😮", lesson: 15 },
  { term: "え", reading: "え", romaji: "e", meaning: "huh? what?", kind: "hiragana", emoji: "❓", lesson: 15 },
  { term: "よろしかったら", reading: "よろしかったら", romaji: "yoroshikattara", meaning: "if you would like (polite)", kind: "hiragana", emoji: "🤝", lesson: 15 },
  { term: "自由", reading: "じゆう", romaji: "jiyū", meaning: "freedom; free (time)", kind: "kanji", emoji: "🕊️", lesson: 16 },
  { term: "書く", reading: "かく", romaji: "kaku", meaning: "to write (plain/dictionary form of 書きます)", kind: "kanji", emoji: "✍️", lesson: 16 },
  { term: "人々", reading: "ひとびと", romaji: "hitobito", meaning: "people", kind: "kanji", emoji: "👥", lesson: 16 },
  { term: "最近", reading: "さいきん", romaji: "saikin", meaning: "recently; lately", kind: "kanji", emoji: "🕐", lesson: 16 },
  { term: "赤ちゃん", reading: "あかちゃん", romaji: "akachan", meaning: "baby", kind: "kanji", emoji: "👶", lesson: 16 },
  { term: "大丈夫", reading: "だいじょうぶ", romaji: "daijōbu", meaning: "fine; all right; safe", kind: "kanji", emoji: "👌", lesson: 17 },
  { term: "すごい", reading: "すごい", romaji: "sugoi", meaning: "amazing; great", kind: "hiragana", emoji: "🤩", lesson: 17 },
  { term: "はい", reading: "はい", romaji: "hai", meaning: "yes; here you are; (acknowledging)", kind: "hiragana", emoji: "🙋", lesson: 17 },
  { term: "よろしくお願いします", reading: "よろしくおねがいします", romaji: "yoroshiku onegai shimasu", meaning: "nice to meet you; please treat me well", kind: "mixed", emoji: "🤝", lesson: 5 },
  { term: "どうぞよろしく", reading: "どうぞよろしく", romaji: "dōzo yoroshiku", meaning: "pleased to meet you (polite)", kind: "hiragana", emoji: "🤝", lesson: 5 },
  { term: "おはようございます", reading: "おはようございます", romaji: "ohayō gozaimasu", meaning: "good morning (polite)", kind: "hiragana", emoji: "🌅", lesson: 5 },
  { term: "どうも", reading: "どうも", romaji: "dōmo", meaning: "thanks; hello (casual)", kind: "hiragana", emoji: "🙏", lesson: 5 },
  { term: "では", reading: "では", romaji: "de wa", meaning: "well then; in that case", kind: "hiragana", emoji: "👋", lesson: 5 },
  { term: "お疲れ様でした", reading: "おつかれさまでした", romaji: "otsukaresama deshita", meaning: "good work (after a task is done)", kind: "kanji", emoji: "👏", lesson: 5 },
  { term: "寝る", reading: "ねる", romaji: "neru", meaning: "to sleep; to go to bed (dictionary form)", kind: "kanji", emoji: "😴", lesson: 16 },
  { term: "起きる", reading: "おきる", romaji: "okiru", meaning: "to get up; to wake up (dictionary form)", kind: "kanji", emoji: "⏰", lesson: 16 },
  { term: "起きます", reading: "おきます", romaji: "okimasu", meaning: "get up; wake up (polite form)", kind: "kanji", emoji: "🌅", lesson: 16 },
  { term: "光", reading: "ひかり", romaji: "hikari", meaning: "light", kind: "kanji", emoji: "💡", lesson: 16 },
  { term: "夏", reading: "なつ", romaji: "natsu", meaning: "summer", kind: "kanji", emoji: "☀️", lesson: 16 },
  { term: "冬", reading: "ふゆ", romaji: "fuyu", meaning: "winter", kind: "kanji", emoji: "⛄", lesson: 16 },
  { term: "秋", reading: "あき", romaji: "aki", meaning: "fall; autumn", kind: "kanji", emoji: "🍁", lesson: 16 },
  { term: "春", reading: "はる", romaji: "haru", meaning: "spring", kind: "kanji", emoji: "🌸", lesson: 16 },
  { term: "見る", reading: "みる", romaji: "miru", meaning: "to see; to watch (dictionary form)", kind: "kanji", emoji: "👀", lesson: 16 },
  { term: "先祖", reading: "せんぞ", romaji: "senzo", meaning: "ancestor(s)", kind: "kanji", emoji: "🏮", lesson: 16 },
  { term: "大学", reading: "だいがく", romaji: "daigaku", meaning: "university; college", kind: "kanji", emoji: "🎓", lesson: 18, sec: "3-1" },
  { term: "高校", reading: "こうこう", romaji: "kōkō", meaning: "high school", kind: "kanji", emoji: "🏫", lesson: 18, sec: "3-1" },
  { term: "大学院", reading: "だいがくいん", romaji: "daigakuin", meaning: "graduate school", kind: "kanji", emoji: "📜", lesson: 18, sec: "3-1" },
  { term: "日本語", reading: "にほんご", romaji: "Nihongo", meaning: "Japanese (language)", kind: "kanji", emoji: "🇯🇵", lesson: 18, sec: "3-1" },
  { term: "英語", reading: "えいご", romaji: "Eigo", meaning: "English (language)", kind: "kanji", emoji: "🇺🇸", lesson: 18, sec: "3-1" },
  { term: "中国語", reading: "ちゅうごくご", romaji: "Chūgokugo", meaning: "Chinese (language)", kind: "kanji", emoji: "🇨🇳", lesson: 18, sec: "3-1" },
  { term: "韓国語", reading: "かんこくご", romaji: "Kankokugo", meaning: "Korean (language)", kind: "kanji", emoji: "🇰🇷", lesson: 18, sec: "3-1" },
  { term: "フランス語", reading: "ふらんすご", romaji: "Furansugo", meaning: "French (language)", kind: "mixed", emoji: "🇫🇷", lesson: 18, sec: "3-1" },
  { term: "スペイン語", reading: "すぺいんご", romaji: "Supeingo", meaning: "Spanish (language)", kind: "mixed", emoji: "🇪🇸", lesson: 18, sec: "3-1" },
  { term: "ロシア語", reading: "ろしあご", romaji: "Roshiago", meaning: "Russian (language)", kind: "mixed", emoji: "🇷🇺", lesson: 18, sec: "3-1" },
  { term: "何語", reading: "なにご", romaji: "nanigo", meaning: "which language", kind: "kanji", emoji: "🗣️", lesson: 18, sec: "3-1" },
  { term: "学生", reading: "がくせい", romaji: "gakusei", meaning: "student", kind: "kanji", emoji: "🧑‍🎓", lesson: 18, sec: "3-1" },
  { term: "サークル", reading: "さーくる", romaji: "sākuru", meaning: "(student) club; circle", kind: "katakana", emoji: "👥", lesson: 18, sec: "3-1" },
  { term: "〜会", reading: "〜かい", romaji: "-kai", meaning: "organization; club; association", kind: "kanji", emoji: "🤝", lesson: 18, sec: "3-1" },
  { term: "クラブ", reading: "くらぶ", romaji: "kurabu", meaning: "club", kind: "katakana", emoji: "♣️", lesson: 18, sec: "3-1" },
  { term: "日本語クラブ", reading: "にほんごくらぶ", romaji: "Nihongo-kurabu", meaning: "Japanese Language Club", kind: "mixed", emoji: "🇯🇵", lesson: 18, sec: "3-1" },
  { term: "日本人", reading: "にほんじん", romaji: "Nihonjin", meaning: "Japanese (person)", kind: "kanji", emoji: "🙋", lesson: 18, sec: "3-1" },
  { term: "アメリカ人", reading: "あめりかじん", romaji: "Amerikajin", meaning: "American (person)", kind: "mixed", emoji: "🗽", lesson: 18, sec: "3-1" },
  { term: "中国人", reading: "ちゅうごくじん", romaji: "Chūgokujin", meaning: "Chinese (person)", kind: "kanji", emoji: "🐉", lesson: 18, sec: "3-1" },
  { term: "韓国人", reading: "かんこくじん", romaji: "Kankokujin", meaning: "Korean (person)", kind: "kanji", emoji: "🌸", lesson: 18, sec: "3-1" },
  { term: "フランス人", reading: "ふらんすじん", romaji: "Furansujin", meaning: "French (person)", kind: "mixed", emoji: "🥖", lesson: 18, sec: "3-1" },
  { term: "スペイン人", reading: "すぺいんじん", romaji: "Supeinjin", meaning: "Spanish (person)", kind: "mixed", emoji: "💃", lesson: 18, sec: "3-1" },
  { term: "ロシア人", reading: "ろしあじん", romaji: "Roshiajin", meaning: "Russian (person)", kind: "mixed", emoji: "🪆", lesson: 18, sec: "3-1" },
  { term: "何人", reading: "なにじん", romaji: "nanijin", meaning: "what nationality", kind: "kanji", emoji: "🌍", lesson: 18, sec: "3-1" },
  { term: "日系人", reading: "にっけいじん", romaji: "nikkeijin", meaning: "person of Japanese heritage", kind: "kanji", emoji: "🌏", lesson: 18, sec: "3-1" },
  { term: "外国人", reading: "がいこくじん", romaji: "gaikokujin", meaning: "foreigner", kind: "kanji", emoji: "✈️", lesson: 18, sec: "3-1" },
  { term: "外人", reading: "がいじん", romaji: "gaijin", meaning: "foreigner (can be derogatory)", kind: "kanji", emoji: "⚠️", lesson: 18, sec: "3-1" },
  { term: "いいます", reading: "いいます", romaji: "iimasu", meaning: "is called; say", kind: "hiragana", emoji: "💬", lesson: 18, sec: "3-1" },
  { term: "って", reading: "って", romaji: "tte", meaning: "(casual topic particle: 'what's ~?')", kind: "hiragana", emoji: "❓", lesson: 18, sec: "3-1" },
  { term: "〜のこと", reading: "〜のこと", romaji: "~no koto", meaning: "it means ~; it's a matter of ~", kind: "hiragana", emoji: "ℹ️", lesson: 18, sec: "3-1" },
  { term: "なるほど", reading: "なるほど", romaji: "naruhodo", meaning: "oh, I see now", kind: "hiragana", emoji: "💡", lesson: 18, sec: "3-1" },
  { term: "まあ", reading: "まあ", romaji: "mā", meaning: "I guess (non-committal)", kind: "hiragana", emoji: "🤔", lesson: 18, sec: "3-1" },
  { term: "が", reading: "が", romaji: "ga", meaning: "but; and (connecting particle, softens)", kind: "hiragana", emoji: "🔗", lesson: 16 },
  { term: "けれども", reading: "けれども", romaji: "keredomo", meaning: "but; however (formal form of けど)", kind: "hiragana", emoji: "↔️", lesson: 16 },
  // ── Scene 3-2: 今何時ですか？ (What time is it now?) ──
  { term: "何時", reading: "なんじ", romaji: "nan-ji", meaning: "what time?", kind: "kanji", emoji: "🕐", lesson: 19, sec: "3-2" },
  { term: "〜時", reading: "〜じ", romaji: "~ji", meaning: "o'clock (hour counter); watch the irregular hours: 4, 7, 9", kind: "kanji", emoji: "⏰", lesson: 19, sec: "3-2" },
  { term: "四時", reading: "よじ", romaji: "yo-ji", meaning: "4 o'clock (irregular: NOT よんじ or しじ)", kind: "kanji", emoji: "4️⃣", lesson: 19, sec: "3-2" },
  { term: "七時", reading: "しちじ", romaji: "shichi-ji", meaning: "7 o'clock (しちじ, or ななじ to avoid mishearing as 1)", kind: "kanji", emoji: "7️⃣", lesson: 19, sec: "3-2" },
  { term: "九時", reading: "くじ", romaji: "ku-ji", meaning: "9 o'clock (irregular: NOT きゅうじ)", kind: "kanji", emoji: "9️⃣", lesson: 19, sec: "3-2" },
  { term: "零時", reading: "れいじ", romaji: "rei-ji", meaning: "0:00; midnight (24-hour style)", kind: "kanji", emoji: "🌙", lesson: 19, sec: "3-2" },
  { term: "〜時半", reading: "〜じはん", romaji: "~ji-han", meaning: "half past ~ (2時半 = 2:30)", kind: "kanji", emoji: "🕜", lesson: 19, sec: "3-2" },
  { term: "前", reading: "まえ", romaji: "mae", meaning: "before (time); in front of", kind: "kanji", emoji: "⏪", lesson: 19, sec: "3-2" },
  { term: "過ぎ", reading: "すぎ", romaji: "sugi", meaning: "past; after (a time)", kind: "kanji", emoji: "⏩", lesson: 19, sec: "3-2" },
  { term: "〜ごろ", reading: "〜ごろ", romaji: "~goro", meaning: "around ~ (approximate time: 2時ごろ = around 2:00)", kind: "hiragana", emoji: "🌀", lesson: 19, sec: "3-2" },
  { term: "授業", reading: "じゅぎょう", romaji: "jugyō", meaning: "class (session)", kind: "kanji", emoji: "🏫", lesson: 19, sec: "3-2" },
  { term: "会議", reading: "かいぎ", romaji: "kaigi", meaning: "meeting; conference", kind: "kanji", emoji: "🗣️", lesson: 19, sec: "3-2" },
  { term: "(お)休み", reading: "(お)やすみ", romaji: "(o)yasumi", meaning: "day off; break; vacation", kind: "kanji", emoji: "🏖️", lesson: 19, sec: "3-2" },
  { term: "病気", reading: "びょうき", romaji: "byōki", meaning: "sick; illness", kind: "kanji", emoji: "🤒", lesson: 19, sec: "3-2" },
  { term: "帰ります", reading: "かえります", romaji: "kaerimasu (kaeranai)", meaning: "return; go home (neg. 帰らない)", kind: "kanji", emoji: "🏠", lesson: 19, sec: "3-2" },
  { term: "待ちます", reading: "まちます", romaji: "machimasu (matanai)", meaning: "wait (neg. 待たない)", kind: "kanji", emoji: "⏳", lesson: 19, sec: "3-2" },
  { term: "勉強します", reading: "べんきょうします", romaji: "benkyō-shimasu", meaning: "study (verb form of 勉強)", kind: "kanji", emoji: "📚", lesson: 19, sec: "3-2" },
  { term: "仕事します", reading: "しごとします", romaji: "shigoto-shimasu", meaning: "work (verb form of 仕事)", kind: "kanji", emoji: "💼", lesson: 19, sec: "3-2" },
  { term: "宿題します", reading: "しゅくだいします", romaji: "shukudai-shimasu", meaning: "do homework", kind: "kanji", emoji: "📝", lesson: 19, sec: "3-2" },
  { term: "授業します", reading: "じゅぎょうします", romaji: "jugyō-shimasu", meaning: "conduct a class; teach a session", kind: "kanji", emoji: "👩‍🏫", lesson: 19, sec: "3-2" },
  { term: "会議します", reading: "かいぎします", romaji: "kaigi-shimasu", meaning: "hold a meeting", kind: "kanji", emoji: "📋", lesson: 19, sec: "3-2" },
  { term: "〜は", reading: "〜は", romaji: "~ wa", meaning: "as for ~ (topic particle; picks one thing out of a known group)", kind: "hiragana", emoji: "👆", lesson: 19, sec: "3-2" },
  { term: "〜と", reading: "〜と", romaji: "~ to", meaning: "and (joins nouns: X と Y)", kind: "hiragana", emoji: "➕", lesson: 19, sec: "3-2" },
  { term: "やっぱり", reading: "やっぱり", romaji: "yappari", meaning: "as expected; sure enough", kind: "hiragana", emoji: "😌", lesson: 19, sec: "3-2" },
  // ── Scene 3-3: 「スマフォ」じゃなくて「スマホ」 (correcting words) ──
  { term: "スマホ", reading: "スマホ", romaji: "sumaho", meaning: "smartphone (NOT sumafo — the f becomes h)", kind: "katakana", emoji: "📱", lesson: 20, sec: "3-3" },
  { term: "鉛筆", reading: "えんぴつ", romaji: "enpitsu", meaning: "pencil", kind: "kanji", emoji: "✏️", lesson: 20, sec: "3-3" },
  { term: "ペン", reading: "ペン", romaji: "pen", meaning: "pen", kind: "katakana", emoji: "🖊️", lesson: 20, sec: "3-3" },
  { term: "シャーペン", reading: "シャーペン", romaji: "shāpen", meaning: "mechanical pencil (from 'sharp pencil')", kind: "katakana", emoji: "📝", lesson: 20, sec: "3-3" },
  { term: "アプリ", reading: "アプリ", romaji: "apuri", meaning: "app; application", kind: "katakana", emoji: "📲", lesson: 20, sec: "3-3" },
  { term: "ニュース", reading: "ニュース", romaji: "nyūsu", meaning: "news", kind: "katakana", emoji: "📰", lesson: 20, sec: "3-3" },
  { term: "〜じゃなくて", reading: "〜じゃなくて", romaji: "~ ja nakute", meaning: "not A, but B (correcting: AじゃなくてB) — also for fixing your own slips", kind: "hiragana", emoji: "🔄", lesson: 20, sec: "3-3" },
  { term: "日本語で何といいますか", reading: "にほんごでなんといいますか", romaji: "nihongo de nan to iimasu ka", meaning: "how do you say (that) in Japanese?", kind: "mixed", emoji: "🗾", lesson: 20, sec: "3-3" },
  { term: "え？", reading: "え？", romaji: "e?", meaning: "what? huh? (didn't catch it / disbelief; politer: はい?)", kind: "hiragana", emoji: "❓", lesson: 20, sec: "3-3" },
  { term: "なるほど", reading: "なるほど", romaji: "naruhodo", meaning: "I see; that makes sense", kind: "hiragana", emoji: "💡", lesson: 20, sec: "3-3" },
  { term: "そうそう", reading: "そうそう", romaji: "sō sō", meaning: "right, right; yes, exactly", kind: "hiragana", emoji: "👍", lesson: 20, sec: "3-3" },
  // ── Scene 3-4: 一緒にしませんか？ (inviting someone / scheduling) ──
  { term: "あさって", reading: "あさって", romaji: "asatte", meaning: "the day after tomorrow", kind: "hiragana", emoji: "📅", lesson: 21, sec: "3-4" },
  { term: "今度", reading: "こんど", romaji: "kondo", meaning: "next time; this coming (occasion)", kind: "kanji", emoji: "🔜", lesson: 21, sec: "3-4" },
  { term: "次", reading: "つぎ", romaji: "tsugi", meaning: "next; the following", kind: "kanji", emoji: "⏭️", lesson: 21, sec: "3-4" },
  { term: "週末", reading: "しゅうまつ", romaji: "shūmatsu", meaning: "weekend", kind: "kanji", emoji: "🎉", lesson: 21, sec: "3-4" },
  { term: "午前", reading: "ごぜん", romaji: "gozen", meaning: "a.m.; morning (before noon)", kind: "kanji", emoji: "🌅", lesson: 21, sec: "3-4" },
  { term: "午後", reading: "ごご", romaji: "gogo", meaning: "p.m.; afternoon", kind: "kanji", emoji: "🌇", lesson: 21, sec: "3-4" },
  { term: "朝", reading: "あさ", romaji: "asa", meaning: "morning", kind: "kanji", emoji: "🌄", lesson: 21, sec: "3-4" },
  { term: "晩", reading: "ばん", romaji: "ban", meaning: "evening", kind: "kanji", emoji: "🌆", lesson: 21, sec: "3-4" },
  { term: "だめ（な）", reading: "だめ（な）", romaji: "dame (na)", meaning: "no good; won't work (な-adj)", kind: "hiragana", emoji: "🚫", lesson: 21, sec: "3-4" },
  { term: "一緒", reading: "いっしょ", romaji: "issho", meaning: "together (一緒に = together with)", kind: "kanji", emoji: "👥", lesson: 21, sec: "3-4" },
  { term: "みんな", reading: "みんな", romaji: "minna", meaning: "everyone; all", kind: "hiragana", emoji: "👨‍👩‍👧‍👦", lesson: 21, sec: "3-4" },
  { term: "テニス", reading: "テニス", romaji: "tenisu", meaning: "tennis", kind: "katakana", emoji: "🎾", lesson: 21, sec: "3-4" },
  { term: "ゴルフ", reading: "ゴルフ", romaji: "gorufu", meaning: "golf", kind: "katakana", emoji: "⛳", lesson: 21, sec: "3-4" },
  { term: "サッカー", reading: "サッカー", romaji: "sakkā", meaning: "soccer", kind: "katakana", emoji: "⚽", lesson: 21, sec: "3-4" },
  { term: "現地", reading: "げんち", romaji: "genchi", meaning: "the (agreed) place; on site — 現地で = meet there", kind: "kanji", emoji: "📍", lesson: 21, sec: "3-4" },
  { term: "図書館", reading: "としょかん", romaji: "toshokan", meaning: "library", kind: "kanji", emoji: "📚", lesson: 21, sec: "3-4" },
  { term: "時間", reading: "じかん", romaji: "jikan", meaning: "time; free time (時間ありますか = do you have time?)", kind: "kanji", emoji: "⏳", lesson: 21, sec: "3-4" },
  { term: "話します", reading: "はなします", romaji: "hanashimasu (hanasanai)", meaning: "talk; speak (neg. 話さない)", kind: "kanji", emoji: "💬", lesson: 21, sec: "3-4" },
  { term: "会います", reading: "あいます", romaji: "aimasu (awanai)", meaning: "meet; see a person (neg. 会わない — u→wa!)", kind: "kanji", emoji: "🤝", lesson: 21, sec: "3-4" },
  { term: "見ます", reading: "みます", romaji: "mimasu (minai)", meaning: "look; watch (neg. 見ない — ichidan)", kind: "kanji", emoji: "👀", lesson: 21, sec: "3-4" },
  { term: "早い", reading: "はやい", romaji: "hayai", meaning: "early (time)", kind: "kanji", emoji: "🌄", lesson: 21, sec: "3-4" },
  { term: "遅い", reading: "おそい", romaji: "osoi", meaning: "late; slow", kind: "kanji", emoji: "🐢", lesson: 21, sec: "3-4" },
  { term: "〜で", reading: "〜で", romaji: "~ de", meaning: "at/in ~ (place where an activity happens: 図書館で)", kind: "hiragana", emoji: "🗺️", lesson: 21, sec: "3-4" },
  { term: "〜に", reading: "〜に", romaji: "~ ni", meaning: "at ~ (point in time: 7時に = at 7:00)", kind: "hiragana", emoji: "🕰️", lesson: 21, sec: "3-4" },
  { term: "〜分", reading: "〜ふん／ぷん", romaji: "~fun / ~pun", meaning: "minutes counter — watch: 1分 いっぷん, 3分 さんぷん, 6分 ろっぷん, 10分 じゅっぷん", kind: "kanji", emoji: "⏱️", lesson: 21, sec: "3-4" },
  { term: "〜ませんか", reading: "〜ませんか", romaji: "~ masen ka", meaning: "won't you ~? (inviting: 一緒にしませんか)", kind: "hiragana", emoji: "🙋", lesson: 21, sec: "3-4" },
  { term: "文化", reading: "ぶんか", romaji: "bunka", meaning: "culture", kind: "kanji", emoji: "🏮", lesson: 22, sec: "Culture talk" },
  { term: "話", reading: "はなし", romaji: "hanashi", meaning: "story; talk (noun — the verb is 話します)", kind: "kanji", emoji: "📖", lesson: 22, sec: "Culture talk" },
  { term: "意味", reading: "いみ", romaji: "imi", meaning: "meaning (as in 〜の意味は何ですか)", kind: "kanji", emoji: "❓", lesson: 22, sec: "Culture talk" },
  { term: "鯉", reading: "こい", romaji: "koi", meaning: "carp (the fish — Magikarp's namesake)", kind: "kanji", emoji: "🎏", lesson: 22, sec: "Culture talk" },
  { term: "滝", reading: "たき", romaji: "taki", meaning: "waterfall", kind: "kanji", emoji: "🌊", lesson: 22, sec: "Culture talk" },
  { term: "竜", reading: "りゅう", romaji: "ryū", meaning: "dragon (as in 登竜門 tōryūmon, the Dragon Gate)", kind: "kanji", emoji: "🐉", lesson: 22, sec: "Culture talk" },
  { term: "お守り", reading: "おまもり", romaji: "omamori", meaning: "good-luck charm; amulet", kind: "kanji", emoji: "🧧", lesson: 22, sec: "Culture talk" },
  { term: "お坊さん", reading: "おぼうさん", romaji: "obōsan", meaning: "Buddhist monk", kind: "kanji", emoji: "🧘", lesson: 22, sec: "Culture talk" },
  { term: "しっぽ", reading: "しっぽ", romaji: "shippo", meaning: "tail (counted with 本: 九本 kyū-hon = nine tails)", kind: "hiragana", emoji: "🦊", lesson: 22, sec: "Culture talk" },
  { term: "魔法", reading: "まほう", romaji: "mahō", meaning: "magic; sorcery", kind: "kanji", emoji: "✨", lesson: 22, sec: "Culture talk" },
  { term: "質問", reading: "しつもん", romaji: "shitsumon", meaning: "question (質問がありますか = are there any questions?)", kind: "kanji", emoji: "🙋", lesson: 22, sec: "Culture talk" },
  // ── 3-5: shopping & prices ──
  { term: "いくら", reading: "いくら", romaji: "ikura", meaning: "how much (price)? いくらですか = how much is it?", kind: "hiragana", emoji: "💴", lesson: 23, sec: "3-5" },
  { term: "円", reading: "えん", romaji: "en", meaning: "yen (350円 = さんびゃくごじゅうえん)", kind: "kanji", emoji: "🪙", lesson: 23, sec: "3-5" },
  { term: "〜個", reading: "〜こ", romaji: "-ko", meaning: "counter for small objects (一個 いっこ = one; 一個790円 = 790 yen each)", kind: "kanji", emoji: "🔢", lesson: 23, sec: "3-5" },
  { term: "かわいい", reading: "かわいい", romaji: "kawaii", meaning: "cute", kind: "hiragana", emoji: "🥰", lesson: 23, sec: "3-5" },
  { term: "赤いの", reading: "あかいの", romaji: "akai no", meaning: "the red one (の replaces the noun: この赤いの = this red one)", kind: "mixed", emoji: "🟥", lesson: 23, sec: "3-5" },
  { term: "高くないですか", reading: "たかくないですか", romaji: "takakunai desu ka", meaning: "isn't it expensive? (い-adj negative as a question)", kind: "mixed", emoji: "😬", lesson: 23, sec: "3-5" },
  { term: "へえ", reading: "へえ", romaji: "hē", meaning: "wow / huh (surprised interest)", kind: "hiragana", emoji: "😮", lesson: 23, sec: "3-5" },
  // ── 3-5: counters ──
  { term: "〜つ", reading: "〜つ", romaji: "-tsu", meaning: "general counter (native): ひとつ・ふたつ・みっつ・よっつ・いつつ・むっつ・ななつ・やっつ・ここのつ・とお (1–10)", kind: "hiragana", emoji: "🧮", lesson: 23, sec: "3-5" },
  { term: "〜本", reading: "〜ほん", romaji: "-hon", meaning: "long thin things (pens, bottles): いっぽん・にほん・さんぼん・よんほん・ごほん・ろっぽん・ななほん・はっぽん・きゅうほん・じゅっぽん", kind: "kanji", emoji: "🖊️", lesson: 23, sec: "3-5" },
  { term: "〜枚", reading: "〜まい", romaji: "-mai", meaning: "flat things (paper, shirts, tickets): いちまい・にまい・さんまい — fully regular", kind: "kanji", emoji: "📄", lesson: 23, sec: "3-5" },
  { term: "〜冊", reading: "〜さつ", romaji: "-satsu", meaning: "bound volumes (books, notebooks): いっさつ・にさつ・さんさつ・よんさつ…はっさつ・じゅっさつ", kind: "kanji", emoji: "📚", lesson: 23, sec: "3-5" },
  { term: "〜杯", reading: "〜はい", romaji: "-hai", meaning: "cups/glasses of: いっぱい・にはい・さんばい・よんはい…ろっぱい・はっぱい・じゅっぱい", kind: "kanji", emoji: "🍵", lesson: 23, sec: "3-5" },
  { term: "〜匹", reading: "〜ひき", romaji: "-hiki", meaning: "small animals: いっぴき・にひき・さんびき・よんひき…ろっぴき・はっぴき・じゅっぴき", kind: "kanji", emoji: "🐟", lesson: 23, sec: "3-5" },
  { term: "〜台", reading: "〜だい", romaji: "-dai", meaning: "machines & vehicles (cars, TVs, phones): いちだい・にだい・さんだい — regular", kind: "kanji", emoji: "🚗", lesson: 23, sec: "3-5" },
  { term: "〜人", reading: "〜にん", romaji: "-nin", meaning: "people: ひとり・ふたり・さんにん・よにん(!)・ごにん…なんにん = how many people", kind: "kanji", emoji: "🧑‍🤝‍🧑", lesson: 23, sec: "3-5" },
  // ── class notes ──
  { term: "かなあ", reading: "かなあ", romaji: "kanā", meaning: "I wonder… (sentence-final, musing to yourself)", kind: "hiragana", emoji: "🤔", lesson: 24, sec: "Class notes" },
  { term: "なあ", reading: "なあ", romaji: "nā", meaning: "sentence-final particle: wistful emphasis (いいなあ = man, that's nice…)", kind: "hiragana", emoji: "😌", lesson: 24, sec: "Class notes" },
  { term: "虹", reading: "にじ", romaji: "niji", meaning: "rainbow", kind: "kanji", emoji: "🌈", lesson: 24, sec: "Class notes" },
  { term: "世界", reading: "せかい", romaji: "sekai", meaning: "world", kind: "kanji", emoji: "🌍", lesson: 24, sec: "Class notes" },
  { term: "道", reading: "みち", romaji: "michi", meaning: "road; way; path", kind: "kanji", emoji: "🛣️", lesson: 24, sec: "Class notes" },
  { term: "日々", reading: "ひび", romaji: "hibi", meaning: "days; daily life; day after day", kind: "kanji", emoji: "📆", lesson: 24, sec: "Class notes" },
  { term: "勝利", reading: "しょうり", romaji: "shōri", meaning: "victory", kind: "kanji", emoji: "🏆", lesson: 24, sec: "Class notes" },
  { term: "主", reading: "しゅ", romaji: "shu", meaning: "Lord; master", kind: "kanji", emoji: "✝️", lesson: 24, sec: "Class notes" },
  { term: "証", reading: "あかし", romaji: "akashi", meaning: "testimony; proof; witness", kind: "kanji", emoji: "🗣️", lesson: 24, sec: "Class notes" },
  { term: "雪", reading: "ゆき", romaji: "yuki", meaning: "snow", kind: "kanji", emoji: "❄️", lesson: 24, sec: "Class notes" },
  { term: "女性", reading: "じょせい", romaji: "josei", meaning: "woman; female", kind: "kanji", emoji: "👩", lesson: 24, sec: "Class notes" },
  { term: "御霊", reading: "みたま", romaji: "mitama", meaning: "the Spirit; spirit (honorific)", kind: "kanji", emoji: "🕊️", lesson: 24, sec: "Class notes" },
  { term: "信仰", reading: "しんこう", romaji: "shinkō", meaning: "faith; belief", kind: "kanji", emoji: "🙏", lesson: 24, sec: "Class notes" },
  { term: "聖典", reading: "せいてん", romaji: "seiten", meaning: "scriptures; sacred texts", kind: "kanji", emoji: "📖", lesson: 24, sec: "Class notes" },
  { term: "心", reading: "こころ", romaji: "kokoro", meaning: "heart; mind; spirit", kind: "kanji", emoji: "❤️", lesson: 24, sec: "Class notes" },
  { term: "中", reading: "なか", romaji: "naka", meaning: "inside; middle (〜の中 = inside of ~)", kind: "kanji", emoji: "📦", lesson: 24, sec: "Class notes" },
  { term: "正しい", reading: "ただしい", romaji: "tadashii", meaning: "correct; right (い-adj)", kind: "kanji", emoji: "✅", lesson: 24, sec: "Class notes" },
  { term: "大切", reading: "たいせつ", romaji: "taisetsu", meaning: "important; precious (な-adj: 大切な人)", kind: "kanji", emoji: "💎", lesson: 24, sec: "Class notes" },

  // ── NihonGO NOW! Act 3-7R/9R ──
  { term: "みなさん", reading: "みなさん", romaji: "minasan", meaning: "everyone (addressing an out-group / audience)", kind: "hiragana", emoji: "👥", lesson: 25, sec: "3-7R" },
  { term: "佐藤", reading: "さとう", romaji: "Satō", meaning: "Sato (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "鈴木", reading: "すずき", romaji: "Suzuki", meaning: "Suzuki (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "高橋", reading: "たかはし", romaji: "Takahashi", meaning: "Takahashi (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "田中", reading: "たなか", romaji: "Tanaka", meaning: "Tanaka (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "伊藤", reading: "いとう", romaji: "Itō", meaning: "Itō (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "渡辺", reading: "わたなべ", romaji: "Watanabe", meaning: "Watanabe (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "山本", reading: "やまもと", romaji: "Yamamoto", meaning: "Yamamoto (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "中村", reading: "なかむら", romaji: "Nakamura", meaning: "Nakamura (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "小林", reading: "こばやし", romaji: "Kobayashi", meaning: "Kobayashi (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "加藤", reading: "かとう", romaji: "Katō", meaning: "Katō (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "吉田", reading: "よしだ", romaji: "Yoshida", meaning: "Yoshida (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "山田", reading: "やまだ", romaji: "Yamada", meaning: "Yamada (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "佐々木", reading: "ささき", romaji: "Sasaki", meaning: "Sasaki (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "山口", reading: "やまぐち", romaji: "Yamaguchi", meaning: "Yamaguchi (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "松本", reading: "まつもと", romaji: "Matsumoto", meaning: "Matsumoto (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "井上", reading: "いのうえ", romaji: "Inoue", meaning: "Inoue (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "木村", reading: "きむら", romaji: "Kimura", meaning: "Kimura (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "林", reading: "はやし", romaji: "Hayashi", meaning: "Hayashi (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "斎藤", reading: "さいとう", romaji: "Saitō", meaning: "Saitō (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },
  { term: "清水", reading: "しみず", romaji: "Shimizu", meaning: "Shimizu (family name)", kind: "kanji", emoji: "🈹", lesson: 26, sec: "3-9R" },

  // ── NihonGO NOW! Act 4 ──
  { term: "ポスター", reading: "ポスター", romaji: "posutā", meaning: "poster", kind: "katakana", emoji: "🖼️", lesson: 27, sec: "4-1" },
  { term: "千", reading: "せん", romaji: "sen", meaning: "thousand(s): いっせん・にせん…きゅうせん", kind: "kanji", emoji: "🔢", lesson: 27, sec: "4-1" },
  { term: "何千", reading: "なんぜん", romaji: "nanzen", meaning: "how many thousands", kind: "kanji", emoji: "❓", lesson: 27, sec: "4-1" },
  { term: "万", reading: "まん", romaji: "man", meaning: "ten thousand (10,000)", kind: "kanji", emoji: "🔟", lesson: 27, sec: "4-1" },
  { term: "何万", reading: "なんまん", romaji: "nanman", meaning: "how many ten-thousands", kind: "kanji", emoji: "❓", lesson: 27, sec: "4-1" },
  { term: "作ります", reading: "つくります", romaji: "tsukurimasu", meaning: "to make (u-verb; past: 作った)", kind: "kanji", emoji: "🛠️", lesson: 27, sec: "4-1" },
  { term: "買います", reading: "かいます", romaji: "kaimasu", meaning: "to buy (u-verb; past: 買った)", kind: "kanji", emoji: "🛒", lesson: 27, sec: "4-1" },
  { term: "新しい", reading: "あたらしい", romaji: "atarashii", meaning: "new", kind: "kanji", emoji: "🆕", lesson: 27, sec: "4-1" },
  { term: "古い", reading: "ふるい", romaji: "furui", meaning: "old", kind: "kanji", emoji: "📜", lesson: 27, sec: "4-1" },
  { term: "それほど", reading: "それほど", romaji: "sorehodo", meaning: "that much; to that extent", kind: "hiragana", emoji: "🤏", lesson: 27, sec: "4-1" },
  { term: "まあまあ", reading: "まあまあ", romaji: "māmā", meaning: "so-so", kind: "hiragana", emoji: "😐", lesson: 27, sec: "4-1" },
  { term: "〜ぐらい・くらい", reading: "〜ぐらい・くらい", romaji: "~gurai / ~kurai", meaning: "about ~ (approximate amount)", kind: "hiragana", emoji: "📏", lesson: 27, sec: "4-1" },
  { term: "億", reading: "おく", romaji: "oku", meaning: "hundred million", kind: "kanji", emoji: "💰", lesson: 27, sec: "4-1" },
  { term: "兆", reading: "ちょう", romaji: "chō", meaning: "trillion", kind: "kanji", emoji: "💹", lesson: 27, sec: "4-1" },
  { term: "（ご）専攻", reading: "（ご）せんこう", romaji: "(go)senkō", meaning: "major field of study (する = to major in)", kind: "kanji", emoji: "🎓", lesson: 28, sec: "4-2" },
  { term: "（ご）専門", reading: "（ご）せんもん", romaji: "(go)senmon", meaning: "specialization, major", kind: "kanji", emoji: "📚", lesson: 28, sec: "4-2" },
  { term: "数学", reading: "すうがく", romaji: "sūgaku", meaning: "mathematics", kind: "kanji", emoji: "➗", lesson: 28, sec: "4-2" },
  { term: "歴史", reading: "れきし", romaji: "rekishi", meaning: "history", kind: "kanji", emoji: "📖", lesson: 28, sec: "4-2" },
  { term: "日本学", reading: "にほんがく", romaji: "nihongaku", meaning: "Japanese studies", kind: "kanji", emoji: "🎌", lesson: 28, sec: "4-2" },
  { term: "宗教", reading: "しゅうきょう", romaji: "shūkyō", meaning: "religion (also 宗教学 = religious studies)", kind: "kanji", emoji: "⛩️", lesson: 28, sec: "4-2" },
  { term: "社会学", reading: "しゃかいがく", romaji: "shakaigaku", meaning: "sociology", kind: "kanji", emoji: "🧑‍🤝‍🧑", lesson: 28, sec: "4-2" },
  { term: "経済", reading: "けいざい", romaji: "keizai", meaning: "economics (also 経済学 = economics as a field)", kind: "kanji", emoji: "💹", lesson: 28, sec: "4-2" },
  { term: "文学", reading: "ぶんがく", romaji: "bungaku", meaning: "literature", kind: "kanji", emoji: "📚", lesson: 28, sec: "4-2" },
  { term: "言語学", reading: "げんごがく", romaji: "gengogaku", meaning: "linguistics", kind: "kanji", emoji: "🗣️", lesson: 28, sec: "4-2" },
  { term: "工学", reading: "こうがく", romaji: "kōgaku", meaning: "engineering", kind: "kanji", emoji: "⚙️", lesson: 28, sec: "4-2" },
  { term: "物理", reading: "ぶつり", romaji: "butsuri", meaning: "physics (also 物理学 = physics as a field)", kind: "kanji", emoji: "⚛️", lesson: 28, sec: "4-2" },
  { term: "全然", reading: "ぜんぜん", romaji: "zenzen", meaning: "not at all, entirely (+ negative)", kind: "kanji", emoji: "🚫", lesson: 28, sec: "4-2" },
  { term: "使います", reading: "つかいます", romaji: "tsukaimasu", meaning: "to use (u-verb; past: 使った)", kind: "kanji", emoji: "🔧", lesson: 28, sec: "4-2" },
  { term: "取ります", reading: "とります", romaji: "torimasu", meaning: "to take (a class) (u-verb; past: 取った)", kind: "kanji", emoji: "📝", lesson: 28, sec: "4-2" },
  { term: "〜とか", reading: "〜とか", romaji: "~toka", meaning: "(things) like, such as", kind: "hiragana", emoji: "🔗", lesson: 28, sec: "4-2" },
  { term: "〜とかも", reading: "〜とかも", romaji: "~tokamo", meaning: "also (things) like, such as", kind: "hiragana", emoji: "➕", lesson: 28, sec: "4-2" },
  { term: "〜だけ", reading: "〜だけ", romaji: "~dake", meaning: "just, only", kind: "hiragana", emoji: "☝️", lesson: 28, sec: "4-2" },
  { term: "ふうん", reading: "ふうん", romaji: "fūn", meaning: "hmm", kind: "hiragana", emoji: "🤔", lesson: 28, sec: "4-2" },
  { term: "けっこう", reading: "けっこう", romaji: "kekkō", meaning: "a fair amount", kind: "hiragana", emoji: "👍", lesson: 28, sec: "4-2" },
  { term: "あまり・あんまり", reading: "あまり・あんまり", romaji: "amari / anmari", meaning: "not very much (+ negative)", kind: "hiragana", emoji: "🙅", lesson: 28, sec: "4-2" },
  { term: "あと", reading: "あと", romaji: "ato", meaning: "lastly, remaining, and then", kind: "hiragana", emoji: "⏭️", lesson: 28, sec: "4-2" },
  { term: "曖昧", reading: "あいまい", romaji: "aimai", meaning: "ambiguous, vague (な-adj)", kind: "kanji", emoji: "❓", lesson: 28, sec: "4-2" },
  { term: "いつ", reading: "いつ", romaji: "itsu", meaning: "when?", kind: "hiragana", emoji: "❓", lesson: 29, sec: "4-3" },
  { term: "先週", reading: "せんしゅう", romaji: "senshū", meaning: "last week", kind: "kanji", emoji: "📅", lesson: 29, sec: "4-3" },
  { term: "きのう", reading: "きのう", romaji: "kinō", meaning: "yesterday", kind: "hiragana", emoji: "🌙", lesson: 29, sec: "4-3" },
  { term: "おととい", reading: "おととい", romaji: "ototoi", meaning: "the day before yesterday", kind: "hiragana", emoji: "📆", lesson: 29, sec: "4-3" },
  { term: "先月", reading: "せんげつ", romaji: "sengetsu", meaning: "last month", kind: "kanji", emoji: "📅", lesson: 29, sec: "4-3" },
  { term: "先学期", reading: "せんがっき", romaji: "sengakki", meaning: "last semester", kind: "kanji", emoji: "📚", lesson: 29, sec: "4-3" },
  { term: "先日", reading: "せんじつ", romaji: "senjitsu", meaning: "the other day", kind: "kanji", emoji: "🗓️", lesson: 29, sec: "4-3" },
  { term: "去年", reading: "きょねん", romaji: "kyonen", meaning: "last year", kind: "kanji", emoji: "📅", lesson: 29, sec: "4-3" },
  { term: "（お）先", reading: "（お）さき", romaji: "(o)saki", meaning: "ahead, previous", kind: "kanji", emoji: "⏪", lesson: 29, sec: "4-3" },
  { term: "本当", reading: "ほんとう", romaji: "hontō", meaning: "true, really", kind: "kanji", emoji: "✅", lesson: 29, sec: "4-3" },
  { term: "大変", reading: "たいへん", romaji: "taihen", meaning: "tough (to do), awful, terrible (な-adj)", kind: "kanji", emoji: "😩", lesson: 29, sec: "4-3" },
  { term: "山下さん", reading: "やましたさん", romaji: "Yamashita-san", meaning: "Mr./Ms. Yamashita", kind: "kanji", emoji: "🧑", lesson: 29, sec: "4-3" },
  { term: "考えます", reading: "かんがえます", romaji: "kangaemasu", meaning: "to think about, consider (ru-verb; past: 考えた)", kind: "kanji", emoji: "💭", lesson: 29, sec: "4-3" },
  { term: "手伝います", reading: "てつだいます", romaji: "tetsudaimasu", meaning: "to help (u-verb; past: 手伝った)", kind: "kanji", emoji: "🤝", lesson: 29, sec: "4-3" },
  { term: "（ご）連絡", reading: "（ご）れんらく", romaji: "(go)renraku", meaning: "contact, communication", kind: "kanji", emoji: "📞", lesson: 30, sec: "4-4" },
  { term: "イベント", reading: "イベント", romaji: "ibento", meaning: "event", kind: "katakana", emoji: "🎉", lesson: 30, sec: "4-4" },
  { term: "コンサート", reading: "コンサート", romaji: "konsāto", meaning: "concert", kind: "katakana", emoji: "🎵", lesson: 30, sec: "4-4" },
  { term: "こと", reading: "こと", romaji: "koto", meaning: "matter, thing (abstract)", kind: "hiragana", emoji: "💭", lesson: 30, sec: "4-4" },
  { term: "場所", reading: "ばしょ", romaji: "basho", meaning: "place", kind: "kanji", emoji: "📍", lesson: 30, sec: "4-4" },
  { term: "ところ", reading: "ところ", romaji: "tokoro", meaning: "place", kind: "hiragana", emoji: "📍", lesson: 30, sec: "4-4" },
  { term: "いつも", reading: "いつも", romaji: "itsumo", meaning: "always, usually", kind: "hiragana", emoji: "🔁", lesson: 30, sec: "4-4" },
  { term: "会議室", reading: "かいぎしつ", romaji: "kaigishitsu", meaning: "meeting room", kind: "kanji", emoji: "🏢", lesson: 30, sec: "4-4" },
  { term: "教室", reading: "きょうしつ", romaji: "kyōshitsu", meaning: "classroom", kind: "kanji", emoji: "🏫", lesson: 30, sec: "4-4" },
  { term: "レストラン", reading: "レストラン", romaji: "resutoran", meaning: "restaurant", kind: "katakana", emoji: "🍽️", lesson: 30, sec: "4-4" },
  { term: "カフェ", reading: "カフェ", romaji: "kafe", meaning: "cafe", kind: "katakana", emoji: "☕", lesson: 30, sec: "4-4" },
  { term: "ホテル", reading: "ホテル", romaji: "hoteru", meaning: "hotel", kind: "katakana", emoji: "🏨", lesson: 30, sec: "4-4" },
  { term: "公園", reading: "こうえん", romaji: "kōen", meaning: "park", kind: "kanji", emoji: "🌳", lesson: 30, sec: "4-4" },
  { term: "来月", reading: "らいげつ", romaji: "raigetsu", meaning: "next month", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "今月", reading: "こんげつ", romaji: "kongetsu", meaning: "this month", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "今週", reading: "こんしゅう", romaji: "konshū", meaning: "this week", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "来週", reading: "らいしゅう", romaji: "raishū", meaning: "next week", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "今年", reading: "ことし", romaji: "kotoshi", meaning: "this year", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "来年", reading: "らいねん", romaji: "rainen", meaning: "next year", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "来学期", reading: "らいがっき", romaji: "raigakki", meaning: "next semester", kind: "kanji", emoji: "📚", lesson: 30, sec: "4-4" },
  { term: "明治", reading: "めいじ", romaji: "Meiji", meaning: "Meiji era (1868-1912)", kind: "kanji", emoji: "🏯", lesson: 30, sec: "4-4" },
  { term: "大正", reading: "たいしょう", romaji: "Taishō", meaning: "Taisho era (1912-1926)", kind: "kanji", emoji: "🏯", lesson: 30, sec: "4-4" },
  { term: "昭和", reading: "しょうわ", romaji: "Shōwa", meaning: "Showa era (1926-1989)", kind: "kanji", emoji: "🏯", lesson: 30, sec: "4-4" },
  { term: "平成", reading: "へいせい", romaji: "Heisei", meaning: "Heisei era (1989-2019)", kind: "kanji", emoji: "🏯", lesson: 30, sec: "4-4" },
  { term: "令和", reading: "れいわ", romaji: "Reiwa", meaning: "Reiwa era (2019-present)", kind: "kanji", emoji: "🏯", lesson: 30, sec: "4-4" },
  { term: "今朝", reading: "けさ", romaji: "kesa", meaning: "this morning", kind: "kanji", emoji: "🌅", lesson: 30, sec: "4-4" },
  { term: "今晩", reading: "こんばん", romaji: "konban", meaning: "this evening", kind: "kanji", emoji: "🌆", lesson: 30, sec: "4-4" },
  { term: "さっき", reading: "さっき", romaji: "sakki", meaning: "a while ago", kind: "hiragana", emoji: "⏱️", lesson: 30, sec: "4-4" },
  { term: "２０日", reading: "はつか", romaji: "hatsuka", meaning: "the twentieth day of the month", kind: "kanji", emoji: "📆", lesson: 30, sec: "4-4" },
  { term: "聞きます", reading: "ききます", romaji: "kikimasu", meaning: "to hear, listen (u-verb; past: 聞いた)", kind: "kanji", emoji: "👂", lesson: 30, sec: "4-4" },
  { term: "〜から", reading: "〜から", romaji: "~kara", meaning: "from (starting point)", kind: "hiragana", emoji: "➡️", lesson: 30, sec: "4-4" },
  { term: "〜まで", reading: "〜まで", romaji: "~made", meaning: "up to, until", kind: "hiragana", emoji: "🏁", lesson: 30, sec: "4-4" },
  { term: "〜日", reading: "〜にち・か", romaji: "~nichi / ~ka", meaning: "classifier for naming the day of the month", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "ついたち〜三十一日", reading: "ついたち〜さんじゅういちにち", romaji: "tsuitachi ~ sanjūichinichi", meaning: "the first through the 31st (of the month)", kind: "kanji", emoji: "🔢", lesson: 30, sec: "4-4" },
  { term: "〜月", reading: "〜がつ", romaji: "~gatsu", meaning: "classifier for naming the months of the year", kind: "kanji", emoji: "🈷️", lesson: 30, sec: "4-4" },
  { term: "〜番", reading: "〜ばん", romaji: "~ban", meaning: "classifier for naming a number (in a series)", kind: "kanji", emoji: "🔢", lesson: 30, sec: "4-4" },
  { term: "〜年", reading: "〜ねん", romaji: "~nen", meaning: "classifier for naming the years", kind: "kanji", emoji: "📅", lesson: 30, sec: "4-4" },
  { term: "そうか。", reading: "そうか。", romaji: "sō ka.", meaning: "Is that so? (expression of awareness)", kind: "hiragana", emoji: "💡", lesson: 30, sec: "4-4" },
  { term: "いつもの〜", reading: "いつもの〜", romaji: "itsumo no ~", meaning: "the usual ~ (e.g. いつもの場所 = the usual place)", kind: "hiragana", emoji: "🔁", lesson: 30, sec: "4-4" },
  { term: "元年", reading: "がんねん", romaji: "gannen", meaning: "first year (of a new era)", kind: "kanji", emoji: "🎊", lesson: 30, sec: "4-4" },
  { term: "天皇陛下", reading: "てんのうへいか", romaji: "tennō heika", meaning: "the emperor (honorific)", kind: "kanji", emoji: "👑", lesson: 30, sec: "4-4" },
  { term: "元日", reading: "がんじつ", romaji: "ganjitsu", meaning: "New Year's Day", kind: "kanji", emoji: "🎍", lesson: 30, sec: "4-4" },
  { term: "（お）正月", reading: "（お）しょうがつ", romaji: "(o)shōgatsu", meaning: "New Year's Day/Month", kind: "kanji", emoji: "🎍", lesson: 30, sec: "4-4" },
  { term: "成人の日", reading: "せいじんのひ", romaji: "Seijin no Hi", meaning: "Coming of Age Day", kind: "kanji", emoji: "🎓", lesson: 30, sec: "4-4" },
  { term: "建国記念日", reading: "けんこくきねんび", romaji: "Kenkoku Kinenbi", meaning: "Foundation Day", kind: "kanji", emoji: "🇯🇵", lesson: 30, sec: "4-4" },
  { term: "春分の日", reading: "しゅんぶんのひ", romaji: "Shunbun no Hi", meaning: "Vernal Equinox Day", kind: "kanji", emoji: "🌸", lesson: 30, sec: "4-4" },
  { term: "昭和の日", reading: "しょうわのひ", romaji: "Shōwa no Hi", meaning: "Showa Day", kind: "kanji", emoji: "🏯", lesson: 30, sec: "4-4" },
  { term: "憲法記念日", reading: "けんぽうきねんび", romaji: "Kenpō Kinenbi", meaning: "Constitution Day", kind: "kanji", emoji: "📜", lesson: 30, sec: "4-4" },
  { term: "緑の日", reading: "みどりのひ", romaji: "Midori no Hi", meaning: "Greenery Day", kind: "kanji", emoji: "🌿", lesson: 30, sec: "4-4" },
  { term: "こどもの日", reading: "こどものひ", romaji: "Kodomo no Hi", meaning: "Children's Day", kind: "hiragana", emoji: "🎏", lesson: 30, sec: "4-4" },
  { term: "海の日", reading: "うみのひ", romaji: "Umi no Hi", meaning: "Marine Day", kind: "kanji", emoji: "🌊", lesson: 30, sec: "4-4" },
  { term: "敬老の日", reading: "けいろうのひ", romaji: "Keirō no Hi", meaning: "Respect for the Aged Day", kind: "kanji", emoji: "👴", lesson: 30, sec: "4-4" },
  { term: "秋分の日", reading: "しゅうぶんのひ", romaji: "Shūbun no Hi", meaning: "Autumnal Equinox Day", kind: "kanji", emoji: "🍁", lesson: 30, sec: "4-4" },
  { term: "スポーツの日", reading: "スポーツのひ", romaji: "Supōtsu no Hi", meaning: "Sports Day", kind: "kanji", emoji: "🏃", lesson: 30, sec: "4-4" },
  { term: "文化の日", reading: "ぶんかのひ", romaji: "Bunka no Hi", meaning: "Culture Day", kind: "kanji", emoji: "🎨", lesson: 30, sec: "4-4" },
  { term: "勤労感謝の日", reading: "きんろうかんしゃのひ", romaji: "Kinrō Kansha no Hi", meaning: "Labor Thanksgiving Day", kind: "kanji", emoji: "🙏", lesson: 30, sec: "4-4" },
  { term: "天皇誕生日", reading: "てんのうたんじょうび", romaji: "Tennō Tanjōbi", meaning: "the Emperor's Birthday", kind: "kanji", emoji: "🎂", lesson: 30, sec: "4-4" },
  { term: "部屋", reading: "へや", romaji: "heya", meaning: "room", kind: "kanji", emoji: "🚪", lesson: 31, sec: "4-5" },
  { term: "オフィス", reading: "オフィス", romaji: "ofisu", meaning: "office", kind: "katakana", emoji: "🏢", lesson: 31, sec: "4-5" },
  { term: "フォント", reading: "フォント", romaji: "fonto", meaning: "font", kind: "katakana", emoji: "🔤", lesson: 31, sec: "4-5" },
  { term: "自転車", reading: "じてんしゃ", romaji: "jitensha", meaning: "bicycle", kind: "kanji", emoji: "🚲", lesson: 31, sec: "4-5" },
  { term: "地下", reading: "ちか", romaji: "chika", meaning: "basement, underground", kind: "kanji", emoji: "🕳️", lesson: 31, sec: "4-5" },
  { term: "使いやすい", reading: "つかいやすい", romaji: "tsukaiyasui", meaning: "easy to use", kind: "kanji", emoji: "👍", lesson: 31, sec: "4-5" },
  { term: "使いにくい", reading: "つかいにくい", romaji: "tsukainikui", meaning: "hard to use", kind: "kanji", emoji: "👎", lesson: 31, sec: "4-5" },
  { term: "〜階", reading: "〜かい", romaji: "~kai", meaning: "classifier for naming and counting floors", kind: "kanji", emoji: "🏬", lesson: 31, sec: "4-5" },
  { term: "〜番教室", reading: "〜ばんきょうしつ", romaji: "~ban kyōshitsu", meaning: "classifier for naming a classroom number", kind: "kanji", emoji: "🏫", lesson: 31, sec: "4-5" },
  { term: "〜号室", reading: "〜ごうしつ", romaji: "~gōshitsu", meaning: "classifier for naming a room number", kind: "kanji", emoji: "🚪", lesson: 31, sec: "4-5" },
  { term: "そうしましょう。", reading: "そうしましょう。", romaji: "sō shimashō.", meaning: "Let's do it that way.", kind: "hiragana", emoji: "🤝", lesson: 31, sec: "4-5" },
  { term: "わりと", reading: "わりと", romaji: "warito", meaning: "relatively", kind: "hiragana", emoji: "⚖️", lesson: 31, sec: "4-5" },
  { term: "一番", reading: "いちばん", romaji: "ichiban", meaning: "most, best", kind: "kanji", emoji: "🥇", lesson: 31, sec: "4-5" },
  { term: "ほとんど", reading: "ほとんど", romaji: "hotondo", meaning: "almost; barely (with negative)", kind: "hiragana", emoji: "🤏", lesson: 32, sec: "4-6" },
  { term: "３時間", reading: "さんじかん", romaji: "sanjikan", meaning: "three hours", kind: "kanji", emoji: "⏱️", lesson: 32, sec: "4-6" },
  { term: "月曜日", reading: "げつようび", romaji: "getsuyōbi", meaning: "Monday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "火曜日", reading: "かようび", romaji: "kayōbi", meaning: "Tuesday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "水曜日", reading: "すいようび", romaji: "suiyōbi", meaning: "Wednesday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "木曜日", reading: "もくようび", romaji: "mokuyōbi", meaning: "Thursday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "金曜日", reading: "きんようび", romaji: "kin'yōbi", meaning: "Friday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "土曜日", reading: "どようび", romaji: "doyōbi", meaning: "Saturday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "日曜日", reading: "にちようび", romaji: "nichiyōbi", meaning: "Sunday", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "何曜日", reading: "なんようび", romaji: "nan'yōbi", meaning: "what day (of the week)?", kind: "kanji", emoji: "❓", lesson: 32, sec: "4-6" },
  { term: "今学期", reading: "こんがっき", romaji: "kongakki", meaning: "this term", kind: "kanji", emoji: "📚", lesson: 32, sec: "4-6" },
  { term: "かかります", reading: "かかります", romaji: "kakarimasu", meaning: "to take (time/money) (u-verb; past: かかった)", kind: "hiragana", emoji: "⏳", lesson: 32, sec: "4-6" },
  { term: "いります", reading: "いります", romaji: "irimasu", meaning: "to need (u-verb; past: いった)", kind: "hiragana", emoji: "🙏", lesson: 32, sec: "4-6" },
  { term: "〜週間", reading: "〜しゅうかん", romaji: "~shūkan", meaning: "classifier for counting weeks", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "〜ヶ月・〜カ月", reading: "〜かげつ", romaji: "~kagetsu", meaning: "classifier for counting months", kind: "kanji", emoji: "📅", lesson: 32, sec: "4-6" },
  { term: "〜学期", reading: "〜がっき", romaji: "~gakki", meaning: "school/academic term", kind: "kanji", emoji: "🏫", lesson: 32, sec: "4-6" },
  { term: "では", reading: "では", romaji: "dewa", meaning: "written equivalent of じゃ", kind: "hiragana", emoji: "✍️", lesson: 33, sec: "4-7R" },

  // ── NihonGO NOW! Act 5 ──
  { term: "すぐ", reading: "すぐ", romaji: "sugu", meaning: "soon, immediately, right away", kind: "hiragana", emoji: "⏱️", lesson: 34, sec: "5-1" },
  { term: "あす", reading: "あす", romaji: "asu", meaning: "tomorrow (slightly more formal than あした)", kind: "hiragana", emoji: "📅", lesson: 34, sec: "5-1" },
  { term: "少し", reading: "すこし", romaji: "sukoshi", meaning: "a little, a few", kind: "kanji", emoji: "🤏", lesson: 34, sec: "5-1" },
  { term: "了解", reading: "りょうかい", romaji: "ryōkai", meaning: "understanding, consent, agreement (する = to understand/agree)", kind: "kanji", emoji: "✅", lesson: 34, sec: "5-1" },
  { term: "決めます", reading: "きめます", romaji: "kimemasu", meaning: "to decide (ru-verb; past: 決めた)", kind: "kanji", emoji: "🎯", lesson: 34, sec: "5-1" },
  { term: "急ぎます", reading: "いそぎます", romaji: "isogimasu", meaning: "to hurry (u-verb; past: 急いだ)", kind: "kanji", emoji: "🏃", lesson: 34, sec: "5-1" },
  { term: "構います", reading: "かまいます", romaji: "kamaimasu", meaning: "to mind, care, be concerned about (u-verb; usually used in the negative)", kind: "kanji", emoji: "🤷", lesson: 34, sec: "5-1" },
  { term: "もちろん", reading: "もちろん", romaji: "mochiron", meaning: "of course", kind: "hiragana", emoji: "👍", lesson: 34, sec: "5-1" },
  { term: "なるべく", reading: "なるべく", romaji: "narubeku", meaning: "as ... as possible", kind: "hiragana", emoji: "💪", lesson: 34, sec: "5-1" },
  { term: "でも", reading: "でも", romaji: "demo", meaning: "but, however, and yet", kind: "hiragana", emoji: "🤨", lesson: 34, sec: "5-1" },
  { term: "〜でも〜でも", reading: "〜でも〜でも", romaji: "~demo ~demo", meaning: "whether it's ~ or ~", kind: "hiragana", emoji: "🔀", lesson: 34, sec: "5-1" },
  { term: "〜でも〜じゃなくても", reading: "〜でも〜じゃなくても", romaji: "~demo ~ja nakutemo", meaning: "whether it's ~ or not ~", kind: "hiragana", emoji: "⚖️", lesson: 34, sec: "5-1" },
  { term: "質問", reading: "しつもん", romaji: "shitsumon", meaning: "question (する = to ask a question)", kind: "kanji", emoji: "❓", lesson: 35, sec: "5-2" },
  { term: "やります", reading: "やります", romaji: "yarimasu", meaning: "to do (u-verb, less formal than する; past: やった)", kind: "hiragana", emoji: "🙌", lesson: 35, sec: "5-2" },
  { term: "出します", reading: "だします", romaji: "dashimasu", meaning: "to submit, take out (of a container), send out (mail) (u-verb; past: 出した)", kind: "kanji", emoji: "📤", lesson: 35, sec: "5-2" },
  { term: "〜ページ", reading: "〜ページ", romaji: "~pēji", meaning: "pages", kind: "katakana", emoji: "📄", lesson: 35, sec: "5-2" },
  { term: "今日までだったでしょう？", reading: "きょうまでだったでしょう？", romaji: "kyō made datta deshō?", meaning: "It was until today, wasn't it?", kind: "kanji", emoji: "📆", lesson: 35, sec: "5-2" },
  { term: "全部", reading: "ぜんぶ", romaji: "zenbu", meaning: "all, everything", kind: "kanji", emoji: "💯", lesson: 36, sec: "5-3" },
  { term: "一応", reading: "いちおう", romaji: "ichiō", meaning: "for the time being, tentatively, more or less", kind: "kanji", emoji: "📝", lesson: 36, sec: "5-3" },
  { term: "持ちます", reading: "もちます", romaji: "mochimasu", meaning: "to hold, have, carry (u-verb)", kind: "kanji", emoji: "✋", lesson: 36, sec: "5-3" },
  { term: "持ってくる", reading: "もってくる", romaji: "motte kuru", meaning: "bring (a thing)", kind: "kanji", emoji: "📥", lesson: 36, sec: "5-3" },
  { term: "持っていく", reading: "もっていく", romaji: "motte iku", meaning: "take (a thing)", kind: "kanji", emoji: "📤", lesson: 36, sec: "5-3" },
  { term: "借ります", reading: "かります", romaji: "karimasu", meaning: "to borrow (ru-verb; past: 借りた)", kind: "kanji", emoji: "🤲", lesson: 36, sec: "5-3" },
  { term: "お願いできます", reading: "おねがいできます", romaji: "onegai dekimasu", meaning: "can request, can ask a favor of", kind: "kanji", emoji: "🙏", lesson: 36, sec: "5-3" },
  { term: "いただけます", reading: "いただけます", romaji: "itadakemasu", meaning: "can/may have someone do (for you) — polite potential", kind: "hiragana", emoji: "🙇", lesson: 36, sec: "5-3" },
  { term: "任せます", reading: "まかせます", romaji: "makasemasu", meaning: "to leave it to someone else, let someone else do it (ru-verb; past: 任せた)", kind: "kanji", emoji: "🤝", lesson: 36, sec: "5-3" },
  { term: "〜つ", reading: "〜つ", romaji: "~tsu", meaning: "classifier for counting items", kind: "hiragana", emoji: "🔢", lesson: 36, sec: "5-3" },
  { term: "（お）いくつ", reading: "（お）いくつ", romaji: "(o)ikutsu", meaning: "how many things/items", kind: "hiragana", emoji: "❓", lesson: 36, sec: "5-3" },
  { term: "申し訳ありません。", reading: "もうしわけありません。", romaji: "mōshiwake arimasen.", meaning: "I'm sorry.", kind: "kanji", emoji: "🙇", lesson: 36, sec: "5-3" },
  { term: "申し訳ありませんでした。", reading: "もうしわけありませんでした。", romaji: "mōshiwake arimasendeshita.", meaning: "I'm sorry (for what happened).", kind: "kanji", emoji: "😔", lesson: 36, sec: "5-3" },
  { term: "そうですねえ", reading: "そうですねえ", romaji: "sō desu nē", meaning: "(to express consideration) let's see", kind: "hiragana", emoji: "🤔", lesson: 36, sec: "5-3" },
  { term: "何でしょう。", reading: "なんでしょう。", romaji: "nan deshō.", meaning: "What? What could it be?", kind: "kanji", emoji: "❓", lesson: 36, sec: "5-3" },
  { term: "持ってきていただけますか？", reading: "もってきていただけますか？", romaji: "motte kite itadakemasu ka?", meaning: "Can I have you bring it?", kind: "kanji", emoji: "📥", lesson: 36, sec: "5-3" },
  { term: "任せてください。", reading: "まかせてください。", romaji: "makasete kudasai.", meaning: "Leave it to me.", kind: "kanji", emoji: "🤝", lesson: 36, sec: "5-3" },
  { term: "お願いできますか？", reading: "おねがいできますか？", romaji: "onegai dekimasu ka?", meaning: "Can I ask a favor of you?", kind: "kanji", emoji: "🙏", lesson: 36, sec: "5-3" },
  { term: "銀行", reading: "ぎんこう", romaji: "ginkō", meaning: "bank", kind: "kanji", emoji: "🏦", lesson: 37, sec: "5-4" },
  { term: "本屋", reading: "ほんや", romaji: "hon'ya", meaning: "book store", kind: "kanji", emoji: "📚", lesson: 37, sec: "5-4" },
  { term: "スーパー", reading: "スーパー", romaji: "sūpā", meaning: "super market", kind: "katakana", emoji: "🛒", lesson: 37, sec: "5-4" },
  { term: "郵便局", reading: "ゆうびんきょく", romaji: "yūbinkyoku", meaning: "post office", kind: "kanji", emoji: "🏤", lesson: 37, sec: "5-4" },
  { term: "病院", reading: "びょういん", romaji: "byōin", meaning: "hospital", kind: "kanji", emoji: "🏥", lesson: 37, sec: "5-4" },
  { term: "工場", reading: "こうじょう", romaji: "kōjō", meaning: "factory, workshop", kind: "kanji", emoji: "🏭", lesson: 37, sec: "5-4" },
  { term: "買い物", reading: "かいもの", romaji: "kaimono", meaning: "shopping", kind: "kanji", emoji: "🛍️", lesson: 37, sec: "5-4" },
  { term: "車", reading: "くるま", romaji: "kuruma", meaning: "car", kind: "kanji", emoji: "🚗", lesson: 37, sec: "5-4" },
  { term: "バス", reading: "バス", romaji: "basu", meaning: "bus", kind: "katakana", emoji: "🚌", lesson: 37, sec: "5-4" },
  { term: "地下鉄", reading: "ちかてつ", romaji: "chikatetsu", meaning: "subway", kind: "kanji", emoji: "🚇", lesson: 37, sec: "5-4" },
  { term: "電車", reading: "でんしゃ", romaji: "densha", meaning: "train", kind: "kanji", emoji: "🚃", lesson: 37, sec: "5-4" },
  { term: "連れて行く", reading: "つれていく", romaji: "tsurete iku", meaning: "take (a person) along", kind: "kanji", emoji: "🚶", lesson: 37, sec: "5-4" },
  { term: "連れて来る", reading: "つれてくる", romaji: "tsurete kuru", meaning: "bring (a person) along", kind: "kanji", emoji: "👥", lesson: 37, sec: "5-4" },
  { term: "出ます", reading: "でます", romaji: "demasu", meaning: "to go out, leave, attend (an event), appear, answer (the phone) (ru-verb; past: 出た)", kind: "kanji", emoji: "🚪", lesson: 37, sec: "5-4" },
  { term: "助かります", reading: "たすかります", romaji: "tasukarimasu", meaning: "to be helped, be saved, be rescued (u-verb; past: 助かった)", kind: "kanji", emoji: "🙏", lesson: 37, sec: "5-4" },
  { term: "歩きます", reading: "あるきます", romaji: "arukimasu", meaning: "to walk (u-verb; past: 歩いた)", kind: "kanji", emoji: "🚶", lesson: 37, sec: "5-4" },
  { term: "乗ります", reading: "のります", romaji: "norimasu", meaning: "to ride, get onboard (u-verb; past: 乗った)", kind: "kanji", emoji: "🚏", lesson: 37, sec: "5-4" },
  { term: "〜に", reading: "〜に", romaji: "~ni", meaning: "to, towards ~", kind: "hiragana", emoji: "➡️", lesson: 37, sec: "5-4" },
  { term: "〜へ", reading: "〜へ", romaji: "~e", meaning: "to, towards ~", kind: "hiragana", emoji: "🧭", lesson: 37, sec: "5-4" },
  { term: "〜で", reading: "〜で", romaji: "~de", meaning: "by means of ~", kind: "hiragana", emoji: "⚙️", lesson: 37, sec: "5-4" },
  { term: "歩いて", reading: "あるいて", romaji: "aruite", meaning: "on foot", kind: "kanji", emoji: "👣", lesson: 37, sec: "5-4" },
  { term: "レセプション", reading: "レセプション", romaji: "resepushon", meaning: "reception", kind: "katakana", emoji: "🎉", lesson: 38, sec: "5-5" },
  { term: "プレゼン", reading: "プレゼン", romaji: "purezen", meaning: "presentation", kind: "katakana", emoji: "📊", lesson: 38, sec: "5-5" },
  { term: "発表", reading: "はっぴょう", romaji: "happyō", meaning: "presentation", kind: "kanji", emoji: "🎤", lesson: 38, sec: "5-5" },
  { term: "うち", reading: "うち", romaji: "uchi", meaning: "our company", kind: "hiragana", emoji: "🏢", lesson: 38, sec: "5-5" },
  { term: "呼びます", reading: "よびます", romaji: "yobimasu", meaning: "to call, invite (u-verb; past: 呼んだ)", kind: "kanji", emoji: "📣", lesson: 38, sec: "5-5" },
  { term: "伺います", reading: "うかがいます", romaji: "ukagaimasu", meaning: "to visit (humble; u-verb; past: 伺った)", kind: "kanji", emoji: "🙇", lesson: 38, sec: "5-5" },
  { term: "喜びます", reading: "よろこびます", romaji: "yorokobimasu", meaning: "to be delighted, be pleased (u-verb; past: 喜んだ)", kind: "kanji", emoji: "😊", lesson: 38, sec: "5-5" },
  { term: "ございます", reading: "ございます", romaji: "gozaimasu", meaning: "exists (polite form of あります)", kind: "hiragana", emoji: "🙏", lesson: 38, sec: "5-5" },
  { term: "教えます", reading: "おしえます", romaji: "oshiemasu", meaning: "to tell, teach (ru-verb; past: 教えた)", kind: "kanji", emoji: "🏫", lesson: 38, sec: "5-5" },
  { term: "見せます", reading: "みせます", romaji: "misemasu", meaning: "to show (ru-verb; past: 見せた)", kind: "kanji", emoji: "👀", lesson: 38, sec: "5-5" },
  { term: "参ります", reading: "まいります", romaji: "mairimasu", meaning: "to go, come (humble; u-verb; past: 参った)", kind: "kanji", emoji: "🙇", lesson: 38, sec: "5-5" },
  { term: "いらっしゃいます", reading: "いらっしゃいます", romaji: "irasshaimasu", meaning: "go, come, be (honorific)", kind: "hiragana", emoji: "✨", lesson: 38, sec: "5-5" },
  { term: "短い", reading: "みじかい", romaji: "mijikai", meaning: "short", kind: "kanji", emoji: "📏", lesson: 38, sec: "5-5" },
  { term: "長い", reading: "ながい", romaji: "nagai", meaning: "long", kind: "kanji", emoji: "🐍", lesson: 38, sec: "5-5" },
  { term: "〜までに", reading: "〜までに", romaji: "~made ni", meaning: "by (a certain time)", kind: "hiragana", emoji: "⏰", lesson: 38, sec: "5-5" },
  { term: "うちの〜", reading: "うちの〜", romaji: "uchi no ~", meaning: "our company's ~", kind: "hiragana", emoji: "🏢", lesson: 38, sec: "5-5" },
  { term: "喜んで", reading: "よろこんで", romaji: "yorokonde", meaning: "delighted, gladly", kind: "kanji", emoji: "😄", lesson: 38, sec: "5-5" },
  { term: "よろしければ", reading: "よろしければ", romaji: "yoroshikereba", meaning: "if you would like, if it pleases you", kind: "hiragana", emoji: "🙂", lesson: 38, sec: "5-5" },
  { term: "是非", reading: "ぜひ", romaji: "zehi", meaning: "by all means", kind: "kanji", emoji: "🙏", lesson: 38, sec: "5-5" },
  { term: "〜くださってありがとうございます。", reading: "〜くださってありがとうございます。", romaji: "~kudasatte arigatō gozaimasu.", meaning: "Thank you for doing ~.", kind: "hiragana", emoji: "🙏", lesson: 38, sec: "5-5" },
  { term: "敬語", reading: "けいご", romaji: "keigo", meaning: "politeness, polite language", kind: "kanji", emoji: "🗣️", lesson: 38, sec: "5-5" },
  { term: "尊敬語", reading: "そんけいご", romaji: "sonkeigo", meaning: "honorific language", kind: "kanji", emoji: "👑", lesson: 38, sec: "5-5" },
  { term: "謙譲語", reading: "けんじょうご", romaji: "kenjōgo", meaning: "humble language", kind: "kanji", emoji: "🙇", lesson: 38, sec: "5-5" },
  { term: "丁寧語", reading: "ていねいご", romaji: "teineigo", meaning: "formal language", kind: "kanji", emoji: "🎩", lesson: 38, sec: "5-5" },
  { term: "お時間", reading: "おじかん", romaji: "ojikan", meaning: "your time", kind: "kanji", emoji: "⏰", lesson: 39, sec: "5-6" },
  { term: "アドバイス", reading: "アドバイス", romaji: "adobaisu", meaning: "advice", kind: "katakana", emoji: "💡", lesson: 39, sec: "5-6" },
  { term: "読み書き", reading: "よみかき", romaji: "yomikaki", meaning: "reading and writing", kind: "kanji", emoji: "📖", lesson: 39, sec: "5-6" },
  { term: "読み", reading: "よみ", romaji: "yomi", meaning: "reading", kind: "kanji", emoji: "📖", lesson: 39, sec: "5-6" },
  { term: "書き", reading: "かき", romaji: "kaki", meaning: "writing", kind: "kanji", emoji: "✍️", lesson: 39, sec: "5-6" },
  { term: "会話", reading: "かいわ", romaji: "kaiwa", meaning: "conversation", kind: "kanji", emoji: "💬", lesson: 39, sec: "5-6" },
  { term: "文法", reading: "ぶんぽう", romaji: "bunpō", meaning: "grammar", kind: "kanji", emoji: "📐", lesson: 39, sec: "5-6" },
  { term: "語彙", reading: "ごい", romaji: "goi", meaning: "vocabulary", kind: "kanji", emoji: "📚", lesson: 39, sec: "5-6" },
  { term: "聞き取り", reading: "ききとり", romaji: "kikitori", meaning: "listening", kind: "kanji", emoji: "👂", lesson: 39, sec: "5-6" },
  { term: "書き取り", reading: "かきとり", romaji: "kakitori", meaning: "dictation", kind: "kanji", emoji: "✍️", lesson: 39, sec: "5-6" },
  { term: "練習", reading: "れんしゅう", romaji: "renshū", meaning: "practice, rehearse (する = to practice)", kind: "kanji", emoji: "🏋️", lesson: 39, sec: "5-6" },
  { term: "予習", reading: "よしゅう", romaji: "yoshū", meaning: "preparation for a lesson (する = to prepare)", kind: "kanji", emoji: "📖", lesson: 39, sec: "5-6" },
  { term: "復習", reading: "ふくしゅう", romaji: "fukushū", meaning: "review (する = to review)", kind: "kanji", emoji: "🔁", lesson: 39, sec: "5-6" },
  { term: "なります", reading: "なります", romaji: "narimasu", meaning: "to become (u-verb; past: なった)", kind: "hiragana", emoji: "🌱", lesson: 39, sec: "5-6" },
  { term: "弱い", reading: "よわい", romaji: "yowai", meaning: "weak", kind: "kanji", emoji: "🪫", lesson: 39, sec: "5-6" },
  { term: "強い", reading: "つよい", romaji: "tsuyoi", meaning: "strong", kind: "kanji", emoji: "💪", lesson: 39, sec: "5-6" },
  { term: "〜目", reading: "〜め", romaji: "~me", meaning: "classifier for naming numbers in a series", kind: "kanji", emoji: "🔢", lesson: 39, sec: "5-6" },
  { term: "難しくなりました。", reading: "むずかしくなりました。", romaji: "muzukashiku narimashita.", meaning: "It became difficult.", kind: "kanji", emoji: "😖", lesson: 39, sec: "5-6" },
  { term: "あとで", reading: "あとで", romaji: "atode", meaning: "later; 〜のあとで = 'after ~'", kind: "hiragana", emoji: "⏳", lesson: 39, sec: "5-6" },
  { term: "そうしていただけますか？", reading: "そうしていただけますか？", romaji: "sō shite itadakemasu ka?", meaning: "Can I have you do that?", kind: "hiragana", emoji: "🙏", lesson: 39, sec: "5-6" },

  // ── NihonGO NOW! Act 6 ──
  { term: "メンバー", reading: "メンバー", romaji: "menbā", meaning: "member", kind: "katakana", emoji: "👥", lesson: 41, sec: "6-1" },
  { term: "ひとこと", reading: "ひとこと", romaji: "hitokoto", meaning: "a word, a brief remark", kind: "hiragana", emoji: "💬", lesson: 41, sec: "6-1" },
  { term: "自己紹介", reading: "じこしょうかい", romaji: "jikoshōkai", meaning: "self-introduction (する = to introduce oneself)", kind: "kanji", emoji: "🙋", lesson: 41, sec: "6-1" },
  { term: "アメリカ", reading: "アメリカ", romaji: "Amerika", meaning: "America", kind: "katakana", emoji: "🇺🇸", lesson: 41, sec: "6-1" },
  { term: "日本", reading: "にほん", romaji: "Nihon", meaning: "Japan", kind: "kanji", emoji: "🇯🇵", lesson: 41, sec: "6-1" },
  { term: "カナダ", reading: "カナダ", romaji: "Kanada", meaning: "Canada", kind: "katakana", emoji: "🇨🇦", lesson: 41, sec: "6-1" },
  { term: "メキシコ", reading: "メキシコ", romaji: "Mekishiko", meaning: "Mexico", kind: "katakana", emoji: "🇲🇽", lesson: 41, sec: "6-1" },
  { term: "ブラジル", reading: "ブラジル", romaji: "Burajiru", meaning: "Brazil", kind: "katakana", emoji: "🇧🇷", lesson: 41, sec: "6-1" },
  { term: "中国", reading: "ちゅうごく", romaji: "Chūgoku", meaning: "China", kind: "kanji", emoji: "🇨🇳", lesson: 41, sec: "6-1" },
  { term: "韓国", reading: "かんこく", romaji: "Kankoku", meaning: "Korea", kind: "kanji", emoji: "🇰🇷", lesson: 41, sec: "6-1" },
  { term: "イギリス", reading: "イギリス", romaji: "Igirisu", meaning: "England, U.K.", kind: "katakana", emoji: "🇬🇧", lesson: 41, sec: "6-1" },
  { term: "ドイツ", reading: "ドイツ", romaji: "Doitsu", meaning: "Germany", kind: "katakana", emoji: "🇩🇪", lesson: 41, sec: "6-1" },
  { term: "ケニヤ", reading: "ケニヤ", romaji: "Keniya", meaning: "Kenya", kind: "katakana", emoji: "🇰🇪", lesson: 41, sec: "6-1" },
  { term: "オレゴン州", reading: "オレゴンしゅう", romaji: "Oregon-shū", meaning: "Oregon (state)", kind: "kanji", emoji: "🌲", lesson: 41, sec: "6-1" },
  { term: "州", reading: "しゅう", romaji: "shū", meaning: "state, as in the U.S.", kind: "kanji", emoji: "🗺️", lesson: 41, sec: "6-1" },
  { term: "省", reading: "しょう", romaji: "shō", meaning: "province, as in China", kind: "kanji", emoji: "🗺️", lesson: 41, sec: "6-1" },
  { term: "広東省", reading: "カントンしょう", romaji: "Kanton-shō", meaning: "Guangdong Province", kind: "kanji", emoji: "🏙️", lesson: 41, sec: "6-1" },
  { term: "留学生センター", reading: "りゅうがくせいセンター", romaji: "ryūgakusei sentā", meaning: "international student center", kind: "kanji", emoji: "🏫", lesson: 41, sec: "6-1" },
  { term: "留学生", reading: "りゅうがくせい", romaji: "ryūgakusei", meaning: "study abroad student", kind: "kanji", emoji: "🎓", lesson: 41, sec: "6-1" },
  { term: "留学", reading: "りゅうがく", romaji: "ryūgaku", meaning: "study abroad (する = to study abroad)", kind: "kanji", emoji: "✈️", lesson: 41, sec: "6-1" },
  { term: "学部", reading: "がくぶ", romaji: "gakubu", meaning: "academic division, college", kind: "kanji", emoji: "🏛️", lesson: 41, sec: "6-1" },
  { term: "文学部", reading: "ぶんがくぶ", romaji: "bungakubu", meaning: "faculty of arts and humanities", kind: "kanji", emoji: "📚", lesson: 41, sec: "6-1" },
  { term: "ホームステイ", reading: "ホームステイ", romaji: "hōmusutei", meaning: "homestay", kind: "katakana", emoji: "🏠", lesson: 41, sec: "6-1" },
  { term: "合気道", reading: "あいきどう", romaji: "aikidō", meaning: "aikido (martial art)", kind: "kanji", emoji: "🥋", lesson: 41, sec: "6-1" },
  { term: "下手", reading: "へた", romaji: "heta", meaning: "unskillful, bad at", kind: "kanji", emoji: "👎", lesson: 41, sec: "6-1" },
  { term: "上手", reading: "じょうず", romaji: "jōzu", meaning: "skillful, good at", kind: "kanji", emoji: "👍", lesson: 41, sec: "6-1" },
  { term: "〜年生", reading: "〜ねんせい", romaji: "~nensei", meaning: "counter for a grade/class in school (e.g. 2nd-year student)", kind: "kanji", emoji: "🎓", lesson: 41, sec: "6-1" },
  { term: "〜君", reading: "〜くん", romaji: "~kun", meaning: "informal title added to names (esp. for boys/juniors)", kind: "kanji", emoji: "👦", lesson: 41, sec: "6-1" },
  { term: "もう", reading: "もう", romaji: "mō", meaning: "already", kind: "hiragana", emoji: "⏱️", lesson: 41, sec: "6-1" },
  { term: "まだ", reading: "まだ", romaji: "mada", meaning: "still, yet", kind: "hiragana", emoji: "⏳", lesson: 41, sec: "6-1" },
  { term: "右", reading: "みぎ", romaji: "migi", meaning: "right", kind: "kanji", emoji: "👉", lesson: 42, sec: "6-2" },
  { term: "左", reading: "ひだり", romaji: "hidari", meaning: "left", kind: "kanji", emoji: "👈", lesson: 42, sec: "6-2" },
  { term: "初段", reading: "しょだん", romaji: "shodan", meaning: "1st-degree black belt (martial arts, calligraphy, shōgi, go, etc.)", kind: "kanji", emoji: "🥋", lesson: 42, sec: "6-2" },
  { term: "近く", reading: "ちかく", romaji: "chikaku", meaning: "nearby, vicinity, neighborhood", kind: "kanji", emoji: "📍", lesson: 42, sec: "6-2" },
  { term: "向こう", reading: "むこう", romaji: "mukō", meaning: "opposite side, other side, over there", kind: "kanji", emoji: "🧭", lesson: 42, sec: "6-2" },
  { term: "隣", reading: "となり", romaji: "tonari", meaning: "next door, beside", kind: "kanji", emoji: "🚪", lesson: 42, sec: "6-2" },
  { term: "上", reading: "うえ", romaji: "ue", meaning: "top, over", kind: "kanji", emoji: "⬆️", lesson: 42, sec: "6-2" },
  { term: "下", reading: "した", romaji: "shita", meaning: "bottom, under", kind: "kanji", emoji: "⬇️", lesson: 42, sec: "6-2" },
  { term: "外", reading: "そと", romaji: "soto", meaning: "outside", kind: "kanji", emoji: "🌳", lesson: 42, sec: "6-2" },
  { term: "店", reading: "みせ", romaji: "mise", meaning: "store, shop", kind: "kanji", emoji: "🏪", lesson: 42, sec: "6-2" },
  { term: "生物", reading: "せいぶつ", romaji: "seibutsu", meaning: "biology", kind: "kanji", emoji: "🧬", lesson: 42, sec: "6-2" },
  { term: "教師", reading: "きょうし", romaji: "kyōshi", meaning: "instructor, teacher", kind: "kanji", emoji: "👨‍🏫", lesson: 42, sec: "6-2" },
  { term: "マネージャー", reading: "マネージャー", romaji: "manējā", meaning: "manager", kind: "katakana", emoji: "👔", lesson: 42, sec: "6-2" },
  { term: "リーダー", reading: "リーダー", romaji: "rīdā", meaning: "leader", kind: "katakana", emoji: "🎖️", lesson: 42, sec: "6-2" },
  { term: "医者", reading: "いしゃ", romaji: "isha", meaning: "(medical) doctor", kind: "kanji", emoji: "👨‍⚕️", lesson: 42, sec: "6-2" },
  { term: "開発", reading: "かいはつ", romaji: "kaihatsu", meaning: "development (する = to develop)", kind: "kanji", emoji: "🛠️", lesson: 42, sec: "6-2" },
  { term: "企画", reading: "きかく", romaji: "kikaku", meaning: "plan, project, design (する = to plan)", kind: "kanji", emoji: "📋", lesson: 42, sec: "6-2" },
  { term: "デザイン", reading: "デザイン", romaji: "dezain", meaning: "design (する = to design)", kind: "katakana", emoji: "🎨", lesson: 42, sec: "6-2" },
  { term: "マーケティング", reading: "マーケティング", romaji: "māketingu", meaning: "marketing", kind: "katakana", emoji: "📈", lesson: 42, sec: "6-2" },
  { term: "セールス", reading: "セールス", romaji: "sērusu", meaning: "sales", kind: "katakana", emoji: "💰", lesson: 42, sec: "6-2" },
  { term: "申す", reading: "もうす", romaji: "mōsu", meaning: "say (humble)", kind: "kanji", emoji: "🗣️", lesson: 42, sec: "6-2" },
  { term: "おっしゃる", reading: "おっしゃる", romaji: "ossharu", meaning: "say (honorific)", kind: "hiragana", emoji: "🗣️", lesson: 42, sec: "6-2" },
  { term: "〜人", reading: "〜にん・り", romaji: "~nin / ~ri", meaning: "counter for people", kind: "kanji", emoji: "👤", lesson: 42, sec: "6-2" },
  { term: "〜分間", reading: "〜ふんかん・ぷんかん", romaji: "~funkan / ~punkan", meaning: "counter for minutes (duration)", kind: "kanji", emoji: "⏱️", lesson: 42, sec: "6-2" },
  { term: "〜日間", reading: "〜かかん・にちかん", romaji: "~kakan / ~nichikan", meaning: "counter for days (duration)", kind: "kanji", emoji: "📅", lesson: 42, sec: "6-2" },
  { term: "〜年間", reading: "〜ねんかん", romaji: "~nenkan", meaning: "counter for years (duration)", kind: "kanji", emoji: "📆", lesson: 42, sec: "6-2" },
  { term: "一人ずつ", reading: "ひとりずつ", romaji: "hitori zutsu", meaning: "one (person) at a time", kind: "kanji", emoji: "🚶", lesson: 42, sec: "6-2" },
  { term: "〜間", reading: "〜かん", romaji: "~kan", meaning: "counter for an amount of time (hours, days, weeks, years)", kind: "kanji", emoji: "⏳", lesson: 42, sec: "6-2" },
  { term: "写真", reading: "しゃしん", romaji: "shashin", meaning: "photo", kind: "kanji", emoji: "📷", lesson: 43, sec: "6-3" },
  { term: "方", reading: "ほう", romaji: "hō", meaning: "way, alternative (of two)", kind: "kanji", emoji: "🔀", lesson: 43, sec: "6-3" },
  { term: "背", reading: "せ", romaji: "se", meaning: "back, spine, rear side (of the body)", kind: "kanji", emoji: "🧍", lesson: 43, sec: "6-3" },
  { term: "後ろ", reading: "うしろ", romaji: "ushiro", meaning: "back, behind", kind: "kanji", emoji: "🔙", lesson: 43, sec: "6-3" },
  { term: "前", reading: "まえ", romaji: "mae", meaning: "front", kind: "kanji", emoji: "🔼", lesson: 43, sec: "6-3" },
  { term: "真ん中", reading: "まんなか", romaji: "mannaka", meaning: "middle, center", kind: "kanji", emoji: "🎯", lesson: 43, sec: "6-3" },
  { term: "出口", reading: "でぐち", romaji: "deguchi", meaning: "exit", kind: "kanji", emoji: "🚪", lesson: 43, sec: "6-3" },
  { term: "入り口", reading: "いりぐち", romaji: "iriguchi", meaning: "entrance", kind: "kanji", emoji: "🚪", lesson: 43, sec: "6-3" },
  { term: "窓", reading: "まど", romaji: "mado", meaning: "window", kind: "kanji", emoji: "🪟", lesson: 43, sec: "6-3" },
  { term: "人", reading: "ひと", romaji: "hito", meaning: "person", kind: "kanji", emoji: "🧑", lesson: 43, sec: "6-3" },
  { term: "方", reading: "かた", romaji: "kata", meaning: "person (honorific)", kind: "kanji", emoji: "🙇", lesson: 43, sec: "6-3" },
  { term: "女の人", reading: "おんなのひと", romaji: "onna no hito", meaning: "woman", kind: "kanji", emoji: "👩", lesson: 43, sec: "6-3" },
  { term: "男の人", reading: "おとこのひと", romaji: "otoko no hito", meaning: "man", kind: "kanji", emoji: "👨", lesson: 43, sec: "6-3" },
  { term: "チーズ", reading: "チーズ", romaji: "chīzu", meaning: "cheese", kind: "katakana", emoji: "🧀", lesson: 43, sec: "6-3" },
  { term: "緑", reading: "みどり", romaji: "midori", meaning: "green", kind: "kanji", emoji: "🟢", lesson: 43, sec: "6-3" },
  { term: "紫", reading: "むらさき", romaji: "murasaki", meaning: "purple", kind: "kanji", emoji: "🟣", lesson: 43, sec: "6-3" },
  { term: "茶色", reading: "ちゃいろ", romaji: "chairo", meaning: "brown", kind: "kanji", emoji: "🟤", lesson: 43, sec: "6-3" },
  { term: "黄色", reading: "きいろ", romaji: "kiiro", meaning: "yellow", kind: "kanji", emoji: "🟡", lesson: 43, sec: "6-3" },
  { term: "グレー", reading: "グレー", romaji: "gurē", meaning: "gray", kind: "katakana", emoji: "🩶", lesson: 43, sec: "6-3" },
  { term: "ピンク", reading: "ピンク", romaji: "pinku", meaning: "pink", kind: "katakana", emoji: "🩷", lesson: 43, sec: "6-3" },
  { term: "赤", reading: "あか", romaji: "aka", meaning: "red", kind: "kanji", emoji: "🔴", lesson: 43, sec: "6-3" },
  { term: "白", reading: "しろ", romaji: "shiro", meaning: "white", kind: "kanji", emoji: "⚪", lesson: 43, sec: "6-3" },
  { term: "青", reading: "あお", romaji: "ao", meaning: "blue, green", kind: "kanji", emoji: "🔵", lesson: 43, sec: "6-3" },
  { term: "黒", reading: "くろ", romaji: "kuro", meaning: "black", kind: "kanji", emoji: "⚫", lesson: 43, sec: "6-3" },
  { term: "色", reading: "いろ", romaji: "iro", meaning: "color", kind: "kanji", emoji: "🎨", lesson: 43, sec: "6-3" },
  { term: "何色", reading: "なにいろ", romaji: "nani-iro", meaning: "what color", kind: "kanji", emoji: "❓", lesson: 43, sec: "6-3" },
  { term: "撮ります", reading: "とります", romaji: "torimasu", meaning: "to take (a photo) (u-verb; past: 撮った)", kind: "kanji", emoji: "📸", lesson: 43, sec: "6-3" },
  { term: "見えます", reading: "みえます", romaji: "miemasu", meaning: "to appear, be visible (ru-verb; past: 見えた)", kind: "kanji", emoji: "👁️", lesson: 43, sec: "6-3" },
  { term: "立ちます", reading: "たちます", romaji: "tachimasu", meaning: "to stand; (a building) to stand, be built (u-verb; past: 立った)", kind: "kanji", emoji: "🧍", lesson: 43, sec: "6-3" },
  { term: "座ります", reading: "すわります", romaji: "suwarimasu", meaning: "to sit (u-verb; past: 座った)", kind: "kanji", emoji: "🪑", lesson: 43, sec: "6-3" },
  { term: "寄ります", reading: "よります", romaji: "yorimasu", meaning: "to get close to, drop by, lean on (u-verb; past: 寄った)", kind: "kanji", emoji: "🚶‍♂️", lesson: 43, sec: "6-3" },
  { term: "（背が）高い", reading: "（せが）たかい", romaji: "(se ga) takai", meaning: "tall (in stature)", kind: "kanji", emoji: "📏", lesson: 43, sec: "6-3" },
  { term: "（背が）低い", reading: "（せが）ひくい", romaji: "(se ga) hikui", meaning: "short (in stature)", kind: "kanji", emoji: "📏", lesson: 43, sec: "6-3" },
  { term: "もっと", reading: "もっと", romaji: "motto", meaning: "more", kind: "hiragana", emoji: "➕", lesson: 43, sec: "6-3" },
  { term: "もう一枚", reading: "もういちまい", romaji: "mō ichi-mai", meaning: "one more sheet (e.g. photo)", kind: "kanji", emoji: "➕", lesson: 43, sec: "6-3" },
  { term: "もうちょっと", reading: "もうちょっと", romaji: "mō chotto", meaning: "a little more", kind: "hiragana", emoji: "➕", lesson: 43, sec: "6-3" },
  { term: "行きますよ。", reading: "いきますよ。", romaji: "ikimasu yo.", meaning: "Here we go!", kind: "kanji", emoji: "🚀", lesson: 43, sec: "6-3" },
  { term: "チーズ！", reading: "チーズ！", romaji: "chīzu!", meaning: "Cheese! (said when taking a photo)", kind: "katakana", emoji: "📸", lesson: 43, sec: "6-3" },
  { term: "名刺", reading: "めいし", romaji: "meishi", meaning: "business card", kind: "kanji", emoji: "📇", lesson: 44, sec: "6-4" },
  { term: "交換", reading: "こうかん", romaji: "kōkan", meaning: "exchange", kind: "kanji", emoji: "🔄", lesson: 44, sec: "6-4" },
  { term: "（お）世話", reading: "（お）せわ", romaji: "(o)sewa", meaning: "help, aid, assistance (for someone)", kind: "kanji", emoji: "🤝", lesson: 44, sec: "6-4" },
  { term: "番号", reading: "ばんごう", romaji: "bangō", meaning: "number", kind: "kanji", emoji: "🔢", lesson: 44, sec: "6-4" },
  { term: "（お）電話番号", reading: "（お）でんわばんごう", romaji: "(o)denwa bangō", meaning: "telephone number (polite, your number)", kind: "kanji", emoji: "☎️", lesson: 44, sec: "6-4" },
  { term: "（お）名前", reading: "（お）なまえ", romaji: "(o)namae", meaning: "name (your name, polite)", kind: "kanji", emoji: "📛", lesson: 44, sec: "6-4" },
  { term: "メール", reading: "メール", romaji: "mēru", meaning: "email", kind: "katakana", emoji: "📧", lesson: 44, sec: "6-4" },
  { term: "アドレス", reading: "アドレス", romaji: "adoresu", meaning: "(email) address", kind: "katakana", emoji: "📮", lesson: 44, sec: "6-4" },
  { term: "連絡先", reading: "れんらくさき", romaji: "renrakusaki", meaning: "contact information", kind: "kanji", emoji: "📇", lesson: 44, sec: "6-4" },
  { term: "おる", reading: "おる", romaji: "oru", meaning: "be, exist (humble form of います)", kind: "hiragana", emoji: "🙇", lesson: 44, sec: "6-4" },
  { term: "いらっしゃる", reading: "いらっしゃる", romaji: "irassharu", meaning: "be, exist (honorific form of います)", kind: "hiragana", emoji: "🙏", lesson: 44, sec: "6-4" },
  { term: "はじめまして。", reading: "はじめまして。", romaji: "hajimemashite.", meaning: "How do you do.", kind: "hiragana", emoji: "🙇", lesson: 44, sec: "6-4" },
  { term: "いつもお世話になっております。", reading: "いつもおせわになっております。", romaji: "itsumo osewa ni natte orimasu.", meaning: "Thank you for your continued support (lit. I am always indebted to you).", kind: "kanji", emoji: "🙇‍♂️", lesson: 44, sec: "6-4" },
  { term: "申し訳ございません。", reading: "もうしわけございません。", romaji: "mōshiwake gozaimasen.", meaning: "I am terribly sorry (lit. I have no excuse).", kind: "kanji", emoji: "🙇", lesson: 44, sec: "6-4" },
  { term: "課長", reading: "かちょう", romaji: "kachō", meaning: "section chief", kind: "kanji", emoji: "👔", lesson: 45, sec: "6-5" },
  { term: "社長", reading: "しゃちょう", romaji: "shachō", meaning: "company president", kind: "kanji", emoji: "🏢", lesson: 45, sec: "6-5" },
  { term: "所長", reading: "しょちょう", romaji: "shochō", meaning: "head of a laboratory, research center", kind: "kanji", emoji: "🔬", lesson: 45, sec: "6-5" },
  { term: "学長", reading: "がくちょう", romaji: "gakuchō", meaning: "school president", kind: "kanji", emoji: "🏫", lesson: 45, sec: "6-5" },
  { term: "（お）話", reading: "（お）はなし", romaji: "(o)hanashi", meaning: "talk", kind: "kanji", emoji: "💬", lesson: 45, sec: "6-5" },
  { term: "（ご）相談", reading: "（ご）そうだん", romaji: "(go)sōdan", meaning: "consultation (する = to consult)", kind: "kanji", emoji: "🗣️", lesson: 45, sec: "6-5" },
  { term: "（ご）報告", reading: "（ご）ほうこく", romaji: "(go)hōkoku", meaning: "report (する = to report)", kind: "kanji", emoji: "📢", lesson: 45, sec: "6-5" },
  { term: "アポ", reading: "アポ", romaji: "apo", meaning: "appointment", kind: "katakana", emoji: "📅", lesson: 45, sec: "6-5" },
  { term: "留守", reading: "るす", romaji: "rusu", meaning: "away from home or work", kind: "kanji", emoji: "🚪", lesson: 45, sec: "6-5" },
  { term: "空きます", reading: "あきます", romaji: "akimasu", meaning: "to become free, become empty (e.g. of time, a seat) (u-verb; past: 空いた)", kind: "kanji", emoji: "🆓", lesson: 45, sec: "6-5" },
  { term: "休みます", reading: "やすみます", romaji: "yasumimasu", meaning: "to take a break, rest, go on vacation/holiday (u-verb; past: 休んだ)", kind: "kanji", emoji: "😴", lesson: 45, sec: "6-5" },
  { term: "いたす", reading: "いたす", romaji: "itasu", meaning: "do (humble)", kind: "hiragana", emoji: "🙇", lesson: 45, sec: "6-5" },
  { term: "〜たい", reading: "〜たい", romaji: "~tai", meaning: "want to (do something) — verb suffix", kind: "hiragana", emoji: "🙌", lesson: 45, sec: "6-5" },
  { term: "いつか", reading: "いつか", romaji: "itsuka", meaning: "sometime", kind: "hiragana", emoji: "🗓️", lesson: 45, sec: "6-5" },
  { term: "何か", reading: "なにか", romaji: "nanika", meaning: "something", kind: "kanji", emoji: "❓", lesson: 45, sec: "6-5" },
  { term: "〜について", reading: "〜について", romaji: "~ni tsuite", meaning: "with regard to, concerning ~", kind: "hiragana", emoji: "📌", lesson: 45, sec: "6-5" },
  { term: "いかが", reading: "いかが", romaji: "ikaga", meaning: "how (polite)", kind: "hiragana", emoji: "🙋", lesson: 45, sec: "6-5" },
  { term: "ずっと", reading: "ずっと", romaji: "zutto", meaning: "continuously, by far, the whole time", kind: "hiragana", emoji: "⏩", lesson: 45, sec: "6-5" },
  { term: "ランチ", reading: "ランチ", romaji: "ranchi", meaning: "lunch, lunch special", kind: "katakana", emoji: "🍱", lesson: 46, sec: "6-6" },
  { term: "定食", reading: "ていしょく", romaji: "teishoku", meaning: "set meal", kind: "kanji", emoji: "🍽️", lesson: 46, sec: "6-6" },
  { term: "（お）勧め", reading: "（お）すすめ", romaji: "(o)susume", meaning: "recommendation, suggestion", kind: "kanji", emoji: "👍", lesson: 46, sec: "6-6" },
  { term: "他", reading: "ほか", romaji: "hoka", meaning: "other, else, besides", kind: "kanji", emoji: "➕", lesson: 46, sec: "6-6" },
  { term: "別", reading: "べつ", romaji: "betsu", meaning: "different, separate, distinct", kind: "kanji", emoji: "🔀", lesson: 46, sec: "6-6" },
  { term: "もの", reading: "もの", romaji: "mono", meaning: "thing (tangible)", kind: "hiragana", emoji: "📦", lesson: 46, sec: "6-6" },
  { term: "グルメ", reading: "グルメ", romaji: "gurume", meaning: "gourmet, connoisseur", kind: "katakana", emoji: "🍴", lesson: 46, sec: "6-6" },
  { term: "頼みます", reading: "たのみます", romaji: "tanomimasu", meaning: "to order (at a restaurant), request (u-verb; past: 頼んだ)", kind: "kanji", emoji: "🍽️", lesson: 46, sec: "6-6" },
  { term: "迷います", reading: "まよいます", romaji: "mayoimasu", meaning: "to become confused, get lost, hesitate (u-verb; past: 迷った)", kind: "kanji", emoji: "🤔", lesson: 46, sec: "6-6" },
  { term: "困ります", reading: "こまります", romaji: "komarimasu", meaning: "to be troubled, be bothered, be embarrassed (u-verb; past: 困った)", kind: "kanji", emoji: "😟", lesson: 46, sec: "6-6" },
  { term: "存じる", reading: "ぞんじる", romaji: "zonjiru", meaning: "know, find out (humble)", kind: "kanji", emoji: "🙇", lesson: 46, sec: "6-6" },
  { term: "知ります", reading: "しります", romaji: "shirimasu", meaning: "to find out, come to know (u-verb; past: 知った)", kind: "kanji", emoji: "💡", lesson: 46, sec: "6-6" },
  { term: "知っている", reading: "しっている", romaji: "shitte iru", meaning: "know (ongoing state)", kind: "kanji", emoji: "💡", lesson: 46, sec: "6-6" },
  { term: "勧めます", reading: "すすめます", romaji: "susumemasu", meaning: "to recommend to (someone), advise, encourage (ru-verb; past: 勧めた)", kind: "kanji", emoji: "👍", lesson: 46, sec: "6-6" },
  { term: "より", reading: "より", romaji: "yori", meaning: "compared to (comparison particle)", kind: "hiragana", emoji: "⚖️", lesson: 46, sec: "6-6" },
  { term: "ほど", reading: "ほど", romaji: "hodo", meaning: "as much as (comparison particle)", kind: "hiragana", emoji: "⚖️", lesson: 46, sec: "6-6" },
  { term: "お待たせしました。", reading: "おまたせしました。", romaji: "omatase shimashita.", meaning: "Sorry to make you wait.", kind: "kanji", emoji: "⏰", lesson: 46, sec: "6-6" },
  { term: "何も", reading: "なにも", romaji: "nanimo", meaning: "nothing (+ negative)", kind: "kanji", emoji: "🚫", lesson: 46, sec: "6-6" },
  { term: "さすが", reading: "さすが", romaji: "sasuga", meaning: "true to (your reputation), just as expected", kind: "hiragana", emoji: "👏", lesson: 46, sec: "6-6" },
  { term: "ご存知だ", reading: "ごぞんじだ", romaji: "gozonji da", meaning: "know (honorific)", kind: "kanji", emoji: "🙏", lesson: 46, sec: "6-6" },
  { term: "〜にする", reading: "〜にする", romaji: "~ni suru", meaning: "decide on ~, choose", kind: "hiragana", emoji: "✅", lesson: 46, sec: "6-6" },
  { term: "〜に聞く", reading: "〜にきく", romaji: "~ni kiku", meaning: "ask ~ (about something)", kind: "kanji", emoji: "❓", lesson: 46, sec: "6-6" },
  { term: "〜に／と相談する", reading: "〜に／とそうだんする", romaji: "~ni/to sōdan suru", meaning: "consult with ~", kind: "kanji", emoji: "🗣️", lesson: 46, sec: "6-6" },
  { term: "〜に報告する", reading: "〜にほうこくする", romaji: "~ni hōkoku suru", meaning: "make a report to ~", kind: "kanji", emoji: "📢", lesson: 46, sec: "6-6" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

// ── storage helpers ──
// window.storage is a Claude.ai artifact-sandbox API — it does NOT exist on the
// deployed site. localStorage is the real persistence layer there; window.storage
// (if present) is preferred only when running inside the Claude artifact preview.
// Memory-only `mem` is the last-resort fallback (e.g. storage blocked entirely).
const mem = {};
async function sGet(key) {
  try {
    if (window.storage?.get) {
      const r = await window.storage.get(key);
      if (r) return r.value;
    }
  } catch (e) { /* key missing or unavailable */ }
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) { /* localStorage blocked (private mode, disabled, etc.) */ }
  return key in mem ? mem[key] : null;
}
async function sSet(key, value) {
  let ok = false;
  for (let i = 0; i < 2 && !ok; i++) {
    if (!window.storage?.set) break;
    try { await window.storage.set(key, value); mem[key] = value; ok = true; }
    catch (e) { await new Promise((res) => setTimeout(res, 600)); /* retry once */ }
  }
  if (!ok) {
    try { window.localStorage.setItem(key, value); mem[key] = value; ok = true; }
    catch (e) { /* quota exceeded or storage blocked */ }
  }
  if (!ok) mem[key] = value;   // memory-only fallback: survives this session, NOT a reload
  if (ok && key.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(key)) scheduleCloudPush();
  return ok;
}

// ── cross-device sync (Netlify Blobs via /.netlify/functions/sync) ──
// Every device has a short "sync code". Any device using the same code reads
// and writes the same cloud snapshot, so progress made on one device shows up
// on the others. Merging is per-record (not whole-file last-write-wins) so
// studying on two devices before either has synced never loses progress.
const SYNC_KEY = "jpn101:syncCode";
const SYNC_ENDPOINT = "/.netlify/functions/sync";
const SYNC_PREFIX = "jpn101:";
const SYNC_SKIP_KEYS = new Set(["jpn101:ping", "jpn101:syncCode", "jpn101:syncLastPulled", "jpn101:snapshot"]);

function genSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous-looking chars
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function getSyncCode() {
  try {
    let c = window.localStorage.getItem(SYNC_KEY);
    if (!c) { c = genSyncCode(); window.localStorage.setItem(SYNC_KEY, c); }
    return c;
  } catch (e) { return null; }
}
function setSyncCode(code) {
  try { window.localStorage.setItem(SYNC_KEY, code); } catch (e) {}
}
function collectLocalSnapshot() {
  const snap = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(SYNC_PREFIX) && !SYNC_SKIP_KEYS.has(k)) snap[k] = window.localStorage.getItem(k);
    }
  } catch (e) {}
  return snap;
}
function cardMergeKey(c) { return c.term + "|" + (c.lesson || "") + "|" + (c.sec || ""); }   // term alone collapses legit duplicate words that appear in two different lessons (e.g. なるほど in both 3-1 and 3-3)
function mergeDeck(localRaw, cloudRaw) {   // per-card: keep whichever side studied that card more/most recently
  let local = [], cloud = [];
  try { local = localRaw ? JSON.parse(localRaw) : []; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : []; } catch (e) {}
  if (!cloud.length) return localRaw;
  if (!local.length) return cloudRaw;
  const byKey = new Map(local.map((c) => [cardMergeKey(c), c]));
  cloud.forEach((c) => {
    const key = cardMergeKey(c);
    const ex = byKey.get(key);
    if (!ex) { byKey.set(key, c); return; }
    const exScore = (ex.seen || 0) * 1e6 + (ex.last || 0);
    const cScore = (c.seen || 0) * 1e6 + (c.last || 0);
    if (cScore > exScore) byKey.set(key, c);
  });
  return JSON.stringify(Array.from(byKey.values()));
}
function mergeDays(localRaw, cloudRaw) {   // per-day: keep whichever side logged more reviews that day
  let local = {}, cloud = {};
  try { local = localRaw ? JSON.parse(localRaw) : {}; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : {}; } catch (e) {}
  const out = { ...local };
  Object.keys(cloud).forEach((day) => {
    const c = cloud[day], l = out[day];
    if (!l || (c.rev || 0) > (l.rev || 0)) out[day] = c;
  });
  return JSON.stringify(out);
}
function mergeScripts(localRaw, cloudRaw) {   // union by id, preferring the fully-annotated copy
  let local = [], cloud = [];
  try { local = localRaw ? JSON.parse(localRaw) : []; } catch (e) {}
  try { cloud = cloudRaw ? JSON.parse(cloudRaw) : []; } catch (e) {}
  if (!cloud.length) return localRaw;
  const byId = new Map(local.map((s) => [s.id, s]));
  cloud.forEach((s) => {
    const ex = byId.get(s.id);
    if (!ex || (ex.plain && !s.plain)) byId.set(s.id, s);
  });
  return JSON.stringify(Array.from(byId.values()));
}
function mergeSnapshots(localSnap, cloudSnap, cloudUpdatedAt, localLastPulled) {
  const out = { ...localSnap };
  const keys = new Set([...Object.keys(localSnap), ...Object.keys(cloudSnap)]);
  keys.forEach((k) => {
    if (k === "jpn101:deck") { out[k] = mergeDeck(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:days") { out[k] = mergeDays(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:scripts" || k === "jpn101:scripts:mirror") { out[k] = mergeScripts(localSnap[k], cloudSnap[k]); return; }
    if (k === "jpn101:deckVersion") { out[k] = String(Math.max(Number(localSnap[k] || 0), Number(cloudSnap[k] || 0))); return; }
    if (!(k in localSnap)) { out[k] = cloudSnap[k]; return; }   // new key we don't have locally yet
    if (k in cloudSnap && cloudUpdatedAt && cloudUpdatedAt > (localLastPulled || 0)) out[k] = cloudSnap[k];   // secondary keys: newer whole snapshot wins
  });
  return out;
}
// ── Google Sign-In with a real persistent session ──
// One explicit click exchanges a Google ID token for OUR OWN long-lived signed
// session token (~2 years), stored in localStorage. Every later visit just reads
// that token straight from storage — no re-running Google's sign-in flow, no
// dependency on browser silent-reauth (which is unreliable and was causing
// "asks me to log in again every time"). Falls back to the manual sync code
// only if the user has never signed in with Google at all.
const GOOGLE_CLIENT_ID = "249268364314-fkmn7ol1jtkv12sme6fjp70fj2cpr6l3.apps.googleusercontent.com";
const SESSION_KEY = "jpn101:session";
const USER_EMAIL_KEY = "jpn101:userEmail";
function loadSession() {
  try { return window.localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
}
function saveSession(session, email) {
  try {
    window.localStorage.setItem(SESSION_KEY, session);
    if (email) window.localStorage.setItem(USER_EMAIL_KEY, email);
  } catch (e) {}
}
function signOutGoogle() {
  try { window.localStorage.removeItem(SESSION_KEY); window.localStorage.removeItem(USER_EMAIL_KEY); } catch (e) {}
  _googleEmail = null;
}
let _googleEmail = (() => { try { return window.localStorage.getItem(USER_EMAIL_KEY); } catch (e) { return null; } })();
let _gisReadyPromise = null;
function gisReady() {
  if (_gisReadyPromise) return _gisReadyPromise;
  _gisReadyPromise = new Promise((resolve) => {
    (function check() { if (window.google?.accounts?.id) resolve(); else setTimeout(check, 150); })();
  });
  return _gisReadyPromise;
}
async function exchangeForSession(idToken) {
  try {
    const res = await fetch(SYNC_ENDPOINT + "?exchange=1", {
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return false;
    const { session, email } = await res.json();
    if (!session) return false;
    saveSession(session, email);
    _googleEmail = email;
    return true;
  } catch (e) { return false; /* offline — try again next click */ }
}
let _googleInitDone = false;
let _googleTokenListeners = [];   // every caller's callback fires — initialize() itself only ever runs once
function initGoogleAuth(onToken) {
  if (onToken) _googleTokenListeners.push(onToken);
  if (loadSession()) return;   // already have a persistent session — no need to touch Google's flow at all
  gisReady().then(() => {
    if (!_googleInitDone) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          const ok = await exchangeForSession(resp.credential);
          if (ok) _googleTokenListeners.forEach((fn) => { try { fn(); } catch (e) {} });
        },
      });
      _googleInitDone = true;
    }
  });
}
function renderGoogleButton(el) {
  if (!el || loadSession()) return;
  gisReady().then(() => {
    try { window.google.accounts.id.renderButton(el, { theme: "outline", size: "medium", text: "signin_with" }); } catch (e) {}
  });
}
function syncRequestOptions(extra) {
  const opts = { ...extra, cache: "no-store", headers: { ...((extra && extra.headers) || {}) } };
  const session = loadSession();
  if (session) {
    opts.headers.authorization = "Bearer " + session;
    return { url: SYNC_ENDPOINT, opts };
  }
  return { url: SYNC_ENDPOINT + "?code=" + encodeURIComponent(getSyncCode()), opts };
}

async function pushCloudNow() {   // immediate, non-debounced — used right after sign-in so existing local progress uploads without waiting on the next study action
  try {
    const { url, opts } = syncRequestOptions({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ updatedAt: Date.now(), snapshot: collectLocalSnapshot() }),
    });
    await fetch(url, opts);
    return true;
  } catch (e) { return false; /* offline or endpoint unreachable — local data is still safe */ }
}
let _cloudPushTimer = null;
function scheduleCloudPush() {
  if (_cloudPushTimer) clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(pushCloudNow, 2500);
}
async function pullAndMergeCloud() {
  try {
    const { url, opts } = syncRequestOptions({});
    const res = await fetch(url, opts);
    if (!res.ok) return false;
    const { data } = await res.json();
    if (!data || !data.snapshot) return false;
    const localSnap = collectLocalSnapshot();
    let lastPulled = 0;
    try { lastPulled = Number(window.localStorage.getItem("jpn101:syncLastPulled") || 0); } catch (e) {}
    const merged = mergeSnapshots(localSnap, data.snapshot, data.updatedAt, lastPulled);
    Object.keys(merged).forEach((k) => { try { window.localStorage.setItem(k, merged[k]); } catch (e) {} });
    try { window.localStorage.setItem("jpn101:syncLastPulled", String(Date.now())); } catch (e) {}
    return true;
  } catch (e) { return false; /* offline — keep using local data */ }
}

const KIND_LABEL = { kanji: "漢字", hiragana: "ひらがな", katakana: "カタカナ", mixed: "混" };

/* ── daily study log: reviews, hits, think-time, new-word intake, per day ── */
const DAYS_KEY = "jpn101:days";
let _days = null;
async function loadDays() {
  if (_days === null) { try { const r = await sGet(DAYS_KEY); _days = r ? JSON.parse(r) : {}; } catch (e) { _days = {}; } }
  return _days;
}
async function logDay({ ok, ms, deck, fnew }) {
  await loadDays();
  const k = new Date().toISOString().slice(0, 10);
  const d = _days[k] || (_days[k] = { rev: 0, ok: 0, ms: 0, frev: 0, fnew: 0 });
  d.rev += 1; if (ok) d.ok += 1; if (ms) d.ms += ms;
  if (deck === "freq") { d.frev += 1; if (fnew) d.fnew += 1; }
  sSet(DAYS_KEY, JSON.stringify(_days));
}

function detectKind(term) {
  if (/[\u4E00-\u9FFF]/.test(term)) return "kanji";
  if (/[\u30A0-\u30FF]/.test(term)) return "katakana";
  if (/[\u3040-\u309F]/.test(term)) return "hiragana";
  return "mixed";
}

function isEmoji(s) {
  const t = (s || "").trim();
  if (!t || t.length > 5) return false;
  try { return /\p{Extended_Pictographic}/u.test(t); } catch (e) { return /[\u2190-\u2BFF\u2700-\u27BF]/.test(t); }
}

export default function JpnFlashcards() {
  const [cards, setCards] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("study");
  const [storageOk, setStorageOk] = useState(true);

  const bannerBackup = async () => {   // one-tap backup from the storage-dead banner; sGet's mem fallback still holds this session's data
    let kana = null, scripts = null, freq = null, days = null, hooks = null, quota = null, oral = null;
    try { const k = await sGet("jpn101:kana"); if (k) kana = JSON.parse(k); } catch (e) {}
    try { const sc = await sGet("jpn101:scripts"); if (sc) scripts = JSON.parse(sc); } catch (e) {}
    try { const f = await sGet("jpn101:freq"); if (f) freq = JSON.parse(f); } catch (e) {}
    try { const d = await sGet("jpn101:days"); if (d) days = JSON.parse(d); } catch (e) {}
    try { const h = await sGet("jpn101:hooks"); if (h) hooks = JSON.parse(h); } catch (e) {}
    try { quota = await sGet("jpn101:freqQuota"); } catch (e) {}
    try { const or = await sGet("jpn101:oralAttempts"); if (or) oral = JSON.parse(or); } catch (e) {}
    const blob = JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), deck: cards, kana, scripts, freq, days, hooks, quota, oral });
    try {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { await navigator.clipboard.writeText(blob); } catch (e) {}
  };

  useEffect(() => {   // storage self-test: write a ping, read it straight back from real storage (not the mem fallback)
    (async () => {
      const stamp = "ping-" + Date.now();
      try {
        if (window.storage?.set && window.storage?.get) {
          await window.storage.set("jpn101:ping", stamp);
          const back = await window.storage.get("jpn101:ping");
          if (back?.value === stamp) { setStorageOk(true); return; }
        }
      } catch (e) { /* fall through to localStorage check */ }
      try {
        window.localStorage.setItem("jpn101:ping", stamp);
        setStorageOk(window.localStorage.getItem("jpn101:ping") === stamp);
      } catch (e) { setStorageOk(false); }
    })();
  }, []);

  // ── load, cloud-merge, seed-merge, THEN push — strictly in that order ──
  // Two separate effects used to do this uncoordinated (one pushed local state to the
  // cloud while the other was still pulling), so a device with stale local data could
  // race ahead and blindly overwrite genuinely newer cloud progress before ever pulling
  // it down (the server just overwrites on POST — all merging is client-side, so pull
  // MUST complete and be written to local storage before any push happens). Now it's one
  // serial chain: pull+merge cloud -> seed-merge -> push the final result once.
  const loadCardsAndSync = useCallback(async () => {
    try { await pullAndMergeCloud(); } catch (e) { /* offline — proceed with whatever's local */ }
    const rawCards = await sGet(STORE_KEY);
    const rawVer = await sGet(SEED_KEY);
    let list = null;
    try { list = rawCards ? JSON.parse(rawCards) : null; } catch (e) { list = null; }
    const ver = rawVer ? Number(rawVer) : 0;

    if (!list) {
      list = SEED.map((c) => ({ id: uid(), seen: 0, correct: 0, ...c }));
      await sSet(STORE_KEY, JSON.stringify(list));
      await sSet(SEED_KEY, String(SEED_VERSION));
    } else if (ver < SEED_VERSION) {
      // safety net: snapshot the pre-merge deck in backup format before touching anything
      try { await sSet("jpn101:snapshot", JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), note: "auto-snapshot before v" + SEED_VERSION + " merge", deck: list })); } catch (e) {}
      const byTerm = new Map(list.map((c) => [c.term, c]));
      SEED.forEach((s) => {
        const ex = byTerm.get(s.term);
        if (ex) Object.assign(ex, { reading: s.reading, romaji: s.romaji, meaning: s.meaning, kind: s.kind, emoji: s.emoji, pitch: s.pitch, lesson: s.lesson });
        else { const nc = { id: uid(), seen: 0, correct: 0, ...s }; list.push(nc); byTerm.set(s.term, nc); }
      });
      await sSet(STORE_KEY, JSON.stringify(list));
      await sSet(SEED_KEY, String(SEED_VERSION));
    }
    setCards(list);
    setReady(true);
    await pushCloudNow();   // push the final merged+seeded result once, now that it's genuinely up to date
  }, []);

  useEffect(() => { loadCardsAndSync(); }, [loadCardsAndSync]);

  // Not signed in yet on this device? Re-run the exact same pull->merge->push chain
  // once sign-in completes, so a fresh device pulls real cloud progress before anything
  // could push a blank/local-only deck over it.
  useEffect(() => {
    if (!loadSession()) initGoogleAuth(loadCardsAndSync);
  }, [loadCardsAndSync]);

  const persist = useCallback((next) => {
    setCards(next);
    sSet(STORE_KEY, JSON.stringify(next));
  }, []);

  const addCards = useCallback((newOnes) => {
    setCards((prev) => {
      const have = new Set(prev.map((c) => c.term));
      const fresh = newOnes
        .filter((c) => c.term && !have.has(c.term))
        .map((c) => ({ id: uid(), seen: 0, correct: 0, sample: false, kind: c.kind || detectKind(c.term), ...c }));
      const nextLesson = prev.reduce((m, c) => Math.max(m, c.lesson || 1), 0) + 1;
      fresh.forEach((c) => { if (c.lesson == null) c.lesson = nextLesson; });
      const next = [...prev, ...fresh];
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCard = useCallback((id) => {
    setCards((prev) => { const next = prev.filter((c) => c.id !== id); sSet(STORE_KEY, JSON.stringify(next)); return next; });
  }, []);

  const clearAll = useCallback(() => { persist([]); }, [persist]);
  const restoreDeck = useCallback(async (deck) => { persist(deck); }, [persist]);


  const recordResult = useCallback((id, got, dir, ms) => {
    const t = ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0;  // sanity bounds: ignore misfires & walked-away cards
    logDay({ ok: got, ms: t, deck: "class" });
    setCards((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const firstProdTry = dir === "prod" && (c.rseen || 0) === 0;   // first attempt at producing = learning, not a lapse
        const delta = got ? 0.05 : firstProdTry ? 0 : -0.15;
        const ease = Math.max(0.55, Math.min(1.8, (c.ease || 1) + delta)); // adaptive: misses tighten the leash
        const base = { ...c, ease, streak: got ? (c.streak || 0) + 1 : 0, last: Date.now() };
        if (dir === "prod") {                       // EN→JP recall (production)
          return {
            ...base,
            rseen: (c.rseen || 0) + 1,
            rcorrect: (c.rcorrect || 0) + (got ? 1 : 0),
            rms: (c.rms || 0) + t, rmsN: (c.rmsN || 0) + (t ? 1 : 0),
            rlevel: got ? Math.min(5, (c.rlevel || 0) + 1) : Math.max(0, (c.rlevel || 0) - 2),
          };
        }
        return {                                    // JP→EN recognition
          ...base,
          seen: (c.seen || 0) + 1,
          correct: (c.correct || 0) + (got ? 1 : 0),
          ms: (c.ms || 0) + t, msN: (c.msN || 0) + (t ? 1 : 0),
          level: got ? Math.min(5, (c.level || 0) + 1) : Math.max(0, (c.level || 0) - 2),
        };
      });
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <div className="tc-root">
      <style>{CSS}</style>
      <div className="tc-shell">
        {!storageOk && (
          <div className="tc-senterr" style={{ margin: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span>⚠️ Storage isn't working in this session — anything you add or review lives only until you close the app. Tap Backup before closing (it downloads a file + copies to clipboard), then Restore it next session.</span>
            <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={bannerBackup} style={{ alignSelf: "flex-start" }}>💾 Backup now</button>
          </div>
        )}
        <header className="tc-head">
          <div className="tc-brandblock">
            <span className="tc-seal" aria-hidden="true">朱</span>
            <div>
              <h1 className="tc-wordmark">単語帳 <span className="tc-build">b59</span></h1>
              <p className="tc-sub">JPN 101 · flashcards · <span className="tc-count">{cards.length} words</span></p>
            </div>
          </div>
          <nav className="tc-tabs" role="tablist" aria-label="Sections">
            {[["study", "Study"], ["freq", "10k"], ["drill", "Drill"], ["write", "Write"], ["kana", "Kana"], ["scripts", "Scripts"], ["browse", "Browse"]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id}
                className={"tc-tab" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>

        </header>

        {!ready ? (
          <div className="tc-empty">Loading your deck…</div>
        ) : tab === "study" ? (
          <Study cards={cards} onResult={recordResult} goAdd={() => setTab("browse")} />
        ) : tab === "freq" ? (
          <Freq />
        ) : tab === "drill" ? (
          <ConjDrill />
        ) : tab === "write" ? (
          <Write cards={cards} onResult={recordResult} />
        ) : tab === "kana" ? (
          <Kana />
        ) : tab === "scripts" ? (
          <Scripts />
        ) : (
          <Browse cards={cards} onRemove={removeCard} onClear={clearAll} onRestore={restoreDeck} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── STUDY ───────────────────────────── */
function Study({ cards, onResult, goAdd }) {
  const [showRomaji, setShowRomaji] = useState(false); // front rōmaji on/off
  const [showPitch, setShowPitch] = useState(true);    // back pitch ⸢ ⸣ marks on/off
  const [queue, setQueue] = useState([]);              // working order; missed cards get re-inserted
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);         // unique cards this session
  const [passed, setPassed] = useState(() => new Set());     // cleared (eventually correct)
  const [firstTry, setFirstTry] = useState(() => new Set()); // correct with no prior miss
  const [struggled, setStruggled] = useState(() => new Set()); // missed at least once
  const missRef = useRef({});                          // id -> miss count this session
  const hooksRef = useRef(null);                       // term -> memory hook (cached forever)
  const [hook, setHook] = useState(null);              // {term, text|"...", err}
  const [debrief, setDebrief] = useState(null);        // {text} | {err} | {busy:true}
  const getHook = useCallback(async (card) => {
    if (hooksRef.current === null) {
      hooksRef.current = {};
      try { const r = await sGet("jpn101:hooks"); if (r) hooksRef.current = JSON.parse(r) || {}; } catch (e) {}
    }
    const cached = hooksRef.current[card.term];
    if (cached) { setHook({ term: card.term, text: cached }); return; }
    setHook({ term: card.term, text: "", busy: true });
    try {
      const text = (await callClaude(hookPrompt(card))).trim();
      hooksRef.current[card.term] = text;
      sSet("jpn101:hooks", JSON.stringify(hooksRef.current));
      setHook({ term: card.term, text });
    } catch (e) { setHook({ term: card.term, err: true }); }
  }, []);
  const [flipped, setFlipped] = useState(false);
  const [running, setRunning] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const liveRef = useRef(null);
  const shownRef = useRef(0);          // when the current card appeared
  const thinkRef = useRef(null);       // ms from shown → first reveal (think time)
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, running]);
  useEffect(() => {                    // auto-speak the term as soon as each card appears
    if (!running || !voiceOn) return;
    const c = queue[pos];
    if (!c) return;
    speakJa(c.reading || c.term, 0.9);
    return stopJa;
  }, [running, voiceOn, pos, queue]);
  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
      return !f;
    });
  }, []);
  const REQUEUE_GAP = 3, REQUEUE_CAP = 3;

  const weak = useMemo(() => cards.filter(isWeak), [cards]);

  const ranked = useMemo(() => cards.filter((c) => (c.seen || 0) > 0)
    .slice().sort((a, b) => masteryScore(a) - masteryScore(b)), [cards]);
  const weakest = useMemo(() => ranked.slice(0, 3), [ranked]);
  const focusPool = useMemo(() => ranked.slice(0, 12), [ranked]);  // weakest STUDIED words only — matches the Weakest list
  const newCount = useMemo(() => cards.filter((c) => !((c.seen || 0) > 0)).length, [cards]);
  const coverage = newCount > 12;                            // coverage phase: plenty of untouched words left
  const smartPool = useMemo(() => {
    const now = Date.now();
    const studied = cards.filter((c) => (c.seen || 0) > 0)
      .map((c) => ({ c, s: needScore(c, now) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    const fresh = cards.filter((c) => !((c.seen || 0) > 0))
      .sort((a, b) => (a.lesson || 0) - (b.lesson || 0));   // earliest untouched lessons first
    if (coverage) return [...fresh.slice(0, 8), ...studied.slice(0, 8)];   // learn new first, then review
    return [...studied.slice(0, 12), ...fresh.slice(0, Math.min(4, fresh.length))];
  }, [cards, coverage]);
  const dueCount = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => (c.seen || 0) > 0 && dueness(c, now) >= 1).length;
  }, [cards]);
  const masteredPct = useMemo(() => {
    if (!cards.length) return 0;
    return Math.round(cards.filter((c) => (c.level || 0) >= 4).length / cards.length * 100);
  }, [cards]);

  const batches = useMemo(() => {
    const map = new Map();
    cards.forEach((c) => { const sec = sectionOf(c); if (!map.has(sec)) map.set(sec, []); map.get(sec).push(c); });
    const scored = (group) => {
      let seen = 0, correct = 0;
      group.forEach((c) => { seen += c.seen || 0; correct += c.correct || 0; });
      return seen ? correct / seen : null;
    };
    const base = Array.from(map.keys()).map((sec) => ({ name: sec, cards: map.get(sec), rate: scored(map.get(sec)) }));

    // synthetic per-Act "Dry Run" — a cumulative review across every scene of an act, so you
    // can drill a whole act at once instead of one scene chip at a time.
    const actGroups = new Map();
    cards.forEach((c) => {
      const m = /^(\d+)-/.exec(sectionOf(c));
      if (!m) return;
      const act = m[1];
      if (!actGroups.has(act)) actGroups.set(act, []);
      actGroups.get(act).push(c);
    });
    const dryRuns = [];
    actGroups.forEach((group, act) => {
      if (group.length < 8) return; // not worth a separate cumulative review for a tiny act
      dryRuns.push({ name: `Act ${act} Dry Run`, cards: group, rate: scored(group) });
    });

    return base.concat(dryRuns).sort((a, b) => sectionRank(a.name) - sectionRank(b.name));
  }, [cards]);

  const smartBatch = useMemo(() => {
    if (!batches.length) return null;
    const fresh = batches.filter((b) => b.rate === null);
    if (fresh.length) return fresh[0];
    return batches.slice().sort((a, b) => a.rate - b.rate)[0];
  }, [batches]);

  const start = useCallback((subset, preordered) => {
    const pool0 = (subset && subset.length) ? subset : cards;
    // leech throttle: drilling stuck words harder doesn't work — cap them per session
    const leeches = pool0.filter(isLeech);
    const pool = leeches.length > 3 ? pool0.filter((c) => !isLeech(c)).concat(leeches.slice(0, 3)) : pool0;
    const ordered = (preordered ? [...pool] : pool
      .map((c) => ({ c, k: masteryScore(c) + Math.random() * 0.3 }))  // weakest (lowest) first; small stable jitter
      .sort((a, b) => a.k - b.k)
      .map((x) => x.c));
    setQueue(ordered);
    setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {};
    setHook(null); setDebrief(null);
    setFlipped(false); setRunning(true);
  }, [cards, coverage]);

  const card = queue[pos];
  const done = running && pos >= queue.length;

  useEffect(() => {                                   // auto-debrief when a session ends with misses
    if (!running || queue.length === 0 || pos < queue.length || debrief !== null) return;
    const missed = queue.filter((c, i) => queue.findIndex((x) => x.id === c.id) === i && missRef.current[c.id]);
    if (missed.length === 0) return;
    setDebrief({ busy: true });
    callClaude(debriefPrompt(missed))
      .then((t) => setDebrief({ text: t.trim() }))
      .catch(() => setDebrief({ err: true }));
  }, [running, pos, queue, debrief]);

  const grade = useCallback((got) => {
    const c = queue[pos];
    if (!c) return;
    setHook(null);
    onResult(c.id, got, undefined, thinkRef.current || undefined);
    if (got) {
      if (!missRef.current[c.id]) setFirstTry((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      setPassed((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      setQueue((prev) => prev.filter((x, idx) => idx <= pos || x.id !== c.id)); // drop later duplicates
    } else {
      setStruggled((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      const m = (missRef.current[c.id] || 0) + 1;
      missRef.current[c.id] = m;
      if (m <= REQUEUE_CAP) {
        setQueue((prev) => { const next = prev.slice(); next.splice(Math.min(pos + 1 + REQUEUE_GAP, next.length), 0, c); return next; });
      }
    }
    setFlipped(false);
    setPos((p) => p + 1);
  }, [queue, pos, onResult]);

  // keyboard: space/enter flips; when flipped → →/Enter = got it, ←/Backspace = review
  useEffect(() => {
    if (!running || done) return;
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.code === "Space" || (e.code === "Enter" && !flipped)) { e.preventDefault(); flip(); }
      else if (flipped && (e.code === "ArrowRight" || e.code === "Enter")) { e.preventDefault(); grade(true); }
      else if (flipped && (e.code === "ArrowLeft" || e.code === "Backspace")) { e.preventDefault(); grade(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, done, flipped, grade, flip]);

  if (cards.length === 0) {
    return (
      <div className="tc-empty">
        <p>No words yet. Your deck is empty.</p>
        <button className="tc-btn tc-btn-primary" onClick={goAdd}>Add your first words</button>
      </div>
    );
  }

  if (!running) {
    return (
      <div className="tc-study-setup">
        <div className="tc-hero">
          {dueCount > 0 ? (
            <>
              <div className="tc-heronum">{dueCount}</div>
              <p className="tc-herolabel">due for review</p>
              <p className="tc-herosub">{cards.length} words · {newCount} untouched</p>
            </>
          ) : newCount > 0 ? (
            <>
              <div className="tc-heronum">{newCount}</div>
              <p className="tc-herolabel">new words ready to learn</p>
              <p className="tc-herosub">{cards.length} words · {ranked.length} studied so far</p>
            </>
          ) : (
            <>
              <div className="tc-heronum">✓</div>
              <p className="tc-herolabel">all caught up</p>
              <p className="tc-herosub">{cards.length} words · check back later for reviews</p>
            </>
          )}
        </div>
        {smartBatch && (
          <button className="tc-btn tc-btn-primary tc-start" onClick={() => start(smartBatch.cards)}>
            Today's section · {smartBatch.name} ({smartBatch.cards.length})
          </button>
        )}
        {smartPool.length > 0 && (
          <button className="tc-btn tc-start tc-smart-btn" onClick={() => start(smartPool, true)}>
            🧠 Smart Review · {smartPool.length} cards{dueCount > 0 ? ` · ${dueCount} due` : ""}
          </button>
        )}
        {smartPool.length > 0 && (
          <p className="tc-smarthint">{coverage
            ? `Learning new words first (${newCount} untouched left), mixed with review.`
            : `Your weakest, most-missed & overdue — plus a few new${newCount > 0 ? ` (${newCount} left)` : ""}.`}</p>
        )}

        {ranked.length > 0 && (
          <div className="tc-insights">
            <div className="tc-masterystrip">
              <span>Mastery</span>
              <div className="tc-mbar"><div className="tc-mfill" style={{ width: `${masteredPct}%` }} /></div>
              <span className="tc-mpct">{masteredPct}%</span>
            </div>
            <div className="tc-wscols tc-wscols-solo">
              <div>
                <p className="tc-wslabel tc-rate-low">Weakest</p>
                {weakest.map((c) => (
                  <span key={c.id} className="tc-wsword">
                    {c.term}{c.reading && c.reading !== c.term ? ` ${c.reading}` : ""}
                    <em className="tc-wsromaji"> {c.romaji} — {c.meaning}</em>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="tc-batchhead"><span>Sections</span></div>
        <div className="tc-batchgrid">
          {batches.map((b) => {
            const art = sectionArt(b.cards);
            return (
              <button key={b.name} className="tc-batchchip" onClick={() => start(b.cards)}
                style={{ background: `radial-gradient(140% 160% at 30% -15%, hsla(${hueFor(b.name)},75%,62%,.5) 0%, hsla(${hueFor(b.name)},55%,42%,.16) 55%, rgba(255,255,255,.02) 85%)` }}>
                <div className="tc-batchglass">
                  {art[0] && <span className="tc-batchicon" aria-hidden="true">{art[0]}</span>}
                  <span className="tc-batchnum">{b.name}</span>
                  <span className={"tc-batchmeta" + (b.rate === null ? " tc-rate-new" : b.rate < 0.6 ? " tc-rate-low" : "")}>
                    {b.cards.length} words · {b.rate === null ? "new" : Math.round(b.rate * 100) + "%"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="tc-setupfoot">
          <button className="tc-btn tc-btn-sm" onClick={() => start()}>All · {cards.length}</button>
          {weak.length > 0 && (
            <button className="tc-btn tc-btn-sm" onClick={() => start(weak)}>Weak · {weak.length}</button>
          )}
        </div>
        <p className="tc-hintline">Tip: Space flips · → got it · ← missed</p>
      </div>
    );
  }

  if (done) {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missedCards = cards.filter((c) => struggled.has(c.id));
    return (
      <div className="tc-done">
        <p className="tc-eyebrow">Session complete</p>
        <div className="tc-bignum">{pct}<span>%</span></div>
        <p className="tc-donesub">{firstTry.size} nailed first try{missedCards.length > 0 ? ` · ${missedCards.length} to review` : ""} · {poolSize} cards</p>
        {debrief && debrief.busy && <p className="tc-debrief tc-debrief-busy">✨ Coach is looking at what you missed…</p>}
        {debrief && debrief.text && <p className="tc-debrief">✨ {debrief.text}</p>}
        {debrief && debrief.err && missedCards.length > 0 && (
          <p className="tc-debrief tc-debrief-busy">Missed: {missedCards.slice(0, 6).map((c) => c.term).join("、")} — hit "Review" below and they'll come right back.</p>
        )}
        <div className="tc-donebtns">
          {missedCards.length > 0 && (
            <button className="tc-btn tc-btn-primary" onClick={() => start(missedCards)}>Review the {missedCards.length} you missed</button>
          )}
          <button className="tc-btn" onClick={() => start()}>Go again</button>
          <button className="tc-btn" onClick={() => setRunning(false)}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-study">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
        <span className="tc-progtext">{passed.size} / {poolSize}</span>
        <button className={"tc-rpill" + (showRomaji ? " is-on" : "")}
          aria-pressed={showRomaji} onClick={() => setShowRomaji((v) => !v)}>
          Rōmaji {showRomaji ? "on" : "off"}
        </button>
        <button className={"tc-rpill" + (showPitch ? " is-on" : "")}
          aria-pressed={showPitch} onClick={() => setShowPitch((v) => !v)}>
          Pitch {showPitch ? "on" : "off"}
        </button>
        <button className={"tc-rpill" + (voiceOn ? " is-on" : "")}
          aria-pressed={voiceOn} onClick={() => { ttsUnlock(); setVoiceOn((v) => !v); if (voiceOn) stopJa(); }}>
          🔊 Voice {voiceOn ? "on" : "off"}
        </button>
      </div>

      <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={flip}
           role="button" tabIndex={0} aria-label="Flashcard, click or press space to flip">
        <div className="tc-card-inner">
          {/* FRONT — Japanese: kanji + kana (+ rōmaji if on) */}
          <div className="tc-face tc-front">
            <span className="tc-kindchip">{KIND_LABEL[card.kind] || ""}</span>
            <div className="tc-term">{card.term}</div>
            <div className="tc-reading-front">{card.reading} <SpeakBtn text={card.reading || card.term} /></div>
            {showRomaji && <div className="tc-frontromaji">{card.romaji}</div>}
            <span className="tc-flipcue">tap to flip</span>
          </div>
          {/* BACK — meaning + picture + pronunciation (rōmaji always shown) */}
          <div className="tc-face tc-back">
            {card.emoji && <div className="tc-emoji">{card.emoji}</div>}
            <div className="tc-meaning tc-meaning-lg">{card.meaning}</div>
            <div className="tc-romaji">{showPitch && card.pitch ? card.pitch : card.romaji} <SpeakBtn text={card.reading || card.term} /></div>
            {(card.msN || 0) > 0 && <span className="tc-timetag">⏱ avg think {(card.ms / card.msN / 1000).toFixed(1)}s · seen {card.seen || 0}× · {card.seen ? Math.round(((card.correct || 0) / card.seen) * 100) : 0}%</span>}
            {isLeech(card) && <span className="tc-leechtag">🩹 stuck word — try writing it</span>}
            {hook && hook.term === card.term ? (
              <p className="tc-hooktext" onClick={(e) => e.stopPropagation()}>
                {hook.busy ? "✨ thinking…" : hook.err ? "Couldn't reach the AI — try again later." : "✨ " + hook.text}
              </p>
            ) : (
              <button className="tc-hookbtn" onClick={(e) => { e.stopPropagation(); getHook(card); }}>✨ hook</button>
            )}
          </div>
        </div>
      </div>

      <div className="tc-grade">
        {!flipped ? (
          <button type="button" className="tc-btn tc-btn-wide" onClick={(e) => { e.stopPropagation(); flip(); }}>Reveal answer</button>
        ) : (
          <>
            <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
            <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
          </>
        )}
      </div>
      <div ref={liveRef} aria-live="polite" className="tc-sr" />
    </div>
  );
}

function weakness(c) {
  const seen = c.seen || 0;
  if (seen === 0) return 1.0;                 // unseen first
  return 1 - (c.correct || 0) / seen;          // lower accuracy = weaker
}
function isWeak(c) {
  const seen = c.seen || 0;
  return seen >= 1 && (c.correct || 0) / seen < 0.5;  // missed more often than not
}
function masteryScore(c) {            // higher = stronger; seen cards only
  const seen = c.seen || 0;
  if (seen === 0) return -1;
  return (c.level || 0) + (c.correct || 0) / seen;   // level dominates, accuracy breaks ties
}

// ── spaced repetition ──
const DAY = 86400000;
const REVIEW_INTERVALS = [0.007 * DAY, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY]; // per mastery level (L0…L5)
function recallUnlocked(c) {          // EN→JP mode retired — cards always show Japanese first
  return false;
}
function effLevel(c) {                // true strength = weakest direction once recall unlocks
  const lvl = Math.min(5, c.level || 0);
  return recallUnlocked(c) ? Math.min(lvl, Math.min(5, c.rlevel || 0)) : lvl;
}
function totalMisses(c) {
  return ((c.seen || 0) + (c.rseen || 0)) - ((c.correct || 0) + (c.rcorrect || 0));
}
function isLeech(c) {                 // stuck word: keeps failing despite reps
  const t = (c.seen || 0) + (c.rseen || 0);
  if (t < 8) return false;
  const acc = ((c.correct || 0) + (c.rcorrect || 0)) / t;
  return totalMisses(c) >= 6 && acc < 0.6;
}
function dueness(c, now) {            // >= 1 means due / overdue for review
  const seen = c.seen || 0;
  if (seen === 0) return 0;
  const interval = REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1); // per-card adaptive interval
  return (now - (c.last || 0)) / interval;
}
function needScore(c, now) {          // higher = needs review more (seen cards only)
  const seen = c.seen || 0;
  if (seen === 0) return -1;
  const acc = (c.correct || 0) / seen;
  const masteryGap = (5 - effLevel(c)) / 5;            // weak words (weakest direction)
  const accGap = 1 - acc;                              // often-missed words
  const overdue = Math.min(3, Math.max(0, dueness(c, now))); // spaced-repetition due
  const fewReps = 1 / (1 + seen);                      // least-exercised words
  const recallGap = recallUnlocked(c) ? Math.max(0, (c.level || 0) - (c.rlevel || 0)) / 5 : 0; // knows it, can't produce it
  return masteryGap * 2 + accGap * 2 + overdue * 1.6 + fewReps * 1 + recallGap * 1.5;
}

const SECTION_MAP = {"それ":"2-1", "これ":"2-1", "あれ":"2-1", "どれ":"2-1", "大丈夫":"2-1", "大丈夫です":"2-1", "平気":"2-1", "わかります":"2-1", "わかりますか":"2-1", "できます":"2-1", "します":"2-1", "来ます":"2-1", "頑張ります":"2-1", "すごい":"2-1", "すごいですね":"2-1", "いい":"2-1", "よろしい":"2-1", "よろしく":"2-1", "いえいえ":"2-1", "はい":"2-1", "か":"2-1", "ね":"2-1", "よ":"2-1", "今":"2-2", "今日":"2-2", "明日":"2-2", "これから":"2-2", "電話":"2-2", "ケータイ":"2-2", "勉強":"2-2", "お仕事":"2-2", "宿題":"2-2", "テスト":"2-2", "レポート":"2-2", "教科書":"2-2", "行きます":"2-2", "います":"2-2", "書きます":"2-2", "書く":"2-2", "始めます":"2-2", "終わります":"2-2", "あのう":"2-2", "ええと":"2-2", "ちょっと":"2-2", "あとで":"2-2", "すみません":"2-2", "好き":"2-3", "大好き":"2-3", "何":"2-3", "クッキー":"2-3", "ケーキ":"2-3", "ご飯":"2-3", "朝ご飯":"2-3", "昼ご飯":"2-3", "晩ご飯":"2-3", "お弁当":"2-3", "お寿司":"2-3", "焼き鳥":"2-3", "うどん":"2-3", "そば":"2-3", "カレーライス":"2-3", "ラーメン":"2-3", "お茶":"2-3", "お水":"2-3", "ビール":"2-3", "ウーロン茶":"2-3", "紅茶":"2-3", "コーヒー":"2-3", "ミルク":"2-3", "ジュース":"2-3", "食べ物":"2-3", "飲み物":"2-3", "薬":"2-3", "おいしそう":"2-3", "きれい":"2-3", "食べます":"2-3", "飲みます":"2-3", "いただきます":"2-3", "読みます":"2-3", "おいしい":"2-3", "おもしろい":"2-3", "ねえ":"2-3", "わあ":"2-3", "え":"2-3", "よかったら":"2-3", "よろしかったら":"2-3", "こちら":"2-4", "そちら":"2-4", "あちら":"2-4", "どちら":"2-4", "忙しい":"2-4", "けど":"2-4", "いや":"2-4", "わかりました":"2-4", "が":"2-4", "けれども":"2-4", "会社":"2-5", "学校":"2-5", "うち":"2-5", "家":"2-5", "お宅":"2-5", "寮":"2-5", "アパート":"2-5", "コンビニ":"2-5", "駅":"2-5", "トイレ":"2-5", "そう":"2-5", "どなた":"2-6", "だれ":"2-6", "ここ":"2-7", "そこ":"2-7", "あそこ":"2-7", "どこ":"2-7", "どう":"2-7", "こっち":"2-7", "そっち":"2-7", "あっち":"2-7", "どっち":"2-7", "高い":"2-7", "安い":"2-7", "大きい":"2-7", "小さい":"2-7", "遠い":"2-7", "近い":"2-7", "難しい":"2-7", "易しい":"2-7", "つまらない":"2-7", "とても":"2-7", "すること":"2-8", "あります":"2-8", "何か":"2-8", "別に":"2-8", "じゃあ":"2-8"};

function sectionOf(c) {
  return c.sec || SECTION_MAP[c.term] || ((c.lesson || 0) <= 6 ? "Act 1" : "Class notes");
}
const SECTION_HUES = [258, 214, 186, 152, 96, 42, 22, 350, 320, 282];
function hueFor(name) {
  if (name === "Act 1") return 214;
  if (name === "Class notes") return 42;
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SECTION_HUES[h % SECTION_HUES.length];
}
function sectionArt(cardsInSec) {   // single most-used emoji in this section — genuinely representative, no external images needed
  const counts = new Map();
  cardsInSec.forEach((c) => { if (c.emoji) counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 1).map((e) => e[0]);
}
function sectionRank(s) {
  if (s === "Act 1") return 100;
  const dm = /^Act (\d+) Dry Run$/.exec(s);
  if (dm) return 1000 + parseInt(dm[1], 10) * 100 + 99; // after every scene of that act
  const m = /^(\d+)-(\d+)/.exec(s);
  if (m) return 1000 + parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
  if (s === "Class notes") return 90000;
  return 50000;
}


/* ───────────────────────────── SENTENCES (AI) ───────────────────────────── */
async function callClaude(prompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("server " + res.status);
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text.trim()) throw new Error("empty reply");
    return text;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("timed out");
    throw e;
  } finally { clearTimeout(timer); }
}
function parseJSON(text) {
  let t = text.replace(/```json|```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");      // tolerate prose around the JSON
  if (s !== -1 && e !== -1 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}
function norm(s) {
  return (s || "").toString().trim().toLowerCase()
    .replace(/[。、．,.!?！？\s]/g, "")
    .replace(/ō/g, "o").replace(/ū/g, "u").replace(/ā/g, "a").replace(/ē/g, "e").replace(/ī/g, "i")
    .replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u");
}

const KANA_MAP = {
  あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",
  が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",
  ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",
  だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",
  は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",
  ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",
  や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",
  ぁ:"a",ぃ:"i",ぅ:"u",ぇ:"e",ぉ:"o",
};
const YOON_MAP = {
  きゃ:"kya",きゅ:"kyu",きょ:"kyo",しゃ:"sha",しゅ:"shu",しょ:"sho",ちゃ:"cha",ちゅ:"chu",ちょ:"cho",
  にゃ:"nya",にゅ:"nyu",にょ:"nyo",ひゃ:"hya",ひゅ:"hyu",ひょ:"hyo",みゃ:"mya",みゅ:"myu",みょ:"myo",
  りゃ:"rya",りゅ:"ryu",りょ:"ryo",ぎゃ:"gya",ぎゅ:"gyu",ぎょ:"gyo",じゃ:"ja",じゅ:"ju",じょ:"jo",
  びゃ:"bya",びゅ:"byu",びょ:"byo",ぴゃ:"pya",ぴゅ:"pyu",ぴょ:"pyo",
};
function kataToHira(s) { return s.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)); }
function kanaToRomaji(input) {
  const s = kataToHira((input || "").replace(/[・]/g, ""));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.substr(i, 2);
    if (YOON_MAP[two]) { out += YOON_MAP[two]; i++; continue; }
    const ch = s[i];
    if (ch === "っ" || ch === "ッ") { const nx = YOON_MAP[s.substr(i + 1, 2)] || KANA_MAP[s[i + 1]] || ""; if (nx) out += nx[0]; continue; }
    if (ch === "ー") { if (out) out += out[out.length - 1]; continue; }
    if (KANA_MAP[ch] != null) out += KANA_MAP[ch];
  }
  return out;
}
function canonR(s) {
  return (s || "").toLowerCase()
    .replace(/[āáàâ]/g, "a").replace(/[īíìî]/g, "i").replace(/[ūúùû]/g, "u").replace(/[ēéèê]/g, "e").replace(/[ōóòô]/g, "o")
    .replace(/[^a-z]/g, "")
    .replace(/ou/g, "o").replace(/wo/g, "o")
    .replace(/(.)\1+/g, "$1");
}
function fillMatch(ex, answer) {
  const u = (answer || "").trim();
  if (!u) return false;
  const cu = canonR(u);
  if (cu) {
    const romajiForms = [ex.romaji, kanaToRomaji(ex.reading), kanaToRomaji(ex.answer)];
    if (romajiForms.some((r) => r && canonR(r) === cu)) return true;
  }
  const stripJ = (x) => (x || "").replace(/[\s。、．,.!?！？・]/g, "");
  const ju = stripJ(u);
  return [ex.reading, ex.answer].some((j) => j && stripJ(j) === ju);
}
function vocabList(cards) {
  return cards.map((c) => `${c.term} (${c.reading}) = ${c.meaning}`).join("\n");
}
function fillPrompt(cards) {
  return `You are a Japanese tutor for a beginner (JLPT N5) student. Using ONLY the vocabulary below (plus basic particles は が を に の と へ and basic です/ます forms), write ONE short, natural, beginner Japanese sentence (5–10 words), then blank out exactly ONE of the vocabulary words from it.

Vocabulary:
${vocabList(cards)}

Return the Japanese as an array of tokens so kana can be shown above kanji. Each token is {"t":"<text>","r":"<kana reading>"}. Include "r" ONLY when "t" contains kanji (set it to the kana reading of that kanji); omit "r" for kana, particles, and punctuation. Represent the blank as a single token {"t":"___"}.

Reply with ONLY a JSON object, no markdown:
{"tokens":[ <the sentence with the blank, as tokens> ],"fullTokens":[ <the complete sentence, as tokens> ],"answer":"<removed word EXACTLY as its vocab term>","reading":"<kana reading of answer>","romaji":"<romaji of answer>","translation":"<natural English translation>","hint":"<short English hint about the missing word>"}`;
}
function transPrompt(cards) {
  return `You are a Japanese tutor for a beginner (JLPT N5) student. Using mainly the vocabulary below (plus basic particles and です/ます), create ONE short, simple English sentence for the student to translate INTO Japanese. It must be expressible with this vocabulary.

Vocabulary:
${vocabList(cards)}

For the model Japanese answer, also return it as tokens so kana can be shown above kanji: each token {"t":"<text>","r":"<kana>"} with "r" ONLY for kanji tokens.

Reply with ONLY a JSON object, no markdown:
{"english":"<English sentence to translate>","model":"<plain Japanese translation>","modelTokens":[ <the model answer as tokens> ],"reading":"<full kana reading>","romaji":"<romaji>","notes":"<one short grammar or usage note>"}`;
}
function gradePrompt(ex, answer) {
  return `You are a kind Japanese tutor grading a beginner.
English: "${ex.english}"
A correct model translation: "${ex.model}"
Student's attempt: "${answer}"

Decide if the student's Japanese conveys the English meaning. Minor kana/spacing/politeness differences are fine. Reply with ONLY a JSON object, no markdown:
{"rating":"correct"|"close"|"off","feedback":"<1–2 short, encouraging sentences: what's right, what to fix>","corrected":"<the student's sentence corrected>"}`;
}

const NOUN_SET = new Set(["猫", "犬", "学校", "食べ物", "仕事", "写真", "子供", "睡眠", "健康"]);
function shortMeaning(m) { return (m || "").split(/[;(（,]/)[0].trim(); }
function pickTarget(cards) {
  const sorted = cards.slice().sort((a, b) => masteryScore(a) - masteryScore(b)); // weak/unseen first
  const pool = sorted.slice(0, Math.max(5, Math.ceil(sorted.length / 2)));
  return pool[Math.floor(Math.random() * pool.length)] || cards[Math.floor(Math.random() * cards.length)];
}
function localFill(cards) {
  const c = pickTarget(cards);
  if (NOUN_SET.has(c.term)) {
    return {
      tokens: [{ t: "＿＿＿" }, { t: "がすきです。" }],
      fullTokens: [{ t: c.term, r: c.reading }, { t: "がすきです。" }],
      answer: c.term, reading: c.reading, romaji: c.romaji,
      translation: "I like " + shortMeaning(c.meaning) + ".",
      hint: c.romaji ? "starts with “" + c.romaji[0] + "”" : "", _local: true,
    };
  }
  return {
    tokens: [{ t: "＿＿＿" }],
    fullTokens: [{ t: c.term, r: c.reading }],
    answer: c.term, reading: c.reading, romaji: c.romaji,
    translation: "Say in Japanese: " + shortMeaning(c.meaning),
    hint: c.romaji ? "starts with “" + c.romaji[0] + "”" : "", _local: true,
  };
}
function localTrans(cards) {
  const c = pickTarget(cards);
  if (NOUN_SET.has(c.term)) {
    return {
      english: "I like " + shortMeaning(c.meaning) + ".",
      model: c.term + "がすきです。",
      modelTokens: [{ t: c.term, r: c.reading }, { t: "がすきです。" }],
      reading: c.reading + "がすきです", romaji: (c.romaji || "") + " ga suki desu", notes: "", _local: true,
    };
  }
  return {
    english: "Say in Japanese: " + shortMeaning(c.meaning),
    model: c.term, modelTokens: [{ t: c.term, r: c.reading }],
    reading: c.reading, romaji: c.romaji, notes: "", _local: true,
  };
}

function Furigana({ tokens }) {
  if (!Array.isArray(tokens)) return <>{tokens}</>;   // string fallback (no furigana)
  return tokens.map((tk, i) => {
    if (!tk || tk.t == null) return null;
    if (tk.t === "___" || tk.t === "＿＿＿") return <span key={i} className="tc-blank">＿＿＿</span>;
    if (tk.r) return <ruby key={i}>{tk.t}<rt>{tk.r}</rt></ruby>;
    return <span key={i}>{tk.t}</span>;
  });
}

function Sentences({ cards, onResult }) {
  const [mode, setMode] = useState("fill");
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [ex, setEx] = useState(null);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true); setError(""); setOffline(false); setEx(null); setChecked(false);
    setAnswer(""); setResult(null); setShowHint(false);
    try {
      const text = await callClaude(mode === "fill" ? fillPrompt(cards) : transPrompt(cards));
      setEx(parseJSON(text));
    } catch (e) {
      try {                                  // live generator unreachable → build one locally from the deck
        setEx(mode === "fill" ? localFill(cards) : localTrans(cards));
        setOffline(true);
      } catch (e2) {
        setError("Couldn't generate (" + (e.message || "error") + "). Tap “Generate” to retry.");
      }
    } finally { setLoading(false); }
  }, [mode, cards]);

  const switchMode = (m) => { setMode(m); setEx(null); setChecked(false); setAnswer(""); setResult(null); setError(""); setOffline(false); };

  const checkFill = () => {
    const ok = fillMatch(ex, answer);
    setResult({ correct: ok });
    setChecked(true);
    const card = cards.find((c) => c.term === ex.answer);
    if (card) onResult(card.id, ok);
  };

  const skipFill = () => {
    setResult({ correct: false, idk: true });
    setChecked(true);
    const card = cards.find((c) => c.term === ex.answer);
    if (card) onResult(card.id, false);   // "Idk" counts as a miss → flags the word as weak
  };

  const checkTranslate = async () => {
    if (ex._local) { setResult({}); setChecked(true); return; }   // offline item: just reveal the model answer
    setGrading(true); setError("");
    try {
      const text = await callClaude(gradePrompt(ex, answer));
      setResult(parseJSON(text));
    } catch (e) {
      setResult({ feedback: "(Couldn't reach the grader — compare with the model answer below.)" });
    } finally { setGrading(false); setChecked(true); }
  };

  if (cards.length < 3) {
    return <div className="tc-empty"><p>Add a few more words first — sentence practice needs some vocabulary to work with.</p></div>;
  }

  return (
    <div className="tc-sent">
      <div className="tc-sentmodes">
        <button className={"tc-segbtn" + (mode === "fill" ? " is-on" : "")} onClick={() => switchMode("fill")}>Fill in the blank</button>
        <button className={"tc-segbtn" + (mode === "translate" ? " is-on" : "")} onClick={() => switchMode("translate")}>Translate</button>
      </div>

      {error && <div className="tc-senterr">{error}</div>}
      {offline && ex && <p className="tc-offnote">Offline practice — built from your deck. (Live sentence generator isn't reachable here right now.)</p>}

      {!ex && !loading && (
        <div className="tc-sentempty">
          <p>Claude builds a sentence from your own vocabulary, then quizzes you on it.</p>
          <button className="tc-btn tc-btn-primary" onClick={generate}>Generate a sentence</button>
        </div>
      )}

      {loading && <div className="tc-sentloading">✦ Claude is writing a sentence from your words…</div>}

      {ex && mode === "fill" && (
        <div className="tc-card2">
          <p className="tc-sentgoal">{ex.translation}</p>
          <p className="tc-sentjp"><Furigana tokens={ex.tokens || ex.sentence} /></p>
          {!checked ? (
            <>
              <input className="tc-sentinput" value={answer} autoFocus
                placeholder="the missing word — kana, kanji, or rōmaji"
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && answer.trim()) checkFill(); }} />
              <div className="tc-sentbtns">
                {ex.hint && <button className="tc-btn tc-btn-sm" onClick={() => setShowHint(true)}>Hint</button>}
                <button className="tc-btn tc-btn-sm tc-idk" onClick={skipFill}>I don't know</button>
                <button className="tc-btn tc-btn-primary" onClick={checkFill} disabled={!answer.trim()}>Check</button>
              </div>
              {showHint && <p className="tc-senthint">💡 {ex.hint}</p>}
            </>
          ) : (
            <>
              <p className={"tc-sentresult " + (result.correct ? "ok" : result.idk ? "mid" : "no")}>
                {result.correct ? "✓ Correct!" : result.idk ? "○ Marked for review" : "✕ Not quite"}
              </p>
              <p className="tc-sentjp tc-sentfull"><Furigana tokens={ex.fullTokens || ex.full} /></p>
              <p className="tc-sentans">{ex.answer}（{ex.reading}）· {ex.romaji}</p>
              <button className="tc-btn tc-btn-primary" onClick={generate}>Next sentence</button>
            </>
          )}
        </div>
      )}

      {ex && mode === "translate" && (
        <div className="tc-card2">
          <p className="tc-eyebrow">Translate into Japanese</p>
          <p className="tc-sentgoal tc-sentbig">{ex.english}</p>
          {!checked ? (
            <>
              <textarea className="tc-sentinput" rows={2} value={answer} autoFocus
                placeholder="write it in Japanese…" onChange={(e) => setAnswer(e.target.value)} />
              <div className="tc-sentbtns">
                <button className="tc-btn tc-btn-sm" onClick={() => { setResult({}); setChecked(true); }}>Show answer</button>
                <button className="tc-btn tc-btn-primary" onClick={checkTranslate} disabled={!answer.trim() || grading}>{grading ? "Checking…" : "Check"}</button>
              </div>
            </>
          ) : (
            <>
              {result && result.rating && (
                <p className={"tc-sentresult " + (result.rating === "correct" ? "ok" : result.rating === "close" ? "mid" : "no")}>
                  {result.rating === "correct" ? "✓ Correct" : result.rating === "close" ? "≈ Close" : "✕ Off"}
                </p>
              )}
              {result && result.feedback && <p className="tc-sentfeedback">{result.feedback}</p>}
              <p className="tc-sentans">Model: <Furigana tokens={ex.modelTokens || ex.model} />（{ex.reading}）</p>
              {ex.notes && <p className="tc-senthint">💡 {ex.notes}</p>}
              <button className="tc-btn tc-btn-primary" onClick={generate}>Next sentence</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}



/* ───────────────────────────── KANA ───────────────────────────── */
const KANA_KEY = "jpn101:kana";
const KANA_BASE_ROWS = [
  [["あ","ア","a"],["い","イ","i"],["う","ウ","u"],["え","エ","e"],["お","オ","o"]],
  [["か","カ","ka"],["き","キ","ki"],["く","ク","ku"],["け","ケ","ke"],["こ","コ","ko"]],
  [["さ","サ","sa"],["し","シ","shi"],["す","ス","su"],["せ","セ","se"],["そ","ソ","so"]],
  [["た","タ","ta"],["ち","チ","chi"],["つ","ツ","tsu"],["て","テ","te"],["と","ト","to"]],
  [["な","ナ","na"],["に","ニ","ni"],["ぬ","ヌ","nu"],["ね","ネ","ne"],["の","ノ","no"]],
  [["は","ハ","ha"],["ひ","ヒ","hi"],["ふ","フ","fu"],["へ","ヘ","he"],["ほ","ホ","ho"]],
  [["ま","マ","ma"],["み","ミ","mi"],["む","ム","mu"],["め","メ","me"],["も","モ","mo"]],
  [["や","ヤ","ya"],["ゆ","ユ","yu"],["よ","ヨ","yo"]],
  [["ら","ラ","ra"],["り","リ","ri"],["る","ル","ru"],["れ","レ","re"],["ろ","ロ","ro"]],
  [["わ","ワ","wa"],["を","ヲ","wo"],["ん","ン","n"]],
];
const KANA_DAKU_ROWS = [
  [["が","ガ","ga"],["ぎ","ギ","gi"],["ぐ","グ","gu"],["げ","ゲ","ge"],["ご","ゴ","go"]],
  [["ざ","ザ","za"],["じ","ジ","ji"],["ず","ズ","zu"],["ぜ","ゼ","ze"],["ぞ","ゾ","zo"]],
  [["だ","ダ","da"],["ぢ","ヂ","ji","(だ row)"],["づ","ヅ","zu","(だ row)"],["で","デ","de"],["ど","ド","do"]],
  [["ば","バ","ba"],["び","ビ","bi"],["ぶ","ブ","bu"],["べ","ベ","be"],["ぼ","ボ","bo"]],
  [["ぱ","パ","pa"],["ぴ","ピ","pi"],["ぷ","プ","pu"],["ぺ","ペ","pe"],["ぽ","ポ","po"]],
];
function Kana() {
  const [script, setScript] = useState("hira");     // hira | kata
  const [withDaku, setWithDaku] = useState(false);  // start with the base 46
  const [mode, setMode] = useState("drill");        // drill | chart
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [currentId, setCurrentId] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => { (async () => {
    try { const r = await sGet(KANA_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  const rows = useMemo(() => (withDaku ? [...KANA_BASE_ROWS, ...KANA_DAKU_ROWS] : KANA_BASE_ROWS), [withDaku]);
  const list = useMemo(() => rows.flat().map(([h, k, r, note]) => ({
    id: (script === "hira" ? "h-" : "k-") + h,       // char-keyed: stable & collision-free
    ch: script === "hira" ? h : k, r, note,
  })), [rows, script]);

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  const chooseNext = (m, exclude) => {
    let best = null, bestK = Infinity;
    list.forEach((x) => {
      if (x.id === exclude && list.length > 1) return;
      const st = getS(m, x.id);
      const k = st.level * 10 + Math.min(st.seen, 6) + Math.random() * 3;
      if (k < bestK) { bestK = k; best = x.id; }
    });
    return best;
  };
  useEffect(() => {
    if (!list.some((x) => x.id === currentId)) setCurrentId(chooseNext(statsRef.current, null));
  }, [list]);          // eslint-disable-line
  const cur = list.find((x) => x.id === currentId) || null;

  /* drawing pad */
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const setup = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2620";
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);
  useEffect(() => { if (mode === "drill") setup(); }, [currentId, mode, setup]);
  useEffect(() => {                                   // iOS: stop the page panning while drawing
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, [mode]);
  useEffect(() => {
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);
  const xy = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const down = (e) => { e.preventDefault(); drawingRef.current = true; lastRef.current = xy(e); try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const pnt = xy(e), l = lastRef.current;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(pnt.x, pnt.y); ctx.stroke();
    lastRef.current = pnt;
  };
  const up = () => { drawingRef.current = false; lastRef.current = null; };
  const clearPad = () => setup();

  const record = (got) => {
    if (!cur) return;
    const m = statsRef.current;
    const s0 = getS(m, cur.id);
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (got ? 1 : 0),
      level: got ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: got ? (s0.streak || 0) + 1 : 0, last: Date.now() };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(KANA_KEY, JSON.stringify(nx));
    setRevealed(false); setGuide(false);
    setCurrentId(chooseNext(nx, cur.id));
  };

  const mastered = list.filter((x) => getS(stats, x.id).level >= 4).length;
  const cellClass = (id) => {
    const st = getS(stats, id);
    if (!st.seen) return " kn-untouched";
    if (st.level >= 4) return " kn-good";
    if (st.correct / st.seen < 0.5 || st.level < 2) return " kn-weak";
    return " kn-mid";
  };

  return (
    <div className="tc-kana">
      <div className="tc-kanabar">
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (script === "hira" ? " is-on" : "")} onClick={() => setScript("hira")}>ひらがな</button>
          <button className={"tc-fchip" + (script === "kata" ? " is-on" : "")} onClick={() => setScript("kata")}>カタカナ</button>
        </div>
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (!withDaku ? " is-on" : "")} onClick={() => setWithDaku(false)}>46 base</button>
          <button className={"tc-fchip" + (withDaku ? " is-on" : "")} onClick={() => setWithDaku(true)}>+ dakuten</button>
        </div>
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (mode === "drill" ? " is-on" : "")} onClick={() => setMode("drill")}>Drill</button>
          <button className={"tc-fchip" + (mode === "chart" ? " is-on" : "")} onClick={() => setMode("chart")}>Chart</button>
        </div>
      </div>
      <p className="tc-kanaprog">{mastered}/{list.length} mastered · {script === "hira" ? "hiragana" : "katakana"}{withDaku ? " + dakuten" : ""}</p>

      {mode === "chart" ? (
        <div className="tc-kanagrid">
          {rows.map((row, ri) => (
            <div key={ri} className="tc-kanarow">
              {row.map(([h, k, r]) => {
                const id = (script === "hira" ? "h-" : "k-") + h;
                return (
                  <button key={id} className={"tc-kanacell" + cellClass(id)}
                    onClick={() => { setCurrentId(id); setMode("drill"); setRevealed(false); setGuide(false); }}>
                    <span className="tc-kanach">{script === "hira" ? h : k}</span>
                    <span className="tc-kanar">{r}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : cur ? (
        <div className="tc-card2 tc-kanadrill">
          <p className="tc-eyebrow">write this kana</p>
          <p className="tc-kanaprompt">{cur.r}{cur.note ? <span className="tc-kananote"> {cur.note}</span> : null}</p>
          <div className="tc-canvaswrap">
            {(guide || revealed) && <div className={"kn-ghost" + (revealed ? " kn-ghost-strong" : "")}>{cur.ch}</div>}
            <canvas ref={canvasRef} className="tc-canvas"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
          </div>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-sm" onClick={clearPad}>Clear</button>
            {!revealed && <button className="tc-btn tc-btn-sm" onClick={() => setGuide((v) => !v)}>{guide ? "Hide hint" : "Hint"}</button>}
            {!revealed
              ? <button className="tc-btn tc-btn-primary" onClick={() => setRevealed(true)}>Check</button>
              : (
                <>
                  <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => record(true)}>Got it ✓</button>
                  <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => record(false)}>Missed ✗</button>
                </>
              )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── BROWSE ───────────────────────────── */
function scriptPrompt(raw) {
  return `You are a Japanese tutor. Parse the following beginner Japanese dialogue into lines. For each line: identify the speaker label (use the label shown, e.g. A/B or a name; if none is shown, alternate A and B). Give the Japanese as furigana tokens — each token {"t":"<text>","r":"<kana>"} with "r" ONLY for kanji tokens — plus romaji and a natural English translation.

Dialogue:
${raw}

Reply with ONLY a JSON object, no markdown:
{"lines":[{"speaker":"<label>","tokens":[ <tokens> ],"romaji":"<romaji>","en":"<English translation>"}]}`;
}

const SCRIPT_SEED = [
  {
    id: "seed-2-1", name: "2-1",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "それ、わかりますか？" }], romaji: "sore, wakarimasu ka?", en: "Do you understand that?" },
      { speaker: "Sasha", tokens: [{ t: "はい、" }, { t: "大丈夫", r: "だいじょうぶ" }, { t: "です。" }], romaji: "hai, daijōbu desu.", en: "Yes, it's fine." },
      { speaker: "Kanda", tokens: [{ t: "すごいですね！" }], romaji: "sugoi desu ne!", en: "Amazing, isn't it!" },
      { speaker: "Sasha", tokens: [{ t: "いえいえ。" }], romaji: "ie ie.", en: "No, no." },
      { speaker: "Kanda", tokens: [{ t: "じゃ、よろしく。" }], romaji: "ja, yoroshiku.", en: "So then, I'm counting on you." },
      { speaker: "Sasha", tokens: [{ t: "はい、" }, { t: "頑張", r: "がんば" }, { t: "ります。" }], romaji: "hai, ganbarimasu.", en: "Yes, I'll do my best." },
    ],
  },
  {
    id: "seed-2-2", name: "2-2",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "電話", r: "でんわ" }, { t: "、しますか？" }], romaji: "denwa, shimasu ka?", en: "Will you make the phone call?" },
      { speaker: "Sasha", tokens: [{ t: "今", r: "いま" }, { t: "ですか？いえ、あのう、ええと、ちょっと……" }], romaji: "ima desu ka? ie, anō, ēto, chotto…", en: "Now? No, umm, uhh, it's just…" },
      { speaker: "Kanda", tokens: [{ t: "あ、いいですよ！じゃあ、あとで。" }], romaji: "a, ii desu yo! jā, ato de.", en: "It's all right. So then, later." },
      { speaker: "Sasha", tokens: [{ t: "すみません。" }], romaji: "sumimasen.", en: "Sorry." },
    ],
  },
  {
    id: "seed-2-3", name: "2-3",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "クッキー、お" }, { t: "好", r: "す" }, { t: "きですか？" }], romaji: "kukkii, osuki desu ka?", en: "Do you like cookies?" },
      { speaker: "Sasha", tokens: [{ t: "え？" }, { t: "何", r: "なん" }, { t: "ですか？" }], romaji: "e? nan desu ka?", en: "Huh? What is it?" },
      { speaker: "Kanda", tokens: [{ t: "クッキーです。これ、よかったら" }, { t: "食", r: "た" }, { t: "べませんか？" }], romaji: "kukkii desu. kore, yokattara tabemasen ka?", en: "They're cookies. If you'd like, won't you have one?" },
      { speaker: "Sasha", tokens: [{ t: "わあ、おいしそうですね！" }], romaji: "waa, oishisō desu ne!", en: "Wow, they look delicious!" },
      { speaker: "Kanda", tokens: [{ t: "どうぞ。" }], romaji: "dōzo.", en: "Go ahead." },
      { speaker: "Sasha", tokens: [{ t: "いいですか〜？じゃあ、いただきます。……おいしい！……" }], romaji: "ii desu ka? jā, itadakimasu… oishii!…", en: "Is it okay? Well then, I'll have one… Delicious!…" },
      { speaker: "Sasha", tokens: [{ t: "おいしいクッキーですねえ。" }], romaji: "oishii kukkii desu nee.", en: "They're delicious cookies, aren't they!" },
      { speaker: "Kanda", tokens: [{ t: "どうも。" }], romaji: "dōmo.", en: "Thanks." },
      { speaker: "Sasha", tokens: [{ t: "ごちそうさまでした。" }], romaji: "gochisōsama deshita.", en: "Thank you (for the treat)." },
    ],
  },
  {
    id: "seed-2-4", name: "2-4",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "今", r: "いま" }, { t: "忙", r: "いそが" }, { t: "しいですか？" }], romaji: "ima isogashii desu ka?", en: "Are you busy right now?" },
      { speaker: "Sasha", tokens: [{ t: "私", r: "わたし" }, { t: "ですか？いや、いいですけど……。" }], romaji: "watashi desu ka? iya, ii desu kedo…", en: "Me? No, it's all right, but…" },
      { speaker: "Kanda", tokens: [{ t: "じゃあ、これ、お" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "jā, kore, onegai-shimasu.", en: "Well then, I'll ask you to take care of this." },
      { speaker: "Sasha", tokens: [{ t: "こちらですね？はい、わかりました。" }], romaji: "kochira desu ne? hai, wakarimashita.", en: "This one, right? Yes, got it." },
    ],
  },
  {
    id: "seed-2-5", name: "2-5",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "今", r: "いま" }, { t: "どちらですか？" }], romaji: "ima dochira desu ka?", en: "Where are you now?" },
      { speaker: "Kanda", tokens: [{ t: "僕", r: "ぼく" }, { t: "？" }, { t: "会社", r: "かいしゃ" }, { t: "ですが……。" }], romaji: "boku? kaisha desu ga…", en: "Me? I'm in the office, but…" },
      { speaker: "Sasha", tokens: [{ t: "え、" }, { t: "会社", r: "かいしゃ" }, { t: "ですか。あ、そうですか。" }], romaji: "e, kaisha desu ka. a, sō desu ka.", en: "What, you're in the office! Oh, I see." },
    ],
  },
  {
    id: "seed-2-6", name: "2-6",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "あちら、どなたですか？" }], romaji: "achira, donata desu ka?", en: "Who is that over there?" },
      { speaker: "Kanda", tokens: [{ t: "寺田", r: "てらだ" }, { t: "さんですよ。" }], romaji: "Terada-san desu yo.", en: "That's Terada-san." },
      { speaker: "Sasha", tokens: [{ t: "あちらは？" }], romaji: "achira wa?", en: "How about over there?" },
      { speaker: "Kanda", tokens: [{ t: "さあ、ちょっとわからないですねえ。だれかなあ。" }], romaji: "sā, chotto wakaranai desu nē. dare ka nā.", en: "Gosh, I just don't know. Who could it be?" },
      { speaker: "Sasha", tokens: [{ t: "水野", r: "みずの" }, { t: "さんですか？" }], romaji: "Mizuno-san desu ka?", en: "Is it Mizuno-san?" },
      { speaker: "Kanda", tokens: [{ t: "いやぁ、" }, { t: "水野", r: "みずの" }, { t: "さんじゃないなあ。" }], romaji: "iyā, Mizuno-san ja nai nā.", en: "Uhh, that's not Mizuno-san." },
    ],
  },
  {
    id: "seed-2-7", name: "2-7",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "ここ、どうですか？" }], romaji: "koko, dō desu ka?", en: "How about this place?" },
      { speaker: "Kanda", tokens: [{ t: "いいけど……。" }], romaji: "ii kedo…", en: "It's good, but…" },
      { speaker: "Sasha", tokens: [{ t: "あ、ちょっと" }, { t: "高", r: "たか" }, { t: "いですか？" }], romaji: "a, chotto takai desu ka?", en: "Oh, is it a little expensive?" },
      { speaker: "Kanda", tokens: [{ t: "う〜ん。" }, { t: "安", r: "やす" }, { t: "くないですねえ。" }], romaji: "ūn. yasuku nai desu nē.", en: "Well, it's not cheap, is it!" },
      { speaker: "Sasha", tokens: [{ t: "そうですねえ。あ、こっちは？" }], romaji: "sō desu nē. a, kotchi wa?", en: "Hmmm. Oh, how about this place?" },
      { speaker: "Kanda", tokens: [{ t: "どこですか？ああ、いいですねえ。" }], romaji: "doko desu ka? ā, ii desu nē.", en: "Where? Oh, that's good, isn't it." },
    ],
  },
  {
    id: "seed-2-8", name: "2-8",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "何", r: "なに" }, { t: "かすること、ありますか？" }], romaji: "nani ka suru koto, arimasu ka?", en: "Is there something I should do?" },
      { speaker: "Kanda", tokens: [{ t: "いや、" }, { t: "別", r: "べつ" }, { t: "に。いいですよ！よかったらお" }, { t: "先", r: "さき" }, { t: "にどうぞ。" }], romaji: "iya, betsu ni. ii desu yo! yokattara osaki ni dōzo.", en: "No, not particularly. It's all right! If you want to, go ahead (home)." },
      { speaker: "Sasha", tokens: [{ t: "じゃあ、お" }, { t: "先", r: "さき" }, { t: "に" }, { t: "失礼", r: "しつれい" }, { t: "します。" }], romaji: "jā, osaki ni shitsurei shimasu.", en: "Well then, I'll be leaving." },
      { speaker: "Kanda", tokens: [{ t: "お" }, { t: "疲", r: "つか" }, { t: "れ" }, { t: "様", r: "さま" }, { t: "でした。" }], romaji: "otsukaresama deshita.", en: "Good work." },
    ],
  },
  {
    id: "seed-3-1", name: "3-1",
    lines: [
      { speaker: "Amy", tokens: [{ t: "JLC", r: "ジェーエルシー" }, { t: "のジョンソンです。どうぞよろしくお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "Jē-Eru-Shī no Jonson desu. dōzo yoroshiku onegai-shimasu.", en: "I'm Johnson from JLC. Nice to meet you." },
      { speaker: "Takashi", tokens: [{ t: "あ、" }, { t: "福沢大学", r: "ふくざわだいがく" }, { t: "の" }, { t: "松浦", r: "まつうら" }, { t: "です。どうぞよろしくお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "a, Fukuzawa Daigaku no Matsūra desu. dōzo yoroshiku onegai-shimasu.", en: "Oh, I'm Matsuura from Fukuzawa University. Nice to meet you." },
      { speaker: "Takashi", tokens: [{ t: "あの、" }, { t: "JLC", r: "ジェーエルシー" }, { t: "って……。" }], romaji: "ano, Jē-Eru-Shī tte…", en: "Uhh . . . JLC?" },
      { speaker: "Amy", tokens: [{ t: "ジャパニーズ・ランゲージ・クラブのことです。" }, { t: "学生", r: "がくせい" }, { t: "のサークルですね。" }], romaji: "Japanīzu Rangēji Kurabu no koto desu. gakusei no sākuru desu ne.", en: "It means 'Japanese Language Club.' It's a student club." },
      { speaker: "Takashi", tokens: [{ t: "ああ、なるほど。" }], romaji: "ā, naruhodo.", en: "Oh, I see." },
      { speaker: "Amy", tokens: [{ t: "日本語", r: "にほんご" }, { t: "で" }, { t: "何", r: "なん" }, { t: "といいますか？" }], romaji: "Nihongo de nan to iimasu ka?", en: "What would it be called in Japanese?" },
      { speaker: "Takashi", tokens: [{ t: "そうですねえ。まあ、" }, { t: "日本語", r: "にほんご" }, { t: "クラブかなあ。" }], romaji: "sō desu nē. mā, Nihongo-kurabu ka nā.", en: "Hmm. Let me think . . . I guess it'd be Nihongo-kurabu." },
      { speaker: "Amy", tokens: [{ t: "日本語", r: "にほんご" }, { t: "クラブですね？" }], romaji: "Nihongo-kurabu desu ne?", en: "That's Nihongo-kurabu, right?" },
      { speaker: "Takashi", tokens: [{ t: "ええ。" }], romaji: "ē.", en: "Yes." },
    ],
  },
  {
    id: "seed-3-2b", name: "3-2 drill",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "神田", r: "かんだ" }, { t: "さん、" }, { t: "会議", r: "かいぎ" }, { t: "は" }, { t: "何時", r: "なんじ" }, { t: "ですか？" }], romaji: "Kanda-san, kaigi wa nan-ji desu ka?", en: "Kanda-san, what time is the meeting?" },
      { speaker: "Kanda", tokens: [{ t: "四時", r: "よじ" }, { t: "ですよ。" }, { t: "今", r: "いま" }, { t: "、" }, { t: "何時", r: "なんじ" }, { t: "ですか？" }], romaji: "yo-ji desu yo. ima, nan-ji desu ka?", en: "Four o'clock. What time is it now?" },
      { speaker: "Sasha", tokens: [{ t: "ええと、" }, { t: "三時半", r: "さんじはん" }, { t: "ごろじゃないですか？" }], romaji: "ēto, san-ji-han goro ja nai desu ka?", en: "Umm, isn't it around 3:30?" },
      { speaker: "Sasha", tokens: [{ t: "[checks] あ、いえ！やっぱり" }, { t: "四時", r: "よじ" }, { t: "です！" }], romaji: "[checks] a, ie! yappari yo-ji desu!", en: "[checks] Ah, no! It's four after all!" },
      { speaker: "Kanda", tokens: [{ t: "え？じゃあ、" }, { t: "行", r: "い" }, { t: "きましょう！" }], romaji: "e? jā, ikimashō!", en: "What? Then let's go!" },
      { speaker: "Sasha", tokens: [{ t: "村田", r: "むらた" }, { t: "さんは？" }], romaji: "Murata-san wa?", en: "What about Murata-san?" },
      { speaker: "Kanda", tokens: [{ t: "村田", r: "むらた" }, { t: "さんは" }, { t: "今日", r: "きょう" }, { t: "、お" }, { t: "休", r: "やす" }, { t: "みですよ。" }], romaji: "Murata-san wa kyō, o-yasumi desu yo.", en: "Murata-san is off today." },
      { speaker: "Sasha", tokens: [{ t: "そうですか。じゃあ、" }, { t: "行", r: "い" }, { t: "きましょう。" }], romaji: "sō desu ka. jā, ikimashō.", en: "I see. Then let's go." },
    ],
  },
  {
    id: "seed-3-3", name: "3-3 drill",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "神田", r: "かんだ" }, { t: "さん、それ、" }, { t: "日本語", r: "にほんご" }, { t: "で" }, { t: "何", r: "なん" }, { t: "といいますか？" }], romaji: "Kanda-san, sore, nihongo de nan to iimasu ka?", en: "Kanda-san, what do you call that in Japanese?" },
      { speaker: "Kanda", tokens: [{ t: "これ？シャーペンですよ。" }], romaji: "kore? shāpen desu yo.", en: "This? It's a shāpen." },
      { speaker: "Sasha", tokens: [{ t: "え？シャーペル？" }], romaji: "e? shāperu?", en: "Huh? Shāperu?" },
      { speaker: "Kanda", tokens: [{ t: "「シャーペル」じゃなくて、シャーペン。" }], romaji: "'shāperu' ja nakute, shāpen.", en: "Not 'shāperu' — shāpen." },
      { speaker: "Sasha", tokens: [{ t: "シャーペンですか？" }], romaji: "shāpen desu ka?", en: "Shāpen?" },
      { speaker: "Kanda", tokens: [{ t: "そうそう。" }], romaji: "sō sō.", en: "Right, right." },
      { speaker: "Sasha", tokens: [{ t: "ああ、なるほど。ペンじゃないですね？" }], romaji: "ā, naruhodo. pen ja nai desu ne?", en: "Oh, I see. It's not a pen, right?" },
      { speaker: "Kanda", tokens: [{ t: "ええ、" }, { t: "鉛筆", r: "えんぴつ" }, { t: "ですよ。シャープペンシル、シャーペン。" }], romaji: "ē, enpitsu desu yo. shāpu-penshiru, shāpen.", en: "Right, it's a pencil. Sharp pencil — shāpen." },
      { speaker: "Sasha", tokens: [{ t: "なるほど。ありがとうございます。" }], romaji: "naruhodo. arigatō gozaimasu.", en: "Got it. Thank you." },
    ],
  },
  {
    id: "seed-3-4", name: "3-4",
    lines: [
      { speaker: "Yagi", tokens: [{ t: "あさって、" }, { t: "時間", r: "じかん" }, { t: "ありますか？" }], romaji: "asatte, jikan arimasu ka?", en: "Do you have time the day after tomorrow?" },
      { speaker: "Sasha", tokens: [{ t: "はい。" }], romaji: "hai.", en: "Yes." },
      { speaker: "Yagi", tokens: [{ t: "神田", r: "かんだ" }, { t: "さんと" }, { t: "一緒", r: "いっしょ" }, { t: "にテニスしませんか？" }], romaji: "Kanda-san to issho ni tenisu shimasen ka?", en: "Do you want to play tennis with Kanda-san?" },
      { speaker: "Sasha", tokens: [{ t: "いいですねえ。ありがとうございます！" }, { t: "朝", r: "あさ" }, { t: "ですか？" }], romaji: "ii desu nee. arigatō gozaimasu! asa desu ka?", en: "Great. Thanks! In the morning?" },
      { speaker: "Yagi", tokens: [{ t: "そう。" }, { t: "朝", r: "あさ" }, { t: "の" }, { t: "７時", r: "しちじ" }, { t: "１５分", r: "じゅうごふん" }, { t: "だけど……。" }], romaji: "sō. asa no shichi-ji jū-go-fun da kedo…", en: "Right. 7:15 in the morning, but…" },
      { speaker: "Sasha", tokens: [{ t: "午前", r: "ごぜん" }, { t: "７時", r: "しちじ" }, { t: "１５分", r: "じゅうごふん" }, { t: "！" }], romaji: "gozen shichi-ji jū-go-fun!", en: "7:15 AM!" },
      { speaker: "Yagi", tokens: [{ t: "早", r: "はや" }, { t: "いですか？" }], romaji: "hayai desu ka?", en: "Is that early?" },
      { speaker: "Sasha", tokens: [{ t: "あ、いえ、あさってですね？" }, { t: "[checks calendar] オッケーです。" }], romaji: "a, ie, asatte desu ne? [checks calendar] okkē desu.", en: "Oh, no. The day after tomorrow, right? (Checking calendar) OK, that works." },
      { speaker: "Yagi", tokens: [{ t: "じゃあ" }, { t: "７時", r: "しちじ" }, { t: "１５分", r: "じゅうごふん" }, { t: "に。" }, { t: "現地", r: "げんち" }, { t: "で。" }], romaji: "jā shichi-ji jū-go-fun ni. genchi de.", en: "Then at 7:15. We'll meet there (on site)." },
      { speaker: "Sasha", tokens: [{ t: "よろしくお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "yoroshiku onegai-shimasu.", en: "Looking forward to it." },
    ],
  },
  {
    id: "seed-3-5-drill", name: "3-5 drill",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "すみません、これはいくらですか？" }], romaji: "sumimasen, kore wa ikura desu ka?", en: "Excuse me, how much is this?" },
      { speaker: "Kanda", tokens: [{ t: "それは" }, { t: "一個", r: "いっこ" }, { t: "４８０円", r: "よんひゃくはちじゅうえん" }, { t: "です。" }], romaji: "sore wa ikko yonhyaku-hachijū-en desu.", en: "That's 480 yen each." },
      { speaker: "Sasha", tokens: [{ t: "へえ、" }, { t: "高", r: "たか" }, { t: "くないですか？" }], romaji: "hē, takakunai desu ka?", en: "Whoa, isn't that expensive?" },
      { speaker: "Kanda", tokens: [{ t: "そうですね。じゃあ、この" }, { t: "青", r: "あお" }, { t: "いのはどうですか？" }], romaji: "sō desu ne. jā, kono aoi no wa dō desu ka?", en: "True. Well then, how about this blue one?" },
      { speaker: "Sasha", tokens: [{ t: "あ、かわいいですね。いくらですか？" }], romaji: "a, kawaii desu ne. ikura desu ka?", en: "Oh, that's cute. How much is it?" },
      { speaker: "Kanda", tokens: [{ t: "２６０円", r: "にひゃくろくじゅうえん" }, { t: "です。" }], romaji: "nihyaku-rokujū-en desu.", en: "It's 260 yen." },
      { speaker: "Sasha", tokens: [{ t: "じゃあ、これをください。" }], romaji: "jā, kore o kudasai.", en: "Then I'll take this one, please." },
    ],
  },
  {
    id: "seed-3-6", name: "3-6",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "先生", r: "せんせい" }, { t: "の" }, { t: "傘", r: "かさ" }, { t: "、ここにありますか？これかな？" }], romaji: "sensei no kasa, koko ni arimasu ka? kore ka na?", en: "Is the teacher's umbrella here? Maybe this one?" },
      { speaker: "Kanda", tokens: [{ t: "いや、それは" }, { t: "私", r: "わたし" }, { t: "のです。" }], romaji: "iya, sore wa watashi no desu.", en: "No, that's mine." },
      { speaker: "Sasha", tokens: [{ t: "え、じゃこれですかねえ。" }], romaji: "e, ja kore desu ka nē.", en: "Huh, then is it this one, I wonder?" },
      { speaker: "Kanda", tokens: [{ t: "いや、それも" }, { t: "違", r: "ちが" }, { t: "いますよ。" }, { t: "先生", r: "せんせい" }, { t: "のって" }, { t: "青", r: "あお" }, { t: "いのだよね？" }], romaji: "iya, sore mo chigaimasu yo. sensei no tte aoi no da yo ne?", en: "No, that's wrong too. The teacher's is the blue one, right?" },
      { speaker: "Sasha", tokens: [{ t: "そうですけど……。" }], romaji: "sō desu kedo……", en: "That's right, but…" },
      { speaker: "Kanda", tokens: [{ t: "ないですねえ、やっぱり。" }, { t: "雨", r: "あめ" }, { t: "ですか？" }], romaji: "nai desu nē, yappari. ame desu ka?", en: "It's not here after all. Is it raining?" },
      { speaker: "Sasha", tokens: [{ t: "いや、そうじゃないけど……" }], romaji: "iya, sō ja nai kedo……", en: "No, that's not it, but…" },
    ],
  },
  {
    id: "seed-3-7", name: "3-7",
    lines: [
      { speaker: "Kuno", tokens: [{ t: "サーシャさん" }], romaji: "Sāsha-san", en: "Sasha," },
      { speaker: "Kuno", tokens: [{ t: "すみません、あしたの" }, { t: "会議", r: "かいぎ" }, { t: "は" }, { t: "何時", r: "なんじ" }, { t: "ですか？" }, { t: "朝", r: "あさ" }, { t: "の" }, { t: "１０時半", r: "じゅうじはん" }, { t: "ですか？" }], romaji: "sumimasen, ashita no kaigi wa nanji desu ka? asa no jū-ji-han desu ka?", en: "Sorry, what time is tomorrow's meeting? Is it 10:30 in the morning?" },
      { speaker: "Kuno", tokens: [{ t: "久野", r: "くの" }], romaji: "Kuno", en: "— Kuno" },
    ],
  },
  {
    id: "seed-4-1", name: "4-1",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "ちょっと" }, { t: "大", r: "おお" }, { t: "きくしました。" }], romaji: "chotto ōkiku shimashita.", en: "I enlarged it a bit." },
      { speaker: "Kanda", tokens: [{ t: "すごく" }, { t: "いい" }, { t: "ポスターですね。" }, { t: "高", r: "たか" }, { t: "かったでしょう。" }], romaji: "sugoku ii posutā desu ne. takakatta deshō.", en: "That's a really nice poster. It must have been expensive." },
      { speaker: "Sasha", tokens: [{ t: "いや、それほどじゃなかったですよ。" }, { t: "3000" }, { t: "円", r: "えん" }, { t: "ぐらいでした。" }], romaji: "iya, sorehodo ja nakatta desu yo. sanzen-en gurai deshita.", en: "No, it wasn't that expensive. It was about 3000 yen." },
      { speaker: "Kanda", tokens: [{ t: "まあまあでしたね。" }], romaji: "māmā deshita ne.", en: "It was so-so, wasn't it." },
    ],
  },
  {
    id: "seed-4-2", name: "4-2",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "神田", r: "かんだ" }, { t: "さん、" }, { t: "大学", r: "だいがく" }, { t: "の" }, { t: "専攻", r: "せんこう" }, { t: "は？" }], romaji: "Kanda-san, daigaku no senkō wa?", en: "Kanda, what was your major in college?" },
      { speaker: "Kanda", tokens: [{ t: "数学", r: "すうがく" }, { t: "でした。" }], romaji: "sūgaku deshita.", en: "It was mathematics." },
      { speaker: "Sasha", tokens: [{ t: "へえ、" }, { t: "数学", r: "すうがく" }, { t: "！" }], romaji: "hee, sūgaku!", en: "Oh, math!" },
      { speaker: "Kanda", tokens: [{ t: "今", r: "いま" }, { t: "は" }, { t: "全然", r: "ぜんぜん" }, { t: "使", r: "つか" }, { t: "わないですけどね。" }, { t: "サーシャさんは？" }], romaji: "ima wa zenzen tsukawanai desu kedo ne. Sasha-san wa?", en: "I don't use it at all now, though. What about you, Sasha?" },
      { speaker: "Sasha", tokens: [{ t: "専攻", r: "せんこう" }, { t: "は" }, { t: "日本学", r: "にほんがく" }, { t: "でした。あとビジネスのコースもけっこう" }, { t: "取", r: "と" }, { t: "りました。" }], romaji: "senkō wa nihongaku deshita. ato bijinesu no kōsu mo kekkō torimashita.", en: "My major was Japanese Studies. I also took quite a few business courses on top of that." },
      { speaker: "Kanda", tokens: [{ t: "ふうん、" }, { t: "日本学", r: "にほんがく" }, { t: "って" }, { t: "日本語", r: "にほんご" }, { t: "だけじゃないですよね。" }], romaji: "fūn, nihongaku tte nihongo dake ja nai desu yo ne.", en: "Hmm, Japanese Studies isn't just the Japanese language, is it." },
      { speaker: "Sasha", tokens: [{ t: "ええ、" }, { t: "歴史", r: "れきし" }, { t: "とか" }, { t: "文学", r: "ぶんがく" }, { t: "とかも" }], romaji: "ee, rekishi toka bungaku toka mo", en: "Yeah, things like history and literature too—" },
      { speaker: "Kanda", tokens: [{ t: "宗教", r: "しゅうきょう" }, { t: "も？" }], romaji: "shūkyō mo?", en: "Religion too?" },
      { speaker: "Sasha", tokens: [{ t: "私", r: "わたし" }, { t: "は" }, { t: "取", r: "と" }, { t: "りませんでしたけど……。" }], romaji: "watashi wa torimasen deshita kedo…….", en: "I didn't take that one, though……" },
    ],
  },
  {
    id: "seed-4-3", name: "4-3",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "これは、" }, { t: "山下", r: "やました" }, { t: "さんですね。" }], romaji: "kore wa, Yamashita-san desu ne.", en: "This is Yamashita's, right?" },
      { speaker: "Sasha", tokens: [{ t: "あ、いや、" }, { t: "私", r: "わたし" }, { t: "がしました。" }], romaji: "a, iya, watashi ga shimashita.", en: "Oh, no, I'm the one who did it." },
      { speaker: "Kanda", tokens: [{ t: "本当", r: "ほんとう" }, { t: "ですか？" }], romaji: "hontō desu ka?", en: "Really?" },
      { speaker: "Sasha", tokens: [{ t: "はい。" }], romaji: "hai.", en: "Yes." },
      { speaker: "Kanda", tokens: [{ t: "いつ？" }], romaji: "itsu?", en: "When?" },
      { speaker: "Sasha", tokens: [{ t: "先週", r: "せんしゅう" }, { t: "しました。" }], romaji: "senshū shimashita.", en: "I did it last week." },
      { speaker: "Kanda", tokens: [{ t: "すごいな。" }, { t: "大変", r: "たいへん" }, { t: "だった?" }], romaji: "sugoi na. taihen datta?", en: "Wow. Was it tough?" },
      { speaker: "Sasha", tokens: [{ t: "いえ、" }, { t: "別", r: "べつ" }, { t: "に。" }], romaji: "ie, betsu ni.", en: "No, not really." },
      { speaker: "Kanda", tokens: [{ t: "お" }, { t: "疲", r: "つか" }, { t: "れ" }, { t: "様", r: "さま" }, { t: "。" }], romaji: "otsukaresama.", en: "Thank you for your hard work." },
    ],
  },
  {
    id: "seed-4-4", name: "4-4",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "連絡", r: "れんらく" }, { t: "、" }, { t: "来", r: "き" }, { t: "ました？" }], romaji: "renraku, kimashita?", en: "Did you get the message?" },
      { speaker: "Sasha", tokens: [{ t: "え？" }, { t: "何", r: "なん" }, { t: "ですか？" }], romaji: "e? nan desu ka?", en: "Huh? What do you mean?" },
      { speaker: "Kanda", tokens: [{ t: "来月", r: "らいげつ" }, { t: "の" }, { t: "会議", r: "かいぎ" }, { t: "の" }, { t: "時間", r: "じかん" }, { t: "。" }], romaji: "raigetsu no kaigi no jikan.", en: "The time of next month's meeting." },
      { speaker: "Sasha", tokens: [{ t: "ああ、そのことですか。" }, { t: "今朝", r: "けさ" }, { t: "聞", r: "き" }, { t: "きました。" }, { t: "20" }, { t: "日", r: "か" }, { t: "の" }, { t: "10" }, { t: "時", r: "じ" }, { t: "ですよね？" }], romaji: "aa, sono koto desu ka. kesa kikimashita. hatsuka no jūji desu yo ne?", en: "Oh, that. I heard about it this morning. It's at 10:00 on the 20th, right?" },
      { speaker: "Kanda", tokens: [{ t: "半", r: "はん" }, { t: "からじゃなかったですか?" }], romaji: "han kara ja nakatta desu ka?", en: "Wasn't it from half past?" },
      { speaker: "Sasha", tokens: [{ t: "いや、" }, { t: "10" }, { t: "時", r: "じ" }, { t: "から" }, { t: "11" }, { t: "時", r: "じ" }, { t: "半", r: "はん" }, { t: "までですけど。" }], romaji: "iya, jūji kara jūichiji han made desu kedo.", en: "No, it's from 10:00 to 11:30." },
      { speaker: "Kanda", tokens: [{ t: "そうか。えっと、" }, { t: "場所", r: "ばしょ" }, { t: "は？いつものところですね？" }], romaji: "sō ka. etto, basho wa? itsumo no tokoro desu ne?", en: "I see. Um, where is it? The usual place, right?" },
      { speaker: "Sasha", tokens: [{ t: "はい、" }, { t: "201" }, { t: "番", r: "ばん" }, { t: "の" }, { t: "会議室", r: "かいぎしつ" }, { t: "です。" }], romaji: "hai, nihyaku-ichi-ban no kaigishitsu desu.", en: "Yes, it's meeting room 201." },
    ],
  },
  {
    id: "seed-4-5", name: "4-5",
    lines: [
      { speaker: "Amy", tokens: [{ t: "何番", r: "なんばん" }, { t: "の" }, { t: "部屋", r: "へや" }, { t: "を" }, { t: "使", r: "つか" }, { t: "いましょうか。" }, { t: "107" }, { t: "番", r: "ばん" }, { t: "ですか？" }], romaji: "nanban no heya o tsukaimashō ka. hyaku-nana-ban desu ka?", en: "Which room number should we use? Room 107?" },
      { speaker: "Takashi", tokens: [{ t: "一階", r: "いっかい" }, { t: "の" }, { t: "107" }, { t: "番", r: "ばん" }, { t: "教室", r: "きょうしつ" }, { t: "はどうですか。はい、" }, { t: "昨日", r: "きのう" }, { t: "も" }, { t: "使", r: "つか" }, { t: "いましたけど、わりと" }, { t: "使", r: "つか" }, { t: "いやすかったですよ！" }], romaji: "ikkai no hyaku-nana-ban kyōshitsu wa dō desu ka. hai, kinō mo tsukaimashita kedo, warito tsukaiyasukatta desu yo!", en: "How about room 107 on the first floor? Yes, I used it yesterday too, and it was relatively easy to use!" },
      { speaker: "Amy", tokens: [{ t: "そうですか。じゃあそうしましょう。" }], romaji: "sō desu ka. jā sō shimashō.", en: "I see. Let's do that, then." },
    ],
  },
  {
    id: "seed-4-6", name: "4-6",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "お" }, { t: "疲", r: "つか" }, { t: "れ" }, { t: "様", r: "さま" }, { t: "。" }, { t: "時間", r: "じかん" }, { t: "、どのぐらいかかりましたか?すごくかかりませんでしたか？" }], romaji: "otsukaresama. jikan, dono gurai kakarimashita ka? sugoku kakarimasen deshita ka?", en: "Thanks for your hard work. About how much time did it take? Didn't it take a lot?" },
      { speaker: "Sasha", tokens: [{ t: "そうですね。ほとんど" }, { t: "3" }, { t: "時間", r: "じかん" }, { t: "ぐらいですかねえ。" }], romaji: "sō desu ne. hotondo sanjikan gurai desu ka nē.", en: "Let's see. It took almost about three hours, I guess." },
      { speaker: "Kanda", tokens: [{ t: "大変", r: "たいへん" }, { t: "でしたね。" }, { t: "明日", r: "あした" }, { t: "も" }, { t: "お" }, { t: "願", r: "ねが" }, { t: "いしますね？" }], romaji: "taihen deshita ne. ashita mo onegai shimasu ne?", en: "That was tough, wasn't it. I'll need your help again tomorrow too, okay?" },
      { speaker: "Sasha", tokens: [{ t: "はい、" }, { t: "頑張", r: "がんば" }, { t: "ります！" }], romaji: "hai, ganbarimasu!", en: "Yes, I'll do my best!" },
    ],
  },
  {
    id: "seed-5-1", name: "5-1",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "これ、" }, { t: "私", r: "わたし" }, { t: "が" }, { t: "決", r: "き" }, { t: "めていいですか?" }], romaji: "kore, watashi ga kimete ii desu ka?", en: "Can I decide this?" },
      { speaker: "Kanda", tokens: [{ t: "もちろん、そうしてください。なるべく" }, { t: "早", r: "はや" }, { t: "くお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "mochiron, sō shite kudasai. narubeku hayaku onegai shimasu.", en: "Of course, please go ahead. Please do it as soon as possible." },
      { speaker: "Sasha", tokens: [{ t: "わかりました。でも" }, { t: "今", r: "いま" }, { t: "すぐじゃなくてもいいですか？" }], romaji: "wakarimashita. demo ima sugu janakute mo ii desu ka?", en: "Understood. But is it okay if it's not right now?" },
      { speaker: "Kanda", tokens: [{ t: "全然", r: "ぜんぜん" }, { t: "平気", r: "へいき" }, { t: "です。あすでもあさってでも" }, { t: "構", r: "かま" }, { t: "いませんよ。" }], romaji: "zenzen heiki desu. asu demo asatte demo kamaimasen yo.", en: "That's totally fine. Tomorrow or the day after, either works." },
      { speaker: "Sasha", tokens: [{ t: "了解", r: "りょうかい" }, { t: "です！" }], romaji: "ryōkai desu!", en: "Got it!" },
      { speaker: "Kanda", tokens: [{ t: "よろしく。" }], romaji: "yoroshiku.", en: "Thanks, I appreciate it." },
    ],
  },
  {
    id: "seed-5-2", name: "5-2",
    lines: [
      { speaker: "Sakamoto", tokens: [{ t: "はい、じゃあ47ぺージを" }, { t: "見", r: "み" }, { t: "てください。" }], romaji: "hai, jā 47-pēji o mite kudasai.", en: "Okay, please look at page 47." },
      { speaker: "Brian", tokens: [{ t: "すみません。" }, { t: "質問", r: "しつもん" }, { t: "してもいいですか?" }], romaji: "sumimasen. shitsumon shite mo ii desu ka?", en: "Excuse me. May I ask a question?" },
      { speaker: "Sakamoto", tokens: [{ t: "はい、どうぞ。" }], romaji: "hai, dōzo.", en: "Yes, go ahead." },
      { speaker: "Brian", tokens: [{ t: "この" }, { t: "宿題", r: "しゅくだい" }, { t: "はあしたまでですね?" }], romaji: "kono shukudai wa ashita made desu ne?", en: "This homework is due by tomorrow, right?" },
      { speaker: "Sakamoto", tokens: [{ t: "いや、" }, { t: "今日", r: "きょう" }, { t: "までだったでしょう?" }], romaji: "iya, kyō made datta deshō?", en: "No, it was due today, wasn't it?" },
      { speaker: "Brian", tokens: [{ t: "あ、そうでしたか。すみません。" }], romaji: "a, sō deshita ka. sumimasen.", en: "Oh, was it? I'm sorry." },
      { speaker: "Sakamoto", tokens: [{ t: "じゃあ、" }, { t: "今日", r: "きょう" }, { t: "やってあす" }, { t: "出", r: "だ" }, { t: "してください。" }], romaji: "jā, kyō yatte asu dashite kudasai.", en: "Well then, do it today and turn it in tomorrow." },
      { speaker: "Brian", tokens: [{ t: "分", r: "わ" }, { t: "かりました。どうもすみませんでした。" }], romaji: "wakarimashita. dōmo sumimasendeshita.", en: "Understood. I'm very sorry." },
    ],
  },
  {
    id: "seed-5-3", name: "5-3",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "すみません。" }, { t: "一", r: "ひと" }, { t: "つだけお" }, { t: "願", r: "ねが" }, { t: "いしてもいいですか？" }], romaji: "sumimasen. hitotsu dake onegai shite mo ii desu ka?", en: "Excuse me. Could I ask you just one favor?" },
      { speaker: "Kanda", tokens: [{ t: "どうぞ。なんでしょう。" }], romaji: "dōzo. nan deshō.", en: "Go ahead. What is it?" },
      { speaker: "Sasha", tokens: [{ t: "申", r: "もう" }, { t: "し" }, { t: "訳", r: "わけ" }, { t: "ありませんが、これあしたも" }, { t: "持", r: "も" }, { t: "ってきていただけますか？" }], romaji: "mōshiwake arimasen ga, kore ashita mo motte kite itadakemasu ka?", en: "I'm sorry, but could you bring this again tomorrow too?" },
      { speaker: "Kanda", tokens: [{ t: "いいですよ。" }, { t: "全部", r: "ぜんぶ" }, { t: "ですか?" }], romaji: "ii desu yo. zenbu desu ka?", en: "Sure. All of it?" },
      { speaker: "Sasha", tokens: [{ t: "そうですねえ。すみませんが、" }, { t: "一応", r: "いちおう" }, { t: "全部", r: "ぜんぶ" }, { t: "お" }, { t: "願", r: "ねが" }, { t: "いできますか？" }], romaji: "sō desu nē. sumimasen ga, ichiō zenbu onegai dekimasu ka?", en: "Let's see. Sorry, but could I ask for all of it, just to be safe?" },
      { speaker: "Kanda", tokens: [{ t: "わかりました。" }], romaji: "wakarimashita.", en: "Understood." },
      { speaker: "Sasha", tokens: [{ t: "すみません。" }], romaji: "sumimasen.", en: "Sorry, thank you." },
      { speaker: "Kanda", tokens: [{ t: "平気平気", r: "へいきへいき" }, { t: "。" }, { t: "任", r: "まか" }, { t: "せてください。" }], romaji: "heiki heiki. makasete kudasai.", en: "It's fine, it's fine. Leave it to me." },
    ],
  },
  {
    id: "seed-5-4", name: "5-4",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "ちょっと" }, { t: "銀行", r: "ぎんこう" }, { t: "に" }, { t: "行", r: "い" }, { t: "ってきますけど、" }, { t: "何", r: "なに" }, { t: "かありますか？" }], romaji: "chotto ginkō ni itte kimasu kedo, nani ka arimasu ka?", en: "I'm going to pop over to the bank real quick — is there anything you need?" },
      { speaker: "Sasha", tokens: [{ t: "あ、じゃあ、すみませんが、" }, { t: "私", r: "わたし" }, { t: "も" }, { t: "一緒", r: "いっしょ" }, { t: "に" }, { t: "連", r: "つ" }, { t: "れて" }, { t: "行", r: "い" }, { t: "っていただけませんか？" }], romaji: "a, jā, sumimasen ga, watashi mo issho ni tsurete itte itadakemasen ka?", en: "Oh, well, sorry, but could you take me along with you?" },
      { speaker: "Kanda", tokens: [{ t: "いいですよ。" }], romaji: "ii desu yo.", en: "Sure." },
      { speaker: "Sasha", tokens: [{ t: "助", r: "たす" }, { t: "かります。" }, { t: "銀行", r: "ぎんこう" }, { t: "まで" }, { t: "歩", r: "ある" }, { t: "いていきますか？" }], romaji: "tasukarimasu. ginkō made aruite ikimasu ka?", en: "That helps a lot. Are we walking to the bank?" },
      { speaker: "Kanda", tokens: [{ t: "いや、" }, { t: "車", r: "くるま" }, { t: "で" }, { t: "行", r: "い" }, { t: "きましょう。" }], romaji: "iya, kuruma de ikimashō.", en: "No, let's go by car." },
    ],
  },
  {
    id: "seed-5-5", name: "5-5",
    lines: [
      { speaker: "Yamamoto", tokens: [{ t: "金曜日", r: "きんようび" }, { t: "のうちのレセプションには、いらっしゃいますね？" }], romaji: "kin'yōbi no uchi no resepushon ni wa, irasshaimasu ne?", en: "You'll be attending our company's reception on Friday, right?" },
      { speaker: "Sasha", tokens: [{ t: "はい。" }, { t: "呼", r: "よ" }, { t: "んでくださってありがとうございます。" }], romaji: "hai. yonde kudasatte arigatō gozaimasu.", en: "Yes. Thank you for inviting me." },
      { speaker: "Yamamoto", tokens: [{ t: "あ、レセプションの" }, { t: "前", r: "まえ" }, { t: "に" }, { t: "短", r: "みじか" }, { t: "いプレゼンがございますから、よろしければそちらへもいらしてください。" }], romaji: "a, resepushon no mae ni mijikai purezen ga gozaimasu kara, yoroshikereba sochira e mo irashite kudasai.", en: "Oh, there will be a short presentation before the reception, so if you'd like, please come to that as well." },
      { speaker: "Sasha", tokens: [{ t: "あ、そうですか。はい、" }, { t: "喜", r: "よろこ" }, { t: "んで" }, { t: "伺", r: "うかが" }, { t: "います。" }], romaji: "a, sō desu ka. hai, yorokonde ukagaimasu.", en: "Oh, is that so. Yes, I'd be delighted to attend." },
      { speaker: "Yamamoto", tokens: [{ t: "では、レセプションの20" }, { t: "分", r: "ぷん" }, { t: "ぐらい" }, { t: "前", r: "まえ" }, { t: "までにいらしていただけますか？" }], romaji: "dewa, resepushon no nijuppun gurai mae made ni irashite itadakemasu ka?", en: "Then, could you arrive about 20 minutes before the reception?" },
      { speaker: "Sasha", tokens: [{ t: "わかりました。では、6" }, { t: "時", r: "じ" }, { t: "過", r: "す" }, { t: "ぎまでに" }, { t: "参", r: "まい" }, { t: "ります。ありがとうございます。" }], romaji: "wakarimashita. dewa, roku-ji sugi made ni mairimasu. arigatō gozaimasu.", en: "Understood. Then, I'll arrive a bit after 6 o'clock. Thank you." },
    ],
  },
  {
    id: "seed-5-6", name: "5-6",
    lines: [
      { speaker: "Brian", tokens: [{ t: "先生", r: "せんせい" }, { t: "、" }, { t: "今日", r: "きょう" }, { t: "ちょっとお" }, { t: "時間", r: "じかん" }, { t: "、いただけませんか？" }], romaji: "sensei, kyō chotto ojikan, itadakemasen ka?", en: "Sensei, could I have a bit of your time today?" },
      { speaker: "Sakamoto", tokens: [{ t: "はい、" }, { t: "何", r: "なん" }, { t: "でしょう。" }], romaji: "hai, nan deshō.", en: "Yes, what is it?" },
      { speaker: "Brian", tokens: [{ t: "僕", r: "ぼく" }, { t: "、" }, { t: "読", r: "よ" }, { t: "み" }, { t: "書", r: "か" }, { t: "きが" }, { t: "弱", r: "よわ" }, { t: "くて……。" }], romaji: "boku, yomikaki ga yowakute....", en: "My reading and writing are weak..." },
      { speaker: "Sakamoto", tokens: [{ t: "そうか……。" }, { t: "難", r: "むずか" }, { t: "しくなりましたか。" }], romaji: "sō ka.... muzukashiku narimashita ka.", en: "I see... Has it gotten difficult?" },
      { speaker: "Brian", tokens: [{ t: "はい。" }], romaji: "hai.", en: "Yes." },
      { speaker: "Sakamoto", tokens: [{ t: "じゃあ、3" }, { t: "時間目", r: "じかんめ" }, { t: "の" }, { t: "授業", r: "じゅぎょう" }, { t: "のあとで" }, { t: "練習", r: "れんしゅう" }, { t: "しましょうか。" }], romaji: "jā, san-jikanme no jugyō no ato de renshū shimashō ka.", en: "Well then, shall we practice after third period?" },
      { speaker: "Brian", tokens: [{ t: "お" }, { t: "願", r: "ねが" }, { t: "いできますか？" }], romaji: "onegai dekimasu ka?", en: "Could I ask you for that?" },
      { speaker: "Sakamoto", tokens: [{ t: "いいですよ。じゃあ、" }, { t: "研究室", r: "けんきゅうしつ" }, { t: "へ" }, { t: "来", r: "き" }, { t: "てください。" }], romaji: "ii desu yo. jā, kenkyūshitsu e kite kudasai.", en: "Sure. Well then, come to my office." },
      { speaker: "Brian", tokens: [{ t: "すみません。よろしくお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "sumimasen. yoroshiku onegai shimasu.", en: "Thank you. I appreciate it." },
    ],
  },
  {
    id: "seed-6-1", name: "6-1",
    lines: [
      { speaker: "Kawakami", tokens: [{ t: "もうみんな" }, { t: "来", r: "き" }, { t: "ていますね？はい、みなさん、" }, { t: "新", r: "あたら" }, { t: "しいメンバーです。ブライアン" }, { t: "君", r: "くん" }, { t: "、ひとこと" }, { t: "自己紹介", r: "じこしょうかい" }, { t: "をお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "Mō minna kite imasu ne? Hai, minasan, atarashii menbā desu. Buraian-kun, hitokoto jikoshōkai o onegai shimasu.", en: "Everyone's already here, right? Okay everyone, this is a new member. Brian, please give us a brief self-introduction." },
      { speaker: "Brian", tokens: [{ t: "はい、ブライアン・ワンです。アメリカの" }, { t: "オレゴン" }, { t: "州", r: "しゅう" }, { t: "から" }, { t: "来", r: "き" }, { t: "ました。" }, { t: "今", r: "いま" }, { t: "福沢大学", r: "ふくざわだいがく" }, { t: "の" }, { t: "留学生", r: "りゅうがくせい" }, { t: "センターで" }, { t: "勉強", r: "べんきょう" }, { t: "しています。" }, { t: "白井一郎", r: "しらいいちろう" }, { t: "君", r: "くん" }, { t: "のところでホームステイしています。あと、" }, { t: "合気道", r: "あいきどう" }, { t: "はオレゴンでちょっとだけしていましたけど、まだ" }, { t: "下手", r: "へた" }, { t: "です。よろしくお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "Hai, Buraian Wan desu. Amerika no Oregon-shū kara kimashita. Ima Fukuzawa Daigaku no ryūgakusei sentā de benkyō shite imasu. Shirai Ichirō-kun no tokoro de hōmusutei shite imasu. Ato, aikidō wa Oregon de chotto dake shite imashita kedo, mada heta desu. Yoroshiku onegai shimasu.", en: "Yes, I'm Brian Wang. I came from Oregon, in America. I'm currently studying at Fukuzawa University's international student center. I'm doing a homestay at Shirai Ichiro's place. Also, I did a little aikido in Oregon, but I'm still not very good at it. Nice to meet you." },
    ],
  },
  {
    id: "seed-6-2", name: "6-2",
    lines: [
      { speaker: "Kawakami", tokens: [{ t: "じゃあ、みんなも" }, { t: "一人", r: "ひとり" }, { t: "ずつ" }, { t: "自己紹介", r: "じこしょうかい" }, { t: "してください。" }, { t: "右", r: "みぎ" }, { t: "からでいいですか？" }], romaji: "Jā, minna mo hitori zutsu jikoshōkai shite kudasai. Migi kara de ii desu ka?", en: "Okay, please introduce yourselves one at a time as well. Is it okay to start from the right?" },
      { speaker: "Suzuki", tokens: [{ t: "はい。ええ、" }, { t: "鈴木彩乃", r: "すずきあやの" }, { t: "といいます。" }, { t: "2" }, { t: "週間", r: "しゅうかん" }, { t: "前", r: "まえ" }, { t: "に" }, { t: "初段", r: "しょだん" }, { t: "になりました。" }, { t: "合気道", r: "あいきどう" }, { t: "は" }, { t: "今年", r: "ことし" }, { t: "でもう" }, { t: "5" }, { t: "年目", r: "ねんめ" }, { t: "になります。" }, { t: "近", r: "ちか" }, { t: "くの" }, { t: "高校", r: "こうこう" }, { t: "で" }, { t: "生物", r: "せいぶつ" }, { t: "の" }, { t: "教師", r: "きょうし" }, { t: "をしています。どうぞよろしく。" }], romaji: "Hai. Ee, Suzuki Ayano to iimasu. Nishūkan mae ni shodan ni narimashita. Aikidō wa kotoshi de mō gonenme ni narimasu. Chikaku no kōkō de seibutsu no kyōshi o shite imasu. Dōzo yoroshiku.", en: "Yes. Um, my name is Suzuki Ayano. I got my first-degree black belt two weeks ago. This is already my fifth year doing aikido. I teach biology at a nearby high school. Nice to meet you." },
    ],
  },
  {
    id: "seed-6-3", name: "6-3",
    lines: [
      { speaker: "Brian", tokens: [{ t: "あの、みんなで" }, { t: "写真", r: "しゃしん" }, { t: "撮", r: "と" }, { t: "りませんか？" }], romaji: "Ano, minna de shashin torimasen ka?", en: "Um, shall we all take a photo together?" },
      { speaker: "Suzuki", tokens: [{ t: "いいですね。そうしましょう。じゃあ、みんなこっちの" }, { t: "方", r: "ほう" }, { t: "に" }, { t: "来", r: "き" }, { t: "て。" }, { t: "背", r: "せ" }, { t: "が" }, { t: "高", r: "たか" }, { t: "い" }, { t: "人", r: "ひと" }, { t: "は" }, { t: "後", r: "うし" }, { t: "ろに" }, { t: "立", r: "た" }, { t: "って。そこの" }, { t: "緑", r: "みどり" }, { t: "と" }, { t: "白", r: "しろ" }, { t: "の" }, { t: "人", r: "ひと" }, { t: "、もっと" }, { t: "右", r: "みぎ" }, { t: "、じゃなくて" }, { t: "左", r: "ひだり" }, { t: "に" }, { t: "寄", r: "よ" }, { t: "ってください。オッケー、" }, { t: "行", r: "い" }, { t: "きますよ。1、2、3はい、チーズ！" }], romaji: "Ii desu ne. Sō shimashō. Jā, minna kocchi no hō ni kite. Se ga takai hito wa ushiro ni tatte. Soko no midori to shiro no hito, motto migi, ja nakute hidari ni yotte kudasai. Okkē, ikimasu yo. Ichi, ni, san, hai, chīzu!", en: "Good idea. Let's do that. Okay everyone, come this way. Tall people, stand in the back. You there in green and white, move a bit more to the right — no, to the left. Okay, here we go. One, two, three, say cheese!" },
      { speaker: "Brian", tokens: [{ t: "（みんなで）チーズ！" }], romaji: "(Minna de) Chīzu!", en: "(Everyone together) Cheese!" },
      { speaker: "Suzuki", tokens: [{ t: "はい、もう" }, { t: "一枚", r: "いちまい" }, { t: "……。" }], romaji: "Hai, mō ichimai...", en: "Okay, one more..." },
      { speaker: "Suzuki", tokens: [{ t: "はい、どうもお" }, { t: "疲", r: "つか" }, { t: "れ" }, { t: "様", r: "さま" }, { t: "でした。" }], romaji: "Hai, dōmo otsukaresama deshita.", en: "Okay, thank you all for your hard work." },
      { speaker: "Brian", tokens: [{ t: "ありがとうございました。" }], romaji: "Arigatō gozaimashita.", en: "Thank you very much." },
    ],
  },
  {
    id: "seed-6-4", name: "6-4",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "大垣商会", r: "おおがきしょうかい" }, { t: "の" }, { t: "サーシャ・モリス" }, { t: "と" }, { t: "申", r: "もう" }, { t: "します。いつもお" }, { t: "世話", r: "せわ" }, { t: "になっております。" }], romaji: "Ōgaki Shōkai no Sasha Morisu to mōshimasu. Itsumo osewa ni natte orimasu.", en: "I'm Sasha Morris from Ogaki Trading Company. Thank you for your continued support." },
      { speaker: "Shirai", tokens: [{ t: "はじめまして。" }, { t: "吉田運送", r: "よしだうんそう" }, { t: "の" }, { t: "白井", r: "しらい" }, { t: "と" }, { t: "申", r: "もう" }, { t: "します。こちらこそどうぞよろしくお" }, { t: "願", r: "ねが" }, { t: "い" }, { t: "致", r: "いた" }, { t: "します。" }], romaji: "Hajimemashite. Yoshida Unsō no Shirai to mōshimasu. Kochira koso dōzo yoroshiku onegai itashimasu.", en: "How do you do. I'm Shirai from Yoshida Transport. The pleasure is mine — thank you for your cooperation." },
      { speaker: "Sasha", tokens: [{ t: "ありがとうございます。" }], romaji: "Arigatō gozaimasu.", en: "Thank you." },
      { speaker: "Shirai", tokens: [{ t: "あ、" }, { t: "申", r: "もう" }, { t: "し" }, { t: "訳", r: "わけ" }, { t: "ございません。こちらの" }, { t: "番号", r: "ばんごう" }, { t: "が" }, { t: "新", r: "あたら" }, { t: "しくなりまして……。" }], romaji: "A, mōshiwake gozaimasen. Kochira no bangō ga atarashiku narimashite...", en: "Oh, I'm terribly sorry. This number has changed recently..." },
      { speaker: "Sasha", tokens: [{ t: "あ、そうですか。" }], romaji: "A, sō desu ka.", en: "Oh, I see." },
      { speaker: "Shirai", tokens: [{ t: "はい。89-7720（れい）です。" }], romaji: "Hai. Hachi-kyū no nana-nana-ni-rei desu.", en: "Yes. It's 89-7720 (using 'rei' for zero)." },
      { speaker: "Sasha", tokens: [{ t: "7720（ぜろ）ですね。どうもありがとうございます。こちらこそ、どうぞよろしくお" }, { t: "願", r: "ねが" }, { t: "い" }, { t: "致", r: "いた" }, { t: "します。" }], romaji: "Nana-nana-ni-zero desu ne. Dōmo arigatō gozaimasu. Kochira koso, dōzo yoroshiku onegai itashimasu.", en: "7720 (zero), got it. Thank you very much. Likewise, I look forward to working with you." },
      { speaker: "Shirai", tokens: [{ t: "よろしくお" }, { t: "願", r: "ねが" }, { t: "い" }, { t: "致", r: "いた" }, { t: "します。" }], romaji: "Yoroshiku onegai itashimasu.", en: "I look forward to working with you." },
    ],
  },
  {
    id: "seed-6-5", name: "6-5",
    lines: [
      { speaker: "Sasha", tokens: [{ t: "部長", r: "ぶちょう" }, { t: "、" }, { t: "今週", r: "こんしゅう" }, { t: "お" }, { t: "忙", r: "いそが" }, { t: "しいですか？" }], romaji: "Buchō, konshū oisogashii desu ka?", en: "Department Manager, are you busy this week?" },
      { speaker: "Yagi", tokens: [{ t: "何", r: "なん" }, { t: "ですか?" }], romaji: "Nan desu ka?", en: "What is it?" },
      { speaker: "Sasha", tokens: [{ t: "いつかちょっとお" }, { t: "話", r: "はな" }, { t: "ししたいんですが……。" }], romaji: "Itsuka chotto ohanashi shitai n desu ga...", en: "I'd like to talk with you sometime, if that's okay..." },
      { speaker: "Yagi", tokens: [{ t: "何", r: "なに" }, { t: "か" }, { t: "難", r: "むずか" }, { t: "しい" }, { t: "話", r: "はなし" }, { t: "？" }], romaji: "Nanika muzukashii hanashi?", en: "Something difficult to talk about?" },
      { speaker: "Sasha", tokens: [{ t: "いえ、ちょっと" }, { t: "来年", r: "らいねん" }, { t: "のことについて……。" }], romaji: "Ie, chotto rainen no koto ni tsuite...", en: "No, it's just about something regarding next year..." },
      { speaker: "Yagi", tokens: [{ t: "わかりました。じゃあ、" }, { t: "木曜", r: "もくよう" }, { t: "はどうですか？" }, { t: "午後", r: "ごご" }, { t: "はずっと" }, { t: "空", r: "あ" }, { t: "いてますから。" }], romaji: "Wakarimashita. Jā, mokuyō wa dō desu ka? Gogo wa zutto aitemasu kara.", en: "I understand. How about Thursday, then? My afternoon is free the whole time." },
      { speaker: "Sasha", tokens: [{ t: "そうですか。では" }, { t: "2" }, { t: "時", r: "じ" }, { t: "ごろいかがでしょうか。" }], romaji: "Sō desu ka. Dewa niji-goro ikaga deshō ka.", en: "I see. Well then, how about around 2 o'clock?" },
      { speaker: "Yagi", tokens: [{ t: "いいですよ。じゃあ、あさっての" }, { t: "2" }, { t: "時", r: "じ" }, { t: "に。" }], romaji: "Ii desu yo. Jā, asatte no niji ni.", en: "Sounds good. Alright, at 2 o'clock the day after tomorrow, then." },
      { speaker: "Sasha", tokens: [{ t: "はい、よろしくお" }, { t: "願", r: "ねが" }, { t: "いします。" }], romaji: "Hai, yoroshiku onegai shimasu.", en: "Yes, thank you very much." },
    ],
  },
  {
    id: "seed-6-6", name: "6-6",
    lines: [
      { speaker: "Kanda", tokens: [{ t: "どうもお" }, { t: "待", r: "ま" }, { t: "たせしました。" }], romaji: "Dōmo omatase shimashita.", en: "Sorry to keep you waiting." },
      { speaker: "Sasha", tokens: [{ t: "いえいえ。" }], romaji: "Ie ie.", en: "Not at all." },
      { speaker: "Kanda", tokens: [{ t: "何", r: "なに" }, { t: "かもう" }, { t: "頼", r: "たの" }, { t: "みました？" }], romaji: "Nanika mō tanomimashita?", en: "Have you ordered anything yet?" },
      { speaker: "Sasha", tokens: [{ t: "いえ、まだ" }, { t: "何", r: "なに" }, { t: "も。カレーか" }, { t: "今日", r: "きょう" }, { t: "の" }, { t: "ランチかで" }, { t: "迷", r: "まよ" }, { t: "ってます。" }], romaji: "Ie, mada nanimo. Karē ka kyō no ranchi ka de mayottemasu.", en: "No, nothing yet. I can't decide between the curry and today's lunch special." },
      { speaker: "Kanda", tokens: [{ t: "それはカレーでしょうね。" }], romaji: "Sore wa karē deshō ne.", en: "That would be the curry, I'd guess." },
      { speaker: "Sasha", tokens: [{ t: "え？ランチより" }, { t: "カレーの" }, { t: "方", r: "ほう" }, { t: "がおすすめですか？" }], romaji: "E? Ranchi yori karē no hō ga osusume desu ka?", en: "Really? You'd recommend the curry over the lunch special?" },
      { speaker: "Kanda", tokens: [{ t: "ええ、ランチもいいんですけどね、カレーほどすごくないですよ。" }, { t: "他", r: "ほか" }, { t: "の" }, { t: "店", r: "みせ" }, { t: "のものとあまり" }, { t: "違", r: "ちが" }, { t: "わないですね。" }], romaji: "Ee, ranchi mo ii n desu kedo ne, karē hodo sugokunai desu yo. Hoka no mise no mono to amari chigawanai desu ne.", en: "Well, the lunch special is fine too, but it's not as amazing as the curry. It's not that different from what other places serve." },
      { speaker: "Sasha", tokens: [{ t: "へえ。さすがグルメの" }, { t: "神田", r: "かんだ" }, { t: "さん、よくご" }, { t: "存知", r: "ぞんじ" }, { t: "ですね！" }], romaji: "Hee. Sasuga gurume no Kanda-san, yoku gozonji desu ne!", en: "Wow. As expected from a foodie like you, Kanda — you really know your stuff!" },
      { speaker: "Kanda", tokens: [{ t: "いえいえ。" }], romaji: "Ie ie.", en: "Not at all." },
      { speaker: "Sasha", tokens: [{ t: "じゃあ、カレーにします。やっぱり" }, { t: "神田", r: "かんだ" }, { t: "さんに" }, { t: "聞", r: "き" }, { t: "いて、よかった！" }], romaji: "Jā, karē ni shimasu. Yappari Kanda-san ni kiite, yokatta!", en: "Okay, I'll go with the curry. I'm glad I asked you, Kanda!" },
    ],
  },
  {
    id: "seed-culture-talk", name: "Culture talk",
    lines: [
      { speaker: "Matthew", tokens: [{ t: "こんにちは。エイムズ・マシューです。" }], romaji: "konnichiwa. Eimuzu Mashū desu.", en: "Hello. I'm Matthew Ames." },
      { speaker: "Matthew", tokens: [{ t: "今日", r: "きょう" }, { t: "はポケモンと" }, { t: "日本", r: "にほん" }, { t: "の" }, { t: "文化", r: "ぶんか" }, { t: "について" }, { t: "話", r: "はな" }, { t: "します。" }], romaji: "kyō wa Pokemon to Nihon no bunka ni tsuite hanashimasu.", en: "Today I will talk about Pokémon and Japanese culture." },
      { speaker: "Matthew", tokens: [{ t: "ポケモンが" }, { t: "大好", r: "だいす" }, { t: "きです。ポケモンの" }, { t: "中", r: "なか" }, { t: "に、" }, { t: "日本", r: "にほん" }, { t: "の" }, { t: "文化", r: "ぶんか" }, { t: "がたくさんあります。" }], romaji: "Pokemon ga daisuki desu. Pokemon no naka ni, Nihon no bunka ga takusan arimasu.", en: "I love Pokémon. There is a lot of Japanese culture inside Pokémon." },
      { speaker: "Matthew", tokens: [{ t: "一番目", r: "いちばんめ" }, { t: "はコイキングとギャラドスです。" }], romaji: "ichi-ban-me wa Koikingu to Gyaradosu desu.", en: "The first is Magikarp (Koiking) and Gyarados." },
      { speaker: "Matthew", tokens: [{ t: "コイキングは" }, { t: "弱", r: "よわ" }, { t: "いです。でも、ギャラドスになります。ギャラドスはとても" }, { t: "強", r: "つよ" }, { t: "いです。" }], romaji: "Koikingu wa yowai desu. demo, Gyaradosu ni narimasu. Gyaradosu wa totemo tsuyoi desu.", en: "Magikarp is weak. But it becomes Gyarados. Gyarados is very strong." },
      { speaker: "Matthew", tokens: [{ t: "これは「" }, { t: "登竜門", r: "とうりゅうもん" }, { t: "」の" }, { t: "話", r: "はなし" }, { t: "です。" }, { t: "鯉", r: "こい" }, { t: "は" }, { t: "滝", r: "たき" }, { t: "を" }, { t: "登", r: "のぼ" }, { t: "ります。そして、" }, { t: "竜", r: "りゅう" }, { t: "になります。" }], romaji: "kore wa 'tōryūmon' no hanashi desu. koi wa taki o noborimasu. soshite, ryū ni narimasu.", en: "This is the story of the 'Dragon Gate.' A carp climbs the waterfall. And it becomes a dragon." },
      { speaker: "Matthew", tokens: [{ t: "意味", r: "いみ" }, { t: "は「がんばってください」です。" }], romaji: "imi wa 'ganbatte kudasai' desu.", en: "The meaning is 'do your best.'" },
      { speaker: "Matthew", tokens: [{ t: "二番目", r: "にばんめ" }, { t: "はロコンとキュウコンです。キュウコンはきつねです。" }], romaji: "ni-ban-me wa Rokon to Kyūkon desu. Kyūkon wa kitsune desu.", en: "The second is Vulpix (Rokon) and Ninetales (Kyūkon). Ninetales is a fox." },
      { speaker: "Matthew", tokens: [{ t: "日本", r: "にほん" }, { t: "の" }, { t: "話", r: "はなし" }, { t: "の" }, { t: "中", r: "なか" }, { t: "で、きつねは" }, { t: "頭", r: "あたま" }, { t: "がいいです。" }, { t: "魔法", r: "まほう" }, { t: "もあります。" }], romaji: "Nihon no hanashi no naka de, kitsune wa atama ga ii desu. mahō mo arimasu.", en: "In Japanese stories, foxes are smart. They also have magic." },
      { speaker: "Matthew", tokens: [{ t: "しっぽが" }, { t: "九本", r: "きゅうほん" }, { t: "あります。たくさんのしっぽは、" }, { t: "強", r: "つよ" }, { t: "いきつねです。" }], romaji: "shippo ga kyū-hon arimasu. takusan no shippo wa, tsuyoi kitsune desu.", en: "It has nine tails. A fox with many tails is a strong fox." },
      { speaker: "Matthew", tokens: [{ t: "三番目", r: "さんばんめ" }, { t: "はダルマッカとヒヒダルマです。" }], romaji: "san-ban-me wa Darumakka to Hihidaruma desu.", en: "The third is Darumaka and Darmanitan (Hihidaruma)." },
      { speaker: "Matthew", tokens: [{ t: "だるまは" }, { t: "日本", r: "にほん" }, { t: "のお" }, { t: "守", r: "まも" }, { t: "りです。" }, { t: "丸", r: "まる" }, { t: "いです。そして、" }, { t: "赤", r: "あか" }, { t: "いです。" }], romaji: "daruma wa Nihon no o-mamori desu. marui desu. soshite, akai desu.", en: "The daruma is a Japanese good-luck charm. It is round. And it is red." },
      { speaker: "Matthew", tokens: [{ t: "だるまは" }, { t: "昔", r: "むかし" }, { t: "のお" }, { t: "坊", r: "ぼう" }, { t: "さんです。" }], romaji: "daruma wa mukashi no o-bō-san desu.", en: "The daruma is (based on) a monk from long ago." },
      { speaker: "Matthew", tokens: [{ t: "だるまの" }, { t: "意味", r: "いみ" }, { t: "も「がんばってください」です。" }], romaji: "daruma no imi mo 'ganbatte kudasai' desu.", en: "The daruma's meaning is also 'do your best.'" },
      { speaker: "Matthew", tokens: [{ t: "ポケモンは" }, { t: "楽", r: "たの" }, { t: "しいです。そして、" }, { t: "日本", r: "にほん" }, { t: "の" }, { t: "文化", r: "ぶんか" }, { t: "の" }, { t: "先生", r: "せんせい" }, { t: "です。" }], romaji: "Pokemon wa tanoshii desu. soshite, Nihon no bunka no sensei desu.", en: "Pokémon is fun. And it is a teacher of Japanese culture." },
      { speaker: "Matthew", tokens: [{ t: "ありがとうございました。" }, { t: "質問", r: "しつもん" }, { t: "がありますか？" }], romaji: "arigatō gozaimashita. shitsumon ga arimasu ka?", en: "Thank you very much. Are there any questions?" },
    ],
  },
];

/* ── Japanese text-to-speech ── */
// Primary: Google Cloud TTS (Neural2 voices) via our own Netlify Function —
// far more natural and pitch-accent-accurate than the browser's built-in
// voices. Falls back to browser speechSynthesis if the network call fails
// (offline, function not yet configured, etc).
const TTS_ENDPOINT = "/.netlify/functions/tts";
const TTS_OK = typeof window !== "undefined" && !!window.speechSynthesis;
let JP_VOICE = null;
function pickJpVoice() {
  if (!TTS_OK) return null;
  const vs = window.speechSynthesis.getVoices() || [];
  JP_VOICE = vs.find((v) => /^ja([-_]|$)/i.test(v.lang)) || null;
  return JP_VOICE;
}
if (TTS_OK) {
  pickJpVoice();
  try { window.speechSynthesis.onvoiceschanged = pickJpVoice; } catch (e) {}
}
function ttsUnlock() {           // iOS: first speak must happen inside a user tap
  if (!TTS_OK) return;
  try { const u = new SpeechSynthesisUtterance(""); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) {}
}
function speakJaFallback(text, rate) {
  if (!TTS_OK || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (JP_VOICE) u.voice = JP_VOICE;
    u.rate = rate || 0.9;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
let _ttsAudioEl = null;
let _ttsObjectUrl = null;
let _ttsToken = 0;   // invalidates stale/superseded calls so a slow fallback can't play over a newer request
function speakJa(text, rate, voice) {
  if (!text) return;
  const myToken = ++_ttsToken;
  const url = TTS_ENDPOINT + "?text=" + encodeURIComponent(text) + "&rate=" + (rate || 0.9) + (voice === "m" ? "&voice=m" : "");
  let fallbackFired = false;   // onerror and play().catch() can BOTH fire for one call — only escalate once
  const escalate = () => {
    if (fallbackFired || myToken !== _ttsToken) return;
    fallbackFired = true;
    speakJaAuthed(url, text, rate, myToken);
  };
  try {
    if (!_ttsAudioEl) _ttsAudioEl = new Audio();
    // Cached clips play instantly and need no auth. A cache miss (brand-new
    // word) 401s here — retry it authenticated, since generating new audio
    // costs real Google API usage and is gated to a signed-in session.
    _ttsAudioEl.onerror = escalate;
    _ttsAudioEl.src = url;
    const p = _ttsAudioEl.play();
    if (p && p.catch) p.catch(escalate);
  } catch (e) {
    escalate();
  }
}
async function speakJaAuthed(url, text, rate, myToken) {
  const stillCurrent = () => myToken === _ttsToken;
  const session = loadSession();
  if (!session) { if (stillCurrent()) speakJaFallback(text, rate); return; }
  try {
    const res = await fetch(url, { headers: { authorization: "Bearer " + session }, cache: "no-store" });
    if (!stillCurrent()) return;
    if (!res.ok) { speakJaFallback(text, rate); return; }
    const blob = await res.blob();
    if (!stillCurrent()) return;
    if (_ttsObjectUrl) URL.revokeObjectURL(_ttsObjectUrl);
    _ttsObjectUrl = URL.createObjectURL(blob);
    if (!_ttsAudioEl) _ttsAudioEl = new Audio();
    _ttsAudioEl.onerror = null;
    _ttsAudioEl.src = _ttsObjectUrl;
    _ttsAudioEl.play().catch(() => { if (stillCurrent()) speakJaFallback(text, rate); });
  } catch (e) {
    if (stillCurrent()) speakJaFallback(text, rate);
  }
}
function stopJa() {
  _ttsToken++;   // invalidate any in-flight fallback chain from the call being stopped
  try { if (_ttsAudioEl) _ttsAudioEl.pause(); } catch (e) {}
  if (TTS_OK) { try { window.speechSynthesis.cancel(); } catch (e) {} }
}

function SpeakBtn({ text, slow }) {
  if (!text) return null;
  return (
    <button type="button" className="tc-speakbtn" aria-label="Hear pronunciation"
      onClick={(e) => { e.stopPropagation(); ttsUnlock(); speakJa(text, slow ? 0.68 : 0.88); }}>🔊</button>
  );
}
function lineText(tokens) { return (tokens || []).map((t) => t.t || "").join(""); }

/* ── active AI helpers ── */
function hookPrompt(card) {
  return "You are helping a JPN101 beginner (NihonGO NOW! textbook) remember one Japanese word. Word: " + card.term + " (" + card.reading + ", " + card.romaji + ") = " + card.meaning + ". Reply with ONE vivid memory hook in at most 2 short sentences, plain text, no headers, no romaji lessons — just the hook. If the word has a common confusable sibling at this level, contrast them in a few words.";
}
function debriefPrompt(missed) {
  const list = missed.slice(0, 5).map((c) => c.term + " (" + c.romaji + ") = " + c.meaning).join("; ");
  return "A JPN101 beginner just finished a flashcard session and missed these words: " + list + ". In at most 80 words, plain text, no headers or bullets: point out any confusable pairs among them, give one concrete memory hook for the hardest-looking one, and end with one specific tip for the next session. Be direct and warm, not generic.";
}

function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("list");
  const [active, setActive] = useState(null);
  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [saveWarn, setSaveWarn] = useState("");
  const [part, setPart] = useState("A");
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {                 // auto-speak whenever a Japanese line becomes visible
    if (view !== "rehearse" || !voiceOn || !active) return;
    const line = active.lines && active.lines[idx];
    if (!line) return;
    const mine = part !== "read" && (part === "both" || line.speaker === part);
    if (!mine || revealed) speakJa(lineText(line.tokens), slow ? 0.68 : 0.9);
    return stopJa;
  }, [view, active, idx, revealed, part, voiceOn, slow]);

  useEffect(() => {
    (async () => {
      const [r, r2] = await Promise.all([sGet("jpn101:scripts"), sGet("jpn101:scripts:mirror")]);
      const parse = (x) => { try { return x ? JSON.parse(x) : []; } catch (e) { return []; } };
      let list = parse(r);
      // recover any user-added scripts from the mirror key if the main key lost them
      const ids = new Set(list.map((s) => s.id));
      let recovered = false;
      parse(r2).forEach((s) => { if (!String(s.id).startsWith("seed-") && !ids.has(s.id)) { list.push(s); ids.add(s.id); recovered = true; } });
      // retire outdated seed drills (renamed in b43) — user-added scripts are untouched
      const before = list.length;
      list = list.filter((s) => !(s.id === "seed-3-2" || (s.id === "seed-3-3" && s.name === "3-3")));
      let changed = recovered || list.length !== before;
      const names = new Set(list.map((s) => s.name));
      SCRIPT_SEED.forEach((s) => { if (!names.has(s.name)) { list = [...list, s]; changed = true; } });
      if (changed && (r || r2)) { const json = JSON.stringify(list); sSet("jpn101:scripts", json); sSet("jpn101:scripts:mirror", json); }   // never overwrite storage after failed/empty reads
      setScripts(list); setReady(true);
    })();
  }, []);

  const persist = async (list) => {
    setScripts(list);
    const json = JSON.stringify(list);
    const ok1 = await sSet("jpn101:scripts", json);
    const ok2 = await sSet("jpn101:scripts:mirror", json);
    setSaveWarn(ok1 || ok2 ? "" : "⚠️ Storage write failed — this change is only in memory and will be lost if you close the app. Keep it open, hit Backup in Stats, then add the script again.");
  };

  const localBuild = (rawText) => {
    // No-API fallback: parse "Speaker: line" format directly. No furigana/romaji,
    // but the script saves and rehearses (TTS reads the raw line).
    const out = [];
    let lastSpeaker = "A";
    rawText.split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const m = l.match(/^([^：:]{1,14})[：:]\s*(.*)$/);
      const speaker = m ? m[1].trim() : lastSpeaker;
      const text = m ? m[2].trim() : l;
      if (!text) return;
      lastSpeaker = speaker;
      out.push({ speaker, tokens: [{ t: text }], romaji: "", en: "" });
    });
    return out;
  };

  const annotateRaw = async (rawText) => {   // annotate in 3-line chunks: full dialogues overflow the reply limit and truncate the JSON
    const srcLines = rawText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < srcLines.length; i += 3) {
      const chunk = srcLines.slice(i, i + 3).join("\n");
      let ok = false, lastErr = null;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          const text = await callClaude(scriptPrompt(chunk));
          const parsed = parseJSON(text);
          if (!parsed.lines || !parsed.lines.length) throw new Error("no lines in reply");
          out.push(...parsed.lines);
          ok = true;
        } catch (e) { lastErr = e; }
      }
      if (!ok) throw new Error(lastErr && lastErr.message ? lastErr.message : "unknown");
    }
    return out;
  };

  const build = async () => {
    if (!raw.trim()) return;
    setBuilding(true); setError("");
    let lines = null, annotated = true, why = "";
    try { lines = await annotateRaw(raw); }
    catch (e) { annotated = false; why = e.message || ""; lines = localBuild(raw); }   // API failed → build it locally instead
    if (lines && lines.length) {
      const script = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || `Script ${scripts.length + 1}`, lines, raw, plain: !annotated };
      persist([...scripts, script]);
      setName(""); setRaw(""); setView("list");
      if (!annotated) setSaveWarn("⚠️ Saved without furigana — annotation failed (" + why + "). Tap ＋ふりがな to retry; if it keeps failing, tell Claude the exact message in these parentheses.");
    } else {
      setError("Couldn't read any lines — try one line per speaker, like 「孝：スマホ。」");
    }
    setBuilding(false);
  };

  const reannotate = async (s) => {   // add furigana/romaji/translation to a script that saved without them
    if (!s.raw || building) return;
    setBuilding(true); setSaveWarn("");
    try {
      const lines = await annotateRaw(s.raw);
      persist(scripts.map((x) => (x.id === s.id ? { ...x, lines, plain: false } : x)));
    } catch (e) {
      setSaveWarn("⚠️ Annotation failed (" + (e.message || "unknown") + ") — the script is safe, just plain. Tell Claude the message in these parentheses.");
    }
    setBuilding(false);
  };

  const startRehearse = (s) => { ttsUnlock(); setActive(s); setIdx(0); setRevealed(false); setPart("read"); setView("rehearse"); };
  const next = () => { setRevealed(false); setIdx((i) => i + 1); };
  const back = () => { setIdx((i) => Math.max(0, i - 1)); setRevealed(true); };

  if (!ready) return <div className="tc-empty">Loading your scripts…</div>;

  // ── NEW SCRIPT ──
  if (view === "new") {
    return (
      <div className="tc-sent">
        <div className="tc-rehhead">
          <button className="tc-btn tc-btn-sm" onClick={() => { setView("list"); setError(""); }}>← Scripts</button>
          <span className="tc-rehname">New script</span>
        </div>
        <input className="tc-sentinput" value={name} placeholder="name it — e.g. 1-14" onChange={(e) => setName(e.target.value)} />
        <textarea className="tc-sentinput" rows={8} value={raw}
          placeholder={"Paste your dialogue. Label speakers if you can:\n\nA: おはようございます。\nB: おはよう。おげんきですか。\nA: はい、げんきです。"}
          onChange={(e) => setRaw(e.target.value)} />
        {error && <div className="tc-senterr">{error}</div>}
        <div className="tc-sentbtns">
          <button className="tc-btn tc-btn-primary" onClick={build} disabled={!raw.trim() || building}>{building ? "Building…" : "Build rehearsal"}</button>
        </div>
        <p className="tc-addnote">Claude adds furigana, rōmaji, and a translation to each line so you can read and check yourself. Your scripts are saved here for next time.</p>
      </div>
    );
  }

  // ── REHEARSE ──
  if (view === "rehearse" && active) {
    const speakers = active.lines.reduce((acc, l) => (acc.includes(l.speaker) ? acc : [...acc, l.speaker]), []);
    const line = active.lines[idx];
    const mine = line && part !== "read" && (part === "both" || line.speaker === part);
    const last = idx + 1 >= active.lines.length;
    const setMode = (m) => { setPart(m); setIdx(0); setRevealed(false); };
    return (
      <div className="tc-sent">
        <div className="tc-rehhead">
          <button className="tc-btn tc-btn-sm" onClick={() => { stopJa(); setView("list"); }}>← Scripts</button>
          <span className="tc-rehname">{active.name}</span>
        </div>
        <p className="tc-ladder">Memorize ladder: ① Read it through → ② drill your part → ③ both sides from memory.</p>
        <div className="tc-sentmodes">
          <button className={"tc-segbtn" + (part === "read" ? " is-on" : "")} onClick={() => setMode("read")}>① Read</button>
          {speakers.map((sp) => (
            <button key={sp} className={"tc-segbtn" + (part === sp ? " is-on" : "")} onClick={() => setMode(sp)}>② My part: {sp}</button>
          ))}
          <button className={"tc-segbtn" + (part === "both" ? " is-on" : "")} onClick={() => setMode("both")}>③ Both sides</button>
        </div>
        {TTS_OK ? (
          <div className="tc-voicerow">
            <button className={"tc-fchip" + (voiceOn ? " is-on" : "")} onClick={() => { ttsUnlock(); setVoiceOn((v) => !v); if (voiceOn) stopJa(); }}>🔊 Voice {voiceOn ? "on" : "off"}</button>
            <button className={"tc-fchip" + (slow ? " is-on" : "")} onClick={() => setSlow((v) => !v)}>🐢 Slow</button>
          </div>
        ) : (
          <p className="tc-voicenote">This device has no speech voices available — voice playback disabled.</p>
        )}

        {idx < active.lines.length ? (
          <div className="tc-card2">
            <p className="tc-eyebrow">{line.speaker}{part === "read" ? "" : mine ? " · your line" : " · cue"} · {idx + 1}/{active.lines.length}</p>
            <p className="tc-sentgoal">{line.en}</p>
            {(!mine || revealed) ? (
              <>
                <p className="tc-sentjp"><Furigana tokens={line.tokens} /></p>
                {line.romaji && <p className="tc-sentans">{line.romaji}</p>}
              </>
            ) : (
              <p className="tc-cue">Your line — say it out loud, then check.</p>
            )}
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-sm tc-backbtn" onClick={back} disabled={idx === 0}>← Back</button>
              {TTS_OK && (!mine || revealed) && (
                <button className="tc-btn tc-btn-sm" onClick={() => { ttsUnlock(); speakJa(lineText(line.tokens), slow ? 0.68 : 0.9); }}>🔊</button>
              )}
              {(!mine || revealed) ? (
                <button className="tc-btn tc-btn-primary" onClick={next}>{last ? "Finish" : "Next line →"}</button>
              ) : (
                <button className="tc-btn tc-btn-primary" onClick={() => setRevealed(true)}>Reveal</button>
              )}
            </div>
          </div>
        ) : (
          <div className="tc-done">
            <p className="tc-eyebrow">Script complete 🎉</p>
            <div className="tc-donebtns">
              <button className="tc-btn tc-btn-primary" onClick={() => { setIdx(0); setRevealed(false); }}>Run it again</button>
              <button className="tc-btn" onClick={() => setView("list")}>Back to scripts</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LIST ──
  return (
    <div className="tc-sent">
      <div className="tc-rehhead">
        <span className="tc-rehname">Your scripts</span>
        <button className="tc-btn tc-btn-primary tc-btn-sm" onClick={() => { setView("new"); setError(""); }}>+ New script</button>
      </div>
      {saveWarn && <div className="tc-senterr">{saveWarn}</div>}
      {scripts.length === 0 ? (
        <div className="tc-sentempty">
          <p>Paste a dialogue you're rehearsing and it becomes a line-by-line, both-sides drill — with furigana over every kanji.</p>
          <button className="tc-btn tc-btn-primary" onClick={() => setView("new")}>Add your first script</button>
        </div>
      ) : (
        <ul className="tc-scriptlist">
          {scripts.map((s) => (
            <li key={s.id} className="tc-scriptrow">
              <button className="tc-scriptopen" onClick={() => startRehearse(s)}>
                <span className="tc-scriptname">{s.name}</span>
                <span className="tc-scriptmeta">{s.lines.length} lines{s.plain ? " · no furigana yet" : ""}</span>
              </button>
              {s.plain && s.raw && (
                <button className="tc-btn tc-btn-sm" disabled={building} onClick={() => reannotate(s)}>{building ? "…" : "＋ふりがな"}</button>
              )}
              <button className="tc-del" aria-label={"Delete " + s.name} onClick={() => persist(scripts.filter((x) => x.id !== s.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Write({ cards, onResult }) {
  const order = useMemo(() => cards.slice().sort((a, b) => masteryScore(a) - masteryScore(b)), [cards]);
  const [pos, setPos] = useState(0);
  const [guide, setGuide] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);

  const card = pos < order.length ? order[pos] : null;

  const setup = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2620";
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => { setup(); }, [pos, setup]);
  useEffect(() => {                                   // iOS: stop the page panning while drawing
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, []);
  useEffect(() => {
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  const xy = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const down = (e) => { e.preventDefault(); drawingRef.current = true; lastRef.current = xy(e); try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = xy(e), l = lastRef.current;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p;
  };
  const up = () => { drawingRef.current = false; lastRef.current = null; };

  const next = (got) => { if (card) onResult(card.id, got); setRevealed(false); setGuide(false); setPos((p) => p + 1); };

  if (!order.length) return <div className="tc-empty"><p>Add some words first, then come here to practice writing them by hand.</p></div>;
  if (!card) return (
    <div className="tc-done">
      <p className="tc-eyebrow">Writing set complete ✍️</p>
      <div className="tc-donebtns"><button className="tc-btn tc-btn-primary" onClick={() => setPos(0)}>Go again</button></div>
    </div>
  );

  const ghostSize = Math.max(26, Math.min(120, Math.floor(360 / Math.max(1, card.term.length))));

  return (
    <div className="tc-write">
      <p className="tc-eyebrow">Write it from memory · {pos + 1}/{order.length}</p>
      <div className="tc-card2">
        <p className="tc-sentgoal">{card.meaning}</p>
        <div className="tc-canvaswrap">
          {guide && <div className="tc-ghost" style={{ fontSize: ghostSize + "px" }}>{card.term}</div>}
          <canvas ref={canvasRef} className="tc-canvas"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
        </div>
        <div className="tc-sentbtns tc-writetools">
          <button className="tc-btn tc-btn-sm" onClick={() => setGuide((g) => !g)}>{guide ? "Hide guide" : "Show guide"}</button>
          <button className="tc-btn tc-btn-sm" onClick={setup}>Clear</button>
          {!revealed && <button className="tc-btn tc-btn-primary" onClick={() => setRevealed(true)}>Reveal</button>}
        </div>
        {revealed && (
          <div className="tc-writereveal">
            <p className="tc-writeanswer">{card.term}</p>
            <p className="tc-sentans">{card.reading}{card.romaji ? " · " + card.romaji : ""}</p>
            <div className="tc-gradebtns">
              <button className="tc-btn" onClick={() => next(false)}>Missed it</button>
              <button className="tc-btn tc-btn-got" onClick={() => next(true)}>Got it</button>
            </div>
          </div>
        )}
      </div>
      <p className="tc-hintline">Write the Japanese for the meaning above — finger or stylus. Stuck? Show the guide to trace, then reveal to check.</p>
    </div>
  );
}

function Browse({ cards, onRemove, onClear, onRestore }) {
  const [showMore, setShowMore] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [backupDone, setBackupDone] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [lastBk, setLastBk] = useState(null);
  useEffect(() => { (async () => { try { const r = await sGet("jpn101:lastBackup"); setLastBk(r ? Number(r) : 0); } catch (e) { setLastBk(0); } })(); }, []);

  const doBackup = async () => {
    let kana = null, scripts = null, freq = null, days = null, hooks = null, quota = null;
    try { const k = await sGet("jpn101:kana"); if (k) kana = JSON.parse(k); } catch (e) {}
    try { const sc = await sGet("jpn101:scripts"); if (sc) scripts = JSON.parse(sc); } catch (e) {}
    try { const f = await sGet("jpn101:freq"); if (f) freq = JSON.parse(f); } catch (e) {}
    try { const d = await sGet("jpn101:days"); if (d) days = JSON.parse(d); } catch (e) {}
    try { const h = await sGet("jpn101:hooks"); if (h) hooks = JSON.parse(h); } catch (e) {}
    try { quota = await sGet("jpn101:freqQuota"); } catch (e) {}
    let oral = null;
    try { const or = await sGet("jpn101:oralAttempts"); if (or) oral = JSON.parse(or); } catch (e) {}
    const blob = JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), deck: cards, kana, scripts, freq, days, hooks, quota, oral });
    // save a real file too — clipboard is convenient, a file is permanent
    try {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { await navigator.clipboard.writeText(blob); } catch (e) { setRestoreMsg("Clipboard blocked — but your backup FILE downloaded fine. You can also long-press and copy:"); setShowRestore(true); setRestoreText(blob); }
    sSet("jpn101:lastBackup", String(Date.now())); setLastBk(Date.now());
    setBackupDone(true); setTimeout(() => setBackupDone(false), 2200);
  };
  const doRestore = async () => {
    try {
      const o = JSON.parse(restoreText.trim());
      if (o && o.app === "tangocho-pack") {          // update pack: ADD content, keep all progress
        const have = new Set(cards.map((c) => c.term));
        const maxLesson = cards.reduce((m, c) => Math.max(m, c.lesson || 0), 0);
        const fresh = (o.words || []).filter((w) => w && w.term && !have.has(w.term)).map((w, i) => ({
          id: "p" + Date.now() + "-" + i,
          term: w.term, reading: w.reading || w.term, romaji: w.romaji || "", meaning: w.meaning || "",
          kind: w.kind || "mixed", emoji: w.emoji || "", lesson: w.lesson || maxLesson + 1, sec: w.sec,
          seen: 0, correct: 0, level: 0, streak: 0,
        }));
        if (fresh.length) await onRestore([...cards, ...fresh]);
        let addedScripts = 0;
        if (Array.isArray(o.scripts) && o.scripts.length) {
          let list = [];
          try { const r = await sGet("jpn101:scripts"); if (r) list = JSON.parse(r) || []; } catch (e) {}
          const names = new Set(list.map((x) => x.name));
          o.scripts.forEach((sc) => { if (sc && sc.name && !names.has(sc.name)) { list.push(sc); addedScripts++; } });
          if (addedScripts) await sSet("jpn101:scripts", JSON.stringify(list));
        }
        setRestoreMsg("Pack applied ✓ — added " + fresh.length + " words" + (addedScripts ? " and " + addedScripts + " script" + (addedScripts > 1 ? "s" : "") : "") + ". Your progress is untouched.");
        setRestoreText("");
        return;
      }
      if (!o || o.app !== "tangocho" || !Array.isArray(o.deck)) { setRestoreMsg("That doesn't look like a 単語帳 backup or update pack."); return; }
      if (o.kana) await sSet("jpn101:kana", JSON.stringify(o.kana));
      if (o.scripts) await sSet("jpn101:scripts", JSON.stringify(o.scripts));
      if (o.hooks) await sSet("jpn101:hooks", JSON.stringify(o.hooks));
      if (o.quota) await sSet("jpn101:freqQuota", String(o.quota));
      if (o.oral) await sSet("jpn101:oralAttempts", JSON.stringify(o.oral));
      if (o.freq && Array.isArray(o.freq)) {
        // keep freq stats from the backup, plus any tier words added since it was taken
        const fmerged = [...o.freq];
        const fhave = new Set(fmerged.map((c) => c.term));
        FREQ_SEED.forEach((s) => { if (!fhave.has(s.term)) { fmerged.push({ id: uid(), seen: 0, correct: 0, ms: 0, msN: 0, ...s }); fhave.add(s.term); } });
        await sSet("jpn101:freq", JSON.stringify(fmerged));
        await sSet("jpn101:freqVersion", String(FREQ_VERSION));
      }
      if (o.days) {
        // merge day-by-day; keep whichever record shows more reviews for that date
        let cur = {};
        try { const r = await sGet("jpn101:days"); if (r) cur = JSON.parse(r) || {}; } catch (e) {}
        Object.entries(o.days).forEach(([k, v]) => { if (!cur[k] || (v.rev || 0) > (cur[k].rev || 0)) cur[k] = v; });
        await sSet("jpn101:days", JSON.stringify(cur));
        _days = cur;
      }
      // keep any seed words the backup predates (e.g. scenes added after the backup was taken)
      const merged = [...o.deck];
      const haveTerms = new Set(merged.map((c) => c.term));
      let addedFromSeed = 0;
      SEED.forEach((s) => {
        if (!haveTerms.has(s.term)) { merged.push({ id: uid(), seen: 0, correct: 0, ...s }); haveTerms.add(s.term); addedFromSeed++; }
      });
      await onRestore(merged);
      setRestoreMsg("Restored ✓ — " + o.deck.length + " words with their stats" + (o.kana ? ", kana progress" : "") + (o.scripts ? ", scripts" : "") + (addedFromSeed ? ", plus " + addedFromSeed + " newer course words kept" : "") + ". (Backup from " + (o.date || "?").slice(0, 10) + ")");
      setRestoreText("");
    } catch (e) { setRestoreMsg("Couldn't read that backup: " + e.message); }
  };

  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");   // all | review | new | mastered
  const [sortWeak, setSortWeak] = useState(true);

  const [googleEmail, setGoogleEmail] = useState(() => _googleEmail);
  const googleBtnRef = useRef(null);
  useEffect(() => {
    if (!googleEmail) renderGoogleButton(googleBtnRef.current);
    initGoogleAuth(() => setGoogleEmail(_googleEmail));
  }, [googleEmail]);

  const summary = useMemo(() => {
    let mastered = 0, need = 0, fresh = 0;
    cards.forEach((c) => {
      if (!(c.seen > 0)) fresh++;
      else if ((c.level || 0) >= 4) mastered++;
      else need++;
    });
    return { mastered, need, fresh, total: cards.length };
  }, [cards]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = cards;
    if (t) list = list.filter((c) => [c.term, c.reading, c.romaji, c.meaning].some((f) => (f || "").toLowerCase().includes(t)));
    if (filter === "new") list = list.filter((c) => !(c.seen > 0));
    else if (filter === "mastered") list = list.filter((c) => c.seen > 0 && (c.level || 0) >= 4);
    else if (filter === "review") list = list.filter((c) => c.seen > 0 && (c.level || 0) < 4);
    if (sortWeak) list = list.slice().sort((a, b) => (a.seen > 0 ? masteryScore(a) : 99) - (b.seen > 0 ? masteryScore(b) : 99));
    return list;
  }, [cards, q, filter, sortWeak]);

  const exportText = useCallback(() => {
    const tsv = cards.map((c) => [c.term, c.reading, c.romaji, c.meaning, c.emoji || ""].join("\t")).join("\n");
    navigator.clipboard?.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  }, [cards]);

  return (
    <div className="tc-browse">
      <div className="tc-summary">
        <div className="tc-sumitem"><b>{summary.total}</b><span>words</span></div>
        <div className="tc-sumitem tc-sum-good"><b>{summary.mastered}</b><span>mastered</span></div>
        <div className="tc-sumitem tc-sum-need"><b>{summary.need}</b><span>need work</span></div>
        <div className="tc-sumitem tc-sum-new"><b>{summary.fresh}</b><span>untouched</span></div>
      </div>

      <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <p style={{ margin: "0 0 6px", fontWeight: 600 }}>🔄 Sync across your devices</p>
        {googleEmail ? (
          <p style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3ddc84", display: "inline-block", boxShadow: "0 0 6px #3ddc84" }} />
            Signed in as <b>{googleEmail}</b> — synced automatically.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, opacity: .7 }}>Sign in once per device to keep your progress synced everywhere.</p>
            <div ref={googleBtnRef} style={{ marginBottom: 4 }} />
          </>
        )}
      </div>

      <div className="tc-browsebar">
        <input className="tc-search" placeholder="Search words…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="tc-btn tc-btn-sm" onClick={() => setShowMore((v) => !v)}>{showMore ? "Less ⌃" : "More ⌄"}</button>
      </div>

      {showMore && (
        <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          {lastBk !== null && Date.now() - lastBk > 7 * 86400000 && (
            <p className="tc-conjnote" style={{ marginTop: 0 }}>💾 {lastBk ? "Last backup was " + Math.floor((Date.now() - lastBk) / 86400000) + " days ago" : "No backup yet on this device"} — a backup file has everything: both decks, all stats, think-times, scripts, and exam history.</p>
          )}
          <div className="tc-browsebar" style={{ marginBottom: 0 }}>
            <button className="tc-btn tc-btn-sm" onClick={exportText} disabled={!cards.length}>{copied ? "Copied!" : "Export"}</button>
            <button className="tc-btn tc-btn-sm" onClick={doBackup} disabled={!cards.length}>{backupDone ? "Backed up ✓" : "💾 Backup"}</button>
            <button className="tc-btn tc-btn-sm" onClick={() => { setShowRestore((v) => !v); setRestoreMsg(""); }}>Restore</button>
            {!confirm ? (
              <button className="tc-btn tc-btn-sm tc-btn-danger" onClick={() => setConfirm(true)} disabled={!cards.length}>Clear all</button>
            ) : (
              <span className="tc-confirm">
                Delete everything?
                <button className="tc-btn tc-btn-sm tc-btn-danger" onClick={() => { onClear(); setConfirm(false); }}>Yes</button>
                <button className="tc-btn tc-btn-sm" onClick={() => setConfirm(false)}>No</button>
              </span>
            )}
          </div>

          {showRestore && (
            <div className="tc-restore">
              <p className="tc-restorehint">Paste a 💾 backup (replaces everything) or an update pack from Claude (adds new words & scripts — progress untouched), then Apply.</p>
              <textarea className="tc-restorebox" value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder='{"app":"tangocho", ...}' />
              <div className="tc-restorebtns">
                <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={doRestore} disabled={!restoreText.trim()}>Apply backup</button>
                <button className="tc-btn tc-btn-sm" onClick={() => { setShowRestore(false); setRestoreMsg(""); }}>Close</button>
              </div>
              {restoreMsg && <p className="tc-restoremsg">{restoreMsg}</p>}
            </div>
          )}
          {!showRestore && restoreMsg && <p className="tc-restoremsg">{restoreMsg}</p>}
        </div>
      )}
      <div className="tc-filters">
        {[["all", "All"], ["review", "Needs work"], ["new", "Untouched"], ["mastered", "Mastered"]].map(([id, label]) => (
          <button key={id} className={"tc-fchip" + (filter === id ? " is-on" : "")} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <button className={"tc-fchip tc-fchip-sort" + (sortWeak ? " is-on" : "")} onClick={() => setSortWeak((v) => !v)}>{sortWeak ? "Weakest first ↓" : "By lesson"}</button>
      </div>

      {shown.length === 0 ? (
        <div className="tc-empty">{cards.length === 0 ? "No words yet." : "No matches."}</div>
      ) : (
        <ul className="tc-list">
          {shown.map((c) => {
            const seen = c.seen || 0, correct = c.correct || 0, lvl = Math.min(5, c.level || 0);
            const pct = seen ? Math.round((correct / seen) * 100) : 0;
            const needs = seen > 0 && (lvl < 2 || correct / seen < 0.5);
            return (
              <li key={c.id} className="tc-prow">
                <div className="tc-prow-top">
                  <span className="tc-rowterm">{c.emoji ? c.emoji + " " : ""}{c.term}</span>
                  <span className="tc-rowread">{c.reading}<em>{c.romaji}</em></span>
                  <button className="tc-del" aria-label={"Delete " + c.term} onClick={() => onRemove(c.id)}>✕</button>
                </div>
                <div className="tc-prow-mean">{c.meaning}</div>
                <div className="tc-prow-stats">
                  <div className="tc-meter" title={"Mastery " + lvl + "/5"} aria-label={"Mastery " + lvl + " of 5"}>
                    {[0, 1, 2, 3, 4].map((i) => <span key={i} className={"tc-seg" + (i < lvl ? " on" : "")} />)}
                  </div>
                  <span className="tc-prow-num">{seen ? `seen ${seen} · ✓ ${correct} (${pct}%)` : "not studied yet"}</span>
                  {isLeech(c) ? <span className="tc-leechpill">🩹 stuck</span> : needs ? <span className="tc-needpill">needs review</span> : null}
                  {!isLeech(c) && seen > 0 && lvl >= 4 && correct / seen >= 0.5 && <span className="tc-donepill">solid</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────── ADD ───────────────────────────── */
function Add({ onAdd, count }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const parse = useCallback(() => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const parts = (line.includes("\t") ? line.split("\t") : line.split(",")).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const term = parts[0], reading = parts[1] || parts[0], romaji = parts[2] || "";
      const rest = parts.slice(3);
      let emoji = "";
      if (rest.length && isEmoji(rest[rest.length - 1])) emoji = rest.pop();
      const meaning = rest.join(", ");
      out.push({ term, reading, romaji, meaning, emoji, kind: detectKind(term) });
    }
    if (out.length === 0) { setMsg("Couldn't read any rows — check the format below."); return; }
    onAdd(out);
    setMsg(`Added ${out.length} word${out.length > 1 ? "s" : ""}. Deck now has ${count + out.length}.`);
    setText("");
  }, [text, onAdd, count]);

  return (
    <div className="tc-add">
      <p className="tc-eyebrow">Add words</p>
      <p className="tc-addhelp">
        One word per line, fields split by comma or tab:
        <code>term, reading, rōmaji, meaning, 📷</code>
        The picture emoji at the end is optional.
      </p>
      <textarea className="tc-textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"先生, せんせい, sensei, teacher, 👩‍🏫\n犬, いぬ, inu, dog, 🐶"} />
      <div className="tc-addrow">
        <button className="tc-btn tc-btn-primary" onClick={parse} disabled={!text.trim()}>Add to deck</button>
        {msg && <span className="tc-addmsg">{msg}</span>}
      </div>
      <p className="tc-addnote">Easiest path: paste your class notes to Claude and I'll clean them up and load them for you. This box is here for quick one-offs.</p>
    </div>
  );
}

/* ───────────────────────────── STYLES ───────────────────────────── */
/* ─────────────────────────── CONJ DRILL ───────────────────────────
   Negative-form drill: ichidan (①), godan (⑤), irregular verbs,
   い-adjectives, and nouns/な-adjectives. Rules per sensei's board:
   ① drop る + ない · ⑤ shift to "a" row + ない · Adj: 〜い → くない ·
   Noun/なAdj: + じゃない · Polite: ます→ません OR ない+です      */
const CONJ_TYPES = {
  ichidan:   { chip: "① ichidan", rule: "iru/eru verb → drop る, add ない" },
  godan:     { chip: "⑤ godan", rule: "shift the last sound to the あ row, add ない" },
  irregular: { chip: "irregular", rule: "no pattern — just memorize this one" },
  iadj:      { chip: "い-adj", rule: "drop the final い, add くない" },
  na:        { chip: "noun / な-adj", rule: "add じゃない after the word" },
};
const CONJ_BANK = [
  // ① ichidan — drop る + ない
  { dict: "食べる", reading: "たべる", meaning: "eat", type: "ichidan", neg: "食べない", negR: "たべない", polite: "食べません / 食べないです", how: "食べ〼 + ない" },
  { dict: "始める", reading: "はじめる", meaning: "begin", type: "ichidan", neg: "始めない", negR: "はじめない", polite: "始めません / 始めないです", how: "始め〼 + ない" },
  { dict: "いる", reading: "いる", meaning: "exist; be (people/animals)", type: "ichidan", neg: "いない", negR: "いない", polite: "いません / いないです", how: "い〼 + ない" },
  { dict: "できる", reading: "できる", meaning: "can do", type: "ichidan", neg: "できない", negR: "できない", polite: "できません / できないです", how: "でき〼 + ない" },
  // ⑤ godan — last sound shifts to the あ row + ない
  { dict: "帰る", reading: "かえる", meaning: "return home", type: "godan", neg: "帰らない", negR: "かえらない", polite: "帰りません / 帰らないです", how: "る → ら + ない", note: "Trap! Ends in -eru but it's GODAN, not ichidan. 帰らない, never 帰ない." },
  { dict: "待つ", reading: "まつ", meaning: "wait", type: "godan", neg: "待たない", negR: "またない", polite: "待ちません / 待たないです", how: "つ → た + ない" },
  { dict: "飲む", reading: "のむ", meaning: "drink", type: "godan", neg: "飲まない", negR: "のまない", polite: "飲みません / 飲まないです", how: "む → ま + ない" },
  { dict: "読む", reading: "よむ", meaning: "read", type: "godan", neg: "読まない", negR: "よまない", polite: "読みません / 読まないです", how: "む → ま + ない" },
  { dict: "行く", reading: "いく", meaning: "go", type: "godan", neg: "行かない", negR: "いかない", polite: "行きません / 行かないです", how: "く → か + ない" },
  { dict: "書く", reading: "かく", meaning: "write", type: "godan", neg: "書かない", negR: "かかない", polite: "書きません / 書かないです", how: "く → か + ない" },
  { dict: "わかる", reading: "わかる", meaning: "understand", type: "godan", neg: "わからない", negR: "わからない", polite: "わかりません / わからないです", how: "る → ら + ない" },
  { dict: "終わる", reading: "おわる", meaning: "end; finish", type: "godan", neg: "終わらない", negR: "おわらない", polite: "終わりません / 終わらないです", how: "る → ら + ない" },
  { dict: "頑張る", reading: "がんばる", meaning: "do one's best", type: "godan", neg: "頑張らない", negR: "がんばらない", polite: "頑張りません / 頑張らないです", how: "る → ら + ない" },
  // irregular
  { dict: "する", reading: "する", meaning: "do", type: "irregular", neg: "しない", negR: "しない", polite: "しません / しないです", how: "する → しない" },
  { dict: "来る", reading: "くる", meaning: "come", type: "irregular", neg: "来ない", negR: "こない", polite: "来ません(きません) / 来ないです(こないです)", how: "くる → こない", note: "The reading changes: くる → こない. Kanji stays 来." },
  { dict: "ある", reading: "ある", meaning: "exist; have (things)", type: "irregular", neg: "ない", negR: "ない", polite: "ありません / ないです", how: "ある → ない", note: "Trap! NOT あらない. The negative of ある is just ない." },
  // い-adjectives — drop い + くない
  { dict: "高い", reading: "たかい", meaning: "expensive; tall", type: "iadj", neg: "高くない", negR: "たかくない", polite: "高くないです", how: "高〜 + くない" },
  { dict: "安い", reading: "やすい", meaning: "cheap", type: "iadj", neg: "安くない", negR: "やすくない", polite: "安くないです", how: "安〜 + くない" },
  { dict: "大きい", reading: "おおきい", meaning: "big", type: "iadj", neg: "大きくない", negR: "おおきくない", polite: "大きくないです", how: "大き〜 + くない" },
  { dict: "小さい", reading: "ちいさい", meaning: "small", type: "iadj", neg: "小さくない", negR: "ちいさくない", polite: "小さくないです", how: "小さ〜 + くない" },
  { dict: "遠い", reading: "とおい", meaning: "far", type: "iadj", neg: "遠くない", negR: "とおくない", polite: "遠くないです", how: "遠〜 + くない" },
  { dict: "近い", reading: "ちかい", meaning: "close; near", type: "iadj", neg: "近くない", negR: "ちかくない", polite: "近くないです", how: "近〜 + くない" },
  { dict: "難しい", reading: "むずかしい", meaning: "difficult", type: "iadj", neg: "難しくない", negR: "むずかしくない", polite: "難しくないです", how: "難し〜 + くない" },
  { dict: "忙しい", reading: "いそがしい", meaning: "busy", type: "iadj", neg: "忙しくない", negR: "いそがしくない", polite: "忙しくないです", how: "忙し〜 + くない" },
  { dict: "おいしい", reading: "おいしい", meaning: "delicious", type: "iadj", neg: "おいしくない", negR: "おいしくない", polite: "おいしくないです", how: "おいし〜 + くない" },
  { dict: "おもしろい", reading: "おもしろい", meaning: "interesting", type: "iadj", neg: "おもしろくない", negR: "おもしろくない", polite: "おもしろくないです", how: "おもしろ〜 + くない" },
  { dict: "いい", reading: "いい", meaning: "good", type: "iadj", neg: "よくない", negR: "よくない", polite: "よくないです", how: "いい → よくない", note: "Trap! いい conjugates from its old form よい, so the negative is よくない, never いくない." },
  // nouns / な-adjectives — + じゃない
  { dict: "好き", reading: "すき", meaning: "liked; likable", type: "na", neg: "好きじゃない", negR: "すきじゃない", polite: "好きじゃないです", how: "好き + じゃない" },
  { dict: "大丈夫", reading: "だいじょうぶ", meaning: "okay; fine", type: "na", neg: "大丈夫じゃない", negR: "だいじょうぶじゃない", polite: "大丈夫じゃないです", how: "大丈夫 + じゃない" },
  { dict: "きれい", reading: "きれい", meaning: "pretty; clean", type: "na", neg: "きれいじゃない", negR: "きれいじゃない", polite: "きれいじゃないです", how: "きれい + じゃない", note: "Trap! Ends in い but it's a な-adjective. きれいじゃない, never きれくない." },
  { dict: "病気", reading: "びょうき", meaning: "sick (noun)", type: "na", neg: "病気じゃない", negR: "びょうきじゃない", polite: "病気じゃないです", how: "病気 + じゃない" },
  { dict: "先生", reading: "せんせい", meaning: "teacher (noun)", type: "na", neg: "先生じゃない", negR: "せんせいじゃない", polite: "先生じゃないです", how: "先生 + じゃない" },
  { dict: "休み", reading: "やすみ", meaning: "day off (noun)", type: "na", neg: "休みじゃない", negR: "やすみじゃない", polite: "休みじゃないです", how: "休み + じゃない" },
];
const CONJ_FILTERS = [["all", "All"], ["ichidan", "① る"], ["godan", "⑤ う"], ["irregular", "Irreg"], ["iadj", "い-adj"], ["na", "Noun/な"]];

function ConjDrill() {
  const [filter, setFilter] = useState("all");
  const [polite, setPolite] = useState(false);   // ask for plain or polite negative
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [right, setRight] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);

  const pool = useMemo(
    () => (filter === "all" ? CONJ_BANK : CONJ_BANK.filter((w) => w.type === filter)),
    [filter]
  );

  const start = useCallback(() => {
    const q = [...pool].sort(() => Math.random() - 0.5);
    setQueue(q); setPos(0); setFlipped(false);
    setRight(0); setTotal(0); setStreak(0); setBest(0);
    setRunning(true);
  }, [pool]);

  const grade = (ok) => {
    setTotal((t) => t + 1);
    if (ok) {
      setRight((r) => r + 1);
      setStreak((s) => { const n = s + 1; setBest((b) => Math.max(b, n)); return n; });
    } else {
      setStreak(0);
      // missed → re-drill it near the end of the queue
      setQueue((q) => [...q, q[pos]]);
    }
    setFlipped(false);
    setPos((p) => p + 1);
  };

  if (!running) {
    return (
      <div className="tc-conj">
        <div className="tc-conjintro">
          <h2 className="tc-conjtitle">Negative form drill</h2>
          <p className="tc-conjsub">See a word, say its negative out loud, flip, and grade yourself.
            ① ichidan: drop る + ない · ⑤ godan: shift to the あ row + ない ·
            い-adj: 〜くない · noun/な-adj: 〜じゃない</p>
          <div className="tc-conjchips" role="group" aria-label="Word type filter">
            {CONJ_FILTERS.map(([id, label]) => (
              <button key={id} className={"tc-conjchip" + (filter === id ? " is-on" : "")}
                onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          <button className={"tc-rpill tc-conjmode" + (polite ? " is-on" : "")} aria-pressed={polite}
            onClick={() => setPolite((v) => !v)}>
            {polite ? "Polite negative (〜ません / ないです)" : "Plain negative (〜ない)"}
          </button>
          <button className="tc-btn tc-btn-wide" onClick={start}>Start · {pool.length} words</button>
        </div>
      </div>
    );
  }

  if (pos >= queue.length) {
    const pct = total ? Math.round((right / total) * 100) : 0;
    return (
      <div className="tc-summary">
        <h2>ドリル終了！</h2>
        <div className="tc-sumgrid">
          <div className="tc-sumitem"><b>{pct}%</b><span>accuracy</span></div>
          <div className="tc-sumitem"><b>{right}/{total}</b><span>correct</span></div>
          <div className="tc-sumitem"><b>{best}</b><span>best streak</span></div>
        </div>
        <div className="tc-gradebtns">
          <button className="tc-btn" onClick={start}>Go again</button>
          <button className="tc-btn" onClick={() => setRunning(false)}>Change setup</button>
        </div>
      </div>
    );
  }

  const w = queue[pos];
  const meta = CONJ_TYPES[w.type];
  return (
    <div className="tc-conj">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${(pos / queue.length) * 100}%` }} /></div>
        <span className="tc-progtext">{pos + 1} / {queue.length} · 🔥 {streak}</span>
      </div>

      <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={() => setFlipped((f) => !f)}
           role="button" tabIndex={0} aria-label="Conjugation card, click to flip">
        <div className="tc-card-inner">
          <div className="tc-face tc-front">
            <span className="tc-kindchip">{meta.chip}</span>
            <div className="tc-term">{w.dict}</div>
            <div className="tc-reading-front">{w.reading} · {w.meaning}</div>
            <div className="tc-conjask">{polite ? "→ polite negative?" : "→ plain negative?"}</div>
            <span className="tc-flipcue">tap to flip</span>
          </div>
          <div className="tc-face tc-back">
            <div className="tc-conjanswer">{polite ? w.polite : w.neg} <SpeakBtn text={polite ? w.polite.split(" / ")[0] : w.negR || w.neg} /></div>
            {!polite && w.negR !== w.neg && <div className="tc-romaji">{w.negR}</div>}
            <div className="tc-conjhow">{w.how}</div>
            <div className="tc-conjrule">{meta.rule}</div>
            {w.note && <p className="tc-conjnote">⚠️ {w.note}</p>}
          </div>
        </div>
      </div>

      <div className="tc-grade">
        {!flipped ? (
          <button type="button" className="tc-btn tc-btn-wide" onClick={(e) => { e.stopPropagation(); setFlipped(true); }}>Reveal answer</button>
        ) : (
          <>
            <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
            <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── FREQ 10K ───────────────────────────
   Long-game deck: high-frequency everyday words, drilled with a daily
   new-word quota + SRS, separate from the class deck. Tier 1 below;
   later tiers get appended with FREQ_VERSION bumped. Every review
   stores seen/correct/level/ease AND think-time (ms before reveal). */
const FREQ_KEY = "jpn101:freq", FREQ_VER_KEY = "jpn101:freqVersion", FREQ_QUOTA_KEY = "jpn101:freqQuota";
const FREQ_VERSION = 1;
const FREQ_SEED = [
  // ── Tier 1 · core verbs ──
  { term: "言う", reading: "いう", romaji: "iu", meaning: "say; tell", kind: "kanji", emoji: "🗣️" },
  { term: "思う", reading: "おもう", romaji: "omou", meaning: "think; feel", kind: "kanji", emoji: "💭" },
  { term: "見る", reading: "みる", romaji: "miru", meaning: "see; look; watch", kind: "kanji", emoji: "👀" },
  { term: "出る", reading: "でる", romaji: "deru", meaning: "go out; leave; appear", kind: "kanji", emoji: "🚪" },
  { term: "入る", reading: "はいる", romaji: "hairu", meaning: "enter; go in", kind: "kanji", emoji: "➡️" },
  { term: "聞く", reading: "きく", romaji: "kiku", meaning: "listen; hear; ask", kind: "kanji", emoji: "👂" },
  { term: "話す", reading: "はなす", romaji: "hanasu", meaning: "speak; talk", kind: "kanji", emoji: "💬" },
  { term: "持つ", reading: "もつ", romaji: "motsu", meaning: "hold; have; carry", kind: "kanji", emoji: "🤲" },
  { term: "使う", reading: "つかう", romaji: "tsukau", meaning: "use", kind: "kanji", emoji: "🔧" },
  { term: "作る", reading: "つくる", romaji: "tsukuru", meaning: "make; create", kind: "kanji", emoji: "🛠️" },
  { term: "知る", reading: "しる", romaji: "shiru", meaning: "know; learn of", kind: "kanji", emoji: "🧠" },
  { term: "考える", reading: "かんがえる", romaji: "kangaeru", meaning: "think about; consider", kind: "kanji", emoji: "🤔" },
  { term: "買う", reading: "かう", romaji: "kau", meaning: "buy", kind: "kanji", emoji: "🛒" },
  { term: "売る", reading: "うる", romaji: "uru", meaning: "sell", kind: "kanji", emoji: "🏷️" },
  { term: "会う", reading: "あう", romaji: "au", meaning: "meet (a person)", kind: "kanji", emoji: "🤝" },
  { term: "歩く", reading: "あるく", romaji: "aruku", meaning: "walk", kind: "kanji", emoji: "🚶" },
  { term: "走る", reading: "はしる", romaji: "hashiru", meaning: "run", kind: "kanji", emoji: "🏃" },
  { term: "立つ", reading: "たつ", romaji: "tatsu", meaning: "stand up", kind: "kanji", emoji: "🧍" },
  { term: "座る", reading: "すわる", romaji: "suwaru", meaning: "sit down", kind: "kanji", emoji: "🪑" },
  { term: "寝る", reading: "ねる", romaji: "neru", meaning: "sleep; go to bed", kind: "kanji", emoji: "😴" },
  { term: "起きる", reading: "おきる", romaji: "okiru", meaning: "wake up; get up", kind: "kanji", emoji: "⏰" },
  { term: "住む", reading: "すむ", romaji: "sumu", meaning: "live; reside", kind: "kanji", emoji: "🏡" },
  { term: "働く", reading: "はたらく", romaji: "hataraku", meaning: "work (labor)", kind: "kanji", emoji: "🏢" },
  { term: "遊ぶ", reading: "あそぶ", romaji: "asobu", meaning: "play; hang out", kind: "kanji", emoji: "🎮" },
  { term: "教える", reading: "おしえる", romaji: "oshieru", meaning: "teach; tell (info)", kind: "kanji", emoji: "👨‍🏫" },
  { term: "習う", reading: "ならう", romaji: "narau", meaning: "learn (from someone)", kind: "kanji", emoji: "🎓" },
  { term: "覚える", reading: "おぼえる", romaji: "oboeru", meaning: "memorize; remember", kind: "kanji", emoji: "🧩" },
  { term: "忘れる", reading: "わすれる", romaji: "wasureru", meaning: "forget", kind: "kanji", emoji: "🫥" },
  { term: "始まる", reading: "はじまる", romaji: "hajimaru", meaning: "(something) begins", kind: "kanji", emoji: "▶️" },
  { term: "開ける", reading: "あける", romaji: "akeru", meaning: "open (something)", kind: "kanji", emoji: "🔓" },
  { term: "閉める", reading: "しめる", romaji: "shimeru", meaning: "close (something)", kind: "kanji", emoji: "🔒" },
  { term: "取る", reading: "とる", romaji: "toru", meaning: "take; get", kind: "kanji", emoji: "✋" },
  { term: "置く", reading: "おく", romaji: "oku", meaning: "put; place", kind: "kanji", emoji: "📥" },
  { term: "もらう", reading: "もらう", romaji: "morau", meaning: "receive; get (from someone)", kind: "hiragana", emoji: "🎁" },
  { term: "あげる", reading: "あげる", romaji: "ageru", meaning: "give (to someone else)", kind: "hiragana", emoji: "🫴" },
  { term: "くれる", reading: "くれる", romaji: "kureru", meaning: "give (to me/us)", kind: "hiragana", emoji: "💝" },
  { term: "呼ぶ", reading: "よぶ", romaji: "yobu", meaning: "call; invite", kind: "kanji", emoji: "📢" },
  { term: "答える", reading: "こたえる", romaji: "kotaeru", meaning: "answer", kind: "kanji", emoji: "✅" },
  { term: "手伝う", reading: "てつだう", romaji: "tetsudau", meaning: "help; assist", kind: "kanji", emoji: "🤗" },
  { term: "貸す", reading: "かす", romaji: "kasu", meaning: "lend", kind: "kanji", emoji: "📤" },
  { term: "借りる", reading: "かりる", romaji: "kariru", meaning: "borrow", kind: "kanji", emoji: "🙏" },
  { term: "送る", reading: "おくる", romaji: "okuru", meaning: "send; see someone off", kind: "kanji", emoji: "📮" },
  { term: "着る", reading: "きる", romaji: "kiru", meaning: "wear (upper body)", kind: "kanji", emoji: "👕" },
  { term: "洗う", reading: "あらう", romaji: "arau", meaning: "wash", kind: "kanji", emoji: "🧼" },
  { term: "泳ぐ", reading: "およぐ", romaji: "oyogu", meaning: "swim", kind: "kanji", emoji: "🏊" },
  { term: "歌う", reading: "うたう", romaji: "utau", meaning: "sing", kind: "kanji", emoji: "🎤" },
  { term: "死ぬ", reading: "しぬ", romaji: "shinu", meaning: "die", kind: "kanji", emoji: "💀" },
  // ── Tier 1 · core nouns ──
  { term: "人", reading: "ひと", romaji: "hito", meaning: "person", kind: "kanji", emoji: "🧑" },
  { term: "時間", reading: "じかん", romaji: "jikan", meaning: "time; hour(s)", kind: "kanji", emoji: "⏳" },
  { term: "日", reading: "ひ", romaji: "hi", meaning: "day; sun", kind: "kanji", emoji: "☀️" },
  { term: "年", reading: "とし", romaji: "toshi", meaning: "year; age", kind: "kanji", emoji: "📆" },
  { term: "月", reading: "つき", romaji: "tsuki", meaning: "moon; month", kind: "kanji", emoji: "🌙" },
  { term: "週", reading: "しゅう", romaji: "shū", meaning: "week", kind: "kanji", emoji: "🗓️" },
  { term: "手", reading: "て", romaji: "te", meaning: "hand", kind: "kanji", emoji: "🖐️" },
  { term: "目", reading: "め", romaji: "me", meaning: "eye", kind: "kanji", emoji: "👁️" },
  { term: "口", reading: "くち", romaji: "kuchi", meaning: "mouth", kind: "kanji", emoji: "👄" },
  { term: "耳", reading: "みみ", romaji: "mimi", meaning: "ear", kind: "kanji", emoji: "👂" },
  { term: "足", reading: "あし", romaji: "ashi", meaning: "foot; leg", kind: "kanji", emoji: "🦶" },
  { term: "頭", reading: "あたま", romaji: "atama", meaning: "head", kind: "kanji", emoji: "🗣" },
  { term: "心", reading: "こころ", romaji: "kokoro", meaning: "heart; mind", kind: "kanji", emoji: "❤️" },
  { term: "体", reading: "からだ", romaji: "karada", meaning: "body", kind: "kanji", emoji: "🫁" },
  { term: "水", reading: "みず", romaji: "mizu", meaning: "water", kind: "kanji", emoji: "💧" },
  { term: "お金", reading: "おかね", romaji: "okane", meaning: "money", kind: "kanji", emoji: "💰" },
  { term: "車", reading: "くるま", romaji: "kuruma", meaning: "car", kind: "kanji", emoji: "🚗" },
  { term: "電車", reading: "でんしゃ", romaji: "densha", meaning: "train", kind: "kanji", emoji: "🚃" },
  { term: "道", reading: "みち", romaji: "michi", meaning: "road; way", kind: "kanji", emoji: "🛣️" },
  { term: "店", reading: "みせ", romaji: "mise", meaning: "shop; store", kind: "kanji", emoji: "🏪" },
  { term: "国", reading: "くに", romaji: "kuni", meaning: "country", kind: "kanji", emoji: "🌏" },
  { term: "言葉", reading: "ことば", romaji: "kotoba", meaning: "word; language", kind: "kanji", emoji: "🔤" },
  { term: "名前", reading: "なまえ", romaji: "namae", meaning: "name", kind: "kanji", emoji: "📛" },
  { term: "友達", reading: "ともだち", romaji: "tomodachi", meaning: "friend", kind: "kanji", emoji: "👯" },
  { term: "家族", reading: "かぞく", romaji: "kazoku", meaning: "family", kind: "kanji", emoji: "👨‍👩‍👧‍👦" },
  { term: "父", reading: "ちち", romaji: "chichi", meaning: "father (my)", kind: "kanji", emoji: "👨" },
  { term: "母", reading: "はは", romaji: "haha", meaning: "mother (my)", kind: "kanji", emoji: "👩" },
  { term: "子供", reading: "こども", romaji: "kodomo", meaning: "child", kind: "kanji", emoji: "🧒" },
  { term: "男", reading: "おとこ", romaji: "otoko", meaning: "man; male", kind: "kanji", emoji: "🚹" },
  { term: "女", reading: "おんな", romaji: "onna", meaning: "woman; female", kind: "kanji", emoji: "🚺" },
  { term: "朝", reading: "あさ", romaji: "asa", meaning: "morning", kind: "kanji", emoji: "🌅" },
  { term: "昼", reading: "ひる", romaji: "hiru", meaning: "noon; daytime", kind: "kanji", emoji: "🕛" },
  { term: "夜", reading: "よる", romaji: "yoru", meaning: "night", kind: "kanji", emoji: "🌃" },
  { term: "天気", reading: "てんき", romaji: "tenki", meaning: "weather", kind: "kanji", emoji: "⛅" },
  { term: "雨", reading: "あめ", romaji: "ame", meaning: "rain", kind: "kanji", emoji: "🌧️" },
  { term: "雪", reading: "ゆき", romaji: "yuki", meaning: "snow", kind: "kanji", emoji: "❄️" },
  { term: "風", reading: "かぜ", romaji: "kaze", meaning: "wind", kind: "kanji", emoji: "🌬️" },
  { term: "空", reading: "そら", romaji: "sora", meaning: "sky", kind: "kanji", emoji: "🌌" },
  { term: "海", reading: "うみ", romaji: "umi", meaning: "sea; ocean", kind: "kanji", emoji: "🌊" },
  { term: "山", reading: "やま", romaji: "yama", meaning: "mountain", kind: "kanji", emoji: "⛰️" },
  { term: "川", reading: "かわ", romaji: "kawa", meaning: "river", kind: "kanji", emoji: "🏞️" },
  { term: "花", reading: "はな", romaji: "hana", meaning: "flower", kind: "kanji", emoji: "🌸" },
  { term: "音楽", reading: "おんがく", romaji: "ongaku", meaning: "music", kind: "kanji", emoji: "🎵" },
  { term: "映画", reading: "えいが", romaji: "eiga", meaning: "movie", kind: "kanji", emoji: "🎬" },
  { term: "写真", reading: "しゃしん", romaji: "shashin", meaning: "photo", kind: "kanji", emoji: "📷" },
  { term: "部屋", reading: "へや", romaji: "heya", meaning: "room", kind: "kanji", emoji: "🚪" },
  { term: "世界", reading: "せかい", romaji: "sekai", meaning: "world", kind: "kanji", emoji: "🌍" },
  { term: "問題", reading: "もんだい", romaji: "mondai", meaning: "problem; question", kind: "kanji", emoji: "⚠️" },
  { term: "意味", reading: "いみ", romaji: "imi", meaning: "meaning", kind: "kanji", emoji: "🔍" },
  { term: "病院", reading: "びょういん", romaji: "byōin", meaning: "hospital", kind: "kanji", emoji: "🏥" },
  { term: "質問", reading: "しつもん", romaji: "shitsumon", meaning: "question", kind: "kanji", emoji: "❓" },
  { term: "答え", reading: "こたえ", romaji: "kotae", meaning: "answer (noun)", kind: "kanji", emoji: "💡" },
  // ── Tier 1 · adjectives ──
  { term: "新しい", reading: "あたらしい", romaji: "atarashii", meaning: "new", kind: "kanji", emoji: "✨" },
  { term: "古い", reading: "ふるい", romaji: "furui", meaning: "old (things)", kind: "kanji", emoji: "🏚️" },
  { term: "多い", reading: "おおい", romaji: "ōi", meaning: "many; much", kind: "kanji", emoji: "📈" },
  { term: "少ない", reading: "すくない", romaji: "sukunai", meaning: "few; little", kind: "kanji", emoji: "📉" },
  { term: "速い", reading: "はやい", romaji: "hayai", meaning: "fast (speed)", kind: "kanji", emoji: "⚡" },
  { term: "早い", reading: "はやい", romaji: "hayai", meaning: "early (time)", kind: "kanji", emoji: "🌄" },
  { term: "遅い", reading: "おそい", romaji: "osoi", meaning: "slow; late", kind: "kanji", emoji: "🐢" },
  { term: "長い", reading: "ながい", romaji: "nagai", meaning: "long", kind: "kanji", emoji: "📏" },
  { term: "短い", reading: "みじかい", romaji: "mijikai", meaning: "short (length)", kind: "kanji", emoji: "✂️" },
  { term: "強い", reading: "つよい", romaji: "tsuyoi", meaning: "strong", kind: "kanji", emoji: "💪" },
  { term: "弱い", reading: "よわい", romaji: "yowai", meaning: "weak", kind: "kanji", emoji: "🍂" },
  { term: "暑い", reading: "あつい", romaji: "atsui", meaning: "hot (weather)", kind: "kanji", emoji: "🥵" },
  { term: "寒い", reading: "さむい", romaji: "samui", meaning: "cold (weather)", kind: "kanji", emoji: "🥶" },
  { term: "熱い", reading: "あつい", romaji: "atsui", meaning: "hot (to the touch)", kind: "kanji", emoji: "♨️" },
  { term: "冷たい", reading: "つめたい", romaji: "tsumetai", meaning: "cold (to the touch)", kind: "kanji", emoji: "🧊" },
  { term: "白い", reading: "しろい", romaji: "shiroi", meaning: "white", kind: "kanji", emoji: "⬜" },
  { term: "黒い", reading: "くろい", romaji: "kuroi", meaning: "black", kind: "kanji", emoji: "⬛" },
  { term: "赤い", reading: "あかい", romaji: "akai", meaning: "red", kind: "kanji", emoji: "🟥" },
  { term: "青い", reading: "あおい", romaji: "aoi", meaning: "blue", kind: "kanji", emoji: "🟦" },
  { term: "楽しい", reading: "たのしい", romaji: "tanoshii", meaning: "fun; enjoyable", kind: "kanji", emoji: "🎉" },
  { term: "悲しい", reading: "かなしい", romaji: "kanashii", meaning: "sad", kind: "kanji", emoji: "😢" },
  { term: "嬉しい", reading: "うれしい", romaji: "ureshii", meaning: "happy; glad", kind: "kanji", emoji: "😊" },
  { term: "怖い", reading: "こわい", romaji: "kowai", meaning: "scary", kind: "kanji", emoji: "😱" },
  { term: "痛い", reading: "いたい", romaji: "itai", meaning: "painful; ouch", kind: "kanji", emoji: "🤕" },
  { term: "甘い", reading: "あまい", romaji: "amai", meaning: "sweet", kind: "kanji", emoji: "🍬" },
  { term: "辛い", reading: "からい", romaji: "karai", meaning: "spicy", kind: "kanji", emoji: "🌶️" },
  { term: "元気", reading: "げんき", romaji: "genki", meaning: "healthy; energetic (な)", kind: "kanji", emoji: "😄" },
  { term: "大切", reading: "たいせつ", romaji: "taisetsu", meaning: "important; precious (な)", kind: "kanji", emoji: "💎" },
  { term: "大変", reading: "たいへん", romaji: "taihen", meaning: "tough; a big deal (な)", kind: "kanji", emoji: "😮‍💨" },
  { term: "便利", reading: "べんり", romaji: "benri", meaning: "convenient (な)", kind: "kanji", emoji: "🧰" },
  { term: "有名", reading: "ゆうめい", romaji: "yūmei", meaning: "famous (な)", kind: "kanji", emoji: "🌟" },
  { term: "簡単", reading: "かんたん", romaji: "kantan", meaning: "easy; simple (な)", kind: "kanji", emoji: "👌" },
  { term: "静か", reading: "しずか", romaji: "shizuka", meaning: "quiet (な)", kind: "kanji", emoji: "🤫" },
  // ── Tier 1 · adverbs & glue ──
  { term: "たくさん", reading: "たくさん", romaji: "takusan", meaning: "a lot; many", kind: "hiragana", emoji: "🗻" },
  { term: "少し", reading: "すこし", romaji: "sukoshi", meaning: "a little", kind: "kanji", emoji: "🤏" },
  { term: "もっと", reading: "もっと", romaji: "motto", meaning: "more", kind: "hiragana", emoji: "➕" },
  { term: "いつも", reading: "いつも", romaji: "itsumo", meaning: "always", kind: "hiragana", emoji: "🔄" },
  { term: "時々", reading: "ときどき", romaji: "tokidoki", meaning: "sometimes", kind: "kanji", emoji: "🎲" },
  { term: "まだ", reading: "まだ", romaji: "mada", meaning: "still; not yet", kind: "hiragana", emoji: "⏸️" },
  { term: "もう", reading: "もう", romaji: "mō", meaning: "already; anymore", kind: "hiragana", emoji: "🏁" },
  { term: "全部", reading: "ぜんぶ", romaji: "zenbu", meaning: "all; everything", kind: "kanji", emoji: "💯" },
  { term: "本当に", reading: "ほんとうに", romaji: "hontō ni", meaning: "really; truly", kind: "kanji", emoji: "🙌" },
  { term: "多分", reading: "たぶん", romaji: "tabun", meaning: "probably; maybe", kind: "kanji", emoji: "🤷" },
  { term: "一緒に", reading: "いっしょに", romaji: "issho ni", meaning: "together", kind: "kanji", emoji: "👥" },
  { term: "ゆっくり", reading: "ゆっくり", romaji: "yukkuri", meaning: "slowly; leisurely", kind: "hiragana", emoji: "🐌" },
  { term: "すぐ", reading: "すぐ", romaji: "sugu", meaning: "right away; soon", kind: "hiragana", emoji: "🚀" },
  { term: "だから", reading: "だから", romaji: "dakara", meaning: "so; therefore", kind: "hiragana", emoji: "🧭" },
  { term: "でも", reading: "でも", romaji: "demo", meaning: "but; however", kind: "hiragana", emoji: "↩️" },
  { term: "それから", reading: "それから", romaji: "sorekara", meaning: "and then; after that", kind: "hiragana", emoji: "⏭️" },
].map((c, i) => ({ ...c, rank: i + 1, tier: 1 }));

function fmtIn(ms) {
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60000);
  if (m < 60) return "in ~" + Math.max(1, m) + "m";
  const h = Math.round(m / 60);
  if (h < 48) return "in ~" + h + "h";
  return "in ~" + Math.round(h / 24) + "d";
}

function Freq() {
  const [deck, setDeck] = useState(null);
  const [quota, setQuota] = useState(15);
  const [todayNew, setTodayNew] = useState(0);
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [running, setRunning] = useState(false);
  const [right, setRight] = useState(0);
  const [total, setTotal] = useState(0);
  const missRef = useRef({});
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, running]);
  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
      return !f;
    });
  }, []);

  // load + seed/merge, quota, and today's new-word count
  useEffect(() => {
    (async () => {
      let list = null;
      try { const r = await sGet(FREQ_KEY); list = r ? JSON.parse(r) : null; } catch (e) { list = null; }
      let ver = 0;
      try { const v = await sGet(FREQ_VER_KEY); ver = v ? Number(v) : 0; } catch (e) {}
      if (!list) {
        list = FREQ_SEED.map((c) => ({ id: uid(), seen: 0, correct: 0, ms: 0, msN: 0, ...c }));
        await sSet(FREQ_KEY, JSON.stringify(list)); await sSet(FREQ_VER_KEY, String(FREQ_VERSION));
      } else if (ver < FREQ_VERSION) {
        try { await sSet("jpn101:freqSnapshot", JSON.stringify({ date: new Date().toISOString(), note: "auto-snapshot before tier merge", freq: list })); } catch (e) {}
        const have = new Set(list.map((c) => c.term));
        FREQ_SEED.forEach((s) => { if (!have.has(s.term)) { list.push({ id: uid(), seen: 0, correct: 0, ms: 0, msN: 0, ...s }); have.add(s.term); } });
        await sSet(FREQ_KEY, JSON.stringify(list)); await sSet(FREQ_VER_KEY, String(FREQ_VERSION));
      }
      setDeck(list);
      try { const q = await sGet(FREQ_QUOTA_KEY); if (q) setQuota(Number(q) || 15); } catch (e) {}
      const days = await loadDays();
      const today = days[new Date().toISOString().slice(0, 10)];
      setTodayNew(today ? today.fnew || 0 : 0);
    })();
  }, []);

  const persist = useCallback((next) => { setDeck(next); sSet(FREQ_KEY, JSON.stringify(next)); }, []);
  const setQ = (n) => { setQuota(n); sSet(FREQ_QUOTA_KEY, String(n)); };

  const stats = useMemo(() => {
    if (!deck) return null;
    const now = Date.now();
    const studied = deck.filter((c) => (c.seen || 0) > 0);
    let nextIn = null;
    if (studied.length) nextIn = Math.min(...studied.map((c) => (c.last || 0) + REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1) - now));
    return {
      total: deck.length,
      learned: studied.length,
      mastered: deck.filter((c) => (c.level || 0) >= 4).length,
      due: studied.filter((c) => dueness(c, now) >= 1).length,
      fresh: deck.length - studied.length,
      nextIn,
    };
  }, [deck]);

  const freeStart = useCallback(() => {
    if (!deck) return;
    const now = Date.now();
    const pool = deck.filter((c) => (c.seen || 0) > 0)
      .sort((a, b) => needScore(b, now) - needScore(a, now)).slice(0, 20);
    if (!pool.length) return;
    missRef.current = {};
    setQueue(pool); setPos(0); setFlipped(false); setRight(0); setTotal(0); setRunning(true);
  }, [deck]);

  const start = useCallback(() => {
    if (!deck) return;
    const now = Date.now();
    const due = deck.filter((c) => (c.seen || 0) > 0 && dueness(c, now) >= 1)
      .sort((a, b) => needScore(b, now) - needScore(a, now)).slice(0, 30);
    const allowance = Math.max(0, quota - todayNew);
    const fresh = deck.filter((c) => !((c.seen || 0) > 0)).sort((a, b) => a.rank - b.rank).slice(0, allowance);
    const pool = [...due, ...fresh];
    if (!pool.length) return;
    missRef.current = {};
    setQueue(pool); setPos(0); setFlipped(false); setRight(0); setTotal(0); setRunning(true);
  }, [deck, quota, todayNew]);

  const grade = useCallback((got) => {
    const c = queue[pos];
    if (!c) return;
    const t = thinkRef.current && thinkRef.current > 250 && thinkRef.current < 180000 ? Math.round(thinkRef.current) : 0;
    const wasNew = (c.seen || 0) === 0 && !missRef.current[c.id];
    if (wasNew) setTodayNew((n) => n + 1);
    logDay({ ok: got, ms: t, deck: "freq", fnew: wasNew });
    const next = deck.map((x) => {
      if (x.id !== c.id) return x;
      const ease = Math.max(0.55, Math.min(1.8, (x.ease || 1) + (got ? 0.05 : -0.15)));
      return {
        ...x, ease, last: Date.now(),
        streak: got ? (x.streak || 0) + 1 : 0,
        seen: (x.seen || 0) + 1,
        correct: (x.correct || 0) + (got ? 1 : 0),
        ms: (x.ms || 0) + t, msN: (x.msN || 0) + (t ? 1 : 0),
        level: got ? Math.min(5, (x.level || 0) + 1) : Math.max(0, (x.level || 0) - 2),
      };
    });
    persist(next);
    setTotal((n) => n + 1);
    if (got) setRight((n) => n + 1);
    else {
      const m = (missRef.current[c.id] || 0) + 1;
      missRef.current[c.id] = m;
      if (m <= 3) setQueue((q) => { const nq = q.slice(); nq.splice(Math.min(pos + 4, nq.length), 0, { ...c, seen: 1 }); return nq; });
    }
    setFlipped(false);
    setPos((p) => p + 1);
  }, [queue, pos, deck, persist]);

  if (!deck || !stats) return <div className="tc-empty">Loading the 10k deck…</div>;

  if (!running) {
    const newLeft = Math.max(0, quota - todayNew);
    const doneToday = stats.due === 0 && (newLeft === 0 || stats.fresh === 0);
    return (
      <div className="tc-conj">
        <div className="tc-hero">
          <div className="tc-heronum">{stats.due + Math.min(newLeft, stats.fresh)}</div>
          <p className="tc-herolabel">in today's session</p>
          <p className="tc-herosub">{stats.due} due · {Math.min(newLeft, stats.fresh)} new ({todayNew}/{quota} new done today)
            {stats.due === 0 && stats.nextIn != null && stats.nextIn > 0 ? ` · next reviews ${fmtIn(stats.nextIn)}` : ""}</p>
        </div>
        <div className="tc-conjintro">
          <h2 className="tc-conjtitle">Frequency 10k · Tier 1</h2>
          <p className="tc-conjsub">The long game: highest-frequency everyday words at a fixed daily intake.
            {" "}{stats.learned}/{stats.total} started · {stats.mastered} mastered · {stats.fresh} untouched.
            Every review is logged: result, streak, level, and think time.</p>
          <div className="tc-conjchips" role="group" aria-label="Daily new-word quota">
            {[10, 15, 20].map((n) => (
              <button key={n} className={"tc-conjchip" + (quota === n ? " is-on" : "")} onClick={() => setQ(n)}>{n} new/day</button>
            ))}
          </div>
          <button className="tc-btn tc-btn-wide tc-btn-primary" onClick={start} disabled={doneToday}>
            {doneToday ? "Quota done for today ✓" : "Start session"}
          </button>
          {stats.learned > 0 && (
            <button className="tc-btn tc-btn-wide" onClick={freeStart}>
              Extra practice · weakest {Math.min(20, stats.learned)}
            </button>
          )}
          {doneToday && <p className="tc-conjsub">The daily quota keeps tomorrow's review pile sane, but extra practice is always open — it drills your weakest studied words without touching the quota, and every rep still counts toward your stats.</p>}
        </div>
      </div>
    );
  }

  if (pos >= queue.length) {
    const pct = total ? Math.round((right / total) * 100) : 0;
    return (
      <div className="tc-summary">
        <h2>セッション終了！</h2>
        <div className="tc-sumgrid">
          <div className="tc-sumitem"><b>{pct}%</b><span>accuracy</span></div>
          <div className="tc-sumitem"><b>{right}/{total}</b><span>correct</span></div>
          <div className="tc-sumitem"><b>{todayNew}/{quota}</b><span>new today</span></div>
        </div>
        <div className="tc-gradebtns">
          <button className="tc-btn" onClick={() => { setRunning(false); }}>Back</button>
          <button className="tc-btn" onClick={freeStart}>Extra practice</button>
        </div>
      </div>
    );
  }

  const card = queue[pos];
  return (
    <div className="tc-conj">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${(pos / queue.length) * 100}%` }} /></div>
        <span className="tc-progtext">{pos + 1} / {queue.length}</span>
      </div>
      <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={flip}
           role="button" tabIndex={0} aria-label="Flashcard, click to flip">
        <div className="tc-card-inner">
          <div className="tc-face tc-front">
            <span className="tc-kindchip">#{card.rank} · {KIND_LABEL[card.kind] || ""}</span>
            <div className="tc-term">{card.term}</div>
            <div className="tc-reading-front">{card.reading} <SpeakBtn text={card.reading || card.term} /></div>
            {(card.seen || 0) === 0 && <div className="tc-conjask">new word</div>}
            <span className="tc-flipcue">tap to flip</span>
          </div>
          <div className="tc-face tc-back">
            {card.emoji && <div className="tc-emoji">{card.emoji}</div>}
            <div className="tc-meaning tc-meaning-lg">{card.meaning}</div>
            <div className="tc-romaji">{card.romaji} <SpeakBtn text={card.reading || card.term} /></div>
            {(card.msN || 0) > 0 && <span className="tc-timetag">⏱ avg think {(card.ms / card.msN / 1000).toFixed(1)}s · seen {card.seen}× · {Math.round(((card.correct || 0) / card.seen) * 100)}%</span>}
          </div>
        </div>
      </div>
      <div className="tc-grade">
        {!flipped ? (
          <button type="button" className="tc-btn tc-btn-wide" onClick={(e) => { e.stopPropagation(); flip(); }}>Reveal answer</button>
        ) : (
          <>
            <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
            <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
html,body{margin:0;padding:0;background:#0c1122;}
html{height:100%;}
body{min-height:100%;overscroll-behavior-y:none;}
.tc-root{
  --ai:#1f2d54; --ai-deep:#16203c; --shu:#d8482f; --shu-soft:#e06848;
  --sumi:#26221d; --washi:#f2ecde; --washi-2:#ece4d2; --line:#d8cdb4;
  --mut:#7d7361; --mut-2:#9aa3bd; --violet:#7c5cff;
  --mono:ui-monospace,"SF Mono","Roboto Mono","JetBrains Mono",Menlo,monospace;
  --r-s:9px; --r-m:12px; --tap:46px;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility;
  font-variant-numeric:tabular-nums;
  color:var(--washi);
  background:
    radial-gradient(90% 60% at 18% -8%, rgba(64,84,168,.55) 0%, rgba(64,84,168,0) 60%),
    radial-gradient(70% 50% at 88% 4%, rgba(124,92,255,.28) 0%, rgba(124,92,255,0) 62%),
    radial-gradient(90% 55% at 50% 112%, rgba(216,72,47,.20) 0%, rgba(216,72,47,0) 60%),
    linear-gradient(180deg, #17203f 0%, #10162c 55%, #0c1122 100%);
  position:relative;
  min-height:100vh; padding:22px 16px 44px; box-sizing:border-box;
}
.tc-jp{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP",Meiryo,sans-serif;}
.tc-shell{max-width:660px;margin:0 auto;}

.tc-head{display:flex;flex-direction:column;gap:18px;margin-bottom:22px;}
.tc-brandblock{display:flex;align-items:center;gap:14px;}
.tc-seal{
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",serif;
  display:grid;place-items:center;width:46px;height:46px;flex:none;
  background:var(--shu);color:var(--washi);border-radius:7px;font-size:24px;font-weight:700;
  box-shadow:0 2px 0 rgba(0,0,0,.25), inset 0 0 0 2px rgba(255,255,255,.14);
  transform:rotate(-3deg);
}
.tc-wordmark{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  margin:0;font-size:30px;letter-spacing:.06em;line-height:1;color:#fff;}
.tc-sub{margin:5px 0 0;font-size:12.5px;letter-spacing:.04em;color:var(--mut-2);text-transform:lowercase;}
.tc-count{color:var(--shu-soft);font-weight:600;}

.tc-tabs{display:flex;gap:4px;background:rgba(255,255,255,.07);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);
  padding:4px;border-radius:999px;width:fit-content;flex-wrap:wrap;}
.tc-tab{appearance:none;border:0;background:transparent;color:var(--mut-2);
  font:inherit;font-size:13.5px;font-weight:600;letter-spacing:.01em;min-height:42px;padding:8px 15px;border-radius:999px;cursor:pointer;transition:background .15s,color .15s,transform .1s;white-space:nowrap;}
.tc-tab:hover{color:#fff;}
.tc-tab:active{transform:scale(.96);}
.tc-tab.is-on{background:rgba(255,255,255,.94);color:#141a33;}

.tc-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--mut-2);margin:0 0 14px;}
.tc-card2 .tc-eyebrow{color:rgba(255,255,255,.5);}

/* setup */
.tc-study-setup{background:transparent;border:0;border-radius:0;padding:6px 2px;}
.tc-hero{text-align:center;margin:6px 0 22px;}
.tc-heronum{font-size:96px;font-weight:200;letter-spacing:-.03em;line-height:1;color:#fff;font-family:-apple-system,"SF Pro Display",BlinkMacSystemFont,sans-serif;text-shadow:0 0 44px rgba(124,92,255,.4);}
.tc-herolabel{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--mut-2);margin:8px 0 0;}
.tc-herosub{font-size:13px;color:rgba(255,255,255,.55);margin:6px 0 0;}
.tc-controls{display:flex;flex-direction:column;gap:20px;margin-bottom:24px;}
.tc-field{border:0;margin:0;padding:0;}
.tc-field legend{font-size:13px;color:var(--mut-2);margin-bottom:9px;padding:0;}
.tc-seg{display:flex;gap:8px;flex-wrap:wrap;}
.tc-segbtn{appearance:none;border:0;background:rgba(255,255,255,.07);color:var(--washi);
  font:inherit;font-size:14px;font-weight:500;min-height:40px;padding:9px 16px;border-radius:var(--r-s);cursor:pointer;transition:border-color .15s,background .15s,transform .1s;}
.tc-segbtn:active{transform:scale(.96);}
.tc-segbtn:hover{background:rgba(255,255,255,.14);}
.tc-segbtn.is-on{background:var(--shu);border-color:var(--shu);color:#fff;}
.tc-toggle{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--washi);cursor:pointer;}
.tc-toggle input{width:17px;height:17px;accent-color:var(--shu);}
.tc-start{width:100%;}
.tc-review-btn{margin-top:10px;}
.tc-batchhead{display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px;}
.tc-batchhead>span{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--mut-2);}
.tc-sizesel{display:flex;gap:4px;background:rgba(255,255,255,.06);padding:3px;border-radius:8px;}
.tc-szbtn{appearance:none;border:0;background:transparent;color:var(--mut-2);font:inherit;font-size:12px;font-weight:600;padding:4px 11px;border-radius:6px;cursor:pointer;}
.tc-szbtn.is-on{background:var(--washi);color:var(--ai);}
.tc-batchgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;}
.tc-batchchip{appearance:none;text-align:left;border:0;position:relative;overflow:hidden;
  color:var(--washi);font:inherit;min-height:62px;padding:0;border-radius:16px;cursor:pointer;
  transition:box-shadow .15s,transform .1s;}
.tc-batchchip:active{transform:scale(.97);}
.tc-batchchip:hover{box-shadow:0 0 26px -6px rgba(216,72,47,.5);}
.tc-batchglass{position:relative;z-index:1;height:100%;box-sizing:border-box;min-height:62px;
  display:flex;flex-direction:column;gap:3px;justify-content:center;padding:12px 40px 12px 14px;
  background:linear-gradient(155deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.05) 55%, rgba(255,255,255,.02) 100%);
  backdrop-filter:blur(9px) saturate(150%);-webkit-backdrop-filter:blur(9px) saturate(150%);
  border:1px solid rgba(255,255,255,.16);border-radius:16px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3), inset 0 -14px 20px -14px rgba(0,0,0,.25);}
.tc-batchicon{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:26px;
  line-height:1;opacity:.75;pointer-events:none;user-select:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4));}
.tc-batchnum{font-size:14px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4);}
.tc-batchmeta{font-size:12px;color:rgba(255,255,255,.82);text-shadow:0 1px 2px rgba(0,0,0,.35);}
.tc-rate-low{color:var(--shu-soft);}
.tc-rate-new{color:var(--mut-2);}
.tc-setupfoot{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
.tc-hintline{text-align:center;font-size:12px;color:var(--mut-2);margin:14px 0 0;}

/* buttons */
.tc-btn{appearance:none;border:1px solid transparent;background:rgba(255,255,255,.09);
  color:var(--washi);font:inherit;font-size:15px;font-weight:600;letter-spacing:.01em;
  min-height:var(--tap);padding:11px 20px;border-radius:var(--r-m);
  cursor:pointer;transition:background .15s,border-color .15s,filter .15s,transform .1s;}
.tc-btn:hover{background:rgba(255,255,255,.12);}
.tc-btn:active{transform:scale(.97);}
.tc-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.tc-btn-primary{background:linear-gradient(135deg,#d8482f 0%,#e86a3c 100%);border-color:transparent;color:#fff;box-shadow:0 8px 20px -8px rgba(216,72,47,.65);}
.tc-btn-primary:hover{filter:brightness(1.07);}
.tc-btn-wide{width:100%;}
.tc-btn-sm{min-height:38px;padding:8px 15px;font-size:13.5px;border-radius:var(--r-s);}
.tc-btn-danger{border-color:rgba(216,72,47,.5);color:var(--shu-soft);}
.tc-btn-danger:hover{background:rgba(216,72,47,.16);}
.tc-btn-got{flex:1;background:#3d9150;border-color:#3d9150;color:#fff;box-shadow:0 6px 16px -8px rgba(61,145,80,.6);}
.tc-btn-got:hover{filter:brightness(1.08);background:#3d9150;}
.tc-btn-good{background:#3d9150 !important;border-color:#3d9150 !important;box-shadow:0 6px 16px -8px rgba(61,145,80,.6);}
.tc-btn-bad{background:#c23a26 !important;border-color:#c23a26 !important;box-shadow:0 6px 16px -8px rgba(194,58,38,.55);}
.tc-btn-miss{flex:1;}

/* progress */
.tc-progress{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;}
.tc-progtrack{flex:1;height:4px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;}
.tc-progfill{height:100%;background:var(--shu);border-radius:99px;transition:width .3s;}
.tc-progtext{font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;}

/* card flip */
.tc-card{perspective:1400px;cursor:pointer;margin-bottom:18px;}
.tc-card-inner{position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1);min-height:300px;}
.tc-card.is-flipped .tc-card-inner{transform:rotateY(180deg);}
.tc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  background:radial-gradient(130% 120% at 30% -12%, rgba(124,92,255,.22) 0%, rgba(64,84,168,.12) 45%, rgba(255,255,255,.05) 80%);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  color:#fff;border-radius:26px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  padding:34px 28px;box-sizing:border-box;
  box-shadow:0 24px 54px -22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);}
.tc-back{transform:rotateY(180deg);}
.tc-kindchip{position:absolute;top:16px;right:18px;font-family:"Yu Gothic","Noto Sans JP",sans-serif;
  font-size:11.5px;color:rgba(255,255,255,.7);letter-spacing:.1em;border:0;
  padding:4px 11px;border-radius:99px;background:rgba(255,255,255,.12);}
.tc-term{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:54px;line-height:1.15;font-weight:600;text-align:center;color:#fff;}
.tc-term-sm{font-size:46px;}
.tc-frontromaji{font-family:var(--mono);font-size:13px;letter-spacing:.14em;color:rgba(255,255,255,.55);font-style:normal;}
.tc-prompt-en{font-size:26px;font-weight:600;text-align:center;color:#fff;line-height:1.3;}
.tc-flipcue{position:absolute;bottom:14px;font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4);}
.tc-reading{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:34px;font-weight:600;color:#fff;}
.tc-romaji{font-family:var(--mono);font-size:14px;letter-spacing:.14em;color:var(--shu-soft);font-style:normal;}
.tc-meaning{font-size:20px;color:#fff;text-align:center;margin-top:4px;font-weight:500;}
.tc-meaning-lg{font-size:26px;font-weight:600;}
.tc-reading-front{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:24px;color:rgba(255,255,255,.72);font-weight:500;}
.tc-emoji{font-size:88px;line-height:1;margin-bottom:4px;}
.tc-setupline{font-size:14px;color:var(--mut-2);line-height:1.6;margin:0 0 22px;max-width:48ch;}
.tc-rpill{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);
  color:var(--mut-2);font:inherit;font-size:12px;font-weight:600;padding:5px 12px;border-radius:99px;
  cursor:pointer;transition:all .15s;white-space:nowrap;flex:none;}
.tc-rpill:hover{color:#fff;}
.tc-rpill.is-on{background:var(--shu);border-color:var(--shu);color:#fff;}

.tc-grade{display:flex;gap:10px;}

/* done */
.tc-done,.tc-empty,.tc-add,.tc-browse{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);
  border-radius:16px;padding:30px;}
.tc-done{text-align:center;}
.tc-bignum{font-size:82px;font-weight:300;letter-spacing:-.02em;color:#fff;line-height:1;font-family:-apple-system,"SF Pro Display",BlinkMacSystemFont,"Segoe UI",sans-serif;}
.tc-bignum span{font-size:30px;color:var(--shu-soft);}
.tc-donesub{color:var(--mut-2);font-size:14px;margin:8px 0 22px;}
.tc-donebtns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}

.tc-empty{text-align:center;color:var(--mut-2);display:flex;flex-direction:column;gap:16px;align-items:center;}

/* browse */
.tc-browsebar{display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap;}
.tc-search{flex:1;min-width:160px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);
  border-radius:9px;padding:10px 14px;color:#fff;font:inherit;font-size:14px;}
.tc-search::placeholder{color:var(--mut-2);}
.tc-confirm{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--mut-2);}
.tc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;}
.tc-row{display:grid;grid-template-columns:auto 1.3fr 1.3fr 1.4fr auto auto;gap:12px;align-items:center;
  padding:11px 8px;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px;}
.tc-rowkind{font-family:"Yu Gothic","Noto Sans JP",sans-serif;font-size:10px;color:var(--ai);
  background:var(--washi-2);border-radius:5px;padding:3px 6px;text-align:center;white-space:nowrap;}
.tc-rowterm{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:19px;color:#fff;}
.tc-rowread{display:flex;flex-direction:column;color:var(--washi);}
.tc-rowread em{font-style:italic;color:var(--shu-soft);font-size:12px;letter-spacing:.08em;}
.tc-rowmean{color:var(--mut-2);}
.tc-rowstat{font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;text-align:right;}
.tc-del{appearance:none;border:0;background:transparent;color:var(--mut-2);cursor:pointer;font-size:14px;min-width:32px;min-height:32px;border-radius:8px;
  padding:4px 6px;border-radius:6px;transition:all .15s;}
.tc-del:hover{color:var(--shu-soft);background:rgba(216,72,47,.12);}

/* add */
.tc-addhelp{font-size:13.5px;color:var(--mut-2);line-height:1.6;margin:0 0 14px;}
.tc-addhelp code{display:inline-block;margin-top:6px;background:rgba(0,0,0,.25);color:var(--washi);
  padding:4px 10px;border-radius:6px;font-size:13px;}
.tc-textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.14);
  border-radius:10px;padding:14px;color:#fff;font:inherit;font-size:15px;line-height:1.7;resize:vertical;}
.tc-textarea::placeholder{color:var(--mut-2);}
.tc-addrow{display:flex;align-items:center;gap:14px;margin-top:14px;}
.tc-addmsg{font-size:13.5px;color:var(--shu-soft);}
.tc-addnote{font-size:12.5px;color:var(--mut-2);margin:18px 0 0;line-height:1.6;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;}

.tc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}

.tc-btn:focus-visible,.tc-tab:focus-visible,.tc-segbtn:focus-visible,.tc-card:focus-visible,
.tc-search:focus-visible,.tc-textarea:focus-visible,.tc-del:focus-visible{
  outline:2px solid var(--shu-soft);outline-offset:2px;}

@media (max-width:560px){
  .tc-term{font-size:46px;}
  .tc-row{grid-template-columns:auto 1fr auto auto;}
  .tc-rowread,.tc-rowstat{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .tc-card-inner{transition:none;}
}

/* focus + insights */
.tc-focus-btn{margin-top:10px;border-color:var(--shu);color:var(--shu-soft);}
.tc-focus-btn:hover{background:rgba(216,72,47,.12);}
.tc-smart-btn{margin-top:12px;background:linear-gradient(130deg,#4054a8 0%,#7c5cff 55%,#b0543f 125%);color:#fff;border:none;font-weight:600;box-shadow:0 10px 26px -12px rgba(124,92,255,.65);}
.tc-smart-btn:hover{filter:brightness(1.12);}
.tc-smarthint{margin:8px 0 0;font-size:12px;color:var(--mut-2);line-height:1.5;text-align:center;}
.tc-kind-prod{background:rgba(216,72,47,.16);border-color:rgba(216,72,47,.4);color:var(--shu-soft);}
.tc-leechtag{margin-top:10px;font-size:12px;color:#e6a23c;background:rgba(230,162,60,.12);border:1px solid rgba(230,162,60,.35);padding:3px 10px;border-radius:99px;}
.tc-leechpill{font-size:11px;font-weight:600;color:#e6a23c;background:rgba(230,162,60,.13);border:1px solid rgba(230,162,60,.35);padding:2px 8px;border-radius:99px;}
.tc-coachcard{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:14px 16px;margin-bottom:10px;}
.tc-coachhead{margin:0 0 8px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut-2);}
.tc-coachplan{margin:0;padding-left:20px;color:var(--washi);font-size:14.5px;line-height:1.65;}
.tc-coachplan li{margin-bottom:6px;}
.tc-coachline{margin:0;color:var(--washi);font-size:15px;line-height:1.6;}
.tc-coachbtns{display:flex;gap:8px;margin:14px 0 6px;}
.tc-coachbtns .tc-btn-primary{flex:1;}
.tc-coacherr{font-size:13px;color:#e6a23c;line-height:1.5;}
.tc-coachai{border-color:rgba(216,72,47,.35);}
.tc-pre{white-space:pre-wrap;}
.tc-kanabar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
.tc-kanaseg{display:flex;gap:6px;}
.tc-kanaprog{margin:0 0 12px;font-size:12.5px;color:var(--mut-2);}
.tc-kanagrid{display:flex;flex-direction:column;gap:6px;}
.tc-kanarow{display:flex;gap:6px;}
.tc-kanacell{appearance:none;border:0;background:rgba(255,255,255,.055);border-radius:var(--r-s);flex:1;min-width:0;min-height:56px;padding:8px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font:inherit;color:#fff;transition:transform .1s,border-color .15s;}
.tc-kanacell:active{transform:scale(.94);}
.tc-kanach{font-size:24px;line-height:1.15;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-kanar{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;color:var(--mut-2);}
.kn-untouched{opacity:.55;}
.kn-good{background:radial-gradient(120% 130% at 50% -10%, rgba(80,200,120,.38) 0%, rgba(80,200,120,.08) 70%);border-color:rgba(95,185,106,.45);}
.kn-mid{background:radial-gradient(120% 130% at 50% -10%, rgba(230,162,60,.32) 0%, rgba(230,162,60,.06) 70%);border-color:rgba(230,162,60,.4);}
.kn-weak{background:radial-gradient(120% 130% at 50% -10%, rgba(226,88,62,.36) 0%, rgba(226,88,62,.07) 70%);border-color:rgba(216,72,47,.45);}
.tc-kanadrill{text-align:center;}
.tc-kanaprompt{font-size:44px;font-weight:600;color:#fff;margin:2px 0 12px;letter-spacing:.02em;}
.tc-kananote{font-size:15px;font-weight:400;color:rgba(255,255,255,.55);}
.kn-ghost{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:150px;line-height:1;color:rgba(31,45,84,.15);pointer-events:none;user-select:none;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;}
.kn-ghost-strong{color:rgba(216,72,47,.5);}
.tc-build{font-size:11px;font-weight:600;color:var(--mut-2);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);padding:2px 7px;border-radius:99px;vertical-align:middle;letter-spacing:.04em;}
.tc-backbtn{border-color:rgba(255,255,255,.3);font-weight:600;min-width:84px;}
.tc-hookbtn{appearance:none;margin-top:10px;border:0;background:rgba(255,255,255,.12);color:rgba(255,255,255,.75);font:inherit;font-size:13px;font-weight:500;min-height:34px;padding:6px 14px;border-radius:999px;cursor:pointer;transition:background .15s,transform .1s;}
.tc-hookbtn:active{transform:scale(.95);}
.tc-hookbtn:hover{background:rgba(43,38,32,.06);}
.tc-hooktext{margin:10px 0 0;font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.92);background:rgba(216,72,47,.18);border:0;border-radius:12px;padding:9px 13px;max-width:34ch;cursor:default;}
.tc-debrief{margin:14px auto 0;font-size:14px;line-height:1.6;color:var(--washi);background:rgba(255,255,255,.05);border:1px solid rgba(216,72,47,.35);border-radius:12px;padding:12px 16px;max-width:52ch;text-align:left;}
.tc-debrief-busy{border-color:rgba(255,255,255,.15);color:var(--mut-2);}
.tc-wscols-solo{grid-template-columns:1fr;}
.tc-wsromaji{font-family:var(--mono);font-style:normal;font-size:11.5px;letter-spacing:.03em;color:rgba(255,255,255,.5);}
.tc-bkpnudge{margin:10px 0 0;font-size:12.5px;color:#e6a23c;line-height:1.5;}
.tc-restore{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;margin-bottom:12px;}
.tc-restorehint{margin:0 0 8px;font-size:12.5px;color:var(--mut-2);line-height:1.5;}
.tc-restorebox{width:100%;box-sizing:border-box;min-height:88px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#fff;font-family:ui-monospace,monospace;font-size:11.5px;padding:8px;}
.tc-restorebtns{display:flex;gap:8px;margin-top:8px;}
.tc-restoremsg{font-size:13px;color:#e6a23c;line-height:1.5;margin:8px 0 0;}
.tc-voicerow{display:flex;gap:6px;margin:10px 0 2px;}
.tc-voicenote{margin:8px 0 0;font-size:12px;color:var(--mut-2);}
.tc-rehnav{display:flex;gap:8px;align-items:center;margin-top:14px;}
.tc-rehnav .tc-btn-primary{flex:1;}
.tc-rehnav .tc-btn-sm:disabled{opacity:.35;cursor:default;}
.tc-summary{display:flex;gap:8px;margin-bottom:12px;}
.tc-sumitem{flex:1;background:transparent;border:0;border-radius:0;padding:8px 4px;text-align:center;display:flex;flex-direction:column;gap:2px;}
.tc-sumitem b{font-size:30px;font-weight:300;letter-spacing:-.02em;color:#fff;font-variant-numeric:tabular-nums;}
.tc-sumitem span{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut-2);}
.tc-sum-good b{color:#5fb96a;}
.tc-sum-need b{color:var(--shu-soft);}
.tc-sum-new b{color:#e6a23c;}
.tc-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
.tc-fchip{appearance:none;border:0;background:rgba(255,255,255,.07);color:rgba(255,255,255,.75);font:inherit;font-size:13.5px;font-weight:500;min-height:36px;padding:6px 14px;border-radius:999px;cursor:pointer;transition:background .15s,border-color .15s,color .15s,transform .1s;}
.tc-fchip:active{transform:scale(.95);}
.tc-fchip.is-on{background:var(--shu);border-color:var(--shu);color:#fff;}
.tc-fchip-sort{margin-left:auto;}
.tc-fchip-sort.is-on{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff;}
.tc-prow{list-style:none;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:12px 14px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px;}
.tc-prow-top{display:flex;align-items:baseline;gap:10px;}
.tc-prow-top .tc-rowterm{font-size:18px;font-weight:600;color:#fff;}
.tc-prow-top .tc-rowread{font-size:13px;color:var(--mut-2);}
.tc-prow-top .tc-rowread em{margin-left:6px;font-style:italic;opacity:.8;}
.tc-prow-top .tc-del{margin-left:auto;}
.tc-prow-mean{font-size:14px;color:var(--washi);}
.tc-prow-stats{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.tc-meter{display:flex;gap:3px;}
.tc-seg{width:20px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);}
.tc-seg.on{background:linear-gradient(90deg,#7c5cff,#4dc2a8,#5fb96a);}
.tc-prow-num{font-size:12.5px;color:var(--mut-2);font-variant-numeric:tabular-nums;}
.tc-needpill{font-size:11px;font-weight:600;color:var(--shu-soft);background:rgba(216,72,47,.14);border:1px solid rgba(216,72,47,.35);padding:2px 8px;border-radius:99px;}
.tc-donepill{font-size:11px;font-weight:600;color:#5fb96a;background:rgba(95,185,106,.13);border:1px solid rgba(95,185,106,.3);padding:2px 8px;border-radius:99px;}
.tc-insights{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:16px;margin-top:16px;}
.tc-masterystrip{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--mut-2);margin-bottom:14px;}
.tc-masterystrip>span:first-child{letter-spacing:.14em;text-transform:uppercase;font-size:11px;}
.tc-mbar{flex:1;height:6px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;}
.tc-mfill{height:100%;background:linear-gradient(90deg,var(--shu),#e6a23c);border-radius:99px;transition:width .4s;}
.tc-mpct{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;}
.tc-wscols{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.tc-wslabel{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut-2);margin:0 0 8px;}
.tc-wsword{display:block;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:15px;color:var(--washi);margin-bottom:4px;}

/* sentences */
.tc-sent{display:flex;flex-direction:column;gap:16px;}
.tc-sentmodes{display:flex;gap:8px;}
.tc-senterr{background:rgba(216,72,47,.14);border:1px solid rgba(216,72,47,.4);color:var(--shu-soft);padding:12px 14px;border-radius:10px;font-size:14px;}
.tc-sentempty{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:30px;text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center;color:var(--mut-2);}
.tc-sentloading{text-align:center;color:var(--shu-soft);padding:40px 20px;font-size:15px;}
.tc-card2{background:radial-gradient(140% 130% at 25% -15%, rgba(64,84,168,.28) 0%, rgba(124,92,255,.12) 45%, rgba(255,255,255,.05) 80%);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  color:#fff;border-radius:26px;border-left:0;padding:26px 24px;
  box-shadow:0 24px 54px -22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);display:flex;flex-direction:column;gap:14px;}
.tc-sentgoal{margin:0;font-size:15px;color:rgba(255,255,255,.6);font-style:italic;}
.tc-sentbig{font-size:20px;font-style:normal;font-weight:600;color:var(--sumi);}
.tc-sentjp{margin:0;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:26px;line-height:2.1;color:#fff;font-weight:500;}
.tc-sentjp ruby rt{font-size:.42em;color:var(--shu);font-weight:600;letter-spacing:.02em;}
.tc-sentans ruby rt{font-size:.5em;color:var(--shu);font-weight:600;}
.tc-blank{display:inline-block;min-width:3.2em;border-bottom:2px solid var(--shu);text-align:center;color:var(--shu);}
.tc-sentfull{font-size:24px;}
.tc-sentinput{width:100%;box-sizing:border-box;background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:12px 14px;font:inherit;font-size:18px;color:var(--sumi);}
.tc-sentinput:focus-visible{outline:2px solid var(--shu);outline-offset:1px;}
.tc-sentbtns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}
.tc-idk{border-color:rgba(216,72,47,.45);color:var(--shu-soft);}
.tc-idk:hover{background:rgba(216,72,47,.12);}
.tc-senthint{margin:0;font-size:14px;color:var(--mut);background:var(--washi-2);padding:10px 12px;border-radius:8px;}
.tc-sentresult{margin:0;font-size:18px;font-weight:700;}
.tc-sentresult.ok{color:#2e7d32;}
.tc-sentresult.no{color:var(--shu);}
.tc-sentresult.mid{color:#c77b1e;}
.tc-sentans{margin:0;font-family:var(--mono);font-size:13.5px;letter-spacing:.06em;color:rgba(255,255,255,.65);font-weight:500;}
.tc-sentfeedback{margin:0;font-size:15px;line-height:1.55;color:var(--sumi);background:var(--washi-2);padding:12px 14px;border-radius:8px;}
.tc-rehhead{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.tc-rehname{font-size:15px;font-weight:600;color:#fff;}
.tc-scriptlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
.tc-scriptrow{display:flex;align-items:stretch;gap:6px;}
.tc-scriptopen{flex:1;appearance:none;text-align:left;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--washi);font:inherit;padding:14px 16px;border-radius:11px;cursor:pointer;transition:all .15s;display:flex;justify-content:space-between;align-items:center;}
.tc-scriptopen:hover{border-color:var(--shu);background:rgba(216,72,47,.1);}
.tc-scriptname{font-size:16px;font-weight:600;color:#fff;}
.tc-scriptmeta{font-size:12px;color:var(--mut-2);}
.tc-cue{margin:0;font-size:15px;color:rgba(255,255,255,.6);font-style:italic;}
.tc-ladder{margin:0;font-size:12.5px;color:var(--mut-2);line-height:1.5;}
.tc-offnote{margin:0;font-size:12.5px;color:var(--mut-2);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);padding:9px 12px;border-radius:8px;}
.tc-write{display:flex;flex-direction:column;gap:14px;}
.tc-canvaswrap{position:relative;width:100%;height:240px;background:#f7f3ea;border:0;border-radius:16px;overflow:hidden;box-shadow:inset 0 2px 10px rgba(0,0,0,.12);}
.tc-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;display:block;}
.tc-ghost{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;color:rgba(43,38,32,.13);pointer-events:none;user-select:none;line-height:1.1;text-align:center;padding:8px;box-sizing:border-box;}
.tc-writetools{justify-content:center;}
.tc-writereveal{display:flex;flex-direction:column;gap:10px;align-items:center;}
.tc-writeanswer{margin:0;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:40px;color:#fff;font-weight:600;text-align:center;}
.tc-gradebtns{display:flex;gap:10px;width:100%;}
.tc-gradebtns .tc-btn{flex:1;}

/* a11y + motion */
.tc-conj{display:flex;flex-direction:column;gap:14px;}
.tc-conjintro{display:flex;flex-direction:column;gap:14px;align-items:stretch;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:20px;}
.tc-conjtitle{margin:0;font-size:20px;font-weight:600;color:#fff;}
.tc-conjsub{margin:0;font-size:13px;line-height:1.55;color:var(--mut-2);}
.tc-conjchips{display:flex;flex-wrap:wrap;gap:8px;}
.tc-conjchip{appearance:none;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:var(--washi,#efeae2);
  padding:9px 15px;border-radius:999px;font-size:13.5px;cursor:pointer;transition:background .15s,color .15s;}
.tc-conjchip:hover{color:#fff;background:rgba(255,255,255,.12);}
.tc-conjchip.is-on{background:rgba(255,255,255,.94);color:#141a33;font-weight:600;border-color:transparent;}
.tc-conjmode{align-self:flex-start;}
.tc-speakbtn{appearance:none;border:0;background:rgba(255,255,255,.1);border-radius:999px;font-size:14px;line-height:1;padding:5px 9px;cursor:pointer;vertical-align:middle;margin-left:6px;}
.tc-speakbtn:active{background:rgba(255,255,255,.25);}
.tc-timetag{display:inline-block;margin-top:8px;font-size:11.5px;color:var(--mut-2);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);padding:4px 10px;border-radius:999px;font-variant-numeric:tabular-nums;}
.tc-btn[disabled]{opacity:.5;cursor:default;}
.tc-oral{display:flex;flex-direction:column;gap:12px;}
.tc-oralchat{display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto;padding:4px 2px;}
.tc-bubble{max-width:85%;padding:10px 14px;border-radius:14px;font-size:15px;line-height:1.55;white-space:pre-wrap;}
.tc-bubble-you{align-self:flex-end;background:rgba(230,90,70,.22);border:1px solid rgba(230,90,70,.35);color:#fff;border-bottom-right-radius:4px;}
.tc-bubble-kanda{align-self:flex-start;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:var(--washi,#efeae2);border-bottom-left-radius:4px;}
.tc-bubblewho{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;opacity:.55;margin-bottom:3px;}
.tc-oralbar{display:flex;gap:8px;align-items:stretch;}
.tc-input{appearance:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#fff;padding:10px 12px;font-size:15px;}
.tc-input:focus{outline:2px solid rgba(230,90,70,.5);}
.tc-oralinput{flex:1;min-width:0;}
.tc-oraldebrief{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;}
.tc-oraldebrief h3{margin:0;font-size:16px;color:#fff;}
.tc-debrieftext{margin:0;font-size:13.5px;line-height:1.6;color:var(--washi,#efeae2);white-space:pre-wrap;}
.tc-conjask{margin-top:10px;font-size:15px;color:rgba(255,255,255,.65);font-style:italic;}
.tc-conjanswer{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:32px;font-weight:600;color:#fff;text-align:center;line-height:1.3;}
.tc-conjhow{font-size:15px;color:var(--shu-soft,#ff8a7a);font-variant-numeric:tabular-nums;}
.tc-conjrule{font-size:12.5px;color:var(--mut-2);}
.tc-conjnote{margin:6px 12px 0;font-size:12.5px;line-height:1.5;color:#ffd9a0;background:rgba(255,190,90,.08);border:1px solid rgba(255,190,90,.2);padding:8px 12px;border-radius:8px;}
.tc-root::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:99;opacity:.05;mix-blend-mode:soft-light;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.tc-root :is(button,[role="tab"]):focus-visible{outline:2px solid var(--shu-soft);outline-offset:2px;border-radius:inherit;}
@media (prefers-reduced-motion:reduce){.tc-root *{transition:none !important;animation:none !important;}}
`;

/* ── mount ── */
import ReactDOM from "react-dom/client";
ReactDOM.createRoot(document.getElementById("root")).render(<JpnFlashcards />);
