import { describe, it, expect } from "vitest";
import { sumTotals, scopeRows, rankFor } from "./rollup";
import type { SalesRow } from "./types";

const row = (over: Partial<SalesRow>): SalesRow => ({
  repUserId: null, name: "X", team: null, branch: "",
  revenue: 0, knocks: 0, claims: 0, contracts: 0, active: true, ...over,
});

const rows: SalesRow[] = [
  row({ repUserId: "u1", name: "A", team: "Gunner", branch: "Fort Worth", revenue: 100, knocks: 50, claims: 4, contracts: 1 }),
  row({ repUserId: "u2", name: "B", team: "Gunner", branch: "Fort Worth", revenue: 200, knocks: 30, claims: 3, contracts: 2 }),
  row({ repUserId: "u3", name: "C", team: "Cooper", branch: "Dallas",     revenue: 300, knocks: 20, claims: 2, contracts: 1 }),
];

describe("sumTotals", () => {
  it("adds each metric across rows", () => {
    expect(sumTotals(rows)).toEqual({ revenue: 600, knocks: 100, claims: 9, contracts: 4 });
  });
  it("returns zeros for an empty roster (honest empty state)", () => {
    expect(sumTotals([])).toEqual({ revenue: 0, knocks: 0, claims: 0, contracts: 0 });
  });
  it("keeps departed reps' dollars in the totals (active:false still counts)", () => {
    const withFormer = [...rows, row({ repUserId: "gone", revenue: 500, knocks: 10, claims: 1, contracts: 1, active: false })];
    expect(sumTotals(withFormer)).toEqual({ revenue: 1100, knocks: 110, claims: 10, contracts: 5 });
  });
});

describe("scopeRows", () => {
  it("self -> only the viewer's own row (matched by repUserId)", () => {
    expect(scopeRows(rows, { level: "self", userId: "u2" }).map(r => r.name)).toEqual(["B"]);
  });
  it("self -> empty when the viewer has no row (brand-new rep)", () => {
    expect(scopeRows(rows, { level: "self", userId: "nope" })).toEqual([]);
  });
  it("team -> every row on that team", () => {
    expect(scopeRows(rows, { level: "team", team: "Gunner" }).map(r => r.name)).toEqual(["A", "B"]);
  });
  it("branch -> every row in that branch", () => {
    expect(scopeRows(rows, { level: "branch", branch: "Dallas" }).map(r => r.name)).toEqual(["C"]);
  });
  it("company -> all rows", () => {
    expect(scopeRows(rows, { level: "company" }).length).toBe(3);
  });
});

describe("rankFor", () => {
  // Using the same `rows` fixture: revenue A=100, B=200, C=300.
  it("self -> position among individuals by revenue (highest = #1)", () => {
    expect(rankFor(rows, { level: "self", userId: "u3" })).toEqual({ rank: 1, of: 3 }); // C=300
    expect(rankFor(rows, { level: "self", userId: "u1" })).toEqual({ rank: 3, of: 3 }); // A=100
  });
  it("self -> null when the viewer has no row", () => {
    expect(rankFor(rows, { level: "self", userId: "nope" })).toBeNull();
  });
  it("team -> position among teams by summed revenue", () => {
    // Gunner = 300 (A+B), Cooper = 300 (C). Tie broken by team name asc -> Cooper #1, Gunner #2.
    expect(rankFor(rows, { level: "team", team: "Gunner" })).toEqual({ rank: 2, of: 2 });
    expect(rankFor(rows, { level: "team", team: "Cooper" })).toEqual({ rank: 1, of: 2 });
  });
  it("branch -> position among branches by summed revenue", () => {
    // Fort Worth = 300, Dallas = 300. Tie -> name asc: Dallas #1, Fort Worth #2.
    expect(rankFor(rows, { level: "branch", branch: "Fort Worth" })).toEqual({ rank: 2, of: 2 });
  });
  it("company -> null", () => {
    expect(rankFor(rows, { level: "company" })).toBeNull();
  });
  it("self -> departed reps are excluded from the pool and the count", () => {
    const withFormer = [
      ...rows, // A=100, B=200, C=300 (all active)
      row({ repUserId: "ex", name: "Ex", revenue: 999, active: false }), // would be #1 if counted
    ];
    // C (300) is still the top ACTIVE rep; the departed 999 is ignored, and of=3 (not 4).
    expect(rankFor(withFormer, { level: "self", userId: "u3" })).toEqual({ rank: 1, of: 3 });
    // The departed rep themself gets no rank.
    expect(rankFor(withFormer, { level: "self", userId: "ex" })).toBeNull();
  });
  it("self -> sums a rep's rows when they appear more than once", () => {
    const dup = [
      row({ repUserId: "u1", name: "A", revenue: 100 }),
      row({ repUserId: "u1", name: "A again", revenue: 250 }), // same rep, second row
      row({ repUserId: "u2", name: "B", revenue: 300 }),
    ];
    // u1 totals 350 > u2's 300, so u1 ranks #1 among the 2 distinct reps.
    expect(rankFor(dup, { level: "self", userId: "u1" })).toEqual({ rank: 1, of: 2 });
  });
  it("team -> a departed member's revenue still counts toward the team's rank (dollars kept)", () => {
    const withFormer = [
      ...rows,
      row({ repUserId: "ex", team: "Gunner", branch: "Fort Worth", revenue: 500, active: false }),
    ];
    // Gunner = 100 + 200 + 500 = 800 (incl. departed) vs Cooper = 300 -> Gunner #1.
    expect(rankFor(withFormer, { level: "team", team: "Gunner" })).toEqual({ rank: 1, of: 2 });
  });
});
