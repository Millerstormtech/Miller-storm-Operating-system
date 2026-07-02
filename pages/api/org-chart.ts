import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { requireUser, allowMethods } from "../../src/lib/auth";

// Read-only org-chart data for the in-app "Team Structure" page. Available to
// ANY authenticated user (unlike /api/users, which is admin/manager only), so
// it exposes only non-sensitive directory fields — no passwords, phone, plans,
// toggles, etc. The hierarchy is derived from each user's role + managerId.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireUser(req, res)) return;

  await connectMongo();

  const users = await UserModel.find(
    { deleted: { $ne: true } },
    { _id: 0, id: 1, name: 1, email: 1, role: 1, roles: 1, managerId: 1, headshotUrl: 1 }
  ).lean();

  res.status(200).json(users);
}
