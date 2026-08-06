import { describe, it, expect } from "vitest";
import {
  barFill,
  paceNotch,
  fmtMoney,
  fmtCount,
  fmtRate,
  fmtConversionRate,
  trendLabel,
  formatSyncedAt,
  scopeLabel,
  scopeLine,
  scopeResolved,
  unresolvedScopeMessage,
  contractsSubtitle,
} from "./display";
import { conversions } from "./metrics";
import type { Totals, Scope } from "./types";

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

describe("formatSyncedAt (pure -- `now` is always passed in, never read from the clock)", () => {
  const now = new Date("2026-08-03T18:00:00.000Z");

  it("null means the freshness itself is unknown, not 'never synced' -- say so honestly", () => {
    const text = formatSyncedAt(null, now);
    expect(text.toLowerCase()).toContain("unknown");
    expect(text).not.toMatch(/—/);
  });
  it("never implies freshness on null (no 'just now', no 'today')", () => {
    const text = formatSyncedAt(null, now).toLowerCase();
    expect(text).not.toContain("just now");
    expect(text).not.toContain("today");
  });
  it("under a minute ago", () => {
    const t = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatSyncedAt(t, now).toLowerCase()).toContain("less than a minute");
  });
  it("singular minute", () => {
    const t = new Date(now.getTime() - 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("1 minute ago");
    expect(formatSyncedAt(t, now)).not.toContain("1 minutes ago");
  });
  it("plural minutes", () => {
    const t = new Date(now.getTime() - 12 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("12 minutes ago");
  });
  it("boundary: 59 minutes stays in minutes, not hours", () => {
    const t = new Date(now.getTime() - 59 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("59 minutes ago");
  });
  it("boundary: exactly 60 minutes rolls to 1 hour", () => {
    const t = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("1 hour ago");
    expect(formatSyncedAt(t, now)).not.toContain("1 hours ago");
  });
  it("plural hours", () => {
    const t = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("5 hours ago");
  });
  it("boundary: 23 hours stays in hours, not days", () => {
    const t = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("23 hours ago");
  });
  it("boundary: exactly 24 hours rolls to 1 day", () => {
    const t = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("1 day ago");
    expect(formatSyncedAt(t, now)).not.toContain("1 days ago");
  });
  it("plural days, still under a week", () => {
    const t = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatSyncedAt(t, now)).toContain("3 days ago");
  });
  it("a week or more falls back to an absolute date, not a huge day count", () => {
    const t = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const text = formatSyncedAt(t, now);
    expect(text).not.toContain("days ago");
    expect(text).toMatch(/\d{4}/); // contains a year
  });
  it("a sync timestamp in the future (clock skew) never renders a negative 'ago'", () => {
    const t = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const text = formatSyncedAt(t, now);
    expect(text).not.toContain("-");
    expect(text).not.toContain("ago");
  });
  it("an unparseable timestamp never throws -- same honest 'unknown' copy as null, not a crash", () => {
    expect(() => formatSyncedAt("not-a-real-date", now)).not.toThrow();
    const text = formatSyncedAt("not-a-real-date", now);
    expect(text.toLowerCase()).toContain("unknown");
    expect(text).toBe(formatSyncedAt(null, now));
  });
  it("an empty string is also unparseable -- same honest 'unknown' copy, no throw", () => {
    expect(() => formatSyncedAt("", now)).not.toThrow();
    expect(formatSyncedAt("", now)).toBe(formatSyncedAt(null, now));
  });
  it("no em dash in any branch", () => {
    expect(formatSyncedAt(null, now)).not.toMatch(/—/);
    expect(formatSyncedAt(new Date(now.getTime() - 5000).toISOString(), now)).not.toMatch(/—/);
    expect(formatSyncedAt(new Date(now.getTime() - 9 * 86400000).toISOString(), now)).not.toMatch(/—/);
  });
});

describe("scopeLabel (honest scope-line label; never invents a name)", () => {
  it("self has no headcount line -- empty label, component omits it entirely", () => {
    expect(scopeLabel({ level: "self", userId: "u1" })).toBe("");
  });
  it("team with a resolved name", () => {
    expect(scopeLabel({ level: "team", team: "Gunner" })).toBe("Gunner");
  });
  it("team that resolved to null (name didn't map via the org chart) -- truthful fallback, not invented", () => {
    const label = scopeLabel({ level: "team", team: null });
    expect(label).not.toBe("");
    expect(label.toLowerCase()).not.toContain("null");
  });
  it("team fallback reads 'not identified', not 'Unassigned' -- the true state is a failed match, not a category", () => {
    expect(scopeLabel({ level: "team", team: null })).toBe("Team not identified");
  });
  it("branch with a resolved name", () => {
    expect(scopeLabel({ level: "branch", branch: "Fort Worth" })).toBe("Fort Worth");
  });
  it("branch that resolved to null -- truthful fallback, not invented", () => {
    const label = scopeLabel({ level: "branch", branch: null });
    expect(label).not.toBe("");
    expect(label.toLowerCase()).not.toContain("null");
  });
  it("branch fallback reads 'not identified', not 'Unassigned'", () => {
    expect(scopeLabel({ level: "branch", branch: null })).toBe("Branch not identified");
  });
  it("company scope", () => {
    expect(scopeLabel({ level: "company" })).toBe("Company-wide");
  });
  it("no em dash in any level", () => {
    const scopes: Scope[] = [
      { level: "self", userId: "u1" },
      { level: "team", team: "Gunner" },
      { level: "team", team: null },
      { level: "branch", branch: "Fort Worth" },
      { level: "branch", branch: null },
      { level: "company" },
    ];
    for (const s of scopes) expect(scopeLabel(s)).not.toMatch(/—/);
  });
});

describe("scopeLine (the full headcount line: label + count, distinct from the rank pool)", () => {
  it("self renders nothing -- omitted for a rep, not a stray separator", () => {
    expect(scopeLine({ level: "self", label: "", count: 1 })).toBeNull();
  });
  it("team scope: label, middle dot, plural count", () => {
    expect(scopeLine({ level: "team", label: "Gunner", count: 13 })).toBe("Gunner · 13 people contributed");
  });
  it("branch scope reads the resolved branch name", () => {
    expect(scopeLine({ level: "branch", label: "Dallas", count: 13 })).toBe("Dallas · 13 people contributed");
  });
  it("company scope", () => {
    expect(scopeLine({ level: "company", label: "Company-wide", count: 47 })).toBe(
      "Company-wide · 47 people contributed"
    );
  });
  it("singular: exactly 1 contributor reads 'person', not 'people'", () => {
    expect(scopeLine({ level: "branch", label: "Dallas", count: 1 })).toBe("Dallas · 1 person contributed");
  });
  it("a genuine zero headcount still renders as a real, distinct state -- not hidden, not fabricated", () => {
    expect(scopeLine({ level: "branch", label: "Dallas", count: 0 })).toBe("Dallas · 0 people contributed");
  });
  it("never a stray leading separator even if label were somehow empty for a non-self level", () => {
    const text = scopeLine({ level: "branch", label: "", count: 5 });
    expect(text).not.toMatch(/^\s*·/);
  });
  it("no em dash", () => {
    expect(scopeLine({ level: "team", label: "Gunner", count: 13 })).not.toMatch(/—/);
  });
});

describe("scopeResolved (whether a team/branch scope actually matched the org chart)", () => {
  it("self is always resolved -- it never depends on the org chart", () => {
    expect(scopeResolved({ level: "self", userId: "u1" })).toBe(true);
  });
  it("company is always resolved -- it never depends on the org chart", () => {
    expect(scopeResolved({ level: "company" })).toBe(true);
  });
  it("team with a real name is resolved", () => {
    expect(scopeResolved({ level: "team", team: "Gunner" })).toBe(true);
  });
  it("team with a null key is NOT resolved", () => {
    expect(scopeResolved({ level: "team", team: null })).toBe(false);
  });
  it("branch with a real name is resolved", () => {
    expect(scopeResolved({ level: "branch", branch: "Fort Worth" })).toBe(true);
  });
  it("branch with a null key is NOT resolved", () => {
    expect(scopeResolved({ level: "branch", branch: null })).toBe(false);
  });
});

describe("unresolvedScopeMessage (honest explanation shown INSTEAD OF zero tiles when a team/branch never resolved)", () => {
  it("team wording names the team", () => {
    const msg = unresolvedScopeMessage("team");
    expect(msg.toLowerCase()).toContain("team");
    expect(msg.toLowerCase()).toContain("org chart");
  });
  it("branch wording names the branch", () => {
    const msg = unresolvedScopeMessage("branch");
    expect(msg.toLowerCase()).toContain("branch");
    expect(msg.toLowerCase()).toContain("org chart");
  });
  it("points the reader at a real next step (profile or an admin), not a dead end", () => {
    const msg = unresolvedScopeMessage("branch").toLowerCase();
    expect(msg).toMatch(/profile|admin/);
  });
  it("never claims a zero or invents a number", () => {
    const msg = unresolvedScopeMessage("team");
    expect(msg).not.toMatch(/\$|%|\b0\b/);
  });
  it("no em dash", () => {
    expect(unresolvedScopeMessage("team")).not.toMatch(/—/);
    expect(unresolvedScopeMessage("branch")).not.toMatch(/—/);
  });
});

describe("contractsSubtitle (the Revenue tile's 'across N contracts' caption)", () => {
  it("plural", () => {
    expect(contractsSubtitle(2)).toBe("across 2 contracts");
  });
  it("singular", () => {
    expect(contractsSubtitle(1)).toBe("across 1 contract");
  });
  it("a genuine zero is a real, distinct state, not blank", () => {
    expect(contractsSubtitle(0)).toBe("across 0 contracts");
  });
  it("no em dash", () => {
    expect(contractsSubtitle(4)).not.toMatch(/—/);
  });
});
