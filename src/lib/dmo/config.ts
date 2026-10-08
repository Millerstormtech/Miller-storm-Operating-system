// src/lib/dmo/config.ts
// Every number the DMO rules use, in one place. Sources: the Sales Rep DMO PDF
// (docs/jay-requirements/02.10.2026/), Jay on the 2026-10-02 tech meeting, and
// Youssef's decisions in docs/superpowers/specs/2026-10-02-dmo-operating-system-design.md.
// The week itself (Saturday to Friday) is WEEK_START_DAY in src/lib/acculynx/windows.ts.

/** Jay's weekly minimum: 100 verified doors OR 1 claim filed... */
export const MIN_WEEKLY_DOORS = 100;
export const MIN_WEEKLY_CLAIMS = 1;
/** ...OR a $40K monthly contract average, measured over the last 90 days (Youssef). */
export const MIN_MONTHLY_CONTRACT_AVERAGE = 40_000;
export const CONTRACT_AVERAGE_DAYS = 90;

/** The minimum applies after a rep's first 90 days, counted from their first verified knock. */
export const RAMP_DAYS = 90;

/** Half of claims become roofs (Jay: "we've always been around 48 to 52%"). Claims onward only, never doors to claims. */
export const CLAIM_TO_CONTRACT = 0.5;
/** Jay's example: "your average claim, if it's a solo deal, is about $5,000". Reps can change it. */
export const DEFAULT_COMMISSION_PER_ROOF = 5_000;

/** A bar is yellow from 70% of pace up to pace, red below. */
export const YELLOW_SHARE_OF_PACE = 0.7;
/** Team and branch: green when every member is green, yellow from 75%, red below. */
export const TEAM_GREEN_SHARE = 1;
export const TEAM_YELLOW_SHARE = 0.75;

/** Weekly DMO: opens Thursday 00:00, due Friday 1:00 PM; Team Leads may adjust until Friday 5:00 PM (Central). */
export const WEEKLY_OPENS = { daysIntoWeek: 5, hour: 0 }; // Thursday
export const WEEKLY_DUE = { daysIntoWeek: 6, hour: 13 }; // Friday 1:00 PM
export const WEEKLY_LOCK = { daysIntoWeek: 6, hour: 17 }; // Friday 5:00 PM

/** The roles that fill in DMOs (leaders fill in their own, for their own selling). */
export const DMO_ROLES = ["sales", "sales-team-lead", "branch-manager"] as const;

/** What a rep commits to each week, and what the app measures each against. */
export const WEEKLY_FIELDS = ["doors", "claims", "contracts", "contractDollars"] as const;
export type WeeklyField = (typeof WEEKLY_FIELDS)[number];

/** What a rep commits to each month (besides the income goal, which has no bar: we can't see commissions). */
export const MONTHLY_FIELDS = ["doors", "claims", "contractDollars"] as const;
export type MonthlyField = (typeof MONTHLY_FIELDS)[number];

export const FIELD_LABELS: Record<WeeklyField, string> = {
  doors: "Doors",
  claims: "Claims",
  contracts: "Contracts",
  contractDollars: "Contract $",
};

/**
 * Launch (Youssef, 2026-10-08): the first weekly DMO is due Friday 2026-10-09 at
 * 1:00 PM and commits to the week starting Saturday 2026-10-10. The first
 * monthly DMO is November's. Forms before these are never "late", never
 * reminded and never reported missing; they show as not open yet.
 */
export const FIRST_WEEKLY_WEEK_OF = "2026-10-10";
export const FIRST_MONTH = "2026-11";

/**
 * Reminders (Youssef, 2026-10-05): two to the person, then their Team Lead and
 * Branch Manager are told who has not sent it. Central time. A reminder only
 * goes out within REMINDER_WINDOW_HOURS of its time, so a server that was down
 * never sends a stale one hours later.
 */
export const WEEKLY_REMINDERS = [
  { id: "weekly-open", daysIntoWeek: 5, hour: 18 }, // Thursday 6:00 PM
  { id: "weekly-last", daysIntoWeek: 6, hour: 9 }, // Friday 9:00 AM
] as const;
export const WEEKLY_MISSING = { id: "weekly-missing", daysIntoWeek: 6, hour: 13 } as const; // Friday 1:00 PM
/** Days are counted from the 1st of the month the form is for (-1 = the last day of the month before). */
export const MONTHLY_REMINDERS = [
  { id: "monthly-open", dayOffset: -1, hour: 18 }, // last day of the month, 6:00 PM
  { id: "monthly-last", dayOffset: 0, hour: 9 }, // the 1st, 9:00 AM
] as const;
export const MONTHLY_MISSING = { id: "monthly-missing", dayOffset: 1, hour: 9 } as const; // the 2nd, 9:00 AM
export const REMINDER_WINDOW_HOURS = 3;
