// src/lib/canvass/pacsDistrict.ts
// What differs between the appraisal districts that publish a PACS "Legacy
// 8.0.33" export (read with pacs.ts). The file layout is identical across them;
// only two things change, and both are needed before a county can be graded:
//
//   1. which building-part code is the HOUSE, as opposed to a porch or a garage,
//      because that part carries the year built;
//   2. how the district spells its roof covers.
//
// Codes counted in each district's own export, not guessed:
//   Potter-Randall, 15 Sep 2026: BAS (BASE, 44,830 parts) and 3170 (HSE, 1,579).
//   Ellis, 16 Sep 2026:          MA (MAIN AREA, 75,205 parts).
//   Travis, 16 Sep 2026:         1ST (1st Floor, 391,643 parts in a 3M-row sample).
//
// Pure: no files, no database.

/** The districts whose export this module can read. Matches YearBuiltSource in appraisal.ts. */
export type PacsDistrict = "prad" | "ecad" | "tcad";

/**
 * The building-part codes that are the house itself. A property's year built is
 * the earliest year across these parts only: a 2015 porch on a 1974 house must
 * not make the roof look new.
 */
const MAIN_AREA_CODES: Record<PacsDistrict, ReadonlySet<string>> = {
  prad: new Set(["BAS", "3170"]),
  ecad: new Set(["MA"]),
  tcad: new Set(["1ST"]),
};

export function isMainArea(district: PacsDistrict, typeCode: string): boolean {
  return MAIN_AREA_CODES[district].has(typeCode.trim().toUpperCase());
}

/** The export cuts attribute codes to 10 characters; these are the roof covers it shortens. */
const ROOF_COVER_LABELS: Record<string, string> = {
  ARCHITECTU: "ARCHITECTURAL SHINGLES",
  COMPOSITIO: "COMPOSITION SHINGLES",
  "WOOD SHING": "WOOD SHINGLES",
  "WOOD SHAKE": "WOOD SHAKES",
  "BUILT-UP S": "BUILT-UP",
  "CONCRETE T": "CONCRETE TILE",
};

/** A readable roof cover in capitals, or "" for NONE and blanks. */
export function roofCoverLabel(code: string): string {
  const value = code.trim().toUpperCase();
  if (!value || value === "NONE") return "";
  return ROOF_COVER_LABELS[value] ?? value;
}
