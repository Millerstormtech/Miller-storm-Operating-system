// src/lib/repcard/sync.ts
import { connectMongo } from "../mongodb";
import { RepCardKnockFactModel } from "../models/RepCardKnockFact";
import { SyncStateModel } from "../models/SyncState";
import { createClient } from "./client";
import { buildUserIndex, extractKnockDrafts } from "./mapping";
import { normEmail, normPhone } from "../leaderboard/identity";
import { REPCARD_LEADERBOARD_ID, REPCARD_LEADERBOARD_NAME, REPCARD_VDK_FIELD } from "./config";
import { getWindowRange } from "../acculynx/windows";

function dateOnly(d: Date): string { return d.toISOString().slice(0, 10); }

// Inclusive UTC-date iterator. UTC midnights + 24h steps => no DST drift.
function* eachDayInclusive(startISO: string, endISO: string): Generator<string> {
  let t = Date.parse(startISO + "T00:00:00.000Z");
  const end = Date.parse(endISO + "T00:00:00.000Z");
  let guard = 0;
  while (t <= end && guard++ < 800) {
    yield new Date(t).toISOString().slice(0, 10);
    t += 86400000;
  }
}

export interface RepCardSyncResult { status: "ok" | "failed" | "skipped"; daysProcessed: number; factsWritten: number; error?: string; }

// Pull per-rep, per-day Verified Door Knocks from RepCard's D2D Leaderboard.
// backfill = year-to-date (one /leaderboards call per day). incremental = re-pull
// yesterday+today (cheap). Facts upsert by `${repcardUserId}:${day}` (idempotent).
export async function runSync(opts: { mode?: "incremental" | "backfill"; dryRun?: boolean } = {}): Promise<RepCardSyncResult> {
  const { mode = "incremental", dryRun = false } = opts;
  await connectMongo();

  const result: RepCardSyncResult = { status: "ok", daysProcessed: 0, factsWritten: 0 };
  const key = process.env.REPCARD_API_KEY;
  if (!key) { result.status = "failed"; result.error = "REPCARD_API_KEY not set"; return result; }

  let state: any = await SyncStateModel.findOne({ key: "repcard" });
  if (!state) state = dryRun ? { lastSyncAt: null } : await SyncStateModel.create({ key: "repcard", branch: "RepCard" });
  // Self-heal a stuck lock: if a previous run crashed mid-sync, `running` can
  // stick forever and every future run would return early. Treat it as stale
  // after 15 min.
  const STALE_LOCK_MS = 15 * 60 * 1000;
  const lockStartedAt = state.runStartedAt ? new Date(state.runStartedAt).getTime() : 0;
  if (!dryRun && state.running && Date.now() - lockStartedAt < STALE_LOCK_MS) {
    result.status = "skipped";
    return result; // another run is actively syncing
  }

  const runStartedAt = new Date();
  if (!dryRun) { state.running = true; state.runStartedAt = runStartedAt; await state.save(); }

  try {
    const client = createClient(key);
    const users = buildUserIndex(await client.fetchUsers());

    const todayISO = dateOnly(new Date());
    let sinceISO: string;
    if (mode === "backfill" || !state.lastSyncAt) sinceISO = dateOnly(getWindowRange("year").start);
    else sinceISO = dateOnly(new Date(state.lastSyncAt.getTime() - 86400000)); // re-pull yesterday + today

    for (const day of eachDayInclusive(sinceISO, todayISO)) {
      const lbResult = await client.fetchLeaderboards(day, day);
      const drafts = extractKnockDrafts(lbResult, {
        leaderboardId: REPCARD_LEADERBOARD_ID, leaderboardName: REPCARD_LEADERBOARD_NAME, vdkField: REPCARD_VDK_FIELD,
      });
      for (const d of drafts) {
        const u = users.get(d.repcardUserId);
        const occurredAt = new Date(day + "T12:00:00.000Z"); // noon UTC == within the Central day
        if (!dryRun) {
          await RepCardKnockFactModel.findOneAndUpdate(
            { factKey: `${d.repcardUserId}:${day}` },
            { $set: {
                repcardUserId: d.repcardUserId,
                repEmail: normEmail(u?.email ?? ""),
                repPhone: normPhone(u?.phone ?? ""),
                repNameSnapshot: u?.name || d.name,
                verifiedKnocks: d.verifiedKnocks,
                occurredAt, location: "", lastSyncedAt: new Date(),
              } },
            { upsert: true }
          );
        }
        result.factsWritten++;
      }
      result.daysProcessed++;
    }

    if (!dryRun) {
      state.lastSyncAt = runStartedAt;
      if (mode === "backfill") state.lastFullSyncAt = runStartedAt;
      state.lastStatus = "ok"; state.lastError = ""; state.factsWritten = result.factsWritten;
    }
  } catch (err: any) {
    result.status = "failed"; result.error = err?.message ?? String(err);
    if (!dryRun) { state.lastStatus = "failed"; state.lastError = result.error; }
  } finally {
    if (!dryRun) { state.running = false; await state.save(); }
  }

  return result;
}
