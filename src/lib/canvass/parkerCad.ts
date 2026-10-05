// src/lib/canvass/parkerCad.ts
// Parker County's owner-lives-here reading from Parker CAD's own map service
// (ParkerCADWebService, layer 0 "Parcels", published by bis_parkercad). The
// state parcel file's Parker owner addresses are a year old; Parker CAD's are
// updated as homes sell, so the daily refresh reads them (Youssef, 5 Oct 2026:
// "apply it and keep it fresh"). Measured 5 Oct: agrees with the stored
// reading on 95% of 61,612 matched houses; about 2,900 change, mostly sales.
//
// Pure: no network, no database. scripts/canvass-parker-owner.ts does the I/O.

import { normalizeAddressLine, ownerLivesHere } from "./address";

export const PARKER_FIPS = "48367";
export const PARKER_SERVICE =
  "https://services.arcgis.com/79g1H99xInKSRRK3/arcgis/rest/services/ParkerCADWebService/FeatureServer/0/query";
export const PARKER_FIELDS = [
  "prop_id",
  "situs_num",
  "situs_street_prefx",
  "situs_street",
  "situs_street_sufix",
  "situs_zip",
  "addr_line1",
  "addr_line2",
  "addr_line3",
  "zip",
];
/**
 * Fewer parcels than this means the service answered with a partial list (it
 * held 96,094 with a property id on 5 Oct 2026). A partial list must never be
 * written: houses missing from it would simply keep their old reading, which is
 * safe, but a broken answer could hold wrong rows too.
 */
export const MIN_PARKER_PARCELS = 80_000;

export type ParkerParcel = Partial<Record<(typeof PARKER_FIELDS)[number], string | number | null>>;

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

/** "4610 ABERDEEN DR": number, direction, street and suffix as Parker CAD splits them. */
export function parkerSitusLine(parcel: ParkerParcel): string {
  return [parcel.situs_num, parcel.situs_street_prefx, parcel.situs_street, parcel.situs_street_sufix].map(text).filter(Boolean).join(" ");
}

/**
 * The owner's street line. Parker CAD puts a care-of name or a company line in
 * line 1 for some owners, so the first line that starts with a house number or
 * is a PO Box wins; otherwise the last line written.
 */
export function parkerMailingLine(parcel: ParkerParcel): string {
  const lines = [parcel.addr_line1, parcel.addr_line2, parcel.addr_line3].map(text).filter(Boolean);
  const street = lines.find((line) => /^\d+\s/.test(line) || /^(P O|PO|POST OFFICE) BOX\b/.test(normalizeAddressLine(line)));
  return street ?? lines[lines.length - 1] ?? "";
}

/** True, false, or null when it cannot be told; the same rule every county uses (address.ts). */
export function parkerOwnerReading(parcel: ParkerParcel): boolean | null {
  return ownerLivesHere({ line: parkerSitusLine(parcel), zip: text(parcel.situs_zip) }, { line: parkerMailingLine(parcel), zip: text(parcel.zip) });
}

/**
 * One reading per property id. A property drawn as several parcels takes the
 * same merge as the parcel importer (parcel.ts mergeHomes): any "lives here"
 * wins, then any "lives elsewhere", else unknown.
 */
export function parkerReadings(parcels: Iterable<ParkerParcel>): Map<string, boolean | null> {
  const readings = new Map<string, boolean | null>();
  for (const parcel of parcels) {
    const id = text(parcel.prop_id);
    if (!id) continue;
    const reading = parkerOwnerReading(parcel);
    const before = readings.get(id);
    if (before === undefined) readings.set(id, reading);
    else if (before !== true && (reading === true || (reading === false && before === null))) readings.set(id, reading);
  }
  return readings;
}
