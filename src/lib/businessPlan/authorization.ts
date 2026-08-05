// Decides who may write a business plan for a given target user, and
// whether the three monthly goal fields must be stripped from the payload
// first. This is the authorization boundary for POST /api/business-plan.
//
// The bug this closes: two shipped Flutter screens
// (sales_team_lead_planner_screen.dart, sales_team_lead_team_member_detail_
// screen.dart) POST { userId: memberId, businessPlan } intending to save a
// REP's plan, but the endpoint used to always trust the session id and
// silently overwrite the CALLER's own record instead -- the rep's plan was
// never touched, and nothing surfaced an error. The fix has to live on the
// server: the mobile app is already sending the right thing, and fixing the
// server is exactly what lets this ship without an App Store release.
//
// Three rules apply, in order, and all three matter:
//
//   1. WHO may target someone else at all. Only the roles the GET branch of
//      pages/api/business-plan.ts already calls "privileged" -- admin and
//      sales-team-lead -- may ask to write another user's record. This
//      module intentionally reuses that existing convention rather than
//      inventing a new one.
//   2. WHICH other users a privileged caller may reach.
//        - admin: any user, unscoped. src/portals/admin/BusinessUnits.tsx
//          edits sales reps across every sales-team-lead's roster with no
//          per-manager restriction, so scoping admin down would break a
//          real, currently-shipping screen.
//        - sales-team-lead: only users whose managerId is the team lead's
//          own id. src/portals/manager/TeamBusinessPlans.tsx (web) and both
//          Flutter screens above only ever operate on the caller's own
//          direct reports. Nothing in the product needs a team lead to
//          reach another team lead's reps, so the narrower rule is chosen
//          deliberately -- a scope check is strictly safer than role alone.
//   3. Even once (1) and (2) allow the write, the three monthly goal fields
//      (monthlyRevenueTarget, monthlyKnockTarget, monthlyClaimsTarget) must
//      never be applied to a record that isn't the caller's own. "Each
//      person sets their own goals" is a product rule, not an access-control
//      rule, and today it only holds because the manager/admin screens
//      happen not to send those keys -- a payload shape is not a guarantee.
//      Once a privileged caller can reach another user's record at all, this
//      module strips those keys unconditionally so the rule is enforced by
//      the server, not by what any client (present or future) chooses to
//      send.
//
// A rejected request (rule 1 or rule 2 fails) always returns the same
// `allowed: false`, whether the target user doesn't exist or simply isn't
// the caller's to write. The caller cannot tell those two cases apart from
// the response, so this can never be used to probe which user ids exist.
import { MONTHLY_GOAL_KEYS, type BusinessPlanPayload } from "./update";

const PRIVILEGED_ROLES = new Set(["admin", "sales-team-lead"]);

export interface BusinessPlanWriteRequest {
  /** auth.sub -- the trusted, session-derived id of the caller. */
  authUserId: string;
  /** auth.role -- the trusted, session-derived role of the caller. */
  authRole: string;
  /** The `userId` field from the request body, exactly as the client sent it. */
  requestedUserId: string | null | undefined;
  /**
   * The managerId currently stored on the requested target user's record.
   * Only consulted when authRole is "sales-team-lead" and the target isn't
   * the caller. Pass undefined/null for "target has no manager on file, or
   * the target doesn't exist at all" -- either way that is a rejection, never
   * treated as "no restriction applies".
   */
  targetManagerId?: string | null;
}

export type BusinessPlanWriteAuthorization =
  | { allowed: true; targetUserId: string; stripGoals: boolean }
  | { allowed: false };

export function resolveBusinessPlanWrite(
  req: BusinessPlanWriteRequest
): BusinessPlanWriteAuthorization {
  const { authUserId, authRole, requestedUserId, targetManagerId } = req;

  // No target named, or the caller naming themselves: the ordinary "I'm
  // saving my own plan" path every role uses, including a privileged user's
  // own My Goals save. Never restricted, never stripped.
  if (!requestedUserId || requestedUserId === authUserId) {
    return { allowed: true, targetUserId: authUserId, stripGoals: false };
  }

  // From here on requestedUserId names someone other than the caller.
  if (!PRIVILEGED_ROLES.has(authRole)) {
    // A non-privileged caller (a rep, or any future role never granted this)
    // asking to write someone else's record. Reject outright instead of
    // silently redirecting the write to the caller's own record -- that
    // silent redirect is the original bug, just relocated to a new trigger.
    return { allowed: false };
  }

  if (authRole === "admin") {
    return { allowed: true, targetUserId: requestedUserId, stripGoals: true };
  }

  // authRole === "sales-team-lead" (the only other privileged role): scope
  // to the caller's own direct reports only.
  if (targetManagerId && targetManagerId === authUserId) {
    return { allowed: true, targetUserId: requestedUserId, stripGoals: true };
  }
  return { allowed: false };
}

// Removes the three monthly goal keys from a business-plan payload, own-
// properties only. Deleting the key (rather than setting it to null) makes
// it ABSENT as far as buildBusinessPlanUpdate is concerned, so the target
// user's existing goal values are left untouched -- not cleared, not
// overwritten. This also closes the "send null to unset someone else's
// goal" variant of the same loophole, since delete removes the key
// regardless of what value the client attached to it.
export function stripMonthlyGoalFields<T extends BusinessPlanPayload | null | undefined>(
  plan: T
): T {
  if (!plan || typeof plan !== "object") return plan;
  const stripped: BusinessPlanPayload = { ...plan };
  for (const key of MONTHLY_GOAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(stripped, key)) {
      delete stripped[key];
    }
  }
  return stripped as T;
}
