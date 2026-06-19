// src/lib/acculynx/config.ts
// Single source of truth for probe-derived AccuLynx specifics. If the company
// renames stages or changes which rep/financial field counts, edit ONLY this file.

export const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";

export type Metric = "filed" | "won" | "revenue";
export const METRICS: Metric[] = ["filed", "won", "revenue"];

// UI labels for each metric column.
export const METRIC_LABELS: Record<Metric, string> = {
  filed: "Claims Filed",
  won: "Deals Won",
  revenue: "Revenue",
};

// AccuLynx representative type that earns leaderboard credit.
export const REP_TYPE = "SalesOwner";

// Map an AccuLynx milestone (stage) name -> count metric.
export const STAGE_TO_METRIC: Record<string, Exclude<Metric, "revenue">> = {
  Prospect: "filed",
  Approved: "won",
};

// Revenue: sum this financials field, credited at this milestone's date.
export const REVENUE_FIELD = "approvedJobValue";
export const REVENUE_STAGE = "Approved";
