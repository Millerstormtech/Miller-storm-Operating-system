import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { allowMethods } from "../../../src/lib/auth";
import { TEAM_LEAD_ROLES } from "../../../src/lib/roleLadder";

// Public (no auth): the Sales Team Leads a self-registering rep can pick as their
// team on the register page. Returns only non-sensitive fields (id, name,
// branch). Every branch manager also leads a team, so they are included;
// test/deleted/suspended accounts are excluded.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!allowMethods(req, res, ["GET"])) return;

  await connectMongo();
  const leads = await UserModel.find(
    {
      deleted: { $ne: true },
      suspended: { $ne: true },
      testAccount: { $ne: true },
      // Everyone who leads a team: team leads and branch managers (roleLadder.ts).
      role: { $in: [...TEAM_LEAD_ROLES] },
    },
    { _id: 0, id: 1, name: 1, territory: 1 }
  ).lean();

  res.status(200).json(leads);
}
