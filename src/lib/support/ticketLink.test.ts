import { describe, it, expect } from "vitest";
import { ticketLinkFor } from "./ticketLink";

describe("where a ticket alert opens", () => {
  it("takes an admin to the admin tickets page with the ticket open", () => {
    expect(ticketLinkFor({ role: "admin", email: "ada@example.com" }, "ticket-1")).toEqual({ kind: "page", href: "/admin/tickets?ticket=ticket-1" });
  });

  it("takes a ticket-type handler to their tickets page, whatever their role", () => {
    expect(ticketLinkFor({ role: "c-level", email: "naaman@millerstorm.com" }, "ticket-1")).toEqual({ kind: "page", href: "/tickets?ticket=ticket-1" });
    expect(ticketLinkFor({ role: "marketing", email: "Billing@MillerStorm.com" }, "ticket-1")).toEqual({ kind: "page", href: "/tickets?ticket=ticket-1" });
  });

  it("opens a rep's own ticket in the Support panel", () => {
    expect(ticketLinkFor({ role: "sales", email: "rep@example.com" }, "ticket-1")).toEqual({ kind: "panel", ticketId: "ticket-1" });
  });

  it("escapes the ticket id in the link", () => {
    expect(ticketLinkFor({ role: "admin" }, "a b")).toEqual({ kind: "page", href: "/admin/tickets?ticket=a%20b" });
  });
});
