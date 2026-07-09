import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";

// Minimal people directory for the StormChat "New message" picker. Unlike the
// admin/manager-only /api/users, ANY authenticated user (including sales) can
// read this, so anyone can start a DM with anyone. Returns only the fields the
// picker needs — no phone, strengths, toggles, or other profile data.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireUser(req, res)) return;

  await connectMongo();
  try {
    const users = await UserModel.find(
      { deleted: { $ne: true } },
      { _id: 1, id: 1, name: 1, role: 1, headshotUrl: 1 }
    ).sort({ name: 1 }).lean();
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching directory:", error);
    res.status(500).json({ error: "Failed to load people" });
  }
}
