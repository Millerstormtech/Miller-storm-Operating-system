export interface SalesRow {
  repUserId: string | null; // the Miller Storm user id, when the rep is matched to an app account
  name: string;
  team: string | null;      // resolved org-chart team, e.g. "Gunner"; null/"" if none
  branch: string;           // resolved branch, e.g. "Fort Worth"; "" if none
  revenue: number;
  knocks: number;           // verifiedKnocks
  claims: number;           // filed
  contracts: number;        // won
  former: boolean;          // deactivated in RepCard; kept in totals, excluded from ranking. Same field name and semantics the API already returns (see leaderboard/compute.ts)
}

export interface Totals {
  revenue: number;
  knocks: number;
  claims: number;
  contracts: number;
}

export type ScopeLevel = "self" | "team" | "branch" | "company";

export interface Scope {
  level: ScopeLevel;
  userId?: string | null;   // for "self"
  team?: string | null;     // for "team"
  branch?: string | null;   // for "branch"
}
