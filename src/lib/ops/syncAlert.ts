import { sendEmail } from "../email";

// Alerting for the AccuLynx / RepCard sync crons. Until now a failing sync only
// wrote lastStatus="failed" into SyncState and console.error'd into a PM2 log
// nobody watches, so the leaderboard could go stale for days (the numbers that
// decide recognition) with no signal. We email an operator, but only on the
// SECOND consecutive failure, so a single transient blip (one 500 from AccuLynx,
// a momentary network drop — the clients already retry inside a run) does not
// page anyone; a real outage that survives the next run does.

/**
 * Pure decision: should this failure raise an alert? True only when the run
 * failed AND the previous run had also failed. Kept separate from the I/O so it
 * can be unit-tested. `prevStatus` is the status persisted before this run.
 */
export function shouldAlertSyncFailure(
  prevStatus: string | undefined,
  newStatus: "ok" | "partial" | "failed"
): boolean {
  return newStatus === "failed" && prevStatus === "failed";
}

/** Where sync alerts go. Falls back to the address the app already emails from. */
function alertRecipient(): string {
  return (
    process.env.SYNC_ALERT_EMAIL ||
    process.env.RESEND_FROM_ADDRESS ||
    "tech@millerstorm.com"
  );
}

/**
 * Send the alert. Best-effort and self-contained: a failure to send must never
 * turn a sync failure into an unhandled rejection, so everything is swallowed.
 */
export async function alertSyncFailure(
  source: "AccuLynx" | "RepCard",
  errorMessage: string,
  branch?: string
): Promise<void> {
  try {
    const to = alertRecipient();
    const where = branch ? ` (${branch})` : "";
    await sendEmail({
      to,
      subject: `⚠️ ${source} sync failing${where} — leaderboard may be stale`,
      html:
        `<p>The <strong>${source}</strong> sync${where} has now failed on two consecutive runs.</p>` +
        `<p>The sales leaderboard stops updating from ${source} until this recovers, so the numbers reps and leaders see are going stale.</p>` +
        `<p><strong>Last error:</strong> ${escapeHtml(errorMessage || "unknown")}</p>` +
        `<p>Check the PM2 logs on the server (<code>pm2 logs ${source === "AccuLynx" ? "acculynx-sync" : "repcard-sync"}</code>) and the sync status panel.</p>`,
      text:
        `${source} sync${where} failed twice in a row. The leaderboard is going stale.\n` +
        `Last error: ${errorMessage || "unknown"}\n` +
        `Check: pm2 logs ${source === "AccuLynx" ? "acculynx-sync" : "repcard-sync"}`,
    });
  } catch {
    // Alerting is a safety net, not a critical path — never let it throw.
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
