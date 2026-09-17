// Pure formatting, zero imports — safe for client components. The DB-querying
// half (ticketNumberFor/ticketNumbers) lives in ticketNumber.ts, which imports
// the Mongoose Ticket model and must stay server-only.

/** "MS-001", "MS-002", … — the display form used everywhere (table + emails). */
export function formatTicketNumber(n: number): string {
  return `MS-${String(n).padStart(3, "0")}`;
}
