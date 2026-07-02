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
  const result = await runSync({ mode, dryRun });
  return res.status(200).json(result);
}
