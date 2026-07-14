// Maps a user's role to the Training Center route inside THEIR OWN panel.
//
// Training notifications (e.g. an unlocked lesson) deep-link the recipient to
// their training page. Using a role-aware route means the bell/push always
// opens in the recipient's own panel — never another role's panel (which
// ProtectedRoute would immediately bounce them out of). Navigation is
// client-side within the recipient's existing session; it never switches
// accounts and the route carries no other user's id.
const TRAINING_ROUTE: Record<string, string> = {
  sales: "/sales/training",
  "sales-team-lead": "/manager/onlineTraining",
  "branch-manager": "/branch-manager/training",
  "c-level": "/c-level/training",
};

// The training route for a role, falling back to the sales training center for
// any role we don't map (e.g. marketing/admin, which don't have their own
// lesson-watching Training Center).
export function trainingRouteForRole(role?: string | null): string {
  return (role && TRAINING_ROUTE[role]) || "/sales/training";
}
