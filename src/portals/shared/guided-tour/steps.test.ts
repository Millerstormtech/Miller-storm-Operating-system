import { describe, it, expect } from "vitest";
import { visibleStepIndexes, nextIndex, prevIndex, firstIndex, isLastIndex, stepPosition, type Measure } from "./steps";
import type { TourStep } from "./types";

const STEPS: TourStep[] = [
  { target: "your-rank", title: "A", body: "a" },
  { target: "filters",   title: "B", body: "b" },
  { target: "legend",    title: "C", body: "c" },
  { target: "columns",   title: "D", body: "d" },
];

const RECT = { top: 10, left: 10, width: 100, height: 40 };

/** Only the named targets resolve; everything else is missing. */
const only = (...present: string[]): Measure =>
  (t) => (present.includes(t) ? RECT : null);

describe("visibleStepIndexes", () => {
  it("returns every index when all targets resolve", () => {
    expect(visibleStepIndexes(STEPS, only("your-rank", "filters", "legend", "columns"))).toEqual([0, 1, 2, 3]);
  });
  it("drops steps whose target is missing (a rep never sees an admin-only step)", () => {
    expect(visibleStepIndexes(STEPS, only("filters", "columns"))).toEqual([1, 3]);
  });
  it("drops steps whose target is present but collapsed", () => {
    const measure: Measure = (t) => (t === "filters" ? { top: 0, left: 0, width: 0, height: 0 } : RECT);
    expect(visibleStepIndexes(STEPS, measure)).toEqual([0, 2, 3]);
  });
  it("returns an empty list when nothing resolves", () => {
    expect(visibleStepIndexes(STEPS, only())).toEqual([]);
  });
});

describe("firstIndex", () => {
  it("returns the first visible step", () => { expect(firstIndex([1, 3])).toBe(1); });
  it("returns null when nothing is visible", () => { expect(firstIndex([])).toBeNull(); });
});

describe("nextIndex", () => {
  it("advances to the next visible step, skipping gaps", () => {
    expect(nextIndex(1, [1, 3])).toBe(3);
  });
  it("returns null at the end", () => { expect(nextIndex(3, [1, 3])).toBeNull(); });
  it("recovers when the current step vanished mid-tour", () => {
    expect(nextIndex(2, [0, 1, 3])).toBe(3);
  });
});

describe("prevIndex", () => {
  it("goes back to the previous visible step", () => {
    expect(prevIndex(3, [1, 3])).toBe(1);
  });
  it("returns null at the start", () => { expect(prevIndex(1, [1, 3])).toBeNull(); });
});

describe("isLastIndex", () => {
  it("is true on the final visible step, so Next reads Done", () => {
    expect(isLastIndex(3, [1, 3])).toBe(true);
  });
  it("is false in the middle", () => { expect(isLastIndex(1, [1, 3])).toBe(false); });
  it("is true when nothing is visible", () => { expect(isLastIndex(0, [])).toBe(true); });
});

describe("stepPosition", () => {
  it("counts against visible steps only, so the counter never skips", () => {
    expect(stepPosition(3, [1, 3])).toEqual({ current: 2, total: 2 });
  });
  it("reports the first step as 1", () => {
    expect(stepPosition(1, [1, 3])).toEqual({ current: 1, total: 2 });
  });
});
