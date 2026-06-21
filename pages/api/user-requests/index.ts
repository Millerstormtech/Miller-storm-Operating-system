import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserRequestModel } from "../../../src/lib/models/UserRequest";
import { sendRegistrationConfirmationEmail } from "../../../src/lib/email";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    try {
      const requests = await UserRequestModel.find({}).sort({ requestedAt: -1 }).lean();
      res.status(200).json(requests);
    } catch (error) {
      console.error("Failed to fetch user requests:", error);
      res.status(500).json({ error: "Failed to fetch user requests" });
    }
  } else if (req.method === "POST") {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password || !role) {
        res.status(400).json({ error: "All fields are required" });
        return;
      }

      if (!["manager", "sales", "marketing"].includes(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
      }

      // Check if user already exists
      const { UserModel } = await import("../../../src/lib/models/User");
      const existingUser = await UserModel.findOne({ email: email.trim().toLowerCase() });
      if (existingUser) {
        res.status(400).json({ error: "An account with this email already exists" });
        return;
      }

      // Check if there's already a pending or approved request
      const existingRequest = await UserRequestModel.findOne({ 
        email: email.trim().toLowerCase(),
        status: { $in: ["pending", "approved"] }
      });

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          res.status(400).json({ error: "A request with this email is already pending" });
        } else {
          res.status(400).json({ error: "This email has already been approved. Please login." });
        }
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const userRequest = await UserRequestModel.create({
        id: `req-${Date.now()}`,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role,
        status: "pending"
      });

      // Send confirmation email
      try {
        await sendRegistrationConfirmationEmail(name.trim(), email.trim().toLowerCase(), role);
        console.log("Confirmation email sent to:", email.trim().toLowerCase());
      } catch (emailError: any) {
        console.error("Failed to send confirmation email:", emailError.message || emailError);
      }

      res.status(201).json({ 
        message: "Registration request submitted successfully",
        requestId: userRequest.id 
      });
    } catch (error) {
      console.error("Failed to create user request:", error);
      res.status(500).json({ error: "Failed to submit registration request" });
    }
  } else if (req.method === "DELETE") {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids array required" });
        return;
      }
      await UserRequestModel.deleteMany({ id: { $in: ids } });
      res.status(200).json({ deleted: ids.length });
    } catch (error) {
      console.error("Failed to delete user requests:", error);
      res.status(500).json({ error: "Failed to delete requests" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).end();
  }
}
