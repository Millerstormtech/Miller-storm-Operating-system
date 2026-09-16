// src/lib/canvass/facts.ts
// Gathering one house's facts for gradeHome(): its own record, its county's
// quality flags, and the RepCard doors and AccuLynx jobs matched to it.
//
// Pure: no DB.

import type { HomeFacts, Knock } from "./grade";
import type { HailEvent } from "./hail";
import { doorEvents, type DoorRecord } from "./doors";
import { centralDay } from "./dates";
import { jobBlocksKnocking } from "./jobs";

/** A matched RepCard door as the grade needs it, times as UTC timestamps. */
export type StoredDoor = Pick<DoorRecord, "status" | "statusAt" | "knocks" | "statusChanges">;

/** Every event at the house's doors, each dated by its day in Texas. */
export function knocksForGrade(doors: readonly StoredDoor[]): Knock[] {
  const knocks: Knock[] = [];
  for (const door of doors) {
    for (const event of doorEvents(door)) {
      const day = centralDay(event.at);
      if (day) knocks.push({ status: event.status, at: day });
    }
  }
  return knocks;
}

export function homeFacts(
  input: {
    yearBuilt: number | null;
    ownerLivesHere: boolean | null;
    hail: HailEvent[];
    /** The county's quality flags; year built is not trusted where it looks like an effective year (Hockley). */
    countyFlags: readonly string[];
    doors: readonly StoredDoor[];
    jobs: ReadonlyArray<{ milestone: string; milestoneAt?: string | null }>;
    neighborSignedAt: string | null;
  },
  /** Today as "YYYY-MM-DD": a finished job stops blocking after some years. */
  today: string
): HomeFacts {
  const blocking = input.jobs.find((job) =>
    jobBlocksKnocking({ milestone: job.milestone, milestoneAt: job.milestoneAt ?? null }, today)
  );
  return {
    yearBuilt: input.yearBuilt,
    yearBuiltReliable: !input.countyFlags.includes("year-built-suspicious"),
    ownerLivesHere: input.ownerLivesHere,
    hail: input.hail,
    knocks: knocksForGrade(input.doors),
    blockingJobStage: blocking ? blocking.milestone : null,
    neighborSignedAt: input.neighborSignedAt,
  };
}
