// Fail loudly if any kanji reaches the Oral tab. CJK ideographs only — kana, katakana,
// 〜, ・ and the ー mark are all fine.
import { SITUATIONS, CHECKLIST, TALK, makeProps } from "./oral-data.mjs";

const KANJI = /[一-鿿㐀-䶿]/g;
const hits = [];
const check = (where, text) => {
  const m = String(text == null ? "" : text).match(KANJI);
  if (m) hits.push(`${where}: ${text}   ← ${[...new Set(m)].join(" ")}`);
};

// several draws, since the props are random and feed the strings
for (let i = 0; i < 40; i++) {
  const p = makeProps();
  for (const S of SITUATIONS) {
    check(`${S.id} title`, S.title);
    check(`${S.id} intro`, S.intro);
    for (const q of S.questions) {
      check(`${S.id} q`, typeof q.q === "function" ? q.q(p) : q.q);
      check(`${S.id} r`, typeof q.r === "function" ? q.r(p) : q.r);
      check(`${S.id} a`, typeof q.a === "function" ? q.a(p) : q.a);
      check(`${S.id} g`, q.g);
      check(`${S.id} en`, q.en);
    }
  }
  check("prop room read", p.flyer.room.read);
  check("prop room full", p.flyer.room.full);
  check("prop room where", p.flyer.room.whereRead);
  check("prop room en", p.flyer.room.en);
  check("classmate", p.classmate);
  check("made.day", p.made.day);
  check("monthDay", p.flyer.monthDayJa);
  check("dow", p.flyer.dowJa);
  check("wrongDow", p.flyer.wrongDowJa);
  check("time", p.flyer.timeJa);
  check("copies", p.receipt.copiesJa);
  check("price", p.receipt.priceJa);
  check("pizzas", p.budget.pizzasJa);
  check("place", p.budget.place);
}
for (const c of CHECKLIST) { check("checklist k", c.k); check("checklist v", c.v); }
for (const l of TALK.lines) { check(`talk ${l.n} ja`, l.ja); check(`talk ${l.n} tag`, l.tag); }
for (const c of TALK.cards) { check("talk card", c.name); c.words.forEach((w) => check("talk word", w)); }

const uniq = [...new Set(hits)];
if (uniq.length) { console.error(`KANJI FOUND (${uniq.length}):`); uniq.forEach((h) => console.error("  " + h)); process.exit(1); }
console.log("clean — no kanji anywhere in the Oral tab content");
