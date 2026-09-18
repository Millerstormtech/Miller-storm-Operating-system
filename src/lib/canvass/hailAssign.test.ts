import { describe, it, expect } from "vitest";
import { gridKey, assignHail } from "./hailAssign";

// NOAA's hail grid squares are 0.01 degree across, with centers ending in 5
// (for example 34.925, -102.125). A house gets the hail of the square it sits in.

describe("gridKey", () => {
  it("gives a square's center and a house inside that square the same key", () => {
    expect(gridKey(34.925, -102.125)).toBe(gridKey(34.9213, -102.1291));
  });

  it("gives houses in neighboring squares different keys", () => {
    expect(gridKey(34.9299, -102.125)).not.toBe(gridKey(34.9301, -102.125));
  });

  it("puts a house exactly on a square's edge in the square to its north or east", () => {
    expect(gridKey(34.93, -102.12)).toBe(gridKey(34.935, -102.115));
  });
});

describe("assignHail", () => {
  const home = (id: string, lat: number, lon: number) => ({ id, lat, lon });
  const square = (stormDate: string, lat: number, lon: number, inches: number) => ({ stormDate, lat, lon, inches });

  it("gives a house the hail of the square it sits in", () => {
    const result = assignHail([home("a", 32.7551, -97.3308)], [square("2026-04-25", 32.755, -97.335, 1.75)], 1);
    expect(result.get("a")).toEqual([{ date: "2026-04-25", inches: 1.75 }]);
  });

  it("leaves out squares below the smallest size that scores", () => {
    const result = assignHail([home("a", 32.7551, -97.3308)], [square("2026-04-25", 32.755, -97.335, 0.75)], 1);
    expect(result.has("a")).toBe(false);
  });

  it("collects storms from different days for the same house, oldest first", () => {
    const result = assignHail(
      [home("a", 32.7551, -97.3308)],
      [square("2026-04-28", 32.755, -97.335, 1.25), square("2026-04-25", 32.755, -97.335, 2)],
      1,
    );
    expect(result.get("a")).toEqual([
      { date: "2026-04-25", inches: 2 },
      { date: "2026-04-28", inches: 1.25 },
    ]);
  });

  it("keeps only the biggest size when one day lists the same square twice", () => {
    const result = assignHail(
      [home("a", 32.7551, -97.3308)],
      [square("2026-04-25", 32.755, -97.335, 1.25), square("2026-04-25", 32.755, -97.335, 1.5)],
      1,
    );
    expect(result.get("a")).toEqual([{ date: "2026-04-25", inches: 1.5 }]);
  });

  it("gives nothing to a house with no hail square over it", () => {
    const result = assignHail([home("a", 30.1, -95.1)], [square("2026-04-25", 32.755, -97.335, 2)], 1);
    expect(result.size).toBe(0);
  });
});
