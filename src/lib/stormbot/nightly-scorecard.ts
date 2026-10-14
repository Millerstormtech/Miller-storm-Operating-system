// Storm Bot's nightly SCORECARD: gathers the day's announced wins and today's
// top knockers, and posts once per Central date. The words live in scorecard.ts.
// Failure-isolated: never throws to the endpoint or cron.
import { SalesCelebrationModel } from "../models/SalesCelebration";
import { ScoringFactModel } from "../models/ScoringFact";
import { UserModel } from "../models/User";
import { ScorecardPostModel } from "../models/ScorecardPost";
import { logToDb } from "../models/SystemLog";
import { computeSalesRows } from "../leaderboard/compute";
import { getWindowRange } from "../acculynx/windows";
import { isAnnounceableRep } from "./eligibility";
import { buildScorecard, scorecardWindow, scorecardDue, type ScorecardWin, type ScorecardKnocker } from "./scorecard";
import { announce } from "./announce";

export interface NightlyScorecardResult {
  status: "posted" | "quiet" | "already-posted" | "off" | "too-early" | "post-failed" | "error";
  date: string;
  text?: string;
  error?: string;
  mentionIds?: string[];
}

// Kill switch only; on by default (live on deploy, Youssef 2026-10-14).
function scorecardEnabled(): boolean {
  return (process.env.STORMBOT_NIGHTLY_SCORECARD || "on").toLowerCase() !== "off";
}

export async function runNightlyScorecard(now: Date = new Date()): Promise<NightlyScorecardResult> {
  const { start, end, date } = scorecardWindow(now);
  try {
    if (!scorecardEnabled()) return { status: "off", date };
    // A manual call before 22:00 Central would post a partial day and burn the
    // date's row, so the real 22:00 run would be refused as already-posted.
    if (!scorecardDue(now)) return { status: "too-early", date };
    if (await ScorecardPostModel.exists({ date })) return { status: "already-posted", date };

    // Wins = exactly what Storm Bot already announced in the window, so the
    // scorecard can never disagree with the posts people saw that day.
    const rows: any[] = await SalesCelebrationModel.find({ sentAt: { $gte: start, $lt: end } }).lean();
    const userIds = [...new Set(rows.map((r) => r.repUserId))];
    const users: any[] = await UserModel.find({ id: { $in: userIds } }).select("_id id name deleted suspended").lean();
    const byId = new Map(users.filter(isAnnounceableRep).map((u) => [u.id, u]));

    const wonJobIds = rows.filter((r) => r.metric === "won").map((r) => r.jobId);
    const revenue: any[] = wonJobIds.length
      ? await ScoringFactModel.find({ jobId: { $in: wonJobIds }, metric: "revenue" }).select("jobId value").lean()
      : [];
    const amountByJob = new Map(revenue.map((f) => [f.jobId, f.value || 0]));

    const wins: ScorecardWin[] = [];
    for (const r of rows) {
      const u = byId.get(r.repUserId);
      if (!u) continue; // deleted, suspended, or gone
      wins.push({
        userId: String(u._id),
        name: u.name || "",
        metric: r.metric,
        amount: r.metric === "won" ? amountByJob.get(r.jobId) || 0 : 0,
      });
    }

    // Today's knocks, from the same rows the Sales Leaderboard "Today" view uses.
    // A failure here drops only the knockers section, never the post.
    let knockers: ScorecardKnocker[] = [];
    try {
      const salesRows = await computeSalesRows(getWindowRange("day", now));
      const knocksByUser = new Map<string, number>();
      for (const row of salesRows) {
        if (!row.repUserId) continue;
        knocksByUser.set(row.repUserId, (knocksByUser.get(row.repUserId) || 0) + (row.verifiedKnocks || 0));
      }
      const kUsers: any[] = await UserModel.find({ id: { $in: [...knocksByUser.keys()] } })
        .select("_id id name deleted suspended").lean();
      knockers = kUsers.filter(isAnnounceableRep).map((u) => ({
        userId: String(u._id), name: u.name || "", knocks: knocksByUser.get(u.id) || 0,
      }));
    } catch (e: any) {
      await logToDb("error", "SCORECARD", `${date}: knockers skipped: ${e?.message}`);
    }

    const card = buildScorecard({ date, wins, knockers });
    if (!card) {
      await logToDb("info", "SCORECARD", `${date}: quiet day, nothing posted`);
      return { status: "quiet", date };
    }

    try {
      await ScorecardPostModel.create({ date, sentAt: new Date(), text: card.text });
    } catch (e: any) {
      if (e?.code === 11000) return { status: "already-posted", date };
      throw e;
    }

    const posted = await announce(card.text, card.mentionIds);
    await logToDb(posted ? "info" : "error", "SCORECARD", `${date}: ${posted ? "posted" : "post failed"}: ${card.text}`);
    return { status: posted ? "posted" : "post-failed", date, text: card.text, mentionIds: card.mentionIds };
  } catch (e: any) {
    try { await logToDb("error", "SCORECARD", `${date}: failed: ${e?.message}`); } catch { console.error("[SCORECARD]", e); }
    return { status: "error", date, error: e?.message };
  }
}
