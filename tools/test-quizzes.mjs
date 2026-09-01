// Tests for the activity-book quiz importer (tools/import-quizzes.mjs).
//   node tools/test-quizzes.mjs
//
// The fixtures below imitate the layout pdftotext -layout produces, including the parts of
// it that are page furniture rather than content. Both of the parser's real bugs are here.
import { parseExercises, parseAnswerKey, answerKeyStart, buildQuizzes, hasText, tidy } from "./import-quizzes.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

/* A table of contents, two exercises, and Appendix D — the shape of a real book. */
const BOOK = [
  "Contents",
  "    7-1-1C Which one is better? .......... 12",
  "    7-3-1C Hearsay or not? .......... 20",
  "",
  "    7-1-1C Which one is better?",
  "    Choose the better option for each.",
  "        3. the tall one",
  "        4. the red one",
  "   20",
  "        5. the cheap one",
  "",
  "    7-3-1C Hearsay or not?",
  "    Listen to the conversation and mark hearsay or not.",
  "        3.",
  "        4.",
  "",
  "    Appendix D: Answer keys",
  "  Act 7",
  "    7-1-1C Which one is better?",
  "    3. b; 4. a; 5. c",
  "    7-3-1C Hearsay or not?",
  "    3. hearsay; 4. not hearsay",
].join("\n");

console.log("=== finding the exercises ===");
t("the table of contents is not mistaken for the exercise", () => {
  // Every id appears twice; the TOC copy has no items under it and must lose.
  const ex = parseExercises(BOOK, { keyAt: answerKeyStart(BOOK) });
  const one = ex.find((e) => e.id === "7-1-1C");
  eq(one.items.length, 3, "the copy with items is the real one");
});
t("act, scene and number are read off the id", () => {
  const one = parseExercises(BOOK, { keyAt: answerKeyStart(BOOK) }).find((e) => e.id === "7-1-1C");
  eq(one.act, 7); eq(one.scene, 1); eq(one.n, 1); eq(one.type, "C");
  eq(one.title, "Which one is better?");
});
t("a page number in the middle of the items is furniture, not an item", () => {
  const one = parseExercises(BOOK, { keyAt: answerKeyStart(BOOK) }).find((e) => e.id === "7-1-1C");
  eq(one.items.map((i) => i.n).join(","), "3,4,5", "the bare 20 is a page number");
});
t("a listening exercise is marked and keeps no empty checkbox rows", () => {
  const two = parseExercises(BOOK, { keyAt: answerKeyStart(BOOK) }).find((e) => e.id === "7-3-1C");
  ok(two.audio, "its instruction says Listen");
  eq(two.items.length, 0, "'3.' with nothing after it is not a question");
});
t("exercises come back in book order", () => {
  const ex = parseExercises(BOOK, { keyAt: answerKeyStart(BOOK) });
  eq(ex.map((e) => e.id).join(" "), "7-1-1C 7-3-1C");
});

console.log("=== the answer key ===");
t("the appendix is found, and the body scan stops before it", () => {
  ok(answerKeyStart(BOOK) > 0);
  // Without the cut-off the key's own ids would parse as a second set of exercises.
  eq(parseExercises(BOOK, { keyAt: answerKeyStart(BOOK) }).length, 2);
});
t("A ONE-LETTER ANSWER IS A REAL ANSWER", () => {
  /* The bug that halved the bank. hasText() demands more than two characters so that a
     listening exercise's empty "3." is not treated as a question — correct for prompts, and
     wrong for answers, because a multiple-choice answer is a single letter. Applied to the
     key it discarded every matching and MC exercise in both books: 63 of 158 exercises
     survived instead of 121. */
  const key = parseAnswerKey(BOOK);
  eq(key.get("7-1-1C").get("3"), "b");
  eq(key.get("7-1-1C").get("5"), "c");
});
t("multi-word answers survive too", () => {
  eq(parseAnswerKey(BOOK).get("7-3-1C").get("4"), "not hearsay");
});
t("'Act 7' and page numbers in the key are skipped", () => {
  const key = parseAnswerKey(BOOK);
  eq(key.size, 2, "only real ids become entries");
});
t("a book with no appendix yields no answers rather than throwing", () => {
  eq(answerKeyStart("just some text"), -1);
  eq(parseAnswerKey("just some text").size, 0);
});

console.log("=== pairing the two halves ===");
t("prompts meet their answers, by item number", () => {
  const qs = buildQuizzes(BOOK);
  const one = qs.find((q) => q.id === "7-1-1C");
  eq(one.items.length, 3);
  eq(one.items[0].prompt, "the tall one");
  eq(one.items[0].answer, "b");
  eq(one.items[2].answer, "c");
});
t("an item with no answer is dropped, not shown unmarkable", () => {
  const book = BOOK.replace("    3. b; 4. a; 5. c", "    3. b; 4. a");
  const one = buildQuizzes(book).find((q) => q.id === "7-1-1C");
  eq(one.items.length, 2, "item 5 has no answer and cannot be marked");
  eq(one.answered, 2);
});
t("an audio exercise survives as a record with nothing to ask", () => {
  const two = buildQuizzes(BOOK).find((q) => q.id === "7-3-1C");
  eq(two.answered, 0);
  ok(two.audio, "kept so the tab can say what it is not covering");
});
t("empty input is safe", () => {
  eq(buildQuizzes("").length, 0);
  eq(buildQuizzes(null).length, 0);
});

console.log("=== text hygiene ===");
t("prompts need substance, so a bare checkbox row is not one", () => {
  ok(hasText("the tall one"));
  ok(!hasText("  "));
  ok(!hasText("b"), "single letters are rejected as PROMPTS, which is why the key must not use this");
});
t("the book's layout bullets are separators, not text", () => {
  /* Two different glyphs, and only one was caught first time. The checkbox is a private-use
     codepoint; the heading separator is U+25C6, a perfectly real black diamond that walked
     straight through a private-use filter and left every affected title reading
     "◆What's◆going◆on?". */
  eq(tidy(" Hearsay"), "Hearsay");
  eq(tidy("◆What◆s going◆on?"), "What s going on?");
  eq(tidy("■ a ● b"), "a b");
});
t("real punctuation survives the cleanup", () => {
  // Curly quotes and ellipses are punctuation; flattening them would be damage, not cleanup.
  ok(tidy("What’s going on?").includes("’"));
  ok(tidy("wait…").includes("…"));
});
t("pdftotext's replacement characters become apostrophes", () => {
  ok(!/�/.test(tidy("What���s going on?")));
  eq(tidy("  a   b  "), "a b");
});

console.log(`\nall ${run} quiz tests ${fail ? `— ${fail} FAILED` : "passed"}`);
process.exitCode = fail ? 1 : 0;
