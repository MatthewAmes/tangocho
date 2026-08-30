/* Comprehensible-input sources, and the level bands used to describe them. */

// Which sources the Worker can resolve to individual episodes. Kept in step with FEEDS
// in cf/src/index.js — the ids must match or the source silently falls back to its
// channel link. tools/check-feeds.mjs fails the build if they drift.
export const FEED_SOURCES = new Set([
  "ci-natural", "ci-tanaka", "ci-peppa", "ci-shun", "yt-sayuri", "yt-akane", "yt-miku",
  "yt-onomappu", "yt-gamegengo", "yt-yuyu", "pod-yuyu", "yt-sambon", "pod-teppei-beg",
  "rd-nhkeasier", "rd-yomujp", "rd-watanoc", "rd-crunchy",
]);

export const INPUT_CATALOG = [
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

export const INPUT_VERDICTS = {
  too_easy:   { user: +4, item: -3, en: "Too easy",   ja: "簡単すぎ" },
  just_right: { user: +1, item: null, en: "Just right", ja: "ちょうどいい" },
  too_hard:   { user: -2, item: +3, en: "Hard",       ja: "難しい" },
  lost:       { user: -4, item: +6, en: "Lost me",    ja: "わからなかった" },
};

export const INPUT_PLANS = [
  { id: "listen",  label: "Listen",     ja: "聞く",   mode: "active",  medium: "listening" },
  { id: "read",    label: "Read",       ja: "読む",   mode: "active",  medium: "reading" },
  { id: "passive", label: "Background", ja: "ながら", mode: "passive", medium: "listening" },
];

export const INPUT_TIMES = [5, 15, 30, 60];

export const INPUT_BANDS = [["Starter", "入門"], ["Beginner", "初級"], ["Upper beginner", "初中級"],
                     ["Intermediate", "中級"], ["Upper intermediate", "中上級"], ["Advanced", "上級"]];
