// src/lib/canvass/dates.ts
// Calendar-day helpers for the Canvass Map. Days are plain "YYYY-MM-DD"
// strings and nothing here reads the clock: the caller decides what "today" is,
// the same convention as leaderboard/contractKing.ts.

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Days in a month, with month counted 1 to 12. */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The same day of the month, `months` earlier. Clamped to the last day when the
 * earlier month is shorter, so 31 March minus one month is 28 February, and a
 * leap day minus a year is 28 February.
 */
export function monthsBefore(day: string, months: number): string {
  const [y, m, d] = parts(day);
  const monthIndex = y * 12 + (m - 1) - months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`;
}

/**
 * Whole calendar days from `from` to `to`, negative when `from` is later.
 * Counted in UTC so a daylight-saving change can never add or lose a day.
 */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const TEXAS_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * The calendar day in Texas (Central time) of a moment, as "YYYY-MM-DD". RepCard
 * and AccuLynx send UTC, so a 10:30 pm knock would otherwise land on the next day.
 * All our counties are on Central time. Null for a blank or broken timestamp.
 */
export function centralDay(moment: string | Date): string | null {
  const ms = moment instanceof Date ? moment.getTime() : Date.parse(moment);
  if (Number.isNaN(ms)) return null;
  const part = (type: string) => TEXAS_DAY.formatToParts(ms).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "2026-05-04" becomes "4 May 2026", the form the house card shows. */
export function formatDay(day: string): string {
  const [y, m, d] = parts(day);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
