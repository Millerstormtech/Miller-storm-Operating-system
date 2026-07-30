// src/lib/report/courseBoard.ts
// Course Leaderboard -> ReportDocument. Pure.
//
// The screen is a card list (RosterGrid.tsx), so this flattens cards into a
// table. Two fidelity rules carried over:
//   1. Filtered lists show BOTH the position here and the true company rank,
//      because filtering hides people but never changes anyone's numbers.
//      (Contrast the sales board, where a branch filter rewrites the numbers,
//      which is why it gets no company rank column.)
//   2. Medals mean the company-wide top 3, so a filtered export has none.
// Medals are the WORDS Gold/Silver/Bronze: jsPDF's built-in fonts cannot draw
// emoji, and embedding a font that can would cost ~1MB for decoration.

import {
  buildDocument,
  fmtInt,
  fmtPct,
  type FieldSpec,
  type ReportDocument,
  type ReportSection,
} from "./document";
import { filtersActive, type BoardFilters, type OverallRow } from "../training/board";
import { TEAM_LEADS } from "../repcard/org-chart";

/** badgesFor() returns ids; the on-screen labels carry emoji, so keep plain words here. */
export const BADGE_LABELS: Record<string, string> = {
  halfway: "Halfway",
  finisher: "Finisher",
  graduate: "Graduate",
  "test-ace": "Test Ace",
};

export type CourseExportScope = "view" | "board";

/** One row of the By Course view. */
export type CourseRowInput = {
  id: string;
  name: string;
  branch: string;
  team: string;
  done: number;
  total: number;
  pct: number;
};

const teamLabel = (team: string) => (team ? TEAM_LEADS[team] || team : "");

const MEDALS = ["Gold", "Silver", "Bronze"];

export function medalFor(index: number, filtered: boolean): string {
  if (filtered) return "";
  return MEDALS[index] ?? "";
}

export function courseContextLines(input: {
  filters: BoardFilters;
  scope: CourseExportScope;
  rowCount: number;
  notStartedCount: number;
  totalCourses?: number;
  courseTitle?: string;
}): string[] {
  const lines: string[] = [];
  if (input.courseTitle) lines.push(`Course: ${input.courseTitle}`);
  else if (input.totalCourses != null) {
    lines.push(`Ranked across all ${input.totalCourses} courses`);
  }
  const parts: string[] = [];
  if (input.scope === "board") {
    parts.push("Whole company, no filters");
  } else {
    const f = input.filters;
    if (f.branch) parts.push(`Branch: ${f.branch}`);
    if (f.team) parts.push(`Team: ${teamLabel(f.team)}`);
    if (f.search.trim()) parts.push(`Search: ${f.search.trim()}`);
  }
  parts.push(`${input.rowCount} rep${input.rowCount === 1 ? "" : "s"}`);
  if (input.notStartedCount > 0) parts.push(`${input.notStartedCount} not started`);
  lines.push(parts.join(" · "));
  return lines;
}

export function courseOverallTitle(filters: BoardFilters): string {
  const scope = filters.branch ? `, ${filters.branch}` : filters.team ? `, ${teamLabel(filters.team)}` : "";
  return `Course Leaderboard: Overall${scope}`;
}

export function courseOverallFields(filtered: boolean): FieldSpec<OverallRow>[] {
  const fields: FieldSpec<OverallRow>[] = [
    {
      key: "pos",
      label: "#",
      align: "left",
      always: true,
      // Unfiltered, `#` IS the company rank, and the top 3 carry a medal word.
      // Filtered, `#` is only the position in this list.
      value: (r, i) => (filtered ? String(i + 1) : medalFor(i, false) || String(r.rank ?? i + 1)),
    },
    { key: "name", label: "Rep", align: "left", always: true, value: (r) => r.name },
  ];
  if (filtered) {
    fields.push({
      key: "coRank",
      label: "Company rank",
      align: "right",
      always: true,
      value: (r) => (r.rank == null ? "" : String(r.rank)),
    });
  }
  fields.push(
    { key: "branch", label: "Branch", align: "left", value: (r) => r.branch || "" },
    { key: "team", label: "Team", align: "left", value: (r) => teamLabel(r.team) },
    { key: "rankTitle", label: "Rank Title", align: "left", value: (r) => r.rankTitle },
    { key: "coursesCompleted", label: "Courses Completed", align: "right", value: (r) => fmtInt(r.coursesCompleted) },
    { key: "itemsCompleted", label: "Lessons & Quizzes Completed", align: "right", value: (r) => fmtInt(r.itemsCompleted) },
    { key: "pct", label: "Progress", align: "right", value: (r) => fmtPct(r.pct) },
    {
      key: "badges",
      label: "Badges",
      align: "left",
      optionalByDefault: true,
      value: (r) => (r.badges || []).map((b) => BADGE_LABELS[b] || b).join(", "),
    }
  );
  return fields;
}

/** The closing "Not started" table. Empty array when nobody is unstarted. */
export function notStartedSection(
  rows: Array<{ name: string; branch: string; team: string }>
): ReportSection[] {
  if (rows.length === 0) return [];
  return [
    {
      heading: `Not started (${rows.length} rep${rows.length === 1 ? "" : "s"})`,
      columns: [
        { key: "name", label: "Rep", align: "left" },
        { key: "branch", label: "Branch", align: "left" },
        { key: "team", label: "Team", align: "left" },
      ],
      rows: rows.map((r) => [r.name, r.branch || "", teamLabel(r.team)]),
    },
  ];
}

export function buildCourseOverallReport(input: {
  rows: OverallRow[];
  notStartedRows: OverallRow[];
  filters: BoardFilters;
  scope: CourseExportScope;
  totalCourses: number;
  title: string;
  note: string;
  selectedKeys: string[] | null;
  isoDate: string;
}): ReportDocument {
  const filtered = input.scope === "view" && filtersActive(input.filters);
  return buildDocument({
    title: input.title,
    note: input.note,
    contextLines: courseContextLines({
      filters: input.filters,
      scope: input.scope,
      rowCount: input.rows.length,
      notStartedCount: input.notStartedRows.length,
      totalCourses: input.totalCourses,
    }),
    fields: courseOverallFields(filtered),
    selectedKeys: input.selectedKeys,
    rows: input.rows,
    totals: null,
    sections: notStartedSection(input.notStartedRows),
    isoDate: input.isoDate,
  });
}

export function buildCourseByCourseReport(input: {
  rows: CourseRowInput[];
  notStartedRows: Array<{ name: string; branch: string; team: string }>;
  filters: BoardFilters;
  scope: CourseExportScope;
  courseTitle: string;
  title: string;
  note: string;
  selectedKeys: string[] | null;
  isoDate: string;
}): ReportDocument {
  const fields: FieldSpec<CourseRowInput>[] = [
    { key: "pos", label: "#", align: "left", always: true, value: (_r, i) => String(i + 1) },
    { key: "name", label: "Rep", align: "left", always: true, value: (r) => r.name },
    { key: "branch", label: "Branch", align: "left", value: (r) => r.branch || "" },
    { key: "team", label: "Team", align: "left", value: (r) => teamLabel(r.team) },
    { key: "done", label: "Completed", align: "right", value: (r) => `${r.done} of ${r.total}` },
    { key: "pct", label: "Progress", align: "right", value: (r) => fmtPct(r.pct) },
  ];
  return buildDocument({
    title: input.title,
    note: input.note,
    contextLines: courseContextLines({
      filters: input.filters,
      scope: input.scope,
      rowCount: input.rows.length,
      notStartedCount: input.notStartedRows.length,
      courseTitle: input.courseTitle,
    }),
    fields,
    selectedKeys: input.selectedKeys,
    rows: input.rows,
    totals: null,
    sections: notStartedSection(input.notStartedRows),
    isoDate: input.isoDate,
  });
}
