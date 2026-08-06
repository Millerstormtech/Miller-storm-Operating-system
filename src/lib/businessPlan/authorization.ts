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
// Rules applied, in order, and all of them matter:
//
//   0. requestedUserId must actually BE a string (or absent/null) before any
//      of this runs. req.body is `any`, so nothing at the type level stops a
//      client from sending { "userId": { "$ne": "x" } } -- a Mongo operator
//      object, not an id. See isValidRequestedUserId(); the handler must
//      call it and reject with 400 BEFORE any DB read/write, because both
//      UserModel.findOne({ id: requestedUserId }) and
//      UserModel.updateOne({ id: userId }, ...) turn a non-string value
//      straight into a raw Mongo filter.
//   1. WHO may target someone else at all. Only the roles the GET branch of
//      pages/api/business-plan.ts already calls "privileged" -- admin and
//      sales-team-lead -- may ask to write another user's record. This
//      module intentionally reuses that existing convention rather than
//      inventing a new one.
//   2. WHICH other users a privileged caller may reach.
//        - admin: any user, unscoped -- but only if that user actually
//          exists. src/portals/admin/BusinessUnits.tsx edits sales reps
//          across every sales-team-lead's roster with no per-manager
//          restriction, so scoping admin down would break a real,
//          currently-shipping screen. The existence check (targetExists)
//          still applies to admin, because the write path below uses
//          upsert: true -- without it, a typo'd or fabricated userId would
//          silently create a phantom user document containing nothing but
//          an id and a businessPlan.
//        - sales-team-lead: only users whose managerId is the team lead's
//          own id. src/portals/manager/TeamBusinessPlans.tsx (web) and both
//          Flutter screens above only ever operate on the caller's own
//          direct reports. Nothing in the product needs a team lead to
//          reach another team lead's reps, so the narrower rule is chosen
//          deliberately -- a scope check is strictly safer than role alone.
//          A nonexistent target also fails this check (no managerId to
//          match), which is the same phantom-user protection admin gets,
//          just arrived at via the scope check instead of a dedicated one.
//   3. Even once (1) and (2) allow the write, the three monthly goal fields
//      (monthlyRevenueTarget, monthlyKnockTarget, monthlyClaimsTarget) must
//      never be applied to a record that isn't the caller's own. "Each
//      person sets their own goals" is a product rule, not an access-control
//      rule, and today it only holds because the manager/admin screens
//      happen not to send those keys -- a payload shape is not a guarantee.
//      Once a privileged caller can reach another user's record at all,
//      buildAuthorizedPlanPayload() strips those keys unconditionally, so
//      the rule is enforced by the server, not by what any client (present
//      or future) chooses to send. The handler must call
//      buildAuthorizedPlanPayload() -- and ONLY pass its result to
//      buildBusinessPlanUpdate() -- rather than re-deriving the strip
//      decision inline, so this exact behavior has one call site to test
//      and one call site to break.
//
// A rejected request for reason "forbidden" always returns the same shape
// whether the target user exists or not, for a NON-privileged caller (rule
// 1) -- that caller can never use this endpoint to learn which user ids
// exist. A privileged caller naming a nonexistent id instead gets reason
// "not-found" (mapped to the same 404 the GET branch already returns for a
// privileged caller's nonexistent single-user lookup) -- that is not a new
// leak, since GET already reveals existence to privileged roles, and a team
// lead/admin already sees the org chart through other endpoints.
import { MONTHLY_GOAL_KEYS, type BusinessPlanPayload } from "./update";

const PRIVILEGED_ROLES = new Set(["admin", "sales-team-lead"]);

/**
 * Runtime guard for the `userId` field straight off req.body, which Next.js
 * types as `any`. TypeScript's `string | null | undefined` parameter type on
 * resolveBusinessPlanWrite is a compile-time-only promise -- it does not
 * stop a runtime value like `{ "$ne": "x" }` (a Mongo operator object) from
 * reaching this function, and from there a raw `UserModel.findOne({ id })`
 * / `updateOne({ id }, ...)` filter. The handler MUST call this and return
 * 400 on a false result before touching the database at all.
 */
export function isValidRequestedUserId(
  value: unknown
): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}

export interface BusinessPlanWriteRequest {
  /** auth.sub -- the trusted, session-derived id of the caller. */
  authUserId: string;
  /** auth.role -- the trusted, session-derived role of the caller. */
  authRole: string;
  /**
   * The `userId` field from the request body. Must already have passed
   * isValidRequestedUserId() -- this function does not re-validate it.
   */
  requestedUserId: string | null | undefined;
  /**
   * Whether requestedUserId names a user that actually exists, per a DB
   * lookup the handler performs BEFORE calling this function. Only
   * meaningful (and only ever consulted) when requestedUserId names someone
   * other than the caller and authRole is privileged -- leave undefined
   * when no lookup was needed (self-write, or a non-privileged caller,
   * where rule 1 rejects before existence would matter).
   */
  targetExists?: boolean;
  /**
   * The managerId currently stored on the requested target user's record.
   * Only consulted when authRole is "sales-team-lead" and the target isn't
   * the caller. A falsy value (missing manager, or target simply wasn't
   * looked up) never grants access -- it only ever narrows, never widens.
   */
  targetManagerId?: string | null;
}

export type BusinessPlanWriteAuthorization =
  | { allowed: true; targetUserId: string; stripGoals: boolean }
  | { allowed: false; reason: "forbidden" | "not-found" };

export function resolveBusinessPlanWrite(
  req: BusinessPlanWriteRequest
): BusinessPlanWriteAuthorization {
  const { authUserId, authRole, requestedUserId, targetExists, targetManagerId } = req;

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
    // Always "forbidden", never "not-found": this caller never triggers a
    // target lookup at all, so there is nothing to distinguish and nothing
    // to leak.
    return { allowed: false, reason: "forbidden" };
  }

  // A privileged caller reaching for someone who was looked up and found
  // not to exist. Applies to both admin (otherwise unscoped, so this is its
  // ONLY defense against the upsert-based phantom-user write) and
  // sales-team-lead (belt-and-suspenders alongside the managerId check
  // below).
  if (targetExists === false) {
    return { allowed: false, reason: "not-found" };
  }

  if (authRole === "admin") {
    return { allowed: true, targetUserId: requestedUserId, stripGoals: true };
  }

  // authRole === "sales-team-lead" (the only other privileged role): scope
  // to the caller's own direct reports only.
  if (targetManagerId && targetManagerId === authUserId) {
    return { allowed: true, targetUserId: requestedUserId, stripGoals: true };
  }
  return { allowed: false, reason: "forbidden" };
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

/**
 * The single join point between "was this write authorized" and "what
 * payload does it actually apply". This exists because inlining
 * `decision.stripGoals ? stripMonthlyGoalFields(businessPlan) : businessPlan`
 * directly in the API handler left the product owner's hard rule ("each
 * person sets their own goals") protected by one line in an untested file --
 * deleting or editing that ternary would silently stop stripping goals on a
 * cross-user write, and nothing would fail. Routing the handler through this
 * function instead means the strip behavior has exactly one tested call
 * site, and the handler has exactly one thing to call.
 */
export function buildAuthorizedPlanPayload(
  decision: Extract<BusinessPlanWriteAuthorization, { allowed: true }>,
  businessPlan: BusinessPlanPayload | null | undefined
): BusinessPlanPayload | null | undefined {
  return decision.stripGoals ? stripMonthlyGoalFields(businessPlan) : businessPlan;
}
