// pages/api/users/repcard-drift.ts
//
// Which users' Branch / Team fields disagree with RepCard, for the advisory
// warning in User Management.
//
// Deliberately its OWN endpoint rather than extra fields on /api/users: that
// route is called by a lot of screens (pickers, rosters, the mobile app) and
// none of the others want this, so none of them should pay for the extra reads.
//
// Reads the RepCard mirror already in Mongo (synced hourly by the repcard-sync
// cron), so this never calls the RepCard API and adds no external latency.
//
// The rule itself lives in src/lib/repcard/appDrift.ts, pure and tested. This
// handler only gathers the two sides and hands them over.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { RepCardUserModel } from "../../../src/lib/models/RepCardUser";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { compareToRepCard, hasDrift } from "../../../src/lib/repcard/appDrift";
import { resolveTeam, TEAM_BRANCH, TEAM_LEADS } from "../../../src/lib/repcard/org-chart";
import { officeToBranch } from "../../../src/lib/repcard/branches";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  // The three roles that can open User Management.
  if (!requireRole(req, res, ["admin", "c-level", "branch-manager"])) return;

  await connectMongo();

  const users = await UserModel.find({ deleted: { $ne: true } })
    .select("id name role territory managerId email testAccount")
    .lean();

  const rcUsers = await RepCardUserModel.find({})
    .select("name email team office status")
    .lean();

  const rcByEmail = new Map<string, any>();
  for (const r of rcUsers as any[]) {
    if (r.email) rcByEmail.set(String(r.email).toLowerCase(), r);
  }

  // A rep's assigned Sales Team Lead is stored as a user id; the comparison is
  // on names, so resolve it here.
  const nameById = new Map<string, string>();
  for (const u of users as any[]) nameById.set(u.id, u.name || "");

  const drift: Record<string, { branch?: unknown; team?: unknown }> = {};
  let compared = 0;

  for (const u of users as any[]) {
    // Test/demo accounts are editable here but are not real people.
    if (u.testAccount) continue;

    const rc = u.email ? rcByEmail.get(String(u.email).toLowerCase()) : null;
    if (!rc) continue;
    compared++;

    const team = resolveTeam(rc.name, rc.team);
    const d = compareToRepCard(
      {
        role: u.role || "",
        branch: u.territory || "",
        teamLeadName: u.managerId ? nameById.get(u.managerId) || "" : "",
      },
      {
        // Same precedence the sales leaderboard uses: the team's branch when the
        // team is known, the RepCard office only as a fallback.
        branch: (team && TEAM_BRANCH[team]) || officeToBranch(rc.office) || "",
        teamLeadName: team ? TEAM_LEADS[team] || "" : "",
      }
    );

    if (hasDrift(d)) drift[u.id] = d;
  }

  return res.status(200).json({ drift, compared });
}
