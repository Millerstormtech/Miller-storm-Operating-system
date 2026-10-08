import { describe, expect, it } from "vitest";
import { parkerBuildings, parkerMailingLine, parkerOwnerReading, parkerPageId, parkerReadings, parkerSitusLine } from "./parkerCad";

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

// Trimmed from real Parker CAD pages (8 Oct 2026), owner details left out.
const page = (id: string, rows: string[][]) =>
  `<td>Property ID:</td> <td id="ucidentification_webprop_id" nowrap="nowrap" valign="top">${id}</td>` +
  `<table><thead><tr><th>Year Built</th></tr></thead><tbody id="tableBld">` +
  rows.map((cells, i) => `<tr${i % 2 ? " bgcolor='#E7E7EF'" : ""}>${cells.map((c) => `<td align='left'>${c}</td>`).join("")}</tr>`).join("") +
  `</tbody></table>`;

describe("Parker CAD property pages", () => {
  it("builds the search site's id from the property id", () => {
    expect(parkerPageId(59280)).toBe("R000059280");
    expect(parkerPageId("10018")).toBe("R000010018");
    expect(parkerPageId("0")).toBe("R000000000");
    expect(parkerPageId("12A")).toBeNull();
    expect(parkerPageId("")).toBeNull();
  });

  it("takes the living area's year, not the pool, shed or outbuilding added later", () => {
    const html = page("R000094441", [
      ["1", "LA", "LIVING AREA", "2010", "2,307", "216"],
      ["2", "AG", "ATTACHED GARAGE", "2010", "420", "82"],
      ["5", "PO20", "SWIMMING POOL", "2018", "0", "\n"],
      ["7", "OB20", "OUTBLDG", "2025", "1,200", "140"],
    ]);
    expect(parkerBuildings(html, 2026)).toEqual({ found: true, yearBuilt: 2010, mobileHome: false });
  });

  it("takes the earliest living-area year when the house was added to, and ignores a second story", () => {
    const html = page("R000033744", [
      ["1", "LA", "LIVING AREA", "1981", "1,788", "208"],
      ["2", "LT", "LIVING AREA 2ND STORY", "1975", "289", "68"],
      ["3", "LA", "LIVING AREA", "1995", "66", "34"],
    ]);
    expect(parkerBuildings(html, 2026).yearBuilt).toBe(1981);
  });

  it("reads a mobile home, with or without a year", () => {
    expect(parkerBuildings(page("R000071823", [["1", "MH", "MOBILE HOME", "2005", "2,100", "206"]]), 2026)).toEqual({ found: true, yearBuilt: 2005, mobileHome: true });
    expect(parkerBuildings(page("R000010018", [["1", "MH", "MOBILE HOME", "\n", "1,700", "168"]]), 2026)).toEqual({ found: true, yearBuilt: null, mobileHome: true });
  });

  it("finds no year on bare land, and ignores a year that cannot be right", () => {
    expect(parkerBuildings(page("R000096157", []), 2026)).toEqual({ found: true, yearBuilt: null, mobileHome: false });
    expect(parkerBuildings(page("R000000001", [["1", "LA", "LIVING AREA", "1900", "1", "1"], ["2", "LA", "LIVING AREA", "0", "1", "1"]]), 2026).yearBuilt).toBe(1900);
    expect(parkerBuildings(page("R000000002", [["1", "LA", "LIVING AREA", "2031", "1", "1"]]), 2026).yearBuilt).toBeNull();
  });

  it("knows when the site has no such property", () => {
    expect(parkerBuildings(page("&nbsp;", []), 2026).found).toBe(false);
  });
});
