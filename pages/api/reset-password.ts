import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { PasswordResetModel } from "../../src/lib/models/PasswordReset";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    // Verify token validity
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        res.status(400).json({ error: "Invalid token" });
        return;
      }

      const resetRequest = await PasswordResetModel.findOne({ 
        token,
        used: false,
        expiresAt: { $gt: new Date() }
      }).lean();

      if (!resetRequest) {
        res.status(400).json({ error: "Invalid or expired token" });
        return;
      }

      // Return user info (without sensitive data)
      const user = await UserModel.findOne({ id: resetRequest.userId }).lean();
      
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({ 
        valid: true,
        email: user.email,
        name: user.name
      });

    } catch (error) {
      console.error("Token verification error:", error);
      res.status(500).json({ error: "An error occurred" });
    }
  } else if (req.method === "POST") {
    // Reset password
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({ error: "Token and password are required" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Find valid reset request
      const resetRequest = await PasswordResetModel.findOne({ 
        token,
        used: false,
        expiresAt: { $gt: new Date() }
      });

      if (!resetRequest) {
        res.status(400).json({ error: "Invalid or expired token" });
        return;
      }

      // Find user
      const user = await UserModel.findOne({ id: resetRequest.userId });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, 10);

      // Update user password
      user.passwordHash = passwordHash;
      await user.save();

      // Mark reset token as used
      resetRequest.used = true;
      resetRequest.usedAt = new Date();
      await resetRequest.save();

      res.status(200).json({ 
        message: "Password reset successfully. You can now login with your new password." 
      });

    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ error: "An error occurred. Please try again." });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end();
  }
}
