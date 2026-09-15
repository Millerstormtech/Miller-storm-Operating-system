// src/lib/canvass/appraisal.ts
// Filling houses from a county appraisal district's own data, which often has
// what the Texas state property file lacks: year built and the homestead
// exemption. Shared by the Dallas CAD and Williamson CAD fills, with more
// counties to follow.
//
// Pure: no files, no database.

export type YearBuiltSource = "dcad" | "wcad" | "prad";

export type AppraisalFacts = { yearBuilt: number | null; roofMaterial?: string; homestead: boolean };

export type AppraisalUpdate = {
  yearBuilt?: number;
  yearBuiltSource?: YearBuiltSource;
  roofMaterial?: string;
  ownerLivesHere?: true;
  ownerSignalSource?: "homestead";
};

/** A whole year from "1996", "1996.000000" or 1996; null for anything else. */
function wholeYear(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : NaN;
  return Number.isInteger(n) ? n : null;
}

/** The earliest usable year across one property's buildings, or null. */
export function earliestYearBuilt(values: ReadonlyArray<unknown>, thisYear: number): number | null {
  const years = values.map(wholeYear).filter((year): year is number => year !== null && year >= 1800 && year <= thisYear);
  return years.length > 0 ? Math.min(...years) : null;
}

/**
 * The fields to set on a house. Only what the appraisal district knows is set.
 * No homestead does NOT mean the owner lives elsewhere, since not every owner
 * files one, so the address-based signal is left as it was.
 */
export function appraisalUpdate(facts: AppraisalFacts, source: YearBuiltSource): AppraisalUpdate {
  const update: AppraisalUpdate = {};
  if (facts.yearBuilt !== null) {
    update.yearBuilt = facts.yearBuilt;
    update.yearBuiltSource = source;
  }
  const roof = (facts.roofMaterial ?? "").trim();
  if (roof) update.roofMaterial = roof;
  if (facts.homestead) {
    update.ownerLivesHere = true;
    update.ownerSignalSource = "homestead";
  }
  return update;
}
