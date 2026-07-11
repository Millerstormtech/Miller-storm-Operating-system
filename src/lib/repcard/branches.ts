// src/lib/repcard/branches.ts
// Pure, import-free. Folds RepCard's several offices (and AccuLynx city locations)
// into Miller Storm's THREE real branches. Business rules confirmed 2026-07-11:
//   Fort Worth  (mgr Gunner)          <- Fort Worth Office
//   Dallas      (mgr Mike Muscari)    <- Dallas Office
//   West Texas  (mgr Daniel Sabedra)  <- Round Rock, Lubbock, Levelland, Corpus Christi
// "Commercial" is a division, not a branch -> unmapped (""), so it never shows.

export const BRANCHES = ["Fort Worth", "Dallas", "West Texas"] as const;
export type Branch = (typeof BRANCHES)[number] | "";

// Fixed display/sort order for the three branches.
export const BRANCH_ORDER: Record<string, number> = {
  "Fort Worth": 0,
  Dallas: 1,
  "West Texas": 2,
};

// Map any office / location string to one of the three branches, or "" if it
// doesn't belong to a branch (Commercial, unknown). Keyword-based so new West
// Texas offices (e.g. a future Midland or Odessa office) map automatically.
export function officeToBranch(office?: string | null): Branch {
  const s = (office || "").toLowerCase();
  if (!s) return "";
  if (s.includes("fort worth")) return "Fort Worth";
  if (s.includes("dallas")) return "Dallas";
  if (/west texas|lubbock|round\s*rock|levelland|corpus|midland|odessa|amarillo|abilene|san angelo/.test(s)) {
    return "West Texas";
  }
  return ""; // Commercial and anything unrecognized -> no branch
}
