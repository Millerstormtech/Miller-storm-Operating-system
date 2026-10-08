// Maps a user's role to the DMO page inside THEIR OWN panel, like
// calendarRoute.ts: a DMO reminder's deep link must open the recipient's own
// panel, never another role's (which ProtectedRoute would bounce them out of).
const DMO_ROUTE: Record<string, string> = {
  sales: "/sales/dmo",
  "sales-team-lead": "/manager/dmo",
  "branch-manager": "/branch-manager/dmo",
  "c-level": "/c-level/dmo",
};

export function dmoRouteForRole(role?: string | null): string | null {
  return (role && DMO_ROUTE[role]) || null;
}
