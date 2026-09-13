import { describe, it, expect } from "vitest";
import { lowestKnocks, lastCompleteDays, shiftDay, type KnockCandidate } from "./lowestKnocks";

const rep = (over: Partial<KnockCandidate>): KnockCandidate => ({
  id: over.name ? `rc:${over.name}` : "rc:x",
  repUserId: null,
  name: "",
  knocks: 0,
  former: false,
  isLeader: false,
  firstKnockDay: "2026-01-05",
  lastKnockDay: "2026-09-10",
  ...over,
});

const FROM = "2026-09-05";
const WIN = { from: FROM, to: "2026-09-11" };

describe("lastCompleteDays", () => {
  it("is the seven days ending yesterday in Central time", () => {
    // 15:00 UTC on Sept 12 is 10:00 Central on Sept 12.
    expect(lastCompleteDays(new Date("2026-09-12T15:00:00Z"))).toEqual({ from: "2026-09-05", to: "2026-09-11" });
  });

  it("uses the Central date, not the UTC date, late in the evening", () => {
    // 03:00 UTC on Sept 13 is still 22:00 Central on Sept 12, so yesterday is the 11th.
    expect(lastCompleteDays(new Date("2026-09-13T03:00:00Z"))).toEqual({ from: "2026-09-05", to: "2026-09-11" });
  });

  it("crosses month and year boundaries", () => {
    expect(lastCompleteDays(new Date("2026-01-03T18:00:00Z"))).toEqual({ from: "2025-12-27", to: "2026-01-02" });
  });
});

describe("shiftDay", () => {
  it("moves across a daylight-saving change without drifting a day", () => {
    expect(shiftDay("2026-11-02", -1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-07", 2)).toBe("2026-03-09");
  });
});

describe("lowestKnocks", () => {
  it("names the three reps with the fewest knocks, fewest first", () => {
    const rows = [
      rep({ name: "A", knocks: 40 }),
      rep({ name: "B", knocks: 3 }),
      rep({ name: "C", knocks: 12 }),
      rep({ name: "D", knocks: 8 }),
    ];
    expect(lowestKnocks(rows, WIN).map((r) => [r.name, r.knocks])).toEqual([["B", 3], ["D", 8], ["C", 12]]);
  });

  it("never names a former rep", () => {
    const rows = [rep({ name: "Gone", knocks: 0, former: true }), rep({ name: "Here", knocks: 5 })];
    expect(lowestKnocks(rows, WIN).map((r) => r.name)).toEqual(["Here"]);
  });

  it("leaves out a rep who started knocking after the window opened", () => {
    const rows = [
      rep({ name: "New", knocks: 1, firstKnockDay: "2026-09-08" }),
      rep({ name: "Day one", knocks: 2, firstKnockDay: FROM }),
      rep({ name: "Veteran", knocks: 9 }),
    ];
    expect(lowestKnocks(rows, WIN).map((r) => r.name)).toEqual(["Day one", "Veteran"]);
  });

  it("leaves out a rep with no recorded first knock rather than calling them a zero", () => {
    expect(lowestKnocks([rep({ name: "Unknown", knocks: 0, firstKnockDay: null, lastKnockDay: null })], WIN)).toEqual([]);
  });

  it("never names a team lead or branch manager", () => {
    const rows = [rep({ name: "Lead", knocks: 0, isLeader: true }), rep({ name: "Rep", knocks: 9 })];
    expect(lowestKnocks(rows, WIN).map((r) => r.name)).toEqual(["Rep"]);
  });

  it("leaves out anyone with no knock in the last 30 days: they have left, they are not low", () => {
    const rows = [
      // Window ends 2026-09-11, so the 30 days run 2026-08-13 to 2026-09-11.
      rep({ name: "Gone since June", knocks: 0, lastKnockDay: "2026-06-17" }),
      rep({ name: "One day too old", knocks: 0, lastKnockDay: "2026-08-12" }),
      rep({ name: "Just inside", knocks: 0, lastKnockDay: "2026-08-13" }),
      rep({ name: "Active", knocks: 5 }),
    ];
    expect(lowestKnocks(rows, WIN).map((r) => r.name)).toEqual(["Just inside", "Active"]);
  });

  it("breaks ties by who has gone longest without a knock", () => {
    const rows = [
      rep({ name: "Recent", knocks: 0, lastKnockDay: "2026-09-02" }),
      rep({ name: "Longest", knocks: 0, lastKnockDay: "2026-08-20" }),
      rep({ name: "Middle", knocks: 0, lastKnockDay: "2026-08-28" }),
      rep({ name: "Active", knocks: 4 }),
    ];
    expect(lowestKnocks(rows, WIN).map((r) => r.name)).toEqual(["Longest", "Middle", "Recent"]);
  });

  it("falls back to name order when knocks and last knock are both equal", () => {
    const rows = [
      rep({ name: "Zed", knocks: 0, lastKnockDay: "2026-08-20" }),
      rep({ name: "Amy", knocks: 0, lastKnockDay: "2026-08-20" }),
    ];
    expect(lowestKnocks(rows, WIN).map((r) => r.name)).toEqual(["Amy", "Zed"]);
  });

  it("returns fewer than three, or none, when that is all there is", () => {
    expect(lowestKnocks([rep({ name: "Only" })], WIN)).toHaveLength(1);
    expect(lowestKnocks([], WIN)).toEqual([]);
  });

  it("returns only the fields the card needs", () => {
    const [r] = lowestKnocks([rep({ name: "A", repUserId: "u1", knocks: 2 })], WIN);
    expect(r).toEqual({ id: "rc:A", repUserId: "u1", name: "A", knocks: 2, lastKnockDay: "2026-09-10" });
  });
});
