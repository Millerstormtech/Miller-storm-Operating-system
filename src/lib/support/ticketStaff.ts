// SERVER ONLY. The people who handle a ticket type: every admin, plus each
// account whose email the type lists (billing@, office@, Jay, Naaman...). They
// are the ones who get a ticket's app alerts and phone notifications.
import { UserModel } from "../models/User";
import { SUPPORT_CATEGORY_BY_KEY } from "./categories";

export type TicketStaffMember = { id: string; name?: string; email?: string; role?: string; fcmToken?: string };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function ticketStaffFor(type: string): Promise<TicketStaffMember[]> {
  const emails = SUPPORT_CATEGORY_BY_KEY[type]?.emails || [];
  // Emails are matched case-insensitively, the same as ownedTicketTypes().
  const byEmail = emails.map((e) => ({ email: { $regex: `^${escapeRegex(e)}$`, $options: "i" } }));
  const users = (await UserModel.find(
    { deleted: { $ne: true }, $or: [{ role: "admin" }, ...byEmail] },
    { id: 1, name: 1, email: 1, role: 1, fcmToken: 1 }
  ).lean()) as TicketStaffMember[];
  const seen = new Set<string>();
  return users.filter((u) => u.id && !seen.has(u.id) && seen.add(u.id));
}

/**
 * The addresses a ticket type's emails go to: the type's own list plus every
 * admin, lower-cased and deduped (an address on both lists gets one email).
 * `isAdmin` decides which tickets page the email links to.
 */
export async function ticketEmailRecipients(type: string): Promise<{ to: string; isAdmin: boolean }[]> {
  const admins = (await UserModel.find({ role: "admin", deleted: { $ne: true } }, { email: 1 }).lean()) as { email?: string }[];
  const adminEmails = new Set(admins.map((a) => (a.email || "").toLowerCase()).filter(Boolean));
  const all = new Set([...(SUPPORT_CATEGORY_BY_KEY[type]?.emails || []).map((e) => e.toLowerCase()), ...adminEmails]);
  return [...all].filter(Boolean).map((to) => ({ to, isAdmin: adminEmails.has(to) }));
}
