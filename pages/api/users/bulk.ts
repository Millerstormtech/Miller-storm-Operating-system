import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { sendQuickStartUserEmail, sendQuickStartManagerEmail } from "../../../src/lib/email";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await connectMongo();

    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      res.status(405).end();
      return;
    }

    const users = Array.isArray(req.body) ? req.body : req.body?.users;
    if (!Array.isArray(users)) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const ids = users
      .map((user) => (user.id && user.id.length ? user.id : user.email))
      .filter(Boolean);

    const existing = await UserModel.find({ id: { $in: ids } })
      .select("id passwordHash")
      .lean();
    const passwordById = new Map(existing.map((u) => [u.id, u.passwordHash]));
    const existingIds  = new Set(existing.map((u) => u.id));

    // Only remove active (non-deleted) users that are no longer in the list
    await UserModel.deleteMany({
      id: { $nin: ids.length ? ids : ["__none__"] },
      deleted: { $ne: true },
    });

    // Upsert each user individually so one bad record doesn't kill the whole batch
    for (const user of users) {
      try {
        const nextId =
          typeof user.email === "string" && user.email.trim().length > 0
            ? user.email.trim()
            : user.id;

        const incomingPassword =
          typeof user.password === "string" && user.password.trim().length > 0
            ? user.password.trim()
            : "";

        const existingPassword = nextId ? passwordById.get(nextId) : undefined;
        const passwordHash =
          incomingPassword.length > 0
            ? await bcrypt.hash(incomingPassword, 10)
            : typeof user.passwordHash === "string" && user.passwordHash.length > 0
            ? user.passwordHash
            : existingPassword;

        if (!passwordHash) {
          console.warn(`[bulk] Skipping user with no password: ${nextId}`);
          continue;
        }

        const { password, ...rest } = user;
        await UserModel.updateOne(
          { id: nextId },
          { ...rest, id: nextId, passwordHash },
          { upsert: true }
        );
      } catch (userErr) {
        console.error(`[bulk] Failed to upsert user ${user.email || user.id}:`, userErr);
        // continue with next user
      }
    }

    // Send Quick Start onboarding email to newly created sales users
    try {
      const newSalesUsers = users.filter((u) => {
        if (u.role !== "sales") return false;
        if (!u.email || !u.email.trim()) return false;
        return !existingIds.has(u.email.trim()) && !existingIds.has(u.id);
      });

      console.log(`[bulk] New sales users to email: ${newSalesUsers.length}`);

      for (const newUser of newSalesUsers) {
        try {
          const name = newUser.name || newUser.email;
          await sendQuickStartUserEmail(name, newUser.email.trim());
          console.log(`[bulk] Quick Start email sent to: ${newUser.email}`);

          if (newUser.managerId) {
            const manager = await UserModel.findOne({
              $or: [{ id: newUser.managerId }, { email: newUser.managerId }],
            }).lean();
            if (manager?.email) {
              await sendQuickStartManagerEmail(name, manager.name || manager.email, manager.email);
              console.log(`[bulk] Quick Start email sent to manager: ${manager.email}`);
            } else {
              console.log(`[bulk] Manager not found for managerId: ${newUser.managerId}`);
            }
          }
        } catch (emailErr) {
          console.error(`[bulk] Email failed for ${newUser.email}:`, emailErr);
        }
      }
    } catch (emailSectionErr) {
      console.error("[bulk] Email section error:", emailSectionErr);
      // Never let email errors cause a 500
    }

    const nextUsers = await UserModel.find({ deleted: { $ne: true } }).lean();
    const sanitized = nextUsers.map(({ passwordHash, ...rest }) => rest);
    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Bulk user update error:", error);
    res.status(500).json({
      error: "Failed to update users",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
