import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// The ticket routes' status rules over real HTTP, against an in-memory stand-in
// for the models. Its save() enforces the schema's status enum, so a ticket
// still holding a retired status would fail here just as it would in Mongo.
const db = vi.hoisted(() => {
  const tickets: any[] = [];
  const users: any[] = [
    { id: "admin1", role: "admin", name: "Ada Admin", email: "ada@example.com" },
    { id: "rep1", role: "sales", name: "Ray Rep", email: "ray@example.com" },
  ];
  const matches = (row: any, f: Record<string, any>) =>
    Object.entries(f).every(([k, v]) => (v && typeof v === "object" && "$ne" in v ? row[k] !== v.$ne : row[k] === v));
  const copy = (x: any) => JSON.parse(JSON.stringify(x));
  const makeDoc = (row: any) => {
    const doc = copy(row);
    Object.defineProperty(doc, "save", {
      value: async () => {
        if (!["open", "in_progress", "completed"].includes(doc.status)) throw new Error(`\`${doc.status}\` is not a valid enum value for path \`status\``);
        for (const k of Object.keys(row)) delete row[k];
        Object.assign(row, copy(doc));
      },
    });
    Object.defineProperty(doc, "toObject", { value: () => copy(doc) });
    return doc;
  };
  const one = (row: any) => ({
    lean: async () => (row ? copy(row) : null),
    then: (res: any, rej: any) => Promise.resolve(row ? makeDoc(row) : null).then(res, rej),
  });
  const TicketModel = {
    findOne: (f: any) => one(tickets.find((t) => matches(t, f))),
    find: (f: any = {}) => ({ sort: () => ({ lean: async () => tickets.filter((t) => matches(t, f)).map(copy) }) }),
    countDocuments: async (f: any) => tickets.filter((t) => matches(t, f)).length,
    updateOne: async (f: any, u: any) => { const t = tickets.find((x) => matches(x, f)); if (t) Object.assign(t, u.$set ?? u); },
    updateMany: vi.fn(async (f: any, u: any) => { tickets.filter((x) => matches(x, f)).forEach((t) => Object.assign(t, u.$set ?? u)); }),
  };
  const UserModel = {
    findOne: (f: any) => ({ lean: async () => users.find((u) => matches(u, { id: f.id })) ?? null }),
    find: () => ({ lean: async () => users.filter((u) => u.role === "admin") }),
  };
  return { tickets, TicketModel, UserModel };
});

const email = vi.hoisted(() => ({ sendTicketStatusEmail: vi.fn(async () => {}), sendTicketReplyEmail: vi.fn(async () => {}), sendSupportTicketCreatedEmail: vi.fn(async () => {}) }));

vi.mock("../mongodb", () => ({ connectMongo: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../models/Ticket", () => ({ TicketModel: db.TicketModel }));
vi.mock("../models/User", () => ({ UserModel: db.UserModel }));
vi.mock("../models/Notification", () => ({ NotificationModel: { create: vi.fn(async () => ({})) } }));
vi.mock("../email", () => email);
vi.mock("../firebase-admin", () => ({ sendPushNotification: vi.fn(async () => {}) }));
vi.mock("./ticketNumber", () => ({ ticketNumberFor: vi.fn(async () => 1), ticketNumbers: vi.fn(async () => new Map()) }));
vi.mock("../leaderboard/compute", () => ({ computeSalesRows: vi.fn(async () => []) }));
vi.mock("../leaderboard/identity", () => ({ findSubmitterRow: vi.fn(() => null) }));

const listHandler = (await import("../../../pages/api/tickets/index")).default;
const ticketHandler = (await import("../../../pages/api/tickets/[id]")).default;

const server = http.createServer(async (req, res) => {
  const shimmed = res as any;
  shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
  shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
  let raw = "";
  for await (const chunk of req) raw += chunk;
  (req as any).body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url || "", "http://x");
  (req as any).query = Object.fromEntries(url.searchParams);
  const m = /^\/api\/tickets\/([^/]+)$/.exec(url.pathname);
  if (m) { (req as any).query.id = m[1]; return (ticketHandler as any)(req, shimmed); }
  return (listHandler as any)(req, shimmed);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(method: string, path: string, as: "admin1" | "rep1", body?: unknown) {
  const role = as === "admin1" ? "admin" : "sales";
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${signSession({ id: as, role })}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const reply = (id: string, as: "admin1" | "rep1") => call("POST", `/api/tickets/${id}`, as, { text: "hello" });
const stored = (id: string) => db.tickets.find((t) => t.id === id);
const ticket = (id: string, status: string) => ({
  id, userId: "rep1", name: "Ray Rep", email: "ray@example.com", role: "sales", type: "billing", note: "help", status, messages: [], createdAt: new Date().toISOString(),
});

beforeEach(() => {
  db.tickets.length = 0;
  vi.clearAllMocks();
});

describe("status changes by themselves", () => {
  it("a handler replying on an open ticket moves it to in progress, without a separate status email", async () => {
    db.tickets.push(ticket("t1", "open"));
    const r = await reply("t1", "admin1");
    expect(r.status).toBe(200);
    expect(r.data.status).toBe("in_progress");
    expect(stored("t1").status).toBe("in_progress");
    expect(email.sendTicketReplyEmail).toHaveBeenCalled(); // the raiser still hears about the reply
    expect(email.sendTicketStatusEmail).not.toHaveBeenCalled();
  });

  it("the raiser adding details to their own open ticket leaves it open", async () => {
    db.tickets.push(ticket("t1", "open"));
    expect((await reply("t1", "rep1")).data.status).toBe("open");
  });

  it("the raiser writing again on a completed ticket reopens it as in progress", async () => {
    db.tickets.push(ticket("t1", "completed"));
    expect((await reply("t1", "rep1")).data.status).toBe("in_progress");
  });

  it("a handler's follow-up on a completed ticket leaves it completed", async () => {
    db.tickets.push(ticket("t1", "completed"));
    expect((await reply("t1", "admin1")).data.status).toBe("completed");
  });
});

describe("retired statuses", () => {
  it("an old approved ticket still takes replies, and reads as in progress", async () => {
    db.tickets.push(ticket("t1", "approved"));
    expect((await call("GET", "/api/tickets/t1", "rep1")).data.status).toBe("in_progress");
    const r = await reply("t1", "admin1");
    expect(r.status).toBe(200);
    expect(stored("t1").status).toBe("in_progress");
  });

  it("an old rejected ticket reads as completed, and reopens if the raiser writes again", async () => {
    db.tickets.push(ticket("t1", "rejected"));
    expect((await call("GET", "/api/tickets/t1", "admin1")).data.status).toBe("completed");
    expect((await reply("t1", "rep1")).data.status).toBe("in_progress");
  });

  it("the ticket list rewrites stored retired statuses and only ever returns the three", async () => {
    db.tickets.push(ticket("a", "approved"), ticket("b", "rejected"), ticket("c", "open"));
    const r = await call("GET", "/api/tickets", "admin1");
    expect(r.status).toBe(200);
    expect(Object.fromEntries(r.data.map((t: any) => [t.id, t.status]))).toEqual({ a: "in_progress", b: "completed", c: "open" });
    expect(stored("a").status).toBe("in_progress");
    expect(stored("b").status).toBe("completed");
  });
});

describe("changing the status by hand", () => {
  it("accepts only open, in progress and completed", async () => {
    db.tickets.push(ticket("t1", "open"));
    expect((await call("PATCH", "/api/tickets/t1", "admin1", { status: "approved" })).status).toBe(400);
    expect((await call("PATCH", "/api/tickets/t1", "admin1", { status: "rejected" })).status).toBe(400);
    const done = await call("PATCH", "/api/tickets/t1", "admin1", { status: "completed" });
    expect(done.status).toBe(200);
    expect(stored("t1").status).toBe("completed");
    expect(email.sendTicketStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("is for handlers only", async () => {
    db.tickets.push(ticket("t1", "open"));
    expect((await call("PATCH", "/api/tickets/t1", "rep1", { status: "completed" })).status).toBe(403);
  });
});
