// src/lib/repcard/branches.ts
// Pure, import-free. Folds RepCard's several offices (and AccuLynx city locations)
// into Miller Storm's THREE real branches. Business rules confirmed 2026-07-11:
//   Fort Worth  (mgr Gunner)          <- Fort Worth Office
//   Dallas      (mgr Mike Muscari)    <- Dallas Office
//   West Texas  (mgr Daniel Sabedra)  <- Round Rock, Lubbock, Levelland, Corpus Christi
// "Commercial" is a division, not a branch -> unmapped (""), so it never shows.

export const BRANCHES = ["Fort Worth", "Dallas", "West Texas"] as const;

// Fixed display/sort order. Commercial is not a real branch, but if a Commercial
// rep ever appears on the board we label it rather than leaving it blank.
export const BRANCH_ORDER: Record<string, number> = {
  "Fort Worth": 0,
  Dallas: 1,
  "West Texas": 2,
  Commercial: 3,
};

// Map any office / location string to one of the three branches (or "Commercial"
// for the commercial division). Keyword-based so new West Texas offices (e.g. a
// future Midland or Odessa office) map automatically. "" only for truly unknown.
export function officeToBranch(office?: string | null): string {
  const s = (office || "").toLowerCase();
  if (!s) return "";
  if (s.includes("fort worth")) return "Fort Worth";
  if (s.includes("dallas")) return "Dallas";
  if (/west texas|lubbock|round\s*rock|levelland|corpus|midland|odessa|amarillo|abilene|san angelo/.test(s)) {
    return "West Texas";
  }
  if (s.includes("commercial")) return "Commercial";
  return ""; // truly unrecognized -> no branch
}

// Which display branch a SALE counts toward, from the AccuLynx sub-account it was filed
// in (ScoringFact.location). Lubbock / Round Rock / Corpus roll up to West Texas;
// Commercial to Commercial. The shared "DFW" sub-account can't be split Fort Worth vs
// Dallas by location (those two are team-based, not geographic), so it returns "DFW" and
// the caller resolves it to the rep's home branch. Verified 2026-07-15: sub-account region
// matches the customer-city region 100% of the time, with zero coverage gaps.
export function saleRegion(location?: string | null): "West Texas" | "Commercial" | "DFW" {
  const s = (location || "").toLowerCase();
  if (/lubbock|round\s*rock|corpus|levelland|midland|odessa|amarillo|abilene|san angelo/.test(s)) return "West Texas";
  if (s.includes("commercial")) return "Commercial";
  return "DFW";
}

// ---------------------------------------------------------------------------
// Which branch a rep's numbers count toward.
//
// TEAM-BASED reporting (Jay and Nadine, 2026-08-12, confirmed 2026-08-21): a
// rep's numbers count toward the branch their TEAM belongs to, whichever
// AccuLynx sub-account a job was filed in. Since 2026-10-07 this is judged PER
// DAY from the rep's team history: a rep who moved mid-period has their numbers
// split between the old and new team/branch (segments on each leaderboard row,
// teamhistory/segments.ts). This deliberately REVERSES the earlier rule that a
// rep sits under exactly one branch with their full numbers.
// Spec: docs/superpowers/specs/2026-10-07-team-history-um-design.md.
