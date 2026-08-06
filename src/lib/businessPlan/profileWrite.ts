// Guards the `businessPlan` field on pages/api/users/[id].ts's PUT branch --
// the User Management "edit a profile" endpoint, NOT pages/api/business-plan.ts.
//
// The two endpoints write businessPlan completely differently:
//   - pages/api/business-plan.ts uses buildBusinessPlanUpdate() (see ./update.ts),
//     which touches only the individual dotted keys a caller actually sent.
//   - pages/api/users/[id].ts does a WHOLE-OBJECT `$set: { businessPlan: value }`,
//     because it is a generic profile-fields endpoint (name, email, role,
//     territory, managerId, feature toggles, ...) that happens to also carry
//     businessPlan as one more field on the payload it echoes straight through.
//
// That whole-object semantics is exactly what makes "just delete the three
// goal keys from the payload" the wrong fix here: if an admin's payload
// carries { businessPlan: { revenueGoal: 1 } } (goal keys stripped out) and
// the handler does `$set: { businessPlan: { revenueGoal: 1 } }`, Mongo
// replaces the ENTIRE stored businessPlan subdocument with that smaller
// object -- any goal fields that used to be there are gone, not merely left
// unwritten. Stripping without merging turns "an admin can overwrite goals"
// into "an admin silently erases goals", which is worse.
//
// This function is the merge point: on a cross-user write, it takes whatever
// the caller sent for the non-goal fields, but always overlays the three
// MONTHLY_GOAL_KEYS from the TARGET USER'S OWN currently-stored plan --
// never from the caller's payload. If the target never had a goal field set,
// the key stays absent; a cross-user write can never manufacture one either.
import { MONTHLY_GOAL_KEYS, type BusinessPlanPayload } from "./update";

export interface ProfileBusinessPlanWriteInput {
  /** True when the caller (auth.sub) is writing their own profile record. */
  isSelf: boolean;
  /**
   * The `businessPlan` key straight off the PUT payload -- `undefined` if the
   * caller didn't send one at all (the common case: most profile edits never
   * touch businessPlan).
   */
  incomingBusinessPlan: unknown;
  /**
   * The target user's CURRENTLY STORED businessPlan, read from the DB before
   * this write -- not anything derived from the incoming payload.
   */
  existingBusinessPlan: unknown;
}

/**
 * Returns the value the handler should assign to `businessPlan` in its
 * `$set`, or `undefined` to mean "omit the key from $set entirely, leave the
 * stored value exactly as it is".
 *
 * Self-write: passed through unrestricted. "Each person sets their own
 * goals" is the rule being protected, and a self-write is the person setting
 * their own -- there is nothing to protect against here, matching how
 * resolveBusinessPlanWrite (./authorization.ts) treats a self-write on the
 * dedicated business-plan endpoint (stripGoals: false).
 *
 * Cross-user write (an admin, the only role that reaches this branch for
 * someone else -- see requireUser/isAdmin in pages/api/users/[id].ts):
 * the incoming object's non-goal fields pass through as the admin intended,
 * but the three MONTHLY_GOAL_KEYS are always overlaid from
 * existingBusinessPlan, discarding whatever the payload carried under those
 * keys (whether that's a stale echo, an untouched value, or a tampered one --
 * this function does not need to know which; the goal fields simply never
 * come from the incoming payload on a cross-user write, full stop).
 */
export function resolveBusinessPlanForProfileWrite(
  input: ProfileBusinessPlanWriteInput
): unknown {
  const { isSelf, incomingBusinessPlan, existingBusinessPlan } = input;

  // Key absent from the payload entirely: nothing to do, and nothing to
  // merge -- the handler must not add `businessPlan` to $set at all.
  if (incomingBusinessPlan === undefined) return undefined;

  if (isSelf) return incomingBusinessPlan;

  const existing: BusinessPlanPayload =
    existingBusinessPlan && typeof existingBusinessPlan === "object" && !Array.isArray(existingBusinessPlan)
      ? (existingBusinessPlan as BusinessPlanPayload)
      : {};

  const incomingIsPlainObject =
    incomingBusinessPlan !== null &&
    typeof incomingBusinessPlan === "object" &&
    !Array.isArray(incomingBusinessPlan);

  // Own-property check, not `key in plan`: `in` walks the prototype chain,
  // and this function is a security boundary for the three goal fields, so
  // it must only ever look at each object's own data.
  const merged: BusinessPlanPayload = incomingIsPlainObject
    ? { ...(incomingBusinessPlan as BusinessPlanPayload) }
    : {};

  for (const key of MONTHLY_GOAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(existing, key)) {
      merged[key] = existing[key];
    } else if (Object.prototype.hasOwnProperty.call(merged, key)) {
      delete merged[key];
    }
  }

  return merged;
}
