// src/lib/report/salesBoard.ts
// Sales Leaderboard -> ReportDocument. Pure.
//
// Branch reporting is TEAM-BASED (see repcard/branches.ts): a branch filter
// selects reps, it does not rewrite anyone's numbers. So an export carries every
// column and needs no caveat. The earlier location-based version hid Branch/Team
// and printed "Numbers are <branch> sales only"; a PDF outlives the screen it
// came from, so that line was deleted rather than reworded once it became false.
//
// Branch and Team are MULTI-SELECT. The match and label rules live in
// leaderboard/filters.ts and are shared with the board, so a PDF can never
// describe a scope the screen was not actually showing.

import {
  buildDocument,
  fmtInt,
  fmtMoney,
  formatReportDate,
  type FieldSpec,
  type ReportDocument,
  type TotalsSpec,
} from "./document";
import { TEAM_LEADS } from "../repcard/org-chart";
import { BRANCH_ORDER } from "../repcard/branches";
import { selectedNames, selectionChipLabel } from "../leaderboard/filters";

export type SalesExportRow = {
  id: string;
  name: string;
  branch: string;
  team: string;
  verifiedKnocks: number;
  leadsCreated: number;
  filed: number;
  won: number;
  revenue: number;
};

export type SalesExportContext = {
  /** "view" honours the on-screen filters; "board" ignores them (period still applies). */
  scope: "view" | "board";
  periodLabel: string;
  from: string;
  to: string;
  /** Selected branch values; empty means no branch filter. */
  branches: string[];
  /** Selected team values; empty means no team filter. */
  teams: string[];
  selectedRepCount: number;
  hideFormer: boolean;
  rowCount: number;
};

const teamLabel = (team: string) => (team ? TEAM_LEADS[team] || team : "");

/** Selected branches as display names. Empty on a full board export, which
 *  ignores the on-screen filters by definition. */
function branchNames(ctx: SalesExportContext): string[] {
  if (ctx.scope === "board") return [];
  return selectedNames(new Set(ctx.branches), BRANCH_ORDER, "(No branch)");
}

/** Selected teams as display names, alphabetical: teams have no canonical
 *  running order the way branches do. */
function teamNames(ctx: SalesExportContext): string[] {
  if (ctx.scope === "board") return [];
  return selectedNames(new Set(ctx.teams), {}, "(No team)").map(teamLabel);
}

/** "Branch: Fort Worth" for one, "Branches: Fort Worth, Dallas" for several.
 *  Both forms are passed in; "Team" does not pluralize the way "Branch" does. */
function namedList(one: string, many: string, names: string[]): string[] {
  if (names.length === 0) return [];
  return [`${names.length === 1 ? one : many}: ${names.join(", ")}`];
}

export function salesFields(ctx: SalesExportContext): FieldSpec<SalesExportRow>[] {
  const fields: FieldSpec<SalesExportRow>[] = [
    { key: "pos", label: "#", align: "left", always: true, value: (_r, i) => String(i + 1) },
    { key: "name", label: "Rep", align: "left", always: true, value: (r) => r.name },
  ];
  // Always present. Under team-based reporting a filtered row's Branch and Team
  // agree with the filter instead of contradicting it, so there is nothing to hide.
  fields.push(
    { key: "branch", label: "Branch", align: "left", value: (r) => r.branch || "" },
    { key: "team", label: "Team", align: "left", value: (r) => teamLabel(r.team) }
  );
  fields.push(
    { key: "verifiedKnocks", label: "Verified Door Knocks", align: "right", value: (r) => fmtInt(r.verifiedKnocks) },
    { key: "leadsCreated", label: "Leads Created", align: "right", value: (r) => fmtInt(r.leadsCreated) },
    { key: "filed", label: "Claims Filed", align: "right", value: (r) => fmtInt(r.filed) },
    { key: "won", label: "Contracts", align: "right", value: (r) => fmtInt(r.won) },
    { key: "revenue", label: "Contract Amount", align: "right", value: (r) => fmtMoney(r.revenue) }
  );
  return fields;
}

export function salesContextLines(ctx: SalesExportContext): string[] {
  const lines = [
    `Period: ${formatReportDate(ctx.from)} to ${formatReportDate(ctx.to)} (${ctx.periodLabel})`,
  ];
  const parts: string[] = [];
  if (ctx.scope === "board") {
    parts.push("All branches, combined totals");
  } else {
    parts.push(...namedList("Branch", "Branches", branchNames(ctx)));
    parts.push(...namedList("Team", "Teams", teamNames(ctx)));
    if (ctx.selectedRepCount > 0) parts.push(`${ctx.selectedRepCount} reps selected`);
    if (ctx.hideFormer) parts.push("Former reps hidden");
  }
  parts.push(`${ctx.rowCount} rep${ctx.rowCount === 1 ? "" : "s"}`);
  lines.push(parts.join(" · "));
  return lines;
}

export function salesDefaultTitle(ctx: SalesExportContext): string {
  // One branch is named; several are counted, so the title stays a title.
  const label = selectionChipLabel(branchNames(ctx), "", "branches");
  return `Sales Leaderboard: ${label ? `${label}, ` : ""}${ctx.periodLabel}`;
}

export function salesTotals(rows: SalesExportRow[]): TotalsSpec {
  const sum = (pick: (r: SalesExportRow) => number) => rows.reduce((n, r) => n + (pick(r) ?? 0), 0);
  const totals: Record<string, string> = {
    verifiedKnocks: fmtInt(sum((r) => r.verifiedKnocks)),
    leadsCreated: fmtInt(sum((r) => r.leadsCreated)),
    filed: fmtInt(sum((r) => r.filed)),
    won: fmtInt(sum((r) => r.won)),
    revenue: fmtMoney(sum((r) => r.revenue)),
  };
  return {
    label: `Sum (${rows.length} rep${rows.length === 1 ? "" : "s"})`,
    cell: (key) => totals[key] ?? null,
  };
}

export function buildSalesReport(input: {
  rows: SalesExportRow[];
  context: SalesExportContext;
  title: string;
  note: string;
  selectedKeys: string[] | null;
  isoDate: string;
}): ReportDocument {
  return buildDocument({
    title: input.title,
    note: input.note,
    contextLines: salesContextLines(input.context),
    fields: salesFields(input.context),
    selectedKeys: input.selectedKeys,
    rows: input.rows,
    totals: salesTotals(input.rows),
    isoDate: input.isoDate,
  });
}
