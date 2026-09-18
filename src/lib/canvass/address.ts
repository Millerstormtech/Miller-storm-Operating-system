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

/**
 * Rural road names are written two ways: the property says "CR 1234", the
 * owner's mail says "COUNTY ROAD 1234" (Wise County, 7,357 houses). Applied
 * before the single-word abbreviations, longest phrase first.
 */
const ROAD_PHRASES: Array<[RegExp, string]> = [
  [/\bCOUNTY (ROAD|RD)\b/g, "CR"],
  [/\bFARM TO MARKET (ROAD|RD)\b/g, "FM"],
  [/\bFARM TO MARKET\b/g, "FM"],
  [/\bFARM (ROAD|RD)\b/g, "FM"],
  [/\bRANCH TO MARKET (ROAD|RD)\b/g, "RM"],
  [/\bRANCH (ROAD|RD)\b/g, "RR"],
  [/\bPRIVATE (ROAD|RD)\b/g, "PR"],
  [/\bSTATE (HIGHWAY|HWY)\b/g, "SH"],
  [/\bUS (HIGHWAY|HWY)\b/g, "US"],
  [/\bINTERSTATE (HIGHWAY|HWY)\b/g, "IH"],
];

/** Streets named by a road type and a number, where the number is part of the name. */
const ROAD_TYPES = new Set(["CR", "FM", "RM", "RR", "PR", "SH", "US", "IH", "HWY", "SPUR", "LOOP"]);

export type AddressParts = { line: string; zip: string };

/** Upper case, punctuation to spaces, single spaces, rural road names and common street words shortened. */
export function normalizeAddressLine(line: string): string {
  let upper = line.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [phrase, short] of ROAD_PHRASES) upper = upper.replace(phrase, short);
  return upper
    .split(" ")
    .filter(Boolean)
    .map((word) => WORD_ABBREVIATIONS[word] ?? word)
    .join(" ");
}

/**
 * House number, street key and 5-digit ZIP, or null without a house number.
 * The street key is the first word of the street name, directions skipped;
 * for a road like "CR 1234" it is the road type AND its number, so two
 * different county roads never look like the same street.
 */
function parseAddress(line: string, zip: string): { number: string; street: string; zip: string } | null {
  const words = normalizeAddressLine(line).split(" ").filter(Boolean);
  if (words.length === 0 || !/^\d+$/.test(words[0])) return null;
  const rest = words.slice(1).filter((w) => !DIRECTIONS.has(w));
  if (rest.length === 0) return null;
  const street = ROAD_TYPES.has(rest[0]) && rest[1] ? `${rest[0]} ${rest[1]}` : rest[0];
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
