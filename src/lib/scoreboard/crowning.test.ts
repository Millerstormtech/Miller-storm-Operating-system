import { describe, it, expect } from "vitest";
import {
  shouldCelebrateCrowning,
  crowningMonthLabel,
  crowningCopy,
  contractsGained,
  contractCopy,
} from "./crowning";

const august = { month: "2026-08", repName: "Alan Bieberle", revenue: 122225.29, isViewer: false };

describe("shouldCelebrateCrowning", () => {
  it("never fires when no crowning has been announced", () => {
    expect(shouldCelebrateCrowning(null, null)).toBe(false);
    expect(shouldCelebrateCrowning(null, "2026-08")).toBe(false);
  });
  it("fires for someone who has never seen one", () => {
    expect(shouldCelebrateCrowning(august, null)).toBe(true);
  });
  it("does not fire twice for the same month", () => {
    expect(shouldCelebrateCrowning(august, "2026-08")).toBe(false);
  });
  it("fires again when a new month is crowned", () => {
    expect(shouldCelebrateCrowning({ ...august, month: "2026-09" }, "2026-08")).toBe(true);
  });
  it("ignores a row with no month", () => {
    expect(shouldCelebrateCrowning({ ...august, month: "" }, null)).toBe(false);
  });
});

describe("crowningMonthLabel", () => {
  it("reads as a month and a year", () => {
    expect(crowningMonthLabel("2026-08")).toBe("August 2026");
    expect(crowningMonthLabel("2026-01")).toBe("January 2026");
  });
  it("falls back to the raw key it cannot parse", () => {
    expect(crowningMonthLabel("nonsense")).toBe("nonsense");
    expect(crowningMonthLabel("2026-13")).toBe("2026-13");
  });
});

describe("crowningCopy", () => {
  it("speaks to the king in the second person", () => {
    const copy = crowningCopy({ ...august, isViewer: true });
    expect(copy.title).toBe("You are Contract King");
    expect(copy.line).toContain("August 2026");
  });
  it("names the king to everyone else", () => {
    expect(crowningCopy(august).title).toBe("Alan Bieberle is Contract King");
  });
});

describe("contractsGained", () => {
  it("stays quiet on a first visit, with nothing to compare", () => {
    expect(contractsGained(null, 7)).toBe(0);
  });
  it("stays quiet when nothing changed or the count dropped", () => {
    expect(contractsGained(7, 7)).toBe(0);
    expect(contractsGained(8, 7)).toBe(0);
  });
  it("counts what was gained", () => {
    expect(contractsGained(7, 8)).toBe(1);
    expect(contractsGained(7, 10)).toBe(3);
  });
  it("ignores unusable numbers", () => {
    expect(contractsGained(Number.NaN, 8)).toBe(0);
    expect(contractsGained(7, Number.NaN)).toBe(0);
  });
});

describe("contractCopy", () => {
  it("uses the singular for one", () => {
    expect(contractCopy(1, 8).title).toBe("Contract signed");
    expect(contractCopy(1, 8).line).toBe("That puts you on 8 this year.");
  });
  it("counts more than one", () => {
    expect(contractCopy(3, 10).title).toBe("3 contracts signed");
  });
});
