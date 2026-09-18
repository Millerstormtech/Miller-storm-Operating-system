import { describe, it, expect } from "vitest";
import { hailInchesFromMm, biggestHailInWindow, formatInches } from "./hail";

describe("hailInchesFromMm", () => {
  // NOAA's radar estimate is in millimetres and is only a rough estimate, so it
  // is rounded to the nearest quarter inch. The card shows that rounded size and
  // the points use the same number, so a house can never read "1.75 in" while
  // scoring as if it were 1.74.
  it.each([
    [19.05, 0.75],
    [22, 0.75],
    [25, 1],
    [25.4, 1],
    [28.575, 1.25],
    [31, 1.25],
    [43.9, 1.75],
    [44.45, 1.75],
    [50.8, 2],
  ])("%s mm becomes %s in", (mm, inches) => {
    expect(hailInchesFromMm(mm)).toBe(inches);
  });
});

describe("biggestHailInWindow", () => {
  const TODAY = "2026-09-14";

  it("returns null when no hail fell", () => {
    expect(biggestHailInWindow([], TODAY, 12)).toBeNull();
  });

  it("picks the biggest storm inside the window", () => {
    const storms = [
      { date: "2026-04-01", inches: 1.25 },
      { date: "2026-06-01", inches: 2 },
      { date: "2026-07-01", inches: 1 },
    ];
    expect(biggestHailInWindow(storms, TODAY, 12)).toEqual({ date: "2026-06-01", inches: 2 });
  });

  it("picks the more recent storm when two are the same size", () => {
    const storms = [
      { date: "2026-03-01", inches: 1.5 },
      { date: "2026-08-20", inches: 1.5 },
    ];
    expect(biggestHailInWindow(storms, TODAY, 12)).toEqual({ date: "2026-08-20", inches: 1.5 });
  });

  it("includes a storm exactly 12 months ago", () => {
    expect(biggestHailInWindow([{ date: "2025-09-14", inches: 2 }], TODAY, 12)).toEqual({ date: "2025-09-14", inches: 2 });
  });

  it("excludes a storm one day older than the window", () => {
    expect(biggestHailInWindow([{ date: "2025-09-13", inches: 2 }], TODAY, 12)).toBeNull();
  });

  it("excludes a storm dated after today", () => {
    expect(biggestHailInWindow([{ date: "2026-09-15", inches: 2 }], TODAY, 12)).toBeNull();
  });

  it("ignores a bigger storm outside the window in favor of a smaller one inside it", () => {
    const storms = [
      { date: "2025-06-01", inches: 3 },
      { date: "2026-06-01", inches: 1 },
    ];
    expect(biggestHailInWindow(storms, TODAY, 12)).toEqual({ date: "2026-06-01", inches: 1 });
  });
});

describe("formatInches", () => {
  it.each([
    [1, "1"],
    [1.25, "1.25"],
    [1.5, "1.5"],
    [2, "2"],
    [1.1, "1.1"],
  ])("%s is written as %s", (inches, text) => {
    expect(formatInches(inches)).toBe(text);
  });
});
