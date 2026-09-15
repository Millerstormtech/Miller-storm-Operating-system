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
  const filled = (values: number) => counts.records > 0 && values / counts.records >= ID_RULES.minFilledShare;
  const prop = share(counts.propIdConflicts, counts.propIdValues);
  const geo = share(counts.geoIdConflicts, counts.geoIdValues);
  if (filled(counts.propIdValues) && prop <= ID_RULES.maxConflictShare) return "Prop_ID";
  if (filled(counts.geoIdValues) && geo <= ID_RULES.maxConflictShare) return "GEO_ID";
  // Both messy: switch only to a clearly better GEO_ID.
  if (filled(counts.geoIdValues) && geo <= prop / 2) return "GEO_ID";
  return "Prop_ID";
}

const normalizeAddress = (address: string) => address.toUpperCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();

/** Counts, record by record, how often each id field comes back on a different address. */
export function createIdConflictCounter() {
  const firstAddress = { prop: new Map<string, string>(), geo: new Map<string, string>() };
  const counts: IdFieldCounts = { records: 0, propIdValues: 0, propIdConflicts: 0, geoIdValues: 0, geoIdConflicts: 0 };

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
      const propId = record.propId.trim();
      const geoId = record.geoId.trim();
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
