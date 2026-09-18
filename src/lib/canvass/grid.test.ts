// src/lib/canvass/grid.test.ts
import { describe, it, expect } from "vitest";
import { GRID_DEGREES, cellCentre, cellIndex, clustersFromGrid, gridCellsFilter, gridPipeline, type GridCell } from "./grid";
import { CLUSTER_CELLS, clusterCellSize, clustersPipeline, parseHomesQuery } from "./query";

describe("the squares", () => {
  it("are 0.01 degree across, the radar's hail square size", () => {
    expect(GRID_DEGREES).toBe(0.01);
  });

  it("puts a Fort Worth house in the square its coordinates fall in, and finds that square's centre", () => {
    // lng -97.32841 / 0.01 = -9732.841 -> floor -9733; lat 32.74274 / 0.01 = 3274.274 -> floor 3274
    expect(cellIndex(-97.32841)).toBe(-9733);
    expect(cellIndex(32.74274)).toBe(3274);
    const centre = cellCentre(-9733, 3274);
    expect(centre.lng).toBeCloseTo(-97.325, 6);
    expect(centre.lat).toBeCloseTo(32.745, 6);
  });

  it("does not let floating-point crumbs push a coordinate on a boundary into the wrong square", () => {
    // 32.75 / 0.01 is 3274.9999999999995 in floating point; the house is in square 3275.
    expect(cellIndex(32.75)).toBe(3275);
    expect(cellIndex(-97.33)).toBe(-9733);
  });
});

describe("gridPipeline", () => {
  it("counts only graded houses, by square, with a total and one figure per colour", () => {
    const [match, project, group] = gridPipeline();
    expect(match).toEqual({ $match: { "grade.color": { $in: ["green", "yellow", "orange", "red"] } } });
    expect(Object.keys((project as { $project: Record<string, unknown> }).$project).sort()).toEqual(["col", "green", "orange", "red", "row", "yellow"]);
    expect(group).toEqual({
      $group: {
        _id: { col: "$col", row: "$row" },
        count: { $sum: 1 },
        green: { $sum: "$green" },
        yellow: { $sum: "$yellow" },
        orange: { $sum: "$orange" },
        red: { $sum: "$red" },
      },
    });
  });
});

describe("gridCellsFilter", () => {
  it("asks for the squares whose indices cover the view, inclusive at both ends", () => {
    expect(gridCellsFilter({ west: -97.45, south: 32.72, east: -97.42, north: 32.75 })).toEqual({
      col: { $gte: -9745, $lte: -9742 },
      row: { $gte: 3272, $lte: 3275 },
    });
  });
});

describe("clustersFromGrid", () => {
  // A view 0.24 degree wide: with 24 clusters across, each view cell is 0.01 degree, one square.
  const bbox = { west: -97.5, south: 32.6, east: -97.26, north: 32.7 };
  const cell = (col: number, row: number, green = 0, yellow = 0, orange = 0, red = 0): GridCell => ({ col, row, count: green + yellow + orange + red, green, yellow, orange, red });

  it("turns squares into clusters at the right place, with the count and the green count", () => {
    const clusters = clustersFromGrid([cell(-9750, 3260, 7, 2, 1, 0)], bbox, ["green", "yellow", "orange", "red"]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(10);
    expect(clusters[0].green).toBe(7);
    // The square at col -9750, row 3260 is the view's first cell: its centre is half a cell in.
    const size = clusterCellSize(bbox, CLUSTER_CELLS);
    expect(clusters[0].lng).toBeCloseTo(bbox.west + 0.5 * size, 6);
    expect(clusters[0].lat).toBeCloseTo(bbox.south + 0.5 * size, 6);
  });

  it("counts only the colours the rep asked to see", () => {
    const only = clustersFromGrid([cell(-9750, 3260, 7, 2, 1, 5)], bbox, ["yellow", "red"]);
    expect(only[0].count).toBe(7);
    expect(only[0].green).toBe(0); // green was not asked for, so it does not tint the cluster
    expect(clustersFromGrid([cell(-9750, 3260, 0, 2, 0, 0)], bbox, ["green"])).toEqual([]); // nothing wanted here
  });

  it("sums several squares that land in one cluster when the view is wide", () => {
    const wide = { west: -98, south: 32, east: -97, north: 33 }; // 1 degree: each cluster cell is 4.17 squares across
    const clusters = clustersFromGrid([cell(-9800, 3200, 1), cell(-9799, 3200, 2), cell(-9798, 3201, 3)], wide, ["green", "yellow", "orange", "red"]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(6);
  });

  it("leaves out a square whose centre lies outside the view, and orders clusters biggest first", () => {
    const clusters = clustersFromGrid([cell(-9751, 3260, 1), cell(-9750, 3260, 1), cell(-9749, 3260, 9)], bbox, ["green", "yellow", "orange", "red"]);
    expect(clusters.map((c) => c.count)).toEqual([9, 1]); // -9751's centre is west of the view
  });

  it("agrees with the live count on where the squares go: the same view grid the slow path uses", () => {
    // The slow path is clustersPipeline over houses; both place a point by the same cell size.
    const parsed = parseHomesQuery({ bbox: "-97.5,32.6,-97.26,32.7" });
    if (!parsed.ok) throw new Error(parsed.error);
    const project = clustersPipeline(parsed.query)[1] as { $project: { col: { $floor: { $divide: unknown[] } } } };
    expect(project.$project.col.$floor.$divide[1]).toBeCloseTo(clusterCellSize(bbox, CLUSTER_CELLS), 12);
  });
});
