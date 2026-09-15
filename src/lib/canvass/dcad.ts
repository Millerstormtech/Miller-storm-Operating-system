// src/lib/canvass/dcad.ts
// Dallas County fill-in from Dallas Central Appraisal District's free data
// files, which have what the Texas state property file lacks for Dallas:
//   - year built, in RES_DETAIL.CSV (on 94.8% of 633,725 buildings in 2026)
//   - the homestead exemption, in APPLIED_STD_EXEMPT.CSV (HS_PCT above zero)
// A Dallas CAD ACCOUNT_NUM is the state file's Prop_ID (matched for 94.9% of
// Dallas homes, checked 15 Sep 2026). The year and update rules shared with other
// appraisal districts live in appraisal.ts.
//
// Pure: no files, no database.

import { appraisalUpdate, earliestYearBuilt, type AppraisalUpdate } from "./appraisal";

export { earliestYearBuilt };

export type DallasFacts = { yearBuilt: number | null; roofMaterial: string; homestead: boolean };

export type DallasUpdate = AppraisalUpdate;

/** A homestead exemption is on the account when its homestead percentage is above zero. */
export function hasHomestead(homesteadPercent: string): boolean {
  return (Number(homesteadPercent.trim()) || 0) > 0;
}

/** The fields to set on a Dallas house; see appraisalUpdate. */
export function dallasUpdate(facts: DallasFacts): DallasUpdate {
  return appraisalUpdate(facts, "dcad");
}
