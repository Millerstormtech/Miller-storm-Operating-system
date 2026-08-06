import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, ["admin", "c-level", "branch-manager"])) return;

  try {
    await connectMongo();
    const { users } = req.body;
    if (!Array.isArray(users)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const importedCount = [];
    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await UserModel.updateOne(
        { id: user.id },
        { 
          $set: {
            ...user,
            passwordHash: hashedPassword,
            featureToggles: user.featureToggles || {},
            publicProfile: user.publicProfile || { showHeadshot: false, showEmail: false, showPhone: false, showStrengths: false, showWeaknesses: false, showTerritory: false }
          }
        },
        { upsert: true }
      );
      importedCount.push(user.id);
    }

    // Every imported account joins its branch group chat(s) and every public
    // StormChat group, matching the admin "Add User" path. Best-effort so a
    // group-sync failure never fails the import. $addToSet makes re-adding an
    // already-present user a no-op, so re-importing an existing user is safe.
    try {
      const { addUserToPublicGroups } = await import('../../../src/lib/publicGroups');
      const { addUserToBranchGroups } = await import('../../../src/lib/branchGroup');
      const docs = await UserModel.find(
        { id: { $in: importedCount } },
        { _id: 1, branches: 1, territory: 1 }
      ).lean();
      for (const d of docs as any[]) {
        const branches = (d.branches && d.branches.length > 0) ? d.branches : [d.territory];
        await addUserToBranchGroups(String(d._id), branches);
        await addUserToPublicGroups(String(d._id));
      }
    } catch (e) {
      console.error('[import] public/branch group sync failed:', e);
    }

    res.status(200).json({ success: true, count: importedCount.length });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: "Failed to import users", details: String(error) });
  }
}
