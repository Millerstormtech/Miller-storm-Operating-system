// src/lib/canvass/quality.ts
// Is a county's data good enough to trust? (spec A7 and B3)
//
// The Texas property file is uneven. On 14 Sep 2026 Dallas and Rockwall had no
// year built at all, Hockley's year built looked like an "effective" year that
// resets after remodeling, and Rockwall's 2023 file broke the owner signal. On
// 15 Sep, Ector's Prop_ID turned out to be a group code that merged most of Odessa
// into a few thousand houses. This module turns a county's counts into flags and
// a suggested status, so a gap like that is caught on the admin quality page
// before reps see bad colors.
//
// It only SUGGESTS. A county flagged for review is looked at by a person.
//
// Pure: no DB, no network.

export type CountyStats = {
  /** Houses loaded for the county. */
  homes: number;
  /** Houses with a usable year built. */
  withYearBuilt: number;
  /** Of those, how many were built before 1990. */
  builtBefore1990: number;
  /** Houses where "owner lives here" is true or false rather than unknown. */
  withOwnerSignal: number;
  /** Of those, how many are true. */
  ownerLivesHere: number;
  /**
   * Of those, how many come from a homestead exemption rather than from
   * comparing the mailing address with the house address. A homestead can only
   * ever say "yes, the owner lives here", never "no", so a county carried
   * entirely by homesteads reads 100% by arithmetic, not by fault.
   */
  withHomesteadSignal?: number;
  /** Records read from the state file, when known. */
  records?: number;
  /** Records whose chosen id field came back on a different address (propertyIds.ts), when known. */
  idConflicts?: number;
};

export type QualityFlag =
  | "no-homes"
  | "year-built-missing"
  | "year-built-suspicious"
  | "owner-signal-missing"
  | "owner-signal-suspicious"
  | "owner-signal-homestead-only"
  | "ids-repeated";

export type CountyStatus = "live" | "age-unknown" | "review";

export const QUALITY = {
  /** Below this share of houses with a year built, the county shows "Age unknown". */
  minYearBuiltShare: 0.5,
  /**
   * Below this share built before 1990, year built is probably not the real
   * build year. Hockley measured 2.6%. Fast-growing Collin and Denton measured
   * about 20%, so this does not mistake a boom suburb for bad data.
   */
  minBuiltBefore1990Share: 0.08,
  /** Below this share of houses with an owner signal, the signal is too thin to judge. */
  minOwnerSignalShare: 0.5,
  /** Outside this range of owners living at home, the address comparison has probably broken. */
  ownerLivesHereRange: { min: 0.3, max: 0.95 },
  /**
   * At or above this share of the owner signal coming from homesteads, the
   * county has no working address comparison, so a high "lives here" share is
   * expected rather than broken. Travis measured 222,136 of 222,225 (99.96%)
   * on 16 Sep 2026, because its state-file houses carry a street number on only
   * about a tenth of records.
   */
  minHomesteadOnlyShare: 0.98,
  /**
   * Above this share of records reusing the property id on a different address,
   * the id is not a property id. Tarrant measured 5.1%; Ector's Prop_ID 94.8%.
   */
  maxIdConflictShare: 0.2,
};

export function countyFlags(stats: CountyStats): QualityFlag[] {
  if (stats.homes <= 0) return ["no-homes"];
  const flags: QualityFlag[] = [];

  if (stats.withYearBuilt / stats.homes < QUALITY.minYearBuiltShare) {
    flags.push("year-built-missing");
  } else if (stats.builtBefore1990 / stats.withYearBuilt < QUALITY.minBuiltBefore1990Share) {
    flags.push("year-built-suspicious");
  }

  if (stats.withOwnerSignal / stats.homes < QUALITY.minOwnerSignalShare) {
    flags.push("owner-signal-missing");
  } else {
    const share = stats.ownerLivesHere / stats.withOwnerSignal;
    const homesteadShare = (stats.withHomesteadSignal ?? 0) / stats.withOwnerSignal;
    const homesteadOnly = homesteadShare >= QUALITY.minHomesteadOnlyShare;
    if (homesteadOnly && share > QUALITY.ownerLivesHereRange.max) {
      // Expected, not broken: the county is graded, it just cannot spot renters.
      flags.push("owner-signal-homestead-only");
    } else if (share < QUALITY.ownerLivesHereRange.min || share > QUALITY.ownerLivesHereRange.max) {
      flags.push("owner-signal-suspicious");
    }
  }

  if (stats.records && stats.idConflicts !== undefined && stats.idConflicts / stats.records > QUALITY.maxIdConflictShare) {
    flags.push("ids-repeated");
  }

  return flags;
}

/**
 * Anything suspicious needs a person; missing year built alone just means
 * "Age unknown". A homestead-only owner signal is a known limitation, not a
 * fault, so it does not send the county for review.
 */
export function suggestedStatus(flags: readonly QualityFlag[]): CountyStatus {
  const needsPerson: QualityFlag[] = ["no-homes", "year-built-suspicious", "owner-signal-suspicious", "ids-repeated"];
  if (flags.some((flag) => needsPerson.includes(flag))) return "review";
  if (flags.includes("year-built-missing")) return "age-unknown";
  return "live";
}
