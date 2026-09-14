// src/lib/canvass/match.ts
// Matching a RepCard door or an AccuLynx job to the house it belongs to, by map
// position (spec B3: the nearest home within 30 m).
//
// The database does the heavy lifting with a geospatial query; this is the one
// definition of "nearest" that the importers, the backtest and the tests share.
//
// Pure: no DB, no network.

export type Point = { lat: number; lng: number };

/** Mean Earth radius in metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance over the Earth's surface, in metres (haversine). */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The candidate closest to `target` that is no farther than `maxMeters`, or
 * null. A candidate exactly on the limit counts. Between two equally close
 * candidates the first one wins, so the result never depends on luck.
 */
export function nearestWithin<T extends Point>(target: Point, candidates: readonly T[], maxMeters: number): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = distanceMeters(target, candidate);
    if (d <= maxMeters && d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}
