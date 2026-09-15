// src/lib/canvass/match.ts
// Matching a RepCard door or an AccuLynx job to the house it belongs to.
//
// Spec B3 said "the nearest home within 30 m". Refined 15 Sep 2026: both systems
// give an address with the position, and the nearest parcel center can be the
// neighbor's on a deep or oddly shaped lot, so a house with the same number and
// street nearby wins first.
//
// The database finds the nearby houses with a geospatial query; this is the one
// definition of the match that the importers, the backtest and the tests share.
//
// Pure: no DB, no network.

import { addressKey } from "./address";

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

export const MATCH = {
  /** How far a house with the same number and street may be. */
  addressSearchMeters: 250,
  /** How far the nearest house may be when no address matches. */
  maxMeters: 30,
};

export type HomeCandidate = Point & { id: string; addressLine: string };
export type HomeMatch = { homeId: string; meters: number; method: "address" | "distance" };

/**
 * The house a door or job belongs to: the nearest house within 250 m with the same
 * house number and street (direction words, street types and rural road spellings
 * ignored); otherwise the nearest house within 30 m; otherwise null.
 */
export function matchToHome(target: Point & { addressLine: string }, candidates: readonly HomeCandidate[], limits = MATCH): HomeMatch | null {
  const key = addressKey(target.addressLine, "");
  if (key) {
    const sameAddress = candidates.filter((home) => addressKey(home.addressLine, "") === key);
    const home = nearestWithin(target, sameAddress, limits.addressSearchMeters);
    if (home) return { homeId: home.id, meters: distanceMeters(target, home), method: "address" };
  }
  const nearest = nearestWithin(target, candidates, limits.maxMeters);
  return nearest ? { homeId: nearest.id, meters: distanceMeters(target, nearest), method: "distance" } : null;
}
