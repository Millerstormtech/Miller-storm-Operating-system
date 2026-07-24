import { describe, it, expect } from "vitest";
import { sumTotals, scopeRows } from "./rollup";
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
