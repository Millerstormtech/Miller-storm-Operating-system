// src/lib/canvass/district.test.ts
import { describe, it, expect } from "vitest";
import { districtHomeCodes, isDistrictHome, type DistrictProperty } from "./district";

// Texas property category codes as appraisal districts use them (Potter-Randall's
// state code table, read 15 Sep 2026): A single-family residential, B multifamily,
// C1 vacant lots, D1 open-space land, E rural land, F1 commercial, M1 mobile homes
// taxed as personal property, X exempt.

describe("isDistrictHome", () => {
  it("counts single-family residential, code A and its A1 and A2 variants", () => {
    expect(isDistrictHome("A", null)).toBe(true);
    expect(isDistrictHome("A1", 1995)).toBe(true);
    expect(isDistrictHome(" a2 ", null)).toBe(true);
  });

  it("counts rural land only when it has a main building with a year", () => {
    expect(isDistrictHome("E", 1978)).toBe(true);
    expect(isDistrictHome("E1", null)).toBe(false);
  });

  it("does not count multifamily, vacant, open-space, commercial, mobile-home, exempt, mineral or blank codes", () => {
    for (const code of ["B", "C1", "D1", "F1", "M1", "XV", "G1", ""]) {
      expect(isDistrictHome(code, 1990)).toBe(false);
    }
  });
});

describe("districtHomeCodes", () => {
  it("maps each home's property id to its state code, leaving out non-homes and blank ids", () => {
    const properties: DistrictProperty[] = [
      { propId: "120275", stateCode: "A", homestead: true, yearBuilt: 1952, roofMaterial: "COMPOSITION SHINGLES" },
      { propId: "120276", stateCode: "F1", homestead: false, yearBuilt: 1980, roofMaterial: "" },
      { propId: "120277", stateCode: "E", homestead: false, yearBuilt: 2004, roofMaterial: "METAL" },
      { propId: "", stateCode: "A", homestead: false, yearBuilt: null, roofMaterial: "" },
    ];
    expect(districtHomeCodes(properties)).toEqual(
      new Map([
        ["120275", "A"],
        ["120277", "E"],
      ])
    );
  });
});
