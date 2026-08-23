import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   単語帳 — JPN 101 flashcards
   Persistent vocab study tool. Cards are saved with window.storage so they
   survive across sessions. Add words anytime; study with self-graded flips.
   ────────────────────────────────────────────────────────────────────────── */

import { MASCOT_GIFS } from "./data/mascot.js";
import { SITUATIONS, makeProps, TALK, CHECKLIST } from "./tools/oral-data.mjs";
import { review as fsrsReview, retrievability, seedFromHistory, gradeFromLatency, intervalFor, AGAIN, HARD, GOOD, EASY } from "./tools/fsrs.mjs";
import { cardMergeKey, applySeed, mergeSnapshots } from "./tools/merge.mjs";
import { localDayKey, streakFrom } from "./tools/days.mjs";
import { buildSession, interventionFor, skillOf, describe as describeSession } from "./tools/session.mjs";
import { calibrationReport } from "./tools/calibration.mjs";
import { mine, cardFor, displacementPlan, describePlan, makeLexicon } from "./tools/mining.mjs";
import { inContext, splitAround, contextCoverage } from "./tools/kanjicontext.mjs";
import { drillSet, gradeDrill } from "./tools/production.mjs";
import { describeBand, bandFor, rankMaterial } from "./tools/comprehensible.mjs";
import { reserveFor, cycleFor, sampleFor, scoreRun, estimateKnown, compareRuns,
         describeRun, pushRun, poolRuns, glossOf, askable, RUN_SIZE } from "./tools/benchmark.mjs";
import { buildClozeIndex, hasContext, clozeFor, clozeChoices, addMinedSources } from "./tools/cloze.mjs";
import {
  SKILLS, SKILL_LABEL, skillForFormat, CUE, cueHint, classifyFailure,
  makeEvidence, profileFrom, biggestGap, explainPick, summarise, CONFIDENCE,
  pushRecent, confusionFrom, latencyNorms, latencyVerdict,
  posterior, stateOf, STATE, STATE_LABEL, abilityFrom,
} from "./tools/learner.mjs";
import {
  buildItems as buildDateItems, sequenceForm, dateForm, timeForm, weekdayForm,
  acceptedReadings, COUNTERS, DAY_READING, MONTH_READING, MONTH_KANJI, HOUR_READING,
  WEEKDAYS, WEEKDAY_EN, counterForm, ordinal,
} from "./tools/counters-data.mjs";
import { toKana, kanaEqual } from "./tools/romaji.mjs";

const STORE_KEY = "jpn101:deck";
const SEED_KEY = "jpn101:deckVersion";
const SEED_VERSION = 34; // bump this each time I add/update words

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
  { term: "方", reading: "かた", romaji: "kata", meaning: "person (honorific)", kind: "kanji", emoji: "🙇", lesson: 43, sec: "6-3#2" },
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

  // ── class notes, by study date ──
  { term: "会長", reading: "かいちょう", romaji: "kaichō", meaning: "chairman; president (of a society)", kind: "kanji", emoji: "🎩", lesson: 48, sec: "7/20" },
  { term: "部長", reading: "ぶちょう", romaji: "buchō", meaning: "department head; manager", kind: "kanji", emoji: "👔", lesson: 48, sec: "7/20" },
  { term: "鳥", reading: "とり", romaji: "tori", meaning: "bird", kind: "kanji", emoji: "🐦", lesson: 48, sec: "7/20" },
  { term: "ダチョウ", reading: "ダチョウ", romaji: "dachō", meaning: "ostrich", kind: "katakana", emoji: "🦤", lesson: 48, sec: "7/20" },
  { term: "おじいちゃん", reading: "おじいちゃん", romaji: "ojiichan", meaning: "grandpa (affectionate)", kind: "hiragana", emoji: "👴", lesson: 48, sec: "7/20" },
  { term: "おばあちゃん", reading: "おばあちゃん", romaji: "obaachan", meaning: "grandma (affectionate)", kind: "hiragana", emoji: "👵", lesson: 48, sec: "7/20" },
  { term: "太っている", reading: "ふとっている", romaji: "futotte iru", meaning: "to be overweight (state, from 太る futoru)", kind: "kanji", emoji: "🧸", lesson: 48, sec: "7/20" },
  { term: "働く", reading: "はたらく", romaji: "hataraku", meaning: "to work (u-verb; polite 働きます hatarakimasu)", kind: "kanji", emoji: "💼", lesson: 48, sec: "7/20" },

  { term: "十字架", reading: "じゅうじか", romaji: "jūjika", meaning: "cross (crucifix)", kind: "kanji", emoji: "✝️", lesson: 49, sec: "7/22" },
  { term: "闇", reading: "やみ", romaji: "yami", meaning: "darkness", kind: "kanji", emoji: "🌑", lesson: 49, sec: "7/22" },
  { term: "夢", reading: "ゆめ", romaji: "yume", meaning: "dream", kind: "kanji", emoji: "💭", lesson: 49, sec: "7/22" },
  { term: "一つ", reading: "ひとつ", romaji: "hitotsu", meaning: "one (thing) — native counter", kind: "kanji", emoji: "1️⃣", lesson: 49, sec: "7/22" },
  { term: "二つ", reading: "ふたつ", romaji: "futatsu", meaning: "two (things)", kind: "kanji", emoji: "2️⃣", lesson: 49, sec: "7/22" },
  { term: "三つ", reading: "みっつ", romaji: "mittsu", meaning: "three (things)", kind: "kanji", emoji: "3️⃣", lesson: 49, sec: "7/22" },
  { term: "四つ", reading: "よっつ", romaji: "yottsu", meaning: "four (things)", kind: "kanji", emoji: "4️⃣", lesson: 49, sec: "7/22" },
  { term: "五つ", reading: "いつつ", romaji: "itsutsu", meaning: "five (things)", kind: "kanji", emoji: "5️⃣", lesson: 49, sec: "7/22" },
  { term: "六つ", reading: "むっつ", romaji: "muttsu", meaning: "six (things)", kind: "kanji", emoji: "6️⃣", lesson: 49, sec: "7/22" },
  { term: "七つ", reading: "ななつ", romaji: "nanatsu", meaning: "seven (things)", kind: "kanji", emoji: "7️⃣", lesson: 49, sec: "7/22" },
  { term: "八つ", reading: "やっつ", romaji: "yattsu", meaning: "eight (things)", kind: "kanji", emoji: "8️⃣", lesson: 49, sec: "7/22" },
  { term: "九つ", reading: "ここのつ", romaji: "kokonotsu", meaning: "nine (things)", kind: "kanji", emoji: "9️⃣", lesson: 49, sec: "7/22" },
  { term: "十", reading: "とお", romaji: "tō", meaning: "ten (things) — note: とお, not じゅう, in this counter", kind: "kanji", emoji: "🔟", lesson: 49, sec: "7/22" },

  { term: "風", reading: "かぜ", romaji: "kaze", meaning: "wind", kind: "kanji", emoji: "🌬️", lesson: 50, sec: "7/23" },
  { term: "美しい", reading: "うつくしい", romaji: "utsukushii", meaning: "beautiful (い-adj)", kind: "kanji", emoji: "🌸", lesson: 50, sec: "7/23" },
  { term: "蝶々", reading: "ちょうちょう", romaji: "chōchō", meaning: "butterfly", kind: "kanji", emoji: "🦋", lesson: 50, sec: "7/23" },
  { term: "目", reading: "め", romaji: "me", meaning: "eye; eyes", kind: "kanji", emoji: "👁️", lesson: 50, sec: "7/23" },
  { term: "命", reading: "いのち", romaji: "inochi", meaning: "life", kind: "kanji", emoji: "🌱", lesson: 50, sec: "7/23" },
  { term: "でしょう", reading: "でしょう", romaji: "deshō", meaning: "probably; right? — rising = asking, falling = fairly sure", kind: "hiragana", emoji: "🤔", lesson: 50, sec: "7/23" },
  { term: "どのぐらい", reading: "どのぐらい", romaji: "dono gurai", meaning: "how much; how long", kind: "hiragana", emoji: "📏", lesson: 50, sec: "7/23" },
  { term: "〜く", reading: "〜く", romaji: "~ku", meaning: "makes an い-adjective adverbial: 早い → 早く 'quickly'", kind: "hiragana", emoji: "⚙️", lesson: 50, sec: "7/23" },

  { term: "お気に入り", reading: "おきにいり", romaji: "okiniiri", meaning: "favorite", kind: "kanji", emoji: "⭐", lesson: 51, sec: "7/24" },
  { term: "問題ない", reading: "もんだいない", romaji: "mondai nai", meaning: "no problem", kind: "kanji", emoji: "👌", lesson: 51, sec: "7/24" },

  { term: "草", reading: "くさ", romaji: "kusa", meaning: "grass", kind: "kanji", emoji: "🌿", lesson: 52, sec: "7/27" },
  { term: "花", reading: "はな", romaji: "hana", meaning: "flower", kind: "kanji", emoji: "🌸", lesson: 52, sec: "7/27" },

  { term: "幸せに", reading: "しあわせに", romaji: "shiawase ni", meaning: "happily (from 幸せ shiawase 'happiness')", kind: "kanji", emoji: "😊", lesson: 53, sec: "7/29" },
  { term: "教え", reading: "おしえ", romaji: "oshie", meaning: "teaching; doctrine", kind: "kanji", emoji: "📖", lesson: 53, sec: "7/29" },
  { term: "正義", reading: "せいぎ", romaji: "seigi", meaning: "justice; righteousness", kind: "kanji", emoji: "⚖️", lesson: 53, sec: "7/29" },
  { term: "福音", reading: "ふくいん", romaji: "fukuin", meaning: "gospel", kind: "kanji", emoji: "📜", lesson: 53, sec: "7/29" },
  { term: "忘れず", reading: "わすれず", romaji: "wasurezu", meaning: "without forgetting (from 忘れる wasureru)", kind: "kanji", emoji: "🧠", lesson: 53, sec: "7/29" },

  { term: "夜", reading: "よる", romaji: "yoru", meaning: "night", kind: "kanji", emoji: "🌙", lesson: 54, sec: "7/30" },
  { term: "悲しみ", reading: "かなしみ", romaji: "kanashimi", meaning: "sorrow; grief", kind: "kanji", emoji: "😢", lesson: 54, sec: "7/30" },
  { term: "救い", reading: "すくい", romaji: "sukui", meaning: "salvation; rescue", kind: "kanji", emoji: "🙏", lesson: 54, sec: "7/30" },
  { term: "雲", reading: "くも", romaji: "kumo", meaning: "cloud", kind: "kanji", emoji: "☁️", lesson: 54, sec: "7/30" },
  { term: "力", reading: "ちから", romaji: "chikara", meaning: "strength; power", kind: "kanji", emoji: "💪", lesson: 54, sec: "7/30" },
  { term: "贖い", reading: "あがない", romaji: "aganai", meaning: "atonement; redemption", kind: "kanji", emoji: "✝️", lesson: 54, sec: "7/30" },
  { term: "王", reading: "おう", romaji: "ō", meaning: "king", kind: "kanji", emoji: "👑", lesson: 54, sec: "7/30" },
  { term: "喜び", reading: "よろこび", romaji: "yorokobi", meaning: "joy; delight", kind: "kanji", emoji: "🎉", lesson: 54, sec: "7/30" },
  { term: "我", reading: "われ", romaji: "ware", meaning: "I; we (literary/formal — 我々 wareware = 'we')", kind: "kanji", emoji: "🙋", lesson: 54, sec: "7/30" },

  // ── Dragon Ball, read page by page ────────────────────────────────────────────
  // Vocabulary lifted from the manga itself rather than a syllabus, so these sections
  // are named for the pages they came from and sort above the coursework (sectionRank).
  //
  // Two rules this batch has to respect, because the seed merge keys on `term`
  // (see loadCardsAndSync): a term may appear only ONCE in SEED, and a term that already
  // exists in an earlier section must not be repeated here — the merge would overwrite
  // that card's meaning in place while leaving it stranded in its old section. なに/何 and
  // なあ were on the page list and are already in the deck, so they are deliberately absent.
  // For the same reason 薪 and 腹 appear as vocabulary only, with their 音/訓 readings folded
  // into the meaning, instead of getting a second card in the kanji block below.
  { term: "薪", reading: "まき", romaji: "maki", meaning: "firewood; kindling (音 シン ・ 訓 まき・たきぎ)", kind: "kanji", emoji: "🪵", lesson: 55, sec: "DB 8–9" },
  { term: "薪割り", reading: "まきわり", romaji: "makiwari", meaning: "chopping firewood — 薪 (firewood) + 割り (splitting)", kind: "kanji", emoji: "🪓", lesson: 55, sec: "DB 8–9" },
  { term: "割る", reading: "わる", romaji: "waru", meaning: "to split; to chop; to break in two — the verb behind 割り", kind: "kanji", emoji: "🔪", lesson: 55, sec: "DB 8–9" },
  { term: "おしまい", reading: "おしまい", romaji: "oshimai", meaning: "the end; all done; that's it for that", kind: "hiragana", emoji: "🔚", lesson: 55, sec: "DB 8–9" },
  { term: "っと", reading: "っと", romaji: "tto", meaning: "the little grunt you make finishing a job — 'there we go'; tacked onto the end of your own sentence", kind: "hiragana", emoji: "✅", lesson: 55, sec: "DB 8–9" },
  { term: "腹", reading: "はら", romaji: "hara", meaning: "stomach; belly (音 フク ・ 訓 はら). Written ハラ in katakana on the page for emphasis; 腹が減った = I'm hungry", kind: "kanji", emoji: "🍽️", lesson: 55, sec: "DB 8–9" },
  { term: "減った", reading: "へった", romaji: "hetta", meaning: "went down; got less — past of 減る. 腹が減った is the everyday way to say 'I'm starving'", kind: "kanji", emoji: "📉", lesson: 55, sec: "DB 8–9" },
  { term: "な", reading: "な", romaji: "na", meaning: "sentence-final particle: softens a thought you're half-saying to yourself", kind: "hiragana", emoji: "💭", lesson: 55, sec: "DB 8–9" },
  { term: "じいちゃん", reading: "じいちゃん", romaji: "jiichan", meaning: "grandpa (affectionate, casual — おじいさん is the polite form)", kind: "hiragana", emoji: "👴", lesson: 55, sec: "DB 8–9" },
  { term: "エサ", reading: "エサ", romaji: "esa", meaning: "animal feed; bait. Written in katakana here; the kanji is 餌", kind: "katakana", emoji: "🍖", lesson: 55, sec: "DB 8–9" },
  { term: "とって", reading: "とって", romaji: "totte", meaning: "fetch/take and… — te-form of 取る, used here to chain onto the next verb", kind: "hiragana", emoji: "✋", lesson: 55, sec: "DB 8–9" },
  { term: "来る", reading: "くる", romaji: "kuru", meaning: "to come. とってくる = go get it and come back (often written くる in kana)", kind: "kanji", emoji: "🚶", lesson: 55, sec: "DB 8–9" },
  { term: "食おうか", reading: "くおうか", romaji: "kuō ka", meaning: "shall I eat? — volitional of 食う (rough, masculine 'eat') + か. Contracted to 食おか in speech", kind: "kanji", emoji: "🤤", lesson: 55, sec: "DB 8–9" },

  // New kanji introduced by these pages, in the Kanji tab's own format: the bare character,
  // its meanings, then 音 (on) and 訓 (kun) readings — kun okurigana parenthesised the way
  // readingText() renders it, so both places in the app read the same. Readings and meanings
  // come from data/kanji.json rather than being written by hand.
  { term: "割", reading: "わり", romaji: "wari", meaning: "divide; split; cut; proportion — 音 カツ ・ 訓 わ(る)・わり・わ(れる)", kind: "kanji", emoji: "🪓", lesson: 55, sec: "DB 8–9" },
  { term: "減", reading: "げん", romaji: "gen", meaning: "dwindle; decrease; get hungry — 音 ゲン ・ 訓 へ(る)・へ(らす)", kind: "kanji", emoji: "⬇️", lesson: 55, sec: "DB 8–9" },
  { term: "餌", reading: "えさ", romaji: "esa", meaning: "food; bait; prey — 音 ジ・ニ ・ 訓 えさ・え", kind: "kanji", emoji: "🍱", lesson: 55, sec: "DB 8–9" },
  { term: "取", reading: "とり", romaji: "tori", meaning: "take; fetch; take up — 音 シュ ・ 訓 と(る)・とり", kind: "kanji", emoji: "⬆️", lesson: 55, sec: "DB 8–9" },
  { term: "来", reading: "らい", romaji: "rai", meaning: "come; next; due — 音 ライ・タイ ・ 訓 く(る)・きた(る)", kind: "kanji", emoji: "🏃", lesson: 55, sec: "DB 8–9" },
  { term: "食", reading: "しょく", romaji: "shoku", meaning: "eat; food — 音 ショク・ジキ ・ 訓 く(う)・た(べる)", kind: "kanji", emoji: "🍱", lesson: 55, sec: "DB 8–9" },
  /* ── NihonGO NOW! Level 1 Volume 2 · Acts 7-12 ──
     The next course. Imported from the published glossary, which gives act, scene,
     romanisation, Japanese and English but no kana reading — the reading is derived
     from the romanisation with toKana(), the same converter the Dates tab uses and the
     one covered by 61 tested readings. Words already taught in Volume 1 are skipped. */
  { term: "住めば都", reading: "すめばみやこ", romaji: "sumebamiyako", meaning: "Home is where you make it", kind: "kanji", emoji: "🏠", lesson: 60, sec: "7-0" },
  { term: "キャンパス", reading: "キャンパス", romaji: "kyanpasu", meaning: "campus", kind: "katakana", emoji: "🏫", lesson: 60, sec: "7-1" },
  { term: "遠く", reading: "とおく", romaji: "tooku", meaning: "distant", kind: "kanji", emoji: "📏", lesson: 60, sec: "7-1" },
  { term: "便利（な）", reading: "べんり", romaji: "benri", meaning: "convenient", kind: "kanji", emoji: "✅", lesson: 60, sec: "7-1" },
  { term: "不便（な）", reading: "ふべん", romaji: "fuben", meaning: "inconvenient", kind: "kanji", emoji: "😣", lesson: 60, sec: "7-1" },
  { term: "楽（な）", reading: "らく", romaji: "raku", meaning: "easy, comfortable", kind: "kanji", emoji: "✅", lesson: 60, sec: "7-1" },
  { term: "静か（な）", reading: "しずか", romaji: "shizuka", meaning: "quiet", kind: "kanji", emoji: "🤫", lesson: 60, sec: "7-1" },
  { term: "寒さ", reading: "さむさ", romaji: "samusa", meaning: "the cold", kind: "kanji", emoji: "🥶", lesson: 60, sec: "7-1" },
  { term: "気持ち", reading: "きもち", romaji: "kimochi", meaning: "feeling, sensation", kind: "kanji", emoji: "💭", lesson: 60, sec: "7-1" },
  { term: "天気", reading: "てんき", romaji: "tenki", meaning: "weather", kind: "kanji", emoji: "🌡️", lesson: 60, sec: "7-1" },
  { term: "食堂", reading: "しょくどう", romaji: "shokudou", meaning: "dining hall, cafeteria", kind: "kanji", emoji: "🍽️", lesson: 60, sec: "7-1" },
  { term: "カフェテリア", reading: "カフェテリア", romaji: "kafeteria", meaning: "cafeteria", kind: "katakana", emoji: "🍽️", lesson: 60, sec: "7-1" },
  { term: "売店", reading: "ばいてん", romaji: "baiten", meaning: "shop, stand, kiosk", kind: "kanji", emoji: "🏬", lesson: 60, sec: "7-1" },
  { term: "ATM", reading: "ATM", romaji: "eithi-emu", meaning: "ATM", kind: "hiragana", emoji: "🏧", lesson: 60, sec: "7-1" },
  { term: "びっくりする (IRR)", reading: "びっくりする (IRR)", romaji: "bikkurisuru", meaning: "be surprised (at X)", kind: "hiragana", emoji: "😲", lesson: 60, sec: "7-1" },
  { term: "通う(-u; 通った)", reading: "かよう", romaji: "kayou", meaning: "commute", kind: "kanji", emoji: "🚉", lesson: 60, sec: "7-1" },
  { term: "広い", reading: "ひろい", romaji: "hiroi", meaning: "spacious, wide", kind: "kanji", emoji: "↔️", lesson: 60, sec: "7-1" },
  { term: "狭い", reading: "せまい", romaji: "semai", meaning: "narrow, confined", kind: "kanji", emoji: "🤏", lesson: 60, sec: "7-1" },
  { term: "寒い", reading: "さむい", romaji: "samui", meaning: "cold (climate)", kind: "kanji", emoji: "🥶", lesson: 60, sec: "7-1" },
  { term: "冷たい", reading: "つめたい", romaji: "tsumetai", meaning: "cold (to the touch), cold (personality)", kind: "kanji", emoji: "🥶", lesson: 60, sec: "7-1" },
  { term: "暑い", reading: "あつい", romaji: "atsui", meaning: "hot (weather, climate)", kind: "kanji", emoji: "🔥", lesson: 60, sec: "7-1" },
  { term: "熱い", reading: "あつい", romaji: "atsui", meaning: "hot (non-weather, non-climate)", kind: "kanji", emoji: "🔥", lesson: 60, sec: "7-1" },
  { term: "暖かい・温かい", reading: "あたたかい", romaji: "atatakai", meaning: "warm (climate, personality)", kind: "kanji", emoji: "🔥", lesson: 60, sec: "7-1" },
  { term: "涼しい", reading: "すずしい", romaji: "suzushii", meaning: "cool (climate)", kind: "kanji", emoji: "🥶", lesson: 60, sec: "7-1" },
  { term: "暗い", reading: "くらい", romaji: "kurai", meaning: "dark", kind: "kanji", emoji: "🌑", lesson: 60, sec: "7-1" },
  { term: "明るい", reading: "あかるい", romaji: "akarui", meaning: "light, bright", kind: "kanji", emoji: "💡", lesson: 60, sec: "7-1" },
  { term: "気持ちがいい", reading: "きもち", romaji: "kimochi", meaning: "good feeling", kind: "kanji", emoji: "👍", lesson: 60, sec: "7-1" },
  { term: "天気がいい", reading: "てんき", romaji: "tenki", meaning: "weather is good", kind: "kanji", emoji: "🌡️", lesson: 60, sec: "7-1" },
  { term: "きつい", reading: "きつい", romaji: "kitsui", meaning: "severe, intense", kind: "hiragana", emoji: "😣", lesson: 60, sec: "7-1" },
  { term: "辛い・つらい", reading: "つらい", romaji: "tsurai", meaning: "tough, bitter (experience), painful", kind: "kanji", emoji: "😣", lesson: 60, sec: "7-1" },
  { term: "うれしい / 嬉しい", reading: "うれしい", romaji: "ureshii", meaning: "happy, glad", kind: "kanji", emoji: "😊", lesson: 60, sec: "7-1" },
  { term: "悲しい", reading: "かなしい", romaji: "kanashii", meaning: "sad", kind: "kanji", emoji: "😢", lesson: 60, sec: "7-1" },
  { term: "寂しい", reading: "さびしいさみしい", romaji: "sabishii・samishii", meaning: "lonely", kind: "kanji", emoji: "😢", lesson: 60, sec: "7-1" },
  { term: "ありがたい", reading: "ありがたい", romaji: "arigatai", meaning: "grateful, thankful", kind: "hiragana", emoji: "🙏", lesson: 60, sec: "7-1" },
  { term: "うん", reading: "うん", romaji: "un", meaning: "yes (informal)", kind: "hiragana", emoji: "⭕", lesson: 60, sec: "7-1" },
  { term: "ううん", reading: "ううん", romaji: "uun", meaning: "no (informal)", kind: "hiragana", emoji: "❌", lesson: 60, sec: "7-1" },
  { term: "寒さには慣れました", reading: "さむさにわなれました", romaji: "samusaniwanaremashita.", meaning: "I got used to to the cold", kind: "kanji", emoji: "🥶", lesson: 60, sec: "7-1" },
  { term: "暖かくて気持ちがいい", reading: "あたたかくてきもちがいい", romaji: "atatakakutekimochigaii", meaning: "warm and good feeling", kind: "kanji", emoji: "🔥", lesson: 60, sec: "7-1" },
  { term: "バスがある", reading: "バスがある", romaji: "basugaaru", meaning: "there’s a bus", kind: "hiragana", emoji: "🚌", lesson: 60, sec: "7-1" },
  { term: "それより", reading: "それより", romaji: "soreyori", meaning: "leaving that aside, apart from that, more importantly", kind: "hiragana", emoji: "↪️", lesson: 60, sec: "7-1" },
  { term: "富士山", reading: "ふじさん", romaji: "fujisan", meaning: "Mount Fuji", kind: "kanji", emoji: "🗻", lesson: 60, sec: "7-2" },
  { term: "プール", reading: "プール", romaji: "pu-ru", meaning: "pool", kind: "katakana", emoji: "🏊", lesson: 60, sec: "7-2" },
  { term: "カラオケ", reading: "カラオケ", romaji: "karaoke", meaning: "karaoke", kind: "katakana", emoji: "🎤", lesson: 60, sec: "7-2" },
  { term: "マラソン", reading: "マラソン", romaji: "marason", meaning: "marathon", kind: "katakana", emoji: "🏃", lesson: 60, sec: "7-2" },
  { term: "（お）楽しみ（な）", reading: "たのしみ", romaji: "tanoshimi", meaning: "enjoyment, pleasure", kind: "kanji", emoji: "😊", lesson: 60, sec: "7-2" },
  { term: "弟さん", reading: "おとうとさん", romaji: "otoutosan", meaning: "younger brother", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "妹さん", reading: "いもうとさん", romaji: "imoutosan", meaning: "younger sister", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "（お）兄さん", reading: "にいさん", romaji: "niisan", meaning: "older brother", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "（お）姉さん", reading: "ねえさん", romaji: "neesan", meaning: "older sister", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "（ご）兄弟", reading: "きょうだい", romaji: "kyoudai", meaning: "brothers, siblings", kind: "kanji", emoji: "👬", lesson: 60, sec: "7-2" },
  { term: "（お）母さん", reading: "かあさん", romaji: "kaasan", meaning: "mother", kind: "kanji", emoji: "👩", lesson: 60, sec: "7-2" },
  { term: "（お）父さん", reading: "とうさん", romaji: "tousan", meaning: "father", kind: "kanji", emoji: "👨", lesson: 60, sec: "7-2" },
  { term: "奥さん", reading: "おくさん", romaji: "okusan", meaning: "wife", kind: "kanji", emoji: "💍", lesson: 60, sec: "7-2" },
  { term: "（ご）主人", reading: "しゅじん", romaji: "shujin", meaning: "husband", kind: "kanji", emoji: "💍", lesson: 60, sec: "7-2" },
  { term: "娘さん", reading: "むすめさん", romaji: "musumesan", meaning: "daughter", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "息子さん", reading: "むすこさん", romaji: "musukosan", meaning: "son", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "（ご）家族", reading: "かぞく", romaji: "kazoku", meaning: "family", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 60, sec: "7-2" },
  { term: "弟↓", reading: "おとうと", romaji: "otouto", meaning: "younger brother (humble)", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "妹↓", reading: "いもうと", romaji: "imouto", meaning: "younger sister (humble)", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "兄↓", reading: "あに", romaji: "ani", meaning: "older brother (humble)", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "姉↓", reading: "あね", romaji: "ane", meaning: "older sister (humble)", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "母↓", reading: "はは", romaji: "haha", meaning: "mother (humble)", kind: "kanji", emoji: "👩", lesson: 60, sec: "7-2" },
  { term: "父↓", reading: "ちち", romaji: "chichi", meaning: "father (humble)", kind: "kanji", emoji: "👨", lesson: 60, sec: "7-2" },
  { term: "妻↓", reading: "つま", romaji: "tsuma", meaning: "wife (humble)", kind: "kanji", emoji: "💍", lesson: 60, sec: "7-2" },
  { term: "夫↓", reading: "おっと", romaji: "otto", meaning: "husband (humble)", kind: "kanji", emoji: "💍", lesson: 60, sec: "7-2" },
  { term: "娘↓", reading: "むすめ", romaji: "musume", meaning: "daughter (humble)", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "息子↓", reading: "むすこ", romaji: "musuko", meaning: "son (humble)", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "おとな・大人", reading: "おとな", romaji: "otona", meaning: "adult", kind: "kanji", emoji: "🧑", lesson: 60, sec: "7-2" },
  { term: "こども・子供", reading: "こども", romaji: "kodomo", meaning: "child", kind: "kanji", emoji: "🧒", lesson: 60, sec: "7-2" },
  { term: "男の子", reading: "おとこのこ", romaji: "otokonoko", meaning: "boy", kind: "kanji", emoji: "👦", lesson: 60, sec: "7-2" },
  { term: "女の子", reading: "おんなのこ", romaji: "onnanoko", meaning: "girl", kind: "kanji", emoji: "👧", lesson: 60, sec: "7-2" },
  { term: "先輩", reading: "せんぱい", romaji: "senpai", meaning: "senior", kind: "kanji", emoji: "🎓", lesson: 60, sec: "7-2" },
  { term: "後輩", reading: "こうはい", romaji: "kouhai", meaning: "junior", kind: "kanji", emoji: "🎓", lesson: 60, sec: "7-2" },
  { term: "知り合い", reading: "しりあい", romaji: "shiriai", meaning: "acquaintance", kind: "kanji", emoji: "🤝", lesson: 60, sec: "7-2" },
  { term: "登る (-U; 登った)", reading: "のぼる", romaji: "noboru", meaning: "climb", kind: "kanji", emoji: "🧗", lesson: 60, sec: "7-2" },
  { term: "下る(-U; 下った)", reading: "くだる", romaji: "kudaru", meaning: "come/go down from", kind: "kanji", emoji: "🚪", lesson: 60, sec: "7-2" },
  { term: "走る (-U; 走った)", reading: "はしる", romaji: "hashiru", meaning: "run", kind: "kanji", emoji: "🏃", lesson: 60, sec: "7-2" },
  { term: "泳ぐ(-U; 泳いだ)", reading: "およぐ", romaji: "oyogu", meaning: "swim", kind: "kanji", emoji: "🏃", lesson: 60, sec: "7-2" },
  { term: "〜歳・才", reading: "さい", romaji: "sai", meaning: "classifier for naming age", kind: "kanji", emoji: "🔢", lesson: 60, sec: "7-2" },
  { term: "二十歳（はたち）", reading: "はたち", romaji: "hatachi", meaning: "20 years old", kind: "kanji", emoji: "🏺", lesson: 60, sec: "7-2" },
  { term: "ということは", reading: "ということは", romaji: "toiukotowa", meaning: "that is to say", kind: "hiragana", emoji: "💬", lesson: 60, sec: "7-2" },
  { term: "行くんだ", reading: "いくんだ", romaji: "ikunda.", meaning: "The fact is, I’m going", kind: "kanji", emoji: "💬", lesson: 60, sec: "7-2" },
  { term: "そうなんだ", reading: "そうなんだ", romaji: "sounanda.", meaning: "So that's it; I get it now", kind: "hiragana", emoji: "📍", lesson: 60, sec: "7-2" },
  { term: "試験", reading: "しけん", romaji: "shiken", meaning: "test", kind: "kanji", emoji: "📝", lesson: 60, sec: "7-3" },
  { term: "遅れる (-RU; 遅れた)", reading: "おくれる", romaji: "okureru", meaning: "become late, run late", kind: "kanji", emoji: "⏱️", lesson: 60, sec: "7-3" },
  { term: "珍しい", reading: "めずらしい", romaji: "mezurashii", meaning: "unusual, rare", kind: "kanji", emoji: "💎", lesson: 60, sec: "7-3" },
  { term: "厳しい", reading: "きびしい", romaji: "kibishii", meaning: "strict, severe, intense", kind: "kanji", emoji: "😣", lesson: 60, sec: "7-3" },
  { term: "かなり", reading: "かなり", romaji: "kanari", meaning: "quite, considerably", kind: "hiragana", emoji: "📊", lesson: 60, sec: "7-3" },
  { term: "そうか", reading: "そうか", romaji: "souka.", meaning: "I see", kind: "hiragana", emoji: "👀", lesson: 60, sec: "7-3" },
  { term: "どうして", reading: "どうして", romaji: "doushite", meaning: "why", kind: "hiragana", emoji: "❓", lesson: 60, sec: "7-3" },
  { term: "何故・なぜ", reading: "なぜ", romaji: "naze", meaning: "why", kind: "kanji", emoji: "❓", lesson: 60, sec: "7-3" },
  { term: "なんで", reading: "なんで", romaji: "nande", meaning: "why", kind: "hiragana", emoji: "❓", lesson: 60, sec: "7-3" },
  { term: "このあいだ", reading: "このあいだ", romaji: "konoaida", meaning: "the other day, recently", kind: "hiragana", emoji: "📅", lesson: 60, sec: "7-4" },
  { term: "（ご）迷惑（な）・（する）", reading: "めいわく", romaji: "meiwaku", meaning: "trouble, bother", kind: "kanji", emoji: "😖", lesson: 60, sec: "7-4" },
  { term: "（お）加減", reading: "かげん", romaji: "kagen", meaning: "personal condition", kind: "kanji", emoji: "🩺", lesson: 60, sec: "7-4" },
  { term: "具合", reading: "ぐあい", romaji: "guai", meaning: "condition", kind: "kanji", emoji: "🩺", lesson: 60, sec: "7-4" },
  { term: "（お）大事（な）", reading: "だいじ", romaji: "daiji", meaning: "important, valuable", kind: "kanji", emoji: "❗", lesson: 60, sec: "7-4" },
  { term: "かける (-RU; かけた)", reading: "かける (-RU; かけた)", romaji: "kakeru", meaning: "cause (lit. ‘hang X’; Act 11 suspend, wear (glasses, buttons); Act 14 put on top (sauce); Act 18 lock", kind: "hiragana", emoji: "👕", lesson: 60, sec: "7-4" },
  { term: "思う (-U; 思った)", reading: "おもう", romaji: "omou", meaning: "think", kind: "kanji", emoji: "💭", lesson: 60, sec: "7-4" },
  { term: "楽しい", reading: "たのしい", romaji: "tanoshii", meaning: "fun", kind: "kanji", emoji: "😊", lesson: 60, sec: "7-4" },
  { term: "悪い", reading: "わるい", romaji: "warui", meaning: "bad", kind: "kanji", emoji: "👎", lesson: 60, sec: "7-4" },
  { term: "具合がいい・悪い", reading: "ぐあいが", romaji: "guaiga", meaning: "be in a good/bad condition", kind: "kanji", emoji: "👍", lesson: 60, sec: "7-4" },
  { term: "（ご）迷惑をかける", reading: "めいわくをかける", romaji: "meiwakuwokakeru", meaning: "cause someone trouble", kind: "kanji", emoji: "😖", lesson: 60, sec: "7-4" },
  { term: "（ご）迷惑になる", reading: "めいわくになる", romaji: "meiwakuninaru", meaning: "become an annoyance", kind: "kanji", emoji: "🚶", lesson: 60, sec: "7-4" },
  { term: "とんでもない", reading: "とんでもない", romaji: "tondemonai", meaning: "not at all", kind: "hiragana", emoji: "🙅", lesson: 60, sec: "7-4" },
  { term: "おかげさまで", reading: "おかげさまで", romaji: "okagesamade", meaning: "thanks to you", kind: "hiragana", emoji: "🙏", lesson: 60, sec: "7-4" },
  { term: "お大事に", reading: "おだいじに", romaji: "odaijini", meaning: "take care", kind: "kanji", emoji: "🙏", lesson: 60, sec: "7-4" },
  { term: "歩き", reading: "あるき", romaji: "aruki", meaning: "walk", kind: "kanji", emoji: "🚶", lesson: 60, sec: "7-5" },
  { term: "集まる (-U; 集まった)", reading: "あつまる", romaji: "atsumaru", meaning: "get together, assemble", kind: "kanji", emoji: "👥", lesson: 60, sec: "7-5" },
  { term: "降る (-U; 降った)", reading: "ふる", romaji: "furu", meaning: "precipitate, fall (i.e., rain)", kind: "kanji", emoji: "🍁", lesson: 60, sec: "7-5" },
  { term: "同じX", reading: "おなじ", romaji: "onaji", meaning: "the same X", kind: "kanji", emoji: "🔀", lesson: 60, sec: "7-5" },
  { term: "それに", reading: "それに", romaji: "soreni", meaning: "what’s more, besides", kind: "hiragana", emoji: "↪️", lesson: 60, sec: "7-5" },
  { term: "ほかに", reading: "ほかに", romaji: "hokani", meaning: "in addition, besides", kind: "hiragana", emoji: "↪️", lesson: 60, sec: "7-5" },
  { term: "歩く人", reading: "あるくひと", romaji: "arukuhito", meaning: "people who (will) walk", kind: "kanji", emoji: "🧍", lesson: 60, sec: "7-5" },
  { term: "タウンシネマ", reading: "タウンシネマ", romaji: "taunshinema", meaning: "Town Cinema", kind: "katakana", emoji: "🏙️", lesson: 60, sec: "7-6" },
  { term: "映画館", reading: "えいがかん", romaji: "eigakan", meaning: "movie theater", kind: "kanji", emoji: "🎬", lesson: 60, sec: "7-6" },
  { term: "通り", reading: "とおり", romaji: "toori", meaning: "way, road, street", kind: "kanji", emoji: "🏙️", lesson: 60, sec: "7-6" },
  { term: "（この・その・あの）辺", reading: "へん", romaji: "hen", meaning: "(this/that/that) area, vicinity", kind: "kanji", emoji: "📍", lesson: 60, sec: "7-6" },
  { term: "まっすぐ", reading: "まっすぐ", romaji: "massugu", meaning: "straight", kind: "hiragana", emoji: "⬆️", lesson: 60, sec: "7-6" },
  { term: "交差点", reading: "こうさてん", romaji: "kousaten", meaning: "intersection", kind: "kanji", emoji: "🚦", lesson: 60, sec: "7-6" },
  { term: "信号", reading: "しんごう", romaji: "shingou", meaning: "traffic light", kind: "kanji", emoji: "💡", lesson: 60, sec: "7-6" },
  { term: "突き当たり", reading: "つきあたり", romaji: "tsukiatari", meaning: "end (of a street, hallway, etc.)", kind: "kanji", emoji: "🏙️", lesson: 60, sec: "7-6" },
  { term: "角", reading: "かど", romaji: "kado", meaning: "corner", kind: "kanji", emoji: "📐", lesson: 60, sec: "7-6" },
  { term: "ナビ", reading: "ナビ", romaji: "nabi", meaning: "GPS, navigator", kind: "katakana", emoji: "🔤", lesson: 60, sec: "7-6" },
  { term: "変（な）", reading: "へん", romaji: "hen", meaning: "weird, odd, strange", kind: "kanji", emoji: "🤨", lesson: 60, sec: "7-6" },
  { term: "ほんと", reading: "ほんと", romaji: "honto", meaning: "short, informal form of ほんとう", kind: "hiragana", emoji: "📏", lesson: 60, sec: "7-6" },
  { term: "薬局", reading: "やっきょく", romaji: "yakkyoku", meaning: "pharmacy", kind: "kanji", emoji: "💊", lesson: 60, sec: "7-6" },
  { term: "交番", reading: "こうばん", romaji: "kouban", meaning: "police box", kind: "kanji", emoji: "👮", lesson: 60, sec: "7-6" },
  { term: "服部スーパー", reading: "はっとりすぱ", romaji: "hattorisu-pa-", meaning: "Hattori Supermarket", kind: "kanji", emoji: "🏬", lesson: 60, sec: "7-6" },
  { term: "マンション", reading: "マンション", romaji: "manshon", meaning: "condominium", kind: "katakana", emoji: "🔤", lesson: 60, sec: "7-6" },
  { term: "間", reading: "あいだ", romaji: "aida", meaning: "interval, space between", kind: "kanji", emoji: "🔗", lesson: 60, sec: "7-6" },
  { term: "曲がる (-U; 曲がった)", reading: "まがる", romaji: "magaru", meaning: "turn, make a turn", kind: "kanji", emoji: "🔨", lesson: 60, sec: "7-6" },
  { term: "戻る (-U; 戻った)", reading: "もどる", romaji: "modoru", meaning: "go back", kind: "kanji", emoji: "🚪", lesson: 60, sec: "7-6" },
  { term: "着く(-U; 着いた)", reading: "つく", romaji: "tsuku", meaning: "arrive", kind: "kanji", emoji: "🚪", lesson: 60, sec: "7-6" },
  { term: "おかしい", reading: "おかしい", romaji: "okashii", meaning: "funny, weird, odd, strange", kind: "hiragana", emoji: "🤨", lesson: 60, sec: "7-6" },
  { term: "危ない", reading: "あぶない", romaji: "abunai", meaning: "dangerous", kind: "kanji", emoji: "⚠️", lesson: 60, sec: "7-6" },
  { term: "まさか", reading: "まさか", romaji: "masaka", meaning: "No way. Never. (interjection)", kind: "hiragana", emoji: "❌", lesson: 60, sec: "7-6" },
  { term: "何とかスーパー", reading: "なんとかすぱ", romaji: "nantokasu-pa-", meaning: "so-and-so/such-and-such/something-or-other supermarket", kind: "kanji", emoji: "🏬", lesson: 60, sec: "7-6" },
  { term: "X と Y の間", reading: "あいだ", romaji: "aida", meaning: "between X and Y", kind: "kanji", emoji: "🔗", lesson: 60, sec: "7-6" },
  { term: "月", reading: "つき", romaji: "tsuki", meaning: "moon, month", kind: "kanji", emoji: "🗓️", lesson: 60, sec: "7-8R" },
  { term: "時・とき", reading: "とき", romaji: "toki", meaning: "time", kind: "kanji", emoji: "🕐", lesson: 60, sec: "7-9R" },
  { term: "日時", reading: "にちじ", romaji: "nichiji", meaning: "date and time", kind: "kanji", emoji: "🕐", lesson: 60, sec: "7-9R" },
  { term: "類は友を呼ぶ", reading: "るいわともをよぶ", romaji: "ruiwatomowoyobu", meaning: "Birds of a feather flock together", kind: "kanji", emoji: "🐦", lesson: 61, sec: "8-0" },
  { term: "（お）誕生日", reading: "たんじょうび", romaji: "tanjoubi", meaning: "birthday", kind: "kanji", emoji: "🎂", lesson: 61, sec: "8-1" },
  { term: "（ご）卒業（する）", reading: "そつぎょう", romaji: "sotsugyou", meaning: "graduation", kind: "kanji", emoji: "🎓", lesson: 61, sec: "8-1" },
  { term: "（ご）結婚（する）", reading: "けっこん", romaji: "kekkon", meaning: "wedding, marriage", kind: "kanji", emoji: "💍", lesson: 61, sec: "8-1" },
  { term: "（ご）就職（する）", reading: "しゅうしょく", romaji: "shuushoku", meaning: "employment, getting a job", kind: "kanji", emoji: "💼", lesson: 61, sec: "8-1" },
  { term: "目覚まし（時計）", reading: "めざましどけい", romaji: "mezamashi（dokei）", meaning: "alarm (clock)", kind: "kanji", emoji: "⏰", lesson: 61, sec: "8-1" },
  { term: "声", reading: "こえ", romaji: "koe", meaning: "voice", kind: "kanji", emoji: "🗣️", lesson: 61, sec: "8-1" },
  { term: "音", reading: "おと", romaji: "oto", meaning: "sound", kind: "kanji", emoji: "🔊", lesson: 61, sec: "8-1" },
  { term: "毎日", reading: "まいにち", romaji: "mainichi", meaning: "every day", kind: "kanji", emoji: "📅", lesson: 61, sec: "8-1" },
  { term: "毎週", reading: "まいしゅう", romaji: "maishuu", meaning: "every week", kind: "kanji", emoji: "🗓️", lesson: 61, sec: "8-1" },
  { term: "毎月", reading: "まいつき", romaji: "maitsuki", meaning: "every month", kind: "kanji", emoji: "🗓️", lesson: 61, sec: "8-1" },
  { term: "毎時間", reading: "まいじかん", romaji: "maijikan", meaning: "every hour", kind: "kanji", emoji: "🕐", lesson: 61, sec: "8-1" },
  { term: "毎学期", reading: "まいがっき", romaji: "maigakki", meaning: "every academic term, semester", kind: "kanji", emoji: "📅", lesson: 61, sec: "8-1" },
  { term: "毎年", reading: "まいとし", romaji: "maitoshi", meaning: "every year", kind: "kanji", emoji: "🗓️", lesson: 61, sec: "8-1" },
  { term: "毎回", reading: "まいかい", romaji: "maikai", meaning: "every time", kind: "kanji", emoji: "🕐", lesson: 61, sec: "8-1" },
  { term: "毎朝", reading: "まいあさ", romaji: "maiasa", meaning: "every morning", kind: "kanji", emoji: "🌅", lesson: 61, sec: "8-1" },
  { term: "毎晩", reading: "まいばん", romaji: "maiban", meaning: "every evening", kind: "kanji", emoji: "🌙", lesson: 61, sec: "8-1" },
  { term: "開ける (-RU; 開けた)", reading: "あける", romaji: "akeru", meaning: "open X", kind: "kanji", emoji: "🔘", lesson: 61, sec: "8-1" },
  { term: "当たる (-U: 当たった)", reading: "あたる", romaji: "ataru", meaning: "hit on target", kind: "kanji", emoji: "🎯", lesson: 61, sec: "8-1" },
  { term: "起きる(-RU; 起きた)", reading: "おきる", romaji: "okiru", meaning: "wake up, rise", kind: "kanji", emoji: "⏰", lesson: 61, sec: "8-1" },
  { term: "寝る (-RU; 寝た)", reading: "ねる", romaji: "neru", meaning: "sleep, go to bed, lie down", kind: "kanji", emoji: "🛏️", lesson: 61, sec: "8-1" },
  { term: "欲しい (欲しくて)", reading: "ほしい", romaji: "hoshii", meaning: "want", kind: "kanji", emoji: "🙋", lesson: 61, sec: "8-1" },
  { term: "開けてみる", reading: "あけてみる", romaji: "aketemiru", meaning: "try opening and see", kind: "kanji", emoji: "👀", lesson: 61, sec: "8-1" },
  { term: "当たり", reading: "あたり", romaji: "atari", meaning: "right (on target)!; you got it!", kind: "kanji", emoji: "🎯", lesson: 61, sec: "8-1" },
  { term: "こんなの", reading: "こんなの", romaji: "konnano", meaning: "this kind (of thing)", kind: "hiragana", emoji: "🤝", lesson: 61, sec: "8-1" },
  { term: "バッチリ", reading: "バッチリ", romaji: "bacchiri", meaning: "perfectly, properly, sure thing (informal)", kind: "katakana", emoji: "👌", lesson: 61, sec: "8-1" },
  { term: "一人で", reading: "ひとりで", romaji: "hitoride", meaning: "by oneself, alone (lit. 'as one person')", kind: "kanji", emoji: "🧍", lesson: 61, sec: "8-1" },
  { term: "なかなか〜ない", reading: "なかなか〜ない", romaji: "nakanaka〜nai", meaning: "quite, considerably, rather", kind: "hiragana", emoji: "📊", lesson: 61, sec: "8-1" },
  { term: "いろいろ（な）", reading: "いろいろ（な）", romaji: "iroiro", meaning: "various", kind: "hiragana", emoji: "🔀", lesson: 61, sec: "8-1" },
  { term: "ちゃんと", reading: "ちゃんと", romaji: "chanto", meaning: "properly, reliably, satisfactorily", kind: "hiragana", emoji: "👌", lesson: 61, sec: "8-1" },
  { term: "（お）忘れ物", reading: "わすれもの", romaji: "wasuremono", meaning: "forgotten thing", kind: "kanji", emoji: "🧳", lesson: 61, sec: "8-2" },
  { term: "切符", reading: "きっぷ", romaji: "kippu", meaning: "ticket(s)", kind: "kanji", emoji: "🎫", lesson: 61, sec: "8-2" },
  { term: "嘘", reading: "うそ", romaji: "uso", meaning: "lie", kind: "kanji", emoji: "🤥", lesson: 61, sec: "8-2" },
  { term: "（ご）冗談", reading: "じょうだん", romaji: "joudan", meaning: "joke", kind: "kanji", emoji: "🤣", lesson: 61, sec: "8-2" },
  { term: "嫌（な）", reading: "いや", romaji: "iya", meaning: "disagreeable, unpleasant", kind: "kanji", emoji: "😖", lesson: 61, sec: "8-2" },
  { term: "話題", reading: "わだい", romaji: "wadai", meaning: "subject, topic of conversation", kind: "kanji", emoji: "💬", lesson: 61, sec: "8-2" },
  { term: "忘れる (-RU; 忘れた)", reading: "わすれる", romaji: "wasureru", meaning: "forget", kind: "kanji", emoji: "💭", lesson: 61, sec: "8-2" },
  { term: "覚える (-RU; 覚えた)", reading: "おぼえる", romaji: "oboeru", meaning: "remember, memorize", kind: "kanji", emoji: "💭", lesson: 61, sec: "8-2" },
  { term: "笑う (-U; 笑った)", reading: "わらう", romaji: "warau", meaning: "laugh", kind: "kanji", emoji: "😂", lesson: 61, sec: "8-2" },
  { term: "泣く (-U; 泣いた)", reading: "なく", romaji: "naku", meaning: "cry, weep", kind: "kanji", emoji: "😢", lesson: 61, sec: "8-2" },
  { term: "晴れる(-RU; 晴れた)", reading: "はれる", romaji: "hareru", meaning: "clear up (of weather)", kind: "kanji", emoji: "🌡️", lesson: 61, sec: "8-2" },
  { term: "曇る (-U; 曇った)", reading: "くもる", romaji: "kumoru", meaning: "get cloudy", kind: "kanji", emoji: "☁️", lesson: 61, sec: "8-2" },
  { term: "変える(-RU; 変えた)", reading: "かえる", romaji: "kaeru", meaning: "change X", kind: "kanji", emoji: "🔄", lesson: 61, sec: "8-2" },
  { term: "そんなに", reading: "そんなに", romaji: "sonnani", meaning: "to that extent; so/such a X", kind: "hiragana", emoji: "📏", lesson: 61, sec: "8-2" },
  { term: "（お）邪魔（する）", reading: "じゃま", romaji: "jama", meaning: "a bother, a nuisance, an obstacle", kind: "kanji", emoji: "😖", lesson: 61, sec: "8-3" },
  { term: "（ご）遠慮（する）", reading: "えんりょ", romaji: "enryo", meaning: "restraint", kind: "kanji", emoji: "🙅", lesson: 61, sec: "8-3" },
  { term: "（ご）ゆっくり", reading: "（ご）ゆっくり", romaji: "yukkuri", meaning: "slow, relaxed", kind: "hiragana", emoji: "🤫", lesson: 61, sec: "8-3" },
  { term: "上がる (-U; 上がった)", reading: "あがる", romaji: "agaru", meaning: "rise, go up, enter a house", kind: "kanji", emoji: "🏠", lesson: 61, sec: "8-3" },
  { term: "ゆっくりする", reading: "ゆっくりする", romaji: "yukkurisuru", meaning: "relax, take it easy", kind: "hiragana", emoji: "😌", lesson: 61, sec: "8-3" },
  { term: "ようこそ", reading: "ようこそ", romaji: "youkoso", meaning: "welcome (greeting)", kind: "hiragana", emoji: "🚶", lesson: 61, sec: "8-3" },
  { term: "ご遠慮なく", reading: "ごえんりょなく", romaji: "goenryonaku", meaning: "without reservation", kind: "kanji", emoji: "🙅", lesson: 61, sec: "8-3" },
  { term: "お土産", reading: "おみやげ", romaji: "omiyage", meaning: "souvenir, gift", kind: "kanji", emoji: "🎁", lesson: 61, sec: "8-4" },
  { term: "ヨーロッパ", reading: "ヨーロッパ", romaji: "yo-roppa", meaning: "Europe", kind: "katakana", emoji: "🔤", lesson: 61, sec: "8-4" },
  { term: "アフリカ", reading: "アフリカ", romaji: "afurika", meaning: "Africa", kind: "katakana", emoji: "🔤", lesson: 61, sec: "8-4" },
  { term: "オーストラリア", reading: "オーストラリア", romaji: "o-sutoraria", meaning: "Australia", kind: "katakana", emoji: "🔤", lesson: 61, sec: "8-4" },
  { term: "（お）祝い", reading: "いわい", romaji: "iwai", meaning: "congratulations, celebration", kind: "kanji", emoji: "🎉", lesson: 61, sec: "8-4" },
  { term: "（お）菓子", reading: "かし", romaji: "kashi", meaning: "sweets, candy", kind: "kanji", emoji: "🍰", lesson: 61, sec: "8-4" },
  { term: "（ご）出身", reading: "しゅっしん", romaji: "shusshin", meaning: "birthplace", kind: "kanji", emoji: "🌏", lesson: 61, sec: "8-4" },
  { term: "ミズーリ", reading: "ミズーリ", romaji: "mizu-ri", meaning: "Missouri", kind: "katakana", emoji: "🔤", lesson: 61, sec: "8-4" },
  { term: "セントルイス", reading: "セントルイス", romaji: "sentoruisu", meaning: "Saint Louis", kind: "katakana", emoji: "🔤", lesson: 61, sec: "8-4" },
  { term: "（ご）両親", reading: "りょうしん", romaji: "ryoushin", meaning: "parents", kind: "kanji", emoji: "👪", lesson: 61, sec: "8-4" },
  { term: "喉", reading: "のど", romaji: "nodo", meaning: "throat", kind: "kanji", emoji: "👅", lesson: 61, sec: "8-4" },
  { term: "お腹", reading: "おなか", romaji: "onaka", meaning: "abdomen, stomach", kind: "kanji", emoji: "🍽️", lesson: 61, sec: "8-4" },
  { term: "住む (-U: 住んだ)", reading: "すむ", romaji: "sumu", meaning: "reside", kind: "kanji", emoji: "🏠", lesson: 61, sec: "8-4" },
  { term: "空く (-U; 空いた)", reading: "すく", romaji: "suku", meaning: "become empty", kind: "kanji", emoji: "🈳", lesson: 61, sec: "8-4" },
  { term: "〜度", reading: "ど", romaji: "do", meaning: "times, degrees", kind: "kanji", emoji: "🔢", lesson: 61, sec: "8-4" },
  { term: "わざわざ", reading: "わざわざ", romaji: "wazawaza", meaning: "specially", kind: "hiragana", emoji: "⭐", lesson: 61, sec: "8-4" },
  { term: "いらしたこと", reading: "いらしたこと", romaji: "irashitakoto", meaning: "have gone; the experience of having gone", kind: "hiragana", emoji: "🚶", lesson: 61, sec: "8-4" },
  { term: "お茶を淹れる", reading: "おちゃをいれる", romaji: "ochawoireru", meaning: "brew or infuse tea", kind: "kanji", emoji: "🍵", lesson: 61, sec: "8-4" },
  { term: "喉が渇く", reading: "のどがかわく", romaji: "nodogakawaku", meaning: "get thirsty", kind: "kanji", emoji: "🥤", lesson: 61, sec: "8-4" },
  { term: "お腹が空く", reading: "おなかがすく", romaji: "onakagasuku", meaning: "get hungry", kind: "kanji", emoji: "🍽️", lesson: 61, sec: "8-4" },
  { term: "お構いなく", reading: "おかまいなく", romaji: "okamainaku", meaning: "don’t go to any bother", kind: "kanji", emoji: "🚪", lesson: 61, sec: "8-4" },
  { term: "優しそう（な）", reading: "やさしそう", romaji: "yasashisou", meaning: "looks nice, looks kind", kind: "kanji", emoji: "👍", lesson: 61, sec: "8-5" },
  { term: "元気（な）", reading: "げんき", romaji: "genki", meaning: "healthy, energetic", kind: "kanji", emoji: "💪", lesson: 61, sec: "8-5" },
  { term: "元気そう（な）", reading: "げんきそう", romaji: "genkisou", meaning: "looks healthy, energetic", kind: "kanji", emoji: "💪", lesson: 61, sec: "8-5" },
  { term: "真面目（な）", reading: "まじめ", romaji: "majime", meaning: "diligent, serious", kind: "kanji", emoji: "🤓", lesson: 61, sec: "8-5" },
  { term: "真面目そう（な）", reading: "まじめそう", romaji: "majimesou", meaning: "looks diligent, serious", kind: "kanji", emoji: "🤓", lesson: 61, sec: "8-5" },
  { term: "親切（な）", reading: "しんせつ", romaji: "shinsetsu", meaning: "kind, gentle", kind: "kanji", emoji: "🤝", lesson: 61, sec: "8-5" },
  { term: "親切そう（な）", reading: "しんせつそう", romaji: "shinsetsusou", meaning: "looks kind", kind: "kanji", emoji: "🤝", lesson: 61, sec: "8-5" },
  { term: "面倒（な）", reading: "めんどう", romaji: "mendou", meaning: "trouble(some), care, attention", kind: "kanji", emoji: "😖", lesson: 61, sec: "8-5" },
  { term: "面倒そう（な）", reading: "めんどうそう", romaji: "mendousou", meaning: "looks troublesome", kind: "kanji", emoji: "😣", lesson: 61, sec: "8-5" },
  { term: "結構（な）", reading: "けっこう", romaji: "kekkou", meaning: "nice, wonderful, quite, enough, sufficient (often by implication ‘no thank you’)", kind: "kanji", emoji: "👍", lesson: 61, sec: "8-5" },
  { term: "初めて", reading: "はじめて", romaji: "hajimete", meaning: "first time", kind: "kanji", emoji: "🕐", lesson: 61, sec: "8-5" },
  { term: "大切（な）", reading: "たいせつ", romaji: "taisetsu", meaning: "important, necessary", kind: "kanji", emoji: "❗", lesson: 61, sec: "8-5" },
  { term: "（お）客（様）", reading: "きゃく", romaji: "kyaku", meaning: "guest, customer, client", kind: "kanji", emoji: "🙇", lesson: 61, sec: "8-5" },
  { term: "親", reading: "おや", romaji: "oya", meaning: "parent", kind: "kanji", emoji: "👪", lesson: 61, sec: "8-5" },
  { term: "母親", reading: "ははおや", romaji: "hahaoya", meaning: "mother", kind: "kanji", emoji: "👩", lesson: 61, sec: "8-5" },
  { term: "父親", reading: "ちちおや", romaji: "chichioya", meaning: "father", kind: "kanji", emoji: "👨", lesson: 61, sec: "8-5" },
  { term: "確か（な）", reading: "たしか", romaji: "tashika", meaning: "sure, certain", kind: "kanji", emoji: "✔️", lesson: 61, sec: "8-5" },
  { term: "優しい", reading: "やさしい", romaji: "yasashii", meaning: "kind, nice, gentle", kind: "kanji", emoji: "👍", lesson: 61, sec: "8-5" },
  { term: "恐い・怖い", reading: "こわい", romaji: "kowai", meaning: "scary, frightening", kind: "kanji", emoji: "😨", lesson: 61, sec: "8-5" },
  { term: "うるさい", reading: "うるさい", romaji: "urusai", meaning: "annoying, loud, noisy, tiresome", kind: "hiragana", emoji: "😖", lesson: 61, sec: "8-5" },
  { term: "やかましい", reading: "やかましい", romaji: "yakamashii", meaning: "noisy, boisterous, annoying", kind: "hiragana", emoji: "😤", lesson: 61, sec: "8-5" },
  { term: "めんどくさい", reading: "めんどくさい", romaji: "mendokusai", meaning: "bothersome, tiresome", kind: "hiragana", emoji: "😖", lesson: 61, sec: "8-5" },
  { term: "実は", reading: "じつ", romaji: "jitsu", meaning: "actually, in fact", kind: "kanji", emoji: "💡", lesson: 61, sec: "8-5" },
  { term: "確かに", reading: "たしか", romaji: "tashika", meaning: "for sure, certainly", kind: "kanji", emoji: "✔️", lesson: 61, sec: "8-5" },
  { term: "相槌", reading: "あいづち", romaji: "aiduchi", meaning: "interjections to indicate one is listening (BTS 14)", kind: "kanji", emoji: "👂", lesson: 61, sec: "8-5" },
  { term: "夏休み", reading: "なつやすみ", romaji: "natsuyasumi", meaning: "summer vacation/holiday", kind: "kanji", emoji: "🌻", lesson: 61, sec: "8-6" },
  { term: "休暇", reading: "きゅうか", romaji: "kyuuka", meaning: "break, holiday", kind: "kanji", emoji: "🏖️", lesson: 61, sec: "8-6" },
  { term: "暇（な）", reading: "ひま", romaji: "hima", meaning: "free (time)", kind: "kanji", emoji: "🕐", lesson: 61, sec: "8-6" },
  { term: "出張", reading: "しゅっちょう", romaji: "shucchou", meaning: "business trip", kind: "kanji", emoji: "🧳", lesson: 61, sec: "8-6" },
  { term: "親孝行", reading: "おやこうこう", romaji: "oyakoukou", meaning: "filial piety (a Confucian virtue); dedication to parents", kind: "kanji", emoji: "🙇", lesson: 61, sec: "8-6" },
  { term: "親不孝", reading: "おやふこう", romaji: "oyafukou", meaning: "lack of filial piety", kind: "kanji", emoji: "🙇", lesson: 61, sec: "8-6" },
  { term: "〜回", reading: "かい", romaji: "kai", meaning: "times, instances", kind: "kanji", emoji: "🔢", lesson: 61, sec: "8-6" },
  { term: "休みの時", reading: "やすみのとき", romaji: "yasuminotoki", meaning: "during one’s vacation; when one is on vacation", kind: "kanji", emoji: "🏖️", lesson: 61, sec: "8-6" },
  { term: "必ず", reading: "かならず", romaji: "kanarazu", meaning: "without fail, always, without exception", kind: "kanji", emoji: "💯", lesson: 61, sec: "8-6" },
  { term: "大抵", reading: "たいてい", romaji: "taitei", meaning: "usually, as a rule", kind: "kanji", emoji: "📊", lesson: 61, sec: "8-6" },
  { term: "時々", reading: "ときどき", romaji: "tokidoki", meaning: "sometimes", kind: "kanji", emoji: "🔁", lesson: 61, sec: "8-6" },
  { term: "たまに", reading: "たまに", romaji: "tamani", meaning: "once in a while", kind: "hiragana", emoji: "🕐", lesson: 61, sec: "8-6" },
  { term: "夏休みの間", reading: "なつやすみのあいだ", romaji: "natsuyasuminoaida", meaning: "during summer vacation", kind: "kanji", emoji: "🌻", lesson: 61, sec: "8-6" },
  { term: "年に二、三回", reading: "ねににさんかい", romaji: "nenini、sankai", meaning: "two or three times a year", kind: "kanji", emoji: "🗓️", lesson: 61, sec: "8-6" },
  { term: "本日", reading: "ほんじつ", romaji: "honjitsu", meaning: "today (formal)", kind: "kanji", emoji: "📍", lesson: 61, sec: "8-7R" },
  { term: "ベトナム語", reading: "べとなむご", romaji: "betonamugo", meaning: "Vietnamese (language)", kind: "kanji", emoji: "🈁", lesson: 61, sec: "8-8R" },
  { term: "タイ語", reading: "たいご", romaji: "taigo", meaning: "Thai (language)", kind: "kanji", emoji: "🈁", lesson: 61, sec: "8-8R" },
  { term: "インドネシア語", reading: "いんどねしあご", romaji: "indoneshiago", meaning: "Indonesian (language)", kind: "kanji", emoji: "🈁", lesson: 61, sec: "8-8R" },
  { term: "大学生", reading: "だいがくせい", romaji: "daigakusei", meaning: "university student", kind: "kanji", emoji: "🧑‍🎓", lesson: 61, sec: "8-9R" },
  { term: "好きこそものの上手なれ", reading: "すきこそもののじょうずなれ", romaji: "sukikosomononojouzunare", meaning: "What one likes, one does well", kind: "kanji", emoji: "💪", lesson: 62, sec: "9-0" },
  { term: "ゴミ", reading: "ゴミ", romaji: "gomi", meaning: "trash, garbage", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-1" },
  { term: "掃除（する）", reading: "そうじ", romaji: "souji", meaning: "cleaning", kind: "kanji", emoji: "🧹", lesson: 62, sec: "9-1" },
  { term: "整理（する）", reading: "せいり", romaji: "seiri", meaning: "sorting, putting in order", kind: "kanji", emoji: "🔟", lesson: 62, sec: "9-1" },
  { term: "洗濯（する）", reading: "せんたく", romaji: "sentaku", meaning: "laundry", kind: "kanji", emoji: "🧹", lesson: 62, sec: "9-1" },
  { term: "袋", reading: "ふくろ", romaji: "fukuro", meaning: "bag", kind: "kanji", emoji: "👜", lesson: 62, sec: "9-1" },
  { term: "捨てる (-RU; 捨てた)", reading: "すてる", romaji: "suteru", meaning: "throw away", kind: "kanji", emoji: "🗑️", lesson: 62, sec: "9-1" },
  { term: "洗う(-U; 洗った)", reading: "あらう", romaji: "arau", meaning: "wash", kind: "kanji", emoji: "🧹", lesson: 62, sec: "9-1" },
  { term: "謝る(-U; 謝った)", reading: "あやまる", romaji: "ayamaru", meaning: "apologize", kind: "kanji", emoji: "🙇", lesson: 62, sec: "9-1" },
  { term: "置く (-U: 置いた)", reading: "おく", romaji: "oku", meaning: "put, place, position", kind: "kanji", emoji: "📦", lesson: 62, sec: "9-1" },
  { term: "掃除したの誰", reading: "そうじしたのだれ", romaji: "soujishitanodare", meaning: "Who is it that cleaned up?", kind: "kanji", emoji: "❓", lesson: 62, sec: "9-1" },
  { term: "まったく", reading: "まったく", romaji: "mattaku", meaning: "good grief (expression of exasperation)", kind: "hiragana", emoji: "👍", lesson: 62, sec: "9-1" },
  { term: "半分", reading: "はんぶん", romaji: "hanbun", meaning: "half (of something)", kind: "kanji", emoji: "🌗", lesson: 62, sec: "9-2" },
  { term: "点", reading: "てん", romaji: "ten", meaning: "point(s), score", kind: "kanji", emoji: "🎯", lesson: 62, sec: "9-2" },
  { term: "パーセント", reading: "パーセント", romaji: "pa-sento", meaning: "percent", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-2" },
  { term: "終わり", reading: "おわり", romaji: "owari", meaning: "the end", kind: "kanji", emoji: "🔘", lesson: 62, sec: "9-2" },
  { term: "お昼", reading: "おひる", romaji: "ohiru", meaning: "noon, lunch time", kind: "kanji", emoji: "🍚", lesson: 62, sec: "9-2" },
  { term: "夕方", reading: "ゆうがた", romaji: "yuugata", meaning: "evening", kind: "kanji", emoji: "🌙", lesson: 62, sec: "9-2" },
  { term: "行く (-U; 行った )", reading: "いく", romaji: "iku", meaning: "cover (as in a task)", kind: "kanji", emoji: "❓", lesson: 62, sec: "9-2" },
  { term: "片付く (-U; 片付いた)", reading: "かたづく", romaji: "kataduku", meaning: "be in order; be finished; be taken care of", kind: "kanji", emoji: "🔟", lesson: 62, sec: "9-2" },
  { term: "三分の一", reading: "さんぶんのいち", romaji: "sanbunnoichi", meaning: "one-third", kind: "kanji", emoji: "🔟", lesson: 62, sec: "9-2" },
  { term: "だいぶ", reading: "だいぶ", romaji: "daibu", meaning: "a fair amount", kind: "hiragana", emoji: "📊", lesson: 62, sec: "9-2" },
  { term: "さ、さあ", reading: "さ、さあ", romaji: "sa、saa", meaning: "well, well now, so, go on", kind: "hiragana", emoji: "📍", lesson: 62, sec: "9-2" },
  { term: "どんどん", reading: "どんどん", romaji: "dondon", meaning: "rapidly, steadily", kind: "hiragana", emoji: "⚡", lesson: 62, sec: "9-2" },
  { term: "ちょうど", reading: "ちょうど", romaji: "choudo", meaning: "exactly, precisely, just", kind: "hiragana", emoji: "🎯", lesson: 62, sec: "9-2" },
  { term: "食べに行く", reading: "たべにいく", romaji: "tabeniiku", meaning: "go to eat", kind: "kanji", emoji: "🍴", lesson: 62, sec: "9-2" },
  { term: "乾杯（する）", reading: "かんぱい", romaji: "kanpai", meaning: "toast", kind: "kanji", emoji: "🍞", lesson: 62, sec: "9-3" },
  { term: "事務所", reading: "じむしょ", romaji: "jimusho", meaning: "(business) office", kind: "kanji", emoji: "🏢", lesson: 62, sec: "9-3" },
  { term: "研究所", reading: "けんきゅうしょ", romaji: "kenkyuusho", meaning: "research institute", kind: "kanji", emoji: "🔬", lesson: 62, sec: "9-3" },
  { term: "公務員", reading: "こうむいん", romaji: "koumuin", meaning: "public servant, government worker", kind: "kanji", emoji: "💼", lesson: 62, sec: "9-3" },
  { term: "会社員", reading: "かいしゃいん", romaji: "kaishain", meaning: "company employee", kind: "kanji", emoji: "🏢", lesson: 62, sec: "9-3" },
  { term: "アルバイト（する）", reading: "アルバイト（する）", romaji: "arubaito", meaning: "part-time work, part-timer", kind: "hiragana", emoji: "🕐", lesson: 62, sec: "9-3" },
  { term: "フリーランス", reading: "フリーランス", romaji: "furi-ransu", meaning: "freelance, freelancer", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-3" },
  { term: "弁護士", reading: "べんごし", romaji: "bengoshi", meaning: "lawyer, attorney", kind: "kanji", emoji: "⚖️", lesson: 62, sec: "9-3" },
  { term: "エンジニア", reading: "エンジニア", romaji: "enjinia", meaning: "engineer", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-3" },
  { term: "フリーター", reading: "フリーター", romaji: "furi-ta-", meaning: "non-permanent worker", kind: "katakana", emoji: "💼", lesson: 62, sec: "9-3" },
  { term: "旅行（する）", reading: "りょこう", romaji: "ryokou", meaning: "travel", kind: "kanji", emoji: "🧳", lesson: 62, sec: "9-3" },
  { term: "関係（する）", reading: "かんけい", romaji: "kankei", meaning: "relationship", kind: "kanji", emoji: "🔗", lesson: 62, sec: "9-3" },
  { term: "建築", reading: "けんちく", romaji: "kenchiku", meaning: "architecture", kind: "kanji", emoji: "🏛️", lesson: 62, sec: "9-3" },
  { term: "教育（する）", reading: "きょういく", romaji: "kyouiku", meaning: "education", kind: "kanji", emoji: "🎓", lesson: 62, sec: "9-3" },
  { term: "IT", reading: "IT", romaji: "aithi-", meaning: "IT", kind: "hiragana", emoji: "💻", lesson: 62, sec: "9-3" },
  { term: "法律", reading: "ほうりつ", romaji: "houritsu", meaning: "law", kind: "kanji", emoji: "⚖️", lesson: 62, sec: "9-3" },
  { term: "興味", reading: "きょうみ", romaji: "kyoumi", meaning: "interest", kind: "kanji", emoji: "🤔", lesson: 62, sec: "9-3" },
  { term: "分析（する）", reading: "ぶんせき", romaji: "bunseki", meaning: "analysis", kind: "kanji", emoji: "🔬", lesson: 62, sec: "9-3" },
  { term: "説明（する）", reading: "せつめい", romaji: "setsumei", meaning: "explanation", kind: "kanji", emoji: "🌏", lesson: 62, sec: "9-3" },
  { term: "遊び", reading: "あそび", romaji: "asobi", meaning: "play, fun", kind: "kanji", emoji: "😊", lesson: 62, sec: "9-3" },
  { term: "遊ぶ (-RU; 遊んだ)", reading: "あそぶ", romaji: "asobu", meaning: "play", kind: "kanji", emoji: "🎮", lesson: 62, sec: "9-3" },
  { term: "乾杯", reading: "かんぱい", romaji: "kanpai", meaning: "Cheers!", kind: "kanji", emoji: "🥂", lesson: 62, sec: "9-3" },
  { term: "X関係のY", reading: "かんけいの", romaji: "kankeino", meaning: "Y related to X", kind: "kanji", emoji: "🔗", lesson: 62, sec: "9-3" },
  { term: "Xに興味がある", reading: "きょうみがある", romaji: "kyoumigaaru", meaning: "have an interest in X", kind: "kanji", emoji: "🤔", lesson: 62, sec: "9-3" },
  { term: "国", reading: "くに", romaji: "kuni", meaning: "the nation", kind: "kanji", emoji: "🌏", lesson: 62, sec: "9-4" },
  { term: "四国", reading: "しこく", romaji: "shikoku", meaning: "Shikoku", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "本州", reading: "ほんしゅう", romaji: "honshuu", meaning: "Honshu", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "九州", reading: "きゅうしゅう", romaji: "kyuushuu", meaning: "Kyushu", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "北海道", reading: "ほっかいどう", romaji: "hokkaidou", meaning: "Hokkaido", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "沖縄", reading: "おきなわ", romaji: "okinawa", meaning: "Okinawa", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "松山", reading: "まつやま", romaji: "matsuyama", meaning: "Matsuyama (a city in Ehime Prefecture)", kind: "kanji", emoji: "🏙️", lesson: 62, sec: "9-4" },
  { term: "札幌", reading: "さっぽろ", romaji: "sapporo", meaning: "Sapporo", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "仙台", reading: "せんだい", romaji: "sendai", meaning: "Sendai", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "金沢", reading: "かなざわ", romaji: "kanazawa", meaning: "Kanazawa", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "福岡", reading: "ふくおか", romaji: "fukuoka", meaning: "Fukuoka", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "大阪", reading: "おおさか", romaji: "oosaka", meaning: "Osaka", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "京都", reading: "きょうと", romaji: "kyouto", meaning: "Kyoto", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "那覇", reading: "なは", romaji: "naha", meaning: "Naha", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "温泉", reading: "おんせん", romaji: "onsen", meaning: "hot spring", kind: "kanji", emoji: "🌸", lesson: 62, sec: "9-4" },
  { term: "リラックス（する）", reading: "リラックス（する）", romaji: "rirakkusu", meaning: "relax", kind: "hiragana", emoji: "😌", lesson: 62, sec: "9-4" },
  { term: "有名（な）", reading: "ゆうめい", romaji: "yuumei", meaning: "famous", kind: "kanji", emoji: "🌟", lesson: 62, sec: "9-4" },
  { term: "『坊ちゃん』", reading: "ぼっちゃん", romaji: "bocchan", meaning: "Botchan (novel by Natsume Soseki)", kind: "kanji", emoji: "📕", lesson: 62, sec: "9-4" },
  { term: "夏目漱石", reading: "なつめそうせき", romaji: "natsumesouseki", meaning: "Natsume Soseki (author, 1867-1916)", kind: "kanji", emoji: "✍️", lesson: 62, sec: "9-4" },
  { term: "X, Y, Z のうちで", reading: "X, Y, Z のうちで", romaji: "uchide", meaning: "among X, Y, and Z", kind: "hiragana", emoji: "🔢", lesson: 62, sec: "9-4" },
  { term: "三つのうちで", reading: "うちで", romaji: "uchide", meaning: "among three", kind: "kanji", emoji: "🔢", lesson: 62, sec: "9-4" },
  { term: "う〜ん", reading: "う〜ん", romaji: "u〜n", meaning: "u-m-m", kind: "hiragana", emoji: "💬", lesson: 62, sec: "9-4" },
  { term: "Xで有名", reading: "ゆうめい", romaji: "yuumei", meaning: "well-known for X", kind: "kanji", emoji: "💪", lesson: 62, sec: "9-4" },
  { term: "ますます", reading: "ますます", romaji: "masumasu", meaning: "more and more, less and less", kind: "hiragana", emoji: "📈", lesson: 62, sec: "9-4" },
  { term: "都道府県", reading: "とどうふけん", romaji: "todoufuken", meaning: "prefectures (BTS 11)", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-4" },
  { term: "趣味", reading: "しゅみ", romaji: "shumi", meaning: "hobby", kind: "kanji", emoji: "🎨", lesson: 62, sec: "9-5" },
  { term: "剣道", reading: "けんどう", romaji: "kendou", meaning: "kendo", kind: "kanji", emoji: "🥋", lesson: 62, sec: "9-5" },
  { term: "音楽", reading: "おんがく", romaji: "ongaku", meaning: "music", kind: "kanji", emoji: "🎵", lesson: 62, sec: "9-5" },
  { term: "スポーツ", reading: "スポーツ", romaji: "supo-tsu", meaning: "sport(s)", kind: "katakana", emoji: "🏃", lesson: 62, sec: "9-5" },
  { term: "（お）料理（する）", reading: "りょうり", romaji: "ryouri", meaning: "cooking", kind: "kanji", emoji: "🍳", lesson: 62, sec: "9-5" },
  { term: "読書", reading: "どくしょ", romaji: "dokusho", meaning: "reading", kind: "kanji", emoji: "📕", lesson: 62, sec: "9-5" },
  { term: "ゲーム", reading: "ゲーム", romaji: "ge-mu", meaning: "game(s)", kind: "katakana", emoji: "🎮", lesson: 62, sec: "9-5" },
  { term: "絵", reading: "え", romaji: "e", meaning: "drawing, picture", kind: "kanji", emoji: "📷", lesson: 62, sec: "9-5" },
  { term: "演歌", reading: "えんか", romaji: "enka", meaning: "enka (a popular ballad style of singing)", kind: "kanji", emoji: "🎤", lesson: 62, sec: "9-5" },
  { term: "歌", reading: "うた", romaji: "uta", meaning: "song", kind: "kanji", emoji: "🎵", lesson: 62, sec: "9-5" },
  { term: "ジャズ", reading: "ジャズ", romaji: "jazu", meaning: "jazz", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-5" },
  { term: "クラシック", reading: "クラシック", romaji: "kurashikku", meaning: "classical (music)", kind: "katakana", emoji: "🎵", lesson: 62, sec: "9-5" },
  { term: "無理（な）", reading: "むり", romaji: "muri", meaning: "impossible, unreasonable", kind: "kanji", emoji: "🚫", lesson: 62, sec: "9-5" },
  { term: "（お）風呂", reading: "ふろ", romaji: "furo", meaning: "bath", kind: "kanji", emoji: "🛁", lesson: 62, sec: "9-5" },
  { term: "シャワー", reading: "シャワー", romaji: "shawa-", meaning: "shower", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-5" },
  { term: "台所", reading: "だいどころ", romaji: "daidokoro", meaning: "kitchen", kind: "kanji", emoji: "🍳", lesson: 62, sec: "9-5" },
  { term: "庭", reading: "にわ", romaji: "niwa", meaning: "garden", kind: "kanji", emoji: "🌳", lesson: 62, sec: "9-5" },
  { term: "リビング", reading: "リビング", romaji: "ribingu", meaning: "living room", kind: "katakana", emoji: "🏠", lesson: 62, sec: "9-5" },
  { term: "洗面所", reading: "せんめんじょ", romaji: "senmenjo", meaning: "washroom", kind: "kanji", emoji: "🚪", lesson: 62, sec: "9-5" },
  { term: "玄関", reading: "げんかん", romaji: "genkan", meaning: "entry way", kind: "kanji", emoji: "🚪", lesson: 62, sec: "9-5" },
  { term: "自分", reading: "じぶん", romaji: "jibun", meaning: "oneself", kind: "kanji", emoji: "🙋", lesson: 62, sec: "9-5" },
  { term: "弾く (-U; 弾いた)", reading: "ひく", romaji: "hiku", meaning: "play (a stringed instrument)", kind: "kanji", emoji: "🎵", lesson: 62, sec: "9-5" },
  { term: "習う(-U; 習った)", reading: "ならう", romaji: "narau", meaning: "learn", kind: "kanji", emoji: "📖", lesson: 62, sec: "9-5" },
  { term: "歌う (-U; 歌った)", reading: "うたう", romaji: "utau", meaning: "sing", kind: "kanji", emoji: "🎵", lesson: 62, sec: "9-5" },
  { term: "描く(-U; 描いた)", reading: "かく", romaji: "kaku", meaning: "draw, paint, sketch", kind: "kanji", emoji: "📷", lesson: 62, sec: "9-5" },
  { term: "浴びる (-RU; 浴びた)", reading: "あびる", romaji: "abiru", meaning: "take (a shower) (lit. 'bathe in' or 'be covered in')", kind: "kanji", emoji: "🚿", lesson: 62, sec: "9-5" },
  { term: "やばい", reading: "やばい", romaji: "yabai", meaning: "troublesome, dangerous, awesome, extreme (as an interjection, ‘awful, crap, oh no’)", kind: "hiragana", emoji: "👎", lesson: 62, sec: "9-5" },
  { term: "まずい", reading: "まずい", romaji: "mazui", meaning: "awkward, unappetizing, unpleasant", kind: "hiragana", emoji: "😖", lesson: 62, sec: "9-5" },
  { term: "それとも", reading: "それとも", romaji: "soretomo", meaning: "or (else)", kind: "hiragana", emoji: "🔀", lesson: 62, sec: "9-5" },
  { term: "聞くの専門", reading: "きくのせんもん", romaji: "kikunosenmon", meaning: "listening is my specialty", kind: "kanji", emoji: "👂", lesson: 62, sec: "9-5" },
  { term: "自分で（は）", reading: "じぶんでわ", romaji: "jibundewa", meaning: "on one’s own, by oneself (without help)", kind: "kanji", emoji: "🤝", lesson: 62, sec: "9-5" },
  { term: "小学校", reading: "しょうがっこう", romaji: "shougakkou", meaning: "elementary school", kind: "kanji", emoji: "🏫", lesson: 62, sec: "9-6" },
  { term: "中学校", reading: "ちゅうがっこう", romaji: "chuugakkou", meaning: "middle school", kind: "kanji", emoji: "🏫", lesson: 62, sec: "9-6" },
  { term: "まじ", reading: "まじ", romaji: "maji", meaning: "really, truly, honestly (very informal)", kind: "hiragana", emoji: "💯", lesson: 62, sec: "9-6" },
  { term: "倍", reading: "ばい", romaji: "bai", meaning: "double, -fold", kind: "kanji", emoji: "✖️", lesson: 62, sec: "9-6" },
  { term: "発音", reading: "はつおん", romaji: "hatsuon", meaning: "pronunciation", kind: "kanji", emoji: "🗣️", lesson: 62, sec: "9-6" },
  { term: "入る (-U; 入った)", reading: "はいる", romaji: "hairu", meaning: "go in, enter", kind: "kanji", emoji: "🚪", lesson: 62, sec: "9-6" },
  { term: "速い", reading: "はやい", romaji: "hayai", meaning: "speedy", kind: "kanji", emoji: "⚡", lesson: 62, sec: "9-6" },
  { term: "上手い・美味い・旨い・うまい", reading: "うまい", romaji: "umai", meaning: "delicious, skillful", kind: "kanji", emoji: "😋", lesson: 62, sec: "9-6" },
  { term: "偉い", reading: "えらい", romaji: "erai", meaning: "excellent, distinguished, admirable", kind: "kanji", emoji: "🌟", lesson: 62, sec: "9-6" },
  { term: "ひどい", reading: "ひどい", romaji: "hidoi", meaning: "cruel, harsh, severe", kind: "hiragana", emoji: "😣", lesson: 62, sec: "9-6" },
  { term: "すっごい", reading: "すっごい", romaji: "suggoi", meaning: "really, really", kind: "hiragana", emoji: "💯", lesson: 62, sec: "9-6" },
  { term: "〜倍", reading: "ばい", romaji: "bai", meaning: "multiple, -fold", kind: "kanji", emoji: "✖️", lesson: 62, sec: "9-6" },
  { term: "Verb 〜てから", reading: "Verb 〜てから", romaji: "tekara", meaning: "after Verb-ing", kind: "hiragana", emoji: "⏳", lesson: 62, sec: "9-6" },
  { term: "ハヤ", reading: "ハヤ", romaji: "haya", meaning: "Already? So fast? (informal)", kind: "katakana", emoji: "⚡", lesson: 62, sec: "9-6" },
  { term: "どうやって", reading: "どうやって", romaji: "douyatte", meaning: "(doing) how", kind: "hiragana", emoji: "❓", lesson: 62, sec: "9-6" },
  { term: "３年で", reading: "ねんで", romaji: "nende", meaning: "in three years", kind: "kanji", emoji: "📅", lesson: 62, sec: "9-6" },
  { term: "こんなに", reading: "こんなに", romaji: "konnani", meaning: "to this extent", kind: "hiragana", emoji: "📏", lesson: 62, sec: "9-6" },
  { term: "どうかなあ", reading: "どうかなあ", romaji: "doukanaa", meaning: "I wonder", kind: "hiragana", emoji: "🤔", lesson: 62, sec: "9-6" },
  { term: "何倍も上手", reading: "なんばいもじょうず", romaji: "nanbaimojouzu", meaning: "many times better at", kind: "kanji", emoji: "🔢", lesson: 62, sec: "9-6" },
  { term: "そんなことない", reading: "そんなことない", romaji: "sonnakotonai", meaning: "no such thing", kind: "hiragana", emoji: "❌", lesson: 62, sec: "9-6" },
  { term: "メチャ", reading: "メチャ", romaji: "mecha", meaning: "absurd, really, extreme (slang)", kind: "katakana", emoji: "🔤", lesson: 62, sec: "9-6" },
  { term: "木", reading: "き", romaji: "ki", meaning: "wood, tree", kind: "kanji", emoji: "🌸", lesson: 62, sec: "9-7R" },
  { term: "お金", reading: "おかね", romaji: "okane", meaning: "money", kind: "kanji", emoji: "💴", lesson: 62, sec: "9-7R" },
  { term: "男子", reading: "だんし", romaji: "danshi", meaning: "young man", kind: "kanji", emoji: "👨", lesson: 62, sec: "9-7R" },
  { term: "女子", reading: "じょし", romaji: "joshi", meaning: "young woman", kind: "kanji", emoji: "👩", lesson: 62, sec: "9-7R" },
  { term: "今日子", reading: "きょうこ", romaji: "kyouko", meaning: "[female given name]", kind: "kanji", emoji: "🧑", lesson: 62, sec: "9-7R" },
  { term: "目上", reading: "めうえ", romaji: "meue", meaning: "superior, senior, elder", kind: "kanji", emoji: "🎓", lesson: 62, sec: "9-8R" },
  { term: "高校生", reading: "こうこうせい", romaji: "koukousei", meaning: "high school student", kind: "kanji", emoji: "🧑‍🎓", lesson: 62, sec: "9-8R" },
  { term: "名", reading: "な", romaji: "na", meaning: "name", kind: "kanji", emoji: "🏷️", lesson: 62, sec: "9-8R" },
  { term: "前日", reading: "ぜんじつ", romaji: "zenjitsu", meaning: "the previous day", kind: "kanji", emoji: "📅", lesson: 62, sec: "9-8R" },
  { term: "目下", reading: "めした", romaji: "meshita", meaning: "subordinate, junior, younger", kind: "kanji", emoji: "🎓", lesson: 62, sec: "9-8R" },
  { term: "木下", reading: "きのした", romaji: "kinoshita", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-8R" },
  { term: "分", reading: "ぶん", romaji: "bun", meaning: "portion", kind: "kanji", emoji: "📊", lesson: 62, sec: "9-8R" },
  { term: "村上", reading: "むらかみ", romaji: "murakami", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-9R" },
  { term: "上村", reading: "かみむらうえむら", romaji: "kamimura・uemura", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-9R" },
  { term: "立川", reading: "たちかわ", romaji: "tachikawa", meaning: "[place name in Tokyo]", kind: "kanji", emoji: "🗾", lesson: 62, sec: "9-9R" },
  { term: "山", reading: "やま", romaji: "yama", meaning: "mountain", kind: "kanji", emoji: "⛰️", lesson: 62, sec: "9-9R" },
  { term: "上山", reading: "うえやま", romaji: "ueyama", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-9R" },
  { term: "中山", reading: "なかやま", romaji: "nakayama", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-9R" },
  { term: "山中", reading: "やまなか", romaji: "yamanaka", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-9R" },
  { term: "川中", reading: "かわなか", romaji: "kawanaka", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 62, sec: "9-9R" },
  { term: "次、頑張ろう", reading: "つぎがんばろう", romaji: "tsugi、ganbarou", meaning: "Do your best next time", kind: "kanji", emoji: "🕐", lesson: 62, sec: "9-9R" },
  { term: "七転び八起き", reading: "ななころびやおき", romaji: "nanakorobiyaoki", meaning: "Fall down seven times, get up eight", kind: "kanji", emoji: "🍁", lesson: 63, sec: "10-0" },
  { term: "野球", reading: "やきゅう", romaji: "yakyuu", meaning: "baseball", kind: "kanji", emoji: "🏃", lesson: 63, sec: "10-1" },
  { term: "歌舞伎", reading: "かぶき", romaji: "kabuki", meaning: "kabuki (traditional theater)", kind: "kanji", emoji: "🎭", lesson: 63, sec: "10-1" },
  { term: "（お）能", reading: "のう", romaji: "nou", meaning: "noh (traditional theater", kind: "kanji", emoji: "🎭", lesson: 63, sec: "10-1" },
  { term: "映画", reading: "えいが", romaji: "eiga", meaning: "movies", kind: "kanji", emoji: "🎬", lesson: 63, sec: "10-1" },
  { term: "試合（する）", reading: "しあい", romaji: "shiai", meaning: "match, contest, game", kind: "kanji", emoji: "🎮", lesson: 63, sec: "10-1" },
  { term: "ジャイアンツ", reading: "ジャイアンツ", romaji: "jaiantsu", meaning: "Giants", kind: "katakana", emoji: "🔤", lesson: 63, sec: "10-1" },
  { term: "久しぶり", reading: "ひさしぶり", romaji: "hisashiburi", meaning: "a while (since the last time)", kind: "kanji", emoji: "🕐", lesson: 63, sec: "10-1" },
  { term: "行こう", reading: "いこう", romaji: "ikou", meaning: "let's go", kind: "kanji", emoji: "🚪", lesson: 63, sec: "10-1" },
  { term: "買っておきますので", reading: "かっておきますので", romaji: "katteokimasunode", meaning: "because/so I’ll buy X ahead of time", kind: "kanji", emoji: "🕐", lesson: 63, sec: "10-1" },
  { term: "久しぶりに", reading: "ひさしぶりに", romaji: "hisashiburini", meaning: "for the first time in a while", kind: "kanji", emoji: "🕐", lesson: 63, sec: "10-1" },
  { term: "論文", reading: "ろんぶん", romaji: "ronbun", meaning: "thesis", kind: "kanji", emoji: "📄", lesson: 63, sec: "10-2" },
  { term: "絶対（に）", reading: "ぜったい", romaji: "zettai", meaning: "absolutely", kind: "kanji", emoji: "💯", lesson: 63, sec: "10-2" },
  { term: "研究（する）", reading: "けんきゅう", romaji: "kenkyuu", meaning: "research", kind: "kanji", emoji: "🔬", lesson: 63, sec: "10-2" },
  { term: "作文", reading: "さくぶん", romaji: "sakubun", meaning: "composition, essay, formal writing", kind: "kanji", emoji: "✍️", lesson: 63, sec: "10-2" },
  { term: "実験（する）", reading: "じっけん", romaji: "jikken", meaning: "experiment", kind: "kanji", emoji: "🧪", lesson: 63, sec: "10-2" },
  { term: "調査（する）", reading: "ちょうさ", romaji: "chousa", meaning: "investigation, survey", kind: "kanji", emoji: "🔍", lesson: 63, sec: "10-2" },
  { term: "運転（する）", reading: "うんてん", romaji: "unten", meaning: "driving (a car)", kind: "kanji", emoji: "🚗", lesson: 63, sec: "10-2" },
  { term: "X中", reading: "ちゅう", romaji: "chuu", meaning: "while X-ing; in the middle of X-ing; within X", kind: "kanji", emoji: "⏳", lesson: 63, sec: "10-2" },
  { term: "一日中", reading: "じゅう", romaji: "juu", meaning: "all day", kind: "kanji", emoji: "📅", lesson: 63, sec: "10-2" },
  { term: "再来週", reading: "さらいしゅう", romaji: "saraishuu", meaning: "week after next", kind: "kanji", emoji: "🗓️", lesson: 63, sec: "10-2" },
  { term: "再来月", reading: "さらいげつ", romaji: "saraigetsu", meaning: "month after next", kind: "kanji", emoji: "🗓️", lesson: 63, sec: "10-2" },
  { term: "再来年", reading: "さらいねん", romaji: "sarainen", meaning: "year after next", kind: "kanji", emoji: "🗓️", lesson: 63, sec: "10-2" },
  { term: "この頃", reading: "このごろ", romaji: "konogoro", meaning: "lately, these days", kind: "kanji", emoji: "📅", lesson: 63, sec: "10-2" },
  { term: "特に", reading: "とくに", romaji: "tokuni", meaning: "especially", kind: "kanji", emoji: "⭐", lesson: 63, sec: "10-2" },
  { term: "予約（する）", reading: "よやく", romaji: "yoyaku", meaning: "reservation", kind: "kanji", emoji: "🙅", lesson: 63, sec: "10-3" },
  { term: "（お）席", reading: "せき", romaji: "seki", meaning: "seat, (seated) occasion", kind: "kanji", emoji: "💺", lesson: 63, sec: "10-3" },
  { term: "（お）食事", reading: "しょくじ", romaji: "shokuji", meaning: "a meal", kind: "kanji", emoji: "🍚", lesson: 63, sec: "10-3" },
  { term: "（お）肉", reading: "にく", romaji: "niku", meaning: "meat", kind: "kanji", emoji: "🍖", lesson: 63, sec: "10-3" },
  { term: "（お）魚", reading: "さかな", romaji: "sakana", meaning: "fish", kind: "kanji", emoji: "🐟", lesson: 63, sec: "10-3" },
  { term: "（お）野菜", reading: "やさい", romaji: "yasai", meaning: "vegetable", kind: "kanji", emoji: "🥗", lesson: 63, sec: "10-3" },
  { term: "天ぷら", reading: "てんぷら", romaji: "tenpura", meaning: "tempura", kind: "kanji", emoji: "🍤", lesson: 63, sec: "10-3" },
  { term: "麺", reading: "めん", romaji: "men", meaning: "noodles", kind: "kanji", emoji: "🍜", lesson: 63, sec: "10-3" },
  { term: "焼肉", reading: "やきにく", romaji: "yakiniku", meaning: "yakiniku (grilled meat)", kind: "kanji", emoji: "🍖", lesson: 63, sec: "10-3" },
  { term: "和食", reading: "わしょく", romaji: "washoku", meaning: "Japanese food", kind: "kanji", emoji: "🍱", lesson: 63, sec: "10-3" },
  { term: "中華料理", reading: "ちゅうかりょうり", romaji: "chuukaryouri", meaning: "Chinese food", kind: "kanji", emoji: "🍱", lesson: 63, sec: "10-3" },
  { term: "〜料理", reading: "りょうり", romaji: "ryouri", meaning: "~ cuisine", kind: "kanji", emoji: "🍱", lesson: 63, sec: "10-3" },
  { term: "メニュー", reading: "メニュー", romaji: "menyu-", meaning: "menu", kind: "katakana", emoji: "🔤", lesson: 63, sec: "10-3" },
  { term: "アルコール", reading: "アルコール", romaji: "aruko-ru", meaning: "alcohol, alcoholic beverage", kind: "katakana", emoji: "💧", lesson: 63, sec: "10-3" },
  { term: "オレンジジュース", reading: "オレンジジュース", romaji: "orenjiju-su", meaning: "orange juice", kind: "katakana", emoji: "🍎", lesson: 63, sec: "10-3" },
  { term: "サイダー", reading: "サイダー", romaji: "saida-", meaning: "soda", kind: "katakana", emoji: "🔤", lesson: 63, sec: "10-3" },
  { term: "コーラ", reading: "コーラ", romaji: "ko-ra", meaning: "cola", kind: "katakana", emoji: "🔤", lesson: 63, sec: "10-3" },
  { term: "（お）酒", reading: "さけ", romaji: "sake", meaning: "sake, alcohol", kind: "kanji", emoji: "🍶", lesson: 63, sec: "10-3" },
  { term: "デザート", reading: "デザート", romaji: "deza-to", meaning: "dessert", kind: "katakana", emoji: "🍰", lesson: 63, sec: "10-3" },
  { term: "果物", reading: "くだもの", romaji: "kudamono", meaning: "fruit", kind: "kanji", emoji: "🍎", lesson: 63, sec: "10-3" },
  { term: "伺う↓ (-U; 伺った)", reading: "うかがう", romaji: "ukagau", meaning: "inquire, hear", kind: "kanji", emoji: "🔍", lesson: 63, sec: "10-3" },
  { term: "お待たせする↓", reading: "おまたせする", romaji: "omatasesuru", meaning: "make someone wait", kind: "kanji", emoji: "🔨", lesson: 63, sec: "10-3" },
  { term: "甘い", reading: "あまい", romaji: "amai", meaning: "sweet", kind: "kanji", emoji: "🍰", lesson: 63, sec: "10-3" },
  { term: "辛い", reading: "からい", romaji: "karai", meaning: "spicy", kind: "kanji", emoji: "🌶️", lesson: 63, sec: "10-3" },
  { term: "しょっぱい", reading: "しょっぱい", romaji: "shoppai", meaning: "salty", kind: "hiragana", emoji: "🧂", lesson: 63, sec: "10-3" },
  { term: "すっぱい", reading: "すっぱい", romaji: "suppai", meaning: "sour", kind: "hiragana", emoji: "🍋", lesson: 63, sec: "10-3" },
  { term: "苦い", reading: "にがい", romaji: "nigai", meaning: "bitter", kind: "kanji", emoji: "😣", lesson: 63, sec: "10-3" },
  { term: "〜名", reading: "めい", romaji: "mei", meaning: "classifier for counting people (formal)", kind: "kanji", emoji: "🧍", lesson: 63, sec: "10-3" },
  { term: "〜名様", reading: "めいさま", romaji: "meisama", meaning: "classifier for counting people (polite)", kind: "kanji", emoji: "🧍", lesson: 63, sec: "10-3" },
  { term: "いらっしゃいませ", reading: "いらっしゃいませ", romaji: "irasshaimase.", meaning: "Welcome", kind: "hiragana", emoji: "🚶", lesson: 63, sec: "10-3" },
  { term: "〜様", reading: "さま", romaji: "sama", meaning: "[honorific title]", kind: "kanji", emoji: "🎩", lesson: 63, sec: "10-3" },
  { term: "Noun でございます+", reading: "Noun でございます+", romaji: "degozaimasu+", meaning: "It’s [Noun] (polite)", kind: "hiragana", emoji: "💬", lesson: 63, sec: "10-3" },
  { term: "少々", reading: "しょうしょう", romaji: "shoushou", meaning: "a little (polite)", kind: "kanji", emoji: "🔹", lesson: 63, sec: "10-3" },
  { term: "お待ちください", reading: "おまちください", romaji: "omachikudasai.", meaning: "Please wait", kind: "kanji", emoji: "⏳", lesson: 63, sec: "10-3" },
  { term: "お待たせいたしました↓", reading: "おまたせいたしました", romaji: "omataseitashimashita↓.", meaning: "Sorry to make you wait. (humble)", kind: "kanji", emoji: "🔨", lesson: 63, sec: "10-3" },
  { term: "お食事の方", reading: "おしょくじのほう", romaji: "oshokujinohou", meaning: "the food part of your order", kind: "kanji", emoji: "🔟", lesson: 63, sec: "10-3" },
  { term: "伺って↓おります↓", reading: "うかがっております", romaji: "ukagatteorimasu.", meaning: "We've heard. We've received", kind: "kanji", emoji: "🎁", lesson: 63, sec: "10-3" },
  { term: "お決まりでしょうか", reading: "おきまりでしょうか", romaji: "okimarideshouka.", meaning: "Have you decided?", kind: "kanji", emoji: "💬", lesson: 63, sec: "10-3" },
  { term: "とりあえず", reading: "とりあえず", romaji: "toriaezu", meaning: "for now, first of all", kind: "hiragana", emoji: "📍", lesson: 63, sec: "10-3" },
  { term: "これで", reading: "これで", romaji: "korede", meaning: "being this", kind: "hiragana", emoji: "💬", lesson: 63, sec: "10-3" },
  { term: "かしこまりました↓", reading: "かしこまりました↓", romaji: "kashikomarimashita↓.", meaning: "Understood", kind: "hiragana", emoji: "👍", lesson: 63, sec: "10-3" },
  { term: "クリントン大学", reading: "くりんとんだいがく", romaji: "kurintondaigaku", meaning: "Clinton University", kind: "kanji", emoji: "🎓", lesson: 63, sec: "10-4" },
  { term: "州立大学", reading: "しゅうりつだいがく", romaji: "shuuritsudaigaku", meaning: "state or public university", kind: "kanji", emoji: "🎓", lesson: 63, sec: "10-4" },
  { term: "県立大学", reading: "けんりつだいがく", romaji: "kenritsudaigaku", meaning: "prefectural university", kind: "kanji", emoji: "🎓", lesson: 63, sec: "10-4" },
  { term: "国立大学", reading: "こくりつだいがく", romaji: "kokuritsudaigaku", meaning: "national university", kind: "kanji", emoji: "🎓", lesson: 63, sec: "10-4" },
  { term: "私立大学", reading: "しりつだいがく", romaji: "shiritsudaigaku", meaning: "private university", kind: "kanji", emoji: "🎓", lesson: 63, sec: "10-4" },
  { term: "研修（する）", reading: "けんしゅう", romaji: "kenshuu", meaning: "training", kind: "kanji", emoji: "🏋️", lesson: 63, sec: "10-4" },
  { term: "インターン", reading: "インターン", romaji: "inta-n", meaning: "intern", kind: "katakana", emoji: "🔤", lesson: 63, sec: "10-4" },
  { term: "失礼（な）", reading: "しつれい", romaji: "shitsurei", meaning: "rude, impolite", kind: "kanji", emoji: "😤", lesson: 63, sec: "10-4" },
  { term: "しょっちゅう", reading: "しょっちゅう", romaji: "shocchuu", meaning: "frequent, often", kind: "hiragana", emoji: "🔁", lesson: 63, sec: "10-4" },
  { term: "あるかもしれません", reading: "あるかもしれません", romaji: "arukamoshiremasen.", meaning: "There may be", kind: "hiragana", emoji: "🤔", lesson: 63, sec: "10-4" },
  { term: "言った時", reading: "いったとき", romaji: "ittatoki", meaning: "when I have said", kind: "kanji", emoji: "💬", lesson: 63, sec: "10-4" },
  { term: "通訳（する）", reading: "つうやく", romaji: "tsuuyaku", meaning: "interpretation", kind: "kanji", emoji: "🌐", lesson: 63, sec: "10-5" },
  { term: "翻訳（する）", reading: "ほにゃく", romaji: "honyaku", meaning: "translation", kind: "kanji", emoji: "🌐", lesson: 63, sec: "10-5" },
  { term: "緊張（する）", reading: "きんちょう", romaji: "kinchou", meaning: "tension, nervousness", kind: "kanji", emoji: "😰", lesson: 63, sec: "10-5" },
  { term: "専門的（な）", reading: "せんもんてき", romaji: "senmonteki", meaning: "specialized", kind: "kanji", emoji: "🎓", lesson: 63, sec: "10-5" },
  { term: "内容", reading: "ないよう", romaji: "naiyou", meaning: "content", kind: "kanji", emoji: "📄", lesson: 63, sec: "10-5" },
  { term: "次回", reading: "じかい", romaji: "jikai", meaning: "next time", kind: "kanji", emoji: "🕐", lesson: 63, sec: "10-5" },
  { term: "今回", reading: "こんかい", romaji: "konkai", meaning: "this time", kind: "kanji", emoji: "🕐", lesson: 63, sec: "10-5" },
  { term: "前回", reading: "ぜんかい", romaji: "zenkai", meaning: "last time", kind: "kanji", emoji: "🕐", lesson: 63, sec: "10-5" },
  { term: "準備（する）", reading: "じゅんび", romaji: "junbi", meaning: "preparation", kind: "kanji", emoji: "🧰", lesson: 63, sec: "10-5" },
  { term: "調べる (-RU; 調べた)", reading: "しらべる", romaji: "shiraberu", meaning: "investigate, inquire, search", kind: "kanji", emoji: "🔍", lesson: 63, sec: "10-5" },
  { term: "気にする", reading: "きにする", romaji: "kinisuru", meaning: "care about, be bothered, worry", kind: "kanji", emoji: "😟", lesson: 63, sec: "10-5" },
  { term: "多い", reading: "おおい", romaji: "ooi", meaning: "a lot, many, numerous", kind: "kanji", emoji: "🔢", lesson: 63, sec: "10-5" },
  { term: "少ない", reading: "すくない", romaji: "sukunai", meaning: "few, scarce", kind: "kanji", emoji: "🔢", lesson: 63, sec: "10-5" },
  { term: "分からないこと", reading: "わからないこと", romaji: "wakaranaikoto", meaning: "things/matters one doesn’t understand", kind: "kanji", emoji: "💡", lesson: 63, sec: "10-5" },
  { term: "本当に", reading: "ほんとうに", romaji: "hontouni", meaning: "really, truly", kind: "kanji", emoji: "💯", lesson: 63, sec: "10-5" },
  { term: "きちんと", reading: "きちんと", romaji: "kichinto", meaning: "precisely, neatly, accurately, as it should be", kind: "hiragana", emoji: "🎯", lesson: 63, sec: "10-5" },
  { term: "問題", reading: "もんだい", romaji: "mondai", meaning: "problem", kind: "kanji", emoji: "❗", lesson: 63, sec: "10-6" },
  { term: "国語", reading: "こくご", romaji: "kokugo", meaning: "Japanese (lit. ‘national’) language", kind: "kanji", emoji: "🈁", lesson: 63, sec: "10-6" },
  { term: "外国語", reading: "がいこくご", romaji: "gaikokugo", meaning: "foreign language", kind: "kanji", emoji: "🌏", lesson: 63, sec: "10-6" },
  { term: "言葉・ことば", reading: "ことば", romaji: "kotoba", meaning: "language, word(s)", kind: "kanji", emoji: "🈁", lesson: 63, sec: "10-6" },
  { term: "得意（な）", reading: "とくい", romaji: "tokui", meaning: "strong point, specialty", kind: "kanji", emoji: "💪", lesson: 63, sec: "10-6" },
  { term: "苦手（な）", reading: "にがて", romaji: "nigate", meaning: "weak point, weakness", kind: "kanji", emoji: "💪", lesson: 63, sec: "10-6" },
  { term: "一生懸命", reading: "いっしょうけんめい", romaji: "isshoukenmei", meaning: "all out, for all one is worth", kind: "kanji", emoji: "💯", lesson: 63, sec: "10-6" },
  { term: "平均", reading: "へいきん", romaji: "heikin", meaning: "average", kind: "kanji", emoji: "📊", lesson: 63, sec: "10-6" },
  { term: "以下", reading: "いか", romaji: "ika", meaning: "below", kind: "kanji", emoji: "⬇️", lesson: 63, sec: "10-6" },
  { term: "以上", reading: "いじょう", romaji: "ijou", meaning: "above", kind: "kanji", emoji: "⬆️", lesson: 63, sec: "10-6" },
  { term: "しかた・仕方", reading: "しかた", romaji: "shikata", meaning: "way of doing", kind: "kanji", emoji: "🛠️", lesson: 63, sec: "10-6" },
  { term: "残念（な）", reading: "ざんねん", romaji: "zannen", meaning: "too bad, regrettable", kind: "kanji", emoji: "👎", lesson: 63, sec: "10-6" },
  { term: "がっかり（な）・（する）", reading: "がっかり（な）・（する）", romaji: "gakkari", meaning: "feel disappointment, lose hear", kind: "hiragana", emoji: "👂", lesson: 63, sec: "10-6" },
  { term: "夢を見る", reading: "ゆめをみる", romaji: "yumewomiru", meaning: "have (see) a dream", kind: "kanji", emoji: "👀", lesson: 63, sec: "10-6" },
  { term: "返ってくる", reading: "かえってくる", romaji: "kaettekuru", meaning: "come back (inanimate)", kind: "kanji", emoji: "🚪", lesson: 63, sec: "10-6" },
  { term: "諦める (-RU; 諦めた)", reading: "あきらめる", romaji: "akirameru", meaning: "be reconciled, give up", kind: "kanji", emoji: "📦", lesson: 63, sec: "10-6" },
  { term: "続ける (-RU; 続けた)", reading: "つづける", romaji: "tsudukeru", meaning: "keep on, continue X", kind: "kanji", emoji: "▶️", lesson: 63, sec: "10-6" },
  { term: "低い", reading: "ひくい", romaji: "hikui", meaning: "low", kind: "kanji", emoji: "⬇️", lesson: 63, sec: "10-6" },
  { term: "悔しい", reading: "くやしい", romaji: "kuyashii", meaning: "frustrating, annoying", kind: "kanji", emoji: "😤", lesson: 63, sec: "10-6" },
  { term: "〜点", reading: "てん", romaji: "ten", meaning: "point, dot", kind: "kanji", emoji: "🔸", lesson: 63, sec: "10-6" },
  { term: "元気ない", reading: "げんきない", romaji: "genkinai", meaning: "have no energy", kind: "kanji", emoji: "😩", lesson: 63, sec: "10-6" },
  { term: "悪い夢", reading: "わるいゆめ", romaji: "waruiyume", meaning: "nightmare", kind: "kanji", emoji: "🌙", lesson: 63, sec: "10-6" },
  { term: "そういうこと", reading: "そういうこと", romaji: "souiukoto", meaning: "a thing like that; that kind of thing", kind: "hiragana", emoji: "❤️", lesson: 63, sec: "10-6" },
  { term: "思ったより", reading: "より", romaji: "yori", meaning: "to the extent I thought", kind: "kanji", emoji: "💭", lesson: 63, sec: "10-6" },
  { term: "思ったほど", reading: "ほど", romaji: "hodo", meaning: "more (less) than I thought", kind: "kanji", emoji: "💭", lesson: 63, sec: "10-6" },
  { term: "X 以下・以上", reading: "いかいじょう", romaji: "ika・ijou", meaning: "below X / above X", kind: "kanji", emoji: "⬇️", lesson: 63, sec: "10-6" },
  { term: "勉強の仕方", reading: "べんきょうのしかた", romaji: "benkyounoshikata", meaning: "way of studying", kind: "kanji", emoji: "📖", lesson: 63, sec: "10-6" },
  { term: "しょうがない", reading: "しょうがない", romaji: "shouganai", meaning: "there’s nothing to be done", kind: "hiragana", emoji: "🤷", lesson: 63, sec: "10-6" },
  { term: "仕方がない", reading: "しかたがない", romaji: "shikataganai", meaning: "there’s nothing to be done", kind: "kanji", emoji: "🤷", lesson: 63, sec: "10-6" },
  { term: "Xじゃない", reading: "Xじゃない", romaji: "janai", meaning: "X, isn't it?; X, for sure", kind: "hiragana", emoji: "💬", lesson: 63, sec: "10-6" },
  { term: "英国", reading: "えいこく", romaji: "eikoku", meaning: "England", kind: "kanji", emoji: "🗾", lesson: 63, sec: "10-7R" },
  { term: "英一", reading: "えいいち", romaji: "eiichi", meaning: "[male given name]", kind: "kanji", emoji: "🧑", lesson: 63, sec: "10-7R" },
  { term: "英子", reading: "えいこひでこ", romaji: "eiko・hideko", meaning: "[female given name]", kind: "kanji", emoji: "🧑", lesson: 63, sec: "10-7R" },
  { term: "お忙しい中", reading: "おいそがしいなか", romaji: "oisogashiinaka", meaning: "when you are busy", kind: "kanji", emoji: "🌀", lesson: 63, sec: "10-7R" },
  { term: "新田", reading: "にった", romaji: "nitta", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-7R" },
  { term: "中田", reading: "なかたなかだ", romaji: "nakata・nakada", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "本田", reading: "ほんだ", romaji: "honda", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "村田", reading: "むらた", romaji: "murata", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "金田", reading: "かねだ", romaji: "kaneda", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "前田", reading: "まえだ", romaji: "maeda", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "上田", reading: "うえだ", romaji: "ueda", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "川田", reading: "かわた", romaji: "kawata", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "田川", reading: "たがわ", romaji: "tagawa", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "田村", reading: "たむら", romaji: "tamura", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "水田", reading: "みずた", romaji: "mizuta", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-8R" },
  { term: "後ほど", reading: "のちほど", romaji: "nochihodo", meaning: "later", kind: "kanji", emoji: "⏭️", lesson: 63, sec: "10-8R" },
  { term: "会田", reading: "あいだ", romaji: "aida", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 63, sec: "10-9R" },
  { term: "社会人", reading: "しゃかいじん", romaji: "shakaijin", meaning: "a (working) member of society, an employed adult", kind: "kanji", emoji: "💼", lesson: 63, sec: "10-9R" },
  { term: "目は口ほどに物を言い", reading: "めわくちほどにものをいい", romaji: "mewakuchihodonimonowoii", meaning: "Eyes say as much as the words", kind: "kanji", emoji: "🔢", lesson: 64, sec: "11-0" },
  { term: "企画部", reading: "きかくぶ", romaji: "kikakubu", meaning: "planning division", kind: "kanji", emoji: "🏢", lesson: 64, sec: "11-1" },
  { term: "開発部", reading: "かいはつぶ", romaji: "kaihatsubu", meaning: "development division", kind: "kanji", emoji: "🏢", lesson: 64, sec: "11-1" },
  { term: "営業部", reading: "えいぎょうぶ", romaji: "eigyoubu", meaning: "operations division", kind: "kanji", emoji: "🏢", lesson: 64, sec: "11-1" },
  { term: "（ご）丁寧", reading: "ていねい", romaji: "teinei", meaning: "polite", kind: "kanji", emoji: "🙇", lesson: 64, sec: "11-1" },
  { term: "（ご）親切", reading: "しんせつ", romaji: "shinsetsu", meaning: "kind", kind: "kanji", emoji: "🤝", lesson: 64, sec: "11-1" },
  { term: "（ご）必要", reading: "ひつよう", romaji: "hitsuyou", meaning: "necessary", kind: "kanji", emoji: "❗", lesson: 64, sec: "11-1" },
  { term: "（ご）承知（する）", reading: "しょうち", romaji: "shouchi", meaning: "acceptance, consent", kind: "kanji", emoji: "👍", lesson: 64, sec: "11-1" },
  { term: "伝える (-RU; 伝えた)", reading: "つたえる", romaji: "tsutaeru", meaning: "convey a message", kind: "kanji", emoji: "📨", lesson: 64, sec: "11-1" },
  { term: "もし", reading: "もし", romaji: "moshi", meaning: "if, supposing", kind: "hiragana", emoji: "🎵", lesson: 64, sec: "11-1" },
  { term: "必要でしたら", reading: "ひつようでしたら", romaji: "hitsuyoudeshitara", meaning: "if (it’s) needed", kind: "kanji", emoji: "❗", lesson: 64, sec: "11-1" },
  { term: "服", reading: "ふく", romaji: "fuku", meaning: "clothing, outfit", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-2" },
  { term: "ワイシャツ", reading: "ワイシャツ", romaji: "waishatsu", meaning: "dress shirt (for men)", kind: "katakana", emoji: "👕", lesson: 64, sec: "11-2" },
  { term: "ブラウス", reading: "ブラウス", romaji: "burausu", meaning: "blouse", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "スカート", reading: "スカート", romaji: "suka-to", meaning: "skirt", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "パンツ", reading: "パンツ", romaji: "pantsu", meaning: "slacks, pants", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "スーツ", reading: "スーツ", romaji: "su-tsu", meaning: "suit", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "ドレス", reading: "ドレス", romaji: "doresu", meaning: "dress", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "指輪", reading: "ゆびわ", romaji: "yubiwa", meaning: "ring", kind: "kanji", emoji: "💍", lesson: 64, sec: "11-2" },
  { term: "イヤリング", reading: "イヤリング", romaji: "iyaringu", meaning: "ear ring", kind: "katakana", emoji: "🫀", lesson: 64, sec: "11-2" },
  { term: "面接(する）", reading: "めんせつ", romaji: "mensetsu", meaning: "interview (for a job)", kind: "kanji", emoji: "💼", lesson: 64, sec: "11-2" },
  { term: "インタビュー（する）", reading: "インタビュー（する）", romaji: "intabyu-（suru）", meaning: "interview (television, media, also job)", kind: "hiragana", emoji: "💼", lesson: 64, sec: "11-2" },
  { term: "学会", reading: "がっかい", romaji: "gakkai", meaning: "academic conference", kind: "kanji", emoji: "🗣️", lesson: 64, sec: "11-2" },
  { term: "フォーマル", reading: "フォーマル", romaji: "fo-maru（na）", meaning: "formal", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "カジュアル", reading: "カジュアル", romaji: "kajuaru（na）", meaning: "casual", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-2" },
  { term: "食べ過ぎ", reading: "たべすぎ", romaji: "tabesugi", meaning: "think too much", kind: "kanji", emoji: "🔢", lesson: 64, sec: "11-2" },
  { term: "飲み過ぎ", reading: "のみすぎ", romaji: "nomisugi", meaning: "eat too much", kind: "kanji", emoji: "🍴", lesson: 64, sec: "11-2" },
  { term: "考え過ぎ", reading: "かんがえすぎ", romaji: "kangaesugi", meaning: "think too much", kind: "kanji", emoji: "🔢", lesson: 64, sec: "11-2" },
  { term: "履く(U; 履いた)", reading: "はく", romaji: "haku", meaning: "put on, wear (on the legs, such as slacks)", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-2" },
  { term: "過ぎる (RU; 過ぎた)", reading: "すぎる", romaji: "sugiru", meaning: "exceed, go beyond", kind: "kanji", emoji: "🚪", lesson: 64, sec: "11-2" },
  { term: "濃い", reading: "こい", romaji: "koi", meaning: "dark colored, thick, strong (flavor, possibility)", kind: "kanji", emoji: "💪", lesson: 64, sec: "11-2" },
  { term: "薄い", reading: "うすい", romaji: "usui", meaning: "light colored, thin, dilute, weak (taste, probability)", kind: "kanji", emoji: "💪", lesson: 64, sec: "11-2" },
  { term: "〜過ぎ（る）", reading: "すぎる", romaji: "sugi（ru）", meaning: "over- (overeat, overdo, etc.)", kind: "kanji", emoji: "🔺", lesson: 64, sec: "11-2" },
  { term: "面接に着る", reading: "めんせつにきる", romaji: "mensetsunikiru", meaning: "wear t an interview", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-2" },
  { term: "それにしたら", reading: "それにしたら", romaji: "sorenishitara", meaning: "If you did that? (how would it be)", kind: "hiragana", emoji: "📏", lesson: 64, sec: "11-2" },
  { term: "季節", reading: "きせつ", romaji: "kisetsu", meaning: "season", kind: "kanji", emoji: "🗓️", lesson: 64, sec: "11-3" },
  { term: "半袖", reading: "はんそで", romaji: "hansode", meaning: "short sleeves", kind: "kanji", emoji: "📏", lesson: 64, sec: "11-3" },
  { term: "長袖", reading: "ながそで", romaji: "nagasode", meaning: "long sleeves", kind: "kanji", emoji: "📏", lesson: 64, sec: "11-3" },
  { term: "シャツ", reading: "シャツ", romaji: "shatsu", meaning: "shirt", kind: "katakana", emoji: "👕", lesson: 64, sec: "11-3" },
  { term: "セーター", reading: "セーター", romaji: "se-ta-", meaning: "sweater", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-3" },
  { term: "ジャケット", reading: "ジャケット", romaji: "jaketto", meaning: "jacket", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-3" },
  { term: "オーバー", reading: "オーバー", romaji: "o-ba-", meaning: "coat", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-3" },
  { term: "実用的（な）", reading: "じつようてき", romaji: "jitsuyouteki", meaning: "practical", kind: "kanji", emoji: "🛠️", lesson: 64, sec: "11-3" },
  { term: "重ねる(-RU; 重ねた)", reading: "かさねる", romaji: "kasaneru", meaning: "put on top", kind: "kanji", emoji: "📚", lesson: 64, sec: "11-3" },
  { term: "着る (-RU; 着た)", reading: "きる", romaji: "kiru", meaning: "wear, put on", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-3" },
  { term: "変わる(-U; 変わった)", reading: "かわる", romaji: "kawaru", meaning: "change, switch", kind: "kanji", emoji: "🔄", lesson: 64, sec: "11-3" },
  { term: "季節によって", reading: "きせつによって", romaji: "kisetsuniyotte", meaning: "depending on the season", kind: "kanji", emoji: "🗓️", lesson: 64, sec: "11-3" },
  { term: "重ねることにして（い）る", reading: "かさねることにしている", romaji: "kasanerukotonishite（i）ru", meaning: "usually layer (habit)", kind: "kanji", emoji: "📊", lesson: 64, sec: "11-3" },
  { term: "素敵（な）", reading: "すてき", romaji: "suteki", meaning: "sharp, nice, good-looking", kind: "kanji", emoji: "👍", lesson: 64, sec: "11-4" },
  { term: "おしゃれな（な）", reading: "おしゃれな（な）", romaji: "oshare", meaning: "stylish", kind: "hiragana", emoji: "✨", lesson: 64, sec: "11-4" },
  { term: "ネクタイ", reading: "ネクタイ", romaji: "nekutai", meaning: "necktie", kind: "katakana", emoji: "🧍", lesson: 64, sec: "11-4" },
  { term: "靴", reading: "くつ", romaji: "kutsu", meaning: "shoes", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-4" },
  { term: "アクセサリー", reading: "アクセサリー", romaji: "akusesari-", meaning: "accessory", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-4" },
  { term: "帽子", reading: "ぼうし", romaji: "boushi", meaning: "hat", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-4" },
  { term: "手袋", reading: "てぶくろ", romaji: "tebukuro", meaning: "gloves", kind: "kanji", emoji: "🧤", lesson: 64, sec: "11-4" },
  { term: "メガネ", reading: "メガネ", romaji: "megane", meaning: "eyeglasses", kind: "katakana", emoji: "👁️", lesson: 64, sec: "11-4" },
  { term: "ヘアスタイル", reading: "ヘアスタイル", romaji: "heasutairu", meaning: "hairstyle", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-4" },
  { term: "パートナー", reading: "パートナー", romaji: "pa-tona-", meaning: "(romantic) partner", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-4" },
  { term: "親戚", reading: "しんせき", romaji: "shinseki", meaning: "relative, family (in-group)", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 64, sec: "11-4" },
  { term: "祖母", reading: "そぼ", romaji: "sobo", meaning: "grandmother (in-group)", kind: "kanji", emoji: "👵", lesson: 64, sec: "11-4" },
  { term: "祖父", reading: "そふ", romaji: "sofu", meaning: "grandfather (in-group)", kind: "kanji", emoji: "👴", lesson: 64, sec: "11-4" },
  { term: "伯父/叔父", reading: "おじ", romaji: "oji", meaning: "uncle (in-group)", kind: "kanji", emoji: "👨", lesson: 64, sec: "11-4" },
  { term: "伯母/叔母", reading: "おば", romaji: "oba", meaning: "aunt (in-group)", kind: "kanji", emoji: "👩", lesson: 64, sec: "11-4" },
  { term: "いとこ", reading: "いとこ", romaji: "itoko", meaning: "cousin (in-group)", kind: "hiragana", emoji: "🧑", lesson: 64, sec: "11-4" },
  { term: "奥様", reading: "おくさま", romaji: "okusama", meaning: "wife (polite)", kind: "kanji", emoji: "💍", lesson: 64, sec: "11-4" },
  { term: "ご主人様", reading: "ごしゅじんさま", romaji: "goshujinsama", meaning: "husband (polite)", kind: "kanji", emoji: "💍", lesson: 64, sec: "11-4" },
  { term: "ご親戚", reading: "ごしんせき", romaji: "goshinseki", meaning: "relative, family (polite)", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 64, sec: "11-4" },
  { term: "おじいさん/お祖父様", reading: "おじいさのじいさま", romaji: "ojiisan・ojiisama", meaning: "uncle (polite)", kind: "kanji", emoji: "👨", lesson: 64, sec: "11-4" },
  { term: "おばあさん/お祖母様", reading: "おばあさのばあさま", romaji: "obaasan/obaasama", meaning: "aunt (polite)", kind: "kanji", emoji: "👩", lesson: 64, sec: "11-4" },
  { term: "おいとこさん", reading: "おいとこさん", romaji: "oitokosan", meaning: "cousin (polite)", kind: "hiragana", emoji: "🧑", lesson: 64, sec: "11-4" },
  { term: "彼", reading: "かれ", romaji: "kare", meaning: "he, boyfriend", kind: "kanji", emoji: "🧑‍🤝‍🧑", lesson: 64, sec: "11-4" },
  { term: "彼女", reading: "かのじょ", romaji: "kanojo", meaning: "she, girlfriend", kind: "kanji", emoji: "🧑‍🤝‍🧑", lesson: 64, sec: "11-4" },
  { term: "イメージ", reading: "イメージ", romaji: "ime-ji", meaning: "image", kind: "katakana", emoji: "🔤", lesson: 64, sec: "11-4" },
  { term: "ピッタリ／ピッタシ", reading: "ピッタリ／ピッタシ", romaji: "pittari／pittashi", meaning: "perfectly, exactly", kind: "hiragana", emoji: "🎯", lesson: 64, sec: "11-4" },
  { term: "積極的（な）", reading: "せっきょくてき", romaji: "sekkyokuteki", meaning: "active, positive, optimistic", kind: "kanji", emoji: "😃", lesson: 64, sec: "11-4" },
  { term: "消極的（な）", reading: "しょうきょくてき", romaji: "shoukyokuteki", meaning: "passive, unmotivated, pessimistic", kind: "kanji", emoji: "😔", lesson: 64, sec: "11-4" },
  { term: "社会的（な）", reading: "しゃかいてき", romaji: "shakaiteki", meaning: "social", kind: "kanji", emoji: "👥", lesson: 64, sec: "11-4" },
  { term: "歴史的（な）", reading: "れきしてき", romaji: "rekishiteki", meaning: "historical", kind: "kanji", emoji: "🏛️", lesson: 64, sec: "11-4" },
  { term: "文学的（な）", reading: "ぶんがくてき", romaji: "bungakuteki", meaning: "literary", kind: "kanji", emoji: "📖", lesson: 64, sec: "11-4" },
  { term: "自分的（な）", reading: "じぶんてき", romaji: "jibunteki", meaning: "like oneself", kind: "kanji", emoji: "❤️", lesson: 64, sec: "11-4" },
  { term: "私・僕的（な）", reading: "わたしてきぼくてき", romaji: "watashiteki・bokuteki", meaning: "like me", kind: "kanji", emoji: "❤️", lesson: 64, sec: "11-4" },
  { term: "お祝い", reading: "おいわい", romaji: "oiwai", meaning: "congratulations, celebration, gift", kind: "kanji", emoji: "🎉", lesson: 64, sec: "11-4" },
  { term: "被る (U; 被った)", reading: "かぶる", romaji: "kaburu", meaning: "wear, put on (one’s head, such as a hat)", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-4" },
  { term: "締める (RU; 締めた)", reading: "しめる", romaji: "shimeru", meaning: "wear, put on, fasten (a necktie) (lit. ‘tie, tighten’)", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-4" },
  { term: "掛ける (RU; 掛けた)", reading: "かける", romaji: "kakeru", meaning: "wear, put on (glasses, buttons) (lit. ‘hang, suspend’)", kind: "kanji", emoji: "👕", lesson: 64, sec: "11-4" },
  { term: "付ける(-RU; 付けた)", reading: "つける", romaji: "tsukeru", meaning: "attach, apply", kind: "kanji", emoji: "📎", lesson: 64, sec: "11-4" },
  { term: "する", reading: "する", romaji: "suru", meaning: "wear, put on (jewelry, accessories, make-up)", kind: "hiragana", emoji: "👕", lesson: 64, sec: "11-4" },
  { term: "カッコいい", reading: "カッコいい", romaji: "kakkoii", meaning: "good-looking, stylish, cool", kind: "hiragana", emoji: "🥶", lesson: 64, sec: "11-4" },
  { term: "その上", reading: "そのうえ", romaji: "sonoue", meaning: "what’s more, in addition, plus", kind: "kanji", emoji: "↪️", lesson: 64, sec: "11-4" },
  { term: "[person] + 思い", reading: "おもい", romaji: "omoi", meaning: "thoughtful about [person]", kind: "kanji", emoji: "🧍", lesson: 64, sec: "11-4" },
  { term: "どういう意味", reading: "どういういみ", romaji: "douiuimi", meaning: "what do you mean? what does that mean?", kind: "kanji", emoji: "❓", lesson: 64, sec: "11-4" },
  { term: "先ほど", reading: "さきほど", romaji: "sakihodo", meaning: "a while ago, just now", kind: "kanji", emoji: "📍", lesson: 64, sec: "11-5" },
  { term: "急（な）", reading: "きゅう", romaji: "kyuu", meaning: "sudden", kind: "kanji", emoji: "⚡", lesson: 64, sec: "11-5" },
  { term: "ズキズキ（する・痛む）", reading: "ずきずき", romaji: "zukizuki", meaning: "throbbing", kind: "kanji", emoji: "🤕", lesson: 64, sec: "11-5" },
  { term: "シクシク（する・痛む）", reading: "しくしく", romaji: "shikushiku", meaning: "dull continuous pain", kind: "kanji", emoji: "🤒", lesson: 64, sec: "11-5" },
  { term: "ヒリヒリ（する・痛む）", reading: "ひりひり", romaji: "hirihiri", meaning: "tender (as a rash)", kind: "kanji", emoji: "🤕", lesson: 64, sec: "11-5" },
  { term: "カサカサ（する・になる）", reading: "カサカサ（する・になる）", romaji: "kasakasa", meaning: "dry", kind: "hiragana", emoji: "🌵", lesson: 64, sec: "11-5" },
  { term: "フラフラ（する）", reading: "フラフラ（する）", romaji: "furafura", meaning: "dizzy", kind: "hiragana", emoji: "😵", lesson: 64, sec: "11-5" },
  { term: "ムカムカ（する）", reading: "ムカムカ（する）", romaji: "mukamuka", meaning: "nauseated; queasy", kind: "hiragana", emoji: "✅", lesson: 64, sec: "11-5" },
  { term: "しばらく", reading: "しばらく", romaji: "shibaraku", meaning: "a while, a moment", kind: "hiragana", emoji: "⏳", lesson: 64, sec: "11-5" },
  { term: "保健室", reading: "ほけんしつ", romaji: "hokenshitsu", meaning: "infirmary, clinic", kind: "kanji", emoji: "🏥", lesson: 64, sec: "11-5" },
  { term: "クリニック", reading: "クリニック", romaji: "kurinikku", meaning: "clinic", kind: "katakana", emoji: "🏥", lesson: 64, sec: "11-5" },
  { term: "頭", reading: "あたま", romaji: "atama", meaning: "head", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "首", reading: "くび", romaji: "kubi", meaning: "neck", kind: "kanji", emoji: "🧍", lesson: 64, sec: "11-5" },
  { term: "肩", reading: "かた", romaji: "kata", meaning: "shoulder", kind: "kanji", emoji: "🧍", lesson: 64, sec: "11-5" },
  { term: "腰", reading: "こし", romaji: "koshi", meaning: "(lower) back", kind: "kanji", emoji: "🧍", lesson: 64, sec: "11-5" },
  { term: "手", reading: "て", romaji: "te", meaning: "hand", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "腕", reading: "うで", romaji: "ude", meaning: "arm", kind: "kanji", emoji: "💪", lesson: 64, sec: "11-5" },
  { term: "指", reading: "ゆび", romaji: "yubi", meaning: "finger", kind: "kanji", emoji: "👆", lesson: 64, sec: "11-5" },
  { term: "足/脚", reading: "あし", romaji: "ashi", meaning: "feet/ leg", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "背中", reading: "せなか", romaji: "senaka", meaning: "back", kind: "kanji", emoji: "🧍", lesson: 64, sec: "11-5" },
  { term: "胸", reading: "むね", romaji: "mune", meaning: "chest", kind: "kanji", emoji: "🧍", lesson: 64, sec: "11-5" },
  { term: "（お）尻", reading: "しり", romaji: "shiri", meaning: "buttocks, behind", kind: "kanji", emoji: "🍑", lesson: 64, sec: "11-5" },
  { term: "顔", reading: "かお", romaji: "kao", meaning: "face", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "耳", reading: "みみ", romaji: "mimi", meaning: "ear", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "鼻", reading: "はな", romaji: "hana", meaning: "nose", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "口", reading: "くち", romaji: "kuchi", meaning: "mouth", kind: "kanji", emoji: "🫀", lesson: 64, sec: "11-5" },
  { term: "歯", reading: "は", romaji: "ha", meaning: "tooth", kind: "kanji", emoji: "🦷", lesson: 64, sec: "11-5" },
  { term: "舌", reading: "した", romaji: "shita", meaning: "tongue", kind: "kanji", emoji: "👅", lesson: 64, sec: "11-5" },
  { term: "横", reading: "よこ", romaji: "yoko", meaning: "side, horizontal", kind: "kanji", emoji: "↔️", lesson: 64, sec: "11-5" },
  { term: "縦", reading: "たて", romaji: "tate", meaning: "vertical", kind: "kanji", emoji: "↕️", lesson: 64, sec: "11-5" },
  { term: "斜め", reading: "ななめ", romaji: "naname", meaning: "diagonal", kind: "kanji", emoji: "↗️", lesson: 64, sec: "11-5" },
  { term: "（ご）心配（な）・（する）", reading: "しんぱい", romaji: "shinpai", meaning: "worry", kind: "kanji", emoji: "😟", lesson: 64, sec: "11-5" },
  { term: "こる (-RU; こった)", reading: "こる (-RU; こった)", romaji: "koru", meaning: "become stiff", kind: "hiragana", emoji: "🚶", lesson: 64, sec: "11-5" },
  { term: "痛む (-U; 痛んだ)", reading: "いたむ", romaji: "itamu", meaning: "become painful", kind: "kanji", emoji: "😣", lesson: 64, sec: "11-5" },
  { term: "もらう (-U; もらった)", reading: "もらう (-U; もらった)", romaji: "morau", meaning: "get, receive", kind: "hiragana", emoji: "📦", lesson: 64, sec: "11-5" },
  { term: "無理する", reading: "むりする", romaji: "murisuru", meaning: "try/work too hard, overdo", kind: "kanji", emoji: "💼", lesson: 64, sec: "11-5" },
  { term: "痛い", reading: "いたい", romaji: "itai", meaning: "painful", kind: "kanji", emoji: "😣", lesson: 64, sec: "11-5" },
  { term: "痒い", reading: "かゆい", romaji: "kayui", meaning: "itchy", kind: "kanji", emoji: "😖", lesson: 64, sec: "11-5" },
  { term: "急に", reading: "きゅう", romaji: "kyuu", meaning: "suddenly", kind: "kanji", emoji: "⚡", lesson: 64, sec: "11-5" },
  { term: "気持ちが悪い", reading: "きもち", romaji: "kimochi", meaning: "feel unwell; sickening, unpleasant, revolting", kind: "kanji", emoji: "😖", lesson: 64, sec: "11-5" },
  { term: "横になる", reading: "よこ", romaji: "yoko", meaning: "lie down", kind: "kanji", emoji: "🛌", lesson: 64, sec: "11-5" },
  { term: "心配をかける", reading: "しんぱい", romaji: "shinpai", meaning: "make (someone) worry", kind: "kanji", emoji: "😟", lesson: 64, sec: "11-5" },
  { term: "結果", reading: "けっか", romaji: "kekka", meaning: "result", kind: "kanji", emoji: "📊", lesson: 64, sec: "11-6" },
  { term: "働く (-U; 働いた)", reading: "はたらく", romaji: "hataraku", meaning: "work", kind: "kanji", emoji: "💼", lesson: 64, sec: "11-6" },
  { term: "打つ (-U; 打った)", reading: "うつ", romaji: "utsu", meaning: "hit, insert", kind: "kanji", emoji: "👊", lesson: 64, sec: "11-6" },
  { term: "答える", reading: "こたえる", romaji: "kotaeru", meaning: "answer, respond", kind: "kanji", emoji: "❓", lesson: 64, sec: "11-6" },
  { term: "それで", reading: "それで", romaji: "sorede", meaning: "then, following that", kind: "hiragana", emoji: "➡️", lesson: 64, sec: "11-6" },
  { term: "相槌を打つ", reading: "あいづちをうつ", romaji: "aiduchiwoutsu", meaning: "provide back-channel comments and nods", kind: "kanji", emoji: "💬", lesson: 64, sec: "11-6" },
  { term: "お世話様", reading: "おせわさま", romaji: "osewasama", meaning: "your kindness", kind: "kanji", emoji: "🙏", lesson: 64, sec: "11-7R" },
  { term: "駅前", reading: "えきまえ", romaji: "ekimae", meaning: "in front of the station", kind: "kanji", emoji: "🚉", lesson: 64, sec: "11-8R" },
  { term: "東大", reading: "とうだい", romaji: "toudai", meaning: "University of Tokyo", kind: "kanji", emoji: "🎓", lesson: 64, sec: "11-8R" },
  { term: "田口", reading: "たぐち", romaji: "taguchi", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 64, sec: "11-8R" },
  { term: "川口", reading: "かわぐち", romaji: "kawaguchi", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 64, sec: "11-8R" },
  { term: "右京", reading: "うきょう", romaji: "ukyou", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 64, sec: "11-9R" },
  { term: "左京", reading: "さきょう", romaji: "sakyou", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 64, sec: "11-9R" },
  { term: "可愛い子には旅をさせよ", reading: "かわいいこにわたびをさせよ", romaji: "kawaiikoniwatabiwosaseyo", meaning: "If you love your child, send them out into the world", kind: "kanji", emoji: "🧒", lesson: 65, sec: "12-0" },
  { term: "キャラ（クター）", reading: "キャラ（クター）", romaji: "kyara（kuta-）", meaning: "(fictional) character", kind: "hiragana", emoji: "🈶", lesson: 65, sec: "12-1" },
  { term: "文房具", reading: "ぶんぼうぐ", romaji: "bunbougu", meaning: "stationery", kind: "kanji", emoji: "✏️", lesson: 65, sec: "12-1" },
  { term: "漫画", reading: "まんが", romaji: "manga", meaning: "comics, manga", kind: "kanji", emoji: "📚", lesson: 65, sec: "12-1" },
  { term: "机", reading: "つくえ", romaji: "tsukue", meaning: "desk", kind: "kanji", emoji: "🪑", lesson: 65, sec: "12-1" },
  { term: "椅子", reading: "いす", romaji: "isu", meaning: "chair", kind: "kanji", emoji: "🪑", lesson: 65, sec: "12-1" },
  { term: "棚", reading: "たな", romaji: "tana", meaning: "shelf", kind: "kanji", emoji: "🗄️", lesson: 65, sec: "12-1" },
  { term: "いっぱい", reading: "いっぱい", romaji: "ippai", meaning: "a lot, much, full", kind: "hiragana", emoji: "🔢", lesson: 65, sec: "12-1" },
  { term: "貸す(-U; 貸した)", reading: "かす", romaji: "kasu", meaning: "lend, rent (to someone)", kind: "kanji", emoji: "🤝", lesson: 65, sec: "12-1" },
  { term: "くれる (-RU; くれた)", reading: "くれる (-RU; くれた)", romaji: "kureru", meaning: "give (to in-group)", kind: "hiragana", emoji: "📦", lesson: 65, sec: "12-1" },
  { term: "使ってくれたら", reading: "つかってくれたら", romaji: "tsukattekuretara", meaning: "if you would use it (for me)", kind: "kanji", emoji: "🧰", lesson: 65, sec: "12-1" },
  { term: "わーい", reading: "わーい", romaji: "wa-i", meaning: "wow! (surprise)", kind: "hiragana", emoji: "😲", lesson: 65, sec: "12-1" },
  { term: "恩", reading: "おん", romaji: "on", meaning: "benevolence, favor (BTS 1)", kind: "kanji", emoji: "🎁", lesson: 65, sec: "12-BTS 1" },
  { term: "義理", reading: "ぎり", romaji: "giri", meaning: "obligation (BTS 1)", kind: "kanji", emoji: "⚖️", lesson: 65, sec: "12-BTS 1" },
  { term: "送る (-U; 送った)", reading: "おくる", romaji: "okuru", meaning: "send", kind: "kanji", emoji: "📦", lesson: 65, sec: "12-2" },
  { term: "しまう (-U; しまった)", reading: "しまう (-U; しまった)", romaji: "shimau", meaning: "put away", kind: "hiragana", emoji: "📦", lesson: 65, sec: "12-2" },
  { term: "もらっちゃって", reading: "もらっちゃって", romaji: "moracchatte", meaning: "take, get", kind: "hiragana", emoji: "🤲", lesson: 65, sec: "12-2" },
  { term: "食べてるかどうか", reading: "たべてるかどうか", romaji: "tabeterukadouka", meaning: "whether you’re eating or not", kind: "kanji", emoji: "🍴", lesson: 65, sec: "12-2" },
  { term: "きっと", reading: "きっと", romaji: "kitto", meaning: "surely, undoubtedly", kind: "hiragana", emoji: "💯", lesson: 65, sec: "12-2" },
  { term: "納豆", reading: "なっとう", romaji: "nattou", meaning: "natto, fermented soy beans (BTS 4 FN)", kind: "kanji", emoji: "🫘", lesson: 65, sec: "12-2" },
  { term: "ジェシカ", reading: "ジェシカ", romaji: "jiェshika", meaning: "Jessica", kind: "katakana", emoji: "🔤", lesson: 65, sec: "12-3" },
  { term: "頑固（な）", reading: "がんこ", romaji: "ganko", meaning: "stubborn", kind: "kanji", emoji: "😤", lesson: 65, sec: "12-3" },
  { term: "髪", reading: "かみ", romaji: "kami", meaning: "hair", kind: "kanji", emoji: "💇", lesson: 65, sec: "12-3" },
  { term: "毛", reading: "け", romaji: "ke", meaning: "fur", kind: "kanji", emoji: "🐾", lesson: 65, sec: "12-3" },
  { term: "長さ", reading: "ながさ", romaji: "nagasa", meaning: "length", kind: "kanji", emoji: "📏", lesson: 65, sec: "12-3" },
  { term: "体・身体・からだ", reading: "からだ", romaji: "karada", meaning: "body", kind: "kanji", emoji: "🫀", lesson: 65, sec: "12-3" },
  { term: "男性", reading: "だんせい", romaji: "dansei", meaning: "man, boy", kind: "kanji", emoji: "👦", lesson: 65, sec: "12-3" },
  { term: "ペット", reading: "ペット", romaji: "petto", meaning: "pet", kind: "katakana", emoji: "🔤", lesson: 65, sec: "12-3" },
  { term: "飼う（飼った）", reading: "かう", romaji: "kau", meaning: "keep (a pet or other animal)", kind: "kanji", emoji: "🐾", lesson: 65, sec: "12-3" },
  { term: "〜羽", reading: "わ", romaji: "wa", meaning: "classifier for countingbirds and rabbits", kind: "kanji", emoji: "🔢", lesson: 65, sec: "12-3" },
  { term: "おとなしい", reading: "おとなしい", romaji: "otonashii", meaning: "laidback, quiet, docile", kind: "hiragana", emoji: "🤫", lesson: 65, sec: "12-3" },
  { term: "賢い", reading: "かしこい", romaji: "kashikoi", meaning: "clever, smart", kind: "kanji", emoji: "🧠", lesson: 65, sec: "12-3" },
  { term: "頭が/のいい", reading: "あたまがのいい", romaji: "atamaga/noii", meaning: "intelligent", kind: "kanji", emoji: "🧠", lesson: 65, sec: "12-3" },
  { term: "誰か知らない", reading: "だれかしらない", romaji: "darekashiranai", meaning: "don't know who that is", kind: "kanji", emoji: "💡", lesson: 65, sec: "12-3" },
  { term: "茶色の目をしている", reading: "ちゃいろのめをしている", romaji: "chaironomewoshiteiru", meaning: "has brown eyes", kind: "kanji", emoji: "👁️", lesson: 65, sec: "12-3" },
  { term: "で", reading: "で", romaji: "de", meaning: "and…", kind: "hiragana", emoji: "➕", lesson: 65, sec: "12-3" },
  { term: "迎え", reading: "むかえ", romaji: "mukae", meaning: "greeting, welcome", kind: "kanji", emoji: "🚶", lesson: 65, sec: "12-4" },
  { term: "早く", reading: "はやく", romaji: "hayaku", meaning: "early", kind: "kanji", emoji: "⏱️", lesson: 65, sec: "12-4" },
  { term: "遅く", reading: "おそく", romaji: "osoku", meaning: "late", kind: "kanji", emoji: "⏱️", lesson: 65, sec: "12-4" },
  { term: "夜型", reading: "よるがた", romaji: "yorugata", meaning: "night person", kind: "kanji", emoji: "🧍", lesson: 65, sec: "12-4" },
  { term: "朝型", reading: "あさがた", romaji: "asagata", meaning: "morning person", kind: "kanji", emoji: "🧍", lesson: 65, sec: "12-4" },
  { term: "ただ", reading: "ただ", romaji: "tada", meaning: "simply; free of charge", kind: "hiragana", emoji: "🕊️", lesson: 65, sec: "12-4" },
  { term: "寝不足", reading: "ねぶそく", romaji: "nebusoku", meaning: "lack of sleep", kind: "kanji", emoji: "🛏️", lesson: 65, sec: "12-4" },
  { term: "勉強不足", reading: "べんきょうぶそく", romaji: "benkyoubusoku", meaning: "lack of study", kind: "kanji", emoji: "📖", lesson: 65, sec: "12-4" },
  { term: "練習不足", reading: "れんしゅうぶそく", romaji: "renshuubusoku", meaning: "lack of practice", kind: "kanji", emoji: "📉", lesson: 65, sec: "12-4" },
  { term: "不足（する）", reading: "ふそく", romaji: "fusoku", meaning: "insufficiency", kind: "kanji", emoji: "📉", lesson: 65, sec: "12-4" },
  { term: "迎える (-RU; 迎えた)", reading: "むかえる", romaji: "mukaeru", meaning: "go to meet; welcome", kind: "kanji", emoji: "🚪", lesson: 65, sec: "12-4" },
  { term: "眠い", reading: "ねむい", romaji: "nemui", meaning: "sleepy", kind: "kanji", emoji: "😴", lesson: 65, sec: "12-4" },
  { term: "来ていただいて", reading: "きていただいて", romaji: "kiteitadaite", meaning: "getting you to come", kind: "kanji", emoji: "🚪", lesson: 65, sec: "12-4" },
  { term: "申し訳ない", reading: "もうしわけない", romaji: "moushiwakenai", meaning: "I’m very sorry", kind: "kanji", emoji: "🙇", lesson: 65, sec: "12-4" },
  { term: "朝に強い", reading: "あさにつよい", romaji: "asanitsuyoi", meaning: "morning type (lit. ‘strong in the morning’)", kind: "kanji", emoji: "🌅", lesson: 65, sec: "12-4" },
  { term: "どちらかと言うと", reading: "どちらかというと", romaji: "dochirakatoiuto", meaning: "if I have to say which", kind: "kanji", emoji: "💬", lesson: 65, sec: "12-4" },
  { term: "大きな", reading: "おおきな", romaji: "ookina", meaning: "large, big", kind: "kanji", emoji: "🔷", lesson: 65, sec: "12-5" },
  { term: "小さな", reading: "ちいさな", romaji: "chiisana", meaning: "small, little", kind: "kanji", emoji: "🔹", lesson: 65, sec: "12-5" },
  { term: "立派（な）", reading: "りっぱ", romaji: "rippa", meaning: "splendid, elegant", kind: "kanji", emoji: "✨", lesson: 65, sec: "12-5" },
  { term: "教授", reading: "きょうじゅ", romaji: "kyouju", meaning: "professor (academic rank)", kind: "kanji", emoji: "🧑‍🏫", lesson: 65, sec: "12-5" },
  { term: "まま", reading: "まま", romaji: "mama", meaning: "as is, condition", kind: "hiragana", emoji: "🩺", lesson: 65, sec: "12-5" },
  { term: "そっくり", reading: "そっくり", romaji: "sokkuri", meaning: "exactly like, completely", kind: "hiragana", emoji: "❤️", lesson: 65, sec: "12-5" },
  { term: "ひげ", reading: "ひげ", romaji: "hige", meaning: "beard", kind: "hiragana", emoji: "🧔", lesson: 65, sec: "12-5" },
  { term: "X以外", reading: "いがい", romaji: "igai", meaning: "outside of X; besides X", kind: "kanji", emoji: "↪️", lesson: 65, sec: "12-5" },
  { term: "一人っ子", reading: "ひとりっこ", romaji: "hitorikko", meaning: "only child", kind: "kanji", emoji: "🧒", lesson: 65, sec: "12-5" },
  { term: "姉妹", reading: "しまい", romaji: "shimai", meaning: "sisters", kind: "kanji", emoji: "👭", lesson: 65, sec: "12-5" },
  { term: "X人兄弟", reading: "きょうだい", romaji: "kyoudai", meaning: "X number of siblings (including oneself)", kind: "kanji", emoji: "🔢", lesson: 65, sec: "12-5" },
  { term: "X人姉妹", reading: "しまい", romaji: "shimai", meaning: "X number of sisters (including oneself)", kind: "kanji", emoji: "🔢", lesson: 65, sec: "12-5" },
  { term: "X人家族", reading: "かぞく", romaji: "kazoku", meaning: "X number in a family (including oneself)", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 65, sec: "12-5" },
  { term: "双子", reading: "ふたご", romaji: "futago", meaning: "twins", kind: "kanji", emoji: "👯", lesson: 65, sec: "12-5" },
  { term: "（お）一人", reading: "ひとり", romaji: "hitori", meaning: "one (person); alone; single", kind: "kanji", emoji: "🧍", lesson: 65, sec: "12-5" },
  { term: "独身", reading: "どくしん", romaji: "dokushin", meaning: "single; unmarried", kind: "kanji", emoji: "👤", lesson: 65, sec: "12-5" },
  { term: "生やす (-U; 生やした)", reading: "はやす", romaji: "hayasu", meaning: "grow (a beard)", kind: "kanji", emoji: "🧔", lesson: 65, sec: "12-5" },
  { term: "若い", reading: "わかい", romaji: "wakai", meaning: "young", kind: "kanji", emoji: "👶", lesson: 65, sec: "12-5" },
  { term: "このまま", reading: "このまま", romaji: "konomama", meaning: "as it is; without change", kind: "hiragana", emoji: "🔓", lesson: 65, sec: "12-5" },
  { term: "〜てほしい/欲しい", reading: "ほしい", romaji: "hoshii", meaning: "want (someone) to X", kind: "kanji", emoji: "🙋", lesson: 65, sec: "12-5" },
  { term: "X にそっくり", reading: "X にそっくり", romaji: "sokkuri", meaning: "look exactly like X", kind: "hiragana", emoji: "❤️", lesson: 65, sec: "12-5" },
  { term: "ひげを生やす", reading: "ひげをはやす", romaji: "higewohayasu", meaning: "grow a beard", kind: "kanji", emoji: "🧔", lesson: 65, sec: "12-5" },
  { term: "並んでいると似てる", reading: "ならんでいるとにてる", romaji: "narandeirutoniteru", meaning: "look alike standing next to each other", kind: "kanji", emoji: "🔟", lesson: 65, sec: "12-5" },
  { term: "（ご）案内（する）", reading: "あんない", romaji: "annai", meaning: "show around", kind: "kanji", emoji: "🗺️", lesson: 65, sec: "12-6" },
  { term: "すっかり", reading: "すっかり", romaji: "sukkari", meaning: "completely", kind: "hiragana", emoji: "💯", lesson: 65, sec: "12-6" },
  { term: "（お）世話する", reading: "せわする", romaji: "sewasuru", meaning: "look after (someone)", kind: "kanji", emoji: "👀", lesson: 65, sec: "12-6" },
  { term: "やる（-U; やった）", reading: "やる（-U; やった）", romaji: "yaru", meaning: "give", kind: "hiragana", emoji: "📦", lesson: 65, sec: "12-6" },
  { term: "行くことになりました", reading: "いくことになりました", romaji: "ikukotoninarimashita.", meaning: "It has been decided I will go", kind: "kanji", emoji: "🚪", lesson: 65, sec: "12-6" },
  { term: "なんとなく", reading: "なんとなく", romaji: "nantonaku", meaning: "somehow or other", kind: "hiragana", emoji: "🤷", lesson: 65, sec: "12-6" },
  { term: "もしかしたら", reading: "もしかしたら", romaji: "moshikashitara", meaning: "by some chance; maybe", kind: "hiragana", emoji: "🤷", lesson: 65, sec: "12-6" },
  { term: "もしかすると", reading: "もしかすると", romaji: "moshikasuruto", meaning: "by some chance; maybe", kind: "hiragana", emoji: "🤷", lesson: 65, sec: "12-6" },
  { term: "案内してあげる", reading: "あんないしてあげる", romaji: "annaishiteageru", meaning: "I’ll do you the favor of showing you around", kind: "kanji", emoji: "🗺️", lesson: 65, sec: "12-6" },
  { term: "お知らせ", reading: "おしらせ", romaji: "oshirase", meaning: "announcement, notice (lit. 'letting know')", kind: "kanji", emoji: "💡", lesson: 65, sec: "12-7R" },
  { term: "ローマ字", reading: "ろまじ", romaji: "ro-maji", meaning: "romanization", kind: "kanji", emoji: "🔤", lesson: 65, sec: "12-7R" },
  { term: "小テスト", reading: "しょうてすと", romaji: "shoutesuto", meaning: "small test, quiz", kind: "kanji", emoji: "📝", lesson: 65, sec: "12-7R" },
  { term: "小学生", reading: "しょうがくせい", romaji: "shougakusei", meaning: "elementary school student", kind: "kanji", emoji: "🧑‍🎓", lesson: 65, sec: "12-7R" },
  { term: "小山", reading: "こやま", romaji: "koyama", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 65, sec: "12-7R" },
  { term: "小川", reading: "おがわ", romaji: "ogawa", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 65, sec: "12-7R" },
  { term: "小田", reading: "おだ", romaji: "oda", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 65, sec: "12-7R" },
  { term: "教会", reading: "きょうかい", romaji: "kyoukai", meaning: "church", kind: "kanji", emoji: "⛪", lesson: 65, sec: "12-7R" },
  { term: "電気", reading: "でんき", romaji: "denki", meaning: "electricity, light", kind: "kanji", emoji: "🏙️", lesson: 65, sec: "12-8R" },
  { term: "大雨", reading: "おおあめ", romaji: "ooame", meaning: "heavy rain, downpour", kind: "kanji", emoji: "🌧️", lesson: 65, sec: "12-8R" },
  { term: "大雪", reading: "おおゆき", romaji: "ooyuki", meaning: "heavy snow, snow storm", kind: "kanji", emoji: "❄️", lesson: 65, sec: "12-8R" },
  { term: "雪子", reading: "ゆきこせつこ", romaji: "yukiko・setsuko", meaning: "[given name]", kind: "kanji", emoji: "🧑", lesson: 65, sec: "12-8R" },
  { term: "安田", reading: "やすだ", romaji: "yasuda", meaning: "[family name]", kind: "kanji", emoji: "👨‍👩‍👧", lesson: 65, sec: "12-9R" },
  { term: "安子", reading: "やすこ", romaji: "yasuko", meaning: "[given name]", kind: "kanji", emoji: "🧑", lesson: 65, sec: "12-9R" },
  { term: "昼休み", reading: "ひるやすみ", romaji: "hiruyasumi", meaning: "lunch break", kind: "kanji", emoji: "🍚", lesson: 65, sec: "12-9R" },
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

// ── cross-device sync (Cloudflare Worker KV via /api/sync, Google-session only) ──
// Sync requires a signed-in Google session (see below); signed-out devices stay local-only —
// no anonymous sync-code fallback (that path used to accept any guessable code as a free,
// unauthenticated KV write bucket; removed). Merging is per-record (not whole-file
// last-write-wins) so studying on two devices before either has synced never loses progress.
const SYNC_ENDPOINT = "/.netlify/functions/sync";
const SYNC_PREFIX = "jpn101:";
/* Caches of files the app already ships are excluded: kanjiData and freqData are ~1.1MB of
   static content that would otherwise be uploaded to the cloud on every save and counted
   against the sync payload for no benefit at all. */
// Keys that live on THIS device only. Anything else under jpn101: is study data and syncs.
// A key listed here must never be written to the cloud and must be ignored if an old cloud
// record still carries it (e.g. jpn101:session — syncing a bearer token across devices via
// an unauthenticated snapshot merge would let one device silently sign another one in).
const SYNC_SKIP_KEYS = new Set(["jpn101:ping", "jpn101:syncLastPulled", "jpn101:snapshot",
  "jpn101:kanjiData", "jpn101:freqData",
  "jpn101:session", "jpn101:userEmail", "jpn101:syncPending", "jpn101:lastBackup", "jpn101:videoIndex"]);

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
// Merge rules live in tools/merge.mjs (pure, testable — see tools/test-merge.mjs).
// ── Google Sign-In with a real persistent session ──
// One explicit click exchanges a Google ID token for OUR OWN long-lived signed
// session token (~2 years), stored in localStorage. Every later visit just reads
// that token straight from storage — no re-running Google's sign-in flow, no
// dependency on browser silent-reauth (which is unreliable and was causing
// "asks me to log in again every time"). Signed-out devices stay local-only —
// there is no anonymous fallback (see SYNC_ENDPOINT comment above).
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
function clearSessionStorage() {
  try { window.localStorage.removeItem(SESSION_KEY); window.localStorage.removeItem(USER_EMAIL_KEY); } catch (e) {}
  _googleEmail = null;
}
function signOutGoogle() {
  clearSessionStorage();
  setSyncState("idle");           // stop showing "Saving…"/"Not saved yet" once there's nowhere to save to
  setAuthState("signed-out");
}
let _googleEmail = (() => { try { return window.localStorage.getItem(USER_EMAIL_KEY); } catch (e) { return null; } })();

// auth mini-store: lets any component (Browse, the root loader) react to sign-in,
// sign-out, and — the case nothing used to handle — a session going bad mid-session.
let _authState = loadSession() ? "signed-in" : "signed-out";   // signed-in | signed-out | expired
const _authWatchers = new Set();
function setAuthState(s) { _authState = s; _authWatchers.forEach((fn) => { try { fn(s); } catch (e) {} }); }
function watchAuthState(fn) { _authWatchers.add(fn); return () => _authWatchers.delete(fn); }
function authStateNow() { return _authState; }
function handleAuthFailure() {     // a 401 from /api/sync: the token is dead (expired or SESSION_SECRET rotated)
  const had = !!loadSession();
  clearSessionStorage();
  setSyncState("idle");
  setAuthState(had ? "expired" : "signed-out");
}

let _gisReadyPromise = null;
function gisReady() {
  if (_gisReadyPromise) return _gisReadyPromise;
  _gisReadyPromise = new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google?.accounts?.id) resolve();
      else if (Date.now() - t0 > 20000) { _gisReadyPromise = null; reject(new Error("gsi not loaded")); }   // offline/blocked — stop polling forever
      else setTimeout(check, 150);
    })();
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
    setAuthState("signed-in");
    return true;
  } catch (e) { return false; /* offline — try again next click */ }
}
let _googleInitDone = false;
let _googleTokenListeners = [];   // every caller's callback fires — initialize() itself only ever runs once
function initGoogleAuth(onToken) {
  if (onToken) _googleTokenListeners.push(onToken);
  const unsubscribe = () => { _googleTokenListeners = _googleTokenListeners.filter((fn) => fn !== onToken); };
  if (loadSession()) return unsubscribe;   // already have a persistent session — no need to touch Google's flow at all
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
  }).catch(() => {});
  return unsubscribe;
}
function renderGoogleButton(el) {
  if (!el || loadSession()) return;
  gisReady().then(() => {
    try { window.google.accounts.id.renderButton(el, { theme: "outline", size: "medium", text: "signin_with" }); } catch (e) {}
  }).catch(() => {});
}
function syncRequestOptions(extra) {
  const session = loadSession();
  if (!session) return null;   // signed out: local-only, no network
  const opts = { ...extra, cache: "no-store", headers: { ...((extra && extra.headers) || {}), authorization: "Bearer " + session } };
  return { url: SYNC_ENDPOINT, opts };
}

// ── saving progress to the cloud ──
// Progress is the one thing in here that can't be regenerated, so a failed save must
// never be silent. Three things this guards against, all of which were live bugs:
//   1. fetch() resolves for a 401/500 too — an unchecked response counted a rejected
//      write as a success, so the app believed it had saved when it hadn't.
//   2. A failure had no retry: the data sat local-only forever with no indication.
//   3. The 2.5s debounce meant answering a card and closing the tab within 2.5s
//      dropped that save entirely.
const SYNC_PENDING_KEY = "jpn101:syncPending";
let _syncState = "idle";            // idle | saving | saved | pending
const _syncWatchers = new Set();
function setSyncState(s) {
  _syncState = s;
  _syncWatchers.forEach((fn) => { try { fn(s); } catch (e) {} });
}
function watchSyncState(fn) { _syncWatchers.add(fn); return () => _syncWatchers.delete(fn); }
function syncStateNow() { return _syncState; }
function markSyncPending() { try { window.localStorage.setItem(SYNC_PENDING_KEY, String(Date.now())); } catch (e) {} }
function clearSyncPending() { try { window.localStorage.removeItem(SYNC_PENDING_KEY); } catch (e) {} }
function hasSyncPending() { try { return !!window.localStorage.getItem(SYNC_PENDING_KEY); } catch (e) { return false; } }

let _retryTimer = null;
async function pushCloudNow({ attempt = 0, keepalive = false } = {}) {
  if (_cloudPushTimer) { clearTimeout(_cloudPushTimer); _cloudPushTimer = null; }
  const req = syncRequestOptions({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updatedAt: Date.now(), snapshot: collectLocalSnapshot() }),
    keepalive,                        // lets the request outlive the page on pagehide
  });
  if (!req) { setSyncState("idle"); return false; }   // signed out: nothing to push anywhere
  setSyncState("saving");
  try {
    const res = await fetch(req.url, req.opts);
    if (res.status === 401) { handleAuthFailure(); markSyncPending(); setSyncState("pending"); return false; }   // keep the flag; do NOT retry an auth failure
    if (!res.ok) throw new Error("save rejected: HTTP " + res.status);
    clearSyncPending();
    setSyncState("saved");
    return true;
  } catch (e) {
    // keep a durable flag so a failure survives a reload and gets retried later
    markSyncPending();
    setSyncState("pending");
    if (attempt < 5) {
      const wait = Math.min(30000, 1000 * Math.pow(2, attempt));   // 1s,2s,4s,8s,16s
      clearTimeout(_retryTimer);
      _retryTimer = setTimeout(() => pushCloudNow({ attempt: attempt + 1 }), wait);
    }
    return false;
  }
}
let _cloudPushTimer = null;
function scheduleCloudPush() {
  if (_cloudPushTimer) clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(() => pushCloudNow(), 2500);
}
if (typeof window !== "undefined") {
  // retry the moment there's any reason to think it might work now
  window.addEventListener("online", () => { if (hasSyncPending()) pushCloudNow(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasSyncPending()) pushCloudNow();
  });
  // flush a debounced-but-not-yet-sent save before the page goes away
  window.addEventListener("pagehide", () => {
    if (_cloudPushTimer || hasSyncPending()) pushCloudNow({ keepalive: true });
  });
}
async function pullAndMergeCloud() {
  try {
    const req = syncRequestOptions({});
    if (!req) return false;   // signed out: nothing to pull
    const res = await fetch(req.url, req.opts);
    if (res.status === 401) { handleAuthFailure(); return false; }
    if (!res.ok) return false;
    const { data } = await res.json();
    if (!data || !data.snapshot) return false;
    const localSnap = collectLocalSnapshot();
    let lastPulled = 0;
    try { lastPulled = Number(window.localStorage.getItem("jpn101:syncLastPulled") || 0); } catch (e) {}
    const merged = mergeSnapshots(localSnap, data.snapshot, data.updatedAt, lastPulled, SYNC_SKIP_KEYS);
    Object.keys(merged).forEach((k) => { try { window.localStorage.setItem(k, merged[k]); } catch (e) {} });
    try { window.localStorage.setItem("jpn101:syncLastPulled", String(Date.now())); } catch (e) {}
    return true;
  } catch (e) { return false; /* offline — keep using local data */ }
}

const KIND_LABEL = { kanji: "漢字", hiragana: "ひらがな", katakana: "カタカナ", mixed: "混" };

/* ── daily study log: reviews, hits, think-time, new-word intake, per day ── */
/* Desired retention — the single knob FSRS exposes, and the only one worth exposing.
   0.90 means "schedule each card for the day it has a 90% chance of being recalled".
   Lower it and you review less but forget more; raise it and you review far more for a
   little extra recall. 0.90 is the researched default and where the review-count curve
   starts climbing steeply. */
const RETENTION_KEY = "jpn101:retention";
let retentionTarget = 0.9;
try {
  const r = Number(window.localStorage.getItem(RETENTION_KEY));
  if (r >= 0.7 && r <= 0.97) retentionTarget = r;
} catch (e) {}
function setRetention(r) {
  retentionTarget = Math.min(0.97, Math.max(0.7, r));
  sSet(RETENTION_KEY, String(retentionTarget));   // async, fire-and-forget; schedules a push like any other setting
}

const DAYS_KEY = "jpn101:days";
let _days = null;
async function loadDays() {
  if (_days === null) { try { const r = await sGet(DAYS_KEY); _days = r ? JSON.parse(r) : {}; } catch (e) { _days = {}; } }
  return _days;
}
async function logDay({ ok, ms, deck, fnew, area }) {
  await loadDays();
  const k = localDayKey();
  const d = _days[k] || (_days[k] = { rev: 0, ok: 0, ms: 0, frev: 0, fnew: 0 });
  d.rev += 1; if (ok) d.ok += 1; if (ms) d.ms += ms;
  if (deck === "freq") { d.frev += 1; if (fnew) d.fnew += 1; }
  /* Per-deck counts, so the study plan can report which SKILL AREAS actually got worked
     rather than only how many reviews happened. Without this the plan is a wish list: it
     can state that listening matters and never notice that listening never happens. */
  const a = area || (deck ? areaForDeck(deck) : null);
  if (a) { (d.by || (d.by = {}))[a] = (d.by[a] || 0) + 1; }
  sSet(DAYS_KEY, JSON.stringify(_days));
}

/* ── the mascot ──
   Pixel-art nigiri, one animated GIF per mood, generated by tools/make-mascot.mjs and
   inlined as data URIs — about 2.5KB for all five, so no extra request and nothing to
   load. GIF rather than SVG because pixel art is what was asked for, and a hand-rolled
   encoder (tools/gifenc.mjs) turned out to be ~90 lines; the earlier claim that a GIF
   wasn't practical here was wrong.
   States are earned rather than decorative: asleep when you haven't studied, worried when
   reviews pile up, delighted on a streak. A mascot that always looks happy carries no
   information. */
function mascotState({ studiedToday, dueCount, streak }) {
  if (!studiedToday) return dueCount > 30 ? "worried" : "sleeping";
  if (streak >= 7) return "proud";
  if (dueCount > 40) return "worried";
  return "happy";
}
function Mascot({ state, size = 84 }) {
  const src = MASCOT_GIFS[state] || MASCOT_GIFS.waiting;
  return <img className={"tc-mascot is-" + state} src={src} width={size} height={size * 30 / 32}
              alt={"Study buddy, looking " + state} draggable="false" />;
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
      a.href = url; a.download = "tangocho-backup-" + localDayKey() + ".json";
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
    try { window.localStorage.removeItem("jpn101:syncCode"); } catch (e) {}   // one-time cleanup: the anonymous sync-code path is gone
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
      list = applySeed(list, SEED, uid);
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
  useEffect(() => initGoogleAuth(loadCardsAndSync), [loadCardsAndSync]);

  const persist = useCallback((next) => {
    setCards(next);
    sSet(STORE_KEY, JSON.stringify(next));
  }, []);

  const addCards = useCallback((newOnes) => {
    setCards((prev) => {
      const have = new Set(prev.map(cardMergeKey));
      const nextLesson = prev.reduce((m, c) => Math.max(m, c.lesson || 1), 0) + 1;
      const fresh = newOnes
        .filter((c) => c.term)
        .map((c) => ({ id: uid(), seen: 0, correct: 0, sample: false, kind: c.kind || detectKind(c.term), lesson: nextLesson, ...c }))
        .filter((c) => !have.has(cardMergeKey(c)));
      const next = [...prev, ...fresh];
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /* Parking, not deleting. A displaced word keeps every field it had — only untouched
     words are ever eligible — and comes back when the active set has room. Reversible by
     design: permanently retiring someone's vocabulary to make space for a manga chapter
     would be a bad trade to make silently. */
  const parkCards = useCallback((ids) => {
    if (!ids || !ids.length) return;
    const set = new Set(ids);
    setCards((prev) => {
      const next = prev.map((c) => (set.has(c.id) ? { ...c, parked: true } : c));
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCard = useCallback((id) => {
    setCards((prev) => { const next = prev.filter((c) => c.id !== id); sSet(STORE_KEY, JSON.stringify(next)); return next; });
  }, []);

  const clearAll = useCallback(() => { persist([]); }, [persist]);
  const restoreDeck = useCallback(async (deck) => { persist(deck); }, [persist]);


  const setMnemonic = useCallback((id, text) => {
    setCards((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, mn: text.slice(0, 120) } : c));
      sSet(STORE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const recordResult = useCallback((id, got, dir, ms, area, outcome) => {
    const t = ms && ms > 250 && ms < 180000 ? Math.round(ms) : 0;  // sanity bounds: ignore misfires & walked-away cards
    logDay({ ok: got, ms: t, deck: "class", area });
    setCards((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const firstProdTry = dir === "prod" && (c.rseen || 0) === 0;   // first attempt at producing = learning, not a lapse
        /* Hesitation predicts failure. In this deck, answers given in under 3 seconds
            are 87% correct and answers taking over 6 seconds are 71% correct — so a slow
            "got it" is much weaker evidence than a fast one, and treating them the same
            is why 503 studied cards produced only ten at level 4.
            Fast+right now advances two levels, slow+right advances one, and a right answer
            that took more than 10 seconds holds level instead of advancing. */
        const fast = got && t > 0 && t < 3000;
        const crawl = got && t >= 10000;
        const delta = got ? (fast ? 0.08 : crawl ? 0 : 0.05) : firstProdTry ? 0 : -0.15;
        /* FSRS runs alongside the old counters rather than replacing them: seen/correct/
           level still drive the existing UI, and keeping them means nothing already
           recorded is lost if this needs rolling back. The schedule, though, now comes
           from the memory model. */
        const grade = gradeAgainstNorm(got, t, area === "writing" ? "production" : "recognition",
          dir === "prod" ? "type" : "recall", latencyNormsRef.current, c.streak || 0);
        /* Recognition and production are tracked separately. Being able to read 火曜日 says
           very little about being able to produce it from "Tuesday", so one shared
           stability would over-schedule one direction and under-schedule the other. */
        const isProd = dir === "prod";
        const prior = isProd ? (c.rfsrs || null) : (c.fsrs || seedFromHistory(c));
        const nextState = fsrsReview(prior, grade, Date.now(), retentionTarget);
        const fsrs = isProd ? c.fsrs : nextState;
        const rfsrs = isProd ? nextState : c.rfsrs;
        const ease = Math.max(0.55, Math.min(1.8, (c.ease || 1) + delta)); // adaptive: misses tighten the leash
        /* The rolling history and the failure kind ride along with the card update.
           A separate writer racing this one is how a record lost half of itself. */
        const base = applyOutcome(
          { ...c, ease, fsrs, rfsrs, streak: got ? (c.streak || 0) + 1 : 0, last: Date.now() },
          { ok: got, failure: outcome && outcome.failure, skill: outcome && outcome.skill });
        if (dir === "prod") {                       // EN→JP recall (production)
          return {
            ...base,
            rseen: (c.rseen || 0) + 1,
            rcorrect: (c.rcorrect || 0) + (got ? 1 : 0),
            rms: (c.rms || 0) + t, rmsN: (c.rmsN || 0) + (t ? 1 : 0),
            rlevel: got ? Math.min(5, (c.rlevel || 0) + (fast ? 2 : crawl ? 0 : 1)) : Math.max(0, (c.rlevel || 0) - 2),
          };
        }
        return {                                    // JP→EN recognition
          ...base,
          seen: (c.seen || 0) + 1,
          correct: (c.correct || 0) + (got ? 1 : 0),
          ms: (c.ms || 0) + t, msN: (c.msN || 0) + (t ? 1 : 0),
          level: got ? Math.min(5, (c.level || 0) + (fast ? 2 : crawl ? 0 : 1)) : Math.max(0, (c.level || 0) - 2),
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
            {[["study", "Study"], ["freq", "10k"], ["drill", "Drill"], ["input", "Input"], ["kanji", "Kanji"], ["dates", "Dates"], ["kana", "Kana"], ["scripts", "Scripts"], ["browse", "Browse"], ["plan", "Plan"]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id}
                className={"tc-tab" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>

        </header>

        {!ready ? (
          <div className="tc-empty">Loading your deck…</div>
        ) : tab === "study" ? (
          <Study cards={cards} onResult={recordResult} goAdd={() => setTab("browse")} onMnemonic={setMnemonic} />
        ) : tab === "freq" ? (
          <Freq />
        ) : tab === "drill" ? (
          <ConjDrill />
        ) : tab === "input" ? (
          <Input cards={cards} onAdd={addCards} onPark={parkCards} />
        ) : tab === "oral" ? (
          /* Oral keeps its render branch and its components, same as Write. The chip is
             gone for now, not the feature — the mock final and Culture Talk rehearsals are
             the only speaking practice here, and the exam they were built for comes back. */
          <OralHome />
        ) : tab === "kanji" ? (
          <Kanji cards={cards} />
        ) : tab === "dates" ? (
          <Dates />
        ) : tab === "write" ? (
          /* Write keeps its render branch and its component. The tab chip is gone for now,
             not the feature — it is the only production-recall practice in the app and
             deleting it to make room would be throwing away the harder retrieval. */
          <Write cards={cards} onResult={recordResult} />
        ) : tab === "plan" ? (
          <Plan cards={cards} />
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
function Study({ cards, onResult, goAdd, onMnemonic }) {
  const [showRomaji, setShowRomaji] = useState(false); // front rōmaji on/off
  const [showPitch, setShowPitch] = useState(true);    // back pitch ⸢ ⸣ marks on/off
  const [queue, setQueue] = useState([]);              // working order; missed cards get re-inserted
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);         // unique cards this session
  const [passed, setPassed] = useState(() => new Set());     // cleared (eventually correct)
  const [firstTry, setFirstTry] = useState(() => new Set()); // correct with no prior miss
  const [struggled, setStruggled] = useState(() => new Set()); // missed at least once
  const missRef = useRef({});                          // id -> miss count this session
  const sessionLog = useRef([]);                       // evidence gathered this session, for the debrief
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
      const { result } = await callAI("hook", { term: card.term, reading: card.reading, romaji: card.romaji, meaning: card.meaning });
      const text = (result.hook || "").trim();
      if (!text) throw new AIError(502, aiMessage(502));
      hooksRef.current[card.term] = text;
      sSet("jpn101:hooks", JSON.stringify(hooksRef.current));
      setHook({ term: card.term, text });
    } catch (e) { setHook({ term: card.term, err: e.message || aiMessage(0) }); }
  }, []);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");        // rōmaji the learner types on a production card
  const [verdict, setVerdict] = useState(null);  // {ok, got, want} once that answer is checked
  const [showWhy, setShowWhy] = useState(false);  // per-card "why am I seeing this?"
  const [running, setRunning] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const liveRef = useRef(null);
  const [prodSet, setProdSet] = useState(() => new Set());
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [flash, setFlash] = useState(0);
  const shownRef = useRef(0);          // when the current card appeared
  const thinkRef = useRef(null);       // ms from shown → first reveal (think time)
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, running]);
  useEffect(() => {                    // auto-speak the term as soon as each card appears
    if (!running || !voiceOn) return;
    const c = queue[pos];
    if (!c) return;
    speakJa(c.reading || c.term, 0.88);   // match SpeakBtn's rate so this hits the same cache entry
    const next = queue[pos + 1];          // warm the cache for the next card while this one's up
    if (next) prefetchJa(next.reading || next.term, 0.88);
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
  /* Session mix.
     The old rule was `newCount > 12` → half the session is brand-new words. With 332
     untouched cards that condition is permanently true, so every session was 8 new words
     against 8 reviews no matter how much overdue work had piled up. Accuracy fell from
     98% to 36% over two weeks while effort went up, because most of what came round was
     material never seen before.
     New words are never capped to zero — there are class deadlines — but review debt now
     earns slots: the more overdue cards there are, the fewer new words share the session.
     Leeches are excluded here entirely and get their own mode; drilling a word sitting at
     0% after eight tries inside a normal session just taxes the whole session. */
  /* Session selection now comes from tools/session.mjs, which is pure and separately
     tested — the old inline version could only be checked by playing the app, and it had
     the new words stapled to the very end of the session with exactly one showing each.
     A card record IS a stat record here (seen/correct/fsrs/last/ms/msN all live on it),
     so the deck can be handed over as both items and stats without any translation. */
  /* The other decks load once and join the pool. Until they arrive the session is simply
     vocabulary-only, which is also the correct behaviour on a machine that has never
     opened the Kana or Kanji tabs. */
  /* Contextual material, mined from the scripted dialogue this app already ships. Real
     Japanese, already levelled to the course, already carrying English — and free, which
     a language model writing sentences on demand is not. Coverage is whatever the scripts
     happen to contain, and a word they never use simply gets no context exercise. */
  const clozeIndex = useMemo(
    () => addMinedSources(buildClozeIndex(SCRIPT_SEED, cards), cards),
    [cards],
  );
  /* The evidence log, read here for the two things it now feeds back into the session:
     which words this learner confuses, and how fast they normally answer each KIND of
     question. Both are learner-specific and neither can be guessed. */
  const [evidence, setEvidence] = useState([]);
  useEffect(() => { loadEvidence().then((e) => setEvidence(e.slice())).catch(() => {}); return subscribeEvidence(setEvidence); }, []);
  const confusion = useMemo(() => confusionFrom(evidence), [evidence]);
  const norms = useMemo(() => latencyNorms(evidence), [evidence]);
  const [foreign, setForeign] = useState([]);
  /* Reloaded whenever a session ends, not once per page load. This snapshot IS the
     other decks' progress; keeping a stale copy meant a kanji answered in lesson one
     still looked untouched in lesson eight and was introduced as new every time. */
  const [foreignEpoch, setForeignEpoch] = useState(0);
  useEffect(() => { loadForeignDecks(cards).then(setForeign).catch(() => {}); }, [cards.length, foreignEpoch]);

  /* The study plan reaches the scheduler here: pace decides how long a session runs, and
     the area priorities weight which decks it draws from. */
  const [plan, setPlan] = useState(PLAN_DEFAULT);
  useEffect(() => {
    loadPlan().then(setPlan).catch(() => {});
    return subscribePlan(setPlan);
  }, []);

  /* The words quarantined for the checkpoint this quarter. Derived from the deck and the
     calendar rather than stored, so every device agrees without syncing and a wiped setting
     cannot quietly let the test words back into study. */
  const heldOut = useMemo(() => reserveFor(cards, cycleFor()), [cards]);

  const smartPicks = useMemo(() => {
    /* Parked words are out of circulation, not deleted. Every mined word displaced one, so
       the number of things competing for attention stays fixed — which is the only reason
       mining makes this deck better rather than longer. */
    const items = cards
      .filter((c) => !c.parked)
      .map((c) => (c.order === undefined ? { ...c, order: c.lesson || 0 } : c));
    /* Sources declare what their items can be ASKED. This has to reach the scheduler, not
       just the renderer: reserving a production slot and only discovering downstream that
       the item has no reading spends the slot on a recognition question. */
    const source = [
      { deck: "vocab", items, stats: Object.fromEntries(cards.map((c) => [c.id, c])),
        weight: deckWeight(plan, "class"),
        capsFor: (it) => ({ type: !!it.reading, listen: !!(it.reading || it.term), context: hasContext(clozeIndex, it.id) }) },
      ...foreign.map((s) => ({
        ...s,
        weight: deckWeight(plan, s.deck),
        /* Kanji is deliberately not typeable. Producing a word from its meaning is a
           different ability from writing a character, and the app has no handwriting
           input — asking for one while measuring the other would be dishonest. */
        /* A kanji asked through a word CAN be typed — there is a word reading to produce.
           An isolated kanji card still cannot: the app has no handwriting input, and asking
           someone to type a character from its meaning measures something else entirely. */
        capsFor: (it) => ({
          type: (s.deck !== "kanji" || it.inContext) && !!it.reading,
          listen: !!(it.reading || it.term),
        }),
      })),
    ];
    /* The benchmark hold-out is invisible here. Without this the checkpoint would measure
       how well you revised the test rather than how much Japanese you have, and the whole
       point of having a number you can trust would be gone. */
    return buildSession(source, { now: Date.now(), isLeech, minutes: paceMinutes(plan.pace),
                                  exclude: heldOut });
    // retentionTarget: not a dep in the usual sense (it's a module `let`, not props/state) but
    // isLeech/dueness read it live, and the retention chip's onClick bumps `retention` state
    // right alongside it — so this recomputes on the same render that value changes.
  }, [cards, foreign, plan, clozeIndex, heldOut, retentionTarget]);

  /* The queue still wants plain cards. Learning-step repeats are the same card appearing
     again later in the session, which is exactly what they should be. */
  /* Each queue entry carries the exercise it should be asked as. Repeats of the same item
     are separate objects with different formats, which is the point — three showings of
     one card teaches the card, three different questions teach the word. */
  /* Audio is off when the plan deprioritises listening, or when you've said this session
     you can't play sound. Same idea as the Kanji tab's no-audio path: being somewhere you
     can't make noise shouldn't cost you the session. */
  const [prodOpen, setProdOpen] = useState(false);
  /* Built from sentences this learner has actually met: the scripted dialogue, and the
     sentences that arrived attached to mined words. Nothing invented. */
  const prodDrills = useMemo(() => {
    const known = cards.filter((c) => (c.seen || 0) > 0).map((c) => c.term);
    const sources = [];
    for (const c of cards) if (c.mined && c.source) sources.push({ text: c.source, en: c.meaning || "" });
    for (const sc of SCRIPT_SEED) {
      for (const line of (sc.lines || [])) {
        /* The tokens ARE the word boundaries — the scripts store them so readings can sit
           above individual words — so the drill uses them rather than guessing from the
           joined string. */
        const parts = (line.tokens || []).map((t) => t.t || "").filter(Boolean);
        const text = parts.join("");
        if (text && line.en) sources.push({ text, en: line.en, chunks: parts });
      }
    }
    return drillSet(sources, 5, { known, seed: Math.floor(Date.now() / 86400000) });
  }, [cards]);

  const [noAudio, setNoAudio] = useState(false);
  const allowListen = !noAudio && (plan.priorities.listening || 1) >= 2;

  // Capabilities now travel with the candidate from the source, so nothing is re-derived
  // here and the scheduler and the renderer cannot disagree about what an item can carry.
  /* Only the ORDER is decided up front. The intervention for each card is chosen when the
     card is actually SERVED, because a repeat later in the same session has to be able to
     react to how the earlier showing went — baking the whole queue at the start froze the
     adaptive loop shut. */
  const smartPool = useMemo(
    () => smartPicks.map((p) => ({ ...p.item, _step: p.step, _pick: p })),
    [smartPicks],
  );
  const smartInfo = useMemo(() => describeSession(smartPicks), [smartPicks]);
  /* Cards whose repeats are deliberate. A correct answer normally drops a card's later
     copies from the queue — that rule exists for the miss-requeue, and it would silently
     delete every learning step the moment you got the first showing right, which is
     exactly when the steps matter most. */
  const stepIds = useMemo(
    () => new Set(smartPicks.filter((p) => p.step > 0).map((p) => p.item.id)),
    [smartPicks],
  );
  const leeches = useMemo(() => cards.filter(isLeech), [cards]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => (c.seen || 0) > 0 && dueness(c, now) >= 1).length;
  }, [cards, retentionTarget]);
  const masteredPct = useMemo(() => {
    if (!cards.length) return 0;
    return Math.round(cards.filter((c) => (c.level || 0) >= 4).length / cards.length * 100);
  }, [cards]);

  /* ── buddy state ── */
  const [days, setDays] = useState(null);
  useEffect(() => { loadDays().then((d) => setDays({ ...d })); }, [running]);
  const streak = useMemo(() => streakFrom(days), [days]);
  const todayKey = localDayKey();
  const todayRev = (days && days[todayKey] && days[todayKey].rev) || 0;
  const knownCount = useMemo(() => cards.filter((c) => (c.level || 0) >= 4).length, [cards]);
  const [retention, setRetentionState] = useState(retentionTarget);
  /* What the memory model actually predicts. Shown because a scheduler you can't inspect
     is a scheduler you don't trust — and because "34 words are fading" is a far better
     reason to open the app than "you have 392 due". */
  const forecast = useMemo(() => {
    const now = Date.now();
    let fading = 0, solid = 0, week = 0;
    for (const c of cards) {
      if (!((c.seen || 0) > 0)) continue;
      const r = recallChance(c, now);
      if (r == null) continue;
      if (r < retentionTarget) fading++;
      if (r >= retentionTarget) solid++;
      const st = c.fsrs || seedFromHistory(c);
      if (st && st.due && st.due - now < 7 * 86400000) week++;
    }
    return { fading, solid, week };
  }, [cards, retentionTarget]);
  const buddy = useMemo(() => {
    const state = mascotState({ studiedToday: todayRev > 0, dueCount, streak });
    // One honest sentence, matched to the state. No fake enthusiasm when the numbers
    // don't support it — the whole reason the old "57% never missed" felt hollow.
    const line =
      state === "sleeping" ? (streak > 0 ? `${streak}-day streak — keep it alive?` : "Ready when you are.")
      : state === "worried" ? `${dueCount} reviews have piled up. Little and often beats a big catch-up.`
      : state === "proud" ? `${streak} days straight. This is the part that actually works.`
      : knownCount > 0 ? `${knownCount} words are properly solid now.`
      : "Nice — that's a start.";
    return { state, line };
  }, [todayRev, dueCount, streak, knownCount]);
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

  const lastPool = useRef(null);
  const start = useCallback((subset, preordered, opts) => {
    const pool0 = (subset && subset.length) ? subset : cards;
    lastPool.current = { subset: (subset && subset.length) ? subset : null, preordered, opts };
    /* Leech throttle: drilling stuck words harder doesn't work, so a normal session gets
       at most three. It must NOT apply when the session IS the stuck words — that turned
       "Trouble words · 62 stuck" into the same three cards forever. */
    const stuck = pool0.filter(isLeech);
    const pool = (opts && opts.leechSession) || stuck.length <= 3
      ? pool0
      : pool0.filter((c) => !isLeech(c)).concat(stuck.slice(0, 3));
    const ordered = (preordered ? [...pool] : pool
      .map((c) => ({ c, k: masteryScore(c) + Math.random() * 0.3 }))  // weakest (lowest) first; small stable jitter
      .sort((a, b) => a.k - b.k)
      .map((x) => x.c));
    setQueue(ordered);
    setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    setCombo(0); setBestCombo(0);
    /* Interleave production into the session rather than leaving it on a separate tab you
       have to remember to visit. Roughly a third of the cards that have earned it get
       asked backwards — enough that the direction is genuinely unpredictable, which is
       the point: a block of ten recognition cards lets you settle into one mode, and
       mixing retrieval types is what makes each retrieval effortful. Capped so a session
       never becomes mostly production, which is demoralising at this stage. */
    const nowP = Date.now();
    const owed = ordered.filter((c) => prodDue(c, nowP));
    setProdSet(new Set(owed.slice(0, 6).map((c) => c.id)));
    missRef.current = {};
    setHook(null); setDebrief(null);
    setFlipped(false); setTyped(""); setVerdict(null); setShowWhy(false); setRunning(true);
    sessionLog.current = [];
  }, [cards, coverage]);

  const card = queue[pos];
  /* The scheduler picks the exercise; prodSet is the older mechanism and still stands in
     when a card arrived from somewhere other than Smart Review (a section drill, Trouble
     words) and so carries no format of its own. */
  /* Converting here rather than only in the builder means "I can't play audio" takes
     effect on the card in front of you and every one after it, without rebuilding the
     queue mid-session and losing your place. */
  /* Decided HERE, for this card, right now — against the card's current state rather than
     the snapshot taken when the session was built. A card failed two minutes ago arrives
     at its repeat carrying that failure, so the plan and the cue reflect it. */
  const live = card ? (cards.find((c) => c.id === card.id) || card) : null;
  const intervention = useMemo(() => {
    if (!card) return null;
    const base = card._pick;
    if (!base) return null;                       // came from a section drill, not Smart Review
    return interventionFor(
      { ...base, st: live, step: card._step || 0,
        recognition: skillOf(live, "fsrs"), production: skillOf(live, "rfsrs"),
        lastFailure: (live && live.lastFailure) || null },
      { allowListen },
    );
  }, [card, live, allowListen]);

  const rawFmt = card
    ? ((intervention && intervention.format) || (prodSet.has(card.id) ? "type" : "recall"))
    : "recall";
  const fmt = rawFmt === "listen" && noAudio ? "mc" : rawFmt;
  const cueLevel = intervention ? intervention.cue : null;
  const whyThis = intervention ? explainPick({ ...card._pick, ...intervention, st: live }) : null;
  const isProd = fmt === "type";
  const done = running && pos >= queue.length;

  /* A finished session is the moment the other decks' snapshot is certainly stale.
     This has to live with the other hooks: there are early returns further down, and a
     hook placed after them runs on some renders and not others, which React counts as
     the hook order changing. */
  useEffect(() => { if (done) setForeignEpoch((n) => n + 1); }, [done]);

  /* Multiple choice needs wrong answers that are actually tempting. Same kind and similar
     length beats random: picking "Tuesday" out of {Tuesday, to swim, expensive, library}
     tests nothing, because three options are obviously not days. */
  const clozeEx = useMemo(
    () => (card && fmt === "cloze" ? clozeFor(clozeIndex, card) : null),
    [card, fmt, clozeIndex],
  );
  const choices = useMemo(() => {
    if (!card || (fmt !== "mc" && fmt !== "listen")) return [];
    const pool = cards.filter((c) => c.id !== card.id && c.meaning);
    /* Distractors this learner has ACTUALLY mixed up with this word come first. A good
       distractor is plausible to this person and wrong in this context; "same length" is
       only a stand-in for that, used when there is no confusion history yet. */
    const known = (confusion.get(card.id) || [])
      .map((id) => pool.find((c) => c.id === id)).filter(Boolean);
    const near = pool.filter((c) => c.kind === card.kind);
    const bag = (near.length >= 12 ? near : pool);
    const seed = String(card.id).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + (card._step || 0);
    const picked = [];
    const used = new Set();
    for (let i = 0; i < bag.length && picked.length < 3; i++) {
      const c = bag[(seed * 7 + i * 13) % bag.length];
      if (!c || used.has(c.id) || c.meaning === card.meaning) continue;
      used.add(c.id); picked.push(c);
    }
    const all = [...known.slice(0, 2), ...picked, card].slice(0, 4);
    if (!all.includes(card)) all[all.length - 1] = card;
    // Deterministic shuffle: the answer must not always land in the same slot.
    return all.map((c, i) => ({ c, k: (seed + i * 31) % all.length })).sort((a, b) => a.k - b.k).map((x) => x.c);
  }, [card, fmt, cards, confusion]);

  const answerChoice = useCallback((choice) => {
    if (verdict) return;
    const c = queue[pos];
    if (!c) return;
    const ok = choice.id === c.id;
    setVerdict({ ok, mc: true, chose: choice.meaning, chosenId: choice.id, want: c.meaning });
    setFlipped(true);
  }, [queue, pos, verdict]);

  useEffect(() => {                                   // auto-debrief when a session ends with misses
    if (!AI_ENABLED || !loadSession()) return;         // not signed in: skip silently, keep the "Missed: …" fallback line
    if (!running || queue.length === 0 || pos < queue.length || debrief !== null) return;
    const missed = queue.filter((c, i) => queue.findIndex((x) => x.id === c.id) === i && missRef.current[c.id]);
    if (missed.length === 0) return;
    setDebrief({ busy: true });
    callAI("debrief", { missed: missed.slice(0, 5).map((c) => ({ term: c.term, romaji: c.romaji, meaning: c.meaning })) })
      .then(({ result }) => setDebrief({ text: (result.text || "").trim() }))
      .catch(() => setDebrief({ err: true }));
  }, [running, pos, queue, debrief]);

  const grade = useCallback((got) => {
    const c = queue[pos];
    if (!c) return;
    setHook(null);
    const think = thinkRef.current || 0;
    // The combo counts instant recall, not merely correct answers — it rewards the thing
    // that actually correlates with remembering the word tomorrow.
    if (got && think > 0 && think < 3000) {
      setCombo((n) => { const v = n + 1; setBestCombo((b) => Math.max(b, v)); return v; });
      setFlash(Date.now());
    } else if (!got) setCombo(0);
    /* Credit the area the exercise actually worked, not the deck it came from. A typed
       answer is writing practice and a listening question is listening practice even
       when the word is ordinary vocabulary — otherwise the coverage report says you
       never listen while you have been listening all week. */
    const workedArea = fmt === "listen" ? "listening" : fmt === "type" ? "writing" : areaForDeck(c.src || "class");
    // Kana, kanji and 10k cards belong to their own decks and go home to their own keys.
    const outcome = { failure: got ? null : classifyFailure({ format: fmt,
      expected: c.reading || c.term, got: verdict && verdict.got ? verdict.got : "" }),
      skill: skillForFormat(fmt) };
    if (c.src) recordForeign(c, got, thinkRef.current || 0, workedArea, outcome);
    else onResult(c.id, got, prodSet.has(c.id) ? "prod" : undefined, thinkRef.current || undefined, workedArea, outcome);

    /* Evidence about the ABILITY, recorded alongside the card update. "Wrong" on its own
       is nearly useless: someone who reads 火曜日, knows it means Tuesday, and mistypes
       かようび has a reading fumble, not a vocabulary gap, and the next intervention
       should differ. The predicted-recall figure is kept so the model's confidence can
       later be checked against what actually happened. */
    const evSkill = skillForFormat(fmt);
    if (evSkill) {
      const rec = makeEvidence({
        id: c.id, deck: c.src || "vocab", format: fmt, skill: evSkill,
        /* The cue the learner actually saw. This read c._cue, a field the just-in-time
           intervention rewrite renamed out of existence — so every record written since
           then carries cue: null and no cue calibration was possible. */
        cue: typeof cueLevel === "number" ? cueLevel : null,
        ok: got, ms: think,
        failure: got ? null : classifyFailure({
          format: fmt,
          expected: c.reading || c.term,
          got: verdict && verdict.got ? verdict.got : "",
        }),
        // The specific wrong word picked — the raw material for learner-aware distractors.
        confused: !got && verdict && verdict.chosenId ? verdict.chosenId : null,
        /* Two different predictions, kept apart because they answer different questions.
           `predicted` is what the intervention model believed about THIS exercise —
           this ability, at this cue — and it is the number that chose the exercise, so it
           is the one whose calibration decides whether the scheduler is trustworthy.
           `pRecall` is FSRS asking only "would the card come back today", which knows
           nothing about being asked to produce rather than recognise.

           Records written before this split have `predicted` holding the FSRS figure and
           no `pRecall` at all; the calibration report keys off that absence rather than
           averaging two different quantities together. */
        predicted: intervention && typeof intervention.expected === "number"
          ? intervention.expected : recallChance(c, Date.now()),
        pRecall: recallChance(c, Date.now()),
      });
      logEvidence(rec);
      sessionLog.current.push(rec);

    }
    if (got) {
      if (!missRef.current[c.id]) setFirstTry((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      setPassed((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      // Planned learning steps survive; only miss-requeue duplicates are dropped.
      if (!stepIds.has(c.id)) setQueue((prev) => prev.filter((x, idx) => idx <= pos || x.id !== c.id));
    } else {
      setStruggled((prev) => { const n = new Set(prev); n.add(c.id); return n; });
      const m = (missRef.current[c.id] || 0) + 1;
      missRef.current[c.id] = m;
      if (m <= REQUEUE_CAP) {
        setQueue((prev) => { const next = prev.slice(); next.splice(Math.min(pos + 1 + REQUEUE_GAP, next.length), 0, c); return next; });
      }
    }
    setFlipped(false);
    setTyped(""); setVerdict(null); setShowWhy(false);
    setPos((p) => p + 1);
  }, [queue, pos, onResult]);

  /* ── spelling ──
     A production card used to be self-graded: see the English, think of the Japanese,
     flip, decide whether you were right. That grades recognition of your own answer, not
     production of it, and it is generous in exactly the way that keeps a word feeling
     learned while it isn't. Typing the reading settles it objectively — the same argument
     the Kanji tab already makes for its own exercises.

     Rōmaji in, kana out, via the converter the Dates tab already uses: no IME needed, and
     "si"/"shi", "tu"/"tsu", "zyuppun"/"jyuppun" all land on the same kana. */
  const checkSpelling = useCallback(() => {
    const c = queue[pos];
    if (!c || !typed.trim()) return;
    const want = c.reading || c.term;
    const ok = kanaEqual(toKana(typed.trim()), want);
    setVerdict({ ok, got: toKana(typed.trim()), want });
    setFlipped(true);
  }, [queue, pos, typed]);

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
        <div className="tc-buddy">
          <Mascot state={buddy.state} />
          <div className="tc-buddytext">
            <p className="tc-buddyline">{buddy.line}</p>
            <div className="tc-buddystats">
              <span className={"tc-stat" + (streak > 0 ? " is-on" : "")}>
                <b>{streak}</b> day{streak === 1 ? "" : "s"} in a row
              </span>
              {/* Deliberately counts only level 4+. "Never missed" was flattering and
                  meaningless — most of those had been seen once. This number is small and
                  moves slowly, which is the point: it can be trusted. */}
              <span className="tc-stat"><b>{knownCount}</b> words solid</span>
              {todayRev > 0 && <span className="tc-stat"><b>{todayRev}</b> today</span>}
              {forecast.fading > 0 && <span className="tc-stat"><b>{forecast.fading}</b> fading</span>}
            </div>
          </div>
        </div>
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
        {smartPool.length > 0 && (
          <button className="tc-btn tc-start tc-smart-btn" onClick={() => start(smartPool, true)}>
            {/* Say what is actually in the session. "16 cards" was true and told you
                nothing; "3 new · 2 fading" is the reason to press the button. */}
            🧠 Smart Review · {smartPool.length} cards{smartInfo.fresh > 0 ? ` · ${smartInfo.fresh} new` : ""}{smartInfo.stale > 0 ? ` · ${smartInfo.stale} fading` : ""}
          </button>
        )}
        {/* Stuck words get their own session instead of being sprinkled through every
            other one. 歩いて sitting at 0% after eight attempts doesn't need more of the
            same drill — it needs to be looked at deliberately, and it shouldn't be taxing
            sessions that are otherwise going fine. */}
        {leeches.length > 0 && (
          <button className="tc-btn tc-start tc-troublebtn" onClick={() => start(leeches.slice(0, 12), false, { leechSession: true })}>
            🩹 Trouble words · {leeches.length} stuck
          </button>
        )}
        {smartPool.length > 0 && (
          <p className="tc-smarthint">{
            dueCount >= 15
              ? `Mostly catch-up while ${dueCount} are due, plus a few new ones.`
              : `Your weakest and most overdue, plus new words${newCount > 0 ? ` (${newCount} left)` : ""}.`
          }</p>
        )}

        {ranked.length > 0 && (
          <div className="tc-retention">
            <span className="tc-retlabel">Aim to remember</span>
            <div className="tc-kanaseg">
              {[[0.85, "85%"], [0.9, "90%"], [0.95, "95%"]].map(([v, label]) => (
                <button key={v} className={"tc-fchip" + (Math.abs(retention - v) < 0.001 ? " is-on" : "")}
                  onClick={() => { setRetention(v); setRetentionState(v); }}>{label}</button>
              ))}
            </div>
            <p className="tc-smarthint">
              {retention <= 0.85 ? "Fewer reviews, more forgetting. Good when you're buried."
                : retention >= 0.95 ? "Many more reviews for a little more recall. Use before an exam."
                : "The researched default — reviews land just as a word starts to slip."}
            </p>
          </div>
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
        {bestCombo >= 2 && (
          <p className="tc-donecombo">best run: <b>{bestCombo}</b> instant recalls back to back</p>
        )}

        {/* The second block of the session. Reviewing is recognition; this is the part that
            asks you to put a sentence together, which is the ability the numbers say is
            missing. Offered rather than forced — a five-minute day should still be able to
            end after the reviews. */}
        {prodDrills.length > 0 && (
          prodOpen
            ? <ProductionBlock drills={prodDrills} onDone={() => setProdOpen(false)} />
            : (
              <button className="tc-btn tc-btn-sm tc-btn-primary" style={{ marginTop: 12 }}
                onClick={() => setProdOpen(true)}>
                Build {prodDrills.length} sentences · ~5 min
              </button>
            )
        )}
        {debrief && debrief.busy && <p className="tc-debrief tc-debrief-busy">✨ Coach is looking at what you missed…</p>}
        {debrief && debrief.text && <p className="tc-debrief">✨ {debrief.text}</p>}
        {(!AI_ENABLED || (debrief && debrief.err)) && missedCards.length > 0 && (
          <p className="tc-debrief tc-debrief-busy">Missed: {missedCards.slice(0, 6).map((c) => c.term).join("、")} — hit "Review" below and they'll come right back.</p>
        )}
        {/* What actually happened, per ability. Deliberately phrased as counts the app
            can defend — "12 answered on production" is measurable, "you mastered 12
            words" is a claim the model has no standing to make. */}
        {(() => {
          const s = summarise(sessionLog.current);
          if (!s.answered) return null;
          const FAIL_LABEL = {
            reading: "recalling readings", meaning: "meanings", listening: "catching it by ear",
            production: "producing it", orthography: "spelling", context: "using it in context",
            blank: "drawing a blank",
          };
          return (
            <div className="tc-sessum">
              <p className="tc-sessumh">What this worked on</p>
              <ul className="tc-sessumlist">
                {s.skillsWorked.map((k) => (
                  <li key={k}>
                    <span>{SKILL_LABEL[k] || k}</span>
                    <b>{s.bySkill[k].ok}/{s.bySkill[k].n}</b>
                  </li>
                ))}
                {s.introduced > 0 && <li><span>New words met</span><b>{s.introduced}</b></li>}
              </ul>
              {s.commonestFailure && (
                <p className="tc-sessumnote">
                  Most misses were about <b>{FAIL_LABEL[s.commonestFailure] || s.commonestFailure}</b>.
                </p>
              )}
            </div>
          );
        })()}
        <div className="tc-donebtns">
          {missedCards.length > 0 && (
            <button className="tc-btn tc-btn-primary" onClick={() => start(missedCards)}>Review the {missedCards.length} you missed</button>
          )}
          <button className="tc-btn" onClick={() => {
            const L = lastPool.current;
            start(L && L.subset ? L.subset : smartPool, L ? L.preordered : true, L ? L.opts : undefined);
          }}>Go again</button>
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
        {combo >= 2 && (
          <span key={flash} className={"tc-combo" + (combo >= 10 ? " is-hot" : combo >= 5 ? " is-warm" : "")}>
            {combo}<i>×</i>
          </span>
        )}
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

      {/* ── first contact ──
          A word you have never met cannot be retrieved, and asking anyway just teaches it
          as a failure. The introduction shows everything at once — character, reading,
          meaning, picture, sound — and the testing starts on its next appearance, a few
          cards later, while it is still warm. */}
      {fmt === "learn" && (
        /* An introduction has nothing to reveal and only one way forward, so the whole
           card is the control. Tapping anywhere continues, and the audio button stops
           the click from bubbling so hearing it does not skip past it. */
        <div className="tc-learn tc-learn-tap" role="button" tabIndex={0}
             aria-label="Continue"
             onClick={() => grade(true)}
             onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); grade(true); } }}>
          <span className="tc-kindchip tc-learnchip">new word</span>
          {card.emoji && <div className="tc-emoji tc-emoji-lg">{card.emoji}</div>}
          <div className={"tc-term" + (card.term.length <= 5 ? " tc-term-" + card.term.length : "")}>{card.term}</div>
          <div className="tc-reading-front">{card.reading} <SpeakBtn text={card.reading || card.term} /></div>
          <div className="tc-romaji">{card.romaji}</div>
          <div className="tc-meaning tc-meaning-lg">{card.meaning}</div>
          <p className="tc-learnnote">Look it over, then tap anywhere — you'll be asked in a moment.</p>
        </div>
      )}

      {/* ── multiple choice / listening ──
          The first real retrieval, and the only format that works before free recall does.
          Listening hides the writing entirely: a word you only ever meet on a card is a
          word you will not catch in speech. */}
      {/* ── context ──
          A blank in a real sentence the learner has already studied, with the English
          alongside so the task is "which word belongs here" rather than "guess the
          sentence". This is the only exercise that tests usage rather than translation. */}
      {fmt === "cloze" && clozeEx && (
        <div className="tc-mcwrap">
          <span className="tc-kindchip tc-clozechip">in context</span>
          <p className="tc-clozeen">{clozeEx.en}</p>
          <div className="tc-clozesent">
            {clozeEx.before}
            <span className={"tc-clozeblank" + (verdict ? (verdict.ok ? " is-right" : " is-wrong") : "")}>
              {verdict ? clozeEx.term : clozeEx.blank}
            </span>
            {clozeEx.after}
          </div>
          <div className="tc-mcopts">
            {clozeChoices(card, cards, 3, (card._step || 0) + String(card.id).length,
                          confusion.get(card.id) || []).map((c) => {
              const chosen = verdict && verdict.chose === c.term;
              const isAnswer = c.id === card.id;
              const cls = !verdict ? "" : isAnswer ? " is-answer" : chosen ? " is-wrongpick" : "";
              return (
                <button key={c.id} type="button" className={"tc-mcopt" + cls} disabled={!!verdict}
                        onClick={() => { if (!verdict) { setVerdict({ ok: c.id === card.id, chose: c.term }); setFlipped(true); } }}>
                  {c.term}{c.reading && c.reading !== c.term ? ` · ${c.reading}` : ""}
                </button>
              );
            })}
          </div>
          {verdict && <p className="tc-clozesrc">from your {clozeEx.source} script</p>}
        </div>
      )}

      {(fmt === "mc" || fmt === "listen") && (
        <div className="tc-mcwrap">
          <span className={"tc-kindchip " + (fmt === "listen" ? "tc-listenchip" : "tc-mcchip")}>
            {fmt === "listen" ? "listen" : "which one?"}
          </span>
          {fmt === "listen" ? (
            <div className="tc-listenprompt">
              <SpeakBtn text={card.reading || card.term} />
              <p className="tc-learnnote">Tap to hear it again</p>
              {!verdict && (
                <button type="button" className="tc-noaudio" onClick={() => setNoAudio(true)}>
                  Can't play audio — show it instead
                </button>
              )}
            </div>
          ) : (
            <div className="tc-mcprompt">
              {/* The reading sits above the word, furigana-style. This is a MEANING
                  question, and a kanji compound you cannot pronounce is unanswerable —
                  you end up guessing from the options rather than retrieving anything.
                  Reading practice belongs to the formats that ask for it. */}
              {card.reading && card.reading !== card.term && (
                <div className="tc-mcfurigana">{card.reading}</div>
              )}
              <div className={"tc-mcterm" + (card.term.length <= 5 ? " tc-term-" + card.term.length : "")}>{card.term}</div>
              <SpeakBtn text={card.reading || card.term} />
            </div>
          )}
          <div className="tc-mcopts">
            {choices.map((c) => {
              const chosen = verdict && verdict.chose === c.meaning;
              const isAnswer = c.id === card.id;
              const cls = !verdict ? "" : isAnswer ? " is-answer" : chosen ? " is-wrongpick" : "";
              return (
                <button key={c.id} type="button" className={"tc-mcopt" + cls}
                        disabled={!!verdict} onClick={() => answerChoice(c)}>
                  {c.meaning}
                </button>
              );
            })}
          </div>
          {verdict && fmt === "listen" && (
            <div className="tc-listenreveal">
              {card.term} · {card.reading}
            </div>
          )}
        </div>
      )}

      {(fmt === "recall" || fmt === "type") && (
      <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={flip}
           role="button" tabIndex={0} aria-label="Flashcard, click or press space to flip">
        <div className="tc-card-inner">
          {/* FRONT — normally the Japanese; on a production card, the English, and you
              have to come up with the Japanese yourself. No reading, no rōmaji and no
              audio button here: every one of those would hand you the answer. */}
          <div className="tc-face tc-front">
            {isProd ? (
              <>
                <span className="tc-kindchip tc-prodchip">→ 日本語</span>
                {card.emoji && <div className="tc-emoji">{card.emoji}</div>}
                <div className="tc-prodprompt">{card.meaning}</div>
                {/* Type the reading in rōmaji. Clicks and keys are kept off the card so
                    typing an "s" doesn't trigger the space-to-flip shortcut and hand you
                    the answer mid-word. */}
                <div className="tc-spellbox" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="tc-spellinput" type="text" value={typed} autoFocus
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                    placeholder="type the reading in rōmaji"
                    aria-label="Type the reading in rōmaji"
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") checkSpelling(); }}
                  />
                  {/* The cue. A first attempt at producing a word gets か＿＿び; once
                      production is developing it drops to かよう＿＿; solid production gets
                      nothing at all. Support is handed back after a miss — the aim is
                      retrieval that is effortful and still succeeds. */}
                  {cueLevel != null && cueLevel < CUE.FREE && card.reading && (
                    <div className="tc-cuehint" aria-label="hint">{cueHint(card.reading, cueLevel)}</div>
                  )}
                  <div className="tc-spellkana">{typed.trim() ? toKana(typed.trim()) : " "}</div>
                  <button type="button" className="tc-btn tc-btn-wide" onClick={checkSpelling} disabled={!typed.trim()}>Check</button>
                </div>
                <span className="tc-flipcue">or tap to just say it aloud</span>
              </>
            ) : (
              <>
                <span className="tc-kindchip">{KIND_LABEL[card.kind] || ""}</span>
                <div className={"tc-term" + (card.term.length <= 5 ? " tc-term-" + card.term.length : "")}>{card.term}</div>
                {/* Support is a property of every exercise, not only of typing. At a high
                    cue level the reading is simply shown; lower down it is masked, so the
                    same card can be made harder without changing what it is. */}
                {/* The character being tested, pointed at inside the word, plus what it means
                    on its own — so the card teaches the connection rather than leaving it
                    to be inferred. */}
                {card.inContext && (
                  <div className="tc-kctx">
                    <span className="tc-kctxk">{card.kanji}</span>
                    <span className="tc-kctxm">{card.kanjiMeaning}</span>
                  </div>
                )}
                                {cueLevel != null && cueLevel >= CUE.PARTIAL && card.reading !== card.term
                  ? <div className="tc-reading-front tc-reading-masked">{cueHint(card.reading, cueLevel)} <SpeakBtn text={card.reading || card.term} /></div>
                  : <div className="tc-reading-front">{card.reading} <SpeakBtn text={card.reading || card.term} /></div>}
                {showRomaji && <div className="tc-frontromaji">{card.romaji}</div>}
                <span className="tc-flipcue">tap to flip</span>
              </>
            )}
          </div>
          {/* BACK — meaning + picture + pronunciation (rōmaji always shown) */}
          <div className="tc-face tc-back">
            {isProd ? (
              <>
                {/* What you actually wrote, against what it should have been. Seeing the
                    two side by side is where a spelling slip becomes learnable. */}
                {verdict && (
                  <div className={"tc-spellverdict" + (verdict.ok ? " is-right" : " is-wrong")}>
                    {verdict.ok ? "✓ spelled it" : <>✗ you wrote <b>{verdict.got}</b></>}
                  </div>
                )}
                <div className="tc-term tc-prodanswer">{card.term}</div>
              </>
            ) : (
              card.emoji && <div className="tc-emoji">{card.emoji}</div>
            )}
            {!isProd && <div className="tc-meaning tc-meaning-lg">{card.meaning}</div>}
            {isProd && <div className="tc-reading-front">{card.reading}</div>}
            <div className="tc-romaji">{showPitch && card.pitch ? card.pitch : card.romaji} <SpeakBtn text={card.reading || card.term} /></div>
            {(card.msN || 0) > 0 && <span className="tc-timetag">⏱ avg think {(card.ms / card.msN / 1000).toFixed(1)}s · seen {card.seen || 0}× · {card.seen ? Math.round(((card.correct || 0) / card.seen) * 100) : 0}%</span>}
            {isLeech(card) && (
              /* The keyword mnemonic: link the Japanese sound to an English word you
                 already know, plus a vivid image. Pairing it with retrieval practice
                 beats either alone for foreign-language vocabulary, and it is the one
                 technique aimed squarely at words that repetition alone has failed to
                 shift — which is what a leech is. Typed once, shown on every review. */
              <div className="tc-mnbox" onClick={(e) => e.stopPropagation()}>
                <span className="tc-leechtag">🩹 stuck — give it a hook</span>
                <input className="tc-mnin" value={card.mn || ""} placeholder="sounds like… / picture…"
                  onChange={(e) => onMnemonic(card.id, e.target.value)} />
              </div>
            )}
            {!isLeech(card) && card.mn ? <p className="tc-mnshow">🔗 {card.mn}</p> : null}
            {/* The AI hook button used to sit on every card and went unused for months,
                while adding a row of clutter to the one screen that should be quiet. It
                still exists for stuck words, where a keyword mnemonic genuinely is the
                technique that shifts them — but it is not on the face of every review. */}
            {AI_ENABLED && isLeech(card) && (hook && hook.term === card.term ? (
              <p className="tc-hooktext" onClick={(e) => e.stopPropagation()}>
                {hook.busy ? "✨ thinking…" : hook.err ? hook.err : "✨ " + hook.text}
              </p>
            ) : (
              <button className="tc-hookbtn" onClick={(e) => { e.stopPropagation(); getHook(card); }}>✨ hook</button>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className="tc-grade">
        {fmt === "learn" ? (
          <button type="button" className="tc-btn tc-btn-wide tc-btn-got"
                  onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it — next →</button>
        ) : verdict && (fmt === "mc" || fmt === "listen") ? (
          <button type="button" className={"tc-btn tc-btn-wide " + (verdict.ok ? "tc-btn-got" : "tc-btn-miss")}
                  onClick={(e) => { e.stopPropagation(); grade(verdict.ok); }}>
            {verdict.ok ? "Next →" : "Noted — next →"}
          </button>
        ) : (fmt === "mc" || fmt === "listen") ? (
          <p className="tc-mchint">{fmt === "listen" ? "What did you hear?" : "Pick the meaning"}</p>
        ) : !flipped ? (
          <button type="button" className="tc-btn tc-btn-wide" onClick={(e) => { e.stopPropagation(); flip(); }}>Reveal answer</button>
        ) : verdict ? (
          /* The typed answer already settled this one. Offering "Got it" here would just
             invite overruling the check, which is the self-grading this replaces. */
          <button type="button" className={"tc-btn tc-btn-wide " + (verdict.ok ? "tc-btn-got" : "tc-btn-miss")}
                  onClick={(e) => { e.stopPropagation(); grade(verdict.ok); }}>
            {verdict.ok ? "Next →" : "Noted — next →"}
          </button>
        ) : (
          <>
            <button type="button" className="tc-btn tc-btn-miss" onClick={(e) => { e.stopPropagation(); grade(false); }}>Missed it</button>
            <button type="button" className="tc-btn tc-btn-got" onClick={(e) => { e.stopPropagation(); grade(true); }}>Got it</button>
          </>
        )}
      </div>
      {/* "Why am I seeing this?" — plain language, no scheduler vocabulary. It earns
          trust, and it makes the algorithm inspectable by the person using it rather
          than only by whoever wrote it. */}
      {whyThis && (
        <div className="tc-whywrap">
          {showWhy ? (
            <p className="tc-whytext">{whyThis}</p>
          ) : (
            <button type="button" className="tc-whybtn" onClick={() => setShowWhy(true)}>
              Why this one?
            </button>
          )}
        </div>
      )}
      <div ref={liveRef} aria-live="polite" className="tc-sr" />
    </div>
  );
}

/* ── the study plan tab ──
   Everything here is editable and everything here has an effect. The vision and goals are
   the motivational half — the professor's point that knowing WHY keeps you going on the
   days you do not feel like it. The priorities, the pace and the coverage report are the
   mechanical half: they change what the Smart Review button gives you, and they say
   plainly which areas you have been neglecting. */
/* ── Checkpoint ──
   A test the app is not allowed to grade itself on. The words come from the quarantined
   reserve that Smart Review cannot schedule, they are asked cold — English in, Japanese
   out, no options and no hints — and nothing is marked until the end, so the test cannot
   quietly turn into a lesson.

   The design constraint that matters: it must be able to say "no change" and mean it.
   Anyone can build a progress screen that always goes up. */
/* Rōmaji in, kana out. Left as its own function so the input preview and the grader can
   never disagree about what an answer became. */
const kanaOf = (v) => { try { return toKana(String(v || "").trim()); } catch (e) { return String(v || "").trim(); } };

function Checkpoint({ cards = [], heldOut }) {
  const [runs, setRuns] = useState(null);
  const [phase, setPhase] = useState("idle");     // idle | running | done
  const [seed, setSeed] = useState(0);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { loadRuns().then(setRuns); }, []);

  const questions = useMemo(
    () => (phase === "running" ? sampleFor(cards, heldOut, RUN_SIZE, seed) : []),
    [phase, cards, heldOut, seed],
  );

  useEffect(() => { if (phase === "running" && inputRef.current) inputRef.current.focus(); }, [phase, at]);

  const pooled = useMemo(() => poolRuns(runs || []), [runs]);
  const last = runs && runs.length ? runs[runs.length - 1] : null;

  const start = () => {
    setSeed(Date.now());
    setAnswers([]); setAt(0); setTyped(""); setResult(null);
    setPhase("running");
  };

  const submit = () => {
    const q = questions[at];
    if (!q) return;
    /* Graded as kana, not as keystrokes. There is no Japanese keyboard on this machine, and
       requiring one would put cold production — the whole point of the checkpoint — behind
       an OS setting. Rōmaji goes in, the same converter the Dates and spelling screens
       already use turns it into kana, and that is what gets marked. What was typed is kept
       alongside so the review list can show it back. */
    const next = [...answers, { id: q.id, got: kanaOf(typed), typed }];
    setAnswers(next);
    setTyped("");
    if (at + 1 >= questions.length) {
      const r = scoreRun(questions, next);
      /* Compared against everything that came before, pooled. A single run against a single
         run cannot see any improvement short of a violent one. */
      const cmp = compareRuns(pooled, r);
      const est = estimateKnown(r, cards.length);
      setResult({ run: r, est, cmp, text: describeRun(r, est, cmp) });
      const saved = pushRun(runs || [], r);
      setRuns(saved); saveRuns(saved);
      setPhase("done");
    } else setAt(at + 1);
  };

  if (runs === null) return null;

  if (phase === "running") {
    const q = questions[at];
    if (!q) return <p className="tc-planhint">No held-out words available yet.</p>;
    return (
      <section className="tc-plansec">
        <h2 className="tc-planh">Checkpoint <span className="tc-planh-sub">{at + 1} of {questions.length}</span></h2>
        <p className="tc-planhint" style={{ marginTop: 0 }}>
          Type it in rōmaji and it becomes kana as you go — no Japanese keyboard needed.
          No hints, and nothing is marked until the end, so answer even when you are unsure.
        </p>
        <div className="tc-checkq">{glossOf(q)}</div>
        <input
          ref={inputRef}
          className="tc-checkin"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          /* Enter submits — unless the IME is still composing. Typing Japanese means the
             first Enter COMMITS the candidate (たべもの out of ta-be-mo-no) and a handler that
             cannot tell the two apart submits a half-finished answer on the keypress that
             was meant to finish the word. keyCode 229 is the long-standing signal for "this
             key belongs to the IME"; isComposing is the modern one. Both, because Safari. */
          onKeyDown={(e) => {
            if (e.nativeEvent && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return;
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          placeholder="type in rōmaji — tempura, yasumi, kyuuka"
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        {/* What the app is actually going to mark. Without it you are typing blind into a
            converter and cannot tell a wrong answer from a mistyped one. */}
        <div className="tc-checkkana">{typed.trim() ? kanaOf(typed) : "　"}</div>
        <div className="tc-checkrow">
          <button className="tc-btn" onClick={submit}>{at + 1 >= questions.length ? "Finish" : "Next"}</button>
          <button className="tc-btn tc-btn-quiet" onClick={() => { setTyped(""); submit(); }}>Skip</button>
        </div>
      </section>
    );
  }

  if (phase === "done" && result) {
    const missed = result.run.detail.filter((d) => !d.ok);
    return (
      <section className="tc-plansec">
        <h2 className="tc-planh">Checkpoint <span className="tc-planh-sub">{result.run.ok} of {result.run.n} cold</span></h2>
        <p className="tc-planhint" style={{ marginTop: 0 }}>{result.text}</p>
        {missed.length > 0 && (
          <>
            <p className="tc-planhint">These are the ones you did not have. They go back into normal study now:</p>
            <div className="tc-checkmiss">
              {missed.map((d) => (
                <div key={d.id} className="tc-checkmissrow">
                  <span className="tc-checkterm">{d.term}</span>
                  {/* Kana-only words have the reading equal to the word; printing both just
                      says the same thing twice. */}
                  {d.reading && d.reading !== d.term && <span className="tc-checkread">{d.reading}</span>}
                  <span className="tc-checken">{d.en}</span>
                  {d.got ? <span className={"tc-checkgot" + (d.near ? " is-near" : "")}>you wrote {d.got}</span> : <span className="tc-checkgot">blank</span>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="tc-checkrow"><button className="tc-btn" onClick={() => setPhase("idle")}>Done</button></div>
      </section>
    );
  }

  const available = cards.filter((c) => heldOut && heldOut.has(c.id) && askable(c)).length;
  return (
    <section className="tc-plansec">
      <h2 className="tc-planh">Where you actually are <span className="tc-planh-sub">a test this app cannot flatter</span></h2>
      <p className="tc-planhint" style={{ marginTop: 0 }}>
        Every other number here comes from questions the app chose to ask you, in a format it
        thought you would pass. This one does not. {available} words are held back from Smart
        Review entirely, and {RUN_SIZE} of them are asked cold — English in, Japanese out, no
        options, no hints. It takes about six minutes and it can tell you that nothing has
        changed.
      </p>
      {last ? (
        <p className="tc-planhint">
          Last check: <b>{last.ok} of {last.n}</b> on {new Date(last.at).toLocaleDateString()}.
          {pooled && pooled.runs > 1 ? ` Across ${pooled.runs} checks: ${pooled.ok} of ${pooled.n}.` : ""}
        </p>
      ) : (
        <p className="tc-planhint">You have not taken one yet, so there is no honest number for how much Japanese you have. This is how you get one.</p>
      )}
      <div className="tc-checkrow">
        <button className="tc-btn" onClick={start} disabled={available < 5}>
          {last ? "Take another checkpoint" : "Take the first checkpoint"}
        </button>
      </div>
      {available < 5 && <p className="tc-planhint">Not enough words in the deck yet for a meaningful sample.</p>}
    </section>
  );
}

/* ── building sentences, not recognising them ──
   Of 588 words studied, 76 have ever been produced once, and typed answers run 26 points
   below recognition. The app has been a recognition trainer.

   The real fix is a conversation partner, which needs a paid API key. This is the honest
   free version: assembly rather than recognition, using sentences the learner has actually
   met — the scripted dialogue and the sentences mined words arrived with — rather than
   sentences invented by a model that might be wrong.

   It cannot judge whether a different sentence is also correct, so it does not pretend to:
   it accepts the sentence that was written and shows the difference when they diverge. */
function ProductionBlock({ drills, onDone }) {
  const [at, setAt] = useState(0);
  const [built, setBuilt] = useState([]);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);

  const d = drills[at];
  if (!d) return null;

  const check = () => {
    const given = d.type === "fill" ? typed : built;
    setResult(gradeDrill(d, given));
  };
  const next = () => {
    setResult(null); setBuilt([]); setTyped("");
    if (at + 1 >= drills.length) onDone(); else setAt(at + 1);
  };

  const remaining = d.tiles ? d.tiles.filter((tile, i) => !built.includes(tile + "\u0000" + i)) : [];

  return (
    <div className="tc-prod">
      <p className="tc-eyebrow">build it yourself · {at + 1} of {drills.length}</p>
      {d.prompt ? <p className="tc-prodprompt">{d.prompt}</p> : null}

      {d.type === "fill" ? (
        <>
          <div className="tc-prodsent">{d.before}<span className="tc-prodblank">＿</span>{d.after}</div>
          <div className="tc-prodtiles">
            {d.choices.map((c) => (
              <button key={c} className={"tc-fchip" + (typed === c ? " is-on" : "")}
                onClick={() => setTyped(c)} disabled={!!result}>{c}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="tc-prodsent">
            {built.length
              ? built.map((b) => b.split("\u0000")[0]).join("")
              : <span className="tc-prodblank">tap the pieces in order</span>}
          </div>
          <div className="tc-prodtiles">
            {d.tiles.map((tile, i) => {
              const key = tile + "\u0000" + i;
              const used = built.includes(key);
              return (
                <button key={key} className={"tc-fchip" + (used ? " is-used" : "")} disabled={used || !!result}
                  onClick={() => setBuilt([...built, key])}>{tile}</button>
              );
            })}
          </div>
          {built.length > 0 && !result && (
            <button className="tc-btn tc-btn-sm" onClick={() => setBuilt(built.slice(0, -1))}>undo</button>
          )}
          {d.hasDistractors ? <p className="tc-smarthint">Not every piece belongs.</p> : null}
        </>
      )}

      {result ? (
        <div className="tc-prodresult">
          <p className={result.ok ? "tc-prodok" : "tc-prodbad"}>
            {result.ok ? "That is it." : "Not quite."}
          </p>
          {!result.ok && <p className="tc-prodsent">{result.expected}</p>}
          <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={next}>
            {at + 1 >= drills.length ? "Done" : "Next"}
          </button>
        </div>
      ) : (
        <div className="tc-rehnav">
          <button className="tc-btn tc-btn-sm tc-btn-primary"
            disabled={d.type === "fill" ? !typed : !built.length} onClick={check}>Check</button>
          <button className="tc-btn tc-btn-sm" onClick={next}>Skip</button>
        </div>
      )}
    </div>
  );
}

function Plan({ cards = [] }) {
  const [plan, setPlan] = useState(PLAN_DEFAULT);
  const [days, setDays] = useState(null);
  const [draft, setDraft] = useState("");
  useEffect(() => { loadPlan().then(setPlan); loadDays().then((d) => setDays({ ...d })); }, []);

  const update = (patch) => { const next = { ...plan, ...patch }; setPlan(next); savePlan(next); };
  const cover = useMemo(() => coverageFrom(days, 14), [days]);
  const [evidence, setEvidence] = useState([]);
  useEffect(() => { loadEvidence().then((e) => setEvidence(e.slice())); return subscribeEvidence(setEvidence); }, []);
  const profile = useMemo(() => profileFrom(evidence, { days: 60 }), [evidence]);
  const gap = useMemo(() => biggestGap(profile), [profile]);
  /* Is the app right about you? Everything above reports what the model BELIEVES; this is
     the only part that checks those beliefs against what actually happened. A year is the
     window because calibration moves slowly and there is no point asking the question of
     three sessions. */
  const cal = useMemo(() => calibrationReport(evidence, { days: 365 }), [evidence]);
  /* The identical reserve the scheduler is excluding. Computed the same way from the same
     deck, so the test cannot drift out of step with what study is avoiding. */
  const heldOut = useMemo(() => reserveFor(cards, cycleFor()), [cards]);
  const busiest = Math.max(1, ...Object.values(cover));
  const totalReviews = Object.values(cover).reduce((a, b) => a + b, 0);

  const addGoal = () => {
    const text = draft.trim();
    if (!text || plan.goals.length >= 5) return;
    update({ goals: [...plan.goals, { id: Date.now(), text, area: "vocabulary", done: false }] });
    setDraft("");
  };
  const setGoal = (id, patch) =>
    update({ goals: plan.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const dropGoal = (id) => update({ goals: plan.goals.filter((g) => g.id !== id) });

  /* Neglect is the whole reason to show coverage: an area you called important and have
     not touched in a fortnight is the single most useful thing this page can tell you. */
  const neglected = AREAS.filter(([k]) => (plan.priorities[k] || 1) >= 2 && (cover[k] || 0) === 0);

  return (
    <div className="tc-plan">
      <section className="tc-plansec">
        <h2 className="tc-planh">Why you're doing this</h2>
        <p className="tc-planhint">
          Knowing the answer is what gets you studying on the days you don't feel like it.
          Write these once, roughly — they're for you, not for marking.
        </p>
        {[["fiveYear", "In five years, I want to…"], ["oneYear", "In a year, I want to…"], ["term", "By the end of this term…"]].map(([k, label]) => (
          <label key={k} className="tc-planfield">
            <span>{label}</span>
            <textarea rows={2} value={plan.vision[k]} placeholder="…"
              onChange={(e) => update({ vision: { ...plan.vision, [k]: e.target.value } })} />
          </label>
        ))}
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">Goals <span className="tc-planh-sub">{plan.goals.length}/5</span></h2>
        <p className="tc-planhint">Three to five things that move you toward that vision.</p>
        <div className="tc-goals">
          {plan.goals.map((g) => (
            <div key={g.id} className={"tc-goal" + (g.done ? " is-done" : "")}>
              <button className="tc-goalcheck" aria-pressed={g.done} title="Mark done"
                onClick={() => setGoal(g.id, { done: !g.done })}>{g.done ? "✓" : ""}</button>
              <span className="tc-goaltext">{g.text}</span>
              <select className="tc-goalarea" value={g.area} onChange={(e) => setGoal(g.id, { area: e.target.value })}>
                {AREAS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button className="tc-goaldrop" onClick={() => dropGoal(g.id)} title="Remove">×</button>
            </div>
          ))}
        </div>
        {plan.goals.length < 5 && (
          <div className="tc-goaladd">
            <input value={draft} placeholder="e.g. Watch an episode without subtitles"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addGoal(); }} />
            <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={addGoal}>Add</button>
          </div>
        )}
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">What matters most right now</h2>
        <p className="tc-planhint">
          Eight areas is a lot to carry at once, so it's fine to prioritise. This changes
          what Smart Review actually serves you — it nudges the order, it won't let
          something you've nearly forgotten slide.
        </p>
        <div className="tc-prios">
          {AREAS.map(([k, label, icon]) => {
            const v = plan.priorities[k] || 1;
            return (
              <div key={k} className="tc-prio">
                <span className="tc-prioname">{icon} {label}</span>
                <div className="tc-priobtns">
                  {[[1, "Later"], [2, "Yes"], [3, "Focus"]].map(([n, t]) => (
                    <button key={n} className={"tc-priobtn" + (v === n ? " is-on" : "")}
                      onClick={() => update({ priorities: { ...plan.priorities, [k]: n } })}>{t}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">How long today?</h2>
        <p className="tc-planhint">
          Five focused minutes three times a day beats one long session you won't repeat.
          Change this whenever — it sets the length of your next Smart Review.
        </p>
        <div className="tc-paces">
          {PACES.map(([k, label, mins, note]) => (
            <button key={k} className={"tc-pace" + (plan.pace === k ? " is-on" : "")}
              onClick={() => update({ pace: k })}>
              <span className="tc-pacelabel">{label}</span>
              <span className="tc-pacemins">≈{mins} min</span>
              <span className="tc-pacenote">{note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── the learner profile ──
          Model outputs, not XP bars. Each row is an ability with its own evidence, and a
          row without enough evidence says so rather than inventing a percentage — being
          told you are "72% fluent" off nine answers is how learning apps lose the plot. */}
      <section className="tc-plansec">
        <h2 className="tc-planh">What you can actually do <span className="tc-planh-sub">last 60 days</span></h2>
        <p className="tc-planhint">
          These come from how you've answered, split by ability — not from how many cards
          you've seen. A word you can read but can't say counts as one, not both.
        </p>
        <div className="tc-cover">
          {SKILLS.map((k) => {
            const row = profile[k] || { n: 0, ok: 0 };
            /* A Beta posterior rather than a bare rate, so "72% from four answers" and
               "72% from ninety" stop looking like the same claim. The pale band shows how
               much the estimate should be trusted, and an ability nobody has measured reads
               as "not measured yet" rather than as a low score. */
            const post = posterior(row.ok || 0, (row.n || 0) - (row.ok || 0));
            const st = stateOf(post);
            const pct = Math.round(post.mean * 100);
            const lo = Math.round(post.lo * 100), hi = Math.round(post.hi * 100);
            const tip = row.n ? row.ok + "/" + row.n + " — likely between " + lo + "% and " + hi + "%" : "no answers yet";
            return (
              <div key={k} className="tc-coverrow">
                <span className="tc-covername">{SKILL_LABEL[k]}</span>
                <div className="tc-coverbar" title={tip}>
                  <div className="tc-coverband" style={{ left: lo + "%", width: Math.max(2, hi - lo) + "%" }} />
                  {st !== STATE.UNKNOWN && (
                    <div className={"tc-coverfill" + (st === STATE.WEAK ? " is-gap" : "")} style={{ width: pct + "%" }} />
                  )}
                </div>
                <span className="tc-covernum">{st === STATE.UNKNOWN ? "—" : pct + "%"}</span>
              </div>
            );
          })}
        </div>
        <p className="tc-planhint" style={{ marginTop: 10 }}>
          {SKILLS.filter((k) => (profile[k] || {}).n > 0).length === 0
            ? "Nothing measured yet — do a session and this fills in."
            : gap
              ? <>Biggest opportunity: <b>{SKILL_LABEL[gap.skill]}</b>. Your {SKILL_LABEL[gap.ahead].toLowerCase()} is about {Math.round(gap.spread * 100)} points ahead.</>
              : "No clear weak spot yet — the abilities measured so far are close together."}
        </p>
        <p className="tc-planhint">
          {SKILLS.map((k) => {
            const row = profile[k] || { n: 0, ok: 0 };
            return SKILL_LABEL[k] + ": " + STATE_LABEL[stateOf(posterior(row.ok || 0, (row.n || 0) - (row.ok || 0)))];
          }).join(" · ")}
        </p>
      </section>

      <Checkpoint cards={cards} heldOut={heldOut} />

      <section className="tc-plansec">
        <h2 className="tc-planh">Is the app right about you? <span className="tc-planh-sub">its predictions vs what happened</span></h2>
        {/* Everything else on this page reports what the model believes. This is the one
            place that checks those beliefs. It says "not enough yet" far more often than it
            says anything else, on purpose: a verdict drawn from thirty answers would be
            noise dressed as a finding, and tuning the app against noise is worse than
            leaving it alone. */}
        <p className="tc-planhint" style={{ marginTop: 0 }}>{cal.headline}</p>

        {cal.prediction.bins.length > 0 && (
          <>
            <div className="tc-cover" style={{ marginTop: 10 }}>
              {cal.prediction.bins.map((b) => (
                <div key={b.lo} className="tc-coverrow">
                  <span className="tc-covername">said {Math.round(b.predicted * 100)}%</span>
                  <div className="tc-coverbar">
                    <div className={"tc-coverfill" + (b.verdict === "overconfident" ? " is-gap" : "")}
                      style={{ width: Math.round(b.observed * 100) + "%" }} />
                  </div>
                  <span className="tc-covernum">{Math.round(b.observed * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="tc-planhint">
              Each row: how often you actually got those right. The range around every figure
              is wide until there are a few hundred answers behind it, so only a bar far from
              its label means anything yet.
            </p>
          </>
        )}

        {cal.cue.rows.some((r) => r.verdict !== "insufficient") && (
          <p className="tc-planhint">
            Help levels: {cal.cue.rows.filter((r) => r.verdict !== "insufficient").map((r) =>
              `${CUE_NAME[r.cue] || ("level " + r.cue)} ${Math.round(r.observed * 100)}% (${r.verdict === "on_target" ? "about right" : r.verdict === "too_hard" ? "too hard" : "too easy"})`).join(" · ")}
            {cal.cue.monotonic === false && " — and they are not actually getting harder in order, which means the levels need reworking."}
          </p>
        )}

        {cal.efficacy.rows.filter((r) => r.confident).length > 0 && (
          <p className="tc-planhint">
            After a miss, you get it right next time: {cal.efficacy.rows.filter((r) => r.confident)
              .map((r) => `${FAILURE_NAME[r.failure] || r.failure} ${Math.round(r.recovered * 100)}%`).join(" · ")}
          </p>
        )}

        {cal.n > 0 && (
          <p className="tc-planhint" style={{ opacity: 0.7 }}>
            {cal.n} answers on file{cal.modelEra < cal.n ? `, ${cal.modelEra} of them from the current version of the model` : ""}.
          </p>
        )}
      </section>

      <section className="tc-plansec">
        <h2 className="tc-planh">What you've actually practised <span className="tc-planh-sub">last 14 days</span></h2>
        {totalReviews === 0 ? (
          <p className="tc-planhint">Nothing logged yet — do a session and this fills in.</p>
        ) : (
          <>
            <div className="tc-cover">
              {AREAS.map(([k, label, icon]) => {
                const n = cover[k] || 0;
                const pri = plan.priorities[k] || 1;
                return (
                  <div key={k} className="tc-coverrow">
                    <span className="tc-covername">{icon} {label}</span>
                    <div className="tc-coverbar">
                      <div className={"tc-coverfill" + (n === 0 && pri >= 2 ? " is-gap" : "")}
                        style={{ width: Math.round((n / busiest) * 100) + "%" }} />
                    </div>
                    <span className="tc-covernum">{n}</span>
                  </div>
                );
              })}
            </div>
            {neglected.length > 0 && (
              <p className="tc-covergap">
                You said {neglected.map(([, l]) => l.toLowerCase()).join(" and ")} matter
                {neglected.length === 1 ? "s" : ""}, but {neglected.length === 1 ? "it hasn't" : "they haven't"} come
                up in two weeks. The Input tab covers listening and reading; speaking and
                culture need practice outside this app.
              </p>
            )}
          </>
        )}
      </section>

      <section className="tc-plansec tc-planfoot">
        <h2 className="tc-planh">A few things worth remembering</h2>
        <ul className="tc-planlist">
          <li><b>Use more than one method.</b> Students who mix flashcards, shows, mnemonics and reading do better than those who only ever do one.</li>
          <li><b>Study what you actually like.</b> Anime, card games, music, cooking — vocabulary you care about sticks, and you'll keep going once nobody's grading you.</li>
          <li><b>Media only counts when you're paying attention.</b> Look words up, notice grammar you've studied, sing along. Passive listening slides past.</li>
          <li><b>Some days are five-minute days.</b> That's the plan working, not you failing.</li>
        </ul>
      </section>
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
/* Production (EN→JP) unlocks once recognition is solid — stability of a week or more.
   Asking you to produce a word you can't yet recognise is just failure with extra steps;
   asking only ever to recognise leaves you able to read Japanese and unable to speak it.
   Recognition reliably precedes production in L2 acquisition, so this gates on the
   recognition state and then starts building the harder direction on top. */
const PROD_UNLOCK_STABILITY = 7;    // days
function recallUnlocked(c) {
  if (!((c.seen || 0) > 0)) return false;
  const st = c.fsrs || seedFromHistory(c);
  return !!(st && st.S >= PROD_UNLOCK_STABILITY);
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
/* >= 1 means due. Under FSRS this is "has recall probability fallen to the target yet",
   which is a real question about your memory rather than a position on a fixed ladder.
   Contract: due is the scheduler's truth — dueness(c, now) >= 1 iff now >= c.fsrs.due. review()
   already writes a due that honours the retention target and the 10-minute relearning step;
   this used to ignore it and recompute from S with a hard-coded 0.9 target, so a lapsed card
   (due in 10 minutes) wasn't offered again for days, and the retention chip didn't actually
   change when anything was due. Seeded/legacy states with no stored due fall back to
   recomputing from S with the CURRENT target. */
function dueness(c, now) {
  const seen = c.seen || 0;
  if (seen === 0) return 0;
  const st = c.fsrs || seedFromHistory(c);
  if (st && st.S > 0) {
    const last = st.last || 0;
    const due = st.due > last ? st.due : last + Math.max(1, intervalFor(st.S, retentionTarget)) * 86400000;
    const span = Math.max(60000, due - last);   // never divide by ~0 (relearning = 10 min)
    return (now - last) / span;
  }
  const interval = REVIEW_INTERVALS[effLevel(c)] * (c.ease || 1);   // pre-FSRS fallback
  return (now - (c.last || 0)) / interval;
}
/* ── shared FSRS plumbing for the mini-decks ──
   Kana, the conjugation drill and the 10k deck each grew their own scheduler: a hand-tuned
   priority score over level, accuracy, streak and days-since. They work, but there is no
   reason kana or verb forms should be scheduled worse than vocabulary, and three
   near-identical scorers is three places to fix anything. These two functions put every
   deck in the app on the same memory model. The stat records keep their existing shape —
   an `fsrs` field is simply added alongside. */
function statReview(st, ok, ms, now = Date.now()) {
  const prior = st && st.fsrs ? st.fsrs : (st && (st.seen || 0) > 0 ? seedFromHistory(st) : null);
  return fsrsReview(prior, gradeFromLatency(ok, ms, { streak: st && st.streak }), now, retentionTarget);
}
/** Higher = drill this sooner. Driven by how far recall has decayed below the target. */
function statNeed(st, now = Date.now()) {
  const seen = st && st.seen || 0;
  if (!seen) return 6;                                    // never drilled → straight to the front
  const f = st.fsrs || seedFromHistory(st);
  if (!f || !(f.S > 0)) return 5;
  const r = retrievability(Math.max(0, (now - (f.last || 0)) / 86400000), f.S);
  // 1 - r is "how much of this memory has decayed". A card at 50% recall outranks one at
  // 95% no matter how many times each has been seen, which is the whole point.
  return (1 - r) * 8 + (st.streak ? 0 : 0.6);
}

/* Production is scheduled on its own clock. This matters more than it looks: a card only
   unlocks production once recognition is STABLE, and a stable card is by definition not due
   for recognition. Selecting the session purely on recognition due-ness therefore surfaces
   production almost never — the feature would have looked wired up and quietly done nothing.
   A card is production-due if it has earned the direction and either has never been asked
   backwards, or its production memory has decayed to the target. */
function prodDue(c, now) {
  if (!recallUnlocked(c)) return false;
  if (!c.rfsrs || !(c.rfsrs.S > 0)) return true;
  return (c.rfsrs.due || 0) <= now;
}

/* ── the study plan ──
   Straight out of the notes Matthew's JPN 101 professor left for continued study: start
   from a vision, set three to five goals pointing at it, cover the eight areas of the
   language while accepting that some matter more right now, favour short frequent
   sessions over rare long ones, use several different strategies rather than one, and
   leave room for the days when you are tired or short of time.

   The part that makes this more than a notes page: the plan drives the scheduler. The
   priorities weight what Smart Review serves, and the pace sets how long a session runs.
   A plan the app ignores is a wish list. */
/* ── evidence ──
   One record per answered exercise: which item, which ability it tested, how much help it
   came with, what went wrong, and what the model had predicted. The reviews are right
   that this is the unlock — a learner profile, failure targeting, and eventually
   measuring whether the model's confidence is justified all need outcomes recorded per
   SKILL rather than per card.

   Capped as a ring buffer. A log nobody can afford to keep is a log that stops existing
   the first time it fills localStorage, and 4,000 answers is already months of study. */
/* Names for the report. The cue ladder and the failure taxonomy are internal vocabulary —
   "CUE.PARTIAL" and "orthography" mean nothing to someone trying to learn Japanese — and
   the rule that no scheduler jargon reaches the learner applies to this page too. */
const CUE_NAME = {
  0: "shown to you", 1: "multiple choice", 2: "with a big hint",
  3: "with a small hint", 4: "from memory", 5: "in a sentence",
};
const FAILURE_NAME = {
  meaning: "forgot the meaning", reading: "fumbled the reading",
  listening: "missed it by ear", production: "could not write it",
  orthography: "wrong characters", context: "wrong in context",
  blank: "drew a blank", unclassified: "unclassified",
};

/* ── the checkpoint ──
   Runs are tiny and they are the only record of whether the app is working, so they are
   kept forever rather than capped at a working-set size. */
const BENCH_KEY = "jpn101:benchmark";
async function loadRuns() {
  try { const r = await sGet(BENCH_KEY); const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
async function saveRuns(list) { await sSet(BENCH_KEY, JSON.stringify(list)); }

const EVIDENCE_KEY = "jpn101:evidence";
const EVIDENCE_CAP = 4000;

/* The current latency norms, kept at module level because the card writer lives outside
   the component that reads the evidence log. Recomputed whenever the log changes; an
   empty object simply means "no norm yet", and the grader falls back. */
const latencyNormsRef = { current: {} };
function refreshLatencyNorms(list) {
  try { latencyNormsRef.current = latencyNorms(list || []); } catch (e) { latencyNormsRef.current = {}; }
}
let _evidence = null;
async function loadEvidence() {
  if (_evidence) return _evidence;
  try { const r = await sGet(EVIDENCE_KEY); _evidence = r ? JSON.parse(r) : []; }
  catch (e) { _evidence = []; }
  if (!Array.isArray(_evidence)) _evidence = [];
  refreshLatencyNorms(_evidence);
  return _evidence;
}
const _evidenceWatchers = new Set();
function subscribeEvidence(fn) { _evidenceWatchers.add(fn); return () => _evidenceWatchers.delete(fn); }

async function logEvidence(rec) {
  const list = await loadEvidence();
  list.push(rec);
  if (list.length > EVIDENCE_CAP) list.splice(0, list.length - EVIDENCE_CAP);
  sSet(EVIDENCE_KEY, JSON.stringify(list));
  refreshLatencyNorms(list);
  for (const fn of _evidenceWatchers) { try { fn(list.slice()); } catch (e) {} }
}

/* ── grading against this learner, not against a constant ──
   gradeFromLatency() uses universal thresholds (fast+streaked is Easy, slow is Hard).
   Those cannot mean the same thing for picking one of four options and for typing out
   かようび — the second is slower for everyone, so a fixed cutoff quietly marks every
   typed answer as difficult and drags its schedule in.

   Once there are enough correct answers of a given skill+format to form a norm, the
   grade comes from where this answer sits in THIS learner's own distribution for THAT
   kind of question. Below that, the old thresholds still apply — a norm built from three
   samples would be worse than the constant it replaced. */
function gradeAgainstNorm(ok, ms, skill, format, norms, streak) {
  if (!ok) return AGAIN;
  const verdict = latencyVerdict(ms, skill, format, norms);
  if (!verdict) return gradeFromLatency(ok, ms, { streak });      // no norm yet: fall back
  return verdict === "fast" ? EASY : verdict === "slow" ? HARD : GOOD;
}
/* ── outcome feedback ──
   The last review's sharpest point: failure classification existed and changed nothing.
   These write the two signals the next intervention actually reads — a rolling recent
   history, and which ability broke — back onto the item, in whichever store owns it.

   `recent` is a short string of 1s and 0s, newest last. Lifetime accuracy reacts far too
   slowly: a word answered wrong for months and right all week still looks broken, and one
   that was solid and has just fallen apart still looks fine. */
function applyOutcome(st, { ok, failure, skill }) {
  const base = st || {};
  const out = { ...base, recent: pushRecent(base.recent, ok) };
  if (skill === "production") out.rrecent = pushRecent(base.rrecent, ok);
  out.lastFailure = ok ? null : (failure || null);
  return out;
}


const PLAN_KEY = "jpn101:plan";

export const AREAS = [
  ["vocabulary", "Vocabulary", "📖"],
  ["kanji", "Kanji", "🈷️"],
  ["listening", "Listening", "👂"],
  ["reading", "Reading", "📕"],
  ["writing", "Writing", "✍️"],
  ["speaking", "Speaking", "💬"],
  ["grammar", "Grammar", "🔧"],
  ["culture", "Culture", "🏮"],
];

/* Which area a piece of practice counted towards. Kept explicit rather than guessed, so
   the coverage report cannot quietly flatter itself. */
function areaForDeck(deck) {
  if (deck === "kanji") return "kanji";
  if (deck === "kana" || deck === "scripts") return "reading";
  if (deck === "conj" || deck === "dates") return "grammar";
  if (deck === "input") return "listening";
  if (deck === "oral") return "speaking";
  return "vocabulary";
}

/* Three honest paces, because some days are not study days. The professor's point about
   "small and simple things" is the default: five focused minutes, three times a day,
   beats one heroic session you will not repeat. */
const PACES = [
  ["short", "Short", 5, "Tired, busy, or between things. Five minutes still counts."],
  ["normal", "Normal", 10, "The daily default — enough to make real progress."],
  ["deep", "Deep", 20, "Motivated and have the time. Bigger backlog, more new words."],
];

const PLAN_DEFAULT = {
  vision: { fiveYear: "", oneYear: "", term: "" },
  goals: [],
  priorities: { vocabulary: 2, kanji: 2, listening: 1, reading: 1, writing: 1, speaking: 1, grammar: 1, culture: 1 },
  pace: "normal",
};

async function loadPlan() {
  try {
    const raw = await sGet(PLAN_KEY);
    if (!raw) return { ...PLAN_DEFAULT };
    const p = JSON.parse(raw);
    return {
      ...PLAN_DEFAULT, ...p,
      vision: { ...PLAN_DEFAULT.vision, ...(p.vision || {}) },
      priorities: { ...PLAN_DEFAULT.priorities, ...(p.priorities || {}) },
      goals: Array.isArray(p.goals) ? p.goals : [],
    };
  } catch (e) { return { ...PLAN_DEFAULT }; }
}
/* The plan is edited on its own tab but consumed on the Study tab, so changes have to
   reach a component that is not mounted alongside the editor. */
const _planWatchers = new Set();
function subscribePlan(fn) { _planWatchers.add(fn); return () => _planWatchers.delete(fn); }
function savePlan(plan) {
  sSet(PLAN_KEY, JSON.stringify(plan));
  for (const fn of _planWatchers) { try { fn(plan); } catch (e) {} }
}

function paceMinutes(pace) {
  const row = PACES.find(([k]) => k === pace);
  return row ? row[2] : 10;
}

/* Priorities become deck weights, so a stated priority actually changes the session.
   Deliberately gentle: a priority nudges the ordering, it does not override how badly
   something has decayed. Saying listening matters should not mean forgetting kanji. */
function deckWeight(plan, deck) {
  const area = areaForDeck(deck);
  const p = (plan && plan.priorities && plan.priorities[area]) || 1;
  return (p - 1) * 0.6;                       // 1 → 0, 2 → 0.6, 3 → 1.2
}

/* What actually got practised, per area, over the last N days. Read from the day log
   rather than from intentions. */
function coverageFrom(days, span = 14) {
  const out = {};
  for (const [k] of AREAS) out[k] = 0;
  if (!days) return out;
  const cut = Date.now() - span * 86400000;
  for (const key of Object.keys(days)) {
    if (new Date(key + "T12:00:00").getTime() < cut) continue;
    const by = days[key] && days[key].by;
    if (!by) continue;
    for (const area of Object.keys(by)) if (area in out) out[area] += by[area];
  }
  return out;
}

/* ── kanji ordering, shared by the Kanji tab and Smart Review ──
   Both need the same answer to "which characters am I working on?", and two copies of
   that rule would drift the moment either changed — the Kanji page would show one
   frontier while Smart Review introduced from another. One function, both callers.

   The order is the learner's own vocabulary first: a character that appears in words you
   have actually studied outranks one that is merely frequent in newspapers. */
function kanjiOrdered(list, deckMap) {
  if (!deckMap || !deckMap.size) return list || [];
  const rank = (k, i) => {
    const d = deckMap.get(k.c);
    if (!d) return 2000000 + i;
    return (d.studied ? 0 : 1000000) + i - Math.min(d.n, 40) * 40;
  };
  return (list || []).map((k, i) => ({ k, r: rank(k, i) })).sort((a, b) => a.r - b.r).map((x) => x.k);
}

/* The unlocked set grows only as characters go solid, so the frontier cannot run away
   from you. Smart Review introduces from exactly this set, which is why a character met
   there shows up on the Kanji page as met — they are the same list and the same store. */
function kanjiUnlocked(all, stats) {
  const mastered = (all || []).filter((k) => (((stats || {})[k.c] || {}).level || 0) >= 4).length;
  const frontier = Math.min((all || []).length, KANJI_BATCH * (Math.floor(mastered / KANJI_BATCH) + 2));
  return (all || []).slice(0, frontier);
}

/* ── the other decks, as cards ──
   Kana, kanji and the 10k list already carry the same stat record as the vocabulary deck
   and are already scheduled by the same model, but each one only ever appeared on its own
   tab. Something learned in June was invisible to the one button that actually gets
   pressed. These adapters put them in the same session.

   Only recognition is borrowed. The bespoke exercises on each tab — stroke order, the
   kanji matching grid, the conjugation drill — stay where they are, because they are the
   whole point of those tabs. What Smart Review adds is the thing none of them can do:
   noticing that a kana you have not seen since June has quietly faded. */
const DECK_SRC = ["kana", "kanji", "freq"];

function foreignKey(src) {
  return src === "kana" ? KANA_KEY : src === "kanji" ? KANJI_KEY : "jpn101:freq";
}

/* Each deck keys its stats differently — kana by "h-あ", kanji by the bare character, the
   10k list by card id. The card id carries the source so a result can find its way home. */
function foreignCard(src, raw) {
  if (src === "kana") {
    return { id: "kana:" + raw.id, src, srcId: raw.id, term: raw.ch, reading: raw.r,
             romaji: raw.r, meaning: raw.r, kind: "kana", emoji: "🔤" };
  }
  if (src === "kanji") {
    const on = (raw.on || []).slice(0, 2).join("・");
    const kun = (raw.kun || []).slice(0, 2).join("・");
    return { id: "kanji:" + raw.c, src, srcId: raw.c, term: raw.c,
             reading: [on, kun].filter(Boolean).join(" / "), romaji: "",
             meaning: (raw.m || []).slice(0, 3).join(", "), kind: "kanji", emoji: raw.e || "🈷️" };
  }
  return { ...raw, id: "freq:" + raw.id, src, srcId: raw.id };
}

/* Write a result back to the deck it came from. Each deck owns its own storage key and
   its own copy of the record, so this reads, updates and writes that key rather than
   touching the vocabulary deck. Same stat shape, same memory model, same everything —
   only the key differs. */
async function recordForeign(card, ok, ms, area, outcome) {
  const key = foreignKey(card.src);
  try {
    const raw = await sGet(key);
    const store = raw ? JSON.parse(raw) : (card.src === "freq" ? [] : {});
    const now = Date.now();
    if (card.src === "freq") {
      const next = (Array.isArray(store) ? store : []).map((x) => (x.id !== card.srcId ? x : {
        ...x, last: now, fsrs: statReview(x, ok, ms, now),
        seen: (x.seen || 0) + 1, correct: (x.correct || 0) + (ok ? 1 : 0),
        streak: ok ? (x.streak || 0) + 1 : 0,
        level: ok ? Math.min(5, (x.level || 0) + 1) : Math.max(0, (x.level || 0) - 2),
        ms: (x.ms || 0) + (ms || 0), msN: (x.msN || 0) + (ms ? 1 : 0),
      }));
      await sSet(key, JSON.stringify(next));
    } else {
      const st = store[card.srcId] || { seen: 0, correct: 0, level: 0, streak: 0 };
      store[card.srcId] = applyOutcome({
        ...st, last: now, fsrs: statReview(st, ok, ms, now),
        seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
        streak: ok ? (st.streak || 0) + 1 : 0,
        level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
        ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
      }, { ok, ...(outcome || {}) });
      await sSet(key, JSON.stringify(store));
    }
    logDay({ ok, ms: ms || 0, deck: card.src, area });
  } catch (e) { /* a lost result is better than a broken session */ }
}

/* Load every other deck's items and stats, ready to hand to the session builder. */
async function loadForeignDecks(cards) {
  const out = [];
  /* Kana is deliberately NOT pooled. Hiragana and katakana are memorised, so drilling a
     character in Smart Review spends a slot that a word or a kanji needed. The Kana tab
     is still there for when a chart needs refreshing; it just does not dilute the one
     button that is supposed to be the highest-value thing to press. */
  try {
    const [d, raw] = await Promise.all([loadKanji(), sGet(KANJI_KEY)]);
    const stats = raw ? JSON.parse(raw) : {};
    /* The SAME unlocked set the Kanji tab works from, in the same order — including
       characters not yet met, so Smart Review can introduce them too. Because both read
       and write jpn101:kanji keyed by the bare character, a kanji first met here shows up
       on the Kanji page as met, counts toward its mastered total, and moves its frontier.
       The two tabs are one progress record seen from two places. */
    const index = deckKanjiIndex(cards || []);
    const all = kanjiOrdered((d && d.kanji) || [], index);
    /* Asked through a word from the deck wherever one exists. 68 kanji answers came back
       99% correct, which is not mastery — it is a question that asks nothing. Recognising
       "eat" beside 食 is not the skill; reading 食べる as たべる is, and the reading a kanji
       takes depends on the word it sits in. Identity is unchanged, so every stored answer
       stays attached to its character. */
    const items = inContext(
      kanjiUnlocked(all, stats).map((k, i) => ({ ...foreignCard("kanji", k), order: i })),
      index,
    );
    out.push({ deck: "kanji", items, stats: remapStats(stats, "kanji") });
  } catch (e) {}
  try {
    const raw = await sGet("jpn101:freq");
    const deck = raw ? JSON.parse(raw) : [];
    const started = (Array.isArray(deck) ? deck : []).filter((x) => (x.seen || 0) > 0);
    const items = started.map((x) => foreignCard("freq", x));
    out.push({ deck: "freq", items, stats: Object.fromEntries(items.map((i) => [i.id, i])) });
  } catch (e) {}
  return out.filter((s) => s.items.length);
}

/* The builder looks stats up by the card id it is given, which is prefixed. */
function remapStats(stats, src) {
  const out = {};
  for (const k of Object.keys(stats || {})) out[src + ":" + k] = stats[k];
  return out;
}

/** Probability you'd recall this card right now — used for the UI, not the schedule. */
function recallChance(c, now) {
  const st = c.fsrs || seedFromHistory(c);
  if (!st || !(st.S > 0)) return null;
  return retrievability(Math.max(0, (now - (st.last || 0)) / 86400000), st.S);
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
  const sec = c.sec ? String(c.sec).replace(/#\d+$/, "") : "";   // "#n" only disambiguates same-scene duplicate seed rows (see cardMergeKey/applySeed)
  return sec || SECTION_MAP[c.term] || ((c.lesson || 0) <= 6 ? "Act 1" : "Class notes");
}
const SECTION_HUES = [258, 214, 186, 152, 96, 42, 22, 350, 320, 282];
const DB_SECTION = /^DB (\d+)(?:[–-]\d+)?$/;   // "DB 8–9" — manga pages, en dash or hyphen
function hueFor(name) {
  if (name === "Act 1") return 214;
  if (name === "Class notes") return 42;
  // Every manga section shares one hue. They accumulate a page at a time, and hashing each
  // range separately would make the top of the study list a different colour every two pages.
  if (DB_SECTION.test(name)) return 22;
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SECTION_HUES[h % SECTION_HUES.length];
}
function sectionArt(cardsInSec) {   // single most-used emoji in this section — genuinely representative, no external images needed
  const counts = new Map();
  cardsInSec.forEach((c) => { if (c.emoji) counts.set(c.emoji, (counts.get(c.emoji) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 1).map((e) => e[0]);
}
function sectionRank(s) {
  // Manga sections sit above the coursework: this is the thing being read every day, and
  // burying it under a year of lessons is how it stops getting opened. Ranked by first page
  // so the list stays in reading order, and offset far enough below Act 1 that no page
  // number can ever climb back into the lessons.
  const db = DB_SECTION.exec(s);
  if (db) return -1e6 + parseInt(db[1], 10);
  if (s === "Act 1") return 100;
  const dm = /^Act (\d+) Dry Run$/.exec(s);
  if (dm) return 1000 + parseInt(dm[1], 10) * 100 + 99; // after every scene of that act
  const m = /^(\d+)-(\d+)/.exec(s);
  if (m) return 1000 + parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
  if (s === "Class notes") return 90000;
  return 50000;
}


/* ───────────────────────────── SENTENCES (AI) ───────────────────────────── */
/* Transport for every AI feature (hook, debrief, script annotation, sentences). The browser
   must never call api.anthropic.com directly: there is no safe place for a key in a client
   bundle, and this repo already had one key-in-source incident. A session-gated Worker route
   (/api/ai, key held as a Worker secret) is the only allowed path. */
const AI_ENABLED = true;
const AI_ENDPOINT = "/api/ai";
/* callAI: the live transport, used by hook/debrief/Scripts annotation. Sends a fixed TASK
   name plus structured data only — never a free-form prompt string. The Worker owns every
   prompt (cf/src/ai.js); this is the whole abuse guard, so no call site here should ever
   build prompt TEXT and hand it to the network. */
class AIError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function aiMessage(status) {
  return status === 401 ? "Sign in (Browse tab) to use the AI helpers."
    : status === 429 ? "Daily AI limit reached — try again tomorrow."
    : status === 503 ? "The AI helper isn't set up on this server yet."
    : status === 504 ? "The AI took too long — try again."
    : "Couldn't reach the AI — try again later.";
}
async function callAI(task, input) {
  const session = loadSession();
  if (!session) throw new AIError(401, aiMessage(401));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST", cache: "no-store", signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + session },
      body: JSON.stringify({ task, input, v: 1 }),
    });
    if (!res.ok) throw new AIError(res.status, aiMessage(res.status));
    const data = await res.json();
    if (!data || !data.result) throw new AIError(502, aiMessage(502));
    return data;   // { result, cached }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e.name === "AbortError") throw new AIError(504, aiMessage(504));
    throw new AIError(0, aiMessage(0));
  } finally { clearTimeout(timer); }
}
// callClaude: legacy free-prompt transport, kept only for the unmounted Sentences component
// (see TODO-127 — not wired to a tab). Do not add new call sites; use callAI instead.
async function callClaude(prompt) {
  if (!AI_ENABLED) throw new Error("AI helper not available");
  const req = syncRequestOptions({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
  if (!req) throw new Error("sign in to use AI helpers");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(AI_ENDPOINT, { ...req.opts, signal: ctrl.signal });
    if (!res.ok) throw new Error("server " + res.status);
    const data = await res.json();
    const text = typeof data.text === "string" ? data.text : "";
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
// 拗音 yōon — the "modified"/contracted kana: a full-size consonant kana + a SMALL ゃゅょ.
// These are what trip people up (byu / pyo / hya …) and they never appear in the base 46
// or dakuten charts, so they need their own drillable set.
const KANA_YOON_ROWS = [
  [["きゃ","キャ","kya"],["きゅ","キュ","kyu"],["きょ","キョ","kyo"]],
  [["しゃ","シャ","sha"],["しゅ","シュ","shu"],["しょ","ショ","sho"]],
  [["ちゃ","チャ","cha"],["ちゅ","チュ","chu"],["ちょ","チョ","cho"]],
  [["にゃ","ニャ","nya"],["にゅ","ニュ","nyu"],["にょ","ニョ","nyo"]],
  [["ひゃ","ヒャ","hya"],["ひゅ","ヒュ","hyu"],["ひょ","ヒョ","hyo"]],
  [["みゃ","ミャ","mya"],["みゅ","ミュ","myu"],["みょ","ミョ","myo"]],
  [["りゃ","リャ","rya"],["りゅ","リュ","ryu"],["りょ","リョ","ryo"]],
  [["ぎゃ","ギャ","gya"],["ぎゅ","ギュ","gyu"],["ぎょ","ギョ","gyo"]],
  [["じゃ","ジャ","ja"],["じゅ","ジュ","ju"],["じょ","ジョ","jo"]],
  [["びゃ","ビャ","bya"],["びゅ","ビュ","byu"],["びょ","ビョ","byo"]],
  [["ぴゃ","ピャ","pya"],["ぴゅ","ピュ","pyu"],["ぴょ","ピョ","pyo"]],
];
// The modifier marks themselves. Not syllables — but you can't read or write real words
// without them (きって, コーヒー, きょう), and they appear in no standard kana chart.
// Row entries are [hiragana, katakana, romaji, note, kataOnly].
const KANA_MARK_ROWS = [
  [["っ","ッ","small tsu","— doubles the next consonant: きって kitte"],
   ["ー","ー","long mark","— lengthens the vowel: コーヒー kōhī", 1],
   ["ゃ","ャ","small ya","— builds combos: きゃ kya"],
   ["ゅ","ュ","small yu","— builds combos: きゅ kyu"],
   ["ょ","ョ","small yo","— builds combos: きょ kyo"]],
  [["ぁ","ァ","small a","— builds ファ fa"],
   ["ぃ","ィ","small i","— builds ティ ti"],
   ["ぅ","ゥ","small u","— builds トゥ tu"],
   ["ぇ","ェ","small e","— builds フェ fe"],
   ["ぉ","ォ","small o","— builds フォ fo"]],
];
// Katakana-only extended sounds for loanwords. These are all over this app's own vocab
// (カフェ, オフィス, フォント, マーケティング, ジェ…) and exist in no gojūon/dakuten chart.
// hiragana slot just mirrors the katakana — it's only the stable stats id; kataOnly=1
// keeps these out of hiragana mode entirely, since they have no hiragana spelling.
const KANA_EXT_ROWS = [
  [["ファ","ファ","fa",null,1],["フィ","フィ","fi",null,1],["フェ","フェ","fe",null,1],["フォ","フォ","fo",null,1],["フュ","フュ","fyu",null,1]],
  [["ヴァ","ヴァ","va",null,1],["ヴィ","ヴィ","vi",null,1],["ヴ","ヴ","vu",null,1],["ヴェ","ヴェ","ve",null,1],["ヴォ","ヴォ","vo",null,1]],
  [["ティ","ティ","ti",null,1],["トゥ","トゥ","tu",null,1],["ディ","ディ","di",null,1],["ドゥ","ドゥ","du",null,1]],
  [["シェ","シェ","she",null,1],["ジェ","ジェ","je",null,1],["チェ","チェ","che",null,1]],
  [["ツァ","ツァ","tsa",null,1],["ツィ","ツィ","tsi",null,1],["ツェ","ツェ","tse",null,1],["ツォ","ツォ","tso",null,1]],
  [["ウィ","ウィ","wi",null,1],["ウェ","ウェ","we",null,1],["ウォ","ウォ","wo",null,1]],
  [["クァ","クァ","kwa",null,1],["クィ","クィ","kwi",null,1],["クェ","クェ","kwe",null,1],["クォ","クォ","kwo",null,1],["グァ","グァ","gwa",null,1]],
];
// Independently toggleable so you can drill everything at once or isolate one weak set.
// labels stay short on purpose — six of these plus script/mode chips have to fit a phone
const KANA_GROUPS = [
  ["base", "46",       KANA_BASE_ROWS],
  ["daku", "dakuten",  KANA_DAKU_ROWS],
  ["yoon", "combos",   KANA_YOON_ROWS],
  ["mark", "marks",    KANA_MARK_ROWS],
  ["ext",  "extended", KANA_EXT_ROWS],
];
const KANA_LENGTHS = [10, 20, 40, "all"];
const KANA_REQUEUE_GAP = 3, KANA_REQUEUE_CAP = 2;
const fmtSecs = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
};

function Kana() {
  const [script, setScript] = useState("hira");     // hira | kata
  const [sets, setSets] = useState(() => new Set(["base"]));   // any mix of KANA_GROUPS keys
  const [view, setView] = useState("setup");        // setup | session | summary | chart
  const [sessionLen, setSessionLen] = useState(20);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [revealed, setRevealed] = useState(false);
  const [guide, setGuide] = useState(false);
  // session state — mirrors Study so both tabs behave the same way
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [passed, setPassed] = useState(() => new Set());
  const [firstTry, setFirstTry] = useState(() => new Set());
  const [struggled, setStruggled] = useState(() => new Set());
  const missRef = useRef({});
  const shownRef = useRef(0);        // when the current kana appeared
  const thinkRef = useRef(null);     // ms from shown → Check (think time)
  const sessionStartRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { (async () => {
    try { const r = await sGet(KANA_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  // Rows for whichever groups are switched on, dropping katakana-only entries (ー, ファ …)
  // when hiragana is selected, and any row those leave empty.
  const rows = useMemo(() => {
    const keep = (e) => !(e[4] && script !== "kata");
    return KANA_GROUPS
      .filter(([key]) => sets.has(key))
      .flatMap(([, , groupRows]) => groupRows.map((row) => row.filter(keep)))
      .filter((row) => row.length);
  }, [sets, script]);
  const list = useMemo(() => rows.flat().map(([h, k, r, note]) => ({
    id: (script === "hira" ? "h-" : "k-") + h,       // char-keyed: stable & collision-free
    ch: script === "hira" ? h : k, r, note,
  })), [rows, script]);
  const toggleSet = (key) => setSets((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next.size ? next : new Set(["base"]);      // never leave nothing to drill
  });
  const allOn = KANA_GROUPS.every(([key]) => sets.has(key));

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  // Pick whichever kana needs work MOST (highest score wins). The old version only looked
  // at level + times-seen, so a kana you kept getting wrong was treated the same as one you
  // nailed every time. Now accuracy, a broken streak, and how long it's been all count.
  // Same memory model as the vocabulary deck — see statNeed.
  const needK = (st, now) => statNeed(st, now) + (st.seen ? 0 : Math.random());
  // neediest first, with jitter so repeat sessions aren't an identical loop
  const byNeed = useCallback((pool) => {
    const now = Date.now();
    return pool
      .map((x) => ({ x, k: needK(getS(statsRef.current, x.id), now) + Math.random() * 1.2 }))
      .sort((a, b) => b.k - a.k)
      .map((o) => o.x);
  }, []);

  const startSession = useCallback((subset) => {
    const ordered = byNeed(subset && subset.length ? subset : list);
    const pool = sessionLen === "all" ? ordered : ordered.slice(0, sessionLen);
    if (!pool.length) return;
    setQueue(pool); setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {};
    sessionStartRef.current = Date.now();
    setElapsed(0);
    setRevealed(false); setGuide(false);
    setView("session");
  }, [list, sessionLen, byNeed]);

  const cur = queue[pos] || null;
  const sessionDone = view === "session" && pos >= queue.length && queue.length > 0;

  // start the clock on each new kana, and freeze total elapsed when the session ends
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, view]);
  useEffect(() => {
    if (sessionDone) { setElapsed(Date.now() - sessionStartRef.current); setView("summary"); }
  }, [sessionDone]);

  // weakest kana in the current selection — drives the setup preview and the "drill weakest" button
  const weakest = useMemo(() => {
    const now = Date.now();
    return list
      .filter((x) => (getS(stats, x.id).seen || 0) > 0)
      .map((x) => ({ x, st: getS(stats, x.id), k: needK(getS(stats, x.id), now) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, 6);
  }, [list, stats]);
  const untouched = useMemo(() => list.filter((x) => !(getS(stats, x.id).seen || 0)).length, [list, stats]);

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
  useEffect(() => { if (view === "session") setup(); }, [pos, view, setup]);
  useEffect(() => {                                   // iOS: stop the page panning while drawing
    const cv = canvasRef.current; if (!cv) return;
    const block = (e) => e.preventDefault();
    cv.addEventListener("touchmove", block, { passive: false });
    cv.addEventListener("touchstart", block, { passive: false });
    return () => { cv.removeEventListener("touchmove", block); cv.removeEventListener("touchstart", block); };
  }, [view]);
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
    const think = thinkRef.current;
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (got ? 1 : 0),
      level: got ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: got ? (s0.streak || 0) + 1 : 0, last: Date.now(),
      // same memory model as the vocabulary deck; the old counters stay for the UI
      fsrs: statReview(s0, got, think, Date.now()),
      ms: (s0.ms || 0) + (think || 0), msN: (s0.msN || 0) + (think ? 1 : 0) };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(KANA_KEY, JSON.stringify(nx));

    // session bookkeeping: passed once, and missed ones come back later in the same session
    if (got) {
      if (!missRef.current[cur.id]) setFirstTry((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      setPassed((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      setQueue((prev) => prev.filter((x, idx) => idx <= pos || x.id !== cur.id));   // drop later duplicates
    } else {
      setStruggled((prev) => { const n = new Set(prev); n.add(cur.id); return n; });
      const n = (missRef.current[cur.id] || 0) + 1;
      missRef.current[cur.id] = n;
      if (n <= KANA_REQUEUE_CAP) {
        setQueue((prev) => { const next = prev.slice(); next.splice(Math.min(pos + 1 + KANA_REQUEUE_GAP, next.length), 0, cur); return next; });
      }
    }
    setRevealed(false); setGuide(false);
    setPos((p) => p + 1);
  };
  const avgSecs = (st) => (st.msN ? (st.ms / st.msN / 1000).toFixed(1) + "s" : "—");

  const mastered = list.filter((x) => getS(stats, x.id).level >= 4).length;
  const cellClass = (id) => {
    const st = getS(stats, id);
    if (!st.seen) return " kn-untouched";
    if (st.level >= 4) return " kn-good";
    if (st.correct / st.seen < 0.5 || st.level < 2) return " kn-weak";
    return " kn-mid";
  };

  // ── mid-session: just the progress bar and the pad, no set chips to fiddle with ──
  if (view === "session" && cur) {
    return (
      <div className="tc-kana">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
          <span className="tc-progtext">{passed.size} / {poolSize}</span>
          <button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>
        </div>
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
              ? <button className="tc-btn tc-btn-primary" onClick={() => { thinkRef.current = Date.now() - shownRef.current; setRevealed(true); }}>Check</button>
              : (
                <>
                  <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => record(false)}>Missed ✗</button>
                  <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => record(true)}>Got it ✓</button>
                </>
              )}
          </div>
        </div>
      </div>
    );
  }

  // ── session summary ──
  if (view === "summary") {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missed = list.filter((x) => struggled.has(x.id));
    const graded = passed.size || 1;
    return (
      <div className="tc-kana">
        <div className="tc-done">
          <p className="tc-eyebrow">Session complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">
            {firstTry.size} nailed first try{missed.length > 0 ? ` · ${missed.length} missed` : ""} · {poolSize} kana
          </p>
          <p className="tc-donesub">{fmtSecs(elapsed)} total · {(elapsed / graded / 1000).toFixed(1)}s per kana</p>
          {missed.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {missed.slice(0, 6).map((x) => {
                const st = getS(stats, x.id);
                return (
                  <div key={x.id} className="tc-kanaweakrow">
                    <span className="tc-kanaweakch">{x.ch}</span>
                    <span className="tc-kanaweakr">{x.r}</span>
                    <span className="tc-kanaweakmeta">{st.seen ? Math.round((st.correct / st.seen) * 100) + "%" : "—"} · {avgSecs(st)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tc-donebtns">
            {missed.length > 0 && (
              <button className="tc-btn tc-btn-primary" onClick={() => startSession(missed)}>Review the {missed.length} you missed</button>
            )}
            <button className="tc-btn" onClick={() => startSession()}>Go again</button>
            <button className="tc-btn" onClick={() => setView("setup")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-kana">
      <div className="tc-kanabar">
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (script === "hira" ? " is-on" : "")} onClick={() => setScript("hira")}>ひらがな</button>
          <button className={"tc-fchip" + (script === "kata" ? " is-on" : "")} onClick={() => setScript("kata")}>カタカナ</button>
        </div>
        <div className="tc-kanaseg">
          {KANA_GROUPS.map(([key, label]) => (
            <button key={key} className={"tc-fchip" + (sets.has(key) ? " is-on" : "")}
              aria-pressed={sets.has(key)} onClick={() => toggleSet(key)}
              title={key === "ext" ? "katakana-only loanword sounds" : undefined}>{label}</button>
          ))}
          <button className={"tc-fchip" + (allOn ? " is-on" : "")}
            title={allOn ? "back to base 46 only" : "select every set"}
            onClick={() => setSets(allOn ? new Set(["base"]) : new Set(KANA_GROUPS.map(([k]) => k)))}>
            {allOn ? "only 46" : "all"}
          </button>
        </div>
        <div className="tc-kanaseg">
          <button className={"tc-fchip" + (view === "setup" ? " is-on" : "")} onClick={() => setView("setup")}>Practice</button>
          <button className={"tc-fchip" + (view === "chart" ? " is-on" : "")} onClick={() => setView("chart")}>Chart</button>
        </div>
      </div>
      <p className="tc-kanaprog">
        {mastered}/{list.length} mastered · {script === "hira" ? "hiragana" : "katakana"} · {allOn ? "all sets" : KANA_GROUPS.filter(([k]) => sets.has(k)).map(([, l]) => l).join(" + ")}
        {sets.has("ext") && script !== "kata" ? " · extended = katakana only" : ""}
      </p>

      {!list.length ? (
        // only reachable with extended-only selected in hiragana mode — those sounds have
        // no hiragana spelling, so there's genuinely nothing to draw. Offer a way out.
        <div className="tc-card2 tc-kanadrill">
          <p className="tc-eyebrow">nothing to drill</p>
          <p className="tc-kanaempty">The extended loanword sounds (ファ, ヴィ, ティ…) only exist in katakana.</p>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-primary" onClick={() => setScript("kata")}>Switch to カタカナ</button>
            <button className="tc-btn tc-btn-sm" onClick={() => setSets(new Set(["base"]))}>Back to base 46</button>
          </div>
        </div>
      ) : view === "chart" ? (
        <div className="tc-kanagrid">
          {rows.map((row, ri) => (
            <div key={ri} className="tc-kanarow">
              {row.map(([h, k, r]) => {
                const id = (script === "hira" ? "h-" : "k-") + h;
                const one = list.find((x) => x.id === id);
                return (
                  <button key={id} className={"tc-kanacell" + cellClass(id)}
                    title={`${r} · ${getS(stats, id).seen ? Math.round((getS(stats, id).correct / getS(stats, id).seen) * 100) + "% · " + avgSecs(getS(stats, id)) : "not drilled yet"}`}
                    onClick={() => one && startSession([one])}>
                    <span className="tc-kanach">{script === "hira" ? h : k}</span>
                    <span className="tc-kanar">{r}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="tc-study-setup">
          <div className="tc-hero">
            <div className="tc-heronum">{mastered}</div>
            <p className="tc-herolabel">of {list.length} mastered</p>
            <p className="tc-herosub">{untouched > 0 ? `${untouched} never drilled` : "every kana in this set has been drilled"}</p>
          </div>

          <div className="tc-kanaseg tc-kanalen">
            <span className="tc-kanalenlabel">session</span>
            {KANA_LENGTHS.map((n) => (
              <button key={n} className={"tc-fchip" + (sessionLen === n ? " is-on" : "")} onClick={() => setSessionLen(n)}>
                {n === "all" ? `all ${list.length}` : n}
              </button>
            ))}
          </div>

          <button className="tc-btn tc-btn-primary tc-start" onClick={() => startSession()}>
            Start · {sessionLen === "all" ? list.length : Math.min(sessionLen, list.length)} kana
          </button>
          <p className="tc-smarthint">
            {untouched > 0
              ? `New kana first, then whichever you've been missing most.`
              : `Ordered by what you get wrong, how long you take, and how long since you last saw it.`}
          </p>

          {weakest.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {weakest.map(({ x, st }) => (
                <div key={x.id} className="tc-kanaweakrow">
                  <span className="tc-kanaweakch">{x.ch}</span>
                  <span className="tc-kanaweakr">{x.r}</span>
                  <span className="tc-kanaweakmeta">{Math.round((st.correct / st.seen) * 100)}% · {avgSecs(st)} · seen {st.seen}×</span>
                </div>
              ))}
              <button className="tc-btn tc-btn-sm" onClick={() => startSession(weakest.map((w) => w.x))}>
                Drill these {weakest.length}
              </button>
            </div>
          )}
          <p className="tc-hintline">Tap a cell in Chart to drill just that one kana.</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── BROWSE ───────────────────────────── */
// scriptPrompt lived here; the annotate prompt now lives in cf/src/ai.js (Worker-owned).
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
function prefetchJa(text, rate, voice) {
  // Fire-and-forget: warms the browser's own HTTP cache for this exact URL (TTS responses
  // are served with a long immutable max-age) so that when speakJa() actually plays this
  // same card/line later, it's served instantly from disk — no network round-trip at all.
  // Plain unauthenticated GET on purpose: on a cache hit this is free and instant; on a
  // cache miss it just 401s harmlessly (never forces a real Google TTS generation call).
  if (typeof text !== "string" && typeof text !== "number") return;   // see speakJa
  if (!text) return;
  const url = TTS_ENDPOINT + "?text=" + encodeURIComponent(text) + "&rate=" + (rate || 0.9) + (voice === "m" ? "&voice=m" : "");
  try { fetch(url, { cache: "force-cache" }).catch(() => {}); } catch (e) {}
}
let _ttsAudioEl = null;
let _ttsObjectUrl = null;
let _ttsToken = 0;   // invalidates stale/superseded calls so a slow fallback can't play over a newer request
function speakJa(text, rate, voice) {
  // Anything that isn't a string or number is a caller that forgot to resolve a
  // prop-dependent line into text. encodeURIComponent below stringifies whatever it is
  // given, so a stray function reaches the TTS service as its own source and gets read
  // aloud — which is how the oral exam started reciting JavaScript. Refuse it instead.
  if (typeof text !== "string" && typeof text !== "number") return;
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
// hookPrompt/debriefPrompt lived here; those prompts now live in cf/src/ai.js (Worker-owned).
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
    const nextLine = active.lines && active.lines[idx + 1];   // warm the cache for the next line
    if (nextLine) prefetchJa(lineText(nextLine.tokens), slow ? 0.68 : 0.9);
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

  const annotateRaw = async (rawText) => {   // one call for the whole dialogue — the Worker's annotate task allows 4000 tokens, enough for a 30-line dialogue
    const { result } = await callAI("annotate", { raw: rawText });
    if (!result.lines || !result.lines.length) throw new Error("no lines in reply");
    return result.lines;
  };

  const build = async () => {
    if (!raw.trim()) return;
    setBuilding(true); setError("");
    let lines = null, annotated = false, why = "";
    if (AI_ENABLED) {
      try { lines = await annotateRaw(raw); annotated = true; }
      catch (e) { why = e.message || ""; }   // API failed → build it locally instead
    }
    if (!lines) lines = localBuild(raw);
    if (lines && lines.length) {
      const script = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || `Script ${scripts.length + 1}`, lines, raw, plain: !annotated };
      persist([...scripts, script]);
      setName(""); setRaw(""); setView("list");
      if (!annotated) setSaveWarn(AI_ENABLED
        ? "⚠️ Saved without furigana — annotation failed (" + why + "). Tap ＋ふりがな to retry."
        : "Saved as plain lines — furigana/rōmaji annotation isn't available in this build. You can still rehearse with voice.");
    } else {
      setError("Couldn't read any lines — try one line per speaker, like 「孝：スマホ。」");
    }
    setBuilding(false);
  };

  const reannotate = async (s) => {   // add furigana/romaji/translation to a script that saved without them
    if (!AI_ENABLED || !s.raw || building) return;
    setBuilding(true); setSaveWarn("");
    try {
      const lines = await annotateRaw(s.raw);
      persist(scripts.map((x) => (x.id === s.id ? { ...x, lines, plain: false } : x)));
    } catch (e) {
      setSaveWarn("⚠️ Annotation failed (" + (e.message || "unknown") + ") — the script is safe, just plain.");
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
        <p className="tc-addnote">{AI_ENABLED
          ? "Claude adds furigana, rōmaji, and a translation to each line so you can read and check yourself. Your scripts are saved here for next time."
          : "Lines are saved as plain text and rehearsed with voice — furigana/rōmaji annotation isn't available in this build. Your scripts are saved here for next time."}</p>
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
              {AI_ENABLED && s.plain && s.raw && (
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

// Handwriting is slower than recognising or even typing a word — a correct 12s handwrite
// is roughly as confident as a correct 4.8s flip. Scaling think time before grading keeps
// Write from landing HARD on nearly everything just because forming characters takes time.
const WRITE_LATENCY_SCALE = 2.5;
function Write({ cards, onResult }) {
  /* Order by production need, not raw weakness: cards owed a production review (prodDue)
     first, then recognition-unlocked-but-weak cards, then everything else. Without this
     Write asked for production of words never even recognised, and reused the same
     weakest-first list every visit regardless of what had just been produced.
     `cards` is replaced by a new array on every grade (recordResult maps the deck), so this
     is built once per pass (mount / "Go again") rather than as a useMemo on [cards] — otherwise
     the list would reshuffle under the learner's feet mid-pass. */
  const buildOrder = useCallback(() => {
    const now = Date.now();
    const owed = cards.filter((c) => prodDue(c, now)).sort((a, b) => (a.rfsrs?.due || 0) - (b.rfsrs?.due || 0));
    const unlocked = cards.filter((c) => !prodDue(c, now) && recallUnlocked(c))
      .sort((a, b) => (a.rlevel || 0) - (b.rlevel || 0));
    const rest = cards.filter((c) => !recallUnlocked(c)).sort((a, b) => masteryScore(a) - masteryScore(b));
    return [...owed, ...unlocked, ...rest].slice(0, 20);
  }, [cards]);
  const [order, setOrder] = useState(buildOrder);
  const [pos, setPos] = useState(0);
  const goAgain = () => { setOrder(buildOrder()); setPos(0); };
  /* Writing was feeding the scheduler without ever timing the answer, so every card here
     landed as a middling grade no matter how long it took. Production recall is the
     harder direction and the more valuable signal — it deserves the same fast/slow
     distinction the flip cards get. Timed from the card appearing to the reveal. */
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
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

  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos]);
  const next = (got) => {
    // dir "prod": this is EN->JP production, and must land in rfsrs/rseen/rlevel, not the
    // recognition fsrs/seen/level — those track being able to READ the word, which writing
    // it from its meaning never tested. area "writing" buckets its latency norm together with
    // Study's typed-production answers (both are "produce this word", just different input).
    // Scale think time for the slower handwriting motion.
    if (card) onResult(card.id, got, "prod", thinkRef.current ? thinkRef.current / WRITE_LATENCY_SCALE : undefined, "writing");
    setRevealed(false); setGuide(false); setPos((p) => p + 1);
  };

  if (!order.length) return <div className="tc-empty"><p>Add some words first, then come here to practice writing them by hand.</p></div>;
  if (!card) return (
    <div className="tc-done">
      <p className="tc-eyebrow">Writing set complete ✍️</p>
      <div className="tc-donebtns"><button className="tc-btn tc-btn-primary" onClick={goAgain}>Go again</button></div>
    </div>
  );

  const ghostSize = Math.max(26, Math.min(120, Math.floor(360 / Math.max(1, card.term.length))));

  return (
    <div className="tc-write">
      <p className="tc-eyebrow">Write it from memory · production · {pos + 1}/{order.length}</p>
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
          {!revealed && <button className="tc-btn tc-btn-primary" onClick={() => {
            if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
            setRevealed(true);
          }}>Reveal</button>}
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

// how each save state reads to the user — never leave a failure looking like success
const SYNC_UI = {
  idle:    { dot: "#3ddc84", label: "Synced automatically." },
  saving:  { dot: "#ffd166", label: "Saving…" },
  saved:   { dot: "#3ddc84", label: "All changes saved to your account." },
  pending: { dot: "#ff8a7a", label: "⚠ Not saved yet — your progress is safe on this device and will upload automatically." },
};

function Browse({ cards, onRemove, onClear, onRestore }) {
  const [syncState, setSyncState] = useState(syncStateNow);
  useEffect(() => watchSyncState(setSyncState), []);
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
      a.href = url; a.download = "tangocho-backup-" + localDayKey() + ".json";
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
      const haveKeys = new Set(merged.map(cardMergeKey));
      let addedFromSeed = 0;
      SEED.forEach((s) => {
        const k = cardMergeKey(s);
        if (!haveKeys.has(k)) { merged.push({ id: uid(), seen: 0, correct: 0, ...s }); haveKeys.add(k); addedFromSeed++; }
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
  const [authState, setAuthStateUi] = useState(authStateNow);
  useEffect(() => watchAuthState((s) => { setAuthStateUi(s); setGoogleEmail(_googleEmail); }), []);
  const googleBtnRef = useRef(null);
  useEffect(() => {
    if (!googleEmail) renderGoogleButton(googleBtnRef.current);
    return initGoogleAuth(() => setGoogleEmail(_googleEmail));   // returns unsubscribe — effect cleanup
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
          <>
            <p style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SYNC_UI[syncState].dot, display: "inline-block", boxShadow: "0 0 6px " + SYNC_UI[syncState].dot }} />
              Signed in as <b>{googleEmail}</b>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: SYNC_UI[syncState].dot }}>
              {SYNC_UI[syncState].label}
            </p>
            {syncState === "pending" && (
              <button className="tc-btn tc-btn-sm" style={{ marginTop: 8 }} onClick={() => pushCloudNow()}>Retry now</button>
            )}
            <button className="tc-btn tc-btn-sm" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => { signOutGoogle(); }}>Sign out</button>
          </>
        ) : (
          <>
            {authState === "expired" && (
              <p className="tc-conjnote" style={{ marginTop: 0 }}>
                ⚠ Your sign-in expired — sign in again to keep syncing. Nothing on this device is lost{hasSyncPending() ? ", and unsaved progress will upload as soon as you do" : ""}.
              </p>
            )}
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
// Rules describe how the STEM is formed, not one specific ending — the drill asks for
// all 8 cells now, so a negative-only rule ("drop る, add ない") was wrong on 7 of them.
const CONJ_TYPES = {
  ichidan:   { chip: "① ichidan", rule: "iru/eru verb → drop る, then add the ending (ます・ない・た・なかった)" },
  godan:     { chip: "⑤ godan", rule: "shift the last sound across the あいうえお rows: ～い+ます, ～あ+ない, past is 音便" },
  irregular: { chip: "irregular", rule: "no pattern — する and くる have to be memorised" },
  iadj:      { chip: "い-adj", rule: "drop the final い → ～く for negatives, ～かった for past" },
  na:        { chip: "noun / な-adj", rule: "だ・です, じゃない for negatives, だった・でした for past" },
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

/* ═══════════════════ 入力 / INPUT — comprehensible input finder ═══════════════════
   The job here is volume: remove every second of friction between "I have time" and
   "I am consuming Japanese". Two taps to something at roughly 85-90% comprehension.

   Difficulty is 0-100: 0-15 absolute-beginner CI (slow, gestures, pictures) · 15-30 N5 ·
   30-45 N4 · 45-60 N3 · 60-75 N2 · 75-100 native unmodified.

   Every source below was checked live before being baked in. Casualties, for the record:
   "Bitesize Japanese" turned out to be a channel about 1971 Johnson outboard motors,
   Wasabi and Teppei&Noriko are gone, the 4989 feed 404s, and the naive way of scraping a
   YouTube channel id off its page silently returns the id of a *recommended* channel —
   which is how Onomappu first resolved to a Polish travel vlog. Ids below come from each
   page's own RSS autodiscovery link and were confirmed against the feed's author name. */
const INPUT_KEY = "jpn101:input";
// Same shape as the sync/TTS endpoints so one build runs on either host.
const FEED_ENDPOINT = "/.netlify/functions/feed";

/* ── the indexed video library ──
   ~950 individual videos across 35 channels, built by tools/yt-index.mjs and shipped as a
   separate asset. Each becomes an ordinary catalog entry, so the recommender and the
   rating engine need no special case: a video is just a source that happens to already be
   one specific thing. Cached in localStorage keyed on the index's build time, so a
   refreshed index replaces the old one and an unchanged one costs no network at all.

   Difficulty on these rows is ESTIMATED, not measured — YouTube does not expose subtitle
   text (see tools/yt-index.mjs). Every row carries its own confidence, which feeds the
   same damping the rest of the engine uses, so low-confidence guesses move fast once
   they're rated and high-confidence ones hold their ground. */
const VIDEOS_URL = "/videos.json";
const VIDEOS_CACHE = "jpn101:videoIndex";
let _videoPromise = null;
function loadVideoIndex() {
  if (_videoPromise) return _videoPromise;
  _videoPromise = (async () => {
    let cached = null;
    try { cached = JSON.parse(window.localStorage.getItem(VIDEOS_CACHE) || "null"); } catch (e) {}
    try {
      const r = await fetch(VIDEOS_URL, { cache: "no-cache" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const data = await r.json();
        if (data && data.videos) {
          try { window.localStorage.setItem(VIDEOS_CACHE, JSON.stringify(data)); } catch (e) { /* quota */ }
          return unpackVideos(data);
        }
      }
    } catch (e) { /* offline — the cached copy below is the point */ }
    return cached ? unpackVideos(cached) : [];
  })();
  return _videoPromise;
}
function unpackVideos(data) {
  const chans = data.channels || [];
  return (data.videos || []).map(([id, title, ci, sec, day, d, conf, cc, views]) => {
    const c = chans[ci] || ["", "unknown", "adult", ""];
    return {
      id: "yt:" + id,
      title,
      channel: c[1],
      channelId: c[0],
      url: "https://www.youtube.com/watch?v=" + id,
      medium: "video",
      source: "youtube",
      difficulty: d,
      difficultyConfidence: (conf || 25) / 100,
      durationSec: sec,
      publishedAt: day * 86400000,
      audience: c[2],
      hasSubsJa: !!cc,
      views,
      tags: (c[3] || "").split(" ").filter(Boolean),
      indexed: true,
    };
  });
}
// Which sources the Worker can resolve to individual episodes. Kept in step with FEEDS
// in cf/src/index.js — the ids must match or the source silently falls back to its
// channel link. tools/check-feeds.mjs fails the build if they drift.
const FEED_SOURCES = new Set([
  "ci-natural", "ci-tanaka", "ci-peppa", "ci-shun", "yt-sayuri", "yt-akane", "yt-miku",
  "yt-onomappu", "yt-gamegengo", "yt-yuyu", "pod-yuyu", "yt-sambon", "pod-teppei-beg",
  "rd-nhkeasier", "rd-yomujp", "rd-watanoc", "rd-crunchy",
]);
const INPUT_CATALOG = [
  // ── listening: absolute beginner comprehensible input ──
  { id: "ci-natural", title: "Natural Japanese (NIJ)", titleJa: "コンプリヘンシブル日本語", medium: "video", source: "youtube",
    url: "https://www.youtube.com/c/ComprehensibleJapanese", channelId: "UCXo8kuCtqLjL1EH6m4FJJNA", channel: "Natural Japanese",
    difficulty: 12, difficultyConfidence: 0.7, durationSec: 600, tags: ["ci", "slice-of-life", "story"], hasSubsJa: true, addedBy: "seed",
    note: "Tiered complete-beginner → advanced. The closest thing to purpose-built CI." },
  { id: "ci-tanaka", title: "Learn Japanese with Tanaka san", medium: "video", source: "youtube",
    url: "https://www.youtube.com/channel/UCvryaJCRHcTVjOC_DcuYxGg", channelId: "UCvryaJCRHcTVjOC_DcuYxGg", channel: "Tanaka san",
    difficulty: 15, difficultyConfidence: 0.6, durationSec: 720, tags: ["ci", "slice-of-life"], addedBy: "seed" },
  { id: "ci-peppa", title: "Peppa Pig (Japanese)", titleJa: "ペッパピッグ 公式チャンネル", medium: "video", source: "youtube",
    url: "https://www.youtube.com/channel/UCldXjuJ7Qg8wTNktOnVXkGw", channelId: "UCldXjuJ7Qg8wTNktOnVXkGw", channel: "ペッパピッグ",
    difficulty: 18, difficultyConfidence: 0.6, durationSec: 300, tags: ["kids", "story", "ci"], addedBy: "seed",
    note: "Children's show — short sentences, heavy visual context, endless volume." },
  { id: "ci-shun", title: "Japanese with Shun", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@JapanesewithShun", channelId: "UCu6sZrHyl4hSS2PvlUo2XZA", channel: "Shun",
    difficulty: 22, difficultyConfidence: 0.6, durationSec: 900, tags: ["ci", "vlog", "slice-of-life"], addedBy: "seed" },
  { id: "pod-teppei-beg", title: "Nihongo con Teppei for Beginners", medium: "audio", source: "podcast",
    url: "https://nihongoconteppei.com/", rss: "https://nihongoconteppei.com/feed/", channel: "Teppei",
    difficulty: 25, difficultyConfidence: 0.7, durationSec: 300, tags: ["podcast", "daily", "chat"], addedBy: "seed",
    note: "1,500+ short episodes. Ideal passive listening." },

  // ── listening: upper beginner → intermediate ──
  { id: "yt-sayuri", title: "Sayuri Saying", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@sayurisaying", channelId: "UCqMY-cp1He6IAi1cIz-gX1g", channel: "Sayuri",
    difficulty: 35, difficultyConfidence: 0.5, durationSec: 900, tags: ["chat", "culture"], addedBy: "seed" },
  { id: "yt-akane", title: "Akane's Japanese Class", titleJa: "あかね的日本語教室", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@Akane-JapaneseClass", channelId: "UCh-GhnQ7qDQmS6Bz3pGc1Mw", channel: "あかね",
    difficulty: 35, difficultyConfidence: 0.5, durationSec: 900, tags: ["ci", "vlog"], addedBy: "seed" },
  { id: "yt-miku", title: "Speak Japanese Naturally", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@SpeakJapaneseNaturally", channelId: "UCSbH_BPR_AoARW6RDYLlLog", channel: "Miku",
    difficulty: 40, difficultyConfidence: 0.5, durationSec: 720, tags: ["chat", "slice-of-life"], addedBy: "seed" },
  { id: "yt-onomappu", title: "Onomappu", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@onomappu", channelId: "UCLuymDHiOySsAQ9Nc-4NoEQ", channel: "Onomappu",
    difficulty: 45, difficultyConfidence: 0.5, durationSec: 720, tags: ["culture", "street"], addedBy: "seed" },
  { id: "yt-gamegengo", title: "Game Gengo", titleJa: "ゲーム言語", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@GameGengo", channelId: "UCsXJuG5tSNRr9IwfjMbNvqQ", channel: "Game Gengo",
    difficulty: 45, difficultyConfidence: 0.5, durationSec: 900, tags: ["gaming", "vocab"], addedBy: "seed",
    note: "Japanese through video games." },
  { id: "yt-yuyu", title: "YUYU NIHONGO", medium: "video", source: "youtube",
    url: "https://www.youtube.com/@yuyunihongo", channelId: "UCCyQwSS6m2mVB0-H2FOFJtw", channel: "YUYU",
    difficulty: 50, difficultyConfidence: 0.5, durationSec: 900, tags: ["chat"], addedBy: "seed" },
  { id: "pod-yuyu", title: "YUYUの日本語Podcast", medium: "audio", source: "youtube",
    url: "https://www.youtube.com/channel/UC8dWfySP_cKDMFj6aFfQbFA", channelId: "UC8dWfySP_cKDMFj6aFfQbFA", channel: "YUYU",
    difficulty: 55, difficultyConfidence: 0.5, durationSec: 1500, tags: ["podcast", "chat"], addedBy: "seed" },
  { id: "yt-sambon", title: "三本塾 Sambon Juku", medium: "video", source: "youtube",
    url: "https://www.youtube.com/channel/UC0ujXryUUwILURRKt9Eh7Nw", channelId: "UC0ujXryUUwILURRKt9Eh7Nw", channel: "三本塾",
    difficulty: 65, difficultyConfidence: 0.5, durationSec: 900, tags: ["grammar", "jlpt"], addedBy: "seed" },

  // ── reading ──
  { id: "rd-tadoku", title: "Tadoku free graded readers", titleJa: "にほんごたどく", medium: "reading", source: "web",
    url: "https://tadoku.org/japanese/free-books/", difficulty: 8, difficultyConfidence: 0.8, wordCount: 300,
    tags: ["graded", "story", "pdf"], hasFurigana: true, addedBy: "seed", note: "Levels 0-4, genuinely free PDFs. Start at level 0." },
  { id: "rd-ehonnavi", title: "絵本ナビ (picture books)", titleJa: "絵本ナビ", medium: "reading", source: "web",
    url: "https://www.ehonnavi.net/", difficulty: 14, difficultyConfidence: 0.5, wordCount: 250,
    tags: ["kids", "story", "picture-book"], hasFurigana: true, addedBy: "seed", note: "Same idea as the eHon app, in a browser." },
  { id: "rd-yomujp", title: "Yomujp graded readings", medium: "reading", source: "web",
    url: "https://yomujp.com/", difficulty: 22, difficultyConfidence: 0.7, wordCount: 400,
    tags: ["graded", "jlpt"], hasFurigana: true, addedBy: "seed", note: "Sorted by JLPT level, many with audio." },
  { id: "rd-hukumusume", title: "ふくむすめ童話集", titleJa: "ふくむすめ童話集", medium: "reading", source: "web",
    url: "http://hukumusume.com/douwa/", difficulty: 26, difficultyConfidence: 0.6, wordCount: 500,
    tags: ["folktale", "story", "audio"], hasFurigana: true, addedBy: "seed", note: "Folk tales with furigana and audio. HTTP only." },
  // NHK's own Easy site moved behind a token-gated JSON index and no longer exposes a
  // usable article list, so this points at the long-running mirror, which does publish a
  // feed and carries the same articles with optional furigana.
  { id: "rd-nhkeasier", title: "NHK News Web Easy", titleJa: "やさしい日本語のニュース", medium: "reading", source: "web",
    url: "https://nhkeasier.com/", difficulty: 30, difficultyConfidence: 0.8, wordCount: 350,
    tags: ["news", "daily"], hasFurigana: true, addedBy: "seed", note: "New articles daily — good for a repeatable habit." },
  { id: "rd-todai", title: "Todai Easy Japanese", medium: "reading", source: "web",
    url: "https://easyjapanese.net/", difficulty: 32, difficultyConfidence: 0.5, wordCount: 400,
    tags: ["news", "daily"], hasFurigana: true, addedBy: "seed" },
  { id: "rd-watanoc", title: "Watanoc", medium: "reading", source: "web",
    url: "http://watanoc.com/", difficulty: 34, difficultyConfidence: 0.6, wordCount: 400,
    tags: ["magazine", "culture"], hasFurigana: true, addedBy: "seed", note: "Free N5-N3 web magazine." },
  { id: "rd-crunchy", title: "Crunchy Nihongo reading", medium: "reading", source: "web",
    url: "https://crunchynihongo.com/", difficulty: 36, difficultyConfidence: 0.4, wordCount: 400,
    tags: ["graded", "lesson"], addedBy: "seed" },
  { id: "rd-aozora", title: "青空文庫 Aozora Bunko", titleJa: "青空文庫", medium: "reading", source: "web",
    url: "https://www.aozora.gr.jp/", difficulty: 85, difficultyConfidence: 0.8, wordCount: 3000,
    tags: ["literature", "native"], addedBy: "seed", note: "Public domain classics — park here for much later." },
];

/* Level engine. Ratings move the user's level and the item's difficulty in opposite
   directions, scaled by how much was actually consumed (bailing after 90s is weak
   evidence; 40 minutes is strong), with a decaying learning rate so the level settles
   instead of oscillating. Listening and reading never share updates. */
const INPUT_VERDICTS = {
  too_easy:   { user: +4, item: -3, en: "Too easy",   ja: "簡単すぎ" },
  just_right: { user: +1, item: null, en: "Just right", ja: "ちょうどいい" },
  too_hard:   { user: -2, item: +3, en: "Hard",       ja: "難しい" },
  lost:       { user: -4, item: +6, en: "Lost me",    ja: "わからなかった" },
};
const clamp100 = (n) => Math.max(0, Math.min(100, n));
// weak evidence below ~4 min, full weight by ~20 min
function evidenceWeight(minutes) { return Math.max(0.25, Math.min(1, (minutes || 0) / 20)); }
// early ratings move a lot, later ones barely — keeps the level from oscillating forever
function learningRate(ratingCount) { return 1 / (1 + (ratingCount || 0) / 12); }

function applyRating({ level, ratingCount, itemDifficulty, itemConfidence, verdict, minutes }) {
  const v = INPUT_VERDICTS[verdict];
  if (!v) return { level, itemDifficulty, itemConfidence, ratingCount };
  const w = evidenceWeight(minutes) * learningRate(ratingCount);
  const nextLevel = clamp100(level + v.user * w);
  // item difficulty moves less the more confident we already are about it
  const conf = itemConfidence == null ? 0.3 : itemConfidence;
  const damp = 1 - Math.min(0.9, conf);
  let nextDiff = itemDifficulty;
  if (v.item === null) nextDiff = itemDifficulty + (level - itemDifficulty) * 0.15 * damp;  // pull toward the user
  else nextDiff = itemDifficulty + v.item * damp * evidenceWeight(minutes);
  return {
    level: nextLevel,
    ratingCount: (ratingCount || 0) + 1,
    itemDifficulty: clamp100(nextDiff),
    itemConfidence: Math.min(1, conf + 0.12),
  };
}

// Seed the starting level from the deck rather than asking — the deck already knows.
// Listening lags reading for almost everyone, so it starts lower. Tuned so that a
// JPN 101 student mid-way through volume 1 (~375 solid words) lands on the true
// beginner CI channels as their core band, not on Teppei and Sayuri: guessing too high
// is the expensive mistake here, since the first thing that happens is an hour of not
// understanding anything. Ratings pull it up fast if it's wrong.
function seedLevelsFromDeck(cards) {
  const known = cards.filter((c) => (c.seen || 0) > 0 && (c.correct || 0) / (c.seen || 1) >= 0.6).length;
  return { listening: clamp100(5 + known / 40), reading: clamp100(8 + known / 30), updatedAt: Date.now() };
}

// deterministic shuffle so the same open doesn't reshuffle on every render
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function recommend({ catalog, level, mode, medium, minutes, history, tagScores, seed, allowReplay, preferred }) {
  const now = Date.now();
  const recent = new Set((history || []).filter((h) => now - h.at < 14 * 86400000).map((h) => h.itemId));
  let pool = catalog.filter((it) => {
    if (medium === "reading" && it.medium !== "reading") return false;
    if (medium === "listening" && it.medium === "reading") return false;
    if (!allowReplay && recent.has(it.id)) return false;
    return true;
  });
  if (!pool.length) pool = catalog.filter((it) => (medium === "reading" ? it.medium === "reading" : it.medium !== "reading"));

  const pick = (from) => {
    const band = (lo, hi) => from.filter((it) => it.difficulty >= level + lo && it.difficulty <= level + hi);
    if (mode === "passive") {
      // passive wants length and things already known to sit well
      return from.filter((it) => it.difficulty >= level - 10 && it.difficulty <= level + 4)
        .sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
    }
    const core = band(-3, 6), stretch = band(6, 14), comfort = band(-12, -3);
    return [...seededShuffle(core, seed),
            ...seededShuffle(stretch, seed + 1).slice(0, Math.max(1, Math.round(core.length * 0.3))),
            ...seededShuffle(comfort, seed + 2).slice(0, 1)];
  };

  /* Sources that resolve to a specific episode get first refusal on all three slots.
     A source with no feed can only offer "here's a whole website, go dig" — which is the
     work this tab exists to remove. Doing this as a score bonus AFTER banding was not
     enough: banding had already spent the slots, so the bonus only reordered whatever
     survived. Feedless sources still fill in when the level genuinely has nothing else. */
  // An indexed video always counts as resolvable — it is already one specific thing.
  const canResolve = (it) => it.indexed || (preferred && preferred.has(it.id));
  const feedFirst = preferred ? pool.filter(canResolve) : pool;
  let ranked = pick(feedFirst);
  if (ranked.length < 3) {
    const rest = pick(pool.filter((it) => !feedFirst.includes(it)));
    ranked = [...ranked, ...rest.filter((it) => !ranked.includes(it))];
  }
  if (!ranked.length) ranked = seededShuffle(pool, seed);

  // nudge toward tags that have rated well
  const score = (it) => (it.tags || []).reduce((n, t) => n + ((tagScores || {})[t] || 0), 0);
  ranked = ranked.slice().sort((a, b) => score(b) - score(a));

  // Fit the time available. Indexed rows carry real durations from the YouTube API, so
  // this is now an actual constraint rather than a hint.
  if (minutes) {
    const fits = ranked.filter((it) => !it.durationSec || it.durationSec <= minutes * 60 * 1.25);
    if (fits.length >= 3) ranked = fits;
  }
  return ranked.slice(0, 3);
}

/* Vocab coverage. Deliberately NOT kuromoji: it needs ~15MB of dictionary files fetched
   at runtime, which would break the "works with zero network calls" requirement and the
   single-file build. Longest-match against the actual deck is also a closer match to the
   question being asked — "how many of these words do I already have" — than morphological
   tokenisation would be. */
function coverageAgainstDeck(text, cards) {
  if (!text) return null;
  const terms = new Set();
  // Deck terms are dictionary forms, but real text is inflected — 面白い appears as
  // 面白かったです. Index the stem too so knowing the word counts wherever it shows up.
  // Guarded so short kana words (いい → い) can't start matching stray characters.
  const addStem = (t) => {
    if (/する$/.test(t) && t.length >= 4) terms.add(t.slice(0, -2));
    else if (/[いるうくぐすつぬぶむ]$/.test(t) && t.length >= 3) terms.add(t.slice(0, -1));
  };
  cards.forEach((c) => {
    if (c.term) { terms.add(c.term); addStem(c.term); }
    if (c.reading) { terms.add(c.reading); addStem(c.reading); }
  });
  const maxLen = 12;
  const isJa = (c) => /[぀-ヿ一-龯]/.test(c);
  const isKanji = (c) => /[一-龯]/.test(c);
  const longest = (i) => {
    for (let L = Math.min(maxLen, text.length - i); L >= 1; L--) if (terms.has(text.slice(i, i + L))) return L;
    return 0;
  };

  // Counted in tokens, not characters, and with two rules that keep the number honest:
  //   1. a kana run straight after a word you know is its okurigana/particle/copula
  //      (勉強 + しました), so it doesn't count against you — it isn't separate vocabulary;
  //   2. a kanji word you don't know absorbs its own trailing kana, so 難しかったですが is
  //      one gap rather than two.
  // Without these, ordinary inflection alone drags a sentence he mostly understands down
  // into the 50s, which would push him toward material that's too easy.
  let covered = 0, total = 0, afterMatch = false;
  const unknown = new Map();
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (!isJa(ch)) { i++; continue; }                 // punctuation, latin, digits
    const hit = longest(i);
    if (hit) { covered++; total++; i += hit; afterMatch = true; continue; }

    if (!isKanji(ch)) {                                // unmatched kana run
      let j = i; while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;
      if (j === i) j = i + 1;
      total++;
      if (afterMatch) covered++;                       // inflection of a word you know
      else unknown.set(text.slice(i, j), (unknown.get(text.slice(i, j)) || 0) + 1);
      i = j; afterMatch = false; continue;
    }

    // unmatched kanji: extend while the next char is also kanji and starts no known word
    let j = i + 1;
    while (j < text.length && isKanji(text[j]) && !longest(j)) j++;
    const word = text.slice(i, j);
    while (j < text.length && isJa(text[j]) && !isKanji(text[j]) && !longest(j)) j++;   // absorb okurigana
    unknown.set(word, (unknown.get(word) || 0) + 1);
    total++; i = j; afterMatch = false;
  }
  return {
    pct: total ? Math.round((covered / total) * 100) : null,
    unknown: Array.from(unknown.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => ({ w, n })),
  };
}

/* ───────────────────────────── 入力 / INPUT ─────────────────────────────
   Comprehensible input: the tab answers "what should I watch or read right now"
   and then learns from the answer. Deliberately shows no raw difficulty numbers —
   a number invites arguing with it, dots just say "harder than you / about right". */
/* Every control is labelled in English first with the Japanese underneath. The tab is
   about Japanese, not written in it — a button you can't read is a button you don't press. */
const Bi = ({ en, ja }) => <span className="tc-bi">{en}<small>{ja}</small></span>;
const INPUT_PLANS = [
  { id: "listen",  label: "Listen",     ja: "聞く",   mode: "active",  medium: "listening" },
  { id: "read",    label: "Read",       ja: "読む",   mode: "active",  medium: "reading" },
  { id: "passive", label: "Background", ja: "ながら", mode: "passive", medium: "listening" },
];
const INPUT_TIMES = [5, 15, 30, 60];
const INPUT_BANDS = [["Starter", "入門"], ["Beginner", "初級"], ["Upper beginner", "初中級"],
                     ["Intermediate", "中級"], ["Upper intermediate", "中上級"], ["Advanced", "上級"]];
function band(level) { return INPUT_BANDS[Math.min(INPUT_BANDS.length - 1, Math.floor(level / 17))]; }
function bandName(level) { return band(level)[0]; }
// difficulty shown only relative to where you are — never as a score
function relDots(diff, level) {
  const d = diff - level;
  if (d <= -8) return { n: 1, label: "easy for you", ja: "らく" };
  if (d <= 4) return { n: 2, label: "right where you are", ja: "ちょうどいい" };
  if (d <= 12) return { n: 3, label: "a stretch", ja: "すこし上" };
  return { n: 4, label: "probably too hard", ja: "むずかしい" };
}
const MEDIUM_CHIP = { video: "📺", audio: "🎧", reading: "📖" };
function agoLabel(at) {
  const d = Math.floor((Date.now() - at) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return d + " days ago";
  if (d < 30) return Math.floor(d / 7) + "w ago";
  if (d < 365) return Math.floor(d / 30) + "mo ago";
  return Math.floor(d / 365) + "y ago";
}
function blankInput(cards) {
  return { v: 1, levels: seedLevelsFromDeck(cards), counts: { listening: 0, reading: 0 },
           items: {}, history: [], pending: [], custom: [], tagScores: {}, hidden: [] };
}

function Input({ cards, onAdd, onPark }) {
  const [st, setSt] = useState(null);
  const [plan, setPlan] = useState("listen");
  const [minutes, setMinutes] = useState(15);
  const [seed, setSeed] = useState(1);
  const [picks, setPicks] = useState(null);
  const [panel, setPanel] = useState("");        // "" | log | link | cover
  const [logText, setLogText] = useState("");
  const [logMin, setLogMin] = useState(15);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [coverText, setCoverText] = useState("");
  const [lexicon, setLexicon] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [mineMsg, setMineMsg] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  /* The frequency list doubles as the dictionary. It already ships with the app, so mining
     costs no network call and no API key — the whole feature works offline. */
  useEffect(() => { loadFreqLexicon().then(setLexicon).catch(() => setLexicon(new Map())); }, []);
  const [note, setNote] = useState("");

  useEffect(() => { (async () => {
    let o = null;
    try { const r = await sGet(INPUT_KEY); if (r) o = JSON.parse(r); } catch (e) {}
    if (!o || !o.levels) o = blankInput(cards);
    else if (!(o.counts?.listening || 0) && !(o.counts?.reading || 0)) o.levels = seedLevelsFromDeck(cards);
    o.pending = o.pending || []; o.history = o.history || []; o.custom = o.custom || [];
    o.items = o.items || {}; o.tagScores = o.tagScores || {}; o.hidden = o.hidden || [];
    o.counts = o.counts || { listening: 0, reading: 0 };
    stRef.current = o;
    setSt(o);
  })(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Writes go through the ref, not through `st`. Two taps in the same tick both close
     over the same render's state, so the second silently discards the first — which for a
     pending rating means the thing you just opened never gets rated. Accepts an updater
     so every call site sees the newest state. */
  const stRef = useRef(null);
  const save = useCallback((next) => {
    const value = typeof next === "function" ? next(stRef.current) : next;
    stRef.current = value;
    setSt(value);
    sSet(INPUT_KEY, JSON.stringify(value));
  }, []);
  const flash = (m) => { setNote(m); setTimeout(() => setNote((v) => (v === m ? "" : v)), 2600); };

  const cfg = INPUT_PLANS.find((p) => p.id === plan);
  const [videos, setVideos] = useState([]);
  useEffect(() => { loadVideoIndex().then(setVideos); }, []);

  // catalog with whatever we've learned about each item layered on top of the seed
  const catalog = useMemo(() => {
    if (!st) return [];
    return [...INPUT_CATALOG, ...videos, ...st.custom]
      .filter((it) => !st.hidden.includes(it.id))
      .map((it) => {
        const o = st.items[it.id];
        return o ? { ...it, difficulty: o.difficulty, difficultyConfidence: o.confidence } : it;
      });
  }, [st, videos]);

  const level = st ? st.levels[cfg.medium] : 0;

  /* Resolve each recommended source down to one actual episode or article. A link to a
     channel just hands the searching back to you, which was the whole thing this tab was
     supposed to take off your plate. Feeds come through our own Worker because none of
     these sites send CORS headers. If a feed is down the source still opens as before,
     so a dead feed degrades to the old behaviour rather than an error. */
  const [loading, setLoading] = useState(false);
  const seenUrls = useMemo(() => new Set((st?.history || []).map((h) => h.url).filter(Boolean)), [st]);

  const suggest = useCallback(async () => {
    const sources = recommend({
      catalog, level, mode: cfg.mode, medium: cfg.medium, minutes,
      history: st.history, tagScores: st.tagScores, seed, preferred: FEED_SOURCES,
    });
    // An indexed video already IS one specific thing — there's nothing to look up, so it
    // resolves immediately and never shows the "finding an episode…" state.
    const resolved = (s) => (s.indexed
      ? { source: s, item: { title: s.title, url: s.url, at: s.publishedAt, sec: s.durationSec } }
      : { source: s, item: null });

    setLoading(true);
    setPicks(sources.map(resolved));
    if (sources.every((s) => s.indexed)) { setLoading(false); return; }

    let feeds = {};
    try {
      const ids = sources.map((s) => s.id).filter((id) => FEED_SOURCES.has(id));
      if (ids.length) {
        const r = await fetch(FEED_ENDPOINT + "?src=" + ids.join(",") + "&n=20&dur=1", { cache: "no-store" });
        // Check the type: a cache or proxy serving the app's own HTML under this URL would
        // otherwise throw inside r.json() and look identical to "every feed is down".
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) feeds = (await r.json()).feeds || {};
      }
    } catch (e) { /* offline or feed down — fall through to the source link */ }
    const budget = minutes * 60 * 1.25;      // a little over is fine; double is not
    setPicks(sources.map((s, i) => {
      if (s.indexed) return resolved(s);
      const list = (feeds[s.id] || []).filter((x) => !seenUrls.has(x.url));
      // Prefer episodes whose real length fits the time asked for. Unknown lengths are
      // allowed through rather than discarded — better an unlabelled 12-minute video than
      // nothing — but anything known to blow the budget is dropped.
      // Shorts fit any budget and teach nothing. Length is the reliable test, but it isn't
      // always available (see ytDurations in the Worker), so fall back to the tag creators
      // put in the title themselves.
      const isShort = (x) => /#shorts?/i.test(x.title) || (x.sec && x.sec < 60);
      const fits = list.filter((x) => !isShort(x) && (!x.sec || x.sec <= budget));
      const pool = fits.length ? fits : list;
      // vary by seed so a reroll moves through the feed instead of re-offering episode 1
      const item = pool.length ? pool[(seed * 3 + i * 7) % pool.length] : null;
      return { source: s, item };
    }));
    setLoading(false);
  }, [catalog, level, cfg, minutes, st, seed, seenUrls]);

  const reroll = () => setSeed((s) => s + 7);
  useEffect(() => { setPicks(null); }, [plan, minutes]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (st) suggest();
  }, [seed]);   // eslint-disable-line react-hooks/exhaustive-deps

  // opening something creates a pending rating that survives a reload — the rating is
  // the only thing that teaches the engine, so it must not evaporate when the tab closes
  // The rating still teaches the SOURCE (itemId), because that's what has a difficulty
  // worth learning; the episode title and url ride along so the rating row and the log
  // name the thing you actually watched.
  const open = (pick) => {
    const s = pick.source, ep = pick.item;
    const entry = { itemId: s.id, at: Date.now(), medium: cfg.medium, mode: cfg.mode, minutes,
                    title: ep ? ep.title : s.title, source: s.title, url: ep ? ep.url : s.url };
    save((s0) => ({ ...s0, pending: [entry, ...s0.pending.filter((p) => p.url !== entry.url)].slice(0, 6) }));
    try { window.open(entry.url, "_blank", "noopener,noreferrer"); } catch (e) {}
  };

  const rate = (entry, verdict) => {
    const med = entry.medium;
    const it = catalog.find((x) => x.id === entry.itemId);
    save((s0) => {
      const cur = s0.items[entry.itemId] || { difficulty: it ? it.difficulty : s0.levels[med], confidence: it ? (it.difficultyConfidence || 0.3) : 0.2, ratings: 0 };
      const r = applyRating({
        level: s0.levels[med], ratingCount: s0.counts[med] || 0,
        itemDifficulty: cur.difficulty, itemConfidence: cur.confidence,
        verdict, minutes: entry.minutes,
      });
      const tagScores = { ...s0.tagScores };
      if (it && verdict !== "lost") {
        const bump = verdict === "just_right" ? 1 : verdict === "too_easy" ? 0.2 : -0.3;
        (it.tags || []).forEach((t) => { tagScores[t] = Math.round(((tagScores[t] || 0) + bump) * 10) / 10; });
      }
      return {
        ...s0,
        levels: { ...s0.levels, [med]: r.level, updatedAt: Date.now() },
        counts: { ...s0.counts, [med]: r.ratingCount },
        items: { ...s0.items, [entry.itemId]: { difficulty: r.itemDifficulty, confidence: r.itemConfidence, ratings: (cur.ratings || 0) + 1 } },
        history: [{ ...entry, verdict, ratedAt: Date.now() }, ...s0.history].slice(0, 400),
        pending: s0.pending.filter((p) => !(p.itemId === entry.itemId && p.at === entry.at)),
        tagScores,
      };
    });
  };
  const dismiss = (entry) => save((s0) => ({ ...s0, pending: s0.pending.filter((p) => !(p.itemId === entry.itemId && p.at === entry.at)) }));

  const logOffline = (verdict) => {
    const title = logText.trim();
    if (!title) return;
    const entry = { itemId: "offline:" + title.slice(0, 40), at: Date.now(), medium: cfg.medium,
                    mode: cfg.mode, minutes: logMin, title, offline: true };
    save((s0) => {
      const r = applyRating({ level: s0.levels[cfg.medium], ratingCount: s0.counts[cfg.medium] || 0,
                              itemDifficulty: s0.levels[cfg.medium], itemConfidence: 0, verdict, minutes: logMin });
      return { ...s0,
        levels: { ...s0.levels, [cfg.medium]: r.level, updatedAt: Date.now() },
        counts: { ...s0.counts, [cfg.medium]: r.ratingCount },
        history: [{ ...entry, verdict, ratedAt: Date.now() }, ...s0.history].slice(0, 400),
      };
    });
    setLogText(""); setPanel(""); flash("Logged " + logMin + " min");
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//.test(url)) { flash("Needs to start with http:// or https://"); return; }
    const it = {
      id: "user-" + Math.abs(Array.from(url).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36),
      title: linkTitle.trim() || url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48),
      medium: cfg.medium === "reading" ? "reading" : "video", source: "web", url,
      difficulty: level, difficultyConfidence: 0.15, tags: ["mine"], addedBy: "user", addedAt: Date.now(),
    };
    save((s0) => ({ ...s0, custom: [it, ...s0.custom.filter((c) => c.url !== url)] }));
    setLinkUrl(""); setLinkTitle(""); setPanel(""); setPicks(null);
    flash("Added to your sources");
  };

  const coverage = useMemo(() => (coverText.trim() ? coverageAgainstDeck(coverText, cards) : null), [coverText, cards]);

  /* What is worth keeping out of this text. Runs the app's own coverage scanner sentence by
     sentence, so every candidate arrives with the sentence it appeared in. */
  const mined = useMemo(() => {
    if (!coverText.trim() || !lexicon) return null;
    const known = new Set(cards.map((c) => c.term));
    return mine(coverText, {
      lexicon,
      known,
      unknownOf: (sentence) => coverageAgainstDeck(sentence, cards).unknown.map((u) => u.w),
    });
  }, [coverText, cards, lexicon]);

  /* Named for what it is, because Input already has a "plan" — the study plan. */
  const parkPlan = useMemo(() => displacementPlan(cards, picked.size), [cards, picked.size]);

  const keepPicked = useCallback(() => {
    if (!mined || !picked.size) return;
    const chosen = mined.candidates.filter((c) => picked.has(c.term));
    onAdd(chosen.map((c) => cardFor(c, { label: sourceLabel.trim() })));
    onPark(parkPlan.park);
    setMineMsg(describePlan(chosen.length, parkPlan));
    setPicked(new Set());
  }, [mined, picked, parkPlan, onAdd, onPark, sourceLabel]);

  const week = useMemo(() => {
    if (!st) return { mins: 0, byDay: [], items: [] };
    const cut = Date.now() - 7 * 86400000;
    const rows = st.history.filter((h) => h.at >= cut);
    const byDay = {};
    rows.forEach((h) => { const d = localDayKey(h.at); byDay[d] = (byDay[d] || 0) + (h.minutes || 0); });
    return { mins: rows.reduce((n, h) => n + (h.minutes || 0), 0), rows,
             byDay: Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
  }, [st]);

  const exportWeek = () => {
    const lines = [
      "TANGOCHO — 入力ログ / immersion log",
      localDayKey(Date.now() - 7 * 86400000) + " → " + localDayKey(),
      "",
      `total: ${week.mins} min over ${week.rows.length} session(s)`,
      `listening: ${bandName(st.levels.listening)} · reading: ${bandName(st.levels.reading)}`,
      "",
      ...week.byDay.map(([d, m]) => `  ${d}   ${m} min`),
      "",
      "detail:",
      ...week.rows.map((h) => `  ${localDayKey(h.at)}  ${String(h.minutes).padStart(3)}m  ${h.medium === "reading" ? "読" : "聞"}  ${INPUT_VERDICTS[h.verdict] ? INPUT_VERDICTS[h.verdict].en : "-"}  ${h.title}`),
    ].join("\n");
    try {
      const url = URL.createObjectURL(new Blob([lines], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-input-" + localDayKey() + ".txt";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { navigator.clipboard.writeText(lines); } catch (e) {}
    flash("Downloaded and copied to the clipboard");
  };

  if (!st) return <div className="tc-empty">Loading…</div>;

  return (
    <div className="tc-input">
      {st.pending.length > 0 && (
        <div className="tc-inrate">
          <p className="tc-eyebrow">How was it? · どうだった？</p>
          {st.pending.map((p) => (
            <div key={p.itemId + p.at} className="tc-inrateitem">
              <div className="tc-inraterow1">
                <span className="tc-inratetitle">{p.title}</span>
                <button className="tc-inx" onClick={() => dismiss(p)} aria-label="dismiss">×</button>
              </div>
              <div className="tc-inverdicts">
                {Object.entries(INPUT_VERDICTS).map(([k, v]) => (
                  <button key={k} className="tc-fchip" onClick={() => rate(p, k)}><Bi en={v.en} ja={v.ja} /></button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="tc-inlevels">
        {[["listening", "Listening", "聞く"], ["reading", "Reading", "読む"]].map(([m, en, ja]) => (
          <div key={m} className="tc-inlevel">
            <span className="tc-inlevlabel">{en} <i>{ja}</i></span>
            <div className="tc-inbar"><div className="tc-inbarfill" style={{ width: `${st.levels[m]}%` }} /></div>
            <span className="tc-inband">{band(st.levels[m])[0]} <i>{band(st.levels[m])[1]}</i></span>
          </div>
        ))}
      </div>

      <div className="tc-kanaseg">
        {INPUT_PLANS.map((p) => (
          <button key={p.id} className={"tc-fchip" + (plan === p.id ? " is-on" : "")} onClick={() => setPlan(p.id)}><Bi en={p.label} ja={p.ja} /></button>
        ))}
      </div>
      <div className="tc-kanaseg tc-kanalen">
        <span className="tc-kanalenlabel">Time</span>
        {INPUT_TIMES.map((n) => (
          <button key={n} className={"tc-fchip" + (minutes === n ? " is-on" : "")} onClick={() => setMinutes(n)}>{n === 60 ? "60+" : n} min</button>
        ))}
      </div>

      {!picks ? (
        <button className="tc-btn tc-btn-primary tc-start" onClick={suggest}>
          {cfg.mode === "passive" ? "Find something to have on" : "Show me 3 things"} · {minutes} min
        </button>
      ) : (
        <>
          <div className="tc-inpicks">
            {picks.length === 0 && <p className="tc-smarthint">Nothing left at this level that you haven't opened in the last two weeks. Reroll or add a link of your own.</p>}
            {picks.map(({ source: it, item }, idx) => {
              const d = relDots(it.difficulty, level);
              const mins = it.durationSec ? Math.round(it.durationSec / 60) : null;
              return (
                <div key={it.id} className="tc-card2 tc-inpick">
                  <div className="tc-inpicktop">
                    <span className="tc-kindchip">{MEDIUM_CHIP[it.medium] || "📖"}</span>
                    <span className="tc-indots" title={d.label}>
                      {[1, 2, 3, 4].map((i) => <i key={i} className={"tc-indot" + (i <= d.n ? " is-on" : "")} />)}
                    </span>
                    <span className="tc-indotlabel">{d.label}</span>
                  </div>
                  {item ? (
                    <>
                      <p className="tc-inpicktitle">{item.title}</p>
                      <p className="tc-inpickmeta">
                        {/* for an indexed video the source IS the item, so name the
                            channel here instead of repeating the title back */}
                        {it.indexed ? it.channel : it.title}
                        {item.at ? " · " + agoLabel(item.at) : ""}
                        {/* only claim a length when it's this episode's, not the channel's average */}
                        {item.sec ? ` · ${Math.max(1, Math.round(item.sec / 60))} min` : ""}
                        {it.hasFurigana ? " · furigana" : ""}
                        {it.hasSubsJa ? " · JP subtitles" : ""}
                      </p>
                    </>
                  ) : loading && FEED_SOURCES.has(it.id) ? (
                    <p className="tc-inpicktitle tc-inloading">finding {it.medium === "reading" ? "an article" : "an episode"}…</p>
                  ) : (
                    <>
                      <p className="tc-inpicktitle">{it.title}{it.titleJa && it.titleJa !== it.title ? <i className="tc-inpickja">{it.titleJa}</i> : null}</p>
                      <p className="tc-inpickmeta">
                        {it.channel || it.source}
                        {mins ? ` · ~${mins} min` : ""}
                        {it.hasFurigana ? " · furigana" : ""}
                        {it.hasSubsJa ? " · JP subtitles" : ""}
                      </p>
                      {it.note && <p className="tc-inpicknote">{it.note}</p>}
                    </>
                  )}
                  <div className="tc-rehnav">
                    <button className="tc-btn tc-btn-sm tc-btn-primary" disabled={loading && !item}
                      onClick={() => open(picks[idx])}>{item ? "Play this" : "Open"}</button>
                    <button className="tc-btn tc-btn-sm" onClick={() => save((s0) => ({ ...s0, hidden: [...s0.hidden, it.id] }))}>Not for me</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tc-rehnav">
            <button className="tc-btn tc-btn-sm" onClick={reroll}>Show me others</button>
            <button className="tc-btn tc-btn-sm" onClick={() => setPicks(null)}>Back</button>
          </div>
        </>
      )}

      <p className="tc-smarthint">
        {week.mins > 0
          ? `This week · ${week.mins} min of input over ${week.rows.length} session${week.rows.length === 1 ? "" : "s"}.`
          : "Nothing logged this week yet. Even 10 minutes of something you mostly understand beats 60 minutes of something you don't."}
      </p>

      <div className="tc-kanaseg tc-intools">
        {[["log", "Log", "記録"], ["link", "Add link", "リンク追加"], ["cover", "Coverage", "カバー率"]].map(([k, en, ja]) => (
          <button key={k} className={"tc-fchip" + (panel === k ? " is-on" : "")} onClick={() => setPanel(panel === k ? "" : k)}><Bi en={en} ja={ja} /></button>
        ))}
        <button className="tc-fchip" onClick={exportWeek} disabled={!week.rows.length}><Bi en="Export" ja="書き出し" /></button>
      </div>
      {note && <p className="tc-innote">{note}</p>}

      {panel === "log" && (
        <div className="tc-card2 tc-inpanel">
          <p className="tc-eyebrow">input you did somewhere else</p>
          <input className="tc-sentinput" value={logText} onChange={(e) => setLogText(e.target.value)}
            placeholder="anime, a podcast, a conversation…" />
          <div className="tc-kanaseg">
            {INPUT_TIMES.map((n) => (
              <button key={n} className={"tc-fchip" + (logMin === n ? " is-on" : "")} onClick={() => setLogMin(n)}>{n} min</button>
            ))}
          </div>
          <div className="tc-inverdicts">
            {Object.entries(INPUT_VERDICTS).map(([k, v]) => (
              <button key={k} className="tc-fchip" disabled={!logText.trim()} onClick={() => logOffline(k)}><Bi en={v.en} ja={v.ja} /></button>
            ))}
          </div>
        </div>
      )}

      {panel === "link" && (
        <div className="tc-card2 tc-inpanel">
          <p className="tc-eyebrow">add a source of your own</p>
          <input className="tc-sentinput" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
          <input className="tc-sentinput" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="what is it? (optional)" />
          <p className="tc-smarthint">It starts at your current level and moves as you rate it, same as everything else.</p>
          <div className="tc-rehnav"><button className="tc-btn tc-btn-sm tc-btn-primary" onClick={addLink}>Add</button></div>
        </div>
      )}

      {panel === "cover" && (
        <div className="tc-card2 tc-inpanel">
          <p className="tc-eyebrow">paste Japanese — how much of it do you already have?</p>
          <textarea className="tc-sentinput tc-inarea" value={coverText} onChange={(e) => setCoverText(e.target.value)}
            placeholder="Paste a paragraph, a subtitle line, an article…" />
          {coverage && (
            <>
              <div className="tc-bignum">{coverage.pct}<span>%</span></div>
              <p className="tc-donesub">of the words in that text are already in your deck</p>
              {coverage.unknown.length > 0 && (
                <>
                  <p className="tc-eyebrow">not in your deck</p>
                  <p className="tc-incover">{coverage.unknown.map((u) => u.w).join("　")}</p>
                </>
              )}
              {/* One definition of "is this worth reading", shared with anything else that
                  needs to ask. The thresholds are a stated position rather than a
                  measurement, and they live in comprehensible.mjs where they can be argued
                  with. */}
              <p className="tc-smarthint">{describeBand(coverage.pct)}</p>

              {/* Keeping what you read. Words arrive with the sentence they appeared in,
                  which is the difference between learning 持ってくる as a gloss and learning
                  it as something someone actually said. */}
              {mined && mined.candidates.length > 0 && (
                <div className="tc-mine">
                  <p className="tc-eyebrow">keep the words you did not have</p>
                  <p className="tc-smarthint" style={{ marginTop: 0 }}>
                    Each one arrives with the sentence you met it in, so it can be practised in
                    context instead of as a dictionary entry.
                  </p>
                  <input className="tc-sentinput" value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    placeholder="where is this from? (optional)" />
                  <div className="tc-minelist">
                    {mined.candidates.slice(0, 20).map((c) => (
                      <label key={c.term} className={"tc-minerow" + (picked.has(c.term) ? " is-on" : "")}>
                        <input type="checkbox" checked={picked.has(c.term)}
                          onChange={() => setPicked((prev) => {
                            const n = new Set(prev);
                            if (n.has(c.term)) n.delete(c.term); else n.add(c.term);
                            return n;
                          })} />
                        <span className="tc-mineterm">{c.term}</span>
                        <span className="tc-mineread">{c.reading !== c.term ? c.reading : ""}</span>
                        <span className="tc-minemean">{c.meaning}</span>
                        <span className="tc-minecount">{c.count > 1 ? "×" + c.count : ""}</span>
                        <span className="tc-minesent">{c.sentence}</span>
                      </label>
                    ))}
                  </div>
                  <p className="tc-smarthint">{describePlan(picked.size, parkPlan)}</p>
                  <div className="tc-rehnav">
                    <button className="tc-btn tc-btn-sm tc-btn-primary" disabled={!picked.size} onClick={keepPicked}>
                      Keep {picked.size || ""} {picked.size === 1 ? "word" : "words"}
                    </button>
                    <button className="tc-btn tc-btn-sm" onClick={() => setPicked(new Set(mined.candidates.slice(0, 10).map((c) => c.term)))}>
                      Select top 10
                    </button>
                  </div>
                  {mineMsg ? <p className="tc-smarthint">{mineMsg}</p> : null}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── ORAL EXAM ─────────────────────────────
   A mock of the 6-7 minute oral final: three situations, an examiner who speaks, and
   props you answer from.

   The props are regenerated every run — date, weekday, room, copy count, price, budget,
   headcount, and which of you orders the pizza. The study guide states outright that the
   flier, receipt and budget may be different on the day, so drilling one fixed set would
   train recall of specific answers instead of the ability to read a prop and answer from
   it. Randomising is the whole point of the exercise.

   Each question is spoken aloud rather than only written, because the exam is spoken and
   parsing a question by ear is half the difficulty. You answer out loud, then reveal the
   model answer, which is generated from the props actually on screen. */
const ORAL_KEY = "jpn101:oral";

function OralProp({ kind, props }) {
  if (kind === "flyer") {
    return (
      <div className="tc-prop tc-flyer">
        <p className="tc-propttl">Party Time for J-kaiwa!</p>
        <p className="tc-propbig">{props.flyer.dateEn}</p>
        <p className="tc-propbig">{props.flyer.timeEn}</p>
        <p className="tc-propline">{props.flyer.room.en}</p>
        <p className="tc-propsmall">Enjoy the night with pizza, drinks and refreshments!</p>
      </div>
    );
  }
  if (kind === "receipt") {
    return (
      <>
        <div className="tc-prop tc-receipt">
          <p className="tc-propttl">レシート · Cougar Print</p>
          <p className="tc-propline">Color print × {props.receipt.copies}</p>
          <p className="tc-propbig">${props.receipt.price}</p>
        </div>
        <div className="tc-prop tc-budget">
          <p className="tc-propttl">Budget · J-kaiwa party</p>
          <p className="tc-propline">Total: ${props.budget.total}</p>
          <p className="tc-propline">People expected: {props.budget.people}</p>
          <p className="tc-propline">Pizza from: {props.budget.place}</p>
          <p className="tc-propline">
            Ordering pizza: <b>{props.budget.youOrderPizza ? "YOU" : "TA"}</b>
            {"  ·  "}Drinks: <b>{props.budget.youOrderPizza ? "TA" : "YOU"}</b>
          </p>
        </div>
      </>
    );
  }
  return null;
}

/* ── Culture Talk rehearsal ──
   A prepared presentation needs the opposite of the interview drill: the goal is to stop
   needing the script at all. Three stages take it away a piece at a time —

     read     full Japanese, romaji and English
     romaji   the Japanese is gone; the sound is still there to lean on
     cue      three words on a card and nothing else

   The line is spoken at every stage, because the midterm note was about pitch accent and
   that cannot be learned from a romaji spelling. Section-opening lines are marked: if the
   talk falls apart mid-way, jumping to the next 〜ばんめ puts it back on rails. */
function Talk() {
  const [stage, setStage] = useState("read");   // read | romaji | cue
  const [i, setI] = useState(0);
  const [done, setDone] = useState(() => new Set());
  const L = TALK.lines[i];
  const card = L && L.sec ? TALK.cards[L.sec - 1] : null;
  const sectionCard = useMemo(() => {
    let c = null;
    for (let x = 0; x <= i; x++) if (TALK.lines[x].sec) c = TALK.cards[TALK.lines[x].sec - 1];
    return c;
  }, [i]);
  const pitchFor = (line) => TALK.pitch.filter((w) => line.ja.includes(w.w));

  const say = () => { try { speakJa(L.ja, 0.95); } catch (e) {} };
  useEffect(() => { if (L) say(); }, [i, stage]);   // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (ok) => {
    if (ok) setDone((d) => { const x = new Set(d); x.add(L.n); return x; });
    if (i + 1 < TALK.lines.length) setI(i + 1);
  };

  return (
    <div className="tc-oral">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: ((i + 1) / TALK.lines.length) * 100 + "%" }} /></div>
        <span className="tc-progtext">{i + 1} / {TALK.lines.length}</span>
      </div>

      <div className="tc-kanaseg">
        {[["read", "Read it"], ["romaji", "Rōmaji only"], ["cue", "Cue card only"]].map(([k, label]) => (
          <button key={k} className={"tc-fchip" + (stage === k ? " is-on" : "")} onClick={() => setStage(k)}>{label}</button>
        ))}
      </div>

      <div className="tc-card2 tc-oralcard">
        <p className="tc-oralwho">{L.tag}{L.sec ? " · section reset" : ""}</p>

        {stage === "read" && <p className="tc-talkja">{L.ja}</p>}
        {stage !== "cue" && <p className="tc-talkrom">{L.rom}</p>}
        {stage === "cue" && (
          sectionCard ? (
            <div className="tc-talkcue">
              <p className="tc-talkcuename">{sectionCard.name}</p>
              {sectionCard.words.map((w) => <span key={w} className="tc-talkcueword">{w}</span>)}
            </div>
          ) : <p className="tc-oralcue">No cue card — this line opens or closes the talk.</p>
        )}

        <div className="tc-rehnav">
          <button className="tc-btn tc-btn-sm" onClick={say}>🔊 Hear it</button>
          {stage !== "read" && <button className="tc-btn tc-btn-sm" onClick={() => setStage("read")}>Show the line</button>}
        </div>

        {stage === "read" && <p className="tc-oralen">{L.en}</p>}
        {L.g && <p className="tc-oralg">{L.g}</p>}
        {L.note && <p className="tc-talknote">{L.note}</p>}
        {pitchFor(L).map((w) => (
          <p key={w.w} className="tc-talkpitch">
            <b>{w.w}</b> — say <b>{w.say}</b>, not {w.bad}
          </p>
        ))}

        <div className="tc-rehnav">
          <button className="tc-btn tc-btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => advance(false)}>Fumbled</button>
          <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => advance(true)}>Said it ✓</button>
        </div>
      </div>

      <p className="tc-smarthint">
        {done.size} of {TALK.lines.length} lines said cleanly.
        {" "}Section resets are lines 4, 8 and 11 — if you blank, jump to the next 〜ばんめ.
      </p>
    </div>
  );
}

/* The tab holds two different things: a mock interview, and a prepared talk. They need
   different practice, so they get different screens rather than one compromised one. */
function OralHome() {
  const [which, setWhich] = useState("interview");
  return (
    <div className="tc-oral">
      <div className="tc-kanaseg">
        <button className={"tc-fchip" + (which === "interview" ? " is-on" : "")} onClick={() => setWhich("interview")}>Oral final</button>
        <button className={"tc-fchip" + (which === "talk" ? " is-on" : "")} onClick={() => setWhich("talk")}>Culture talk</button>
      </div>
      {which === "interview" ? <Oral /> : <Talk />}
    </div>
  );
}

function Oral() {
  const [props_, setProps] = useState(() => makeProps());
  const [sit, setSit] = useState(0);
  const [qi, setQi] = useState(0);
  const [shown, setShown] = useState(false);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [running, setRunning] = useState(false);
  const shownRef = useRef(0);
  const thinkRef = useRef(null);

  useEffect(() => { (async () => {
    try { const r = await sGet(ORAL_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [qi, sit, running]);

  const S = SITUATIONS[sit];
  const q = S.questions[qi];
  const key = S.id + ":" + qi;
  const st = statsRef.current[key] || { seen: 0, correct: 0, level: 0, streak: 0 };

  // Speak the examiner's line the moment it appears — the exam is heard, not read.
  // q.r is a function wherever the line quotes a randomised prop (a date, a name), exactly
  // like q.q and q.a, so it has to be called with the props on screen. Passing the function
  // straight to speakJa read its own source code aloud from the second prompt onwards.
  // The INITIATE turns are silent by design — nobody prompts you — so they are skipped here
  // rather than relying on those entries happening to have no r.
  useEffect(() => {
    if (!running || !q || q.initiate) return;
    const line = typeof q.r === "function" ? q.r(props_) : q.r;
    if (line) { try { speakJa(line, 0.95); } catch (e) {} }
  }, [running, sit, qi, props_]);   // eslint-disable-line react-hooks/exhaustive-deps

  const record = (ok) => {
    const think = thinkRef.current;
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, think, Date.now()),
    };
    const nx = { ...statsRef.current, [key]: ns };
    statsRef.current = nx; setStats(nx); sSet(ORAL_KEY, JSON.stringify(nx));
    logDay({ ok, ms: think || 0, deck: "oral" });
    setShown(false);
    if (qi + 1 < S.questions.length) setQi(qi + 1);
    else if (sit + 1 < SITUATIONS.length) { setSit(sit + 1); setQi(0); }
    else setRunning(false);
  };

  const total = SITUATIONS.reduce((a, x) => a + x.questions.length, 0);
  const answered = Object.keys(stats).length;
  const solid = Object.values(stats).filter((x) => (x.level || 0) >= 4).length;

  if (!running) {
    return (
      <div className="tc-oral">
        <div className="tc-kanjihero">
          <img className="tc-mascot" src={MASCOT_GIFS[solid > 0 ? "proud" : "waiting"]} width={64} height={60} alt="" draggable="false" />
          <div className="tc-kanjiheroright">
            <p className="tc-kanjicount"><b>{solid}</b> <span>/ {total} prompts solid</span></p>
            <div className="tc-kanjibar"><div className="tc-kanjibarfill" style={{ width: `${(solid / total) * 100}%` }} /></div>
            <p className="tc-kanjisub">{answered} of {total} attempted · 6–7 minute interview</p>
          </div>
        </div>
        {SITUATIONS.map((x, i) => (
          <button key={x.id} className="tc-btn tc-start tc-oralsit" onClick={() => { setSit(i); setQi(0); setShown(false); setProps(makeProps()); setRunning(true); }}>
            <b>{x.title}</b>
            <i>{x.mins} · {x.questions.length} prompts</i>
          </button>
        ))}
        <button className="tc-btn tc-btn-primary tc-start" onClick={() => { setSit(0); setQi(0); setShown(false); setProps(makeProps()); setRunning(true); }}>
          Full mock interview · all {total} prompts
        </button>
        <p className="tc-smarthint">
          The date, time, copy count, price and pizza order change every run, exactly as the
          study guide warns they may on the day. Answer out loud before revealing anything.
        </p>
        {/* What the marks are actually for. The three sections are only the excuse to use
            these, so they sit on the way in rather than buried in a menu. */}
        <details className="tc-oralcheck">
          <summary>What they are marking · quick checklist</summary>
          <dl className="tc-oralchecklist">
            {CHECKLIST.map((c) => (
              <div key={c.k}><dt>{c.k}</dt><dd>{c.v}</dd></div>
            ))}
          </dl>
        </details>
      </div>
    );
  }

  return (
    <div className="tc-oral">
      <div className="tc-progress">
        <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${((qi + 1) / S.questions.length) * 100}%` }} /></div>
        <span className="tc-progtext">{qi + 1} / {S.questions.length}</span>
        <button className="tc-fchip" onClick={() => setRunning(false)}>Quit</button>
      </div>
      <p className="tc-eyebrow">{S.title}</p>

      {S.prop !== "none" && <OralProp kind={S.prop} props={props_} />}

      {/* Two turns in the rundown are marked INITIATE: nobody prompts you, you have to
          open your mouth first. Those are the ones that get failed, so they do not get an
          examiner line to react to — just the instruction and silence. */}
      <div className={"tc-card2 tc-oralcard" + (q.initiate ? " tc-oralinit" : "")}>
        {q.initiate ? (
          <>
            <p className="tc-oralwho tc-oralwhoyou">▶ you start · nobody asks you this</p>
            <p className="tc-oralq tc-oralqinit">{q.en.replace(/^NOW YOU START — /, "")}</p>
          </>
        ) : (
          <>
            <p className="tc-oralwho">examiner{q.star ? " · watch this one" : ""}</p>
            <p className="tc-oralq">
              {typeof q.q === "function" ? q.q(props_) : q.q}{" "}
              <SpeakBtn text={typeof q.r === "function" ? q.r(props_) : q.r} />
            </p>
          </>
        )}
        {!shown ? (
          <>
            <p className="tc-oralcue">
              {q.initiate ? "Say it out loud from scratch, then check." : "Say your answer out loud, then check."}
            </p>
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-primary" onClick={() => {
                if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
                setShown(true);
              }}>Check my answer</button>
            </div>
          </>
        ) : (
          <>
            {!q.initiate && <p className="tc-oralen">{q.en}</p>}
            <p className="tc-orala">{q.a(props_)} <SpeakBtn text={q.a(props_)} /></p>
            <p className="tc-oralg">{q.g}</p>
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-primary tc-btn-bad" onClick={() => record(false)}>Struggled</button>
              <button className="tc-btn tc-btn-primary tc-btn-good" onClick={() => record(true)}>Said it ✓</button>
            </div>
          </>
        )}
      </div>
      <p className="tc-smarthint">{S.intro}</p>
    </div>
  );
}

/* ───────────────────────────── KANJI ─────────────────────────────
   The 2,140 jōyō kanji, ordered by newspaper frequency rather than school grade.
   Grade order is how Japanese children learn them, spread over six years and organised
   around what a seven-year-old can discuss. Frequency order is what an adult learner
   wants: 日 is rank 1, and the first 500 by frequency cover far more real text than the
   first 500 by grade.

   Data: KANJIDIC2 (EDRDG), CC BY-SA 4.0, via kanjiapi.dev. JLPT levels: Jonathan Waller.

   Scheduling reuses statReview/statNeed, so kanji sit on the same FSRS memory model as
   everything else rather than getting a fourth hand-rolled scorer. */
/* ── Dates, times and counters ──
   The part of the course that is pure recall with no way to reason it out mid-sentence:
   四月 is しがつ and never よんがつ, 二十日 is はつか and never にじゅうにち, 一分 is
   いっぷん. There is nothing to understand, only to know, and reading it off a chart is a
   completely different skill from producing it under exam pressure.

   So the tab has three stages rather than one drill: a chart to read, learn cards for
   anything not yet met, and then drilling that is typed rather than multiple choice
   wherever an item is solid enough — picking ようか out of four options can be done by
   elimination, typing it cannot. Sequence questions ("Thursday, April 8 at 7:00 PM") come
   last because they are the shape the midterm asks for and they only work once the pieces
   are individually known.

   Every fact is its own scheduled item, so missing 二十日 drills 二十日 and does not drag
   十五日 back with it. */
const DATES_KEY = "jpn101:dates";

const DATE_GROUPS = [
  { id: "weekday", label: "Days of the week", hint: "七曜", match: (i) => i.kind === "weekday" },
  { id: "month", label: "Months", hint: "月", match: (i) => i.kind === "month" },
  { id: "day", label: "Days of the month", hint: "日", match: (i) => i.kind === "day" },
  { id: "time", label: "Hours & minutes", hint: "時・分", match: (i) => i.id.startsWith("ctr:ji:") || i.id.startsWith("ctr:fun:") },
  { id: "counter", label: "Counters", hint: "助数詞", match: (i) => i.kind === "counter" && !i.id.startsWith("ctr:ji:") && !i.id.startsWith("ctr:fun:") },
];

const DATE_ITEMS = buildDateItems();
const dateGroupOf = (i) => (DATE_GROUPS.find((g) => g.match(i)) || DATE_GROUPS[4]).id;

const pickN = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
const randOf = (a) => a[Math.floor(Math.random() * a.length)];

/* Distractors come from the same group, so a 〜日 question is answered against other 〜日
   readings. Anything else makes the question answerable by shape alone. */
function dateDistractors(item, n) {
  const g = dateGroupOf(item);
  const sameCounter = item.id.startsWith("ctr:") ? item.id.split(":")[1] : null;
  const pool = DATE_ITEMS.filter((x) => {
    if (x.id === item.id || x.reading === item.reading) return false;
    if (sameCounter) return x.id.startsWith("ctr:" + sameCounter + ":");
    return dateGroupOf(x) === g;
  });
  const near = pool.filter((x) => Math.abs(num(x.id) - num(item.id)) <= 6);
  const chosen = pickN(near.length >= n ? near : pool, n);
  return chosen.length >= n ? chosen : pickN(pool, n);
}
const num = (id) => Number(id.split(":").pop()) || 0;

/* A full exam-shaped prompt, assembled from pieces he has already met. */
function makeSequence() {
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const dow = Math.floor(Math.random() * 7);
  const hour = 1 + Math.floor(Math.random() * 23);
  const minute = randOf([0, 0, 15, 30, 30, 45, 10, 20]);
  return sequenceForm(month, day, dow, hour, minute);
}

function Dates() {
  const [stats, setStats] = useState({});
  const [view, setView] = useState("home");
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState(null);
  const [judged, setJudged] = useState(null);     // {ok, want} once an answer is committed
  const [lastAnswer, setLastAnswer] = useState(""); // what he actually gave, shown back on a miss
  const judgedAtRef = useRef(0);                  // guards Enter auto-repeat from skipping the answer
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const [chart, setChart] = useState(null);       // which group's reference chart is open
  const statsRef = useRef({});
  const shownRef = useRef(Date.now());
  const thinkRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let live = true;
    sGet(DATES_KEY).then((raw) => {
      if (!live) return;
      let v = {};
      try { v = JSON.parse(raw || "{}") || {}; } catch (e) {}
      statsRef.current = v; setStats(v);
    });
    return () => { live = false; };
  }, []);

  const getS = useCallback((id) => statsRef.current[id] || {}, []);

  const save = (item, ok, ms) => {
    const st = getS(item.id);
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, ms, Date.now()),
      ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
    };
    const nx = { ...statsRef.current, [item.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(DATES_KEY, JSON.stringify(nx));
    logDay({ ok, ms: ms || 0, deck: "dates" });
  };

  const speak = useCallback((text) => {
    try { speakJa(String(text), 0.95); } catch (e) {}
  }, []);

  const solid = useCallback((id) => ((stats[id] || {}).level || 0) >= 4, [stats]);
  const met = useCallback((id) => ((stats[id] || {}).seen || 0) > 0, [stats]);

  const groupProgress = useMemo(() => DATE_GROUPS.map((g) => {
    const items = DATE_ITEMS.filter(g.match);
    return {
      ...g, items,
      solid: items.filter((i) => solid(i.id)).length,
      met: items.filter((i) => met(i.id)).length,
    };
  }), [solid, met]);

  const overall = useMemo(() => {
    const done = DATE_ITEMS.filter((i) => solid(i.id)).length;
    return { done, total: DATE_ITEMS.length, pct: Math.round((done / DATE_ITEMS.length) * 100) };
  }, [solid]);

  const dueNow = useMemo(() => {
    const now = Date.now();
    return DATE_ITEMS.filter((i) => {
      const f = (stats[i.id] || {}).fsrs;
      return f && f.due && f.due <= now;
    }).length;
  }, [stats]);

  /* A question's form follows how well the item is known: meet it, then recognise it, then
     produce it. Typing is the goal state — it is the only one that proves recall rather
     than recognition. */
  const formFor = (item) => {
    const st = getS(item.id);
    if (!(st.seen > 0)) return "learn";
    if ((st.level || 0) >= 3) return "type";
    if ((st.level || 0) >= 1) return Math.random() < 0.5 ? "type" : "mc";
    return "mc";
  };

  const startSession = useCallback((groupId) => {
    const now = Date.now();
    const pool = groupId ? DATE_ITEMS.filter((i) => dateGroupOf(i) === groupId) : DATE_ITEMS;
    /* Review and new material are picked separately.

       Scoring everything together does not work here: on a fresh install all 210 items tie
       at the same need, the trap bonus then sorts every one of the ~70 traps ahead of every
       regular, and the first sessions are nothing but ついたち…ここのか and 四月・七月・九月
       with 五月 nowhere in sight. Traps are what cost marks, but they are irregularities in
       a pattern, and the pattern has to exist first.

       So: due items come back by need, with traps bumped among them, and new items are
       introduced in chart order — 日曜日 through 土曜日, 一月 through 十二月, the 1st through
       the 31st. That is the order the material is learnable in. */
    const isSeen = (i) => ((statsRef.current[i.id] || {}).seen || 0) > 0;
    /* Difficulty is graded, not a flag. Every irregular used to get the same +0.6, so a
       drill of the days of the month spent as much of itself on 十七日 — regular once you
       know 七 is しち there — as on 二十日, which cannot be derived from anything. Items
       carry their own weight now; anything without one keeps the old flat bonus. */
    const review = pool.filter(isSeen)
      .map((i) => ({ i, need: statNeed(statsRef.current[i.id], now) + (i.weight ?? (i.trap ? 0.6 : 0)) }))
      .sort((a, b) => b.need - a.need)
      .slice(0, 8).map((x) => x.i);
    const fresh = pool.filter((i) => !isSeen(i)).slice(0, Math.max(4, 12 - review.length));
    const chosen = [...review, ...fresh].slice(0, 12);
    const steps = [];
    for (const item of chosen) {
      const form = formFor(item);
      if (form === "learn") steps.push({ kind: "learn", item }, { kind: "mc", item });
      else steps.push({ kind: form, item });
    }
    // Interleave rather than run each item's steps back to back.
    const waves = [];
    let depth = 0;
    while (steps.some((s) => s.wave === undefined)) {
      for (const item of chosen) {
        const next = steps.find((s) => s.item.id === item.id && s.wave === undefined);
        if (next) { next.wave = depth; waves.push(next); }
      }
      depth++;
    }
    /* Sequences last: they assemble the pieces, so they are only fair once the pieces have
       been seen this session. Skipped entirely for a single-group drill, where there is
       nothing to assemble. */
    if (!groupId) for (let i = 0; i < 3; i++) waves.push({ kind: "seq", seq: makeSequence() });

    setQueue(waves);
    setPos(0); setHits(0); setTotal(0);
    setTyped(""); setPicked(null); setJudged(null);
    shownRef.current = Date.now(); thinkRef.current = null;
    setView("session");
  }, []);

  const step = queue[pos] || null;
  const item = step ? step.item : null;

  /* Options for a multiple-choice step, stable for the life of the step. */
  const choices = useMemo(() => {
    if (!step || step.kind !== "mc" || !item) return [];
    return [item, ...dateDistractors(item, 3)].sort(() => Math.random() - 0.5);
  }, [step, item]);

  useEffect(() => {
    shownRef.current = Date.now(); thinkRef.current = null;
    setTyped(""); setPicked(null); setJudged(null); setLastAnswer("");
    if (step && (step.kind === "type" || step.kind === "seq")) {
      setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 30);
    }
    if (step && step.kind === "learn" && step.item) setTimeout(() => speak(step.item.reading), 250);
    /* Keyed on position only. Requeueing a missed item replaces the queue array, and
       keying this on the queue made the effect re-run and clear "judged" the instant an
       answer was marked wrong — so a wrong answer showed no feedback at all and simply
       asked itself again, forever. */
  }, [pos, speak]);

  useEffect(() => {
    if (view === "session" && queue.length && pos >= queue.length) setView("summary");
  }, [pos, queue.length, view]);

  const advance = () => setPos((x) => x + 1);

  /* Enter continues from the correction, but only as a fresh press. The input is disabled
     once an answer is judged, which drops focus, so this has to listen on the window
     rather than on the field. `e.repeat` filters auto-repeat from a held key and the time
     guard covers a fast double tap — between them, Enter cannot carry through from
     submitting the answer to dismissing the correction before it has been read. */
  useEffect(() => {
    if (!judged) return;
    const onKey = (e) => {
      if (e.key !== "Enter") return;
      if (e.repeat || Date.now() - judgedAtRef.current < 600) return;
      e.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [judged]);

  const commit = (ok, want) => {
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    setJudged({ ok, want });
    judgedAtRef.current = Date.now();
    setTotal((t) => t + 1);
    if (ok) setHits((h) => h + 1);
    if (item) save(item, ok, thinkRef.current);
    speak(want);
    if (!ok && item) {
      /* A miss comes back later in the same session, as multiple choice so the correct
         form is seen again before it is asked for cold. */
      setQueue((q) => {
        const nq = q.slice();
        nq.splice(Math.min(nq.length, pos + 4), 0, { kind: "mc", item });
        return nq;
      });
    }
  };

  const answerMC = (opt) => {
    if (judged || !item) return;
    setPicked(opt);
    setLastAnswer(opt.reading);
    commit(opt.id === item.id, item.reading);
  };

  const submitTyped = () => {
    if (judged) return;
    const kana = toKana(typed);
    if (!kana) return;
    setLastAnswer(kana);
    if (step.kind === "seq") {
      const ok = acceptedReadings(step.seq.reading).some((r) => kanaEqual(kana, r));
      if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
      setJudged({ ok, want: step.seq.reading });
      judgedAtRef.current = Date.now();
      setTotal((t) => t + 1);
      if (ok) setHits((h) => h + 1);
      /* A sequence is scored against its three components, so getting it wrong schedules
         the pieces rather than a composite that will never be asked again. */
      for (const part of ["date", "weekday", "time"]) {
        const piece = step.seq.parts[part];
        const sub = DATE_ITEMS.find((x) => x.reading === piece.reading);
        if (sub) save(sub, ok, thinkRef.current);
      }
      logDay({ ok, ms: thinkRef.current || 0, deck: "dates" });
      speak(step.seq.reading);
      return;
    }
    const strictSeven = item.kind === "month" || item.kind === "day";
    const ok = acceptedReadings(item.reading, { strictSeven }).some((r) => kanaEqual(kana, r));
    commit(ok, item.reading);
  };

  /* ── reference chart ── */
  if (chart) {
    const g = groupProgress.find((x) => x.id === chart);
    return (
      <div className="tc-dates">
        <div className="tc-dhead">
          <button className="tc-fchip" onClick={() => setChart(null)}>← Back</button>
          <h2 className="tc-dtitle">{g.label}</h2>
        </div>
        <p className="tc-smarthint">Tap any row to hear it. Red rows are the ones that break the pattern.</p>
        <div className="tc-dchart">
          {g.items.map((i) => (
            <button key={i.id} className={"tc-drow" + (i.trap ? " is-trap" : "") + (solid(i.id) ? " is-solid" : "")}
              onClick={() => speak(i.reading)}>
              <span className="tc-drowk">{i.kanji}</span>
              <span className="tc-drowr">{i.reading}</span>
              <span className="tc-drowe">{i.en}</span>
            </button>
          ))}
        </div>
        <button className="tc-btn tc-btn-primary tc-dwide" onClick={() => { setChart(null); startSession(g.id); }}>
          Drill {g.label.toLowerCase()}
        </button>
      </div>
    );
  }

  /* ── session ── */
  if (view === "session" && step) {
    const pct = queue.length ? (pos / queue.length) * 100 : 0;
    const isSeq = step.kind === "seq";
    const kana = toKana(typed);
    return (
      <div className="tc-dates">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: pct + "%" }} /></div>
          <span className="tc-progtext">{pos} / {queue.length}</span>
          <button className="tc-fchip" onClick={() => setView("home")}>Quit</button>
        </div>

        {step.kind === "learn" ? (
          <div className="tc-dcard">
            <p className="tc-eyebrow">new</p>
            <div className="tc-dbig">{item.kanji}</div>
            <div className="tc-dread">{item.reading}</div>
            <div className="tc-den">{item.en}</div>
            <button className="tc-btn tc-btn-sm" onClick={() => speak(item.reading)}>🔊 Hear it</button>
            {item.trap && <p className="tc-dnote">⚠ {item.note || "This one breaks the pattern — learn it as its own word."}</p>}
            <button className="tc-btn tc-btn-primary tc-dwide" onClick={advance}>Got it</button>
          </div>
        ) : (
          <div className="tc-dq">
            <p className="tc-kprompt">
              {isSeq ? "Write this out in Japanese"
                : step.kind === "type" ? "Type the reading"
                : "Which reading is this?"}
            </p>
            <div className="tc-dstem">
              {isSeq ? <span className="tc-dseqen">{step.seq.en}</span> : (
                <>
                  <span className="tc-dbig">{item.kanji}</span>
                  <span className="tc-den">{item.en}</span>
                </>
              )}
            </div>

            {step.kind === "mc" ? (
              <div className="tc-kopts">
                {choices.map((o) => {
                  const state = !judged ? ""
                    : o.id === item.id ? " is-right"
                    : picked && o.id === picked.id ? " is-wrong" : " is-dim";
                  return (
                    <button key={o.id} className={"tc-kopt" + state} disabled={!!judged}
                      onClick={() => answerMC(o)}>{o.reading}</button>
                  );
                })}
              </div>
            ) : (
              <div className="tc-dtype">
                <input ref={inputRef} className="tc-dinput" value={typed} disabled={!!judged}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    /* Enter submits, and only advances once the answer has been on screen
                       long enough to read. Without the gap a held key or a double tap of
                       Enter answers and skips straight past the correction. */
                    if (!judged) { submitTyped(); return; }
                    if (Date.now() - judgedAtRef.current > 600) advance();
                  }}
                  placeholder="type in romaji — shigatsu youka"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                <div className="tc-dkana">{kana || "　"}</div>
                {!judged && (
                  <button className="tc-btn tc-btn-primary tc-dwide" onClick={submitTyped} disabled={!kana}>
                    Check
                  </button>
                )}
              </div>
            )}

            {/* Pinned to the bottom of the viewport rather than placed after the options.
                In the flow it sat at y=698–825 on a 375x812 phone, so the correct answer
                and the Continue button were both below the fold: answering appeared to do
                nothing at all. It is also the one thing on screen that has to be read, so
                it gets the fixed spot and the question scrolls behind it.

                No autoFocus here. Enter submits the typed answer, and focusing a button
                under the cursor's own keystroke means one auto-repeat — or the very normal
                habit of pressing Enter twice — activates Continue and skips the answer. */}
            {judged && (
              <div className={"tc-dfeedwrap" + (judged.ok ? " is-ok" : "")}>
                <div className="tc-dfeed">
                  <div className="tc-dfeedhead">
                    <span className="tc-dfeedmark">{judged.ok ? "✓" : "✗"}</span>
                    <span className="tc-dfeedverdict">{judged.ok ? "Correct" : "Not quite"}</span>
                  </div>
                  {!judged.ok && lastAnswer && (
                    <p className="tc-dfeedyours">you wrote <b>{lastAnswer}</b></p>
                  )}
                  <p className="tc-dfeedans">
                    <b>{isSeq ? step.seq.kanji : item.kanji}</b>
                    <span className="tc-dfeedread">{judged.want}</span>
                  </p>
                  {isSeq && <p className="tc-dfeedsub">{step.seq.en}</p>}
                  {!isSeq && item.note && <p className="tc-dfeedsub">{item.note}</p>}
                  <button className="tc-btn tc-btn-primary tc-dwide" onClick={advance}>Continue</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── summary ── */
  if (view === "summary") {
    const pct = total ? Math.round((hits / total) * 100) : 0;
    return (
      <div className="tc-dates">
        <div className="tc-done">
          <p className="tc-eyebrow">Drill complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{hits} right of {total}</p>
          <div className="tc-donebtns">
            <button className="tc-btn tc-btn-primary" onClick={() => startSession(null)}>Another round</button>
            <button className="tc-btn" onClick={() => setView("home")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── home ── */
  return (
    <div className="tc-dates">
      <div className="tc-dhero">
        <p className="tc-eyebrow">dates · times · counters</p>
        <div className="tc-bignum">{overall.done}<span>/{overall.total}</span></div>
        <p className="tc-donesub">{overall.pct}% solid{dueNow > 0 ? ` · ${dueNow} due for review` : ""}</p>
      </div>

      <button className="tc-btn tc-btn-primary tc-dwide" onClick={() => startSession(null)}>
        Start mixed drill
      </button>
      <p className="tc-smarthint">
        Mixed drills end with full exam-shaped prompts — “Thursday, April 8 at 7:00 PM” —
        written out from scratch. Everything is typed in romaji and converted as you go, so
        no Japanese keyboard is needed.
      </p>

      <div className="tc-dgroups">
        {groupProgress.map((g) => (
          <div key={g.id} className="tc-dgroup">
            <div className="tc-dgroupinfo">
              <b>{g.label}</b>
              <span className="tc-dgrouphint">{g.hint} · {g.solid}/{g.items.length} solid</span>
              <div className="tc-dbar"><div className="tc-dbarfill" style={{ width: (g.solid / g.items.length) * 100 + "%" }} /></div>
            </div>
            <div className="tc-dgroupbtns">
              <button className="tc-btn tc-btn-sm" onClick={() => setChart(g.id)}>Chart</button>
              <button className="tc-btn tc-btn-sm" onClick={() => startSession(g.id)}>Drill</button>
            </div>
          </div>
        ))}
      </div>

      <p className="tc-smarthint">
        Every reading is stored and scheduled on its own, so missing 二十日 brings back
        二十日 and not the whole list. Traps — the readings that break the pattern — are
        drilled sooner than the regular ones.
      </p>
    </div>
  );
}

const KANJI_KEY = "jpn101:kanji";

const KANJI_URL = "/kanji.json";
/* The shipped frequency list, read once and turned into a term -> reading/meaning lookup.
   This is what lets a mined word arrive with a reading and a gloss without a dictionary
   API, and it is what keeps the whole feature free. */
let _lexicon = null;
async function loadFreqLexicon() {
  if (_lexicon) return _lexicon;
  const r = await fetch("freq.json");
  const d = await r.json();
  _lexicon = makeLexicon((d && d.words) || []);
  return _lexicon;
}

const KANJI_CACHE = "jpn101:kanjiData";
const KANJI_BATCH = 12;              // how many new characters unlock at a time

let _kanjiPromise = null;
function loadKanji() {
  if (_kanjiPromise) return _kanjiPromise;
  _kanjiPromise = (async () => {
    let cached = null;
    try { cached = JSON.parse(window.localStorage.getItem(KANJI_CACHE) || "null"); } catch (e) {}
    try {
      const r = await fetch(KANJI_URL, { cache: "no-cache" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const d = await r.json();
        if (d && d.kanji) {
          try { window.localStorage.setItem(KANJI_CACHE, JSON.stringify(d)); } catch (e) {}
          return d;
        }
      }
    } catch (e) { /* offline — the cached copy is the point */ }
    return cached;
  })();
  return _kanjiPromise;
}


/* ── objective exercises ──
   The flip card ends in "did you know it?", answered AFTER seeing the answer. That is
   hindsight bias with a button, and it hands the scheduler a grade you invented. These
   exercises have a right answer the app checks, so correctness and latency are both
   measured rather than self-reported.

   Distractors are the whole game. Three random kanji make a question you can pass while
   knowing nothing; three plausible ones force a real discrimination. Candidates come from
   a nearby frequency band (characters you might plausibly confuse) and are ranked by
   closeness in stroke count, which stands in for visual similarity. */
/* On-readings look like katakana because that IS the convention: 音読み are the
   Chinese-derived readings and dictionaries write them in katakana so you can tell them
   from 訓読み, the native Japanese readings, written in hiragana. Nothing here is a
   loanword. Unlabelled it just looks like the app is drilling katakana at random, so every
   reading is shown with its marker.

   A standalone kun reading (人 → ひと) is what a beginner meets first, so it wins when the
   character has one — 218 of the first 500 do. Where the kun reading is a verb stem the
   dictionary writes it with a dot, い.きる meaning the kanji is い and きる is okurigana;
   truncating that to い leaves a single kana that collides with every other stem, so those
   fall through to the on-reading and are only rendered as い(きる) when there is no other
   choice. */
/* KANJIDIC writes okurigana with a dot and affix position with a hyphen: おお.きい means
   the kanji reads おお and きい is the trailing kana; -おお.いに attaches to something
   before it. That notation is unreadable unless you already know it, so the okurigana is
   parenthesised and the affix hyphens dropped. */
function readingText(r) {
  const [stem, oku] = r.replace(/^-|-$/g, "").split(".");
  return oku ? stem + "(" + oku + ")" : stem;
}
const readingList = (arr) => arr.map(readingText).join("・");

function readingLabel(k) {
  const plain = (k.kun || []).find((r) => !/[.-]/.test(r));
  if (plain) return { mark: "訓", text: plain };
  if (k.on && k.on.length) return { mark: "音", text: k.on[0] };
  const dotted = (k.kun || [])[0];
  if (dotted) return { mark: "訓", text: readingText(dotted) };
  return { mark: "", text: "" };
}

function kanjiDistractors(all, target, n, field) {
  const idx = all.indexOf(target);
  const band = all.slice(Math.max(0, idx - 90), Math.min(all.length, idx + 90))
    .filter((k) => k !== target && (field === "reading" ? (k.on.length || k.kun.length) : k.m.length));
  // Must match what the option actually renders, or two tiles can show the same kun
  // reading while deduping on different on-readings.
  const val = (k) => (field === "reading" ? readingLabel(k).text : k.m[0]);
  /* Rejecting only exact duplicates is not enough. 中 (inside) drew a distractor whose
     gloss was "in" — a different string, the same answer, and a question with no correct
     option. Anything that overlaps ANY of the target meanings, in either direction, is out. */
  const norm = (t) => t.toLowerCase().replace(/[^a-z ]/g, "").trim();
  // A gloss like "10**16" normalises to the empty string, and every candidate contains
  // the empty string — ten kanji were rejecting their entire distractor pool this way.
  const targetWords = target.m.map(norm).filter(Boolean);
  /* Only meaningful for English glosses. Applying it to readings normalised every
     katakana option to an empty string and rejected the entire distractor pool, leaving
     reading questions with exactly one option to choose from. */
  const clashes = (v) => {
    if (field !== "meaning") return false;
    const n = norm(v);
    if (!n) return true;
    return targetWords.some((t) => t === n || t.includes(n) || n.includes(t));
  };
  // Seeded with the target's own value: 回 drew a distractor that also reads カイ, which
  // renders as two identical tiles and no way to be right.
  const seen = new Set([val(target)]);
  const pool = [];
  for (const k of band) {
    const v = val(k);
    if (!v || seen.has(v) || clashes(v)) continue;
    seen.add(v);
    pool.push(k);
  }
  // Carrying every sense of the target into the clash test is stricter than carrying three,
  // and for a character with many glosses it can starve the local band. Widen rather than
  // ship a question with two options.
  if (pool.length < n) {
    for (const k of all) {
      if (pool.length >= n * 2) break;
      if (k === target || pool.includes(k)) continue;
      const v = val(k);
      if (!v || seen.has(v) || clashes(v)) continue;
      seen.add(v);
      pool.push(k);
    }
  }
  pool.sort((a, b) => Math.abs(a.s - target.s) - Math.abs(b.s - target.s));
  return pool.slice(0, Math.max(n * 3, 9)).sort(() => Math.random() - 0.5).slice(0, n);
}

/* Which exercise a character gets, by how well it is already known. Recognition before
   production, the same order the vocabulary deck uses: a character you cannot yet pick out
   of four is not ready to be produced from its meaning alone. */
/* A lesson, not a pile of cards.
   The previous version asked each character exactly one question and moved on, so a
   session was: show three, quiz three, repeat. Duolingo's lessons work because every item
   is hit several times from different angles inside one sitting — recognise it, hear it,
   pick it out of a line-up, produce it — and because a fast matching round breaks up the
   rhythm before attention drifts.

   Each new character gets four touches; a character already known gets two. A matching
   round of five drops in every eight or so questions, drawn from what the session has
   already covered, so it is revision rather than a cold quiz. */
/* Cloze is the format worth having above the others: kanji never appear alone in real
   Japanese, they appear inside words. Blanking the character out of a word already in the
   deck drills the character and revises the vocabulary in the same question. It is only
   offered where the deck actually supplies a word — inventing one would defeat the point. */
function buildLesson(pool, statsOf, hasWord) {
  const items = [];
  for (const k of pool) {
    const st = statsOf(k.c);
    const w = hasWord ? hasWord(k.c) : false;
    const seq = (st.seen || 0) === 0
        ? (w ? ["learn", "meaning", "cloze", "audio"] : ["learn", "meaning", "audio", "reading"])
      : (st.level || 0) <= 2
        ? (w ? ["cloze", "meaning", "build"] : ["meaning", "audio", "build"])
        : (w ? ["cloze", "reading"] : ["reading", "build"]);
    seq.forEach((mode, i) => items.push({ k, mode, wave: i }));
  }
  // Interleave by wave: every character's first touch, then every second touch, and so on.
  // Blocking a character's four questions together would let you answer from short-term
  // memory, which is the opposite of what spacing inside a session is for.
  items.sort((a, b) => a.wave - b.wave || Math.random() - 0.5);

  // slot in matching rounds over characters already introduced
  const out = [];
  let sinceMatch = 0;
  for (const it of items) {
    out.push(it);
    sinceMatch++;
    const seenSoFar = [...new Set(out.filter((x) => x.wave >= 1).map((x) => x.k))];
    if (sinceMatch >= 8 && seenSoFar.length >= 5) {
      out.push({ mode: "match", pool: seenSoFar.slice(-5) });
      sinceMatch = 0;
    }
  }
  return out;
}

function kanjiExercise(st) {
  const lvl = st.level || 0;
  if ((st.seen || 0) === 0) return "learn";           // first meeting: show everything
  if (lvl <= 1) return "meaning";                     // kanji -> meaning
  if (lvl <= 2) return "reading";                     // kanji -> reading
  return Math.random() < 0.5 ? "build" : "reading";   // meaning -> kanji, from tiles
}

/* Which kanji actually appear in the deck, and in which words.
   Frequency order is right for a general learner and wrong for this one: 412 jōyō kanji
   appear across these 835 cards, but their median position in the frequency list is 436
   and the tail runs past 2000. Learning 国 and 年 before 学 (20 of the deck's words), 語
   (17) and 何 (16) means weeks of practice that never touches the coursework.
   So: characters carried by the deck come first, the ones inside already-studied words
   ahead of the rest, and general frequency breaks ties and orders everything after. */
function deckKanjiIndex(cards) {
  const map = new Map();
  for (const c of cards || []) {
    const studied = (c.seen || 0) > 0;
    for (const ch of c.term || "") {
      if (!/[一-龯]/.test(ch)) continue;
      let e = map.get(ch);
      if (!e) { e = { words: [], n: 0, studied: false }; map.set(ch, e); }
      // n counts every word; words[] keeps only a few to show. Ranking must use n — using
      // the capped list gave 日 (42 of the deck's words) the same boost as one in six.
      e.n++;
      if (e.words.length < 6) e.words.push(c);
      if (studied) e.studied = true;
    }
  }
  return map;
}

function Kanji({ cards }) {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [view, setView] = useState("home");     // home | session | summary
  const [queue, setQueue] = useState([]);       // array of steps
  const [pos, setPos] = useState(0);
  const [choices, setChoices] = useState([]);
  const [picked, setPicked] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [pairs, setPairs] = useState({ sel: null, side: null, done: {} });
  /* Sometimes you are somewhere you cannot play sound. Rather than forcing a skip or a
     guess, the hear-it question converts to the same character asked visually, and no
     further audio questions appear for the rest of the lesson. */
  const [noAudio, setNoAudio] = useState(false);
  const [inspect, setInspect] = useState(null);   // character opened from the collection grid
  const [cloze, setCloze] = useState(null);      // the deck word a cloze question blanks
  const [right, setRight] = useState([]);
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const missRef = useRef({});
  const shownRef = useRef(0);
  const thinkRef = useRef(null);

  useEffect(() => { loadKanji().then(setData); }, []);
  useEffect(() => { (async () => {
    try { const r = await sGet(KANJI_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (err) {}
  })(); }, []);

  const getS = useCallback(
    (c) => statsRef.current[c] || { seen: 0, correct: 0, level: 0, streak: 0 }, []);
  const deckMap = useMemo(() => deckKanjiIndex(cards), [cards]);

  const all = useMemo(() => kanjiOrdered(data ? data.kanji : [], deckMap), [data, deckMap]);

  /* Everything is already persisted per character in jpn101:kanji — seen, correct, level,
     think time and the full FSRS memory state — and that key syncs to the cloud with the
     rest of the app. This only surfaces it: data you cannot see is data you cannot trust. */
  const reviewInfo = useMemo(() => {
    const vals = Object.values(stats);
    const now = Date.now();
    let reps = 0, dueNow = 0, soonest = Infinity;
    for (const v of vals) {
      reps += v.seen || 0;
      const f = v.fsrs;
      if (!f || !f.due) continue;
      if (f.due <= now) dueNow++;
      else soonest = Math.min(soonest, f.due);
    }
    let nextDue = null;
    if (isFinite(soonest)) {
      const d = Math.round((soonest - now) / 86400000);
      nextDue = d <= 0 ? "today" : d === 1 ? "tomorrow" : "in " + d + " days";
    }
    return { tracked: vals.length, reps, dueNow, nextDue };
  }, [stats]);

  // every character actually met, in the order the lesson introduced them
  const collected = useMemo(
    () => all.filter((k) => ((stats[k.c] || {}).seen || 0) > 0), [all, stats]);

  const mastered = useMemo(() => all.filter((k) => ((stats[k.c] || {}).level || 0) >= 4).length, [all, stats]);
  const started = useMemo(() => all.filter((k) => ((stats[k.c] || {}).seen || 0) > 0).length, [all, stats]);
  const unlocked = useMemo(() => kanjiUnlocked(all, stats), [all, stats]);

  /* Speak the character. A kanji alone has no single pronunciation, so this says a word
     from the deck that contains it when there is one — 学生 rather than a bare reading. */
  const speak = useCallback((k) => {
    if (!k) return;
    const w = (deckMap.get(k.c) || {}).words;
    const say = w && w.length ? (w[0].reading || w[0].term) : (k.kun[0] || k.on[0] || k.c);
    try { speakJa(String(say).replace(/[-.]/g, ""), 0.95); } catch (err) {}
  }, [deckMap]);

  const startSession = useCallback(() => {
    if (!unlocked.length) return;
    const now = Date.now();
    const chosen = unlocked
      .map((k) => ({ k, s: statNeed(getS(k.c), now) + Math.random() * 0.4 }))
      .sort((a, b) => b.s - a.s).map((x) => x.k).slice(0, 6);
    const lesson = buildLesson(chosen, getS, (c) => !!(deckMap.get(c) || {}).words);
    setQueue(lesson); setPos(0); setHits(0); setTotal(0);
    missRef.current = {}; setView("session");
  }, [unlocked, getS, deckMap]);

  const step = queue[pos] || null;
  const cur = step && step.k ? step.k : null;
  // what the step actually renders as, once "can't listen" is taken into account
  // NB step.mode, not mode: a blanket rename caught this line and made the initialiser
  // reference the variable it was defining, which crashed the whole tab.
  const mode = step ? (step.mode === "audio" && noAudio ? "meaning" : step.mode) : null;

  // lay out whatever the current step needs
  useEffect(() => {
    if (view !== "session" || !step) return;
    shownRef.current = Date.now(); thinkRef.current = null;
    setPicked(null); setFlipped(false); setPairs({ sel: null, side: null, done: {} });
    if (mode === "match") {
      setChoices([]);
      setRight(step.pool.slice().sort(() => Math.random() - 0.5));
      return;
    }
    setRight([]);
    if (mode === "learn") { setChoices([]); if (!noAudio) speak(step.k); return; }
    if (mode === "cloze") {
      // shortest word wins: fewer unknown characters around the blank means the question
      // is about the target and not about everything else in the compound
      const words = ((deckMap.get(step.k.c) || {}).words || [])
        .slice().sort((a, b) => (a.term || "").length - (b.term || "").length);
      setCloze(words[0] || null);
      const wrong = kanjiDistractors(all, step.k, 3, "meaning");
      setChoices([step.k, ...wrong].sort(() => Math.random() - 0.5));
      return;
    }
    if (mode === "audio" && !noAudio) speak(step.k);
    const field = mode === "reading" ? "reading" : "meaning";
    const wrong = kanjiDistractors(all, step.k, 3, field);
    setChoices([step.k, ...wrong].sort(() => Math.random() - 0.5));
  }, [pos, view]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === "session" && queue.length && pos >= queue.length) setView("summary");
  }, [pos, queue.length, view]);

  const save = (k, ok, ms) => {
    const st = getS(k.c);
    const ns = {
      ...st, seen: (st.seen || 0) + 1, correct: (st.correct || 0) + (ok ? 1 : 0),
      level: ok ? Math.min(5, (st.level || 0) + 1) : Math.max(0, (st.level || 0) - 2),
      streak: ok ? (st.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(st, ok, ms, Date.now()),
      ms: (st.ms || 0) + (ms || 0), msN: (st.msN || 0) + (ms ? 1 : 0),
    };
    const nx = { ...statsRef.current, [k.c]: ns };
    statsRef.current = nx; setStats(nx); sSet(KANJI_KEY, JSON.stringify(nx));
    logDay({ ok, ms: ms || 0, deck: "kanji" });
  };

  const advance = () => setPos((x) => x + 1);

  const answer = (k) => {
    if (picked || !cur) return;
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    setPicked(k);
    const ok = k.c === cur.c;
    save(cur, ok, thinkRef.current);
    setTotal((t) => t + 1);
    if (ok) setHits((h) => h + 1);
    else {
      /* A missed character comes back later in the same lesson as the same kind of
         question. Requeued as a proper step — inserting a bare kanji here is what broke
         the previous version's queue. */
      const m = (missRef.current[cur.c] || 0) + 1;
      missRef.current[cur.c] = m;
      if (m <= 2) setQueue((q) => {
        const n = q.slice();
        n.splice(Math.min(pos + 4, n.length), 0, { k: cur, mode, wave: 9 });
        return n;
      });
    }
    // no auto-advance — the reveal below is the teaching, and it is read at the user's pace
  };

  const learnDone = () => {
    if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current;
    save(cur, true, thinkRef.current);
    advance();
  };

  const tapPair = (k, side) => {
    if (pairs.done[k.c]) return;
    // Either column may go first. The first tap arms a side; the second resolves against
    // it. Tapping the same side again just moves the selection.
    if (!pairs.sel || pairs.side === side) {
      setPairs((s2) => ({ ...s2, sel: k.c, side }));
      return;
    }
    const ok = pairs.sel === k.c;
    if (ok) {
      const done = { ...pairs.done, [k.c]: true };
      setPairs({ sel: null, side: null, done });
      setHits((h) => h + 1); setTotal((t) => t + 1);
      save(k, true, 0);
      if (Object.keys(done).length >= step.pool.length) setTimeout(advance, 500);
    } else {
      setTotal((t) => t + 1);
      save(k, false, 0);
      setPairs((s2) => ({ ...s2, sel: null, side: null }));
    }
  };

  if (!data) return <div className="tc-empty">Loading kanji…</div>;

  /* ── session ── */
  if (view === "session" && step) {
    const pct = queue.length ? (pos / queue.length) * 100 : 0;
    return (
      <div className="tc-kanji">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: pct + "%" }} /></div>
          <span className="tc-progtext">{pos} / {queue.length}</span>
          <button className="tc-fchip" onClick={() => setView("home")}>Quit</button>
        </div>

        {mode === "match" ? (
          <div className="tc-kmatch">
            <p className="tc-kprompt">Tap the matching pairs</p>
            <div className="tc-kmatchgrid">
              <div className="tc-kmatchcol">
                {step.pool.map((k) => (
                  <button key={k.c} disabled={!!pairs.done[k.c]}
                    className={"tc-kmatchbtn" + (pairs.done[k.c] ? " is-done" : "") + (pairs.sel === k.c && pairs.side === "left" ? " is-sel" : "")}
                    onClick={() => tapPair(k, "left")}>
                    <span className="tc-kmatchkanji">{k.c}</span>
                  </button>
                ))}
              </div>
              <div className="tc-kmatchcol">
                {right.map((k) => (
                  <button key={k.c} disabled={!!pairs.done[k.c]}
                    className={"tc-kmatchbtn" + (pairs.done[k.c] ? " is-done" : "") + (pairs.sel === k.c && pairs.side === "right" ? " is-sel" : "")}
                    onClick={() => tapPair(k, "right")}>
                    {k.m[0]}
                  </button>
                ))}
              </div>
            </div>
            {/* A matching round only clears when all five are paired, so without this a
                learner who cannot place one of them is stuck with nothing but Quit. */}
            <button className="tc-btn tc-btn-sm" onClick={advance}>Skip this round</button>
          </div>
        ) : mode === "learn" ? (
          <>
            <div className={"tc-card" + (flipped ? " is-flipped" : "")}
              onClick={() => { if (!flipped && thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current; setFlipped((f) => !f); }}
              role="button" tabIndex={0} aria-label="Kanji card, tap to flip">
              <div className="tc-card-inner">
                <div className="tc-face tc-front">
                  <span className="tc-kindchip">{cur.f ? "#" + cur.f + " most used" : "new"}</span>
                  {cur.e && <div className="tc-kemoji">{cur.e}</div>}
                  <div className="tc-kanjibig">{cur.c}</div>
                  <span className="tc-flipcue">meaning? reading? then tap</span>
                </div>
                <div className="tc-face tc-back">
                  <div className="tc-kanjimid">{cur.e ? cur.e + " " : ""}{cur.c}</div>
                  <div className="tc-meaning tc-meaning-lg">{cur.m.join(", ")}</div>
                  {cur.on.length > 0 && <div className="tc-kanjiread"><b>音</b> {readingList(cur.on)}</div>}
                  {cur.kun.length > 0 && <div className="tc-kanjiread"><b>訓</b> {readingList(cur.kun)}</div>}
                  {(deckMap.get(cur.c) || {}).words && (
                    <p className="tc-kwords">
                      {deckMap.get(cur.c).words.slice(0, 3).map((w) => (
                        <span key={w.id} className="tc-kword"><b>{w.term}</b> {shortMeaning(w.meaning)}</span>
                      ))}
                    </p>
                  )}
                  <span className="tc-timetag">{cur.s} strokes{cur.g && cur.g <= 6 ? " · grade " + cur.g : ""}{cur.j ? " · N" + cur.j : ""}</span>
                </div>
              </div>
            </div>
            <div className="tc-rehnav">
              <button className="tc-btn tc-btn-sm" onClick={() => speak(cur)}>🔊 Say it</button>
              {!flipped
                ? <button className="tc-btn tc-btn-primary" onClick={() => { if (thinkRef.current == null) thinkRef.current = Date.now() - shownRef.current; setFlipped(true); }}>Show</button>
                : <button className="tc-btn tc-btn-primary" onClick={learnDone}>Got it — next</button>}
            </div>
          </>
        ) : (
          <div className="tc-kquiz">
            <p className="tc-kprompt">
              {/* was step.mode: an audio step converted by "can't listen now" has mode
                  "meaning" but step.mode "audio", so this branch never fired and the
                  question showed the wrong prompt over English options. */}
              {mode === "cloze" ? "Which kanji completes the word?"
                : mode === "meaning" ? "What does this mean?"
                : mode === "reading" ? "How is this read?"
                : mode === "audio" ? "Which character did you hear?"
                : "Which character is this?"}
            </p>
            <div className="tc-kstem">
              {mode === "cloze" ? (
                <div className="tc-kcloze">
                  <span className="tc-kclozeword">
                    {cloze
                      ? Array.from(cloze.term).map((ch, ix) =>
                          ch === cur.c
                            ? <b key={ix} className="tc-kblank">〇</b>
                            : <span key={ix}>{ch}</span>)
                      : cur.m[0]}
                  </span>
                  {cloze && <span className="tc-kclozeen">{shortMeaning(cloze.meaning)}</span>}
                </div>
              ) : mode === "build" ? <span className="tc-kstemword">{cur.m.join(", ")}</span>
                : mode === "audio" ? (
                  <div className="tc-kaudiowrap">
                    <button className="tc-kaudio" onClick={() => speak(cur)} aria-label="Play again">🔊</button>
                    <button className="tc-btn tc-btn-sm" onClick={() => setNoAudio(true)}>Can't listen now</button>
                  </div>
                ) : (
                  <>
                    <span className="tc-kanjimid">{cur.c}</span>
                    <button className="tc-kaudiosm" onClick={() => speak(cur)} aria-label="Play">🔊</button>
                  </>
                )}
            </div>
            <div className={"tc-kopts" + (mode === "build" || mode === "audio" || mode === "cloze" ? " is-tiles" : "")}>
              {choices.map((k) => {
                const state = !picked ? ""
                  : k.c === cur.c ? " is-right"
                  : k.c === picked.c ? " is-wrong" : " is-dim";
                return (
                  <button key={k.c} className={"tc-kopt" + state} disabled={!!picked} onClick={() => answer(k)}>
                    {/* mode, not step.mode — an audio step converted by "can't listen now"
                        keeps step.mode "audio" and would render tiles over an English question */}
                    {mode === "meaning" ? k.m[0]
                      : mode === "reading"
                        ? (() => { const r = readingLabel(k); return <><b className="tc-kmark">{r.mark}</b>{r.text}</>; })()
                      : <span className="tc-kopttile">{k.c}</span>}
                  </button>
                );
              })}
            </div>
            {picked && mode === "cloze" && cloze && (
              <p className={"tc-kcorrect" + (picked.c === cur.c ? " is-ok" : "")}>
                <b>{cloze.term}</b> {cloze.reading ? "· " + cloze.reading + " " : ""}
                {shortMeaning(cloze.meaning)}
              </p>
            )}
            {picked && (
              <p className={"tc-kcorrect" + (picked.c === cur.c ? " is-ok" : "")}>
                <b>{cur.c}</b> {cur.m.join(", ")}
                {cur.kun.length ? " · 訓 " + readingList(cur.kun) : ""}
                {cur.on.length ? " · 音 " + readingList(cur.on) : ""}
                {(deckMap.get(cur.c) || {}).words ? " — " + deckMap.get(cur.c).words.slice(0, 2).map((w) => w.term).join("、") : ""}
              </p>
            )}
            {picked && (
              <button className="tc-btn tc-btn-primary tc-kcontinue" onClick={advance} autoFocus>
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── summary ── */
  if (view === "summary") {
    const pct = total ? Math.round((hits / total) * 100) : 0;
    return (
      <div className="tc-kanji">
        <div className="tc-done">
          <p className="tc-eyebrow">Lesson complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{hits} right of {total} questions</p>
          <div className="tc-donebtns">
            <button className="tc-btn tc-btn-primary" onClick={startSession}>Another lesson</button>
            <button className="tc-btn" onClick={() => setView("home")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── home ── */
  const pctAll = all.length ? (mastered / all.length) * 100 : 0;
  const nextUp = unlocked.filter((k) => !(((stats[k.c] || {}).seen || 0) > 0)).slice(0, 8);
  return (
    <div className="tc-kanji">
      <div className="tc-kanjihero">
        <img className="tc-mascot" src={MASCOT_GIFS[mastered > 0 ? "proud" : "waiting"]} width={64} height={60} alt="" draggable="false" />
        <div className="tc-kanjiheroright">
          <p className="tc-kanjicount"><b>{mastered}</b> <span>/ {all.length} jōyō kanji</span></p>
          <div className="tc-kanjibar"><div className="tc-kanjibarfill" style={{ width: Math.max(pctAll, mastered ? 0.4 : 0) + "%" }} /></div>
          <p className="tc-kanjisub">
            {mastered === 0 ? "Every kanji in the language, your own vocabulary first."
              : pctAll.toFixed(1) + "% mastered · " + started + " started"}
          </p>
        </div>
      </div>
      <button className="tc-btn tc-btn-primary tc-start" onClick={startSession}>Start lesson · 6 kanji</button>
      <p className="tc-smarthint">
        Practising {Math.min(6, unlocked.length)} characters a lesson, drawn from {unlocked.length} unlocked.
        {" "}The set only grows as characters go solid — {KANJI_BATCH - (mastered % KANJI_BATCH)} more
        mastered opens the next {KANJI_BATCH}.
      </p>
      {reviewInfo.tracked > 0 && (
        <p className="tc-smarthint">
          Tracked: {reviewInfo.tracked} characters, {reviewInfo.reps} reviews saved.
          {reviewInfo.dueNow > 0
            ? " " + reviewInfo.dueNow + " due now."
            : reviewInfo.nextDue ? " Next due " + reviewInfo.nextDue + "." : ""}
        </p>
      )}
      <p className="tc-smarthint">
        {unlocked.length} unlocked. {deckMap.size > 0
          ? "Ordered by your own vocabulary first — " + deckMap.size + " of these appear in words in your deck."
          : "Ordered by how often each character appears in real Japanese."}
      </p>
      {/* The collection. Every character met, newest last, tinted by how solid it is —
          the point is watching it fill up, which a counter alone does not give you.
          Tapping one opens what it means, how it sounds, and the words you already have
          that use it. */}
      {collected.length > 0 && (
        <div className="tc-kanjinext">
          <p className="tc-eyebrow">your kanji · {collected.length}</p>
          <div className="tc-kgrid">
            {collected.map((k) => {
              const st = stats[k.c] || {};
              const lv = st.level || 0;
              const tier = lv >= 4 ? " is-solid" : lv >= 2 ? " is-ok" : " is-new";
              return (
                <button key={k.c} className={"tc-kcell" + tier} onClick={() => setInspect(k)}
                  title={k.m.slice(0, 2).join(", ")}>
                  {k.c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inspect && (
        <div className="tc-kmodal" onClick={() => setInspect(null)}>
          <div className="tc-kmodalcard" onClick={(ev) => ev.stopPropagation()}>
            <button className="tc-inx" onClick={() => setInspect(null)} aria-label="close">×</button>
            {inspect.e && <div className="tc-kemoji">{inspect.e}</div>}
            <div className="tc-kanjibig">{inspect.c}</div>
            <button className="tc-btn tc-btn-sm" onClick={() => speak(inspect)}>🔊 How it sounds</button>
            <div className="tc-meaning tc-meaning-lg">{inspect.m.join(", ")}</div>
            {inspect.on.length > 0 && <div className="tc-kanjiread"><b>音</b> {readingList(inspect.on)}</div>}
            {inspect.kun.length > 0 && <div className="tc-kanjiread"><b>訓</b> {readingList(inspect.kun)}</div>}
            {(deckMap.get(inspect.c) || {}).words && (
              <p className="tc-kwords">
                {deckMap.get(inspect.c).words.slice(0, 5).map((w) => (
                  <span key={w.id} className="tc-kword"><b>{w.term}</b> {shortMeaning(w.meaning)}</span>
                ))}
              </p>
            )}
            <span className="tc-timetag">
              {inspect.s} strokes{inspect.g && inspect.g <= 6 ? " · grade " + inspect.g : ""}{inspect.j ? " · N" + inspect.j : ""}
              {inspect.f ? " · #" + inspect.f + " most used" : ""}
            </span>
            {(() => {
              const st = stats[inspect.c] || {};
              if (!st.seen) return null;
              const due = st.fsrs && st.fsrs.due;
              const d = due ? Math.round((due - Date.now()) / 86400000) : null;
              return (
                <p className="tc-kstat">
                  seen {st.seen}× · {Math.round(((st.correct || 0) / st.seen) * 100)}% right
                  {d != null ? " · next review " + (d <= 0 ? "now" : d === 1 ? "tomorrow" : "in " + d + " days") : ""}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {nextUp.length > 0 && (
        <div className="tc-kanjinext">
          <p className="tc-eyebrow">next up</p>
          <div className="tc-kanjirow">
            {nextUp.map((k) => <span key={k.c} className="tc-kanjichip" title={k.m.join(", ")}>{k.c}</span>)}
          </div>
        </div>
      )}
      <p className="tc-kanjicredit">
        Kanji data: KANJIDIC2 · Electronic Dictionary Research and Development Group · CC BY-SA 4.0
      </p>
    </div>
  );
}

/* ── conjugation engine ──
   Class teaches this as rules, not memorised tables (FACT 4-3): godan stems shift across
   the あいうえお rows, ichidan drops る, する/くる are the two irregulars. So the forms are
   computed rather than hand-written 8× per word — which also means adding a verb to
   CONJ_BANK gives you all 8 cells for free.
   Validated against the 33 hand-authored negatives already in CONJ_BANK: all 33 match. */
const CONJ_KEY = "jpn101:conj";
// godan last kana -> [い-row stem, あ-row stem, plain-past ending (音便)]
const GODAN_ROWS = {
  "う": ["い", "わ", "った"], "つ": ["ち", "た", "った"], "る": ["り", "ら", "った"],
  "む": ["み", "ま", "んだ"], "ぶ": ["び", "ば", "んだ"], "ぬ": ["に", "な", "んだ"],
  "く": ["き", "か", "いた"], "ぐ": ["ぎ", "が", "いだ"], "す": ["し", "さ", "した"],
};
function conjugate(dict, type) {
  const F = (a, b, c, d, e, f, g, h) => ({ formal: { presPos: a, presNeg: b, pastPos: c, pastNeg: d },
                                           plain:  { presPos: e, presNeg: f, pastPos: g, pastNeg: h } });
  if (type === "iadj") {
    const s = dict === "いい" ? "よ" : dict.slice(0, -1);   // いい is the one irregular stem
    return F(dict + "です", s + "くないです", s + "かったです", s + "くなかったです",
             dict, s + "くない", s + "かった", s + "くなかった");
  }
  if (type === "na") {
    return F(dict + "です", dict + "じゃないです", dict + "でした", dict + "じゃなかったです",
             dict + "だ", dict + "じゃない", dict + "だった", dict + "じゃなかった");
  }
  if (type === "irregular") {
    if (dict === "する") return F("します", "しません", "しました", "しませんでした", "する", "しない", "した", "しなかった");
    if (dict === "くる") return F("きます", "きません", "きました", "きませんでした", "くる", "こない", "きた", "こなかった");
    if (dict === "ある") return F("あります", "ありません", "ありました", "ありませんでした", "ある", "ない", "あった", "なかった");
  }
  if (type === "ichidan") {
    const s = dict.slice(0, -1);
    return F(s + "ます", s + "ません", s + "ました", s + "ませんでした", dict, s + "ない", s + "た", s + "なかった");
  }
  const g = GODAN_ROWS[dict.slice(-1)];
  if (!g) return null;
  const stem = dict.slice(0, -1), [i, a, ta] = g;
  const past = dict === "いく" ? "った" : ta;      // 行く is the classic exception, not いいた
  return F(stem + i + "ます", stem + i + "ません", stem + i + "ました", stem + i + "ませんでした",
           dict, stem + a + "ない", stem + past, stem + a + "なかった");
}
// the 8 cells of the class's grid — each is one drillable prompt
const CONJ_FORMS = [
  { id: "f-pp", pol: "formal", key: "presPos", chip: "polite", ask: "polite present" },
  { id: "f-pn", pol: "formal", key: "presNeg", chip: "polite", ask: "polite negative" },
  { id: "f-ap", pol: "formal", key: "pastPos", chip: "polite", ask: "polite past" },
  { id: "f-an", pol: "formal", key: "pastNeg", chip: "polite", ask: "polite past negative" },
  { id: "p-pp", pol: "plain",  key: "presPos", chip: "plain",  ask: "dictionary form" },
  { id: "p-pn", pol: "plain",  key: "presNeg", chip: "plain",  ask: "plain negative" },
  { id: "p-ap", pol: "plain",  key: "pastPos", chip: "plain",  ask: "plain past" },
  { id: "p-an", pol: "plain",  key: "pastNeg", chip: "plain",  ask: "plain past negative" },
];
const CONJ_LENGTHS = [10, 20, 40, "all"];

function ConjDrill() {
  const [filter, setFilter] = useState("all");
  const [forms, setForms] = useState(() => new Set(CONJ_FORMS.map((f) => f.id)));   // whole grid by default
  const [len, setLen] = useState(20);
  const [view, setView] = useState("setup");     // setup | session | summary
  const [stats, setStats] = useState({});
  const statsRef = useRef({});
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [passed, setPassed] = useState(() => new Set());
  const [firstTry, setFirstTry] = useState(() => new Set());
  const [struggled, setStruggled] = useState(() => new Set());
  const missRef = useRef({});
  const shownRef = useRef(0);
  const thinkRef = useRef(null);
  const startedRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { (async () => {
    try { const r = await sGet(CONJ_KEY); if (r) { const o = JSON.parse(r); setStats(o); statsRef.current = o; } } catch (e) {}
  })(); }, []);

  const words = useMemo(
    () => (filter === "all" ? CONJ_BANK : CONJ_BANK.filter((w) => w.type === filter)),
    [filter]
  );
  // every (word × selected form) pair is its own drillable item with its own history
  const items = useMemo(() => {
    const out = [];
    words.forEach((w) => {
      const c = conjugate(w.reading, w.type);
      if (!c) return;
      CONJ_FORMS.forEach((f) => {
        if (!forms.has(f.id)) return;
        out.push({ id: w.reading + "|" + f.id, w, f, answer: c[f.pol][f.key] });
      });
    });
    return out;
  }, [words, forms]);

  const getS = (m, id) => m[id] || { seen: 0, correct: 0, level: 0, streak: 0 };
  const needC = (st, now) => statNeed(st, now) + (st.seen ? 0 : Math.random());

  const startSession = useCallback((subset) => {
    const now = Date.now();
    const pool0 = subset && subset.length ? subset : items;
    if (!pool0.length) return;
    const ordered = pool0
      .map((x) => ({ x, k: needC(getS(statsRef.current, x.id), now) + Math.random() * 1.2 }))
      .sort((a, b) => b.k - a.k).map((o) => o.x);
    const pool = len === "all" ? ordered : ordered.slice(0, len);
    setQueue(pool); setPos(0); setPoolSize(pool.length);
    setPassed(new Set()); setFirstTry(new Set()); setStruggled(new Set());
    missRef.current = {}; startedRef.current = Date.now(); setElapsed(0);
    setFlipped(false); setView("session");
  }, [items, len]);

  const cur = queue[pos] || null;
  const done = view === "session" && queue.length > 0 && pos >= queue.length;
  useEffect(() => { shownRef.current = Date.now(); thinkRef.current = null; }, [pos, view]);
  useEffect(() => { if (done) { setElapsed(Date.now() - startedRef.current); setView("summary"); } }, [done]);

  const grade = (ok) => {
    if (!cur) return;
    const m = statsRef.current, s0 = getS(m, cur.id), think = thinkRef.current;
    const ns = { ...s0, seen: s0.seen + 1, correct: s0.correct + (ok ? 1 : 0),
      level: ok ? Math.min(5, s0.level + 1) : Math.max(0, s0.level - 2),
      streak: ok ? (s0.streak || 0) + 1 : 0, last: Date.now(),
      fsrs: statReview(s0, ok, think, Date.now()),
      ms: (s0.ms || 0) + (think || 0), msN: (s0.msN || 0) + (think ? 1 : 0) };
    const nx = { ...m, [cur.id]: ns };
    statsRef.current = nx; setStats(nx); sSet(CONJ_KEY, JSON.stringify(nx));
    if (ok) {
      if (!missRef.current[cur.id]) setFirstTry((p) => { const n = new Set(p); n.add(cur.id); return n; });
      setPassed((p) => { const n = new Set(p); n.add(cur.id); return n; });
      setQueue((q) => q.filter((x, i) => i <= pos || x.id !== cur.id));
    } else {
      setStruggled((p) => { const n = new Set(p); n.add(cur.id); return n; });
      const c = (missRef.current[cur.id] || 0) + 1;
      missRef.current[cur.id] = c;
      if (c <= 2) setQueue((q) => { const n = q.slice(); n.splice(Math.min(pos + 4, n.length), 0, cur); return n; });
    }
    setFlipped(false); setPos((p) => p + 1);
  };

  const toggleForm = (id) => setForms((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n.size ? n : new Set(["p-pn"]);        // never leave nothing to ask
  });
  const mastered = items.filter((x) => getS(stats, x.id).level >= 4).length;
  const avgSecs = (st) => (st.msN ? (st.ms / st.msN / 1000).toFixed(1) + "s" : "—");

  // ── session ──
  if (view === "session" && cur) {
    const meta = CONJ_TYPES[cur.w.type];
    return (
      <div className="tc-conj">
        <div className="tc-progress">
          <div className="tc-progtrack"><div className="tc-progfill" style={{ width: `${poolSize ? (passed.size / poolSize) * 100 : 0}%` }} /></div>
          <span className="tc-progtext">{passed.size} / {poolSize}</span>
          <button className="tc-fchip" onClick={() => setView("setup")}>Quit</button>
        </div>
        <div key={pos} className={"tc-card" + (flipped ? " is-flipped" : "")} onClick={() => setFlipped((f) => !f)}
             role="button" tabIndex={0} aria-label="Conjugation card, click to flip">
          <div className="tc-card-inner">
            <div className="tc-face tc-front">
              <span className="tc-kindchip">{meta.chip}</span>
              <div className="tc-term">{cur.w.dict}</div>
              <div className="tc-reading-front">{cur.w.reading} · {cur.w.meaning}</div>
              <div className="tc-conjask">→ {cur.f.ask}?</div>
              <span className="tc-flipcue">tap to flip</span>
            </div>
            <div className="tc-face tc-back">
              <div className="tc-conjanswer">{cur.answer} <SpeakBtn text={cur.answer} /></div>
              <div className="tc-conjhow">{cur.f.ask}</div>
              <div className="tc-conjrule">{meta.rule}</div>
              {cur.w.note && <p className="tc-conjnote">⚠️ {cur.w.note}</p>}
            </div>
          </div>
        </div>
        <div className="tc-grade">
          {!flipped ? (
            <button type="button" className="tc-btn tc-btn-wide"
              onClick={(e) => { e.stopPropagation(); thinkRef.current = Date.now() - shownRef.current; setFlipped(true); }}>Reveal answer</button>
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

  // ── summary ──
  if (view === "summary") {
    const pct = poolSize ? Math.round((firstTry.size / poolSize) * 100) : 0;
    const missed = items.filter((x) => struggled.has(x.id));
    return (
      <div className="tc-conj">
        <div className="tc-done">
          <p className="tc-eyebrow">Session complete</p>
          <div className="tc-bignum">{pct}<span>%</span></div>
          <p className="tc-donesub">{firstTry.size} nailed first try{missed.length ? ` · ${missed.length} missed` : ""} · {poolSize} prompts</p>
          <p className="tc-donesub">{fmtSecs(elapsed)} total · {(elapsed / (passed.size || 1) / 1000).toFixed(1)}s each</p>
          {missed.length > 0 && (
            <div className="tc-kanaweak">
              <p className="tc-eyebrow">needs the most work</p>
              {missed.slice(0, 6).map((x) => {
                const st = getS(stats, x.id);
                return (
                  <div key={x.id} className="tc-kanaweakrow">
                    <span className="tc-kanaweakch" style={{ fontSize: 18 }}>{x.w.dict}</span>
                    <span className="tc-kanaweakr">{x.f.ask}</span>
                    <span className="tc-kanaweakmeta">{st.seen ? Math.round((st.correct / st.seen) * 100) + "%" : "—"} · {avgSecs(st)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tc-donebtns">
            {missed.length > 0 && <button className="tc-btn tc-btn-primary" onClick={() => startSession(missed)}>Review the {missed.length} you missed</button>}
            <button className="tc-btn" onClick={() => startSession()}>Go again</button>
            <button className="tc-btn" onClick={() => setView("setup")}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // ── setup ──
  return (
    <div className="tc-conj">
      <div className="tc-conjintro">
        <h2 className="tc-conjtitle">Conjugation</h2>
        <p className="tc-conjsub">The full grid from class — present/past × positive/negative, polite and plain.
          ① ichidan: drop る · ⑤ godan: shift across the あいうえお rows ·
          い-adj: 〜く〜 · noun/な-adj: 〜じゃ〜</p>
        <div className="tc-conjchips" role="group" aria-label="Word type">
          {CONJ_FILTERS.map(([id, label]) => (
            <button key={id} className={"tc-conjchip" + (filter === id ? " is-on" : "")}
              onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="tc-conjchips" role="group" aria-label="Which forms to drill">
          {CONJ_FORMS.map((f) => (
            <button key={f.id} className={"tc-conjchip" + (forms.has(f.id) ? " is-on" : "")}
              aria-pressed={forms.has(f.id)} onClick={() => toggleForm(f.id)}>{f.ask}</button>
          ))}
          <button className="tc-conjchip"
            onClick={() => setForms(forms.size === CONJ_FORMS.length ? new Set(["p-pn"]) : new Set(CONJ_FORMS.map((f) => f.id)))}>
            {forms.size === CONJ_FORMS.length ? "just one" : "all 8"}
          </button>
        </div>
        <div className="tc-kanaseg tc-kanalen">
          <span className="tc-kanalenlabel">session</span>
          {CONJ_LENGTHS.map((n) => (
            <button key={n} className={"tc-fchip" + (len === n ? " is-on" : "")} onClick={() => setLen(n)}>
              {n === "all" ? `all ${items.length}` : n}
            </button>
          ))}
        </div>
        <button className="tc-btn tc-btn-wide" onClick={() => startSession()}>
          Start · {len === "all" ? items.length : Math.min(len, items.length)} prompts
        </button>
        <p className="tc-conjsub">{mastered}/{items.length} mastered · {words.length} words × {forms.size} form{forms.size === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── FREQ 10K ───────────────────────────
   Long-game deck: high-frequency everyday words, drilled with a daily
   new-word quota + SRS, separate from the class deck. Tier 1 below;
   later tiers get appended with FREQ_VERSION bumped. Every review
   stores seen/correct/level/ease AND think-time (ms before reveal). */
/* ── the 10k word list ──
   Fetched rather than bundled, and its PROGRESS is stored separately from its CONTENT.
   Ten thousand full card records in localStorage is well over a megabyte that would then
   be re-uploaded on every cloud sync; the words are static data and belong in a file,
   while only the handful you have actually studied needs saving. This is the same split
   the Kanji tab already uses. */
let _freqPromise = null;
function loadFreqWords() {
  if (_freqPromise) return _freqPromise;
  _freqPromise = (async () => {
    let cached = null;
    try { cached = JSON.parse(window.localStorage.getItem("jpn101:freqData") || "null"); } catch (e) {}
    try {
      const r = await fetch("/freq.json", { cache: "no-cache" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const d = await r.json();
        if (d && d.words) {
          try { window.localStorage.setItem("jpn101:freqData", JSON.stringify(d)); } catch (e) {}
          return d;
        }
      }
    } catch (e) { /* offline — the cached copy is the point */ }
    return cached;
  })();
  return _freqPromise;
}

/* Progress used to live inline on each card. Anything already recorded is folded into the
   new keyed-by-term shape so no study history is lost. */
function migrateFreqStats(raw) {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  const out = {};
  for (const c of raw) {
    if (!c || !c.term || !((c.seen || 0) > 0)) continue;
    out[c.term] = {
      seen: c.seen || 0, correct: c.correct || 0, level: c.level || 0, streak: c.streak || 0,
      last: c.last || 0, ease: c.ease || 1, fsrs: c.fsrs || null, ms: c.ms || 0, msN: c.msN || 0,
    };
  }
  return out;
}

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
  const [words, setWords] = useState(null);      // static list from freq.json
  const [statsMap, setStatsMap] = useState(null); // progress, keyed by term
  /* The component still works on one merged array — only the STORAGE is split. */
  const deck = useMemo(() => {
    if (!words) return null;
    return words.map((w) => ({
      id: w.t, term: w.t, reading: w.r || w.t, romaji: "", meaning: w.m,
      kind: /[一-龯]/.test(w.t) ? "kanji" : /^[゠-ヿー]+$/.test(w.t) ? "katakana" : "hiragana",
      rank: w.k, pos: w.p,
      seen: 0, correct: 0, ms: 0, msN: 0,
      ...((statsMap && statsMap[w.t]) || {}),
    }));
  }, [words, statsMap]);
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
      /* Words from the shipped file, progress from storage. The 148 hand-picked words
         that used to live inline are gone — this is the real 10,000, ranked by corpus
         frequency — and any progress recorded against the old ones is migrated by term. */
      let raw = null;
      try { const r = await sGet(FREQ_KEY); raw = r ? JSON.parse(r) : null; } catch (e) { raw = null; }
      const stats0 = migrateFreqStats(raw);
      if (Array.isArray(raw)) await sSet(FREQ_KEY, JSON.stringify(stats0));
      const data = await loadFreqWords();
      const words = (data && data.words) || [];
      setStatsMap(stats0);
      setWords(words);
      try { const q = await sGet(FREQ_QUOTA_KEY); if (q) setQuota(Number(q) || 15); } catch (e) {}
      const days = await loadDays();
      const today = days[localDayKey()];
      setTodayNew(today ? today.fnew || 0 : 0);
    })();
  }, []);

  /* Only studied words are stored. Ten thousand untouched records would be a megabyte of
     zeroes re-synced on every save. */
  const persist = useCallback((next) => {
    const map = {};
    for (const c of next) {
      if (!((c.seen || 0) > 0)) continue;
      map[c.term] = { seen: c.seen, correct: c.correct, level: c.level || 0, streak: c.streak || 0,
        last: c.last || 0, ease: c.ease || 1, fsrs: c.fsrs || null, ms: c.ms || 0, msN: c.msN || 0 };
    }
    setStatsMap(map);
    sSet(FREQ_KEY, JSON.stringify(map));
  }, []);
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
        fsrs: statReview(x, got, t, Date.now()),
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
      <div className="tc-done">
        <p className="tc-eyebrow">Session complete</p>
        <div className="tc-bignum">{pct}<span>%</span></div>
        <p className="tc-donesub">{right}/{total} correct · {todayNew}/{quota} new today</p>
        <div className="tc-donebtns">
          <button className="tc-btn" onClick={() => { setRunning(false); }}>Back</button>
          <button className="tc-btn tc-btn-primary" onClick={freeStart}>Extra practice</button>
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
.tc-study-setup{background:transparent;border:0;border-radius:0;padding:6px 2px;display:flex;flex-direction:column;gap:10px;}
.tc-study-setup > *{margin-top:0;margin-bottom:0;}
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
.tc-card-inner{position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1);min-height:340px;}
.tc-card.is-flipped .tc-card-inner{transform:rotateY(180deg);}
.tc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  background:radial-gradient(130% 120% at 30% -12%, rgba(124,92,255,.22) 0%, rgba(64,84,168,.12) 45%, rgba(255,255,255,.05) 80%);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  color:#fff;border-radius:26px;
  display:flex;flex-direction:column;align-items:center;gap:10px;
  padding:34px 28px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;
  box-shadow:0 24px 54px -22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);}
/* "safe center" centres normally but falls back to flex-start when the content is taller
   than the box, so a long back scrolls instead of escaping above the card. The previous
   fix used auto margins, which looked fine until you noticed the chip and the flip cue
   are absolutely positioned — so only the top margin ever applied and every card sat low
   with a band of dead space above it. (No backticks in here: this whole stylesheet lives
   inside a template literal, and one closes it.) */
.tc-face{justify-content:center;justify-content:safe center;}
.tc-back{transform:rotateY(180deg);}
.tc-kindchip{position:absolute;top:16px;right:18px;font-family:"Yu Gothic","Noto Sans JP",sans-serif;
  font-size:11.5px;color:rgba(255,255,255,.7);letter-spacing:.1em;border:0;
  padding:4px 11px;border-radius:99px;background:rgba(255,255,255,.12);}
.tc-term{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:54px;line-height:1.15;font-weight:600;text-align:center;color:#fff;}
.tc-term-sm{font-size:46px;}
/* Size by length instead of one size for everything. A lone kanji at the shared 54px read
   as small and cramped — and the strokes separating it from a near neighbour are exactly
   what you are being asked to see — while a ten-character phrase needs to stay on the
   card. The steps below keep every length filling roughly the same width. */
.tc-term-1{font-size:132px;line-height:1;}
.tc-term-2{font-size:104px;line-height:1.02;}
.tc-term-3{font-size:84px;line-height:1.05;}
.tc-term-4{font-size:72px;line-height:1.08;}
.tc-term-5{font-size:62px;line-height:1.1;}
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
.tc-emoji{font-size:64px;line-height:1;margin-bottom:4px;}
.tc-emoji-lg{font-size:80px;}
/* ── the non-flashcard exercises ──
   These are plain blocks rather than 3D faces: there is nothing to flip, and giving them
   the card's absolute-positioned faces is what would reintroduce the overflow problem. */
.tc-learn,.tc-mcwrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;
  background:radial-gradient(130% 120% at 30% -12%, rgba(124,92,255,.22) 0%, rgba(64,84,168,.12) 45%, rgba(255,255,255,.05) 80%);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  border-radius:26px;padding:34px 28px 30px;margin-bottom:18px;min-height:340px;box-sizing:border-box;
  justify-content:center;color:#fff;
  box-shadow:0 24px 54px -22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);}
.tc-learn-tap{cursor:pointer;}
.tc-learn-tap:focus-visible{outline:2px solid rgba(201,184,255,.85);outline-offset:3px;}
.tc-learn-tap:hover{background:radial-gradient(140% 130% at 30% -12%, rgba(124,92,255,.3) 0%, rgba(64,84,168,.16) 45%, rgba(255,255,255,.06) 80%);}
.tc-learnchip{background:rgba(120,220,170,.2);color:#c8f5df;}
.tc-mcchip{background:rgba(140,170,255,.2);color:#d3e0ff;}
.tc-listenchip{background:rgba(255,200,120,.2);color:#ffe2b8;}
.tc-learnnote{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.6);text-align:center;}
.tc-mcprompt{display:flex;flex-direction:column;align-items:center;gap:3px;margin-bottom:10px;}
.tc-mcfurigana{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:19px;letter-spacing:.06em;color:rgba(255,255,255,.66);}
.tc-mcterm{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:44px;line-height:1.15;font-weight:600;text-align:center;color:#fff;}
.tc-mcterm.tc-term-1{font-size:104px;line-height:1;}
.tc-mcterm.tc-term-2{font-size:84px;line-height:1.02;}
.tc-mcterm.tc-term-3{font-size:70px;line-height:1.05;}
.tc-mcterm.tc-term-4{font-size:60px;line-height:1.08;}
.tc-mcterm.tc-term-5{font-size:52px;line-height:1.1;}
.tc-listenprompt{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:6px;}
.tc-listenprompt .tc-speakbtn{font-size:34px;padding:16px 20px;}
.tc-noaudio{appearance:none;margin-top:4px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);
  color:rgba(255,255,255,.75);border-radius:99px;font:inherit;font-size:12px;padding:6px 13px;cursor:pointer;}
.tc-noaudio:hover{background:rgba(255,255,255,.13);color:#fff;}
.tc-listenreveal{margin-top:10px;font-family:"Hiragino Sans","Noto Sans JP",sans-serif;font-size:22px;color:rgba(255,255,255,.8);}
.tc-mcopts{display:flex;flex-direction:column;gap:9px;width:min(100%,380px);}
.tc-mcopt{appearance:none;text-align:left;font:inherit;font-size:15.5px;line-height:1.4;color:#fff;
  background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);border-radius:13px;
  padding:12px 15px;cursor:pointer;transition:background .12s,border-color .12s;}
.tc-mcopt:hover:not(:disabled){background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.3);}
.tc-mcopt:focus-visible{outline:2px solid rgba(201,184,255,.85);outline-offset:2px;}
.tc-mcopt:disabled{cursor:default;opacity:.55;}
.tc-mcopt.is-answer{background:rgba(90,220,150,.2);border-color:rgba(90,220,150,.65);color:#d6ffe9;opacity:1;}
.tc-mcopt.is-wrongpick{background:rgba(255,110,90,.18);border-color:rgba(255,110,90,.6);color:#ffd5cf;opacity:1;}
.tc-clozechip{background:rgba(120,200,255,.2);color:#cfe9ff;}
.tc-clozeen{margin:0 0 4px;font-size:15px;line-height:1.5;color:var(--mut-2);text-align:center;max-width:34ch;}
.tc-clozesent{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:30px;line-height:1.5;text-align:center;color:#fff;margin-bottom:12px;max-width:22ch;}
.tc-clozeblank{color:#8fd0ff;border-bottom:2px solid rgba(143,208,255,.5);padding:0 2px;}
.tc-clozeblank.is-right{color:#b8f0d0;border-color:rgba(90,220,150,.7);}
.tc-clozeblank.is-wrong{color:#ffc2bb;border-color:rgba(255,120,100,.7);}
.tc-clozesrc{margin:10px 0 0;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(255,255,255,.4);}
.tc-mchint{margin:0;font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);}
/* ── cue, explanation, session summary ── */
.tc-reading-masked{letter-spacing:.1em;color:rgba(255,255,255,.55);}
.tc-cuehint{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:26px;letter-spacing:.12em;color:#c9b8ff;background:rgba(124,92,255,.14);
  border-radius:10px;padding:5px 14px;}
.tc-whywrap{display:flex;justify-content:center;margin:-6px 0 14px;}
.tc-whybtn{appearance:none;background:none;border:0;cursor:pointer;font:inherit;font-size:12.5px;
  color:var(--mut-2);text-decoration:underline;text-underline-offset:3px;padding:4px 8px;}
.tc-whybtn:hover{color:#fff;}
.tc-whytext{margin:0;max-width:46ch;text-align:center;font-size:13px;line-height:1.6;color:var(--mut-2);
  background:rgba(255,255,255,.05);border-radius:10px;padding:9px 14px;}
.tc-sessum{margin:18px auto 0;max-width:340px;text-align:left;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:14px 16px;}
.tc-sessumh{margin:0 0 9px;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--mut-2);}
.tc-sessumlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
.tc-sessumlist li{display:flex;justify-content:space-between;gap:12px;font-size:14px;color:#fff;}
.tc-sessumlist b{font-variant-numeric:tabular-nums;color:#c9b8ff;}
.tc-sessumnote{margin:11px 0 0;font-size:12.5px;line-height:1.5;color:var(--mut-2);}
.tc-sessumnote b{color:#ffd0c8;}
/* ── study plan ── */
.tc-plan{display:flex;flex-direction:column;gap:26px;padding-bottom:40px;}
.tc-plansec{display:flex;flex-direction:column;gap:11px;background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:20px 20px 22px;}
.tc-planh{margin:0;font-size:19px;font-weight:650;color:#fff;display:flex;align-items:baseline;gap:9px;}
.tc-planh-sub{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut-2);font-weight:400;}
.tc-planhint{margin:0;font-size:13.5px;line-height:1.6;color:var(--mut-2);max-width:62ch;}

.tc-checkq{font-size:28px;font-weight:600;text-align:center;margin:18px 0 14px;line-height:1.3}
.tc-checkin{display:block;width:100%;box-sizing:border-box;font-size:26px;text-align:center;
  padding:12px 14px;border-radius:12px;border:2px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);color:inherit;font-family:inherit}
.tc-checkin:focus{outline:none;border-color:rgba(255,255,255,.45)}
.tc-prod{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);text-align:center}
.tc-prodprompt{font-size:17px;opacity:.85;margin:6px 0 12px}
.tc-prodsent{font-size:24px;line-height:1.6;margin:10px 0;min-height:36px}
.tc-prodblank{opacity:.4;font-size:16px}
.tc-prodtiles{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0}
.tc-fchip.is-used{opacity:.25}
.tc-prodresult{margin-top:12px}
.tc-prodok{color:#7fd88f;font-weight:600}
.tc-prodbad{color:#ffb3a7;font-weight:600}
.tc-kctx{display:flex;gap:10px;align-items:baseline;justify-content:center;margin-bottom:6px;opacity:.8}
.tc-kctxk{font-size:26px;font-weight:700}
.tc-kctxm{font-size:13px;opacity:.75}
.tc-kchit{color:#8fd0ff}
.tc-mine{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.tc-minelist{display:flex;flex-direction:column;gap:5px;margin:10px 0}
.tc-minerow{display:grid;grid-template-columns:auto auto auto 1fr auto;gap:8px;align-items:baseline;
  padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.05);cursor:pointer}
.tc-minerow.is-on{background:rgba(120,200,255,.14)}
.tc-mineterm{font-size:18px;font-weight:600}
.tc-mineread{opacity:.7;font-size:13px}
.tc-minemean{opacity:.75;font-size:13px}
.tc-minecount{opacity:.55;font-size:12px}
.tc-minesent{grid-column:1/-1;opacity:.55;font-size:12px;line-height:1.5}
.tc-checkkana{text-align:center;font-size:26px;min-height:34px;margin-top:10px;opacity:.85;letter-spacing:.02em}
.tc-checkrow{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}
.tc-btn-quiet{opacity:.6}
.tc-checkmiss{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.tc-checkmissrow{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;
  padding:7px 10px;border-radius:9px;background:rgba(255,255,255,.05)}
.tc-checkterm{font-size:19px;font-weight:600}
.tc-checkread{opacity:.75}
.tc-checken{opacity:.6;flex:1 1 120px}
.tc-checkgot{opacity:.5;font-size:13px}
.tc-checkgot.is-near{opacity:.85}
.tc-planfield{display:flex;flex-direction:column;gap:5px;}
.tc-planfield span{font-size:13px;color:rgba(255,255,255,.75);}
.tc-planfield textarea{width:100%;box-sizing:border-box;resize:vertical;font:inherit;font-size:14.5px;line-height:1.5;
  background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:10px 12px;color:#fff;}
.tc-planfield textarea:focus{outline:2px solid rgba(124,92,255,.6);outline-offset:1px;}
.tc-goals{display:flex;flex-direction:column;gap:8px;}
.tc-goal{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1);
  border-radius:11px;padding:9px 11px;}
.tc-goal.is-done .tc-goaltext{text-decoration:line-through;color:var(--mut-2);}
.tc-goalcheck{flex:none;width:22px;height:22px;border-radius:6px;border:1.5px solid rgba(255,255,255,.3);
  background:rgba(255,255,255,.06);color:#8ef0bd;font-size:13px;cursor:pointer;}
.tc-goal.is-done .tc-goalcheck{background:rgba(90,220,150,.22);border-color:rgba(90,220,150,.6);}
.tc-goaltext{flex:1;font-size:14.5px;color:#fff;line-height:1.4;}
.tc-goalarea,.tc-goaldrop{flex:none;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
  color:#fff;border-radius:8px;font:inherit;font-size:12px;padding:5px 7px;cursor:pointer;}
.tc-goaldrop{width:26px;font-size:15px;line-height:1;color:var(--mut-2);}
.tc-goaladd{display:flex;gap:8px;}
.tc-goaladd input{flex:1;min-width:0;font:inherit;font-size:14px;background:rgba(0,0,0,.22);
  border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 11px;color:#fff;}
.tc-prios{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:9px;}
.tc-prio{display:flex;align-items:center;justify-content:space-between;gap:10px;
  background:rgba(0,0,0,.18);border-radius:10px;padding:8px 10px;}
.tc-prioname{font-size:14px;color:#fff;}
.tc-priobtns{display:flex;gap:4px;}
.tc-priobtn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);
  color:var(--mut-2);border-radius:7px;font:inherit;font-size:11.5px;padding:4px 9px;cursor:pointer;}
.tc-priobtn.is-on{background:rgba(124,92,255,.3);border-color:rgba(124,92,255,.65);color:#fff;}
.tc-paces{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;}
.tc-pace{display:flex;flex-direction:column;gap:4px;text-align:left;cursor:pointer;
  background:rgba(0,0,0,.2);border:1.5px solid rgba(255,255,255,.12);border-radius:13px;padding:13px 14px;color:#fff;font:inherit;}
.tc-pace.is-on{border-color:rgba(124,92,255,.7);background:rgba(124,92,255,.16);}
.tc-pacelabel{font-size:15.5px;font-weight:650;}
.tc-pacemins{font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;color:var(--shu-soft);}
.tc-pacenote{font-size:12.5px;line-height:1.45;color:var(--mut-2);}
.tc-cover{display:flex;flex-direction:column;gap:7px;}
.tc-coverrow{display:grid;grid-template-columns:130px 1fr 38px;align-items:center;gap:10px;}
.tc-covername{font-size:13.5px;color:rgba(255,255,255,.85);}
.tc-coverbar{position:relative;}
/* The credible interval, drawn behind the estimate. A wide band is the honest way to say
   "we do not know yet" — far better than a number that looks equally confident at four
   observations and at ninety. */
.tc-coverband{position:absolute;top:0;bottom:0;background:rgba(255,255,255,.13);border-radius:99px;}
.tc-coverfill{position:relative;}
.tc-coverbar{height:9px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden;}
.tc-coverfill{height:100%;background:linear-gradient(90deg,rgba(124,92,255,.85),rgba(180,150,255,.85));border-radius:99px;min-width:2px;}
.tc-coverfill.is-gap{background:rgba(255,110,90,.6);}
.tc-covernum{font-family:var(--mono);font-size:12px;color:var(--mut-2);text-align:right;}
.tc-covergap{margin:12px 0 0;font-size:13.5px;line-height:1.6;color:#ffd0c8;background:rgba(255,110,90,.12);
  border-radius:10px;padding:10px 13px;}
.tc-planlist{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;font-size:13.5px;line-height:1.6;color:var(--mut-2);}
.tc-planlist b{color:#fff;font-weight:600;}
@media(max-width:560px){.tc-coverrow{grid-template-columns:110px 1fr 32px;}}
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
  .tc-prow-top{flex-wrap:wrap;}
  .tc-prow-top .tc-rowread{flex-basis:100%;order:3;}
  .tc-prow-top .tc-del{margin-left:auto;}
}
@media (prefers-reduced-motion:reduce){
  .tc-card-inner{transition:none;}
}

/* focus + insights */
.tc-focus-btn{margin-top:10px;border-color:var(--shu);color:var(--shu-soft);}
.tc-focus-btn:hover{background:rgba(216,72,47,.12);}
.tc-smart-btn{background:linear-gradient(130deg,#4054a8 0%,#7c5cff 55%,#b0543f 125%);color:#fff;border:none;font-weight:600;box-shadow:0 10px 26px -12px rgba(124,92,255,.65);}
.tc-smart-btn:hover{filter:brightness(1.12);}
.tc-smarthint{margin:8px 0 0;font-size:12px;color:var(--mut-2);line-height:1.5;text-align:center;}
.tc-kind-prod{background:rgba(216,72,47,.16);border-color:rgba(216,72,47,.4);color:var(--shu-soft);}
/* Production cards read as a different exercise on purpose — the visual break is part of
   what stops the session settling into one mode. */
.tc-prodchip{background:rgba(124,92,255,.2);border-color:rgba(124,92,255,.45);color:#c9b8ff;}
.tc-prodprompt{font-size:26px;font-weight:600;line-height:1.3;color:#fff;text-align:center;padding:0 14px;max-width:340px;}
.tc-prodanswer{color:#c9b8ff;}
/* Typed spelling on a production card. The kana line under the box echoes the conversion
   live, so a mistyped reading is visible as kana before it is committed — the point is to
   test the spelling, not to punish an unfamiliar rōmaji convention. */
.tc-spellbox{margin-top:14px;display:flex;flex-direction:column;gap:7px;align-items:center;width:100%;}
.tc-spellinput{width:min(100%,300px);box-sizing:border-box;background:rgba(255,255,255,.94);border:1.5px solid rgba(201,184,255,.55);border-radius:9px;padding:9px 12px;font:inherit;font-size:15px;text-align:center;color:var(--sumi);}
.tc-spellinput:focus{outline:2px solid rgba(201,184,255,.8);outline-offset:1px;}
.tc-spellkana{min-height:22px;font-size:19px;letter-spacing:.04em;color:#c9b8ff;}
.tc-spellbox .tc-btn{width:min(100%,300px);}
.tc-spellverdict{font-family:var(--mono);font-size:12px;letter-spacing:.06em;padding:5px 11px;border-radius:7px;margin-bottom:8px;}
.tc-spellverdict.is-right{color:#b8f0d0;background:rgba(90,220,150,.13);}
.tc-spellverdict.is-wrong{color:#ffc2bb;background:rgba(255,120,100,.13);}
.tc-spellverdict b{font-weight:700;letter-spacing:.02em;}
.tc-retention{display:flex;flex-direction:column;gap:7px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:11px 12px;}
.tc-retlabel{font-size:12px;color:var(--mut-2);letter-spacing:.04em;text-transform:uppercase;}
.tc-retention .tc-smarthint{margin:0;}
.tc-mnbox{margin-top:10px;display:flex;flex-direction:column;gap:6px;align-items:center;width:100%;}
.tc-mnin{width:min(100%,300px);box-sizing:border-box;background:rgba(255,255,255,.9);border:1.5px solid rgba(230,162,60,.5);border-radius:9px;padding:8px 11px;font:inherit;font-size:14px;color:var(--sumi);}
.tc-mnshow{margin:8px 0 0;font-size:13px;line-height:1.5;color:#ffd9a0;background:rgba(255,190,90,.1);border-radius:8px;padding:6px 11px;max-width:300px;}
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
.tc-kanaseg{display:flex;gap:6px;flex-wrap:wrap;}   /* must wrap: the set row is 6 chips and overflowed the screen on phones */
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
.tc-kanaempty{font-size:16px;line-height:1.5;color:var(--washi,#efeae2);margin:2px 0 14px;max-width:34ch;}
.tc-kanalen{align-items:center;margin:0 0 12px;}
.tc-kanalenlabel{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut-2);margin-right:2px;}
.tc-kanaweak{margin-top:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
.tc-kanaweakrow{display:flex;align-items:center;gap:10px;}
.tc-kanaweakch{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:24px;line-height:1;min-width:2.2ch;color:#fff;}
.tc-kanaweakr{font-size:14px;color:var(--washi,#efeae2);min-width:4.5ch;}
.tc-kanaweakmeta{margin-left:auto;font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;}
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
.tc-fchip{appearance:none;border:0;background:rgba(255,255,255,.07);color:rgba(255,255,255,.75);font:inherit;font-size:13.5px;font-weight:500;min-height:36px;padding:6px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s,transform .1s;}
@media (max-width:460px){.tc-fchip{font-size:12.5px;padding:6px 11px;}.tc-kanabar{gap:7px;}}
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
/* ── study buddy ── */
.tc-buddy{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:12px 14px;margin:0 0 12px;}
/* Combo counts instant recalls, not correct answers — under 3 seconds means the word is
   actually there, and that is what predicts remembering it tomorrow. */
.tc-combo{margin-left:auto;font-size:15px;font-weight:700;color:#8fd6a0;font-variant-numeric:tabular-nums;animation:tc-pop .28s cubic-bezier(.3,1.4,.5,1);}
.tc-combo i{font-style:normal;font-size:11px;opacity:.7;margin-left:1px;}
.tc-combo.is-warm{color:#ffd76e;}
.tc-combo.is-hot{color:#ff9a6e;text-shadow:0 0 12px rgba(255,154,110,.55);}
@keyframes tc-pop{0%{transform:scale(.6);opacity:.3}60%{transform:scale(1.22)}100%{transform:scale(1);opacity:1}}
.tc-donecombo{margin:6px 0 0;font-size:13px;color:var(--mut-2);}
.tc-donecombo b{color:#8fd6a0;font-size:15px;}
@media (prefers-reduced-motion:reduce){.tc-combo{animation:none;}}
.tc-mascot{flex:none;image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 4px 8px rgba(0,0,0,.35));user-select:none;}
.tc-buddytext{min-width:0;display:flex;flex-direction:column;gap:7px;}
.tc-buddyline{margin:0;font-size:14px;line-height:1.45;color:var(--washi,#efeae2);}
.tc-buddystats{display:flex;flex-wrap:wrap;gap:6px;}
.tc-stat{font-size:11.5px;color:var(--mut-2);background:rgba(255,255,255,.06);border-radius:999px;padding:3px 9px;white-space:nowrap;}
.tc-stat b{color:#fff;font-weight:600;font-size:12.5px;}
.tc-stat.is-on{background:rgba(255,140,90,.16);color:#ffcbb0;}
.tc-stat.is-on b{color:#ffb08a;}
.tc-troublebtn{background:rgba(255,190,90,.1);border:1px solid rgba(255,190,90,.28);color:#ffd9a0;}



/* ── oral exam ── */
.tc-talkja{margin:0;font-size:23px;line-height:1.65;color:#fff;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-talkrom{margin:0;font-size:14px;line-height:1.6;color:var(--shu-soft,#ff8a7a);font-style:italic;}
.tc-talkcue{display:flex;flex-direction:column;gap:7px;align-items:center;padding:14px 0;}
.tc-talkcuename{margin:0;font-size:26px;font-weight:600;color:#fff;font-family:"Hiragino Sans","Yu Gothic",sans-serif;}
.tc-talkcueword{font-size:19px;color:#ffd9a0;font-family:"Hiragino Sans","Yu Gothic",sans-serif;}
.tc-talknote{margin:0;font-size:12px;color:var(--mut-2);font-style:italic;}
.tc-talkpitch{margin:0;font-size:13px;line-height:1.6;color:#b6efc4;background:rgba(61,145,80,.12);border-radius:8px;padding:6px 11px;}
.tc-talkpitch b{color:#fff;}
.tc-oral{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}
.tc-oralsit{text-align:left;display:flex;flex-direction:column;gap:3px;align-items:flex-start;padding:12px 14px;}
.tc-oralsit b{font-size:15px;font-weight:600;color:#fff;}
.tc-oralsit i{font-style:normal;font-size:12px;color:var(--mut-2);}
.tc-prop{background:#fdfbf5;color:#2b2119;border-radius:12px;padding:14px 16px;text-align:center;
  box-shadow:0 8px 22px -12px rgba(0,0,0,.6);}
.tc-flyer{border-top:5px solid #c23a26;}
.tc-receipt{font-family:"SF Mono",Menlo,Consolas,monospace;text-align:left;}
.tc-budget{text-align:left;background:#f2efe6;}
.tc-propttl{margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.tc-propbig{margin:2px 0;font-size:19px;font-weight:700;}
.tc-propline{margin:2px 0;font-size:14px;}
.tc-propsmall{margin:6px 0 0;font-size:12px;opacity:.7;}
.tc-oralcard{align-items:stretch;text-align:left;gap:9px;padding:15px;}
.tc-oralwho{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--shu-soft,#ff8a7a);}
.tc-oralq{margin:0;font-size:22px;line-height:1.5;color:#fff;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-oralcue{margin:4px 0 0;font-size:13px;color:var(--mut-2);font-style:italic;}
.tc-oralen{margin:0;font-size:13.5px;color:var(--mut-2);}
.tc-orala{margin:0;font-size:19px;line-height:1.6;color:#b6efc4;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-oralg{margin:0;font-size:12px;color:#ffd9a0;background:rgba(255,190,90,.1);border-radius:7px;padding:5px 10px;align-self:flex-start;}

/* ── kanji ── */
.tc-kemoji{font-size:44px;line-height:1;margin-bottom:2px;}
.tc-kaudio{appearance:none;border:0;background:rgba(124,92,255,.2);color:#fff;font-size:38px;
  width:96px;height:96px;border-radius:50%;cursor:pointer;line-height:1;}
.tc-kaudio:active{transform:scale(.95);}
.tc-kaudiosm{appearance:none;border:0;background:transparent;font-size:20px;cursor:pointer;padding:0 6px;}
.tc-kmatch{display:flex;flex-direction:column;align-items:center;gap:14px;padding:6px 0;}
.tc-kmatchgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%;max-width:400px;}
.tc-kmatchcol{display:flex;flex-direction:column;gap:9px;}
.tc-kmatchbtn{appearance:none;font:inherit;font-size:15px;color:var(--washi,#efeae2);
  background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.14);border-radius:12px;
  padding:12px 8px;min-height:56px;cursor:pointer;transition:background .12s,border-color .12s,opacity .2s;}
.tc-kmatchkanji{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:30px;line-height:1;}
.tc-kmatchbtn.is-sel{border-color:#7c5cff;background:rgba(124,92,255,.2);}
.tc-kmatchbtn.is-done{opacity:.28;border-color:#3d9150;}
.tc-kmatchbtn.is-bad{border-color:#c23a26;background:rgba(194,58,38,.2);}
.tc-kwords{display:flex;flex-direction:column;gap:3px;margin:8px 0 0;align-items:center;}
.tc-kword{font-size:13px;color:var(--mut-2);}
.tc-kword b{color:var(--washi,#efeae2);font-weight:600;margin-right:6px;font-size:15px;}
.tc-kquiz{display:flex;flex-direction:column;align-items:center;gap:14px;padding:6px 0 4px;}
.tc-kprompt{margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut-2);}
.tc-kstem{display:flex;align-items:center;gap:10px;min-height:74px;}
.tc-kstemword{font-size:26px;font-weight:600;color:#fff;text-align:center;max-width:320px;line-height:1.3;}
.tc-kopts{display:grid;grid-template-columns:1fr;gap:9px;width:100%;max-width:340px;}
.tc-kopts.is-tiles{grid-template-columns:1fr 1fr;}
.tc-kopt{appearance:none;font:inherit;font-size:16px;color:var(--washi,#efeae2);background:rgba(255,255,255,.05);
  border:1.5px solid rgba(255,255,255,.14);border-radius:12px;padding:14px 12px;cursor:pointer;min-height:52px;
  transition:background .12s,border-color .12s,transform .08s;}
.tc-kopt:active{transform:scale(.98);}
.tc-kopttile{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:38px;line-height:1;}
.tc-kopt.is-right{background:rgba(61,145,80,.22);border-color:#3d9150;color:#b6efc4;}
.tc-kopt.is-wrong{background:rgba(194,58,38,.2);border-color:#c23a26;color:#ffc0b4;}
.tc-kopt.is-dim{opacity:.4;}
.tc-kcorrect.is-ok{color:#b6efc4;background:rgba(61,145,80,.14);}
.tc-kaudiowrap{display:flex;flex-direction:column;align-items:center;gap:9px;}
.tc-kcorrect{margin:0;font-size:14px;line-height:1.6;color:#ffd9a0;background:rgba(255,190,90,.1);
  border-radius:10px;padding:9px 13px;text-align:center;max-width:340px;}
.tc-kcorrect b{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:22px;margin-right:6px;}
.tc-kanji{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}
.tc-kanjihero{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:13px 14px;}
.tc-kanjiheroright{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;}
.tc-kanjicount{margin:0;font-size:13px;color:var(--mut-2);}
.tc-kanjicount b{font-size:26px;color:#fff;font-weight:600;margin-right:4px;}
.tc-kanjibar{height:9px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;}
.tc-kanjibarfill{height:100%;border-radius:99px;background:linear-gradient(90deg,#f4805c,#ffd76e);transition:width .6s ease;}
.tc-kanjisub{margin:0;font-size:12px;color:var(--mut-2);}
.tc-kanjibig{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:110px;line-height:1.05;color:#fff;}
.tc-kanjimid{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:56px;line-height:1;color:#fff;margin-bottom:4px;}
.tc-kanjiread{font-size:15px;color:var(--washi,#efeae2);letter-spacing:.02em;}
.tc-kanjiread b{color:var(--shu-soft,#ff8a7a);font-weight:600;margin-right:5px;font-size:13px;}
.tc-kanjinext{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:11px 13px;}
.tc-kanjirow{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px;}
.tc-kanjichip{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:24px;color:#fff;background:rgba(255,255,255,.07);border-radius:9px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;}
.tc-dates{display:flex;flex-direction:column;gap:12px;}
.tc-dhead{display:flex;align-items:center;gap:10px;}
.tc-dtitle{margin:0;font-size:17px;color:#fff;}
.tc-dhero{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 0 2px;}
.tc-dwide{width:100%;max-width:420px;align-self:center;}
.tc-dgroups{display:flex;flex-direction:column;gap:8px;margin-top:4px;}
.tc-dgroup{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);}
.tc-dgroupinfo{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}
.tc-dgroupinfo b{color:#fff;font-size:14px;}
.tc-dgrouphint{font-size:12px;color:var(--mut-2);}
.tc-dbar{height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:2px;}
.tc-dbarfill{height:100%;background:#3d9150;border-radius:2px;transition:width .3s;}
.tc-dgroupbtns{display:flex;gap:6px;flex-shrink:0;}
.tc-dchart{display:flex;flex-direction:column;gap:4px;max-height:60vh;overflow-y:auto;padding-right:2px;}
.tc-drow{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;text-align:left;
  padding:8px 12px;border-radius:9px;cursor:pointer;color:#fff;
  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);}
.tc-drow.is-trap{border-color:rgba(255,120,110,.45);background:rgba(255,120,110,.09);}
.tc-drow.is-solid{border-left:3px solid #3d9150;}
.tc-drowk{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:17px;min-width:62px;}
.tc-drowr{font-size:15px;color:#ffd9a0;}
.tc-drowe{font-size:12px;color:var(--mut-2);}
.tc-dcard,.tc-dq{display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 0;}
.tc-dstem{display:flex;flex-direction:column;align-items:center;gap:4px;margin:4px 0 8px;}
.tc-dbig{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:46px;line-height:1.1;color:#fff;}
.tc-dseqen{font-size:22px;line-height:1.35;color:#fff;text-align:center;max-width:340px;}
.tc-dread{font-size:20px;color:#ffd9a0;}
.tc-den{font-size:14px;color:var(--mut-2);}
.tc-dnote{margin:2px 0;font-size:13px;color:#ffb3ab;text-align:center;max-width:340px;}
.tc-dtype{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;max-width:420px;}
.tc-dinput{width:100%;padding:12px 14px;border-radius:11px;font-size:16px;color:#fff;
  background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.16);outline:none;}
.tc-dinput:focus{border-color:#7c5cff;}
.tc-dkana{min-height:30px;font-size:24px;color:#ffd9a0;letter-spacing:.04em;}
/* Pinned to the bottom of the viewport. In normal flow this sat below the fold on a
   phone, so the correct answer and the Continue button were both invisible and answering
   looked like it did nothing. */
.tc-dfeedwrap{position:fixed;left:0;right:0;bottom:0;z-index:40;
  padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));
  background:#3a1f1f;border-top:2px solid rgba(255,120,110,.55);
  animation:tc-dfeedin .18s ease-out;}
.tc-dfeedwrap.is-ok{background:#16301d;border-top-color:rgba(88,190,110,.6);}
/* Fade only. Sliding it in meant the final resting position depended on the animation
   having finished — a backgrounded tab leaves the transform at its first frame and the
   banner sits low, half off the screen. Opacity cannot strand it anywhere. */
@keyframes tc-dfeedin{from{opacity:0;}to{opacity:1;}}
.tc-dfeed{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;max-width:420px;margin:0 auto;}
.tc-dfeedhead{display:flex;align-items:center;gap:8px;align-self:flex-start;}
.tc-dfeedmark{font-size:22px;line-height:1;color:#ff8f84;}
.tc-dfeedwrap.is-ok .tc-dfeedmark{color:#7fdc95;}
.tc-dfeedverdict{font-size:16px;font-weight:700;color:#ff8f84;}
.tc-dfeedwrap.is-ok .tc-dfeedverdict{color:#7fdc95;}
.tc-dfeedyours{margin:0;align-self:flex-start;font-size:13px;color:#ffc9c3;}
.tc-dfeedyours b{font-weight:600;text-decoration:line-through;}
.tc-dfeedans{margin:0;align-self:flex-start;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;}
.tc-dfeedans b{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:21px;color:#fff;}
.tc-dfeedread{font-size:19px;color:#ffd9a0;font-weight:600;}
.tc-dfeedsub{margin:0;align-self:flex-start;font-size:12.5px;color:#cfd3dc;text-align:left;}
/* the question must be able to scroll clear of the pinned banner */
.tc-dq{padding-bottom:210px;}
.tc-oralinit{border-color:rgba(124,92,255,.55);background:rgba(124,92,255,.09);}
.tc-oralwhoyou{color:#b9a6ff;font-weight:700;}
.tc-oralqinit{font-size:17px;line-height:1.4;color:#fff;}
.tc-oralcheck{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 13px;
  background:rgba(255,255,255,.03);}
.tc-oralcheck summary{cursor:pointer;font-size:13.5px;color:#ffd9a0;font-weight:600;}
.tc-oralchecklist{margin:9px 0 0;display:flex;flex-direction:column;gap:7px;}
.tc-oralchecklist div{display:flex;flex-direction:column;gap:1px;}
.tc-oralchecklist dt{font-size:13px;font-weight:700;color:#fff;}
.tc-oralchecklist dd{margin:0;font-size:12.5px;color:var(--mut-2);line-height:1.4;}
.tc-kgrid{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.tc-kcell{appearance:none;font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:24px;line-height:1;
  width:44px;height:44px;border-radius:9px;cursor:pointer;color:#fff;
  border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);transition:transform .08s;}
.tc-kcell:active{transform:scale(.93);}
.tc-kcell.is-new{border-color:rgba(255,255,255,.14);}
.tc-kcell.is-ok{border-color:rgba(255,190,90,.5);background:rgba(255,190,90,.1);}
.tc-kcell.is-solid{border-color:#3d9150;background:rgba(61,145,80,.18);}
.tc-kmodal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;
  justify-content:center;padding:20px;z-index:50;}
.tc-kmodalcard{position:relative;background:#1b2030;border:1px solid rgba(255,255,255,.12);border-radius:18px;
  padding:22px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;max-width:340px;width:100%;
  max-height:82vh;overflow-y:auto;}
.tc-kcloze{display:flex;flex-direction:column;align-items:center;gap:6px;}
.tc-kclozeword{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:40px;
  line-height:1.15;color:#fff;letter-spacing:.02em;}
.tc-kblank{color:#7c5cff;font-weight:400;}
.tc-kclozeen{font-size:14px;color:var(--mut-2);}
.tc-kmark{color:#ffbe5a;font-size:11px;font-weight:700;margin-right:5px;vertical-align:2px;}
.tc-kcontinue{width:100%;max-width:340px;margin-top:4px;}
.tc-kstat{margin:2px 0 0;font-size:12px;color:var(--mut-2);}
.tc-kanjicredit{margin:4px 0 0;font-size:10.5px;line-height:1.5;color:var(--mut-2);opacity:.75;text-align:center;}
@media (max-width:460px){.tc-kanjibig{font-size:88px;}}

/* ── 入力 / input ── */
.tc-input{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}
.tc-inlevels{display:flex;gap:10px;}
.tc-inlevel{flex:1;display:flex;flex-direction:column;gap:5px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:10px 12px;}
.tc-inlevlabel{font-size:12px;color:var(--mut-2);}
.tc-inlevlabel i,.tc-inband i{font-style:normal;opacity:.55;font-size:.85em;}
.tc-bi{display:inline-flex;flex-direction:column;align-items:center;line-height:1.15;gap:1px;}
.tc-bi small{font-size:10px;opacity:.6;font-weight:400;letter-spacing:.02em;}
.tc-inpickja{display:block;font-style:normal;font-size:13px;font-weight:400;color:var(--mut-2);margin-top:2px;}
.tc-inloading{color:var(--mut-2);font-weight:400;font-size:15px;}
.tc-inloading::after{content:"";display:inline-block;width:1em;text-align:left;animation:tc-dots 1.2s steps(4,end) infinite;}
@keyframes tc-dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.tc-inbar{height:5px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;}
.tc-inbarfill{height:100%;background:linear-gradient(90deg,var(--shu-soft,#ff8a7a),var(--shu));border-radius:999px;transition:width .4s ease;}
.tc-inband{font-size:13.5px;color:#fff;font-weight:500;}
.tc-inrate{background:rgba(255,190,90,.08);border:1px solid rgba(255,190,90,.22);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;}
.tc-inrateitem{display:flex;flex-direction:column;gap:8px;}
.tc-inraterow1{display:flex;align-items:center;gap:8px;}
.tc-inratetitle{flex:1;min-width:0;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc-inx{appearance:none;border:0;background:transparent;color:var(--mut-2);font-size:20px;line-height:1;cursor:pointer;padding:0 4px;min-height:32px;}
.tc-inverdicts{display:flex;gap:6px;flex-wrap:wrap;}
.tc-inpicks{display:flex;flex-direction:column;gap:10px;}
.tc-inpick{align-items:stretch;text-align:left;gap:6px;padding:14px;}
.tc-inpicktop{display:flex;align-items:center;gap:8px;}
.tc-indots{display:inline-flex;gap:3px;}
.tc-indot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.18);}
.tc-indot.is-on{background:var(--shu-soft,#ff8a7a);}
.tc-indotlabel{font-size:12px;color:var(--mut-2);}
.tc-inpicktitle{margin:2px 0 0;font-size:17px;font-weight:600;color:#fff;line-height:1.35;}
.tc-inpickmeta{margin:0;font-size:12.5px;color:var(--mut-2);}
.tc-inpicknote{margin:4px 0 0;font-size:12.5px;line-height:1.5;color:rgba(255,255,255,.62);}
.tc-intools{justify-content:center;}
.tc-innote{margin:0;text-align:center;font-size:12.5px;color:var(--shu-soft,#ff8a7a);}
.tc-inpanel{align-items:stretch;text-align:left;gap:10px;padding:14px;}
.tc-inarea{min-height:120px;resize:vertical;font-size:16px;line-height:1.6;}
.tc-incover{margin:0;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;font-size:17px;line-height:1.7;color:#ffd9a0;}
@media (max-width:460px){.tc-inpicktitle{font-size:15.5px;}.tc-inlevel{padding:9px 10px;}}
.tc-root::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:99;opacity:.05;mix-blend-mode:soft-light;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.tc-root :is(button,[role="tab"]):focus-visible{outline:2px solid var(--shu-soft);outline-offset:2px;border-radius:inherit;}
@media (prefers-reduced-motion:reduce){.tc-root *{transition:none !important;animation:none !important;}}
`;

/* ── mount ── */
import ReactDOM from "react-dom/client";
ReactDOM.createRoot(document.getElementById("root")).render(<JpnFlashcards />);
