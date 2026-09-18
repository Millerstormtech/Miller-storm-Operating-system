// src/lib/canvass/jcad.test.ts
import { describe, it, expect } from "vitest";
import { accountDigits, isJohnsonHomesteadCode, johnsonRoofLabel } from "./jcad";

// Johnson County Appraisal District's 2026 certified tab files. Codes counted on
// 15 Sep 2026.

describe("accountDigits", () => {
  it("keeps the account number's digits without leading zeros, the way the building files write it", () => {
    expect(accountDigits("R000000130")).toBe("130");
    expect(accountDigits("R123456")).toBe("123456");
  });

  it("is empty for a blank account", () => {
    expect(accountDigits("")).toBe("");
  });
});

describe("isJohnsonHomesteadCode", () => {
  it("counts the residence homestead exemptions, including over-65, disabled and disabled-veteran homesteads", () => {
    for (const code of ["HS", "HSLOC", "O65", "O65LOC", "DVHS", "DIS", "DISLOC"]) {
      expect(isJohnsonHomesteadCode(code)).toBe(true);
    }
  });

  it("does not count exemptions that are not about a residence homestead", () => {
    for (const code of ["DV1", "DV2", "DV3", "DV4", "TOT", "PWR", "POL", ""]) {
      expect(isJohnsonHomesteadCode(code)).toBe(false);
    }
  });

  it("ignores spaces and letter case", () => {
    expect(isJohnsonHomesteadCode(" hsloc ")).toBe(true);
  });
});

describe("johnsonRoofLabel", () => {
  it("drops the code in front of the roof material", () => {
    expect(johnsonRoofLabel("CR - COMP SHINGLE")).toBe("COMP SHINGLE");
    expect(johnsonRoofLabel("MR - METAL ROOF")).toBe("METAL ROOF");
    expect(johnsonRoofLabel("WS - WOOD SHINGLES ROOF")).toBe("WOOD SHINGLES ROOF");
  });

  it("treats UNASSIGNED and blanks as no roof material", () => {
    expect(johnsonRoofLabel("UNASSIGNED")).toBe("");
    expect(johnsonRoofLabel("")).toBe("");
  });

  it("keeps a description that has no code in front", () => {
    expect(johnsonRoofLabel("TILE ROOF")).toBe("TILE ROOF");
  });
});
