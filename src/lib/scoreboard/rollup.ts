import type { SalesRow, Totals, Scope, ScoreSegment } from "./types";
import { pickSegments } from "../teamhistory/segments";

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

function segmentsOf(r: SalesRow): ScoreSegment[] {
  return r.segments && r.segments.length
    ? r.segments
    : [{ team: r.team || "", branch: r.branch || "", from: "", to: "", revenue: r.revenue, knocks: r.knocks, claims: r.claims, contracts: r.contracts }];
}

function matcher(scope: Scope): ((s: { team: string; branch: string }) => boolean) | null {
  if (scope.level === "team") return (s) => !!s.team && s.team === scope.team;
  if (scope.level === "branch") return (s) => !!s.branch && s.branch === scope.branch;
  return null;
}

// Generic so a caller can scope rows that carry extra fields (the Lowest knocks
// card keeps each row's leaderboard id) without a second copy of these rules.
//
// Team history (2026-10-07): in a team or branch scope each row becomes the SUM
// OF ITS IN-SCOPE SEGMENTS, tagged movedOut/joined. Kept when the rep currently
// belongs to the scope (idle members show) or produced something there; a former
// member with a zero share is dropped.
export function scopeRows<T extends SalesRow>(rows: T[], scope: Scope): T[] {
  if (scope.level === "self") return rows.filter((r) => r.repUserId != null && r.repUserId === scope.userId);
  const match = matcher(scope);
  if (!match) return rows;
  const out: T[] = [];
  for (const r of rows) {
    const { inScope, movedOut, joined } = pickSegments(segmentsOf(r), match);
    const current = match({ team: r.team || "", branch: r.branch || "" });
    if (inScope.length === 0 && !current) continue;
    const share = { revenue: 0, knocks: 0, claims: 0, contracts: 0 };
    for (const s of inScope) { share.revenue += s.revenue; share.knocks += s.knocks; share.claims += s.claims; share.contracts += s.contracts; }
    const nonZero = share.revenue || share.knocks || share.claims || share.contracts;
    if (!current && !nonZero) continue;
    out.push({ ...r, ...share, movedOut, joined });
  }
  return out;
}

/** In this scope for every day of [from, to]? (Lowest Knocks.) */
export function coversWindow(r: SalesRow, scope: Scope, from: string, to: string): boolean {
  const match = matcher(scope);
  if (!match) return true;
  if (!r.segments || r.segments.length === 0) return match({ team: r.team || "", branch: r.branch || "" });
  return pickSegments(r.segments, match).inScope.some((s) => s.from <= from && s.to >= to);
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
      // Departed reps (former:true) are not ranked — they don't occupy a slot
      // and don't inflate the "of N". Their dollars remain in the totals elsewhere.
      if (!r.former && r.repUserId != null) groups.set(r.repUserId, (groups.get(r.repUserId) ?? 0) + r.revenue);
    }
    return rankByRevenue(groups, scope.userId);
  }

  const keyOf = (s: { team: string; branch: string }) => (scope.level === "team" ? s.team : s.branch);
  const subject = scope.level === "team" ? scope.team : scope.branch;
  if (!subject) return null;
  const groups = new Map<string, number>();
  for (const r of rows) {
    for (const s of segmentsOf(r)) {
      const k = keyOf(s);
      if (!k) continue;
      groups.set(k, (groups.get(k) ?? 0) + s.revenue);
    }
  }
  return rankByRevenue(groups, subject);
}
