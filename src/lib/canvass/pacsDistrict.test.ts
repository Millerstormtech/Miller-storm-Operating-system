// src/lib/canvass/pacsDistrict.test.ts
import { describe, it, expect } from "vitest";
import { isMainArea, roofCoverLabel } from "./pacsDistrict";

// Codes counted in each district's own PACS export: Potter-Randall 15 Sep 2026,
// Ellis and Travis 16 Sep 2026.

describe("isMainArea", () => {
  it("counts Potter-Randall's base living area and house records", () => {
    expect(isMainArea("prad", "BAS")).toBe(true); // BASE, 44,830 parts
    expect(isMainArea("prad", "3170")).toBe(true); // HSE, 1,579 parts
    expect(isMainArea("prad", " bas ")).toBe(true);
  });

  it("counts Ellis's MAIN AREA", () => {
    expect(isMainArea("ecad", "MA")).toBe(true); // 75,205 parts
    expect(isMainArea("ecad", " ma ")).toBe(true);
  });

  it("counts Travis's 1st Floor", () => {
    expect(isMainArea("tcad", "1ST")).toBe(true); // 391,643 parts in a 3M-row sample
    expect(isMainArea("tcad", "1st")).toBe(true);
  });

  it("never counts a porch, garage, second floor, storage or a blank", () => {
    // Real codes from the three exports: CP covered porch, AGF2 attached garage,
    // STR2 second story, 011 porch open, 041 garage, 2ND second floor.
    for (const district of ["prad", "ecad", "tcad"] as const) {
      for (const code of ["CP", "AGF2", "STGA", "STR2", "011", "041", "2ND", "612", "SO", ""]) {
        expect(isMainArea(district, code)).toBe(false);
      }
    }
  });

  it("keeps each district's codes separate, so one district's house code is not another's", () => {
    // Ellis's MA is not a Travis code, and Travis's 1ST is not an Ellis code.
    expect(isMainArea("tcad", "MA")).toBe(false);
    expect(isMainArea("ecad", "1ST")).toBe(false);
    expect(isMainArea("ecad", "BAS")).toBe(false);
    expect(isMainArea("prad", "MA")).toBe(false);
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
