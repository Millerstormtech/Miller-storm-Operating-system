// src/lib/canvass/propertyIds.ts
// Which field of a county's state parcel file really identifies a property.
//
// TxGIO files carry two id fields, Prop_ID and GEO_ID. Usually Prop_ID is the
// appraisal district's property number. In Ector County's 2025 file it is a group
// code instead (3,791 values across 75,947 records), which collapsed Odessa into
// 3,595 houses. A real property id repeats only on the same address (one property
// split into several records), so the test is how often an id comes back on a
// DIFFERENT address. Measured on our 41 counties on 15 Sep 2026: Prop_ID 0% in
// most, Tarrant 5.1%, Travis 32.7% (GEO_ID the same), Ector 94.8% (GEO_ID 0%).
//
// Pure: no files, no database.

export type IdField = "Prop_ID" | "GEO_ID";

export type IdFieldCounts = {
  records: number;
  /**
   * Records carrying a real id in either field. Travis CAD's state file puts
   * the placeholder "0" on 429,701 of 834,936 records (utility lines, business
   * personal property, exempt accounts drawn as pseudo-parcels; review 17 Sep
   * 2026); those records can never be houses and must not make a good id field
   * look half-empty. Older counts may lack this; `records` is used then.
   */
  recordsWithId?: number;
  propIdValues: number;
  /** Records whose Prop_ID was already seen on a different address. */
  propIdConflicts: number;
  geoIdValues: number;
  /** Records whose GEO_ID was already seen on a different address. */
  geoIdConflicts: number;
};

export const ID_RULES = {
  /** Up to this share of an id field's values may come back on a different address. */
  maxConflictShare: 0.2,
  /** An id field must be filled on at least this share of records to be used. */
  minFilledShare: 0.5,
};

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export function chooseIdField(counts: IdFieldCounts): IdField {
  const denominator = counts.recordsWithId ?? counts.records;
  const filled = (values: number) => denominator > 0 && values / denominator >= ID_RULES.minFilledShare;
  const prop = share(counts.propIdConflicts, counts.propIdValues);
  const geo = share(counts.geoIdConflicts, counts.geoIdValues);
  if (filled(counts.propIdValues) && prop <= ID_RULES.maxConflictShare) return "Prop_ID";
  if (filled(counts.geoIdValues) && geo <= ID_RULES.maxConflictShare) return "GEO_ID";
  // Both messy: switch only to a clearly better GEO_ID.
  if (filled(counts.geoIdValues) && geo <= prop / 2) return "GEO_ID";
  return "Prop_ID";
}

/**
 * The address as compared, or "" when it cannot tell two properties apart: a
 * line with nothing before its first comma is only a state and ZIP (Travis
 * writes ", TX 78704" on 613,696 records), which proves nothing about which
 * property an id belongs to.
 */
const normalizeAddress = (address: string) => {
  const line = address.toUpperCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
  return line.split(",")[0].trim() ? line : "";
};

/** An id made only of zeros is a placeholder, not an id. */
const realId = (id: string): string => (/^0*$/.test(id.trim()) ? "" : id.trim());

/** Counts, record by record, how often each id field comes back on a different address. */
export function createIdConflictCounter() {
  const firstAddress = { prop: new Map<string, string>(), geo: new Map<string, string>() };
  const counts: IdFieldCounts = { records: 0, recordsWithId: 0, propIdValues: 0, propIdConflicts: 0, geoIdValues: 0, geoIdConflicts: 0 };

  /** True when this id was seen before on another address. A blank address proves nothing. */
  const isConflict = (seen: Map<string, string>, id: string, address: string): boolean => {
    if (!address) return false;
    const first = seen.get(id);
    if (first === undefined) {
      seen.set(id, address);
      return false;
    }
    return first !== address;
  };

  return {
    add(record: { propId: string; geoId: string; address: string }) {
      counts.records++;
      const address = normalizeAddress(record.address);
      const propId = realId(record.propId);
      const geoId = realId(record.geoId);
      if (propId || geoId) counts.recordsWithId = (counts.recordsWithId ?? 0) + 1;
      if (propId) {
        counts.propIdValues++;
        if (isConflict(firstAddress.prop, propId, address)) counts.propIdConflicts++;
      }
      if (geoId) {
        counts.geoIdValues++;
        if (isConflict(firstAddress.geo, geoId, address)) counts.geoIdConflicts++;
      }
    },
    counts: (): IdFieldCounts => ({ ...counts }),
  };
}
