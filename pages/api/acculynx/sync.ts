// pages/api/acculynx/sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { runSync } from "../../../src/lib/acculynx/sync";
import { requireRole } from "../../../src/lib/auth";

// Authorization. Two paths:
//   1. x-sync-secret header (used by the cron) -- SERVER-TRUSTED and not spoofable.
//   2. a signed admin session (httpOnly cookie or Bearer token) for the in-app
//      "Refresh now" button. Identity is proven by the token, not a body field.
function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.ACCULYNX_SYNC_SECRET;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  // Cron authenticates with the shared secret; everyone else needs an admin session.
  if (!hasSyncSecret(req)) {
    const auth = requireRole(req, res, "admin");
    if (!auth) return;
  }

  const mode = req.body?.mode === "backfill" ? "backfill" : "incremental";
  const dryRun = req.body?.dryRun === true;
  // Optional cap on jobs per location — used only for a bounded dry-run smoke test.
  const limitJobs = Number.isInteger(req.body?.limitJobs) && req.body.limitJobs > 0 ? req.body.limitJobs : undefined;

  // Background mode (the admin "Refresh now" button): a full sync takes minutes,
  // and nginx cuts any request open past 60s with a 504 — which shows up as a
  // console error even though the sync is fine. So kick the sync off and return
  // immediately; the client polls /api/acculynx/status for progress. This runs
  // on a long-lived Node process (PM2), so the work continues after we respond.
  // dryRun always runs synchronously since the caller wants its result inline.
  if (req.body?.background === true && !dryRun) {
    runSync({ mode, dryRun, limitJobs }).catch((err) => {
      console.error("[acculynx/sync] background run failed:", err?.message ?? err);
    });
    return res.status(202).json({ status: "started" });
  }

  const result = await runSync({ mode, dryRun, limitJobs });
  return res.status(200).json(result);
}
