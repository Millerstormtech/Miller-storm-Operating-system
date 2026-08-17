import { describe, it, expect } from "vitest";
import { pickContractKing, pickYtdPodium, kingMonthLabel, type KingCandidate } from "./contractKing";

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

describe("pickYtdPodium", () => {
  it("returns gold, silver and bronze in order", () => {
    const podium = pickYtdPodium([
      rep({ id: "c", name: "Cara", revenue: 944200 }),
      rep({ id: "a", name: "Mike", revenue: 1482300 }),
      rep({ id: "b", name: "Daniel", revenue: 1285900 }),
    ]);
    expect(podium.map((p) => [p.place, p.name])).toEqual([
      [1, "Mike"],
      [2, "Daniel"],
      [3, "Cara"],
    ]);
  });

  it("chains the gap to the rep directly above, not to first place", () => {
    const podium = pickYtdPodium([
      rep({ id: "a", name: "Mike", revenue: 1482300 }),
      rep({ id: "b", name: "Daniel", revenue: 1285900 }),
      rep({ id: "c", name: "Cara", revenue: 944200 }),
    ]);
    expect(podium[0].behindBy).toBeNull();
    expect(podium[0].behindName).toBeNull();
    expect(podium[1]).toMatchObject({ behindBy: 196400, behindName: "Mike" });
    // 341700 is the gap to Daniel. The gap to Mike would be 538100.
    expect(podium[2]).toMatchObject({ behindBy: 341700, behindName: "Daniel" });
  });

  it("never places anyone at zero or below", () => {
    expect(pickYtdPodium([rep({ id: "a", revenue: 0 }), rep({ id: "b", revenue: -50 })])).toEqual([]);
  });

  it("returns only the places that exist when fewer than three have earned", () => {
    const one = pickYtdPodium([rep({ id: "a", name: "Solo", revenue: 500 }), rep({ id: "b", revenue: 0 })]);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ place: 1, behindBy: null });

    const two = pickYtdPodium([
      rep({ id: "a", name: "First", revenue: 900 }),
      rep({ id: "b", name: "Second", revenue: 400 }),
    ]);
    expect(two).toHaveLength(2);
    expect(two[1]).toMatchObject({ place: 2, behindBy: 500, behindName: "First" });
  });

  it("caps at three even when more reps have earned", () => {
    const podium = pickYtdPodium(
      [5, 4, 3, 2, 1].map((n) => rep({ id: `r${n}`, name: `R${n}`, revenue: n * 1000 }))
    );
    expect(podium).toHaveLength(3);
    expect(podium.map((p) => p.name)).toEqual(["R5", "R4", "R3"]);
  });

  it("breaks a revenue tie the same way the table does", () => {
    // Equal revenue: compareStanding falls through to jobs won.
    const podium = pickYtdPodium([
      rep({ id: "a", name: "Alice", revenue: 1000, won: 2 }),
      rep({ id: "b", name: "Bob", revenue: 1000, won: 7 }),
    ]);
    expect(podium.map((p) => p.name)).toEqual(["Bob", "Alice"]);
    // A tie means a gap of zero, not a missing gap.
    expect(podium[1].behindBy).toBe(0);
  });

  it("does not mutate the array it was given", () => {
    const rows = [rep({ id: "a", revenue: 1 }), rep({ id: "b", revenue: 9 })];
    const order = rows.map((r) => r.id);
    pickYtdPodium(rows);
    expect(rows.map((r) => r.id)).toEqual(order);
  });
});
