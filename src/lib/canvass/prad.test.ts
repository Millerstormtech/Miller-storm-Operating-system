// src/lib/canvass/prad.test.ts
import { describe, it, expect } from "vitest";
import { isPradMainArea, roofCoverLabel } from "./prad";

// Potter-Randall Appraisal District's 2026 PACS export. Codes counted in the
// Potter file on 15 Sep 2026.

describe("isPradMainArea", () => {
  it("counts the base living area and the house records", () => {
    expect(isPradMainArea("BAS")).toBe(true); // BASE, 44,830 parts
    expect(isPradMainArea("3170")).toBe(true); // HSE, 1,579 parts
    expect(isPradMainArea(" bas ")).toBe(true);
  });

  it("does not count garages, porches, carports, storage, second floors or blanks", () => {
    for (const code of ["GAR", "CRP", "CPR", "1010", "5160", "2ND", "UT", ""]) {
      expect(isPradMainArea(code)).toBe(false);
    }
  });
});

describe("roofCoverLabel", () => {
  it("spells out the roof covers the export cuts to 10 characters", () => {
    expect(roofCoverLabel("ARCHITECTU")).toBe("ARCHITECTURAL SHINGLES");
    expect(roofCoverLabel("COMPOSITIO")).toBe("COMPOSITION SHINGLES");
    expect(roofCoverLabel("WOOD SHING")).toBe("WOOD SHINGLES");
    expect(roofCoverLabel("WOOD SHAKE")).toBe("WOOD SHAKES");
    expect(roofCoverLabel("BUILT-UP S")).toBe("BUILT-UP");
    expect(roofCoverLabel("CONCRETE T")).toBe("CONCRETE TILE");
  });

  it("keeps covers that already fit, in capitals", () => {
    expect(roofCoverLabel("METAL")).toBe("METAL");
    expect(roofCoverLabel("Clay Tile")).toBe("CLAY TILE");
  });

  it("treats NONE and blanks as no roof cover", () => {
    expect(roofCoverLabel("NONE")).toBe("");
    expect(roofCoverLabel("  ")).toBe("");
  });
});
