import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TicketModel } from "../../../src/lib/models/Ticket";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { sendSupportTicketCreatedEmail } from "../../../src/lib/email";
import { SUPPORT_CATEGORY_BY_KEY, supportTypeLabel, supportFieldLines, SUPPORT_CATEGORIES, ownedTicketTypes } from "../../../src/lib/support/categories";

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
    // A type "owner" (their account email is in a category's emails list) handles
    // that type's tickets like an admin, but scoped. Resolve their owned types so
    // both the list and the badge count can be scoped to them.
    const me = await UserModel.findOne({ id: auth.sub }, { email: 1 }).lean() as any;
    const ownedTypes = ownedTicketTypes(me?.email);
    const isOwner = ownedTypes.length > 0;

    // What this viewer is allowed to see:
    //  - admin  → every ticket
    //  - owner  → their own tickets PLUS every ticket of the type(s) they own
    //  - anyone → only their own tickets
    const scope = isAdmin
      ? {}
      : isOwner
      ? { $or: [{ userId: auth.sub }, { type: { $in: ownedTypes } }] }
      : { userId: auth.sub };

    // Lightweight badge poll for the "Tickets" button shake — same scope, only
    // open tickets. Admin counts all open; an owner counts open in their types.
    if (req.query.summary) {
      const openCount = await TicketModel.countDocuments({ ...scope, status: "open" });
      res.status(200).json({ openCount });
      return;
    }
    const tickets = await TicketModel.find(scope).sort({ createdAt: -1 }).lean();
    res.status(200).json(tickets);
    return;
  }

  // POST — raise a new ticket
  const { name, email, type, note, fields: rawFields } = req.body || {};
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

  // Keep only the values for THIS category's defined fields, as trimmed strings.
  const fields: Record<string, string> = {};
  if (rawFields && typeof rawFields === "object" && category) {
    for (const f of category.fields) {
      const v = (rawFields[f.key] ?? "").toString().trim();
      if (v) fields[f.key] = v;
    }
  }

  const ticket = await TicketModel.create({
    id: `ticket-${Date.now()}`,
    userId: auth.sub,
    name,
    email,
    role: auth.role || "",
    type: ticketType,
    fields,
    note,
    status: "open",
  });

  // The email body carries the field values above the free-text note.
  const fieldLines = supportFieldLines(ticketType, fields);
  const emailNote = fieldLines.length ? `${fieldLines.join("\n")}\n\n${note}` : note;

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
          note: emailNote,
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
