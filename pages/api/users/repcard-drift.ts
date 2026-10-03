// pages/api/users/repcard-drift.ts
//
// Which users' Branch / Team fields disagree with RepCard, plus org chart
// problems to fix (org-chart.ts warnings), for the advisory notes in User Management.
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
import { buildOrgChart, repcardTeamMatcher, type OrgWarning } from "../../../src/lib/repcard/org-chart";
import { officeToBranch, BRANCH_ORDER } from "../../../src/lib/repcard/branches";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  // The three roles that can open User Management.
  if (!requireRole(req, res, ["admin", "c-level", "branch-manager"])) return;

  await connectMongo();

  // Deleted accounts too: the org chart needs them to place a rep whose Team
  // Lead was deleted. Only live accounts are compared or warned about.
  const everyone = await UserModel.find({})
    .select("id name role territory managerId email testAccount deleted")
    .lean();
  const users = (everyone as any[]).filter((u) => !u.deleted);

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

  // RepCard's team label ("Gunner", "Jon", "Lubbock Team") means nothing to the
  // app on its own: translate it to the app team it corresponds to, the same way
  // the Sales Leaderboard does for reps without an app account (org-chart.ts).
  const org = buildOrgChart((everyone as any[]).filter((u) => !u.testAccount), BRANCH_ORDER, officeToBranch);
  const byEmail = new Map<string, any>();
  for (const u of users) if (u.email && !u.testAccount) byEmail.set(String(u.email).toLowerCase(), u);
  const appTeamForRepCardTeam = repcardTeamMatcher(rcUsers as any[], (e) => org.teamOf(byEmail.get(e)), org.teams);

  const drift: Record<string, { branch?: unknown; team?: unknown }> = {};
  let compared = 0;

  for (const u of users as any[]) {
    // Test/demo accounts are editable here but are not real people.
    if (u.testAccount) continue;

    const rc = u.email ? rcByEmail.get(String(u.email).toLowerCase()) : null;
    if (!rc) continue;
    compared++;

    const team = appTeamForRepCardTeam(rc.team);
    const d = compareToRepCard(
      {
        role: u.role || "",
        branch: u.territory || "",
        teamLeadName: u.managerId ? nameById.get(u.managerId) || "" : "",
      },
      {
        // RepCard's team translated to the app team (named by its lead), and that
        // team's branch, the RepCard office only as a fallback.
        branch: org.branchOfTeam(team) || officeToBranch(rc.office) || "",
        teamLeadName: team,
      }
    );

    if (hasDrift(d)) drift[u.id] = d;
  }

  // Org chart problems an admin should fix (no branch manager for a team
  // lead's Branch, a deleted or invalid Team Lead, a rep whose Branch differs
  // from their team lead's). Advisory, like the RepCard notes.
  const warnings: Record<string, OrgWarning[]> = {};
  for (const [id, list] of org.warnings) warnings[id] = list;

  return res.status(200).json({ drift, compared, warnings });
}
