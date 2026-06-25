import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TicketModel } from "../../../src/lib/models/Ticket";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { UserModel } from "../../../src/lib/models/User";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { sendTicketStatusEmail } from "../../../src/lib/email";
import { sendPushNotification } from "../../../src/lib/firebase-admin";

const STATUS_MSG: Record<string, { title: string; message: string }> = {
  approved: { title: "Ticket Approved ✅", message: "Your ticket has been approved by our team." },
  in_progress: { title: "Ticket In Progress 🔧", message: "Your ticket is now in progress." },
  completed: { title: "Ticket Completed 🎉", message: "Your ticket has been completed successfully — please check further." },
  rejected: { title: "Ticket Update", message: "Your ticket could not be approved at this time." },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (!allowMethods(req, res, ["PATCH"])) return;
  // Only admins can change ticket status.
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  const { id } = req.query;
  const { status, adminNote } = req.body || {};
  const allowed = ["open", "approved", "in_progress", "completed", "rejected"];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const ticket = await TicketModel.findOne({ id });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  ticket.status = status;
  if (adminNote !== undefined) ticket.adminNote = adminNote;
  await ticket.save();

  const TYPE_LABEL: Record<string, string> = {
    bug: "Bug / Issue Fix",
    feature: "Request New Feature",
    other: "Other",
  };

  // Email + in-app notification + push to the user who raised it.
  const msg = STATUS_MSG[status];
  if (msg) {
    try {
      await sendTicketStatusEmail({
        status,
        name: ticket.name,
        email: ticket.email,
        type: TYPE_LABEL[ticket.type] || ticket.type,
        adminNote: ticket.adminNote,
      });
    } catch (e: any) {
      console.error("[ticket] status email failed:", e?.message || e);
    }

    try {
      await NotificationModel.create({
        id: `notif-${Date.now()}-${ticket.userId}`,
        userId: ticket.userId,
        type: "ticket_update",
        title: msg.title,
        message: msg.message,
        metadata: { ticketId: ticket.id, status },
      });
    } catch (e: any) {
      console.error("[ticket] user notification failed:", e?.message || e);
    }

    try {
      const user = await UserModel.findOne({ id: ticket.userId }, { fcmToken: 1 }).lean() as any;
      if (user?.fcmToken) {
        await sendPushNotification(user.fcmToken, msg.title, msg.message, {
          type: "ticket_update",
          ticketId: ticket.id,
          status,
        });
      }
    } catch (e: any) {
      console.error("[ticket] user push failed:", e?.message || e);
    }
  }

  res.status(200).json(ticket);
}
