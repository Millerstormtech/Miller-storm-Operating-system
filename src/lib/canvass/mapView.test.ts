// src/lib/canvass/mapView.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_FILTERS,
  DOT_RGB,
  HOW_COLORS_WORK,
  LEGEND,
  MAP_STYLE_URL,
  boundsToBbox,
  canRequestHouses,
  clusterRadiusMeters,
  clusterRgba,
  hailRgba,
  hailSquare,
  hailUrl,
  homesUrl,
} from "./mapView";
import { parseHomesQuery, parseHailQuery } from "./query";
import { GRADE } from "./config";

describe("the map view", () => {
  it("uses the free OpenFreeMap street style, not Google", () => {
    expect(MAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(MAP_STYLE_URL).not.toMatch(/google|mapbox\.com|maptiler/i);
  });

  it("turns map corners into the request's view, rounded to five decimals", () => {
    const bbox = boundsToBbox({ lng: -97.4512345678, lat: 32.7212345678 }, { lng: -97.42, lat: 32.75 });
    expect(bbox).toEqual({ west: -97.45123, south: 32.72123, east: -97.42, north: 32.75 });
  });

  it("only asks for houses when the view is within what the server allows", () => {
    expect(canRequestHouses({ west: -97.45, south: 32.72, east: -97.42, north: 32.75 })).toBe(true);
    expect(canRequestHouses({ west: -98, south: 32, east: -97, north: 33 })).toBe(true); // exactly the limit
    expect(canRequestHouses({ west: -99, south: 31, east: -97, north: 33 })).toBe(false);
  });
});

describe("requests the screen makes", () => {
  const bbox = { west: -97.45, south: 32.72, east: -97.42, north: 32.75 };

  it("builds a houses request the API accepts, with only the filters that are set", () => {
    expect(homesUrl(bbox, DEFAULT_FILTERS)).toBe("/api/canvass/homes?bbox=-97.45%2C32.72%2C-97.42%2C32.75");
    const url = homesUrl(bbox, { ...DEFAULT_FILTERS, colors: ["green", "yellow"], hideKnockedDays: 30, hailSince: "2026-05-01", ownerOnly: true });
    const query = Object.fromEntries(new URL(url, "http://x").searchParams);
    expect(query).toEqual({ bbox: "-97.45,32.72,-97.42,32.75", colors: "green,yellow", hideKnockedDays: "30", hailSince: "2026-05-01", ownerOnly: "1" });
    const parsed = parseHomesQuery(query);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.query.colors).toEqual(["green", "yellow"]);
  });

  it("builds a hail request the API accepts", () => {
    const query = Object.fromEntries(new URL(hailUrl(bbox, "2025-09-17"), "http://x").searchParams);
    expect(parseHailQuery(query).ok).toBe(true);
  });
});

describe("colours", () => {
  it("has a distinct colour for each of the four grades, with brand red for red", () => {
    expect(new Set(Object.values(DOT_RGB).map(String)).size).toBe(4);
    expect(DOT_RGB.red).toEqual([203, 0, 2]); // #CB0002
  });

  it("shades hail by the grade's own bands, deeper for bigger hail", () => {
    const [small, mid, big] = [hailRgba(1), hailRgba(1.25), hailRgba(1.75)];
    expect(hailRgba(1.5)).toEqual(mid);
    expect(hailRgba(3)).toEqual(big);
    expect(big[2]).toBeLessThan(small[2]); // less light in the blue channel, so darker
    // The bands are the grade's bands, so a change to one shows up here.
    expect(GRADE.hailBands.map((band) => band.minInches)).toEqual([1.75, 1.25, 1]);
  });

  it("draws a hail square exactly one radar cell wide, closed, around its centre", () => {
    const ring = hailSquare({ lng: -97.445, lat: 32.745 });
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[0]).toEqual([-97.45, 32.74]);
    expect(ring[2]).toEqual([-97.44, 32.75]);
  });

  it("colours a cluster grey with no green houses and green when all are green", () => {
    expect(clusterRgba(100, 0).slice(0, 3)).toEqual([148, 163, 184]);
    expect(clusterRgba(100, 100).slice(0, 3)).toEqual([22, 163, 74]);
    expect(clusterRgba(0, 0)[3]).toBe(120);
  });

  it("sizes a cluster by its house count but never wider than about half its cell", () => {
    expect(clusterRadiusMeters(1, 0.01)).toBe(60); // the floor
    expect(clusterRadiusMeters(100, 0.05)).toBe(250); // sqrt(100) * 25
    expect(clusterRadiusMeters(1_000_000, 0.05)).toBe(0.05 * 111_000 / 2); // capped
  });
});

describe("the words a rep sees", () => {
  it("leads with green as the promise and yellow as worth a look", () => {
    expect(LEGEND[0]).toMatchObject({ color: "green", label: "Knock this" });
    expect(LEGEND[1]).toMatchObject({ color: "yellow", label: "Worth a look" });
    expect(LEGEND.map((row) => row.color)).toEqual(["green", "yellow", "orange", "red"]);
  });

  it("contains no em dashes anywhere (house rule for on-screen text)", () => {
    const text = [...LEGEND.flatMap((row) => [row.label, row.meaning]), ...HOW_COLORS_WORK].join(" ");
    expect(text).not.toContain("—");
  });

  it("describes the same points the grade actually uses", () => {
    const text = HOW_COLORS_WORK.join(" ");
    for (const band of GRADE.hailBands) expect(text).toContain(`adds ${band.points}`);
    expect(text).toContain(`${GRADE.colors.green} points or more is green`);
    expect(text).toContain(`${GRADE.closedJobBlocksYears} years old`);
  });
});
