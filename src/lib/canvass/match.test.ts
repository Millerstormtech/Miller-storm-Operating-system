import { describe, it, expect } from "vitest";
import { distanceMeters, matchToHome, nearestWithin } from "./match";

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

describe("matchToHome", () => {
  // Made-up addresses around one Fort Worth point.
  const door = { lat: 32.75, lng: -97.33, addressLine: "1402 N Example Street" };
  const neighbor = { id: "neighbor", lat: 32.75005, lng: -97.33, addressLine: "1404 EXAMPLE ST" }; // about 6 m
  const sameAddress = { id: "same-address", lat: 32.7502, lng: -97.33, addressLine: "1402 EXAMPLE ST" }; // about 22 m

  it("picks the house with the same number and street over a closer neighbor", () => {
    const match = matchToHome(door, [neighbor, sameAddress]);
    expect(match).toMatchObject({ homeId: "same-address", method: "address" });
    expect(match!.meters).toBeGreaterThan(21);
    expect(match!.meters).toBeLessThan(23);
  });

  it("falls back to the nearest house within 30 m when no address matches", () => {
    expect(matchToHome({ ...door, addressLine: "1500 OTHER RD" }, [neighbor, sameAddress])).toMatchObject({
      homeId: "neighbor",
      method: "distance",
    });
  });

  it("returns null when no address matches and nothing is within 30 m", () => {
    const far = { id: "far", lat: 32.7505, lng: -97.33, addressLine: "1500 OTHER RD" }; // about 56 m
    expect(matchToHome(door, [far])).toBeNull();
  });

  it("does not take a same-address house farther than 250 m", () => {
    const tooFar = { ...sameAddress, id: "too-far", lat: 32.753 }; // about 333 m
    expect(matchToHome(door, [tooFar])).toBeNull();
  });

  it("takes the nearer of two houses with the same number and street", () => {
    const farther = { ...sameAddress, id: "farther-same", lat: 32.751 }; // about 111 m
    expect(matchToHome(door, [farther, sameAddress])?.homeId).toBe("same-address");
  });

  it("uses distance only when the door's address has no house number", () => {
    expect(matchToHome({ ...door, addressLine: "EXAMPLE ST" }, [neighbor, sameAddress])).toMatchObject({
      homeId: "neighbor",
      method: "distance",
    });
  });

  it("never matches a house with a blank address by address", () => {
    const blank = { id: "blank", lat: 32.75005, lng: -97.33, addressLine: "" };
    expect(matchToHome(door, [blank])).toMatchObject({ homeId: "blank", method: "distance" });
  });

  it("matches a rural road written two ways", () => {
    const ruralDoor = { lat: 32.75, lng: -97.33, addressLine: "1234 County Road 5" };
    const ruralHouse = { id: "rural", lat: 32.7509, lng: -97.33, addressLine: "1234 CR 5" }; // about 100 m
    expect(matchToHome(ruralDoor, [ruralHouse])).toMatchObject({ homeId: "rural", method: "address" });
  });

  it("returns null for an empty list", () => {
    expect(matchToHome(door, [])).toBeNull();
  });
});
