// Where each part of the role dashboard links to, and with which filters already
// applied on arrival.
//
// Pure: no React, no router, no I/O. The dashboard builds its links here and the
// Sales Leaderboard reads them back with parseSalesLink(), so the two ends of a
// link are one tested module and cannot drift apart.
//
// The rules were agreed with Youssef on 2026-09-13, one role at a time:
//   - every card has a "See all" link; branch and team cards also link each #1
//   - a link opens on the SAME period the tapped number shows (year to date ->
//     this year, month to date -> this month)
//   - the rank line opens the full board, no filters, this month
//   - the board scrolls to the viewer's own row (focus=me)
// The Flutter dashboard mirrors these rules; this file is the written spec.
import type { ScopeLevel } from "./types";
import type { Metric } from "./dashboard";

/** Every column the Sales Leaderboard can sort by (its own SortKey). */
export type SalesSort =
  | "name"
  | "branch"
  | "team"
  | "verifiedKnocks"
  | "leadsCreated"
  | "filed"
  | "won"
  | "revenue";

const SALES_SORTS: readonly SalesSort[] = [
  "name", "branch", "team", "verifiedKnocks", "leadsCreated", "filed", "won", "revenue",
];

/** The dashboard's metric names -> the leaderboard's column names. */
export const METRIC_SORT: Record<Metric, SalesSort> = {
  revenue: "revenue",
  contracts: "won",
  claims: "filed",
  knocks: "verifiedKnocks",
};

// Each role's own copy of the page, so a link never lands someone in another
// portal's layout (and its ProtectedRoute).
const SALES_PATH: Record<ScopeLevel, string> = {
  company: "/c-level/sales-leaderboard",
  branch: "/branch-manager/sales-leaderboard",
  team: "/manager/rankings",
  self: "/sales/rankings",
};

// A rep's training card is a to-do list, so it opens the Training Center rather
// than the Course Leaderboard (Youssef, 2026-09-13).
const TRAINING_PATH: Record<ScopeLevel, string> = {
  company: "/c-level/course-leaderboard",
  branch: "/branch-manager/course-leaderboard",
  team: "/manager/course-leaderboard",
  self: "/sales/training",
};

export interface ScopeRef {
  level: ScopeLevel;
  branch?: string | null;
  team?: string | null;
}

export interface RowFilter {
  branch?: string | null;
  team?: string | null;
}

export type SalesPeriod = { window: "month" | "year" } | { from: string; to: string };

export interface SalesLinkOptions {
  period: SalesPeriod;
  sort: SalesSort;
  /** Defaults to high-to-low, the board's own default for number columns. */
  dir?: "asc" | "desc";
  filter?: RowFilter;
  /** "me" scrolls to the viewer's row; anything else is a leaderboard row id. */
  focus?: string;
}

/**
 * The filter that narrows the board to the viewer's own scope. A company or a
 * rep gets none: Jay's view is the company, and a rep compares against everyone.
 */
export function scopeFilter(scope: ScopeRef): RowFilter {
  if (scope.level === "branch" && scope.branch) return { branch: scope.branch };
  if (scope.level === "team" && scope.team) return { team: scope.team };
  return {};
}

export function salesLink(level: ScopeLevel, opts: SalesLinkOptions): string {
  const q = new URLSearchParams();
  if ("window" in opts.period) {
    q.set("window", opts.period.window);
  } else {
    q.set("from", opts.period.from);
    q.set("to", opts.period.to);
  }
  q.set("sort", opts.sort);
  q.set("dir", opts.dir ?? "desc");
  if (opts.filter?.branch) q.set("branch", opts.filter.branch);
  if (opts.filter?.team) q.set("team", opts.filter.team);
  q.set("focus", opts.focus ?? "me");
  return `${SALES_PATH[level]}?${q.toString()}`;
}

export function trainingLink(scope: ScopeRef): string {
  const path = TRAINING_PATH[scope.level];
  const f = scopeFilter(scope);
  const q = new URLSearchParams();
  if (f.branch) q.set("branch", f.branch);
  if (f.team) q.set("team", f.team);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/** "2026-06" -> June 1 to June 30, as the board's YYYY-MM-DD dates. */
export function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  // Day 0 of the next month is the last day of this one: no 28/30/31 table.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export interface ParsedSalesLink {
  /** What to fetch: "window=year" or "from=...&to=...". Null = no period given. */
  apiQuery: string | null;
  window: "day" | "week" | "month" | "year" | null;
  from: string | null;
  to: string | null;
  sort: SalesSort | null;
  dir: "asc" | "desc" | null;
  branch: string | null;
  team: string | null;
  focus: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS = ["day", "week", "month", "year"] as const;

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

/**
 * Reads a dashboard link back on the leaderboard. Anything unrecognised is
 * dropped rather than trusted, so a hand-edited URL can never put the board in a
 * state its own controls could not reach. These are display filters only: the
 * server decides what data anyone may see, not this.
 */
export function parseSalesLink(query: Record<string, string | string[] | undefined>): ParsedSalesLink {
  const from = one(query.from);
  const to = one(query.to);
  const w = one(query.window);
  const sort = one(query.sort);
  const dir = one(query.dir);
  const custom = DAY.test(from) && DAY.test(to);
  const window = !custom && (WINDOWS as readonly string[]).includes(w) ? (w as ParsedSalesLink["window"]) : null;
  return {
    apiQuery: custom ? `from=${from}&to=${to}` : window ? `window=${window}` : null,
    window,
    from: custom ? from : null,
    to: custom ? to : null,
    sort: (SALES_SORTS as readonly string[]).includes(sort) ? (sort as SalesSort) : null,
    dir: dir === "asc" || dir === "desc" ? dir : null,
    branch: one(query.branch) || null,
    team: one(query.team) || null,
    focus: one(query.focus) || null,
  };
}
