// Check every generated reading against a hand-written table.
//
//   node tools/test-counters.mjs
//
// The tables below were typed out from the counter charts, deliberately by hand and
// deliberately not derived from the same rules the code uses — a generator checked against
// itself proves nothing. If a rule in counters-data.mjs is wrong, it disagrees with these.
import {
  COUNTER_BY_ID, DAY_READING, MONTH_READING, HOUR_READING, dateForm, timeForm,
  weekdayForm, sequenceForm, buildItems, counterForm, COUNTERS,
} from "./counters-data.mjs";

let pass = 0, fail = 0;
const eq = (got, want, what) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`  FAIL ${what}\n       got  ${got}\n       want ${want}`);
};

/* ── counters, 1 to 10, written out by hand ── */
const EXPECTED = {
  tsu:      ["ひとつ", "ふたつ", "みっつ", "よっつ", "いつつ", "むっつ", "ななつ", "やっつ", "ここのつ", "とお"],
  nin:      ["ひとり", "ふたり", "さんにん", "よにん", "ごにん", "ろくにん", "しちにん", "はちにん", "きゅうにん", "じゅうにん"],
  ji:       ["いちじ", "にじ", "さんじ", "よじ", "ごじ", "ろくじ", "しちじ", "はちじ", "くじ", "じゅうじ"],
  fun:      ["いっぷん", "にふん", "さんぷん", "よんぷん", "ごふん", "ろっぷん", "ななふん", "はっぷん", "きゅうふん", "じゅっぷん"],
  ko:       ["いっこ", "にこ", "さんこ", "よんこ", "ごこ", "ろっこ", "ななこ", "はっこ", "きゅうこ", "じゅっこ"],
  mai:      ["いちまい", "にまい", "さんまい", "よんまい", "ごまい", "ろくまい", "ななまい", "はちまい", "きゅうまい", "じゅうまい"],
  satsu:    ["いっさつ", "にさつ", "さんさつ", "よんさつ", "ごさつ", "ろくさつ", "ななさつ", "はっさつ", "きゅうさつ", "じゅっさつ"],
  hiki:     ["いっぴき", "にひき", "さんびき", "よんひき", "ごひき", "ろっぴき", "ななひき", "はっぴき", "きゅうひき", "じゅっぴき"],
  dai:      ["いちだい", "にだい", "さんだい", "よんだい", "ごだい", "ろくだい", "ななだい", "はちだい", "きゅうだい", "じゅうだい"],
  hai:      ["いっぱい", "にはい", "さんばい", "よんはい", "ごはい", "ろっぱい", "ななはい", "はっぱい", "きゅうはい", "じゅっぱい"],
  ban:      ["いちばん", "にばん", "さんばん", "よんばん", "ごばん", "ろくばん", "ななばん", "はちばん", "きゅうばん", "じゅうばん"],
  jikan:    ["いちじかん", "にじかん", "さんじかん", "よじかん", "ごじかん", "ろくじかん", "しちじかん", "はちじかん", "くじかん", "じゅうじかん"],
  shuukan:  ["いっしゅうかん", "にしゅうかん", "さんしゅうかん", "よんしゅうかん", "ごしゅうかん", "ろくしゅうかん", "ななしゅうかん", "はっしゅうかん", "きゅうしゅうかん", "じゅっしゅうかん"],
  kagetsu:  ["いっかげつ", "にかげつ", "さんかげつ", "よんかげつ", "ごかげつ", "ろっかげつ", "ななかげつ", "はっかげつ", "きゅうかげつ", "じゅっかげつ"],
  nenkan:   ["いちねんかん", "にねんかん", "さんねんかん", "よねんかん", "ごねんかん", "ろくねんかん", "しちねんかん", "はちねんかん", "きゅうねんかん", "じゅうねんかん"],
  nichikan: ["いちにち", "ふつかかん", "みっかかん", "よっかかん", "いつかかん", "むいかかん", "なのかかん", "ようかかん", "ここのかかん", "とおかかん"],
};

for (const [id, want] of Object.entries(EXPECTED)) {
  const c = COUNTER_BY_ID[id];
  if (!c) { fail++; console.error(`  FAIL no counter "${id}"`); continue; }
  want.forEach((w, i) => eq(c.read(i + 1), w, `${id} ${i + 1}`));
}

/* every counter in the module is covered above */
for (const c of COUNTERS) {
  if (!EXPECTED[c.id]) { fail++; console.error(`  FAIL counter "${c.id}" has no expected table`); }
}

/* ── hours past ten ── */
eq(HOUR_READING[11], "じゅういちじ", "11時");
eq(HOUR_READING[12], "じゅうにじ", "12時");

/* ── minutes past ten, where the tens themselves change ── */
const fun = COUNTER_BY_ID.fun.read;
eq(fun(11), "じゅういっぷん", "11分");
eq(fun(15), "じゅうごふん", "15分");
eq(fun(20), "にじゅっぷん", "20分");
eq(fun(30), "さんじゅっぷん", "30分");
eq(fun(40), "よんじゅっぷん", "40分");
eq(fun(45), "よんじゅうごふん", "45分");
eq(fun(50), "ごじゅっぷん", "50分");
eq(fun(55), "ごじゅうごふん", "55分");

/* ── months: the three that catch everyone ── */
eq(MONTH_READING[4], "しがつ", "4月");
eq(MONTH_READING[7], "しちがつ", "7月");
eq(MONTH_READING[9], "くがつ", "9月");
eq(MONTH_READING[1], "いちがつ", "1月");
eq(MONTH_READING[10], "じゅうがつ", "10月");

/* ── days of the month, all 31 by hand ── */
const DAYS = ["ついたち", "ふつか", "みっか", "よっか", "いつか", "むいか", "なのか", "ようか",
  "ここのか", "とおか", "じゅういちにち", "じゅうににち", "じゅうさんにち", "じゅうよっか",
  "じゅうごにち", "じゅうろくにち", "じゅうしちにち", "じゅうはちにち", "じゅうくにち", "はつか",
  "にじゅういちにち", "にじゅうににち", "にじゅうさんにち", "にじゅうよっか", "にじゅうごにち",
  "にじゅうろくにち", "にじゅうしちにち", "にじゅうはちにち", "にじゅうくにち", "さんじゅうにち",
  "さんじゅういちにち"];
DAYS.forEach((w, i) => eq(DAY_READING[i + 1], w, `${i + 1}日`));

/* ── weekdays ── */
[["にちようび", "Sunday"], ["げつようび", "Monday"], ["かようび", "Tuesday"], ["すいようび", "Wednesday"],
 ["もくようび", "Thursday"], ["きんようび", "Friday"], ["どようび", "Saturday"]]
  .forEach(([r, en], i) => {
    eq(weekdayForm(i).reading, r, `weekday ${i} reading`);
    eq(weekdayForm(i).en, en, `weekday ${i} english`);
  });

/* ── assembled dates ── */
eq(dateForm(4, 8).kanji, "4月8日", "4/8 kanji");
eq(dateForm(4, 8).reading, "しがつようか", "4/8 reading");
eq(dateForm(4, 8).en, "April 8", "4/8 english");
eq(dateForm(1, 1).reading, "いちがつついたち", "1/1 reading");
eq(dateForm(7, 20).reading, "しちがつはつか", "7/20 reading");
eq(dateForm(9, 14).reading, "くがつじゅうよっか", "9/14 reading");

/* ── times: the marker leads, and 30 past is 半 ── */
eq(timeForm(19, 0).kanji, "午後7時", "7 PM kanji");
eq(timeForm(19, 0).reading, "ごごしちじ", "7 PM reading");
eq(timeForm(19, 0).en, "7:00 PM", "7 PM english");
eq(timeForm(9, 0).kanji, "午前9時", "9 AM kanji");
eq(timeForm(9, 0).reading, "ごぜんくじ", "9 AM reading");
eq(timeForm(14, 30).kanji, "午後2時半", "2:30 PM kanji");
eq(timeForm(14, 30).reading, "ごごにじはん", "2:30 PM reading");
eq(timeForm(16, 15).reading, "ごごよじじゅうごふん", "4:15 PM reading");
eq(timeForm(0, 0).kanji, "午前12時", "midnight kanji");
eq(timeForm(12, 0).kanji, "午後12時", "noon kanji");
eq(timeForm(12, 0).reading, "ごごじゅうにじ", "noon reading");

/* ── the full sequence he needs for the midterm ── */
const seq = sequenceForm(4, 8, 4, 19, 0);
eq(seq.kanji, "4月8日（木）午後7時", "sequence kanji");
eq(seq.reading, "しがつようかもくようびごごしちじ", "sequence reading");
eq(seq.en, "Thursday, April 8 at 7:00 PM", "sequence english");

/* ── item build ── */
const items = buildItems();
const ids = new Set(items.map((i) => i.id));
eq(ids.size, items.length, "item ids are unique");
eq(items.filter((i) => i.kind === "day").length, 31, "31 day items");
eq(items.filter((i) => i.kind === "month").length, 12, "12 month items");
eq(items.filter((i) => i.kind === "weekday").length, 7, "7 weekday items");
eq(items.some((i) => i.id === "day:20" && i.trap), true, "20日 is flagged a trap");
eq(items.some((i) => i.id === "month:4" && i.trap), true, "4月 is flagged a trap");
eq(items.some((i) => i.id === "month:5" && !i.trap), true, "5月 is not a trap");
eq(items.every((i) => i.kanji && i.reading && i.en), true, "every item is fully populated");
eq(items.every((i) => !/undefined|NaN/.test(i.kanji + i.reading + i.en)), true, "no undefined leaked in");

/* 〜つ must not generate past ten */
eq(items.filter((i) => i.id.startsWith("ctr:tsu:")).length, 10, "〜つ stops at ten");
eq(counterForm(COUNTER_BY_ID.tsu, 1).kanji, "一つ", "一つ writes natively");
eq(counterForm(COUNTER_BY_ID.mai, 3).kanji, "3枚", "3枚 writes as digit + suffix");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
