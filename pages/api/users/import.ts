import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    res.status(200).json({ success: true, count: importedCount.length });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: "Failed to import users", details: String(error) });
  }
}
