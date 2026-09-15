// src/lib/canvass/config.ts
// Every number the Canvass Map grade uses, in one place (spec A4). Tuning the
// grade after the backtest means changing this file and its tests, nothing else.

export type GradeConfig = {
  /** How long a storm keeps counting toward a house's color. */
  hailLookbackMonths: number;
  /** Hail size bands in inches. The biggest band a storm reaches is the one that scores. */
  hailBands: ReadonlyArray<{ minInches: number; points: number }>;
  age: { oldYears: number; oldPoints: number; midYears: number; midPoints: number; unknownPoints: number };
  owner: { livesHerePoints: number; livesElsewherePoints: number };
  /** Counts when a rep marked the damage inside the hail look-back window. */
  visibleDamagePoints: number;
  notInterested: { points: number; withinDays: number };
  renterPoints: number;
  /** The radius is applied by whoever finds the neighbor; the grade only sees the date. */
  neighborSigned: { points: number; withinDays: number; radiusMeters: number };
  /** The lowest score for each color. Anything below orange is red. */
  colors: { green: number; yellow: number; orange: number };
};

export const GRADE: GradeConfig = {
  hailLookbackMonths: 12, // Youssef, 14 Sep 2026
  hailBands: [
    { minInches: 1.75, points: 40 },
    { minInches: 1.25, points: 30 },
    { minInches: 1, points: 20 },
  ],
  age: { oldYears: 20, oldPoints: 20, midYears: 12, midPoints: 10, unknownPoints: 10 },
  owner: { livesHerePoints: 10, livesElsewherePoints: -5 },
  visibleDamagePoints: 15,
  notInterested: { points: -25, withinDays: 60 },
  renterPoints: -10,
  neighborSigned: { points: 5, withinDays: 90, radiusMeters: 150 },
  colors: { green: 60, yellow: 40, orange: 20 },
};

/**
 * RepCard knock results the grade reacts to, as seen on the live door list
 * (14 Sep 2026). Compared after trimming, collapsing spaces and lower-casing.
 * Results not listed here (Not Home, Follow Up, Next Storm...) add nothing.
 */
export const KNOCK_RESULTS = {
  doNotKnock: "do not knock",
  visibleDamage: "visible damage",
  notInterested: "not interested",
  renter: "renter",
  // "invoiced" comes after installed on the live door list (seen 15 Sep 2026). Build default until Youssef confirms it.
  inPipeline: ["inspected", "claim filed", "signed", "installed", "invoiced"],
} as const;
