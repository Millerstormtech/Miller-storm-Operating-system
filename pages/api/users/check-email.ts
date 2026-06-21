import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { UserRequestModel } from "../../../src/lib/models/UserRequest";
import { exactCaseInsensitive } from "../../../src/lib/sanitize";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end();
    return;
  }

  await connectMongo();

  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists in users
    const existingUser = await UserModel.findOne({ email: exactCaseInsensitive(normalizedEmail) });

    // Check if email exists in pending requests only (not approved/rejected)
    const existingRequest = await UserRequestModel.findOne({
      email: exactCaseInsensitive(normalizedEmail),
      status: "pending"
    });

    res.status(200).json({ 
      exists: !!(existingUser || existingRequest),
      inUsers: !!existingUser,
      inRequests: !!existingRequest
    });
  } catch (error) {
    console.error("Failed to check email:", error);
    res.status(500).json({ error: "Failed to check email" });
  }
}
