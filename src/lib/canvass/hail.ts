// src/lib/canvass/hail.ts
// Hail sizes for the Knock Planner. The source is NOAA's MRMS "Maximum
// Estimated Size of Hail" radar product, which reports millimetres on a grid of
// roughly one kilometre (spec A5).
//
// Pure: no DB, no network, no clock.

import { monthsBefore } from "./dates";

/** One storm day that reached a house, with its size in inches. */
export type HailEvent = { date: string; inches: number };

const MM_PER_INCH = 25.4;

/**
 * Radar millimetres to inches, rounded to the nearest quarter inch. The radar
 * number is a rough estimate, and rounding once here means the size on the
 * house card and the size the points are based on are always the same number.
 * The tiny nudge keeps binary rounding error from turning an exact 1.125 into 1.
 */
export function hailInchesFromMm(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * 4 + 1e-9) / 4;
}

/**
 * The biggest storm from the last `months` months up to and including today.
 * The window's first day counts. A tie in size goes to the more recent storm,
 * because that is the one a homeowner remembers and can still claim for.
 */
export function biggestHailInWindow(events: HailEvent[], today: string, months: number): HailEvent | null {
  const start = monthsBefore(today, months);
  let best: HailEvent | null = null;
  for (const e of events) {
    if (e.date < start || e.date > today) continue;
    if (!best || e.inches > best.inches || (e.inches === best.inches && e.date > best.date)) best = e;
  }
  return best ? { date: best.date, inches: best.inches } : null;
}

/** 2 is written "2", 1.25 is "1.25", 1.5 is "1.5". */
export function formatInches(inches: number): string {
  return String(Number(inches.toFixed(2)));
}
