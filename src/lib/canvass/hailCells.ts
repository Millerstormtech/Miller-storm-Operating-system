// src/lib/canvass/hailCells.ts
// Reads one line of the hail decoder's output (scripts/canvass-hail/decode.py)
// into a Canvass Map hail square, or null when the line cannot be trusted.
//
// The decoder already keeps only Texas squares of 0.75 inch or more; the same
// limits are checked again here so a stray or hand-edited file cannot load
// hail somewhere it did not fall.
//
// Pure: no DB, no files.

import { hailInchesFromMm } from "./hail";

const TEXAS = { south: 25.8, north: 36.6, west: -106.7, east: -93.5 };
const MIN_MM = 19.05; // 0.75 inch

export type HailCellRecord = {
  cellKey: string;
  stormDate: string;
  location: { type: "Point"; coordinates: [number, number] };
  mm: number;
  inches: number;
};

/** "2026-03-10|32.7551|-97.3308". Four decimals keep neighboring squares (0.01 degree apart) distinct. */
export function hailCellKey(stormDate: string, lat: number, lon: number): string {
  return `${stormDate}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
}

export function parseHailLine(line: string): HailCellRecord | null {
  if (!line.trim()) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const { date, lat, lon, mm } = raw as Record<string, unknown>;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof lat !== "number" || typeof lon !== "number" || typeof mm !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mm)) return null;
  if (lat < TEXAS.south || lat > TEXAS.north || lon < TEXAS.west || lon > TEXAS.east) return null;
  if (mm < MIN_MM) return null;

  return {
    cellKey: hailCellKey(date, lat, lon),
    stormDate: date,
    location: { type: "Point", coordinates: [lon, lat] },
    mm,
    inches: hailInchesFromMm(mm),
  };
}

/** Squares below 0.75 inch are never stored, so a missing neighbor counts as this size. */
const FLOOR_INCHES = 0.75;
const FLOOR_MM = 19.05;

/**
 * Brings radar glitches down before they reach a house card. A square more
 * than `maxJumpInches` bigger than its biggest neighbor (the 8 squares around
 * it, same storm day) takes that neighbor's size. A square with no stored
 * neighbors is compared with 0.75 inch, because real large hail covers more
 * than one square. The reference case: on 28 Apr 2026 one Panhandle square
 * read 8.69 in while its neighbors read 4.81 in and below.
 *
 * Neighbors are always judged on the original sizes, so capping one square
 * never changes the verdict on another. Returns new objects.
 */
export function capSpikes(cells: HailCellRecord[], maxJumpInches = 2): HailCellRecord[] {
  // Squares are 0.01 degree apart; in half-hundredths of a degree the
  // neighbors are exactly 2 units away, whether centers end in 0 or 5.
  const units = (degrees: number) => Math.round(degrees * 200);
  const key = (date: string, lat: number, lon: number) => `${date}|${lat}|${lon}`;
  const byPosition = new Map<string, HailCellRecord>();
  for (const cell of cells) {
    byPosition.set(key(cell.stormDate, units(cell.location.coordinates[1]), units(cell.location.coordinates[0])), cell);
  }

  return cells.map((cell) => {
    const lat = units(cell.location.coordinates[1]);
    const lon = units(cell.location.coordinates[0]);
    let biggestNeighbor: HailCellRecord | null = null;
    for (const dLat of [-2, 0, 2]) {
      for (const dLon of [-2, 0, 2]) {
        if (dLat === 0 && dLon === 0) continue;
        const neighbor = byPosition.get(key(cell.stormDate, lat + dLat, lon + dLon));
        if (neighbor && (!biggestNeighbor || neighbor.inches > biggestNeighbor.inches)) biggestNeighbor = neighbor;
      }
    }
    const neighborInches = biggestNeighbor ? biggestNeighbor.inches : FLOOR_INCHES;
    if (cell.inches <= neighborInches + maxJumpInches) return { ...cell };
    return biggestNeighbor
      ? { ...cell, inches: biggestNeighbor.inches, mm: biggestNeighbor.mm }
      : { ...cell, inches: FLOOR_INCHES, mm: FLOOR_MM };
  });
}
