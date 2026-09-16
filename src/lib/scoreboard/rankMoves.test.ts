import { describe, it, expect } from "vitest";
import { monthKey, weekKey, rankDeltas, shouldCelebrateRankMove, rankMoveCopy, weekStartMonday } from "./rankMoves";

describe("monthKey and weekKey", () => {
  it("cuts a day down to its month", () => {
    expect(monthKey("2026-09-16")).toBe("2026-09");
    expect(monthKey("")).toBe("");
  });
  it("names a week by its Monday", () => {
    expect(weekKey(new Date(Date.UTC(2026, 8, 14)))).toBe("2026-09-14");
  });
  it("uses the app's Monday rule", () => {
    // Wednesday 16 September 2026 belongs to the week of Monday the 14th.
    expect(weekKey(weekStartMonday(new Date(Date.UTC(2026, 8, 16, 13, 30))))).toBe("2026-09-14");
    // Sunday belongs to the week that started six days earlier, not the next one.
    expect(weekKey(weekStartMonday(new Date(Date.UTC(2026, 8, 20, 23, 0))))).toBe("2026-09-14");
  });
});

describe("rankDeltas", () => {
  const current = [
    { id: "rc:1", rank: 1 },
    { id: "rc:2", rank: 2 },
    { id: "rc:3", rank: 3 },
    { id: "rc:new", rank: 4 },
  ];
  const previous = [
    { repId: "rc:1", rank: 3 },
    { repId: "rc:2", rank: 2 },
    { repId: "rc:3", rank: 1 },
  ];

  it("counts places gained as positive", () => {
    expect(rankDeltas(current, previous).get("rc:1")).toBe(2);
  });
  it("counts places lost as negative", () => {
    expect(rankDeltas(current, previous).get("rc:3")).toBe(-2);
  });
  it("says nothing changed with a zero", () => {
    expect(rankDeltas(current, previous).get("rc:2")).toBe(0);
  });
  it("has nothing to say about a rep who was not ranked last week", () => {
    expect(rankDeltas(current, previous).get("rc:new")).toBe(null);
  });
  it("gives every current rep an answer, and invents none", () => {
    const deltas = rankDeltas(current, previous);
    expect(deltas.size).toBe(4);
    expect(deltas.has("rc:gone")).toBe(false);
  });
  it("returns nulls when there is no previous week at all", () => {
    const deltas = rankDeltas(current, []);
    expect([...deltas.values()].every((v) => v === null)).toBe(true);
  });
});

describe("shouldCelebrateRankMove", () => {
  it("celebrates a climb once in a week", () => {
    expect(shouldCelebrateRankMove(2, null, "2026-09-14")).toBe(true);
    expect(shouldCelebrateRankMove(2, "2026-09-14", "2026-09-14")).toBe(false);
    expect(shouldCelebrateRankMove(2, "2026-09-07", "2026-09-14")).toBe(true);
  });
  it("never celebrates standing still, slipping, or an unknown", () => {
    expect(shouldCelebrateRankMove(0, null, "2026-09-14")).toBe(false);
    expect(shouldCelebrateRankMove(-3, null, "2026-09-14")).toBe(false);
    expect(shouldCelebrateRankMove(null, null, "2026-09-14")).toBe(false);
    expect(shouldCelebrateRankMove(undefined, null, "2026-09-14")).toBe(false);
  });
  it("stays quiet when the week is unknown", () => {
    expect(shouldCelebrateRankMove(2, null, "")).toBe(false);
  });
});

describe("rankMoveCopy", () => {
  it("uses the singular for one place", () => {
    expect(rankMoveCopy(1, 7).title).toBe("You moved up a place");
    expect(rankMoveCopy(1, 7).line).toBe("You are now number 7 in the company this month.");
  });
  it("counts more than one", () => {
    expect(rankMoveCopy(4, 3).title).toBe("You moved up 4 places");
  });
});
