// src/lib/canvass/prad.ts
// Potter and Randall County fill-in from Potter-Randall Appraisal District's free
// 2026 PACS export (read with pacs.ts). The state property file cannot even tell
// which Potter and Randall parcels are houses; PRAD's own records can. Codes were
// counted in the Potter file on 15 Sep 2026.
//
// Pure: no files, no database.

/** Building-part codes that are the house itself: BAS (BASE, 44,830 parts) and 3170 (HSE, 1,579). */
const MAIN_AREA_CODES = new Set(["BAS", "3170"]);

export function isPradMainArea(typeCode: string): boolean {
  return MAIN_AREA_CODES.has(typeCode.trim().toUpperCase());
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
