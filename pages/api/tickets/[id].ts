import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TicketModel } from "../../../src/lib/models/Ticket";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { sendTicketStatusEmail, sendTicketStatusStaffEmail } from "../../../src/lib/email";
import { sendPushNotification } from "../../../src/lib/firebase-admin";
import { ownedTicketTypes, supportTypeLabel, supportFieldLines } from "../../../src/lib/support/categories";
import { ticketNumberFor } from "../../../src/lib/support/ticketNumber";
import { hasDecisions, isTicketStatusFor, normalizeTicketStatus, statusAfterMessage, TICKET_STATUS_LABEL } from "../../../src/lib/support/ticketStatus";
import { ticketStaffFor, ticketEmailRecipients } from "../../../src/lib/support/ticketStaff";

// The raiser's app alert + phone notification when a handler changes the
// status by hand. Moving back to "open" says nothing.
function statusMessage(status: string, typeLabel: string, decidedBy: string, reason: string): { title: string; message: string } | null {
  switch (status) {
    case "in_progress": return { title: "Ticket In Progress 🔧", message: "Your ticket is now in progress." };
    case "approved": return { title: "Ticket Approved ✅", message: `Your ${typeLabel} ticket was approved by ${decidedBy}.` };
    case "rejected": return { title: "Ticket Not Approved", message: `Your ${typeLabel} ticket was not approved.${reason ? ` Reason: ${reason}` : ""}` };
    case "completed": return { title: "Ticket Completed 🎉", message: "Your ticket has been completed successfully — please check further." };
    default: return null;
  }
}

// Statuses that also email the submission list on a Billing or Draw Request
// ticket, so billing and office always learn the outcome (Nadine, 2026-10-27).
const STAFF_EMAIL_STATUSES = ["approved", "rejected", "completed"];

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
  const me = await UserModel.findOne({ id: auth.sub }, { email: 1, name: 1 }).lean() as any;
  const ownedTypes = ownedTicketTypes(me?.email);
  const ownsType = (t: string) => ownedTypes.includes(t);

  // ---- GET: read one ticket (with its conversation) --------------------------
  // The raiser follows their own ticket; admins and the type's owner can open any
  // of theirs. Lets both sides poll for new replies and see the current status.
  if (req.method === "GET") {
    const ticket = await TicketModel.findOne({ id }).lean() as any;
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    const isStaff = isAdmin || ownsType(ticket.type);
    if (!isStaff && ticket.userId !== auth.sub) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // A staff member opening someone else's ticket counts as having seen the
    // conversation — clears the "pending" badge even without a reply. Skipped
    // for the raiser viewing their own ticket (they aren't staff for it).
    if (isStaff && ticket.userId !== auth.sub) {
      ticket.staffSeenAt = new Date();
      await TicketModel.updateOne({ id }, { $set: { staffSeenAt: ticket.staffSeenAt } });
    }
    res.status(200).json({ ...ticket, status: normalizeTicketStatus(ticket.status, ticket.type) });
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

    // Free-form conversation: either side can send any number of messages at any
    // time (the turn-based restriction was removed — a handler often needs to send
    // several follow-ups before the rep replies, and vice versa).

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
    // A staff reply obviously means they've seen the thread — keep this in
    // sync with the GET handler's "opening it counts as seen" rule.
    if (isStaff) (ticket as any).staffSeenAt = new Date();

    // An old ticket may still hold a status its type no longer has; read it as
    // the nearest one first. Then the automatic moves (statusAfterMessage): a
    // handler answering a new ticket picks it up (the reply already notifies the
    // raiser, so no separate status message), the raiser writing again on a
    // completed one reopens it, and a decision (Approved/Rejected) never moves.
    ticket.status = statusAfterMessage(normalizeTicketStatus(ticket.status, ticket.type), {
      fromStaff: isStaff,
      isRaiser: auth.sub === ticket.userId,
    });
    await ticket.save();

    // A short preview for notifications (photo/video when there's no caption).
    const preview = text || (mediaType === "video" ? "🎬 Video" : mediaUrl ? "📷 Photo" : "");

    // Notify the OTHER side about the new reply, by app alert + phone
    // notification only. Chat messages stopped emailing on 2026-10-28 (Nadine:
    // "too spammy"); the new-ticket and status-change emails still go.
    try {
      if (isStaff && auth.sub !== ticket.userId) {
        // Staff (admin or the type's owner) replied → notify the raiser.
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
        // Raiser replied → notify everyone who handles this ticket type (every
        // admin plus the type's own people), except the sender.
        const staff = (await ticketStaffFor(ticket.type)).filter((u) => u.id !== auth.sub);
        await Promise.all(staff.map(async (u) => {
          await NotificationModel.create({
            id: `notif-${Date.now()}-${u.id}`,
            userId: u.id,
            type: "ticket_reply",
            title: "💬 New reply on a ticket",
            message: `${senderName}: ${preview.slice(0, 80)}`,
            metadata: { ticketId: ticket.id },
          });
          if (u.fcmToken) {
            await sendPushNotification(u.fcmToken, "💬 New reply on a ticket", `${senderName}: ${preview.slice(0, 100)}`, {
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
  // Approved/Rejected exist only on Billing and Draw Request tickets.
  if (!isTicketStatusFor(ticket.type, status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const previous = normalizeTicketStatus(ticket.status, ticket.type);
  // The optional reason goes with a rejection only; it is stored so the raiser
  // can see it on the ticket.
  const reason = status === "rejected" ? (adminNote ?? "").toString().trim().slice(0, 1000) : "";
  ticket.status = status;
  if (status === "rejected") ticket.adminNote = reason;
  else if (adminNote !== undefined) ticket.adminNote = adminNote;
  await ticket.save();

  // Picking the status a ticket already has notifies nobody.
  if (status !== previous) {
    const typeLabel = supportTypeLabel(ticket.type);
    const decidedBy = me?.name || "the team";
    const ticketNumber = await ticketNumberFor((ticket as any).createdAt);

    // Email + in-app notification + push to the user who raised it.
    const msg = statusMessage(status, typeLabel, decidedBy, reason);
    if (msg) {
      try {
        await sendTicketStatusEmail({
          status,
          name: ticket.name,
          email: ticket.email,
          type: typeLabel,
          decidedBy,
          adminNote: reason,
          ticketNumber,
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

    // A decision (or Completed) on a Billing or Draw Request ticket also goes to
    // everyone who got the new-ticket email: the type's list plus every admin.
    if (hasDecisions(ticket.type) && STAFF_EMAIL_STATUSES.includes(status)) {
      try {
        const recipients = await ticketEmailRecipients(ticket.type);
        const details = supportFieldLines(ticket.type, ticket.fields).join(", ");
        await Promise.all(recipients.map(({ to, isAdmin: recipientIsAdmin }) =>
          sendTicketStatusStaffEmail({
            to,
            recipientIsAdmin,
            userName: ticket.name,
            type: typeLabel,
            status: TICKET_STATUS_LABEL[status],
            decidedBy,
            details,
            adminNote: reason,
            ticketNumber,
          }).catch((e) => console.error("[ticket] staff status email failed:", e?.message || e))
        ));
      } catch (e: any) {
        console.error("[ticket] staff status emails failed:", e?.message || e);
      }
    }
  }

  res.status(200).json(ticket.toObject());
}
