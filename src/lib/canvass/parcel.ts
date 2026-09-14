// src/lib/canvass/parcel.ts
// Turns one record from the Texas state property file (TxGIO Land Parcels) into
// a Knock Planner house, or null when the parcel is not a home.
//
// Field names and layouts were checked on the 2025 Hockley County file on
// 14 Sep 2026: the street type is sometimes its own field, the owner's mailing
// street usually sits on line 2, the house ZIP is often blank, and a property
// with several buildings lists several years built.
//
// The owner's mailing address is only used to decide "owner lives here". It is
// not part of the returned record, so it is never stored (spec B2).
//
// Pure: no DB, no files, no clock (the caller passes the current year).

import { ownerLivesHere } from "./address";
import { representativePoint, type PolygonGeometry, type Position } from "./geometry";

export type ParcelProperties = Record<string, unknown>;

export type HomeRecord = {
  fips: string;
  propId: string;
  location: { type: "Point"; coordinates: Position };
  address: { line: string; city: string; zip: string };
  ownerName: string;
  yearBuilt: number | null;
  ownerLivesHere: boolean | null;
  /** The state land-use code as given, upper-cased ("A1", "E1"...). */
  landUse: string;
  taxYear: string;
};

const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value)).trim();

const PO_BOX_START = /^(P\.?\s?O\.?\s+BOX|POST OFFICE BOX)\b/i;

/** The 5-digit ZIP at the very end of a full address line, if any. */
const trailingZip = (fullAddress: string): string => fullAddress.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? "";

/**
 * The year built, or null. A property with several buildings lists several
 * years ("1995,1978"); the earliest is taken as the house itself, since
 * garages and additions come later.
 */
export function yearBuiltFrom(raw: unknown, thisYear: number): number | null {
  const years = text(raw)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^\d{4}$/.test(part))
    .map(Number)
    .filter((year) => year >= 1800 && year <= thisYear);
  return years.length > 0 ? Math.min(...years) : null;
}

function hasBuilding(p: ParcelProperties, thisYear: number): boolean {
  const buildingValue = Number(text(p.IMP_VALUE).replace(/,/g, "")) || 0;
  return buildingValue > 0 || yearBuiltFrom(p.YEAR_BUILT, thisYear) !== null;
}

/**
 * Is this parcel a home? State land-use code A is residential. Code E is rural
 * land, which is how many houses on acreage are filed, so it counts when there
 * is a building on it. Counties that leave the code blank (Lubbock and Rockwall
 * in 2025) count when there is a building value or a year built.
 */
export function isHomeParcel(p: ParcelProperties, thisYear: number): boolean {
  const code = text(p.STAT_LAND_).toUpperCase();
  if (code.startsWith("A")) return true;
  if (code.startsWith("E")) return hasBuilding(p, thisYear);
  if (code) return false;
  return hasBuilding(p, thisYear);
}

/** "1402 W MAIN ST" from the separate fields, or the full address up to its first comma. */
export function houseLine(p: ParcelProperties): string {
  const number = text(p.SITUS_NUM);
  if (number) {
    return [number, text(p.SITUS_STRE), text(p.SITUS_ST_1), text(p.SITUS_ST_2)].filter(Boolean).join(" ").replace(/\s+/g, " ");
  }
  return text(p.SITUS_ADDR).split(",")[0].replace(/\s+/g, " ").trim();
}

/**
 * The owner's mailing street line. Line 1 is often blank or a care-of name, so
 * the first line that starts with a house number (or is a PO Box) wins, then the
 * full mailing address up to its first comma.
 */
export function mailingLine(p: ParcelProperties): string {
  const candidates = [text(p.MAIL_LINE1), text(p.MAIL_LINE2), text(p.MAIL_ADDR).split(",")[0].trim()].filter(Boolean);
  const usable = candidates.find((line) => /^\d/.test(line) || PO_BOX_START.test(line));
  return (usable ?? candidates[0] ?? "").replace(/\s+/g, " ");
}

export function parcelToHome(p: ParcelProperties, geometry: PolygonGeometry | null, thisYear: number): HomeRecord | null {
  if (!geometry || !isHomeParcel(p, thisYear)) return null;

  const propId = text(p.Prop_ID) || text(p.GEO_ID);
  if (!propId) return null;

  const point = representativePoint(geometry);
  if (!point) return null;

  const fipsDigits = text(p.FIPS).replace(/\D/g, "");
  const fips = fipsDigits.length === 3 ? `48${fipsDigits}` : fipsDigits;

  const line = houseLine(p);
  const zip = text(p.SITUS_ZIP).match(/\d{5}/)?.[0] ?? trailingZip(text(p.SITUS_ADDR));
  const mailZip = text(p.MAIL_ZIP).match(/\d{5}/)?.[0] ?? trailingZip(text(p.MAIL_ADDR));

  return {
    fips,
    propId,
    location: { type: "Point", coordinates: point },
    address: { line, city: text(p.SITUS_CITY), zip },
    ownerName: text(p.OWNER_NAME),
    yearBuilt: yearBuiltFrom(p.YEAR_BUILT, thisYear),
    ownerLivesHere: ownerLivesHere({ line, zip }, { line: mailingLine(p), zip: mailZip }),
    landUse: text(p.STAT_LAND_).toUpperCase(),
    taxYear: text(p.TAX_YEAR),
  };
}

/**
 * One record of a house while repeats are being merged. `area` is the outline
 * area of the pieces merged so far; `owners` the distinct owner names seen so
 * far (absent on a single record, where the home's own name is the only one).
 */
export type HomePiece = { home: HomeRecord; area: number; owners?: string[] };

/**
 * Merges two records that share a property id into one house. Hockley's 2025
 * file had 101 such ids: always the same address, year built and land use, but
 * 41 with different owner names, which is how co-owners are listed.
 *
 * - The map point and every other field come from the bigger piece (the first
 *   one on a tie).
 * - Year built is the earliest known year.
 * - The owner lives here when any co-owner's mail comes here.
 * - The card shows the first owner's name and "(+N more)" for the others.
 */
export function mergeHomes(a: HomePiece, b: HomePiece): HomePiece {
  const base = b.area > a.area ? b.home : a.home;

  const owners: string[] = [];
  for (const name of [...(a.owners ?? [a.home.ownerName]), ...(b.owners ?? [b.home.ownerName])]) {
    if (name && !owners.includes(name)) owners.push(name);
  }

  const years = [a.home.yearBuilt, b.home.yearBuilt].filter((year): year is number => year !== null);

  const livesHere =
    a.home.ownerLivesHere === true || b.home.ownerLivesHere === true
      ? true
      : a.home.ownerLivesHere === false || b.home.ownerLivesHere === false
        ? false
        : null;

  return {
    home: {
      ...base,
      ownerName: owners.length > 1 ? `${owners[0]} (+${owners.length - 1} more)` : (owners[0] ?? ""),
      yearBuilt: years.length > 0 ? Math.min(...years) : null,
      ownerLivesHere: livesHere,
    },
    area: a.area + b.area,
    owners,
  };
}
