// Storm Bot's claim and contract celebrations. Called by the AccuLynx sync
// immediately after it writes a scoring fact.
//
// Failure-isolated: a broken celebration must never interrupt a sync run or lose
// a fact. Fire-and-forget from the caller's point of view.
import { ScoringFactModel } from "../models/ScoringFact";
import { SalesCelebrationModel } from "../models/SalesCelebration";
import { UserModel } from "../models/User";
import { logToDb } from "../models/SystemLog";
import { claimFiledMessage, contractSignedMessage } from "./copy";
import { isCelebratableMetric, isFresh, isAnnounceableRep, monthStart } from "./eligibility";
import { announce } from "./announce";

// Off by default. Sales wins are daily volume, unlike course completions, so the
// first deploy runs as a DRY RUN: eligible events are logged, never posted and
// never ledgered, which turns the volume estimate into a measurement without
// consuming any win. Flip to "on" once the real daily count is known.
function salesCelebrationsEnabled(): boolean {
  return (process.env.STORMBOT_SALES_CELEBRATIONS || "off").toLowerCase() === "on";
}

export async function celebrateSalesFact(fact: {
  factKey: string;
  jobId: string;
  metric: string;
  repUserId: string | null;
  occurredAt: Date;
}): Promise<void> {
  try {
    const { factKey, jobId, metric, repUserId, occurredAt } = fact;

    if (!isCelebratableMetric(metric)) return;
    if (!isFresh(new Date(occurredAt), new Date())) return;
    if (!repUserId) return;

    const user: any = await UserModel.findOne({ id: repUserId })
      .select("id name email deleted suspended")
      .lean();
    if (!isAnnounceableRep(user)) return;

    // Contracts print the dollar figure from the SIBLING revenue fact: the
    // Approved milestone emits both `won` (the count) and `revenue` (the money).
    // A missing or zero value means AccuLynx has no approved value on the job
    // yet, which selects the amount-free wording rather than posting "$0".
    let amount = 0;
    if (metric === "won") {
      const revenueFact: any = await ScoringFactModel.findOne({
        jobId,
        metric: "revenue",
      })
        .select("value")
        .lean();
      amount = revenueFact?.value ?? 0;
    }

    // Month-to-date count for this rep, INCLUSIVE of the win being announced:
    // the sync upserts the fact before calling us, so it is already counted.
    const monthCount = await ScoringFactModel.countDocuments({
      repUserId,
      metric,
      occurredAt: { $gte: monthStart(new Date()) },
    });

    const name = user.name || user.email || "";
    const text =
      metric === "filed"
        ? claimFiledMessage(name, monthCount, jobId)
        : contractSignedMessage(name, monthCount, amount, jobId);

    // The flag is checked HERE, not at the top, and deliberately so. Checking it
    // first would skip the dry run entirely and produce no measurement. Writing
    // the ledger row during a dry run would be worse: those wins would read as
    // already-announced, so switching the flag on would announce nothing for the
    // first day. The dry run must observe without consuming.
    //
    // A fresh win stays eligible for its full 24 hours, so this line repeats on
    // roughly 48 consecutive sync runs. Daily volume is therefore the count of
    // DISTINCT factKey values in these logs, not the count of log lines, which
    // is why factKey is in the message.
    if (!salesCelebrationsEnabled()) {
      await logToDb("info", "CELEBRATION", `would-announce ${factKey}: ${text}`);
      return;
    }

    // Once ever: insert the ledger row before posting. A duplicate-key error
    // means a prior sync already announced this win; stop silently.
    try {
      await SalesCelebrationModel.create({
        factKey,
        jobId,
        metric,
        repUserId,
        sentAt: new Date(),
      });
    } catch (e: any) {
      if (e && e.code === 11000) return;
      throw e;
    }

    const posted = await announce(text);
    if (posted) {
      await logToDb("info", "CELEBRATION", `announced ${factKey}: ${text}`);
    }
  } catch (e: any) {
    // The sync must never fail because of hype.
    try {
      await logToDb("error", "CELEBRATION", `Sales celebration failed: ${e?.message}`);
    } catch {
      console.error("[CELEBRATION] sales celebration failed:", e);
    }
  }
}
