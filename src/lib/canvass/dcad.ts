// src/lib/canvass/dcad.ts
// Dallas County fill-in from Dallas Central Appraisal District's free data
// files, which have what the Texas state property file lacks for Dallas:
//   - year built, in RES_DETAIL.CSV (on 94.8% of 633,725 buildings in 2026)
//   - the homestead exemption, in APPLIED_STD_EXEMPT.CSV (HS_PCT above zero)
// A Dallas CAD ACCOUNT_NUM is the state file's Prop_ID (matched for 94.9% of
// Dallas homes, checked 15 Sep 2026).
//
// Pure: no files, no database.

export type DallasFacts = { yearBuilt: number | null; roofMaterial: string; homestead: boolean };

export type DallasUpdate = {
  yearBuilt?: number;
  yearBuiltSource?: "dcad";
  roofMaterial?: string;
  ownerLivesHere?: true;
  ownerSignalSource?: "homestead";
};

/** The earliest usable year across one account's buildings, or null. */
export function earliestYearBuilt(values: string[], thisYear: number): number | null {
  const years = values
    .map((value) => value.trim())
    .filter((value) => /^\d{4}$/.test(value))
    .map(Number)
    .filter((year) => year >= 1800 && year <= thisYear);
  return years.length > 0 ? Math.min(...years) : null;
}

/** A homestead exemption is on the account when its homestead percentage is above zero. */
export function hasHomestead(homesteadPercent: string): boolean {
  return (Number(homesteadPercent.trim()) || 0) > 0;
}

/**
 * The fields to set on a Dallas house. Only what the appraisal district knows
 * is set. No homestead does NOT mean the owner lives elsewhere, since not every
 * owner files one, so the address-based signal is left as it was.
 */
export function dallasUpdate(facts: DallasFacts): DallasUpdate {
  const update: DallasUpdate = {};
  if (facts.yearBuilt !== null) {
    update.yearBuilt = facts.yearBuilt;
    update.yearBuiltSource = "dcad";
  }
  const roof = facts.roofMaterial.trim();
  if (roof) update.roofMaterial = roof;
  if (facts.homestead) {
    update.ownerLivesHere = true;
    update.ownerSignalSource = "homestead";
  }
  return update;
}
