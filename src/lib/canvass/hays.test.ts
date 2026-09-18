// src/lib/canvass/hays.test.ts
import { describe, it, expect } from "vitest";
import { hasHomestead, haysPropId, haysTableFromHeader } from "./hays";

// Values taken from the Hays CAD 2026 Property Data Export (as of 26 Aug 2026),
// read 16 Sep 2026.

describe("haysPropId", () => {
  it("drops the letter prefix, so the export's QuickRefID matches the state file's Prop_ID", () => {
    expect(haysPropId("R100002")).toBe("100002"); // measured: 99.9% of our Hays houses match this way
    expect(haysPropId("M102419")).toBe("102419"); // mobile homes use M
    expect(haysPropId(" R100012 ")).toBe("100012");
  });

  it("leaves an id that is already plain digits alone", () => {
    expect(haysPropId("100002")).toBe("100002");
  });

  it("never eats digits, only the prefix", () => {
    // The prefix is letters only: a 0 after the letter is part of the number.
    expect(haysPropId("R0100002")).toBe("0100002");
    expect(haysPropId("")).toBe("");
  });
});

describe("hasHomestead", () => {
  it("counts HS on its own and alongside other exemptions", () => {
    expect(hasHomestead("HS")).toBe(true); // 38,595 rows
    expect(hasHomestead("HS,OA")).toBe(true); // 17,894 rows
    expect(hasHomestead("DV,HS")).toBe(true); // 2,807 rows
    expect(hasHomestead(" hs , oa ")).toBe(true);
  });

  it("does not match a code that merely starts with HS", () => {
    // The real trap: HB9 and HS are different exemptions, and a substring test
    // would also wrongly match a hypothetical "HST".
    expect(hasHomestead("HB9")).toBe(false); // 8,243 rows
    expect(hasHomestead("HST")).toBe(false);
    expect(hasHomestead("SHS")).toBe(false);
  });

  it("is false for other exemptions and for no exemption at all", () => {
    for (const list of ["INV", "CBL", "AG", "EX", "DV", ""]) {
      expect(hasHomestead(list)).toBe(false);
    }
  });
});

describe("haysTableFromHeader", () => {
  // The six files are named PropertyDataExport<number>.txt with nothing to say
  // which is which, so they are told apart by their columns.
  it("recognises each of the six export tables", () => {
    expect(haysTableFromHeader(["RecordType", "PropertyID", "QuickRefID", "PropertyNumber", "InstanceID", "Type", "Description", "Class", "ActYrBuilt", "EffYrBuilt", "Roof"])).toBe("segment");
    expect(haysTableFromHeader(["RecordType", "PropertyID", "QuickRefID", "OwnerName", "City", "ExemptionList"])).toBe("owner");
    expect(haysTableFromHeader(["RecordType", "PropertyID", "QuickRefID", "PropertyNumber", "LandType", "Description", "StateCode", "Acres"])).toBe("land");
    expect(haysTableFromHeader(["RecordType", "PropertyID", "QuickRefID", "PropertyNumber", "InstanceID", "Type", "Description", "StateCode", "Sequence", "ImpValue"])).toBe("improvement");
    expect(haysTableFromHeader(["RecordType", "PropertyID", "QuickRefID", "PropertyNumber", "LegalDesc", "LegalAcres", "Situs"])).toBe("property");
    expect(haysTableFromHeader(["RecordType", "PropertyID", "QuickRefID", "PropertyNumber", "SaleDate", "DeedDate"])).toBe("sales");
  });

  it("does not confuse SEGMENT with IMPROVEMENT, which share InstanceID and Type", () => {
    // Only SEGMENT carries ActYrBuilt; only IMPROVEMENT pairs InstanceID with StateCode.
    const segment = haysTableFromHeader(["RecordType", "InstanceID", "Type", "StateCode", "ActYrBuilt"]);
    expect(segment).toBe("segment");
  });

  it("copes with quoted header names and odd case", () => {
    expect(haysTableFromHeader(['"RecordType"', '"ActYrBuilt"'])).toBe("segment");
    expect(haysTableFromHeader(["recordtype", "EXEMPTIONLIST"])).toBe("owner");
  });

  it("says unknown for a header it does not recognise", () => {
    expect(haysTableFromHeader(["RecordType", "Something", "Else"])).toBe("unknown");
    expect(haysTableFromHeader([])).toBe("unknown");
  });
});
