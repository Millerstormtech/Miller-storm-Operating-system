import { describe, it, expect } from "vitest";
import {
  FRESHNESS_WINDOW_MS,
  isCelebratableMetric,
  isFresh,
  isAnnounceableRep,
  monthStart,
} from "./eligibility";

const HOUR = 60 * 60 * 1000;

describe("isCelebratableMetric", () => {
  it("accepts the two sales events we celebrate", () => {
    expect(isCelebratableMetric("filed")).toBe(true);
    expect(isCelebratableMetric("won")).toBe(true);
  });

  it("rejects the metrics we deliberately stay silent about", () => {
    expect(isCelebratableMetric("lead")).toBe(false);
    expect(isCelebratableMetric("revenue")).toBe(false);
    expect(isCelebratableMetric("")).toBe(false);
  });
});

describe("isFresh", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");

  it("accepts a win from a moment ago", () => {
    expect(isFresh(new Date(now.getTime() - 1000), now)).toBe(true);
  });

  it("accepts a win 23h59m old", () => {
    expect(isFresh(new Date(now.getTime() - (24 * HOUR - 60000)), now)).toBe(true);
  });

  it("accepts a win exactly at the 24 hour boundary", () => {
    expect(isFresh(new Date(now.getTime() - FRESHNESS_WINDOW_MS), now)).toBe(true);
  });

  it("rejects a win 24h01m old", () => {
    expect(isFresh(new Date(now.getTime() - (24 * HOUR + 60000)), now)).toBe(false);
  });

  it("rejects a months-old win, which is what the sync history re-reads surface", () => {
    expect(isFresh(new Date("2026-05-01T12:00:00.000Z"), now)).toBe(false);
  });

  it("rejects a future-dated win rather than treating it as fresh", () => {
    expect(isFresh(new Date(now.getTime() + HOUR), now)).toBe(false);
  });
});

describe("isAnnounceableRep", () => {
  it("accepts an ordinary active rep", () => {
    expect(isAnnounceableRep({})).toBe(true);
    expect(isAnnounceableRep({ deleted: false, suspended: false })).toBe(true);
  });

  it("rejects a rep we could not match to a Miller Storm account", () => {
    expect(isAnnounceableRep(null)).toBe(false);
    expect(isAnnounceableRep(undefined)).toBe(false);
  });

  it("rejects deleted and suspended accounts", () => {
    expect(isAnnounceableRep({ deleted: true })).toBe(false);
    expect(isAnnounceableRep({ suspended: true })).toBe(false);
  });
});

describe("monthStart", () => {
  it("returns midnight Central on the first of the month, expressed in UTC", () => {
    // 2026-08-03 12:00 UTC is 2026-08-03 07:00 in Chicago (CDT, UTC-5).
    // The month began at 2026-08-01 00:00 Chicago = 2026-08-01 05:00 UTC.
    expect(monthStart(new Date("2026-08-03T12:00:00.000Z")).toISOString()).toBe(
      "2026-08-01T05:00:00.000Z"
    );
  });

  it("uses the standard-time offset for a winter month", () => {
    // January is CST (UTC-6), so the month starts at 06:00 UTC.
    expect(monthStart(new Date("2026-01-15T12:00:00.000Z")).toISOString()).toBe(
      "2026-01-01T06:00:00.000Z"
    );
  });

  it("still reports the previous month late on the last night, Central time", () => {
    // 2026-09-01 02:00 UTC is 2026-08-31 21:00 in Chicago: still August there.
    expect(monthStart(new Date("2026-09-01T02:00:00.000Z")).toISOString()).toBe(
      "2026-08-01T05:00:00.000Z"
    );
  });
});
