// src/lib/dmo/rules.ts
// The DMO's rules: the income calculator, pace bars, Jay's minimum, ramp, away
// days, team colours, the commitment floor, and whether a form is done.
//
// Pure (no DB, no React, no clock). The API and the screen both call these, so
// a rep's own screen can never disagree with their Team Lead's about a colour.
import {
  CLAIM_TO_CONTRACT,
  MIN_MONTHLY_CONTRACT_AVERAGE,
  MIN_WEEKLY_CLAIMS,
  MIN_WEEKLY_DOORS,
  RAMP_DAYS,
  TEAM_GREEN_SHARE,
  TEAM_YELLOW_SHARE,
  WEEKLY_FIELDS,
  YELLOW_SHARE_OF_PACE,
  CONTRACT_AVERAGE_DAYS,
  type WeeklyField,
} from "./config";
import { daysBetween, weekDays } from "./calendar";

export type Colour = "green" | "yellow" | "red";

// ---------------------------------------------------------------------------
// Income calculator (Rep DMO PDF, "Own your number"; Jay's example on the call)
// ---------------------------------------------------------------------------

export interface IncomePlan {
  roofsNeeded: number;
  claimsNeeded: number;
  /** Claims a week to stay on track, one decimal. */
  weeklyClaims: number;
}

/** $10,000 goal / $5,000 per roof = 2 roofs; half of claims become roofs, so 4 claims. */
export function incomePlan(incomeGoal: number, commissionPerRoof: number, monthDays: number): IncomePlan | null {
  if (!(incomeGoal > 0) || !(commissionPerRoof > 0) || !(monthDays > 0)) return null;
  const roofsNeeded = Math.ceil(incomeGoal / commissionPerRoof);
  const claimsNeeded = Math.ceil(roofsNeeded / CLAIM_TO_CONTRACT);
  const weeklyClaims = Math.round((claimsNeeded / (monthDays / 7)) * 10) / 10;
  return { roofsNeeded, claimsNeeded, weeklyClaims };
}

// ---------------------------------------------------------------------------
// Pace bars
// ---------------------------------------------------------------------------

/**
 * Where the target "should" be by now. Pace counts every day of the period
 * (Youssef: all 7 days), except days the person said they'd be away: the line
 * does not grow on those, and the target is not reduced.
 */
export function paceFor(target: number, elapsedPresentDays: number, presentDays: number): number {
  if (!(target > 0) || presentDays <= 0) return 0;
  return (target * Math.min(Math.max(elapsedPresentDays, 0), presentDays)) / presentDays;
}

/** Green at or above pace, yellow from 70% of pace, red below. Once the period has ended: target hit or not. */
export function barColour(actual: number, target: number, pace: number, ended: boolean): Colour {
  if (ended) return actual >= target ? "green" : "red";
  if (actual >= pace) return "green";
  if (actual >= YELLOW_SHARE_OF_PACE * pace) return "yellow";
  return "red";
}

export interface Bar {
  field: WeeklyField;
  actual: number;
  target: number;
  pace: number;
  colour: Colour;
}

export interface Period {
  /** Days that count toward pace in the whole period (all days minus away days). */
  presentDays: number;
  /** Of those, how many have started by now (today included). */
  elapsedPresentDays: number;
  ended: boolean;
}

/** One bar per committed number. Fields the person did not commit to (null) get no bar. */
export function bars(
  actuals: Record<WeeklyField, number>,
  targets: Partial<Record<WeeklyField, number | null>>,
  period: Period
): Bar[] {
  const out: Bar[] = [];
  for (const field of WEEKLY_FIELDS) {
    const target = targets[field];
    if (target == null) continue;
    const pace = paceFor(target, period.elapsedPresentDays, period.presentDays);
    out.push({ field, actual: actuals[field] || 0, target, pace, colour: barColour(actuals[field] || 0, target, pace, period.ended) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Away days
// ---------------------------------------------------------------------------

export interface Away {
  from: string; // "YYYY-MM-DD", inclusive
  to: string;   // "YYYY-MM-DD", inclusive
  reason?: string;
}

/** The days of the week starting `weekOf` that fall inside the away range. */
export function awayDaysInWeek(weekOf: string, away: Away | null | undefined): string[] {
  if (!away || !away.from || !away.to) return [];
  return weekDays(weekOf).filter((d) => d >= away.from && d <= away.to);
}

/** The pace period for a week, given today's position (1..7, or 8+ once it is over) and the away days. */
export function weekPeriod(weekOf: string, dayOfWeek: number, away: Away | null | undefined): Period {
  const days = weekDays(weekOf);
  const awaySet = new Set(awayDaysInWeek(weekOf, away));
  const present = days.filter((d) => !awaySet.has(d));
  const elapsed = days.slice(0, Math.min(dayOfWeek, 7)).filter((d) => !awaySet.has(d));
  return { presentDays: present.length, elapsedPresentDays: elapsed.length, ended: dayOfWeek > 7 };
}

// ---------------------------------------------------------------------------
// Ramp and Jay's minimum (the chip, separate from the bars)
// ---------------------------------------------------------------------------

/** Days into the 90-day ramp (1 = first knock day), or null once it is over. No knock yet = day 0. */
export function rampDay(firstKnockDay: string | null | undefined, today: string): number | null {
  if (!firstKnockDay) return 0;
  const n = daysBetween(firstKnockDay, today) + 1;
  return n <= RAMP_DAYS ? n : null;
}

/** The 90-day contract value expressed as a monthly average. */
export function monthlyContractAverage(contractValueLast90Days: number): number {
  return (contractValueLast90Days || 0) / (CONTRACT_AVERAGE_DAYS / 30);
}

export type ChipState = "met" | "at-contract" | "on-pace" | "at-risk" | "off-pace" | "missed" | "ramp" | "away";

export interface MinimumChip {
  state: ChipState;
  /** null for the grey states (ramp, away): they are left out of team colours. */
  colour: Colour | null;
  /** Doors expected by now for the 100-door minimum. */
  doorsPace: number;
  rampDay: number | null;
}

export function minimumChip(input: {
  doors: number;
  claims: number;
  contractValueLast90Days: number;
  firstKnockDay: string | null | undefined;
  today: string;
  period: Period;
}): MinimumChip {
  const ramp = rampDay(input.firstKnockDay, input.today);
  const doorsPace = paceFor(MIN_WEEKLY_DOORS, input.period.elapsedPresentDays, input.period.presentDays);
  const chip = (state: ChipState, colour: Colour | null): MinimumChip => ({ state, colour, doorsPace, rampDay: ramp });

  if (ramp != null) return chip("ramp", null);
  if (input.period.presentDays === 0) return chip("away", null);
  if (monthlyContractAverage(input.contractValueLast90Days) >= MIN_MONTHLY_CONTRACT_AVERAGE) return chip("at-contract", "green");
  if (input.doors >= MIN_WEEKLY_DOORS || input.claims >= MIN_WEEKLY_CLAIMS) return chip("met", "green");
  if (input.period.ended) return chip("missed", "red");
  if (input.doors >= doorsPace) return chip("on-pace", "green");
  if (input.doors >= YELLOW_SHARE_OF_PACE * doorsPace) return chip("at-risk", "yellow");
  return chip("off-pace", "red");
}

// ---------------------------------------------------------------------------
// Team and branch colour
// ---------------------------------------------------------------------------

/** Share of members (grey ones left out) whose minimum chip is green. null when nobody counts yet. */
export function groupColour(chipColours: Array<Colour | null>): { colour: Colour | null; green: number; counted: number } {
  const counted = chipColours.filter((c) => c != null) as Colour[];
  const green = counted.filter((c) => c === "green").length;
  if (counted.length === 0) return { colour: null, green, counted: 0 };
  const share = green / counted.length;
  const colour: Colour = share >= TEAM_GREEN_SHARE ? "green" : share >= TEAM_YELLOW_SHARE ? "yellow" : "red";
  return { colour, green, counted: counted.length };
}

// ---------------------------------------------------------------------------
// Commitments: the floor, and Team Lead adjustments
// ---------------------------------------------------------------------------

export type Commitment = Record<WeeklyField, number>;

export const FLOOR_MESSAGE = "Your minimum is 100 doors or 1 claim a week.";

/**
 * A weekly commitment must meet Jay's minimum (100 doors OR 1 claim) unless the
 * person is away all week, at contract average, or still in their first 90 days.
 * Returns the message to show, or null when it is fine.
 */
export function checkCommitment(c: Partial<Record<WeeklyField, unknown>>, exempt: boolean): string | null {
  for (const field of WEEKLY_FIELDS) {
    const v = c[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return "Enter a number (0 or more) in every box.";
    if (field !== "contractDollars" && !Number.isInteger(v)) return "Doors, claims and contracts are whole numbers.";
  }
  if (exempt) return null;
  const doors = c.doors as number;
  const claims = c.claims as number;
  return doors >= MIN_WEEKLY_DOORS || claims >= MIN_WEEKLY_CLAIMS ? null : FLOOR_MESSAGE;
}

export interface Adjustment {
  field: WeeklyField;
  from: number;
  to: number;
  byUserId: string;
  at: Date;
}

/** The changes a Team Lead is making, one entry per field that actually changes. */
export function adjustmentsFor(current: Commitment, next: Partial<Commitment>, byUserId: string, at: Date): Adjustment[] {
  const out: Adjustment[] = [];
  for (const field of WEEKLY_FIELDS) {
    const to = next[field];
    if (typeof to === "number" && to !== current[field]) out.push({ field, from: current[field], to, byUserId, at });
  }
  return out;
}

/** What the person originally committed to, before any Team Lead change. */
export function originalCommitment(current: Commitment, adjustments: Adjustment[]): Commitment {
  const original = { ...current };
  for (const field of WEEKLY_FIELDS) {
    const first = adjustments.find((a) => a.field === field);
    if (first) original[field] = first.from;
  }
  return original;
}

export function sumCommitments(list: Commitment[]): Commitment {
  const total: Commitment = { doors: 0, claims: 0, contracts: 0, contractDollars: 0 };
  for (const c of list) for (const f of WEEKLY_FIELDS) total[f] += c[f] || 0;
  return total;
}

// ---------------------------------------------------------------------------
// Is the form done?
// ---------------------------------------------------------------------------

export type FormState = "not-open" | "due" | "overdue" | "done" | "late";

export function formState(now: Date, deadlines: { opens: Date; due: Date }, submittedAt: Date | null | undefined): FormState {
  if (submittedAt) return submittedAt.getTime() <= deadlines.due.getTime() ? "done" : "late";
  if (now.getTime() < deadlines.opens.getTime()) return "not-open";
  return now.getTime() < deadlines.due.getTime() ? "due" : "overdue";
}
