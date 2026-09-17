// src/lib/canvass/query.test.ts
import { describe, it, expect } from "vitest";
import {
  CLUSTER_CELLS,
  COLORS,
  HOMES_LIMIT,
  MAX_BBOX_DEGREES,
  clusterCellSize,
  clustersPipeline,
  homesFilter,
  isValidDay,
  parseHomesQuery,
  toClusters,
  toMapHomes,
  type HomeRow,
  HAIL_CELLS_LIMIT,
  hailCellsFilter,
  parseHailQuery,
  toMapHailCells,
} from "./query";
import type { Color } from "./grade";

// A Fort Worth neighbourhood, about 3 km across.
const FW = "-97.45,32.72,-97.42,32.75";

describe("parseHomesQuery", () => {
  it("accepts a neighbourhood view with no filters and shows every colour", () => {
    const parsed = parseHomesQuery({ bbox: FW });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.bbox).toEqual({ west: -97.45, south: 32.72, east: -97.42, north: 32.75 });
    expect(parsed.query.colors).toEqual([...COLORS]);
    expect(parsed.query.hideKnockedDays).toBeNull();
    expect(parsed.query.hailSince).toBeNull();
    expect(parsed.query.ownerOnly).toBe(false);
  });

  it("reads every filter", () => {
    const parsed = parseHomesQuery({ bbox: FW, colors: "yellow,green", hideKnockedDays: "30", hailSince: "2026-05-01", ownerOnly: "1" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.colors).toEqual(["green", "yellow"]); // canonical order
    expect(parsed.query.hideKnockedDays).toBe(30);
    expect(parsed.query.hailSince).toBe("2026-05-01");
    expect(parsed.query.ownerOnly).toBe(true);
  });

  it("takes the first value when a query key is repeated, as Next.js hands them over", () => {
    const parsed = parseHomesQuery({ bbox: [FW, "0,0,1,1"], colors: ["red"] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.bbox.west).toBe(-97.45);
    expect(parsed.query.colors).toEqual(["red"]);
  });

  it("refuses a missing, short or non-numeric bbox", () => {
    for (const bbox of [undefined, "", "-97.45,32.72,-97.42", "a,b,c,d", "-97.45,32.72,-97.42,north"]) {
      const parsed = parseHomesQuery({ bbox });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toContain("bbox");
    }
  });

  it("refuses a bbox that is inside out or off the world", () => {
    expect(parseHomesQuery({ bbox: "-97.42,32.72,-97.45,32.75" }).ok).toBe(false); // west > east
    expect(parseHomesQuery({ bbox: "-97.45,32.75,-97.42,32.72" }).ok).toBe(false); // south > north
    expect(parseHomesQuery({ bbox: "-197,32.72,-97.42,32.75" }).ok).toBe(false);
    expect(parseHomesQuery({ bbox: "-97.45,32.72,-97.42,95" }).ok).toBe(false);
  });

  it("refuses a bbox wider than a city, so one request can never ask for all of Texas", () => {
    const parsed = parseHomesQuery({ bbox: "-99,31,-97,33" }); // 2 degrees each way
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(String(MAX_BBOX_DEGREES));
    expect(parseHomesQuery({ bbox: "-98,32,-97,33" }).ok).toBe(true); // exactly the limit is fine
  });

  it("refuses a colour it does not know, and an empty colour list", () => {
    const unknown = parseHomesQuery({ bbox: FW, colors: "green,blue" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain("blue");
    expect(parseHomesQuery({ bbox: FW, colors: " , " }).ok).toBe(false);
  });

  it("refuses a hideKnockedDays that is not a sensible whole number", () => {
    for (const days of ["-1", "1.5", "abc", "99999"]) {
      expect(parseHomesQuery({ bbox: FW, hideKnockedDays: days }).ok).toBe(false);
    }
    const zero = parseHomesQuery({ bbox: FW, hideKnockedDays: "0" });
    expect(zero.ok && zero.query.hideKnockedDays).toBe(0);
  });

  it("refuses a hailSince that is not a real day", () => {
    for (const day of ["2026-13-01", "2026-02-30", "May 1 2026", "2026-5-1"]) {
      expect(parseHomesQuery({ bbox: FW, hailSince: day }).ok).toBe(false);
    }
  });

  it("reads ownerOnly as a yes only for 1, true or yes", () => {
    for (const [value, expected] of [
      ["1", true],
      ["true", true],
      ["YES", true],
      ["0", false],
      ["false", false],
      ["", false],
    ] as const) {
      const parsed = parseHomesQuery({ bbox: FW, ownerOnly: value });
      expect(parsed.ok && parsed.query.ownerOnly).toBe(expected);
    }
  });
});

describe("isValidDay", () => {
  it("knows a real day from a badly shaped or impossible one", () => {
    expect(isValidDay("2026-05-01")).toBe(true);
    expect(isValidDay("2024-02-29")).toBe(true); // leap day
    expect(isValidDay("2026-02-29")).toBe(false);
    expect(isValidDay("2026-00-10")).toBe(false);
    expect(isValidDay("26-05-01")).toBe(false);
  });
});

describe("homesFilter", () => {
  const query = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });
  const base = () => {
    const parsed = parseHomesQuery({ bbox: FW });
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.query;
  };

  it("draws only graded houses inside the view", () => {
    const filter = homesFilter(query());
    expect(filter.location).toEqual({
      $geoWithin: {
        $box: [
          [-97.45, 32.72],
          [-97.42, 32.75],
        ],
      },
    });
    expect(filter["grade.color"]).toEqual({ $in: ["green", "yellow", "orange", "red"] });
    expect(filter.hail).toBeUndefined();
    expect(filter.ownerLivesHere).toBeUndefined();
  });

  it("narrows to the colours asked for", () => {
    expect(homesFilter(query({ colors: ["green"] }))["grade.color"]).toEqual({ $in: ["green"] });
  });

  it("asks for hail of 1 in or more since the day, the grade's smallest band, not any drizzle of small hail", () => {
    expect(homesFilter(query({ hailSince: "2026-05-01" })).hail).toEqual({ $elemMatch: { date: { $gte: "2026-05-01" }, inches: { $gte: 1 } } });
  });

  it("asks for owner-occupied houses only when told to", () => {
    expect(homesFilter(query({ ownerOnly: true })).ownerLivesHere).toBe(true);
  });
});

describe("toMapHomes", () => {
  const TODAY = "2026-09-17";
  const row = (id: string, color: Color | null, lng = -97.43, lat = 32.73): HomeRow => ({
    _id: id,
    location: { coordinates: [lng, lat] },
    grade: { color },
  });

  it("turns rows into dots and marks the ones we have knocked", () => {
    const knocks = new Map([["b", "2026-06-01"]]);
    expect(toMapHomes([row("a", "green"), row("b", "red")], knocks, TODAY, null)).toEqual([
      { id: "a", lat: 32.73, lng: -97.43, color: "green", knocked: false },
      { id: "b", lat: 32.73, lng: -97.43, color: "red", knocked: true },
    ]);
  });

  it("hides a house knocked within the asked days, keeps one knocked earlier, and keeps unknocked houses", () => {
    const knocks = new Map([
      ["recent", "2026-09-01"], // 16 days ago
      ["old", "2026-07-01"], // 78 days ago
    ]);
    const shown = toMapHomes([row("recent", "green"), row("old", "green"), row("never", "green")], knocks, TODAY, 30).map((home) => home.id);
    expect(shown).toEqual(["old", "never"]);
  });

  it("hideKnockedDays 0 hides only houses knocked today", () => {
    const knocks = new Map([
      ["today", "2026-09-17"],
      ["yesterday", "2026-09-16"],
    ]);
    const shown = toMapHomes([row("today", "green"), row("yesterday", "green")], knocks, TODAY, 0).map((home) => home.id);
    expect(shown).toEqual(["yesterday"]);
  });

  it("leaves out a house with no colour yet", () => {
    expect(toMapHomes([row("x", null)], new Map(), TODAY, null)).toEqual([]);
  });

  it("carries nothing that names a person", () => {
    const dots = toMapHomes([row("a", "green")], new Map(), TODAY, null);
    expect(Object.keys(dots[0]).sort()).toEqual(["color", "id", "knocked", "lat", "lng"]);
  });
});

describe("clusters", () => {
  const view = parseHomesQuery({ bbox: "-97.5,32.7,-97.3,32.8" }); // 0.2 wide, 0.1 tall
  if (!view.ok) throw new Error(view.error);
  const { query } = view;

  it("uses square cells sized from the longer side of the view", () => {
    expect(clusterCellSize(query.bbox)).toBeCloseTo(0.2 / CLUSTER_CELLS, 10);
  });

  it("counts inside the same filter the dots use, so clusters and dots never disagree", () => {
    const [match] = clustersPipeline(query);
    expect(match).toEqual({ $match: homesFilter(query) });
  });

  it("groups by grid cell and counts the green houses in each", () => {
    const pipeline = clustersPipeline(query);
    expect(pipeline).toHaveLength(3);
    expect(pipeline[2]).toEqual({ $group: { _id: { col: "$col", row: "$row" }, count: { $sum: 1 }, green: { $sum: "$green" } } });
  });

  it("places each cluster at its cell's centre, biggest first, and drops empty cells", () => {
    const size = clusterCellSize(query.bbox);
    const clusters = toClusters(
      [
        { _id: { col: 0, row: 0 }, count: 5, green: 2 },
        { _id: { col: 3, row: 1 }, count: 40, green: 30 },
        { _id: { col: 9, row: 9 }, count: 0, green: 0 },
      ],
      query.bbox
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toEqual({ lng: -97.5 + 3.5 * size, lat: 32.7 + 1.5 * size, count: 40, green: 30 });
    expect(clusters[1].count).toBe(5);
  });

  it("the cap is 3,000 houses, as the spec promises the phone", () => {
    expect(HOMES_LIMIT).toBe(3000);
  });
});

describe("the hail layer request", () => {
  it("needs the same checked view as the dots, plus a real first day", () => {
    const parsed = parseHailQuery({ bbox: FW, since: "2026-05-01" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.bbox.north).toBe(32.75);
    expect(parsed.query.since).toBe("2026-05-01");
  });

  it("refuses a bad view, a missing day and a made-up day", () => {
    expect(parseHailQuery({ bbox: "-99,31,-97,33", since: "2026-05-01" }).ok).toBe(false);
    expect(parseHailQuery({ bbox: FW }).ok).toBe(false);
    expect(parseHailQuery({ bbox: FW, since: "2026-02-30" }).ok).toBe(false);
  });

  it("asks for squares of 1 in or more inside the view since the day", () => {
    const parsed = parseHailQuery({ bbox: FW, since: "2026-05-01" });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(hailCellsFilter(parsed.query)).toEqual({
      location: { $geoWithin: { $box: [[-97.45, 32.72], [-97.42, 32.75]] } },
      stormDate: { $gte: "2026-05-01" },
      inches: { $gte: 1 },
    });
  });

  it("turns rows into squares with a day, a position and a size, and nothing else", () => {
    const cells = toMapHailCells([{ stormDate: "2026-05-04", location: { coordinates: [-97.43, 32.73] }, inches: 1.75 }]);
    expect(cells).toEqual([{ date: "2026-05-04", lat: 32.73, lng: -97.43, inches: 1.75 }]);
    expect(HAIL_CELLS_LIMIT).toBeGreaterThan(0);
  });
});
