import { describe, it, expect } from "vitest";
import {
  buildScorecard, scorecardWindow, scorecardDateLabel, scorecardDue,
  SCORECARD_HYPE, SCORECARD_SIGNOFFS,
} from "./scorecard";

const w = (userId: string, name: string, metric: "filed" | "won", amount = 0) => ({ userId, name, metric, amount });

describe("scorecardWindow", () => {
  it("runs 22:00 Central yesterday to 22:00 Central today (CDT, UTC-5)", () => {
    const r = scorecardWindow(new Date("2026-10-15T03:00:00Z")); // 22:00 CDT Oct 14
    expect(r.date).toBe("2026-10-14");
    expect(r.start.toISOString()).toBe("2026-10-14T03:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-15T03:00:00.000Z");
  });
  it("is 25 hours long across the November DST change", () => {
    const r = scorecardWindow(new Date("2026-11-02T04:00:00Z")); // 22:00 CST Nov 1
    expect(r.date).toBe("2026-11-01");
    expect(r.end.getTime() - r.start.getTime()).toBe(25 * 3600 * 1000);
  });
  it("is 23 hours long across the March DST change", () => {
    const r = scorecardWindow(new Date("2027-03-15T03:00:00Z")); // 22:00 CDT Mar 14
    expect(r.date).toBe("2027-03-14");
    expect(r.end.getTime() - r.start.getTime()).toBe(23 * 3600 * 1000);
  });
});

describe("scorecardDateLabel", () => {
  it("formats as short weekday, month and day", () => {
    expect(scorecardDateLabel("2026-10-14")).toBe("Wed, Oct 14");
  });
});

describe("buildScorecard", () => {
  const date = "2026-10-14";

  it("quiet day (no wins) returns null even with knockers", () => {
    expect(buildScorecard({ date, wins: [], knockers: [{ userId: "k", name: "K", knocks: 50 }] })).toBeNull();
  });

  it("starts with the dated header", () => {
    const s = buildScorecard({ date, wins: [w("a", "Ann Lee", "filed")], knockers: [] })!;
    expect(s.text.startsWith("SCORECARD 🗣️ Wed, Oct 14\n\n")).toBe(true);
  });

  it("combines a rep's wins into one line", () => {
    const s = buildScorecard({ date, wins: [w("a", "Dan Sab", "won", 18400), w("a", "Dan Sab", "filed")], knockers: [] })!;
    expect(s.text).toContain("@Dan Sab SIGNED a $18,400 contract and FILED a claim! 💰");
    expect(s.text.match(/@Dan Sab /g)!.length).toBe(1);
  });

  it("counts multiple claims and multiple contracts", () => {
    const s = buildScorecard({ date, wins: [
      w("a", "Ann", "filed"), w("a", "Ann", "filed"),
      w("b", "Bo", "won", 30000), w("b", "Bo", "won", 31000),
    ], knockers: [] })!;
    expect(s.text).toContain("@Ann FILED 2 claims! 💪");
    expect(s.text).toContain("@Bo SIGNED 2 contracts ($61,000)! 🔒");
  });

  it("never prints $0: amount-free wording when the value is missing", () => {
    const s = buildScorecard({ date, wins: [w("a", "Ann", "won", 0)], knockers: [] })!;
    expect(s.text).toContain("@Ann SIGNED a contract! 🔒");
    expect(s.text).not.toContain("$0");
    const m = buildScorecard({ date, wins: [w("a", "Ann", "won", 0), w("a", "Ann", "won", 0)], knockers: [] })!;
    expect(m.text).toContain("@Ann SIGNED 2 contracts! 🔒");
  });

  it("orders contract reps by dollars, then claim-only reps by count, ties by name", () => {
    const s = buildScorecard({ date, wins: [
      w("c", "Cy", "filed"),
      w("z", "Zed", "filed"), w("z", "Zed", "filed"),
      w("s", "Small", "won", 1000),
      w("b", "Big", "won", 50000),
      w("a", "Al", "filed"),
    ], knockers: [] })!;
    const order = ["@Big ", "@Small ", "@Zed ", "@Al ", "@Cy "].map((t) => s.text.indexOf(t));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("adds top knockers, max 3, highest first", () => {
    const s = buildScorecard({ date, wins: [w("a", "Ann", "filed")], knockers: [
      { userId: "1", name: "One", knocks: 80 }, { userId: "2", name: "Two", knocks: 112 },
      { userId: "3", name: "Three", knocks: 98 }, { userId: "4", name: "Four", knocks: 10 },
    ] })!;
    expect(s.text).toContain("Top knockers today 🚪\n@Two 112 · @Three 98 · @One 80\n");
    expect(s.text).not.toContain("@Four");
  });

  it("omits the knockers section when nobody knocked", () => {
    const s = buildScorecard({ date, wins: [w("a", "Ann", "filed")], knockers: [{ userId: "1", name: "Z", knocks: 0 }] })!;
    expect(s.text).not.toContain("Top knockers");
  });

  it("mentions every named rep once, in a way the chat matcher detects", () => {
    const s = buildScorecard({ date, wins: [w("a", " Ann Lee ", "filed")], knockers: [{ userId: "a", name: "Ann Lee", knocks: 5 }] })!;
    expect(s.mentionIds).toEqual(["a"]);
    expect(s.text).toMatch(/@Ann Lee\s/);
  });

  it("skips a rep with a blank name rather than printing a bare @", () => {
    const s = buildScorecard({ date, wins: [w("a", "  ", "filed"), w("b", "Bo", "filed")], knockers: [] })!;
    expect(s.text).not.toMatch(/@\s/);
    expect(s.mentionIds).toEqual(["b"]);
    expect(buildScorecard({ date, wins: [w("a", "", "filed")], knockers: [] })).toBeNull();
  });

  it("is deterministic and contains no em dash", () => {
    const input = { date, wins: [w("a", "Ann", "won", 5000), w("b", "Bo", "filed")], knockers: [] };
    expect(buildScorecard(input)!.text).toBe(buildScorecard(input)!.text);
    expect(buildScorecard(input)!.text).not.toContain("—");
    for (const p of [...SCORECARD_HYPE, ...SCORECARD_SIGNOFFS]) expect(p).not.toContain("—");
  });

  it("ends with a sign-off from the pool", () => {
    const s = buildScorecard({ date, wins: [w("a", "Ann", "filed")], knockers: [] })!;
    const last = s.text.trim().split("\n").pop()!;
    expect(SCORECARD_SIGNOFFS).toContain(last);
  });
});

describe("scorecardDue", () => {
  it("is false at 21:59 Central (window end is still in the future)", () => {
    expect(scorecardDue(new Date("2026-10-15T02:59:00Z"))).toBe(false);
  });
  it("is true at exactly 22:00 Central", () => {
    expect(scorecardDue(new Date("2026-10-15T03:00:00Z"))).toBe(true);
  });
  it("is true at 23:30 Central", () => {
    expect(scorecardDue(new Date("2026-10-15T04:30:00Z"))).toBe(true);
  });
});
