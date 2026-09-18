// src/lib/canvass/jobs.ts
// AccuLynx jobs on the Canvass Map: where each job is, its stage and when, from
// one item of AccuLynx GET /jobs. A house with a job that is not cancelled is
// already ours (spec A4), so the map shows it red.
//
// Deliberately NOT kept: the job name (usually the homeowner's name), contacts
// and lead details (spec B8).
//
// Pure: no DB, no network.

import { REVENUE_STAGE } from "../acculynx/config";
import { GRADE, type GradeConfig } from "./config";
import { monthsBefore } from "./dates";

export type JobRecord = {
  jobId: string;
  jobNumber: string;
  branch: string; // the AccuLynx location the job belongs to, e.g. "DFW"
  location: { type: "Point"; coordinates: [number, number] } | null; // [longitude, latitude]
  address: { line: string; city: string; state: string; zip: string };
  milestone: string; // current stage: Lead, Prospect, Approved, Completed, Invoiced, Closed or Cancelled
  milestoneAt: string | null;
  jobCreatedAt: string | null;
  jobModifiedAt: string | null;
  tradeTypes: string[];
  workType: string;
  jobCategory: string;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A GeoJSON point from AccuLynx's numeric geoLocation, or null when it is missing, zero or impossible. */
function jobPoint(geo: { latitude?: unknown; longitude?: unknown } | undefined): JobRecord["location"] {
  const lat = geo?.latitude;
  const lon = geo?.longitude;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 || lon === 0 || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { type: "Point", coordinates: [lon, lat] };
}

export function mapJob(job: any, branch: string): JobRecord {
  const address = job?.locationAddress ?? {};
  return {
    jobId: text(job?.id),
    jobNumber: text(job?.jobNumber),
    branch,
    location: jobPoint(job?.geoLocation),
    address: {
      line: [text(address.street1), text(address.street2)].filter(Boolean).join(" "),
      city: text(address.city),
      state: text(address.state?.abbreviation),
      zip: text(address.zipCode),
    },
    milestone: text(job?.currentMilestone),
    milestoneAt: text(job?.milestoneDate) || null,
    jobCreatedAt: text(job?.createdDate) || null,
    jobModifiedAt: text(job?.modifiedDate) || null,
    tradeTypes: Array.isArray(job?.tradeTypes) ? job.tradeTypes.map((trade: { name?: unknown }) => text(trade?.name)).filter(Boolean) : [],
    workType: text(job?.workType?.name),
    jobCategory: text(job?.jobCategory?.name),
  };
}

/**
 * Spec A4: a job counts as ours while it is not cancelled. Used for reporting
 * counts. For "should this house be red", use jobBlocksKnocking below, which
 * also lets an old finished job expire.
 */
export function isOpenJob(job: Pick<JobRecord, "milestone">): boolean {
  return job.milestone !== "Cancelled";
}

/**
 * Does this job keep the house red today?
 *
 * Cancelled never blocks. Closed means we already replaced that roof, so it
 * blocks only for config.closedJobBlocksYears (Youssef, 16 Sep 2026): after a
 * new storm an old customer is a fair door again. Every other stage is live
 * work and blocks with no time limit.
 *
 * A Closed job with no date is treated as recent, so a missing date can never
 * release a house by accident.
 */
export function jobBlocksKnocking(
  job: Pick<JobRecord, "milestone" | "milestoneAt">,
  today: string,
  config: GradeConfig = GRADE
): boolean {
  if (job.milestone === "Cancelled") return false;
  if (job.milestone !== "Closed") return true;
  if (!job.milestoneAt) return true;
  const closedOn = job.milestoneAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) return true;
  // Days sort correctly as text, so "on or after the cut-off" is a string compare.
  return closedOn >= monthsBefore(today, config.closedJobBlocksYears * 12);
}

/**
 * When the job was signed: the date it reached Approved, the stage the sales
 * leaderboard counts as a contract (REVENUE_STAGE in acculynx/config), read from
 * AccuLynx GET /jobs/{id}/milestone-history. Null when it never got there.
 */
export function signedDateFrom(history: { items?: Array<{ name?: string; date?: string }> } | null | undefined): string | null {
  const reached = (history?.items ?? []).find((item) => item?.name === REVENUE_STAGE);
  return reached?.date ? reached.date : null;
}
