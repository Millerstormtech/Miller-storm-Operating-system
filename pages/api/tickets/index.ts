import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TicketModel } from "../../../src/lib/models/Ticket";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { sendSupportTicketCreatedEmail } from "../../../src/lib/email";

const TYPE_LABEL: Record<string, string> = {
  bug: "Bug / Issue Fix",
  feature: "Request New Feature",
  other: "Other",
};

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
  const ticketType = ["bug", "feature", "other"].includes(type) ? type : "other";
  const typeLabel = TYPE_LABEL[ticketType];

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

  // Notify every admin: in-app bell notification + email.
  try {
    const admins = await UserModel.find(
      { role: "admin", deleted: { $ne: true } },
      { id: 1, name: 1, email: 1 }
    ).lean();

    await Promise.all(
      (admins as any[]).flatMap((admin) => {
        const tasks: Promise<any>[] = [];
        tasks.push(
          NotificationModel.create({
            id: `notif-${Date.now()}-${admin.id}`,
            userId: admin.id,
            type: "ticket_new",
            title: "🎫 New Support Ticket",
            message: `${name} raised a "${typeLabel}" ticket`,
            metadata: { ticketId: ticket.id },
          })
        );
        if (admin.email) {
          tasks.push(
            sendSupportTicketCreatedEmail({
              adminName: admin.name || "Admin",
              adminEmail: admin.email,
              userName: name,
              userEmail: email,
              type: typeLabel,
              note,
            }).catch((e) => console.error("[ticket] admin email failed:", e?.message || e))
          );
        }
        return tasks;
      })
    );
  } catch (e: any) {
    console.error("[ticket] admin notify failed:", e?.message || e);
  }

  res.status(201).json(ticket);
}
