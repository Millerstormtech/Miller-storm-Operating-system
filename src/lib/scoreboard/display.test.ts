import { describe, it, expect } from "vitest";
import {
  barFill,
  paceNotch,
  fmtMoney,
  fmtCount,
  fmtRate,
  fmtConversionRate,
  trendLabel,
} from "./display";
import { conversions } from "./metrics";
import type { Totals } from "./types";

const t = (over: Partial<Totals>): Totals => ({ revenue: 0, knocks: 0, claims: 0, contracts: 0, ...over });

describe("barFill", () => {
  it("returns null when there is no goal (caller renders no bar)", () => {
    expect(barFill(500, null)).toBeNull();
  });
  it("a real zero against a real goal is a genuine 0% bar, not absent", () => {
    expect(barFill(0, 1000)).toBe(0);
  });
  it("computes a normal fraction", () => {
    expect(barFill(50, 200)).toBeCloseTo(0.25, 5);
  });
  it("clamps above 1 when value exceeds the goal", () => {
    expect(barFill(300, 200)).toBe(1);
  });
  it("clamps below 0 for a negative value", () => {
    expect(barFill(-50, 200)).toBe(0);
  });
  it("goal of 0 with value 0 does not divide by zero and reports the goal met", () => {
    const fill = barFill(0, 0);
    expect(Number.isFinite(fill as number)).toBe(true);
    expect(fill).toBe(1);
  });
  it("goal of 0 exceeded by any positive value is fully filled, not Infinity", () => {
    const fill = barFill(25, 0);
    expect(Number.isFinite(fill as number)).toBe(true);
    expect(fill).toBe(1);
  });
});

describe("paceNotch", () => {
  it("passes through a mid-range fraction", () => {
    expect(paceNotch(0.42)).toBeCloseTo(0.42, 5);
  });
  it("clamps above 1", () => {
    expect(paceNotch(1.5)).toBe(1);
  });
  it("clamps below 0", () => {
    expect(paceNotch(-0.2)).toBe(0);
  });
});

describe("fmtMoney", () => {
  it("formats whole dollars with thousands separators", () => {
    expect(fmtMoney(28400)).toBe("$28,400");
  });
  it("rounds up to the nearest whole dollar", () => {
    expect(fmtMoney(28400.6)).toBe("$28,401");
  });
  it("rounds down to the nearest whole dollar", () => {
    expect(fmtMoney(28400.4)).toBe("$28,400");
  });
  it("renders a genuine zero, not blank", () => {
    expect(fmtMoney(0)).toBe("$0");
  });
});

describe("fmtCount", () => {
  it("formats with thousands separators", () => {
    expect(fmtCount(28400)).toBe("28,400");
  });
  it("rounds up", () => {
    expect(fmtCount(1234.6)).toBe("1,235");
  });
  it("rounds down", () => {
    expect(fmtCount(1234.4)).toBe("1,234");
  });
  it("renders a genuine zero, not blank", () => {
    expect(fmtCount(0)).toBe("0");
  });
});

describe("fmtRate", () => {
  it("shows one decimal below 10%", () => {
    expect(fmtRate(0.029)).toBe("2.9%");
  });
  it("shows no decimal at or above 10%", () => {
    expect(fmtRate(0.33)).toBe("33%");
  });
  it("boundary: exactly 10% shows no decimal", () => {
    expect(fmtRate(0.1)).toBe("10%");
  });
  it("boundary: just below 10% still shows one decimal", () => {
    expect(fmtRate(0.099)).toBe("9.9%");
  });
  it("boundary: just above 10% shows no decimal", () => {
    expect(fmtRate(0.101)).toBe("10%");
  });
  it("rounds up within the one-decimal range", () => {
    expect(fmtRate(0.02958)).toBe("3.0%");
  });
  it("rounds down within the one-decimal range", () => {
    expect(fmtRate(0.02912)).toBe("2.9%");
  });
  it("renders a genuine zero, not blank", () => {
    expect(fmtRate(0)).toBe("0.0%");
  });
});

describe("fmtConversionRate (honors the sample floor already decided by metrics.conversions)", () => {
  it("below the knock floor: 'not enough data yet', never a fabricated 0%", () => {
    const c = conversions(t({ knocks: 9, claims: 1 }));
    expect(c.knockToClaim.hidden).toBe(true);
    expect(fmtConversionRate(c.knockToClaim.rate, c.knockToClaim.hidden)).toBe("not enough data yet");
  });
  it("exactly at the knock floor: a real rate renders", () => {
    const c = conversions(t({ knocks: 10, claims: 1 }));
    expect(c.knockToClaim.hidden).toBe(false);
    expect(fmtConversionRate(c.knockToClaim.rate, c.knockToClaim.hidden)).toBe(fmtRate(c.knockToClaim.rate));
  });
  it("above the knock floor: a real rate renders", () => {
    const c = conversions(t({ knocks: 11, claims: 1 }));
    expect(c.knockToClaim.hidden).toBe(false);
    expect(fmtConversionRate(c.knockToClaim.rate, c.knockToClaim.hidden)).toBe(fmtRate(c.knockToClaim.rate));
  });
  it("a genuine zero rate with enough sample size renders as a real 0%, not the floor message", () => {
    const c = conversions(t({ knocks: 200, claims: 0 }));
    expect(c.knockToClaim.hidden).toBe(false);
    expect(fmtConversionRate(c.knockToClaim.rate, c.knockToClaim.hidden)).toBe("0.0%");
  });
  it("claimToContract below its own floor: 'not enough data yet' too, not just knockToClaim", () => {
    const c = conversions(t({ knocks: 200, claims: 2, contracts: 1 }));
    expect(c.claimToContract.hidden).toBe(true);
    expect(fmtConversionRate(c.claimToContract.rate, c.claimToContract.hidden)).toBe("not enough data yet");
  });
});

describe("trendLabel", () => {
  it("no prior period renders nothing at all, never a flat or fabricated arrow", () => {
    expect(trendLabel(null, null, "month")).toBeNull();
  });
  it("an upward trend contains the percent and has no em dash", () => {
    const label = trendLabel(12, "up", "month");
    expect(label).not.toBeNull();
    expect(label).toContain("12%");
    expect(label).not.toMatch(/—/);
  });
  it("a downward trend shows the magnitude, not a negative sign", () => {
    expect(trendLabel(-4, "down", "month")).toContain("4%");
    expect(trendLabel(-4, "down", "month")).not.toContain("-4%");
  });
  it("exactly zero change (a real measurement) still renders, distinct from null", () => {
    const label = trendLabel(0, "flat", "month");
    expect(label).not.toBeNull();
    expect(label).toContain("0%");
  });
  it("rounds up", () => {
    expect(trendLabel(12.6, "up", "month")).toContain("13%");
  });
  it("rounds down", () => {
    expect(trendLabel(12.4, "up", "month")).toContain("12%");
  });

  describe("comparison basis matches the window actually compared (previousSlice shifts back one window of the active type)", () => {
    it("day compares to yesterday", () => {
      expect(trendLabel(12, "up", "day")).toBe("12% vs yesterday");
    });
    it("week compares to last week", () => {
      expect(trendLabel(12, "up", "week")).toBe("12% vs last week");
    });
    it("month compares to last month", () => {
      expect(trendLabel(12, "up", "month")).toBe("12% vs last month");
    });
    it("year compares to last year", () => {
      expect(trendLabel(12, "up", "year")).toBe("12% vs last year");
    });
    it("no em dash in any window's comparison phrase", () => {
      const windows: Array<"day" | "week" | "month" | "year"> = ["day", "week", "month", "year"];
      for (const w of windows) {
        expect(trendLabel(5, "up", w)).not.toMatch(/—/);
      }
    });
    it("null stays null regardless of which window was active", () => {
      expect(trendLabel(null, null, "day")).toBeNull();
      expect(trendLabel(null, null, "week")).toBeNull();
      expect(trendLabel(null, null, "year")).toBeNull();
    });
  });
});
