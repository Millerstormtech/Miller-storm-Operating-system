import { describe, it, expect } from "vitest";
import {
  buildDocument,
  defaultSelection,
  pickableFields,
  fmtInt,
  fmtMoney,
  fmtPct,
  formatReportDate,
  orientationFor,
  reportFileName,
  slugify,
  type FieldSpec,
} from "./document";

type Row = { name: string; amount: number; count: number };

const ROWS: Row[] = [
  { name: "Alice", amount: 300000, count: 4 },
  { name: "Bob", amount: 40000, count: 1 },
];

const FIELDS: FieldSpec<Row>[] = [
  { key: "pos", label: "#", align: "left", always: true, value: (_r, i) => String(i + 1) },
  { key: "name", label: "Rep", align: "left", always: true, value: (r) => r.name },
  { key: "count", label: "Contracts", align: "right", value: (r) => fmtInt(r.count) },
  { key: "amount", label: "Contract Amount", align: "right", value: (r) => fmtMoney(r.amount) },
  { key: "extra", label: "Badges", align: "left", optionalByDefault: true, value: () => "Finisher" },
];

describe("formatters", () => {
  it("formats money with no decimals", () => {
    expect(fmtMoney(300000)).toBe("$300,000");
  });

  it("treats missing numbers as zero", () => {
    expect(fmtMoney(undefined as unknown as number)).toBe("$0");
    expect(fmtInt(undefined as unknown as number)).toBe("0");
    expect(fmtPct(undefined as unknown as number)).toBe("0%");
  });

  it("rounds percentages to whole numbers", () => {
    expect(fmtPct(66.6)).toBe("67%");
  });
});

describe("slugify and reportFileName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Sales Leaderboard: Fort Worth")).toBe("sales-leaderboard-fort-worth");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    expect(slugify("  Course // Leaderboard!!  ")).toBe("course-leaderboard");
  });

  it("falls back when a title has no usable characters", () => {
    expect(slugify("***")).toBe("report");
  });

  it("appends the ISO date and the pdf extension", () => {
    expect(reportFileName("Sales Leaderboard", "2026-07-30")).toBe("sales-leaderboard-2026-07-30.pdf");
  });
});

describe("formatReportDate", () => {
  it("renders a human date without an em dash", () => {
    expect(formatReportDate("2026-07-30")).toBe("30 Jul 2026");
  });
});

describe("orientationFor", () => {
  it("uses landscape from six columns up", () => {
    expect(orientationFor(6)).toBe("landscape");
    expect(orientationFor(9)).toBe("landscape");
  });

  it("uses portrait for five or fewer", () => {
    expect(orientationFor(5)).toBe("portrait");
    expect(orientationFor(1)).toBe("portrait");
  });
});

describe("field selection", () => {
  it("omits always-on fields from the picker", () => {
    expect(pickableFields(FIELDS).map((f) => f.key)).toEqual(["count", "amount", "extra"]);
  });

  it("leaves optionalByDefault fields unticked", () => {
    expect(defaultSelection(FIELDS)).toEqual(["count", "amount"]);
  });
});

describe("buildDocument", () => {
  const base = {
    title: "Sales Leaderboard",
    note: "",
    contextLines: ["Period: 1 Jul 2026 to 30 Jul 2026"],
    fields: FIELDS,
    rows: ROWS,
    isoDate: "2026-07-30",
  };

  it("keeps always-on columns plus the selected ones, in field order", () => {
    const doc = buildDocument({ ...base, selectedKeys: ["amount"] });
    expect(doc.columns.map((c) => c.key)).toEqual(["pos", "name", "amount"]);
  });

  it("uses the default selection when selectedKeys is null", () => {
    const doc = buildDocument({ ...base, selectedKeys: null });
    expect(doc.columns.map((c) => c.key)).toEqual(["pos", "name", "count", "amount"]);
  });

  it("produces one row per input row, aligned to the columns", () => {
    const doc = buildDocument({ ...base, selectedKeys: ["amount"] });
    expect(doc.rows).toEqual([
      ["1", "Alice", "$300,000"],
      ["2", "Bob", "$40,000"],
    ]);
  });

  it("returns no totals row when none is supplied", () => {
    expect(buildDocument({ ...base, selectedKeys: null }).totals).toBeNull();
  });

  it("builds a totals row aligned to the selected columns", () => {
    const doc = buildDocument({
      ...base,
      selectedKeys: ["count", "amount"],
      totals: {
        label: "Sum (2 reps)",
        cell: (key) => (key === "amount" ? "$340,000" : key === "count" ? "5" : null),
      },
    });
    expect(doc.totals).toEqual(["Sum (2 reps)", "", "5", "$340,000"]);
  });

  it("derives orientation from the selected column count", () => {
    expect(buildDocument({ ...base, selectedKeys: [] }).orientation).toBe("portrait");
    expect(
      buildDocument({
        ...base,
        // pos + name (always) + these four = six columns
        selectedKeys: ["count", "amount", "extra", "z"],
        fields: [...FIELDS, { key: "z", label: "Z", align: "left", value: () => "z" }],
      }).orientation
    ).toBe("landscape");
  });

  it("handles an empty row set without throwing", () => {
    const doc = buildDocument({ ...base, rows: [], selectedKeys: null });
    expect(doc.rows).toEqual([]);
    expect(doc.columns.length).toBeGreaterThan(0);
  });

  it("carries title, note, context, filename and date through", () => {
    const doc = buildDocument({ ...base, note: "For Monday's call", selectedKeys: null });
    expect(doc.title).toBe("Sales Leaderboard");
    expect(doc.note).toBe("For Monday's call");
    expect(doc.contextLines).toEqual(["Period: 1 Jul 2026 to 30 Jul 2026"]);
    expect(doc.fileName).toBe("sales-leaderboard-2026-07-30.pdf");
    expect(doc.generatedOn).toBe("30 Jul 2026");
    expect(doc.warning).toBe("");
    expect(doc.sections).toEqual([]);
  });
});
