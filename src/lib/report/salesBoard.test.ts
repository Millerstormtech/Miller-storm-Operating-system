import { describe, it, expect } from "vitest";
import {
  buildSalesReport,
  salesContextLines,
  salesDefaultTitle,
  salesFields,
  salesWarning,
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
  branch: "",
  team: "",
  selectedRepCount: 0,
  hideFormer: false,
  rowCount: 2,
};

describe("salesFields", () => {
  it("offers Branch and Team when no branch filter is active", () => {
    expect(salesFields(CTX).map((f) => f.key)).toEqual([
      "pos", "name", "branch", "team", "verifiedKnocks", "leadsCreated", "filed", "won", "revenue",
    ]);
  });

  it("drops Branch and Team while a real branch filter is active", () => {
    const keys = salesFields({ ...CTX, branch: "Fort Worth" }).map((f) => f.key);
    expect(keys).not.toContain("branch");
    expect(keys).not.toContain("team");
  });

  it("keeps Branch and Team for the (No branch) bucket, which is not a real branch", () => {
    expect(salesFields({ ...CTX, branch: "__none__" }).map((f) => f.key)).toContain("branch");
  });

  it("restores Branch and Team on a full board export even if the screen is filtered", () => {
    const keys = salesFields({ ...CTX, scope: "board", branch: "Fort Worth" }).map((f) => f.key);
    expect(keys).toContain("branch");
    expect(keys).toContain("team");
  });
});

describe("salesContextLines", () => {
  it("always states the period as a real date range", () => {
    expect(salesContextLines(CTX)[0]).toBe("Period: 1 Jul 2026 to 30 Jul 2026 (Month to Date)");
  });

  it("names every active filter", () => {
    const lines = salesContextLines({
      ...CTX, branch: "Fort Worth", team: "team-a", hideFormer: true, selectedRepCount: 3, rowCount: 3,
    });
    const joined = lines.join(" | ");
    expect(joined).toContain("Branch: Fort Worth");
    expect(joined).toContain("Team:");
    expect(joined).toContain("Former reps hidden");
    expect(joined).toContain("3 reps selected");
    expect(joined).toContain("3 reps");
  });

  it("says all branches and combined totals on a full board export", () => {
    const joined = salesContextLines({ ...CTX, scope: "board", branch: "Fort Worth" }).join(" | ");
    expect(joined).toContain("All branches, combined totals");
    expect(joined).not.toContain("Branch: Fort Worth");
  });

  it("labels the no-branch bucket rather than naming a branch", () => {
    expect(salesContextLines({ ...CTX, branch: "__none__" }).join(" | ")).toContain("Branch: none set");
  });

  it("uses no em dashes", () => {
    expect(salesContextLines({ ...CTX, branch: "Fort Worth", hideFormer: true }).join(" ")).not.toContain("—");
  });
});

describe("salesWarning", () => {
  it("warns that the numbers are one branch only", () => {
    expect(salesWarning({ ...CTX, branch: "Fort Worth" })).toBe(
      "Numbers are Fort Worth sales only. Verified Door Knocks always count under a rep's home branch."
    );
  });

  it("is empty with no branch filter, on the no-branch bucket, and on a full board export", () => {
    expect(salesWarning(CTX)).toBe("");
    expect(salesWarning({ ...CTX, branch: "__none__" })).toBe("");
    expect(salesWarning({ ...CTX, scope: "board", branch: "Fort Worth" })).toBe("");
  });
});

describe("salesDefaultTitle", () => {
  it("names the branch when one is filtered", () => {
    expect(salesDefaultTitle({ ...CTX, branch: "Fort Worth" })).toBe(
      "Sales Leaderboard: Fort Worth, Month to Date"
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

  it("carries the branch warning onto the document", () => {
    expect(build({ context: { ...CTX, branch: "Fort Worth" } }).warning).toContain("Fort Worth sales only");
  });

  it("produces an empty document rather than throwing on no rows", () => {
    const doc = build({ rows: [] });
    expect(doc.rows).toEqual([]);
    expect(doc.totals?.[0]).toBe("Sum (0 reps)");
  });
});
