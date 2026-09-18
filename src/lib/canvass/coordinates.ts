// src/lib/canvass/coordinates.ts
// Which coordinate system a county parcel file uses, and conversion to the
// longitude/latitude the database and the map need.
//
// Each TxGIO county shapefile names its system in the .prj beside the .shp.
// 40 of our 41 counties are longitude/latitude; Martin County's 2025 file is Web
// Mercator (the web-map projection, in meters). Anything else is refused rather
// than guessed.
//
// Pure: no DB, no files.

import type { PolygonGeometry, Position } from "./geometry";

export type CoordinateSystem = "lon-lat" | "web-mercator" | "unknown";

const EARTH_RADIUS_METERS = 6378137; // the sphere Web Mercator is drawn on
const DEGREES_PER_RADIAN = 180 / Math.PI;

// The same box the hail import uses to crop radar data to Texas.
const TEXAS_BOX = { south: 25.8, north: 36.6, west: -106.7, east: -93.5 };

/** Reads the head of a .prj file: geographic means longitude/latitude; Web Mercator is recognized by name. */
export function coordinateSystemOf(prj: string): CoordinateSystem {
  const text = prj.replace(/^﻿/, "").trim();
  if (/^PROJCS\[/i.test(text)) {
    return /web_mercator|pseudo-mercator|mercator_auxiliary_sphere/i.test(text) ? "web-mercator" : "unknown";
  }
  return /^GEOGCS\[/i.test(text) ? "lon-lat" : "unknown";
}

export function webMercatorToLonLat([x, y]: Position): Position {
  return [
    (x / EARTH_RADIUS_METERS) * DEGREES_PER_RADIAN,
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * DEGREES_PER_RADIAN,
  ];
}

/** The outline in longitude/latitude. Longitude/latitude input comes back as is. */
export function geometryToLonLat(geometry: PolygonGeometry, system: CoordinateSystem): PolygonGeometry {
  if (system === "lon-lat") return geometry;
  if (system !== "web-mercator") throw new Error("Cannot convert an unknown coordinate system");
  const ring = (points: Position[]) => points.map(webMercatorToLonLat);
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: geometry.coordinates.map(ring) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map((polygon) => polygon.map(ring)) };
}

/** A rough box around Texas, good for catching points that are plainly in the wrong place. */
export function isInsideTexasBox([lon, lat]: Position): boolean {
  return lat >= TEXAS_BOX.south && lat <= TEXAS_BOX.north && lon >= TEXAS_BOX.west && lon <= TEXAS_BOX.east;
}
