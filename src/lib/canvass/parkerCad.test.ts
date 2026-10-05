import { describe, expect, it } from "vitest";
import { parkerMailingLine, parkerOwnerReading, parkerReadings, parkerSitusLine } from "./parkerCad";

describe("Parker CAD addresses", () => {
  it("joins the situs parts in order and skips blanks", () => {
    expect(parkerSitusLine({ situs_num: "4610", situs_street_prefx: "", situs_street: "ABERDEEN", situs_street_sufix: "DR" })).toBe("4610 ABERDEEN DR");
    expect(parkerSitusLine({ situs_num: 18100, situs_street: "FM RD 920", situs_street_prefx: null })).toBe("18100 FM RD 920");
  });

  it("takes the mailing line with a house number or a PO Box, not a care-of line", () => {
    expect(parkerMailingLine({ addr_line1: "C/O SMITH FAMILY TRUST", addr_line2: "617 YUCCA COURT" })).toBe("617 YUCCA COURT");
    expect(parkerMailingLine({ addr_line1: "ATTN TAX DEPT", addr_line2: "PO BOX 1200" })).toBe("PO BOX 1200");
    expect(parkerMailingLine({ addr_line1: "122 TRIPLE K COURT" })).toBe("122 TRIPLE K COURT");
    expect(parkerMailingLine({ addr_line1: "SOME COMPANY LLC", addr_line2: "SUITE 9" })).toBe("SUITE 9");
    expect(parkerMailingLine({})).toBe("");
  });
});

describe("parkerOwnerReading", () => {
  it("says the owner lives here when the mail goes to the house, however it is spelled", () => {
    expect(parkerOwnerReading({ situs_num: "617", situs_street: "YUCCA", situs_street_sufix: "CT", addr_line1: "617 YUCCA COURT", zip: "76008" })).toBe(true);
    expect(parkerOwnerReading({ situs_num: "4610", situs_street: "ABERDEEN", situs_street_sufix: "DR", situs_zip: "76035", addr_line1: "4610 ABERDEEN DR", zip: "76035-3013" })).toBe(true);
  });

  it("says elsewhere when the mail goes to another address", () => {
    expect(parkerOwnerReading({ situs_num: "336", situs_street: "PARKVIEW", situs_street_sufix: "DR", addr_line1: "1142 EMERSON AVENUE", zip: "07666" })).toBe(false);
  });

  it("cannot tell for a PO Box or a missing house number", () => {
    expect(parkerOwnerReading({ situs_num: "12", situs_street: "OAK", situs_street_sufix: "LN", addr_line1: "PO BOX 44", zip: "76087" })).toBeNull();
    expect(parkerOwnerReading({ situs_street: "OAK", situs_street_sufix: "LN", addr_line1: "12 OAK LN", zip: "76087" })).toBeNull();
  });
});

describe("parkerReadings", () => {
  const here = { situs_num: "1", situs_street: "ELM", addr_line1: "1 ELM" };
  const away = { situs_num: "1", situs_street: "ELM", addr_line1: "9 MAIN" };
  const unknown = { situs_num: "1", situs_street: "ELM", addr_line1: "PO BOX 3" };

  it("keeps one reading per property id; lives-here wins, then elsewhere, then unknown", () => {
    const readings = parkerReadings([
      { prop_id: 1, ...away },
      { prop_id: 1, ...here },
      { prop_id: 2, ...unknown },
      { prop_id: 2, ...away },
      { prop_id: 3, ...here },
      { prop_id: 3, ...away },
      { prop_id: 4, ...unknown },
    ]);
    expect(readings.get("1")).toBe(true);
    expect(readings.get("2")).toBe(false);
    expect(readings.get("3")).toBe(true);
    expect(readings.get("4")).toBeNull();
  });

  it("skips parcels with no property id", () => {
    expect(parkerReadings([{ prop_id: null, ...here }, { ...here }]).size).toBe(0);
  });
});
