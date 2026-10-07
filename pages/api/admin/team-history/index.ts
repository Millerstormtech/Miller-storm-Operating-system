// GET /api/admin/team-history: warnings, recent moves, rep search, team list. Admins only.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { requireRole, allowMethods } from "../../../../src/lib/auth";
import { RepTeamHistoryModel } from "../../../../src/lib/models/RepTeamHistory";
import { TeamWarningModel } from "../../../../src/lib/models/TeamWarning";
import { loadSharedRosterData } from "../../../../src/lib/leaderboard/compute";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireRole(req, res, ["admin"])) return;
  await connectMongo();

  const [docs, warnings, shared] = await Promise.all([
    RepTeamHistoryModel.find({}).select("repcardUserId repName periods").lean(),
    // "__seeded__" is the hourly step's internal first-run marker, not a warning.
    TeamWarningModel.find({ active: true, key: { $ne: "__seeded__" } }).sort({ createdAt: -1 }).lean(),
    loadSharedRosterData(),
  ]);

  const moves: any[] = [];
  const teamBranch = new Map<string, string>();
  for (const t of shared.org.teams) teamBranch.set(t, shared.org.branchOfTeam(t));
  for (const d of docs as any[]) {
    const p = d.periods || [];
    for (let i = 0; i < p.length; i++) {
      if (p[i].team && !teamBranch.has(p[i].team)) teamBranch.set(p[i].team, p[i].branch || "");
      if (i === 0 || (p[i].team === p[i - 1].team && p[i].branch === p[i - 1].branch)) continue;
      moves.push({ repcardUserId: d.repcardUserId, repName: d.repName, fromTeam: p[i - 1].team, toTeam: p[i].team, on: p[i].from, source: p[i].source });
    }
  }
  moves.sort((a, b) => b.on.localeCompare(a.on) || String(a.repName || "").localeCompare(String(b.repName || "")));

  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const matches = q
    ? (docs as any[]).filter((d) => String(d.repName || "").toLowerCase().includes(q)).slice(0, 20)
        .map((d) => ({ repcardUserId: d.repcardUserId, repName: d.repName }))
    : [];

  return res.status(200).json({
    warnings: (warnings as any[]).map((w) => ({ key: w.key, text: w.text, emailedAt: w.emailedAt })),
    moves: moves.slice(0, 100),
    matches,
    // Current teams first (org chart order), then departed teams seen in history.
    teams: [...teamBranch.entries()].map(([name, branch]) => ({ name, branch })),
  });
}
