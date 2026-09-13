import { describe, it, expect } from "vitest";
import {
  salesLink,
  trainingLink,
  scopeFilter,
  monthRange,
  parseSalesLink,
  METRIC_SORT,
} from "./links";

const params = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams);
const path = (href: string) => new URL(href, "http://x").pathname;

describe("salesLink", () => {
  it("opens each role's own copy of the Sales Leaderboard", () => {
    const opts = { period: { window: "month" as const }, sort: "revenue" as const };
    expect(path(salesLink("company", opts))).toBe("/c-level/sales-leaderboard");
    expect(path(salesLink("branch", opts))).toBe("/branch-manager/sales-leaderboard");
    expect(path(salesLink("team", opts))).toBe("/manager/rankings");
    expect(path(salesLink("self", opts))).toBe("/sales/rankings");
  });

  it("carries the period, sort and filter, and focuses the viewer by default", () => {
    const href = salesLink("branch", {
      period: { window: "year" },
      sort: METRIC_SORT.claims,
      filter: { branch: "Fort Worth" },
    });
    expect(params(href)).toEqual({
      window: "year",
      sort: "filed",
      dir: "desc",
      branch: "Fort Worth",
      focus: "me",
    });
  });

  it("uses from/to instead of a window for a custom range", () => {
    const p = params(
      salesLink("team", {
        period: { from: "2026-09-05", to: "2026-09-11" },
        sort: "verifiedKnocks",
        dir: "asc",
        filter: { team: "Gunner" },
        focus: "rc:123",
      })
    );
    expect(p.window).toBeUndefined();
    expect(p).toMatchObject({ from: "2026-09-05", to: "2026-09-11", dir: "asc", team: "Gunner", focus: "rc:123" });
  });

  it("maps every dashboard metric to a leaderboard column", () => {
    expect(METRIC_SORT).toEqual({ revenue: "revenue", contracts: "won", claims: "filed", knocks: "verifiedKnocks" });
  });
});

describe("scopeFilter", () => {
  it("narrows a branch manager to their branch and a team lead to their team", () => {
    expect(scopeFilter({ level: "branch", branch: "Dallas" })).toEqual({ branch: "Dallas" });
    expect(scopeFilter({ level: "team", team: "Luke" })).toEqual({ team: "Luke" });
  });

  it("never filters the company or a rep", () => {
    expect(scopeFilter({ level: "company", branch: "Dallas" })).toEqual({});
    expect(scopeFilter({ level: "self", team: "Luke" })).toEqual({});
  });

  it("applies no filter when the scope could not be resolved", () => {
    expect(scopeFilter({ level: "branch", branch: null })).toEqual({});
    expect(scopeFilter({ level: "team", team: "" })).toEqual({});
  });
});

describe("trainingLink", () => {
  it("sends a rep to the Training Center, not the Course Leaderboard", () => {
    expect(trainingLink({ level: "self" })).toBe("/sales/training");
  });

  it("filters the Course Leaderboard to the viewer's scope", () => {
    expect(trainingLink({ level: "company" })).toBe("/c-level/course-leaderboard");
    expect(params(trainingLink({ level: "branch", branch: "West Texas" }))).toEqual({ branch: "West Texas" });
    expect(path(trainingLink({ level: "team", team: "Cooper" }))).toBe("/manager/course-leaderboard");
    expect(params(trainingLink({ level: "team", team: "Cooper" }))).toEqual({ team: "Cooper" });
  });
});

describe("monthRange", () => {
  it("covers the whole calendar month", () => {
    expect(monthRange("2026-06")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(monthRange("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("handles February in leap and ordinary years", () => {
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2026-02").to).toBe("2026-02-28");
  });
});

describe("parseSalesLink", () => {
  it("reads back exactly what salesLink wrote", () => {
    const href = salesLink("branch", {
      period: { from: "2026-06-01", to: "2026-06-30" },
      sort: "won",
      dir: "asc",
      filter: { branch: "Fort Worth" },
      focus: "rc:9",
    });
    const q = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseSalesLink(q)).toEqual({
      apiQuery: "from=2026-06-01&to=2026-06-30",
      window: null,
      from: "2026-06-01",
      to: "2026-06-30",
      sort: "won",
      dir: "asc",
      branch: "Fort Worth",
      team: null,
      focus: "rc:9",
    });
  });

  it("returns nothing to apply for a plain visit with no link", () => {
    const p = parseSalesLink({});
    expect(p.apiQuery).toBeNull();
    expect(p.sort).toBeNull();
    expect(p.focus).toBeNull();
  });

  it("drops values the board's own controls could not produce", () => {
    const p = parseSalesLink({ window: "decade", sort: "salary", dir: "sideways", from: "June", to: "2026-06-30" });
    expect(p.apiQuery).toBeNull();
    expect(p.sort).toBeNull();
    expect(p.dir).toBeNull();
    expect(p.from).toBeNull();
  });

  it("prefers a complete custom range over a window", () => {
    expect(parseSalesLink({ window: "year", from: "2026-06-01", to: "2026-06-30" }).apiQuery).toBe(
      "from=2026-06-01&to=2026-06-30"
    );
  });

  it("takes the first value when a parameter repeats", () => {
    expect(parseSalesLink({ team: ["Gunner", "Luke"] }).team).toBe("Gunner");
  });
});
