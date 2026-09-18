import { describe, it, expect } from "vitest";
import { earliestYearBuilt, hasHomestead, dallasUpdate } from "./dcad";

// Dallas Central Appraisal District's free data files fill what the Texas state
// file lacks for Dallas County: year built (RES_DETAIL.CSV) and the homestead
// exemption (APPLIED_STD_EXEMPT.CSV). Checked on the 2026 files, 15 Sep 2026.

describe("earliestYearBuilt", () => {
  it("takes the earliest usable year across an account's buildings", () => {
    expect(earliestYearBuilt(["1995", "1978", "2001"], 2026)).toBe(1978);
  });

  it("ignores blanks, zeros and impossible years", () => {
    expect(earliestYearBuilt(["", "0", "1750", "2031", "1988"], 2026)).toBe(1988);
  });

  it("is null when no year is usable", () => {
    expect(earliestYearBuilt(["", "0"], 2026)).toBeNull();
  });
});

describe("hasHomestead", () => {
  it("is true when the homestead percentage is above zero", () => {
    expect(hasHomestead("100.00")).toBe(true);
  });

  it("is false for a zero or blank percentage", () => {
    expect(hasHomestead(".00")).toBe(false);
    expect(hasHomestead("")).toBe(false);
  });
});

describe("dallasUpdate", () => {
  it("sets the year built and roof material from the appraisal district", () => {
    expect(dallasUpdate({ yearBuilt: 1978, roofMaterial: "COMPOSITION SHINGLES", homestead: false })).toEqual({
      yearBuilt: 1978,
      yearBuiltSource: "dcad",
      roofMaterial: "COMPOSITION SHINGLES",
    });
  });

  it("marks the owner as living here when the account has a homestead exemption", () => {
    expect(dallasUpdate({ yearBuilt: null, roofMaterial: "", homestead: true })).toEqual({
      ownerLivesHere: true,
      ownerSignalSource: "homestead",
    });
  });

  it("leaves the owner signal alone without a homestead exemption, because not every owner files one", () => {
    expect(dallasUpdate({ yearBuilt: null, roofMaterial: "", homestead: false })).toEqual({});
  });

  it("combines everything it knows", () => {
    expect(dallasUpdate({ yearBuilt: 1962, roofMaterial: "WOOD SHAKES", homestead: true })).toEqual({
      yearBuilt: 1962,
      yearBuiltSource: "dcad",
      roofMaterial: "WOOD SHAKES",
      ownerLivesHere: true,
      ownerSignalSource: "homestead",
    });
  });

  it("trims the roof material and leaves it out when blank", () => {
    expect(dallasUpdate({ yearBuilt: 1990, roofMaterial: "   ", homestead: false })).toEqual({
      yearBuilt: 1990,
      yearBuiltSource: "dcad",
    });
  });
});
