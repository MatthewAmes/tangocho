// Tests for tools/build-freq.mjs — matching a corpus token to the right JMdict entry.
//
//   node tools/test-build-freq.mjs
import fs from "node:fs";
import { parseEntry, indexEntries, matchToken, worthACard, priScore } from "./build-freq.mjs";

let fail = 0, run = 0;
const t = (name, fn) => {
  run++;
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };

/* Minimal JMdict entries, shaped like the real ones for the cases that went wrong. */
const E = (k, r, senses) => `<ent_seq>0</ent_seq>${k}${r}${senses}</entry>`;
const ke = (keb, pri = [], inf = []) => `<k_ele><keb>${keb}</keb>${inf.map((i) => `<ke_inf>&${i};</ke_inf>`).join("")}${pri.map((p) => `<ke_pri>${p}</ke_pri>`).join("")}</k_ele>`;
const re = (reb, pri = []) => `<r_ele><reb>${reb}</reb>${pri.map((p) => `<re_pri>${p}</re_pri>`).join("")}</r_ele>`;
const se = (pos, gloss, misc = []) => `<sense><pos>&${pos};</pos>${misc.map((m) => `<misc>&${m};</misc>`).join("")}${gloss.map((g) => `<gloss>${g}</gloss>`).join("")}</sense>`;

const XML = [
  E(ke("野", ["ichi1", "news1"]), re("の") + re("や", ["ichi1"]), se("n", ["field"])),
  E(ke("乃", [], ["sK"]) + ke("之", [], ["sK"]), re("の", ["spec1"]), se("prt", ["indicates possessive"])),
  E(ke("元", ["ichi1", "news1", "nf05"]) + ke("本", ["ichi1"]), re("もと", ["ichi1", "news1", "nf05"]), se("n", ["origin", "source"])),
  E(ke("本", ["ichi1"]), re("ほん", ["ichi1"]), se("n", ["book", "volume"]) + se("pref", ["this"])),
  E(ke("射る"), re("いる"), se("v1", ["to shoot"])),
  E(ke("居る", ["ichi1"]), re("いる", ["ichi1"]), se("v1", ["to be (of animate objects)"], ["uk"])),
  E(ke("要る", ["ichi1", "news1"]), re("いる", ["ichi1", "news1"]), se("v5r", ["to be needed"], ["uk"])),
  E(ke("所", ["ichi1"]), re("ところ", ["ichi1"]), se("n", ["place"]) + se("n", ["address"], ["uk"])),
  E(ke("野老"), re("ところ"), se("n", ["Dioscorea tokoro"], ["uk"])),
  E(ke("鱒"), re("ます", ["ichi1", "news1"]), se("n", ["trout"], ["uk"])),
].map((x) => "<entry>" + x);
const index = indexEntries(XML.map((x) => parseEntry(x)).filter(Boolean));
const meaning = (tok) => { const h = matchToken(tok, index); return h ? h.e.gloss : null; };

t("a kana token matches only entries written in kana: の is the particle, not 野", () => {
  eq(meaning("の"), "indicates possessive");
  ok(!worthACard("の", matchToken("の", index)), "a particle is not a card");
});
t("a kanji token takes the entry it heads: 本 is ほん 'book', not a spelling of もと", () => {
  const h = matchToken("本", index);
  eq(h.reading, "ほん"); eq(h.e.gloss, "book; volume");
});
t("the meaning is the first sense, not glosses run together across senses", () => eq(meaning("本"), "book; volume"));
t("a word usually written in kanji is not what its kana means: いる is not 射る", () => ok(meaning("いる") !== "to shoot"));
t("named everyday senses settle common homophones: いる is 居る", () => eq(meaning("いる"), "to be (of animate objects)"));
t("'usually kana' anywhere in the entry counts: ところ is 所, not a plant", () => eq(meaning("ところ"), "place"));
t("fragments that happen to be words are not cards: ます is 〜ます, not trout", () => ok(!worthACard("ます", matchToken("ます", index))));
t("newspaper bands count for more the higher they are", () => ok(priScore(["nf01"]) > priScore(["nf40"]) && priScore(["ichi1", "news1"]) === 2));

const built = JSON.parse(fs.readFileSync(new URL("../data/freq.json", import.meta.url), "utf8"));
t("the shipped list: version 3, 10,000 words, the commonest read correctly", () => {
  eq(built.v, 3); eq(built.words.length, 10000);
  const by = (x) => built.words.find((w) => w.t === x);
  eq(by("いる").m.split(";")[0], "to be (of animate objects)");
  eq(by("本").r, "ほん");
  ok(!by("の") && !by("ます") && !by("あり"), "particles and fragments are not in the list");
  ok(/mandarin/.test(by("みかん").m), "みかん is a mandarin, not 'incomplete'");
});

console.log(fail ? `${fail} of ${run} build-freq tests FAILED` : `all ${run} build-freq tests passed`);
process.exit(fail ? 1 : 0);
