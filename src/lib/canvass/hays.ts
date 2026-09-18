// src/lib/canvass/hays.ts
// Hays County fill-in from Hays Central Appraisal District's free monthly
// "Property Data Export" (hayscad.com/data-downloads, read 16 Sep 2026). The
// state property file has no year built and no land-use codes for Hays, so the
// district's own records supply both.
//
// The export is six quoted-CSV tables with the same shape as Williamson's
// (see wcad.ts): PROPERTY, OWNER, LAND, IMPROVEMENT, SEGMENT, SALES. The files
// are named PropertyDataExport<number>.txt with no hint of which is which, so
// the prepare script identifies each one by its header row.
//
// Pure: no files, no database.

/**
 * The join key back to the state property file.
 *
 * TRAP, measured 16 Sep 2026 against our 88,107 Hays houses: the column called
 * PropertyID is an internal number and matches only 72.6%. The state file's
 * Prop_ID is the QuickRefID with its leading LETTER(S) removed, which matches
 * 99.9%: our "100002" is the export's "R100002" (R real property, M mobile home).
 * Raw QuickRefID matches nothing at all.
 */
export function haysPropId(quickRefId: string): string {
  return quickRefId.trim().replace(/^[A-Za-z]+/, "");
}

/**
 * An active homestead on a Hays OWNER row. ExemptionList is a comma-separated
 * list of codes on one line, so "HS" must be matched as a whole item and never
 * as a substring: "HS" and "HS,OA" are homesteads, "HB9" and "DV" are not.
 * Counts on the 2026 file: HS 38,595; "HS,OA" 17,894; "DV,HS" 2,807.
 */
export function hasHomestead(exemptionList: string): boolean {
  return exemptionList
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .includes("HS");
}

/** Which of the six unnamed export files this is, from its header row. */
export type HaysTable = "property" | "owner" | "land" | "improvement" | "segment" | "sales" | "unknown";

/**
 * Identify a Hays export file by the columns in its header. Every file starts
 * with RecordType, PropertyID, QuickRefID, PropertyNumber, so the telling
 * columns come after that.
 */
export function haysTableFromHeader(header: readonly string[]): HaysTable {
  const columns = new Set(header.map((name) => name.trim().replace(/^"|"$/g, "").toLowerCase()));
  // Checked most specific first: SEGMENT and IMPROVEMENT both carry InstanceID.
  if (columns.has("actyrbuilt")) return "segment";
  if (columns.has("exemptionlist")) return "owner";
  if (columns.has("saledate")) return "sales";
  if (columns.has("landtype")) return "land";
  if (columns.has("instanceid") && columns.has("statecode")) return "improvement";
  if (columns.has("legaldesc")) return "property";
  return "unknown";
}
