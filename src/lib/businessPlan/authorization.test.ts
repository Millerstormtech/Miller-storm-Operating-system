import { describe, it, expect } from "vitest";
import {
  resolveBusinessPlanWrite,
  stripMonthlyGoalFields,
  buildAuthorizedPlanPayload,
  isValidRequestedUserId
} from "./authorization";

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

  it("a rep attempting to write someone else's plan is rejected (forbidden), not redirected to their own", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "rep-1",
      authRole: "sales",
      requestedUserId: "rep-2"
    });
    expect(result).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("a non-privileged caller gets 'forbidden' regardless of whether the target exists -- no lookup, no leak", () => {
    // targetExists is never even populated for a non-privileged caller in
    // the real handler (no DB read happens), but even if it were passed,
    // rule 1 rejects before targetExists is ever consulted.
    const existing = resolveBusinessPlanWrite({
      authUserId: "rep-1",
      authRole: "sales",
      requestedUserId: "rep-2",
      targetExists: true
    });
    const nonexistent = resolveBusinessPlanWrite({
      authUserId: "rep-1",
      authRole: "sales",
      requestedUserId: "ghost",
      targetExists: false
    });
    expect(existing).toEqual({ allowed: false, reason: "forbidden" });
    expect(nonexistent).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("marketing (a non-privileged role) attempting to write someone else's plan is rejected", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "mkt-1",
      authRole: "marketing",
      requestedUserId: "rep-2"
    });
    expect(result).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("admin writing their own plan is allowed, goals not stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "admin-1"
    });
    expect(result).toEqual({ allowed: true, targetUserId: "admin-1", stripGoals: false });
  });

  it("admin writing another EXISTING user's plan is allowed with no managerId scope needed, and goals are stripped", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "rep-9",
      targetExists: true,
      targetManagerId: null // admin isn't scoped by managerId at all
    });
    expect(result).toEqual({ allowed: true, targetUserId: "rep-9", stripGoals: true });
  });

  it("admin writing a NONEXISTENT userId is rejected (not-found), preventing a phantom user from being upserted", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "typo-d-id",
      targetExists: false
    });
    expect(result).toEqual({ allowed: false, reason: "not-found" });
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
      targetExists: true,
      targetManagerId: "lead-1"
    });
    expect(result).toEqual({ allowed: true, targetUserId: "rep-5", stripGoals: true });
  });

  it("a sales-team-lead writing a rep who reports to a DIFFERENT team lead is rejected (forbidden)", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetExists: true,
      targetManagerId: "lead-2"
    });
    expect(result).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("a sales-team-lead writing a nonexistent user is rejected as not-found before the managerId check ever runs", () => {
    const result = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "ghost-user",
      targetExists: false,
      targetManagerId: undefined
    });
    expect(result).toEqual({ allowed: false, reason: "not-found" });
  });

  it("proves the three goal fields cannot be written cross-user: a privileged write to another user always comes back with stripGoals true", () => {
    const adminToOther = resolveBusinessPlanWrite({
      authUserId: "admin-1",
      authRole: "admin",
      requestedUserId: "rep-9",
      targetExists: true
    });
    const leadToReport = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetExists: true,
      targetManagerId: "lead-1"
    });
    expect(adminToOther).toMatchObject({ allowed: true, stripGoals: true });
    expect(leadToReport).toMatchObject({ allowed: true, stripGoals: true });
  });
});

describe("isValidRequestedUserId (NoSQL injection guard)", () => {
  it("accepts a normal string id", () => {
    expect(isValidRequestedUserId("rep-1")).toBe(true);
  });

  it("accepts null and undefined (both mean 'no target named')", () => {
    expect(isValidRequestedUserId(null)).toBe(true);
    expect(isValidRequestedUserId(undefined)).toBe(true);
  });

  it("rejects a Mongo operator object such as { $ne: 'x' }", () => {
    expect(isValidRequestedUserId({ $ne: "x" })).toBe(false);
  });

  it("rejects a plain object, array, number, and boolean", () => {
    expect(isValidRequestedUserId({ id: "rep-1" })).toBe(false);
    expect(isValidRequestedUserId(["rep-1"])).toBe(false);
    expect(isValidRequestedUserId(123)).toBe(false);
    expect(isValidRequestedUserId(true)).toBe(false);
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

describe("buildAuthorizedPlanPayload (the handler's actual join point -- Important 1 regression guard)", () => {
  it("strips the three goal keys when the decision says stripGoals: true", () => {
    const decision = { allowed: true as const, targetUserId: "rep-9", stripGoals: true };
    const payload = {
      revenueGoal: 1,
      monthlyRevenueTarget: 999,
      monthlyKnockTarget: 999,
      monthlyClaimsTarget: 999
    };
    const result = buildAuthorizedPlanPayload(decision, payload);
    expect(result).toEqual({ revenueGoal: 1 });
  });

  it("passes the payload through untouched when the decision says stripGoals: false", () => {
    const decision = { allowed: true as const, targetUserId: "rep-1", stripGoals: false };
    const payload = { revenueGoal: 1, monthlyRevenueTarget: 999 };
    const result = buildAuthorizedPlanPayload(decision, payload);
    expect(result).toEqual({ revenueGoal: 1, monthlyRevenueTarget: 999 });
  });

  it("regression guard: a real cross-user decision from resolveBusinessPlanWrite, joined through this function, always yields a goal-free payload", () => {
    // This is the exact two-call sequence the handler performs
    // (resolveBusinessPlanWrite then buildAuthorizedPlanPayload). Changing
    // the handler to bypass buildAuthorizedPlanPayload (e.g. reverting to
    // `const planPayload = businessPlan;`) is not something a unit test on
    // this module can detect -- but this test proves that AS LONG AS the
    // handler calls both functions in sequence, the goal keys cannot
    // survive on any cross-user write, regardless of what the payload
    // contains.
    const decision = resolveBusinessPlanWrite({
      authUserId: "lead-1",
      authRole: "sales-team-lead",
      requestedUserId: "rep-5",
      targetExists: true,
      targetManagerId: "lead-1"
    });
    if (!decision.allowed) throw new Error("expected this write to be allowed");

    const maliciousPayload = {
      revenueGoal: 50000,
      monthlyRevenueTarget: 999999,
      monthlyKnockTarget: 999999,
      monthlyClaimsTarget: 999999
    };
    const result = buildAuthorizedPlanPayload(decision, maliciousPayload);
    expect(result).toEqual({ revenueGoal: 50000 });
    expect(result && "monthlyRevenueTarget" in result).toBe(false);
    expect(result && "monthlyKnockTarget" in result).toBe(false);
    expect(result && "monthlyClaimsTarget" in result).toBe(false);
  });
});
