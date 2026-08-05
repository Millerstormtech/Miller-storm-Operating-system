// src/lib/report/salesBoard.ts
// Sales Leaderboard -> ReportDocument. Pure.
//
// The rule that matters: a real branch filter rewrites every row's numbers to
// that branch's sales only, and hides Branch/Team (see LeaderboardBoard.tsx).
// A PDF outlives the screen it came from, so the export mirrors the hidden
// columns AND states the caveat in words.

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
import { conversionRate, formatRate } from "../leaderboard/conversion";

/** The "(No branch)" / "(No team)" sentinel used by the board's dropdowns. */
const NONE = "__none__";

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
  branch: string;
  team: string;
  selectedRepCount: number;
  hideFormer: boolean;
  rowCount: number;
};

/** True only for a real branch filter that is actually in force for this export. */
function branchScoped(ctx: SalesExportContext): boolean {
  return ctx.scope === "view" && !!ctx.branch && ctx.branch !== NONE;
}

const teamLabel = (team: string) => (team ? TEAM_LEADS[team] || team : "");

export function salesFields(ctx: SalesExportContext): FieldSpec<SalesExportRow>[] {
  const fields: FieldSpec<SalesExportRow>[] = [
    { key: "pos", label: "#", align: "left", always: true, value: (_r, i) => String(i + 1) },
    { key: "name", label: "Rep", align: "left", always: true, value: (r) => r.name },
  ];
  if (!branchScoped(ctx)) {
    fields.push(
      { key: "branch", label: "Branch", align: "left", value: (r) => r.branch || "" },
      { key: "team", label: "Team", align: "left", value: (r) => teamLabel(r.team) }
    );
  }
  fields.push(
    { key: "verifiedKnocks", label: "Verified Door Knocks", align: "right", value: (r) => fmtInt(r.verifiedKnocks) },
    { key: "leadsCreated", label: "Leads Created", align: "right", value: (r) => fmtInt(r.leadsCreated) },
    // A printed table has no gap between cells to float a rate into, so on paper
    // it is a real column. Never hidden by a branch filter: unlike Branch/Team it
    // stays meaningful when the row's numbers are scoped to one branch.
    { key: "leadToFiled", label: "Lead → Filed", align: "right", value: (r) => formatRate(conversionRate(r.leadsCreated, r.filed)) },
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
    if (ctx.branch === NONE) parts.push("Branch: none set");
    else if (ctx.branch) parts.push(`Branch: ${ctx.branch}`);
    if (ctx.team === NONE) parts.push("Team: none set");
    else if (ctx.team) parts.push(`Team: ${teamLabel(ctx.team)}`);
    if (ctx.selectedRepCount > 0) parts.push(`${ctx.selectedRepCount} reps selected`);
    if (ctx.hideFormer) parts.push("Former reps hidden");
  }
  parts.push(`${ctx.rowCount} rep${ctx.rowCount === 1 ? "" : "s"}`);
  lines.push(parts.join(" · "));
  // A PDF outlives the screen it came from, so the timing caveat travels with it.
  lines.push("Conversion rates are less reliable over short date ranges (see note).");
  return lines;
}

export function salesWarning(ctx: SalesExportContext): string {
  if (!branchScoped(ctx)) return "";
  return `Numbers are ${ctx.branch} sales only. Verified Door Knocks always count under a rep's home branch.`;
}

export function salesDefaultTitle(ctx: SalesExportContext): string {
  const scopeLabel = branchScoped(ctx) ? `${ctx.branch}, ` : "";
  return `Sales Leaderboard: ${scopeLabel}${ctx.periodLabel}`;
}

export function salesTotals(rows: SalesExportRow[]): TotalsSpec {
  const sum = (pick: (r: SalesExportRow) => number) => rows.reduce((n, r) => n + (pick(r) ?? 0), 0);
  const totalLeads = sum((r) => r.leadsCreated);
  const totalFiled = sum((r) => r.filed);
  const totals: Record<string, string> = {
    verifiedKnocks: fmtInt(sum((r) => r.verifiedKnocks)),
    leadsCreated: fmtInt(totalLeads),
    // The AGGREGATE rate, deliberately not the mean of the per-rep rates:
    // averaging percentages lets a rep with 3 leads weigh as much as a rep with 300.
    leadToFiled: formatRate(conversionRate(totalLeads, totalFiled)),
    filed: fmtInt(totalFiled),
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
    warning: salesWarning(input.context),
    fields: salesFields(input.context),
    selectedKeys: input.selectedKeys,
    rows: input.rows,
    totals: salesTotals(input.rows),
    isoDate: input.isoDate,
  });
}
