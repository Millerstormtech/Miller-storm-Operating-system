// src/lib/acculynx/windows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getWindowRange, customRange } from "./windows.ts";

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
