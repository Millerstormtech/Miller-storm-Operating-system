// src/lib/acculynx/sync.ts
import { connectMongo } from "../mongodb";
import { ScoringFactModel } from "../models/ScoringFact";
import { SyncStateModel } from "../models/SyncState";
import { UserModel } from "../models/User";
import { STAGE_TO_METRIC, REVENUE_STAGE, REP_TYPES, getLocationKeys, cleanBranchName } from "./config";
import { createClient } from "./client";
import type { AcculynxClient } from "./client";
import { mapJobToFacts } from "./mapping";
import type { MappingConfig } from "./mapping";
import { getWindowRange } from "./windows";
import { normEmail, normPhone } from "../leaderboard/identity";

const MAPPING_CFG: MappingConfig = {
  repTypes: REP_TYPES,
  stageToMetric: STAGE_TO_METRIC,
  revenueStage: REVENUE_STAGE,
};

function toDateOnly(d: Date): string { return d.toISOString().slice(0, 10); }
function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export interface LocationSyncResult {
  branch: string;
  companyId: string;
  status: "ok" | "failed" | "skipped";
  jobsProcessed: number;
  factsWritten: number;
  unmatched: { repExternalId: string; name: string }[];
  error?: string;
}

export interface SyncResult {
  status: "ok" | "partial" | "failed";
  jobsProcessed: number;
  factsWritten: number;
  unmatched: { repExternalId: string; name: string }[];
  locations: LocationSyncResult[];
  error?: string;
}

// Sync EVERY configured AccuLynx location (one API key each) into ScoringFacts.
// Each location keeps its own watermark, so a slow/failing location never blocks
// the others. Facts are keyed by jobId:metric (upsert), so re-syncing is idempotent.
export async function runSync(
  opts: { mode?: "incremental" | "backfill"; dryRun?: boolean; limitJobs?: number } = {}
): Promise<SyncResult> {
  const { mode = "incremental", dryRun = false, limitJobs } = opts;
  await connectMongo();

  const agg: SyncResult = { status: "ok", jobsProcessed: 0, factsWritten: 0, unmatched: [], locations: [] };

  const locations = getLocationKeys();
  if (locations.length === 0) {
    agg.status = "failed";
    agg.error = "No AccuLynx API keys configured (set ACCULYNX_API_KEY_<LOCATION>).";
    return agg;
  }

  const seenCompany = new Set<string>();
  for (const loc of locations) {
    const client = createClient(loc.key);

    // Identify which location this key belongs to (and get its branch label).
    let companyId = "";
    let branch = loc.envVar;
    try {
      const cs = await client.fetchCompanySettings();
      if (!cs?.companyId) throw new Error(`no company-settings resolved for ${loc.envVar}`);
      companyId = cs.companyId;
      branch = cleanBranchName(cs.name);
    } catch (err: any) {
      agg.locations.push({ branch, companyId, status: "failed", jobsProcessed: 0, factsWritten: 0, unmatched: [], error: err?.message ?? String(err) });
      agg.status = agg.status === "ok" ? "partial" : agg.status;
      continue;
    }

    // A duplicate key (or a bare + named key for the same location) -> sync once.
    if (seenCompany.has(companyId)) {
      agg.locations.push({ branch, companyId, status: "skipped", jobsProcessed: 0, factsWritten: 0, unmatched: [] });
      continue;
    }
    seenCompany.add(companyId);

    const r = await syncOneLocation(client, { companyId, branch, mode, dryRun, limitJobs });
    agg.jobsProcessed += r.jobsProcessed;
    agg.factsWritten += r.factsWritten;
    agg.unmatched.push(...r.unmatched);
    agg.locations.push(r);
    if (r.status === "failed") agg.status = agg.status === "ok" ? "partial" : agg.status;
  }

  // If EVERY location failed, surface it as a hard failure.
  const ran = agg.locations.filter((l) => l.status !== "skipped");
  if (ran.length > 0 && ran.every((l) => l.status === "failed")) agg.status = "failed";

  return agg;
}

async function syncOneLocation(
  client: AcculynxClient,
  ctx: { companyId: string; branch: string; mode: "incremental" | "backfill"; dryRun: boolean; limitJobs?: number }
): Promise<LocationSyncResult> {
  const { companyId, branch, mode, dryRun, limitJobs } = ctx;
  const stateKey = `acculynx:${companyId}`;
  const result: LocationSyncResult = { branch, companyId, status: "ok", jobsProcessed: 0, factsWritten: 0, unmatched: [] };
  const unmatchedSet = new Map<string, string>();

  // Load (or, when writing, create) this location's sync state. In dryRun we never
  // touch the DB state — use a transient stand-in so nothing is written.
  let state: any = await SyncStateModel.findOne({ key: stateKey });
  if (!state) {
    if (dryRun) state = { lastSyncAt: null };
    else state = await SyncStateModel.create({ key: stateKey, branch });
  }
  if (!dryRun && state.running) { result.status = "skipped"; return result; } // already running

  const runStartedAt = new Date();
  if (!dryRun) {
    state.running = true; state.runStartedAt = runStartedAt; state.branch = branch;
    await state.save();
  }

  try {
    // since: backfill (and first run) = start of the current year (year-to-date);
    // incremental = last watermark minus a 1-day re-fetch buffer.
    const yearStart = getWindowRange("year").start;
    let since: Date;
    if (mode === "backfill" || !state.lastSyncAt) since = yearStart;
    else since = new Date(state.lastSyncAt.getTime() - 86400000);

    const userMap = await client.fetchUserMap();
    let jobs = await client.fetchJobsModifiedSince(toDateOnly(since));
    if (limitJobs && jobs.length > limitJobs) jobs = jobs.slice(0, limitJobs); // smoke/test cap

    for (const job of jobs) {
      const [milestoneHistory, representatives, financials] = await Promise.all([
        client.fetchMilestoneHistory(job.id),
        client.fetchRepresentatives(job.id),
        client.fetchFinancials(job.id),
      ]);

      const facts = mapJobToFacts({ job, milestoneHistory, representatives, financials }, MAPPING_CFG, branch);
      result.jobsProcessed++;

      for (const f of facts) {
        // Resolve rep: AccuLynx id -> Miller Storm user (by acculynxUserId, else email).
        let repUserId: string | null = null;
        let repName = f.repExternalId ? (userMap[f.repExternalId]?.name ?? "Unknown Rep") : "Unassigned";
        const repEmail = f.repExternalId ? normEmail(userMap[f.repExternalId]?.email) : "";
        const repPhone = f.repExternalId ? normPhone(userMap[f.repExternalId]?.phone) : "";

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
                repUserId, repNameSnapshot: repName, repEmail, repPhone, value: f.value,
                occurredAt: f.occurredAt, location: f.location, city: f.city,
                sourceCompanyId: companyId, lastSyncedAt: new Date(),
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
      state.lastStatus = "ok"; state.lastError = "";
      state.jobsProcessed = result.jobsProcessed; state.factsWritten = result.factsWritten;
      state.unmatchedCount = result.unmatched.length;
    }
  } catch (err: any) {
    result.status = "failed";
    result.error = err?.message ?? String(err);
    if (!dryRun) { state.lastStatus = "failed"; state.lastError = result.error; }
    // NOTE: lastSyncAt is intentionally NOT advanced on failure -> next run repairs.
  } finally {
    if (!dryRun) { state.running = false; await state.save(); }
  }

  return result;
}
