import { describe, it, expect } from "vitest";
import {
  conversionRate,
  formatRate,
  EMPTY_RATE,
  LOW_SAMPLE_THRESHOLD,
} from "./conversion";

describe("conversionRate", () => {
  it("divides the later stage by the earlier one", () => {
    expect(conversionRate(90, 56)).toEqual({ value: 56 / 90, lowSample: false });
  });

  it("returns null rather than Infinity when there is no denominator", () => {
    expect(conversionRate(0, 0)).toEqual({ value: null, lowSample: true });
  });

  it("returns null when claims exist but no leads do, instead of dividing by zero", () => {
    expect(conversionRate(0, 3)).toEqual({ value: null, lowSample: true });
  });

  it("flags low sample below the threshold and clears it at the threshold", () => {
    expect(LOW_SAMPLE_THRESHOLD).toBe(3);
    expect(conversionRate(2, 2).lowSample).toBe(true);
    expect(conversionRate(3, 3).lowSample).toBe(false);
  });

  it("does not cap above 100%, because a short range can genuinely exceed it", () => {
    expect(conversionRate(5, 7).value).toBe(1.4);
  });

  it("treats negative and non-finite inputs as unusable", () => {
    expect(conversionRate(-5, 3).value).toBeNull();
    expect(conversionRate(5, -3).value).toBeNull();
    expect(conversionRate(Number.NaN, 3).value).toBeNull();
    expect(conversionRate(Number.POSITIVE_INFINITY, 3).value).toBeNull();
  });
});

describe("formatRate", () => {
  it("prints exactly one decimal place", () => {
    expect(formatRate(conversionRate(90, 56))).toBe("62.2%");
    expect(formatRate(conversionRate(38, 22))).toBe("57.9%");
    expect(formatRate(conversionRate(3, 3))).toBe("100.0%");
    expect(formatRate(conversionRate(5, 7))).toBe("140.0%");
  });

  it("prints the empty placeholder when there is no rate", () => {
    expect(formatRate(conversionRate(0, 0))).toBe(EMPTY_RATE);
    expect(EMPTY_RATE).toBe("—");
  });

  it("still prints the number for a low sample: greying is the caller's job", () => {
    expect(formatRate(conversionRate(2, 2))).toBe("100.0%");
  });
});
