// src/lib/canvass/hailAssign.ts
// Which storm days hit which houses: a house gets the hail of the NOAA radar
// square it sits in.
//
// NOAA's hail squares are 0.01 degree across with centers ending in 5 (for
// example 34.925, -102.125). Rounding a house's position down to the hundredth
// of a degree names its square; rounding a square's center down names the same
// square. A house exactly on an edge belongs to the square to its north or east.
//
// Pure: no DB.

export type HailSquare = { stormDate: string; lat: number; lon: number; inches: number };
export type HouseSpot = { id: string; lat: number; lon: number };
export type HouseStorm = { date: string; inches: number };

/** The hail square a position falls in. The tiny nudge keeps 34.93 from rounding down to 34.92. */
export function gridKey(lat: number, lon: number): string {
  return `${Math.floor(lat * 100 + 1e-6)}|${Math.floor(lon * 100 + 1e-6)}`;
}

/**
 * The storm days, oldest first, whose square covers each house, for squares of
 * at least `minInches`. Houses with no such square are left out. If one day
 * lists the same square twice, the bigger size wins.
 */
export function assignHail(homes: HouseSpot[], squares: HailSquare[], minInches: number): Map<string, HouseStorm[]> {
  const bySquare = new Map<string, Map<string, number>>();
  for (const square of squares) {
    if (square.inches < minInches) continue;
    const key = gridKey(square.lat, square.lon);
    const days = bySquare.get(key) ?? new Map<string, number>();
    days.set(square.stormDate, Math.max(days.get(square.stormDate) ?? 0, square.inches));
    bySquare.set(key, days);
  }

  const result = new Map<string, HouseStorm[]>();
  for (const home of homes) {
    const days = bySquare.get(gridKey(home.lat, home.lon));
    if (!days) continue;
    const storms = [...days.entries()].map(([date, inches]) => ({ date, inches })).sort((a, b) => a.date.localeCompare(b.date));
    result.set(home.id, storms);
  }
  return result;
}
