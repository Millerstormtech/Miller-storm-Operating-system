import { SUPPORT_CATEGORY_BY_KEY } from "./categories";

// A support ticket's life: raised (open) → someone on the support side has
// replied or is working on it (in_progress) → done (completed). Billing and
// Draw Request tickets also get a yes/no decision, Approved or Rejected,
// before Completed (Completed then means the money was paid or the issue
// fixed). Kept free of server imports so the ticket screens can use it too.
//
// History: "approved" and "rejected" were retired for every type on
// 2026-09-30 and came back for the decision types only on 2026-10-28, after
// Nadine said on her 2026-10-27 call that a draw request is "either Approved
// or Rejected".
export const TICKET_STATUSES = ["open", "in_progress", "approved", "rejected", "completed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Every type that does not get a decision (Tech, MSRR Tools, the legacy ones).
const BASIC_STATUSES: TicketStatus[] = ["open", "in_progress", "completed"];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

// The status hint button's text, worded with Youssef on 2026-10-28. Each line
// says what the status means and whether it changes by itself.
export const TICKET_STATUS_HINT: Record<TicketStatus, string> = {
  open: "New request, nobody has picked it up yet.",
  in_progress: "Someone is working on it. Set automatically when the team first replies, or when you write again on a completed ticket.",
  approved: "The request was approved. Set by the team handling it.",
  rejected: "The request was turned down, sometimes with a reason. Set by the team handling it.",
  completed: "Finished: the money is paid or the issue is fixed. Set by the team handling it.",
};

// The statuses a decision is made with. Setting one of these emails the
// submission list as well as the raiser.
export const DECISION_STATUSES: TicketStatus[] = ["approved", "rejected"];

export function hasDecisions(type: string | null | undefined): boolean {
  return !!(type && SUPPORT_CATEGORY_BY_KEY[type]?.decisions);
}

/** The statuses a ticket of this type can hold, in the order they're offered. */
export function ticketStatusesFor(type: string | null | undefined): TicketStatus[] {
  return hasDecisions(type) ? [...TICKET_STATUSES] : [...BASIC_STATUSES];
}

/** Any status a ticket of some type can hold. */
export function isTicketStatus(status: unknown): status is TicketStatus {
  return typeof status === "string" && (TICKET_STATUSES as readonly string[]).includes(status);
}

/** A status this particular ticket type can hold. */
export function isTicketStatusFor(type: string | null | undefined, status: unknown): status is TicketStatus {
  return typeof status === "string" && (ticketStatusesFor(type) as string[]).includes(status);
}

// A ticket of a type without decisions that still holds approved/rejected
// (from before 2026-09-30) reads as the nearest status it can hold: approved
// meant someone had picked it up, rejected meant it was closed.
export const RETIRED_TICKET_STATUSES: Record<string, TicketStatus> = {
  approved: "in_progress",
  rejected: "completed",
};

export function normalizeTicketStatus(status: unknown, type: string | null | undefined): TicketStatus {
  if (isTicketStatusFor(type, status)) return status;
  if (typeof status === "string" && RETIRED_TICKET_STATUSES[status]) return RETIRED_TICKET_STATUSES[status];
  return "open";
}

/**
 * The status after someone posts in a ticket's chat. A handler answering a new
 * ticket picks it up (in_progress); the raiser writing again on a completed one
 * reopens it. A decision (Approved or Rejected) is never undone by a chat
 * message: "when will I get paid?" must not wipe an approval.
 */
export function statusAfterMessage(status: TicketStatus, by: { fromStaff: boolean; isRaiser: boolean }): TicketStatus {
  if (by.fromStaff && !by.isRaiser && status === "open") return "in_progress";
  if (!by.fromStaff && status === "completed") return "in_progress";
  return status;
}

/**
 * The steps the raiser's progress bar shows. A rejected decision ends the
 * ticket, so its bar stops at Rejected; otherwise a decision type runs
 * Open → In Progress → Approved → Completed.
 */
export function statusSteps(type: string | null | undefined, status: TicketStatus): TicketStatus[] {
  if (!hasDecisions(type)) return [...BASIC_STATUSES];
  return status === "rejected" ? ["open", "in_progress", "rejected"] : ["open", "in_progress", "approved", "completed"];
}
