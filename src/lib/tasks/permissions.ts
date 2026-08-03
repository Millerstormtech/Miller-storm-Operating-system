// src/lib/tasks/permissions.ts
//
// Pure task permission and grouping rules. No database, no React, no I/O.
// The API route (pages/api/tasks/index.ts) and the screen
// (src/portals/shared/MyTasks/) both import from here on purpose, so the UI can
// never offer an action the server will reject.

export type Actor = { id: string; role: string; branches?: string[] };
export type TargetUser = { id: string; managerId?: string; branches?: string[] };

export type TaskLike = {
  id: string;
  assignedTo: string;
  createdBy?: string;
  origin?: "assigned" | "self";
  visibility?: "private" | "shared";
  status?: string;
  deadline?: string;
  completedAt?: string | Date | null;
  editableFields?: string[];
};

export type Scope =
  | { mode: "all" }
  | { mode: "self"; userId: string }
  | { mode: "team"; managerId: string }
  | { mode: "branch"; branches: string[] };

// Roles that see and assign across the whole company.
const ORG_WIDE_ROLES = ["admin", "c-level"];

// The assignee can always drive their own progress on any task.
const ASSIGNEE_ALWAYS_EDITABLE = ["status", "notesByUser", "supportingLinksByUser"];

// Identity and provenance are fixed at creation. Nobody edits these, ever.
export const NEVER_EDITABLE = ["id", "createdBy", "origin", "assignedTo"];

export function scopeFor(actor: Actor): Scope {
  if (ORG_WIDE_ROLES.includes(actor.role)) return { mode: "all" };
  if (actor.role === "branch-manager") {
    return { mode: "branch", branches: actor.branches ?? [] };
  }
  if (actor.role === "sales-team-lead") {
    return { mode: "team", managerId: actor.id };
  }
  return { mode: "self", userId: actor.id };
}

function sharesBranch(actor: Actor, target: TargetUser): boolean {
  const mine = actor.branches ?? [];
  const theirs = target.branches ?? [];
  if (mine.length === 0 || theirs.length === 0) return false;
  return theirs.some((b) => mine.includes(b));
}

export function canAssignTo(actor: Actor, target: TargetUser): boolean {
  // Everyone can always create a task for themselves.
  if (String(actor.id) === String(target.id)) return true;

  const scope = scopeFor(actor);
  if (scope.mode === "all") return true;
  if (scope.mode === "team") return String(target.managerId) === String(actor.id);
  if (scope.mode === "branch") return sharesBranch(actor, target);
  return false;
}

export function canViewTask(actor: Actor, task: TaskLike, owner: TargetUser): boolean {
  // The assignee always sees their own task.
  if (String(task.assignedTo) === String(actor.id)) return true;

  // A private self-created task is visible to its assignee ONLY, including to
  // admins. This deliberately overrides the role matrix below.
  if (task.origin === "self" && task.visibility === "private") return false;

  const scope = scopeFor(actor);
  if (scope.mode === "all") return true;
  if (scope.mode === "team") return String(owner.managerId) === String(actor.id);
  if (scope.mode === "branch") return sharesBranch(actor, owner);
  return false;
}

export function canEditField(
  actor: Actor,
  task: TaskLike,
  field: string,
  owner: TargetUser
): boolean {
  if (NEVER_EDITABLE.includes(field)) return false;

  if (String(task.assignedTo) === String(actor.id)) {
    // Your own note: you own every field on it.
    if (task.origin === "self") return true;
    if (ASSIGNEE_ALWAYS_EDITABLE.includes(field)) return true;
    // Legacy tasks carry an explicit per-field allow list set by the old screen.
    return (task.editableFields ?? []).includes(field);
  }

  if (task.createdBy && String(task.createdBy) === String(actor.id)) return true;

  // Anyone who could have assigned this task to this person can also edit it,
  // so a lead can fix a task another lead gave to their own rep.
  return canAssignTo(actor, owner);
}

export type GroupedTasks = {
  overdue: TaskLike[];
  today: TaskLike[];
  upcoming: TaskLike[];
  done: TaskLike[];
};

function completedTime(task: TaskLike): number {
  if (!task.completedAt) return 0;
  const ms = new Date(task.completedAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

// `today` is a YYYY-MM-DD string. Deadlines are stored in that same format
// (they come from <input type="date">), so plain string comparison is correct
// and avoids every timezone trap that parsing to Date would introduce.
export function groupByUrgency(tasks: TaskLike[], today: string): GroupedTasks {
  const out: GroupedTasks = { overdue: [], today: [], upcoming: [], done: [] };

  for (const task of tasks) {
    if (task.status === "done") {
      out.done.push(task);
      continue;
    }
    const deadline = (task.deadline ?? "").slice(0, 10);
    if (!deadline) {
      out.upcoming.push(task);
    } else if (deadline < today) {
      out.overdue.push(task);
    } else if (deadline === today) {
      out.today.push(task);
    } else {
      out.upcoming.push(task);
    }
  }

  out.overdue.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  out.upcoming.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  out.done.sort((a, b) => completedTime(b) - completedTime(a));

  return out;
}

// Today as YYYY-MM-DD in the viewer's own timezone, matching how <input type="date">
// produces values. Kept here so the page and the API agree on what "today" means.
export function todayString(now: Date = new Date()): string {
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}
