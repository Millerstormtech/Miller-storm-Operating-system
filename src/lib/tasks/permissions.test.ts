import { describe, it, expect } from "vitest";
import {
  scopeFor,
  canAssignTo,
  canViewTask,
  canEditField,
  groupByUrgency,
  type Actor,
  type TargetUser,
  type TaskLike,
} from "./permissions";

const admin: Actor = { id: "u-admin", role: "admin" };
const cLevel: Actor = { id: "u-clevel", role: "c-level" };
const lubbockBM: Actor = { id: "u-bm", role: "branch-manager", branches: ["Lubbock"] };
const leadA: Actor = { id: "u-lead-a", role: "sales-team-lead" };
const leadB: Actor = { id: "u-lead-b", role: "sales-team-lead" };
const repA: Actor = { id: "u-rep-a", role: "sales" };
const marketer: Actor = { id: "u-mkt", role: "marketing" };

const repAUser: TargetUser = { id: "u-rep-a", managerId: "u-lead-a", branches: ["Lubbock"] };
const repBUser: TargetUser = { id: "u-rep-b", managerId: "u-lead-b", branches: ["DFW"] };
const leadAUser: TargetUser = { id: "u-lead-a" };

function task(over: Partial<TaskLike> = {}): TaskLike {
  return {
    id: "t1",
    assignedTo: "u-rep-a",
    createdBy: "u-lead-a",
    origin: "assigned",
    visibility: "shared",
    status: "not started",
    deadline: "2026-08-10",
    editableFields: [],
    ...over,
  };
}

describe("scopeFor", () => {
  it("gives admin and c-level the whole company", () => {
    expect(scopeFor(admin)).toEqual({ mode: "all" });
    expect(scopeFor(cLevel)).toEqual({ mode: "all" });
  });

  it("scopes a branch manager to their branches", () => {
    expect(scopeFor(lubbockBM)).toEqual({ mode: "branch", branches: ["Lubbock"] });
  });

  it("scopes a team lead to their own reports", () => {
    expect(scopeFor(leadA)).toEqual({ mode: "team", managerId: "u-lead-a" });
  });

  it("scopes sales and marketing to themselves", () => {
    expect(scopeFor(repA)).toEqual({ mode: "self", userId: "u-rep-a" });
    expect(scopeFor(marketer)).toEqual({ mode: "self", userId: "u-mkt" });
  });
});

describe("canAssignTo", () => {
  it("lets anyone assign to themselves", () => {
    expect(canAssignTo(repA, repAUser)).toBe(true);
    expect(canAssignTo(marketer, { id: "u-mkt" })).toBe(true);
  });

  it("stops a rep assigning to another rep", () => {
    expect(canAssignTo(repA, repBUser)).toBe(false);
  });

  it("stops a rep assigning to their manager", () => {
    expect(canAssignTo(repA, leadAUser)).toBe(false);
  });

  it("lets a team lead assign to their own rep", () => {
    expect(canAssignTo(leadA, repAUser)).toBe(true);
  });

  it("stops a team lead assigning to another team's rep", () => {
    expect(canAssignTo(leadB, repAUser)).toBe(false);
  });

  it("lets a branch manager assign inside their branch only", () => {
    expect(canAssignTo(lubbockBM, repAUser)).toBe(true);
    expect(canAssignTo(lubbockBM, repBUser)).toBe(false);
  });

  it("lets admin and c-level assign to anyone", () => {
    expect(canAssignTo(admin, repBUser)).toBe(true);
    expect(canAssignTo(cLevel, repBUser)).toBe(true);
  });

  it("stops marketing assigning to anyone but themselves", () => {
    expect(canAssignTo(marketer, repAUser)).toBe(false);
  });
});

describe("canViewTask", () => {
  it("always lets the assignee see their own task", () => {
    expect(canViewTask(repA, task(), repAUser)).toBe(true);
  });

  it("hides a private self-task from the owner's team lead", () => {
    const t = task({ origin: "self", visibility: "private", createdBy: "u-rep-a" });
    expect(canViewTask(leadA, t, repAUser)).toBe(false);
  });

  it("hides a private self-task from an admin", () => {
    const t = task({ origin: "self", visibility: "private", createdBy: "u-rep-a" });
    expect(canViewTask(admin, t, repAUser)).toBe(false);
  });

  it("shows a shared self-task to the owner's team lead", () => {
    const t = task({ origin: "self", visibility: "shared", createdBy: "u-rep-a" });
    expect(canViewTask(leadA, t, repAUser)).toBe(true);
  });

  it("hides another team's task from a team lead", () => {
    expect(canViewTask(leadB, task(), repAUser)).toBe(false);
  });

  it("shows a branch manager tasks inside their branch only", () => {
    expect(canViewTask(lubbockBM, task(), repAUser)).toBe(true);
    expect(canViewTask(lubbockBM, task({ assignedTo: "u-rep-b" }), repBUser)).toBe(false);
  });
});

describe("canEditField", () => {
  it("lets the assignee change status and their own notes", () => {
    expect(canEditField(repA, task(), "status", repAUser)).toBe(true);
    expect(canEditField(repA, task(), "notesByUser", repAUser)).toBe(true);
    expect(canEditField(repA, task(), "supportingLinksByUser", repAUser)).toBe(true);
  });

  it("stops the assignee changing priority on an assigned task", () => {
    expect(canEditField(repA, task(), "priority", repAUser)).toBe(false);
  });

  it("honours a legacy task's editableFields", () => {
    const t = task({ editableFields: ["priority"] });
    expect(canEditField(repA, t, "priority", repAUser)).toBe(true);
  });

  it("lets the owner of a self-created task change everything on it", () => {
    const t = task({ origin: "self", createdBy: "u-rep-a" });
    expect(canEditField(repA, t, "priority", repAUser)).toBe(true);
    expect(canEditField(repA, t, "visibility", repAUser)).toBe(true);
  });

  it("lets the assigning lead change every field", () => {
    expect(canEditField(leadA, task(), "priority", repAUser)).toBe(true);
    expect(canEditField(leadA, task(), "deadline", repAUser)).toBe(true);
  });

  it("stops another team's lead editing anything", () => {
    expect(canEditField(leadB, task(), "priority", repAUser)).toBe(false);
  });

  it("never allows the immutable fields to be edited", () => {
    for (const field of ["id", "createdBy", "origin", "assignedTo"]) {
      expect(canEditField(admin, task(), field, repAUser)).toBe(false);
      expect(canEditField(repA, task(), field, repAUser)).toBe(false);
    }
  });
});

describe("groupByUrgency", () => {
  const today = "2026-08-03";

  it("puts a task due today in today, not overdue", () => {
    const g = groupByUrgency([task({ deadline: today })], today);
    expect(g.today).toHaveLength(1);
    expect(g.overdue).toHaveLength(0);
  });

  it("splits past, present and future", () => {
    const g = groupByUrgency(
      [
        task({ id: "a", deadline: "2026-08-01" }),
        task({ id: "b", deadline: today }),
        task({ id: "c", deadline: "2026-09-01" }),
      ],
      today
    );
    expect(g.overdue.map((t) => t.id)).toEqual(["a"]);
    expect(g.today.map((t) => t.id)).toEqual(["b"]);
    expect(g.upcoming.map((t) => t.id)).toEqual(["c"]);
  });

  it("puts every done task in done regardless of deadline", () => {
    const g = groupByUrgency(
      [
        task({ id: "a", deadline: "2026-08-01", status: "done" }),
        task({ id: "b", deadline: "2026-09-01", status: "done" }),
      ],
      today
    );
    expect(g.done).toHaveLength(2);
    expect(g.overdue).toHaveLength(0);
    expect(g.upcoming).toHaveLength(0);
  });

  it("sorts done by most recently completed first", () => {
    const g = groupByUrgency(
      [
        task({ id: "older", status: "done", completedAt: "2026-07-01T00:00:00Z" }),
        task({ id: "newer", status: "done", completedAt: "2026-08-01T00:00:00Z" }),
      ],
      today
    );
    expect(g.done.map((t) => t.id)).toEqual(["newer", "older"]);
  });

  it("treats a missing deadline as upcoming", () => {
    const g = groupByUrgency([task({ deadline: "" })], today);
    expect(g.upcoming).toHaveLength(1);
  });
});
