import { describe, it, expect } from "vitest";
import {
  buildSalesReport,
  salesContextLines,
  salesDefaultTitle,
  salesFields,
  type SalesExportContext,
  type SalesExportRow,
} from "./salesBoard";

const ROWS: SalesExportRow[] = [
  { id: "rc:1", name: "Alice", branch: "Fort Worth", team: "team-a", verifiedKnocks: 90, leadsCreated: 12, filed: 6, won: 4, revenue: 300000 },
  { id: "rc:2", name: "Bob", branch: "West Texas", team: "", verifiedKnocks: 40, leadsCreated: 5, filed: 2, won: 1, revenue: 40000 },
];

const CTX: SalesExportContext = {
  scope: "view",
  periodLabel: "Month to Date",
  from: "2026-07-01",
  to: "2026-07-30",
  branches: [],
  teams: [],
  selectedRepCount: 0,
  hideFormer: false,
  rowCount: 2,
};

describe("salesFields", () => {
  it("offers every column when nothing is filtered", () => {
    expect(salesFields(CTX).map((f) => f.key)).toEqual([
      "pos", "name", "branch", "team", "verifiedKnocks", "leadsCreated", "filed", "won", "revenue",
    ]);
  });

  // Branch reporting is team-based, so every rep listed under a branch filter
  // really belongs to that branch. The columns agree with the filter now, so
  // hiding them (which the location-based export did) would lose real information.
  it("KEEPS Branch and Team while a branch filter is active", () => {
    const keys = salesFields({ ...CTX, branches: ["Fort Worth"] }).map((f) => f.key);
    expect(keys).toContain("branch");
    expect(keys).toContain("team");
  });

  it("keeps Branch and Team across several selected branches", () => {
    const keys = salesFields({ ...CTX, branches: ["Fort Worth", "Dallas"] }).map((f) => f.key);
    expect(keys).toContain("branch");
    expect(keys).toContain("team");
  });

  it("keeps Branch and Team on a full board export", () => {
    const keys = salesFields({ ...CTX, scope: "board", branches: ["Fort Worth"] }).map((f) => f.key);
    expect(keys).toContain("branch");
    expect(keys).toContain("team");
  });
});

describe("salesContextLines", () => {
  it("always states the period as a real date range", () => {
    expect(salesContextLines(CTX)[0]).toBe("Period: 1 Jul 2026 to 30 Jul 2026 (Month to Date)");
  });

  it("names every active filter", () => {
    const joined = salesContextLines({
      ...CTX, branches: ["Fort Worth"], teams: ["team-a"], hideFormer: true, selectedRepCount: 3, rowCount: 3,
    }).join(" | ");
    expect(joined).toContain("Branch: Fort Worth");
    expect(joined).toContain("Team:");
    expect(joined).toContain("Former reps hidden");
    expect(joined).toContain("3 reps selected");
  });

  it("lists every selected branch, in canonical order rather than tick order", () => {
    const joined = salesContextLines({ ...CTX, branches: ["West Texas", "Fort Worth"] }).join(" | ");
    expect(joined).toContain("Branches: Fort Worth, West Texas");
  });

  it("lists every selected team", () => {
    const joined = salesContextLines({ ...CTX, teams: ["Luke", "Gunner"] }).join(" | ");
    expect(joined).toContain("Teams:");
  });

  it("says all branches and combined totals on a full board export", () => {
    const joined = salesContextLines({ ...CTX, scope: "board", branches: ["Fort Worth"] }).join(" | ");
    expect(joined).toContain("All branches, combined totals");
    expect(joined).not.toContain("Branch: Fort Worth");
  });

  it("labels the no-branch bucket rather than naming a branch", () => {
    expect(salesContextLines({ ...CTX, branches: ["__none__"] }).join(" | ")).toContain("(No branch)");
  });

  it("uses no em dashes", () => {
    expect(salesContextLines({ ...CTX, branches: ["Fort Worth"], hideFormer: true }).join(" ")).not.toContain("—");
  });
});

describe("salesDefaultTitle", () => {
  it("names the branch when exactly one is selected", () => {
    expect(salesDefaultTitle({ ...CTX, branches: ["Fort Worth"] })).toBe(
      "Sales Leaderboard: Fort Worth, Month to Date"
    );
  });

  it("counts them once more than one is selected", () => {
    expect(salesDefaultTitle({ ...CTX, branches: ["Fort Worth", "Dallas"] })).toBe(
      "Sales Leaderboard: 2 branches, Month to Date"
    );
  });

  it("falls back to the period alone", () => {
    expect(salesDefaultTitle(CTX)).toBe("Sales Leaderboard: Month to Date");
  });
});

describe("buildSalesReport", () => {
  const build = (over: Partial<Parameters<typeof buildSalesReport>[0]> = {}) =>
    buildSalesReport({
      rows: ROWS, context: CTX, title: "Sales Leaderboard", note: "",
      selectedKeys: null, isoDate: "2026-07-30", ...over,
    });

  it("numbers rows by position, not by any global rank", () => {
    expect(build().rows.map((r) => r[0])).toEqual(["1", "2"]);
  });

  it("formats money and counts", () => {
    const row = build().rows[0];
    expect(row).toContain("$300,000");
    expect(row).toContain("90");
  });

  it("sums every numeric column over the exported rows", () => {
    const doc = build();
    expect(doc.totals?.[0]).toBe("Sum (2 reps)");
    expect(doc.totals).toContain("$340,000");
    expect(doc.totals).toContain("130");
  });

  it("keeps the totals row aligned when columns are trimmed", () => {
    const doc = build({ selectedKeys: ["revenue"] });
    expect(doc.columns.map((c) => c.key)).toEqual(["pos", "name", "revenue"]);
    expect(doc.totals).toEqual(["Sum (2 reps)", "", "$340,000"]);
  });

  // The location-based export printed "Numbers are <branch> sales only", which
  // is false under team-based reporting: the numbers are each rep's full totals.
  // A PDF outlives the screen, so the wrong caveat is deleted, not reworded.
  it("carries NO branch caveat, because there is nothing left to caveat", () => {
    expect(build({ context: { ...CTX, branches: ["Fort Worth"] } }).warning).toBe("");
  });

  it("produces an empty document rather than throwing on no rows", () => {
    const doc = build({ rows: [] });
    expect(doc.rows).toEqual([]);
    expect(doc.totals?.[0]).toBe("Sum (0 reps)");
  });
});
