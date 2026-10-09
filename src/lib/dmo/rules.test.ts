import { describe, it, expect } from "vitest";
import {
  incomePlan, paceFor, barColour, bars, weekPeriod, awayDaysInWeek, rampDay, minimumChip,
  monthlyContractAverage, groupColour, checkCommitment, FLOOR_MESSAGE, adjustmentsFor,
  originalCommitment, sumCommitments, formState,
} from "./rules";

describe("incomePlan (Jay's example)", () => {
  it("$10,000 at $5,000 a roof is 2 roofs and 4 claims", () => {
    expect(incomePlan(10_000, 5_000, 31)).toEqual({ roofsNeeded: 2, claimsNeeded: 4, weeklyClaims: 0.9 });
  });
  it("rounds roofs up: $12,000 at $5,000 is 3 roofs, 6 claims", () => {
    expect(incomePlan(12_000, 5_000, 28)).toMatchObject({ roofsNeeded: 3, claimsNeeded: 6, weeklyClaims: 1.5 });
  });
  it("returns null until both numbers are entered", () => {
    expect(incomePlan(0, 5_000, 30)).toBeNull();
    expect(incomePlan(10_000, 0, 30)).toBeNull();
  });
});

describe("pace and bar colours", () => {
  it("spreads a weekly target over all 7 days", () => {
    expect(paceFor(140, 1, 7)).toBe(20);
    expect(paceFor(140, 4, 7)).toBe(80);
    expect(paceFor(140, 7, 7)).toBe(140);
  });
  it("is green at pace, yellow from 70% of pace, red below", () => {
    expect(barColour(100, 200, 100, false)).toBe("green");
    expect(barColour(70, 200, 100, false)).toBe("yellow");
    expect(barColour(69, 200, 100, false)).toBe("red");
  });
  it("once the period ends, only hitting the target is green", () => {
    expect(barColour(199, 200, 200, true)).toBe("red");
    expect(barColour(200, 200, 200, true)).toBe("green");
  });
  it("a zero target is always green, and gets no bar", () => {
    expect(barColour(0, 0, paceFor(0, 3, 7), false)).toBe("green");
    expect(bars({ doors: 5, claims: 0, contracts: 0, contractDollars: 0 }, { doors: 0, claims: 1 }, { presentDays: 7, elapsedPresentDays: 3, ended: false }).map((b) => b.field)).toEqual(["claims"]);
  });
  it("whole-number goals round the pace down; dollars do not", () => {
    const wed = { presentDays: 7, elapsedPresentDays: 3, ended: false };
    const [claims, dollars] = bars({ doors: 0, claims: 0, contracts: 0, contractDollars: 0 }, { claims: 1, contractDollars: 7000 }, wed);
    expect(claims).toMatchObject({ pace: 0, colour: "green" }); // not red for missing 0.43 of a claim
    expect(dollars.pace).toBe(3000);
  });
  it("makes one bar per committed field and skips the rest", () => {
    const b = bars(
      { doors: 64, claims: 0, contracts: 0, contractDollars: 0 },
      { doors: 140, claims: 2, contracts: null },
      { presentDays: 7, elapsedPresentDays: 4, ended: false }
    );
    expect(b.map((x) => [x.field, x.pace, x.colour])).toEqual([
      ["doors", 80, "yellow"],
      ["claims", 1, "red"], // 2 x 4/7 = 1.14 rounds down to 1 claim
    ]);
  });
});

describe("away days", () => {
  const weekOf = "2026-10-03"; // Saturday
  it("counts only the days inside the week", () => {
    expect(awayDaysInWeek(weekOf, { from: "2026-10-01", to: "2026-10-04" })).toEqual(["2026-10-03", "2026-10-04"]);
    expect(awayDaysInWeek(weekOf, null)).toEqual([]);
  });
  it("stops the pace line on away days without lowering the target", () => {
    // Away Mon-Wed (days 3-5). On Thursday (day 6): 3 present days so far of 4.
    const p = weekPeriod(weekOf, 6, { from: "2026-10-05", to: "2026-10-07" });
    expect(p).toEqual({ presentDays: 4, elapsedPresentDays: 3, ended: false });
    expect(paceFor(100, p.elapsedPresentDays, p.presentDays)).toBe(75);
  });
  it("a whole week away has no present days", () => {
    expect(weekPeriod(weekOf, 3, { from: "2026-10-03", to: "2026-10-09" }).presentDays).toBe(0);
  });
  it("the week is over from day 8", () => {
    expect(weekPeriod(weekOf, 8, null)).toEqual({ presentDays: 7, elapsedPresentDays: 7, ended: true });
  });
});

describe("ramp (first 90 days from the first verified knock)", () => {
  it("day 1 is the first knock day; day 90 is still ramp; day 91 is not", () => {
    expect(rampDay("2026-07-01", "2026-07-01")).toBe(1);
    expect(rampDay("2026-07-01", "2026-09-28")).toBe(90);
    expect(rampDay("2026-07-01", "2026-09-29")).toBeNull();
  });
  it("no knock yet is day 0 of ramp", () => {
    expect(rampDay(null, "2026-10-05")).toBe(0);
  });
});

describe("minimum chip", () => {
  const base = {
    doors: 0, claims: 0, contractValueLast90Days: 0,
    firstKnockDay: "2025-01-01", today: "2026-10-07",
    period: { presentDays: 7, elapsedPresentDays: 4, ended: false },
  };
  it("100 doors OR 1 claim OR the $40K average, any one is enough", () => {
    expect(minimumChip({ ...base, doors: 100 }).state).toBe("met");
    expect(minimumChip({ ...base, claims: 1 }).state).toBe("met");
    expect(minimumChip({ ...base, contractValueLast90Days: 120_000 }).state).toBe("at-contract");
    expect(monthlyContractAverage(119_999)).toBeLessThan(40_000);
  });
  it("otherwise judges doors against the 100-door pace", () => {
    // day 4 of 7: pace 57 (rounded down), yellow from 39.9
    expect(minimumChip({ ...base, doors: 58 }).state).toBe("on-pace");
    expect(minimumChip({ ...base, doors: 40 }).state).toBe("at-risk");
    expect(minimumChip({ ...base, doors: 39 }).state).toBe("off-pace");
  });
  it("is red once the week ended unmet", () => {
    expect(minimumChip({ ...base, doors: 99, period: { presentDays: 7, elapsedPresentDays: 7, ended: true } })).toMatchObject({ state: "missed", colour: "red" });
  });
  it("ramp and away are grey (no colour)", () => {
    expect(minimumChip({ ...base, firstKnockDay: "2026-09-01" })).toMatchObject({ state: "ramp", colour: null, rampDay: 37 });
    expect(minimumChip({ ...base, period: { presentDays: 0, elapsedPresentDays: 0, ended: false } })).toMatchObject({ state: "away", colour: null });
  });
});

describe("team colour", () => {
  it("green only when every counted member is green", () => {
    expect(groupColour(["green", "green", null]).colour).toBe("green");
  });
  it("yellow from 75%, red below; grey members are not counted", () => {
    expect(groupColour(["green", "green", "green", "red"]).colour).toBe("yellow"); // 75%
    expect(groupColour(["green", "green", "red", "red"]).colour).toBe("red"); // 50%
    expect(groupColour(["green", "green", "green", "yellow", null])).toEqual({ colour: "yellow", green: 3, counted: 4 });
  });
  it("is null when nobody counts yet", () => {
    expect(groupColour([null, null]).colour).toBeNull();
  });
});

describe("commitment floor", () => {
  const ok = { doors: 100, claims: 0, contracts: 0, contractDollars: 0 };
  it("accepts 100 doors or 1 claim", () => {
    expect(checkCommitment(ok, false)).toBeNull();
    expect(checkCommitment({ ...ok, doors: 0, claims: 1 }, false)).toBeNull();
  });
  it("rejects below the minimum unless exempt", () => {
    expect(checkCommitment({ ...ok, doors: 99 }, false)).toBe(FLOOR_MESSAGE);
    expect(checkCommitment({ ...ok, doors: 0 }, true)).toBeNull();
  });
  it("rejects missing, negative or fractional counts", () => {
    expect(checkCommitment({ doors: 100, claims: 0, contracts: 0 }, false)).toMatch(/every box/);
    expect(checkCommitment({ ...ok, claims: -1 }, false)).toMatch(/every box/);
    expect(checkCommitment({ ...ok, doors: 100.5 }, false)).toMatch(/whole numbers/);
    expect(checkCommitment({ ...ok, contractDollars: 1500.5 }, false)).toBeNull();
  });
});

describe("Team Lead adjustments", () => {
  const at = new Date("2026-10-09T20:00:00Z");
  const current = { doors: 100, claims: 1, contracts: 0, contractDollars: 0 };
  it("records only the fields that change", () => {
    expect(adjustmentsFor(current, { doors: 150, claims: 1 }, "tl1", at)).toEqual([
      { field: "doors", from: 100, to: 150, byUserId: "tl1", at },
    ]);
  });
  it("recovers what the rep first committed to", () => {
    const adj = [
      { field: "doors" as const, from: 100, to: 150, byUserId: "tl1", at },
      { field: "doors" as const, from: 150, to: 200, byUserId: "bm1", at },
    ];
    expect(originalCommitment({ ...current, doors: 200 }, adj).doors).toBe(100);
  });
  it("adds commitments up for the roll-up", () => {
    expect(sumCommitments([current, { doors: 200, claims: 2, contracts: 1, contractDollars: 20_000 }])).toEqual({
      doors: 300, claims: 3, contracts: 1, contractDollars: 20_000,
    });
  });
});

describe("form state", () => {
  const d = { opens: new Date("2026-10-08T05:00:00Z"), due: new Date("2026-10-09T18:00:00Z") };
  it("not open, due, overdue", () => {
    expect(formState(new Date("2026-10-07T12:00:00Z"), d, null)).toBe("not-open");
    expect(formState(new Date("2026-10-09T17:59:00Z"), d, null)).toBe("due");
    expect(formState(new Date("2026-10-09T18:00:00Z"), d, null)).toBe("overdue");
  });
  it("done on time or late", () => {
    expect(formState(new Date(), d, new Date("2026-10-09T17:00:00Z"))).toBe("done");
    expect(formState(new Date(), d, new Date("2026-10-09T18:30:00Z"))).toBe("late");
  });
});
