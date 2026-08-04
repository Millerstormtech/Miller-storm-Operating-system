// Turns a submitted business-plan payload into Mongo update operators, instead
// of the whole-object $set the endpoint used to do. That whole-object replace
// is what let one screen silently erase another screen's fields: whatever the
// caller omitted from the payload became "not set" in the database.
//
// The contract this module enforces:
//   - A key ABSENT from the payload -> leave the stored value untouched.
//   - A key present with a normal value -> set it.
//   - A key present with an explicit null -> unset it (remove the field).
//
// The 0/false zero-value rule: 0 is a real, deliberate target (a rep can mean
// "zero"), so it is always $set, never confused with "absent" or "null".
//
// Only these fourteen fields are ever read off the incoming payload. Every
// other key on the payload -- __proto__, $where, "businessPlan.revenueGoal",
// role, userId, whatever an attacker sends -- is silently ignored, because we
// iterate this fixed whitelist rather than the caller's own keys. That is the
// entire defense against writing outside the businessPlan subdocument: there
// is no code path that ever copies an arbitrary key into the update.
const ALLOWED_BUSINESS_PLAN_KEYS = [
  // Legacy funnel fields. Three shipped Flutter screens and two other web
  // screens (TeamBusinessPlans, BusinessUnits) still read these; see
  // src/lib/scoreboard/goals.ts for how the monthly target keeps them in sync.
  "revenueGoal",
  "averageDealSize",
  "dealsPerYear",
  "dealsPerMonth",
  "inspectionsNeeded",
  "doorsPerYear",
  "doorsPerDay",
  "daysPerWeek",
  "territories",
  "selectedPresetId",
  "committed",
  // Phase 2 direct-entry monthly targets (My Goals). Source of truth for the
  // Scoreboard. A manager/admin screen that never sends these three keys is
  // therefore structurally unable to change a rep's own goals.
  "monthlyRevenueTarget",
  "monthlyKnockTarget",
  "monthlyClaimsTarget"
] as const;

export type BusinessPlanKey = (typeof ALLOWED_BUSINESS_PLAN_KEYS)[number];

export type BusinessPlanPayload = Partial<Record<BusinessPlanKey, unknown>>;

export interface BusinessPlanUpdateOperators {
  $set?: Record<string, unknown>;
  $unset?: Record<string, "">;
}

// `prefix` lets the same rules drive both Mongo writes the endpoint makes:
// "businessPlan." for the dotted subdocument on the User document, and ""
// (no prefix) for the flat legacy BusinessPlanModel collection, so the two
// collections can never drift apart in how they treat absent/null/zero.
export function buildBusinessPlanUpdate(
  plan: BusinessPlanPayload | null | undefined,
  prefix = "businessPlan."
): BusinessPlanUpdateOperators {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};

  if (plan && typeof plan === "object") {
    for (const key of ALLOWED_BUSINESS_PLAN_KEYS) {
      if (!(key in plan)) continue; // absent: leave untouched

      const value = plan[key];
      if (value === undefined) continue; // explicit undefined behaves like absent

      if (value === null) {
        $unset[`${prefix}${key}`] = "";
      } else {
        // 0, false, and [] all land here: real values, always $set.
        $set[`${prefix}${key}`] = value;
      }
    }
  }

  const result: BusinessPlanUpdateOperators = {};
  if (Object.keys($set).length > 0) result.$set = $set;
  if (Object.keys($unset).length > 0) result.$unset = $unset;
  return result;
}
