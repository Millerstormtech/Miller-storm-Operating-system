// src/lib/acculynx/windows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getWindowRange, customRange, previousMonthRange } from "./windows.ts";

// 2026-06-18T15:00:00Z is a Thursday. In US Central (CDT, UTC-5) that is
// Thu 2026-06-18 10:00 local. Week (Mon start) began Mon 2026-06-15 00:00 CDT
// = 2026-06-15T05:00:00Z. Month began 2026-06-01 00:00 CDT = 2026-06-01T05:00:00Z.
const now = new Date("2026-06-18T15:00:00Z");

test("day range starts today 00:00 Central", () => {
  // Thu 2026-06-18 00:00 CDT = 2026-06-18T05:00:00Z
  const { start, end } = getWindowRange("day", now);
  assert.equal(start.toISOString(), "2026-06-18T05:00:00.000Z");
  assert.equal(end.getTime(), now.getTime());
});

test("week range starts Monday 00:00 Central", () => {
  const { start, end } = getWindowRange("week", now);
  assert.equal(start.toISOString(), "2026-06-15T05:00:00.000Z");
  assert.equal(end.getTime(), now.getTime());
});

test("month range starts day 1 00:00 Central", () => {
  const { start } = getWindowRange("month", now);
  assert.equal(start.toISOString(), "2026-06-01T05:00:00.000Z");
});

test("year range starts Jan 1 00:00 Central (CST, UTC-6)", () => {
  // Jan 1 2026 00:00 Central is CST (UTC-6) => 2026-01-01T06:00:00Z
  const { start, end } = getWindowRange("year", now);
  assert.equal(start.toISOString(), "2026-01-01T06:00:00.000Z");
  assert.equal(end.getTime(), now.getTime());
});

test("customRange spans From 00:00 Central through end of To, inclusive", () => {
  // From 2026-07-01 00:00 CDT = 2026-07-01T05:00:00Z; To end-of-day 2026-07-10
  // 23:59:59 CDT = 2026-07-11T04:59:59Z (before now, so kept as-is).
  const { start, end } = customRange("2026-07-01", "2026-07-10", new Date("2026-07-14T15:00:00Z"));
  assert.equal(start.toISOString(), "2026-07-01T05:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-11T04:59:59.000Z");
});

test("customRange clamps end to now when To is in the future", () => {
  const nowCap = new Date("2026-07-14T15:00:00Z");
  const { end } = customRange("2026-07-01", "2026-12-31", nowCap);
  assert.equal(end.getTime(), nowCap.getTime());
});

// previousMonthRange — the only CLOSED range here. Used by the monthly Contract
// King announcement, which fires on the 1st and must report a finished month.

test("previousMonthRange covers the whole prior month, ending as this one begins", () => {
  // Sept 1 2026, 09:00 CDT (UTC-5) — the announcement's actual firing moment.
  const { start, end } = previousMonthRange(new Date("2026-09-01T14:00:00Z"));
  assert.equal(start.toISOString(), "2026-08-01T05:00:00.000Z"); // Aug 1 00:00 CDT
  assert.equal(end.toISOString(), "2026-09-01T04:59:59.999Z");   // 1ms before Sept 1 00:00 CDT
});

test("previousMonthRange rolls back across the year boundary", () => {
  // Jan 1 2026, 09:00 CST (UTC-6) -> December 2025, not December 2026.
  const { start, end } = previousMonthRange(new Date("2026-01-01T15:00:00Z"));
  assert.equal(start.toISOString(), "2025-12-01T06:00:00.000Z");
  assert.equal(end.toISOString(), "2026-01-01T05:59:59.999Z");
});

test("previousMonthRange holds when the month straddles a DST change", () => {
  // March 2026 spans spring-forward, so the month STARTS in CST (UTC-6) and
  // ENDS in CDT (UTC-5). Both ends must use the offset in force at that instant,
  // not one offset applied to the whole range.
  const { start, end } = previousMonthRange(new Date("2026-04-01T14:00:00Z"));
  assert.equal(start.toISOString(), "2026-03-01T06:00:00.000Z"); // CST
  assert.equal(end.toISOString(), "2026-04-01T04:59:59.999Z");   // CDT
});

test("previousMonthRange abuts the month-to-date range with no gap or overlap", () => {
  // The guarantee that makes the announcement safe: no contract can fall
  // between the two ranges, and none can be counted in both.
  const now = new Date("2026-09-01T14:00:00Z");
  const prev = previousMonthRange(now);
  const thisMonth = getWindowRange("month", now);
  assert.equal(prev.end.getTime() + 1, thisMonth.start.getTime());
});

test("previousMonthRange handles a 29-day February without counting days", () => {
  // 2028 is a leap year. The range is derived by stepping back from March 1,
  // so Feb 29 is included without any days-in-month arithmetic.
  const { start, end } = previousMonthRange(new Date("2028-03-01T15:00:00Z"));
  assert.equal(start.toISOString(), "2028-02-01T06:00:00.000Z");
  assert.equal(end.toISOString(), "2028-03-01T05:59:59.999Z");
});
