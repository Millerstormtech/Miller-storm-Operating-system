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
