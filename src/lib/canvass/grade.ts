// src/lib/canvass/grade.ts
// How one house gets its Knock Planner color (spec A4).
//
// Pure: no DB, no React, no clock. The caller passes the house's facts and
// today's date as "YYYY-MM-DD". The nightly recompute, the map API and the
// backtest all call this one function, so the map can never disagree with the
// test that justified it.

import { GRADE, KNOCK_RESULTS, type GradeConfig } from "./config";
import { biggestHailInWindow, formatInches, type HailEvent } from "./hail";
import { daysBetween, formatDay, monthsBefore } from "./dates";

/** One RepCard knock at a house: its result as typed in RepCard, and the day. */
export type Knock = { status: string; at: string };

export type HomeFacts = {
  yearBuilt: number | null;
  /** False when the county's year-built data failed its quality check (Hockley, for one). */
  yearBuiltReliable: boolean;
  /** Mailing address matches the house, or the homestead flag in Dallas. Null when unknown. */
  ownerLivesHere: boolean | null;
  /** Storm days that reached this house, sizes already rounded to the quarter inch. */
  hail: HailEvent[];
  /** Every RepCard knock at this house, in any order. */
  knocks: Knock[];
  /** An AccuLynx job at this address that is not cancelled. */
  openAccuLynxJob: boolean;
  /** The most recent day a nearby house (not this one) signed with us, or null. */
  neighborSignedAt: string | null;
};

export type Color = "green" | "yellow" | "orange" | "red";

export type Reason = { text: string; points: number };

export type Grade = {
  /** The points total. Kept even when the color is forced to red, for the backtest. */
  score: number;
  color: Color;
  /** Why the house is red whatever its points, or null. */
  forced: "do-not-knock" | "in-pipeline" | null;
  /** For the house card, in order. A forced-red reason always comes first. */
  reasons: Reason[];
};

const matchKey = (status: string) => status.trim().replace(/\s+/g, " ").toLowerCase();
const tidy = (status: string) => status.trim().replace(/\s+/g, " ");

/** The most recent knock whose result is one of `results`, or null. */
function latestWith(knocks: Knock[], results: readonly string[]): Knock | null {
  let found: Knock | null = null;
  for (const k of knocks) {
    if (!results.includes(matchKey(k.status))) continue;
    if (!found || k.at > found.at) found = k;
  }
  return found;
}

/** True when `day` is between `daysAgo` days before today and today, both ends included. */
function withinDays(day: string, today: string, daysAgo: number): boolean {
  const age = daysBetween(day, today);
  return age >= 0 && age <= daysAgo;
}

export function colorForScore(score: number, config: GradeConfig = GRADE): Color {
  if (score >= config.colors.green) return "green";
  if (score >= config.colors.yellow) return "yellow";
  if (score >= config.colors.orange) return "orange";
  return "red";
}

export function gradeHome(facts: HomeFacts, today: string, config: GradeConfig = GRADE): Grade {
  const reasons: Reason[] = [];
  let score = 0;
  const add = (text: string, points: number) => {
    reasons.push({ text, points });
    score += points;
  };

  // Hail: only the biggest storm in the window counts, never a sum of storms.
  const bands = [...config.hailBands].sort((a, b) => b.minInches - a.minInches);
  const storm = biggestHailInWindow(facts.hail, today, config.hailLookbackMonths);
  const band = storm ? bands.find((b) => storm.inches >= b.minInches) : undefined;
  if (storm && band) {
    add(`Hail ${formatInches(storm.inches)} in on ${formatDay(storm.date)}`, band.points);
  } else {
    const smallest = formatInches(bands[bands.length - 1].minInches);
    add(`No hail of ${smallest} in or bigger in the last ${config.hailLookbackMonths} months`, 0);
  }

  // Age of the house, the stand-in for roof age. Unknown counts as middle-aged
  // so a county with missing data is not pushed toward red.
  const thisYear = Number(today.slice(0, 4));
  const built = facts.yearBuilt;
  if (!facts.yearBuiltReliable || built === null || built < 1800 || built > thisYear) {
    add("Age unknown", config.age.unknownPoints);
  } else {
    const age = thisYear - built;
    const points = age >= config.age.oldYears ? config.age.oldPoints : age >= config.age.midYears ? config.age.midPoints : 0;
    const label = age === 0 ? "this year" : `${age} year${age === 1 ? "" : "s"} old`;
    add(`Built ${built} (${label})`, points);
  }

  // Who lives there. Unknown adds nothing and is not mentioned.
  if (facts.ownerLivesHere === true) add("Owner appears to live here", config.owner.livesHerePoints);
  if (facts.ownerLivesHere === false) add("Owner appears to live elsewhere", config.owner.livesElsewherePoints);

  // What our reps found at the door.
  const windowStart = monthsBefore(today, config.hailLookbackMonths);
  const recentKnocks = facts.knocks.filter((k) => k.at >= windowStart && k.at <= today);
  const damage = latestWith(recentKnocks, [KNOCK_RESULTS.visibleDamage]);
  if (damage) add(`Rep saw visible damage on ${formatDay(damage.at)}`, config.visibleDamagePoints);

  const notInterested = latestWith(facts.knocks, [KNOCK_RESULTS.notInterested]);
  if (notInterested && withinDays(notInterested.at, today, config.notInterested.withinDays)) {
    add(`Not interested on ${formatDay(notInterested.at)}`, config.notInterested.points);
  }

  const renter = latestWith(facts.knocks, [KNOCK_RESULTS.renter]);
  if (renter) add(`Marked as a renter on ${formatDay(renter.at)}`, config.renterPoints);

  if (facts.neighborSignedAt && withinDays(facts.neighborSignedAt, today, config.neighborSigned.withinDays)) {
    add(`A neighbor signed with us on ${formatDay(facts.neighborSignedAt)}`, config.neighborSigned.points);
  }

  if (facts.knocks.length === 0) reasons.push({ text: "Not knocked by Miller Storm yet", points: 0 });

  // Always red, whatever the points. Do Not Knock outranks everything.
  const doNotKnock = latestWith(facts.knocks, [KNOCK_RESULTS.doNotKnock]);
  const pipeline = latestWith(facts.knocks, KNOCK_RESULTS.inPipeline);
  let forced: Grade["forced"] = null;
  let forcedReason: Reason | null = null;
  if (doNotKnock) {
    forced = "do-not-knock";
    forcedReason = { text: `Do not knock (marked ${formatDay(doNotKnock.at)})`, points: 0 };
  } else if (pipeline) {
    forced = "in-pipeline";
    forcedReason = { text: `Already working with us: ${tidy(pipeline.status)} on ${formatDay(pipeline.at)}`, points: 0 };
  } else if (facts.openAccuLynxJob) {
    forced = "in-pipeline";
    forcedReason = { text: "Open AccuLynx job at this address", points: 0 };
  }

  return {
    score,
    color: forced ? "red" : colorForScore(score, config),
    forced,
    reasons: forcedReason ? [forcedReason, ...reasons] : reasons,
  };
}
