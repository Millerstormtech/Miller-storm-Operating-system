// src/lib/canvass/parcel.ts
// Turns one record from the Texas state property file (TxGIO Land Parcels) into
// a Canvass Map house, or null when the parcel is not a home.
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

/**
 * How a home was recognized: the state land-use code, the county's own local
 * code, or only a building on a parcel in a county with no usable codes. The
 * last is a guess, and the quality page says so.
 */
export type LandUseSource = "state" | "local" | "building";

export type HomeRecord = {
  fips: string;
  propId: string;
  location: { type: "Point"; coordinates: Position };
  address: { line: string; city: string; zip: string };
  ownerName: string;
  yearBuilt: number | null;
  ownerLivesHere: boolean | null;
  /** The land-use code in state form ("A1", "E1"...), or "" when the home was guessed from a building. */
  landUse: string;
  landUseSource: LandUseSource;
  taxYear: string;
};

const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value)).trim();

const PO_BOX_START = /^(P\.?\s?O\.?\s+BOX|POST OFFICE BOX)\b/i;

/** The 5-digit ZIP at the very end of a full address line, if any. */
const trailingZip = (fullAddress: string): string => fullAddress.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? "";

/** Texas ZIP codes: 75000 to 79999, plus 733xx (Austin) and 885xx (El Paso). */
const TEXAS_ZIP = /^(7[5-9]\d{3}|733\d{2}|885\d{2})$/;

/**
 * The house's ZIP, or "" when the county's file does not really have one. In
 * Parker, Wise and Hood the ZIP field holds the first five digits of a
 * six-digit county code that ends the full address, not a ZIP; trusting it
 * marked real owner-occupants as living elsewhere (Parker: property and
 * mailing ZIPs agreed for 143 of 28,722 matching addresses).
 */
function houseZip(p: ParcelProperties): string {
  const fullAddress = text(p.SITUS_ADDR);
  const field = text(p.SITUS_ZIP).match(/\d{5}/)?.[0] ?? "";
  const sixDigitCode = fullAddress.match(/\b(\d{6})\s*$/)?.[1];
  if (field && TEXAS_ZIP.test(field) && !(sixDigitCode && sixDigitCode.startsWith(field))) return field;
  const trailing = trailingZip(fullAddress);
  return TEXAS_ZIP.test(trailing) ? trailing : "";
}

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

/** A county's local code written like a state code: "A1 -" (Johnson), "A0", "L". */
const STATE_STYLE_LOCAL_CODE = /^([A-Z]\d{0,2})(?:\s*-|\s|$)/;

/** Local words that mean residential (Williamson's file uses RES). */
const RESIDENTIAL_LOCAL_WORDS = new Set(["RES", "RESIDENTIAL"]);

/**
 * Owners that are clearly not a household. Only used where a county has no
 * usable codes at all. LLCs, trusts and estates are NOT on this list, because
 * many rental and family houses are owned that way.
 */
const NOT_A_HOUSEHOLD =
  /\b(CHURCH|BAPTIST|METHODIST|CATHOLIC|DIOCESE|MINISTRIES|TEMPLE|MOSQUE|SYNAGOGUE|ISD|SCHOOL|CITY OF|TOWN OF|VILLAGE OF|COUNTY|STATE OF|UNITED STATES|HOSPITAL|UNIVERSITY|COLLEGE|ELECTRIC|COOPERATIVE|CO-OP|UTILITY|UTILITIES|WATER SUPPLY|RAILROAD|RAILWAY|PIPELINE|CEMETERY|ASSOCIATION|ASSN|HOMEOWNERS|APARTMENTS|BANK|CREDIT UNION)\b/;

/** The parcel's land-use code in state form, and where it came from, or no code. */
function landUseOf(p: ParcelProperties): { code: string; source: "state" | "local" | null } {
  const stateCode = text(p.STAT_LAND_).toUpperCase();
  if (stateCode) return { code: stateCode, source: "state" };

  const localCode = text(p.LOC_LAND_U).toUpperCase();
  if (RESIDENTIAL_LOCAL_WORDS.has(localCode)) return { code: "A", source: "local" };
  const stateStyle = localCode.match(STATE_STYLE_LOCAL_CODE);
  if (stateStyle) return { code: stateStyle[1], source: "local" };

  return { code: "", source: null };
}

/**
 * Is this parcel a home, and how do we know?
 *
 * - Land-use code A (state, or the county's local code in state form, or the
 *   local word RES) is residential.
 * - Code E is rural land, which is how many houses on acreage are filed, so it
 *   counts when there is a building on it.
 * - Any other code is not a home.
 * - With no usable code at all (Parker, Wise, Hood and others in 2025), a
 *   building counts, unless the owner is clearly an organization such as a
 *   church, a city or a school district.
 */
function homeDecision(p: ParcelProperties, thisYear: number): { isHome: boolean; landUse: string; source: LandUseSource | null } {
  const { code, source } = landUseOf(p);
  if (source) {
    if (code.startsWith("A")) return { isHome: true, landUse: code, source };
    if (code.startsWith("E")) return { isHome: hasBuilding(p, thisYear), landUse: code, source };
    return { isHome: false, landUse: code, source };
  }
  const isHome = hasBuilding(p, thisYear) && !NOT_A_HOUSEHOLD.test(text(p.OWNER_NAME).toUpperCase());
  return { isHome, landUse: "", source: isHome ? "building" : null };
}

export function isHomeParcel(p: ParcelProperties, thisYear: number): boolean {
  return homeDecision(p, thisYear).isHome;
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
  if (!geometry) return null;
  const decision = homeDecision(p, thisYear);
  if (!decision.isHome || !decision.source) return null;

  const propId = text(p.Prop_ID) || text(p.GEO_ID);
  if (!propId) return null;

  const point = representativePoint(geometry);
  if (!point) return null;

  const fipsDigits = text(p.FIPS).replace(/\D/g, "");
  const fips = fipsDigits.length === 3 ? `48${fipsDigits}` : fipsDigits;

  const line = houseLine(p);
  const zip = houseZip(p);
  const mailZip = text(p.MAIL_ZIP).match(/\d{5}/)?.[0] ?? trailingZip(text(p.MAIL_ADDR));

  return {
    fips,
    propId,
    location: { type: "Point", coordinates: point },
    address: { line, city: text(p.SITUS_CITY), zip },
    ownerName: text(p.OWNER_NAME),
    yearBuilt: yearBuiltFrom(p.YEAR_BUILT, thisYear),
    ownerLivesHere: ownerLivesHere({ line, zip }, { line: mailingLine(p), zip: mailZip }),
    landUse: decision.landUse,
    landUseSource: decision.source,
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
