import type { Scope } from "./types";
import { branchFromProfile } from "../repcard/org-chart";

// What a person's dashboard rolls up, from their own profile in User Management
// (no typed org-chart list, decided 2026-10-02). A team lead's team is named
// after them, the same name every board uses for it (org-chart.ts); a branch
// manager's branch is the Branch on their profile.
export function resolveScope(user: { id: string; role: string; name: string; territory?: string | null }): Scope {
  switch (user.role) {
    case "sales":
      return { level: "self", userId: user.id };
    case "sales-team-lead":
      return { level: "team", team: (user.name || "").trim() || null };
    case "branch-manager":
      return { level: "branch", branch: branchFromProfile(user) || null };
    case "c-level":
      return { level: "company" };
    default:
      // Fail CLOSED: an unrecognized role (typo, stale value, future role) must never be
      // handed company-wide revenue. Least privilege = their own numbers only.
      return { level: "self", userId: user.id };
  }
}
