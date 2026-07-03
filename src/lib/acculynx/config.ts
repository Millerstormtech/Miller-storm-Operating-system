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

// ---- Multi-location support ----
// Miller Storm runs a SEPARATE AccuLynx account per location, each with its OWN API
// key. There is no single "all locations" key (AccuLynx docs + verified 2026-07-03:
// each key's /company-settings resolves to one location). Every branch key is provided
// via env as ACCULYNX_API_KEY_<LOCATION>; the sync reads them all. A bare
// ACCULYNX_API_KEY is also honored for single-location / backward-compat setups.
export interface LocationKey {
  envVar: string;
  key: string;
}

export function getLocationKeys(env: Record<string, string | undefined> = process.env): LocationKey[] {
  const out: LocationKey[] = [];
  for (const [envVar, val] of Object.entries(env)) {
    if (!val || val.startsWith("PASTE")) continue; // skip empty / unfilled placeholders
    if (envVar === "ACCULYNX_API_KEY" || envVar.startsWith("ACCULYNX_API_KEY_")) {
      out.push({ envVar, key: val });
    }
  }
  return out;
}

// Turn an AccuLynx company name into a short branch label for the leaderboard:
//   "MSR - Lubbock"                                 -> "Lubbock"
//   "Miller Storm Roofing and Reconstruction - DFW" -> "DFW"
// Falls back to the trimmed full name when there is no " - " separator.
export function cleanBranchName(companyName: string): string {
  if (!companyName) return "Unknown";
  const idx = companyName.lastIndexOf(" - ");
  return (idx >= 0 ? companyName.slice(idx + 3) : companyName).trim() || "Unknown";
}
