// src/lib/acculynx/windows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getWindowRange } from "./windows.ts";

// 2026-06-18T15:00:00Z is a Thursday. In US Central (CDT, UTC-5) that is
// Thu 2026-06-18 10:00 local. Week (Mon start) began Mon 2026-06-15 00:00 CDT
// = 2026-06-15T05:00:00Z. Month began 2026-06-01 00:00 CDT = 2026-06-01T05:00:00Z.
const now = new Date("2026-06-18T15:00:00Z");

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
