// src/lib/dmo/calendar.ts
// Where "now" falls in the DMO week and month, in Central time. Pure: every
// function takes `now`, never reads the clock (the dev machine is UTC+3).
//
// Days are plain "YYYY-MM-DD" Central calendar dates; arithmetic on them goes
// through Date.UTC so it never meets a time zone or a DST change.
import { WEEK_START_DAY, centralParts, centralWallToUtc, daysIntoWeek, type Weekday } from "../acculynx/windows";
import { WEEKLY_DUE, WEEKLY_LOCK, WEEKLY_OPENS } from "./config";

const DAY_MS = 86_400_000;
const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parse(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parse(day);
  return fmt(Date.UTC(y, m - 1, d) + n * DAY_MS);
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parse(a);
  const [by, bm, bd] = parse(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function weekdayOf(day: string): Weekday {
  const [y, m, d] = parse(day);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The first day (a Saturday) of the DMO week containing `day`. Weeks are named by it. */
export function weekOfDay(day: string): string {
  return addDays(day, -daysIntoWeek(weekdayOf(day), WEEK_START_DAY));
}

/** The seven days of the week that starts on `weekOf`. */
export function weekDays(weekOf: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export interface DmoClock {
  /** Today in Central, "YYYY-MM-DD". */
  today: string;
  /** This week's first day (Saturday). */
  weekOf: string;
  /** 1 on the first day of the week (Saturday) ... 7 on the last (Friday). */
  dayOfWeek: number;
  /** The week this Friday's weekly DMO commits to. */
  nextWeekOf: string;
  /** The week that ended last Friday. */
  prevWeekOf: string;
  /** "YYYY-MM" in Central. */
  month: string;
  dayOfMonth: number;
  daysInMonth: number;
}

export function dmoClock(now: Date): DmoClock {
  const p = centralParts(now);
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const weekOf = weekOfDay(today);
  const month = today.slice(0, 7);
  return {
    today,
    weekOf,
    dayOfWeek: daysBetween(weekOf, today) + 1,
    nextWeekOf: addDays(weekOf, 7),
    prevWeekOf: addDays(weekOf, -7),
    month,
    dayOfMonth: p.day,
    daysInMonth: daysInMonth(month),
  };
}

function centralInstant(day: string, hour: number): Date {
  const [y, m, d] = parse(day);
  return centralWallToUtc(y, m, d, hour);
}

/**
 * The weekly DMO filled in during the week starting `weekOf` (it recaps that
 * week and commits to the next): when it opens, when it is due, and when Team
 * Leads can no longer adjust it.
 */
export function weeklyDeadlines(weekOf: string): { opens: Date; due: Date; lock: Date } {
  return {
    opens: centralInstant(addDays(weekOf, WEEKLY_OPENS.daysIntoWeek), WEEKLY_OPENS.hour),
    due: centralInstant(addDays(weekOf, WEEKLY_DUE.daysIntoWeek), WEEKLY_DUE.hour),
    lock: centralInstant(addDays(weekOf, WEEKLY_LOCK.daysIntoWeek), WEEKLY_LOCK.hour),
  };
}

/**
 * The monthly DMO for `month` ("YYYY-MM"): opens on the last day of the month
 * before (the first reminder goes out that evening), due before midnight on
 * the 1st (Jay, 2026-10-02).
 */
export function monthlyDeadlines(month: string): { opens: Date; due: Date } {
  const first = `${month}-01`;
  return {
    opens: centralInstant(addDays(first, -1), 0),
    due: centralInstant(addDays(first, 1), 0),
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-11" -> "November". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] || month;
}
