// src/lib/leaderboard/others.ts
// Pure, import-free. Sales by people who are NOT on the RepCard roster: office
// staff, owners, sellers who never knock. They get no row on any board, but their
// numbers belong in the company total and their branch total (Youssef, 2026-10-22,
// after the C-Level total came in $102k under AccuLynx). It is a rule, not a list
// of names: whoever's AccuLynx credit matches no board row lands here.
//
// Branch of such a sale: a West Texas sub-account (Lubbock, Round Rock, Corpus
// Christi) is West Texas whoever sold it. The shared DFW account cannot tell Fort
// Worth from Dallas, and these people have no team to decide it, so the Branch on
// their User Management profile does; with no profile branch the sale counts in
// the company total only (branch "").

export interface OtherSellerAgg {
  repExternalId: string;
  email: string;     // normalized
  location: string;  // ScoringFact.location (AccuLynx sub-account)
  lead: number;
  filed: number;
  won: number;
  revenue: number;
}

export interface OtherSales {
  branch: string; // "" = company total only
  lead: number;
  filed: number;
  won: number;
  revenue: number;
}

export function otherSalesByBranch(
  sellers: readonly OtherSellerAgg[],
  onBoard: ReadonlySet<string>,                 // repExternalIds that landed on a board row
  saleRegion: (location: string) => string,     // repcard/branches.ts saleRegion
  profileBranch: (email: string) => string      // "" when no profile or no Branch
): OtherSales[] {
  const byBranch = new Map<string, OtherSales>();
  for (const s of sellers) {
    if (onBoard.has(s.repExternalId)) continue;
    const region = saleRegion(s.location);
    const branch = region === "DFW" ? (s.email ? profileBranch(s.email) : "") : region;
    const b = byBranch.get(branch) ?? { branch, lead: 0, filed: 0, won: 0, revenue: 0 };
    b.lead += s.lead; b.filed += s.filed; b.won += s.won; b.revenue += s.revenue;
    byBranch.set(branch, b);
  }
  return [...byBranch.values()].sort((a, b) => a.branch.localeCompare(b.branch));
}

// Totals for a view: `branches` null = the whole company (every bucket, including
// branch ""); otherwise only the named branches. A team, a rep, or "(No branch)"
// is never a place these sales belong, so callers pass an empty set for those.
export function sumOtherSales(
  others: readonly OtherSales[],
  branches: ReadonlySet<string> | null
): { lead: number; filed: number; won: number; revenue: number } {
  const t = { lead: 0, filed: 0, won: 0, revenue: 0 };
  for (const o of others) {
    if (branches && (!o.branch || !branches.has(o.branch))) continue;
    t.lead += o.lead; t.filed += o.filed; t.won += o.won; t.revenue += o.revenue;
  }
  return t;
}

// The share a dashboard scope gets: the company everything, a branch its own,
// a team or a single rep nothing (these people are on no team).
export function otherSalesForScope(
  others: readonly OtherSales[],
  scope: { level: string; branch?: string | null }
): { lead: number; filed: number; won: number; revenue: number } {
  if (scope.level === "company") return sumOtherSales(others, null);
  if (scope.level === "branch") return sumOtherSales(others, new Set(scope.branch ? [scope.branch] : []));
  return sumOtherSales(others, new Set());
}
