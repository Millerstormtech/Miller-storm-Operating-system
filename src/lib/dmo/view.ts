// src/lib/dmo/view.ts
// One person's DMO, and the roll-up of many into a team, branch or company.
// Pure: the loader (load.ts) fetches the numbers and forms, this decides what
// they mean. The same output feeds the rep's own screen and their leaders'.
import { MONTHLY_FIELDS, WEEKLY_FIELDS, type WeeklyField } from "./config";
import { monthlyDeadlines, nextMonth, weeklyDeadlines, type DmoClock } from "./calendar";
import {
  bars, formState, groupColour, incomePlan, minimumChip, monthlyContractAverage, originalCommitment,
  sumCommitments, weekPeriod, type Adjustment, type Away, type Bar, type Colour, type Commitment,
  type FormState, type IncomePlan, type MinimumChip,
} from "./rules";

export type Actuals = Record<WeeklyField, number>;

export const ZERO: Actuals = { doors: 0, claims: 0, contracts: 0, contractDollars: 0 };

export interface WeeklyDoc extends Commitment {
  weekOf: string;
  away?: Away | null;
  submittedAt: Date;
  late?: boolean;
  adjustments?: Adjustment[];
}

export interface MonthlyDoc {
  month: string;
  incomeGoal: number;
  commissionPerRoof: number;
  doors: number;
  claims: number;
  contractDollars: number;
  submittedAt: Date;
  late?: boolean;
}

export interface PersonInput {
  userId: string;
  name: string;
  role: string;
  team: string;
  branch: string;
  firstKnockDay: string | null;
  week: Actuals;
  month: Actuals;
  contractDollarsLast90Days: number;
  /** The commitment for this week (filled in last Friday). */
  thisWeek: WeeklyDoc | null;
  /** The commitment for next week (this week's weekly DMO). */
  nextWeek: WeeklyDoc | null;
  /** This month's monthly DMO. */
  thisMonth: MonthlyDoc | null;
  /** The monthly DMO being collected (this month's, or next month's from its last day). */
  formMonth: MonthlyDoc | null;
}

export interface CommitmentView {
  weekOf: string;
  commitment: Commitment;
  original: Commitment;
  adjustments: Adjustment[];
  away: Away | null;
  submittedAt: string;
  late: boolean;
}

export interface PersonDmo {
  userId: string;
  name: string;
  role: string;
  team: string;
  branch: string;
  chip: MinimumChip;
  minimum: { doors: number; claims: number; monthlyContractAverage: number };
  thisWeek: { weekOf: string; commitment: CommitmentView | null; actual: Actuals; bars: Bar[] };
  thisMonth: { month: string; plan: MonthlyDoc | null; income: IncomePlan | null; actual: Actuals; bars: Bar[] };
  weeklyForm: { forWeekOf: string; state: FormState; due: string; lock: string; canAdjust: boolean; commitment: CommitmentView | null; floorExempt: boolean };
  monthlyForm: { month: string; state: FormState; due: string; plan: MonthlyDoc | null };
}

function commitmentOf(doc: WeeklyDoc): Commitment {
  const c = {} as Commitment;
  for (const f of WEEKLY_FIELDS) c[f] = Number(doc[f]) || 0;
  return c;
}

function commitmentView(doc: WeeklyDoc | null): CommitmentView | null {
  if (!doc) return null;
  const commitment = commitmentOf(doc);
  const adjustments = doc.adjustments || [];
  return {
    weekOf: doc.weekOf,
    commitment,
    original: originalCommitment(commitment, adjustments),
    adjustments,
    away: doc.away || null,
    submittedAt: new Date(doc.submittedAt).toISOString(),
    late: !!doc.late,
  };
}

/** The month the monthly form is collecting: this month, or next month from its opening (the last day). */
export function formMonthFor(clock: DmoClock, now: Date): string {
  const upcoming = nextMonth(clock.month);
  return now.getTime() >= monthlyDeadlines(upcoming).opens.getTime() ? upcoming : clock.month;
}

export function personDmo(p: PersonInput, clock: DmoClock, now: Date): PersonDmo {
  const period = weekPeriod(clock.weekOf, clock.dayOfWeek, p.thisWeek?.away);
  const chip = minimumChip({
    doors: p.week.doors,
    claims: p.week.claims,
    contractValueLast90Days: p.contractDollarsLast90Days,
    firstKnockDay: p.firstKnockDay,
    today: clock.today,
    period,
  });

  const thisCommitment = commitmentView(p.thisWeek);
  const weekBars = thisCommitment
    ? bars(p.week, thisCommitment.commitment, period)
    : [];

  const plan = p.thisMonth;
  const monthTargets: Partial<Record<WeeklyField, number | null>> = {};
  if (plan) for (const f of MONTHLY_FIELDS) monthTargets[f] = Number(plan[f]) || 0;
  const monthBars = plan
    ? bars(p.month, monthTargets, { presentDays: clock.daysInMonth, elapsedPresentDays: clock.dayOfMonth, ended: false })
    : [];

  const weekly = weeklyDeadlines(clock.weekOf);
  const nextCommitment = commitmentView(p.nextWeek);
  // Exempt from the 100-doors-or-1-claim floor: still ramping, or already at
  // contract average. (Away all next week is checked when the form is sent.)
  const floorExempt = chip.state === "ramp" || chip.state === "at-contract";

  const formMonth = formMonthFor(clock, now);
  const monthly = monthlyDeadlines(formMonth);

  return {
    userId: p.userId,
    name: p.name,
    role: p.role,
    team: p.team,
    branch: p.branch,
    chip,
    minimum: {
      doors: p.week.doors,
      claims: p.week.claims,
      monthlyContractAverage: Math.round(monthlyContractAverage(p.contractDollarsLast90Days)),
    },
    thisWeek: { weekOf: clock.weekOf, commitment: thisCommitment, actual: p.week, bars: weekBars },
    thisMonth: {
      month: clock.month,
      plan,
      income: plan ? incomePlan(plan.incomeGoal, plan.commissionPerRoof, clock.daysInMonth) : null,
      actual: p.month,
      bars: monthBars,
    },
    weeklyForm: {
      forWeekOf: clock.nextWeekOf,
      state: formState(now, weekly, p.nextWeek ? new Date(p.nextWeek.submittedAt) : null),
      due: weekly.due.toISOString(),
      lock: weekly.lock.toISOString(),
      canAdjust: now.getTime() < weekly.lock.getTime(),
      commitment: nextCommitment,
      floorExempt,
    },
    monthlyForm: {
      month: formMonth,
      state: formState(now, monthly, p.formMonth ? new Date(p.formMonth.submittedAt) : null),
      due: monthly.due.toISOString(),
      plan: p.formMonth,
    },
  };
}

// ---------------------------------------------------------------------------
// Roll-up
// ---------------------------------------------------------------------------

export interface GroupDmo {
  key: string;
  /** The person who owns fixing it: the Team Lead (team) or Branch Manager (branch). */
  owner: string;
  colour: Colour | null;
  green: number;
  counted: number;
  members: number;
  thisWeek: { commitment: Commitment; actual: Actuals; bars: Bar[] };
  nextWeek: { commitment: Commitment; submitted: number };
  weeklyDone: number;
  monthlyDone: number;
}

const DONE: FormState[] = ["done", "late"];

/**
 * Adds a group up. Members with no commitment count as 0 toward the group's
 * target (they still sell, so their actuals count): an empty DMO lowers the
 * bar's target, which is why "DMOs done" sits next to it on every screen.
 */
export function groupDmo(key: string, owner: string, people: PersonDmo[], clock: DmoClock): GroupDmo {
  const actual = { ...ZERO };
  for (const p of people) for (const f of WEEKLY_FIELDS) actual[f] += p.thisWeek.actual[f] || 0;
  const commitment = sumCommitments(people.map((p) => p.thisWeek.commitment?.commitment || { ...ZERO }));
  const next = sumCommitments(people.map((p) => p.weeklyForm.commitment?.commitment || { ...ZERO }));
  const anyCommitment = people.some((p) => p.thisWeek.commitment);
  const { colour, green, counted } = groupColour(people.map((p) => p.chip.colour));
  return {
    key,
    owner,
    colour,
    green,
    counted,
    members: people.length,
    thisWeek: {
      commitment,
      actual,
      bars: anyCommitment ? bars(actual, commitment, weekPeriod(clock.weekOf, clock.dayOfWeek, null)) : [],
    },
    nextWeek: { commitment: next, submitted: people.filter((p) => p.weeklyForm.commitment).length },
    weeklyDone: people.filter((p) => DONE.includes(p.weeklyForm.state)).length,
    monthlyDone: people.filter((p) => DONE.includes(p.monthlyForm.state)).length,
  };
}

const COLOUR_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, null: 3 };

/** Red first, then yellow, green, grey; furthest behind the 100-door pace first within a colour; then by name. */
export function sortPeople(people: PersonDmo[]): PersonDmo[] {
  return [...people].sort(
    (a, b) =>
      COLOUR_ORDER[String(a.chip.colour)] - COLOUR_ORDER[String(b.chip.colour)] ||
      (a.minimum.doors - a.chip.doorsPace) - (b.minimum.doors - b.chip.doorsPace) ||
      a.name.localeCompare(b.name)
  );
}

export function sortGroups(groups: GroupDmo[]): GroupDmo[] {
  return [...groups].sort(
    (a, b) => COLOUR_ORDER[String(a.colour)] - COLOUR_ORDER[String(b.colour)] || a.key.localeCompare(b.key)
  );
}
