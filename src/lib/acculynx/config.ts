// src/lib/acculynx/config.ts
// Single source of truth for probe-derived AccuLynx specifics. If the company
// renames stages or changes which rep/financial field counts, edit ONLY this file.

export const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";

export type Metric = "filed" | "won" | "revenue";
export const METRICS: Metric[] = ["filed", "won", "revenue"];

// UI labels for each metric column.
export const METRIC_LABELS: Record<Metric, string> = {
  filed: "Claims Filed",
  won: "Contracts",
  revenue: "Contract Amount",
};

// AccuLynx representative types that earn leaderboard credit, in PREFERENCE order.
// The CompanyRepresentative is AccuLynx's "Primary Salesperson" (present on 100% of
// jobs). SalesOwner is a separate secondary/manager role that appears on ~12% of jobs
// and, when present, is a DIFFERENT person — so it must NOT take precedence; keep it
// only as a fallback for the rare job with no CompanyRepresentative.
// (Verified against live AccuLynx data via read-only probe, 2026-07-02.)
export const REP_TYPES = ["CompanyRepresentative", "SalesOwner"];

// Map an AccuLynx milestone (stage) name -> count metric.
export const STAGE_TO_METRIC: Record<string, Exclude<Metric, "revenue">> = {
  Prospect: "filed",
  Approved: "won",
};

// Revenue: sum this financials field, credited at this milestone's date.
export const REVENUE_FIELD = "approvedJobValue";
export const REVENUE_STAGE = "Approved";
