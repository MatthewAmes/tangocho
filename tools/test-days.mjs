// Tests for local-calendar-day helpers (tools/days.mjs) — the streak, "today", and 10k quota
// all key off these. Run under multiple TZs to prove the day key is truly local, not UTC:
//   node tools/test-days.mjs
//   TZ=America/Denver node tools/test-days.mjs
//   TZ=UTC node tools/test-days.mjs
import { localDayKey, streakFrom } from "./days.mjs";

let fail = 0, run = 0;
const t = (name, fn) => { run++; try { fn(); console.log("  PASS  " + name); } catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${b}, got ${a}`); };

console.log(`=== localDayKey (TZ=${process.env.TZ || "(system default)"}) ===`);
t("returns the local date of the Date object constructed in this TZ", () => {
  const d = new Date(2026, 7, 22, 23, 30);   // 2026-08-22 23:30 local, whatever TZ this process runs under
  eq(localDayKey(d), "2026-08-22");
});
t("accepts a timestamp number like Date.now()/h.at", () => {
  const d = new Date(2026, 0, 5, 9, 0);
  eq(localDayKey(d.getTime()), "2026-01-05");
});
t("pads single-digit month/day", () => {
  eq(localDayKey(new Date(2026, 0, 5)), "2026-01-05");
});

console.log("=== streakFrom ===");
t("studied today -> at least 1", () => {
  const now = new Date(2026, 7, 22, 21, 0);   // 9pm local
  const days = { [localDayKey(now)]: { rev: 3 } };
  eq(streakFrom(days, now) >= 1, true);
});
t("studied yesterday only (grace before today's session) -> 1", () => {
  const now = new Date(2026, 7, 22, 8, 0);    // 8am, haven't studied yet today
  const yesterday = new Date(2026, 7, 21, 20, 0);
  const days = { [localDayKey(yesterday)]: { rev: 2 } };
  eq(streakFrom(days, now), 1);
});
t("a gap of one day resets to 0", () => {
  const now = new Date(2026, 7, 22, 21, 0);
  const twoDaysAgo = new Date(2026, 7, 20, 20, 0);
  const days = { [localDayKey(twoDaysAgo)]: { rev: 2 } };
  eq(streakFrom(days, now), 0);
});
t("steps one local day at a time across a DST change (2026-11-01 in US)", () => {
  const now = new Date(2026, 10, 2, 21, 0);   // Nov 2
  const d1 = new Date(2026, 10, 1, 20, 0);    // Nov 1 (DST fallback day)
  const d0 = new Date(2026, 9, 31, 20, 0);    // Oct 31
  const days = { [localDayKey(now)]: { rev: 1 }, [localDayKey(d1)]: { rev: 1 }, [localDayKey(d0)]: { rev: 1 } };
  eq(streakFrom(days, now), 3);
});
t("an evening session logged under today's local key counts even though the UTC date rolled over", () => {
  // for a US-Mountain user at 21:00 local (UTC+6), Date.now() in UTC is already tomorrow —
  // the whole point of TODO-010. localDayKey must key by local date regardless.
  const now = new Date(2026, 7, 22, 21, 0);
  const days = { [localDayKey(now)]: { rev: 1 } };
  eq(streakFrom(days, now), 1);
});

console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} days tests passed`);
process.exit(fail ? 1 : 0);
