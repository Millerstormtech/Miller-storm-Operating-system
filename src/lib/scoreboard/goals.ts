import type { Window } from "../acculynx/windows";

// The legacy funnel fields. The new My Goals screen no longer asks for these,
// but three Flutter screens and four admin/manager screens still read them, so
// every save keeps them alive. See the plan's Global Constraints.
export interface LegacyPlanFields {
  revenueGoal?: number;
  averageDealSize?: number;
  dealsPerYear?: number;
  dealsPerMonth?: number;
  inspectionsNeeded?: number;
  doorsPerYear?: number;
  doorsPerDay?: number;
  daysPerWeek?: number;
}

// How many days the month containing `periodStart` has. `periodStart` is a
// Central-midnight instant expressed as UTC, so the UTC calendar parts are the
// Central ones; day 0 of the next month is the last day of this one.
function daysInMonthOf(periodStart: Date): number {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0)).getUTCDate();
}

// Monthly is the stored unit; every other period is a display-only scaling of it.
// An unset target must stay unset: null in, null out, so a missing goal can never
// silently become a number the person never chose.
export function scaleTargetToWindow(
  monthly: number | null | undefined,
  window: Window,
  periodStart: Date
): number | null {
  if (monthly == null) return null;
  const days = daysInMonthOf(periodStart);
  switch (window) {
    case "month": return monthly;
    case "year": return monthly * 12;
    case "week": return Math.round((monthly * 7) / days);
    case "day": return Math.round(monthly / days);
  }
}

// Keep the legacy fields consistent with the new monthly revenue target so the
// mobile planner and the admin roll-ups keep showing sensible numbers. Only the
// revenue-derived fields are recomputed; everything else is passed through.
export function legacyFieldsFrom(
  monthlyRevenue: number | null | undefined,
  existing: LegacyPlanFields
): LegacyPlanFields {
  if (monthlyRevenue == null) return { ...existing };
  const revenueGoal = monthlyRevenue * 12;
  const dealSize = existing.averageDealSize ?? 0;
  const dealsPerYear = dealSize > 0 ? Math.round(revenueGoal / dealSize) : 0;
  return {
    ...existing,
    revenueGoal,
    dealsPerYear,
    dealsPerMonth: Math.round(dealsPerYear / 12),
  };
}

// Seeding rule for reps who already have an annual goal but no monthly target.
export function monthlyFromLegacy(revenueGoal: number | null | undefined): number | null {
  if (!revenueGoal || revenueGoal <= 0) return null;
  return Math.round(revenueGoal / 12);
}
