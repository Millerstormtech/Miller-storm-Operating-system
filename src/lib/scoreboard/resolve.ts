import type { Scope } from "./types";
import { resolveTeam, resolveNameBranch, TEAM_BRANCH } from "../repcard/org-chart";

export function resolveScope(user: { id: string; role: string; name: string }): Scope {
  switch (user.role) {
    case "sales":
      return { level: "self", userId: user.id };
    case "sales-team-lead":
      return { level: "team", team: resolveTeam(user.name) || null };
    case "branch-manager": {
      const team = resolveTeam(user.name);
      const branch = (team && TEAM_BRANCH[team]) || resolveNameBranch(user.name) || null;
      return { level: "branch", branch };
    }
    case "c-level":
      return { level: "company" };
    default:
      // Fail CLOSED: an unrecognized role (typo, stale value, future role) must never be
      // handed company-wide revenue. Least privilege = their own numbers only.
      return { level: "self", userId: user.id };
  }
}
