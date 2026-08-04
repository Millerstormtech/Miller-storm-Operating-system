import { describe, it, expect } from "vitest";
import { buildBusinessPlanUpdate } from "./update";

describe("buildBusinessPlanUpdate", () => {
  it("leaves an absent key untouched: nothing in $set or $unset for it", () => {
    const result = buildBusinessPlanUpdate({ revenueGoal: 100000 });
    expect(result.$set).toEqual({ "businessPlan.revenueGoal": 100000 });
    expect(result.$unset?.["businessPlan.monthlyKnockTarget"]).toBeUndefined();
    expect("businessPlan.monthlyKnockTarget" in (result.$set ?? {})).toBe(false);
  });

  it("puts a key with a normal value into $set under the correct dotted path", () => {
    const result = buildBusinessPlanUpdate({ monthlyRevenueTarget: 15000 });
    expect(result.$set).toEqual({ "businessPlan.monthlyRevenueTarget": 15000 });
    expect(result.$unset).toBeUndefined();
  });

  it("puts a key with explicit null into $unset, not $set", () => {
    const result = buildBusinessPlanUpdate({ monthlyRevenueTarget: null });
    expect(result.$unset).toEqual({ "businessPlan.monthlyRevenueTarget": "" });
    expect(result.$set).toBeUndefined();
  });

  it("treats 0 as a real, deliberate value: it is $set, never absent or unset", () => {
    const result = buildBusinessPlanUpdate({
      monthlyRevenueTarget: 0,
      monthlyKnockTarget: 0,
      monthlyClaimsTarget: 0,
      dealsPerYear: 0,
      doorsPerYear: 0,
      doorsPerDay: 0
    });
    expect(result.$set).toEqual({
      "businessPlan.monthlyRevenueTarget": 0,
      "businessPlan.monthlyKnockTarget": 0,
      "businessPlan.monthlyClaimsTarget": 0,
      "businessPlan.dealsPerYear": 0,
      "businessPlan.doorsPerYear": 0,
      "businessPlan.doorsPerDay": 0
    });
    expect(result.$unset).toBeUndefined();
  });

  it("treats an explicit undefined the same as absent (JSON drops it anyway)", () => {
    const result = buildBusinessPlanUpdate({ monthlyRevenueTarget: undefined, committed: true });
    expect(result.$set).toEqual({ "businessPlan.committed": true });
    expect(result.$unset).toBeUndefined();
  });

  it("an empty object produces a safe, empty update: no $set, no $unset", () => {
    const result = buildBusinessPlanUpdate({});
    expect(result.$set).toBeUndefined();
    expect(result.$unset).toBeUndefined();
    expect(Object.keys(result)).toEqual([]);
  });

  it("null/undefined plan input is treated the same as an empty object", () => {
    expect(buildBusinessPlanUpdate(null)).toEqual({});
    expect(buildBusinessPlanUpdate(undefined)).toEqual({});
  });

  it("handles arrays such as territories: a normal array value is $set", () => {
    const result = buildBusinessPlanUpdate({ territories: ["North Dallas", "Plano"] });
    expect(result.$set).toEqual({ "businessPlan.territories": ["North Dallas", "Plano"] });
  });

  it("an explicit null on an array field unsets it rather than setting an empty array", () => {
    const result = buildBusinessPlanUpdate({ territories: null });
    expect(result.$unset).toEqual({ "businessPlan.territories": "" });
    expect(result.$set).toBeUndefined();
  });

  it("an explicit empty array is a real value (all territories cleared), not a null-unset", () => {
    const result = buildBusinessPlanUpdate({ territories: [] });
    expect(result.$set).toEqual({ "businessPlan.territories": [] });
    expect(result.$unset).toBeUndefined();
  });

  it("round-trips all eleven legacy fields plus the three monthly targets", () => {
    const plan = {
      revenueGoal: 144000,
      averageDealSize: 3800,
      dealsPerYear: 38,
      dealsPerMonth: 3,
      inspectionsNeeded: 8,
      doorsPerYear: 500,
      doorsPerDay: 20,
      daysPerWeek: 5,
      territories: ["Frisco"],
      selectedPresetId: "aggressive",
      committed: true,
      monthlyRevenueTarget: 12000,
      monthlyKnockTarget: 400,
      monthlyClaimsTarget: 10
    };
    const result = buildBusinessPlanUpdate(plan);
    expect(result.$set).toEqual({
      "businessPlan.revenueGoal": 144000,
      "businessPlan.averageDealSize": 3800,
      "businessPlan.dealsPerYear": 38,
      "businessPlan.dealsPerMonth": 3,
      "businessPlan.inspectionsNeeded": 8,
      "businessPlan.doorsPerYear": 500,
      "businessPlan.doorsPerDay": 20,
      "businessPlan.daysPerWeek": 5,
      "businessPlan.territories": ["Frisco"],
      "businessPlan.selectedPresetId": "aggressive",
      "businessPlan.committed": true,
      "businessPlan.monthlyRevenueTarget": 12000,
      "businessPlan.monthlyKnockTarget": 400,
      "businessPlan.monthlyClaimsTarget": 10
    });
  });

  it("a manager save that sends no goal keys cannot touch the three goal fields", () => {
    // Shape of what TeamBusinessPlans.tsx / BusinessUnits.tsx actually send:
    // the eleven legacy fields, no monthly targets at all.
    const managerPayload = {
      revenueGoal: 120000,
      daysPerWeek: 5,
      territories: ["North Dallas"],
      averageDealSize: 3500,
      dealsPerYear: 34,
      dealsPerMonth: 3,
      inspectionsNeeded: 9,
      doorsPerYear: 0,
      doorsPerDay: 0,
      committed: false
    };
    const result = buildBusinessPlanUpdate(managerPayload);
    expect(result.$set?.["businessPlan.monthlyRevenueTarget"]).toBeUndefined();
    expect(result.$set?.["businessPlan.monthlyKnockTarget"]).toBeUndefined();
    expect(result.$set?.["businessPlan.monthlyClaimsTarget"]).toBeUndefined();
    expect("businessPlan.monthlyRevenueTarget" in (result.$set ?? {})).toBe(false);
    expect(result.$unset).toBeUndefined();
  });

  it("ignores keys outside the fixed businessPlan whitelist, however they are spelled", () => {
    const malicious = {
      revenueGoal: 50000,
      __proto__: { polluted: true },
      $where: "function() { return true; }",
      role: "admin",
      "businessPlan.revenueGoal": 999999999,
      "$set": { "businessPlan.committed": true },
      userId: "someone-elses-id",
      id: "someone-elses-id"
    } as Record<string, unknown>;
    const result = buildBusinessPlanUpdate(malicious);
    expect(result.$set).toEqual({ "businessPlan.revenueGoal": 50000 });
    // Only one key ever lands in $set, and it is the whitelisted one.
    expect(Object.keys(result.$set ?? {})).toEqual(["businessPlan.revenueGoal"]);
  });

  it("supports an alternate (empty) prefix for mirroring into the flat legacy collection", () => {
    const result = buildBusinessPlanUpdate({ revenueGoal: 90000, monthlyRevenueTarget: null }, "");
    expect(result.$set).toEqual({ revenueGoal: 90000 });
    expect(result.$unset).toEqual({ monthlyRevenueTarget: "" });
  });
});
