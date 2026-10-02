import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { sendUserAccountUpdatedEmail } from "../../../src/lib/email";

// Emails a user their login details on demand — triggered by the admin's
// "Send Login Details" button in User Management (behind a Yes/Cancel confirm).
// Separate from creating/updating a user: this only sends the email, it writes
// nothing. Admin only. It carries no password: the app only stores a scrambled
// copy, so the email points to Forgot Password instead.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;
  if (auth.role !== "admin") {
    res.status(403).json({ error: "Only an admin can send login details" });
    return;
  }

  const { userId } = (req.body || {}) as { userId?: string };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  try {
    await connectMongo();
    const user = (await UserModel.findOne({ id: userId }).lean()) as any;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!user.email) {
      res.status(400).json({ error: "This user has no email address" });
      return;
    }

    // Resolve the same details the account email shows.
    const roles: string[] = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
    const branch = (user.territory as string) || (Array.isArray(user.branches) ? user.branches[0] : "") || null;
    let managerName: string | null = null;
    if (user.managerId) {
      const manager = (await UserModel.findOne({ id: user.managerId }, { name: 1 }).lean()) as any;
      managerName = manager?.name || null;
    }

    const sent = await sendUserAccountUpdatedEmail({
      name: user.name || user.email,
      email: user.email,
      roles,
      branch,
      salesTeamLead: managerName,
    });
    if (sent && "skipped" in sent) {
      res.status(409).json({
        error: 'The "User Account Updated" email is set to Draft in Email Config. Switch it to Published to send it.',
      });
      return;
    }

    res.status(200).json({ success: true });
    return;
  } catch (error: any) {
    console.error("❌ Error sending login details:", error?.message || error);
    res.status(500).json({ error: "Failed to send the email" });
    return;
  }
}
