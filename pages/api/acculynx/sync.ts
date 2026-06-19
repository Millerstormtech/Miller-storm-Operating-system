// pages/api/acculynx/sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { runSync } from "../../../src/lib/acculynx/sync";

// Locked: either the cron's shared secret OR an admin user id (matches the
// platform's existing localStorage auth model -- better than the open webhook).
async function authorize(req: NextApiRequest): Promise<boolean> {
  const secret = req.headers["x-sync-secret"];
  if (secret && secret === process.env.ACCULYNX_SYNC_SECRET) return true;

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
