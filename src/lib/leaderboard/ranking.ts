// src/lib/leaderboard/ranking.ts
// Single source of truth for how the sales leaderboard breaks ties. Used both by
// the API (to stamp each rep's rank) and by the board component (to order the table,
// including the tie-break when a user clicks a different column). Keeping ONE
// definition means the server rank and the on-screen order can never drift apart.
//
// Order: Contract Amount -> Contracts -> Claims Filed -> Leads Created ->
// Verified Door Knocks -> Name (alphabetical) -> id. Higher is always better on
// the numeric keys, so this compares DESCENDING: a NEGATIVE result means `a`
// outranks `b` (comes first).
//
// Determinism (why the last two keys exist): every key above can be tied at
// once, most visibly on the Day/Week views where many reps sit at zero across
// the board. `Array.prototype.sort` is stable, so a fully-tied comparator
// used to return 0 and let whatever order MongoDB's aggregation happened to
// return decide the row order -- which is NOT guaranteed among equal sort
// keys. A rep could refresh the page and swap places with a tied rep with no
// data change at all.
//
// Name was chosen over id as the first tie-break because it is what a viewer
// sees: two reps tied at zero sorting alphabetically is explicable ("we list
// ties alphabetically"); sorting by an internal id string is deterministic
// but arbitrary to look at. Name is already present on every row, so it costs
// nothing to read. Its one weakness is that names are not guaranteed unique
// (two reps can share "John Smith") and, being free text, could in principle
// be edited -- so name ALONE is not a safe final tie-break. id closes both
// gaps: it is the merge id (`rc:<repcardUserId>`), one per RepCard bucket by
// construction (src/lib/leaderboard/merge.ts), so it is both unique and
// stable over time. The composite -- name first for explicability, id last
// for a guaranteed-unique floor -- means two rows compare equal only when
// they are actually the same rep.
export interface StandingFields {
  revenue?: number;      // Contract Amount (dollars)
  won?: number;          // Contracts (count of signed deals)
  filed?: number;        // Claims Filed
  lead?: number;         // Leads Created (API MergedRow field name)
  leadsCreated?: number; // Leads Created (shaped client-row field name)
  verifiedKnocks?: number;
  name?: string;         // Tie-break 1: alphabetical, case-insensitive.
  id?: string;           // Tie-break 2 (final): guaranteed unique, unlike name.
}

// The API MergedRow calls it `lead`; the client row calls it `leadsCreated`.
// Tolerate both so this one comparator serves both sides.
const leadsOf = (r: StandingFields) => r.lead ?? r.leadsCreated ?? 0;

// Plain ordinal comparison (not localeCompare): the tie-break must stay fixed
// across environments/ICU versions since it is what keeps the row order the
// same between the server-assigned rank and re-sorts done in the browser.
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

export function compareStanding(a: StandingFields, b: StandingFields): number {
  return (
    (b.revenue ?? 0) - (a.revenue ?? 0) ||
    (b.won ?? 0) - (a.won ?? 0) ||
    (b.filed ?? 0) - (a.filed ?? 0) ||
    leadsOf(b) - leadsOf(a) ||
    (b.verifiedKnocks ?? 0) - (a.verifiedKnocks ?? 0) ||
    cmp((a.name ?? "").toLowerCase(), (b.name ?? "").toLowerCase()) ||
    cmp(a.id ?? "", b.id ?? "")
  );
}
