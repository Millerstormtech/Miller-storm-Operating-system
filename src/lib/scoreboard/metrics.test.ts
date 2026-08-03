import { describe, it, expect } from "vitest";
import { conversions, trend, rateDir } from "./metrics";
import type { Totals } from "./types";

const t = (over: Partial<Totals>): Totals => ({ revenue: 0, knocks: 0, claims: 0, contracts: 0, ...over });

describe("conversions", () => {
  it("computes knock->claim and claim->contract as fractions", () => {
    const c = conversions(t({ knocks: 200, claims: 6, contracts: 2 }));
    expect(c.knockToClaim.rate).toBeCloseTo(0.03, 5);
    expect(c.knockToClaim.hidden).toBe(false);
    expect(c.claimToContract.rate).toBeCloseTo(1 / 3, 5);
    expect(c.claimToContract.hidden).toBe(false);
  });
  it("hides knock->claim when knocks below the floor", () => {
    const c = conversions(t({ knocks: 4, claims: 1 }));
    expect(c.knockToClaim.hidden).toBe(true);
  });
  it("hides claim->contract when claims below the floor", () => {
    const c = conversions(t({ knocks: 200, claims: 2, contracts: 1 }));
    expect(c.claimToContract.hidden).toBe(true);
  });
  it("never divides by zero (rate 0, hidden true)", () => {
    const c = conversions(t({ knocks: 0, claims: 0, contracts: 0 }));
    expect(c.knockToClaim).toEqual({ rate: 0, hidden: true });
    expect(c.claimToContract).toEqual({ rate: 0, hidden: true });
  });
  it("opts override changes hidden state for knocks", () => {
    const c = conversions(t({ knocks: 5, claims: 1 }), { minKnocks: 5 });
    expect(c.knockToClaim.hidden).toBe(false);
  });
  it("opts override changes hidden state for claims", () => {
    const c = conversions(t({ knocks: 200, claims: 2, contracts: 1 }), { minClaims: 2 });
    expect(c.claimToContract.hidden).toBe(false);
  });
  it("exactly at floor is not hidden", () => {
    const c = conversions(t({ knocks: 10, claims: 3, contracts: 1 }));
    expect(c.knockToClaim.hidden).toBe(false);
    expect(c.claimToContract.hidden).toBe(false);
  });
});

describe("trend", () => {
  it("percent change up", () => {
    expect(trend(112, 100)).toEqual({ pct: 12, dir: "up" });
  });
  it("percent change down", () => {
    expect(trend(96, 100)).toEqual({ pct: -4, dir: "down" });
  });
  it("no prior data -> no arrow", () => {
    expect(trend(50, 0)).toEqual({ pct: null, dir: null });
  });
  it("flat", () => {
    expect(trend(100, 100)).toEqual({ pct: 0, dir: "flat" });
  });
  it("negative previous returns null", () => {
    expect(trend(50, -10)).toEqual({ pct: null, dir: null });
  });
});

describe("rateDir", () => {
  it("up when the rate improved", () => {
    expect(rateDir(0.03, 0.025, false)).toBe("up");
  });
  it("null when hidden", () => {
    expect(rateDir(0.03, 0.025, true)).toBeNull();
  });
  it("null when no prior rate", () => {
    expect(rateDir(0.03, 0, false)).toBeNull();
  });
});
