import { describe, it, expect } from "vitest";
import { resolveBusinessPlanForProfileWrite } from "./profileWrite";

// pages/api/users/[id].ts (the user-profile endpoint) writes `businessPlan`
// as a WHOLE-OBJECT $set, not the field-level $set/$unset semantics
// pages/api/business-plan.ts uses. That means simply deleting the three
// monthly goal keys from an incoming payload before $set would DELETE them
// from the stored document, because a whole-object replace throws away
// anything the new object doesn't mention. These tests pin down that
// resolveBusinessPlanForProfileWrite never lets that happen: a cross-user
// write always comes back with the CURRENT stored goal values (or absent,
// if never set), never the caller's values, and never nothing.
describe("resolveBusinessPlanForProfileWrite", () => {
  it("a self-write passes the incoming businessPlan through unrestricted (each person sets their own goals)", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: true,
      incomingBusinessPlan: { revenueGoal: 1, monthlyRevenueTarget: 15000 },
      existingBusinessPlan: { revenueGoal: 1, monthlyRevenueTarget: 9000 }
    });
    expect(result).toEqual({ revenueGoal: 1, monthlyRevenueTarget: 15000 });
  });

  it("omitting businessPlan entirely from the payload leaves it untouched (returns undefined so the handler must not add the key to $set)", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: false,
      incomingBusinessPlan: undefined,
      existingBusinessPlan: { monthlyRevenueTarget: 12000 }
    });
    expect(result).toBeUndefined();
  });

  it("an admin writing another user's profile with goal fields present: the goal fields never reach the result -- they come back as the CURRENT stored values, not the admin's", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: false,
      incomingBusinessPlan: {
        revenueGoal: 50000,
        monthlyRevenueTarget: 999999,
        monthlyKnockTarget: 999999,
        monthlyClaimsTarget: 999999
      },
      existingBusinessPlan: {
        revenueGoal: 40000,
        monthlyRevenueTarget: 12000,
        monthlyKnockTarget: 300,
        monthlyClaimsTarget: 8
      }
    });
    expect(result).toEqual({
      revenueGoal: 50000, // non-goal fields still follow the admin's edit
      monthlyRevenueTarget: 12000,
      monthlyKnockTarget: 300,
      monthlyClaimsTarget: 8
    });
  });

  it("regression guard: an existing stored goal is not blanked by a cross-user profile save that omits the goal fields from its businessPlan object", () => {
    // The admin's UI echoed back a businessPlan object that happens not to
    // carry the three goal keys (e.g. a client that never round-trips them).
    // The stored goal must survive anyway.
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: false,
      incomingBusinessPlan: { revenueGoal: 55000, committed: true },
      existingBusinessPlan: {
        revenueGoal: 40000,
        monthlyRevenueTarget: 12000,
        monthlyKnockTarget: 300,
        monthlyClaimsTarget: 8
      }
    });
    expect(result).toEqual({
      revenueGoal: 55000,
      committed: true,
      monthlyRevenueTarget: 12000,
      monthlyKnockTarget: 300,
      monthlyClaimsTarget: 8
    });
  });

  it("a cross-user write cannot MANUFACTURE a goal field that was never stored: no existing value means the key stays absent from the result", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: false,
      incomingBusinessPlan: { revenueGoal: 1, monthlyRevenueTarget: 999999 },
      existingBusinessPlan: { revenueGoal: 1 } // no goal fields ever set
    });
    expect(result).toEqual({ revenueGoal: 1 });
    expect(result && "monthlyRevenueTarget" in result).toBe(false);
  });

  it("a cross-user write with no existing businessPlan at all (brand new user) still cannot set goal fields", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: false,
      incomingBusinessPlan: { monthlyRevenueTarget: 999999, monthlyKnockTarget: 999999 },
      existingBusinessPlan: undefined
    });
    expect(result).toEqual({});
  });

  it("a cross-user write whose incoming businessPlan is null still restores any existing stored goals instead of nulling them out", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: false,
      incomingBusinessPlan: null,
      existingBusinessPlan: { monthlyRevenueTarget: 12000, monthlyClaimsTarget: 5 }
    });
    expect(result).toEqual({ monthlyRevenueTarget: 12000, monthlyClaimsTarget: 5 });
  });

  it("does not mutate the incoming or existing objects it was given", () => {
    const incoming = { revenueGoal: 1, monthlyRevenueTarget: 999 };
    const existing = { revenueGoal: 1, monthlyRevenueTarget: 12000 };
    resolveBusinessPlanForProfileWrite({ isSelf: false, incomingBusinessPlan: incoming, existingBusinessPlan: existing });
    expect(incoming).toEqual({ revenueGoal: 1, monthlyRevenueTarget: 999 });
    expect(existing).toEqual({ revenueGoal: 1, monthlyRevenueTarget: 12000 });
  });

  it("a self-write with businessPlan explicitly null passes null through (self may clear their own plan)", () => {
    const result = resolveBusinessPlanForProfileWrite({
      isSelf: true,
      incomingBusinessPlan: null,
      existingBusinessPlan: { monthlyRevenueTarget: 12000 }
    });
    expect(result).toBeNull();
  });
});
