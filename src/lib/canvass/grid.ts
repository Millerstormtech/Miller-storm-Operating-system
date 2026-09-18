// src/lib/canvass/grid.ts
// The pre-count behind the zoomed-out map (Youssef, 18 Sep 2026: make the city
// view instant before anyone uses the page).
//
// Counting the houses in a whole city on every request meant touching every
// house in view: 1.08 million for Dallas-Fort Worth, about 8 seconds. Instead,
// a nightly pass counts houses of each colour into fixed squares 0.01 degree
// across (about 1.1 km, the same size as the radar's hail squares), and the
// zoomed-out request sums the few thousand squares in view into the 24-across
// clusters the map draws. Same answer to within a square's width at the edges,
// in milliseconds.
//
// Pure: no DB, no React, no clock. The aggregation and the filter are built
// here so the nightly script and the API can never disagree about the squares.

import type { Color } from "./grade";
import { CLUSTER_CELLS, COLORS, clusterCellSize, toClusters, type Bbox, type Cluster, type ClusterRow } from "./query";

/** One square's width and height, in degrees. */
export const GRID_DEGREES = 0.01;

/** One pre-counted square: its index along each axis, and how many houses of each colour sit in it. */
export type GridCell = { col: number; row: number; count: number; green: number; yellow: number; orange: number; red: number };

/** The square index a coordinate falls in. Longitudes are negative in Texas; floor keeps that consistent. */
export function cellIndex(degrees: number): number {
  return Math.floor(degrees / GRID_DEGREES + 1e-9);
}

/** The centre of a square, from its indices. */
export function cellCentre(col: number, row: number): { lng: number; lat: number } {
  return { lng: (col + 0.5) * GRID_DEGREES, lat: (row + 0.5) * GRID_DEGREES };
}

/**
 * The MongoDB aggregation that turns every graded house into these squares.
 * Only graded houses count, the same rule the dots use.
 */
export function gridPipeline(): Record<string, unknown>[] {
  const flag = (color: Color) => ({ $cond: [{ $eq: ["$grade.color", color] }, 1, 0] });
  return [
    { $match: { "grade.color": { $in: [...COLORS] } } },
    {
      $project: {
        col: { $floor: { $add: [{ $divide: [{ $arrayElemAt: ["$location.coordinates", 0] }, GRID_DEGREES] }, 1e-9] } },
        row: { $floor: { $add: [{ $divide: [{ $arrayElemAt: ["$location.coordinates", 1] }, GRID_DEGREES] }, 1e-9] } },
        green: flag("green"),
        yellow: flag("yellow"),
        orange: flag("orange"),
        red: flag("red"),
      },
    },
    {
      $group: {
        _id: { col: "$col", row: "$row" },
        count: { $sum: 1 },
        green: { $sum: "$green" },
        yellow: { $sum: "$yellow" },
        orange: { $sum: "$orange" },
        red: { $sum: "$red" },
      },
    },
  ];
}

/** The filter for the squares whose centre lies inside a map view. */
export function gridCellsFilter(bbox: Bbox): Record<string, unknown> {
  return {
    col: { $gte: cellIndex(bbox.west), $lte: cellIndex(bbox.east) },
    row: { $gte: cellIndex(bbox.south), $lte: cellIndex(bbox.north) },
  };
}

/**
 * The clusters the map draws for a view, summed from the pre-counted squares.
 * Only the colours the rep asked to see are counted; a square whose centre lies
 * outside the view is left out.
 */
export function clustersFromGrid(cells: readonly GridCell[], bbox: Bbox, colors: readonly Color[], viewCells: number = CLUSTER_CELLS): Cluster[] {
  const size = clusterCellSize(bbox, viewCells);
  const wanted = new Set(colors);
  const rows = new Map<string, ClusterRow>();
  for (const cell of cells) {
    const { lng, lat } = cellCentre(cell.col, cell.row);
    if (lng < bbox.west || lng > bbox.east || lat < bbox.south || lat > bbox.north) continue;
    let count = 0;
    for (const color of COLORS) if (wanted.has(color)) count += cell[color];
    if (count === 0) continue;
    const col = Math.floor((lng - bbox.west) / size);
    const row = Math.floor((lat - bbox.south) / size);
    const key = `${col}:${row}`;
    const existing = rows.get(key) ?? { _id: { col, row }, count: 0, green: 0 };
    existing.count += count;
    if (wanted.has("green")) existing.green += cell.green;
    rows.set(key, existing);
  }
  return toClusters([...rows.values()], bbox, viewCells);
}
