import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { UserModel } from "../../../../src/lib/models/User";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();
  const rawMongoId = req.query.mongoId;
  const mongoId = typeof rawMongoId === "string" ? decodeURIComponent(rawMongoId) : null;

  if (!mongoId) {
    res.status(400).json({ error: "Invalid mongoId" });
    return;
  }

  if (req.method === "GET") {
    try {
      const user = await UserModel.findById(mongoId).lean();
      if (!user) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const { passwordHash, ...safeUser } = user;
      res.status(200).json(safeUser);
      return;
    } catch (error) {
      console.error("Error fetching user by MongoDB ID:", error);
      res.status(500).json({ error: "Failed to fetch user" });
      return;
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}
