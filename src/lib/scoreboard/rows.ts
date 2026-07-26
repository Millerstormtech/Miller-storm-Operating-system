import type { SalesLeaderRow } from "../leaderboard/compute";
import type { SalesRow } from "./types";

// The ONE place the leaderboard's vocabulary translates into the scoreboard's.
// Leaderboard: verifiedKnocks / filed / won. Scoreboard: knocks / claims / contracts.
export function toSalesRow(r: SalesLeaderRow): SalesRow {
  return {
    repUserId: r.repUserId,
    name: r.name,
    team: r.team,
    branch: r.branch,
    revenue: r.revenue,
    knocks: r.verifiedKnocks,
    claims: r.filed,
    contracts: r.won,
    active: r.active,
  };
}
