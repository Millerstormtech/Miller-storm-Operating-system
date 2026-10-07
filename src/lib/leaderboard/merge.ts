// src/lib/leaderboard/merge.ts
// Pure, import-free. One bucket per RepCard rep in the roster the CALLER supplies
// (the leaderboard API builds it: active door-knockers + in-range former reps). EVERY
// bucket is returned, so an idle roster rep survives as a zero row. AccuLynx deal rows
// attach onto a bucket via email -> phone -> name (ONLY when that key maps to exactly one
// RepCard rep — ambiguity guard) to supply the sales numbers. AccuLynx credits with NO
// RepCard match are dropped entirely (not door-knocking reps). Inputs are already
// normalized by the caller.

export interface AcxAgg { repExternalId: string; email: string; phone: string; nameKey: string; name: string; branch: string; lead: number; filed: number; won: number; revenue: number; }
export interface RcAgg { repcardUserId: string; email: string; phone: string; nameKey: string; name: string; branch: string; verifiedKnocks: number; }
// source: "both" = RepCard rep with matched AccuLynx sales; "repcard" = RepCard rep with
// no matching AccuLynx sales (door-knocks only). There is no AccuLynx-only row anymore.
export interface MergedRow { id: string; name: string; branch: string; email: string; verifiedKnocks: number; lead: number; filed: number; won: number; revenue: number; source: "both" | "repcard"; }

interface Bucket { id: string; name: string; branch: string; email: string; phone: string; nameKey: string; verifiedKnocks: number; lead: number; filed: number; won: number; revenue: number; matched: boolean; }

/**
 * Which RepCard row each AccuLynx rep merges into, by the same cascade the board
 * uses (email, then phone, then exact name, each only when it names exactly one
 * person). Exposed so team history can split a moved rep's AccuLynx numbers by day.
 */
export function matchAcxToRc(acx: readonly AcxAgg[], rc: RcAgg[]): Map<string, string> {
  const ids = rc.map((r) => ({ id: `rc:${r.repcardUserId}`, email: r.email, phone: r.phone, nameKey: r.nameKey }));
  const index = (pick: (b: typeof ids[number]) => string) => {
    const counts = new Map<string, number>();
    for (const b of ids) { const k = pick(b); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
    const idx = new Map<string, string>();
    for (const b of ids) { const k = pick(b); if (k && counts.get(k) === 1) idx.set(k, b.id); }
    return idx;
  };
  const byEmail = index((b) => b.email);
  const byPhone = index((b) => b.phone);
  const byName = index((b) => b.nameKey);
  const out = new Map<string, string>();
  for (const a of acx) {
    const id = (a.email && byEmail.get(a.email)) || (a.phone && byPhone.get(a.phone)) || (a.nameKey && byName.get(a.nameKey)) || "";
    if (id) out.set(a.repExternalId, id);
  }
  return out;
}

export function mergeLeaderboard(acx: readonly AcxAgg[], rc: RcAgg[]): MergedRow[] {
  const buckets: Bucket[] = rc.map((r) => ({
    id: `rc:${r.repcardUserId}`, name: r.name, branch: r.branch,
    email: r.email, phone: r.phone, nameKey: r.nameKey,
    verifiedKnocks: r.verifiedKnocks, lead: 0, filed: 0, won: 0, revenue: 0, matched: false,
  }));

  const target = matchAcxToRc(acx, rc);
  const bucketById = new Map(buckets.map((b) => [b.id, b] as [string, Bucket]));
  for (const a of acx) {
    const b = bucketById.get(target.get(a.repExternalId) || "");
    // No match: AccuLynx credits with no RepCard rep are intentionally dropped --
    // they aren't door-knocking sales reps, so they don't belong on the board.
    if (!b) continue;
    b.lead += a.lead; b.filed += a.filed; b.won += a.won; b.revenue += a.revenue; b.matched = true;
    // RepCard doesn't carry a branch/office, so its spine rows are branchless.
    // Adopt the AccuLynx branch for any matched rep that has one.
    if (!b.branch && a.branch) b.branch = a.branch;
  }

  // Return EVERY bucket the caller supplied (the roster is the gate, applied upstream).
  return buckets
    .map((b) => ({
      id: b.id, name: b.name, branch: b.branch, email: b.email,
      verifiedKnocks: b.verifiedKnocks, lead: b.lead, filed: b.filed, won: b.won, revenue: b.revenue,
      source: b.matched ? "both" : "repcard",
    }));
}
