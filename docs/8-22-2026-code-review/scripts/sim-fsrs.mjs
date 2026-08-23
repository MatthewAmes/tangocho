import { review, retrievability, intervalFor, gradeFromLatency, seedFromHistory } from "../../../tools/fsrs.mjs";
const DAY = 86400000;
function run(label, grades, target = 0.9) {
  let st = null, now = Date.parse("2026-08-01T00:00:00Z"); const out = [];
  for (const g of grades) {
    st = review(st, g, now, target);
    out.push(`${["","A","H","G","E"][g]}→S${st.S.toFixed(1)}/ivl${st.ivl.toFixed(1)}d`);
    // next review happens exactly when "dueness" says due: elapsed = intervalFor(S,0.9) (what the app uses)
    now += Math.max(10 * 60000, intervalFor(st.S, 0.9) * DAY);
  }
  console.log(label.padEnd(34), out.join("  "));
}
run("all EASY (<3s) x6", [4,4,4,4,4,4]);
run("all GOOD (3-6s) x6", [3,3,3,3,3,3]);
run("all HARD (>6s) x6", [2,2,2,2,2,2]);
run("E,E,A,E,E", [4,4,1,4,4]);
run("G,A,G,A,G,G", [3,1,3,1,3,3]);
// cumulative days to reach S>=7 (production unlock) with EASY
{ let st=null, now=0, n=0; while(!(st && st.S>=7)){ st=review(st,4,now,0.9); n++; now+=intervalFor(st.S,0.9)*DAY; } console.log("EASY reviews to unlock production (S>=7):", n, "S=",st.S.toFixed(1)); }
{ let st=null, now=0, n=0; while(!(st && st.S>=7)){ st=review(st,3,now,0.9); n++; now+=intervalFor(st.S,0.9)*DAY; } console.log("GOOD reviews to unlock production (S>=7):", n, "S=",st.S.toFixed(1)); }
// dueness vs due mismatch under retention 0.85 / 0.95
for (const t of [0.85, 0.9, 0.95]) {
  const st = review({S:10,D:5,last:0}, 3, 0, t);
  console.log(`target ${t}: FSRS due in ${st.ivl.toFixed(1)}d but dueness() (fixed 0.9) says due at ${intervalFor(st.S,0.9).toFixed(1)}d`);
}
// lapse: due field says 10 min; dueness says?
{ const st = review({S:10,D:5,last:0}, 1, 0, 0.9); console.log(`after a lapse on S=10: FSRS due in ${(st.ivl*1440).toFixed(0)} min; dueness() says due after ${intervalFor(st.S,0.9).toFixed(2)} days (S=${st.S.toFixed(2)})`); }
// seedFromHistory for typical old cards
for (const c of [{seen:1,correct:1,level:2}, {seen:3,correct:3,level:4}, {seen:8,correct:2,level:0}]) { const s = seedFromHistory(c); console.log("seed", JSON.stringify(c), "→ S", s.S.toFixed(2), "D", s.D.toFixed(1)); }
// share of grades by latency claim: <3s = EASY. What does FSRS do on *first* sight with EASY vs GOOD
console.log("first-sight EASY ivl:", review(null,4,0,0.9).ivl.toFixed(1), "d; GOOD:", review(null,3,0,0.9).ivl.toFixed(1), "d; HARD:", review(null,2,0,0.9).ivl.toFixed(1), "d");
