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
