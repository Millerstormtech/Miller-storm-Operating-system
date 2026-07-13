// Central role-key -> human-readable display name mapping.
//
// IMPORTANT: This only affects the LABEL shown to users. The underlying role
// KEYS (e.g. "manager") are unchanged everywhere — routes, role checks, DB
// values and stored data all keep using the original keys. Only the text a
// user reads is mapped here.
//
// The "manager" role is displayed as "Sales Team Lead". "branch-manager" is a
// separate role and keeps its own "Branch Manager" label.

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: "Admin",
  "sales-team-lead": "Sales Team Lead",
  sales: "Sales",
  marketing: "Marketing",
  "c-level": "C-Level",
  "branch-manager": "Branch Manager",
};

/**
 * Returns the user-facing display name for a role key. Falls back to a
 * capitalized version of the raw key for any unmapped role, preserving the
 * previous behavior for roles we don't explicitly map.
 */
export function roleDisplayName(role?: string | null): string {
  if (!role) return "";
  return ROLE_DISPLAY_NAMES[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}
