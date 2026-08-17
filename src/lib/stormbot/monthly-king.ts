// Storm Bot's monthly Contract King announcement. Fires on the 1st of each
// month at 09:00 Central and posts the FINISHED month's top rep by Contract
// Amount into Main Chat 2026.
//
// Why the previous month and not the current one: on the 1st the new month is
// nine hours old and every rep sits at $0, so "this month's king" would be
// meaningless. The month that just ended is settled and can be reported as a
// result. See previousMonthRange() in acculynx/windows.ts.
//
// Failure-isolated like every other celebration: this must never throw at its
// caller. The worst outcome of a bug here is a missing post, never a broken
// cron or a corrupted ledger.
import { MonthlyKingAnnouncementModel } from "../models/MonthlyKingAnnouncement";
import { logToDb } from "../models/SystemLog";
import { computeSalesRows } from "../leaderboard/compute";
import { pickContractKing, kingMonthLabel } from "../leaderboard/contractKing";
import { stripFormerMarker } from "../leaderboard/formerRep";
import { previousMonthRange, centralDateStr } from "../acculynx/windows";
import { monthlyContractKingMessage } from "./copy";
import { announce } from "./announce";

// Deliberately the SAME switch as the per-deal claim and contract celebrations,
// so Storm Bot's sales voice has one on/off control rather than two that can
// drift apart. Note the consequence: this post cannot go live while the per-deal
// firehose stays off, and turning it on turns both on.
function salesCelebrationsEnabled(): boolean {
  return (process.env.STORMBOT_SALES_CELEBRATIONS || "off").toLowerCase() === "on";
}

export interface MonthlyKingResult {
  status: "posted" | "already-sent" | "no-king" | "dry-run" | "post-failed";
  month: string;
  king?: { id: string; name: string; revenue: number };
  text?: string;
}

/**
 * Announce the previous calendar month's Contract King, at most once ever.
 *
 * `now` is injectable so the endpoint can be re-run for a specific month during
 * verification without waiting for the 1st.
 */
export async function announceMonthlyKing(now: Date = new Date()): Promise<MonthlyKingResult> {
  const range = previousMonthRange(now);
  // The month being announced, as YYYY-MM in Central time. Taken from the range
  // START, not from `now`: at 09:00 on the 1st those are different months, and
  // the ledger has to be keyed on the one we are reporting.
  const monthIso = centralDateStr(range.start);
  const month = monthIso.slice(0, 7);

  try {
    // Same rows the Sales Leaderboard itself would show for that month, via the
    // shared compute path, so the announcement can never crown someone the board
    // disagrees with.
    const rows = await computeSalesRows(range);
    const king = pickContractKing(
      rows.map((r) => ({
        id: r.id, name: r.name, revenue: r.revenue, won: r.won,
        filed: r.filed, lead: r.leadsCreated, verifiedKnocks: r.verifiedKnocks,
      }))
    );

    // No king means nobody signed anything all month (pickContractKing refuses to
    // crown at or below $0). Post nothing rather than an empty celebration.
    if (!king) {
      await logToDb("info", "CELEBRATION", `monthly-king ${month}: no king, nothing posted`);
      return { status: "no-king", month };
    }

    // The board shows the RepCard name verbatim, cross mark and all. A departed
    // rep can still have won the month, and the board crowned them on screen all
    // along, so they are not excluded here. The marker is stripped only so the
    // sentence reads as a celebration rather than a glitch.
    const name = stripFormerMarker(king.name) || king.name;
    const text = monthlyContractKingMessage(name, king.revenue, kingMonthLabel(monthIso), month);

    // Checked HERE rather than at the top, matching sales-celebration.ts: an
    // early return would skip the computation and log nothing, so a dry run
    // would tell you neither who won nor how the sentence reads. The ledger row
    // is deliberately NOT written during a dry run, so flipping the switch on
    // does not swallow the first real month.
    if (!salesCelebrationsEnabled()) {
      await logToDb("info", "CELEBRATION", `monthly-king would-announce ${month}: ${text}`);
      return { status: "dry-run", month, king, text };
    }

    // Once ever: insert before posting. A duplicate-key error means a previous
    // run already announced this month (a PM2 restart at 09:00, a re-deploy, a
    // manual re-trigger), so stop silently.
    try {
      await MonthlyKingAnnouncementModel.create({
        month,
        repId: king.id,
        repName: king.name,
        revenue: king.revenue,
        sentAt: new Date(),
      });
    } catch (e: any) {
      if (e && e.code === 11000) return { status: "already-sent", month, king };
      throw e;
    }

    const posted = await announce(text);
    if (posted) {
      await logToDb("info", "CELEBRATION", `monthly-king announced ${month}: ${text}`);
      return { status: "posted", month, king, text };
    }
    // announce() already logged the reason. The ledger row stays: re-posting on
    // the next tick would risk a duplicate far more visibly than a missed post,
    // and the row records exactly which month needs a manual follow-up.
    return { status: "post-failed", month, king, text };
  } catch (e: any) {
    try {
      await logToDb("error", "CELEBRATION", `monthly-king failed for ${month}: ${e?.message}`);
    } catch {
      console.error("[CELEBRATION] monthly king failed:", e);
    }
    return { status: "post-failed", month };
  }
}
