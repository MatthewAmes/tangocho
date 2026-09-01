// Tests for the script scraper and annotator (tools/scrape-scripts.mjs, annotate-scripts.mjs).
//   node tools/test-scrape.mjs
//
// Every case here is a mistake this code actually made against the real pages, which is why
// they read oddly specific. A scraper fails silently by nature: it returns fewer lines, or
// the same lines slightly wrong, and nothing throws.
import { tidy, linesFrom, headerFrom } from "./scrape-scripts.mjs";
import { mergeScene, key, textOf } from "./annotate-scripts.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const p = (...xs) => xs.map((x) => `<p>${x}</p>`).join("\n");

console.log("=== typesetting artifacts are not content ===");
t("spaces between Japanese characters are typographic and go", () => {
  eq(tidy("あと ど の ぐ らい で すか。"), "あとどのぐらいですか。");
});
t("spaces inside a Latin run are lexical and stay", () => {
  ok(tidy("ACT 9-2 Moving day").includes("ACT 9-2 Moving"));
});
t("a decomposed dakuten is the same name as a precomposed one", () => {
  // The pages spell ブ both ways. Unequal strings, identical glyphs: Brian arrived as two
  // speakers with 84 lines and 6, and nothing looked wrong on screen.
  const decomposed = "ブライアン";
  const precomposed = "ブライアン";
  ok(decomposed !== precomposed, "the fixture must actually differ, or this proves nothing");
  eq(tidy(decomposed), precomposed);
});

console.log("=== who is speaking ===");
t("labelled turns come out in page order", () => {
  const lines = linesFrom(p("川村：おはよう。", "ブライアン：おはようございます。"));
  eq(lines.length, 2);
  eq(lines[0].speaker, "川村");
  eq(lines[1].speaker, "ブライアン");
});
t("a wordless beat still belongs to the scene", () => {
  /* 9-2's seventh line is a speaker saying nothing — the silence is the joke, and the page
     prints it. Requiring Japanese line-by-line dropped it and the scene came out one turn
     short. It is kept because Brian is established elsewhere in the same scene, which is
     the distinction the next test holds the other side of. */
  const lines = linesFrom(p("ブライアン：おはようございます。", "川村：おはよう。", "ブライアン：…"));
  eq(lines.length, 3, "the silent turn is a turn");
  eq(lines[2].text, "…");
});
t("a label that only ever says nothing is not a speaker", () => {
  const lines = linesFrom(p("川村：おはよう。", "Note：…"));
  eq(lines.length, 1, "a cast member has to say something Japanese at least once");
});
t("drill and grammar headings are laid out like dialogue but are not", () => {
  // "ACT 5： 〜て forms (type in Romanization)" parses as a speaker named ACT 5 delivering an
  // English instruction; 36 of these were in the first full scrape.
  const lines = linesFrom(p("ACT 5：〜て forms (type in Romanization)", "BTS 1：〜に行く", "神田：はい、どうぞ。"));
  eq(lines.length, 1);
  eq(lines[0].speaker, "神田");
});
t("the site's own misspelling of a name is folded into the real one", () => {
  const lines = linesFrom(p("エィミー：はい。", "エイミー：いいえ。"));
  eq(new Set(lines.map((l) => l.speaker)).size, 1, "エィミー and エイミー are one character");
});
t("a page with no dialogue yields nothing rather than guessing", () => {
  eq(linesFrom(p("BTS 1 Verb forms", "Vocabulary")).length, 0);
  eq(linesFrom("").length, 0);
});
t("the scene's English title is read off the page when present", () => {
  eq(headerFrom(p("ACT 9-2 Moving day"), 9, 2), "Moving day");
  eq(headerFrom(p("something else"), 9, 2), "");
});

console.log("=== annotation may not move a line ===");
const scene = {
  name: "9-2",
  lines: [
    { speaker: "川村", tokens: [{ t: "おはよう。" }], romaji: "", en: "" },
    { speaker: "ブライアン", tokens: [{ t: "もう終わり？" }], romaji: "", en: "" },
  ],
};
t("a matching reply supplies furigana, romaji and English", () => {
  const { scene: m, matched } = mergeScene(scene, {
    lines: [
      { speaker: "A", tokens: [{ t: "おはよう。" }], romaji: "ohayou.", en: "Morning." },
      { speaker: "B", tokens: [{ t: "もう" }, { t: "終", r: "お" }, { t: "わり？" }], romaji: "mou owari?", en: "Done already?" },
    ],
  });
  eq(matched, 2);
  eq(m.lines[1].en, "Done already?");
  ok(m.lines[1].tokens.some((x) => x.r), "furigana comes from the reply");
});
t("the speaker stays the site's, never the model's", () => {
  const { scene: m } = mergeScene(scene, {
    lines: [{ speaker: "A", tokens: [{ t: "おはよう。" }], romaji: "ohayou.", en: "Morning." }],
  });
  eq(m.lines[0].speaker, "川村", "the page prints the real name; the model answered 'A'");
});
t("a reordered reply is matched by content, not by position", () => {
  const { scene: m, matched } = mergeScene(scene, {
    lines: [
      { speaker: "B", tokens: [{ t: "もう終わり？" }], romaji: "mou owari?", en: "Done already?" },
      { speaker: "A", tokens: [{ t: "おはよう。" }], romaji: "ohayou.", en: "Morning." },
    ],
  });
  eq(matched, 2);
  eq(m.lines[0].en, "Morning.", "line one keeps its own translation");
  eq(m.lines[1].en, "Done already?");
});
t("a DROPPED line does not shift every translation onto the wrong turn", () => {
  // The failure worth all of this: the model returns one line for a two-line scene and
  // position alone would hand line two's turn to line one's translation. Both halves look
  // fine on their own, and the scene now says something nobody said.
  const { scene: m, matched } = mergeScene(scene, {
    lines: [{ speaker: "B", tokens: [{ t: "もう終わり？" }], romaji: "mou owari?", en: "Done already?" }],
  });
  eq(matched, 1);
  eq(m.lines[0].en, "", "the unmatched line loses its annotation, not its identity");
  eq(m.lines[1].en, "Done already?");
});
t("tokens that do not rebuild the line are refused", () => {
  const { scene: m, matched } = mergeScene(scene, {
    lines: [{ speaker: "A", tokens: [{ t: "こんばんは。" }], romaji: "konbanwa.", en: "Evening." }],
  });
  eq(matched, 0, "different Japanese is a different line, whatever position it arrived in");
  eq(m.lines[0].en, "");
  eq(m.lines[0].tokens[0].t, "おはよう。", "the scrape stays authoritative");
});
t("no reply at all leaves the scene intact and plain", () => {
  const { scene: m, matched } = mergeScene(scene, null);
  eq(matched, 0);
  eq(m.lines.length, 2);
  eq(textOf(m.lines[0]), "おはよう。");
});
t("matching ignores spacing and normalization, never meaning", () => {
  eq(key("もう 終わり？"), key("もう終わり？"));
  ok(key("おはよう。") !== key("こんばんは。"));
});

console.log(`\nall ${run} scrape tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
