import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { BotChatModel } from "../../../src/lib/models/BotChat";
import { UserModel } from "../../../src/lib/models/User";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const auth = requireRole(req, res, "admin");
  if (!auth) return;

  await connectMongo();

  const { botId, userId } = req.query;
  if (!botId) return res.status(400).json({ error: "botId required" });

  const query: any = { botId };
  if (userId) query.userId = userId;

  const chats = await BotChatModel.find(query).sort({ updatedAt: -1 }).lean();

  // The name/role stored on a chat is a snapshot from chat time (and name/email
  // are client-supplied). Resolve the real user by id so the User + Role columns
  // always reflect the current, correct account — falling back to the stored
  // values for chats with no matching user (e.g. the admin's in-builder tests).
  const userIds = [...new Set((chats as any[]).map((c) => c.userId).filter(Boolean))];
  const users = await UserModel.find(
    { id: { $in: userIds } },
    { id: 1, name: 1, email: 1, role: 1, roles: 1 }
  ).lean();
  const byId = new Map((users as any[]).map((u) => [u.id, u]));

  const enriched = (chats as any[]).map((c) => {
    const u = byId.get(c.userId);
    if (!u) return c;
    return {
      ...c,
      userName: u.name || c.userName,
      userEmail: u.email || c.userEmail,
      userRole: u.role || (Array.isArray(u.roles) ? u.roles[0] : "") || c.userRole,
    };
  });

  return res.status(200).json(enriched);
}
