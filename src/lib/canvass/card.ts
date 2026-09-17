// src/lib/canvass/card.ts
// The house card a rep sees when they tap a dot (spec A3, B5 homes/[id]), and
// the "when did we last knock here" lookup the dots use. Both built from the
// stored house, its RepCard doors and its AccuLynx jobs.
//
// What the card may carry is decided here, in one place: the owner's name is
// shown (spec A8.5) and so is each knocking rep's name (A8.4); a homeowner's
// phone or email is never stored, so it can never appear (B8).
//
// Pure: no DB, no React, no clock.

import type { Color } from "./grade";
import { doorEvents, type DoorEvent } from "./doors";
import { centralDay } from "./dates";
import { stripFormerMarker } from "../leaderboard/formerRep";

/** A RepCard door as stored, with the house it sits on. Times may be Dates (from the database) or strings. */
export type CardDoor = {
  homeId: unknown;
  status: string;
  statusAt: string | Date | null;
  knocks: Array<{ at: string | Date; status: string; userId?: number | null; rep: string; verified?: boolean }>;
  statusChanges: Array<{ at: string | Date; from: string; to: string; userId?: number | null; rep: string }>;
};

/** An AccuLynx job as stored, with the house it sits on. */
export type CardJob = { homeId: unknown; milestone: string; milestoneAt: string | Date | null };

export type CardHome = {
  _id: unknown;
  address: { line: string; city: string; zip: string };
  ownerName: string;
  yearBuilt: number | null;
  ownerLivesHere: boolean | null;
  roofMaterial: string;
  hail: Array<{ date: string; inches: number }>;
  grade?: { score?: number | null; color?: Color | null; forced?: string | null; reasons?: Array<{ text: string; points: number }> };
  gradedOn: string;
};

const iso = (value: string | Date | null | undefined): string => (value instanceof Date ? value.toISOString() : value ?? "");

/** A door's events with every time as text, the form doorEvents reads. */
function eventsOf(door: CardDoor): DoorEvent[] {
  return doorEvents({
    status: door.status,
    statusAt: iso(door.statusAt) || null,
    knocks: door.knocks.map((k) => ({ at: iso(k.at), status: k.status, userId: k.userId ?? null, rep: k.rep, verified: k.verified ?? false })),
    statusChanges: door.statusChanges.map((c) => ({ at: iso(c.at), from: c.from, to: c.to, userId: c.userId ?? null, rep: c.rep })),
  });
}

/**
 * For each house, the Texas day of its most recent RepCard event. A house with
 * doors but no dated event is left out, the same as a house never knocked.
 */
export function latestKnockDayByHome(doors: readonly CardDoor[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const door of doors) {
    if (door.homeId === null || door.homeId === undefined) continue;
    const homeId = String(door.homeId);
    for (const event of eventsOf(door)) {
      const day = centralDay(event.at);
      if (!day) continue;
      const known = latest.get(homeId);
      if (known === undefined || day > known) latest.set(homeId, day);
    }
  }
  return latest;
}

/** How many past knocks the card lists (spec B5: the last 5). */
export const CARD_KNOCKS = 5;

export type CardKnock = { day: string; status: string; rep: string };

export type HouseCard = {
  id: string;
  address: { line: string; city: string; zip: string };
  ownerName: string;
  yearBuilt: number | null;
  ownerLivesHere: boolean | null;
  roofMaterial: string;
  color: Color | null;
  score: number | null;
  forced: string | null;
  reasons: Array<{ text: string; points: number }>;
  /** Newest storm first. */
  hail: Array<{ date: string; inches: number }>;
  /** The last few RepCard events at this house, newest first. */
  knocks: CardKnock[];
  /** Every AccuLynx job at this house: its stage and the day it reached it. */
  jobs: Array<{ stage: string; day: string | null }>;
  gradedOn: string;
};

export function houseCard(home: CardHome, doors: readonly CardDoor[], jobs: readonly CardJob[]): HouseCard {
  const id = String(home._id);
  const events: CardKnock[] = [];
  for (const door of doors) {
    if (String(door.homeId) !== id) continue;
    for (const event of eventsOf(door)) {
      const day = centralDay(event.at);
      // RepCard writes its former-rep marker into the name; on a house card the
      // rep is simply who knocked, so the marker comes off (the leaderboard does the same).
      if (day) events.push({ day, status: event.status, rep: stripFormerMarker(event.rep) });
    }
  }
  events.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));

  return {
    id,
    address: { line: home.address?.line ?? "", city: home.address?.city ?? "", zip: home.address?.zip ?? "" },
    ownerName: home.ownerName ?? "",
    yearBuilt: home.yearBuilt ?? null,
    ownerLivesHere: home.ownerLivesHere ?? null,
    roofMaterial: home.roofMaterial ?? "",
    color: home.grade?.color ?? null,
    score: home.grade?.score ?? null,
    forced: home.grade?.forced ?? null,
    reasons: home.grade?.reasons ?? [],
    hail: [...(home.hail ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    knocks: events.slice(0, CARD_KNOCKS),
    jobs: jobs
      .filter((job) => String(job.homeId) === id)
      .map((job) => ({ stage: job.milestone || "", day: job.milestoneAt ? centralDay(job.milestoneAt) : null })),
    gradedOn: home.gradedOn ?? "",
  };
}
