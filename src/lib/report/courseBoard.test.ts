import { describe, it, expect } from "vitest";
import {
  buildCourseByCourseReport,
  buildCourseOverallReport,
  courseOverallTitle,
  medalFor,
  type CourseRowInput,
} from "./courseBoard";
import type { OverallRow } from "../training/board";
import { courseOverallFields } from "./courseBoard";

const salesFieldsForTest = () => courseOverallFields(false);

const row = (over: Partial<OverallRow>): OverallRow => ({
  id: "u1", name: "Alice", email: "a@x.com", role: "sales", headshotUrl: "",
  branch: "Fort Worth", team: "team-a", itemsCompleted: 40, videosWatched: 30,
  quizzesPassed: 10, coursesCompleted: 4, pct: 66.6,
  credentials: [
    { key: "diploma", earned: true, pct: 100, itemsCompleted: 4, itemsTotal: 4, coursesCompleted: 2, coursesTotal: 2 },
    { key: "knockers", earned: false, pct: 30, itemsCompleted: 3, itemsTotal: 10, coursesCompleted: 0, coursesTotal: 1 },
  ],
  rank: 1, isPodium: true, notStarted: false,
  ...over,
});

const STARTED: OverallRow[] = [
  row({ id: "u1", name: "Alice", rank: 1, isPodium: true }),
  row({ id: "u2", name: "Bob", rank: 2, isPodium: true, coursesCompleted: 3 }),
  row({ id: "u3", name: "Cara", rank: 3, isPodium: true, coursesCompleted: 2 }),
  row({ id: "u4", name: "Dave", rank: 17, isPodium: false, coursesCompleted: 1, branch: "West Texas" }),
];

const NOT_STARTED: OverallRow[] = [
  row({ id: "u9", name: "Zoe", rank: null, isPodium: false, notStarted: true, itemsCompleted: 0, coursesCompleted: 0, pct: 0, credentials: [] }),
];

const NO_FILTERS = { search: "", branch: "", team: "" };
const BRANCH_FILTER = { search: "", branch: "Fort Worth", team: "" };

const build = (over: Partial<Parameters<typeof buildCourseOverallReport>[0]> = {}) =>
  buildCourseOverallReport({
    rows: STARTED, notStartedRows: NOT_STARTED, filters: NO_FILTERS, scope: "view",
    totalCourses: 10, title: "Course Leaderboard: Overall", note: "",
    selectedKeys: null, isoDate: "2026-07-30", ...over,
  });

describe("medalFor", () => {
  it("names the top three when unfiltered", () => {
    expect(medalFor(0, false)).toBe("Gold");
    expect(medalFor(1, false)).toBe("Silver");
    expect(medalFor(2, false)).toBe("Bronze");
    expect(medalFor(3, false)).toBe("");
  });

  it("never awards a medal in a filtered list", () => {
    expect(medalFor(0, true)).toBe("");
  });

  it("uses words, never emoji", () => {
    expect(medalFor(0, false)).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe("overall export, unfiltered", () => {
  it("has no Company rank column", () => {
    expect(build().columns.map((c) => c.key)).not.toContain("coRank");
  });

  it("uses the company rank in the # column, with medals on the top three", () => {
    expect(build().rows.map((r) => r[0])).toEqual(["Gold", "Silver", "Bronze", "17"]);
  });

  it("leaves credentials out unless ticked", () => {
    expect(build().columns.map((c) => c.key)).not.toContain("credentials");
  });

  it("includes earned credentials as plain words when ticked", () => {
    const doc = build({ selectedKeys: ["branch", "team", "coursesCompleted", "itemsCompleted", "pct", "credentials"] });
    expect(doc.columns.map((c) => c.key)).toContain("credentials");
  });
});

describe("overall export, filtered", () => {
  const filtered = () =>
    build({ rows: STARTED.filter((r) => r.branch === "Fort Worth"), filters: BRANCH_FILTER });

  it("adds a Company rank column", () => {
    expect(filtered().columns.map((c) => c.key)).toContain("coRank");
  });

  it("numbers rows by position and reports the true company rank separately", () => {
    const doc = filtered();
    const posIdx = doc.columns.findIndex((c) => c.key === "pos");
    const coIdx = doc.columns.findIndex((c) => c.key === "coRank");
    expect(doc.rows.map((r) => r[posIdx])).toEqual(["1", "2", "3"]);
    expect(doc.rows.map((r) => r[coIdx])).toEqual(["1", "2", "3"]);
  });

  it("awards no medals", () => {
    expect(filtered().rows.map((r) => r[0]).join()).not.toContain("Gold");
  });

  it("names the active filters in the context lines", () => {
    expect(filtered().contextLines.join(" | ")).toContain("Branch: Fort Worth");
  });
});

describe("not started section", () => {
  it("always appends its own section, never merged into the main table", () => {
    const doc = build();
    expect(doc.rows.map((r) => r[1])).not.toContain("Zoe");
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].heading).toBe("Not started (1 rep)");
    expect(doc.sections[0].rows[0][0]).toBe("Zoe");
  });

  it("appears even when the main table is empty", () => {
    const doc = build({ rows: [] });
    expect(doc.rows).toEqual([]);
    expect(doc.sections[0].rows).toHaveLength(1);
  });

  it("is omitted entirely when nobody is unstarted", () => {
    expect(build({ notStartedRows: [] }).sections).toEqual([]);
  });
});

describe("courseOverallTitle", () => {
  it("names the view", () => {
    expect(courseOverallTitle(NO_FILTERS)).toBe("Course Leaderboard: Overall");
  });

  it("names a filtered branch", () => {
    expect(courseOverallTitle(BRANCH_FILTER)).toBe("Course Leaderboard: Overall, Fort Worth");
  });
});

describe("by course export", () => {
  const ROWS: CourseRowInput[] = [
    { id: "u1", name: "Alice", branch: "Fort Worth", team: "team-a", done: 8, total: 10, pct: 80 },
    { id: "u4", name: "Dave", branch: "West Texas", team: "", done: 2, total: 10, pct: 20 },
  ];

  const byCourse = (over = {}) =>
    buildCourseByCourseReport({
      rows: ROWS, notStartedRows: [], filters: NO_FILTERS, scope: "view",
      courseTitle: "Objection Masterclass", title: "Course Leaderboard: Objection Masterclass",
      note: "", selectedKeys: null, isoDate: "2026-07-30", ...over,
    });

  it("renders Completed as done of total", () => {
    expect(byCourse().rows[0]).toContain("8 of 10");
  });

  it("names the course in the context lines", () => {
    expect(byCourse().contextLines.join(" | ")).toContain("Course: Objection Masterclass");
  });

  it("has no totals row: the course board has no Sum on screen", () => {
    expect(byCourse().totals).toBeNull();
  });
});

describe("credentials earned column", () => {
  it("lists only the credentials a rep has actually earned", () => {
    const fields = salesFieldsForTest();
    const col = fields.find((f) => f.key === "credentials")!;
    expect(
      col.value({
        credentials: [
          { key: "diploma", earned: true, pct: 100, itemsCompleted: 1, itemsTotal: 1, coursesCompleted: 1, coursesTotal: 1 },
          { key: "knockers", earned: false, pct: 40, itemsCompleted: 2, itemsTotal: 5, coursesCompleted: 0, coursesTotal: 1 },
        ],
      } as any)
    ).toBe("Miller Storm Diploma");
  });

  it("is empty for a rep holding none", () => {
    const col = salesFieldsForTest().find((f) => f.key === "credentials")!;
    expect(col.value({ credentials: [] } as any)).toBe("");
    expect(col.value({} as any)).toBe("");
  });
});
