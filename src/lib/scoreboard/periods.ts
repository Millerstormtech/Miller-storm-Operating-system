import type { Window } from "../acculynx/windows";

const DAY_MS = 24 * 60 * 60 * 1000;

// Shift a Central-midnight-as-UTC instant back by one whole period, preserving the
// time-of-day parts (which encode the Central offset), so the result is the same
// wall-clock start one period earlier.
function shiftBackOnePeriod(window: Window, start: Date): Date {
  if (window === "day") return new Date(start.getTime() - DAY_MS);
  if (window === "week") return new Date(start.getTime() - 7 * DAY_MS);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  const hh = start.getUTCHours();
  const mm = start.getUTCMinutes();
  const ss = start.getUTCSeconds();
  if (window === "month") return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  return new Date(Date.UTC(y - 1, m, d, hh, mm, ss)); // year
}

export function previousSlice(window: Window, start: Date, now: Date): { start: Date; end: Date } {
  const prevStart = shiftBackOnePeriod(window, start);
  const elapsed = now.getTime() - start.getTime();
  return { start: prevStart, end: new Date(prevStart.getTime() + elapsed) };
}

export function periodEndFor(window: Window, start: Date): Date {
  if (window === "day") return new Date(start.getTime() + DAY_MS);
  if (window === "week") return new Date(start.getTime() + 7 * DAY_MS);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  const hh = start.getUTCHours();
  const mm = start.getUTCMinutes();
  const ss = start.getUTCSeconds();
  if (window === "month") return new Date(Date.UTC(y, m + 1, d, hh, mm, ss));
  return new Date(Date.UTC(y + 1, m, d, hh, mm, ss)); // year
}

export function paceFraction(start: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - start.getTime();
  if (total <= 0) return 0;
  const frac = (now.getTime() - start.getTime()) / total;
  return Math.max(0, Math.min(1, frac));
}
