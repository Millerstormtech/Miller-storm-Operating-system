// A support ticket's life: raised (open) → someone on the support side has
// replied or is working on it (in_progress) → done (completed). Kept free of
// server imports so the ticket screens can use it too.
export const TICKET_STATUSES = ["open", "in_progress", "completed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
};

// "approved" and "rejected" were retired on 2026-09-30: approved was never
// used, and a ticket that won't be done is simply closed. Tickets still
// holding one read as the nearest current status — approved meant someone had
// picked it up, rejected meant it was closed.
export const RETIRED_TICKET_STATUSES: Record<string, TicketStatus> = {
  approved: "in_progress",
  rejected: "completed",
};

export function isTicketStatus(status: unknown): status is TicketStatus {
  return typeof status === "string" && (TICKET_STATUSES as readonly string[]).includes(status);
}

export function normalizeTicketStatus(status: unknown): TicketStatus {
  if (isTicketStatus(status)) return status;
  if (typeof status === "string" && RETIRED_TICKET_STATUSES[status]) return RETIRED_TICKET_STATUSES[status];
  return "open";
}
