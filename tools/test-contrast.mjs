// Tests for minimal-pair contrast drills (tools/contrast.mjs).
//
//   node tools/test-contrast.mjs
import { variantsFor, hasContrast, contrastDrill, contrastSet, FEATURE, FEATURE_LABEL } from "./contrast.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const has = (list, v, m) => { if (!list.includes(v)) throw new Error(`${m || ""} expected ${v} in ${JSON.stringify(list)}`); };
const hasNot = (list, v, m) => { if (list.includes(v)) throw new Error(`${m || ""} did NOT expect ${v} in ${JSON.stringify(list)}`); };
const card = (term, reading, meaning = "") => ({ id: term, term, reading, meaning });

console.log("=== the three features that actually cost marks ===");
t("dropping the small っ is offered for a word that has one", () => {
  has(variantsFor("がっこう").map((v) => v.reading), "がこう");
});
t("writing a small ゃゅょ full-size is offered", () => {
  has(variantsFor("かんしゃ").map((v) => v.reading), "かんしや");
});
t("a long vowel is recognised by ROW, not just by literal おう", () => {
  // こう is a long o exactly as おう is; matching literals missed almost every real word
  has(variantsFor("がっこう").map((v) => v.reading), "がっこ", "should offer the un-lengthened form");
  has(variantsFor("せんせい").map((v) => v.reading), "せんせ");
});
t("every variant differs from the original by exactly one edit", () => {
  // sokuon and long-vowel errors insert or delete a kana; a yoon error SUBSTITUTES one
  // (ゃ -> や), so same-length variants are expected and must differ in exactly one place.
  for (const r of ["がっこう", "かんしゃ", "せんせい", "とうきょう", "ねこ"]) {
    for (const v of variantsFor(r)) {
      const d = v.reading.length - r.length;
      if (d === 0) {
        let diffs = 0;
        for (let i = 0; i < r.length; i++) if (r[i] !== v.reading[i]) diffs++;
        if (diffs !== 1) throw new Error(`${r} -> ${v.reading} changes ${diffs} kana`);
      } else if (Math.abs(d) !== 1) {
        throw new Error(`${r} -> ${v.reading} is not a single edit`);
      }
    }
  }
});
t("no variant is ever equal to the correct reading", () => {
  for (const r of ["がっこう", "かんしゃ", "せんせい", "ねこ", "とうきょう"]) {
    hasNot(variantsFor(r).map((v) => v.reading), r);
  }
});
t("variants are unique", () => {
  for (const r of ["がっこう", "せんせい", "とうきょう"]) {
    const list = variantsFor(r).map((v) => v.reading);
    eq(list.length, new Set(list).size, r + " produced duplicates");
  }
});

console.log("\n=== distractors have to be plausible, not merely wrong ===");
t("no lengthener is inserted after an existing one", () => {
  // がっこうう is not an error anyone makes
  hasNot(variantsFor("がっこう").map((v) => v.reading), "がっこうう");
});
t("no あ/い is inserted mid-word", () => {
  // があっこう / かあんしゃ can be eliminated on sight, which defeats the drill
  const bad = variantsFor("がっこう").map((v) => v.reading).filter((v) => /があ|かあ|しい/.test(v));
  eq(bad.length, 0, "implausible insertions: " + JSON.stringify(bad));
});
t("a word with no contrastable feature yields nothing rather than junk", () => {
  // な and に are a-/i-row and cannot take a lengthener, and neither can host a sokuon
  eq(hasContrast(card("何", "なに")), false);
  eq(contrastDrill(card("何", "なに")), null);
});
t("a short e-row word IS contrastable — め lengthens to めい", () => {
  // worth pinning: this looked like a bug when writing these tests and is not one
  eq(hasContrast(card("目", "め")), true);
});
t("empty and missing readings are handled", () => {
  eq(variantsFor("").length, 0);
  eq(variantsFor(undefined).length, 0);
  eq(contrastDrill({ id: 1, term: "x" }), null);
  eq(contrastDrill(null), null);
});

console.log("\n=== the drill itself ===");
t("the correct reading is always among the options", () => {
  for (const [term, reading] of [["学校", "がっこう"], ["感謝", "かんしゃ"], ["先生", "せんせい"], ["猫", "ねこ"]]) {
    const d = contrastDrill(card(term, reading), { seed: 3 });
    has(d.options, reading, term);
    eq(d.answer, reading);
  }
});
t("options are unique and at least two", () => {
  for (const [term, reading] of [["学校", "がっこう"], ["東京", "とうきょう"], ["猫", "ねこ"]]) {
    const d = contrastDrill(card(term, reading), { seed: 1 });
    eq(d.options.length, new Set(d.options).size, term + " has duplicate options");
    ok(d.options.length >= 2, term + " needs at least a pair");
  }
});
t("it never returns more options than asked for", () => {
  for (const n of [2, 3, 4]) {
    const d = contrastDrill(card("東京", "とうきょう"), { seed: 1, options: n });
    ok(d.options.length <= n, `asked ${n}, got ${d.options.length}`);
  }
});
t("the drill is deterministic for a given seed", () => {
  const a = contrastDrill(card("学校", "がっこう"), { seed: 7 });
  const b = contrastDrill(card("学校", "がっこう"), { seed: 7 });
  eq(a.options.join(), b.options.join(), "same seed must give the same order");
});
t("a different seed can change the order", () => {
  const seen = new Set();
  for (let s = 0; s < 8; s++) seen.add(contrastDrill(card("東京", "とうきょう"), { seed: s }).options.join());
  ok(seen.size > 1, "every seed produced an identical layout");
});
t("each drill names the feature it tests and explains the rule", () => {
  const d = contrastDrill(card("学校", "がっこう"), { seed: 0 });
  ok(Object.values(FEATURE).includes(d.feature), "unknown feature " + d.feature);
  eq(d.label, FEATURE_LABEL[d.feature]);
  ok(d.note && d.note.length > 10, "the rule should be stated, not just named");
});

console.log("\n=== building a set ===");
t("a set skips cards with nothing to contrast", () => {
  const cards = [card("何", "なに"), card("学校", "がっこう"), card("花", "はな"), card("感謝", "かんしゃ")];
  const set = contrastSet(cards, 8);
  eq(set.length, 2, "only 学校 and 感謝 have a contrastable feature");
});
t("a set never repeats a card", () => {
  const cards = [card("学校", "がっこう"), card("学校", "がっこう"), card("感謝", "かんしゃ")];
  const set = contrastSet(cards, 8);
  eq(set.length, new Set(set.map((d) => d.id)).size);
});
t("a set respects the requested size", () => {
  const cards = ["がっこう", "かんしゃ", "せんせい", "とうきょう", "ねこ"].map((r, i) => card("t" + i, r));
  eq(contrastSet(cards, 3).length, 3);
});
t("an empty deck yields an empty set rather than throwing", () => {
  eq(contrastSet([], 5).length, 0);
  eq(contrastSet(undefined, 5).length, 0);
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} contrast tests passed`);
process.exit(fail ? 1 : 0);
