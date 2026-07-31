import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TicketModel } from "../../../src/lib/models/Ticket";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { sendSupportTicketCreatedEmail } from "../../../src/lib/email";
import { SUPPORT_CATEGORY_BY_KEY, supportTypeLabel, SUPPORT_CATEGORIES } from "../../../src/lib/support/categories";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (!allowMethods(req, res, ["GET", "POST"])) return;
  await connectMongo();

  const auth = requireUser(req, res);
  if (!auth) return;
  const isAdmin = auth.role === "admin";

  if (req.method === "GET") {
    // Lightweight badge poll for the admin "Tickets" button shake.
    if (isAdmin && req.query.summary) {
      const openCount = await TicketModel.countDocuments({ status: "open" });
      res.status(200).json({ openCount });
      return;
    }
    // Admins see every ticket; everyone else sees only their own.
    const filter = isAdmin ? {} : { userId: auth.sub };
    const tickets = await TicketModel.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(tickets);
    return;
  }

  // POST — raise a new ticket
  const { name, email, type, note } = req.body || {};
  if (!name || !email || !note) {
    res.status(400).json({ error: "name, email and note are required" });
    return;
  }
  // Accept a support-category key OR a legacy type (bug/feature/other, still sent
  // by the mobile app) as-is; anything else falls back to the first category.
  const isKnown = !!SUPPORT_CATEGORY_BY_KEY[type] || ["bug", "feature", "other"].includes(type);
  const ticketType = isKnown ? type : SUPPORT_CATEGORIES[0].key;
  // undefined for legacy types → no category emails, just admins (old behaviour).
  const category = SUPPORT_CATEGORY_BY_KEY[ticketType];
  const typeLabel = supportTypeLabel(ticketType);

  const ticket = await TicketModel.create({
    id: `ticket-${Date.now()}`,
    userId: auth.sub,
    name,
    email,
    role: auth.role || "",
    type: ticketType,
    note,
    status: "open",
  });

  try {
    const admins = await UserModel.find(
      { role: "admin", deleted: { $ne: true } },
      { id: 1, name: 1, email: 1 }
    ).lean();

    // Email goes to this category's addresses PLUS every admin (admins always
    // receive all tickets), deduped so a shared address isn't emailed twice.
    const adminEmails = (admins as any[]).map((a) => a.email).filter(Boolean);
    const recipients = Array.from(
      new Set([...(category?.emails || []), ...adminEmails].filter(Boolean).map((e) => e.toLowerCase()))
    );

    await Promise.all([
      // Per-category + admin emails.
      ...recipients.map((to) =>
        sendSupportTicketCreatedEmail({
          adminName: "Team",
          adminEmail: to,
          userName: name,
          userEmail: email,
          type: typeLabel,
          note,
        }).catch((e) => console.error("[ticket] email failed:", e?.message || e))
      ),
      // In-app bell notification for every admin.
      ...(admins as any[]).map((admin) =>
        NotificationModel.create({
          id: `notif-${Date.now()}-${admin.id}`,
          userId: admin.id,
          type: "ticket_new",
          title: "🎫 New Support Request",
          message: `${name} raised a "${typeLabel}" request`,
          metadata: { ticketId: ticket.id },
        })
      ),
    ]);
  } catch (e: any) {
    console.error("[ticket] notify failed:", e?.message || e);
  }

  res.status(201).json(ticket);
}
