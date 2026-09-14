// Maps a user's role to the "My Calendar" route inside THEIR OWN panel — same
// reasoning as src/lib/trainingRoute.ts: a calendar reminder's deep link must
// open the recipient's own panel, never another role's (which ProtectedRoute
// would immediately bounce them out of).
const CALENDAR_ROUTE: Record<string, string> = {
  sales: "/sales/calendar",
  marketing: "/marketing/calendar",
  "sales-team-lead": "/manager/calendar",
  "branch-manager": "/branch-manager/calendar",
  "c-level": "/c-level/calendar",
};

export function calendarRouteForRole(role?: string | null): string {
  return (role && CALENDAR_ROUTE[role]) || "/sales/calendar";
}
