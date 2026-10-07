// src/lib/teamhistory/placement.ts
// Pure. Where one RepCard rep sits RIGHT NOW: the single rule the Sales
// Leaderboard rows and the hourly team-history step both use, so the history
// records exactly what the boards show. Moved out of computeSalesRows.
//   - a live app account decides (User Management, org-chart.ts);
//   - else a deleted account that still places them (former reps keep their team);
//   - else, no app account at all: RepCard team matched to its app team, else
//     the RepCard office for the branch.
import type { OrgChart, DirectoryUser } from "../repcard/org-chart";

export function placeRep(input: {
  org: OrgChart;
  live?: DirectoryUser | null;
  former?: DirectoryUser | null;
  repcardTeam?: string | null;
  repcardOffice?: string | null;
  appTeamForRepCardTeam: (repcardTeam: string | null | undefined) => string;
  officeToBranch: (office: string | null | undefined) => string;
}): { team: string; branch: string; placedBy: DirectoryUser | null } {
  const { org, live, former } = input;
  const placedBy = live || (former && org.teamOf(former) ? former : null);
  if (placedBy) return { team: org.teamOf(placedBy), branch: org.branchOf(placedBy), placedBy };
  const team = input.appTeamForRepCardTeam(input.repcardTeam);
  return { team, branch: org.branchOfTeam(team) || input.officeToBranch(input.repcardOffice), placedBy: null };
}
