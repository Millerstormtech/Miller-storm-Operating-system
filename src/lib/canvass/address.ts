// src/lib/canvass/address.ts
// Address helpers for the Canvass Map.
//
// The main job is the "owner appears to live here" signal: the Texas property
// file gives each house's address and the owner's mailing address, and when the
// two are the same house, the owner very likely lives there (spec A5). These
// are the same comparison rules that produced the county rates measured on
// 14 Sep 2026, so the loaded data matches what was measured.
//
// Pure: no DB, no network.

const WORD_ABBREVIATIONS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  DRIVE: "DR",
  ROAD: "RD",
  LANE: "LN",
  COURT: "CT",
  BOULEVARD: "BLVD",
  CIRCLE: "CIR",
  PARKWAY: "PKWY",
  PLACE: "PL",
  TRAIL: "TRL",
  HIGHWAY: "HWY",
  TERRACE: "TER",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  APARTMENT: "APT",
  SUITE: "STE",
};

const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

const PO_BOX = /^(P O|PO|POST OFFICE) BOX\b/;

export type AddressParts = { line: string; zip: string };

/** Upper case, punctuation to spaces, single spaces, common street words shortened. */
export function normalizeAddressLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => WORD_ABBREVIATIONS[word] ?? word)
    .join(" ");
}

/** House number, first street-name word (directions skipped) and 5-digit ZIP, or null without a number. */
function parseAddress(line: string, zip: string): { number: string; street: string; zip: string } | null {
  const words = normalizeAddressLine(line).split(" ").filter(Boolean);
  if (words.length === 0 || !/^\d+$/.test(words[0])) return null;
  const street = words.slice(1).find((w) => !DIRECTIONS.has(w));
  if (!street) return null;
  return { number: words[0], street, zip: zip.match(/\d{5}/)?.[0] ?? "" };
}

/** "1402|EXAMPLE|76116": enough to tell two ways of writing one house apart from two houses. */
export function addressKey(line: string, zip: string): string | null {
  const parts = parseAddress(line, zip);
  return parts ? `${parts.number}|${parts.street}|${parts.zip}` : null;
}

/**
 * True when the owner's mailing address is the house itself, false when it is
 * clearly somewhere else, and null when it cannot be told. A PO Box is null,
 * not false: rural owners who do live at home often get their mail at one.
 * ZIPs are compared only when both sides have one.
 */
export function ownerLivesHere(house: AddressParts, mailing: AddressParts): boolean | null {
  const mailLine = normalizeAddressLine(mailing.line);
  if (!mailLine || PO_BOX.test(mailLine)) return null;
  const home = parseAddress(house.line, house.zip);
  const mail = parseAddress(mailing.line, mailing.zip);
  if (!home || !mail) return null;
  if (home.number !== mail.number || home.street !== mail.street) return false;
  if (home.zip && mail.zip && home.zip !== mail.zip) return false;
  return true;
}
