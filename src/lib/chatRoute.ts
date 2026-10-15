// Maps a user's role to the Storm Chat page inside THEIR OWN panel, like
// dmoRoute.ts: a chat alert's deep link (bell click) must open the recipient's
// own panel, never another role's (which ProtectedRoute would bounce them out
// of). The page opens the chat named by ?group=<id>.
const CHAT_ROUTE: Record<string, string> = {
  admin: "/admin/storm-chat",
  "c-level": "/c-level/storm-chat",
  "branch-manager": "/branch-manager/storm-chat",
  "sales-team-lead": "/manager/storm-chat",
  sales: "/sales/storm-chat",
  marketing: "/marketing/storm-chat",
};

export function chatRouteForRole(role?: string | null): string | null {
  return (role && CHAT_ROUTE[role]) || null;
}

/** Bell alerts that belong to a Storm Chat conversation. */
export function isChatNotification(type?: string | null): boolean {
  return !!type && (type.startsWith("stormchat_") || type.startsWith("group_join"));
}
