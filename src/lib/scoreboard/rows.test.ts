import { describe, it, expect } from "vitest";
import { toSalesRow } from "./rows";
import type { SalesLeaderRow } from "../leaderboard/compute";

const leaderRow: SalesLeaderRow = {
  id: "rc:1", name: "A Rep", branch: "Fort Worth", team: "Gunner",
  verifiedKnocks: 210, leadsCreated: 12, filed: 6, won: 2, revenue: 28400,
  repUserId: "u1", headshotUrl: "", isTeamLead: false, source: "both",
  active: true, byBranch: {},
};

describe("toSalesRow", () => {
  it("maps leaderboard vocabulary onto scoreboard vocabulary", () => {
    expect(toSalesRow(leaderRow)).toEqual({
      repUserId: "u1", name: "A Rep", team: "Gunner", branch: "Fort Worth",
      revenue: 28400, knocks: 210, claims: 6, contracts: 2, active: true,
    });
  });
  it("carries the departed-rep flag through", () => {
    expect(toSalesRow({ ...leaderRow, active: false }).active).toBe(false);
  });
});
