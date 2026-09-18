// src/lib/canvass/pacs.ts
// Reading the PACS "Legacy 8.0.33" appraisal export: the fixed-width text files
// Potter-Randall Appraisal District and Travis CAD publish (layout checked
// 15 Sep 2026). Every field sits at set character positions. The layout document
// numbers them from 1 with both ends included, and this module keeps that
// numbering so positions can be checked against the document at a glance.
//
// Only the fields the Canvass Map needs are read. The property file also carries
// owner names and mailing addresses; those are never read here.
//
// Pure: no files, no database.

/** Characters `start` to `end` of a line, counted from 1 with both ends included, trimmed. */
export function fixedField(line: string, start: number, end: number): string {
  return line.slice(start - 1, end).trim();
}

export type PacsProperty = {
  propId: string;
  taxYear: string;
  /** 0 is the certified roll; a higher number is a supplement. */
  supNum: string;
  homestead: boolean;
  improvementStateCode: string;
  landStateCode: string;
};

/** One line of APPRAISAL_INFO.TXT (PROP.TXT). */
export function readPropRow(line: string): PacsProperty {
  return {
    propId: fixedField(line, 1, 12),
    taxYear: fixedField(line, 18, 22),
    supNum: fixedField(line, 23, 34),
    homestead: fixedField(line, 2609, 2609).toUpperCase() === "T",
    improvementStateCode: fixedField(line, 2732, 2741),
    landStateCode: fixedField(line, 2742, 2751),
  };
}

export type PacsAddresses = {
  /** The house itself: "1402 W MAIN ST", plus its city and ZIP. */
  situs: { line: string; city: string; zip: string };
  /** Where the owner's post goes. Used only to work out whether they live at the house. */
  mailing: { line: string; zip: string };
};

/**
 * The house address and the owner's mailing address from one APPRAISAL_INFO /
 * PROP.TXT line. Positions come from the district's own published layout
 * document, Legacy8.0.33-AppraisalExportLayout (Travis, read 16 Sep 2026).
 *
 * Needed because some counties' state parcel file has almost no addresses:
 * only 16.5% of Travis houses got one from the state file, which leaves a rep
 * looking at a pin with no address and stops the owner check from ever running.
 *
 * The owner's NAME is deliberately still not read. The mailing address is used
 * to decide "does the owner live here" and is not stored on the house.
 */
export function readPropAddresses(line: string): PacsAddresses {
  const number = fixedField(line, 4460, 4474); // situs_num
  const prefix = fixedField(line, 1040, 1049); // situs_street_prefx
  const street = fixedField(line, 1050, 1099); // situs_street
  const suffix = fixedField(line, 1100, 1109); // situs_street_suffix
  return {
    situs: {
      line: [number, prefix, street, suffix].filter(Boolean).join(" ").replace(/\s+/g, " "),
      city: fixedField(line, 1110, 1139), // situs_city
      zip: fixedField(line, 1140, 1149).slice(0, 5), // situs_zip, "78704-1234" trimmed to the ZIP
    },
    mailing: {
      line: fixedField(line, 694, 753).replace(/\s+/g, " "), // py_addr_line1
      zip: fixedField(line, 979, 983), // py_addr_zip (ZIP only)
    },
  };
}

/** The export zero-pads ids to 12 digits ("000000120275"); the state file's Prop_ID has no padding. */
export function pacsPropId(raw: string): string {
  return raw.trim().replace(/^0+/, "");
}

/**
 * The export has one property line per owner, and supplements (sup_num above 0)
 * correct the certified roll. The higher supplement wins; for two owners on the
 * same supplement, a homestead on either line counts.
 */
export function mergeOwnerLines<T extends { supNum: string; homestead: boolean }>(a: T, b: T): T {
  const supA = Number(a.supNum) || 0;
  const supB = Number(b.supNum) || 0;
  if (supB > supA) return b;
  if (supA > supB) return a;
  return { ...a, homestead: a.homestead || b.homestead };
}

export type PacsImprovementDetail = {
  propId: string;
  taxYear: string;
  improvementId: string;
  detailId: string;
  typeCode: string;
  typeDescription: string;
  yearBuilt: string;
};

/** One line of APPRAISAL_IMPROVEMENT_DETAIL.TXT (IMP_DET.TXT): one part of a building. */
export function readImprovementDetailRow(line: string): PacsImprovementDetail {
  return {
    propId: fixedField(line, 1, 12),
    taxYear: fixedField(line, 13, 16),
    improvementId: fixedField(line, 17, 28),
    detailId: fixedField(line, 29, 40),
    typeCode: fixedField(line, 41, 50),
    typeDescription: fixedField(line, 51, 75),
    yearBuilt: fixedField(line, 86, 89),
  };
}

export type PacsImprovementAttribute = {
  propId: string;
  improvementId: string;
  detailId: string;
  description: string;
  code: string;
};

/** One line of APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT (IMP_ATR.TXT), for example a roof cover. */
export function readImprovementAttributeRow(line: string): PacsImprovementAttribute {
  return {
    propId: fixedField(line, 1, 12),
    improvementId: fixedField(line, 17, 28),
    detailId: fixedField(line, 29, 40),
    description: fixedField(line, 53, 77),
    code: fixedField(line, 78, 87),
  };
}
