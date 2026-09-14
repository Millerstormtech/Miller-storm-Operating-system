import { describe, it, expect } from "vitest";
import { monthsBefore, daysBetween, formatDay } from "./dates";

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
