import { describe, it, expect } from "vitest";
import { TICKET_STATUSES, isTicketStatus, normalizeTicketStatus } from "./ticketStatus";

describe("ticket statuses", () => {
  it("are open, in progress and completed, in that order", () => {
    expect([...TICKET_STATUSES]).toEqual(["open", "in_progress", "completed"]);
  });

  it("accept only the three current statuses", () => {
    for (const s of TICKET_STATUSES) expect(isTicketStatus(s)).toBe(true);
    for (const s of ["approved", "rejected", "", "OPEN", null, undefined, 3]) expect(isTicketStatus(s)).toBe(false);
  });

  it("read a retired status as its nearest current one", () => {
    expect(normalizeTicketStatus("approved")).toBe("in_progress");
    expect(normalizeTicketStatus("rejected")).toBe("completed");
    expect(normalizeTicketStatus("in_progress")).toBe("in_progress");
    expect(normalizeTicketStatus(undefined)).toBe("open");
    expect(normalizeTicketStatus("something-else")).toBe("open");
  });
});
