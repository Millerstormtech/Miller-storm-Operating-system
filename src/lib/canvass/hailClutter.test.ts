// src/lib/canvass/hailClutter.test.ts
import { describe, it, expect } from "vitest";
import { clutterSquares, replaceClutter } from "./hailClutter";
import { gridKey, type HailSquare } from "./hailAssign";

// Fixed radar false echoes (measured 15 Sep 2026): near Harlingen-Brownsville
// and south of Kingsville some squares showed "hail" on up to 27 days in two years,
// 11 of them in winter, with readings up to 12.25 in and no storm reports nearby.
// No square in Fort Worth-Dallas or Lubbock had hail on more than 6 days.

const square = (stormDate: string, lat: number, lon: number, inches: number): HailSquare => ({ stormDate, lat, lon, inches });
const days = (count: number) => Array.from({ length: count }, (_, i) => `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`);

describe("clutterSquares", () => {
  it("flags a square with hail of 1 in or more on 10 or more days", () => {
    const history = days(10).map((day) => square(day, 26.335, -97.585, 1.25));
    expect(clutterSquares(history)).toEqual(new Set([gridKey(26.335, -97.585)]));
  });

  it("does not flag a square with hail on 9 days", () => {
    const history = days(9).map((day) => square(day, 32.755, -97.335, 1.25));
    expect(clutterSquares(history)).toEqual(new Set());
  });

  it("flags a square with 3 in or more on 3 different days, however few days it has", () => {
    const history = days(3).map((day) => square(day, 27.105, -97.555, 3.5));
    expect(clutterSquares(history)).toEqual(new Set([gridKey(27.105, -97.555)]));
  });

  it("does not flag a square with 3 in or more on only 2 days", () => {
    const history = days(2).map((day) => square(day, 33.585, -101.855, 3.5));
    expect(clutterSquares(history)).toEqual(new Set());
  });

  it("does not count readings under 1 in toward the number of days", () => {
    const history = days(12).map((day) => square(day, 32.755, -97.335, 0.75));
    expect(clutterSquares(history)).toEqual(new Set());
  });
});

describe("replaceClutter", () => {
  const clutterAt = (lat: number, lon: number) => new Set([gridKey(lat, lon)]);

  it("leaves squares that are not false-echo squares unchanged", () => {
    const day = [square("2025-05-08", 32.755, -97.335, 1.75)];
    expect(replaceClutter(day, new Set())).toEqual(day);
  });

  it("drops a false-echo square when the normal squares around it show no hail (a false-echo day)", () => {
    const day = [square("2025-04-10", 26.335, -97.585, 7.75), square("2025-04-10", 29.765, -95.365, 1.0)];
    expect(replaceClutter(day, clutterAt(26.335, -97.585))).toEqual([square("2025-04-10", 29.765, -95.365, 1.0)]);
  });

  it("gives a false-echo square the middle reading of the normal squares around it (a real storm day)", () => {
    const day = [
      square("2025-05-08", 26.335, -97.585, 7.75),
      square("2025-05-08", 26.345, -97.585, 1.0),
      square("2025-05-08", 26.325, -97.585, 1.25),
      square("2025-05-08", 26.335, -97.555, 1.5),
    ];
    const cleaned = replaceClutter(day, clutterAt(26.335, -97.585));
    expect(cleaned.find((s) => s.lat === 26.335 && s.lon === -97.585)?.inches).toBe(1.25);
    expect(cleaned).toHaveLength(4);
  });

  it("rounds an in-between middle reading to the nearest quarter inch", () => {
    const day = [
      square("2025-05-08", 26.335, -97.585, 7.75),
      square("2025-05-08", 26.345, -97.585, 1.0),
      square("2025-05-08", 26.325, -97.585, 1.25),
      square("2025-05-08", 26.335, -97.595, 1.5),
      square("2025-05-08", 26.335, -97.575, 2.0),
    ];
    // Middle of 1.0, 1.25, 1.5, 2.0 is 1.375, which rounds to 1.5.
    expect(replaceClutter(day, clutterAt(26.335, -97.585)).find((s) => s.lat === 26.335 && s.lon === -97.585)?.inches).toBe(1.5);
  });

  it("drops a false-echo square with fewer than 3 normal neighbours showing hail", () => {
    const day = [square("2025-05-08", 26.335, -97.585, 7.75), square("2025-05-08", 26.345, -97.585, 1.0), square("2025-05-08", 26.325, -97.585, 1.25)];
    expect(replaceClutter(day, clutterAt(26.335, -97.585)).some((s) => s.lat === 26.335 && s.lon === -97.585)).toBe(false);
  });

  it("ignores neighbours that are false-echo squares themselves, and squares more than 3 squares away", () => {
    const clutter = new Set([gridKey(26.335, -97.585), gridKey(26.345, -97.585), gridKey(26.325, -97.585), gridKey(26.335, -97.575)]);
    const day = [
      square("2025-04-10", 26.335, -97.585, 7.75),
      square("2025-04-10", 26.345, -97.585, 6.0),
      square("2025-04-10", 26.325, -97.585, 6.5),
      square("2025-04-10", 26.335, -97.575, 5.0),
      square("2025-04-10", 26.385, -97.585, 1.0), // 5 squares north: too far
    ];
    expect(replaceClutter(day, clutter)).toEqual([square("2025-04-10", 26.385, -97.585, 1.0)]);
  });
});
