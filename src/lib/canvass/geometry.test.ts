import { describe, it, expect } from "vitest";
import { representativePoint, outlineArea, type PolygonGeometry } from "./geometry";

const square = (west: number, south: number, size: number): [number, number][] => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
];

describe("representativePoint", () => {
  it("is the middle of a square parcel", () => {
    const [lng, lat] = representativePoint({ type: "Polygon", coordinates: [square(-102.3, 33.5, 0.1)] })!;
    expect(lng).toBeCloseTo(-102.25, 9);
    expect(lat).toBeCloseTo(33.55, 9);
  });

  it("is the area-weighted center of a triangle, not the average of its corners' extremes", () => {
    const triangle: PolygonGeometry = { type: "Polygon", coordinates: [[[0, 0], [6, 0], [0, 6], [0, 0]]] };
    const [x, y] = representativePoint(triangle)!;
    expect(x).toBeCloseTo(2, 9);
    expect(y).toBeCloseTo(2, 9);
  });

  it("gives the same answer whichever way the outline is drawn", () => {
    const clockwise = [...square(-102.3, 33.5, 0.1)].reverse();
    const [lng, lat] = representativePoint({ type: "Polygon", coordinates: [clockwise] })!;
    expect(lng).toBeCloseTo(-102.25, 9);
    expect(lat).toBeCloseTo(33.55, 9);
  });

  it("uses the biggest piece of a parcel made of several pieces", () => {
    const multi: PolygonGeometry = {
      type: "MultiPolygon",
      coordinates: [[square(-97.0, 32.0, 0.001)], [square(-97.5, 32.5, 0.01)]],
    };
    const [lng, lat] = representativePoint(multi)!;
    expect(lng).toBeCloseTo(-97.495, 9);
    expect(lat).toBeCloseTo(32.505, 9);
  });

  it("falls back to the average corner for an outline with no area", () => {
    const flat: PolygonGeometry = { type: "Polygon", coordinates: [[[0, 0], [2, 0], [4, 0], [0, 0]]] };
    const [x, y] = representativePoint(flat)!;
    expect(x).toBeCloseTo(2, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it("is null for an empty outline", () => {
    expect(representativePoint({ type: "Polygon", coordinates: [] })).toBeNull();
  });
});

describe("outlineArea", () => {
  it("is width times height for a square outline, in square degrees", () => {
    expect(outlineArea({ type: "Polygon", coordinates: [square(-102.3, 33.5, 0.1)] })).toBeCloseTo(0.01, 12);
  });

  it("adds up every piece of a parcel made of several pieces", () => {
    const multi: PolygonGeometry = {
      type: "MultiPolygon",
      coordinates: [[square(-97.0, 32.0, 0.001)], [square(-97.5, 32.5, 0.01)]],
    };
    expect(outlineArea(multi)).toBeCloseTo(0.000001 + 0.0001, 12);
  });

  it("is zero for an outline with no area", () => {
    expect(outlineArea({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [4, 0], [0, 0]]] })).toBe(0);
  });

  it("is zero for an empty outline", () => {
    expect(outlineArea({ type: "Polygon", coordinates: [] })).toBe(0);
  });
});
