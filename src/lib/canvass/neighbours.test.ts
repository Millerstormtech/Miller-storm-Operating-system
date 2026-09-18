// src/lib/canvass/neighbours.test.ts
import { describe, it, expect } from "vitest";
import { buildSigningIndex, latestSigningNear } from "./neighbours";

// Spec A4: +5 when a neighbour within about 150 m signed with us in the last 90
// days (source: AccuLynx). The grade only sees the date; this finds it.

describe("latestSigningNear", () => {
  const house = { id: "house", lat: 32.75, lng: -97.33 };

  it("finds the most recent signing at another house within 150 m", () => {
    const index = buildSigningIndex([
      { homeId: "a", lat: 32.7505, lng: -97.33, day: "2026-05-01" }, // about 56 m away
      { homeId: "b", lat: 32.751, lng: -97.33, day: "2026-06-15" }, // about 111 m away
    ]);
    expect(latestSigningNear(index, house, 150)).toBe("2026-06-15");
  });

  it("ignores a signing at the house itself", () => {
    const index = buildSigningIndex([{ homeId: "house", lat: 32.75, lng: -97.33, day: "2026-06-15" }]);
    expect(latestSigningNear(index, house, 150)).toBeNull();
  });

  it("ignores signings farther than the radius", () => {
    const index = buildSigningIndex([{ homeId: "far", lat: 32.752, lng: -97.33, day: "2026-06-15" }]); // about 222 m away
    expect(latestSigningNear(index, house, 150)).toBeNull();
  });

  it("finds a signing just across a grid line, in the next map cell", () => {
    const edgeHouse = { id: "edge", lat: 32.7599, lng: -97.3301 };
    const index = buildSigningIndex([{ homeId: "across", lat: 32.7601, lng: -97.3299, day: "2026-06-01" }]); // about 30 m away
    expect(latestSigningNear(index, edgeHouse, 150)).toBe("2026-06-01");
  });

  it("returns null when nobody signed", () => {
    expect(latestSigningNear(buildSigningIndex([]), house, 150)).toBeNull();
  });
});
