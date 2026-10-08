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

// ---- Year built, from Parker CAD's public property pages (Youssef, 8 Oct 2026) ----
// Parker CAD publishes no bulk file with year built, and its map service has none
// (checked 8 Oct 2026, every layer of all three services). Each property's page
// on its official search site does show it, in the "Improvement / Buildings"
// table, so scripts/canvass-parker-age.ts reads the pages slowly, one at a time.

export const PARKER_PAGE = "https://iswdataclient.azurewebsites.net/webProperty.aspx?dbkey=PARKERCAD&id=";

/** The search site's id for a property: "R" and the property id padded to 9 digits (59280 is R000059280). */
export function parkerPageId(propId: string | number): string | null {
  const digits = String(propId).trim();
  if (!/^\d{1,9}$/.test(digits)) return null;
  return `R${digits.padStart(9, "0")}`;
}

export type ParkerBuildings = {
  /** False when the page holds no property at all (the id is unknown to the site). */
  found: boolean;
  /** The main dwelling's year: the earliest year on a living-area or mobile-home row. */
  yearBuilt: number | null;
  mobileHome: boolean;
};

const cellText = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * Reads the building table (tbody id="tableBld"): one row per building part,
 * cells sequence, code, description, year built, square feet, perimeter. The
 * house is the LIVING AREA rows (code LA) or a MOBILE HOME row (code MH); a
 * second story, garage, porch, pool or shed is not, and their years (often a
 * later addition) are ignored. A year outside 1800 to next year is ignored.
 */
export function parkerBuildings(html: string, thisYear: number): ParkerBuildings {
  const found = /Property ID:\s*(<[^>]*>\s*)*R\d{9}/.test(html);
  const body = /<tbody[^>]*id=["']tableBld["'][^>]*>([\s\S]*?)<\/tbody>/i.exec(html)?.[1] ?? "";
  let yearBuilt: number | null = null;
  let mobileHome = false;
  for (const row of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (cells.length < 4) continue;
    const [, code, description, yearText] = cells;
    const isLiving = code.toUpperCase() === "LA" || /^LIVING AREA$/i.test(description);
    const isMobile = code.toUpperCase() === "MH" || /^MOBILE HOME/i.test(description);
    if (!isLiving && !isMobile) continue;
    if (isMobile) mobileHome = true;
    const year = Number(yearText);
    if (!Number.isInteger(year) || year < 1800 || year > thisYear + 1) continue;
    if (yearBuilt === null || year < yearBuilt) yearBuilt = year;
  }
  return { found, yearBuilt, mobileHome };
}
