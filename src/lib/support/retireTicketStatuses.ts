import { TicketModel } from "../models/Ticket";
import { RETIRED_TICKET_STATUSES } from "./ticketStatus";
import { DECISION_TICKET_TYPES } from "./categories";

let done: Promise<void> | null = null;

// Rewrites any ticket still stored as "approved"/"rejected" on a type that has
// no decisions (Tech, MSRR Tools, the legacy types) to its nearest status, once
// per server start (a no-op after the first run). Reads are normalized
// regardless; this keeps the stored data clean. Billing and Draw Request
// tickets are left alone: since 2026-10-28 approved/rejected are real statuses
// there, and rewriting them would silently undo every decision on restart.
export function retireLegacyTicketStatuses(): Promise<void> {
  if (!done) {
    done = Promise.all(
      Object.entries(RETIRED_TICKET_STATUSES).map(([from, to]) =>
        TicketModel.updateMany({ status: from, type: { $nin: DECISION_TICKET_TYPES } }, { $set: { status: to } })
      )
    )
      .then(() => undefined)
      .catch((err) => {
        done = null; // try again on the next request
        console.error("[tickets] retiring old statuses failed:", err?.message || err);
      });
  }
  return done;
}
