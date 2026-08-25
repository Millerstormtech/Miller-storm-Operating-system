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
// Which branch a rep's numbers count toward on the sales leaderboard.
//
// TEAM-BASED reporting. Decided with Jay and Nadine on 2026-08-12 and confirmed
// on 2026-08-21 ("when we talked about the reporting approach, it will become
// team-based -- when I filter Fort Worth, the results reflect Gunner and the
// teams"). Every number a rep produces counts toward the branch their TEAM
// belongs to, whichever branch's AccuLynx sub-account the job was actually filed
// in. A Fort Worth rep who storm-chases West Texas carries those sales home to
// Fort Worth, because Fort Worth trains and manages that rep.
//
// This replaced LOCATION-based reporting, where a sale was re-attributed to the
// region it was filed in (West Texas / Commercial split out, only DFW sales
// followed the rep home). saleRegion() above is the surviving piece of that rule
// and is kept for the separate location-based override report.
//
// Consequences the callers rely on:
//   - a rep appears under exactly ONE branch, so a branch filter is a roster
//     filter, and Branch/Team stay meaningful next to a filtered row;
//   - the filtered numbers are the rep's FULL numbers, not a slice, so no metric
//     can disagree with another (knocks used to be the only metric pinned home);
//   - a rep with no resolvable branch appears under no branch at all.
export interface BranchTotals {
  verifiedKnocks: number;
  leadsCreated: number;
  filed: number;
  won: number;
  revenue: number;
}

export function attributeToBranch(
  homeBranch: string | null | undefined,
  totals: BranchTotals
): Record<string, BranchTotals> {
  if (!homeBranch) return {};
  return { [homeBranch]: { ...totals } };
}
