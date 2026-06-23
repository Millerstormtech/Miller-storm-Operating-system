import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { sendUserAccountUpdatedEmail, sendAdminConfirmationEmail } from "../../../src/lib/email";
import { sendUserAccountUpdateSMS } from "../../../src/lib/telnyx";
import { validateUserPayload } from "../../../src/lib/sanitize";
import { requireUser, allowMethods } from "../../../src/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!allowMethods(req, res, ["GET", "PUT", "DELETE", "PATCH"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();
  const rawId = req.query.id;
  const id = typeof rawId === "string" ? decodeURIComponent(rawId) : null;

  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const targetId = id;
  const isSelf = auth.sub === targetId;
  const isAdmin = auth.role === "admin";
  const isManager = auth.role === "manager";

  if (req.method === "GET") {
    if (!(isSelf || isAdmin || isManager)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const user = await UserModel.findOne({ id }).lean();
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { passwordHash, ...safeUser } = user;
    
    // Set default publicProfile values for new users
    if (safeUser.publicProfile) {
      safeUser.publicProfile = {
        showHeadshot: safeUser.publicProfile.showHeadshot ?? true,
        showEmail: safeUser.publicProfile.showEmail ?? true,
        showPhone: safeUser.publicProfile.showPhone ?? true,
        showStrengths: safeUser.publicProfile.showStrengths ?? true,
        showWeaknesses: safeUser.publicProfile.showWeaknesses ?? true,
        showTerritory: safeUser.publicProfile.showTerritory ?? true
      };
    }
    
    res.status(200).json(safeUser);
    return;
  }

  if (req.method === "PUT") {
    if (!(isSelf || isAdmin)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const payload = req.body || {};

    const valid = validateUserPayload(payload);
    if (!valid.ok) {
      res.status(400).json({ error: valid.error });
      return;
    }

    const { password, passwordHash: _ph, sendNotification, sendSMSNotification, adminName, adminEmail, managerName, id: _id, createdAt: _ca, updatedAt: _ua, __v: _v, _id: _mid, ...rest } = payload;
    const plainPassword = typeof password === "string" && password.trim().length > 0 ? password.trim() : null;

    // Fetch existing user to get current passwordHash
    const existingUser = await UserModel.findOne({ id }).lean() as any;
    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const hashedPassword = plainPassword
      ? await bcrypt.hash(plainPassword, 10)
      : existingUser.passwordHash;

    const updated = await UserModel.findOneAndUpdate(
      { id },
      { $set: { ...rest, passwordHash: hashedPassword } },
      { returnDocument: 'after', new: true }
    ).lean();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const { passwordHash: updatedPasswordHash, ...safeUser } = updated;

    let emailWarning: string | null = null;

    // Send emails if admin checked the notify checkbox
    if (sendNotification && safeUser.email) {
      const loginUrl = process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/login$/, "") + "/login"
        : "https://yourdomain.com/login";
      try {
        const roles = (safeUser.roles as string[]) || [safeUser.role as string];
        const updatedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
        console.log("[Email] Sending userAccountUpdated to:", safeUser.email);
        await sendUserAccountUpdatedEmail({
          name: safeUser.name as string,
          email: safeUser.email as string,
          password: plainPassword,
          roles,
          managerName: managerName || null,
          loginUrl
        });
        console.log("[Email] userAccountUpdated sent OK");
        if (adminEmail) {
          console.log("[Email] Sending adminConfirmation to:", adminEmail);
          await sendAdminConfirmationEmail({
            adminName: adminName || "Admin",
            adminEmail,
            userName: safeUser.name as string,
            userEmail: safeUser.email as string,
            roles,
            managerName: managerName || null,
            passwordChanged: !!plainPassword,
            updatedAt
          });
          console.log("[Email] adminConfirmation sent OK");
        }
      } catch (emailErr: any) {
        emailWarning = emailErr?.message || String(emailErr);
        console.error("[Email] Failed to send update emails:", emailWarning);
      }
    } else {
      console.log("[Email] Skipped - sendNotification:", sendNotification, "email:", safeUser.email);
    }

    // Send SMS if admin checked the SMS notify checkbox
    if (sendSMSNotification && safeUser.phone) {
      try {
        console.log("[SMS] Sending userAccountUpdate SMS to:", safeUser.phone);
        await sendUserAccountUpdateSMS({
          userName: safeUser.name as string,
          adminName: adminName || "Admin",
          userPhone: safeUser.phone as string,
        });
        console.log("[SMS] userAccountUpdate SMS sent OK");
      } catch (smsErr: any) {
        console.error("[SMS] Failed to send update SMS:", smsErr?.message || smsErr);
      }
    } else {
      console.log("[SMS] Skipped - sendSMSNotification:", sendSMSNotification, "phone:", safeUser.phone);
    }

    res.status(200).json({ ...safeUser, emailWarning });
    return;
  }

  if (req.method === "DELETE") {
    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // Soft delete: mark as deleted instead of removing
    await UserModel.findOneAndUpdate(
      { id },
      { deleted: true, deletedAt: new Date() }
    );
    res.status(204).end();
    return;
  }

  if (req.method === "PATCH") {
    if (!(isSelf || isAdmin)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { action, featureToggles, fcmToken } = req.body;

    // Save fcmToken (from Flutter app)
    if (fcmToken !== undefined) {
      await UserModel.findOneAndUpdate({ id }, { fcmToken });
      console.log(`[FCM] Token updated for user ${id}`);
      res.status(200).json({ success: true });
      return;
    }

    // Save feature toggles only
    if (!action && featureToggles) {
      await UserModel.findOneAndUpdate({ id }, { featureToggles });
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'restore') {
      await UserModel.findOneAndUpdate(
        { id },
        { deleted: false, deletedAt: null }
      );
      res.status(200).json({ success: true });
      return;
    }
    if (action === 'permanent-delete') {
      const user = await UserModel.findOne({ id }).lean() as any;
      await UserModel.deleteOne({ id });
      // Also delete the approved user request for this email
      if (user?.email) {
        const { UserRequestModel } = await import("../../../src/lib/models/UserRequest");
        await UserRequestModel.deleteOne({ email: user.email, status: "approved" });
      }
      res.status(200).json({ success: true });
      return;
    }
    res.status(400).json({ error: "Invalid action" });
    return;
  }
}
