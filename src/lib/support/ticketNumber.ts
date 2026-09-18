import { TicketModel } from "../models/Ticket";
export { formatTicketNumber } from "./ticketNumberFormat";

// A short, stable, human-friendly ticket number: 1-indexed position when every
// ticket ever raised is ordered oldest-first. Derived purely from createdAt, so
// it needs no stored field and no migration — every ticket that already exists
// gets a correct number for free, and it's the same number for every viewer
// regardless of which subset of tickets they're allowed to see.
//
// This file imports the Mongoose Ticket model, so it's SERVER-ONLY — a client
// component must import formatTicketNumber from ./ticketNumberFormat directly,
// never from here, or it risks bundling Mongoose/Node internals into the browser.

/** The number for one ticket — one count query, used from email/notification code. */
export async function ticketNumberFor(createdAt: Date | string | undefined): Promise<number> {
  const at = createdAt ? new Date(createdAt) : new Date();
  return (await TicketModel.countDocuments({ createdAt: { $lt: at } })) + 1;
}

/**
 * Numbers for many tickets at once — one query against the full collection
 * (id + createdAt only) instead of one count per ticket. Used by the admin
 * list, which may itself be scoped to a subset of tickets; the numbering is
 * always computed against every ticket that exists, not just the visible ones.
 */
export async function ticketNumbers(): Promise<Map<string, number>> {
  const all = (await TicketModel.find({}, { id: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .lean()) as any[];
  const map = new Map<string, number>();
  all.forEach((t, i) => map.set(t.id, i + 1));
  return map;
}
