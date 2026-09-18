// src/lib/canvass/mapView.ts
// What the Canvass Map screen needs decided in one testable place: the map
// provider's style address, where the map opens, the colour of every dot and
// hail square, when a view is small enough to ask for houses, and the exact
// request each view turns into. The React components only draw.
//
// Pure: no DB, no React, no clock.

import type { Color } from "./grade";
import { MAX_BBOX_DEGREES, type Bbox } from "./query";

/**
 * OpenFreeMap's public "liberty" street style (decided 17 Sep 2026: free map
 * for now). No key, no request limit, commercial use allowed, attribution
 * added by MapLibre itself. Checked to answer HTTP 200 the same day.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Where the map opens: Fort Worth, the pilot area (spec A8, any Fort Worth team pilots). */
export const START_VIEW = { longitude: -97.33, latitude: 32.75, zoom: 11 };

/** Zooming closer than this shows every house as its own dot; further out shows shaded clusters. */
export const HOUSE_ZOOM = 13;

export type Rgb = [number, number, number];

/** Dot colours. Red is the brand red (#CB0002); the others are chosen to read apart from it and from each other. */
export const DOT_RGB: Record<Color, Rgb> = {
  green: [22, 163, 74],
  yellow: [234, 179, 8],
  orange: [249, 115, 22],
  red: [203, 0, 2],
};

/** The ring around a house we have already knocked. */
export const KNOCKED_RING_RGB: Rgb = [17, 24, 39];

/** The ring around the house whose card is open. */
export const SELECTED_RING_RGB: Rgb = [37, 99, 235];

/**
 * Hail squares: blue, deeper the bigger the hail, using the grade's own bands
 * (1, 1.25 and 1.75 in), so the shading and the points always agree.
 */
export function hailRgba(inches: number): [number, number, number, number] {
  // Light on purpose: at neighbourhood zoom one radar square covers half the
  // screen, and the streets under it must stay readable.
  if (inches >= 1.75) return [30, 64, 175, 70];
  if (inches >= 1.25) return [59, 130, 246, 52];
  return [147, 197, 253, 38];
}

/** The radar squares are 0.01 degree across, centres ending in 5 (hailAssign.ts). */
export const HAIL_CELL_DEGREES = 0.01;

/** One radar square's outline, drawn as the square it really is rather than a circle. */
export function hailSquare(cell: { lat: number; lng: number }): [number, number][] {
  const h = HAIL_CELL_DEGREES / 2;
  const r = (n: number) => Math.round(n * 1e6) / 1e6; // no floating-point crumbs on the corners
  return [
    [r(cell.lng - h), r(cell.lat - h)],
    [r(cell.lng + h), r(cell.lat - h)],
    [r(cell.lng + h), r(cell.lat + h)],
    [r(cell.lng - h), r(cell.lat + h)],
    [r(cell.lng - h), r(cell.lat - h)],
  ];
}

/** A cluster's colour: grey where few houses are green, green where most are. */
export function clusterRgba(count: number, green: number): [number, number, number, number] {
  const share = count > 0 ? Math.min(1, green / count) : 0;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * share);
  return [mix(148, 22), mix(163, 163), mix(184, 74), 120];
}

/** A cluster's drawn size in metres: bigger with more houses, never wider than about half its grid cell. */
export function clusterRadiusMeters(count: number, cellDegrees: number): number {
  const cellMeters = cellDegrees * 111_000;
  const scaled = Math.sqrt(count) * 25;
  return Math.max(60, Math.min(cellMeters / 2, scaled));
}

/** The map's south-west and north-east corners as the request's bbox, rounded so the URL stays short and stable. */
export function boundsToBbox(southWest: { lng: number; lat: number }, northEast: { lng: number; lat: number }): Bbox {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return { west: r(southWest.lng), south: r(southWest.lat), east: r(northEast.lng), north: r(northEast.lat) };
}

/** A view small enough to ask the server for houses (the server refuses anything wider, spec B5). */
export function canRequestHouses(bbox: Bbox): boolean {
  return bbox.east - bbox.west <= MAX_BBOX_DEGREES && bbox.north - bbox.south <= MAX_BBOX_DEGREES;
}

export function bboxParam(bbox: Bbox): string {
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
}

/** The filters a rep can set (spec A3). */
export type FilterState = {
  colors: Color[];
  /** Hide houses we knocked within this many days; null shows them all, with a ring. */
  hideKnockedDays: number | null;
  /** Only houses with hail of 1 in or more since this day; null for any. */
  hailSince: string | null;
  ownerOnly: boolean;
  showHail: boolean;
};

export const DEFAULT_FILTERS: FilterState = {
  colors: ["green", "yellow", "orange", "red"],
  hideKnockedDays: null,
  hailSince: null,
  ownerOnly: false,
  showHail: true,
};

/** The houses request for a view and filters, exactly as the API reads it (query.ts). */
export function homesUrl(bbox: Bbox, filters: FilterState): string {
  const params = new URLSearchParams({ bbox: bboxParam(bbox) });
  if (filters.colors.length > 0 && filters.colors.length < 4) params.set("colors", filters.colors.join(","));
  if (filters.hideKnockedDays !== null) params.set("hideKnockedDays", String(filters.hideKnockedDays));
  if (filters.hailSince) params.set("hailSince", filters.hailSince);
  if (filters.ownerOnly) params.set("ownerOnly", "1");
  return `/api/canvass/homes?${params.toString()}`;
}

/** The hail layer request: the view, and the first storm day to show. */
export function hailUrl(bbox: Bbox, since: string): string {
  const params = new URLSearchParams({ bbox: bboxParam(bbox), since });
  return `/api/canvass/hail?${params.toString()}`;
}

/** The legend, in the words a rep sees (Youssef, 17 Sep 2026: green is the promise, yellow is worth a look). No em dashes. */
export const LEGEND: Array<{ color: Color; label: string; meaning: string }> = [
  { color: "green", label: "Knock this", meaning: "Recent big hail, an owner who lives there, and nothing telling us to stay away." },
  { color: "yellow", label: "Worth a look", meaning: "Some of the signs are there. Knock it if you are on the street anyway." },
  { color: "orange", label: "Weak", meaning: "Little or no recent hail, or the owner probably does not live there." },
  { color: "red", label: "Skip", meaning: "Marked do not knock, told us no recently, or already a Miller Storm job." },
];

/** The plain-words panel behind "How the colors work" (spec A3). No em dashes. */
export const HOW_COLORS_WORK: string[] = [
  "Every house starts at zero points. Hail in the last 12 months adds the most: 1.75 inch or bigger adds 40, 1.25 inch adds 30, 1 inch adds 20. Only the biggest storm counts, not a total.",
  "A house built more than 20 years ago adds 20 points; 12 to 20 years adds 10. If we do not know the age it gets 10.",
  "An owner who lives in the house adds 10. An owner who lives somewhere else takes 5 away. A house marked as a renter takes 10 away.",
  "A rep who saw visible damage adds 15. A neighbour who signed with us in the last 90 days adds 5. A house that told us no in the last 60 days loses 25.",
  "60 points or more is green, 40 is yellow, 20 is orange, below that is red. Do Not Knock, an open Miller Storm job, and a finished roof less than 5 years old make a house red whatever its points.",
  "Hail sizes are radar estimates, not measurements. Treat the colour as a starting point, not a promise.",
];
