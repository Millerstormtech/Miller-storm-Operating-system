import { describe, it, expect } from "vitest";
import { previousSlice, periodEndFor, paceFraction } from "./periods";

// Central July 2026: midnight CDT = 05:00Z. Use that as `start`.
const julStart = new Date("2026-07-01T05:00:00.000Z");
const jul24 = new Date("2026-07-24T17:00:00.000Z"); // partway through the 24th

describe("previousSlice (month)", () => {
  it("shifts back one month and keeps the same elapsed length", () => {
    const { start, end } = previousSlice("month", julStart, jul24);
    expect(start.toISOString()).toBe("2026-06-01T05:00:00.000Z");
    // elapsed = jul24 - julStart; end = junStart + elapsed
    const elapsed = jul24.getTime() - julStart.getTime();
    expect(end.getTime()).toBe(new Date("2026-06-01T05:00:00.000Z").getTime() + elapsed);
  });

  it("caps the previous slice at the previous period's end (shorter month, no spill)", () => {
    const marStart = new Date("2026-03-01T06:00:00.000Z"); // Central midnight, CST
    const mar31 = new Date("2026-03-31T17:00:00.000Z");    // partway through the 31st
    const { start, end } = previousSlice("month", marStart, mar31);
    expect(start.toISOString()).toBe("2026-02-01T06:00:00.000Z");
    // Uncapped this would be 2026-03-03T17:00Z, spilling 3 days into March.
    expect(end.toISOString()).toBe("2026-03-01T06:00:00.000Z");
  });
});

describe("previousSlice (week / day / year)", () => {
  it("week shifts back 7 days", () => {
    const s = new Date("2026-07-20T05:00:00.000Z");
    const now = new Date("2026-07-22T05:00:00.000Z");
    expect(previousSlice("week", s, now).start.toISOString()).toBe("2026-07-13T05:00:00.000Z");
  });
  it("year shifts back one year", () => {
    const s = new Date("2026-01-01T06:00:00.000Z");
    const now = new Date("2026-07-24T05:00:00.000Z");
    expect(previousSlice("year", s, now).start.toISOString()).toBe("2025-01-01T06:00:00.000Z");
  });
});

describe("periodEndFor", () => {
  it("month -> first of next month", () => {
    expect(periodEndFor("month", julStart).toISOString()).toBe("2026-08-01T05:00:00.000Z");
  });
  it("week -> +7 days", () => {
    const s = new Date("2026-07-20T05:00:00.000Z");
    expect(periodEndFor("week", s).toISOString()).toBe("2026-07-27T05:00:00.000Z");
  });
});

describe("paceFraction", () => {
  it("half-elapsed -> 0.5", () => {
    const s = new Date("2026-07-01T00:00:00.000Z");
    const end = new Date("2026-07-11T00:00:00.000Z"); // 10-day period
    const now = new Date("2026-07-06T00:00:00.000Z"); // 5 days in
    expect(paceFraction(s, end, now)).toBeCloseTo(0.5, 5);
  });
  it("clamps to [0,1]", () => {
    const s = new Date("2026-07-01T00:00:00.000Z");
    const end = new Date("2026-07-11T00:00:00.000Z");
    expect(paceFraction(s, end, new Date("2026-08-01T00:00:00.000Z"))).toBe(1);
    expect(paceFraction(s, end, new Date("2026-06-01T00:00:00.000Z"))).toBe(0);
  });
});
