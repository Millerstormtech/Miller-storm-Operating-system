// src/lib/canvass/hailClutter.ts
// Fixed radar false echoes in the hail data, and what to do about them.
//
// Measured on 15 Sep 2026 over two years of NOAA radar hail: near Harlingen-
// Brownsville and south of Kingsville (both near wind farms) some squares showed
// "hail" on up to 27 days, 11 of them in winter, with readings up to 12.25 in and
// no storm reports anywhere near. No square in Fort Worth-Dallas or Lubbock had
// hail on more than 6 days. But real 3 in hail was reported near Harlingen on
// 8 May 2025, so a false-echo square is not simply blanked: on each day it takes
// the middle reading of the normal squares around it, which is nothing on a
// false-echo day and the storm's hail on a real one.
//
// Pure: no DB.

import { gridKey, type HailSquare } from "./hailAssign";

export const CLUTTER = {
  /** Readings below this do not count toward a square's number of hail days. */
  minInches: 1,
  /** A square with hail on this many days or more is a false-echo square. */
  minDays: 10,
  /** ...and so is a square with readings this big on `minBigDays` days or more. */
  bigInches: 3,
  minBigDays: 3,
  /** How far, in squares (0.01 degree each), to look for normal neighbours. */
  radiusSquares: 3,
  /** Fewer normal neighbours with hail than this, and the false-echo square is dropped for the day. */
  minNeighbours: 3,
};

/** The grid keys of false-echo squares, from the loaded history of hail squares (one entry per square per day). */
export function clutterSquares(history: Iterable<{ lat: number; lon: number; inches: number }>, rules = CLUTTER): Set<string> {
  const counts = new Map<string, { days: number; bigDays: number }>();
  for (const square of history) {
    if (square.inches < rules.minInches) continue;
    const key = gridKey(square.lat, square.lon);
    const entry = counts.get(key) ?? { days: 0, bigDays: 0 };
    entry.days++;
    if (square.inches >= rules.bigInches) entry.bigDays++;
    counts.set(key, entry);
  }
  const flagged = new Set<string>();
  for (const [key, entry] of counts) {
    if (entry.days >= rules.minDays || entry.bigDays >= rules.minBigDays) flagged.add(key);
  }
  return flagged;
}

/**
 * One day's squares with every false-echo square replaced by the middle reading
 * (median, rounded to the quarter inch) of the normal squares within
 * `radiusSquares`, or dropped when fewer than `minNeighbours` of them have hail.
 */
export function replaceClutter(daySquares: readonly HailSquare[], clutter: ReadonlySet<string>, rules = CLUTTER): HailSquare[] {
  const normal = new Map<string, number>();
  for (const square of daySquares) {
    const key = gridKey(square.lat, square.lon);
    if (!clutter.has(key)) normal.set(key, Math.max(normal.get(key) ?? 0, square.inches));
  }

  const cleaned: HailSquare[] = [];
  for (const square of daySquares) {
    const key = gridKey(square.lat, square.lon);
    if (!clutter.has(key)) {
      cleaned.push(square);
      continue;
    }
    const [latIndex, lonIndex] = key.split("|").map(Number);
    const readings: number[] = [];
    for (let dLat = -rules.radiusSquares; dLat <= rules.radiusSquares; dLat++) {
      for (let dLon = -rules.radiusSquares; dLon <= rules.radiusSquares; dLon++) {
        if (dLat === 0 && dLon === 0) continue;
        const reading = normal.get(`${latIndex + dLat}|${lonIndex + dLon}`);
        if (reading !== undefined) readings.push(reading);
      }
    }
    if (readings.length < rules.minNeighbours) continue;
    readings.sort((a, b) => a - b);
    const middle = readings.length / 2;
    const median = readings.length % 2 === 1 ? readings[Math.floor(middle)] : (readings[middle - 1] + readings[middle]) / 2;
    cleaned.push({ ...square, inches: Math.round(median * 4) / 4 });
  }
  return cleaned;
}
