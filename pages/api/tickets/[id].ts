import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TicketModel } from "../../../src/lib/models/Ticket";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { sendTicketStatusEmail } from "../../../src/lib/email";
import { sendPushNotification } from "../../../src/lib/firebase-admin";
import { ownedTicketTypes } from "../../../src/lib/support/categories";

const STATUS_MSG: Record<string, { title: string; message: string }> = {
  approved: { title: "Ticket Approved ✅", message: "Your ticket has been approved by our team." },
  in_progress: { title: "Ticket In Progress 🔧", message: "Your ticket is now in progress." },
  completed: { title: "Ticket Completed 🎉", message: "Your ticket has been completed successfully — please check further." },
  rejected: { title: "Ticket Update", message: "Your ticket could not be approved at this time." },
};

const TYPE_LABEL: Record<string, string> = {
  bug: "Bug / Issue Fix",
  feature: "Request New Feature",
  other: "Other",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (!allowMethods(req, res, ["GET", "POST", "PATCH"])) return;

  // Everyone signed in reaches this route; each method enforces its own access
  // (read/reply = the ticket's raiser or an admin; status change = admin only).
  const auth = requireUser(req, res);
  if (!auth) return;
  const isAdmin = auth.role === "admin";

  await connectMongo();

  const { id } = req.query;

  // A type "owner" (their account email is in a category's emails list) is staff
  // for that type's tickets — they can read, reply, and change status just like
  // an admin, but only for tickets whose type they own. Resolve their owned types
  // once so every method below can authorize against the ticket's own type.
  const me = await UserModel.findOne({ id: auth.sub }, { email: 1 }).lean() as any;
  const ownedTypes = ownedTicketTypes(me?.email);
  const ownsType = (t: string) => ownedTypes.includes(t);

  // ---- GET: read one ticket (with its conversation) --------------------------
  // The raiser follows their own ticket; admins and the type's owner can open any
  // of theirs. Lets both sides poll for new replies and see the current status.
  if (req.method === "GET") {
    const ticket = await TicketModel.findOne({ id }).lean() as any;
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (!isAdmin && ticket.userId !== auth.sub && !ownsType(ticket.type)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.status(200).json(ticket);
    return;
  }

  // ---- POST: add a message to the conversation -------------------------------
  // Either side of the ticket can reply. The other side is notified (in-app bell
  // + push), so the raiser and the handler can talk back and forth in the app.
  if (req.method === "POST") {
    const text = (req.body?.text ?? "").toString().trim();
    const mediaUrl = (req.body?.mediaUrl ?? "").toString().trim();
    const mediaType = (req.body?.mediaType ?? "").toString().trim(); // 'image' | 'video'
    // A message needs either text or a photo/video attachment.
    if (!text && !mediaUrl) { res.status(400).json({ error: "text or media is required" }); return; }

    const ticket = await TicketModel.findOne({ id });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    // Staff for this ticket = an admin, or the owner of this ticket's type.
    const isStaff = isAdmin || ownsType(ticket.type);
    if (!isStaff && ticket.userId !== auth.sub) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Turn-based conversation: you can only send when the OTHER side spoke last.
    // The original request counts as the raiser's turn, so support asks first.
    // After you send it's their turn — enforced here so the rule is authoritative,
    // not just hidden in the UI.
    const existing = ticket.messages || [];
    const lastFromStaff = existing.length ? !!existing[existing.length - 1].fromStaff : false;
    const myTurn = isStaff ? !lastFromStaff : lastFromStaff;
    if (!myTurn) {
      res.status(409).json({ error: "It's the other participant's turn to reply." });
      return;
    }

    // Name the sender: the raiser's own name for their side, else the admin's
    // name (falling back to "Support Team").
    let senderName = ticket.name;
    if (auth.sub !== ticket.userId) {
      const sender = await UserModel.findOne({ id: auth.sub }, { name: 1 }).lean() as any;
      senderName = sender?.name || "Support Team";
    }

    ticket.messages = ticket.messages || [];
    ticket.messages.push({
      senderId: auth.sub,
      senderName,
      senderRole: auth.role || "",
      fromStaff: isStaff,
      text,
      mediaUrl,
      mediaType,
      createdAt: new Date(),
    } as any);
    await ticket.save();

    // A short preview for notifications (photo/video when there's no caption).
    const preview = text || (mediaType === "video" ? "🎬 Video" : mediaUrl ? "📷 Photo" : "");

    // Notify the OTHER side about the new reply.
    try {
      if (isStaff) {
        // Staff (admin or the type's owner) replied → notify the raiser (bell + push).
        await NotificationModel.create({
          id: `notif-${Date.now()}-${ticket.userId}`,
          userId: ticket.userId,
          type: "ticket_reply",
          title: "💬 New reply on your ticket",
          message: `${senderName}: ${preview.slice(0, 80)}`,
          metadata: { ticketId: ticket.id },
        });
        const user = await UserModel.findOne({ id: ticket.userId }, { fcmToken: 1 }).lean() as any;
        if (user?.fcmToken) {
          await sendPushNotification(user.fcmToken, "💬 New reply on your ticket", `${senderName}: ${preview.slice(0, 100)}`, {
            type: "ticket_reply",
            ticketId: ticket.id,
          });
        }
      } else {
        // Raiser replied → notify every admin (bell + push) so a handler sees it.
        const admins = await UserModel.find(
          { role: "admin", deleted: { $ne: true } },
          { id: 1, fcmToken: 1 }
        ).lean() as any[];
        await Promise.all(admins.map(async (admin) => {
          await NotificationModel.create({
            id: `notif-${Date.now()}-${admin.id}`,
            userId: admin.id,
            type: "ticket_reply",
            title: "💬 New reply on a ticket",
            message: `${senderName}: ${preview.slice(0, 80)}`,
            metadata: { ticketId: ticket.id },
          });
          if (admin.fcmToken) {
            await sendPushNotification(admin.fcmToken, "💬 New reply on a ticket", `${senderName}: ${preview.slice(0, 100)}`, {
              type: "ticket_reply",
              ticketId: ticket.id,
            }).catch(() => {});
          }
        }));
      }
    } catch (e: any) {
      console.error("[ticket] reply notify failed:", e?.message || e);
    }

    res.status(200).json(ticket.toObject());
    return;
  }

  // ---- PATCH: change status (admin, or the type's owner) ---------------------
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
  // Only staff for this ticket may change its status — an admin, or the owner of
  // this ticket's type. Checked after load so we can authorize against the type.
  if (!isAdmin && !ownsType(ticket.type)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  ticket.status = status;
  if (adminNote !== undefined) ticket.adminNote = adminNote;
  await ticket.save();

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

  res.status(200).json(ticket.toObject());
}
