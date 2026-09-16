// src/lib/canvass/district.ts
// Deciding which parcels are houses from an appraisal district's own records, for
// counties whose state property file cannot: in Potter and Randall its land-use
// field holds subdivision codes, and Travis and Hood have no codes at all. Each
// district's prepare script writes one DistrictProperty per property, and the
// parcel importer takes the homes among them.
//
// Pure: no files, no database.

export type DistrictProperty = {
  propId: string;
  /** Texas property category code, e.g. "A", "A1", "E", "F1". */
  stateCode: string;
  homestead: boolean;
  yearBuilt: number | null;
  roofMaterial: string;
  /**
   * The house's own address as the district holds it. Used only where the state
   * parcel file has none: Travis carries a street address on 16.5% of its
   * houses, Travis CAD on 100%.
   */
  address?: { line: string; city: string; zip: string };
  /**
   * Whether the owner's post goes to the house, worked out from the district's
   * own situs and mailing addresses. Null when it cannot be told. Only used
   * where the state file could not tell either.
   */
  ownerLivesHere?: boolean | null;
};

/**
 * Single-family residential (A, A1, A2) is a house. Rural land (E) is a house only
 * with a main building that has a year. Multifamily, vacant, open-space,
 * commercial, mobile homes taxed as personal property (M1), exempt and mineral
 * codes are not.
 */
export function isDistrictHome(stateCode: string, yearBuilt: number | null): boolean {
  const code = stateCode.trim().toUpperCase();
  if (code.startsWith("A")) return true;
  return code.startsWith("E") && yearBuilt !== null;
}

/** Property id to state code, for every home, as the parcel importer needs it. */
export function districtHomeCodes(properties: Iterable<DistrictProperty>): Map<string, string> {
  const homes = new Map<string, string>();
  for (const property of properties) {
    if (property.propId && isDistrictHome(property.stateCode, property.yearBuilt)) {
      homes.set(property.propId, property.stateCode.trim().toUpperCase());
    }
  }
  return homes;
}
