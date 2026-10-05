import { describe, it, expect } from "vitest";
import { dmoClock, weekOfDay, weeklyDeadlines, monthlyDeadlines, addDays, daysInMonth, nextMonth } from "./calendar";

describe("DMO calendar (Saturday to Friday, Central time)", () => {
  it("names a week by its Saturday", () => {
    expect(weekOfDay("2026-10-03")).toBe("2026-10-03"); // Saturday
    expect(weekOfDay("2026-10-09")).toBe("2026-10-03"); // Friday
    expect(weekOfDay("2026-10-10")).toBe("2026-10-10");
  });

  it("places now in the week and month, in Central time", () => {
    // Wed 2026-10-07 10:00 CDT
    expect(dmoClock(new Date("2026-10-07T15:00:00Z"))).toEqual({
      today: "2026-10-07",
      weekOf: "2026-10-03",
      dayOfWeek: 5,
      nextWeekOf: "2026-10-10",
      prevWeekOf: "2026-09-26",
      month: "2026-10",
      dayOfMonth: 7,
      daysInMonth: 31,
    });
  });

  it("Friday 11:30 PM Central is still day 7, even though UTC says Saturday", () => {
    const c = dmoClock(new Date("2026-10-10T04:30:00Z"));
    expect(c.today).toBe("2026-10-09");
    expect(c.dayOfWeek).toBe(7);
  });

  it("weekly DMO: opens Thursday 00:00, due Friday 1 PM, adjustments lock Friday 5 PM", () => {
    const d = weeklyDeadlines("2026-10-03");
    expect(d.opens.toISOString()).toBe("2026-10-08T05:00:00.000Z");
    expect(d.due.toISOString()).toBe("2026-10-09T18:00:00.000Z");
    expect(d.lock.toISOString()).toBe("2026-10-09T22:00:00.000Z");
  });

  it("weekly deadlines follow standard time after the November change", () => {
    expect(weeklyDeadlines("2026-11-07").due.toISOString()).toBe("2026-11-13T19:00:00.000Z"); // 1 PM CST
  });

  it("monthly DMO: opens on the last day of the month before, due before midnight on the 1st", () => {
    const d = monthlyDeadlines("2026-11");
    expect(d.opens.toISOString()).toBe("2026-10-31T05:00:00.000Z");
    expect(d.due.toISOString()).toBe("2026-11-02T06:00:00.000Z"); // Nov 2 00:00 CST
  });

  it("date helpers cross months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysInMonth("2028-02")).toBe(29);
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});
