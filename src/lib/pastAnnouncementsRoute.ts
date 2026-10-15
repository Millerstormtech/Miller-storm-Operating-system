// Maps a user's role to the Past Announcements page inside THEIR OWN panel —
// same reasoning as src/lib/calendarRoute.ts: the bell's button must open the
// viewer's own panel, never another role's (which ProtectedRoute would
// immediately bounce them out of).
const PAST_ANNOUNCEMENTS_ROUTE: Record<string, string> = {
  admin: "/admin/past-announcements",
  "c-level": "/c-level/past-announcements",
  "branch-manager": "/branch-manager/past-announcements",
  "sales-team-lead": "/manager/past-announcements",
  sales: "/sales/past-announcements",
  marketing: "/marketing/past-announcements",
};

export function pastAnnouncementsRouteForRole(role?: string | null): string {
  return (role && PAST_ANNOUNCEMENTS_ROUTE[role]) || "/sales/past-announcements";
}
