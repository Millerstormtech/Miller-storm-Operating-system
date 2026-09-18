// src/lib/canvass/wcad.ts
// Williamson County fill-in from Williamson Central Appraisal District open data
// (data.wcad.org). The state property file has no year built for Williamson; WCAD
// has it per building part, and has the homestead exemption. A WCAD quickrefid is
// the state file's Prop_ID (checked by address, 15 Sep 2026). The shared year and
// update rules live in appraisal.ts.
//
// Pure: no files, no database.

/** The Main Area is the house itself; second floors, porches, garages and out buildings are other parts. */
export function isMainAreaSegment(type: string): boolean {
  return type.trim().toUpperCase() === "MA";
}

/**
 * An active homestead exemption. WCAD also lists homestead rows with status Q
 * and R (637 and 245 in 2026) whose meaning is not known yet, so they do not count.
 */
export function isActiveHomestead(exemptionType: string, status: string): boolean {
  return exemptionType.trim().toLowerCase() === "homestead" && status.trim().toUpperCase() === "A";
}
