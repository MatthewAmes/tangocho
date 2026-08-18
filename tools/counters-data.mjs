// Dates, times and counters — the readings, the sound changes, and the traps.
//
// This is the part of JPN 101 that is pure memorisation with no way to reason your way
// out mid-sentence. 四月 is しがつ and never よんがつ; 二十日 is はつか and never
// にじゅうにち; 一分 is いっぷん and 三分 is さんぷん and 六分 is ろっぷん. Reading it off
// a chart is easy and recalling it under exam pressure is not, which is the whole reason
// this file exists as drillable data rather than a reference table in the app.
//
// Everything is written out or generated from an explicit rule and then checked by
// tools/test-counters.mjs. A wrong reading here would be worse than no drill at all.
import { numReading, DAY_READING as DAY_1_30, MONTH_READING, HOUR_READING, WEEKDAYS } from "./oral-data.mjs";

export { numReading, MONTH_READING, HOUR_READING, WEEKDAYS };

/* The oral-final props never needed the 31st because no month in the generated range ran
   that long. A midterm can ask for it. */
export const DAY_READING = { ...DAY_1_30, 31: "さんじゅういちにち" };

export const MONTH_KANJI = ["", "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月"];

export const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ── sound-change machinery ──
   Japanese counters change shape after 1, 3, 6, 8 and 10 in patterns that depend on the
   counter's initial consonant. Rather than hand-type sixteen ten-row tables and hope, each
   counter declares which pattern it follows and the table is generated; the exceptions that
   follow no pattern are listed explicitly and win. */

const STEM = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう", "じゅう"];

/* k-, s-, t- initial counters (個 冊 週間 ヶ月): 1, 8, 10 geminate to っ. */
function kPattern(base) {
  return (n) => {
    if (n === 1) return "いっ" + base;
    if (n === 8) return "はっ" + base;
    if (n === 10) return "じゅっ" + base;
    return (STEM[n] || numReading(n)) + base;
  };
}

/* h-initial counters (分 匹 杯): 1, 6, 8, 10 geminate and the h becomes p; 3 voices to b.
   These are the ones an examiner listens for. */
function hPattern(p, b, h) {
  return (n) => {
    if (n === 1) return "いっ" + p;
    if (n === 3) return "さん" + b;
    if (n === 6) return "ろっ" + p;
    if (n === 8) return "はっ" + p;
    if (n === 10) return "じゅっ" + p;
    return (STEM[n] || numReading(n)) + h;
  };
}

/* No sound change at all — just the plain number plus the counter (枚 台 番 人 from 3 up). */
function plain(base) {
  return (n) => (STEM[n] || numReading(n)) + base;
}

function withIrregulars(fn, irregulars) {
  return (n) => (irregulars[n] !== undefined ? irregulars[n] : fn(n));
}

/* ── days of the month: the rule behind each irregular one ──
   The 1st through the 10th are not arbitrary. They are the native counting words — ふたつ,
   みっつ, よっつ — ending in か instead of つ. Learned as nine unrelated sounds they are
   nine things to forget; learned as one swap they are one rule with a few vowel shifts.
   The old note said only "the first ten days use native readings", which states that a
   pattern exists without saying what it is.

   Past ten the rule is number + にち, and every exception is one of three things: the 4th's
   よっか carrying up into 14 and 24, 七 and 九 keeping their しち and く readings, and 二十日
   being its own word. The 14th, 17th, 19th, 24th, 27th and 29th previously had no note at
   all — they were flagged as traps and then explained nothing when missed. */
const DAY_NOTE = {
  1: "ついたち — its own word, from the month starting. Never いちにち.",
  2: "ふたつ → ふつか. Native number, か instead of つ.",
  3: "みっつ → みっか.",
  4: "よっつ → よっか. Never よんにち — and 14 and 24 keep this too.",
  5: "いつつ → いつか.",
  6: "むっつ → むいか.",
  7: "ななつ → なのか.",
  8: "やっつ → ようか.",
  9: "ここのつ → ここのか.",
  10: "とお → とおか. Last of the native ones; 11 onward is number + にち.",
  14: "じゅう + よっか. The 4th's reading carries up — never じゅうよんにち.",
  17: "しち, not なな — じゅうしちにち.",
  19: "く, not きゅう — じゅうくにち.",
  20: "はつか — its own word, not にじゅうにち. Same はつ as はたち, 20 years old.",
  24: "にじゅう + よっか, exactly like the 14th.",
  27: "しち again — にじゅうしちにち.",
  29: "く again — にじゅうくにち.",
};

/* Extra pull in the session scorer, by how hard the item actually is to recall rather than
   by whether it is irregular at all. 一日 and 二十日 are single words with nothing to derive
   them from; the native ten share one rule; 十四日 and 二十四日 only need the 4th; and the
   しち/く days are regular apart from which reading of the digit wins. */
const DAY_WEIGHT = {
  1: 1.4, 20: 1.4,
  2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0, 7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0,
  14: 1.1, 24: 1.1,
  17: 0.7, 19: 0.7, 27: 0.7, 29: 0.7,
};

/* ── the counters his course actually teaches ──
   Taken from the vocabulary deck rather than a general list, so nothing here is a counter
   he has never been shown and everything he has been shown is here. `traps` marks the
   values whose reading cannot be guessed from the number; those get drilled harder. */
export const COUNTERS = [
  {
    id: "tsu", suffix: "つ", label: "〜つ", what: "things (general, native numbers)",
    note: "The all-purpose counter when you do not know the right one. Native numbers, and it stops at 10 — past that use plain じゅういち.",
    max: 10, traps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    kanji: (n) => ["", "一つ", "二つ", "三つ", "四つ", "五つ", "六つ", "七つ", "八つ", "九つ", "十"][n],
    read: (n) => ["", "ひとつ", "ふたつ", "みっつ", "よっつ", "いつつ", "むっつ", "ななつ", "やっつ", "ここのつ", "とお"][n],
  },
  {
    id: "nin", suffix: "人", label: "〜人", what: "people",
    note: "ひとり and ふたり are native words, not numbers plus 人. From three up it is regular except 四人 よにん.",
    traps: [1, 2, 4, 7],
    read: withIrregulars(plain("にん"), { 1: "ひとり", 2: "ふたり", 4: "よにん", 7: "しちにん" }),
  },
  {
    id: "ji", suffix: "時", label: "〜時", what: "o'clock",
    note: "Four, seven and nine are irregular: よじ, しちじ, くじ. Never よんじ or きゅうじ.",
    max: 12, traps: [4, 7, 9],
    read: (n) => HOUR_READING[n],
  },
  {
    id: "fun", suffix: "分", label: "〜分", what: "minutes",
    note: "The heaviest sound changes in the course. 1, 3, 4, 6, 8, 10 all shift, and 4 is よん not よ.",
    max: 59, traps: [1, 3, 4, 6, 8, 10],
    /* Past ten the sound change follows the final digit, and a round ten drops the う
       before っぷん: にじゅう + ふん would be にじゅうふん, but it is にじゅっぷん. */
    read: (n) => {
      const base = withIrregulars(hPattern("ぷん", "ぷん", "ふん"), { 4: "よんぷん" });
      if (n <= 10) return base(n);
      const ones = n % 10;
      if (!ones) return numReading(n).replace(/う$/, "") + "っぷん";
      return numReading(n - ones) + base(ones);
    },
  },
  {
    id: "ko", suffix: "個", label: "〜個", what: "small objects",
    note: "Regular k-pattern: いっこ, ろっこ, はっこ, じゅっこ.",
    traps: [1, 6, 8, 10],
    read: withIrregulars(kPattern("こ"), { 6: "ろっこ" }),
  },
  {
    id: "mai", suffix: "枚", label: "〜枚", what: "flat things — paper, shirts, tickets",
    note: "No sound changes at all. One of the easy ones.",
    traps: [],
    read: plain("まい"),
  },
  {
    id: "satsu", suffix: "冊", label: "〜冊", what: "bound volumes — books, notebooks",
    note: "いっさつ, はっさつ, じゅっさつ.",
    traps: [1, 8, 10],
    read: kPattern("さつ"),
  },
  {
    id: "hiki", suffix: "匹", label: "〜匹", what: "small animals",
    note: "Full h-pattern including the voiced さんびき.",
    traps: [1, 3, 6, 8, 10],
    read: hPattern("ぴき", "びき", "ひき"),
  },
  {
    id: "dai", suffix: "台", label: "〜台", what: "machines & vehicles — cars, TVs, phones",
    note: "No sound changes.",
    traps: [],
    read: plain("だい"),
  },
  {
    id: "hai", suffix: "杯", label: "〜杯", what: "cupfuls, glassfuls",
    note: "Full h-pattern: いっぱい, さんばい, ろっぱい, はっぱい, じゅっぱい.",
    traps: [1, 3, 6, 8, 10],
    read: hPattern("ぱい", "ばい", "はい"),
  },
  {
    id: "ban", suffix: "番", label: "〜番", what: "position in a series — number 1, number 2",
    note: "No sound changes.",
    traps: [],
    read: plain("ばん"),
  },
  {
    id: "jikan", suffix: "時間", label: "〜時間", what: "duration in hours",
    note: "Same irregulars as 〜時: よじかん, しちじかん, くじかん.",
    traps: [4, 7, 9],
    read: withIrregulars(plain("じかん"), { 4: "よじかん", 7: "しちじかん", 9: "くじかん" }),
  },
  {
    id: "shuukan", suffix: "週間", label: "〜週間", what: "duration in weeks",
    note: "k-pattern on しゅうかん: いっしゅうかん, はっしゅうかん, じゅっしゅうかん.",
    traps: [1, 8, 10],
    read: kPattern("しゅうかん"),
  },
  {
    id: "kagetsu", suffix: "ヶ月", label: "〜ヶ月", what: "duration in months",
    note: "k-pattern, and 6 also geminates: ろっかげつ.",
    traps: [1, 6, 8, 10],
    read: withIrregulars(kPattern("かげつ"), { 6: "ろっかげつ" }),
  },
  {
    id: "nenkan", suffix: "年間", label: "〜年間", what: "duration in years",
    note: "四年間 is よねんかん, not よんねんかん.",
    traps: [4, 7],
    read: withIrregulars(plain("ねんかん"), { 4: "よねんかん", 7: "しちねんかん" }),
  },
  {
    id: "nichikan", suffix: "日間", label: "〜日間", what: "duration in days",
    note: "Uses the day-of-month readings: 三日間 みっかかん. 一日 for duration is いちにち.",
    max: 10, traps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    read: (n) => (n === 1 ? "いちにち" : DAY_READING[n] + "かん"),
  },
];

export const COUNTER_BY_ID = Object.fromEntries(COUNTERS.map((c) => [c.id, c]));

/* Reading for `n` of counter `c`, with its written form. Counters whose kanji form is just
   the digit plus the suffix get that for free; 〜つ writes its numbers natively. */
export function counterForm(c, n) {
  return { kanji: c.kanji ? c.kanji(n) : n + c.suffix, reading: c.read(n) };
}

/* ── dates and times ── */

export function dateForm(month, day) {
  return {
    kanji: `${month}月${day}日`,
    reading: MONTH_READING[month] + DAY_READING[day],
    en: `${["", "January", "February", "March", "April", "May", "June", "July",
      "August", "September", "October", "November", "December"][month]} ${day}`,
  };
}

/* Japanese puts the period marker before the hour — 午後七時, never 七時午後 — which is the
   single most common word-order slip when translating "7 PM". */
export function timeForm(hour24, minute) {
  const pm = hour24 >= 12;
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const marker = pm ? "午後" : "午前";
  const markerRead = pm ? "ごご" : "ごぜん";
  const half = minute === 30;
  const minK = half ? "半" : minute ? `${minute}分` : "";
  const minR = half ? "はん" : minute ? COUNTER_BY_ID.fun.read(minute) : "";
  const ampm = pm ? "PM" : "AM";
  return {
    kanji: `${marker}${h12}時${minK}`,
    reading: markerRead + HOUR_READING[h12] + minR,
    en: `${h12}:${String(minute).padStart(2, "0")} ${ampm}`,
  };
}

export function weekdayForm(dow) {
  return { kanji: WEEKDAYS[dow][0] + "曜日", reading: WEEKDAYS[dow][1], en: WEEKDAY_EN[dow] };
}

/* A full "Thursday, April 8 at 7:15 PM" — the shape the midterm asks for, and the one that
   needs the pieces assembled in Japanese order: date, then weekday, then time. */
export function sequenceForm(month, day, dow, hour24, minute) {
  const d = dateForm(month, day), w = weekdayForm(dow), t = timeForm(hour24, minute);
  return {
    kanji: `${d.kanji}（${WEEKDAYS[dow][0]}）${t.kanji}`,
    reading: d.reading + w.reading + t.reading,
    en: `${w.en}, ${d.en} at ${t.en}`,
    parts: { date: d, weekday: w, time: t },
  };
}

/* ── drillable items ──
   One item per fact that can be got wrong on its own, so the scheduler can hammer 二十日
   without also re-asking 十五日 which was never a problem. Traps are flagged so a session
   can weight them. */
export function buildItems() {
  const items = [];
  /* `weight` is how much extra pull an item gets in the session scorer. A flat trap bonus
     treats 二十日 and 十七日 as equally hard, and they are not: one is a word you either
     know or do not, the other is a regular form with a predictable reading of 七. Items
     that carry no weight fall back to the old flat bonus so months and counters are
     unchanged. */
  const add = (id, kind, kanji, reading, en, trap, note, weight) =>
    items.push({ id, kind, kanji, reading, en, trap: !!trap, note: note || "",
      weight: weight == null ? (trap ? 0.6 : 0) : weight });

  for (let d = 0; d < 7; d++) {
    const w = weekdayForm(d);
    add(`dow:${d}`, "weekday", w.kanji, w.reading, w.en, false);
  }
  for (let m = 1; m <= 12; m++) {
    const trap = m === 4 || m === 7 || m === 9;
    add(`month:${m}`, "month", MONTH_KANJI[m], MONTH_READING[m],
      dateForm(m, 1).en.split(" ")[0], trap,
      trap ? "し / しち / く — never よん, なな or きゅう before 月." : "");
  }
  for (let d = 1; d <= 31; d++) {
    const note = DAY_NOTE[d] || "";
    // Exactly the days that carry a note are the days that break the number+にち pattern,
    // so the two lists cannot drift apart the way they did when both were written by hand.
    add(`day:${d}`, "day", `${d}日`, DAY_READING[d], `the ${ordinal(d)}`, !!note, note, DAY_WEIGHT[d] || 0);
  }
  for (const c of COUNTERS) {
    const max = Math.min(c.max || 10, 10);
    for (let n = 1; n <= max; n++) {
      const f = counterForm(c, n);
      add(`ctr:${c.id}:${n}`, "counter", f.kanji, f.reading,
        `${n} ${c.what.split(" —")[0]}`, c.traps.includes(n), c.note);
    }
  }
  return items;
}

/* Readings that are genuinely correct but not the form the table stores, so typing them is
   not marked wrong.
     - じゅっ / じっ before a geminating counter are both standard (じゅっぷん, じっぷん).
     - なな and しち swap freely in most counters, and his deck explicitly notes ななじ is
       used for 七時 to avoid mishearing it as 一時.
   Dates are the exception and stay strict: 七月 is しちがつ and 四月 is しがつ, full stop.
   Accepting ななが つ there would train away the exact thing the drill exists to teach. */
export function acceptedReadings(reading, { strictSeven = false } = {}) {
  const out = new Set([reading]);
  for (const r of [...out]) if (r.includes("じゅっ")) out.add(r.replace("じゅっ", "じっ"));
  if (!strictSeven) {
    for (const r of [...out]) {
      if (r.startsWith("しち")) out.add("なな" + r.slice(2));
      if (r.startsWith("なな")) out.add("しち" + r.slice(2));
    }
  }
  return [...out];
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
