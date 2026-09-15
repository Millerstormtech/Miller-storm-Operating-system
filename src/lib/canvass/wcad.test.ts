// src/lib/canvass/wcad.test.ts
import { describe, it, expect } from "vitest";
import { isActiveHomestead, isMainAreaSegment } from "./wcad";

// Williamson Central Appraisal District open data (data.wcad.org). Category values
// counted on 15 Sep 2026.

describe("isMainAreaSegment", () => {
  it("counts the Main Area, the part of a building that is the house itself", () => {
    expect(isMainAreaSegment("MA")).toBe(true);
    expect(isMainAreaSegment(" ma ")).toBe(true);
  });

  it("does not count second floors, porches, garages, patios, fireplaces, barns or out buildings", () => {
    for (const type of ["MA2", "OP", "G", "P", "FP", "BN", "OB", ""]) {
      expect(isMainAreaSegment(type)).toBe(false);
    }
  });
});

describe("isActiveHomestead", () => {
  it("is true for an active homestead exemption", () => {
    expect(isActiveHomestead("Homestead", "A")).toBe(true);
  });

  it("is false for the other homestead statuses, whose meaning is not known yet", () => {
    expect(isActiveHomestead("Homestead", "Q")).toBe(false);
    expect(isActiveHomestead("Homestead", "R")).toBe(false);
  });

  it("is false for other exemptions, even active ones", () => {
    expect(isActiveHomestead("Disabled Veteran", "A")).toBe(false);
    expect(isActiveHomestead("Tax Code 11.13(c) Exemption", "A")).toBe(false);
  });

  it("ignores stray spaces and letter case", () => {
    expect(isActiveHomestead(" homestead ", " a ")).toBe(true);
  });
});
