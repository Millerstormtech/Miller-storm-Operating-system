// src/lib/canvass/coordinates.test.ts
import { describe, it, expect } from "vitest";
import { coordinateSystemOf, geometryToLonLat, isInsideTexasBox, webMercatorToLonLat } from "./coordinates";

// Shaped like the .prj files in the TxGIO 2025 county downloads (checked 15 Sep 2026:
// 40 counties in longitude/latitude, Martin County in Web Mercator).
const LON_LAT_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const WEB_MERCATOR_PRJ =
  'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Mercator_Auxiliary_Sphere"],UNIT["Meter",1.0]]';
const STATE_PLANE_PRJ =
  'PROJCS["NAD_1983_StatePlane_Texas_North_Central_FIPS_4202_Feet",GEOGCS["GCS_North_American_1983"],PROJECTION["Lambert_Conformal_Conic"],UNIT["Foot_US",0.3048006096012192]]';

const R = 6378137;
const toWebMercator = (lon: number, lat: number): [number, number] => [
  (lon * Math.PI * R) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

describe("coordinateSystemOf", () => {
  it("reads a geographic .prj as longitude/latitude", () => {
    expect(coordinateSystemOf(LON_LAT_PRJ)).toBe("lon-lat");
    expect(coordinateSystemOf('GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983"]]')).toBe("lon-lat");
  });

  it("recognizes Web Mercator under its common names", () => {
    expect(coordinateSystemOf(WEB_MERCATOR_PRJ)).toBe("web-mercator");
    expect(coordinateSystemOf('PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84"]]')).toBe("web-mercator");
  });

  it("calls any other projection unknown", () => {
    expect(coordinateSystemOf(STATE_PLANE_PRJ)).toBe("unknown");
    expect(coordinateSystemOf("")).toBe("unknown");
  });

  it("ignores a byte-order mark and surrounding spaces", () => {
    expect(coordinateSystemOf(`﻿  ${LON_LAT_PRJ}\n`)).toBe("lon-lat");
  });
});

describe("webMercatorToLonLat", () => {
  it("keeps the origin at 0,0", () => {
    const [lon, lat] = webMercatorToLonLat([0, 0]);
    expect(lon).toBeCloseTo(0, 9);
    expect(lat).toBeCloseTo(0, 9);
  });

  it("puts the edge of the Web Mercator world at longitude 180", () => {
    expect(webMercatorToLonLat([20037508.342789244, 0])[0]).toBeCloseTo(180, 9);
  });

  it("undoes the Web Mercator formula for a Fort Worth point", () => {
    const [lon, lat] = webMercatorToLonLat(toWebMercator(-97.3308, 32.7555));
    expect(lon).toBeCloseTo(-97.3308, 9);
    expect(lat).toBeCloseTo(32.7555, 9);
  });

  it("places the point from the failed Martin County import inside Martin County", () => {
    const [lon, lat] = webMercatorToLonLat([-11359266.80960507, 3775059.664048937]);
    expect(lon).toBeGreaterThan(-102.3);
    expect(lon).toBeLessThan(-101.6);
    expect(lat).toBeGreaterThan(32.0);
    expect(lat).toBeLessThan(32.6);
  });
});

describe("geometryToLonLat", () => {
  const square = (lon: number, lat: number) => [
    toWebMercator(lon, lat),
    toWebMercator(lon + 0.001, lat),
    toWebMercator(lon + 0.001, lat + 0.001),
    toWebMercator(lon, lat),
  ];

  it("converts every corner of a Polygon from Web Mercator", () => {
    const converted = geometryToLonLat({ type: "Polygon", coordinates: [square(-102, 32.1)] }, "web-mercator");
    expect(converted.type).toBe("Polygon");
    const ring = (converted.coordinates as [number, number][][])[0];
    expect(ring[2][0]).toBeCloseTo(-101.999, 9);
    expect(ring[2][1]).toBeCloseTo(32.101, 9);
  });

  it("converts every corner of every piece of a MultiPolygon", () => {
    const converted = geometryToLonLat({ type: "MultiPolygon", coordinates: [[square(-102, 32.1)], [square(-101.9, 32.2)]] }, "web-mercator");
    const pieces = converted.coordinates as [number, number][][][];
    expect(pieces[1][0][0][0]).toBeCloseTo(-101.9, 9);
    expect(pieces[1][0][0][1]).toBeCloseTo(32.2, 9);
  });

  it("returns longitude/latitude geometry unchanged", () => {
    const geometry = { type: "Polygon" as const, coordinates: [[[-97.33, 32.75], [-97.32, 32.75], [-97.33, 32.75]] as [number, number][]] };
    expect(geometryToLonLat(geometry, "lon-lat")).toEqual(geometry);
  });

  it("refuses an unknown coordinate system", () => {
    expect(() => geometryToLonLat({ type: "Polygon", coordinates: [] }, "unknown")).toThrow(/coordinate system/);
  });
});

describe("isInsideTexasBox", () => {
  it("accepts points across our branch areas", () => {
    expect(isInsideTexasBox([-97.33, 32.75])).toBe(true); // Fort Worth
    expect(isInsideTexasBox([-101.85, 33.58])).toBe(true); // Lubbock
    expect(isInsideTexasBox([-97.4, 27.8])).toBe(true); // Corpus Christi
    expect(isInsideTexasBox([-97.5, 25.9])).toBe(true); // Brownsville
  });

  it("rejects Web Mercator meters and 0,0", () => {
    expect(isInsideTexasBox([-11359266.8, 3775059.66])).toBe(false);
    expect(isInsideTexasBox([0, 0])).toBe(false);
  });
});
