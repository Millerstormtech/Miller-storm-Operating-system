import { describe, it, expect } from "vitest";
import {
  TICKET_STATUSES,
  TICKET_STATUS_HINT,
  TICKET_STATUS_LABEL,
  hasDecisions,
  isTicketStatus,
  isTicketStatusFor,
  normalizeTicketStatus,
  statusAfterMessage,
  statusSteps,
  ticketStatusesFor,
} from "./ticketStatus";

describe("ticket statuses by type", () => {
  it("Billing and Draw Request tickets can be approved or rejected", () => {
    expect(hasDecisions("billing")).toBe(true);
    expect(hasDecisions("draw_request")).toBe(true);
    expect(ticketStatusesFor("draw_request")).toEqual(["open", "in_progress", "approved", "rejected", "completed"]);
    expect(ticketStatusesFor("billing")).toEqual(["open", "in_progress", "approved", "rejected", "completed"]);
  });

  it("every other type keeps open, in progress and completed", () => {
    for (const type of ["tech", "msrr_tools", "bug", "feature", "other", "", undefined, null]) {
      expect(hasDecisions(type)).toBe(false);
      expect(ticketStatusesFor(type)).toEqual(["open", "in_progress", "completed"]);
    }
  });

  it("accepts a decision only on a type that has one", () => {
    expect(isTicketStatusFor("draw_request", "approved")).toBe(true);
    expect(isTicketStatusFor("billing", "rejected")).toBe(true);
    expect(isTicketStatusFor("tech", "approved")).toBe(false);
    expect(isTicketStatusFor("msrr_tools", "rejected")).toBe(false);
    for (const s of ["", "OPEN", null, undefined, 3, "paid"]) expect(isTicketStatusFor("draw_request", s)).toBe(false);
  });

  it("knows all five statuses", () => {
    for (const s of TICKET_STATUSES) expect(isTicketStatus(s)).toBe(true);
    expect(isTicketStatus("paid")).toBe(false);
  });

  it("every status has a label and a hint, and no hint uses an em dash", () => {
    for (const s of TICKET_STATUSES) {
      expect(TICKET_STATUS_LABEL[s]).toBeTruthy();
      expect(TICKET_STATUS_HINT[s]).toBeTruthy();
      expect(TICKET_STATUS_HINT[s]).not.toContain("—");
    }
  });
});

describe("reading a stored status", () => {
  it("keeps a decision on a decision type", () => {
    expect(normalizeTicketStatus("approved", "draw_request")).toBe("approved");
    expect(normalizeTicketStatus("rejected", "billing")).toBe("rejected");
  });

  it("reads an old decision on any other type as its nearest status", () => {
    expect(normalizeTicketStatus("approved", "tech")).toBe("in_progress");
    expect(normalizeTicketStatus("rejected", "tech")).toBe("completed");
    expect(normalizeTicketStatus("in_progress", "tech")).toBe("in_progress");
    expect(normalizeTicketStatus(undefined, "tech")).toBe("open");
    expect(normalizeTicketStatus("something-else", "draw_request")).toBe("open");
  });
});

describe("status after a chat message", () => {
  const staff = { fromStaff: true, isRaiser: false };
  const raiser = { fromStaff: false, isRaiser: true };

  it("a handler answering an open ticket picks it up", () => {
    expect(statusAfterMessage("open", staff)).toBe("in_progress");
  });

  it("the raiser adding details to an open ticket leaves it open", () => {
    expect(statusAfterMessage("open", raiser)).toBe("open");
  });

  it("the raiser writing on a completed ticket reopens it; a handler's follow-up does not", () => {
    expect(statusAfterMessage("completed", raiser)).toBe("in_progress");
    expect(statusAfterMessage("completed", staff)).toBe("completed");
  });

  it("never undoes a decision, from either side", () => {
    for (const s of ["approved", "rejected"] as const) {
      expect(statusAfterMessage(s, raiser)).toBe(s);
      expect(statusAfterMessage(s, staff)).toBe(s);
    }
  });
});

describe("the raiser's progress bar", () => {
  it("runs open, in progress, approved, completed on a decision type", () => {
    expect(statusSteps("draw_request", "open")).toEqual(["open", "in_progress", "approved", "completed"]);
    expect(statusSteps("billing", "approved")).toEqual(["open", "in_progress", "approved", "completed"]);
  });

  it("stops at rejected when the request was turned down", () => {
    expect(statusSteps("draw_request", "rejected")).toEqual(["open", "in_progress", "rejected"]);
  });

  it("stays three steps on every other type", () => {
    expect(statusSteps("tech", "completed")).toEqual(["open", "in_progress", "completed"]);
  });
});
