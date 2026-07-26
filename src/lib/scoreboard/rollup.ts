import type { SalesRow, Totals, Scope } from "./types";

export function sumTotals(rows: SalesRow[]): Totals {
  return rows.reduce<Totals>(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      knocks: a.knocks + r.knocks,
      claims: a.claims + r.claims,
      contracts: a.contracts + r.contracts,
    }),
    { revenue: 0, knocks: 0, claims: 0, contracts: 0 }
  );
}

export function scopeRows(rows: SalesRow[], scope: Scope): SalesRow[] {
  switch (scope.level) {
    case "self":
      return rows.filter((r) => r.repUserId != null && r.repUserId === scope.userId);
    case "team":
      return rows.filter((r) => !!r.team && r.team === scope.team);
    case "branch":
      return rows.filter((r) => !!r.branch && r.branch === scope.branch);
    case "company":
      return rows;
  }
}

// Rank a set of {key, revenue} groups, highest revenue first; ties broken by key asc
// so the order is deterministic. Returns the 1-based position of `subjectKey`, plus
// the group count, or null if the subject isn't present.
function rankByRevenue(
  groups: Map<string, number>,
  subjectKey: string
): { rank: number; of: number } | null {
  if (!groups.has(subjectKey)) return null;
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const idx = ordered.findIndex(([k]) => k === subjectKey);
  return { rank: idx + 1, of: ordered.length };
}

export function rankFor(rows: SalesRow[], scope: Scope): { rank: number; of: number } | null {
  if (scope.level === "company") return null;

  if (scope.level === "self") {
    if (scope.userId == null) return null;
    const groups = new Map<string, number>();
    for (const r of rows) {
      // Departed reps (active:false) are not ranked — they don't occupy a slot
      // and don't inflate the "of N". Their dollars remain in the totals elsewhere.
      if (r.active && r.repUserId != null) groups.set(r.repUserId, (groups.get(r.repUserId) ?? 0) + r.revenue);
    }
    return rankByRevenue(groups, scope.userId);
  }

  const keyOf = (r: SalesRow) => (scope.level === "team" ? r.team : r.branch);
  const subject = scope.level === "team" ? scope.team : scope.branch;
  if (!subject) return null;

  const groups = new Map<string, number>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue; // skip rows with no team/branch
    groups.set(k, (groups.get(k) ?? 0) + r.revenue);
  }
  return rankByRevenue(groups, subject);
}
