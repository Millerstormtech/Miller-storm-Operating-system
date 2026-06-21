import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { PasswordResetModel } from "../../src/lib/models/PasswordReset";
import { sendPasswordResetEmail } from "../../src/lib/email";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  await connectMongo();

  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await UserModel.findOne({ email: normalizedEmail }).lean();

    // For security, always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      res.status(200).json({ 
        message: "If an account exists with this email, you will receive a password reset link shortly." 
      });
      return;
    }

    // Only allow password reset for non-admin users
    if (user.role === "admin") {
      res.status(200).json({ 
        message: "If an account exists with this email, you will receive a password reset link shortly." 
      });
      return;
    }

    // Check if user is suspended
    if (user.suspended) {
      res.status(200).json({ 
        message: "If an account exists with this email, you will receive a password reset link shortly." 
      });
      return;
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Save reset token to database
    await PasswordResetModel.create({
      id: `reset-${Date.now()}`,
      userId: user.id,
      email: normalizedEmail,
      token,
      expiresAt
    });

    // Generate reset link
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    // Send email
    try {
      await sendPasswordResetEmail(user.name, resetLink, user.email);
      console.log(`Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      res.status(200).json({ 
        message: "If an account exists with this email, you will receive a password reset link shortly." 
      });
      return;
    }

    res.status(200).json({ 
      message: "If an account exists with this email, you will receive a password reset link shortly." 
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "An error occurred. Please try again later." });
  }
}
