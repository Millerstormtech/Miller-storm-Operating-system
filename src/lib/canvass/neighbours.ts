// src/lib/canvass/neighbours.ts
// Finding the "a neighbour signed with us" day for the grade (spec A4: +5 when a
// house within about 150 m signed an AccuLynx contract in the last 90 days).
// Signings are filed in map cells of 0.01 degree, so each house only looks at its
// own cell and the eight around it, not at every signing in Texas.
//
// Pure: no DB.

import { distanceMeters, type Point } from "./match";

export type Signing = Point & { homeId: string; day: string };
export type SigningIndex = Map<string, Signing[]>;

const CELL_DEGREES = 0.01;
const cellIndex = (degrees: number) => Math.floor(degrees / CELL_DEGREES);
const cellKey = (latIndex: number, lngIndex: number) => `${latIndex}|${lngIndex}`;

export function buildSigningIndex(signings: Iterable<Signing>): SigningIndex {
  const index: SigningIndex = new Map();
  for (const signing of signings) {
    const key = cellKey(cellIndex(signing.lat), cellIndex(signing.lng));
    const list = index.get(key) ?? [];
    list.push(signing);
    index.set(key, list);
  }
  return index;
}

/**
 * The most recent signing day at another house within `radiusMeters`, or null.
 * One cell around the house's own covers at least 900 m at Texas latitudes, so
 * the radius must stay under that (the grade uses 150 m).
 */
export function latestSigningNear(index: SigningIndex, house: Point & { id: string }, radiusMeters: number): string | null {
  const latIndex = cellIndex(house.lat);
  const lngIndex = cellIndex(house.lng);
  let latest: string | null = null;
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      for (const signing of index.get(cellKey(latIndex + dLat, lngIndex + dLng)) ?? []) {
        if (signing.homeId === house.id) continue;
        if (distanceMeters(house, signing) > radiusMeters) continue;
        if (latest === null || signing.day > latest) latest = signing.day;
      }
    }
  }
  return latest;
}
