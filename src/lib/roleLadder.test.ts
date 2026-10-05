import { describe, it, expect } from "vitest";
import { isRep, isTeamLead, isBranchManager, isAdmin, REP_ROLES, TEAM_LEAD_ROLES } from "./roleLadder";

describe("role ladder", () => {
  it("a branch manager is also a team lead and a rep", () => {
    expect([isBranchManager("branch-manager"), isTeamLead("branch-manager"), isRep("branch-manager")]).toEqual([true, true, true]);
  });
  it("a team lead is also a rep, but not a branch manager", () => {
    expect([isBranchManager("sales-team-lead"), isTeamLead("sales-team-lead"), isRep("sales-team-lead")]).toEqual([false, true, true]);
  });
  it("a rep is only a rep", () => {
    expect([isTeamLead("sales"), isRep("sales")]).toEqual([false, true]);
  });
  it("admin, marketing and c-level are only themselves", () => {
    for (const role of ["admin", "marketing", "c-level"]) {
      expect([isRep(role), isTeamLead(role), isBranchManager(role)]).toEqual([false, false, false]);
    }
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("c-level")).toBe(false);
  });
  it("no role, or an unknown one, is nothing", () => {
    for (const role of [undefined, null, "", "manager"]) {
      expect([isRep(role), isTeamLead(role), isAdmin(role)]).toEqual([false, false, false]);
    }
  });
  it("the lists match the helpers, for database queries", () => {
    expect([...REP_ROLES]).toEqual(["sales", "sales-team-lead", "branch-manager"]);
    expect([...TEAM_LEAD_ROLES]).toEqual(["sales-team-lead", "branch-manager"]);
  });
});
