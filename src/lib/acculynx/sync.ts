// src/lib/acculynx/sync.ts
import { connectMongo } from "../mongodb";
import { ScoringFactModel } from "../models/ScoringFact";
import { SyncStateModel } from "../models/SyncState";
import { UserModel } from "../models/User";
import { STAGE_TO_METRIC, REVENUE_STAGE, REP_TYPES } from "./config";
import {
  fetchJobsModifiedSince, fetchMilestoneHistory, fetchRepresentatives,
  fetchFinancials, fetchUserMap,
} from "./client";
import { mapJobToFacts } from "./mapping";
import type { MappingConfig } from "./mapping";
import { getWindowRange } from "./windows";

const MAPPING_CFG: MappingConfig = {
  repTypes: REP_TYPES,
  stageToMetric: STAGE_TO_METRIC,
  revenueStage: REVENUE_STAGE,
};

function toDateOnly(d: Date): string { return d.toISOString().slice(0, 10); }

export interface SyncResult {
  skipped?: boolean;
  status: "ok" | "partial" | "failed";
  jobsProcessed: number;
  factsWritten: number;
  unmatched: { repExternalId: string; name: string }[];
  error?: string;
}

export async function runSync(opts: { mode?: "incremental" | "backfill"; dryRun?: boolean } = {}): Promise<SyncResult> {
  const { mode = "incremental", dryRun = false } = opts;
  await connectMongo();

  let state = await SyncStateModel.findOne({ key: "acculynx" });
  if (!state) state = await SyncStateModel.create({ key: "acculynx" });
  if (state.running) return { skipped: true, status: "ok", jobsProcessed: 0, factsWritten: 0, unmatched: [] };

  const runStartedAt = new Date();
  state.running = true; state.runStartedAt = runStartedAt;
  await state.save();

  const result: SyncResult = { status: "ok", jobsProcessed: 0, factsWritten: 0, unmatched: [] };
  const unmatchedSet = new Map<string, string>();

  try {
    // since: backfill (and first run) = start of the current year (year-to-date);
    // incremental = last watermark minus a 1-day re-fetch buffer.
    const yearStart = getWindowRange("year").start;
    let since: Date;
    if (mode === "backfill" || !state.lastSyncAt) {
      since = yearStart;
    } else {
      since = new Date(state.lastSyncAt.getTime() - 86400000);
    }

    const userMap = await fetchUserMap();
    const jobs = await fetchJobsModifiedSince(toDateOnly(since));

    for (const job of jobs) {
      const [milestoneHistory, representatives, financials] = await Promise.all([
        fetchMilestoneHistory(job.id),
        fetchRepresentatives(job.id),
        fetchFinancials(job.id),
      ]);

      const facts = mapJobToFacts({ job, milestoneHistory, representatives, financials }, MAPPING_CFG);
      result.jobsProcessed++;

      for (const f of facts) {
        // Resolve rep: AccuLynx id -> Miller Storm user (by acculynxUserId, else email)
        let repUserId: string | null = null;
        let repName = f.repExternalId ? (userMap[f.repExternalId]?.name ?? "Unknown Rep") : "Unassigned";

        if (f.repExternalId) {
          const email = userMap[f.repExternalId]?.email;
          const user = await UserModel.findOne({
            $or: [
              { acculynxUserId: f.repExternalId },
              ...(email ? [{ email: new RegExp(`^${escapeRegExp(email)}$`, "i") }] : []),
            ],
            deleted: { $ne: true },
          }).lean();
          if (user) { repUserId = (user as any).id; repName = (user as any).name; }
          else unmatchedSet.set(f.repExternalId, repName);
        }

        if (!dryRun) {
          await ScoringFactModel.findOneAndUpdate(
            { factKey: f.factKey },
            { $set: {
                jobId: f.jobId, metric: f.metric, repExternalId: f.repExternalId,
                repUserId, repNameSnapshot: repName, value: f.value,
                occurredAt: f.occurredAt, location: f.location, lastSyncedAt: new Date(),
              } },
            { upsert: true }
          );
        }
        result.factsWritten++;
      }
    }

    result.unmatched = [...unmatchedSet].map(([repExternalId, name]) => ({ repExternalId, name }));

    if (!dryRun) {
      // Watermark = run START time (not end), so jobs modified mid-run are re-pulled
      // next time rather than skipped.
      state.lastSyncAt = runStartedAt;
      if (mode === "backfill") state.lastFullSyncAt = runStartedAt;
    }
    state.lastStatus = "ok"; state.lastError = "";
    state.jobsProcessed = result.jobsProcessed; state.factsWritten = result.factsWritten;
    state.unmatchedCount = result.unmatched.length;
  } catch (err: any) {
    result.status = "failed"; result.error = err?.message ?? String(err);
    state.lastStatus = "failed"; state.lastError = result.error;
    // NOTE: lastSyncAt is intentionally NOT advanced on failure -> next run repairs.
  } finally {
    state.running = false;
    await state.save();
  }

  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
