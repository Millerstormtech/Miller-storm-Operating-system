import { describe, it, expect } from "vitest";
import { monthsBefore, daysBetween, formatDay, centralDay } from "./dates";

describe("monthsBefore", () => {
  it("steps back whole months to the same day of the month", () => {
    expect(monthsBefore("2026-09-14", 12)).toBe("2025-09-14");
  });

  it("clamps to the last day when the earlier month is shorter", () => {
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
  });

  it("lands on 28 February when stepping back a year from a leap day", () => {
    expect(monthsBefore("2028-02-29", 12)).toBe("2027-02-28");
  });

  it("crosses a year boundary", () => {
    expect(monthsBefore("2026-01-15", 2)).toBe("2025-11-15");
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days from the first date to the second", () => {
    expect(daysBetween("2026-07-16", "2026-09-14")).toBe(60);
  });

  it("is zero for the same day", () => {
    expect(daysBetween("2026-09-14", "2026-09-14")).toBe(0);
  });

  it("is negative when the first date is later", () => {
    expect(daysBetween("2026-09-15", "2026-09-14")).toBe(-1);
  });

  it("is not thrown off by a daylight-saving change", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });
});

describe("formatDay", () => {
  it("writes the day, short month name and year", () => {
    expect(formatDay("2026-05-04")).toBe("4 May 2026");
  });

  it("drops the leading zero from the day", () => {
    expect(formatDay("2026-09-01")).toBe("1 Sep 2026");
  });
});

describe("centralDay", () => {
  it("puts a 10:30 pm knock in Texas on that evening's day, not the UTC day", () => {
    expect(centralDay("2026-04-02T03:30:00.000Z")).toBe("2026-04-01"); // 10:30 pm CDT, 1 April
  });

  it("keeps an afternoon knock on the same day", () => {
    expect(centralDay("2026-04-01T20:00:00.000Z")).toBe("2026-04-01");
  });

  it("uses standard time in winter, six hours behind UTC", () => {
    expect(centralDay("2026-01-15T05:59:59.000Z")).toBe("2026-01-14"); // 11:59 pm CST
    expect(centralDay("2026-01-15T06:00:00.000Z")).toBe("2026-01-15"); // midnight CST
  });

  it("switches to daylight time on the second Sunday of March", () => {
    expect(centralDay("2026-03-08T05:59:59.000Z")).toBe("2026-03-07"); // 11:59 pm CST, the night before the change
    expect(centralDay("2026-03-09T04:59:59.000Z")).toBe("2026-03-08"); // 11:59 pm CDT, the evening after
    expect(centralDay("2026-03-09T05:00:00.000Z")).toBe("2026-03-09"); // midnight CDT
  });

  it("accepts a Date as well as text", () => {
    expect(centralDay(new Date("2026-04-02T03:30:00.000Z"))).toBe("2026-04-01");
  });

  it("returns null for a blank or broken timestamp", () => {
    expect(centralDay("")).toBeNull();
    expect(centralDay("not a time")).toBeNull();
  });
});
