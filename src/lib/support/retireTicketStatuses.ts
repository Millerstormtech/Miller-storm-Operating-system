import { TicketModel } from "../models/Ticket";
import { RETIRED_TICKET_STATUSES } from "./ticketStatus";

let done: Promise<void> | null = null;

// Rewrites any ticket still stored as "approved"/"rejected" to its current
// equivalent, once per server start (a no-op after the first run). Reads are
// normalized regardless; this keeps the stored data clean and valid for the
// schema, which no longer accepts the retired values.
export function retireLegacyTicketStatuses(): Promise<void> {
  if (!done) {
    done = Promise.all(
      Object.entries(RETIRED_TICKET_STATUSES).map(([from, to]) =>
        TicketModel.updateMany({ status: from }, { $set: { status: to } })
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
