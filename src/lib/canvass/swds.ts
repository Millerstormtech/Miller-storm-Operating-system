// src/lib/canvass/swds.ts
// Reading Southwest Data Solutions "web file" exports, the format Hood CAD and
// Midland CAD publish: comma-separated files, each with a *_matrix.txt layout.
// Real-property ids look like R000012345; without the R and the leading zeros they
// are the state file's Prop_ID (96.9% of Hood's real properties matched). Codes
// counted in Hood's 2026 file on 15 Sep 2026.
//
// Pure: no files, no database.

/** A real-property id the way the state file writes it, or "" for mineral (N), personal (P) and mobile-home (M) accounts. */
export function swdsPropId(id: string): string {
  const match = /^R0*(\d+)$/i.exec(id.trim());
  return match ? match[1] : "";
}

/**
 * Residence homestead codes: H homestead, S senior (over 65), D disabled person,
 * DVH and DVS disabled-veteran homesteads. The rarer F, SPRO, DVD and DVF are not
 * counted until their meaning is known.
 */
const HOMESTEAD_CODES = new Set(["H", "S", "D", "DVH", "DVS"]);

export function isSwdsHomesteadCode(code: string): boolean {
  return HOMESTEAD_CODES.has(code.trim().toUpperCase());
}

/** The building codes that the district's own code table (export_webxbld.txt) marks as main area. */
export function mainAreaCodes(rows: Iterable<{ code: string; mainArea: string }>): Set<string> {
  const codes = new Set<string>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (code && row.mainArea.trim().toLowerCase() === "true") codes.add(code);
  }
  return codes;
}
