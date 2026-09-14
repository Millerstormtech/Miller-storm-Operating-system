import { describe, it, expect } from "vitest";
import { distanceMeters, nearestWithin } from "./match";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters({ lat: 32.75, lng: -97.33 }, { lat: 32.75, lng: -97.33 })).toBe(0);
  });

  it("puts a thousandth of a degree of latitude at about 111 m", () => {
    const d = distanceMeters({ lat: 32.75, lng: -97.33 }, { lat: 32.751, lng: -97.33 });
    expect(d).toBeGreaterThan(110.5);
    expect(d).toBeLessThan(111.5);
  });

  it("shrinks east-west distances away from the equator", () => {
    // At Fort Worth's latitude a thousandth of a degree of longitude is about 93.5 m.
    const d = distanceMeters({ lat: 32.75, lng: -97.33 }, { lat: 32.75, lng: -97.331 });
    expect(d).toBeGreaterThan(93);
    expect(d).toBeLessThan(94.5);
  });
});

describe("nearestWithin", () => {
  const door = { lat: 32.75, lng: -97.33 };

  it("picks the closest home inside the limit", () => {
    const homes = [
      { id: "farther", lat: 32.7502, lng: -97.33 }, // about 22 m
      { id: "closer", lat: 32.75005, lng: -97.33 }, // about 6 m
    ];
    expect(nearestWithin(door, homes, 30)?.id).toBe("closer");
  });

  it("returns null when every home is farther than the limit", () => {
    expect(nearestWithin(door, [{ id: "a", lat: 32.7505, lng: -97.33 }], 30)).toBeNull(); // about 56 m
  });

  it("counts a home exactly on the limit", () => {
    const home = { id: "edge", lat: 32.7502, lng: -97.33 };
    expect(nearestWithin(door, [home], distanceMeters(door, home))?.id).toBe("edge");
  });

  it("keeps the first of two homes at the same distance", () => {
    const homes = [
      { id: "first", lat: 32.7501, lng: -97.33 },
      { id: "second", lat: 32.7501, lng: -97.33 },
    ];
    expect(nearestWithin(door, homes, 30)?.id).toBe("first");
  });

  it("returns null for an empty list", () => {
    expect(nearestWithin(door, [], 30)).toBeNull();
  });
});
