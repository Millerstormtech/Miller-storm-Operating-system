import { describe, it, expect } from "vitest";
import { SERVICE_COUNTIES, isServiceCounty, areaForCounty } from "./counties";

describe("SERVICE_COUNTIES", () => {
  it("has the 41 counties from the Cities & Regions sheet", () => {
    expect(SERVICE_COUNTIES).toHaveLength(41);
  });

  it("splits them 16 FW, 11 RR, 11 Lubbock and 3 CC, as in the spec (A10)", () => {
    const count = (area: string) => SERVICE_COUNTIES.filter((c) => c.area === area).length;
    expect([count("FW"), count("RR"), count("Lubbock"), count("CC")]).toEqual([16, 11, 11, 3]);
  });

  it("lists every county once", () => {
    expect(new Set(SERVICE_COUNTIES.map((c) => c.fips)).size).toBe(41);
  });

  it("uses five-digit Texas FIPS codes", () => {
    expect(SERVICE_COUNTIES.every((c) => /^48\d{3}$/.test(c.fips))).toBe(true);
  });
});

describe("isServiceCounty", () => {
  it("includes Tarrant", () => {
    expect(isServiceCounty("48439")).toBe(true);
  });

  it("excludes Starr, the false match for a second place named Mesquite", () => {
    expect(isServiceCounty("48427")).toBe(false);
  });

  it("excludes Donley, the one county missing from the state property file", () => {
    expect(isServiceCounty("48129")).toBe(false);
  });
});

describe("areaForCounty", () => {
  it("files Cameron County (Harlingen) under FW, as the sheet does", () => {
    expect(areaForCounty("48061")).toBe("FW");
  });

  it("files Lubbock County under Lubbock", () => {
    expect(areaForCounty("48303")).toBe("Lubbock");
  });

  it("returns null for a county we do not serve", () => {
    expect(areaForCounty("48201")).toBeNull();
  });
});
