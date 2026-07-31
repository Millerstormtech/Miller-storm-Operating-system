import { describe, it, expect } from "vitest";
import { pickContractKing, kingMonthLabel, type KingCandidate } from "./contractKing";

const rep = (over: Partial<KingCandidate> & { id: string }): KingCandidate => ({
  name: over.id, revenue: 0, won: 0, filed: 0, leadsCreated: 0, verifiedKnocks: 0, ...over,
});

describe("pickContractKing", () => {
  it("crowns the highest Contract Amount", () => {
    const king = pickContractKing([
      rep({ id: "a", name: "Alice", revenue: 120000 }),
      rep({ id: "b", name: "Bob", revenue: 320000 }),
      rep({ id: "c", name: "Cara", revenue: 95000 }),
    ]);
    expect(king).toEqual({ id: "b", name: "Bob", revenue: 320000 });
  });

  it("breaks a revenue tie on contracts, the board's own next tie-break", () => {
    const king = pickContractKing([
      rep({ id: "a", name: "Alice", revenue: 100000, won: 2 }),
      rep({ id: "b", name: "Bob", revenue: 100000, won: 5 }),
    ]);
    expect(king?.name).toBe("Bob");
  });

  it("falls through contracts to claims, then leads, then knocks", () => {
    const byClaims = pickContractKing([
      rep({ id: "a", name: "Alice", revenue: 100, won: 1, filed: 2 }),
      rep({ id: "b", name: "Bob", revenue: 100, won: 1, filed: 9 }),
    ]);
    expect(byClaims?.name).toBe("Bob");

    const byLeads = pickContractKing([
      rep({ id: "a", name: "Alice", revenue: 100, won: 1, filed: 1, leadsCreated: 3 }),
      rep({ id: "b", name: "Bob", revenue: 100, won: 1, filed: 1, leadsCreated: 8 }),
    ]);
    expect(byLeads?.name).toBe("Bob");

    const byKnocks = pickContractKing([
      rep({ id: "a", name: "Alice", revenue: 100, won: 1, filed: 1, leadsCreated: 1, verifiedKnocks: 10 }),
      rep({ id: "b", name: "Bob", revenue: 100, won: 1, filed: 1, leadsCreated: 1, verifiedKnocks: 40 }),
    ]);
    expect(byKnocks?.name).toBe("Bob");
  });

  it("returns null for an empty roster", () => {
    expect(pickContractKing([])).toBeNull();
  });

  it("returns null when nobody has any contract revenue yet this month", () => {
    // The normal state in the first days of a month: knocks and leads exist,
    // but nothing is signed. Nobody gets crowned for zero.
    expect(
      pickContractKing([
        rep({ id: "a", name: "Alice", revenue: 0, verifiedKnocks: 90, leadsCreated: 4 }),
        rep({ id: "b", name: "Bob", revenue: 0, verifiedKnocks: 120 }),
      ])
    ).toBeNull();
  });

  it("never crowns a rep on negative or missing revenue alone", () => {
    expect(pickContractKing([rep({ id: "a", revenue: -5000 })])).toBeNull();
    expect(pickContractKing([{ id: "a", name: "Alice" } as KingCandidate])).toBeNull();
  });

  it("still crowns the only rep with revenue among many without", () => {
    const king = pickContractKing([
      rep({ id: "a", name: "Alice", revenue: 0 }),
      rep({ id: "b", name: "Bob", revenue: 1 }),
      rep({ id: "c", name: "Cara", revenue: 0 }),
    ]);
    expect(king?.name).toBe("Bob");
  });

  it("does not mutate the array it was given", () => {
    const rows = [rep({ id: "a", revenue: 1 }), rep({ id: "b", revenue: 9 })];
    const order = rows.map((r) => r.id);
    pickContractKing(rows);
    expect(rows.map((r) => r.id)).toEqual(order);
  });
});

describe("kingMonthLabel", () => {
  it("names the month and year of the given date", () => {
    expect(kingMonthLabel("2026-07-31")).toBe("July 2026");
    expect(kingMonthLabel("2026-01-01")).toBe("January 2026");
    expect(kingMonthLabel("2026-12-15")).toBe("December 2026");
  });

  it("returns the input unchanged when it is not a plain ISO date", () => {
    expect(kingMonthLabel("nonsense")).toBe("nonsense");
  });
});
