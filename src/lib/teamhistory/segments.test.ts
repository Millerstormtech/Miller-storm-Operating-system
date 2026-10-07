import { describe, it, expect } from "vitest";
import { splitIntoSegments, wholeSegment, pickSegments, moveNote, shortDate, type DayTotals, type Segment } from "./segments";
import type { Period } from "./periods";

const G = { team: "Gunner McCullough", branch: "Fort Worth" };
const D = { team: "Daniel Reyes", branch: "Fort Worth" };
const hist: Period[] = [
  { ...G, from: "2026-01-01", to: "2026-09-15", source: "initial" },
  { ...D, from: "2026-09-16", to: null, source: "backup" },
];
const day = (d: string, revenue: number, verifiedKnocks = 0): DayTotals =>
  ({ day: d, revenue, verifiedKnocks, leadsCreated: 0, filed: 0, won: revenue > 0 ? 1 : 0 });
const sep = { from: "2026-09-01", to: "2026-09-30" };

describe("splitIntoSegments", () => {
  it("the move day belongs to the new team", () => {
    const s = splitIntoSegments([day("2026-09-15", 100), day("2026-09-16", 50)], hist, sep, G);
    expect(s.map((x) => [x.team, x.revenue, x.from, x.to])).toEqual([
      ["Gunner McCullough", 100, "2026-09-01", "2026-09-15"],
      ["Daniel Reyes", 50, "2026-09-16", "2026-09-30"],
    ]);
  });
  it("days before the first period or in a gap are never dropped", () => {
    const gapped: Period[] = [
      { ...G, from: "2026-09-05", to: "2026-09-10", source: "sync" },
      { ...D, from: "2026-09-20", to: null, source: "sync" },
    ];
    const s = splitIntoSegments([day("2026-09-02", 10), day("2026-09-12", 20), day("2026-09-25", 30)], gapped, sep, G);
    expect(s.reduce((n, x) => n + x.revenue, 0)).toBe(60);
    expect(s.find((x) => x.team === "Gunner McCullough")!.revenue).toBe(30);
  });
  it("no periods uses the fallback placement", () => {
    expect(splitIntoSegments([day("2026-09-10", 5)], [], sep, D)).toEqual([
      { ...D, from: sep.from, to: sep.to, revenue: 5, verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 1 },
    ]);
  });
  it("a period with no numbers still gets a zero segment", () => {
    const s = splitIntoSegments([day("2026-09-20", 50)], hist, sep, G);
    expect(s.map((x) => [x.team, x.revenue])).toEqual([["Gunner McCullough", 0], ["Daniel Reyes", 50]]);
  });
});

describe("wholeSegment", () => {
  it("clips the overlapping period to the range", () => {
    const s = wholeSegment({ revenue: 7, verifiedKnocks: 1, leadsCreated: 0, filed: 0, won: 0 }, hist, { from: "2026-10-01", to: "2026-10-31" }, G);
    expect(s).toMatchObject({ team: "Daniel Reyes", from: "2026-10-01", to: "2026-10-31", revenue: 7 });
  });
});

describe("pickSegments", () => {
  const segs: Segment[] = [
    { ...G, from: "2026-09-01", to: "2026-09-15", revenue: 100, verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 1 },
    { ...D, from: "2026-09-16", to: "2026-09-30", revenue: 50, verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 1 },
  ];
  it("old team: in scope first half, moved out", () => {
    const r = pickSegments(segs, (s) => s.team === "Gunner McCullough");
    expect(r.inScope).toHaveLength(1);
    expect(r.movedOut).toEqual({ team: "Daniel Reyes", branch: "Fort Worth", on: "2026-09-16" });
    expect(r.joined).toBeNull();
  });
  it("new team: joined", () => {
    const r = pickSegments(segs, (s) => s.team === "Daniel Reyes");
    expect(r.joined).toEqual({ from: "2026-09-16" });
    expect(r.movedOut).toBeNull();
  });
  it("both selected: whole, no tags", () => {
    const r = pickSegments(segs, () => true);
    expect(r.inScope).toHaveLength(2);
    expect(r.movedOut).toBeNull();
    expect(r.joined).toBeNull();
  });
});

describe("notes", () => {
  it("shortDate", () => expect(shortDate("2026-09-16")).toBe("16 Sep"));
  it("moveNote wording, no em dash", () => {
    expect(moveNote({ movedOut: { team: "Daniel Reyes", on: "2026-09-16" }, joined: null })).toBe("Moved to Daniel Reyes, 16 Sep");
    expect(moveNote({ movedOut: { team: "", on: "2026-10-02" }, joined: null })).toBe("Left the team, 2 Oct");
    expect(moveNote({ movedOut: null, joined: { from: "2026-09-16" } })).toBe("Joined 16 Sep");
    expect(moveNote({ movedOut: null, joined: null })).toBe("");
  });
});
