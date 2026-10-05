// pages/api/repcard/sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { runSync } from "../../../src/lib/repcard/sync";
import { requireRole } from "../../../src/lib/auth";

// Two paths, like pages/api/acculynx/sync.ts:
//   1. x-sync-secret header (the cron) -- server-trusted, not spoofable.
//   2. a signed admin session (cookie or Bearer token), for a manual run from
//      the app. Identity comes from the token, never from a userId in the body:
//      a typed-in userId used to be enough, so anyone who knew an admin's
//      email could trigger this (fixed 2026-10-03).
function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.REPCARD_SYNC_SECRET;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!hasSyncSecret(req) && !requireRole(req, res, "admin")) return;
  const mode = req.body?.mode === "backfill" ? "backfill" : "incremental";
  const dryRun = req.body?.dryRun === true;
  const result = await runSync({ mode, dryRun });
  return res.status(200).json(result);
}
