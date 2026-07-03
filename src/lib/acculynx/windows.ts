// src/lib/acculynx/windows.ts
// All windows are "to date": from the period start (Central time) through now.
//   day   = today         (since 00:00 Central today)
//   week  = week-to-date  (since Monday 00:00 Central)
//   month = month-to-date (since the 1st 00:00 Central)
//   year  = year-to-date  (since Jan 1 00:00 Central)
export type Window = "day" | "week" | "month" | "year";

const ZONE = "America/Chicago";

// Offset (ms) of Central from UTC at the given instant (handles CST/CDT).
function centralOffsetMs(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - d.getTime();
}

// Convert a Central wall-clock time to the matching UTC instant.
function centralWallToUtc(y: number, mo: number, da: number, h = 0, mi = 0, s = 0): Date {
  const guess = Date.UTC(y, mo - 1, da, h, mi, s);
  const offset = centralOffsetMs(new Date(guess));
  return new Date(guess - offset);
}

// Central calendar parts (+ weekday) for an instant.
function centralParts(d: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  return { year: +p.year, month: +p.month, day: +p.day, weekday: p.weekday };
}

const MON_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function getWindowRange(window: Window, now: Date = new Date()): { start: Date; end: Date } {
  const { year, month, day, weekday } = centralParts(now);

  if (window === "day") {
    return { start: centralWallToUtc(year, month, day), end: now };
  }

  if (window === "year") {
    return { start: centralWallToUtc(year, 1, 1), end: now };
  }

  if (window === "month") {
    return { start: centralWallToUtc(year, month, 1), end: now };
  }

  // week: back up to Monday in Central time
  const daysSinceMonday = MON_INDEX[weekday] ?? 0;
  const mondayUtcMidday = new Date(Date.UTC(year, month - 1, day, 12) - daysSinceMonday * 86400000);
  const mp = centralParts(mondayUtcMidday);
  return { start: centralWallToUtc(mp.year, mp.month, mp.day), end: now };
}
