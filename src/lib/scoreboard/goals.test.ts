import { describe, it, expect } from "vitest";
import { scaleTargetToWindow, legacyFieldsFrom, monthlyFromLegacy } from "./goals";

// Central midnight, 1 July 2026 (CDT = UTC-5). July has 31 days.
const julStart = new Date("2026-07-01T05:00:00.000Z");
// Central midnight, 1 Feb 2026 (CST = UTC-6). February 2026 has 28 days.
const febStart = new Date("2026-02-01T06:00:00.000Z");

describe("scaleTargetToWindow", () => {
  it("month returns the target unchanged", () => {
    expect(scaleTargetToWindow(12000, "month", julStart)).toBe(12000);
  });
  it("year multiplies by 12", () => {
    expect(scaleTargetToWindow(12000, "year", julStart)).toBe(144000);
  });
  it("week is the monthly target's share of a 7 day slice (31 day month)", () => {
    // 12000 * 7/31 = 2709.677..., rounded to 2710
    expect(scaleTargetToWindow(12000, "week", julStart)).toBe(2710);
  });
  it("week scales by the ACTUAL month length (28 day month gives a bigger week)", () => {
    // 12000 * 7/28 = 3000 exactly
    expect(scaleTargetToWindow(12000, "week", febStart)).toBe(3000);
  });
  it("day is the monthly target divided by the days in that month", () => {
    // 12000 / 31 = 387.09..., rounded to 387
    expect(scaleTargetToWindow(12000, "day", julStart)).toBe(387);
  });
  it("an unset target stays unset (null in, null out)", () => {
    expect(scaleTargetToWindow(null, "month", julStart)).toBeNull();
    expect(scaleTargetToWindow(undefined, "year", julStart)).toBeNull();
  });
  it("zero is a real target, not 'unset'", () => {
    expect(scaleTargetToWindow(0, "month", julStart)).toBe(0);
  });
});

describe("legacyFieldsFrom", () => {
  const existing = {
    revenueGoal: 100000, averageDealSize: 3800, dealsPerYear: 26, dealsPerMonth: 2,
    inspectionsNeeded: 8, doorsPerYear: 0, doorsPerDay: 0, daysPerWeek: 5,
  };
  it("annualises the monthly revenue target into revenueGoal", () => {
    expect(legacyFieldsFrom(12000, existing).revenueGoal).toBe(144000);
  });
  it("preserves averageDealSize, which the new screen no longer asks for", () => {
    expect(legacyFieldsFrom(12000, existing).averageDealSize).toBe(3800);
  });
  it("recomputes the funnel from the new annual goal and the preserved deal size", () => {
    const out = legacyFieldsFrom(12000, existing);
    expect(out.dealsPerYear).toBe(38);   // round(144000 / 3800)
    expect(out.dealsPerMonth).toBe(3);   // round(38 / 12)
  });
  it("never divides by zero when no deal size was ever saved", () => {
    const out = legacyFieldsFrom(12000, { ...existing, averageDealSize: 0 });
    expect(out.dealsPerYear).toBe(0);
    expect(out.dealsPerMonth).toBe(0);
    expect(Number.isFinite(out.dealsPerYear)).toBe(true);
  });
  it("leaves every field it does not own untouched", () => {
    const out = legacyFieldsFrom(12000, existing);
    expect(out.daysPerWeek).toBe(5);
    expect(out.doorsPerYear).toBe(0);
    expect(out.doorsPerDay).toBe(0);
  });
  it("leaves revenueGoal alone when the monthly target is unset", () => {
    expect(legacyFieldsFrom(null, existing).revenueGoal).toBe(100000);
  });
});

describe("monthlyFromLegacy", () => {
  it("seeds a monthly target from an existing annual goal", () => {
    expect(monthlyFromLegacy(120000)).toBe(10000);
  });
  it("rounds to whole dollars", () => {
    expect(monthlyFromLegacy(100000)).toBe(8333);
  });
  it("returns null when there is nothing to seed from", () => {
    expect(monthlyFromLegacy(0)).toBeNull();
    expect(monthlyFromLegacy(null)).toBeNull();
    expect(monthlyFromLegacy(undefined)).toBeNull();
  });
});
