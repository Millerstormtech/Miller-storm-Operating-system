import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { sendQuickStartUserEmail, sendQuickStartManagerEmail } from "../../../src/lib/email";
import { sendUserAccountUpdateSMS } from "../../../src/lib/telnyx";
import { exactCaseInsensitive, asString, validateUserPayload } from "../../../src/lib/sanitize";
import { requireRole, allowMethods } from "../../../src/lib/auth";
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (!allowMethods(req, res, ["GET", "POST"])) return;

  await connectMongo();

  if (req.method === "GET") {
    if (!requireRole(req, res, ["admin", "manager"])) return;
    const { role, managerId, deleted } = req.query;
    const query: any = {};
    if (role) query.role = role;
    if (managerId) query.managerId = managerId;
    if (deleted === "true") {
      query.deleted = true;
    } else if (deleted === "false" || deleted === undefined) {
      query.deleted = { $ne: true };
    }
    // lite=1 → return only the light fields a picker/list needs (id, name,
    // email, role, team, photo, status). Full user docs carry heavy fields
    // (featureToggles, business plans, notes, embedded data), which made
    // team-picker screens on mobile slow. Opt-in, so other callers are unchanged.
    const lite = req.query.lite === "1" || req.query.lite === "true";
    const usersQuery = UserModel.find(query);
    if (lite) usersQuery.select("id name email role managerId headshotUrl deleted suspended");
    const users = await usersQuery.lean();
    const sanitized = users.map(({ passwordHash, ...rest }) => rest);
    res.status(200).json(sanitized);
    return;
  }

  if (req.method === "POST") {
    if (!requireRole(req, res, "admin")) return;
    const payload = req.body || {};

    const valid = validateUserPayload(payload);
    if (!valid.ok) {
      res.status(400).json({ error: valid.error });
      return;
    }

    const { password, passwordHash, _id, sendNotification, sendSMSNotification, adminName, adminEmail, managerName, ...rest } = payload;
    const id = rest.email ? rest.email.trim().toLowerCase() : (payload.id || `user-${Date.now()}`);
    const hashedPassword =
      typeof password === "string" && password.trim().length > 0
        ? await bcrypt.hash(password.trim(), 10)
        : passwordHash;

    // Check if a deleted user with same email exists — restore + update instead of creating new
    if (rest.email) {
      const existingDeleted = await UserModel.findOne({ email: exactCaseInsensitive(asString(rest.email)), deleted: true });
      if (existingDeleted) {
        const restored = await UserModel.findOneAndUpdate(
          { id: existingDeleted.id },
          { ...rest, id: existingDeleted.id, passwordHash: hashedPassword, deleted: false, deletedAt: null },
          { returnDocument: "after" }
        ).lean();
        const { passwordHash: _rph, ...safeRestored } = restored;
        res.status(201).json(safeRestored);
        return;
      }
    }

    try {
      const created = await UserModel.create({ ...rest, id, passwordHash: hashedPassword });
      const createdObj = created.toObject();
    } catch (dupErr: any) {
      if (dupErr.code === 11000) {
        // Already exists — just return it
        const existing = await UserModel.findOne({ id }).lean();
        const { passwordHash: _eph, ...safeExisting } = existing as any;
        res.status(201).json(safeExisting);
        return;
      }
      throw dupErr;
    }
    const createdObj = (await UserModel.findOne({ id }).lean()) as any;
    const { passwordHash: _ph, ...safeUser } = createdObj;

    // Send notification email if requested
    if (sendNotification && safeUser.email) {
      try {
        const { sendUserAccountUpdatedEmail, sendAdminConfirmationEmail } = await import("../../../src/lib/email");
        const roles = (safeUser.roles as string[]) || [safeUser.role as string];
        await sendUserAccountUpdatedEmail({
          name: safeUser.name as string,
          email: safeUser.email as string,
          password: typeof password === "string" && password.trim().length > 0 ? password.trim() : null,
          roles,
          managerName: managerName || null,
          loginUrl: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/login` : "https://yourdomain.com/login"
        });
        if (adminEmail) {
          await sendAdminConfirmationEmail({
            adminName: adminName || "Admin",
            adminEmail,
            userName: safeUser.name as string,
            userEmail: safeUser.email as string,
            roles,
            managerName: managerName || null,
            passwordChanged: typeof password === "string" && password.trim().length > 0,
            updatedAt: new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
          });
        }
        console.log("Notification email sent to:", safeUser.email);
      } catch (emailErr) {
        console.error("Failed to send notification email:", emailErr);
      }
    }

    // Send SMS notification if requested
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
        console.error("[SMS] Failed to send SMS:", smsErr?.message || smsErr);
      }
    }

    // Send 48-hour Quick Start onboarding email for new sales users
    if (rest.role === "sales" && rest.email) {
      try {
        const newHireName = rest.name || rest.email;
        await sendQuickStartUserEmail(newHireName, rest.email);

        if (rest.managerId) {
          const manager = await UserModel.findOne({ id: rest.managerId }).lean();
          if (manager?.email) {
            await sendQuickStartManagerEmail(newHireName, manager.name || manager.email, manager.email);
          }
        }
      } catch (emailErr) {
        console.error("Failed to send onboarding email:", emailErr);
      }
    }

    res.status(201).json(safeUser);
    return;
  }
}

export default handler;
