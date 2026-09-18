// src/lib/canvass/query.ts
// The map's "houses in view" request (spec B5, plan T6.1): what a valid request
// looks like, the database filter it turns into, the 3,000-house cap, and the
// zoomed-out clusters shown past that cap.
//
// Shared by the API route and its tests so the rule about what a rep may ask
// for lives in one place. Pure: no DB, no React, no clock. The route passes
// today's day in.
//
// GET /api/canvass/homes?bbox=w,s,e,n&colors=green,yellow&hideKnockedDays=30&hailSince=2026-05-01&ownerOnly=1

import type { Color } from "./grade";
import { daysBetween } from "./dates";

/** The most houses one request draws. Past this the map shows clusters instead (spec B5). */
export const HOMES_LIMIT = 3000;

/** The widest map area one request may ask for, in degrees. About 110 km north-south; a whole city fits, a whole state does not. */
export const MAX_BBOX_DEGREES = 1;

export const COLORS: readonly Color[] = ["green", "yellow", "orange", "red"];

/** West, south, east, north edges of the map view, in degrees. */
export type Bbox = { west: number; south: number; east: number; north: number };

/**
 * The map view as the geographic filter MongoDB can serve from the 2dsphere
 * index: a GeoJSON polygon. NOT $box: that legacy form needs a 2d index, and
 * with only the 2dsphere index present it scanned all 3.78 million houses
 * (6.4 s for one neighbourhood, measured 17 Sep 2026).
 */
export function viewWithin(bbox: Bbox): Record<string, unknown> {
  const { west, south, east, north } = bbox;
  return {
    $geoWithin: {
      $geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    },
  };
}

export type HomesQuery = {
  bbox: Bbox;
  /** Which colours to show. Always at least one. */
  colors: Color[];
  /** Hide houses we knocked within this many days; null means show them all. */
  hideKnockedDays: number | null;
  /** Only houses with hail of 1 in or more on or after this day (YYYY-MM-DD); null for no such filter. */
  hailSince: string | null;
  /** Only houses where the owner appears to live there. */
  ownerOnly: boolean;
};

export type ParsedHomesQuery = { ok: true; query: HomesQuery } | { ok: false; error: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True for "2026-05-01"; false for "2026-13-01", "2026-02-30" and anything not in that shape. */
export function isValidDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? "") : value === undefined || value === null ? "" : String(value));

/** Turns the raw query string values into a checked request, or says exactly what is wrong. */
export function parseHomesQuery(raw: Record<string, unknown>): ParsedHomesQuery {
  const parts = first(raw.bbox).split(",").map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => part === "" || !Number.isFinite(Number(part)))) {
    return { ok: false, error: "bbox must be four numbers: west,south,east,north" };
  }
  const [west, south, east, north] = parts.map(Number);
  if (west < -180 || east > 180 || south < -90 || north > 90) return { ok: false, error: "bbox is outside the world" };
  if (west >= east || south >= north) return { ok: false, error: "bbox must have west < east and south < north" };
  if (east - west > MAX_BBOX_DEGREES || north - south > MAX_BBOX_DEGREES) {
    return { ok: false, error: `bbox is too large: at most ${MAX_BBOX_DEGREES} degree on each side` };
  }

  let colors: Color[] = [...COLORS];
  const colorText = first(raw.colors).trim();
  if (colorText) {
    const asked = colorText.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
    const unknown = asked.find((color) => !COLORS.includes(color as Color));
    if (unknown) return { ok: false, error: `unknown color "${unknown}"` };
    colors = COLORS.filter((color) => asked.includes(color)); // canonical order, no repeats
    if (colors.length === 0) return { ok: false, error: "colors must name at least one color" };
  }

  let hideKnockedDays: number | null = null;
  const hideText = first(raw.hideKnockedDays).trim();
  if (hideText) {
    const days = Number(hideText);
    if (!Number.isInteger(days) || days < 0 || days > 3650) return { ok: false, error: "hideKnockedDays must be a whole number of days, 0 to 3650" };
    hideKnockedDays = days;
  }

  let hailSince: string | null = null;
  const sinceText = first(raw.hailSince).trim();
  if (sinceText) {
    if (!isValidDay(sinceText)) return { ok: false, error: "hailSince must be a day like 2026-05-01" };
    hailSince = sinceText;
  }

  const ownerText = first(raw.ownerOnly).trim().toLowerCase();
  const ownerOnly = ownerText === "1" || ownerText === "true" || ownerText === "yes";

  return { ok: true, query: { bbox: { west, south, east, north }, colors, hideKnockedDays, hailSince, ownerOnly } };
}

/**
 * The MongoDB filter for canvass_homes. Only graded houses are drawn: a house
 * with no colour yet would have nothing to show.
 */
export function homesFilter(query: HomesQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    location: viewWithin(query.bbox),
    "grade.color": query.colors.length === COLORS.length ? { $in: [...COLORS] } : { $in: query.colors },
  };
  if (query.hailSince) filter.hail = { $elemMatch: { date: { $gte: query.hailSince }, inches: { $gte: 1 } } };
  if (query.ownerOnly) filter.ownerLivesHere = true;
  return filter;
}

/** The fields the list needs, and nothing that names a person. */
export const HOMES_PROJECTION = { _id: 1, location: 1, "grade.color": 1 } as const;

/** One house as the map draws it. */
export type MapHome = { id: string; lat: number; lng: number; color: Color; knocked: boolean };

export type HomeRow = { _id: unknown; location: { coordinates: [number, number] }; grade?: { color?: Color | null } };

/**
 * Turns database rows into map dots, marks the ones we have knocked, and drops
 * the ones knocked too recently when the rep asked for that. `latestKnockDay`
 * is each house's most recent knock as a Texas day (YYYY-MM-DD), for the houses
 * that have one.
 */
export function toMapHomes(rows: readonly HomeRow[], latestKnockDay: ReadonlyMap<string, string>, today: string, hideKnockedDays: number | null): MapHome[] {
  const homes: MapHome[] = [];
  for (const row of rows) {
    const color = row.grade?.color;
    if (!color) continue;
    const id = String(row._id);
    const lastKnock = latestKnockDay.get(id);
    if (lastKnock !== undefined && hideKnockedDays !== null) {
      const age = daysBetween(lastKnock, today);
      if (age >= 0 && age <= hideKnockedDays) continue;
    }
    const [lng, lat] = row.location.coordinates;
    homes.push({ id, lat, lng, color, knocked: lastKnock !== undefined });
  }
  return homes;
}

/** A shaded area for the zoomed-out view: how many houses sit in one grid cell, and how many of them are green. */
export type Cluster = { lat: number; lng: number; count: number; green: number };

/** How many grid cells across the map view the clusters use. */
export const CLUSTER_CELLS = 24;

/** The grid cell size, in degrees, for a map view; the same on both axes so cells stay square-ish. */
export function clusterCellSize(bbox: Bbox, cells: number = CLUSTER_CELLS): number {
  return Math.max(bbox.east - bbox.west, bbox.north - bbox.south) / cells;
}

/**
 * The aggregation that counts houses per grid cell inside the view, so a
 * city-wide request never loads a million rows. Each cell reports its centre.
 */
export function clustersPipeline(query: HomesQuery, cells: number = CLUSTER_CELLS): Record<string, unknown>[] {
  const size = clusterCellSize(query.bbox, cells);
  return [
    { $match: homesFilter(query) },
    {
      $project: {
        col: { $floor: { $divide: [{ $subtract: [{ $arrayElemAt: ["$location.coordinates", 0] }, query.bbox.west] }, size] } },
        row: { $floor: { $divide: [{ $subtract: [{ $arrayElemAt: ["$location.coordinates", 1] }, query.bbox.south] }, size] } },
        green: { $cond: [{ $eq: ["$grade.color", "green"] }, 1, 0] },
      },
    },
    { $group: { _id: { col: "$col", row: "$row" }, count: { $sum: 1 }, green: { $sum: "$green" } } },
  ];
}

export type ClusterRow = { _id: { col: number; row: number }; count: number; green: number };

/** Grid cells from the aggregation, as shaded areas with a centre point. */
export function toClusters(rows: readonly ClusterRow[], bbox: Bbox, cells: number = CLUSTER_CELLS): Cluster[] {
  const size = clusterCellSize(bbox, cells);
  return rows
    .filter((row) => row.count > 0)
    .map((row) => ({
      lng: bbox.west + (row._id.col + 0.5) * size,
      lat: bbox.south + (row._id.row + 0.5) * size,
      count: row.count,
      green: row.green,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---- The hail layer (spec B5: GET /api/canvass/hail?since=&bbox=) ----

/** The most radar squares one request draws. A city view in a big storm season stays well under this. */
export const HAIL_CELLS_LIMIT = 20000;

export type HailQuery = { bbox: Bbox; since: string };

export type ParsedHailQuery = { ok: true; query: HailQuery } | { ok: false; error: string };

/** The hail layer needs the same checked view as the dots, plus the first storm day to show. */
export function parseHailQuery(raw: Record<string, unknown>): ParsedHailQuery {
  const view = parseHomesQuery({ bbox: raw.bbox });
  if (!view.ok) return view;
  const since = first(raw.since).trim();
  if (!since || !isValidDay(since)) return { ok: false, error: "since must be a day like 2026-05-01" };
  return { ok: true, query: { bbox: view.query.bbox, since } };
}

/** The MongoDB filter for canvass_hail_cells: squares of 1 in or more (the grade's smallest band) in the view since the day. */
export function hailCellsFilter(query: HailQuery): Record<string, unknown> {
  return {
    location: viewWithin(query.bbox),
    stormDate: { $gte: query.since },
    inches: { $gte: 1 },
  };
}

/** The fields the layer needs, and nothing else. */
export const HAIL_CELLS_PROJECTION = { _id: 0, stormDate: 1, location: 1, inches: 1 } as const;

export type HailCellRow = { stormDate: string; location: { coordinates: [number, number] }; inches: number };

/** One radar square as the layer draws it. */
export type MapHailCell = { date: string; lat: number; lng: number; inches: number };

export function toMapHailCells(rows: readonly HailCellRow[]): MapHailCell[] {
  return rows.map((row) => ({ date: row.stormDate, lng: row.location.coordinates[0], lat: row.location.coordinates[1], inches: row.inches }));
}
