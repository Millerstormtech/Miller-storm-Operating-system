// src/lib/canvass/appraisal.test.ts
import { describe, it, expect } from "vitest";
import { earliestYearBuilt, appraisalUpdate } from "./appraisal";

describe("earliestYearBuilt", () => {
  it("takes the earliest usable year across a property's buildings", () => {
    expect(earliestYearBuilt(["1995", "1978", "2001"], 2026)).toBe(1978);
  });

  it("reads years written with decimals or as numbers (Williamson sends 1996.000000)", () => {
    expect(earliestYearBuilt(["1996.000000", 1984, " 2001.0 "], 2026)).toBe(1984);
  });

  it("ignores blanks, zeros, part years and impossible years", () => {
    expect(earliestYearBuilt(["", "0", "0.000000", "1750", "2031", "1988.5", null, undefined, "1988"], 2026)).toBe(1988);
  });

  it("is null when no year is usable", () => {
    expect(earliestYearBuilt(["", "0", null], 2026)).toBeNull();
  });
});

describe("appraisalUpdate", () => {
  it("sets the year built with the appraisal district's label", () => {
    expect(appraisalUpdate({ yearBuilt: 1996, homestead: false }, "wcad")).toEqual({ yearBuilt: 1996, yearBuiltSource: "wcad" });
  });

  it("marks the owner as living here when the property has a homestead exemption", () => {
    expect(appraisalUpdate({ yearBuilt: null, homestead: true }, "wcad")).toEqual({ ownerLivesHere: true, ownerSignalSource: "homestead" });
  });

  it("leaves the owner signal alone without a homestead, because not every owner files one", () => {
    expect(appraisalUpdate({ yearBuilt: null, homestead: false }, "wcad")).toEqual({});
  });

  it("keeps a roof material when the district has one, trimmed", () => {
    expect(appraisalUpdate({ yearBuilt: 1962, roofMaterial: " WOOD SHAKES ", homestead: true }, "dcad")).toEqual({
      yearBuilt: 1962,
      yearBuiltSource: "dcad",
      roofMaterial: "WOOD SHAKES",
      ownerLivesHere: true,
      ownerSignalSource: "homestead",
    });
  });

  it("leaves out a blank roof material", () => {
    expect(appraisalUpdate({ yearBuilt: 1990, roofMaterial: "   ", homestead: false }, "dcad")).toEqual({ yearBuilt: 1990, yearBuiltSource: "dcad" });
  });
});
