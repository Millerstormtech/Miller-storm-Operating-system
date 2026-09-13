import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { NotificationModel } from "../../src/lib/models/Notification";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { sendPushNotificationToMultiple } from "../../src/lib/firebase-admin";
import { resolveAudience, isResolveError, type TeamLeadCandidate } from "../../src/lib/announcements/audience";

// Company-wide (or scoped) announcements.
//
// Modelled on notify-update.ts, but can target everyone, one or more branches,
// or one or more teams (a sales-team-lead + their reports) instead of just
// sales roles. One Notification row is written per recipient, which gives
// per-person read/dismiss for free (no new tracking collection), and a phone
// push goes out reusing the existing FCM helper.
//
//   GET  ?options=1                  → audience picker options for THIS caller's role
//   GET  ?audienceType=...&branches=...&teamLeadIds=...  → the audience size, for the composer's confirm step
//   GET  ?history=1                  → every announcement ever sent, newest first
//   POST                             → send the announcement; returns the recipient + push counts
//
// AUDIENCE RULES — the actual scoping logic lives in
// src/lib/announcements/audience.ts (pure, unit-tested), so the size preview
// (GET) and the real send (POST) can never disagree about who a pick reaches:
//   admin / c-level        → everyone, any branch(es), or any team(s)
//   branch-manager         → their own branch(es) only, or team(s) within their own branch(es)
//   sales-team-lead        → their own team only (no choice — always forced server-side)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  // History is readable by ANY signed-in user (announcements are company-wide
  // or scoped, but everyone should see what's already gone out); composing —
  // and the audience picker/count for the composer — stays with leadership.
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  // GET ?history=1 → every announcement ever sent, newest first. There is no
  // separate Announcements collection: each send wrote one Notification row per
  // recipient sharing the same `notif-<stamp>-<i>` id stamp, so collapse the
  // rows back to one entry per stamp (per-user rows may have been dismissed and
  // deleted, but an announcement survives as long as ANY recipient's row does).
  if (req.method === "GET" && req.query.history) {
    const history = await NotificationModel.aggregate([
      { $match: { type: "announcement" } },
      { $addFields: { stamp: { $arrayElemAt: [{ $split: ["$id", "-"] }, 1] } } },
      {
        $group: {
          _id: "$stamp",
          title: { $first: "$title" },
          message: { $first: "$message" },
          link: { $first: "$metadata.link" },
          postedByName: { $first: "$metadata.postedByName" },
          audienceLabel: { $first: "$metadata.audienceLabel" },
          createdAt: { $first: "$createdAt" },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
    ]);
    return res.status(200).json(history.map((h: any) => ({
      title: h.title,
      message: h.message,
      link: h.link || "",
      postedByName: h.postedByName || "",
      audienceLabel: h.audienceLabel || "Everyone",
      createdAt: h.createdAt,
    })));
  }

  // Composer roles: leadership only. Everyone else (sales, marketing) only
  // reads the history above.
  const composerRoles = ["admin", "c-level", "branch-manager", "sales-team-lead"];
  if (!composerRoles.includes(auth.role || "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

  // The caller's own record — needed to resolve "their branch(es)" / "their
  // team" for the two scoped roles. Never trust a body/query-supplied branch
  // or team list for those roles; always re-derive from THIS record.
  const caller = (await UserModel.findOne(
    { id: auth.sub },
    { id: 1, name: 1, role: 1, territory: 1, branches: 1 }
  ).lean()) as any;
  // Raw (original-case) values — these are what get used in the actual Mongo
  // $in query and shown in labels, since territory/branches store real case.
  const callerBranchesRaw = Array.from(
    new Set([caller?.territory, ...(caller?.branches || [])].filter(Boolean).map((s) => String(s).trim()))
  );
  // Normalized (lowercased) — used only for matching against OTHER users'
  // branch values, which may differ in case.
  const callerBranchesNorm = callerBranchesRaw.map(norm);

  // Every distinct branch name in use, from EITHER field — matches the same
  // fuzzy "territory OR branches" convention branchGroup.ts already uses for
  // StormChat branch groups, so "which branches exist" agrees everywhere.
  async function allBranches(): Promise<string[]> {
    const [territories, branchLists] = await Promise.all([
      UserModel.distinct("territory", { deleted: { $ne: true } }),
      UserModel.distinct("branches", { deleted: { $ne: true } }),
    ]);
    const set = new Set<string>();
    for (const t of territories) if (t) set.add(String(t).trim());
    for (const b of branchLists) if (b) set.add(String(b).trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  // Every sales-team-lead, each carrying the branch(es) their OWN record
  // carries — used both to list "teams" and to check whether a given team
  // lead falls inside a branch-manager's branch(es).
  async function allTeamLeads(): Promise<TeamLeadCandidate[]> {
    const leads = (await UserModel.find(
      { role: "sales-team-lead", deleted: { $ne: true } },
      { id: 1, name: 1, territory: 1, branches: 1 }
    ).lean()) as any[];
    return leads.map((l) => ({
      id: l.id,
      name: l.name || l.id,
      branches: Array.from(new Set([l.territory, ...(l.branches || [])].filter(Boolean).map(norm))),
    }));
  }

  // GET ?options=1 → what this caller is allowed to pick, for the "Who will
  // see this" dropdown and its branch/team sub-picker.
  if (req.method === "GET" && req.query.options) {
    if (auth.role === "sales-team-lead") {
      return res.status(200).json({
        types: ["team"],
        branches: [],
        teams: [{ id: auth.sub, name: caller?.name || "My Team" }],
      });
    }
    if (auth.role === "branch-manager") {
      const leads = await allTeamLeads();
      const teamsInBranch = leads.filter((l) => l.branches.some((b) => callerBranchesNorm.includes(b)));
      return res.status(200).json({
        types: ["branch", "team"],
        branches: callerBranchesRaw,
        teams: teamsInBranch.map((l) => ({ id: l.id, name: l.name })),
      });
    }
    // admin / c-level
    const [branches, leads] = await Promise.all([allBranches(), allTeamLeads()]);
    return res.status(200).json({
      types: ["everyone", "branch", "team"],
      branches,
      teams: leads.map((l) => ({ id: l.id, name: l.name })),
    });
  }

  async function resolve(raw: any) {
    const allTeamLeadsList = await allTeamLeads();
    const allBranchesList = auth!.role === "admin" || auth!.role === "c-level" ? await allBranches() : [];
    return resolveAudience(
      {
        role: auth!.role || "",
        callerId: auth!.sub,
        callerName: caller?.name || "",
        callerBranchesRaw,
        callerBranchesNorm,
        allBranchesRaw: allBranchesList,
        allTeamLeads: allTeamLeadsList,
      },
      raw
    );
  }

  if (req.method === "GET") {
    const audienceRaw = {
      type: req.query.audienceType,
      branches: typeof req.query.branches === "string" ? req.query.branches.split(",").filter(Boolean) : [],
      teamLeadIds: typeof req.query.teamLeadIds === "string" ? req.query.teamLeadIds.split(",").filter(Boolean) : [],
    };
    const resolved = await resolve(audienceRaw);
    if (isResolveError(resolved)) return res.status(200).json({ recipients: 0, error: resolved.error });
    const recipients = await UserModel.countDocuments(resolved.filter);
    return res.status(200).json({ recipients, audienceLabel: resolved.label });
  }

  // POST — send the announcement.
  const title = (req.body?.title as string)?.trim();
  const message = (req.body?.message as string)?.trim();
  const link = (req.body?.link as string)?.trim() || "";
  // Never blast an empty message to the whole company.
  if (!title || !message) {
    return res.status(400).json({ error: "Title and message are required." });
  }

  const resolved = await resolve(req.body?.audience);
  if (isResolveError(resolved)) return res.status(400).json({ error: resolved.error });

  // The author comes from the session, never the request body.
  const author = (await UserModel.findOne({ id: auth.sub }, { id: 1, name: 1 }).lean()) as any;

  const recipients = (await UserModel.find(resolved.filter, { id: 1, fcmToken: 1 }).lean()) as any[];

  // Phone push to every device we have a token for.
  const pushTokens = recipients.map((u) => u.fcmToken).filter(Boolean);
  let pushResult = { successCount: 0, failureCount: 0 };
  if (pushTokens.length) {
    pushResult = await sendPushNotificationToMultiple(pushTokens, title, message, {
      type: "announcement",
      link,
    });
  }

  // One in-app notification per user → per-person dismissal + bell entry.
  const stamp = Date.now();
  const docs = recipients.map((u, i) => ({
    id: `notif-${stamp}-${i}`,
    userId: u.id,
    type: "announcement",
    title,
    message,
    read: false,
    metadata: { link, postedBy: author?.id || auth.sub, postedByName: author?.name || "", audienceLabel: resolved.label },
  }));
  if (docs.length) {
    await NotificationModel.insertMany(docs, { ordered: false });
  }

  res.status(200).json({
    success: true,
    recipients: recipients.length,
    pushTokens: pushTokens.length,
    pushSuccess: pushResult.successCount,
    pushFailed: pushResult.failureCount,
    audienceLabel: resolved.label,
  });
}
