// The Miller Storm role ladder. Every account has exactly ONE role (`role`);
// there is no list of extra roles (decided by Youssef 2026-10-03). The sales
// roles nest, so one role says everything:
//
//   branch-manager   is also a team lead, and so also a rep
//   sales-team-lead  is also a rep
//   sales            a rep
//   admin, marketing, c-level   only themselves
//
// Pure, import-free. Ask these helpers instead of comparing role strings, so a
// branch manager is never left out of something meant for team leads or reps.
// One deliberate exception lives elsewhere: training nudges and Storm Bot
// course celebrations cover reps and team leads but NOT branch managers
// (RANKED_ROLES in training/scoring.ts). The Course Leaderboard itself shows all
// three, leaders on videos only (BOARD_ROLES, scoresVideosOnly).

/** Everyone who sells: reps, team leads and branch managers. */
export const REP_ROLES = ["sales", "sales-team-lead", "branch-manager"] as const;
/** Everyone who leads a team: team leads and branch managers. */
export const TEAM_LEAD_ROLES = ["sales-team-lead", "branch-manager"] as const;

const has = (list: readonly string[], role?: string | null) => !!role && list.includes(role);

/** Sells (knocks doors): a rep, a team lead or a branch manager. */
export function isRep(role?: string | null): boolean {
  return has(REP_ROLES, role);
}

/** Leads a team: a team lead or a branch manager. */
export function isTeamLead(role?: string | null): boolean {
  return has(TEAM_LEAD_ROLES, role);
}

export function isBranchManager(role?: string | null): boolean {
  return role === "branch-manager";
}

export function isAdmin(role?: string | null): boolean {
  return role === "admin";
}
