import { describe, it, expect } from "vitest";
import { resolveBusinessPlanWrite, stripMonthlyGoalFields } from "./authorization";

describe("resolveBusinessPlanWrite", () => {
  it("a rep writing their own plan is allowed, unrestricted, goals not stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "rep-1",
      authRole: "sales",
      requestedUserId: "rep-1"
    });
    expect(result).toEqual({ allowed: true, targetUserId: "rep-1", stripGoals: false });
  });

  it("a rep with no userId in the body is treated as writing their own plan", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "rep-1",
      authRole: "sales",
      requestedUserId: undefined
    });
    expect(result).toEqual({ allowed: true, targetUserId: "rep-1", stripGoals: false });
  });

  it("a rep attempting to write someone else's plan is rejected, not redirected to their own", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "rep-1",
      authRole: "sales",
      requestedUserId: "rep-2"
    });
    expect(result).toEqual({ allowed: false });
  });

  it("marketing (a non-privileged role) attempting to write someone else's plan is rejected", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "mkt-1",
      authRole: "marketing",
      requestedUserId: "rep-2"
    });
    expect(result).toEqual({ allowed: false });
  });

  it("admin writing their own plan is allowed, goals not stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "admin-1"
    });
    expect(result).toEqual({ allowed: true, targetUserId: "admin-1", stripGoals: false });
  });

  it("admin writing another user's plan is allowed with no managerId scope needed, and goals are stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "rep-9",
      targetManagerId: null // admin isn't scoped by managerId at all
    });
    expect(result).toEqual({ allowed: true, targetUserId: "rep-9", stripGoals: true });
  });

  it("a sales-team-lead writing their own plan is allowed, goals not stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "lead-1"
    });
    expect(result).toEqual({ allowed: true, targetUserId: "lead-1", stripGoals: false });
  });

  it("a sales-team-lead writing their own direct report's plan is allowed, and goals are stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetManagerId: "lead-1"
    });
    expect(result).toEqual({ allowed: true, targetUserId: "rep-5", stripGoals: true });
  });

  it("a sales-team-lead writing a rep who reports to a DIFFERENT team lead is rejected", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetManagerId: "lead-2"
    });
    expect(result).toEqual({ allowed: false });
  });

  it("a sales-team-lead writing a nonexistent user (no managerId on file) is rejected the same way as an out-of-scope rep", () => {
    const noManagerId = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "ghost-user",
      targetManagerId: undefined
    });
    const wrongManagerId = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetManagerId: "lead-2"
    });
    // Same shape either way: a probing caller cannot distinguish "no such
    // user" from "not your report" by looking at the response.
    expect(noManagerId).toEqual({ allowed: false });
    expect(wrongManagerId).toEqual({ allowed: false });
  });

  it("proves the three goal fields cannot be written cross-user: a privileged write to another user always comes back with stripGoals true", () => {
    const adminToOther = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "rep-9"
    });
    const leadToReport = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetManagerId: "lead-1"
    });
    expect(adminToOther).toMatchObject({ allowed: true, stripGoals: true });
    expect(leadToReport).toMatchObject({ allowed: true, stripGoals: true });
  });
});

describe("stripMonthlyGoalFields", () => {
  it("removes all three monthly goal keys, leaving legacy fields intact", () => {
    const plan = {
      revenueGoal: 120000,
      monthlyRevenueTarget: 15000,
      monthlyKnockTarget: 400,
      monthlyClaimsTarget: 10,
      committed: true
    };
    const result = stripMonthlyGoalFields(plan);
    expect(result).toEqual({ revenueGoal: 120000, committed: true });
    expect(result && "monthlyRevenueTarget" in result).toBe(false);
    expect(result && "monthlyKnockTarget" in result).toBe(false);
    expect(result && "monthlyClaimsTarget" in result).toBe(false);
  });

  it("strips an explicit null goal field too, not just a numeric one (delete removes the key regardless of value)", () => {
    const plan = { monthlyRevenueTarget: null, revenueGoal: 90000 };
    const result = stripMonthlyGoalFields(plan);
    expect(result).toEqual({ revenueGoal: 90000 });
  });

  it("does not mutate the original payload object", () => {
    const plan = { monthlyRevenueTarget: 15000, revenueGoal: 90000 };
    stripMonthlyGoalFields(plan);
    expect(plan).toEqual({ monthlyRevenueTarget: 15000, revenueGoal: 90000 });
  });

  it("leaves a payload with no goal keys unchanged", () => {
    const plan = { revenueGoal: 90000, committed: false };
    const result = stripMonthlyGoalFields(plan);
    expect(result).toEqual({ revenueGoal: 90000, committed: false });
  });

  it("passes through null/undefined untouched", () => {
    expect(stripMonthlyGoalFields(null)).toBeNull();
    expect(stripMonthlyGoalFields(undefined)).toBeUndefined();
  });
});
