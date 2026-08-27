// The seed merge (applySeed, tools/merge.mjs) keys cards by term|lesson|sec and never
// collapses two seed rows that share a key — but it can't invent a distinction SEED itself
// doesn't have. If two rows ever end up with the identical term/lesson/sec (like the old
// 方|43|6-3 collision this check was added for), the merge silently collapses them into one
// card again. Catch that at build time instead of by a corrupted deck in the wild.
// Run from tools/build.mjs.
// SEED is imported rather than sliced out of the app source and eval'd. The old version
// searched for the literal text "const SEED = [" and broke the moment the array moved to
// its own module -- a build-time check that depends on where a declaration sits is a check
// that fails for the wrong reason.
import { SEED as seed } from "../src/data/seed.js";

const byKey = new Map();
seed.forEach((s, i) => {
  const k = s.term + "|" + (s.lesson || "") + "|" + (s.sec || "");
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(i);
});
const dups = Array.from(byKey.entries()).filter(([, idxs]) => idxs.length > 1);

if (dups.length) {
  console.error("SEED KEY COLLISION — two rows share the same term|lesson|sec and would collapse into one card:");
  dups.forEach(([k, idxs]) => console.error(`  - "${k}" at SEED rows ${idxs.join(", ")}`));
  console.error("Give one of them a distinct `sec` (e.g. the existing \"6-3#2\" convention) — see applySeed in tools/merge.mjs.");
  process.exit(1);
}
console.log(`    seed ${seed.length} rows, 0 key collisions`);
