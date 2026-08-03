// The curated channel list behind the video index.
//
// Hand-picked, not taken from search results as-is. Discovery surfaced plenty of channels
// that match a Japanese-language query while being useless here: 聞き流し韓国語CH teaches
// Korean, 毎日中国語の聞き流し teaches Chinese, ¡HOLA! 独学スペイン語 teaches Spanish, and
// 日本語教え方講座 teaches teachers how to teach. All are Japanese-language channels. None
// of them are Japanese practice.
//
// Excluded on the stated preference for immersion over explanation: Game Gengo and
// 三本塾 (grammar lectures in English), and YUYU NIHONGO, which is a Spanish-language
// channel — its recent uploads are titled "TRABAJOS DE MEDIO TIEMPO EN JAPÓN".
//
// audience: "kids" flags children's programming so it can be filtered or sought out —
// simple language, subject matter that may or may not hold an adult's attention.
// anchor: rough starting difficulty 0-100 on the same scale the app's Input tab uses.
// It only seeds the estimate; per-video scoring and real ratings move it from there.

export const CHANNELS = [
  // ── purpose-built comprehensible input ──
  { id: "UCXo8kuCtqLjL1EH6m4FJJNA", name: "Natural Japanese (NIJ)", anchor: 14, audience: "adult", tags: ["ci", "story", "slice-of-life"] },
  { id: "UCvryaJCRHcTVjOC_DcuYxGg", name: "Learn Japanese with Tanaka san", anchor: 16, audience: "adult", tags: ["ci", "story"] },
  { id: "UCLp9rnRAcrFSzsoXsjXYJYA", name: "Japanese super immersion", anchor: 20, audience: "adult", tags: ["ci", "immersion"] },
  { id: "UCdZHET-9_Comx6UaVTSETiQ", name: "にほんごのじかん", anchor: 18, audience: "adult", tags: ["ci"] },
  { id: "UCpqNTQxGWArbe4EI_5kJ4Rg", name: "Masa — Comprehensible Input Japanese", anchor: 20, audience: "adult", tags: ["ci"] },
  { id: "UCLSn0RJO6UkvN62xi7nbMGQ", name: "まなの日本語", anchor: 22, audience: "adult", tags: ["ci"] },
  { id: "UCIciBLpZ6BP2XNYTFXb6eRQ", name: "Japanese Immersion with Asami", anchor: 24, audience: "adult", tags: ["ci", "immersion"] },
  { id: "UClhb5O25iudl-ffJ_ad-zeg", name: "Tokyo Slow Japanese", anchor: 24, audience: "adult", tags: ["ci", "slow"] },
  { id: "UCuUEuD5xLI5dwbMEbGR7BmA", name: "Slow Japanese", anchor: 24, audience: "adult", tags: ["ci", "slow"] },
  { id: "UCbD78bfxT7taUJsTLA2CkKw", name: "Slow Japanese Listening", anchor: 26, audience: "adult", tags: ["ci", "slow"] },
  { id: "UCu6sZrHyl4hSS2PvlUo2XZA", name: "Japanese with Shun", anchor: 26, audience: "adult", tags: ["ci", "vlog"] },
  { id: "UCgG7oz-Oq-7Etn0_bz0WimQ", name: "いろいろな日本語", anchor: 28, audience: "adult", tags: ["ci"] },
  { id: "UC6nyP5gdd9OZbeG-w_FukAg", name: "日本語アカデミー", anchor: 30, audience: "adult", tags: ["ci"] },

  // ── podcasts and conversation ──
  { id: "UC16-9M0osgdFbLKXvCwpXaw", name: "EASY JAPANESE PODCAST", anchor: 28, audience: "adult", tags: ["podcast", "chat"] },
  { id: "UCqRoGBcr5fESDTUf5n8kw4Q", name: "Japanese Podcast with Hana", anchor: 30, audience: "adult", tags: ["podcast", "chat"] },
  { id: "UCxOlPQvSWn_MmIL7XoKwBLg", name: "Japanese Daily Podcast", anchor: 30, audience: "adult", tags: ["podcast", "daily"] },
  { id: "UC6p3qnTVoQHG7L3fqugSOfg", name: "Japanese Podcast for Beginners", anchor: 26, audience: "adult", tags: ["podcast"] },
  { id: "UCHGG3r0AOPgc88OKka45UWw", name: "MAIの日本語Podcast", anchor: 32, audience: "adult", tags: ["podcast", "chat"] },
  { id: "UC_lynzl0m1QQD3ggIDgYCEw", name: "Akiko Japanese Conversations", anchor: 30, audience: "adult", tags: ["conversation"] },
  { id: "UCnOM3Fn4ds0W2u4KFz6H-Nw", name: "日本語スキット工房", anchor: 28, audience: "adult", tags: ["skit", "conversation"] },
  { id: "UCMavqVxup6wXeP0Mxsat-qQ", name: "耳で味わう日本語", anchor: 32, audience: "adult", tags: ["listening"] },
  { id: "UCHd9z6lj2vzHpP0878YYsGw", name: "Japanese Shadowing", anchor: 30, audience: "adult", tags: ["shadowing", "drill"] },

  // ── native content that learners can follow ──
  { id: "UCqMY-cp1He6IAi1cIz-gX1g", name: "Sayuri Saying", anchor: 36, audience: "adult", tags: ["chat", "culture"] },
  { id: "UCh-GhnQ7qDQmS6Bz3pGc1Mw", name: "あかね的日本語教室", anchor: 36, audience: "adult", tags: ["vlog", "ci"] },
  { id: "UCSbH_BPR_AoARW6RDYLlLog", name: "Speak Japanese Naturally", anchor: 40, audience: "adult", tags: ["chat", "slice-of-life"] },
  { id: "UCLuymDHiOySsAQ9Nc-4NoEQ", name: "Onomappu", anchor: 45, audience: "adult", tags: ["culture", "street"] },
  { id: "UC_ZrBzYZRYIKEl3naLM4QBw", name: "さきちゃん vlog", anchor: 48, audience: "adult", tags: ["vlog", "native"] },
  { id: "UCc8dYnHr_xJsZGndDz1vTig", name: "peko peko vlog", anchor: 50, audience: "adult", tags: ["vlog", "native", "food"] },
  { id: "UCw3zMS1Z_fSpzAcqNMCg-Eg", name: "ゆっくり地理にっぽん", anchor: 55, audience: "adult", tags: ["native", "geography"] },
  { id: "UCWNkrzmC1XpWFCDBDs2dShA", name: "Japan Foundation 国際交流基金", anchor: 34, audience: "adult", tags: ["lesson", "culture"] },

  // ── stories, folk tales, narration ──
  { id: "UCS3i7Lbf-0TOsFU_tc5gcug", name: "Japanese Fairy Tales", anchor: 30, audience: "all", tags: ["folktale", "story"] },
  { id: "UCEpIoMesbGSOG7d4dlanM-A", name: "江戸昔ばなし朗読", anchor: 42, audience: "all", tags: ["folktale", "narration"] },
  { id: "UCjfv1BvYpUh62Si-GL_xl3Q", name: "熊崎友香のぐっすりおやすみ朗読", anchor: 44, audience: "adult", tags: ["narration", "sleep", "passive"] },
  { id: "UC0ln36enFlL46fZgfZJuXLg", name: "佐藤くみこの優しいおやすみ朗読", anchor: 44, audience: "adult", tags: ["narration", "sleep", "passive"] },

  // ── children's programming: simplest language available ──
  { id: "UCldXjuJ7Qg8wTNktOnVXkGw", name: "ペッパピッグ 公式チャンネル", anchor: 18, audience: "kids", tags: ["kids", "anime", "story"] },
  { id: "UC9FJn6McE4XEv5pj5jimKyQ", name: "Cry Babies 日本語", anchor: 20, audience: "kids", tags: ["kids", "anime"] },
  { id: "UCZEIEZ4R80SrkhemRIdMCFg", name: "ビング 日本語公式チャンネル", anchor: 16, audience: "kids", tags: ["kids", "anime"] },
  { id: "UCmjMVnTn44KUU_Ous1tKjOA", name: "とんとん こども向けアニメ", anchor: 18, audience: "kids", tags: ["kids", "anime"] },
];

// Titles that mean "this video contains little or no speech". Study-along timers and
// background-music tracks score as easy Japanese because nothing in their metadata says
// otherwise, and they are worth nothing as listening practice. Shared by the indexer and
// the packer so the rule is applied in one place.
export const SILENT_TITLE = /lofi|lo-?fi|study\s*(with|timer|session)|作業用|勉強用|bgm|instrumental|睡眠導入音|ambient/i;

// Recordings this long are films and stage performances, not study sessions.
export const MAX_SECONDS = 7200;

// Channels deliberately left out, recorded so a future refresh doesn't "helpfully" re-add
// them. Keyed by channel id where known.
export const REJECTED = {
  "UCru-Nq6ymuYMZGWLfAXepag": "teaches Korean, in Japanese",
  "UC7Ol58UGSFIZ_w0eYqg57-A": "teaches Chinese, in Japanese",
  "UCktwSjzwR09UGVcXed_SwNQ": "teaches Chinese, in Japanese",
  "UCZMXJD4jPlolSB73sT-63Ew": "teaches Spanish, in Japanese",
  "UCPBBt0sBYee4neuQK7h1xGA": "teaches English, in Japanese",
  "UCCyQwSS6m2mVB0-H2FOFJtw": "YUYU NIHONGO — explanation is in Spanish",
  "UCX_TJgxD8Oi307Ea33Mdfww": "trains Japanese teachers; about teaching, not input",
  "UCk7X9eGYKFI4HVg7WskbgPQ": "trains Japanese teachers",
  "UCNrbqWLqBQo9AYAfkrhP7nw": "trains Japanese teachers",
  "UCsXJuG5tSNRr9IwfjMbNvqQ": "Game Gengo — grammar explained in English",
  "UC0ujXryUUwILURRKt9Eh7Nw": "三本塾 — grammar lectures",
};
