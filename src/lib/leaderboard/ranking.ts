// src/lib/leaderboard/ranking.ts
// Single source of truth for how the sales leaderboard breaks ties. Used both by
// the API (to stamp each rep's rank) and by the board component (to order the table,
// including the tie-break when a user clicks a different column). Keeping ONE
// definition means the server rank and the on-screen order can never drift apart.
//
// Order: Contract Amount -> Contracts -> Claims Filed -> Leads Created ->
// Verified Door Knocks. Higher is always better, so this compares DESCENDING:
// a NEGATIVE result means `a` outranks `b` (comes first).

export interface StandingFields {
  revenue?: number;      // Contract Amount (dollars)
  won?: number;          // Contracts (count of signed deals)
  filed?: number;        // Claims Filed
  lead?: number;         // Leads Created (API MergedRow field name)
  leadsCreated?: number; // Leads Created (shaped client-row field name)
  verifiedKnocks?: number;
}

// The API MergedRow calls it `lead`; the client row calls it `leadsCreated`.
// Tolerate both so this one comparator serves both sides.
const leadsOf = (r: StandingFields) => r.lead ?? r.leadsCreated ?? 0;

export function compareStanding(a: StandingFields, b: StandingFields): number {
  return (
    (b.revenue ?? 0) - (a.revenue ?? 0) ||
    (b.won ?? 0) - (a.won ?? 0) ||
    (b.filed ?? 0) - (a.filed ?? 0) ||
    leadsOf(b) - leadsOf(a) ||
    (b.verifiedKnocks ?? 0) - (a.verifiedKnocks ?? 0)
  );
}
