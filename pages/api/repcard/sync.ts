// pages/api/repcard/sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { runSync } from "../../../src/lib/repcard/sync";

// Authorization mirrors pages/api/acculynx/sync.ts. Two paths:
//   1. x-sync-secret header (used by the cron) -- server-trusted, not spoofable.
//   2. body userId resolved to an admin (used by the in-app "Refresh now" button).
//
// SECURITY LIMITATION (known, platform-wide): path 2 trusts a client-supplied userId
// and is therefore spoofable. This is NOT unique to this endpoint -- the entire app
// authorizes from the client (localStorage; no server sessions/JWT). See
// docs/STATE-OF-THE-PLATFORM.md s7: server-side identity is the platform's #1 security
// debt and must be fixed for ALL routes together, not one-off here. Worst case of abuse
// here is triggering an idempotent RepCard pull (read-only vs RepCard; only counts are
// returned to the caller).
async function authorize(req: NextApiRequest): Promise<boolean> {
  const secret = req.headers["x-sync-secret"];
  if (secret && secret === process.env.REPCARD_SYNC_SECRET) return true;
  const userId = (req.body?.userId as string) || "";
  if (!userId) return false;
  await connectMongo();
  const user = await UserModel.findOne({ id: userId, deleted: { $ne: true } }).lean();
  const role = (user as any)?.role;
  const roles = (user as any)?.roles ?? [];
  return role === "admin" || roles.includes("admin");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!(await authorize(req))) return res.status(401).json({ error: "unauthorized" });
  const mode = req.body?.mode === "backfill" ? "backfill" : "incremental";
  const dryRun = req.body?.dryRun === true;
  const result = await runSync({ mode, dryRun });
  return res.status(200).json(result);
}
