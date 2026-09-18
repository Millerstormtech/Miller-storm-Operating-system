// src/lib/canvass/jcad.ts
// Johnson County fill-in from Johnson County Appraisal District's 2026 certified
// tab files. A JCAD ACCOUNT (R000000130) is the state file's Prop_ID; the building
// files write the same account as plain digits (130). Codes counted on 15 Sep 2026.
//
// Pure: no files, no database.

/** The account's digits without leading zeros: "R000000130" becomes "130". */
export function accountDigits(account: string): string {
  return account.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Residence homestead exemptions: the general homestead (HS, HSLOC), over 65
 * (O65, O65LOC), disabled person (DIS, DISLOC) and the 100% disabled veteran
 * homestead (DVHS). DV1 to DV4 can sit on any property a veteran owns, so they do
 * not count.
 */
const HOMESTEAD_CODES = new Set(["HS", "HSLOC", "O65", "O65LOC", "DIS", "DISLOC", "DVHS"]);

export function isJohnsonHomesteadCode(code: string): boolean {
  return HOMESTEAD_CODES.has(code.trim().toUpperCase());
}

/** "CR - COMP SHINGLE" becomes "COMP SHINGLE"; UNASSIGNED and blanks become "". */
export function johnsonRoofLabel(description: string): string {
  const label = description.replace(/^\s*[A-Z0-9]{1,4}\s+-\s+/i, "").trim().toUpperCase();
  return label === "UNASSIGNED" ? "" : label;
}
