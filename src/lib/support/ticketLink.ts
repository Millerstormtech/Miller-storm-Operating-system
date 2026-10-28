import { isTicketOwner } from "./categories";

// Where a ticket alert in the web bell takes the person who clicks it. Staff
// for tickets (admins, and anyone whose account email a ticket type lists)
// work from a tickets page and never get the Support panel, so for them it is
// that page with the ticket opened. Everyone else only ever gets alerts about
// tickets they raised, which live in the header's Support panel.
export type TicketLink = { kind: "page"; href: string } | { kind: "panel"; ticketId: string };

export const TICKET_NOTIFICATION_TYPES = ["ticket_new", "ticket_reply", "ticket_update"];

export function ticketLinkFor(viewer: { role?: string | null; email?: string | null }, ticketId: string): TicketLink {
  const q = `?ticket=${encodeURIComponent(ticketId)}`;
  if (viewer.role === "admin") return { kind: "page", href: `/admin/tickets${q}` };
  if (isTicketOwner(viewer.email)) return { kind: "page", href: `/tickets${q}` };
  return { kind: "panel", ticketId };
}
