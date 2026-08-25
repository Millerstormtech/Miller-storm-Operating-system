import { describe, it, expect } from "vitest";
import {
  topN,
  groupBreakdown,
  repLines,
  breakdownFor,
  monthKeys,
  personalBest,
  type MonthLine,
} from "./dashboard";
import type { SalesRow } from "./types";

const row = (over: Partial<SalesRow>): SalesRow => ({
  repUserId: null,
  name: "",
  team: null,
  branch: "",
  revenue: 0,
  knocks: 0,
  claims: 0,
  contracts: 0,
  former: false,
  ...over,
});

describe("breakdownFor", () => {
  it("drills exactly one level below the viewer", () => {
    expect(breakdownFor("company")).toBe("branch");
    expect(breakdownFor("branch")).toBe("team");
    expect(breakdownFor("team")).toBe("rep");
    expect(breakdownFor("self")).toBe("month");
  });
});

describe("topN", () => {
  const rows = [
    row({ repUserId: "a", name: "Ashton", revenue: 100, claims: 4, knocks: 10 }),
    row({ repUserId: "b", name: "Brighton", revenue: 300, claims: 1, knocks: 50 }),
    row({ repUserId: "c", name: "Cooper", revenue: 200, claims: 9, knocks: 30 }),
  ];

  it("ranks by the requested metric, highest first", () => {
    expect(topN(rows, "revenue", 3).map((l) => l.name)).toEqual(["Brighton", "Cooper", "Ashton"]);
    expect(topN(rows, "claims", 3).map((l) => l.name)).toEqual(["Cooper", "Ashton", "Brighton"]);
  });

  it("caps the list at n", () => {
    expect(topN(rows, "revenue", 2).map((l) => l.name)).toEqual(["Brighton", "Cooper"]);
  });

  it("carries the value for the metric asked for, not revenue", () => {
    expect(topN(rows, "claims", 1)[0]).toEqual({ repUserId: "c", name: "Cooper", value: 9 });
  });

  // Same rule as rankFor(): a departed rep's dollars stay in the totals but they
  // never occupy a podium slot.
  it("never ranks a former rep", () => {
    const withFormer = [...rows, row({ repUserId: "z", name: "Zed", revenue: 9999, former: true })];
    expect(topN(withFormer, "revenue", 3).map((l) => l.name)).toEqual(["Brighton", "Cooper", "Ashton"]);
  });

  // "#1 in claims: someone, 0 claims" is a false claim about the business.
  it("omits anyone with nothing on the metric", () => {
    const quiet = [
      row({ repUserId: "a", name: "Ashton", claims: 2 }),
      row({ repUserId: "b", name: "Brighton", claims: 0 }),
    ];
    expect(topN(quiet, "claims", 3).map((l) => l.name)).toEqual(["Ashton"]);
  });

  it("returns an empty list when nobody has anything", () => {
    expect(topN([row({ repUserId: "a", name: "Ashton" })], "claims", 3)).toEqual([]);
  });

  it("breaks ties by name so the order never wobbles between requests", () => {
    const tied = [
      row({ repUserId: "b", name: "Bravo", revenue: 50 }),
      row({ repUserId: "a", name: "Alpha", revenue: 50 }),
    ];
    expect(topN(tied, "revenue", 2).map((l) => l.name)).toEqual(["Alpha", "Bravo"]);
  });
});

describe("groupBreakdown", () => {
  const rows = [
    row({ repUserId: "a", name: "Ashton", branch: "Fort Worth", team: "Gunner", revenue: 100, claims: 4, knocks: 10, contracts: 2 }),
    row({ repUserId: "b", name: "Brighton", branch: "Fort Worth", team: "Luke", revenue: 300, claims: 1, knocks: 50, contracts: 1 }),
    row({ repUserId: "c", name: "Cooper", branch: "Dallas", team: "Cooper", revenue: 200, claims: 9, knocks: 30, contracts: 3 }),
  ];

  it("totals each group and names its leader per metric", () => {
    const [first] = groupBreakdown(rows, "branch");
    expect(first.key).toBe("Fort Worth");
    expect(first.totals).toEqual({ revenue: 400, knocks: 60, claims: 5, contracts: 3 });
    expect(first.leaders.revenue?.name).toBe("Brighton");
    expect(first.leaders.claims?.name).toBe("Ashton");
    expect(first.leaders.knocks?.name).toBe("Brighton");
  });

  it("orders groups by revenue, highest first", () => {
    expect(groupBreakdown(rows, "branch").map((g) => g.key)).toEqual(["Fort Worth", "Dallas"]);
  });

  it("groups by team when asked", () => {
    // Luke 300, Cooper 200, Gunner 100
    expect(groupBreakdown(rows, "team").map((g) => g.key)).toEqual(["Luke", "Cooper", "Gunner"]);
  });

  it("skips rows with no group key rather than inventing an empty group", () => {
    const orphan = [...rows, row({ repUserId: "d", name: "Drifter", branch: "", revenue: 500 })];
    expect(groupBreakdown(orphan, "branch").map((g) => g.key)).toEqual(["Fort Worth", "Dallas"]);
  });

  // A departed rep's revenue was really earned by that branch, so it stays in the
  // total. They just cannot be its face.
  it("keeps a former rep's numbers in the total but never as the leader", () => {
    const withFormer = [
      row({ repUserId: "a", name: "Ashton", branch: "Fort Worth", revenue: 100 }),
      row({ repUserId: "z", name: "Zed", branch: "Fort Worth", revenue: 900, former: true }),
    ];
    const [fw] = groupBreakdown(withFormer, "branch");
    expect(fw.totals.revenue).toBe(1000);
    expect(fw.leaders.revenue?.name).toBe("Ashton");
  });

  it("reports a null leader for a metric nobody scored on", () => {
    const [fw] = groupBreakdown([row({ repUserId: "a", name: "Ashton", branch: "Fort Worth", revenue: 100 })], "branch");
    expect(fw.leaders.revenue?.name).toBe("Ashton");
    expect(fw.leaders.claims).toBeNull();
  });

  it("returns nothing for an empty roster", () => {
    expect(groupBreakdown([], "branch")).toEqual([]);
  });
});

describe("repLines", () => {
  it("sorts by revenue so the quiet rep lands at the bottom", () => {
    const rows = [
      row({ repUserId: "a", name: "Ashton", revenue: 100 }),
      row({ repUserId: "q", name: "Quiet", revenue: 0, knocks: 14 }),
      row({ repUserId: "b", name: "Brighton", revenue: 300 }),
    ];
    expect(repLines(rows).map((r) => r.name)).toEqual(["Brighton", "Ashton", "Quiet"]);
  });

  // The whole point of the team leader's table is seeing who has gone quiet, so a
  // departed rep is shown and flagged rather than dropped.
  it("keeps former reps on the list and flags them", () => {
    const rows = [
      row({ repUserId: "a", name: "Ashton", revenue: 100 }),
      row({ repUserId: "z", name: "Zed", revenue: 50, former: true }),
    ];
    const lines = repLines(rows);
    expect(lines.map((r) => r.name)).toEqual(["Ashton", "Zed"]);
    expect(lines[1].former).toBe(true);
  });

  it("breaks ties by name", () => {
    const rows = [
      row({ repUserId: "b", name: "Bravo", revenue: 10 }),
      row({ repUserId: "a", name: "Alpha", revenue: 10 }),
    ];
    expect(repLines(rows).map((r) => r.name)).toEqual(["Alpha", "Bravo"]);
  });
});

describe("monthKeys", () => {
  it("returns the current month first, then back through the year", () => {
    expect(monthKeys(new Date("2026-08-25T12:00:00Z"), 6)).toEqual([
      "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03",
    ]);
  });

  it("never reaches back past January of the current year", () => {
    // A "last six months" view in February must not quietly show last year's
    // numbers next to this year's, because the headline above it is year to date.
    expect(monthKeys(new Date("2026-02-10T12:00:00Z"), 6)).toEqual(["2026-02", "2026-01"]);
  });

  it("handles January, where there is only the current month", () => {
    expect(monthKeys(new Date("2026-01-04T12:00:00Z"), 6)).toEqual(["2026-01"]);
  });
});

describe("personalBest", () => {
  const months: MonthLine[] = [
    { key: "2026-08", label: "August", revenue: 21300, contracts: 2, claims: 4, knocks: 264 },
    { key: "2026-07", label: "July", revenue: 18900, contracts: 2, claims: 5, knocks: 301 },
    { key: "2026-06", label: "June", revenue: 12400, contracts: 1, claims: 3, knocks: 288 },
  ];

  it("finds the best FINISHED month and how close this one is to it", () => {
    const best = personalBest(months, "revenue", "2026-08");
    expect(best?.label).toBe("July");
    expect(best?.value).toBe(18900);
    expect(best?.pct).toBe(100); // 21300 of 18900, capped
  });

  // Comparing the month in progress against itself would read 100% every time and
  // tell the rep nothing.
  it("excludes the month in progress from the comparison", () => {
    const best = personalBest(months, "knocks", "2026-08");
    expect(best?.label).toBe("July");
    expect(best?.value).toBe(301);
    expect(best?.pct).toBe(88); // 264 of 301
  });

  it("has nothing to say in a rep's first month", () => {
    expect(personalBest([months[0]], "revenue", "2026-08")).toBeNull();
  });

  it("has nothing to say when every finished month is empty", () => {
    const blank: MonthLine[] = [
      { key: "2026-08", label: "August", revenue: 100, contracts: 0, claims: 0, knocks: 0 },
      { key: "2026-07", label: "July", revenue: 0, contracts: 0, claims: 0, knocks: 0 },
    ];
    expect(personalBest(blank, "revenue", "2026-08")).toBeNull();
  });

  it("breaks a tie towards the more recent month", () => {
    const tied: MonthLine[] = [
      { key: "2026-08", label: "August", revenue: 50, contracts: 0, claims: 0, knocks: 0 },
      { key: "2026-07", label: "July", revenue: 200, contracts: 0, claims: 0, knocks: 0 },
      { key: "2026-06", label: "June", revenue: 200, contracts: 0, claims: 0, knocks: 0 },
    ];
    expect(personalBest(tied, "revenue", "2026-08")?.label).toBe("July");
  });
});
