import { describe, it, expect } from "vitest";
import { parseHailLine, hailCellKey, capSpikes } from "./hailCells";

// Lines as written by scripts/canvass-hail/decode.py.
const line = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ date: "2026-03-10", lat: 32.7551, lon: -97.3308, mm: 44.4, ...over });

describe("parseHailLine", () => {
  it("turns a decoder line into a hail cell, with the map point in longitude, latitude order", () => {
    expect(parseHailLine(line())).toEqual({
      cellKey: "2026-03-10|32.7551|-97.3308",
      stormDate: "2026-03-10",
      location: { type: "Point", coordinates: [-97.3308, 32.7551] },
      mm: 44.4,
      inches: 1.75,
    });
  });

  it("rounds the size to the quarter inch with the same rule the grade uses", () => {
    expect(parseHailLine(line({ mm: 31 }))!.inches).toBe(1.25);
  });

  it("accepts hail of exactly 0.75 in", () => {
    expect(parseHailLine(line({ mm: 19.05 }))!.inches).toBe(0.75);
  });

  it("rejects hail under 0.75 in", () => {
    expect(parseHailLine(line({ mm: 19 }))).toBeNull();
  });

  it("rejects a point outside Texas", () => {
    expect(parseHailLine(line({ lat: 39.1, lon: -94.6 }))).toBeNull();
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    expect(parseHailLine(line({ date: "03/10/2026" }))).toBeNull();
  });

  it("rejects a missing or non-numeric size", () => {
    expect(parseHailLine(line({ mm: "big" }))).toBeNull();
    expect(parseHailLine(JSON.stringify({ date: "2026-03-10", lat: 32.7551, lon: -97.3308 }))).toBeNull();
  });

  it("rejects a line that is not JSON", () => {
    expect(parseHailLine("not json")).toBeNull();
  });

  it("rejects a blank line", () => {
    expect(parseHailLine("   ")).toBeNull();
  });
});

describe("hailCellKey", () => {
  it("is the same for the same day and grid square", () => {
    expect(hailCellKey("2026-03-10", 32.7551, -97.3308)).toBe(hailCellKey("2026-03-10", 32.7551, -97.3308));
  });

  it("differs for the same grid square on another day", () => {
    expect(hailCellKey("2026-03-10", 32.7551, -97.3308)).not.toBe(hailCellKey("2026-03-11", 32.7551, -97.3308));
  });

  it("keeps four decimal places so neighboring squares never share a key", () => {
    expect(hailCellKey("2026-03-10", 32.755, -97.33)).toBe("2026-03-10|32.7550|-97.3300");
  });
});

describe("capSpikes", () => {
  // On 28 Apr 2026 the radar showed one 8.69 in square in the Panhandle whose
  // neighbors read 4.81 in and below: a radar glitch, not hail. Squares are
  // 0.01 degree apart, so neighbors sit 0.01 degree away in either direction.
  const square = (lat: number, lon: number, inches: number, date = "2026-04-28") => ({
    cellKey: hailCellKey(date, lat, lon),
    stormDate: date,
    location: { type: "Point" as const, coordinates: [lon, lat] as [number, number] },
    mm: inches * 25.4,
    inches,
  });

  it("brings a lone spike down to its biggest neighbor", () => {
    const squares = [square(34.925, -102.125, 8.75), square(34.935, -102.125, 4.75), square(34.915, -102.135, 4.25)];
    const result = capSpikes(squares);
    expect(result[0].inches).toBe(4.75);
    expect(result[0].mm).toBe(4.75 * 25.4);
  });

  it("leaves a real hail core alone when its neighbors are nearly as big", () => {
    const squares = [square(33.535, -96.445, 4.5), square(33.545, -96.445, 4.5), square(33.525, -96.435, 4.25)];
    expect(capSpikes(squares).map((s) => s.inches)).toEqual([4.5, 4.5, 4.25]);
  });

  it("treats an isolated big square as a glitch, since real big hail covers more than one square", () => {
    const result = capSpikes([square(32.755, -97.335, 5)]);
    expect(result[0].inches).toBe(0.75);
    expect(result[0].mm).toBe(19.05);
  });

  it("keeps an isolated small square", () => {
    expect(capSpikes([square(32.755, -97.335, 1.25)])[0].inches).toBe(1.25);
  });

  it("does not compare squares from different storm days", () => {
    const squares = [square(34.925, -102.125, 5, "2026-04-28"), square(34.935, -102.125, 5, "2026-04-27")];
    expect(capSpikes(squares).map((s) => s.inches)).toEqual([0.75, 0.75]);
  });

  it("does not change the squares it was given", () => {
    const squares = [square(32.755, -97.335, 5)];
    capSpikes(squares);
    expect(squares[0].inches).toBe(5);
  });
});
