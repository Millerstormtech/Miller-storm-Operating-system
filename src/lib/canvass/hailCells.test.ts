import { describe, it, expect } from "vitest";
import { parseHailLine, hailCellKey } from "./hailCells";

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
