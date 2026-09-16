// src/lib/canvass/pacs.test.ts
import { describe, it, expect } from "vitest";
import { fixedField, mergeOwnerLines, pacsPropId, readImprovementAttributeRow, readImprovementDetailRow, readPropAddresses, readPropRow } from "./pacs";

// Made-up rows laid out like the PACS "Legacy 8.0.33" appraisal export used by
// Potter-Randall AD and Travis CAD (layout checked 15 Sep 2026). Positions are
// 1-based and inclusive, as the layout document writes them.
function row(width: number, fields: Array<[number, string]>): string {
  const chars = Array<string>(width).fill(" ");
  for (const [start, value] of fields) {
    for (let i = 0; i < value.length; i++) chars[start - 1 + i] = value[i];
  }
  return chars.join("");
}

describe("fixedField", () => {
  it("reads a 1-based, inclusive slice and trims it", () => {
    expect(fixedField("ABC  120275  XYZ", 4, 12)).toBe("120275");
  });

  it("returns an empty string past the end of a short line", () => {
    expect(fixedField("ABC", 10, 20)).toBe("");
  });
});

describe("readPropRow", () => {
  const line = row(2800, [
    [1, "120275"],
    [18, "2026"],
    [23, "0"],
    [2609, "T"],
    [2732, "A1"],
    [2742, "A1"],
  ]);

  it("reads the property id, tax year, supplement number, homestead flag and state codes", () => {
    expect(readPropRow(line)).toEqual({
      propId: "120275",
      taxYear: "2026",
      supNum: "0",
      homestead: true,
      improvementStateCode: "A1",
      landStateCode: "A1",
    });
  });

  it("reads F or a blank as no homestead", () => {
    expect(readPropRow(row(2800, [[1, "1"], [2609, "F"]])).homestead).toBe(false);
    expect(readPropRow(row(2800, [[1, "1"]])).homestead).toBe(false);
  });

  it("copes with a line cut short before the homestead column", () => {
    expect(readPropRow("      120275")).toMatchObject({ propId: "120275", homestead: false, improvementStateCode: "" });
  });
});

describe("readImprovementDetailRow", () => {
  it("reads the property, improvement and detail ids, the detail type and the year built", () => {
    const line = row(700, [
      [1, "120275"],
      [13, "2026"],
      [17, "55501"],
      [29, "90001"],
      [41, "MA"],
      [51, "MAIN AREA"],
      [86, "1952"],
    ]);
    expect(readImprovementDetailRow(line)).toEqual({
      propId: "120275",
      taxYear: "2026",
      improvementId: "55501",
      detailId: "90001",
      typeCode: "MA",
      typeDescription: "MAIN AREA",
      yearBuilt: "1952",
    });
  });
});

describe("readImprovementAttributeRow", () => {
  it("reads which improvement detail the attribute belongs to, and its description and code", () => {
    const line = row(120, [
      [1, "120275"],
      [13, "2026"],
      [17, "55501"],
      [29, "90001"],
      [41, "777"],
      [53, "ROOF COVER"],
      [78, "ARCH COMP"],
    ]);
    expect(readImprovementAttributeRow(line)).toEqual({
      propId: "120275",
      improvementId: "55501",
      detailId: "90001",
      description: "ROOF COVER",
      code: "ARCH COMP",
    });
  });
});

describe("pacsPropId", () => {
  it("drops the zero padding (Potter writes 000000120275), so the id matches the state file's Prop_ID", () => {
    expect(pacsPropId("000000120275")).toBe("120275");
  });

  it("keeps an id that has no padding", () => {
    expect(pacsPropId("120275")).toBe("120275");
  });

  it("is empty for a blank or all-zero id", () => {
    expect(pacsPropId("")).toBe("");
    expect(pacsPropId("000000000000")).toBe("");
  });
});

describe("mergeOwnerLines", () => {
  // The export has one property line per owner, and supplements (sup_num above 0)
  // correct the certified roll.
  it("keeps the line with the higher supplement number", () => {
    expect(mergeOwnerLines({ supNum: "000000000000", homestead: false }, { supNum: "000000000002", homestead: true })).toEqual({
      supNum: "000000000002",
      homestead: true,
    });
    expect(mergeOwnerLines({ supNum: "000000000003", homestead: false }, { supNum: "000000000001", homestead: true })).toEqual({
      supNum: "000000000003",
      homestead: false,
    });
  });

  it("for two owners on the same supplement, counts a homestead if either line has one", () => {
    expect(mergeOwnerLines({ supNum: "0", homestead: false }, { supNum: "0", homestead: true })).toEqual({ supNum: "0", homestead: true });
  });
});

describe("readPropAddresses", () => {
  // Positions from the districts' own Legacy8.0.33 layout document. Built here
  // by placing each field at its documented spot, so a wrong position fails.
  function propLine(fields: Record<number, string>): string {
    let line = " ".repeat(6000);
    for (const [startText, value] of Object.entries(fields)) {
      const start = Number(startText);
      line = line.slice(0, start - 1) + value + line.slice(start - 1 + value.length);
    }
    return line;
  }

  const travisLike = propLine({
    694: "7008 DESTINY HILLS DR", // py_addr_line1, the owner's post
    874: "AUSTIN", // py_addr_city
    979: "78738", // py_addr_zip
    1040: "S", // situs_street_prefx
    1050: "LAMAR BLVD", // situs_street
    1100: "", // situs_street_suffix
    1110: "AUSTIN", // situs_city
    1140: "78704", // situs_zip
    4460: "1109", // situs_num
  });

  it("builds the house address from its separate number, prefix, street and suffix", () => {
    const { situs } = readPropAddresses(travisLike);
    expect(situs.line).toBe("1109 S LAMAR BLVD");
    expect(situs.city).toBe("AUSTIN");
    expect(situs.zip).toBe("78704");
  });

  it("reads the owner's mailing line and ZIP, which decide whether they live there", () => {
    const { mailing } = readPropAddresses(travisLike);
    expect(mailing.line).toBe("7008 DESTINY HILLS DR");
    expect(mailing.zip).toBe("78738");
  });

  it("keeps the house ZIP to five digits, so a ZIP+4 still compares", () => {
    const line = propLine({ 4460: "1109", 1050: "LAMAR BLVD", 1140: "78704-1234" });
    expect(readPropAddresses(line).situs.zip).toBe("78704");
  });

  it("leaves out the pieces a property does not have, with no double spaces", () => {
    const line = propLine({ 4460: "1402", 1050: "MAIN", 1100: "ST" });
    expect(readPropAddresses(line).situs.line).toBe("1402 MAIN ST");
  });

  it("gives empty strings for a property with no address at all", () => {
    const { situs, mailing } = readPropAddresses(propLine({}));
    expect(situs.line).toBe("");
    expect(situs.city).toBe("");
    expect(mailing.line).toBe("");
  });

  it("does not read the owner's NAME, which sits before the mailing address", () => {
    // py_addr_line1 starts at 694; anything earlier (the owner name block) is untouched.
    const line = propLine({ 100: "JANE HOMEOWNER", 694: "12 ELM ST" });
    const { mailing } = readPropAddresses(line);
    expect(mailing.line).toBe("12 ELM ST");
    expect(JSON.stringify(readPropAddresses(line))).not.toContain("JANE");
  });
});
