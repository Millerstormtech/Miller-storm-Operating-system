// src/lib/leaderboard/merge.ts
// Pure, import-free. RepCard is the SOLE GATE for who appears: a person is a sales rep
// only if they have a RepCard account with >= 1 verified knock. One bucket per RepCard
// rep. AccuLynx deal rows attach onto a bucket via email -> phone -> name (ONLY when that
// key maps to exactly one RepCard rep — ambiguity guard) to supply the sales numbers.
// AccuLynx credits with NO RepCard match are dropped entirely (they aren't door-knocking
// reps — e.g. managers-only, office/PM accounts, vendors, departed non-RepCard reps).
// Inputs are already normalized by the caller.

export interface AcxAgg { repExternalId: string; email: string; phone: string; nameKey: string; name: string; branch: string; filed: number; won: number; revenue: number; }
export interface RcAgg { repcardUserId: string; email: string; phone: string; nameKey: string; name: string; branch: string; verifiedKnocks: number; }
// source: "both" = RepCard rep with matched AccuLynx sales; "repcard" = RepCard rep with
// no matching AccuLynx sales (door-knocks only). There is no AccuLynx-only row anymore.
export interface MergedRow { id: string; name: string; branch: string; email: string; verifiedKnocks: number; filed: number; won: number; revenue: number; source: "both" | "repcard"; }

interface Bucket { id: string; name: string; branch: string; email: string; phone: string; nameKey: string; verifiedKnocks: number; filed: number; won: number; revenue: number; matched: boolean; }

// key -> the single bucket that owns it (only if exactly one bucket has that key).
function uniqueIndex(buckets: Bucket[], pick: (b: Bucket) => string): Map<string, Bucket> {
  const counts = new Map<string, number>();
  for (const b of buckets) { const k = pick(b); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  const idx = new Map<string, Bucket>();
  for (const b of buckets) { const k = pick(b); if (k && counts.get(k) === 1) idx.set(k, b); }
  return idx;
}

export function mergeLeaderboard(acx: AcxAgg[], rc: RcAgg[]): MergedRow[] {
  const buckets: Bucket[] = rc.map((r) => ({
    id: `rc:${r.repcardUserId}`, name: r.name, branch: r.branch,
    email: r.email, phone: r.phone, nameKey: r.nameKey,
    verifiedKnocks: r.verifiedKnocks, filed: 0, won: 0, revenue: 0, matched: false,
  }));

  const byEmail = uniqueIndex(buckets, (b) => b.email);
  const byPhone = uniqueIndex(buckets, (b) => b.phone);
  const byName = uniqueIndex(buckets, (b) => b.nameKey);

  for (const a of acx) {
    const target =
      (a.email && byEmail.get(a.email)) ||
      (a.phone && byPhone.get(a.phone)) ||
      (a.nameKey && byName.get(a.nameKey)) ||
      null;
    if (target) {
      target.filed += a.filed; target.won += a.won; target.revenue += a.revenue; target.matched = true;
      // RepCard doesn't carry a branch/office, so its spine rows are branchless.
      // Adopt the AccuLynx branch for any matched rep that has one — this is what
      // fills the Branch column for everyone with AccuLynx sales.
      if (!target.branch && a.branch) target.branch = a.branch;
    }
    // No `else`: AccuLynx credits with no RepCard rep are intentionally dropped —
    // they aren't door-knocking sales reps, so they don't belong on the board.
  }

  // Only RepCard reps with at least one verified knock make the board.
  return buckets
    .filter((b) => b.verifiedKnocks >= 1)
    .map((b) => ({
      id: b.id, name: b.name, branch: b.branch, email: b.email,
      verifiedKnocks: b.verifiedKnocks, filed: b.filed, won: b.won, revenue: b.revenue,
      source: b.matched ? "both" : "repcard",
    }));
}
