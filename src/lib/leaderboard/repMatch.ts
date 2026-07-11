// src/lib/leaderboard/repMatch.ts
// Pure, import-free (so `node --test` can load it directly, like merge.ts/identity.ts).
// Bridges the leaderboard's RepCard-keyed merged rows to the DASHBOARD's need: rows
// keyed by Miller Storm APP-USER id, because the org hierarchy tree is built from
// app users' managerId. A merged rep with no matching app user is dropped — it can't
// be placed in the tree (they still appear on the transparent board, just not here).

export type MergedLite = {
  email: string; name: string;
  verifiedKnocks: number; filed: number; won: number; revenue: number;
};
export type AppUserLite = { id: string; email?: string; name?: string; managerId?: string };
export type RepMetric = {
  id: string; name: string; managerId: string;
  verifiedKnocks: number; filed: number; won: number; revenue: number;
};

export function matchRepsToUsers(merged: MergedLite[], appUsers: AppUserLite[]): RepMetric[] {
  const byEmail = new Map<string, AppUserLite>();
  for (const u of appUsers) {
    const e = (u.email || "").trim().toLowerCase();
    if (e) byEmail.set(e, u);
  }
  const out: RepMetric[] = [];
  for (const m of merged) {
    const u = m.email ? byEmail.get(m.email.trim().toLowerCase()) : undefined;
    if (!u) continue; // unmatched — cannot be placed in the hierarchy
    out.push({
      id: u.id,
      name: u.name || m.name,
      managerId: u.managerId || "",
      verifiedKnocks: m.verifiedKnocks || 0,
      filed: m.filed || 0,
      won: m.won || 0,
      revenue: m.revenue || 0,
    });
  }
  return out;
}
