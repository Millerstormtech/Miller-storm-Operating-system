import { describe, it, expect } from "vitest";
import {
  advanceHistory, moveBoundary, addPastMove, validateHistory, currentPeriod,
  periodsOverlapping, shiftDay, samePeriods, HISTORY_START, HistoryEditError, type Period,
} from "./periods";

const G = { team: "Gunner McCullough", branch: "Fort Worth" };
const D = { team: "Daniel Reyes", branch: "Fort Worth" };
const C = { team: "Cooper Bledsoe", branch: "Dallas" };
const NONE = { team: "", branch: "" };
const open = (p: { team: string; branch: string }): Period[] => [{ ...p, from: HISTORY_START, to: null, source: "initial" }];
const code = (fn: () => unknown) => { try { fn(); return "ok"; } catch (e) { return (e as HistoryEditError).code; } };

describe("advanceHistory", () => {
  it("a rep with no history starts at HISTORY_START as 'initial'", () => {
    expect(advanceHistory([], G, "2026-10-07")).toEqual(open(G));
  });
  it("no change returns the same array", () => {
    const h = open(G);
    expect(advanceHistory(h, G, "2026-10-07")).toBe(h);
  });
  it("a move closes yesterday and opens today", () => {
    expect(advanceHistory(open(G), D, "2026-09-16")).toEqual([
      { ...G, from: HISTORY_START, to: "2026-09-15", source: "initial" },
      { ...D, from: "2026-09-16", to: null, source: "sync" },
    ]);
  });
  it("uses the given source", () => {
    expect(advanceHistory(open(G), D, "2026-09-16", "backup")[1].source).toBe("backup");
  });
  it("taken off the sales side is an ordinary move to no team (D9)", () => {
    expect(advanceHistory(open(G), NONE, "2026-10-02")).toEqual([
      { ...G, from: HISTORY_START, to: "2026-10-01", source: "initial" },
      { ...NONE, from: "2026-10-02", to: null, source: "sync" },
    ]);
  });
  it("a second change the same day retargets today's period", () => {
    const h = advanceHistory(open(G), D, "2026-09-16");
    expect(advanceHistory(h, C, "2026-09-16")).toEqual([
      { ...G, from: HISTORY_START, to: "2026-09-15", source: "initial" },
      { ...C, from: "2026-09-16", to: null, source: "sync" },
    ]);
  });
  it("changing back the same day reopens the earlier period: no phantom move", () => {
    const h = advanceHistory(open(G), D, "2026-09-16");
    expect(advanceHistory(h, G, "2026-09-16")).toEqual(open(G));
  });
  it("every result is valid", () => {
    let h: Period[] = [];
    for (const [p, d] of [[G, "2026-02-01"], [D, "2026-03-01"], [C, "2026-03-01"], [NONE, "2026-04-10"], [G, "2026-05-01"]] as const) {
      h = advanceHistory(h, p, d);
      expect(validateHistory(h)).toBeNull();
    }
  });
});

describe("moveBoundary", () => {
  const h: Period[] = [
    { ...G, from: HISTORY_START, to: "2026-09-15", source: "initial" },
    { ...D, from: "2026-09-16", to: null, source: "backup" },
  ];
  it("moves the date both periods share", () => {
    expect(moveBoundary(h, 1, "2026-09-10", "2026-10-07")).toEqual([
      { ...G, from: HISTORY_START, to: "2026-09-09", source: "initial" },
      { ...D, from: "2026-09-10", to: null, source: "admin" },
    ]);
  });
  it("refuses the future, crossing a neighbor, and index 0", () => {
    expect(code(() => moveBoundary(h, 1, "2026-10-09", "2026-10-07"))).toBe("future");
    expect(code(() => moveBoundary(h, 1, HISTORY_START, "2026-10-07"))).toBe("crosses-previous");
    expect(code(() => moveBoundary(h, 0, "2026-02-01", "2026-10-07"))).toBe("no-previous");
    const three: Period[] = [h[0], { ...D, from: "2026-09-16", to: "2026-09-20", source: "sync" }, { ...C, from: "2026-09-21", to: null, source: "sync" }];
    expect(code(() => moveBoundary(three, 1, "2026-09-22", "2026-10-07"))).toBe("crosses-next");
  });
});

describe("addPastMove", () => {
  it("splits a period and gives the earlier part the chosen team", () => {
    expect(addPastMove(open(C), "2026-08-20", { team: "Jonathan Chambers", branch: "Fort Worth" }, "2026-10-07")).toEqual([
      { team: "Jonathan Chambers", branch: "Fort Worth", from: HISTORY_START, to: "2026-08-19", source: "admin" },
      { ...C, from: "2026-08-20", to: null, source: "initial" },
    ]);
  });
  it("takes a source for the backfill", () => {
    expect(addPastMove(open(D), "2026-09-16", G, "2026-10-07", "backup")[0].source).toBe("backup");
  });
  it("refuses the same team, a period's first day, and the future", () => {
    expect(code(() => addPastMove(open(C), "2026-08-20", C, "2026-10-07"))).toBe("same-team");
    expect(code(() => addPastMove(open(C), HISTORY_START, G, "2026-10-07"))).toBe("period-start");
    expect(code(() => addPastMove(open(C), "2026-10-09", G, "2026-10-07"))).toBe("future");
  });
});

describe("helpers", () => {
  it("shiftDay crosses months", () => expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30"));
  it("currentPeriod is the open one", () => {
    expect(currentPeriod(open(G))?.team).toBe("Gunner McCullough");
    expect(currentPeriod([{ ...G, from: HISTORY_START, to: "2026-02-01", source: "initial" }])).toBeNull();
  });
  it("periodsOverlapping selects, never clips", () => {
    const h: Period[] = [
      { ...G, from: HISTORY_START, to: "2026-09-15", source: "initial" },
      { ...D, from: "2026-09-16", to: null, source: "backup" },
    ];
    expect(periodsOverlapping(h, "2026-09-01", "2026-09-10")).toHaveLength(1);
    expect(periodsOverlapping(h, "2026-09-01", "2026-09-30")).toHaveLength(2);
  });
  it("validateHistory catches overlap and a non-last open period, allows gaps", () => {
    expect(validateHistory([{ ...G, from: HISTORY_START, to: "2026-02-01", source: "initial" }, { ...D, from: "2026-02-01", to: null, source: "sync" }])).toBe("overlap");
    expect(validateHistory([{ ...G, from: HISTORY_START, to: null, source: "initial" }, { ...D, from: "2026-03-01", to: null, source: "sync" }])).toBe("open-not-last");
    expect(validateHistory([{ ...G, from: HISTORY_START, to: "2026-02-01", source: "initial" }, { ...D, from: "2026-03-01", to: null, source: "sync" }])).toBeNull();
  });
  it("samePeriods compares values", () => {
    expect(samePeriods(open(G), [{ ...open(G)[0] }])).toBe(true);
    expect(samePeriods(open(G), open(D))).toBe(false);
  });
});
