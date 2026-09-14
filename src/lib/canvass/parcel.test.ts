import { describe, it, expect } from "vitest";
import { yearBuiltFrom, isHomeParcel, houseLine, mailingLine, parcelToHome, mergeHomes } from "./parcel";
import type { PolygonGeometry } from "./geometry";

// Every owner and address here is made up. Field names are the ones in the
// Texas state property file (TxGIO Land Parcels 2025, checked 14 Sep 2026).
const THIS_YEAR = 2026;

const parcel = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  Prop_ID: "12345",
  GEO_ID: "11111-22222-33333-44444",
  OWNER_NAME: "SAMPLE OWNER",
  STAT_LAND_: "A1",
  LOC_LAND_U: "",
  IMP_VALUE: "150000",
  SITUS_ADDR: "1402  EXAMPLE DR , LEVELLAND, TX 79336",
  SITUS_NUM: "1402",
  SITUS_STRE: "",
  SITUS_ST_1: "EXAMPLE",
  SITUS_ST_2: "DR",
  SITUS_CITY: "LEVELLAND",
  SITUS_ZIP: "79336",
  MAIL_ADDR: "1402 EXAMPLE DR , LEVELLAND, TX 79336",
  MAIL_LINE1: "",
  MAIL_LINE2: "1402 EXAMPLE DR",
  MAIL_ZIP: "79336",
  FIPS: "48219",
  TAX_YEAR: "2025",
  YEAR_BUILT: "1978",
  ...over,
});

const lot: PolygonGeometry = {
  type: "Polygon",
  coordinates: [[[-102.3, 33.5], [-102.2, 33.5], [-102.2, 33.6], [-102.3, 33.6], [-102.3, 33.5]]],
};

describe("yearBuiltFrom", () => {
  it("reads a single year", () => {
    expect(yearBuiltFrom("1978", THIS_YEAR)).toBe(1978);
  });

  it("takes the earliest year when a property lists several buildings", () => {
    expect(yearBuiltFrom("1995,1978,2001", THIS_YEAR)).toBe(1978);
  });

  it("allows spaces after the commas", () => {
    expect(yearBuiltFrom("2001, 1999", THIS_YEAR)).toBe(1999);
  });

  it("accepts a number", () => {
    expect(yearBuiltFrom(1985, THIS_YEAR)).toBe(1985);
  });

  it.each([[""], ["0"], ["1750"], ["2030"], ["abc"], [null], [undefined]])("treats %s as unknown", (raw) => {
    expect(yearBuiltFrom(raw, THIS_YEAR)).toBeNull();
  });
});

describe("isHomeParcel", () => {
  it.each([["A1"], ["A"], ["a2"], ["A1,A1"]])("a state land-use code of %s is a home", (code) => {
    expect(isHomeParcel(parcel({ STAT_LAND_: code }), THIS_YEAR)).toBe(true);
  });

  it("a commercial code is not a home, even with a building on it", () => {
    expect(isHomeParcel(parcel({ STAT_LAND_: "F1" }), THIS_YEAR)).toBe(false);
  });

  it("a rural code E with a building on it is a home on acreage", () => {
    expect(isHomeParcel(parcel({ STAT_LAND_: "E1", IMP_VALUE: "90000" }), THIS_YEAR)).toBe(true);
  });

  it("a rural code E with no building is open land", () => {
    expect(isHomeParcel(parcel({ STAT_LAND_: "E1", IMP_VALUE: "0", YEAR_BUILT: "" }), THIS_YEAR)).toBe(false);
  });

  it("with no land-use code, a building value makes it a home", () => {
    expect(isHomeParcel(parcel({ STAT_LAND_: "", IMP_VALUE: "150000", YEAR_BUILT: "" }), THIS_YEAR)).toBe(true);
  });

  it("with no land-use code and no building value, a year built makes it a home (Lubbock's file)", () => {
    expect(isHomeParcel(parcel({ STAT_LAND_: "", IMP_VALUE: "", YEAR_BUILT: "1990" }), THIS_YEAR)).toBe(true);
  });

  it("with no land-use code, no building value and no year built, it is empty land", () => {
    expect(isHomeParcel(parcel({ STAT_LAND_: "", IMP_VALUE: "0", YEAR_BUILT: "" }), THIS_YEAR)).toBe(false);
  });
});

describe("houseLine", () => {
  it("joins the number, street name and street type", () => {
    expect(houseLine(parcel())).toBe("1402 EXAMPLE DR");
  });

  it("includes a direction before the street name", () => {
    expect(houseLine(parcel({ SITUS_STRE: "W", SITUS_ST_1: "MAIN", SITUS_ST_2: "ST" }))).toBe("1402 W MAIN ST");
  });

  it("falls back to the full address up to its first comma when there is no house number field", () => {
    expect(houseLine(parcel({ SITUS_NUM: "", SITUS_ST_1: "", SITUS_ST_2: "", SITUS_ADDR: "EXAMPLE DR , LEVELLAND, TX" }))).toBe("EXAMPLE DR");
  });
});

describe("mailingLine", () => {
  it("uses line 2 when line 1 is blank", () => {
    expect(mailingLine(parcel())).toBe("1402 EXAMPLE DR");
  });

  it("skips a care-of line 1 in favor of a street line 2", () => {
    expect(mailingLine(parcel({ MAIL_LINE1: "C/O SAMPLE PERSON", MAIL_LINE2: "88 SAMPLE LN" }))).toBe("88 SAMPLE LN");
  });

  it("keeps a PO Box on line 1", () => {
    expect(mailingLine(parcel({ MAIL_LINE1: "PO BOX 12", MAIL_LINE2: "" }))).toBe("PO BOX 12");
  });

  it("falls back to the full mailing address up to its first comma", () => {
    expect(mailingLine(parcel({ MAIL_LINE1: "", MAIL_LINE2: "", MAIL_ADDR: "77 OTHER RD , SOMETOWN, TX 79000" }))).toBe("77 OTHER RD");
  });

  it("is blank when there is no mailing address at all", () => {
    expect(mailingLine(parcel({ MAIL_LINE1: "", MAIL_LINE2: "", MAIL_ADDR: "" }))).toBe("");
  });
});

describe("parcelToHome", () => {
  it("turns a home parcel into a house record", () => {
    const home = parcelToHome(parcel(), lot, THIS_YEAR)!;
    expect(home.fips).toBe("48219");
    expect(home.propId).toBe("12345");
    expect(home.location.type).toBe("Point");
    expect(home.location.coordinates[0]).toBeCloseTo(-102.25, 9);
    expect(home.location.coordinates[1]).toBeCloseTo(33.55, 9);
    expect(home.address).toEqual({ line: "1402 EXAMPLE DR", city: "LEVELLAND", zip: "79336" });
    expect(home.ownerName).toBe("SAMPLE OWNER");
    expect(home.yearBuilt).toBe(1978);
    expect(home.ownerLivesHere).toBe(true);
    expect(home.landUse).toBe("A1");
    expect(home.taxYear).toBe("2025");
  });

  it("marks an owner whose mail goes to another city as living elsewhere", () => {
    const home = parcelToHome(parcel({ MAIL_LINE2: "500 OTHER ST", MAIL_ZIP: "75201" }), lot, THIS_YEAR)!;
    expect(home.ownerLivesHere).toBe(false);
  });

  it("returns null for a parcel that is not a home", () => {
    expect(parcelToHome(parcel({ STAT_LAND_: "F1" }), lot, THIS_YEAR)).toBeNull();
  });

  it("uses GEO_ID when Prop_ID is blank", () => {
    expect(parcelToHome(parcel({ Prop_ID: "" }), lot, THIS_YEAR)!.propId).toBe("11111-22222-33333-44444");
  });

  it("returns null when there is no property id at all", () => {
    expect(parcelToHome(parcel({ Prop_ID: "", GEO_ID: "" }), lot, THIS_YEAR)).toBeNull();
  });

  it("turns a three-digit county code into a full Texas FIPS code", () => {
    expect(parcelToHome(parcel({ FIPS: "219" }), lot, THIS_YEAR)!.fips).toBe("48219");
  });

  it("reads the ZIP from the full address when the ZIP field is blank", () => {
    expect(parcelToHome(parcel({ SITUS_ZIP: "" }), lot, THIS_YEAR)!.address.zip).toBe("79336");
  });

  it("leaves the ZIP blank when neither field has one", () => {
    const home = parcelToHome(parcel({ SITUS_ZIP: "", SITUS_ADDR: "1402  EXAMPLE DR , LEVELLAND, TX" }), lot, THIS_YEAR)!;
    expect(home.address.zip).toBe("");
  });

  it("returns null when the parcel has no outline", () => {
    expect(parcelToHome(parcel(), null, THIS_YEAR)).toBeNull();
  });
});

describe("mergeHomes", () => {
  // Hockley's 2025 file lists 101 property ids more than once (189 extra records,
  // measured 14 Sep 2026). Every repeat had the same address, year built and land
  // use, and 41 had different owner names: one house split into several records.
  const home = (over: Record<string, unknown> = {}) => ({ ...parcelToHome(parcel(), lot, THIS_YEAR)!, ...over });

  it("keeps the map point of the bigger piece, whichever comes first", () => {
    const small = { home: home({ location: { type: "Point", coordinates: [-102.1, 33.1] } }), area: 1 };
    const big = { home: home({ location: { type: "Point", coordinates: [-102.2, 33.2] } }), area: 5 };
    expect(mergeHomes(small, big).home.location.coordinates).toEqual([-102.2, 33.2]);
    expect(mergeHomes(big, small).home.location.coordinates).toEqual([-102.2, 33.2]);
  });

  it("adds the pieces' areas together", () => {
    expect(mergeHomes({ home: home(), area: 1 }, { home: home(), area: 5 }).area).toBe(6);
  });

  it("says the owner lives here when any co-owner's mail comes here", () => {
    const merged = mergeHomes({ home: home({ ownerLivesHere: false }), area: 1 }, { home: home({ ownerLivesHere: true }), area: 1 });
    expect(merged.home.ownerLivesHere).toBe(true);
  });

  it("says the owner lives elsewhere when a record says so and none says here", () => {
    const merged = mergeHomes({ home: home({ ownerLivesHere: null }), area: 1 }, { home: home({ ownerLivesHere: false }), area: 1 });
    expect(merged.home.ownerLivesHere).toBe(false);
  });

  it("takes the earliest year built", () => {
    const merged = mergeHomes({ home: home({ yearBuilt: 1990 }), area: 1 }, { home: home({ yearBuilt: 1978 }), area: 1 });
    expect(merged.home.yearBuilt).toBe(1978);
  });

  it("keeps a known year built over an unknown one", () => {
    const merged = mergeHomes({ home: home({ yearBuilt: null }), area: 1 }, { home: home({ yearBuilt: 1978 }), area: 1 });
    expect(merged.home.yearBuilt).toBe(1978);
  });

  it("shows one owner name and counts the other owners, across several merges", () => {
    const two = mergeHomes({ home: home({ ownerName: "OWNER ONE" }), area: 1 }, { home: home({ ownerName: "OWNER TWO" }), area: 1 });
    const three = mergeHomes(two, { home: home({ ownerName: "OWNER THREE" }), area: 1 });
    expect(three.home.ownerName).toBe("OWNER ONE (+2 more)");
  });

  it("does not count the same owner twice", () => {
    const merged = mergeHomes({ home: home({ ownerName: "OWNER ONE" }), area: 1 }, { home: home({ ownerName: "OWNER ONE" }), area: 1 });
    expect(merged.home.ownerName).toBe("OWNER ONE");
  });
});
