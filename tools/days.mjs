// Local-calendar-day helpers shared by the streak, "today" counters, and the 10k quota.
// Pure (no storage access) so they're testable — see tools/test-days.mjs.

/** Local calendar date "YYYY-MM-DD". toISOString() is UTC, which for a US-Mountain user
 *  rolls the "day" over at dinner time — evening reviews were landing on tomorrow's key. */
export function localDayKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
}

/* ── streak ──
   Counts back from today, and from yesterday if today hasn't been studied yet — so the
   streak doesn't read as broken at 9am before you've started. A day counts if anything
   was reviewed at all; the point is showing up, not hitting a number. */
export function streakFrom(days, now = new Date()) {
  if (!days) return 0;
  const key = (d) => localDayKey(d);
  const has = (d) => { const v = days[key(d)]; return !!(v && (v.rev || 0) > 0); };
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  let cursor = new Date(today);
  if (!has(cursor)) cursor.setDate(cursor.getDate() - 1);   // grace: today isn't over
  let n = 0;
  while (has(cursor) && n < 3650) { n++; cursor.setDate(cursor.getDate() - 1); }
  return n;
}
