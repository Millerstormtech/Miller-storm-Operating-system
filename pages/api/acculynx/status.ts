// pages/api/acculynx/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SyncStateModel } from "../../../src/lib/models/SyncState";

// Returns an aggregate sync status (summed across every location) PLUS a per-location
// breakdown. Per-location state lives in docs keyed "acculynx:<companyId>".
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  const states = await SyncStateModel.find({ key: { $regex: /^acculynx:/ } }).lean();

  if (!states.length) {
    // Fall back to the legacy single-location doc if a multi-location sync hasn't run yet.
    const legacy = await SyncStateModel.findOne({ key: "acculynx" }).lean();
    return res.status(200).json(legacy ? { ...legacy, locations: [] } : { key: "acculynx", lastStatus: "never", locations: [] });
  }

  const locations = states
    .map((s: any) => ({
      branch: s.branch || s.key,
      lastSyncAt: s.lastSyncAt ?? null,
      lastStatus: s.lastStatus ?? "never",
      jobsProcessed: s.jobsProcessed ?? 0,
      factsWritten: s.factsWritten ?? 0,
      unmatchedCount: s.unmatchedCount ?? 0,
      running: !!s.running,
      lastError: s.lastError || "",
    }))
    .sort((a, b) => a.branch.localeCompare(b.branch));

  const times = locations.map((l) => l.lastSyncAt).filter(Boolean).map((d) => new Date(d as any).getTime());
  const anyFailed = locations.some((l) => l.lastStatus === "failed");
  const anyOk = locations.some((l) => l.lastStatus === "ok");

  return res.status(200).json({
    key: "acculynx",
    lastStatus: anyFailed ? (anyOk ? "partial" : "failed") : (anyOk ? "ok" : "never"),
    lastSyncAt: times.length ? new Date(Math.max(...times)) : null,
    running: locations.some((l) => l.running),
    jobsProcessed: locations.reduce((a, l) => a + l.jobsProcessed, 0),
    factsWritten: locations.reduce((a, l) => a + l.factsWritten, 0),
    unmatchedCount: locations.reduce((a, l) => a + l.unmatchedCount, 0),
    lastError: locations.filter((l) => l.lastError).map((l) => `${l.branch}: ${l.lastError}`).join(" | "),
    locations,
  });
}
